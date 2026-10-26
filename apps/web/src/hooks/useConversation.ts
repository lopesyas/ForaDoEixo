import type { UiTurn } from '@ia/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatClient, ChatInput } from '../api/client';

export type Message = { id: number; from: 'user'; text: string } | { id: number; from: 'assistant'; turn: UiTurn };

export function useConversation(client: ChatClient, firstText?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<ChatInput | null>(null);
  const conversationId = useRef(crypto.randomUUID());
  const nextId = useRef(1);
  const started = useRef(false);

  const run = useCallback(
    async (input: Omit<ChatInput, 'conversationId'>) => {
      const full = { ...input, conversationId: conversationId.current };
      setFailed(null);
      setPending(true);
      try {
        const turn = await client.send(full);
        setMessages((m) => [...m, { id: nextId.current++, from: 'assistant', turn }]);
      } catch {
        setFailed(full);
      } finally {
        setPending(false);
      }
    },
    [client],
  );

  /** O usuário fala (texto) ou toca em um botão (ação). Nos dois casos o que ele disse aparece na conversa. */
  const say = useCallback(
    (shown: string, input: Omit<ChatInput, 'conversationId'>) => {
      setMessages((m) => [...m, { id: nextId.current++, from: 'user', text: shown }]);
      void run(input);
    },
    [run],
  );

  const retry = useCallback(() => {
    if (failed) void run({ text: failed.text, actionId: failed.actionId, actionIds: failed.actionIds });
  }, [failed, run]);

  useEffect(() => {
    if (started.current || !firstText) return;
    started.current = true;
    say(firstText, { text: firstText });
  }, [firstText, say]);

  /** Pedido silencioso: o assistente responde sem aparecer uma fala do cliente (ex.: boas-vindas ao abrir o painel). */
  const ask = useCallback((input: Omit<ChatInput, 'conversationId'>) => void run(input), [run]);

  return { messages, pending, failed, say, ask, retry };
}
