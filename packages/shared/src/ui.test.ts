import { describe, expect, it } from 'vitest';
import { UiTurn } from './index';

describe('contrato de interface', () => {
  it('aceita uma pergunta com respostas em botões', () => {
    const turn = UiTurn.parse({
      kind: 'QUESTION',
      text: 'Para escolher melhor, sua pele é:',
      actions: [{ id: 'skin:dry', label: 'Seca' }],
    });
    expect(turn.kind).toBe('QUESTION');
  });

  it('rejeita um tipo de turno desconhecido', () => {
    expect(UiTurn.safeParse({ kind: 'INVENTADO', text: 'x' }).success).toBe(false);
  });

  it('exige exatamente 2 produtos na comparação', () => {
    const result = UiTurn.safeParse({ kind: 'COMPARE', text: 'x', products: [], rows: [] });
    expect(result.success).toBe(false);
  });

  it('a confirmação do entendimento exige ao menos um item de resumo', () => {
    expect(UiTurn.safeParse({ kind: 'CONFIRM', text: 'Entendi', summary: [] }).success).toBe(false);
    expect(UiTurn.safeParse({ kind: 'CONFIRM', text: 'Entendi', summary: [{ label: 'Produto', value: 'hidratante' }] }).success).toBe(true);
  });

  it('o aviso de segurança tem nível e motivo obrigatórios, e nenhum produto', () => {
    const ok = UiTurn.safeParse({ kind: 'SAFETY_NOTICE', level: 'yellow', text: 'x', why: 'y' });
    expect(ok.success).toBe(true);
    expect(UiTurn.safeParse({ kind: 'SAFETY_NOTICE', level: 'yellow', text: 'x' }).success).toBe(false);
    expect(UiTurn.safeParse({ kind: 'SAFETY_NOTICE', level: 'verde', text: 'x', why: 'y' }).success).toBe(false);
  });
});
