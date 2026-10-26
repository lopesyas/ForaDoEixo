import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Home } from './Home';
import { copy } from '../copy';

describe('Home', () => {
  it('explica por que o botão Buscar ainda não funciona', () => {
    render(<Home onSubmit={() => {}} />);
    expect(screen.getByText(copy.home.needText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.home.search })).toHaveAttribute('aria-disabled', 'true');
  });

  it('um exemplo preenche o campo e libera a busca', async () => {
    render(<Home onSubmit={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: copy.home.examples[0] }));
    expect(screen.getByRole('textbox')).toHaveValue(copy.home.examples[0]);
    expect(screen.getByRole('button', { name: copy.home.search })).toHaveAttribute('aria-disabled', 'false');
  });

  it('não envia pedido vazio', async () => {
    const onSubmit = vi.fn();
    render(<Home onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: copy.home.search }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envia o texto escrito, sem espaços sobrando', async () => {
    const onSubmit = vi.fn();
    render(<Home onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole('textbox'), '  hidratante  ');
    await userEvent.click(screen.getByRole('button', { name: copy.home.search }));
    expect(onSubmit).toHaveBeenCalledWith('hidratante');
  });

  it('Enter envia e Shift+Enter quebra a linha', async () => {
    const onSubmit = vi.fn();
    render(<Home onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole('textbox'), 'a{Shift>}{Enter}{/Shift}b');
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox'), '{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
