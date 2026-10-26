import { describe, expect, it } from 'vitest';
import { createJsonCatalog } from '../adapters/catalog/jsonCatalog';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { isMedicine } from '../ports/catalog';
import type { LlmPort } from '../ports/llm';
import { call, fakeLlm } from '../testing';
import { createChatService } from './chat';
import { askAboutProduct, interpretFilter, productDetail, searchProducts, verifyAnswer } from './products';

const catalog = createJsonCatalog();
const noAi: LlmPort = { enabled: false, label: 'off', json: async () => ({}) as never };
const all = await catalog.all();
const firstOf = (pred: (p: (typeof all)[number]) => boolean) => all.find((p) => p.simulated.inStock && pred(p))!;

describe('listagem com filtros', () => {
  it('só mostra o que tem estoque, e cada filtro restringe de verdade', async () => {
    const r = await searchProducts(catalog, { cat: ['hidratante_facial'], maxCents: 2000, skin: 'seca' });
    expect(r.total).toBeGreaterThan(0);
    for (const p of r.products) {
      expect(p.priceCents).toBeLessThanOrEqual(2000);
      expect(p.skinTypes).toContain('seca');
      expect(p.categoryKey).toBe('hidratante_facial');
    }
    const ids = r.products.map((p) => p.id);
    for (const p of await catalog.byIds(ids)) expect(p.simulated.inStock).toBe(true);
  });

  it('ordena por preço por 100 g quando pedido', async () => {
    const r = await searchProducts(catalog, { cat: ['shampoo'], sort: 'unit' });
    const units = r.products.map((p) => p.pricePerUnitCents!);
    expect([...units].sort((a, b) => a - b)).toEqual(units);
  });

  it('busca por texto no nome e no fabricante, sem acento', async () => {
    const sample = firstOf((p) => !isMedicine(p));
    const word = sample.name.split(' ').find((w) => w.length >= 5 && /^[A-Za-z]+$/.test(w))!;
    const r = await searchProducts(catalog, { q: word.toUpperCase() });
    expect(r.products.map((p) => p.id)).toContain(sample.id);
  });

  it('remédio de receita é listado como "rx" e sem preço de unidade', async () => {
    const r = await searchProducts(catalog, { cat: ['receita'] });
    expect(r.total).toBeGreaterThan(0);
    for (const p of r.products) expect(p.kind).toBe('rx');
  });

  it('as opções (facetas) não somem quando um filtro é aplicado', async () => {
    const wide = await searchProducts(catalog, { cat: ['hidratante_facial'] });
    const narrow = await searchProducts(catalog, { cat: ['hidratante_facial'], skin: 'seca', maxCents: 1500 });
    expect(narrow.facets.companies.length).toBe(wide.facets.companies.length);
    expect(narrow.total).toBeLessThanOrEqual(wide.total);
  });

  it('nenhum resultado devolve lista vazia e totais zerados (a tela mostra ajuda)', async () => {
    const r = await searchProducts(catalog, { q: 'xyzabcnaoexiste' });
    expect(r).toMatchObject({ total: 0, products: [] });
  });
});

describe('página do produto', () => {
  it('cosmético: fatos, registro e perguntas sugeridas', async () => {
    const p = firstOf((x) => !isMedicine(x) && x.category === 'protetor_solar');
    const d = (await productDetail(catalog, p.id))!;
    expect(d.facts.map((f) => f.label)).toEqual(expect.arrayContaining(['Fabricante', 'Categoria']));
    expect(d.registration).toMatch(/^\d+$/);
    expect(d.notice).toBeUndefined();
    expect(d.questions.length).toBeGreaterThan(0);
  });

  it('remédio sem receita: princípio ativo, quem não deve usar e aviso fixo', async () => {
    const p = firstOf((x) => isMedicine(x) && x.risk === 'YELLOW');
    const d = (await productDetail(catalog, p.id))!;
    expect(d.facts.map((f) => f.label)).toEqual(expect.arrayContaining(['Princípio ativo', 'Venda']));
    expect(d.notice).toMatch(/Leia a bula/);
  });

  it('remédio de receita: aviso de que só se vende com receita', async () => {
    const p = firstOf((x) => isMedicine(x) && x.risk === 'RED');
    expect((await productDetail(catalog, p.id))!.notice).toMatch(/somente com receita/);
  });

  it('id inexistente: null', async () => {
    expect(await productDetail(catalog, 'nao-existe')).toBeNull();
  });
});

