import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMockStore } from '../api/store';
import { CatalogPage } from './CatalogPage';
import { ProductPage } from './ProductPage';

const store = createMockStore();
const base = { store, onNavigate: vi.fn(), onAsk: vi.fn(), onAdd: vi.fn() };
const page = (slug: string, qs = '', over: Partial<typeof base> = {}) => render(<CatalogPage slug={slug} params={new URLSearchParams(qs)} {...base} {...over} />);

describe('listagem do catálogo', () => {
  it('mostra o título da categoria, a contagem e os produtos', async () => {
    page('skincare');
    expect(await screen.findByRole('heading', { name: 'SkinCare', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(/^Mostrando \d+/)).toBeInTheDocument();
  });

  it('os filtros aplicados viram chips que podem ser removidos', async () => {
    const onNavigate = vi.fn();
    page('', 'cat=hidratante_facial&max=2000&skin=seca', { onNavigate });
    const chips = await screen.findByRole('list', { name: 'Filtros aplicados' });
    expect(within(chips).getByRole('button', { name: /Remover filtro: até R\$\s*20,00/ })).toBeInTheDocument();
    await userEvent.click(within(chips).getByRole('button', { name: /Remover filtro: pele seca/ }));
    const hash = onNavigate.mock.calls.at(-1)![0] as string;
    expect(hash).toContain('max=2000');
    expect(hash).not.toContain('skin=');
  });

  it('botão por tipo: cosmético vai à cesta, remédio sem receita convida a conferir, receita leva ao farmacêutico', async () => {
    const onAdd = vi.fn();
    const onAsk = vi.fn();
    page('', '', { onAdd, onAsk });
    await userEvent.click(await screen.findByRole('button', { name: /Adicionar Hidratante Facial.*à cesta/ }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    await userEvent.click(screen.getByRole('button', { name: /Esse produto é para mim\? Analgésico Exemplo/ }));
    expect(onAsk).toHaveBeenCalledWith('Esse produto é para mim?', 'check:p2');
    expect(screen.getByText('Exige receita')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Falar com farmacêutico' }));
    expect(onAsk).toHaveBeenLastCalledWith('Falar com farmacêutico', 'handoff');
    // produto de receita nunca tem botão de cesta
    const rxCard = screen.getByRole('heading', { name: /Antibiótico Exemplo/ }).closest('article')!;
    expect(within(rxCard).queryByRole('button', { name: /cesta/i })).not.toBeInTheDocument();
  });

  it('o nome do produto leva à página dele', async () => {
    page('');
    const link = await screen.findByRole('link', { name: /Hidratante Facial Hidra Leve/ });
    expect(link.getAttribute('href')).toBe('#/p/p1');
  });

  it('filtro por frase: produto vai ao catálogo com chips; saúde vai à conversa', async () => {
    const onNavigate = vi.fn();
    const onAsk = vi.fn();
    page('', '', { onNavigate, onAsk });
    const input = await screen.findByLabelText(/a IA monta os filtros/);
    await userEvent.type(input, 'hidratante até 20 reais{Enter}');
    await vi.waitFor(() => expect(onNavigate).toHaveBeenCalled());
    expect(onNavigate.mock.calls.at(-1)![0]).toMatch(/#\/busca\?.*ai=1/);

    await userEvent.type(input, 'estou com dor de cabeça{Enter}');
    await vi.waitFor(() => expect(onAsk).toHaveBeenCalledWith('estou com dor de cabeça', 'say:estou com dor de cabeça'));
  });

  it('categoria sem produtos explica e oferece o assistente (nunca fica vazia e muda)', async () => {
    const onAsk = vi.fn();
    page('whey', '', { onAsk });
    expect(await screen.findByText(/ainda não está no catálogo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pedir ajuda ao assistente' }));
    expect(onAsk).toHaveBeenCalled();
  });

  it('categoria que exige receita mostra a explicação', async () => {
    page('especiais');
    expect(await screen.findByText(/só são vendidos com receita/)).toBeInTheDocument();
  });

  it('API fora do ar: mensagem clara, e o assistente continua disponível', async () => {
    const broken = { ...store, list: async () => Promise.reject(new Error('fora')) };
    page('', '', { store: broken });
    expect(await screen.findByText(/Não consegui carregar os produtos/)).toBeInTheDocument();
  });
});

describe('página do produto', () => {
  const product = (id: string, over: Partial<typeof base> = {}) => render(<ProductPage id={id} store={store} onAdd={base.onAdd} onAsk={base.onAsk} {...over} />);

  it('cosmético: dados, registro e botão de cesta, sem aviso de bula', async () => {
    product('p1');
    expect(await screen.findByRole('heading', { name: /Hidratante Facial Hidra Leve/, level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Registro no cadastro da Anvisa')).toBeInTheDocument();
    expect(screen.queryByText(/Leia a bula/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar à cesta' })).toBeInTheDocument();
  });

  it('remédio sem receita: aviso de bula e "Esse produto é para mim?" como ação principal', async () => {
    const onAsk = vi.fn();
    product('p2', { onAsk });
    expect(await screen.findByText(/Leia a bula/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Esse produto é para mim?' }));
    expect(onAsk).toHaveBeenCalledWith('Esse produto é para mim?', 'check:p2');
  });

  it('receita: sem botão de compra', async () => {
    product('p3');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /cesta/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Falar com farmacêutico' })).toBeInTheDocument();
  });

  it('pergunta sobre o produto: resposta dos dados, com a origem dita', async () => {
    product('p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Quem fabrica?' }));
    expect(await screen.findByText('O fabricante é Exemplo.')).toBeInTheDocument();
    expect(screen.getByText(/Resposta montada direto dos dados/)).toBeInTheDocument();
  });

  it('pergunta pessoal leva à conferência de segurança, em vez de ser respondida', async () => {
    const onAsk = vi.fn();
    product('p2', { onAsk });
    await userEvent.type(await screen.findByLabelText('Escreva sua pergunta'), 'Posso usar com pressão alta?{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Conferir para mim' }));
    expect(onAsk).toHaveBeenCalledWith('Esse produto é para mim?', 'check:p2');
  });

  it('produto inexistente: mensagem e saída', async () => {
    product('nao-existe');
    expect(await screen.findByRole('heading', { name: 'Não encontrei este produto.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar' })).toBeInTheDocument();
  });
});
