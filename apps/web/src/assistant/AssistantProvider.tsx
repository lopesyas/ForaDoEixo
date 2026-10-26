import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChatInput } from '../api/client';

export interface AssistantCommand {
  /** Muda a cada pedido, para o painel saber que é um pedido novo. */
  id: number;
  /** O que aparece como fala do cliente. Sem isto, o pedido é silencioso (ex.: abrir já com as boas-vindas). */
  shown?: string;
  input: Omit<ChatInput, 'conversationId'>;
}

interface AssistantApi {
  open: boolean;
  command: AssistantCommand | null;
  /** Abre o painel (se preciso) e envia o pedido para a MESMA conversa: ela continua enquanto o cliente navega na loja. */
  ask: (shown: string | undefined, input: AssistantCommand['input']) => void;
  show: () => void;
  close: () => void;
  /** O elemento que abriu o painel, para devolver o foco ao fechar. */
  opener: React.MutableRefObject<HTMLElement | null>;
}

const AssistantContext = createContext<AssistantApi | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState<AssistantCommand | null>(null);
  const seq = useRef(0);
  const opener = useRef<HTMLElement | null>(null);

  const remember = () => {
    if (!open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const ask = useCallback(
    (shown: string | undefined, input: AssistantCommand['input']) => {
      remember();
      setOpen(true);
      setCommand({ id: ++seq.current, ...(shown !== undefined ? { shown } : {}), input });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const show = useCallback(() => {
    remember();
    setOpen(true);
    // Primeira vez: boas-vindas silenciosas. Depois, só reabre a conversa que já existe.
    setCommand((c) => c ?? { id: ++seq.current, input: { text: 'oi' } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    queueMicrotask(() => opener.current?.focus());
  }, []);

  const value = useMemo<AssistantApi>(() => ({ open, command, ask, show, close, opener }), [open, command, ask, show, close]);
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantApi {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant precisa estar dentro de AssistantProvider');
  return ctx;
}
