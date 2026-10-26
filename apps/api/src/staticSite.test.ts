import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';
import { call } from './testing';

const dir = mkdtempSync(join(tmpdir(), 'site-'));
writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Loja</title><div id="root"></div>');
writeFileSync(join(dir, 'app.js'), 'console.log(1)');
const app = createApp(loadConfig({}), { chat: undefined as never, webDir: dir });

describe('site e API no mesmo endereço', () => {
  it('serve a página inicial e os arquivos do site', async () => {
    const home = await call(app, { method: 'GET', url: '/' });
    expect(home.status).toBe(200);
    expect(String(home.body)).toContain('<title>Loja</title>');
    expect((await call(app, { method: 'GET', url: '/app.js' })).status).toBe(200);
  });

  it('endereço desconhecido do site volta para a página inicial; /api desconhecido NÃO vira página', async () => {
    expect(String((await call(app, { method: 'GET', url: '/qualquer/coisa' })).body)).toContain('<title>Loja</title>');
    const api = await call(app, { method: 'GET', url: '/api/nao-existe' });
    expect(api.status).toBe(404);
    expect(String(api.body)).not.toContain('<title>Loja</title>');
  });

  it('a API continua respondendo ao lado do site', async () => {
    expect((await call(app, { method: 'GET', url: '/api/health' })).status).toBe(200);
  });

  it('cabeçalhos de segurança, sem forçar https (o site pode abrir por http na rede local)', async () => {
    const res = await call(app, { method: 'GET', url: '/' });
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sem pasta do site (modo desenvolvimento), a API funciona e não serve página', async () => {
    const devApp = createApp(loadConfig({}), { chat: undefined as never, webDir: join(dir, 'nao-existe') });
    expect((await call(devApp, { method: 'GET', url: '/' })).status).toBe(404);
    expect((await call(devApp, { method: 'GET', url: '/api/health' })).status).toBe(200);
  });
});
