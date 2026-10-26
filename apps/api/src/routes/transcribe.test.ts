import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { call } from '../testing';

const audio = Buffer.alloc(4000, 1);
const headers = { 'content-type': 'audio/webm;codecs=opus' };
const appWith = (stt: Parameters<typeof createApp>[1] extends infer S ? (S extends { stt?: infer T } ? T : never) : never) => createApp(loadConfig({}), { chat: undefined as never, stt });

describe('POST /api/transcribe', () => {
  it('desativada: 501 com mensagem clara', async () => {
    const res = await call(appWith(null), { method: 'POST', url: '/api/transcribe', headers, payload: audio });
    expect(res.status).toBe(501);
  });

  it('envia o áudio ao provedor com idioma português e devolve só o texto', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get('language')).toBe('pt');
      expect(form.get('model')).toBe('whisper-large-v3-turbo');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer SEGREDO');
      return new Response(JSON.stringify({ text: '  quero um hidratante para o rosto ' }), { status: 200 });
    });
    const app = appWith({ baseUrl: 'https://api.exemplo.com/openai/v1', apiKey: 'SEGREDO', model: 'whisper-large-v3-turbo', fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await call(app, { method: 'POST', url: '/api/transcribe', headers, payload: audio });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'quero um hidratante para o rosto' });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.exemplo.com/openai/v1/audio/transcriptions');
  });

  it.each([
    ['áudio curto demais', Buffer.alloc(10), 'audio/webm', 400],
    ['não é áudio', Buffer.from('{"a":1}'), 'application/json', 400],
  ])('rejeita: %s', async (_n, payload, type, status) => {
    const app = appWith({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl: vi.fn() as unknown as typeof fetch });
    const res = await call(app, { method: 'POST', url: '/api/transcribe', headers: { 'content-type': type }, payload });
    expect(res.status).toBe(status);
  });

  it('erro do provedor vira 502 sem vazar a chave nem o detalhe', async () => {
    const fetchMock = vi.fn(async () => new Response('chave SEGREDO inválida', { status: 401 }));
    const app = appWith({ baseUrl: 'https://x/v1', apiKey: 'SEGREDO', model: 'm', fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await call(app, { method: 'POST', url: '/api/transcribe', headers, payload: audio });
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('SEGREDO');
  });

  it('só liga com a Groq (ou STT_ENABLED=true) e com chave', () => {
    expect(loadConfig({}).sttEnabled).toBe(false);
    expect(loadConfig({ LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_API_KEY: 'k' }).sttEnabled).toBe(true);
    expect(loadConfig({ LLM_BASE_URL: 'https://openrouter.ai/api/v1', LLM_API_KEY: 'k' }).sttEnabled).toBe(false);
    expect(loadConfig({ LLM_BASE_URL: 'https://openrouter.ai/api/v1', LLM_API_KEY: 'k', STT_ENABLED: 'true' }).sttEnabled).toBe(true);
    expect(loadConfig({ LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_API_KEY: 'k', STT_ENABLED: 'false' }).sttEnabled).toBe(false);
  });
});
