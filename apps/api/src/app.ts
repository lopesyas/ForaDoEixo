import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Config } from './config';
import { chatRoutes } from './routes/chat';
import { featuredRoutes } from './routes/featured';
import { productRoutes } from './routes/products';
import { noLlm } from './adapters/llm/noLlm';
import type { LlmPort } from './ports/llm';
import { transcribeRoutes, type SttOptions } from './routes/transcribe';
import type { CatalogPort } from './ports/catalog';
import type { ChatService } from './services/chat';

/** Monta o app sem abrir porta: facilita testar. Rotas finas; a lógica fica em domain/ e services/. */
export function createApp(config: Pick<Config, 'corsOrigins' | 'RATE_LIMIT_PER_MINUTE'>, services?: { chat: ChatService; catalog?: CatalogPort; stt?: SttOptions | null; llm?: LlmPort; /** Pasta do site já construído (apps/web/dist): se existir, a API também serve o site, em um endereço só. */ webDir?: string; ai?: { enabled: boolean; model: string } }) {
  const app = express();
  app.disable('x-powered-by');
  // Sem "upgrade-insecure-requests": o site pode ser aberto por http na rede local; em https de hospedagem não faz diferença.
  app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null, 'img-src': ["'self'", 'data:', 'blob:'] } } }));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '10kb' }));
  // Áudio (ditado): corpo binário, rota própria com limite próprio; vem antes do limitador geral de JSON.
  app.use('/api', transcribeRoutes(services?.stt ?? null));
  app.use(rateLimit({ windowMs: 60_000, limit: config.RATE_LIMIT_PER_MINUTE, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (_req, res) => {
    // Mostra se a IA está ligada e qual modelo; nunca a chave.
    res.json({ status: 'ok', ai: services?.ai ?? { enabled: false, model: '' } });
  });

  if (services) app.use('/api', chatRoutes(services.chat));
  if (services?.catalog) app.use('/api', featuredRoutes(services.catalog));
  if (services?.catalog) app.use('/api', productRoutes(services.catalog, services.llm ?? noLlm));

  // Site e API no mesmo endereço (hospedagem simples, sem CORS): serve o que o `npm run build` gerou.
  const webDir = services?.webDir;
  if (webDir && existsSync(join(webDir, 'index.html'))) {
    app.use(express.static(webDir, { maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(webDir, 'index.html')));
  }

  // Erro: mensagem simples ao cliente, detalhe técnico só no log. Erros do cliente (4xx) mantêm o status.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number' ? err.status : 500;
    if (status >= 500) console.error(err);
    const message = status === 413 ? 'A mensagem é grande demais.' : status < 500 ? 'Pedido inválido.' : 'Algo deu errado. Tente de novo em instantes.';
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  });

  return app;
}
