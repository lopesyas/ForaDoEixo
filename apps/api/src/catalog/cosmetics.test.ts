import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TARGETS,
  classify,
  companyShort,
  fold,
  isActive,
  parseBrDate,
  pickSample,
  simulate,
  skinTypesFromName,
  spfFromName,
  titleCase,
  toProduct,
  type CosmeticCategory,
  type CosmeticProduct,
} from './cosmetics';

const TODAY = new Date('2026-10-24T00:00:00Z');

describe('classify: categoria pelo nome', () => {
  it.each<[string, CosmeticCategory | null]>([
    ['HIDRATANTE FACIAL PELE SECA MOAI', 'hidratante_facial'],
    ['Inoar Hidratante Rosto Pele Mista a Oleosa', 'hidratante_facial'],
    ['HIDRATANTE FACIAL FPS 15 REVITART', 'hidratante_facial'],
    ['CREME HIDRATANTE CORPORAL PELE SECA', 'hidratante_corporal'],
    ['PROTETOR SOLAR FACIAL FPS 50', 'protetor_solar'],
    ['FILTRO SOLAR OIL FREE', 'protetor_solar'],
    ['SHAMPOO DETOX', 'shampoo'],
    ['CONDICIONADOR OIL FREE', 'condicionador'],
    ['SABONETE EM BARRA', 'sabonete'],
    ['DESODORANTE ROLL-ON', 'desodorante'],
    ['GEL DENTAL CONDOR KIDS', 'creme_dental'],
    ['REPELENTE DE INSETOS', 'repelente'],
    ['PROTETOR LABIAL FPS 15', 'protetor_labial'],
    ['KIT HIDRATANTE FACIAL', null],
    ['ESMALTE VERMELHO', 'esmalte'],
    ['GEL ANTISSÉPTICO PARA MÃOS', 'antisseptico'],
    ['BATOM MATTE ROSA', 'batom'],
    ['PERFUME FEMININO FLORAL', 'perfume'],
    ['TINTA PARA CABELO LOURO', null],
  ])('%s -> %s', (name, expected) => {
    expect(classify(name)).toBe(expected);
  });
});

describe('skinTypesFromName: só o que o nome afirma', () => {
  it.each<[string, CosmeticCategory, string[]]>([
    ['Hidratante Facial Pele Seca', 'hidratante_facial', ['seca']],
    ['Hidratante Facial Pele Normal a Seca', 'hidratante_facial', ['normal', 'seca']],
    ['Gel Facial Hidratante Pele Mista a Oleosa', 'hidratante_facial', ['mista', 'oleosa']],
    ['Protetor Solar Facial Pele Mista ou Seca', 'protetor_solar', ['mista', 'seca']],
    ['Creme de Aveia Hidratante Facial Pele Extra Seca', 'hidratante_facial', ['seca']],
    ['Hidratante Facial para Peles Sensíveis', 'hidratante_facial', ['sensivel']],
    ['Hidratante Facial Pele Delicada', 'hidratante_facial', ['sensivel']],
    ['Locao Hidratante Facial Oil Free', 'hidratante_facial', ['oleosa']],
    ['Hidratante Facial Diário', 'hidratante_facial', []],
    // "Delicada" solto não é tipo de pele:
    ['Desodorante Colônia Delicada', 'desodorante', []],
    ['Shampoo Limpeza Delicada', 'shampoo', []],
    ['Shampoo Mana Indelicada', 'shampoo', []],
    // Fora de produtos de cuidado com a pele, não se infere nada:
    ['Condicionador Oil Free', 'condicionador', []],
  ])('%s', (name, category, expected) => {
    expect(skinTypesFromName(name, category).sort()).toEqual([...expected].sort());
  });
});

describe('isActive: situação e vencimento', () => {
  it.each<[string, { situation: string; expiresOn: string }, boolean]>([
    ['ativo, vence no futuro', { situation: 'S', expiresOn: '24/06/2030 00:00:00' }, true],
    ['ativo, sem data de vencimento', { situation: 'S', expiresOn: '' }, true],
    ['ativo, mas vencido', { situation: 'S', expiresOn: '13/04/2015 00:00:00' }, false],
    ['inativo, vence no futuro', { situation: 'N', expiresOn: '24/06/2030 00:00:00' }, false],
    ['ativo com data ilegível', { situation: 'S', expiresOn: 'lixo' }, false],
  ])('%s', (_n, row, expected) => {
    expect(isActive(row, TODAY)).toBe(expected);
  });

  it('lê datas no formato brasileiro', () => {
    expect(parseBrDate('25/12/2030 00:00:00')?.toISOString().slice(0, 10)).toBe('2030-12-25');
    expect(parseBrDate('')).toBeNull();
  });
});

