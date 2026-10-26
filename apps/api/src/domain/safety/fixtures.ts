import type { SafetyProduct } from './types';

/** Produtos FICTÍCIOS para teste. Os nomes não representam produtos reais. */
export const moisturizer: SafetyProduct = { id: 'hidratante', name: 'Hidratante Facial (fictício)', risk: 'GREEN', ingredients: ['glicerina'], avoidIf: [], interactsWith: [] };

export const painA: SafetyProduct = {
  id: 'analgesico-a',
  name: 'Analgésico A (fictício)',
  risk: 'YELLOW',
  ingredients: ['paracetamol'],
  avoidIf: ['liver_disease'],
  interactsWith: ['anticoagulant'],
};

export const painB: SafetyProduct = {
  id: 'analgesico-b',
  name: 'Analgésico B (fictício)',
  risk: 'YELLOW',
  ingredients: ['ibuprofeno'],
  avoidIf: ['hypertension', 'stomach_ulcer', 'kidney_disease', 'pregnancy'],
  interactsWith: ['anticoagulant', 'nsaid'],
  cautionElderly: true,
};

export const antibiotic: SafetyProduct = { id: 'antibiotico', name: 'Antibiótico (fictício)', risk: 'RED', ingredients: ['amoxicilina'], avoidIf: [], interactsWith: [] };

/** Perfil totalmente respondido, sem nada de risco. */
export const healthyAdult = { ageRange: '18-49' as const, conditions: [], allergies: [], medClasses: [] };
