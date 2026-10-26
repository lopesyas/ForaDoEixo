import { UiTurn } from '@ia/shared';
import { describe, expect, it } from 'vitest';
import { createJsonCatalog } from '../adapters/catalog/jsonCatalog';
import { evaluate, type AgeRange, type Condition } from '../domain/safety';
import { isMedicine } from '../ports/catalog';
import { createChatService } from './chat';

/** Varredura exaustiva da conversa de saúde: toda combinação de idade, tempo, condições e sintoma. */
const catalog = createJsonCatalog();
const AGES: AgeRange[] = ['under12', '12-17', '18-49', '50-64', '65plus'];
const DAYS = [0, 1, 2, 3];
const CONDS: [string, Condition][] = [['cond:pressure', 'hypertension'], ['cond:ulcer', 'stomach_ulcer'], ['cond:kidney', 'kidney_disease'], ['cond:liver', 'liver_disease'], ['cond:asthma', 'asthma'], ['cond:pregnant', 'pregnancy']];
const SYMPTOMS = ['dor de cabeça', 'febre', 'azia', 'alergia', 'tosse', 'dor de garganta', 'insônia'];
let n = 0;

describe('saúde: todas as combinações', () => {
  it('nenhum produto mostrado contradiz a camada de segurança (independente do fluxo)', async () => {
    let conversations = 0;
    let shown = 0;
    let escalated = 0;
    for (const symptom of SYMPTOMS) {
      for (const age of AGES) {
        for (const days of DAYS) {
          for (let mask = 0; mask < 1 << CONDS.length; mask++) {
            const chosen = CONDS.filter((_, i) => mask & (1 << i));
            const s = createChatService({ catalog });
            const id = `mx-${String(++n).padStart(9, '0')}`;
            const ask = (i: object) => s.handle({ conversationId: id, ...i });
            await ask({ text: `estou com ${symptom}` });
            await ask({ actionId: 'confirm' });
            await ask({ actionId: `age:${age}` });
            await ask({ actionId: `days:${days}` });
            const t = await ask({ actionIds: chosen.length ? chosen.map(([k]) => k) : ['none'] });
            conversations++;
            expect(UiTurn.safeParse(t).success).toBe(true);

            const profile = { ageRange: age, conditions: chosen.map(([, c]) => c), allergies: [], medClasses: [] };
            if (t.kind === 'OPTIONS') {
              for (const p of (await catalog.byIds(t.products.map((x) => x.id))).filter(isMedicine)) {
                shown++;
                const r = evaluate({ id: p.id, name: p.name, risk: p.risk, ingredients: p.substances, avoidIf: p.avoidIf, interactsWith: p.interactsWith, cautionElderly: p.cautionElderly }, profile, { symptomDays: days });
                expect(r.verdict, `${symptom} ${age} ${days}d [${chosen.map(([k]) => k)}] mostrou ${p.name}`).toBe('ALLOW');
                expect(p.tarja).toEqual([1]);
              }
              // Regras de ouro, ditas de forma independente do motor:
              expect(profile.conditions.includes('pregnancy'), `grávida recebeu opções (${symptom})`).toBe(false);
              expect(age, `criança pequena recebeu opções (${symptom})`).not.toBe('under12');
              expect(days, `sintoma de 3+ dias recebeu opções (${symptom})`).toBeLessThan(3);
              if (profile.conditions.length > 0) expect(days, `condição de risco com ${days} dias recebeu opções`).toBeLessThanOrEqual(1);
            } else {
              escalated++;
              expect(['SAFETY_NOTICE', 'UNCONFIRMED']).toContain(t.kind);
              expect(JSON.stringify(t)).not.toMatch(/priceCents/);
              expect(t.actions.length).toBeGreaterThan(0);
            }
          }
        }
      }
    }
    expect(conversations).toBe(SYMPTOMS.length * AGES.length * DAYS.length * (1 << CONDS.length));
    expect(shown).toBeGreaterThan(100); // o teste não é vazio: há combinações que liberam produto
    expect(escalated).toBeGreaterThan(100); // e combinações que encaminham
  }, 120_000);

  it('alergia e remédio em uso: toda combinação respeita as respostas', async () => {
    const ALLERGIES = ['dipirona', 'paracetamol', 'ibuprofeno', 'naproxeno', 'ácido acetilsalicílico'];
    const CLASSES = ['anticoagulant', 'antihypertensive', 'sedative', 'nsaid', 'antidepressant', 'diabetes_med'];
    for (let a = 0; a < 1 << 3; a++) {
      for (let c = 0; c < 1 << 3; c++) {
        const allergies = ALLERGIES.filter((_, i) => a & (1 << i));
        const classes = CLASSES.filter((_, i) => c & (1 << i));
        const s = createChatService({ catalog });
        const id = `mx-${String(++n).padStart(9, '0')}`;
        const ask = (i: object) => s.handle({ conversationId: id, ...i });
        await ask({ text: 'dor de cabeça' });
        await ask({ actionId: 'confirm' });
        await ask({ actionId: 'age:18-49' });
        await ask({ actionId: 'days:1' });
        const first = [...(allergies.length ? ['allergy'] : []), ...(classes.length ? ['med:other'] : [])];
        let t = await ask({ actionIds: first.length ? first : ['none'] });
        if (classes.length) t = await ask({ actionIds: classes.map((k) => `mc:${k}`) });
        if (allergies.length) t = await ask({ actionIds: allergies.map((k) => `alg:${k}`) });
        if (t.kind !== 'OPTIONS') continue;
        for (const p of (await catalog.byIds(t.products.map((x) => x.id))).filter(isMedicine)) {
          for (const al of allergies) expect(p.substances, `alergia a ${al}`).not.toContain(al);
          for (const k of classes) expect(p.interactsWith, `uso de ${k}`).not.toContain(k);
        }
      }
    }
  });
});
