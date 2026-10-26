import { describe, expect, it } from 'vitest';
import { triage } from './emergency';

describe('triagem de emergência', () => {
  it.each([
    'estou com dor no peito',
    'Meu pai está com DOR NO PEITO e suando',
    'sinto falta de ar',
    'ela desmaiou agora',
    'ele teve uma convulsão',
    'a fala dele está enrolada e o rosto torto',
    'está com sangramento intenso',
    'acho que tomou remédio demais',
    'minha garganta está fechando',
    'meu pai está sem força de um lado do corpo',
    'ela está com fraqueza no braço esquerdo',
    'dormência em um lado do rosto',
    'a boca está caída',
    'ele não consegue falar direito',
    'perdeu a fala de repente',
    'ela não responde',
    'engasgou com a comida',
    'bebeu produto de limpeza',
    'é a pior dor de cabeça da minha vida',
    'dor de cabeça muito forte de repente',
  ])('detecta emergência médica: "%s"', (text) => {
    const r = triage(text);
    expect(r.triggered).toBe(true);
    expect(r.kind).toBe('medical');
  });

  it.each(['quero morrer', 'Estou pensando em me matar', 'tenho ideias suicidas'])('detecta saúde mental: "%s"', (text) => {
    const r = triage(text);
    expect(r.triggered).toBe(true);
    expect(r.kind).toBe('mental_health');
  });

  it('saúde mental tem prioridade quando há os dois tipos de sinal', () => {
    expect(triage('tenho dor no peito e quero morrer').kind).toBe('mental_health');
  });

  it.each(['quero um hidratante até R$ 20', 'meu pai está com dor de cabeça', 'preciso de protetor solar', 'repetir minha última compra', 'meu pai tem dor de cabeça há 2 dias', 'estou sem força de vontade', 'hidratante para o braço', ''])(
    'não dispara em pedidos comuns: "%s"',
    (text) => {
      expect(triage(text).triggered).toBe(false);
    },
  );

  it('ignora acentos e maiúsculas', () => {
    expect(triage('DIFICULDADE PARA RESPIRAR').triggered).toBe(true);
    expect(triage('dificuldade pra respirar').triggered).toBe(true);
  });
});
