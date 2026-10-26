import { describe, expect, it } from 'vitest';
import { fold } from '../../catalog/cosmetics';
import { extract, maxPriceFrom, relativeFrom } from './extract';

describe('extract: categoria', () => {
  it.each([
    ['Quero um hidratante para o rosto até R$ 20', 'hidratante_facial'],
    ['hidratante facial', 'hidratante_facial'],
    ['Hidratante para o corpo', 'hidratante_corporal'],
    ['preciso de hidratante', 'hidratante'],
    ['protetor solar fps 50', 'protetor_solar'],
    ['filtro solar para criança', 'protetor_solar'],
    ['shampoo', 'shampoo'],
    ['Condicionador para cabelo seco', 'condicionador'],
    ['sabonete líquido', 'sabonete'],
    ['pasta de dente', 'creme_dental'],
    ['repelente', 'repelente'],
    ['protetor labial', 'protetor_labial'],
  ])('%s -> %s', (text, category) => {
    expect(extract(text).category).toBe(category);
  });

  it('pedido fora do catálogo não inventa categoria', () => {
    expect(extract('quero uma cadeira de rodas').category).toBeUndefined();
  });
});

describe('extract: preço máximo', () => {
  it.each([
    ['até R$ 20', 2000],
    ['até 20 reais', 2000],
    ['no máximo R$ 15,50', 1550],
    ['menos de 30', 3000],
    ['custando R$ 12', 1200],
    ['sem limite de preço', undefined],
  ])('%s -> %s', (text, cents) => {
    expect(maxPriceFrom(fold(text).toLowerCase())).toBe(cents);
  });
});

describe('extract: pessoa e saúde', () => {
  it('"não é para o meu pai, é para a minha mãe": vale a última pessoa citada', () => {
    expect(relativeFrom('nao e para o meu pai, e para a minha mae')).toBe('mae');
    expect(relativeFrom('para o meu pai')).toBe('pai');
    expect(relativeFrom('para mim')).toBeNull();
  });

  it('dor de cabeça vira saúde, com a pessoa e os dias', () => {
    const e = extract('Remédio para dor de cabeça para meu pai há 2 dias');
    expect(e.health?.label).toBe('dor de cabeça');
    expect(e.relative).toBe('pai');
    expect(e.symptomDays).toBe(2);
  });

  it('pedido de cosmético não vira saúde', () => {
    expect(extract('repelente para dor de cabeça').health).toBeNull();
  });

  it('remédio de receita é reconhecido', () => {
    expect(extract('quero amoxicilina').rx).toBe(true);
    expect(extract('antibiótico').rx).toBe(true);
    expect(extract('hidratante').rx).toBe(false);
  });

  it('reconhece "repetir minha última compra"', () => {
    expect(extract('Repetir minha última compra').wantsReorder).toBe(true);
  });

  it('tipo de pele só quando citado', () => {
    expect(extract('hidratante para pele seca').skin).toEqual(['seca']);
    expect(extract('hidratante facial').skin).toEqual([]);
  });
});
