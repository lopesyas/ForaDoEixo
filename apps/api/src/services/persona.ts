import type { AgeRange, Condition, InteractionClass } from '../domain/safety';
import { fold, type CosmeticCategory, type CosmeticProduct, type SkinType } from '../catalog/cosmetics';
import type { CatalogPort } from '../ports/catalog';

/**
 * PERFIL DE DEMONSTRAÇÃO (sintético). Em produção, estes dados viriam da conta do cliente, com consentimento (LGPD).
 * Nada aqui é de uma pessoa real.
 */
export interface Beneficiary {
  label: string;
  ageRange: AgeRange;
  conditions: Condition[];
  medClasses: InteractionClass[];
}

export interface Persona {
  name: string;
  items: { category: CosmeticCategory; skin?: SkinType; daysAgo: number; lastsDays: number }[];
  rx: { query: string; daysAgo: number; lastsDays: number };
  beneficiaries: Partial<Record<'pai' | 'mae', Beneficiary>>;
}

export const DEMO_PERSONA: Persona = {
  name: 'Marina',
  items: [
    { category: 'hidratante_facial', skin: 'seca', daysAgo: 38, lastsDays: 45 },
    { category: 'protetor_solar', daysAgo: 20, lastsDays: 60 },
  ],
  rx: { query: 'losartana', daysAgo: 26, lastsDays: 30 },
  beneficiaries: { pai: { label: '68 anos, pressão alta, usa remédio para pressão', ageRange: '65plus', conditions: ['hypertension'], medClasses: ['antihypertensive'] } },
};

export function remaining(item: { daysAgo: number; lastsDays: number }): string {
  const left = item.lastsDays - item.daysAgo;
  return left <= 0 ? 'já deve ter acabado' : `deve acabar em ${left} ${left === 1 ? 'dia' : 'dias'}`;
}

/** Repete a última compra com o que existe HOJE no catálogo: o mais barato por 100 g em estoque, respeitando o tipo de pele. */
export async function pickReorder(persona: Persona, catalog: CatalogPort): Promise<{ product: CosmeticProduct; note: string }[]> {
  const out: { product: CosmeticProduct; note: string }[] = [];
  for (const item of persona.items) {
    const list = (await catalog.byCategory(item.category)).filter((p) => p.simulated.inStock);
    const fits = item.skin ? list.filter((p) => p.skinTypes.includes(item.skin!)) : list;
    const pool = fits.length > 0 ? fits : list;
    const best = [...pool].sort((a, b) => a.simulated.priceCents / a.simulated.unitQty - b.simulated.priceCents / b.simulated.unitQty || a.id.localeCompare(b.id))[0];
    if (best) out.push({ product: best, note: `Comprado há ${item.daysAgo} dias; ${remaining(item)}.` });
  }
  return out;
}

export const norm = (t: string) => fold(t).toLowerCase();
