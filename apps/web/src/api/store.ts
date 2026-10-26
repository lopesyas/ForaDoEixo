import { CartReview, Interpretation, ProductAnswer, ProductDetail, ProductList, type FilterState } from '@ia/shared';

/** Catálogo da loja: listagem com filtros, página do produto, perguntas sobre o produto e filtro por frase. */
export interface StoreClient {
  list(filters: Partial<FilterState>): Promise<ProductList>;
  detail(id: string): Promise<ProductDetail>;
  ask(id: string, question: string): Promise<ProductAnswer>;
  interpret(text: string): Promise<Interpretation>;
  /** Revisão da cesta inteira (mesmo princípio ativo repetido, lembretes de segurança). */
  review(ids: string[]): Promise<CartReview>;
}

export function toQueryString(f: Partial<FilterState>): string {
  const p = new URLSearchParams();
  if (f.cat?.length) p.set('cat', f.cat.join(','));
  if (f.q) p.set('q', f.q);
  if (f.maxCents) p.set('max', String(f.maxCents));
  if (f.skin) p.set('skin', f.skin);
  if (f.company) p.set('company', f.company);
  if (f.sort && f.sort !== 'relevance') p.set('sort', f.sort);
  return p.toString();
}

/** Cliente HTTP do catálogo. Toda resposta é validada pelo contrato compartilhado. */
export function createHttpStore(baseUrl = '', fetchImpl: typeof fetch = (...a) => fetch(...a)): StoreClient {
  async function json<T>(res: Response, schema: { parse(x: unknown): T }): Promise<T> {
    if (!res.ok) throw new Error(`A API respondeu ${res.status}`);
    return schema.parse(await res.json());
  }
  const post = (url: string, body: unknown) => fetchImpl(`${baseUrl}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    list: async (f) => json(await fetchImpl(`${baseUrl}/api/products?${toQueryString(f)}`), ProductList),
    detail: async (id) => json(await fetchImpl(`${baseUrl}/api/products/${encodeURIComponent(id)}`), ProductDetail),
    ask: async (id, question) => json(await post(`/api/products/${encodeURIComponent(id)}/ask`, { question }), ProductAnswer),
    interpret: async (text) => json(await post('/api/filters/interpret', { text }), Interpretation),
    review: async (ids) => json(await post('/api/cart/review', { ids }), CartReview),
  };
}

/** Versão fixa para os testes. */
export function createMockStore(): StoreClient {
  const products = [
    { id: 'p1', name: 'Hidratante Facial Hidra Leve 50 g', priceCents: 1890, image: 'tube' as const, reason: 'Exemplo', badges: [], kind: 'cosmetic' as const, company: 'Exemplo', categoryKey: 'hidratante_facial', categoryLabel: 'Hidratante para o rosto', skinTypes: ['seca'], priceSource: 'simulado' as const, unitLabel: '100 g', pricePerUnitCents: 3780 },
    { id: 'p2', name: 'Analgésico Exemplo', priceCents: 990, image: 'box' as const, reason: 'Exemplo', badges: [], kind: 'otc' as const, company: 'Exemplo', categoryKey: 'analgesico', categoryLabel: 'Dor e febre', skinTypes: [], priceSource: 'cmed' as const, presentation: '500 MG COM X 20' },
    { id: 'p3', name: 'Antibiótico Exemplo', priceCents: 4990, image: 'box' as const, reason: 'Exemplo', badges: [], kind: 'rx' as const, company: 'Exemplo', categoryKey: 'receita', categoryLabel: 'Exigem receita', skinTypes: [], priceSource: 'cmed' as const, presentation: '500 MG CAP X 21' },
  ];
  return {
    async list(f) {
      const list = products.filter((p) => (!f.cat?.length || f.cat.includes(p.categoryKey)) && (!f.maxCents || p.priceCents <= f.maxCents) && (!f.q || p.name.toLowerCase().includes(f.q.toLowerCase())));
      return {
        total: list.length,
        products: list,
        facets: { companies: [{ name: 'Exemplo', count: list.length }], skinTypes: [{ name: 'seca', count: 1 }], categories: [...new Set(products.map((p) => p.categoryKey))].map((key) => ({ key, label: products.find((p) => p.categoryKey === key)!.categoryLabel, count: 1 })), priceMinCents: 990, priceMaxCents: 4990 },
      };
    },
    async detail(id) {
      const p = products.find((x) => x.id === id);
      if (!p) throw new Error('A API respondeu 404');
      return { ...p, facts: [{ label: 'Fabricante', value: p.company }], registration: '123', questions: ['Quem fabrica?'], ...(p.kind !== 'cosmetic' ? { notice: 'Leia a bula antes de usar.' } : {}) };
    },
    async ask(_id, question) {
      return /posso|pode/i.test(question) ? { mode: 'check', answer: 'Preciso conferir para você.', basedOn: [] } : { mode: 'facts', answer: 'O fabricante é Exemplo.', basedOn: ['Fabricante'] };
    },
    async review(ids) {
      return ids.includes('p2') ? { findings: [{ id: 'check:p2', level: 'info', text: 'Analgésico Exemplo é vendido sem receita. Confira se é para quem vai usar.', productIds: ['p2'], checkProductId: 'p2' }] } : { findings: [] };
    },
    async interpret(text) {
      return /dor|oi/i.test(text)
        ? { filters: { cat: [], q: '', sort: 'relevance' }, chips: [], route: 'assistant', mode: 'rules' }
        : { filters: { cat: ['hidratante_facial'], q: '', sort: 'relevance', maxCents: 2000 }, chips: [{ id: 'cat:hidratante_facial', label: 'Hidratante para o rosto' }], route: 'catalog', mode: 'rules' };
    },
  };
}
