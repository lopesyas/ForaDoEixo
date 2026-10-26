import { UiTurn } from '@ia/shared';
import { z } from 'zod';
import { ProductCard } from '@ia/shared';
import type { CatalogClient, ChatClient, ChatInput } from './client';

/**
 * Cliente HTTP do motor. É o ÚNICO lugar do front que fala com a rede.
 * A resposta é validada pelo contrato: se a API mandar algo fora dele, vira erro (e a tela mostra "tentar de novo").
 */
export function createHttpClient(baseUrl = '', fetchImpl: typeof fetch = (...args) => fetch(...args)): ChatClient {
  return {
    async send(input: ChatInput) {
      const res = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`A API respondeu ${res.status}`);
      return UiTurn.parse(await res.json());
    },
  };
}

const Featured = z.object({ shelves: z.array(z.object({ title: z.string(), products: z.array(ProductCard) })) });

/** Vitrine da loja pela API; a resposta também é validada pelo contrato. */
export function createHttpCatalog(baseUrl = '', fetchImpl: typeof fetch = (...args) => fetch(...args)): CatalogClient {
  return {
    async featured() {
      const res = await fetchImpl(`${baseUrl}/api/featured`);
      if (!res.ok) throw new Error(`A API respondeu ${res.status}`);
      return Featured.parse(await res.json()).shelves;
    },
  };
}
