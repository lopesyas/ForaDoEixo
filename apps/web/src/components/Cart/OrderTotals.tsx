import { copy } from '../../copy';
import { formatBRL, keepUnits } from '../../lib/format';
import { shippingCost, useCart } from '../../cart/CartProvider';

/** Resumo do pedido: igual em todas as etapas, para ninguém precisar lembrar o que escolheu. */
export function OrderTotals() {
  const t = copy.cart;
  const { lines, subtotalCents, checkout } = useCart();
  const ship = shippingCost(checkout);
  return (
    <aside className="totals" aria-label={t.summaryTitle}>
      <h2 className="totals__title">{t.summaryTitle}</h2>
      <ul className="totals__items">
        {lines.map((l) => (
          <li key={l.product.id}>
            {l.qty} × {keepUnits(l.product.name)}
          </li>
        ))}
      </ul>
      <dl className="totals__rows">
        <div>
          <dt>{t.products}</dt>
          <dd>{formatBRL(subtotalCents)}</dd>
        </div>
        <div>
          <dt>{t.delivery}</dt>
          <dd>{ship === null ? t.deliveryTbd : ship === 0 ? t.free : formatBRL(ship)}</dd>
        </div>
        <div className="totals__total">
          <dt>{t.total}</dt>
          <dd>{formatBRL(subtotalCents + (ship ?? 0))}</dd>
        </div>
      </dl>
      <p className="hint">{t.simulated}</p>
    </aside>
  );
}
