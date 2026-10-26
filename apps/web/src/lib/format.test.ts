import { describe, expect, it } from 'vitest';
import { formatBRL, keepUnits } from './format';

describe('formatBRL', () => {
  it('formata centavos como reais', () => {
    expect(formatBRL(1890).replace(/\s/g, ' ')).toBe('R$ 18,90');
  });

  it('keepUnits junta número e unidade com espaço sem quebra', () => {
    expect(keepUnits('Creme Facial Suave Dia 100 g')).toBe('Creme Facial Suave Dia 100\u00A0g');
    expect(keepUnits('Dia 100 gramas')).toBe('Dia 100 gramas');
  });
});
