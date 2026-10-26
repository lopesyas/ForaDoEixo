import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityBar } from './AccessibilityBar';

let utterance: { onend?: () => void } = {};
const speak = vi.fn((u: typeof utterance) => {
  utterance = u;
});
const cancel = vi.fn();

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<main id="main">Texto da página</main>';
  Object.defineProperty(window, 'speechSynthesis', { value: { speak, cancel }, configurable: true });
  vi.stubGlobal('SpeechSynthesisUtterance', function (this: { text: string }, text: string) {
    this.text = text;
  });
  speak.mockClear();
  cancel.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe('Barra de ajustes de leitura', () => {
  it('"Ouvir" mostra que está ativo e vira "Parar"', async () => {
    render(<AccessibilityBar readTargetId="main" />, { container: document.body.appendChild(document.createElement('div')) });
    await userEvent.click(screen.getByRole('button', { name: 'Ouvir esta página em voz alta' }));
    expect(speak).toHaveBeenCalledTimes(1);
    const stop = screen.getByRole('button', { name: 'Parar a leitura em voz alta' });
    expect(stop).toHaveAttribute('aria-pressed', 'true');
    expect(stop).toHaveTextContent('Parar');
  });

  it('clicar de novo interrompe a voz e volta ao estado inicial', async () => {
    render(<AccessibilityBar readTargetId="main" />, { container: document.body.appendChild(document.createElement('div')) });
    await userEvent.click(screen.getByRole('button', { name: 'Ouvir esta página em voz alta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar a leitura em voz alta' }));
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ouvir esta página em voz alta' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('quando a fala termina sozinha, o botão volta ao normal', async () => {
    render(<AccessibilityBar readTargetId="main" />, { container: document.body.appendChild(document.createElement('div')) });
    await userEvent.click(screen.getByRole('button', { name: 'Ouvir esta página em voz alta' }));
    await vi.waitFor(() => expect(utterance.onend).toBeTypeOf('function'));
    utterance.onend?.();
    expect(await screen.findByRole('button', { name: 'Ouvir esta página em voz alta' })).toBeInTheDocument();
  });

  it('Contraste mostra o estado ativo e pode ser desligado', async () => {
    render(<AccessibilityBar readTargetId="main" />, { container: document.body.appendChild(document.createElement('div')) });
    const button = screen.getByRole('button', { name: 'Contraste' });
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveAttribute('data-contrast', 'high');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement).not.toHaveAttribute('data-contrast');
  });

  it('A+ e A− mudam o tamanho e anunciam o nível em palavras', async () => {
    render(<AccessibilityBar readTargetId="main" />, { container: document.body.appendChild(document.createElement('div')) });
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar texto' }));
    expect(screen.getByRole('status')).toHaveTextContent('Texto no tamanho 2 de 4.');
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.15');
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir texto' }));
    expect(screen.getByRole('status')).toHaveTextContent('Texto no tamanho 1 de 4.');
  });

  it('no limite, o botão não some nem fica mudo: explica que já está no menor tamanho', async () => {
    render(<AccessibilityBar readTargetId="main" />, { container: document.body.appendChild(document.createElement('div')) });
    const smaller = screen.getByRole('button', { name: 'Diminuir texto' });
    expect(smaller).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(smaller);
    expect(screen.getByRole('status')).toHaveTextContent('O texto já está no menor tamanho.');
  });

  it('no tamanho máximo, A+ explica o limite', async () => {
    render(<AccessibilityBar readTargetId="main" />, { container: document.body.appendChild(document.createElement('div')) });
    const larger = screen.getByRole('button', { name: 'Aumentar texto' });
    for (let i = 0; i < 3; i++) await userEvent.click(larger);
    await userEvent.click(larger);
    expect(screen.getByRole('status')).toHaveTextContent('O texto já está no maior tamanho.');
  });
});
