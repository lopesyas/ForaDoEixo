import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProductCard } from '@ia/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { CartProvider, MAX_QTY, useCart } from './CartProvider';

const product: ProductCard = { id: 'p1', name: 'Hidratante Facial Hidra Leve 50 g', priceCents: 1890, reason: 'x', badges: [] };

function AddButton() {
  const { add, count } = useCart();
  return (
    <button type="button" onClick={() => add(product)}>
      adicionar ({count})
    </button>
  );
}
const wrap = (ui: React.ReactNode) => render(<CartProvider>{ui}</CartProvider>);

beforeEach(() => sessionStorage.clear());

describe('Carrinho', () => {
  it('adicionar o mesmo produto de novo aumenta a quantidade, sem duplicar a linha', async () => {
    wrap(
      <>
        <AddButton />
        <CartPage onContinue={() => {}} onSearch={() => {}} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: /adicionar/ }));
    await userEvent.click(screen.getByRole('button', { name: /adicionar/ }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('2');
  });

  it('carrinho vazio explica e oferece o próximo passo', async () => {
    const onSearch = vi.fn();
    wrap(<CartPage onContinue={() => {}} onSearch={onSearch} />);
    expect(screen.getByText('Seu carrinho está vazio.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Buscar produtos' }));
    expect(onSearch).toHaveBeenCalled();
  });

  it('o limite de quantidade é explicado em vez de falhar em silêncio', async () => {
    wrap(
      <>
        <AddButton />
        <CartPage onContinue={() => {}} onSearch={() => {}} />
      </>,
    );
    for (let i = 0; i < MAX_QTY + 2; i++) await userEvent.click(screen.getByRole('button', { name: /adicionar/ }));
    expect(screen.getByText(/Máximo de 10 unidades/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Mais/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('"Menos" na última unidade tira o produto do carrinho', async () => {
    wrap(
      <>
        <AddButton />
        <CartPage onContinue={() => {}} onSearch={() => {}} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: /adicionar/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Menos/ }));
    expect(screen.getByText('Seu carrinho está vazio.')).toBeInTheDocument();
  });

  it('o total soma produtos e mostra a entrega como "a calcular" até escolher', async () => {
    wrap(
      <>
        <AddButton />
        <CartPage onContinue={() => {}} onSearch={() => {}} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: /adicionar/ }));
    const totals = screen.getByRole('complementary', { name: 'Resumo do pedido' });
    expect(within(totals).getByText('a calcular')).toBeInTheDocument();
    expect(within(totals).getAllByText(/R\$\s*18,90/).length).toBeGreaterThan(0);
  });

  it('carrinho guardado com dado inválido vira carrinho vazio, sem quebrar', () => {
    sessionStorage.setItem('cart-lines', '[{"product":{"id":1},"qty":"x"}]');
    wrap(<CartPage onContinue={() => {}} onSearch={() => {}} />);
    expect(screen.getByText('Seu carrinho está vazio.')).toBeInTheDocument();
  });
});

describe('Revisão do carrinho', () => {
  it('mostra os achados da revisão e leva à conferência de segurança do produto', async () => {
    const { createMockStore } = await import('../api/store');
    const onAsk = vi.fn();
    sessionStorage.setItem('cart-lines', JSON.stringify([{ product: { ...product, id: 'p2', name: 'Analgésico Exemplo' }, qty: 1 }]));
    wrap(<CartPage onContinue={() => {}} onSearch={() => {}} onAsk={onAsk} store={createMockStore()} />);
    expect(await screen.findByRole('heading', { name: /Revisão do seu carrinho/ })).toBeInTheDocument();
    expect(screen.getByText(/Lembrete:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Esse produto é para mim\?/ }));
    expect(onAsk).toHaveBeenCalledWith('Esse produto é para mim?', 'check:p2');
  });

  it('sem achados, não aparece nada; se a revisão falhar, a compra segue', async () => {
    const { createMockStore } = await import('../api/store');
    const broken = { ...createMockStore(), review: async () => Promise.reject(new Error('fora')) };
    sessionStorage.setItem('cart-lines', JSON.stringify([{ product, qty: 1 }]));
    wrap(<CartPage onContinue={() => {}} onSearch={() => {}} store={broken} />);
    expect(await screen.findByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Revisão do seu carrinho/ })).not.toBeInTheDocument();
  });
});

describe('Finalização', () => {
  function Seeded({ step, onStep = () => {}, onDone = () => {} }: { step: 'endereco' | 'entrega' | 'pagamento'; onStep?: (s: string) => void; onDone?: () => void }) {
    const { add, lines } = useCart();
    if (lines.length === 0) {
      add(product);
      return null;
    }
    return <CheckoutPage step={step} onStep={onStep} onBackToCart={() => {}} onDone={onDone} />;
  }

  it('endereço: erros ditos em palavras, e só segue com CEP de 8 números e número', async () => {
    const onStep = vi.fn();
    wrap(<Seeded step="endereco" onStep={onStep} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/Digite os 8 números do CEP/)).toBeInTheDocument();
    expect(screen.getByText(/Digite o número ou S\/N/)).toBeInTheDocument();
    expect(screen.getByLabelText('CEP')).toHaveAttribute('aria-invalid', 'true');
    expect(onStep).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('CEP'), '50000000');
    expect(screen.getByLabelText('CEP')).toHaveValue('50000-000');
    await userEvent.type(screen.getByLabelText('Número'), 'S/N');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onStep).toHaveBeenCalledWith('entrega');
  });

  it('o campo "Complemento" é opcional', async () => {
    wrap(<Seeded step="endereco" />);
    await screen.findByLabelText('Complemento (opcional)');
    expect(screen.getByLabelText('Complemento (opcional)')).not.toBeRequired();
  });

  it('entrega: exige escolha e o frete entra no total', async () => {
    wrap(<Seeded step="entrega" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/Escolha uma forma de receber/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Entrega em casa/ }));
    const totals = screen.getByRole('complementary', { name: 'Resumo do pedido' });
    expect(within(totals).getByText(/R\$\s*9,90/)).toBeInTheDocument();
    expect(within(totals).getByText(/R\$\s*28,80/)).toBeInTheDocument();
  });

  it('pagamento é simulado: não pede dado de cartão e o botão diz isso', async () => {
    const onDone = vi.fn();
    wrap(<Seeded step="pagamento" onDone={onDone} />);
    const finish = await screen.findByRole('button', { name: 'Finalizar compra (simulado)' });
    expect(screen.getByText(/Nenhum dado de cartão é pedido/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await userEvent.click(finish);
    expect(screen.getByText(/Escolha uma forma de pagar/)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('radio', { name: 'Pix' }));
    await userEvent.click(finish);
    expect(onDone).toHaveBeenCalled();
  });
});
