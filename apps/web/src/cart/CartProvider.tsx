import { ProductCard } from '@ia/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';

export const MAX_QTY = 10;
const STORAGE_KEY = 'cart-lines';

export type ProductSnapshot = ProductCard;
export interface CartLine {
  product: ProductSnapshot;
  qty: number;
}
export type Shipping = 'home' | 'pickup';
export type Payment = 'pix' | 'card' | 'boleto';

/** Valores de demonstração. Em produção vêm do sistema de entrega da empresa. */
export const SHIPPING_CENTS: Record<Shipping, number> = { home: 990, pickup: 0 };

export interface CheckoutData {
  cep: string;
  number: string;
  complement: string;
  shipping: Shipping | null;
  payment: Payment | null;
}
const emptyCheckout: CheckoutData = { cep: '', number: '', complement: '', shipping: null, payment: null };

export interface Order {
  lines: CartLine[];
  checkout: CheckoutData;
  totalCents: number;
}

const StoredLines = z.array(z.object({ product: ProductCard, qty: z.number().int().min(1).max(MAX_QTY) }));

/** Carrinho guardado na sessão e validado pelo mesmo contrato dos produtos: dado corrompido vira carrinho vazio. */
function load(): CartLine[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? StoredLines.parse(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function shippingCost(checkout: CheckoutData): number | null {
  return checkout.shipping ? SHIPPING_CENTS[checkout.shipping] : null;
}

interface CartApi {
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  checkout: CheckoutData;
  lastOrder: Order | null;
  /** Nome do último produto adicionado (para avisar "adicionado à cesta" sem tirar a pessoa da tela). */
  lastAdded: string | null;
  /** Sobe a cada adição (mesmo do mesmo produto), para avisar de novo. */
  addedTick: number;
  add: (product: ProductSnapshot) => void;
  addMany: (products: ProductSnapshot[]) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  updateCheckout: (patch: Partial<CheckoutData>) => void;
  placeOrder: () => void;
}

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);
  const [checkout, setCheckout] = useState<CheckoutData>(emptyCheckout);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [addedTick, setAddedTick] = useState(0);

  const commit = useCallback((next: CartLine[]) => {
    setLines(next);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const add = useCallback(
    (product: ProductSnapshot) => {
      setLastAdded(product.name);
      setAddedTick((n) => n + 1);
      const existing = lines.find((l) => l.product.id === product.id);
      commit(
        existing
          ? lines.map((l) => (l.product.id === product.id ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l))
          : [...lines, { product, qty: 1 }],
      );
    },
    [lines, commit],
  );

  const addMany = useCallback(
    (products: ProductSnapshot[]) => {
      setLastAdded(products.length === 1 ? products[0]!.name : `${products.length} produtos`);
      setAddedTick((n) => n + 1);
      let next = lines;
      for (const product of products) {
        const existing = next.find((l) => l.product.id === product.id);
        next = existing ? next.map((l) => (l.product.id === product.id ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l)) : [...next, { product, qty: 1 }];
      }
      commit(next);
    },
    [lines, commit],
  );

  const setQty = useCallback(
    (id: string, qty: number) => {
      const clamped = Math.min(MAX_QTY, qty);
      commit(clamped < 1 ? lines.filter((l) => l.product.id !== id) : lines.map((l) => (l.product.id === id ? { ...l, qty: clamped } : l)));
    },
    [lines, commit],
  );

  const remove = useCallback((id: string) => commit(lines.filter((l) => l.product.id !== id)), [lines, commit]);

  const updateCheckout = useCallback((patch: Partial<CheckoutData>) => setCheckout((c) => ({ ...c, ...patch })), []);

  const subtotalCents = lines.reduce((sum, l) => sum + l.product.priceCents * l.qty, 0);

  const placeOrder = useCallback(() => {
    setLastOrder({ lines, checkout, totalCents: subtotalCents + (shippingCost(checkout) ?? 0) });
    commit([]);
    setCheckout(emptyCheckout);
  }, [lines, checkout, subtotalCents, commit]);

  const value = useMemo<CartApi>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotalCents,
      checkout,
      lastOrder,
      lastAdded,
      addedTick,
      add,
      addMany,
      setQty,
      remove,
      updateCheckout,
      placeOrder,
    }),
    [lines, subtotalCents, checkout, lastOrder, lastAdded, addedTick, add, addMany, setQty, remove, updateCheckout, placeOrder],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart precisa estar dentro de CartProvider');
  return ctx;
}
