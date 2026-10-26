import type { ZodType, ZodTypeDef } from 'zod';

/** Esquema que aceita entrada desconhecida e devolve T (é o caso de `.catch()` e `.default()`). */
export type Schema<T> = ZodType<T, ZodTypeDef, unknown>;

/**
 * A IA entra por esta porta. Ela só ENTENDE e EXPLICA: nunca decide segurança, preço, estoque ou carrinho.
 * `json` devolve a resposta já validada pelo esquema; qualquer problema (rede, limite, formato) vira erro,
 * e quem chama volta para o modo por regras.
 */
export interface LlmPort {
  readonly enabled: boolean;
  readonly label: string;
  json<T>(request: { system: string; user: string; maxTokens?: number; timeoutMs?: number }, schema: Schema<T>): Promise<T>;
}

export class LlmUnavailable extends Error {
  constructor(
    message: string,
    /** Status HTTP do provedor, quando houve resposta. */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmUnavailable';
  }
}
