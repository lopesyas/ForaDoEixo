import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CmedPresentation } from './cmed';
import { MEDICINE_TARGETS, SUBSTANCE_RULES, SYMPTOM_GROUPS, curate, isActiveMedicine, parseSubstances, parseTarja, riskFromTarja, ruleFor, toMedicine, type MedicineProduct, type MedicineRow } from './medicines';

const row = (over: Partial<MedicineRow> = {}): MedicineRow => ({
  process: '1',
  seq: '100',
  name: 'TYLENOL',
  company: 'KENVUE LTDA.',
  substances: 'paracetamol',
  category: 'Novo',
  tarja: '1',
  active: 'Ativo',
  authorization: 'REGISTRADO',
  registration: '123',
  ...over,
});

describe('tarja', () => {
  it.each<[string, number[]]>([
    ['1', [1]],
    ['2, 1', [1, 2]],
    ['4, 2, 3', [2, 3, 4]],
    ['', []],
    ['9, x', []],
    ['1, 1', [1]],
  ])('parseTarja(%j) -> %j', (value, expected) => {
    expect(parseTarja(value)).toEqual(expected);
  });

  it.each([
    [[], 'RED'], // sem tarja informada: não tratamos como livre
    [[1], 'YELLOW'],
    [[1, 2], 'RED'], // alguma apresentação exige receita
    [[2], 'RED'],
    [[3], 'RED'],
    [[4], 'RED'],
  ] as const)('riskFromTarja(%j) -> %s', (tarja, expected) => {
    expect(riskFromTarja([...tarja] as never)).toBe(expected);
  });
});

describe('substâncias', () => {
  it('normaliza texto, remove repetição e acento', () => {
    expect(parseSubstances('Dipirona, dipirona monoidratada, Cafeína Anidra, dipirona')).toEqual(['dipirona', 'dipirona monoidratada', 'cafeina anidra']);
    expect(parseSubstances('')).toEqual([]);
  });

  it('reconhece variações da mesma substância', () => {
    expect(ruleFor('dipirona monoidratada')?.canonical).toBe('dipirona');
    expect(ruleFor('dipirona sodica')?.canonical).toBe('dipirona');
    expect(ruleFor('naproxeno sodico')?.canonical).toBe('naproxeno');
    expect(ruleFor('hedera helix l.')).toBeUndefined();
  });

  it('só cura o que conhece por inteiro: uma substância desconhecida derruba o produto inteiro', () => {
    expect(curate(['paracetamol'])).not.toBeNull();
    expect(curate(['paracetamol', 'cloridrato de fenilefrina'])).toBeNull();
    expect(curate([])).toBeNull();
  });

  it('une contraindicações e interações de todas as substâncias', () => {
    const c = curate(['ibuprofeno', 'paracetamol'])!;
    expect(c.avoidIf).toEqual(expect.arrayContaining(['stomach_ulcer', 'hypertension', 'liver_disease']));
    expect(c.interactsWith).toEqual(expect.arrayContaining(['anticoagulant', 'nsaid']));
    expect(c.cautionElderly).toBe(true);
  });

  it('todo sintoma aponta para grupos que existem na tabela', () => {
    const groups = new Set(SUBSTANCE_RULES.map((r) => r.group));
    for (const list of Object.values(SYMPTOM_GROUPS)) for (const g of list) expect(groups.has(g)).toBe(true);
  });
});

const pres = (over: Partial<CmedPresentation> = {}): CmedPresentation => ({ registration9: '123', registration: '1230000000011', ean: '7891000000017', product: 'TYLENOL', presentation: '500 MG COM CT BL X 20', pmcCents: 1290, tarja: 'sem_tarja', ...over });

