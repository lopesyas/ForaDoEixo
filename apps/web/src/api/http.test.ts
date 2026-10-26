import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from './http';

const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('cliente HTTP', () => {
  it('envia o pedido e devolve o turno validado', async () => {
    const fetchMock = ok({ kind: 'QUESTION', text: 'Pele?', actions: [{ id: 'skin:seca', label: 'Seca' }] });
    const client = createHttpClient('http://api', fetchMock as unknown as typeof fetch);
    const turn = await client.send({ conversationId: 'abcdefgh1', text: 'hidratante' });
    expect(turn.kind).toBe('QUESTION');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/api/chat');
    expect(JSON.parse(init.body as string)).toEqual({ conversationId: 'abcdefgh1', text: 'hidratante' });
  });

  it('erro da API vira erro para a tela (que oferece tentar de novo)', async () => {
    const client = createHttpClient('', ok({ error: 'x' }, 500) as unknown as typeof fetch);
    await expect(client.send({ conversationId: 'abcdefgh1', text: 'a' })).rejects.toThrow(/500/);
  });

  it('resposta fora do contrato é rejeitada, não exibida', async () => {
    const client = createHttpClient('', ok({ kind: 'INVENTADO', text: 'x' }) as unknown as typeof fetch);
    await expect(client.send({ conversationId: 'abcdefgh1', text: 'a' })).rejects.toThrow();
  });

  it('API fora do ar (falha de rede) vira erro', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = createHttpClient('', down as unknown as typeof fetch);
    await expect(client.send({ conversationId: 'abcdefgh1', text: 'a' })).rejects.toThrow();
  });
});