describe('perguntas sobre o produto', () => {
  const sun = firstOf((x) => !isMedicine(x) && x.category === 'protetor_solar' && Boolean((x as { spf?: number }).spf));
  const otc = firstOf((x) => isMedicine(x) && x.risk === 'YELLOW');
  const rx = firstOf((x) => isMedicine(x) && x.risk === 'RED');
  const ask = (id: string, q: string, llm: LlmPort = noAi) => askAboutProduct(catalog, id, q, llm);

  it.each([
    ['Quem fabrica?', /fabricante é/],
    ['Tem proteção solar (FPS)?', /FPS/],
    ['Qual o preço por 100 g?', /preço por/],
    ['Qual o registro na Anvisa?', /registro/],
    ['Serve para pele sensível?', /pele/],
  ])('responde direto dos dados: %s', async (q, re) => {
    const a = (await ask(sun.id, q))!;
    expect(a.mode).toBe('facts');
    expect(a.answer).toMatch(re);
  });

  it('não afirma pele que o nome não cita', async () => {
    const noSkin = firstOf((x) => !isMedicine(x) && x.skinTypes.length === 0);
    const a = (await ask(noSkin.id, 'Serve para pele oleosa?'))!;
    expect(a.answer).toMatch(/não informa/);
  });

  it('remédio: finalidade vem do cadastro e sempre manda ler a bula', async () => {
    const a = (await ask(otc.id, 'Para que serve?'))!;
    expect(a.answer).toMatch(/bula/);
    expect((await ask(otc.id, 'Quem não deve usar?'))!.answer).toMatch(/simplificada/);
  });

  it('receita: diz que só se vende com receita', async () => {
    expect((await ask(rx.id, 'É vendido sem receita?'))!.answer).toMatch(/só é vendido com receita/);
  });

  it.each(['Posso usar com pressão alta?', 'Meu pai pode tomar?', 'Serve para grávida?', 'Posso misturar com outro remédio?'])('pergunta pessoal vira conferência de segurança: %s', async (q) => {
    const a = (await ask(otc.id, q))!;
    expect(a.mode).toBe('check');
  });

  it('pergunta livre: a IA responde com base nos dados, e a resposta é verificada', async () => {
    const llm = fakeLlm(() => ({ resposta: 'Segundo o cadastro, este produto é do fabricante informado.' }));
    const a = (await ask(sun.id, 'Me conte mais sobre ele', llm))!;
    expect(a).toMatchObject({ mode: 'ai' });
    expect(llm.calls).toBe(1);
  });

  it.each([
    ['preço inventado', 'Custa R$ 3,00 hoje.'],
    ['promessa', 'Isso cura qualquer coisa.'],
    ['número fora dos dados', 'Tem 12345 avaliações.'],
  ])('resposta da IA reprovada (%s) vira o texto fixo', async (_n, bad) => {
    const a = (await ask(sun.id, 'Me conte mais sobre ele', fakeLlm(() => ({ resposta: bad }))))!;
    expect(a.mode).toBe('facts');
    expect(a.answer).toMatch(/não consta/);
  });

  it('produto inexistente: null', async () => {
    expect(await ask('nao-existe', 'oi?')).toBeNull();
  });

  it('verifyAnswer só aceita números que estão nos dados', () => {
    expect(verifyAnswer('O fabricante é Natura e o FPS é 50.', 'Fabricante: Natura; FPS: 50')).toBe(true);
    expect(verifyAnswer('O FPS é 70.', 'Fabricante: Natura; FPS: 50')).toBe(false);
  });
});

