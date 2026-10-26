import { RULES } from './rules';
import { VERDICT_SEVERITY, type ProfileField, type ReasonCode, type SafetyContext, type SafetyProduct, type SafetyProfile, type SafetyResult, type Verdict } from './types';

/**
 * Avalia UM produto para UM perfil. Função pura.
 * Regra de ouro: se qualquer regra restringe, o resultado nunca é ALLOW.
 */
export function evaluate(product: SafetyProduct, profile: SafetyProfile, ctx: SafetyContext = {}): SafetyResult {
  const reasons: ReasonCode[] = [];
  const ruleIds: string[] = [];
  const missing = new Set<ProfileField>();
  let verdict: Verdict = 'ALLOW';

  for (const rule of RULES) {
    const hit = rule.check(product, profile, ctx);
    if (!hit) continue;
    reasons.push(rule.reason);
    ruleIds.push(rule.id);
    hit.missing?.forEach((f) => missing.add(f));
    if (VERDICT_SEVERITY[hit.verdict] > VERDICT_SEVERITY[verdict]) verdict = hit.verdict;
  }

  if (verdict === 'ALLOW') ruleIds.push(product.risk === 'GREEN' ? 'R-GRN-001' : 'R-OTC-001');

  // As perguntas pendentes só importam quando nada mais grave aconteceu.
  return { verdict, reasons, ruleIds, missingInfo: verdict === 'CONDITION' ? [...missing] : [] };
}

/** Separa candidatos: o que pode ser mostrado, o que depende de perguntas e o que não pode. */
export function screen(products: SafetyProduct[], profile: SafetyProfile, ctx: SafetyContext = {}) {
  const evaluated = products.map((product) => ({ product, result: evaluate(product, profile, ctx) }));
  return {
    allowed: evaluated.filter((e) => e.result.verdict === 'ALLOW'),
    needsInfo: evaluated.filter((e) => e.result.verdict === 'CONDITION'),
    blocked: evaluated.filter((e) => e.result.verdict === 'BLOCK' || e.result.verdict === 'ESCALATE'),
    all: evaluated,
  };
}