describe('toMedicine', () => {
  it('Tylenol vira amarelo (sem receita) com a regra do paracetamol, com o preço da CMED', () => {
    const m = toMedicine(row(), [pres()])!;
    expect(m.risk).toBe('YELLOW');
    expect(m.group).toBe('analgesico');
    expect(m.avoidIf).toContain('liver_disease');
    expect(m.name).toBe('Tylenol');
    expect(m.company).toBe('Kenvue');
    expect(m.simulated.priceCents).toBe(1290);
    expect(m.pricing).toMatchObject({ source: 'CMED', presentation: '500 MG COM CT BL X 20', ean: '7891000000017' });
  });

  it.each([
    ['inativo', { active: 'Inativo' }],
    ['só notificado', { authorization: 'NOTIFICADO' }],
    ['tarja 1 com substância que não sabemos conferir', { substances: 'hedera helix l.' }],
    ['sem substâncias', { substances: '' }],
  ])('descarta: %s', (_n, over) => {
    expect(toMedicine(row(over), [pres()])).toBeNull();
  });

  it('sem preço na CMED não entra (o preço mostrado nunca é inventado)', () => {
    expect(toMedicine(row(), [])).toBeNull();
  });

  it('remédio de receita vira vermelho e não recebe regras de recomendação', () => {
    const m = toMedicine(row({ name: 'Amoxicilina', substances: 'amoxicilina tri-hidratada', tarja: '3', category: 'Genérico' }), [pres({ tarja: 'vermelha_restricao' })])!;
    expect(m.risk).toBe('RED');
    expect(m.group).toBeUndefined();
    expect(m.avoidIf).toEqual([]);
  });

  it('DUPLA CHECAGEM: a Anvisa diz "sem receita" mas a CMED discorda -> exige receita', () => {
    expect(toMedicine(row({ tarja: '1' }), [pres({ tarja: 'vermelha' })])!.risk).toBe('RED');
  });

  it('CMED sem tarja informada ("- (*)"): não confirma, exige receita', () => {
    expect(toMedicine(row({ tarja: '1' }), [pres({ tarja: 'desconhecida' })])!.risk).toBe('RED');
  });

  it('se QUALQUER apresentação da CMED exige receita, o produto todo exige', () => {
    expect(toMedicine(row({ tarja: '1' }), [pres(), pres({ tarja: 'vermelha' })])!.risk).toBe('RED');
  });

  it('com tarja vazia o produto é vermelho (conservador)', () => {
    expect(toMedicine(row({ tarja: '' }), [pres()])!.risk).toBe('RED');
  });

  it('apresentação mista (1 e 2) é vermelha: não dá para escolher a apresentação sem receita', () => {
    expect(toMedicine(row({ tarja: '1, 2' }), [pres()])!.risk).toBe('RED');
  });

  it('o preço é o da apresentação mais barata (a lista chega ordenada)', () => {
    expect(toMedicine(row(), [pres({ pmcCents: 800, presentation: 'X 10' }), pres({ pmcCents: 2000, presentation: 'X 40' })])!.pricing.presentation).toBe('X 10');
  });

  it('isActiveMedicine', () => {
    expect(isActiveMedicine({ active: 'Ativo', authorization: 'REGISTRADO' })).toBe(true);
    expect(isActiveMedicine({ active: 'Ativo', authorization: 'NOTIFICADO' })).toBe(false);
  });
});

describe('catálogo gerado (data/medicines.catalog.json)', () => {
  const file = JSON.parse(readFileSync(resolve(__dirname, '../../data/medicines.catalog.json'), 'utf8')) as { note: string; tarjaCodes: string; products: MedicineProduct[] };
  const by = (pred: (p: MedicineProduct) => boolean) => file.products.filter(pred);

  it('declara o que é do cadastro, o que é curadoria e o que é simulado', () => {
    expect(file.note).toMatch(/PROTÓTIPO/);
    expect(file.note).toMatch(/ESTOQUE é SIMULADO/);
    expect(file.note).toMatch(/CMED/);
    expect(file.tarjaCodes).toMatch(/Confirmados/);
  });

  it('tem as quantidades pedidas por grupo', () => {
    for (const g of ['analgesico', 'antiacido', 'antialergico', 'expectorante', 'garganta', 'sono'] as const) {
      expect(by((p) => p.group === g)).toHaveLength(MEDICINE_TARGETS[g]);
    }
    expect(by((p) => p.risk === 'RED')).toHaveLength(MEDICINE_TARGETS.receita);
  });

  it('todo produto sem receita tem tarja exatamente 1 e só substâncias conhecidas', () => {
    for (const p of by((p) => p.risk === 'YELLOW')) {
      expect(p.tarja).toEqual([1]);
      expect(p.group).toBeDefined();
      expect(p.substances.length).toBeGreaterThan(0);
    }
  });

  it('todo produto de receita tem tarja informada e nunca tem regras de recomendação', () => {
    for (const p of by((p) => p.risk === 'RED')) {
      expect(p.tarja.length).toBeGreaterThan(0);
      expect(p.group).toBeUndefined();
    }
  });

  it('nenhuma substância de receita aparece entre as recomendáveis', () => {
    const rx = new Set(by((p) => p.risk === 'RED').flatMap((p) => p.substances));
    for (const p of by((p) => p.risk === 'YELLOW')) for (const s of p.substances) expect(rx.has(s)).toBe(false);
  });

  it('inclui remédios de receita conhecidos para a demonstração do bloqueio', () => {
    const subs = by((p) => p.risk === 'RED').flatMap((p) => p.substances).join(' ');
    expect(subs).toMatch(/amoxicilina/);
    expect(subs).toMatch(/zolpidem/);
  });

  it('todo medicamento tem preço da CMED, com a apresentação e o EAN, e o preço mostrado é o PMC', () => {
    for (const p of file.products) {
      expect(p.pricing.source).toBe('CMED');
      expect(p.pricing.presentation.length).toBeGreaterThan(0);
      expect(p.pricing.ean).toMatch(/^\d{8,14}$/);
      expect(p.pricing.registration13.slice(0, 9)).toBe(p.source.registration);
      expect(p.simulated.priceCents).toBeGreaterThan(0);
    }
  });

  it('nenhum remédio sem receita tem preço de fantasia: o preço termina como na tabela, não em ,90 forçado', () => {
    const endings = new Set(file.products.map((p) => p.simulated.priceCents % 100));
    expect(endings.size).toBeGreaterThan(5);
  });

  it('ids únicos, nomes sem texto corrompido e origem rastreável', () => {
    expect(new Set(file.products.map((p) => p.id)).size).toBe(file.products.length);
    for (const p of file.products) {
      expect(JSON.stringify(p)).not.toContain('�');
      expect(p.source.dataset).toBe('ANVISA TA_CONSULTA_MEDICAMENTOS');
      expect(p.source.registration).toMatch(/^\d+$/);
    }
  });
});
