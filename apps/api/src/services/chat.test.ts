import { UiTurn } from '@ia/shared';
import { describe, expect, it } from 'vitest';
import { createJsonCatalog } from '../adapters/catalog/jsonCatalog';
import { evaluate } from '../domain/safety';
import { isMedicine } from '../ports/catalog';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { call, fakeLlm } from '../testing';
import { createChatService, createMemoryStore } from './chat';

const catalog = createJsonCatalog();
let n = 0;
const newConversation = () => `conv-${String(++n).padStart(8, '0')}`;
const service = () => createChatService({ catalog });

type Turn = Awaited<ReturnType<ReturnType<typeof service>['handle']>>;
async function say(s: ReturnType<typeof service>, id: string, input: { text?: string; actionId?: string; actionIds?: string[] }): Promise<Turn> {
  const turn = await s.handle({ conversationId: id, ...input });
  expect(UiTurn.safeParse(turn).success).toBe(true); // nada sai da API fora do contrato
  return turn;
}
const productsOf = (t: Turn) => ('products' in t ? t.products : []);

describe('cosméticos: do pedido às opções, com dados reais da Anvisa', () => {
  it('confirma o entendimento, pergunta o tipo de pele e mostra opções dentro do orçamento', async () => {
    const s = service();
    const id = newConversation();

    const confirm = await say(s, id, { text: 'Quero um hidratante para o rosto de até R$ 20' });
    expect(confirm.kind).toBe('CONFIRM');
    if (confirm.kind === 'CONFIRM') {
      expect(confirm.summary).toEqual([
        { label: 'Produto', value: 'hidratante para o rosto' },
        { label: 'Valor máximo', value: expect.stringMatching(/R\$\s*20,00/) },
      ]);
    }

    const ask = await say(s, id, { actionId: 'confirm' });
    expect(ask).toMatchObject({ kind: 'QUESTION', multi: false });

    const options = await say(s, id, { actionId: 'skin:seca' });
    expect(options.kind).toBe('OPTIONS');
    const products = productsOf(options);
    expect(products.length).toBeGreaterThanOrEqual(2);
    for (const p of products) {
      expect(p.priceCents).toBeLessThanOrEqual(2000); // nunca passa do orçamento
      expect(p.reason).toMatch(/pele seca/i);
      expect(p.badges.map((b) => b.label)).toContain('Dentro do seu orçamento');
    }
  });

  it('só oferece produtos em estoque e da categoria pedida', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'protetor solar até R$ 90' });
    await say(s, id, { actionId: 'confirm' });
    const options = await say(s, id, { actionId: 'skin:unknown' });
    const items = await catalog.byIds(productsOf(options).map((p) => p.id));
    expect(items.length).toBeGreaterThan(0);
    for (const p of items) {
      expect(isMedicine(p)).toBe(false);
      expect('category' in p && p.category).toBe('protetor_solar');
      expect(p.simulated.inStock).toBe(true);
    }
  });

  it('categoria sem tipo de pele (shampoo) vai direto às opções, sem perguntar', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'shampoo' });
    const result = await say(s, id, { actionId: 'confirm' });
    expect(result.kind).toBe('OPTIONS');
  });

  it('"hidratante" sozinho pergunta rosto ou corpo, em vez de adivinhar', async () => {
    const s = service();
    const t = await say(s, newConversation(), { text: 'preciso de um hidratante' });
    expect(t).toMatchObject({ kind: 'QUESTION', text: expect.stringMatching(/rosto ou para o corpo/) });
  });

  it('orçamento impossível: resultado PARCIAL, dizendo quanto passa do valor', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'hidratante para o rosto até R$ 1' });
    await say(s, id, { actionId: 'confirm' });
    const t = await say(s, id, { actionId: 'skin:unknown' });
    expect(t.kind).toBe('PARTIAL');
    if (t.kind === 'PARTIAL') {
      expect(t.text).toMatch(/passam do seu valor/);
      expect(t.products.length).toBeGreaterThan(0);
      for (const p of t.products) expect(p.badges[0]!.label).toMatch(/acima do seu valor/);
    }
  });

  it('pedido fora do catálogo diz que não encontrou e o que sabe fazer', async () => {
    const t = await say(service(), newConversation(), { text: 'quero uma cadeira de rodas' });
    expect(t.kind).toBe('NOT_FOUND');
    expect(t.actions.length).toBeGreaterThan(0);
  });

  it('comparar: o "melhor" marcado em cada linha é realmente o melhor', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'hidratante para o rosto' });
    await say(s, id, { actionId: 'confirm' });
    const options = await say(s, id, { actionId: 'skin:seca' });
    const [a, b] = productsOf(options);
    const t = await say(s, id, { actionId: `compare:${a!.id},${b!.id}` });
    expect(t.kind).toBe('COMPARE');
    if (t.kind !== 'COMPARE') return;
    const price = t.rows.find((r) => r.label === 'Preço')!;
    if (price.better !== undefined) {
      const winner = price.better === 0 ? a! : b!;
      const loser = price.better === 0 ? b! : a!;
      expect(winner.priceCents).toBeLessThan(loser.priceCents);
    }
    const perUnit = t.rows.find((r) => r.label.startsWith('Preço por'))!;
    expect(perUnit).toBeDefined();
    expect(t.actions.map((x) => x.label).filter((l) => l.startsWith('Escolher'))).toHaveLength(2);
  });

  it('"voltar às opções" mostra as opções de novo', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'shampoo' });
    await say(s, id, { actionId: 'confirm' });
    const t = await say(s, id, { actionId: 'back:options' });
    expect(t.kind).toBe('OPTIONS');
  });
});

