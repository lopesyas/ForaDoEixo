/** Limiares de PROTÓTIPO. Não são orientação clínica; precisam de validação farmacêutica. */
export const PROTOTYPE_THRESHOLDS = {
  /** Sintoma além disto, em pessoa com condição de risco, vai para o farmacêutico. */
  persistentWithRiskDays: 1,
  /** Sintoma além disto, em qualquer pessoa, vai para o farmacêutico. */
  persistentAnyDays: 3,
} as const;
