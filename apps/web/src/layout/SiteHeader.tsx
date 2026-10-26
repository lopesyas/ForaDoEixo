import { useState, type FormEvent } from 'react';
import { AccessibilityBar } from '../a11y/AccessibilityBar';
import { useCart } from '../cart/CartProvider';
import { FormField } from '../components/Form/FormField';
import { ImageSlot } from '../components/ImageSlot/ImageSlot';
import { Logo } from '../components/Logo/Logo';
import { copy } from '../copy';
import { formatBRL } from '../lib/format';
import { isValidCep } from '../pages/CheckoutPage';

interface Props {
  /** A busca do cabeçalho é a porta de entrada do assistente. */
  onSearch: (text: string) => void;
  onAsk: (shown: string, actionId: string) => void;
  onNavigate: (hash: string) => void;
  showBanner: boolean;
}

/** Menu de categorias: cada item abre a listagem de verdade. Só "Serviços de Saúde" conversa (não é produto). */
const NAV: { label: string; slug?: string; action?: string }[] = [
  { label: 'Ofertas', slug: 'ofertas' },
  { label: 'Medicamentos e Saúde', slug: 'medicamentos' },
  { label: 'Dermo e Beleza', slug: 'dermo' },
  { label: 'Mamães e bebês', slug: 'mamaes' },
  { label: 'Higiene pessoal', slug: 'higiene' },
  { label: 'Vida Saudável', slug: 'vida-saudavel' },
  { label: 'Conveniência', slug: 'conveniencia' },
  { label: 'Serviços de Saúde', action: 'menu:saude' },
  { label: 'Marcas Exclusivas', slug: 'marcas' },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CepButton() {
  const { checkout, updateCheckout } = useCart();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const t = copy.store;

  function save(e: FormEvent) {
    e.preventDefault();
    if (!isValidCep(checkout.cep)) return setError(t.cepError);
    setError('');
    setOpen(false);
  }

  return (
    <div className="cep">
      <button type="button" className="cep__btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">⌖</span> {isValidCep(checkout.cep) ? `CEP ${checkout.cep}` : t.cep}
      </button>
      {open && (
        <form className="cep__pop" onSubmit={save} noValidate>
          <FormField
            id="header-cep"
            label={t.cepLabel}
            hint="São 8 números. Exemplo: 50000-000"
            error={error}
            inputMode="numeric"
            autoComplete="postal-code"
            value={checkout.cep}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '').slice(0, 8);
              updateCheckout({ cep: d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d });
            }}
          />
          <button type="submit" className="btn btn--primary btn--block">
            {t.cepSave}
          </button>
        </form>
      )}
    </div>
  );
}

export function SiteHeader({ onSearch, onAsk, onNavigate, showBanner }: Props) {
  const cart = useCart();
  const [text, setText] = useState('');
  const t = copy.store;

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    onSearch(q);
    setText('');
  }

  return (
    <header className="site-header2">
      {showBanner && (
        <div className="topbanner">
          <div className="container">
            <ImageSlot slot="topbanner" alt="Dove Cica Pantenol, sérum multirreparador, desenvolvido para mais de 20 condições de pele. Experimente!" ratio="1918 / 75" fit="contain" />
          </div>
        </div>
      )}

      <div className="utility">
        <div className="container utility__inner">
          <a className="utility__link" href="#/">
            {t.topLinks.stores}
          </a>
          <a className="utility__link" href="#/">
            {t.topLinks.app}
          </a>
          <button type="button" className="utility__link utility__help" onClick={() => onAsk(copy.humanHelp, 'handoff')}>
            {copy.humanHelp}
          </button>
          <AccessibilityBar readTargetId="main" />
        </div>
      </div>

      <div className="masthead">
        <div className="container masthead__inner">
          <a href="#/" className="masthead__logo" aria-label="Pague Menos — página inicial">
            <Logo />
          </a>

          <form className="search" role="search" onSubmit={submit}>
            <label htmlFor="site-search" className="visually-hidden">
              {t.searchLabel}
            </label>
            <span className="search__icon">
              <SearchIcon />
            </span>
            <input id="site-search" className="search__input" type="text" autoComplete="off" placeholder={t.searchPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="search__btn">
              {t.searchButton}
            </button>
          </form>

          <CepButton />

          <button type="button" className="account" onClick={() => onAsk('Meu histórico', 'menu:historico')}>
            <span className="account__icon" aria-hidden="true">
              ◔
            </span>
            <span className="account__text">
              <span>{t.welcome}</span>
              <strong>{t.login}</strong>
            </span>
          </button>

          <a href="#/carrinho" className="basket" onClick={(e) => (e.preventDefault(), onNavigate('#/carrinho'))}>
            <span className="basket__icon" aria-hidden="true">
              🛒
              {cart.count > 0 && <span className="basket__badge">{cart.count}</span>}
            </span>
            <span className="basket__text">
              <span>{t.basket}</span>
              <strong>{formatBRL(cart.subtotalCents)}</strong>
              <span className="visually-hidden">
                {' '}
                ({cart.count} {cart.count === 1 ? 'item' : 'itens'})
              </span>
            </span>
          </a>
        </div>
      </div>

      <nav className="catnav" aria-label="Categorias">
        <ul className="container catnav__list">
          {NAV.map((item, i) => (
            <li key={item.label}>
              {item.slug ? (
                <a href={`#/c/${item.slug}`} className={`catnav__item${i === 0 ? ' catnav__item--offer' : ''}`}>
                  {item.label}
                </a>
              ) : (
                <button type="button" className="catnav__item" onClick={() => onAsk(item.label, item.action!)}>
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
