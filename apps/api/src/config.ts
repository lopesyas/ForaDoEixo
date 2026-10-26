import { z } from 'zod';

/** Lê e valida o ambiente. Falha cedo, com mensagem clara, se algo estiver errado. */
const Env = z.object({
  PORT: z.coerce.number().int().positive().default(4100),
  /** Em desenvolvimento só a própria máquina acessa. Em hospedagem, defina HOST=0.0.0.0. */
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  /** IA (opcional). Só liga se URL, chave e modelo estiverem preenchidos. Qualquer provedor compatível com o formato OpenAI. */
  LLM_BASE_URL: z.string().default(''),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default(''),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  /** Segundo provedor (opcional): usado se o primeiro falhar. */
  LLM2_BASE_URL: z.string().default(''),
  LLM2_API_KEY: z.string().default(''),
  LLM2_MODEL: z.string().default(''),
  LLM2_FALLBACK_MODELS: z.string().default(''),
  /** A IA escrever a frase de abertura das opções. Desligado por padrão: soma 2–3 s a cada lista de opções. */
  LLM_EXPLAIN: z.enum(['true', 'false']).default('false'),
  LLM_FALLBACK_MODELS: z.string().default(''),
  /** Transcrição de voz (reserva do ditado). "auto" liga quando o provedor principal é a Groq. */
  STT_ENABLED: z.enum(['auto', 'true', 'false']).default('auto'),
  STT_MODEL: z.string().default('whisper-large-v3-turbo'),
  LLM_JSON_MODE: z.enum(['true', 'false']).default('true'),
  LLM_REASONING_EFFORT: z.enum(['', 'none', 'minimal', 'low', 'medium', 'high']).default(''),
  LLM_MAX_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  // Aceita o nome que o Google usa (GEMINI_API_KEY) como alternativa.
  const parsed = Env.safeParse({ ...env, LLM_API_KEY: env.LLM_API_KEY || env.GEMINI_API_KEY || '' });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${problems}`);
  }
  const { CORS_ORIGIN, ...rest } = parsed.data;
  const fallbackModels = rest.LLM_FALLBACK_MODELS.split(',').map((m) => m.trim()).filter(Boolean);
  const fallbackModels2 = rest.LLM2_FALLBACK_MODELS.split(',').map((m) => m.trim()).filter(Boolean);
  const llm2Configured = Boolean(rest.LLM2_BASE_URL && rest.LLM2_API_KEY && rest.LLM2_MODEL);
  const sttEnabled = Boolean(rest.LLM_BASE_URL && rest.LLM_API_KEY) && (rest.STT_ENABLED === 'true' || (rest.STT_ENABLED === 'auto' && /groq\.com/.test(rest.LLM_BASE_URL)));
  const llmConfigured = Boolean(rest.LLM_BASE_URL && rest.LLM_API_KEY && rest.LLM_MODEL);
  return { ...rest, sttEnabled, fallbackModels, fallbackModels2, llm2Configured, llmConfigured, corsOrigins: CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean) };
}