describe('saúde: perguntar, conferir e recomendar só o que passa na camada de segurança', () => {
  /** Percorre a conversa de saúde até a pergunta de múltipla escolha. */
  async function toMain(s: ReturnType<typeof service>, id: string, text: string, age = 'age:50-64', days = 'days:1') {
    const confirm = await say(s, id, { text });
    expect(confirm.kind).toBe('CONFIRM');
    expect((await say(s, id, { actionId: 'confirm' })).kind).toBe('QUESTION'); // idade
    let t = await say(s, id, { actionId: age });
    if (t.kind === 'QUESTION' && !t.multi) t = await say(s, id, { actionId: days }); // há quanto tempo (se o texto não disse)
    expect(t).toMatchObject({ kind: 'QUESTION', multi: true });
  }
  const names = async (t: Turn) => (await catalog.byIds(productsOf(t).map((p) => p.id))).filter(isMedicine);

  it('adulto saudável, sintoma recente: mostra opções sem receita, com bula e sem dose', async () => {
    const s = service();
    const id = newConversation();
    await toMain(s, id, 'dor de cabeça', 'age:18-49', 'days:1');
    const t = await say(s, id, { actionIds: ['none'] });
    expect(t.kind).toBe('OPTIONS');
    const products = productsOf(t);
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(p.badges.map((b) => b.label)).toEqual(expect.arrayContaining(['Venda sem receita', 'Leia a bula antes de usar']));
      expect(p.reason).toMatch(/Princípio ativo:/);
      expect(`${p.reason}`).not.toMatch(/\d+\s?(mg|ml|comprimidos?) a cada|tome|dose de/i); // nunca instrui dose
    }
    for (const m of await names(t)) expect(m.risk).toBe('YELLOW');
  });

  it('pressão alta + dor há 2 dias: aviso amarelo, farmacêutico, sem produto', async () => {
    const s = service();
    const id = newConversation();
    await toMain(s, id, 'Remédio para dor de cabeça para meu pai há 2 dias');
    const t = await say(s, id, { actionIds: ['cond:pressure'] });
    expect(t).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'yellow' });
    expect(JSON.stringify(t)).not.toMatch(/priceCents|products/);
    expect(t.actions[0]!.label).toBe('Falar com farmacêutico agora');
  });

  it('pressão alta com sintoma de 1 dia: tira os anti-inflamatórios e o que sobe a pressão, mantém os demais', async () => {
    const s = service();
    const id = newConversation();
    await toMain(s, id, 'dor de cabeça', 'age:50-64', 'days:1');
    const t = await say(s, id, { actionIds: ['cond:pressure'] });
    expect(t.kind).toBe('OPTIONS');
    for (const m of await names(t)) {
      expect(m.substances).not.toContain('ibuprofeno');
      expect(m.substances).not.toContain('naproxeno');
      expect(m.substances).not.toContain('isometepteno');
    }
  });

  it('asma: nenhum anti-inflamatório nas opções', async () => {
    const s = service();
    const id = newConversation();
    await toMain(s, id, 'dor de cabeça', 'age:18-49', 'days:1');
    const t = await say(s, id, { actionIds: ['cond:asthma'] });
    for (const m of await names(t)) expect(m.substances.some((x) => ['ibuprofeno', 'naproxeno', 'ácido acetilsalicílico'].includes(x))).toBe(false);
  });

  it('alergia a dipirona: pergunta qual e tira tudo que tem dipirona', async () => {
    const s = service();
    const id = newConversation();
    await toMain(s, id, 'dor de cabeça', 'age:18-49', 'days:1');
    const ask = await say(s, id, { actionIds: ['allergy'] });
    expect(ask).toMatchObject({ kind: 'QUESTION', multi: true, text: expect.stringContaining('alergia a algum destes') });
    const t = await say(s, id, { actionIds: ['alg:dipirona'] });
    expect(t.kind).toBe('OPTIONS');
    for (const m of await names(t)) expect(m.substances).not.toContain('dipirona');
  });

  it('usa anticoagulante: tira o que interage', async () => {
    const s = service();
    const id = newConversation();
    await toMain(s, id, 'dor de cabeça', 'age:18-49', 'days:1');
    await say(s, id, { actionIds: ['med:other'] });
    const t = await say(s, id, { actionIds: ['mc:anticoagulant'] });
    for (const m of await names(t)) expect(m.interactsWith).not.toContain('anticoagulant');
  });

  it('"não sei qual remédio" ou "alergia a outra coisa": vai ao farmacêutico, sem produto', async () => {
    for (const [first, second] of [['med:other', 'mc:unknown'], ['allergy', 'alg:other']] as const) {
      const s = service();
      const id = newConversation();
      await toMain(s, id, 'não é para o meu pai, é para a minha mãe, dor de cabeça', 'age:50-64', 'days:1');
      await say(s, id, { actionIds: [first] });
      const t = await say(s, id, { actionIds: [second] });
      expect(t).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'yellow', text: expect.stringContaining('sua mãe') });
    }
  });

  it('gravidez e criança pequena: sempre ao farmacêutico', async () => {
    const preg = service();
    const id1 = newConversation();
    await toMain(preg, id1, 'dor de cabeça', 'age:18-49', 'days:1');
    expect(await say(preg, id1, { actionIds: ['cond:pregnant'] })).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'yellow' });

    const kid = service();
    const id2 = newConversation();
    await toMain(kid, id2, 'febre no meu pai', 'age:under12', 'days:1');
    expect(await say(kid, id2, { actionIds: ['none'] })).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'yellow' });
  });

  it('sintoma há 3 dias ou mais: farmacêutico, mesmo sem nenhuma condição', async () => {
    const s = service();
    const id = newConversation();
    await toMain(s, id, 'dor de cabeça', 'age:18-49', 'days:3');
    expect(await say(s, id, { actionIds: ['none'] })).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'yellow' });
  });

  it('azia: oferece antiácidos, e cortando sódio para quem tem pressão alta', async () => {
    const s = service();
    const id = newConversation();
    await toMain(s, id, 'estou com azia', 'age:50-64', 'days:0');
    const t = await say(s, id, { actionIds: ['cond:pressure'] });
    if (t.kind === 'OPTIONS') for (const m of await names(t)) expect(m.substances).not.toContain('bicarbonato de sódio');
    else expect(t.kind).toBe('SAFETY_NOTICE');
  });

  it('sintoma sem opções cadastradas: diz com honestidade, sem inventar', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'estou com enjoo' });
    const t = await say(s, id, { actionId: 'confirm' });
    expect(t).toMatchObject({ kind: 'UNCONFIRMED', text: expect.stringContaining('Ainda não tenho opções cadastradas para enjoo') });
  });

  it('PROPRIEDADE: tudo que a API mostra como opção, a camada de segurança liberou por conta própria', async () => {
    const combos: string[][] = [['none'], ['cond:pressure'], ['cond:ulcer'], ['cond:kidney'], ['cond:liver'], ['cond:asthma'], ['cond:pressure', 'cond:kidney'], ['cond:liver', 'cond:ulcer']];
    for (const age of ['age:18-49', 'age:65plus']) {
      for (const conditions of combos) {
        const s = service();
        const id = newConversation();
        await toMain(s, id, 'dor de cabeça', age, 'days:1');
        const t = await say(s, id, { actionIds: conditions });
        if (t.kind !== 'OPTIONS') continue;
        const profile = {
          ageRange: age.slice(4) as '18-49' | '65plus',
          conditions: conditions.flatMap((c) => ({ 'cond:pressure': ['hypertension' as const], 'cond:ulcer': ['stomach_ulcer' as const], 'cond:kidney': ['kidney_disease' as const], 'cond:liver': ['liver_disease' as const], 'cond:asthma': ['asthma' as const] })[c as 'cond:pressure'] ?? []),
          allergies: [],
          medClasses: [],
        };
        for (const m of await names(t)) {
          const result = evaluate({ id: m.id, name: m.name, risk: m.risk, ingredients: m.substances, avoidIf: m.avoidIf, interactsWith: m.interactsWith, cautionElderly: m.cautionElderly }, profile, { symptomDays: 1 });
          expect(result.verdict).toBe('ALLOW');
        }
      }
    }
  });

  it('comparar medicamentos mostra princípio ativo e lembra de ler a bula', async () => {
    const s = service();
    const id = newConversation();
    await toMain(s, id, 'dor de cabeça', 'age:18-49', 'days:1');
    const options = await say(s, id, { actionIds: ['none'] });
    const [a, b] = productsOf(options);
    const t = await say(s, id, { actionId: `compare:${a!.id},${b!.id}` });
    expect(t.kind).toBe('COMPARE');
    if (t.kind === 'COMPARE') {
      expect(t.rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Preço', 'Princípio ativo', 'Para que serve']));
      expect(t.text).toMatch(/bula/);
    }
  });

  it('emergência vem antes de qualquer interpretação', async () => {
    const t = await say(service(), newConversation(), { text: 'estou com dor no peito e quero um hidratante' });
    expect(t).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'alert' });
  });

  it('remédio de receita citado pelo nome: aviso vermelho que o reconhece, sem sugerir', async () => {
    const t = await say(service(), newConversation(), { text: 'quero amoxicilina' });
    expect(t).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'red', text: expect.stringMatching(/amoxicilina.*só pode ser comprado com receita/i) });
    expect(JSON.stringify(t)).not.toMatch(/priceCents/);
  });

  it('"repetir minha última compra" pede consentimento antes de usar qualquer histórico', async () => {
    const t = await say(service(), newConversation(), { text: 'Repetir minha última compra' });
    expect(t).toMatchObject({ kind: 'QUESTION', text: expect.stringContaining('dados simulados') });
    expect(t.actions.map((a) => a.id)).toEqual(['persona:yes', 'persona:no']);
  });
});

