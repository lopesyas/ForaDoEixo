import type { ListedProduct } from '@ia/shared';
import { copy } from '../../copy';
import { formatBRL, keepUnits } from '../../lib/format';
import { ProductImage } from '../Product/ProductImage';

interface Props {
  product: ListedProduct;
  onAdd: (p: ListedProduct) => void;
  onAsk: (shown: string, actionId: string) => void;
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="19" r="1.4" fill="currentColor" />
      <circle cx="17" cy="19" r="1.4" fill="currentColor" />
    </svg>
  );
}

/**
 * Cartão do catálogo, no formato da loja: etiqueta no topo, imagem, nome, marca com o botão de cesta, preço no pé.
 * O botão muda com o tipo: cosmético e remédio sem receita vão à cesta (o remédio ainda tem "Esse produto é para mim?");
 * produto de receita leva ao farmacêutico e nunca tem compra.
 */
export function ListedProductCard({ product: p, onAdd, onAsk }: Props) {
  const t = copy.catalog;
  const href = `#/p/${encodeURIComponent(p.id)}`;
  const tag = p.kind === 'rx' ? t.rxBadge : p.kind === 'otc' ? t.otcBadge : p.categoryLabel;
  return (
    <article className="pcard">
      <p className={`pcard__tag${p.kind === 'rx' ? ' pcard__tag--rx' : ''}`}>{tag}</p>
      {/* A imagem é só um atalho a mais para o mesmo link do nome: fora da leitura e do Tab, para não repetir o destino. */}
      <a href={href} className="pcard__img" aria-hidden="true" tabIndex={-1}>
        <ProductImage kind={p.image ?? 'box'} id={p.id} category={p.categoryKey} />
      </a>
      <h2 className="pcard__name">
        <a href={href}>{keepUnits(p.name)}</a>
      </h2>
      <div className="pcard__row">
        <p className="pcard__brand">{p.company}</p>
        {p.kind === 'rx' ? (
          <button type="button" className="pcard__add" onClick={() => onAsk(t.pharmacist, 'handoff')}>
            {t.pharmacist}
          </button>
        ) : (
          <button type="button" className="pcard__add" onClick={() => onAdd(p)}>
            <CartIcon />
            <span>{t.add}</span>
            <span className="visually-hidden"> {p.name} à cesta</span>
          </button>
        )}
      </div>
      <div className="pcard__buy">
        <p className="pcard__price">{formatBRL(p.priceCents)}</p>
        {p.priceSource === 'cmed' && <p className="pcard__unit">Preço máximo (CMED)</p>}
        {p.pricePerUnitCents !== undefined && p.unitLabel && (
          <p className="pcard__unit">
            {formatBRL(p.pricePerUnitCents)} por {p.unitLabel}
          </p>
        )}
        {p.kind === 'otc' && (
          <button type="button" className="link-btn pcard__check" onClick={() => onAsk(t.forMe, `check:${p.id}`)}>
            {t.forMe}
            <span className="visually-hidden"> {p.name}</span>
          </button>
        )}
      </div>
    </article>
  );
}
