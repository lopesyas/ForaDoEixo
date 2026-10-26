import { z } from 'zod';

/**
 * Contrato de interface: a API devolve isto e o front só renderiza.
 * Os quatro estados de busca (encontrado, parcial, não encontrado, não confirmado) são tipos, não casos improvisados.
 */
export const SummaryItem = z.object({ label: z.string().min(1), value: z.string().min(1) });
export type SummaryItem = z.infer<typeof SummaryItem>;

export const Action = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  tone: z.enum(['primary', 'secondary']).default('secondary'),
  /** Se informado, o que a pessoa escolheu entra no painel "Seu pedido" (o sistema mostra o que entendeu). */
  summary: SummaryItem.optional(),
  /** Em perguntas de múltipla escolha: marcar esta opção desmarca as outras (ex.: "Nenhum desses"). */
  exclusive: z.boolean().optional(),
});
export type Action = z.infer<typeof Action>;

export const Badge = z.object({
  label: z.string().min(1),
  tone: z.enum(['success', 'warning', 'neutral']),
});

export const ProductCard = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  image: z.enum(['tube', 'jar', 'box', 'bottle']).optional(),
  /** Categoria do catálogo: escolhe a foto ilustrativa da categoria quando o produto não tem foto própria. */
  categoryKey: z.string().optional(),
  unitLabel: z.string().optional(),
  pricePerUnitCents: z.number().int().nonnegative().optional(),
  reason: z.string().min(1),
  badges: z.array(Badge).default([]),
});
export type ProductCard = z.infer<typeof ProductCard>;

const base = { text: z.string().min(1), actions: z.array(Action).default([]) };

export const UiTurn = z.discriminatedUnion('kind', [
  /** "Entendi que você quer…": o usuário confirma ou muda antes de qualquer busca. */
  z.object({ kind: z.literal('CONFIRM'), ...base, summary: z.array(SummaryItem).min(1) }),
  z.object({ kind: z.literal('QUESTION'), ...base, multi: z.boolean().default(false) }),
  z.object({ kind: z.literal('OPTIONS'), ...base, products: z.array(ProductCard).min(1), /** Falso quando a lista é uma reposição: não faz sentido comparar. */ comparable: z.boolean().default(true) }),
  z.object({
    kind: z.literal('COMPARE'),
    ...base,
    products: z.tuple([ProductCard, ProductCard]),
    rows: z.array(z.object({ label: z.string(), values: z.tuple([z.string(), z.string()]), better: z.union([z.literal(0), z.literal(1)]).optional() })),
  }),
  z.object({
    kind: z.literal('SAFETY_NOTICE'),
    ...base,
    level: z.enum(['yellow', 'red', 'alert']),
    why: z.string().min(1),
  }),
  /** Resultado parcial: algo parecido, mas que não atende a tudo. Os produtos (se houver) vêm com o aviso do que falta. */
  z.object({ kind: z.literal('PARTIAL'), ...base, products: z.array(ProductCard).default([]) }),
  z.object({ kind: z.literal('NOT_FOUND'), ...base }),
  z.object({ kind: z.literal('UNCONFIRMED'), ...base }),
]);
export type UiTurn = z.infer<typeof UiTurn>;