describe('robustez', () => {
  it('conversa expirada ou desconhecida não quebra', async () => {
    const t = await say(service(), newConversation(), { actionId: 'confirm' });
    expect(t.kind).toBe('NOT_FOUND');
  });

  it('o armazenamento tem teto: conversas antigas saem', () => {
    const store = createMemoryStore(2);
    const state = { intent: { skin: [], relative: null, wantsReorder: false, rx: false, health: null }, lastOptionIds: [] };
    store.set('a', state);
    store.set('b', state);
    store.set('c', state);
    expect(store.get('a')).toBeUndefined();
    expect(store.get('c')).toBeDefined();
  });

  it('um pedido novo na mesma conversa não herda o anterior', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'hidratante para o rosto' });
    await say(s, id, { actionId: 'confirm' });
    await say(s, id, { actionId: 'skin:seca' });
    const confirm = await say(s, id, { text: 'shampoo' });
    expect(confirm.kind === 'CONFIRM' && confirm.summary.map((i) => i.label)).toEqual(['Produto']);
  });
});

describe('rota POST /api/chat', () => {
  const app = createApp(loadConfig({}), { chat: service() });
  const post = (payload: unknown) => call(app, { method: 'POST', url: '/api/chat', payload: payload as object });

  it('responde com o contrato de interface', async () => {
    const res = await post({ conversationId: 'abcdefgh1', text: 'shampoo' });
    expect(res.status).toBe(200);
    expect(UiTurn.safeParse(res.body).success).toBe(true);
  });

  it.each([
    ['sem conversationId', { text: 'oi' }],
    ['conversationId curto', { conversationId: 'x', text: 'oi' }],
    ['sem texto nem ação', { conversationId: 'abcdefgh1' }],
    ['texto vazio', { conversationId: 'abcdefgh1', text: '   ' }],
    ['texto grande demais', { conversationId: 'abcdefgh1', text: 'a'.repeat(501) }],
    ['ações demais', { conversationId: 'abcdefgh1', actionIds: Array(11).fill('x') }],
  ])('rejeita pedido inválido: %s', async (_n, payload) => {
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Pedido inválido.' });
  });
});

