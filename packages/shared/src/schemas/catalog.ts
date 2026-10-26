import { z } from 'zod';
import { ProductCard } from './ui';

/** Produto na listagem do catálogo. `kind` decide o botão: cosmético (cesta), remédio sem receita (checar segurança), receita (farmacêutico). */
export const ListedProduct = ProductCard.extend({
  kind: z.enum(['cosmetic', 'otc', 'rx']),
  company: z.string(),
  categoryKey: z.string(),
  categoryLabel: z.string(),
  skinTypes: z.array(z.string()).default([]),
  spf: z.number().optional(),
  /** De onde vem o preço: tabela CMED (preço máximo regulado) ou simulado. */
  priceSource: z.enum(['cmed', 'simulado']).default('simulado'),
  /** Apresentação a que o preço se refere (ex.: "500 MG COM CT BL X 20"), quando conhecida. */
  presentation: z.string().optional(),
});
export type ListedProduct = z.infer<typeof ListedProduct>;

export const Facets = z.object({
  companies: z.array(z.object({ name: z.string(), count: z.number() })),
  skinTypes: z.array(z.object({ name: z.string(), count: z.number() })),
  categories: z.array(z.object({ key: z.string(), label: z.string(), count: z.number() })),
  priceMinCents: z.number(),
  priceMaxCents: z.number(),
});
export type Facets = z.infer<typeof Facets>;

export const ProductList = z.object({ total: z.number(), products: z.array(ListedProduct), facets: Facets });
export type ProductList = z.infer<typeof ProductList>;

/** Filtros aplicados à listagem (e produzidos pelo filtro por frase). */
export const FilterState = z.object({
  cat: z.array(z.string()).default([]),
  q: z.string().default(''),
  maxCents: z.number().int().positive().optional(),
  skin: z.string().optional(),
  company: z.string().optional(),
  sort: z.enum(['relevance', 'price', 'unit', 'name']).default('relevance'),
});
export type FilterState = z.infer<typeof FilterState>;

export const Interpretation = z.object({
  filters: FilterState,
  /** Como o sistema entendeu, em chips legíveis e removíveis. */
  chips: z.array(z.object({ id: z.string(), label: z.string() })),
  /** Saúde e emergência vão para a conversa; o resto, para o catálogo. */
  route: z.enum(['catalog', 'assistant']),
  mode: z.enum(['ai', 'rules']),
});
export type Interpretation = z.infer<typeof Interpretation>;

export const ProductDetail = ListedProduct.extend({
  facts: z.array(z.object({ label: z.string(), value: z.string() })),
  registration: z.string(),
  /** Perguntas sugeridas (o que as pessoas costumam querer saber deste tipo de produto). */
  questions: z.array(z.string()),
  /** Aviso fixo para remédios. */
  notice: z.string().optional(),
});
export type ProductDetail = z.infer<typeof ProductDetail>;

export const ProductAnswer = z.object({
  answer: z.string(),
  /** "ai": a IA redigiu com base nos dados; "facts": resposta montada direto dos dados; "check": é pergunta pessoal, precisa da conferência de segurança. */
  mode: z.enum(['ai', 'facts', 'check']),
  basedOn: z.array(z.string()),
});
export type ProductAnswer = z.infer<typeof ProductAnswer>;

/** Revisão do carrinho inteiro: o que merece atenção antes de pagar. */
export const CartFinding = z.object({
  id: z.string(),
  level: z.enum(['warning', 'info']),
  text: z.string(),
  productIds: z.array(z.string()),
  /** Quando faz sentido, um produto a conferir com a camada de segurança. */
  checkProductId: z.string().optional(),
});
export const CartReview = z.object({ findings: z.array(CartFinding) });
export type CartFinding = z.infer<typeof CartFinding>;
export type CartReview = z.infer<typeof CartReview>;
