import { useEffect, useState } from 'react';
import type { ProductCard } from '@ia/shared';
import { defaultCatalog } from '../api';
import type { CatalogClient, Shelf } from '../api/client';
import { ImageSlot } from '../components/ImageSlot/ImageSlot';
import { findImage } from '../components/ImageSlot/images';
import { ProductImage } from '../components/Product/ProductImage';
import { copy } from '../copy';
import { Carousel } from '../layout/Carousel';
import { SectionTitle } from '../layout/SectionTitle';
import { formatBRL, keepUnits } from '../lib/format';
import { AssistantEntry } from './AssistantEntry';

interface Props {
  initialText?: string;
  /** O cliente escreveu no painel de destaque: abre o assistente com esse pedido. */
  onSubmit: (text: string) => void;
  /** Categorias, banners e serviços também são portas para o assistente. */
  onAsk?: (shown: string, actionId: string) => void;
  onAdd?: (product: ProductCard) => void;
  catalog?: CatalogClient;
}

const CATEGORIES: { slot: string; label: string; slug: string }[] = [
  { slot: 'cat-emagrecedores', label: 'Emagrecedores', slug: 'emagrecedores' },
  { slot: 'cat-skincare', label: 'SkinCare', slug: 'skincare' },
  { slot: 'cat-whey', label: 'Whey Protein', slug: 'whey' },
  { slot: 'cat-azia', label: 'Azia e Gastrite', slug: 'azia' },
  { slot: 'cat-protetor-facial', label: 'Protetor Solar Facial', slug: 'protetor-solar-facial' },
  { slot: 'cat-especiais', label: 'Medicamentos especiais', slug: 'especiais' },
];

/** Texto alternativo dos banners que já têm imagem (para leitores de tela). */
const BANNER_ALT: Record<string, string> = {
  'hero-1': 'Esquenta Black Pague Menos: ofertas até 70% de desconto. Exclusivo site e app.',
  'hero-3': 'Top ofertas Pague Menos: Eucerin Dermopure, Sensodyne, Bepantol Derma, Redoxon e Neutrogena Antissinais, com preços de oferta.',
  'hero-2': 'Dauf: quanto mais produtos você leva, maior o desconto. 20% off em 2 produtos, 30% em 3 e 40% em 4 ou mais.',
};

const PROMOS: { slot: string; alt: string; fit: 'cover' | 'contain' }[] = [
  { slot: 'promo-1', alt: 'Dove Cachos Esculturais com ácido linoleico: cachos 100% restaurados por dentro, mais definidos por fora', fit: 'cover' },
  { slot: 'promo-2', alt: 'Kit Dove Shampoo Cachos Esculturais, R$ 28,99', fit: 'contain' },
];

const SERVICES = [
  { slot: 'service-saude', title: 'Serviços de saúde', text: 'Cuidados pensados pra você', action: 'menu:saude' },
  { slot: 'service-vacinas', title: 'Vacinas', text: 'Imunização para todas as idades', action: 'handoff' },
  { slot: 'service-ouro', title: 'Cliente Ouro', text: 'Conheça nosso plano de benefícios', action: 'menu:historico' },
];

const BRANDS = [
  { slot: 'brand-dauf', label: 'dauf', q: 'dauf' },
  { slot: 'brand-pm', label: 'Pague Menos', q: 'pague menos' },
  { slot: 'brand-eco', label: 'ECO', q: 'eco' },
  { slot: 'brand-amoravel', label: 'amorável', q: 'amoravel' },
  { slot: 'brand-ativday', label: 'ATIVDAY', q: 'ativday' },
  { slot: 'brand-powervita', label: 'POWER VITA', q: 'power vita' },
];

function BenefitIcon({ i }: { i: number }) {
  const icons = ['🚚', '📦', '💊', '💳', '⬇'];
  return (
    <span className="benefit__icon" aria-hidden="true">
      {icons[i]}
    </span>
  );
}

function StoreProduct({ product, onAdd }: { product: ProductCard; onAdd: (p: ProductCard) => void }) {
  return (
    <article className="store-product">
      <div className="store-product__img">
        <ProductImage kind={product.image ?? 'box'} id={product.id} category={product.categoryKey} />
      </div>
      <h3 className="store-product__name">
        <a href={`#/p/${encodeURIComponent(product.id)}`}>{keepUnits(product.name)}</a>
      </h3>
      <p className="store-product__brand">{product.reason}</p>
      <div className="store-product__buy">
        <p className="store-product__price">{formatBRL(product.priceCents)}</p>
        {product.pricePerUnitCents !== undefined && product.unitLabel && (
          <p className="store-product__unit">
            {formatBRL(product.pricePerUnitCents)} por {product.unitLabel}
          </p>
        )}
        <button type="button" className="btn btn--primary btn--block store-product__add" onClick={() => onAdd(product)}>
          {copy.store.add}
          <span className="visually-hidden"> {product.name}</span>
        </button>
      </div>
    </article>
  );
}

