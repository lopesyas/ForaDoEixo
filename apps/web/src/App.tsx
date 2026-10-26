import { useEffect, useRef, useState } from 'react';
import { AssistantPanel } from './assistant/AssistantPanel';
import { useAssistant } from './assistant/AssistantProvider';
import { defaultStore } from './api';
import { useCart } from './cart/CartProvider';
import { catalogHash } from './lib/catalogRoutes';
import { CatalogPage } from './pages/CatalogPage';
import { ProductPage } from './pages/ProductPage';
import { copy } from './copy';
import { AddedToast } from './layout/AddedToast';
import { SiteFooter } from './layout/SiteFooter';
import { SiteHeader } from './layout/SiteHeader';
import { useHashRoute } from './lib/useHashRoute';
import { CartPage } from './pages/CartPage';
import { CheckoutPage, isValidCep, type Step } from './pages/CheckoutPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { Home } from './pages/Home';

const STEPS: Step[] = ['endereco', 'entrega', 'pagamento'];

export function App() {
  const { path: hashPath, params, navigate } = useHashRoute();
  // Ao finalizar, o carrinho esvazia antes de a rota mudar: sem isto, a tela mandaria de volta ao carrinho vazio.
  const [placed, setPlaced] = useState(false);
  const path = hashPath === '/finalizar' && placed ? '/confirmacao' : hashPath;
  useEffect(() => {
    if (hashPath !== '/finalizar') setPlaced(false);
  }, [hashPath]);
  const cart = useCart();
  const assistant = useAssistant();
  const mainRef = useRef<HTMLElement>(null);
  const [dismissedTick, setDismissedTick] = useState(0);
  const q = params.get('q') ?? '';
  const stepParam = params.get('passo');
  const step: Step = STEPS.includes(stepParam as Step) ? (stepParam as Step) : 'endereco';

  // Ao trocar de tela (ou de etapa), volta ao topo e leva o foco para o conteúdo (teclado e leitor de tela).
  const screenKey = `${path}|${path === '/finalizar' ? step : ''}`;
  useEffect(() => {
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [screenKey]);

  // Etapas só abrem na ordem: sem endereço não há entrega, sem entrega não há pagamento.
  const blockedStep: Step | null =
    path !== '/finalizar'
      ? null
      : step !== 'endereco' && !(isValidCep(cart.checkout.cep) && cart.checkout.number.trim())
        ? 'endereco'
        : step === 'pagamento' && !cart.checkout.shipping
          ? 'entrega'
          : null;
  const emptyCheckout = path === '/finalizar' && cart.lines.length === 0;

  useEffect(() => {
    if (emptyCheckout) navigate('#/carrinho');
    else if (blockedStep) navigate(`#/finalizar?passo=${blockedStep}`);
  }, [emptyCheckout, blockedStep, navigate]);

  const goHome = () => navigate('#/');

  // Atalho antigo (#/conversa?q=…): abre o assistente com o pedido e volta para a vitrine.
  const a = params.get('a');
  useEffect(() => {
    if (path !== '/conversa' || (!q && !a)) return;
    assistant.ask(q || undefined, a ? { actionId: a } : { text: q });
    navigate('#/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, q, a]);

  const askAction = (shown: string, actionId: string) => assistant.ask(shown, { actionId });

  // Busca do cabeçalho: a IA entende a frase. Catálogo e filtros para produtos; conversa para saúde, receita e emergência.
  async function search(text: string) {
    try {
      const r = await defaultStore.interpret(text);
      if (r.route === 'catalog') return navigate(catalogHash('', r.filters, { ai: '1' }));
    } catch {
      /* IA ou API fora do ar: a conversa por regras atende */
    }
    assistant.ask(text, { text });
  }

  let page;
  if (path.startsWith('/c/') || path === '/busca') {
    page = <CatalogPage key={`${path}?${params.toString()}`} slug={path.startsWith('/c/') ? path.slice(3) : ''} params={params} onNavigate={navigate} onAsk={askAction} onAdd={(p) => cart.add(p)} />;
  } else if (path.startsWith('/p/')) {
    page = <ProductPage key={path} id={decodeURIComponent(path.slice(3))} onAdd={(p) => cart.add(p)} onAsk={askAction} />;
  } else if (path === '/carrinho') {
    page = <CartPage onContinue={() => navigate('#/finalizar?passo=endereco')} onSearch={goHome} onAsk={askAction} />;
  } else if (path === '/finalizar' && !emptyCheckout && !blockedStep) {
    page = (
      <CheckoutPage
        step={step}
        onStep={(next) => navigate(`#/finalizar?passo=${next}`)}
        onBackToCart={() => navigate('#/carrinho')}
        onDone={() => {
          setPlaced(true);
          navigate('#/confirmacao');
        }}
      />
    );
  } else if (path === '/confirmacao') {
    page = <ConfirmationPage onAnother={goHome} />;
  } else {
    page = <Home onSubmit={(text) => assistant.ask(text, { text })} onAsk={askAction} onAdd={(product) => cart.add(product)} />;
  }

  return (
    <div className="app">
      <SiteHeader showBanner={path === '/'} onSearch={search} onAsk={askAction} onNavigate={navigate} />
      <main id="main" ref={mainRef} tabIndex={-1} className="app__main container">
        {page}
      </main>
      <SiteFooter onAsk={askAction} />

      {cart.lastAdded && cart.addedTick > dismissedTick && !assistant.open && path !== '/carrinho' && (
        <AddedToast name={cart.lastAdded} onClose={() => setDismissedTick(cart.addedTick)} onView={() => (setDismissedTick(cart.addedTick), navigate('#/carrinho'))} />
      )}

      {/* Assistente: abre por cima de qualquer página; a conversa continua enquanto a pessoa navega. */}
      <AssistantPanel onGoToCart={() => navigate('#/carrinho')} />
      {!assistant.open && (
        <aside aria-label="Assistente de compras" className="fab-wrap">
          <button type="button" className="fab" onClick={() => assistant.show()}>
            <span className="fab__icon" aria-hidden="true">
              ✚
            </span>
            {copy.assistant.open}
          </button>
        </aside>
      )}
    </div>
  );
}
