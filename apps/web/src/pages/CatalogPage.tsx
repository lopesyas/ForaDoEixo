import type { FilterState, ListedProduct, ProductList } from '@ia/shared';
import { useEffect, useMemo, useState } from 'react';
import { defaultStore } from '../api';
import type { StoreClient } from '../api/store';
import { AiFilterBar } from '../components/Catalog/AiFilterBar';
import { FilterPanel } from '../components/Catalog/FilterPanel';
import { ListedProductCard } from '../components/Catalog/ListedProductCard';
import { copy } from '../copy';
import { Carousel } from '../layout/Carousel';
import { ImageSlot } from '../components/ImageSlot/ImageSlot';
import { catalogHash, filtersFromParams, PRESETS } from '../lib/catalogRoutes';
import { formatBRL } from '../lib/format';

interface Props {
  /** Categoria da loja ("skincare", "azia"…) ou "" para a busca livre. */
  slug: string;
  params: URLSearchParams;
  store?: StoreClient;
  onNavigate: (hash: string) => void;
  onAsk: (shown: string, actionId: string) => void;
  onAdd: (product: ListedProduct) => void;
}

/** Banners das categorias. Para trocar ou incluir, coloque o arquivo em assets/img com o nome do espaço. */
const CATALOG_BANNERS = [
  { slot: 'catalog-banner-1', alt: 'DUX Creatina: aumento de força e potência nos treinos, aceleração da recuperação entre as séries.' },
  { slot: 'catalog-banner-2', alt: 'Piracanjuba Excellence Total Care: suporte nutricional durante o uso de análogos de GLP-1 e para pacientes bariátricos.' },
  { slot: 'catalog-banner-3', alt: 'Pague Menos: a gente leva o cuidado até você, compre seus medicamentos com receita e receba em casa.' },
  { slot: 'catalog-banner-4', alt: 'Dauf: conheça a nova linha de cuidado facial.' },
];

const SORT_LABEL: Record<string, string> = { price: 'menor preço primeiro', unit: 'mais barato por 100 g ou ml primeiro', name: 'ordem alfabética' };

