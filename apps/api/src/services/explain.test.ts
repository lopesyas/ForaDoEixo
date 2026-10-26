import { describe, expect, it } from 'vitest';
import { fakeLlm } from '../testing';
import { explain, verifyExplanation, type ExplainFacts } from './explain';

const cosmetic: ExplainFacts = {
  kind: 'cosmetico',
  pedido: 'hidratante para o rosto, pele seca, até R$ 20,00',
  produtos: [
    { nome: 'Hidratante Facial Pele Seca Nomma', preco: 'R$ 12,90', detalhe: 'Indicado para pele seca.' },
    { nome: 'Creme Facial Vigora Derm', preco: 'R$ 13,90' },
  ],
};
const medicine: ExplainFacts = { kind: 'medicamento', pedido: 'dor de cabeça', produtos: [{ nome: 'Tylenol', preco: 'R$ 8,90' }] };

describe('verifyExplanation: a IA não coloca informação nova na tela', () => {
  it('aceita frase que só usa os dados fornecidos', () => {
    expect(verifyExplanation('Separei 2 opções para pele seca: uma por R$ 12,90 e outra por R$ 13,90.', cosmetic)).toBe(true);
  });

  it.each([
    ['preço inventado', 'Achei uma por R$ 9,90.'],
    ['quantidade inventada', 'Separei 5 opções para você.'],
    ['link', 'Veja mais em https://exemplo.com'],
    ['tamanho', 'a'.repeat(300)],
  ])('rejeita: %s', (_n, sentence) => {
    expect(verifyExplanation(sentence, cosmetic)).toBe(false);
  });

  it.each([
    'É o melhor remédio para dor de cabeça.',
    'Alivia a dor rapidamente.',
    'Tome um comprimido a cada 6 horas.',
    'Uma opção segura e sem risco.',
    'Eu indico este produto.',
    'Contém 500 mg.',
  ])('rejeita para medicamento: %s', (sentence) => {
    expect(verifyExplanation(sentence, medicine)).toBe(false);
  });

  it('aceita frase neutra para medicamento', () => {
    expect(verifyExplanation('Separei 1 opção sem receita, a Tylenol por R$ 8,90. Leia a bula antes de usar.', medicine)).toBe(true);
  });
});

describe('explain', () => {
  it('devolve a frase quando verificada', async () => {
    const llm = fakeLlm(() => ({ frase: 'Separei 2 opções para pele seca, a partir de R$ 12,90.' }));
    expect(await explain(cosmetic, llm)).toContain('R$ 12,90');
  });

  it('devolve null (usa texto fixo) quando a frase não passa na verificação', async () => {
    expect(await explain(cosmetic, fakeLlm(() => ({ frase: 'Achei uma por apenas R$ 3,90, imperdível!' })))).toBeNull();
  });

  it('devolve null quando a IA falha ou está desligada', async () => {
    expect(
      await explain(
        cosmetic,
        fakeLlm(() => {
          throw new Error('x');
        }),
      ),
    ).toBeNull();
    const off = { enabled: false, label: 'off', json: async () => ({ frase: 'x' }) } as never;
    expect(await explain(cosmetic, off)).toBeNull();
  });

  it('sem produtos não chama a IA', async () => {
    const llm = fakeLlm(() => ({ frase: 'Nenhuma opção encontrada aqui.' }));
    await explain({ ...cosmetic, produtos: [] }, llm);
    expect(llm.calls).toBe(0);
  });
});
