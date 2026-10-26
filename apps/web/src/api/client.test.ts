import { describe, expect, it } from 'vitest';
import { createMockClient } from './client';

const client = createMockClient(0);

describe('cliente simulado', () => {
  it('confirma o entendimento antes de qualquer pergunta ou busca', async () => {
    const turn = await client.send({ conversationId: 'c1', text: 'Quero um hidratante para o rosto de até R$ 20' });
    expect(turn.kind).toBe('CONFIRM');
    if (turn.kind === 'CONFIRM') {
      expect(turn.summary.map((s) => s.label)).toEqual(['Produto', 'Valor máximo']);
    }
  });

  it('depois de confirmar, pergunta o tipo de pele', async () => {
    const turn = await client.send({ conversationId: 'c1', actionId: 'confirm:hidratante' });
    expect(turn.kind).toBe('QUESTION');
  });

  it('depois da resposta, mostra opções', async () => {
    const turn = await client.send({ conversationId: 'c1', actionId: 'skin:dry' });
    expect(turn.kind).toBe('OPTIONS');
  });

  it('em caso de saúde, pergunta (múltipla escolha) antes de qualquer coisa', async () => {
    const confirm = await client.send({ conversationId: 'c1', text: 'meu pai está com dor de cabeça' });
    expect(confirm.kind).toBe('CONFIRM');
    const turn = await client.send({ conversationId: 'c1', actionId: 'confirm:saude' });
    expect(turn.kind).toBe('QUESTION');
    if (turn.kind === 'QUESTION') expect(turn.multi).toBe(true);
  });

  it('com pressão alta, encaminha ao farmacêutico e nunca devolve produto', async () => {
    const turn = await client.send({ conversationId: 'c1', actionIds: ['cond:pressure', 'med:other'] });
    expect(turn.kind).toBe('SAFETY_NOTICE');
    expect(JSON.stringify(turn)).not.toMatch(/priceCents|products/);
  });

  it('antibiótico: nível vermelho, sem sugerir produto', async () => {
    const turn = await client.send({ conversationId: 'c1', text: 'quero amoxicilina' });
    expect(turn).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'red' });
  });

  it('sinal de emergência: nível de alerta, antes de qualquer interpretação', async () => {
    const turn = await client.send({ conversationId: 'c1', text: 'estou com dor no peito e quero um hidratante' });
    expect(turn).toMatchObject({ kind: 'SAFETY_NOTICE', level: 'alert' });
  });

  it('a comparação marca como melhor, em cada linha, o produto que realmente é melhor', async () => {
    const turn = await client.send({ conversationId: 'c1', actionId: 'compare:p1,p2' });
    expect(turn.kind).toBe('COMPARE');
    if (turn.kind !== 'COMPARE') return;
    const byLabel = Object.fromEntries(turn.rows.map((r) => [r.label, r.better]));
    expect(byLabel['Preço']).toBe(1); // R$ 16,50 é menor que R$ 18,90
    expect(byLabel['Preço por 100 g']).toBe(1);
    expect(byLabel['Indicado para']).toBe(0); // quem pediu pele seca
  });

  it('cada botão de escolha diz qual produto escolhe', async () => {
    const turn = await client.send({ conversationId: 'c1', actionId: 'compare:p1,p2' });
    const labels = turn.actions.filter((a) => a.id.startsWith('choose:')).map((a) => a.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(['Escolher Hidra Leve', 'Escolher Suave Dia']);
  });

  it('"não é para o meu pai, é para a minha mãe": vale a última pessoa citada', async () => {
    const turn = await client.send({ conversationId: 'c1', text: 'não é para o meu pai, é para a minha mãe, dor de cabeça' });
    expect(turn.kind).toBe('CONFIRM');
    if (turn.kind === 'CONFIRM') expect(turn.summary[0]).toEqual({ label: 'Para quem', value: 'sua mãe' });
    const next = await client.send({ conversationId: 'c1', actionId: 'confirm:saude:mae' });
    expect(next).toMatchObject({ kind: 'QUESTION', multi: true });
    if (next.kind === 'QUESTION') expect(next.text).toContain('sua mãe');
  });
});
