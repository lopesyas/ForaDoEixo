import { describe, expect, it } from 'vitest';
import { ProductCard } from '@ia/shared';
import { createJsonCatalog } from '../adapters/catalog/jsonCatalog';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createChatService } from '../services/chat';
import { call } from '../testing';

const catalog = createJsonCatalog();
const app = createApp(loadConfig({}), { chat: createChatService({ catalog }), catalog });

describe('GET /api/featured (vitrine)', () => {
  it('devolve prateleiras com produtos reais, em estoque, no formato dos cartões', async () => {
    const res = await call(app, { method: 'GET', url: '/api/featured' });
    expect(res.status).toBe(200);
    const body = res.body as { shelves: { title: string; products: unknown[] }[] };
    expect(body.shelves.length).toBeGreaterThan(0);
    const ids: string[] = [];
    for (const shelf of body.shelves) {
      expect(shelf.products.length).toBeGreaterThan(0);
      for (const p of shelf.products) {
        const parsed = ProductCard.parse(p);
        ids.push(parsed.id);
      }
    }
    for (const p of await catalog.byIds(ids)) expect(p.simulated.inStock).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