/** Listagem do catálogo: filtros manuais + filtro por frase (IA) + chips que mostram, e deixam remover, o que foi aplicado. */
export function CatalogPage({ slug, params, store = defaultStore, onNavigate, onAsk, onAdd }: Props) {
  const t = copy.catalog;
  const preset = PRESETS[slug];
  const paramKey = params.toString();
  const filters = useMemo(() => filtersFromParams(params, preset), [paramKey, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const fromAi = params.get('ai') === '1';
  const [data, setData] = useState<ProductList | null>(null);
  const [failed, setFailed] = useState(false);
  const [aiPending, setAiPending] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    store.list(filters).then(
      (d) => alive && setData(d),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [filters, store]);

  const title = preset?.title ?? (filters.q ? `Resultados para "${filters.q}"` : 'Todos os produtos');

  function go(patch: Partial<FilterState>) {
    const next = { ...filters, ...patch };
    const extra: Record<string, string> = {};
    if (fromAi) extra.ai = '1';
    if (patch.cat && patch.cat.length === 0) extra.cat = ''; // "sem nenhuma categoria" tem que ser explícito, senão a categoria da página volta
    onNavigate(catalogHash(slug, next, extra));
  }

  async function askAi(text: string) {
    setAiPending(true);
    try {
      const r = await store.interpret(text);
      if (r.route === 'assistant') onAsk(text, `say:${text}`);
      else onNavigate(catalogHash('', r.filters, { ai: '1' }));
    } catch {
      onAsk(text, `say:${text}`); // IA indisponível: a conversa por regras ainda atende
    } finally {
      setAiPending(false);
    }
  }

  const label = (key: string) => data?.facets.categories.find((c) => c.key === key)?.label ?? key.replace(/_/g, ' ');
  const chips: { id: string; label: string; remove: () => void }[] = [
    ...filters.cat.filter((c) => c !== 'sem_catalogo').map((c) => ({ id: `cat:${c}`, label: label(c), remove: () => go({ cat: filters.cat.filter((x) => x !== c).length ? filters.cat.filter((x) => x !== c) : [] }) })),
    ...(filters.q ? [{ id: 'q', label: `"${filters.q}"`, remove: () => go({ q: '' }) }] : []),
    ...(filters.maxCents ? [{ id: 'max', label: `até ${formatBRL(filters.maxCents)}`, remove: () => go({ maxCents: undefined }) }] : []),
    ...(filters.skin ? [{ id: 'skin', label: `pele ${filters.skin === 'sensivel' ? 'sensível' : filters.skin}`, remove: () => go({ skin: undefined }) }] : []),
    ...(filters.company ? [{ id: 'company', label: filters.company, remove: () => go({ company: undefined }) }] : []),
    ...(filters.sort !== 'relevance' && SORT_LABEL[filters.sort] ? [{ id: 'sort', label: SORT_LABEL[filters.sort]!, remove: () => go({ sort: 'relevance' }) }] : []),
  ];

  const noCatalog = filters.cat.includes('sem_catalogo');

  return (
    <div className="catalog">
      <div className="catalog__head">
        <nav aria-label="Você está em" className="crumbs">
          <a href="#/" className="crumbs__home">
            <span aria-hidden="true">⌂</span> Início
          </a>{' '}
          <span aria-hidden="true">›</span> <span>{title}</span>
        </nav>
        {/* Carrossel de banners em todas as categorias: rolagem manual (sem troca automática). */}
        <Carousel label="Banners da categoria" className="catalog__banners">
          {CATALOG_BANNERS.map((b) => (
            <a key={b.slot} href="#/c/ofertas" className="banner">
              <ImageSlot slot={b.slot} alt={b.alt} ratio="886 / 101" />
              <span className="visually-hidden">Ver ofertas</span>
            </a>
          ))}
        </Carousel>
        <AiFilterBar onSubmit={askAi} pending={aiPending} />
        {fromAi && chips.length > 0 && <p className="hint">{t.aiUnderstood}</p>}
        {chips.length > 0 && (
          <ul className="chips" aria-label="Filtros aplicados">
            {chips.map((c) => (
              <li key={c.id}>
                <button type="button" className="chip" onClick={c.remove} aria-label={t.removeFilter(c.label)}>
                  {c.label} <span aria-hidden="true">✕</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="link-btn" onClick={() => onNavigate(catalogHash(slug, { cat: preset?.cat ?? [] }))}>
                {t.clear}
              </button>
            </li>
          </ul>
        )}
      </div>

      <div className="catalog__body">
        <aside className="catalog__side" aria-label={t.filters}>
          <div className="catalog__title">
            <h1>{title}</h1>
          </div>
          {preset?.note && <p className="status">{preset.note}</p>}
          {data && <FilterPanel filters={filters} facets={data.facets} onChange={go} />}
        </aside>
        <section className="catalog__results" aria-live="polite">
          {failed && <p className="status">{t.error}</p>}
          {!failed && !data && <p className="hint">{t.loading}</p>}
          {data && (
            <>
              <div className="catalog__bar">
                <p className="catalog__count">{t.showing(data.products.length, data.total)}</p>
                <div className="sortpill">
                  <label htmlFor="f-sort">{t.sortBy}</label>
                  <select id="f-sort" value={filters.sort} onChange={(e) => go({ sort: e.target.value as FilterState['sort'] })}>
                    {t.sortOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {data.total === 0 ? (
                <div className="empty">
                  <h2>{noCatalog ? title : t.emptyTitle}</h2>
                  <p>{noCatalog ? (preset?.note ?? t.emptyText) : t.emptyText}</p>
                  <div className="stack">
                    <button type="button" className="btn btn--primary" onClick={() => onAsk(t.askAssistant, `say:${filters.q || title}`)}>
                      {t.askAssistant}
                    </button>
                    {!noCatalog && (
                      <button type="button" className="btn" onClick={() => onNavigate(catalogHash(slug, { cat: preset?.cat ?? [] }))}>
                        {t.clear}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="plp-grid">
                    {data.products.map((p) => (
                      <ListedProductCard key={p.id} product={p} onAdd={onAdd} onAsk={onAsk} />
                    ))}
                  </div>
                  {data.total > data.products.length && <p className="hint">{t.capped(data.products.length)}</p>}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
