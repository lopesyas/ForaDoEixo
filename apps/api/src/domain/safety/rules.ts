import { PROTOTYPE_THRESHOLDS } from './thresholds';
import type { ProfileField, ReasonCode, SafetyContext, SafetyProduct, SafetyProfile, Verdict } from './types';

export interface RuleHit {
  verdict: Verdict;
  missing?: ProfileField[];
}

export interface Rule {
  id: string;
  reason: ReasonCode;
  check: (product: SafetyProduct, profile: SafetyProfile, ctx: SafetyContext) => RuleHit | null;
}

const intersects = <T>(a: readonly T[] = [], b: readonly T[] = []) => a.some((x) => b.includes(x));

const REQUIRED_FOR_OTC: ProfileField[] = ['ageRange', 'conditions', 'allergies', 'medClasses'];

/**
 * Cada regra é pequena, tem um id estável e um motivo. O veredito final é o mais grave entre todas
 * as que dispararem: uma regra nunca "desfaz" outra.
 */
export const RULES: Rule[] = [
  {
    id: 'R-RX-001',
    reason: 'RX_REQUIRED',
    check: (p) => (p.risk === 'RED' ? { verdict: 'BLOCK' } : null),
  },
  {
    id: 'R-ALG-001',
    reason: 'ALLERGY',
    check: (p, profile) => (intersects(profile.allergies, p.ingredients) ? { verdict: 'BLOCK' } : null),
  },
  {
    id: 'R-CON-001',
    reason: 'CONTRAINDICATION',
    check: (p, profile) =>
      intersects(
        p.avoidIf.filter((c) => c !== 'pregnancy'),
        profile.conditions,
      )
        ? { verdict: 'BLOCK' }
        : null,
  },
  {
    id: 'R-INT-001',
    reason: 'INTERACTION',
    check: (p, profile) => (intersects(p.interactsWith, profile.medClasses) ? { verdict: 'BLOCK' } : null),
  },
  {
    id: 'R-PRG-001',
    reason: 'PREGNANCY',
    check: (p, profile) => (profile.conditions?.includes('pregnancy') && (p.risk === 'YELLOW' || p.avoidIf.includes('pregnancy')) ? { verdict: 'ESCALATE' } : null),
  },
  {
    id: 'R-CHD-001',
    reason: 'CHILD',
    check: (p, profile) => (p.risk === 'YELLOW' && profile.ageRange === 'under12' ? { verdict: 'ESCALATE' } : null),
  },
  {
    id: 'R-ELD-001',
    reason: 'ELDERLY',
    check: (p, profile) => (p.risk === 'YELLOW' && p.cautionElderly && profile.ageRange === '65plus' ? { verdict: 'ESCALATE' } : null),
  },
  {
    id: 'R-PER-001',
    reason: 'PERSISTENT_SYMPTOM',
    check: (p, profile, ctx) => {
      if (p.risk !== 'YELLOW' || ctx.symptomDays === undefined) return null;
      const hasRisk = (profile.conditions?.length ?? 0) > 0;
      const days = ctx.symptomDays;
      if (days >= PROTOTYPE_THRESHOLDS.persistentAnyDays) return { verdict: 'ESCALATE' };
      if (hasRisk && days > PROTOTYPE_THRESHOLDS.persistentWithRiskDays) return { verdict: 'ESCALATE' };
      return null;
    },
  },
  {
    id: 'R-MIS-001',
    reason: 'MISSING_INFO',
    check: (p, profile) => {
      if (p.risk !== 'YELLOW') return null;
      const missing = REQUIRED_FOR_OTC.filter((field) => profile[field] === undefined);
      return missing.length > 0 ? { verdict: 'CONDITION', missing } : null;
    },
  },
];
