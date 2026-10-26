import { useEffect, useRef } from 'react';
import { Conversation } from '../pages/Conversation';
import { useCart } from '../cart/CartProvider';
import { copy } from '../copy';
import { useAssistant } from './AssistantProvider';

/**
 * Painel do assistente: abre por cima de qualquer página da loja (como o chat do site), sem tirar o cliente de onde ele está.
 * A conversa fica montada mesmo com o painel fechado, então não se perde ao navegar ou ao fechar e reabrir.
 */
export function AssistantPanel({ onGoToCart }: { onGoToCart: () => void }) {
  const { open, command, ask, close } = useAssistant();
  const cart = useCart();
  const panelRef = useRef<HTMLDivElement>(null);
  const t = copy.assistant;

  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  return (
    <>
      {open && <div className="assistant-scrim" onClick={close} aria-hidden="true" />}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`assistant-panel${open ? ' assistant-panel--open' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label={t.title}
        hidden={!open}
        data-open={open}
      >
        <div className="assistant-panel__head">
          <div>
            <p className="assistant-panel__title">{t.title}</p>
            <p className="assistant-panel__sub">{t.subtitle}</p>
          </div>
          <button type="button" className="btn assistant-panel__close" onClick={close}>
            {t.close}
          </button>
        </div>
        <div className="assistant-panel__body">
          <Conversation
            variant="panel"
            command={command}
            onChangeOrder={() => ask(copy.conversation.changeOrder, { actionId: 'menu' })}
            onChoose={(product) => cart.add(product)}
            onChooseMany={(products) => cart.addMany(products)}
          />
        </div>
        {cart.lastAdded && (
          <div className="assistant-panel__added" role="status">
            <span>{t.added(cart.lastAdded)}</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                close();
                onGoToCart();
              }}
            >
              {t.viewCart}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
