import { Dock } from '../components/Dock/Dock';
import { useCart } from '../cart/CartProvider';
import { copy } from '../copy';
import { formatBRL } from '../lib/format';

export function ConfirmationPage({ onAnother }: { onAnother: () => void }) {
  const t = copy.checkout.done;
  const { lastOrder } = useCart();

  if (!lastOrder) {
    return (
      <>
        <section className="simple">
          <h1>{t.none}</h1>
          <button type="button" className="btn btn--primary" onClick={onAnother}>
            {t.another}
          </button>
        </section>
        <Dock />
      </>
    );
  }

  const { lines, checkout, totalCents } = lastOrder;
  const labels = copy.checkout;
  return (
    <>
      <section className="simple confirm">
        <h1>
          <span className="confirm__mark" aria-hidden="true">
            ✓
          </span>{' '}
          {t.title}
        </h1>
        <p className="lead">{t.text}</p>
        <ul className="facts">
          {lines.map((l) => (
            <li key={l.product.id}>
              {l.qty} × <strong>{l.product.name}</strong>
            </li>
          ))}
          <li>
            {t.receive}: <strong>{checkout.shipping === 'pickup' ? labels.delivery.pickup : labels.delivery.home}</strong>
          </li>
          <li>
            {t.method}: <strong>{checkout.payment ? labels.payment[checkout.payment] : '—'}</strong>
          </li>
          <li>
            {copy.cart.total}: <strong>{formatBRL(totalCents)}</strong>
          </li>
        </ul>
        <button type="button" className="btn btn--primary" onClick={onAnother}>
          {t.another}
        </button>
      </section>
      <Dock />
    </>
  );
}
