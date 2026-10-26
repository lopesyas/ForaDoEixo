import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { AssistantProvider } from './assistant/AssistantProvider';
import { CartProvider } from './cart/CartProvider';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.location.hash = '';
});

describe('Jornada completa (simulada): da conversa ao pedido', () => {
  it('pedido em linguagem natural, comparação, carrinho, entrega, pagamento e confirmação', async () => {
    window.location.hash = `#/conversa?q=${encodeURIComponent('hidratante até R$ 20')}`;
    render(
      <CartProvider>
        <AssistantProvider>
          <App />
        </AssistantProvider>
      </CartProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Está certo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Seca' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: /Comparar Hidratante Facial/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Comparar Creme Facial/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comparar os dois' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Escolher Hidra Leve' }));
    // A conversa continua aberta: o produto entra na cesta e o aviso oferece "Ver cesta".
    expect(await screen.findByText(/Adicionado à cesta/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver cesta' }));

    // Carrinho
    expect(await screen.findByRole('heading', { name: 'Seu carrinho' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cesta.*\(1 item\)/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    // Endereço
    expect(await screen.findByText('Passo 1 de 3', { selector: 'p' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('CEP'), '50000000');
    await userEvent.type(screen.getByLabelText('Número'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    // Entrega
    expect(await screen.findByText('Passo 2 de 3', { selector: 'p' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Retirar na loja/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    // Pagamento
    expect(await screen.findByText('Passo 3 de 3', { selector: 'p' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Pix' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar compra (simulado)' }));

    // Confirmação honesta sobre a simulação
    expect(await screen.findByRole('heading', { name: /Pedido simulado recebido/ })).toBeInTheDocument();
    expect(screen.getByText(/nenhum pagamento foi feito/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cesta.*\(0 itens\)/ })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).getByText('Hidratante Facial Hidra Leve 50 g')).toBeInTheDocument();
  });

  it('não abre a etapa de pagamento sem endereço: volta para o endereço', async () => {
    sessionStorage.setItem(
      'cart-lines',
      JSON.stringify([{ product: { id: 'p1', name: 'Hidratante', priceCents: 1890, reason: 'x', badges: [] }, qty: 1 }]),
    );
    window.location.hash = '#/finalizar?passo=pagamento';
    render(
      <CartProvider>
        <AssistantProvider>
          <App />
        </AssistantProvider>
      </CartProvider>,
    );
    expect(await screen.findByText('Passo 1 de 3', { selector: 'p' })).toBeInTheDocument();
  });

  it('finalizar com carrinho vazio volta ao carrinho, que explica', async () => {
    window.location.hash = '#/finalizar?passo=endereco';
    render(
      <CartProvider>
        <AssistantProvider>
          <App />
        </AssistantProvider>
      </CartProvider>,
    );
    expect(await screen.findByText('Seu carrinho está vazio.')).toBeInTheDocument();
  });
});
