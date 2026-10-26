import type { Condition, InteractionClass } from '../domain/safety';

/** Rótulos em linguagem simples (nada de jargão ou código na tela). */
export const CATEGORY_LABEL: Record<string, string> = {
  hidratante_facial: 'Hidratante para o rosto',
  hidratante_corporal: 'Hidratante para o corpo',
  protetor_solar: 'Protetor solar',
  shampoo: 'Shampoo',
  condicionador: 'Condicionador',
  sabonete: 'Sabonete',
  desodorante: 'Desodorante',
  creme_dental: 'Creme dental',
  repelente: 'Repelente',
  protetor_labial: 'Protetor labial',
  perfume: 'Perfume',
  batom: 'Batom',
  esmalte: 'Esmalte',
  antisseptico: 'Álcool em gel e antissépticos',
  analgesico: 'Dor e febre',
  antiacido: 'Azia e gastrite',
  antialergico: 'Alergia',
  expectorante: 'Tosse',
  garganta: 'Garganta',
  sono: 'Sono',
  receita: 'Exigem receita',
};

export const SKIN_LABEL: Record<string, string> = { seca: 'seca', oleosa: 'oleosa', mista: 'mista', normal: 'normal', sensivel: 'sensível' };

export const CONDITION_LABEL: Record<Condition, string> = {
  hypertension: 'pressão alta',
  diabetes: 'diabetes',
  kidney_disease: 'problemas nos rins',
  liver_disease: 'problemas no fígado',
  stomach_ulcer: 'úlcera ou problema no estômago',
  asthma: 'asma',
  pregnancy: 'gravidez',
};

export const CLASS_LABEL: Record<InteractionClass, string> = {
  anticoagulant: 'anticoagulantes (que afinam o sangue)',
  antihypertensive: 'remédios para pressão',
  antidepressant: 'antidepressivos',
  sedative: 'remédios para dormir ou ansiedade',
  nsaid: 'outros anti-inflamatórios',
  diabetes_med: 'remédios para diabetes',
};

export const IMAGE_FOR: Record<string, 'tube' | 'jar' | 'box' | 'bottle'> = {
  hidratante_facial: 'tube',
  hidratante_corporal: 'bottle',
  protetor_solar: 'tube',
  shampoo: 'bottle',
  condicionador: 'bottle',
  sabonete: 'box',
  desodorante: 'bottle',
  creme_dental: 'tube',
  repelente: 'bottle',
  protetor_labial: 'tube',
  perfume: 'bottle',
  batom: 'tube',
  esmalte: 'bottle',
  antisseptico: 'bottle',
};
