import type { CartReview } from '@ia/shared';
import { useEffect, useState } from 'react';
import { defaultStore } from '../api';
import type { StoreClient } from '../api/store';
import { CartLineView } from '../components/Cart/CartLineView';
import { OrderTotals } from '../components/Cart/OrderTotals';
import { Dock } from '../components/Dock/Dock';
import { useCart } from '../cart/CartProvider';
import { copy } from '../copy';

export function CartPage({ onContinue, onSearch, onAsk = () => {}, store = defaultStore }: { onContinue: () => void; onSearch: () => void; onAsk?: (shown: string, actionId: string) => void; store?: StoreClient }) {
  const t = copy.cart;
  const { lines, setQty, remove } = useCart();
  const [review, setReview] = useState<CartReview['findings']>([]);
  const idsKey = lines.map((l) => l.product.id).join(',');

  // Revisão da cesta inteira: um complemento. Se falhar, a compra segue normalmente.
  useEffect(() => {
    let alive = true;
    if (!idsKey) return setReview([]);
    store.review(idsKey.split(',')).then(
      (r) => alive && setReview(r.findings),
      () => alive && setReview([]),
    );
    return () => {
      alive = false;
    };
  }, [idsKey, store]);
  const nameOf = (id: string) => lines.find((l) => l.product.id === id)?.product.name ?? '';

  if (lines.length === 0) {
    return (
      <>
        <section className="simple">
          <h1>{t.title}</h1>
          <p className="lead">{t.empty}</p>
          <p>{t.emptyHelp}</p>
          <button type="button" className="btn btn--primary" onClick={onSearch}>
            {t.search}
          </button>
        </section>
        <Dock />
      </>
    );
  }

  return (
    <>
      <div className="checkout">
        <div className="checkout__main">
          <h1>{t.title}</h1>
          <div className="stack">
            {lines.map((l) => (
              <CartLineView key={l.product.id} line={l} onQty={(q) => setQty(l.product.id, q)} onRemove={() => remove(l.product.id)} />
            ))}
          </div>
          {review.length > 0 && (
            <section className="review" aria-labelledby="review-title">
              <h2 id="review-title">
                <span aria-hidden="true">✦</span> {copy.review.title}
              </h2>
              <p className="hint">{copy.review.hint}</p>
              <ul className="review__list">
                {review.map((f) => (
                  <li key={f.id} className={`review__item review__item--${f.level}`}>
                    <p>
                      <strong>{f.level === 'warning' ? copy.review.warning : copy.review.info}:</strong> {f.text}
                    </p>
                    {f.checkProductId && (
                      <button type="button" className="btn" onClick={() => onAsk(copy.review.check, `check:${f.checkProductId}`)}>
                        {copy.review.check}
                        <span className="visually-hidden"> {nameOf(f.checkProductId)}</span>
                      </button>
                    )}
                    {f.level === 'warning' && (
                      <button type="button" className="btn" onClick={() => onAsk(copy.review.pharmacist, 'handoff')}>
                        {copy.review.pharmacist}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <button type="button" className="link-btn" onClick={onSearch}>
            {t.keepShopping}
          </button>
        </div>
        <div className="checkout__side">
          <OrderTotals />
          <button type="button" className="btn btn--primary btn--block" onClick={onContinue}>
            {t.next}
          </button>
        </div>
      </div>
      <Dock />
    </>
  );
}
