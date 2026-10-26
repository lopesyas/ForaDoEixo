import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';
import { call } from './testing';

const app = createApp(loadConfig({}));

describe('API: base', () => {
  it('responde ao health', async () => {
    const res = await call(app, { method: 'GET', url: '/api/health' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', ai: { enabled: false, model: '' } });
  });

  it('envia cabeçalhos de segurança e não revela o framework', async () => {
    const res = await call(app, { method: 'GET', url: '/api/health' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejeita corpo grande demais', async () => {
    const res = await call(app, { method: 'POST', url: '/api/anything', payload: { text: 'x'.repeat(20_000) } });
    expect(res.status).toBe(413);
  });
});

describe('API: configuração', () => {
  it('tem padrões seguros', () => {
    const c = loadConfig({});
    expect(c.PORT).toBe(4100);
    expect(c.corsOrigins).toContain('http://127.0.0.1:5173');
  });

  it('falha cedo com mensagem clara quando o ambiente é inválido', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Configuração inválida: PORT/);
  });

  it('a IA só liga com URL, chave e modelo; faltando qualquer um, fica desligada', () => {
    expect(loadConfig({}).llmConfigured).toBe(false);
    expect(loadConfig({ LLM_BASE_URL: 'https://x/v1', LLM_API_KEY: 'k' }).llmConfigured).toBe(false);
    expect(loadConfig({ LLM_BASE_URL: 'https://x/v1', LLM_API_KEY: 'k', LLM_MODEL: 'm' }).llmConfigured).toBe(true);
  });

  it('aceita o nome de chave do Google (GEMINI_API_KEY) como alternativa', () => {
    const c = loadConfig({ LLM_BASE_URL: 'https://x/v1', LLM_MODEL: 'm', GEMINI_API_KEY: 'k' });
    expect(c.llmConfigured).toBe(true);
    expect(c.LLM_API_KEY).toBe('k');
  });

  it('lê a lista de modelos de reserva', () => {
    expect(loadConfig({ LLM_FALLBACK_MODELS: 'a, b ,,c' }).fallbackModels).toEqual(['a', 'b', 'c']);
    expect(loadConfig({}).fallbackModels).toEqual([]);
  });

  it('o health mostra o modelo, nunca a chave', async () => {
    const app2 = createApp(loadConfig({}), undefined);
    const res = await call(app2, { method: 'GET', url: '/api/health' });
    expect(JSON.stringify(res.body)).not.toMatch(/key|chave|secret/i);
  });
});
