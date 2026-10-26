import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speechErrorMessage, useDictation } from './useSpeech';

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((e: { results: { 0: { transcript: string }; length: 1 }[] & { length: number } }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  started = false;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  say(parts: string[]) {
    this.onresult?.({ results: Object.assign(parts.map((t) => ({ 0: { transcript: t }, length: 1 })), { length: parts.length }) } as never);
  }
}

function Box() {
  const [text, setText] = useState('quero');
  const d = useDictation(setText);
  return (
    <div>
      <p data-testid="text">{text}</p>
      <button onClick={() => d.toggle(text)}>{d.listening ? 'Parar' : 'Falar'}</button>
      <p data-testid="err">{d.error}</p>
    </div>
  );
}

beforeEach(() => {
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
});
afterEach(() => {
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  FakeRecognition.last = null;
});

describe('ditado', () => {
  it('pede resultados parciais, em português, e o texto aparece ao vivo somado ao que já estava escrito', async () => {
    render(<Box />);
    await userEvent.click(screen.getByRole('button', { name: 'Falar' }));
    const rec = FakeRecognition.last!;
    expect(rec.interimResults).toBe(true);
    expect(rec.lang).toBe('pt-BR');
    expect(screen.getByRole('button', { name: 'Parar' })).toBeInTheDocument();
    act(() => rec.say(['um hidra']));
    expect(screen.getByTestId('text')).toHaveTextContent('quero um hidra');
    act(() => rec.say(['um hidratante ', 'para o rosto']));
    expect(screen.getByTestId('text')).toHaveTextContent('quero um hidratante para o rosto');
  });

  it('Parar encerra e o botão volta a "Falar"', async () => {
    render(<Box />);
    await userEvent.click(screen.getByRole('button', { name: 'Falar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(screen.getByRole('button', { name: 'Falar' })).toBeInTheDocument();
  });

  it('microfone bloqueado vira uma mensagem que diz o que fazer', async () => {
    render(<Box />);
    await userEvent.click(screen.getByRole('button', { name: 'Falar' }));
    act(() => FakeRecognition.last!.onerror?.({ error: 'not-allowed' }));
    expect(screen.getByTestId('err')).toHaveTextContent(/microfone está bloqueado/);
    expect(screen.getByRole('button', { name: 'Falar' })).toBeInTheDocument();
  });

  it.each([
    ['no-speech', /Não ouvi nada/],
    ['audio-capture', /Não encontrei um microfone/],
    ['network', /precisa de internet/],
    ['qualquer-outro', /Não consegui ouvir/],
  ])('erro %s tem mensagem própria', (code, re) => {
    expect(speechErrorMessage(code)).toMatch(re);
  });

  it('cancelamento do usuário (aborted) não mostra erro', () => {
    expect(speechErrorMessage('aborted')).toBe('');
  });

  it('ouvindo há 8 s sem nenhuma palavra: avisa o que fazer; se a voz chegar, o aviso some', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Box />);
      await userEvent.click(screen.getByRole('button', { name: 'Falar' }));
      act(() => {
        vi.advanceTimersByTime(8100);
      });
      expect(screen.getByTestId('err')).toHaveTextContent(/Ainda não ouvi nenhuma palavra/);
      act(() => FakeRecognition.last!.say(['olá']));
      expect(screen.getByTestId('err')).toHaveTextContent('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('se a voz chega antes dos 8 s, não aparece aviso nenhum', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Box />);
      await userEvent.click(screen.getByRole('button', { name: 'Falar' }));
      act(() => FakeRecognition.last!.say(['oi']));
      act(() => {
        vi.advanceTimersByTime(9000);
      });
      expect(screen.getByTestId('err')).toHaveTextContent('');
    } finally {
      vi.useRealTimers();
    }
  });
});
