import { LlmUnavailable, type LlmPort, type Schema } from '../../ports/llm';

export interface LlmOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Outros modelos do MESMO provedor, usados em ordem se o principal estiver sobrecarregado (429/5xx) ou indisponível (404). */
  fallbackModels?: string[];
  timeoutMs?: number;
  /** Teto de chamadas por minuto: protege a cota gratuita. Acima disso, cai nas regras. */
  maxPerMinute?: number;
  /** Esforço de raciocínio (modelos que "pensam"). Em "low" ou "none" a resposta é mais rápida e não gasta os tokens pensando. */
  /** Alguns provedores não aceitam `response_format`. Com false, o JSON é pedido só no texto do prompt (já tolerante a ```). */
  jsonMode?: boolean;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  /** Falhas seguidas que abrem o "disjuntor" (pausa as chamadas por um tempo). */
  breakerFailures?: number;
  breakerPauseMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Chamado com o motivo de cada falha (para o log do servidor). Nunca contém a chave. */
  onError?: (message: string) => void;
}

/** Aceita resposta com ```json … ``` em volta e devolve o objeto. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('Resposta da IA não é JSON');
  }
}

/**
 * Qualquer provedor que fale o formato "chat completions" (Gemini via endpoint compatível, Groq, OpenRouter, xAI…).
 * Trocar de provedor = trocar URL, chave e modelo no .env.
 */
/** Tira a chave de qualquer texto antes de ele ir para um log ou mensagem. */
export function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join('***') : text;
}

export function createOpenAiCompatibleLlm(opts: LlmOptions): LlmPort {
  const { baseUrl, apiKey, model } = opts;
  const models = [model, ...(opts.fallbackModels ?? []).filter((m) => m && m !== model)];
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxPerMinute = opts.maxPerMinute ?? 20;
  const failuresToOpen = opts.breakerFailures ?? 3;
  const pauseMs = opts.breakerPauseMs ?? 60_000;
  const fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;

  let failures = 0;
  let openUntil = 0;
  let calls: number[] = [];

  async function once(request: { system: string; user: string; maxTokens?: number; timeoutMs?: number }, model: string, budgetMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    try {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: request.maxTokens ?? 800,
          ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
          ...(opts.jsonMode === false ? {} : { response_format: { type: 'json_object' } }),
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
        }),
      });
      if (!res.ok) {
        // Guarda um trecho curto da explicação do provedor (sem a chave) para o log: é o que permite achar o erro.
        const detail = redact(await res.text().catch(() => ''), apiKey).slice(0, 300);
        throw new LlmUnavailable(res.status === 429 ? `Limite da IA atingido (429) ${detail}`.trim() : `A IA respondeu ${res.status}: ${detail}`.trim(), res.status);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new LlmUnavailable('Resposta vazia da IA');
      return content;
    } catch (err) {
      if (err instanceof LlmUnavailable) throw err;
      throw new LlmUnavailable(err instanceof Error && err.name === 'AbortError' ? 'A IA demorou demais' : `Falha ao falar com a IA: ${redact(err instanceof Error ? err.message : '', apiKey).slice(0, 200)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  const t0Budget = (request: { timeoutMs?: number }) => request.timeoutMs ?? timeoutMs;

  return {
    enabled: true,
    label: model,
    async json<T>(request: { system: string; user: string; maxTokens?: number; timeoutMs?: number }, schema: Schema<T>): Promise<T> {
      const t = now();
      if (t < openUntil) throw new LlmUnavailable('IA em pausa após falhas seguidas');
      calls = calls.filter((c) => t - c < 60_000);
      if (calls.length >= maxPerMinute) throw new LlmUnavailable('Teto de chamadas por minuto atingido');
      calls.push(t);

      try {
        // Para cada modelo: uma nova tentativa só para resposta mal formatada. Modelo sobrecarregado (429/5xx) ou
        // inexistente (404) passa para o próximo; erro de chave ou permissão (401/403) não adianta trocar de modelo.
        let lastError: Error = new LlmUnavailable('Nenhum modelo respondeu');
        // O tempo limite vale para o PEDIDO inteiro, somando todos os modelos: com vários de reserva, não multiplica a espera.
        const deadline = now() + (t0Budget(request));
        for (const m of models) {
          const left = deadline - now();
          if (left < 20) break;
          try {
            for (let attempt = 0; attempt < 2; attempt++) {
              const content = await once(request, m, left);
              try {
                const parsed = schema.safeParse(parseJsonLoose(content));
                if (parsed.success) {
                  failures = 0;
                  return parsed.data;
                }
              } catch {
                /* tenta de novo */
              }
            }
            lastError = new LlmUnavailable(`${m}: a IA devolveu um formato inválido`);
          } catch (err) {
            lastError = err instanceof Error ? err : new LlmUnavailable('erro desconhecido');
            const status = err instanceof LlmUnavailable ? err.status : undefined;
            if (status === 401 || status === 403) throw err;
            if (models.length > 1) opts.onError?.(`modelo ${m} indisponível, tentando o próximo: ${lastError.message.slice(0, 120)}`);
          }
        }
        throw lastError;
      } catch (err) {
        opts.onError?.(err instanceof Error ? err.message : 'erro desconhecido');
        failures++;
        if (failures >= failuresToOpen) {
          openUntil = now() + pauseMs;
          failures = 0;
        }
        throw err;
      }
    },
  };
}
