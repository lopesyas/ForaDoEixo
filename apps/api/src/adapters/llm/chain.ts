import { LlmUnavailable, type LlmPort, type Schema } from '../../ports/llm';

/**
 * Vários provedores em ordem: se o primeiro falhar (sobrecarga, cota, pagamento exigido, fora do ar), tenta o próximo.
 * Para quem chama, continua sendo UMA IA; se todos falharem, o erro é um só e o sistema segue por regras.
 */
export function createLlmChain(providers: LlmPort[]): LlmPort {
  const active = providers.filter((p) => p.enabled);
  if (active.length === 0) throw new Error('createLlmChain precisa de ao menos um provedor ligado');
  if (active.length === 1) return active[0]!;
  return {
    enabled: true,
    label: active.map((p) => p.label).join(' → '),
    async json<T>(request: { system: string; user: string; maxTokens?: number; timeoutMs?: number }, schema: Schema<T>): Promise<T> {
      let last: Error = new LlmUnavailable('Nenhum provedor respondeu');
      for (const provider of active) {
        try {
          return await provider.json(request, schema);
        } catch (err) {
          last = err instanceof Error ? err : last;
        }
      }
      throw last;
    },
  };
}