describe('com IA ligada (a IA entende e explica; a segurança continua das regras)', () => {
  const aiIntent = (over: Record<string, unknown> = {}) => ({ intent: 'other', category: null, maxPriceReais: null, skinTypes: [], relative: null, symptom: null, symptomDays: null, wantsPrescriptionDrug: false, emergencySigns: false, ...over });
  const withLlm = (handler: (r: { system: string; user: string }) => unknown, aiExplain = true) => createChatService({ catalog, llm: fakeLlm(handler), aiExplain });

  it('entende um pedido solto e segue o fluxo de saúde com pergunta de idade', async () => {
    const s = withLlm(() => aiIntent({ intent: 'health', symptom: 'dor de cabeça', relative: 'pai' }));
    const id = newConversation();
    const confirm = await say(s, id, { text: 'meu pai está com a cabeça estourando' });
    expect(confirm).toMatchObject({ kind: 'CONFIRM', summary: expect.arrayContaining([{ label: 'Para quem', value: 'seu pai' }, { label: 'Necessidade', value: 'dor de cabeça' }]) });
    expect((await say(s, id, { actionId: 'confirm' })).kind).toBe('QUESTION');
  });

  it('usa a frase da IA quando ela passa na verificação', async () => {
    const s = withLlm((r) => (r.system.includes('Responda SOMENTE com um objeto JSON') ? aiIntent() : { frase: 'Separei estas opções de shampoo para você.' }));
    const id = newConversation();
    await say(s, id, { text: 'shampoo' });
    const t = await say(s, id, { actionId: 'confirm' });
    expect(t).toMatchObject({ kind: 'OPTIONS', text: 'Separei estas opções de shampoo para você.' });
  });

  it('descarta frase inventada e usa o texto fixo', async () => {
    const s = withLlm((r) => (r.system.includes('Responda SOMENTE com um objeto JSON') ? aiIntent() : { frase: 'Estas custam só R$ 0,99 cada, aproveite!' }));
    const id = newConversation();
    await say(s, id, { text: 'shampoo' });
    const t = await say(s, id, { actionId: 'confirm' });
    expect(t.kind === 'OPTIONS' && t.text).toMatch(/^Encontrei \d boas? opç/);
  });

  it('IA quebrada: tudo continua funcionando só por regras', async () => {
    const s = withLlm(() => {
      throw new Error('fora do ar');
    });
    const id = newConversation();
    expect((await say(s, id, { text: 'hidratante para o rosto até R$ 20' })).kind).toBe('CONFIRM');
    await say(s, id, { actionId: 'confirm' });
    expect((await say(s, id, { actionId: 'skin:seca' })).kind).toBe('OPTIONS');
  });

  it('a IA não vence a regra de receita: mesmo dizendo "cosmético", amoxicilina é vermelho', async () => {
    const s = withLlm(() => aiIntent({ intent: 'cosmetic', category: 'shampoo' }));
    const t = await say(s, newConversation(), { text: 'quero amoxicilina' });
    expect(t).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'red' });
    expect(JSON.stringify(t)).not.toMatch(/priceCents/);
  });

  it('emergência vista só pela IA também interrompe tudo', async () => {
    const s = withLlm(() => aiIntent({ emergencySigns: true }));
    expect(await say(s, newConversation(), { text: 'meu pai está sem força de um lado do corpo' })).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'alert' });
  });

  it('emergência por regras não espera a IA (nem chama)', async () => {
    const llm = fakeLlm(() => aiIntent());
    const s = createChatService({ catalog, llm });
    await say(s, newConversation(), { text: 'estou com dor no peito' });
    expect(llm.calls).toBe(0);
  });

  it('as opções de medicamento continuam as que a camada de segurança liberou, com ou sem IA', async () => {
    const s = withLlm((r) => (r.system.includes('Responda SOMENTE com um objeto JSON') ? aiIntent() : { frase: 'Estas opções são seguras e sem risco, tome sem medo.' }));
    const id = newConversation();
    await say(s, id, { text: 'dor de cabeça' });
    await say(s, id, { actionId: 'confirm' });
    await say(s, id, { actionId: 'age:18-49' });
    await say(s, id, { actionId: 'days:1' });
    const t = await say(s, id, { actionIds: ['none'] });
    expect(t.kind).toBe('OPTIONS');
    expect(t.kind === 'OPTIONS' && t.text).not.toMatch(/seguras|sem risco|tome/i); // frase proibida foi trocada pelo texto fixo
  });

  it('por padrão a IA não escreve a frase de abertura (só entende o pedido): menos espera e menos cota', async () => {
    const llm = fakeLlm((r) => (r.system.includes('Responda SOMENTE com um objeto JSON') ? aiIntent() : { frase: 'Frase da IA que não deve aparecer aqui.' }));
    const s = createChatService({ catalog, llm }); // aiExplain padrão: desligado
    const id = newConversation();
    await say(s, id, { text: 'shampoo' });
    const t = await say(s, id, { actionId: 'confirm' });
    expect(t.kind === 'OPTIONS' && t.text).toMatch(/^Encontrei \d boas? opç/);
    expect(llm.calls).toBe(0); // as regras já entendem "shampoo"; a IA nem é chamada
  });
});

