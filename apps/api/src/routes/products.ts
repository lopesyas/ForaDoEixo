import { Router } from 'express';
import { z } from 'zod';
import type { CatalogPort } from '../ports/catalog';
import type { LlmPort } from '../ports/llm';
import { reviewCart } from '../services/cartReview';
import { askAboutProduct, interpretFilter, productDetail, searchProducts } from '../services/products';

const Query = z.object({
  cat: z.string().max(300).optional(),
  q: z.string().max(100).optional(),
  max: z.coerce.number().int().positive().max(10_000_000).optional(),
  skin: z.enum(['seca', 'oleosa', 'mista', 'normal', 'sensivel']).optional(),
  company: z.string().max(100).optional(),
  sort: z.enum(['relevance', 'price', 'unit', 'name']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const AskBody = z.object({ question: z.string().trim().min(2).max(300) });
const ReviewBody = z.object({ ids: z.array(z.string().min(1).max(80)).max(30) });
const InterpretBody = z.object({ text: z.string().trim().min(1).max(300) });

/** Catálogo navegável: listagem com filtros, página do produto, perguntas sobre o produto e filtro por frase. */
export function productRoutes(catalog: CatalogPort, llm: LlmPort) {
  const router = Router();

  router.get('/products', async (req, res, next) => {
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: 'Pedido inválido.' });
    const { cat, max, ...rest } = parsed.data;
    try {
      res.json(await searchProducts(catalog, { ...rest, cat: cat ? cat.split(',').filter(Boolean).slice(0, 10) : [], ...(max ? { maxCents: max } : {}) }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/products/:id', async (req, res, next) => {
    try {
      const detail = await productDetail(catalog, String(req.params.id).slice(0, 80));
      if (!detail) return void res.status(404).json({ error: 'Produto não encontrado.' });
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post('/products/:id/ask', async (req, res, next) => {
    const body = AskBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: 'Pedido inválido.' });
    try {
      const answer = await askAboutProduct(catalog, String(req.params.id).slice(0, 80), body.data.question, llm);
      if (!answer) return void res.status(404).json({ error: 'Produto não encontrado.' });
      res.json(answer);
    } catch (err) {
      next(err);
    }
  });

  router.post('/cart/review', async (req, res, next) => {
    const body = ReviewBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: 'Pedido inválido.' });
    try {
      res.json(await reviewCart(catalog, body.data.ids));
    } catch (err) {
      next(err);
    }
  });

  router.post('/filters/interpret', async (req, res, next) => {
    const body = InterpretBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: 'Pedido inválido.' });
    try {
      res.json(await interpretFilter(body.data.text, llm));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