describe('texto', () => {
  it('fold remove acento e padroniza', () => {
    expect(fold('  Hidratação   Facial ')).toBe('HIDRATACAO FACIAL');
  });

  it('titleCase mantém siglas e remove símbolo solto no começo', () => {
    expect(titleCase('PROTETOR SOLAR FPS 50 UVA')).toBe('Protetor Solar FPS 50 UVA');
    expect(titleCase('¿SABONETE FACIAL PARA PELES')).toBe('Sabonete Facial para Peles');
    expect(titleCase("LOCAO HIDRATANTE 'OIL FREE' AZUL")).toBe("Locao Hidratante 'Oil Free' Azul");
  });

  it('companyShort tira o ruído societário', () => {
    expect(companyShort('INDUSTRIA E COMERCIO DE COSMETICOS NATURA LTDA')).toBe('Natura');
    expect(companyShort('GALDERMA BRASIL LTDA')).toBe('Galderma');
  });

  it('spfFromName lê o fator de proteção', () => {
    expect(spfFromName('Hidratante Facial FPS 30')).toBe(30);
    expect(spfFromName('Hidratante Facial')).toBeUndefined();
  });
});

describe('simulate: dados inventados, mas estáveis e plausíveis', () => {
  const categories = Object.keys(TARGETS) as CosmeticCategory[];

  it('é determinístico', () => {
    expect(simulate('shampoo', '123')).toEqual(simulate('shampoo', '123'));
  });

  it('preço dentro da faixa da categoria e sempre terminando em ,90', () => {
    for (const c of categories) {
      for (let i = 0; i < 200; i++) {
        const { priceCents } = simulate(c, `seed-${i}`);
        expect(priceCents % 100).toBe(90);
        expect(priceCents).toBeGreaterThan(0);
      }
    }
  });

  it('há produtos baratos suficientes para testar um orçamento de R$ 20', () => {
    const cheap = Array.from({ length: 200 }, (_, i) => simulate('hidratante_facial', `p-${i}`)).filter((s) => s.priceCents <= 2000);
    expect(cheap.length).toBeGreaterThan(30);
  });
});

describe('pickSample', () => {
  const make = (id: string, name: string, company: string, skin: boolean): CosmeticProduct =>
    toProduct({ process: id, name, company, expiresOn: '', situation: 'S', registration: id }, 'hidratante_facial') && {
      ...toProduct({ process: id, name, company, expiresOn: '', situation: 'S', registration: id }, 'hidratante_facial'),
      skinTypes: skin ? ['seca'] : [],
    };

  it('no máximo 2 por empresa e sem nomes repetidos', () => {
    const list = [
      make('1', 'A Hidratante Facial', 'EmpA', true),
      make('2', 'B Hidratante Facial', 'EmpA', true),
      make('3', 'C Hidratante Facial', 'EmpA', true),
      make('4', 'B Hidratante Facial', 'EmpB', true),
      make('5', 'D Hidratante Facial', 'EmpB', false),
    ];
    const out = pickSample(list, 10);
    expect(out.filter((p) => p.company === 'EmpA').length).toBeLessThanOrEqual(2);
    expect(new Set(out.map((p) => fold(p.name))).size).toBe(out.length);
  });

  it('prioriza quem cita o tipo de pele', () => {
    const list = [make('1', 'Sem Tipo Um', 'E1', false), make('2', 'Com Tipo Dois', 'E2', true)];
    expect(pickSample(list, 1)[0]!.name).toBe('Com Tipo Dois');
  });
});

describe('catálogo gerado (data/cosmetics.catalog.json)', () => {
  const file = JSON.parse(readFileSync(resolve(__dirname, '../../data/cosmetics.catalog.json'), 'utf8')) as {
    note: string;
    products: CosmeticProduct[];
  };

  it('declara que preço, quantidade e estoque são simulados', () => {
    expect(file.note).toMatch(/SIMULADOS/);
  });

  it('cobre todas as categorias nas quantidades pedidas', () => {
    for (const c of Object.keys(TARGETS) as CosmeticCategory[]) {
      expect(file.products.filter((p) => p.category === c).length).toBe(TARGETS[c]);
    }
  });

  it('todo produto é verde (cosmético), tem origem rastreável e não tem texto corrompido', () => {
    for (const p of file.products) {
      expect(p.risk).toBe('GREEN');
      expect(p.source.process).toMatch(/^\d+$/);
      expect(p.name).not.toContain('�');
      expect(p.company).not.toContain('�');
    }
  });

  it('ids são únicos', () => {
    expect(new Set(file.products.map((p) => p.id)).size).toBe(file.products.length);
  });

  it('há produtos reais para cada tipo de pele usado na demonstração', () => {
    const facial = file.products.filter((p) => p.category === 'hidratante_facial');
    for (const type of ['seca', 'oleosa', 'mista', 'sensivel'] as const) {
      expect(facial.some((p) => p.skinTypes.includes(type))).toBe(true);
    }
  });

  it('há ao menos um hidratante facial até R$ 20 em estoque (o exemplo da Home funciona)', () => {
    const ok = file.products.filter((p) => p.category === 'hidratante_facial' && p.simulated.priceCents <= 2000 && p.simulated.inStock);
    expect(ok.length).toBeGreaterThan(0);
  });
});
