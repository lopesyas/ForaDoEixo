import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UiTurn } from '@ia/shared';
import { describe, expect, it, vi } from 'vitest';
import { createMockClient } from '../../api/client';
import { CompareView } from './CompareView';
import { OptionsView } from './OptionsView';

const client = createMockClient(0);
const options = (await client.send({ conversationId: 'c', actionId: 'skin:dry' })) as Extract<UiTurn, { kind: 'OPTIONS' }>;
const compare = (await client.send({ conversationId: 'c', actionId: 'compare:p1,p2' })) as Extract<UiTurn, { kind: 'COMPARE' }>;

describe('Opções', () => {
  it('"Comparar os dois" só vale com 2 produtos marcados e explica por quê', async () => {
    const onAction = vi.fn();
    render(<OptionsView turn={options} interactive onAction={onAction} />);
    const button = screen.getByRole('button', { name: 'Comparar os dois' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Marque 2 produtos para comparar.')).toBeInTheDocument();

    await userEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('checkbox', { name: /Comparar Hidratante Facial/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Comparar Creme Facial/ }));
    expect(screen.getByText('Pronto: 2 produtos marcados.')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-disabled', 'false');

    await userEvent.click(button);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'compare:p1,p2' }));
  });

  it('limita a 2 produtos marcados', async () => {
    const three = { ...options, products: [...options.products, { ...options.products[0]!, id: 'p3', name: 'Terceiro Produto' }] };
    render(<OptionsView turn={three} interactive onAction={() => {}} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Comparar Hidratante Facial/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Comparar Creme Facial/ }));
    expect(screen.getByRole('checkbox', { name: /Comparar Terceiro/ })).toBeDisabled();
    expect(screen.getByText(/Você já marcou 2/)).toBeInTheDocument();
  });

  it('mostra preço, preço por unidade e o motivo da recomendação', () => {
    render(<OptionsView turn={options} interactive onAction={() => {}} />);
    expect(screen.getAllByText(/R\$\s*18,90/).length).toBeGreaterThan(0);
    expect(screen.getByText(/R\$\s*37,80 por 100 g/)).toBeInTheDocument();
    expect(screen.getByText('Indicado para pele seca. Hidratação intensa.')).toBeInTheDocument();
  });

  it('turnos antigos não têm caixas de comparar (menos opções na tela)', () => {
    render(<OptionsView turn={options} interactive={false} onAction={() => {}} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('Comparação', () => {
  it('o "melhor neste item" é dito em texto, não só por marca visual', () => {
    render(<CompareView turn={compare} interactive onAction={() => {}} />);
    const row = screen.getByRole('row', { name: /Preço por 100 g/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).not.toHaveTextContent('melhor neste item');
    expect(cells[1]).toHaveTextContent('melhor neste item');
  });

  it('os botões de escolha dizem qual produto escolhem', () => {
    render(<CompareView turn={compare} interactive onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Escolher Hidra Leve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escolher Suave Dia' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar às opções' })).toBeInTheDocument();
  });
});