/** Vitrine no layout da Pague Menos. O assistente aparece no destaque (onde fica o primeiro banner) e em cada porta de entrada. */
export function Home({ initialText = '', onSubmit, onAsk = () => {}, onAdd = () => {}, catalog = defaultCatalog }: Props) {
  const t = copy.store;
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    catalog.featured().then(
      (s) => alive && setShelves(s),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [catalog]);

  return (
    <div className="storefront">
      <section className="storefront__top" aria-label="Assistente de compras">
        <div className="assistant-card">
          <AssistantEntry initialText={initialText} onSubmit={onSubmit} />
        </div>
      </section>

      <ul className="benefits" aria-label="Vantagens">
        {t.benefits.map((b, i) => (
          <li key={b.title} className="benefit">
            <BenefitIcon i={i} />
            <span>
              <strong>{b.title}</strong>
              <span>{b.text}</span>
            </span>
          </li>
        ))}
      </ul>

      <Carousel label="Banners" className="banners">
        {['hero-1', 'hero-2', 'hero-3'].map((slot, i) => (
          <a key={slot} href="#/c/ofertas" className="banner">
            <ImageSlot slot={slot} alt={BANNER_ALT[slot] ?? `Banner ${i + 1}`} ratio="1488 / 322" />
            <span className="visually-hidden">Ver ofertas</span>
          </a>
        ))}
      </Carousel>

      <section aria-labelledby="cat-title" className="block">
        <SectionTitle kicker={t.categoriesKicker} title={t.categoriesTitle} id="cat-title" />
        <Carousel label="Categorias" className="tiles">
          {CATEGORIES.map((c) => (
            <a key={c.slot} href={`#/c/${c.slug}`} className="tile">
              <ImageSlot slot={c.slot} alt="" decorative ratio="3 / 2" />
              <span className="tile__label">{c.label}</span>
            </a>
          ))}
        </Carousel>
      </section>

      {failed && <p className="status block">{t.featuredError}</p>}
      {!failed && !shelves && <p className="hint block">{t.featuredLoading}</p>}
      {shelves?.map((shelf, i) => (
        <section key={shelf.title} aria-labelledby={`shelf-${i}`} className="block">
          <SectionTitle kicker={t.featuredKicker} title={shelf.title} id={`shelf-${i}`} />
          <Carousel label={shelf.title} className="shelf">
            {shelf.products.map((p) => (
              <StoreProduct key={p.id} product={p} onAdd={onAdd} />
            ))}
          </Carousel>
        </section>
      ))}

      <div className="promos">
        {PROMOS.map((promo) => (
          <a key={promo.slot} href="#/c/ofertas" className="banner">
            <ImageSlot slot={promo.slot} alt={promo.alt} ratio="2 / 1" fit={promo.fit} />
            <span className="visually-hidden">Ver ofertas</span>
          </a>
        ))}
      </div>

      <section aria-labelledby="serv-title" className="block">
        <SectionTitle kicker={t.servicesKicker} title={t.servicesTitle} id="serv-title" />
        <ul className="services">
          {SERVICES.map((s) => (
            <li key={s.slot}>
              <button type="button" className="service" onClick={() => onAsk(s.title, s.action)}>
                {findImage(s.slot) ? (
                  // A arte já traz o título e a seta: não desenhamos a barra por cima (duplicaria o texto).
                  <ImageSlot slot={s.slot} alt={`${s.title}. ${s.text}`} ratio="495 / 270" />
                ) : (
                  <>
                    <ImageSlot slot={s.slot} alt="" decorative ratio="495 / 270" />
                    <span className="service__bar">
                      <span>
                        <strong>{s.title}</strong>
                        <span>{s.text}</span>
                      </span>
                      <span aria-hidden="true" className="service__arrow">
                        →
                      </span>
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="brand-title" className="block">
        <SectionTitle kicker={t.brandsKicker} title={t.brandsTitle} id="brand-title" />
        <ul className="brands">
          {BRANDS.map((b) => (
            <li key={b.slot}>
              <a href={`#/busca?q=${encodeURIComponent(b.q)}`} className="brand-tile">
                {findImage(b.slot) ? (
                  // A arte já traz o nome da marca e o "Ver mais": não desenhamos a barra por cima.
                  <ImageSlot slot={b.slot} alt={`${b.label}: ${t.seeMore}`} ratio="233 / 204" />
                ) : (
                  <>
                    <ImageSlot slot={b.slot} alt="" decorative ratio="233 / 204" />
                    <span className="brand-tile__bar">{t.seeMore}</span>
                    <span className="visually-hidden">{b.label}</span>
                  </>
                )}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
