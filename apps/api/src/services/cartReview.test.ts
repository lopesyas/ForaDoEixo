import { describe, expect, it } from 'vitest';
import { createJsonCatalog } from '../adapters/catalog/jsonCatalog';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { isMedicine } from '../ports/catalog';
import { call } from '../testing';
import { createChatService } from './chat';
import { reviewCart } from './cartReview';

const catalog = createJsonCatalog();
const all = await catalog.all();
const otc = all.filter(isMedicine).filter((p) => p.risk === 'YELLOW');
const withSub = (s: string) => otc.filter((p) => p.substances.includes(s));

describe('revisão do carrinho', () => {
  it('cosméticos e carrinho vazio: nada a revisar', async () => {
    const cos = all.filter((p) => !isMedicine(p)).slice(0, 3).map((p) => p.id);
    expect((await reviewCart(catalog, cos)).findings).toEqual([]);
    expect((await reviewCart(catalog, [])).findings).toEqual([]);
  });

  it('o mesmo princípio ativo em dois produtos gera alerta de excesso', async () => {
    const [a, b] = withSub('dipirona');
    const r = await reviewCart(catalog, [a!.id, b!.id]);
    const dup = r.findings.find((f) => f.id === 'dup:dipirona')!;
    expect(dup.level).toBe('warning');
    expect(dup.text).toMatch(/mesmo princípio ativo \(dipirona\)/);
    expect(dup.productIds.sort()).toEqual([a!.id, b!.id].sort());
  });

  it('dois anti-inflamatórios diferentes juntos geram alerta', async () => {
    const ibu = withSub('ibuprofeno').find((p) => !p.substances.includes('naproxeno'))!;
    const nap = withSub('naproxeno').find((p) => !p.substances.includes('ibuprofeno'))!;
    const r = await reviewCart(catalog, [ibu.id, nap.id]);
    expect(r.findings.some((f) => f.id === 'nsaid-pair' && f.level === 'warning')).toBe(true);
  });

  it('cafeína repetida em dois analgésicos não é motivo de alerta', async () => {
    const withCaffeine = otc.filter((p) => p.substances.includes('cafeína') && !p.substances.includes('dipirona') && !p.substances.includes('paracetamol'));
    const pair = withCaffeine.slice(0, 2);
    if (pair.length === 2) expect((await reviewCart(catalog, pair.map((p) => p.id))).findings.some((f) => f.id === 'dup:cafeína')).toBe(false);
  });

  it('todo remédio sem receita no carrinho ganha o lembrete de conferir, ligado ao produto', async () => {
    const [p] = otc;
    const r = await reviewCart(catalog, [p!.id]);
    expect(r.findings).toEqual([expect.objectContaining({ id: `check:${p!.id}`, level: 'info', checkProductId: p!.id })]);
  });

  it('nenhum texto dá dose, promete efeito ou diz que é seguro', async () => {
    const r = await reviewCart(catalog, otc.slice(0, 12).map((p) => p.id));
    for (const f of r.findings) expect(f.text).not.toMatch(/\d+\s?(mg|ml|comprimidos?)|tome |é seguro|sem risco|cura/i);
  });

  it('a rota valida a entrada', async () => {
    const app = createApp(loadConfig({}), { chat: createChatService({ catalog }), catalog });
    expect((await call(app, { method: 'POST', url: '/api/cart/review', payload: { ids: [otc[0]!.id] } })).status).toBe(200);
    expect((await call(app, { method: 'POST', url: '/api/cart/review', payload: { ids: 'x' } })).status).toBe(400);
    expect((await call(app, { method: 'POST', url: '/api/cart/review', payload: { ids: Array(31).fill('a') } })).status).toBe(400);
  });
});