describe('conversa livre: dá para escrever em vez de tocar nos botões', () => {
  it('"oi" é cumprimentado, com sugestões que viram pedido', async () => {
    const s = service();
    const id = newConversation();
    const hi = await say(s, id, { text: 'oi' });
    expect(hi).toMatchObject({ kind: 'QUESTION', text: expect.stringContaining('Assistente Pague Menos') });
    const area = await say(s, id, { actionId: hi.actions[0]!.id });
    expect(area.kind).toBe('QUESTION');
    const next = await say(s, id, { actionId: area.actions[0]!.id });
    expect(next.kind).toBe('CONFIRM');
  });

  it('o cumprimento oferece todas as áreas, inclusive "Outro"', async () => {
    const hi = await say(service(), newConversation(), { text: 'oi' });
    expect(hi.actions.map((a) => a.label)).toEqual(['Pele e rosto', 'Cabelo', 'Higiene e proteção', 'Perfumes e maquiagem', 'Remédios sem receita', 'Meu histórico (demonstração)', 'Outro']);
  });

  it('"Tudo bem?" tem resposta própria e um segundo "oi" não repete o texto', async () => {
    const s = service();
    const id = newConversation();
    const first = await say(s, id, { text: 'oi' });
    const how = await say(s, id, { text: 'Tudo bem?' });
    const again = await say(s, id, { text: 'oi' });
    expect(how.text).toMatch(/Tudo bem, obrigado/);
    expect(new Set([first.text, how.text, again.text]).size).toBe(3);
  });

  it('"Outro" pede para escrever e não termina em "não encontrei"', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'oi' });
    const t = await say(s, id, { text: 'Outro' });
    expect(t.kind).toBe('QUESTION');
    expect(t.text).toMatch(/Escreva com as suas palavras/);
    expect(t.actions.length).toBeGreaterThan(0);
  });

  it('pedido desconhecido não é beco sem saída: oferece as áreas', async () => {
    const t = await say(service(), newConversation(), { text: 'quero uma cadeira de rodas' });
    expect(t.kind).toBe('NOT_FOUND');
    expect(t.actions.map((a) => a.label)).toContain('Pele e rosto');
    expect(t.actions.map((a) => a.id)).not.toContain('change');
  });

  it('cada área abre uma lista de pedidos que o assistente realmente atende', async () => {
    const s = service();
    for (const key of ['pele', 'cabelo', 'higiene', 'beleza', 'saude']) {
      const area = await say(s, newConversation(), { actionId: `menu:${key}` });
      for (const item of area.actions.filter((a) => a.id.startsWith('say:'))) {
        const t = await say(s, newConversation(), { actionId: item.id });
        expect(t.kind, `${key} › ${item.label}`).toBe('CONFIRM');
      }
    }
  });

  it('procura pelo nome do produto quando não é uma categoria', async () => {
    const [sample] = (await catalog.byCategory('hidratante_facial')).filter((p) => p.simulated.inStock);
    const word = sample!.name.split(' ').find((w) => w.length >= 6 && /^[A-Za-zÀ-ú]+$/.test(w) && !/hidrat|facial|creme|loc|pele|serum|rosto|corp|solar|gel/i.test(w.normalize('NFD')))!;
    const t = await say(service(), newConversation(), { text: word });
    expect(t.kind).toBe('OPTIONS');
  });

  it('nome de remédio sem receita inicia as perguntas de segurança, nunca mostra o produto direto', async () => {
    const [med] = (await catalog.otcByGroups(['analgesico'])).filter((m) => /^[A-Za-z]{6,}$/.test(m.name));
    const t = await say(service(), newConversation(), { text: med!.name });
    expect(t.kind).toBe('CONFIRM');
    expect(JSON.stringify(t)).not.toMatch(/priceCents/);
  });

  it('antialérgico: pergunta antes de indicar e respeita as condições', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'estou com alergia' });
    await say(s, id, { text: 'sim' });
    await say(s, id, { text: '30 anos' });
    await say(s, id, { text: 'hoje' });
    const t = await say(s, id, { text: 'nenhum' });
    expect(t.kind).toBe('OPTIONS');
  });

  it('agradecimento e "o que você faz?" têm resposta, sem dizer "não encontrei"', async () => {
    const s = service();
    expect((await say(s, newConversation(), { text: 'obrigado!' })).text).toMatch(/Por nada/);
    expect((await say(s, newConversation(), { text: 'o que você faz?' })).text).toMatch(/farmacêutico/);
  });

  it('"oi, quero shampoo" é um pedido, não só um cumprimento', async () => {
    expect((await say(service(), newConversation(), { text: 'oi, quero um shampoo' })).kind).toBe('CONFIRM');
  });

  it('responde só digitando: sim, "minha pele é seca" e acompanha até as opções', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'quero um hidratante para o rosto até 20 reais' });
    expect((await say(s, id, { text: 'sim' })).kind).toBe('QUESTION');
    const t = await say(s, id, { text: 'minha pele é seca' });
    expect(t.kind).toBe('OPTIONS');
  });

  it('saúde só digitando: idade, tempo e condições em linguagem natural', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'dor de cabeça' });
    await say(s, id, { text: 'está certo' });
    expect(await say(s, id, { text: 'tenho 62 anos' })).toMatchObject({ kind: 'QUESTION', text: expect.stringContaining('Há quanto tempo') });
    expect(await say(s, id, { text: 'desde ontem, 1 dia' })).toMatchObject({ multi: true });
    const t = await say(s, id, { text: 'tenho pressão alta' });
    expect(t.kind).toBe('OPTIONS');
    for (const m of (await catalog.byIds(productsOf(t).map((p) => p.id))).filter(isMedicine)) expect(m.substances).not.toContain('ibuprofeno');
  });

  it('"nenhuma" responde a pergunta de condições', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'dor de cabeça' });
    await say(s, id, { text: 'sim' });
    await say(s, id, { text: '30' });
    await say(s, id, { text: 'hoje' });
    expect((await say(s, id, { text: 'nenhuma' })).kind).toBe('OPTIONS');
  });

  it('"não" na confirmação recomeça com sugestões', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'shampoo' });
    expect(await say(s, id, { text: 'não' })).toMatchObject({ kind: 'QUESTION', text: expect.stringContaining('de novo') });
  });

  it('emergência digitada no meio da conversa ainda interrompe tudo', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'dor de cabeça' });
    await say(s, id, { text: 'sim' });
    expect(await say(s, id, { text: 'ele está sem força de um lado do corpo' })).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'alert' });
  });

  it('um pedido novo no meio de uma pergunta é tratado como pedido novo', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'hidratante para o rosto' });
    await say(s, id, { text: 'sim' });
    const t = await say(s, id, { text: 'na verdade quero um shampoo' });
    expect(t.kind === 'CONFIRM' && t.summary[0]!.value).toBe('shampoo');
  });
});

