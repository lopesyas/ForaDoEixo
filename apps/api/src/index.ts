import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { createJsonCatalog } from './adapters/catalog/jsonCatalog';
import { noLlm } from './adapters/llm/noLlm';
import { createLlmChain } from './adapters/llm/chain';
import { createOpenAiCompatibleLlm } from './adapters/llm/openaiCompatible';
import { loadConfig } from './config';
import { createChatService } from './services/chat';

// Lê o .env da raiz do projeto, se existir. O arquivo nunca é versionado (.gitignore).
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  /* sem .env: usa as variáveis do ambiente e os padrões */
}

const config = loadConfig();
// O motivo das falhas da IA aparece no terminal (no máximo uma vez a cada 30 s, para não inundar).
let lastWarn = 0;
const warnOften = (message: string) => {
  if (Date.now() - lastWarn > 30_000) {
    lastWarn = Date.now();
    console.warn(`IA indisponível, usando regras: ${message}`);
  }
};

const providers = [
  config.llmConfigured
    ? createOpenAiCompatibleLlm({ baseUrl: config.LLM_BASE_URL, apiKey: config.LLM_API_KEY, model: config.LLM_MODEL, fallbackModels: config.fallbackModels, timeoutMs: config.LLM_TIMEOUT_MS, maxPerMinute: config.LLM_MAX_PER_MINUTE, onError: warnOften, jsonMode: config.LLM_JSON_MODE === 'true', ...(config.LLM_REASONING_EFFORT ? { reasoningEffort: config.LLM_REASONING_EFFORT } : {}) })
    : noLlm,
  config.llm2Configured
    ? createOpenAiCompatibleLlm({ baseUrl: config.LLM2_BASE_URL, apiKey: config.LLM2_API_KEY, model: config.LLM2_MODEL, fallbackModels: config.fallbackModels2, timeoutMs: config.LLM_TIMEOUT_MS, maxPerMinute: config.LLM_MAX_PER_MINUTE, onError: warnOften })
    : noLlm,
];
const catalog = createJsonCatalog();
const llm = providers.some((p) => p.enabled) ? createLlmChain(providers) : noLlm;

createApp({ ...config }, { catalog, llm, webDir: fileURLToPath(new URL('../../web/dist', import.meta.url)), stt: config.sttEnabled ? { baseUrl: config.LLM_BASE_URL, apiKey: config.LLM_API_KEY, model: config.STT_MODEL } : null, chat: createChatService({ catalog, llm, aiExplain: config.LLM_EXPLAIN === 'true' }), ai: { enabled: llm.enabled, model: llm.label } }).listen(config.PORT, config.HOST, () => {
  console.log(`API ouvindo em http://${config.HOST}:${config.PORT}`);
  console.log(`Voz (transcrição): ${config.sttEnabled ? `ligada (${config.STT_MODEL})` : 'desligada'}`);
  console.log(`Site: ${existsSync(fileURLToPath(new URL('../../web/dist/index.html', import.meta.url))) ? 'servido por esta API (apps/web/dist)' : 'não construído (rode npm run build) — use o modo de desenvolvimento'}`);
  console.log(`IA: ${llm.enabled ? `ligada (${llm.label})` : llm.label}`);
});
