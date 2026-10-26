import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LlmUnavailable } from '../../ports/llm';
import { createOpenAiCompatibleLlm, parseJsonLoose, redact } from './openaiCompatible';

const Schema = z.object({ ok: z.boolean() });
const reply = (content: string, status = 200) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
const make = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createOpenAiCompatibleLlm>[0]> = {}) =>
  createOpenAiCompatibleLlm({ baseUrl: 'https://api.exemplo.com/v1/', apiKey: 'SEGREDO-123', model: 'modelo-x', fetchImpl, timeoutMs: 50, ...extra });
const req = { system: 's', user: 'u' };

describe('parseJsonLoose', () => {
  it.each([
    ['{"a":1}', { a: 1 }],
    ['```json\n{"a":1}\n```', { a: 1 }],
    ['Claro! {"a":1} pronto', { a: 1 }],
  ])('%j', (text, expected) => {
    expect(parseJsonLoose(text)).toEqual(expected);
  });
  it('texto sem JSON dá erro', () => {
    expect(() => parseJsonLoose('nada aqui')).toThrow();
  });
});

describe('adaptador de IA (formato OpenAI)', () => {
  it('chama a URL certa, com chave, temperatura 0 e JSON, e devolve o resultado validado', async () => {
    const fetchMock = vi.fn(async () => reply('{"ok":true}'));
    const llm = make(fetchMock as unknown as typeof fetch);
    await expect(llm.json(req, Schema)).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.exemplo.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer SEGREDO-123');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'modelo-x', temperature: 0, response_format: { type: 'json_object' } });
    expect(body.messages).toEqual([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }]);
  });

  it('modelo sobrecarregado (429): usa o próximo da lista', async () => {
    const used: string[] = [];
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      const model = JSON.parse(init.body as string).model as string;
      used.push(model);
      return model === 'principal' ? new Response('{"error":{"message":"high demand"}}', { status: 429 }) : reply('{"ok":true}');
    });
    const llm = make(fetchMock as unknown as typeof fetch, { model: 'principal', fallbackModels: ['reserva'] });
    await expect(llm.json(req, Schema)).resolves.toEqual({ ok: true });
    expect(used).toEqual(['principal', 'reserva']);
  });

  it('modelo inexistente (404) também passa para o próximo', async () => {
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => (JSON.parse(init.body as string).model === 'x' ? new Response('', { status: 404 }) : reply('{"ok":true}')));
    await expect(make(fetchMock as unknown as typeof fetch, { model: 'x', fallbackModels: ['y'] }).json(req, Schema)).resolves.toEqual({ ok: true });
  });

  it('chave inválida (401/403) não adianta trocar de modelo: para na hora', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"bad key"}', { status: 401 }));
    await expect(make(fetchMock as unknown as typeof fetch, { fallbackModels: ['a', 'b'] }).json(req, Schema)).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('todos os modelos falham: um único erro, e o disjuntor conta uma falha só', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 429 }));
    const llm = make(fetchMock as unknown as typeof fetch, { fallbackModels: ['a', 'b'], breakerFailures: 2, maxPerMinute: 1000 });
    await expect(llm.json(req, Schema)).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(llm.json(req, Schema)).rejects.toThrow(/429/); // 2ª falha abre o disjuntor
    await expect(llm.json(req, Schema)).rejects.toThrow(/em pausa/);
  });

  it('o tempo limite vale para o pedido inteiro, e não para cada modelo (sem multiplicar a espera)', async () => {
    const started = Date.now();
    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const llm = createOpenAiCompatibleLlm({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'a', fallbackModels: ['b', 'c', 'd', 'e'], fetchImpl: slow, timeoutMs: 300 });
    await expect(llm.json(req, Schema)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(900);
  });

  it('modo JSON pode ser desligado para provedores que não aceitam response_format', async () => {
    const fetchMock = vi.fn(async () => reply('```json\n{"ok":true}\n```'));
    await expect(make(fetchMock as unknown as typeof fetch, { jsonMode: false }).json(req, Schema)).resolves.toEqual({ ok: true });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty('response_format');
  });

  it('envia reasoning_effort só quando configurado', async () => {
    const fetchMock = vi.fn(async () => reply('{"ok":true}'));
    await make(fetchMock as unknown as typeof fetch, { reasoningEffort: 'low' }).json(req, Schema);
    await make(fetchMock as unknown as typeof fetch).json(req, Schema);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0].reasoning_effort).toBe('low');
    expect(bodies[1]).not.toHaveProperty('reasoning_effort');
  });

  it('limite do provedor (429) vira erro na hora, sem repetir a chamada', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 429 }));
    const llm = make(fetchMock as unknown as typeof fetch);
    await expect(llm.json(req, Schema)).rejects.toBeInstanceOf(LlmUnavailable);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resposta mal formatada: tenta mais uma vez e aceita se vier certa', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply('não é json')).mockResolvedValueOnce(reply('{"ok":true}'));
    const llm = make(fetchMock as unknown as typeof fetch);
    await expect(llm.json(req, Schema)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('formato inválido duas vezes: erro', async () => {
    const fetchMock = vi.fn(async () => reply('{"ok":"talvez"}'));
    await expect(make(fetchMock as unknown as typeof fetch).json(req, Schema)).rejects.toThrow(/formato inválido/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('demora demais: aborta e vira erro', async () => {
    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    await expect(make(slow).json(req, Schema)).rejects.toThrow(/demorou demais/);
  });

  it('o erro traz o status e o motivo do provedor, para achar o problema, sem a chave', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":{"message":"model not found, key SEGREDO-123"}}', { status: 404 }));
    const messages: string[] = [];
    const llm = make(fetchMock as unknown as typeof fetch, { onError: (m) => messages.push(m) });
    const err = (await llm.json(req, Schema).catch((e: Error) => e)) as Error;
    expect(err.message).toMatch(/respondeu 404.*model not found/);
    expect(err.message).not.toContain('SEGREDO-123');
    expect(messages[0]).toMatch(/404/);
  });

  it('redact troca a chave por ***', () => {
    expect(redact('a SEGREDO-123 b', 'SEGREDO-123')).toBe('a *** b');
    expect(redact('sem segredo', '')).toBe('sem segredo');
  });

  it('o erro nunca vaza a chave', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('connect ECONNREFUSED SEGREDO-123');
    });
    const err = await make(down as unknown as typeof fetch).json(req, Schema).catch((e: Error) => e);
    expect((err as Error).message).not.toContain('SEGREDO-123');
  });

  it('disjuntor: depois de falhas seguidas pausa as chamadas e volta depois do tempo', async () => {
    let t = 0;
    const fetchMock = vi.fn(async () => new Response('', { status: 500 }));
    const llm = make(fetchMock as unknown as typeof fetch, { now: () => t, breakerFailures: 3, breakerPauseMs: 60_000, maxPerMinute: 1000 });
    for (let i = 0; i < 3; i++) await llm.json(req, Schema).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(llm.json(req, Schema)).rejects.toThrow(/em pausa/);
    expect(fetchMock).toHaveBeenCalledTimes(3); // nem tentou
    t = 61_000;
    await llm.json(req, Schema).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('teto por minuto protege a cota gratuita', async () => {
    let t = 0;
    const fetchMock = vi.fn(async () => reply('{"ok":true}'));
    const llm = make(fetchMock as unknown as typeof fetch, { now: () => t, maxPerMinute: 2 });
    await llm.json(req, Schema);
    await llm.json(req, Schema);
    await expect(llm.json(req, Schema)).rejects.toThrow(/Teto de chamadas/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    t = 61_000;
    await expect(llm.json(req, Schema)).resolves.toEqual({ ok: true });
  });
});