describe('histórico com consentimento (perfil de demonstração)', () => {
  it('sem consentimento, nada de histórico; com consentimento, sugere a reposição do que está acabando', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'repetir minha última compra' });
    const t = await say(s, id, { text: 'sim' });
    expect(t.kind).toBe('OPTIONS');
    if (t.kind !== 'OPTIONS') return;
    expect(t.comparable).toBe(false);
    expect(t.products.length).toBe(2);
    for (const p of t.products) expect(p.reason).toMatch(/Comprado há \d+ dias; deve acabar em \d+ dias?\./);
    expect(t.actions.map((a) => a.id)).toEqual(expect.arrayContaining(['cart:all', 'persona:off']));
  });

  it('Cenário C: o remédio de uso contínuo exige receita e nunca entra na lista', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { actionId: 'persona:yes' });
    const t = await say(s, id, { actionId: 'menu:historico' });
    expect(t.text).toMatch(/só se compra com receita/);
    expect(t.actions.map((a) => a.label)).toContain('Falar com farmacêutico sobre a receita');
    const ids = (t.kind === 'OPTIONS' ? t.products : []).map((p) => p.id);
    for (const m of await catalog.byIds(ids)) expect(isMedicine(m)).toBe(false);
  });

  it('negar o consentimento volta ao menu sem guardar nada', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'repetir minha última compra' });
    expect((await say(s, id, { text: 'agora não' })).text).toMatch(/sem usar o histórico/);
    expect((await say(s, id, { text: 'repetir minha última compra' })).kind).toBe('QUESTION');
  });

  it('"parar de usar meu histórico" desliga o perfil', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { actionId: 'persona:yes' });
    await say(s, id, { actionId: 'persona:off' });
    expect((await say(s, id, { text: 'repetir minha última compra' })).kind).toBe('QUESTION');
  });

  it('Modo Cuidador: com o perfil do pai (68 anos, pressão alta) pula idade e condições, e filtra', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { actionId: 'persona:yes' });
    await say(s, id, { text: 'meu pai está com dor de cabeça' });
    const ask = await say(s, id, { actionId: 'confirm' });
    expect(ask.text).toMatch(/Usei o perfil salvo do seu pai \(68 anos, pressão alta/);
    const t = await say(s, id, { actionId: 'days:1' });
    expect(['OPTIONS', 'SAFETY_NOTICE']).toContain(t.kind);
    if (t.kind === 'OPTIONS') {
      for (const m of (await catalog.byIds(t.products.map((p) => p.id))).filter(isMedicine)) {
        expect(m.substances).not.toContain('ibuprofeno');
        expect(m.interactsWith).not.toContain('antihypertensive');
      }
    }
  });

  it('sem o perfil, o mesmo pedido continua perguntando a idade', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'meu pai está com dor de cabeça' });
    expect((await say(s, id, { actionId: 'confirm' })).text).toMatch(/Qual é a idade/);
  });
});

