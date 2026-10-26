/**
 * Camada de segurança em saúde. Domínio PURO: sem banco, sem rede, sem IA.
 * A IA nunca decide o que pode ser sugerido; quem decide é este módulo.
 *
 * ATENÇÃO: regras, limiares e textos são de PROTÓTIPO, feitos a partir de conhecimento público e
 * simplificados. Precisam de validação farmacêutica e revisão jurídica antes de qualquer uso real.
 */
export type RiskLevel = 'GREEN' | 'YELLOW' | 'RED';

export const CONDITIONS = ['hypertension', 'diabetes', 'kidney_disease', 'liver_disease', 'stomach_ulcer', 'asthma', 'pregnancy'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const INTERACTION_CLASSES = ['anticoagulant', 'antihypertensive', 'antidepressant', 'sedative', 'nsaid', 'diabetes_med'] as const;
export type InteractionClass = (typeof INTERACTION_CLASSES)[number];

export type AgeRange = 'under12' | '12-17' | '18-49' | '50-64' | '65plus';

/** O que a camada de segurança precisa saber de um produto. */
export interface SafetyProduct {
  id: string;
  name: string;
  risk: RiskLevel;
  /** Substâncias em minúsculas, sem acento (ex.: "ibuprofeno"). */
  ingredients: string[];
  /** Condições em que o produto não deve ser indicado. */
  avoidIf: Condition[];
  /** Classes de medicamento que interagem com este produto. */
  interactsWith: InteractionClass[];
  /** Pede cautela extra para idosos. */
  cautionElderly?: boolean;
}

/**
 * Perfil de quem VAI USAR o produto (não de quem compra).
 * `undefined` = ainda não perguntamos. `[]` = perguntamos e não há nada. A diferença importa.
 */
export interface SafetyProfile {
  ageRange?: AgeRange;
  conditions?: Condition[];
  allergies?: string[];
  medClasses?: InteractionClass[];
}

export interface SafetyContext {
  /** Há quantos dias o sintoma persiste. */
  symptomDays?: number;
}

export type ProfileField = 'ageRange' | 'conditions' | 'allergies' | 'medClasses';

export type ReasonCode =
  | 'RX_REQUIRED'
  | 'ALLERGY'
  | 'CONTRAINDICATION'
  | 'INTERACTION'
  | 'CHILD'
  | 'PREGNANCY'
  | 'ELDERLY'
  | 'PERSISTENT_SYMPTOM'
  | 'MISSING_INFO';

/** Do mais leve ao mais grave. */
export type Verdict = 'ALLOW' | 'CONDITION' | 'BLOCK' | 'ESCALATE';
export const VERDICT_SEVERITY: Record<Verdict, number> = { ALLOW: 0, CONDITION: 1, BLOCK: 2, ESCALATE: 3 };

export interface SafetyResult {
  verdict: Verdict;
  reasons: ReasonCode[];
  /** Todas as regras que dispararam, para auditoria. */
  ruleIds: string[];
  /** O que perguntar antes de poder liberar (só em CONDITION). */
  missingInfo: ProfileField[];
}
