import { describe, expect, it } from 'vitest';
import { antibiotic, healthyAdult, moisturizer, painA, painB } from './fixtures';
import { evaluate, screen } from './evaluate';
import type { SafetyContext, SafetyProduct, SafetyProfile, Verdict } from './types';

type Row = [name: string, product: SafetyProduct, profile: SafetyProfile, ctx: SafetyContext, expected: Verdict];

/** Cada linha é um caso de segurança. Caso novo = linha nova. Esta tabela precisa passar sempre. */
const TABLE: Row[] = [
  // Verde
  ['verde: hidratante, perfil vazio', moisturizer, {}, {}, 'ALLOW'],
  ['verde: hidratante para idoso', moisturizer, { ageRange: '65plus' }, {}, 'ALLOW'],
  ['verde: alergia a um ingrediente do produto bloqueia', moisturizer, { allergies: ['glicerina'] }, {}, 'BLOCK'],

  // Receita
  ['vermelho: antibiótico nunca é liberado', antibiotic, healthyAdult, {}, 'BLOCK'],
  ['vermelho: antibiótico com perfil vazio', antibiotic, {}, {}, 'BLOCK'],

  // Amarelo: faltam perguntas
  ['amarelo: sem nenhuma resposta pede informação', painA, {}, {}, 'CONDITION'],
  ['amarelo: falta só a idade', painA, { conditions: [], allergies: [], medClasses: [] }, {}, 'CONDITION'],
  ['amarelo: falta só a alergia', painA, { ageRange: '18-49', conditions: [], medClasses: [] }, {}, 'CONDITION'],

  // Amarelo: tudo respondido e nada de risco
  ['amarelo: adulto saudável, sem sintoma prolongado', painA, healthyAdult, { symptomDays: 1 }, 'ALLOW'],
  ['amarelo: adulto saudável, sem informar dias', painA, healthyAdult, {}, 'ALLOW'],

  // Contraindicação
  ['analgésico B com pressão alta bloqueia', painB, { ...healthyAdult, conditions: ['hypertension'] }, {}, 'BLOCK'],
  ['analgésico B com úlcera bloqueia', painB, { ...healthyAdult, conditions: ['stomach_ulcer'] }, {}, 'BLOCK'],
  ['analgésico A com doença no fígado bloqueia', painA, { ...healthyAdult, conditions: ['liver_disease'] }, {}, 'BLOCK'],
  ['analgésico A com pressão alta não é barrado por contraindicação', painA, { ...healthyAdult, conditions: ['hypertension'] }, {}, 'ALLOW'],

  // Alergia
  ['alergia ao ingrediente bloqueia', painA, { ...healthyAdult, allergies: ['paracetamol'] }, {}, 'BLOCK'],
  ['alergia a outro ingrediente não bloqueia', painA, { ...healthyAdult, allergies: ['ibuprofeno'] }, {}, 'ALLOW'],

  // Interação
  ['interação com anticoagulante bloqueia', painA, { ...healthyAdult, medClasses: ['anticoagulant'] }, {}, 'BLOCK'],
  ['interação com outro anti-inflamatório bloqueia o B', painB, { ...healthyAdult, medClasses: ['nsaid'] }, {}, 'BLOCK'],
  ['remédio de pressão não interage com o A', painA, { ...healthyAdult, medClasses: ['antihypertensive'] }, {}, 'ALLOW'],

  // Grupos de risco: vão ao farmacêutico
  ['gravidez + amarelo vai ao farmacêutico', painA, { ...healthyAdult, conditions: ['pregnancy'] }, {}, 'ESCALATE'],
  ['gravidez + verde não escala', moisturizer, { ...healthyAdult, conditions: ['pregnancy'] }, {}, 'ALLOW'],
  ['criança pequena + amarelo vai ao farmacêutico', painA, { ...healthyAdult, ageRange: 'under12' }, {}, 'ESCALATE'],
  ['criança pequena + verde não escala', moisturizer, { ageRange: 'under12' }, {}, 'ALLOW'],
  ['idoso + produto com cautela vai ao farmacêutico', painB, { ...healthyAdult, ageRange: '65plus' }, {}, 'ESCALATE'],
  ['idoso + produto sem cautela especial', painA, { ...healthyAdult, ageRange: '65plus' }, {}, 'ALLOW'],

  // Persistência do sintoma
  ['sintoma há 3 dias, pessoa saudável: escala', painA, healthyAdult, { symptomDays: 3 }, 'ESCALATE'],
  ['sintoma há 2 dias, pessoa saudável: ainda libera', painA, healthyAdult, { symptomDays: 2 }, 'ALLOW'],
  ['sintoma há 2 dias com condição de risco: escala', painA, { ...healthyAdult, conditions: ['hypertension'] }, { symptomDays: 2 }, 'ESCALATE'],
  ['sintoma há 1 dia com condição de risco: libera', painA, { ...healthyAdult, conditions: ['hypertension'] }, { symptomDays: 1 }, 'ALLOW'],
  ['persistência não vale para produto verde', moisturizer, { conditions: ['hypertension'] }, { symptomDays: 10 }, 'ALLOW'],

  // Combinações: vale sempre o mais grave
  ['contraindicação + persistência: escala (o mais grave)', painB, { ...healthyAdult, conditions: ['hypertension'] }, { symptomDays: 2 }, 'ESCALATE'],
  ['receita + gravidez: escala (o mais grave)', antibiotic, { ...healthyAdult, conditions: ['pregnancy'] }, {}, 'BLOCK'],
];

