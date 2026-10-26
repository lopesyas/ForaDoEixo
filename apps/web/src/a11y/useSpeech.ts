import { useCallback, useEffect, useRef, useState } from 'react';

/** Web Speech API: "Falar" = ditar (entrada); "Ouvir" = ler em voz alta (saída). */
interface RecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
}
type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
};

function getRecognition(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Tradução dos erros do navegador para frases que a pessoa entende e sabe o que fazer. */
export function speechErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'O microfone está bloqueado. Clique no cadeado ao lado do endereço do site e permita o microfone.';
    case 'no-speech':
      return 'Não ouvi nada. Toque em Falar e fale de novo, perto do microfone.';
    case 'audio-capture':
      return 'Não encontrei um microfone neste aparelho.';
    case 'network':
      return 'O reconhecimento de voz precisa de internet. Você pode escrever.';
    case 'aborted':
      return '';
    default:
      return 'Não consegui ouvir agora. Você pode escrever.';
  }
}

/**
 * Ditado ao vivo: o que a pessoa fala aparece no campo enquanto ela fala (resultado parcial),
 * somado ao que já estava escrito. Erros viram mensagens claras (nada de falhar em silêncio).
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<InstanceType<RecognitionCtor> | null>(null);
  const base = useRef('');
  const heard = useRef(false);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const supported = typeof window !== 'undefined' && Boolean(getRecognition());

  const toggle = useCallback(
    (current = '') => {
      const Ctor = getRecognition();
      if (!Ctor) return;
      if (listening) {
        ref.current?.stop();
        return;
      }
      setError('');
      heard.current = false;
      clearTimeout(quietTimer.current);
      // Ouvindo há 8 s sem nenhuma palavra: avisa o que fazer em vez de ficar mudo.
      quietTimer.current = setTimeout(() => {
        if (!heard.current) setError('Ainda não ouvi nenhuma palavra. Fale mais perto do microfone, confira a permissão do microfone no cadeado do endereço, ou escreva.');
      }, 8000);
      base.current = current.trim();
      const rec = new Ctor();
      rec.lang = 'pt-BR';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onstart = () => setListening(true);
      rec.onresult = (e) => {
        heard.current = true;
        clearTimeout(quietTimer.current);
        setError('');
        let said = '';
        for (let i = 0; i < e.results.length; i++) said += e.results[i]?.[0]?.transcript ?? '';
        onText(`${base.current} ${said}`.trim());
      };
      rec.onerror = (e) => {
        clearTimeout(quietTimer.current);
        setError(speechErrorMessage(e.error));
        setListening(false);
      };
      rec.onend = () => {
        clearTimeout(quietTimer.current);
        setListening(false);
      };
      ref.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        setError(speechErrorMessage(undefined));
        setListening(false);
      }
    },
    [listening, onText],
  );

  return { supported, listening, error, toggle };
}

/** "Ouvir": lê o texto em voz alta e pode ser interrompido. O estado vem do próprio navegador (fim da fala). */
export function useReadAloud() {
  const [speaking, setSpeaking] = useState(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const toggle = useCallback(
    (text: string) => {
      if (!supported) return;
      if (speaking) {
        stop();
        return;
      }
      if (!text.trim()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [speaking, stop, supported],
  );

  // A leitura para ao sair da tela ou fechar o componente: nada de voz "órfã".
  useEffect(() => {
    if (!supported) return;
    window.addEventListener('hashchange', stop);
    return () => {
      window.removeEventListener('hashchange', stop);
      window.speechSynthesis.cancel();
    };
  }, [stop, supported]);

  return { supported, speaking, toggle };
}
