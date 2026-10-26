import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmUnavailable, type LlmPort } from '../../ports/llm';
import { noLlm } from './noLlm';
import { createLlmChain } from './chain';

const Schema = z.object({ from: z.string() });
const ok = (name: string): LlmPort & { calls: number } => {
  const p = { enabled: true, label: name, calls: 0, async json() { p.calls++; return { from: name } as never; } };
  return p;
};
const broken = (name: string, status = 429): LlmPort & { calls: number } => {
  const p = { enabled: true, label: name, calls: 0, async json(): Promise<never> { p.calls++; throw new LlmUnavailable(`${name} fora`, status); } };
  return p;
};
const req = { system: 's', user: 'u' };

describe('cadeia de provedores', () => {
  it('usa o primeiro quando ele responde, sem chamar o segundo', async () => {
    const a = ok('a');
    const b = ok('b');
    await expect(createLlmChain([a, b]).json(req, Schema)).resolves.toEqual({ from: 'a' });
    expect(b.calls).toBe(0);
  });

  it('se o primeiro falha (429, 402, fora do ar…), usa o segundo', async () => {
    const b = ok('b');
    await expect(createLlmChain([broken('a'), b]).json(req, Schema)).resolves.toEqual({ from: 'b' });
    await expect(createLlmChain([broken('a', 402), ok('c')]).json(req, Schema)).resolves.toEqual({ from: 'c' });
  });

  it('todos falham: um erro só', async () => {
    await expect(createLlmChain([broken('a'), broken('b')]).json(req, Schema)).rejects.toThrow(/b fora/);
  });

  it('ignora provedor desligado e mostra os nomes na ordem', () => {
    expect(createLlmChain([noLlm, ok('a'), ok('b')]).label).toBe('a → b');
    expect(createLlmChain([noLlm, ok('a')]).label).toBe('a');
  });

  it('sem nenhum provedor ligado, é erro de configuração', () => {
    expect(() => createLlmChain([noLlm])).toThrow();
  });
});
