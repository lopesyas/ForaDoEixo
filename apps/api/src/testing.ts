import inject, { type InjectOptions } from 'light-my-request';
import type { Express } from 'express';

/** Chama o app em memória (sem abrir porta de rede): testes rápidos e sem depender do ambiente. */
export async function call(app: Express, options: InjectOptions) {
  const res = await inject(app, options);
  let body: unknown;
  try {
    body = res.body ? JSON.parse(res.body) : undefined;
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, headers: res.headers, body };
}

import type { LlmPort, Schema } from './ports/llm';

/** IA falsa para testes: devolve o que o teste mandar (ou falha), passando pela mesma validação de esquema. */
export function fakeLlm(handler: (request: { system: string; user: string }) => unknown | Promise<unknown>): LlmPort & { calls: number } {
  const llm = {
    enabled: true,
    label: 'fake',
    calls: 0,
    async json<T>(request: { system: string; user: string }, schema: Schema<T>): Promise<T> {
      llm.calls++;
      return schema.parse(await handler(request));
    },
  };
  return llm;
}