describe('sugestão complementar', () => {
  it('hidratante facial sugere protetor solar; o botão inicia esse pedido', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'hidratante para o rosto' });
    await say(s, id, { actionId: 'confirm' });
    const t = await say(s, id, { actionId: 'skin:unknown' });
    const comp = t.actions.find((a) => a.label.startsWith('Para completar'));
    expect(comp?.label).toMatch(/protetor solar/);
    expect((await say(s, id, { actionId: comp!.id })).kind).toBe('CONFIRM');
  });

  it('nunca sugere complemento em saúde', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'dor de cabeça' });
    await say(s, id, { text: 'sim' });
    await say(s, id, { text: '30' });
    await say(s, id, { text: 'hoje' });
    const t = await say(s, id, { text: 'nenhuma' });
    expect(t.actions.some((a) => a.label.startsWith('Para completar'))).toBe(false);
  });
});

describe('conversa generativa (a IA escreve, as regras decidem)', () => {
  const ai = (resposta: string) => fakeLlm((r) => (r.system.includes('Responda SOMENTE com um objeto JSON') ? { intent: 'other', category: null, maxPriceReais: null, skinTypes: [], relative: null, symptom: null, symptomDays: null, wantsPrescriptionDrug: false, emergencySigns: false } : { resposta, frase: 'Separei estas opções de shampoo para você.' }));

  it('"tudo bem?" é respondido pela IA quando a resposta passa na verificação', async () => {
    const s = createChatService({ catalog, llm: ai('Tudo ótimo por aqui, obrigado! Me conte o que você procura.') });
    expect((await say(s, newConversation(), { text: 'tudo bem?' })).text).toBe('Tudo ótimo por aqui, obrigado! Me conte o que você procura.');
  });

  it.each([
    ['preço inventado', 'Temos hidratante por R$ 9,90.'],
    ['promessa de saúde', 'Esse remédio cura sua dor rapidinho.'],
    ['dose', 'Tome um comprimido por dia.'],
    ['número', 'Temos 3 opções incríveis.'],
  ])('resposta da IA reprovada (%s) vira o texto fixo', async (_n, bad) => {
    const s = createChatService({ catalog, llm: ai(bad) });
    expect((await say(s, newConversation(), { text: 'obrigado' })).text).toMatch(/Por nada/);
  });

  it('pedido fora do catálogo: a IA responde com naturalidade e as áreas continuam à mão', async () => {
    const s = createChatService({ catalog, llm: ai('Cadeira de rodas eu não tenho por aqui, mas posso ajudar com cuidados e remédios sem receita.') });
    const t = await say(s, newConversation(), { text: 'quero uma cadeira de rodas' });
    expect(t.kind).toBe('NOT_FOUND');
    expect(t.text).toMatch(/Cadeira de rodas eu não tenho/);
    expect(t.actions.map((a) => a.label)).toContain('Pele e rosto');
  });

  it('a IA não é chamada para o primeiro "oi" (rápido) nem para emergência', async () => {
    const llm = ai('Olá! Em que posso ajudar você hoje?');
    const s = createChatService({ catalog, llm });
    await say(s, newConversation(), { text: 'oi' });
    await say(s, newConversation(), { text: 'estou com dor no peito' });
    expect(llm.calls).toBe(0);
  });

  it('um pedido novo e longo vence os botões de área em aberto (não vira clique em "Cabelo")', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'oi' });
    const t = await say(s, id, { text: 'quero algum creme para cabelo cacheado que seja até no máximo 35 reais' });
    expect(t.text).not.toMatch(/^Cabelo: o que você procura/);
  });

  it('um toque curto no nome da área ainda abre a área', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'oi' });
    expect((await say(s, id, { text: 'cabelo' })).text).toMatch(/^Cabelo: o que você procura/);
  });
});

