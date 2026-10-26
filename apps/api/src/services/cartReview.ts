import type { CartReview } from '@ia/shared';
import { isMedicine, type CatalogPort } from '../ports/catalog';

const NSAIDS = new Set(['ibuprofeno', 'naproxeno', 'ácido acetilsalicílico']);
/** Substâncias que só reforçam outras (cafeína em analgésico): repetir não é motivo de alerta. */
const IGNORE = new Set(['cafeína']);

/**
 * Revisão do carrinho INTEIRO, só com regras (sem IA): o mesmo princípio ativo em dois produtos (risco de excesso),
 * dois anti-inflamatórios juntos, e lembrete de conferir cada remédio sem receita para quem vai usar.
 * Nenhum texto aqui dá dose nem diz que algo é seguro.
 */
export async function reviewCart(catalog: CatalogPort, ids: string[]): Promise<CartReview> {
  const products = (await catalog.byIds([...new Set(ids)])).filter(isMedicine).filter((p) => p.risk === 'YELLOW');
  const findings: CartReview['findings'] = [];

  const bySubstance = new Map<string, typeof products>();
  for (const p of products) for (const s of p.substances) if (!IGNORE.has(s)) bySubstance.set(s, [...(bySubstance.get(s) ?? []), p]);
  for (const [substance, list] of bySubstance) {
    if (list.length < 2) continue;
    findings.push({
      id: `dup:${substance}`,
      level: 'warning',
      text: `${list.map((p) => p.name).join(' e ')} têm o mesmo princípio ativo (${substance}). Usar os dois ao mesmo tempo pode causar excesso. Um farmacêutico pode orientar qual manter.`,
      productIds: list.map((p) => p.id),
    });
  }

  const nsaids = products.filter((p) => p.substances.some((s) => NSAIDS.has(s)));
  const sameSubstance = findings.some((f) => f.id.startsWith('dup:') && NSAIDS.has(f.id.slice(4)));
  if (nsaids.length >= 2 && !sameSubstance) {
    findings.push({
      id: 'nsaid-pair',
      level: 'warning',
      text: `${nsaids.map((p) => p.name).join(' e ')} são anti-inflamatórios. Usar dois juntos aumenta o risco de efeitos no estômago e nos rins. Confirme com um farmacêutico.`,
      productIds: nsaids.map((p) => p.id),
    });
  }

  for (const p of products) {
    findings.push({
      id: `check:${p.id}`,
      level: 'info',
      text: `${p.name} é vendido sem receita, mas a indicação depende de idade, condições e remédios em uso. Confira se é para quem vai usar.`,
      productIds: [p.id],
      checkProductId: p.id,
    });
  }
  return { findings };
}
