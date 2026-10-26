import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { fold, type CosmeticCategory, type CosmeticProduct } from '../../catalog/cosmetics';
import type { MedicineProduct } from '../../catalog/medicines';
import type { CatalogPort, CatalogProduct } from '../../ports/catalog';

const Source = z.object({ dataset: z.string(), process: z.string(), registration: z.string() });

const Cosmetic = z.object({
  id: z.string(),
  name: z.string().min(1),
  company: z.string(),
  category: z.string(),
  skinTypes: z.array(z.enum(['seca', 'oleosa', 'mista', 'normal', 'sensivel'])),
  spf: z.number().optional(),
  risk: z.literal('GREEN'),
  source: Source,
  simulated: z.object({ priceCents: z.number().int().positive(), unitQty: z.number().positive(), unitLabel: z.enum(['g', 'ml']), inStock: z.boolean() }),
});

const Condition = z.enum(['hypertension', 'diabetes', 'kidney_disease', 'liver_disease', 'stomach_ulcer', 'asthma', 'pregnancy']);
const InteractionClass = z.enum(['anticoagulant', 'antihypertensive', 'antidepressant', 'sedative', 'nsaid', 'diabetes_med']);

const Medicine = z.object({
  id: z.string(),
  name: z.string().min(1),
  company: z.string(),
  regulatory: z.string(),
  risk: z.enum(['YELLOW', 'RED']),
  tarja: z.array(z.number().int().min(1).max(4)),
  group: z.enum(['analgesico', 'antiacido', 'antialergico', 'expectorante', 'garganta', 'sono']).optional(),
  use: z.string().optional(),
  substances: z.array(z.string()),
  avoidIf: z.array(Condition),
  interactsWith: z.array(InteractionClass),
  cautionElderly: z.boolean(),
  source: Source,
  simulated: z.object({ priceCents: z.number().int().positive(), inStock: z.boolean() }),
  pricing: z.object({ source: z.literal('CMED'), publishedAt: z.string(), icms: z.number(), presentation: z.string(), ean: z.string(), registration13: z.string() }),
});

const read = (relative: string) => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')) as unknown;

/**
 * Catálogo de demonstração: produtos REAIS do cadastro público da Anvisa (cosméticos e medicamentos),
 * com preço e estoque simulados. Atrás da porta `CatalogPort`: trocar por banco ou pela API da empresa não muda o resto.
 */
export function createJsonCatalog(paths = { cosmetics: '../../../data/cosmetics.catalog.json', medicines: '../../../data/medicines.catalog.json' }): CatalogPort {
  const cosmetics = z.object({ products: z.array(Cosmetic) }).parse(read(paths.cosmetics)).products as CosmeticProduct[];
  const medicines = z.object({ products: z.array(Medicine) }).parse(read(paths.medicines)).products as MedicineProduct[];
  const all: CatalogProduct[] = [...cosmetics, ...medicines];

  return {
    async byCategory(category: CosmeticCategory) {
      return cosmetics.filter((p) => p.category === category);
    },
    async otcByGroups(groups) {
      return medicines.filter((p) => p.risk === 'YELLOW' && p.group !== undefined && groups.includes(p.group) && p.simulated.inStock);
    },
    async byIds(ids: string[]) {
      return ids.map((id) => all.find((p) => p.id === id)).filter((p): p is CatalogProduct => p !== undefined);
    },
    async all() {
      return all;
    },
    async featured(perCategory: number, categories: CosmeticCategory[]) {
      return categories.flatMap((c) =>
        cosmetics
          .filter((p) => p.category === c && p.simulated.inStock)
          .sort((a, b) => a.simulated.priceCents - b.simulated.priceCents || a.id.localeCompare(b.id))
          .slice(0, perCategory),
      );
    },
    async searchByName(text: string) {
      const STOP = new Set(['quero', 'preciso', 'procuro', 'comprar', 'gostaria', 'queria', 'algum', 'alguma', 'algo', 'para', 'tem', 'voces', 'voce', 'produto', 'remedio', 'uma', 'umas', 'uns', 'meu', 'minha', 'com', 'sem', 'mais', 'outro', 'outra', 'coisa', 'sobre']);
      const tokens = fold(text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((t) => t.length >= 4 && !STOP.has(t));
      if (tokens.length === 0 || tokens.length > 4) return { cosmetics: [], otc: [] };
      const hay = (p: { name: string; company: string }) => ` ${fold(`${p.name} ${p.company}`).toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `;
      const matches = <T extends { name: string; company: string }>(list: T[]) => list.filter((p) => tokens.every((t) => hay(p).includes(t)));
      return {
        cosmetics: matches(cosmetics).filter((p) => p.simulated.inStock).slice(0, 3),
        otc: matches(medicines.filter((p) => p.risk === 'YELLOW' && p.group !== undefined && p.simulated.inStock)).slice(0, 1),
      };
    },
    async findPrescription(text: string) {
      const t = fold(text).toLowerCase();
      // Compara pela palavra mais longa de cada substância ("cloridrato de fluoxetina" -> "fluoxetina"), e não pelo prefixo do sal.
      const key = (s: string) => fold(s).toLowerCase().split(' ').sort((a, b) => b.length - a.length)[0] ?? '';
      return medicines.filter((p) => p.risk === 'RED' && (t.includes(fold(p.name).toLowerCase()) || p.substances.some((s) => key(s).length > 5 && t.includes(key(s)))));
    },
  };
}
