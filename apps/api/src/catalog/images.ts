/**
 * Busca automática de FOTOS de produtos em fontes abertas (Open Beauty Facts e Open Food Facts), com revisão humana.
 * Funções puras: o script faz as chamadas de rede; os testes cobrem estas regras.
 *
 * Princípios: (1) nunca aplicar uma foto sem uma pessoa aprovar, porque foto errada em remédio é problema de segurança;
 * (2) só fontes com licença aberta (CC BY-SA), com atribuição; (3) código de barras (EAN) é a prova mais forte.
 */
import { fold } from './cosmetics';

export interface Candidate {
  /** Código de barras do produto na fonte. */
  code: string;
  name: string;
  brands: string;
  imageUrl: string;
  /** Página do produto na fonte (atribuição). */
  pageUrl: string;
  source: 'openbeautyfacts' | 'openfoodfacts';
  brazil: boolean;
  matchedBy: 'ean' | 'name';
  /** 0 a 1. */
  score: number;
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'sem', 'a', 'o', 'as', 'os', 'ml', 'g', 'kg', 'mg', 'un', 'und']);

/** Palavras que identificam o produto: sem acento, minúsculas, sem tamanho nem palavras de ligação. */
export function tokens(text: string): string[] {
  return fold(text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

/** Consulta de busca por nome: marca + palavras mais distintivas, sem estourar o tamanho. */
export function nameQuery(product: { name: string; company: string }): string {
  const brand = tokens(product.company)[0] ?? '';
  const words = tokens(product.name).slice(0, 6);
  return [...new Set([...words, brand].filter(Boolean))].join(' ');
}

/**
 * Consultas da mais específica para a mais simples. A busca da fonte exige TODAS as palavras, então um nome longo
 * costuma voltar vazio: se a primeira não achar nada, tentamos marca + 2 palavras e depois só as palavras principais.
 */
export function nameQueries(product: { name: string; company: string }): string[] {
  const brandTokens = new Set(tokens(product.company));
  const brand = tokens(product.company)[0] ?? '';
  const descriptive = tokens(product.name).filter((t) => !brandTokens.has(t));
  const list = [nameQuery(product), [brand, ...descriptive.slice(0, 2)].filter(Boolean).join(' '), descriptive.slice(0, 3).join(' ')];
  return [...new Set(list.filter((q) => q.trim().length > 0))];
}

/**
 * Pontuação de 0 a 1. As palavras DESCRITIVAS do nosso nome (sem a marca) contra o nome do candidato, e a marca à parte:
 * assim, "mesma marca, outro produto" não ganha nota alta. Bônus pequeno para produto vendido no Brasil.
 */
export function scoreName(product: { name: string; company: string }, cand: { name: string; brands: string; brazil: boolean }): number {
  const brandTokens = new Set(tokens(product.company));
  const ours = new Set(tokens(product.name).filter((t) => !brandTokens.has(t)));
  const theirs = new Set(tokens(cand.name));
  if (ours.size === 0 || theirs.size === 0) return 0;
  let common = 0;
  for (const t of ours) if (theirs.has(t)) common++;
  const overlap = common / Math.max(ours.size, theirs.size);
  const candBrand = tokens(`${cand.brands} ${cand.name}`);
  const brand = [...brandTokens].some((t) => candBrand.includes(t)) ? 0.2 : 0;
  return Math.min(1, overlap * 0.8 + brand + (cand.brazil && overlap > 0 ? 0.05 : 0));
}

interface RawProduct {
  code?: string;
  product_name?: string;
  product_name_pt?: string;
  brands?: string;
  image_front_url?: string;
  image_url?: string;
  countries_tags?: string[];
}

const SITE = { openbeautyfacts: 'https://world.openbeautyfacts.org', openfoodfacts: 'https://world.openfoodfacts.org' } as const;

export function toCandidate(raw: RawProduct, source: Candidate['source'], product: { name: string; company: string }, matchedBy: Candidate['matchedBy']): Candidate | null {
  const imageUrl = raw.image_front_url ?? raw.image_url;
  const name = raw.product_name_pt || raw.product_name || '';
  if (!imageUrl || !raw.code || !/^https:\/\//.test(imageUrl)) return null;
  const brazil = (raw.countries_tags ?? []).includes('en:brazil');
  const base = { code: raw.code, name, brands: raw.brands ?? '', imageUrl, pageUrl: `${SITE[source]}/product/${raw.code}`, source, brazil, matchedBy };
  // Código de barras igual é a prova mais forte; o nome só confirma.
  const score = matchedBy === 'ean' ? Math.max(0.9, scoreName(product, base)) : scoreName(product, base);
  return { ...base, score: Math.round(score * 100) / 100 };
}

/** Resposta da busca por nome (`products: [...]`) -> candidatos, melhores primeiro, só acima do mínimo. */
/** Quantos produtos a fonte devolveu (antes de qualquer filtro nosso): separa "a fonte não tem" de "tem, mas não parece o mesmo". */
export function rawCount(json: unknown): number {
  const list = (json as { products?: unknown[] } | null)?.products;
  return Array.isArray(list) ? list.length : 0;
}

export function parseSearch(json: unknown, source: Candidate['source'], product: { name: string; company: string }, min = 0.3): Candidate[] {
  const list = (json as { products?: RawProduct[] } | null)?.products;
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => toCandidate(r, source, product, 'name'))
    .filter((c): c is Candidate => c !== null && c.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** Resposta da busca por EAN (`status: 1`, `product: {...}`). */
export function parseEan(json: unknown, source: Candidate['source'], product: { name: string; company: string }, ean: string): Candidate[] {
  const j = json as { status?: number; product?: RawProduct } | null;
  if (!j || j.status !== 1 || !j.product) return [];
  const c = toCandidate({ ...j.product, code: j.product.code ?? ean }, source, product, 'ean');
  return c ? [c] : [];
}

export const URLS = {
  search: (source: Candidate['source'], q: string) => `${SITE[source]}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8&fields=code,product_name,brands,image_front_url`,
  ean: (source: Candidate['source'], ean: string) => `${SITE[source]}/api/v2/product/${encodeURIComponent(ean)}.json?fields=code,product_name,brands,image_front_url`,
};

/** Pré-seleciona sozinha só o que é seguro: código de barras igual ou nome muito parecido. O resto fica para a pessoa decidir. */
export function preselect(cands: Candidate[]): Candidate | null {
  const best = cands[0];
  return best && (best.matchedBy === 'ean' || best.score >= 0.8) ? best : null;
}

export function extensionFor(contentType: string): 'jpg' | 'png' | 'webp' | null {
  const t = contentType.toLowerCase();
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  return null;
}
