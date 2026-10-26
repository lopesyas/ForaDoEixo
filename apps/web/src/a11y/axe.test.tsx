import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { AssistantProvider } from '../assistant/AssistantProvider';
import { CartProvider } from '../cart/CartProvider';

/**
 * Verificação automática de acessibilidade (axe-core) em cada tela e estado importante.
 * O contraste de cor não é calculável no jsdom: ele é garantido separadamente pelos testes dos tokens (WCAG AA).
 */
async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

const product = { id: 'p1', name: 'Hidratante Facial Hidra Leve 50 g', priceCents: 1890, reason: 'x', badges: [] };
const mount = (hash: string) => {
  window.location.hash = hash;
  return render(
    <CartProvider>
      <AssistantProvider>
        <App />
      </AssistantProvider>
    </CartProvider>,
  );
};

beforeEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
  localStorage.clear();
  window.location.hash = '';
});

describe('Acessibilidade automática (axe-core)', () => {
  it('o verificador está ativo: ele reprova um botão sem nome e uma imagem sem alternativa', async () => {
    document.body.innerHTML = '<main><button></button><img src="x.png"></main>';
    const found = await violations();
    expect(found.join('\n')).toMatch(/button-name/);
    expect(found.join('\n')).toMatch(/image-alt/);
  });

  it('Home', async () => {
    mount('#/');
    await screen.findByRole('heading', { name: 'O que você procura hoje?' });
    expect(await violations()).toEqual([]);
  });

  it('Conversa: confirmação, pergunta, opções e comparação', async () => {
    mount(`#/conversa?q=${encodeURIComponent('hidratante até R$ 20')}`);
    await screen.findByRole('button', { name: 'Está certo' });
    expect(await violations()).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Está certo' }));
    await screen.findByRole('button', { name: 'Seca' });
    expect(await violations()).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Seca' }));
    await screen.findByRole('checkbox', { name: /Comparar Hidratante/ });
    expect(await violations()).toEqual([]);

    await userEvent.click(screen.getByRole('checkbox', { name: /Comparar Hidratante/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Comparar Creme/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comparar os dois' }));
    await screen.findByRole('button', { name: 'Escolher Hidra Leve' });
    expect(await violations()).toEqual([]);
  });

  it('Saúde: pergunta de múltipla escolha e os três níveis de aviso', async () => {
    mount(`#/conversa?q=${encodeURIComponent('meu pai está com dor de cabeça')}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Está certo' }));
    await screen.findByRole('checkbox', { name: 'Tem pressão alta' });
    expect(await violations()).toEqual([]);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tem pressão alta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('region', { name: 'Atenção' });
    expect(await violations()).toEqual([]);
  });

  it.each([
    ['vermelho', 'quero amoxicilina'],
    ['alerta', 'estou com dor no peito'],
  ])('Aviso de segurança: nível %s', async (_n, text) => {
    mount(`#/conversa?q=${encodeURIComponent(text)}`);
    await screen.findByText('Por quê?');
    expect(await violations()).toEqual([]);
  });

  it('Catálogo: listagem, categoria sem produtos e página do produto', async () => {
    mount('#/c/skincare');
    await screen.findByRole('heading', { name: 'SkinCare', level: 1 });
    await screen.findByText(/^Mostrando \d+/);
    expect(await violations()).toEqual([]);

    document.body.innerHTML = '';
    mount('#/c/whey');
    await screen.findByText(/ainda não está no catálogo/);
    expect(await violations()).toEqual([]);

    document.body.innerHTML = '';
    mount('#/p/p2');
    await screen.findByRole('heading', { name: /Analgésico Exemplo/, level: 1 });
    expect(await violations()).toEqual([]);
  });

  it('Carrinho vazio e com item', async () => {
    mount('#/carrinho');
    await screen.findByText('Seu carrinho está vazio.');
    expect(await violations()).toEqual([]);
  });

  it('Carrinho com item e as três etapas, inclusive com erros de formulário', async () => {
    sessionStorage.setItem('cart-lines', JSON.stringify([{ product, qty: 1 }]));
    mount('#/carrinho');
    await screen.findByRole('heading', { name: 'Seu carrinho' });
    expect(await violations()).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByLabelText('CEP');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' })); // gera erros
    await screen.findByText(/Digite os 8 números do CEP/);
    expect(await violations()).toEqual([]);

    await userEvent.type(screen.getByLabelText('CEP'), '50000000');
    await userEvent.type(screen.getByLabelText('Número'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('radio', { name: /Entrega em casa/ });
    expect(await violations()).toEqual([]);

    await userEvent.click(screen.getByRole('radio', { name: /Entrega em casa/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('radio', { name: 'Pix' });
    expect(await violations()).toEqual([]);

    await userEvent.click(screen.getByRole('radio', { name: 'Pix' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar compra (simulado)' }));
    await screen.findByRole('heading', { name: /Pedido simulado recebido/ });
    expect(await violations()).toEqual([]);
  });
});
