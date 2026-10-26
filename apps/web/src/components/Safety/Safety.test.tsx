import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Action, UiTurn } from '@ia/shared';
import { describe, expect, it, vi } from 'vitest';
import { createMockClient } from '../../api/client';
import { MultiChoice } from '../Chat/MultiChoice';
import { SafetyNotice } from './SafetyNotice';

const client = createMockClient(0);
type Safety = Extract<UiTurn, { kind: 'SAFETY_NOTICE' }>;
const notice = async (text: string) => (await client.send({ conversationId: 'c', text })) as Safety;

describe('Aviso de segurança', () => {
  it('cada nível tem uma palavra própria (não depende só de cor)', async () => {
    const red = await notice('quero amoxicilina');
    const alert = await notice('estou com falta de ar');
    const yellow = (await client.send({ conversationId: 'c', actionIds: ['cond:pressure'] })) as Safety;

    const labels: string[] = [];
    for (const turn of [yellow, red, alert]) {
      const { container, unmount } = render(<SafetyNotice turn={turn} interactive onAction={() => {}} />);
      labels.push(container.querySelector('section')?.getAttribute('aria-label') ?? '');
      unmount();
    }
    expect(labels).toEqual(['Atenção', 'Não posso indicar', 'Procure atendimento agora']);
  });

  it('nunca mostra preço nem botão de compra', async () => {
    for (const text of ['quero amoxicilina', 'dor no peito']) {
      const { container, unmount } = render(<SafetyNotice turn={await notice(text)} interactive onAction={() => {}} />);
      expect(container.textContent).not.toMatch(/R\$|carrinho|comprar agora/i);
      unmount();
    }
  });

  it('o motivo fica a um toque, em "Por quê?"', async () => {
    render(<SafetyNotice turn={await notice('quero amoxicilina')} interactive onAction={() => {}} />);
    expect(screen.getByText('Por quê?')).toBeInTheDocument();
    expect(screen.getByText(/precisam da avaliação de um profissional/)).toBeInTheDocument();
  });

  it('a ação principal é falar com um farmacêutico', async () => {
    const onAction = vi.fn();
    render(<SafetyNotice turn={await notice('quero amoxicilina')} interactive onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: 'Falar com farmacêutico agora' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'handoff' }));
  });

  it('só o nível de alerta interrompe o leitor de tela (role=alert)', async () => {
    const { unmount } = render(<SafetyNotice turn={await notice('quero amoxicilina')} interactive onAction={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();
    render(<SafetyNotice turn={await notice('dor no peito')} interactive onAction={() => {}} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

const actions: Action[] = [
  { id: 'a', label: 'Tem pressão alta', tone: 'secondary' },
  { id: 'b', label: 'Usa outro remédio', tone: 'secondary' },
  { id: 'none', label: 'Nenhum desses', tone: 'secondary', exclusive: true },
];

describe('Pergunta de múltipla escolha', () => {
  it('Continuar só vale com ao menos uma opção marcada, e explica por quê', async () => {
    const onSubmit = vi.fn();
    render(<MultiChoice actions={actions} onSubmit={onSubmit} />);
    const next = screen.getByRole('button', { name: 'Continuar' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Marque pelo menos uma opção para continuar.')).toBeInTheDocument();
    await userEvent.click(next);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('permite marcar várias opções que valem ao mesmo tempo', async () => {
    const onSubmit = vi.fn();
    render(<MultiChoice actions={actions} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tem pressão alta' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Usa outro remédio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onSubmit).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })]);
  });

  it('"Nenhum desses" desmarca as outras, e marcar outra desmarca "Nenhum desses"', async () => {
    render(<MultiChoice actions={actions} onSubmit={() => {}} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tem pressão alta' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Nenhum desses' }));
    expect(screen.getByRole('checkbox', { name: 'Tem pressão alta' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Nenhum desses' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Usa outro remédio' }));
    expect(screen.getByRole('checkbox', { name: 'Nenhum desses' })).not.toBeChecked();
  });
});