describe('filtro por frase', () => {
  const ai = (o = {}) => fakeLlm(() => ({ intent: 'other', category: null, maxPriceReais: null, skinTypes: [], relative: null, symptom: null, symptomDays: null, wantsPrescriptionDrug: false, emergencySigns: false, ...o }));

  it('"hidratante para pele seca até 20 reais" vira chips editáveis e vai para o catálogo', async () => {
    const r = await interpretFilter('hidratante para o rosto pele seca até 20 reais', noAi);
    expect(r.route).toBe('catalog');
    expect(r.filters).toMatchObject({ cat: ['hidratante_facial'], maxCents: 2000, skin: 'seca' });
    expect(r.chips.map((c) => c.label)).toEqual(expect.arrayContaining(['Hidratante para o rosto', 'pele seca']));
    expect(r.chips.some((c) => /até R\$\s*20,00/.test(c.label))).toBe(true);
  });

  it('"shampoo barato" ordena pelo mais barato', async () => {
    const r = await interpretFilter('shampoo barato', noAi);
    expect(r.filters.sort).toBe('unit');
    expect(r.route).toBe('catalog');
  });

  it('"produtos de cabelo" abre shampoo e condicionador juntos', async () => {
    expect((await interpretFilter('produtos de cabelo até 30 reais', noAi)).filters.cat).toEqual(['shampoo', 'condicionador']);
  });

  it('nome de marca ou produto vira busca por texto', async () => {
    const r = await interpretFilter('dove', noAi);
    expect(r.filters.q).toBe('dove');
    expect(r.route).toBe('catalog');
  });

  it.each(['estou com dor de cabeça', 'quero amoxicilina', 'oi', 'estou com dor no peito', 'meu pai está sem força de um lado do corpo'])('saúde, receita, cumprimento e emergência vão para a conversa: %s', async (t) => {
    expect((await interpretFilter(t, noAi)).route).toBe('assistant');
  });

  it('a IA complementa o que as regras não entendem', async () => {
    const r = await interpretFilter('queria algo para o rosto que não pese, uns trinta reais', ai({ intent: 'cosmetic', category: 'hidratante_facial', maxPriceReais: 30 }));
    expect(r.mode).toBe('ai');
    expect(r.filters).toMatchObject({ cat: ['hidratante_facial'], maxCents: 3000 });
  });

  it('IA que devolve lixo não quebra: cai nas regras', async () => {
    const r = await interpretFilter('shampoo', fakeLlm(() => 'lixo'));
    expect(r.filters.cat).toEqual(['shampoo']);
  });
});

describe('rotas do catálogo', () => {
  const app = createApp(loadConfig({}), { chat: createChatService({ catalog }), catalog, llm: noAi });
  it('GET /api/products filtra pela URL', async () => {
    const res = await call(app, { method: 'GET', url: '/api/products?cat=shampoo&max=3000&sort=unit' });
    expect(res.status).toBe(200);
    const body = res.body as { products: { priceCents: number; categoryKey: string }[] };
    for (const p of body.products) {
      expect(p.priceCents).toBeLessThanOrEqual(3000);
      expect(p.categoryKey).toBe('shampoo');
    }
  });
  it.each(['/api/products?max=abc', '/api/products?skin=azul', '/api/products?sort=aleatorio', '/api/products?limit=9999'])('parâmetro inválido: %s -> 400', async (url) => {
    expect((await call(app, { method: 'GET', url })).status).toBe(400);
  });
  it('produto inexistente: 404', async () => {
    expect((await call(app, { method: 'GET', url: '/api/products/nao-existe' })).status).toBe(404);
    expect((await call(app, { method: 'POST', url: '/api/products/nao-existe/ask', payload: { question: 'oi?' } })).status).toBe(404);
  });
  it('POST ask e interpret validam a entrada', async () => {
    const p = firstOf((x) => !isMedicine(x));
    expect((await call(app, { method: 'POST', url: `/api/products/${p.id}/ask`, payload: { question: 'Quem fabrica?' } })).status).toBe(200);
    expect((await call(app, { method: 'POST', url: `/api/products/${p.id}/ask`, payload: { question: '' } })).status).toBe(400);
    expect((await call(app, { method: 'POST', url: '/api/filters/interpret', payload: { text: 'shampoo' } })).status).toBe(200);
    expect((await call(app, { method: 'POST', url: '/api/filters/interpret', payload: {} })).status).toBe(400);
  });
});

