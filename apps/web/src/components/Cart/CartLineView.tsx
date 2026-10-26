import { copy } from '../../copy';
import { formatBRL, keepUnits } from '../../lib/format';
import { MAX_QTY, type CartLine } from '../../cart/CartProvider';
import { ProductImage } from '../Product/ProductImage';

export function CartLineView({ line, onQty, onRemove }: { line: CartLine; onQty: (qty: number) => void; onRemove: () => void }) {
  const t = copy.cart;
  const { product, qty } = line;
  const atMax = qty >= MAX_QTY;
  return (
    <article className="cart-line">
      <div className="product__media">
        <ProductImage kind={product.image} id={product.id} category={product.categoryKey} />
      </div>
      <div className="cart-line__body">
        <h2 className="product__name">{keepUnits(product.name)}</h2>
        <p className="product__price">{formatBRL(product.priceCents * qty)}</p>
        <p className="badge badge--success">
          <span aria-hidden="true">✓</span> {t.inStock}
        </p>
        <p className="badge badge--warning">
          <span aria-hidden="true">!</span> {t.deliveryUnconfirmed}
        </p>

        <div className="qty" role="group" aria-label={`${t.quantity}: ${product.name}`}>
          <button type="button" className="btn" onClick={() => onQty(qty - 1)}>
            {t.less}
            <span className="visually-hidden"> {product.name}</span>
          </button>
          <output className="qty__value" aria-live="polite">
            {qty}
          </output>
          <button type="button" className="btn" aria-disabled={atMax} onClick={() => !atMax && onQty(qty + 1)}>
            {t.more}
            <span className="visually-hidden"> {product.name}</span>
          </button>
        </div>
        {atMax && <p className="hint">{t.maxQty}</p>}
        <button type="button" className="link-btn" onClick={onRemove}>
          {t.remove}
          <span className="visually-hidden"> {product.name}</span>
        </button>
      </div>
    </article>
  );
}
