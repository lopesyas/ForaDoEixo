import { describe, expect, it } from 'vitest';
import { antibiotic, healthyAdult, moisturizer, painA, painB } from './fixtures';
import { evaluate } from './evaluate';
import { emergencyNotice, noticeForResult, noSafeOptionNotice, MESSAGES_REVIEW_STATUS } from './messages';

const father = { who: 'seu pai', de: 'do seu pai' };

describe('textos de segurança', () => {
  it('produto liberado ou dependente de perguntas não gera aviso', () => {
    expect(noticeForResult(evaluate(moisturizer, {}), father)).toBeNull();
    expect(noticeForResult(evaluate(painA, {}), father)).toBeNull();
  });

  it('receita: nível vermelho, sem sugerir produto', () => {
    const n = noticeForResult(evaluate(antibiotic, healthyAdult), father)!;
    expect(n.level).toBe('red');
    expect(n.text).toMatch(/receita/);
  });

  it('persistência: nível amarelo, encaminha ao farmacêutico', () => {
    const n = noticeForResult(evaluate(painA, healthyAdult, { symptomDays: 4 }), father)!;
    expect(n.level).toBe('yellow');
    expect(n.text).toMatch(/farmacêutico/);
  });

  it('o texto usa a pessoa certa (pai/mãe) quando há motivo específico', () => {
    const mother = { who: 'sua mãe', de: 'da sua mãe' };
    const n = noticeForResult(evaluate(painB, { ...healthyAdult, ageRange: '65plus' }), mother)!;
    expect(n.text).toContain('sua mãe');
  });

  it('emergência: sempre nível de alerta, médica ou de saúde mental', () => {
    expect(emergencyNotice('medical')).toMatchObject({ level: 'alert' });
    expect(emergencyNotice('medical').text).toContain('192');
    expect(emergencyNotice('mental_health').text).toContain('188');
  });

  it('nenhum aviso de segurança menciona preço, carrinho ou compra imediata', () => {
    const all = [
      emergencyNotice('medical'),
      emergencyNotice('mental_health'),
      noSafeOptionNotice(),
      noticeForResult(evaluate(antibiotic, healthyAdult))!,
      noticeForResult(evaluate(painA, healthyAdult, { symptomDays: 5 }))!,
    ];
    for (const n of all) expect(`${n.text} ${n.why}`).not.toMatch(/R\$|carrinho|compre agora|adicione/i);
  });

  it('os textos estão marcados como pendentes de revisão farmacêutica e jurídica', () => {
    expect(MESSAGES_REVIEW_STATUS).toBe('pending-pharmacist-and-legal-review');
  });
});