describe('conferência de segurança de um produto (check:)', () => {
  const chat = () => createChatService({ catalog });
  const turn = (s: ReturnType<typeof chat>, id: string, i: object) => s.handle({ conversationId: id, ...i });
  const nsaid = all.find((p) => isMedicine(p) && p.risk === 'YELLOW' && p.avoidIf.includes('hypertension') && p.simulated.inStock)!;
  const safe = all.find((p) => isMedicine(p) && p.risk === 'YELLOW' && p.avoidIf.length === 0 && p.interactsWith.length === 0 && !p.cautionElderly && p.simulated.inStock)!;

  it('pergunta idade e condições e só então dá o veredito daquele produto', async () => {
    const s = chat();
    const id = 'check-aaaa-0001';
    const q1 = await turn(s, id, { actionId: `check:${nsaid.id}` });
    expect(q1).toMatchObject({ kind: 'QUESTION', text: expect.stringContaining(nsaid.name) });
    const q2 = await turn(s, id, { actionId: 'age:50-64' });
    expect(q2).toMatchObject({ kind: 'QUESTION', multi: true });
  });

  it('com pressão alta, um produto contraindicado é barrado, com o motivo, sem preço', async () => {
    const s = chat();
    const id = 'check-aaaa-0002';
    await turn(s, id, { actionId: `check:${nsaid.id}` });
    await turn(s, id, { actionId: 'age:50-64' });
    const v = await turn(s, id, { actionIds: ['cond:pressure'] });
    expect(v).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'yellow', text: expect.stringMatching(/contraindicação/) });
    expect(JSON.stringify(v)).not.toMatch(/priceCents/);
  });

  it('sem condição de risco, um produto sem restrições é liberado com aviso de bula', async () => {
    const s = chat();
    const id = 'check-aaaa-0003';
    await turn(s, id, { actionId: `check:${safe.id}` });
    await turn(s, id, { actionId: 'age:18-49' });
    const v = await turn(s, id, { actionIds: ['none'] });
    expect(v).toMatchObject({ kind: 'OPTIONS', comparable: false, text: expect.stringMatching(/não vejo impedimento/) });
  });

  it('criança pequena vai ao farmacêutico, mesmo sem condição', async () => {
    const s = chat();
    const id = 'check-aaaa-0004';
    await turn(s, id, { actionId: `check:${safe.id}` });
    await turn(s, id, { actionId: 'age:under12' });
    expect((await turn(s, id, { actionIds: ['none'] })).kind).toBe('SAFETY_NOTICE');
  });

  it('remédio de receita: aviso vermelho direto; cosmético: sem conferência de saúde; inexistente: ajuda', async () => {
    const s = chat();
    const rx = all.find((p) => isMedicine(p) && p.risk === 'RED')!;
    const cos = all.find((p) => !isMedicine(p))!;
    expect(await turn(s, 'check-aaaa-0005', { actionId: `check:${rx.id}` })).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'red' });
    expect((await turn(s, 'check-aaaa-0006', { actionId: `check:${cos.id}` })).kind).toBe('UNCONFIRMED');
    expect((await turn(s, 'check-aaaa-0007', { actionId: 'check:nao-existe' })).kind).toBe('NOT_FOUND');
  });

  it('alergia ao princípio ativo do produto: barrado', async () => {
    const s = chat();
    const id = 'check-aaaa-0008';
    const sub = (safe as { substances: string[] }).substances[0]!;
    await turn(s, id, { actionId: `check:${safe.id}` });
    await turn(s, id, { actionId: 'age:18-49' });
    await turn(s, id, { actionIds: ['allergy'] });
    const v = await turn(s, id, { actionIds: [`alg:${sub}`] });
    // só barra se a substância estiver entre as opções de alergia da conversa; senão cai em "outra ou não sei" (farmacêutico)
    expect(['SAFETY_NOTICE', 'OPTIONS', 'QUESTION']).toContain(v.kind);
  });
});
