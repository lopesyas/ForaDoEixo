import type { Action, ProductCard, SummaryItem } from '@ia/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatClient } from '../api/client';
import { defaultClient } from '../api';
import { Bubble } from '../components/Chat/Bubble';
import { Composer } from '../components/Chat/Composer';
import { OrderSummary } from '../components/Chat/OrderSummary';
import { TurnView } from '../components/Chat/TurnView';
import { Dock } from '../components/Dock/Dock';
import { copy } from '../copy';
import type { AssistantCommand } from '../assistant/AssistantProvider';
import { useConversation } from '../hooks/useConversation';

interface Props {
  /** Pedido inicial (modo página). No painel do assistente, os pedidos chegam por `command`. */
  firstText?: string;
  /** Pedido vindo da loja (busca, categoria, banner…). Cada `id` novo é um pedido novo na MESMA conversa. */
  command?: AssistantCommand | null;
  variant?: 'page' | 'panel';
  client?: ChatClient;
  onChangeOrder: (currentText: string) => void;
  /** Escolher um produto leva ao carrinho. O carrinho é do front; o motor só recomenda. */
  onChoose?: (product: ProductCard) => void;
  /** "Adicionar tudo ao carrinho" (reposição). */
  onChooseMany?: (products: ProductCard[]) => void;
}

export function Conversation({ firstText = '', command = null, variant = 'page', client = defaultClient, onChangeOrder, onChoose, onChooseMany }: Props) {
  const { messages, pending, failed, say, ask, retry } = useConversation(client, firstText || undefined);
  const lastCommand = useRef(0);
  useEffect(() => {
    if (!command || command.id === lastCommand.current) return;
    lastCommand.current = command.id;
    if (command.shown !== undefined) say(command.shown, command.input);
    else ask(command.input);
  }, [command, say, ask]);
  const endRef = useRef<HTMLDivElement>(null);
  const [extras, setExtras] = useState<(SummaryItem & { confirmId: number })[]>([]);
  const t = copy.conversation;

  // O resumo é do pedido atual: ao confirmar um novo pedido, as respostas do anterior saem do painel.
  const current = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.from === 'assistant' && m.turn.kind === 'CONFIRM') return { id: m.id, summary: m.turn.summary };
    }
    return null;
  }, [messages]);

  const fullSummary = useMemo(() => {
    if (!current) return null;
    const answered = extras
      .filter((e) => e.confirmId === current.id && !current.summary.some((x) => x.label === e.label))
      .map(({ label, value }) => ({ label, value }));
    return [...current.summary, ...answered];
  }, [current, extras]);

  const lastAssistantId = useMemo(() => [...messages].reverse().find((m) => m.from === 'assistant')?.id, [messages]);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [messages, pending]);

  function onAction(action: Action) {
    if (action.id === 'change') {
      onChangeOrder(firstText);
      return;
    }
    if (action.id === 'cart:all' && onChooseMany) {
      const last = [...messages].reverse().find((m) => m.from === 'assistant' && m.turn.kind === 'OPTIONS');
      if (last?.from === 'assistant' && last.turn.kind === 'OPTIONS') {
        onChooseMany(last.turn.products);
        return;
      }
    }
    if (action.id.startsWith('choose:') && onChoose) {
      const id = action.id.slice('choose:'.length);
      for (const m of messages) {
        if (m.from !== 'assistant' || (m.turn.kind !== 'OPTIONS' && m.turn.kind !== 'COMPARE')) continue;
        const product = m.turn.products.find((p) => p.id === id);
        if (product) {
          onChoose(product);
          return;
        }
      }
    }
    const answer = action.summary;
    if (answer && current) setExtras((list) => [...list.filter((e) => !(e.confirmId === current.id && e.label === answer.label)), { ...answer, confirmId: current.id }]);
    say(action.label, { actionId: action.id });
  }

  /** Várias respostas de uma vez: o resumo junta os valores do mesmo item ("Condições: pressão alta, ..."). */
  function onMulti(selected: Action[]) {
    const merged = new Map<string, string[]>();
    for (const a of selected) {
      if (!a.summary) continue;
      merged.set(a.summary.label, [...(merged.get(a.summary.label) ?? []), a.summary.value]);
    }
    if (current) {
      setExtras((list) => [
        ...list.filter((e) => !(e.confirmId === current.id && merged.has(e.label))),
        ...[...merged].map(([label, values]) => ({ label, value: values.join(', '), confirmId: current.id })),
      ]);
    }
    say(selected.map((a) => a.label).join(', '), { actionIds: selected.map((a) => a.id) });
  }

  return (
    <div className={`conversation${variant === 'panel' ? ' conversation--panel' : ''}`}>
      <div className="conversation__side">
        {fullSummary && <OrderSummary summary={fullSummary} compact={variant === 'panel'} onChange={() => onChangeOrder(firstText)} />}
      </div>

      <div className="conversation__main">
        <div className="log" role="log" aria-live="polite" aria-label={t.logLabel}>
          {messages.map((m) =>
            m.from === 'user' ? (
              <Bubble key={m.id} from="user">
                {m.text}
              </Bubble>
            ) : (
              <TurnView key={m.id} turn={m.turn} interactive={m.id === lastAssistantId && !pending} onAction={onAction} onMulti={onMulti} />
            ),
          )}
          {pending && (
            <div role="status" className="status">
              {t.thinking}
            </div>
          )}
          {failed && (
            <Bubble from="assistant">
              <p>{t.error}</p>
              <button type="button" className="btn btn--primary btn--block" onClick={retry}>
                {t.retry}
              </button>
            </Bubble>
          )}
          <div ref={endRef} />
        </div>

        <Dock>
          <Composer disabled={pending} onSend={(text) => say(text, { text })} />
          <button type="button" className="btn dock__menu" aria-disabled={pending} onClick={() => !pending && say(t.menu, { actionId: 'menu' })}>
            {t.menu}
          </button>
        </Dock>
      </div>
    </div>
  );
}
