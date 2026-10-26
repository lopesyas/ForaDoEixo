import type { ProductCard } from '@ia/shared';
import { copy } from '../../copy';
import { formatBRL, keepUnits } from '../../lib/format';
import { ProductImage } from './ProductImage';

interface Props {
  product: ProductCard;
  /** Se informado, mostra a caixa "Comparar". */
  compare?: { checked: boolean; disabled: boolean; onToggle: () => void };
  onChoose?: () => void;
}

export function ProductCardView({ product, compare, onChoose }: Props) {
  const t = copy.options;
  return (
    <article className={`product${compare?.checked ? ' product--marked' : ''}`}>
      <div className="product__media">
        <ProductImage kind={product.image} id={product.id} category={product.categoryKey} />
      </div>
      <div className="product__body">
        <h3 className="product__name">{keepUnits(product.name)}</h3>
        <p className="product__price">{formatBRL(product.priceCents)}</p>
        {product.pricePerUnitCents !== undefined && product.unitLabel && (
          <p className="product__unit">
            {formatBRL(product.pricePerUnitCents)} {t.perUnit} {product.unitLabel}
          </p>
        )}
        {product.badges.map((b) => (
          <p key={b.label} className={`badge badge--${b.tone}`}>
            <span aria-hidden="true">{b.tone === 'success' ? '✓' : b.tone === 'warning' ? '!' : '•'}</span> {b.label}
          </p>
        ))}
        <p className="product__reason">{product.reason}</p>

        {compare && (
          <label className={`check${compare.disabled && !compare.checked ? ' check--off' : ''}`}>
            <input type="checkbox" checked={compare.checked} disabled={compare.disabled && !compare.checked} onChange={compare.onToggle} />
            <span>
              {t.compareLabel}
              <span className="visually-hidden"> {product.name}</span>
            </span>
          </label>
        )}
        {onChoose && (
          <button type="button" className="btn btn--primary btn--block" onClick={onChoose}>
            {t.choose}
            <span className="visually-hidden"> {product.name}</span>
          </button>
        )}
      </div>
    </article>
  );
}