describe('evaluate: tabela de casos de segurança', () => {
  it.each(TABLE)('%s', (_name, product, profile, ctx, expected) => {
    expect(evaluate(product, profile, ctx).verdict).toBe(expected);
  });
});

describe('evaluate: propriedades que nunca podem quebrar', () => {
  const profiles: SafetyProfile[] = [
    {},
    healthyAdult,
    { ...healthyAdult, conditions: ['hypertension'] },
    { ...healthyAdult, conditions: ['pregnancy'] },
    { ...healthyAdult, allergies: ['paracetamol', 'ibuprofeno'] },
    { ...healthyAdult, medClasses: ['anticoagulant'] },
    { ...healthyAdult, ageRange: 'under12' },
    { ...healthyAdult, ageRange: '65plus' },
  ];
  const products = [moisturizer, painA, painB, antibiotic];
  const contexts: SafetyContext[] = [{}, { symptomDays: 1 }, { symptomDays: 2 }, { symptomDays: 5 }];

  const grid = products.flatMap((p) => profiles.flatMap((pr) => contexts.map((c) => [p, pr, c] as const)));

  it('produto de receita nunca é liberado, em nenhuma combinação', () => {
    for (const [p, pr, c] of grid.filter(([p]) => p.risk === 'RED')) {
      expect(evaluate(p, pr, c).verdict).not.toBe('ALLOW');
      expect(evaluate(p, pr, c).verdict).not.toBe('CONDITION');
    }
  });

  it('quando algum motivo restritivo aparece, o veredito nunca é ALLOW', () => {
    for (const [p, pr, c] of grid) {
      const r = evaluate(p, pr, c);
      const restrictive = r.reasons.some((x) => x !== 'MISSING_INFO');
      if (restrictive) expect(['BLOCK', 'ESCALATE']).toContain(r.verdict);
    }
  });

  it('toda decisão deixa pelo menos uma regra registrada para auditoria', () => {
    for (const [p, pr, c] of grid) expect(evaluate(p, pr, c).ruleIds.length).toBeGreaterThan(0);
  });

  it('é determinística: mesma entrada, mesma saída', () => {
    for (const [p, pr, c] of grid) expect(evaluate(p, pr, c)).toEqual(evaluate(p, pr, c));
  });

  it('só pede informação (missingInfo) quando o veredito é CONDITION', () => {
    for (const [p, pr, c] of grid) {
      const r = evaluate(p, pr, c);
      if (r.verdict !== 'CONDITION') expect(r.missingInfo).toEqual([]);
      else expect(r.missingInfo.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluate: detalhes', () => {
  it('lista exatamente o que falta perguntar', () => {
    const r = evaluate(painA, { ageRange: '18-49' }, {});
    expect(r.missingInfo.sort()).toEqual(['allergies', 'conditions', 'medClasses']);
  });

  it('"nenhuma alergia" ([]) é diferente de "não perguntei" (undefined)', () => {
    expect(evaluate(painA, { ...healthyAdult, allergies: [] }, {}).verdict).toBe('ALLOW');
    expect(evaluate(painA, { ...healthyAdult, allergies: undefined }, {}).verdict).toBe('CONDITION');
  });

  it('registra todas as regras que dispararam, não só a mais grave', () => {
    const r = evaluate(painB, { ...healthyAdult, conditions: ['hypertension'], medClasses: ['anticoagulant'] }, {});
    expect(r.ruleIds).toEqual(expect.arrayContaining(['R-CON-001', 'R-INT-001']));
    expect(r.reasons).toEqual(expect.arrayContaining(['CONTRAINDICATION', 'INTERACTION']));
  });
});

describe('screen: separa candidatos', () => {
  it('libera, pede informação ou barra, sem misturar', () => {
    const out = screen([moisturizer, painA, antibiotic], {});
    expect(out.allowed.map((e) => e.product.id)).toEqual(['hidratante']);
    expect(out.needsInfo.map((e) => e.product.id)).toEqual(['analgesico-a']);
    expect(out.blocked.map((e) => e.product.id)).toEqual(['antibiotico']);
  });
});
