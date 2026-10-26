import type { ListedProduct, ProductDetail } from '@ia/shared';
import { useEffect, useState } from 'react';
import { defaultStore } from '../api';
import type { StoreClient } from '../api/store';
import { AskAboutProduct } from '../components/Catalog/AskAboutProduct';
import { ProductImage } from '../components/Product/ProductImage';
import { copy } from '../copy';
import { formatBRL, keepUnits } from '../lib/format';

interface Props {
  id: string;
  store?: StoreClient;
  onAdd: (product: ListedProduct) => void;
  onAsk: (shown: string, actionId: string) => void;
}

/** Página do produto: dados do cadastro, compra e perguntas à IA sobre aquele produto. */
export function ProductPage({ id, store = defaultStore, onAdd, onAsk }: Props) {
  const t = copy.product;
  const c = copy.catalog;
  const [p, setP] = useState<ProductDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    store.detail(id).then(
      (d) => alive && (setP(d), setState('ok')),
      (e: Error) => alive && setState(/404/.test(e.message) ? 'missing' : 'error'),
    );
    return () => {
      alive = false;
    };
  }, [id, store]);

  if (state === 'loading') return <p className="hint">{c.loading}</p>;
  if (state === 'missing' || state === 'error' || !p) {
    return (
      <div className="empty">
        <h1>{state === 'missing' ? t.notFound : c.error}</h1>
        <div className="stack">
          <a className="btn btn--primary" href="#/">
            {t.back}
          </a>
          <button type="button" className="btn" onClick={() => onAsk(c.askAssistant, 'menu')}>
            {c.askAssistant}
          </button>
        </div>
      </div>
    );
  }
  const check = () => onAsk(c.forMe, `check:${p.id}`);

  return (
    <article className="pdp">
      <nav aria-label="Você está em" className="crumbs">
        <a href="#/">Início</a> <span aria-hidden="true">›</span> <span>{p.categoryLabel}</span>
      </nav>
      <div className="pdp__main">
        <div className="pdp__img">
          <ProductImage kind={p.image ?? 'box'} id={p.id} category={p.categoryKey} />
        </div>
        <div className="pdp__buy">
          <p className="store-product__brand">{p.company}</p>
          <h1>{keepUnits(p.name)}</h1>
          {p.kind !== 'cosmetic' && <p className={`badge ${p.kind === 'rx' ? 'badge--warning' : 'badge--neutral'}`}>{p.kind === 'rx' ? c.rxBadge : c.otcBadge}</p>}
          <p className="store-product__price pdp__price">{formatBRL(p.priceCents)}</p>
          {p.priceSource === 'cmed' && (
            <p className="store-product__unit">
              Preço máximo ao consumidor (CMED){p.presentation ? `, apresentação: ${p.presentation}` : ''}
            </p>
          )}
          {p.pricePerUnitCents !== undefined && p.unitLabel && (
            <p className="store-product__unit">
              {formatBRL(p.pricePerUnitCents)} por {p.unitLabel}
            </p>
          )}
          {p.notice && <p className="status">{p.notice}</p>}
          <div className="stack">
            {p.kind === 'cosmetic' && (
              <button type="button" className="btn btn--primary btn--block" onClick={() => onAdd(p)}>
                {c.addToCart}
              </button>
            )}
            {p.kind === 'otc' && (
              <>
                <button type="button" className="btn btn--primary btn--block" onClick={check}>
                  {c.forMe}
                </button>
                <button type="button" className="btn btn--block" onClick={() => onAdd(p)}>
                  {c.addToCart}
                </button>
              </>
            )}
            {p.kind === 'rx' && (
              <button type="button" className="btn btn--primary btn--block" onClick={() => onAsk(c.pharmacist, 'handoff')}>
                {c.pharmacist}
              </button>
            )}
          </div>
        </div>
      </div>

      <section aria-labelledby="facts-title" className="pdp__facts">
        <h2 id="facts-title">{t.facts}</h2>
        <dl>
          {p.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
          <div>
            <dt>{t.registration}</dt>
            <dd>{p.registration}</dd>
          </div>
        </dl>
      </section>

      <AskAboutProduct product={p} store={store} onCheck={check} />
    </article>
  );
}