describe('velocidade e robustez da IA', () => {
  const down = () => fakeLlm(() => { throw new Error('lenta'); });

  it('"produtos de cabelo até 30 reais" é entendido pelas regras e pergunta shampoo ou condicionador', async () => {
    const llm = fakeLlm(() => ({}));
    const s = createChatService({ catalog, llm });
    const t = await say(s, newConversation(), { text: 'Estou procurando por produtos de cabelo até 30 reais' });
    expect(t).toMatchObject({ kind: 'QUESTION', text: expect.stringContaining('shampoo ou condicionador') });
    expect(llm.calls).toBe(0);
  });

  it('escolher shampoo mantém o valor máximo pedido antes', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'produtos de cabelo até 30 reais' });
    const t = await say(s, id, { actionId: 'cat:shampoo' });
    expect(t).toMatchObject({ kind: 'CONFIRM', summary: expect.arrayContaining([{ label: 'Valor máximo', value: expect.stringMatching(/30,00/) }]) });
  });

  it('depois de uma falha da IA, as próximas mensagens não esperam por ela', async () => {
    const llm = down();
    const s = createChatService({ catalog, llm });
    await say(s, newConversation(), { text: 'minha cabeça está explodindo hoje cedo' });
    const afterFail = llm.calls;
    await say(s, newConversation(), { text: 'obrigado' });
    await say(s, newConversation(), { text: 'quero uma cadeira de rodas' });
    expect(llm.calls).toBe(afterFail);
  });
});

describe('insônia e "outro produto"', () => {
  it('insônia oferece fitoterápicos sem receita, com a mesma conversa de segurança', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'to procurando um remédio para dormir, tenho tido insônia' });
    await say(s, id, { text: 'sim' });
    await say(s, id, { text: '35 anos' });
    await say(s, id, { text: 'hoje' });
    const t = await say(s, id, { text: 'nenhuma' });
    expect(t.kind).toBe('OPTIONS');
    for (const m of (await catalog.byIds(productsOf(t).map((p) => p.id))).filter(isMedicine)) expect(m.group).toBe('sono');
  });

  it('quem usa remédio para dormir ou ansiedade não recebe o fitoterápico que interage', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'insônia' });
    await say(s, id, { text: 'sim' });
    await say(s, id, { text: '35' });
    await say(s, id, { text: 'hoje' });
    await say(s, id, { actionIds: ['med:other'] });
    const t = await say(s, id, { actionIds: ['mc:sedative'] });
    expect(t.kind).not.toBe('OPTIONS');
  });

  it('"quero outro produto então" reabre as áreas, sem dizer que não encontrou', async () => {
    const t = await say(service(), newConversation(), { text: 'quero outro produto então' });
    expect(t.kind).toBe('QUESTION');
    expect(t.text).toMatch(/Claro!/);
    expect(t.actions.map((a) => a.label)).toContain('Pele e rosto');
  });
});

describe('relevância na saúde', () => {
  it('para dor de cabeça, as opções citam dor de cabeça antes de dor muscular', async () => {
    const s = service();
    const id = newConversation();
    await say(s, id, { text: 'dor de cabeça' });
    await say(s, id, { text: 'sim' });
    await say(s, id, { text: '30' });
    await say(s, id, { text: 'hoje' });
    const t = await say(s, id, { text: 'nenhuma' });
    const meds = (await catalog.byIds(productsOf(t).map((p) => p.id))).filter(isMedicine);
    expect(meds[0]!.use).toMatch(/dor de cabeça/);
  });
});

