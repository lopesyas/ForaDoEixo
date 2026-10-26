import type { ProductCard } from '@ia/shared';
import { Router } from 'express';
import type { CosmeticCategory } from '../catalog/cosmetics';
import type { CatalogPort } from '../ports/catalog';

const SHELVES: { title: string; categories: CosmeticCategory[] }[] = [
  { title: 'Melhores ofertas para você', categories: ['protetor_solar', 'hidratante_facial', 'sabonete', 'desodorante'] },
  { title: 'Cuidados com o cabelo', categories: ['shampoo', 'condicionador'] },
];

/** Vitrine da loja: produtos reais do catálogo, na mesma forma (ProductCard) que o assistente usa. */
export function featuredRoutes(catalog: CatalogPort) {
  const router = Router();
  router.get('/featured', async (_req, res, next) => {
    try {
      const shelves = await Promise.all(
        SHELVES.map(async (shelf) => {
          const items = await catalog.featured(2, shelf.categories);
          const products: ProductCard[] = items.map((p) => ({
            id: p.id,
            name: p.name,
            categoryKey: p.category,
            priceCents: p.simulated.priceCents,
            unitLabel: `100 ${p.simulated.unitLabel}`,
            pricePerUnitCents: Math.round((p.simulated.priceCents / p.simulated.unitQty) * 100),
            reason: p.company,
            badges: [],
          }));
          return { title: shelf.title, products };
        }),
      );
      res.json({ shelves });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
