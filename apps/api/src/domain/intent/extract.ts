import { fold, skinTypesFromName, type CosmeticCategory, type SkinType } from '../../catalog/cosmetics';

/**
 * Extrator de intenção POR REGRAS. É o modo de contingência: funciona sem IA, de forma previsível.
 * A IA, quando entrar, devolve o mesmo formato e este extrator continua como reserva.
 */
export type Relative = 'pai' | 'mae';

export interface Extracted {
  /** "hidratante" sozinho é ambíguo: rosto ou corpo? */
  category?: CosmeticCategory | 'hidratante' | 'cabelo';
  maxPriceCents?: number;
  skin: SkinType[];
  relative: Relative | null;
  wantsReorder: boolean;
  /** Pediu remédio que só se vende com receita. */
  rx: boolean;
  health: { label: string } | null;
  symptomDays?: number;
}

const has = (n: string, re: RegExp) => re.test(n);

const SYMPTOMS: [RegExp, string][] = [
  [/dor de cabeca|cefaleia|enxaqueca/, 'dor de cabeça'],
  [/dor (nas |na )?costas|dor muscular/, 'dor nas costas'],
  [/dor de garganta/, 'dor de garganta'],
  [/azia|queimacao|ma digestao/, 'azia'],
  [/alergia|alergic|coceira|rinite|espirr/, 'alergia'],
  [/dor de estomago/, 'dor de estômago'],
  [/febre/, 'febre'],
  [/tosse/, 'tosse'],
  [/gripe|resfriado/, 'gripe'],
  [/enjoo|nausea/, 'enjoo'],
  [/\bdor\b/, 'dor'],
  [/dormir|insonia/, 'dificuldade para dormir'],
  [/remedio|medicamento|comprimido/, 'um remédio'],
];

const RX_WORDS = /antibiotico|amoxicilina|azitromicina|cefalexina|ciprofloxacino|tarja (preta|vermelha)|com receita|controlado|ansiolitico|antidepressivo|rivotril|clonazepam|alprazolam|diazepam|zolpidem|fluoxetina|sertralina|escitalopram|paroxetina|losartana|enalapril|captopril|atenolol|propranolol|anlodipino|metformina|insulina|omeprazol|pantoprazol|sinvastatina|atorvastatina|sildenafila|viagra|prednisona|prednisolona|dexametasona|tramadol|codeina|morfina|anticoncepcional|varfarina|levotiroxina|emagrecer|emagrecedor|emagrecedores|sibutramina|semaglutida|liraglutida|ozempic|mounjaro|medicamentos? especiais?|alto custo/;

function categoryFrom(n: string): Extracted['category'] {
  if (has(n, /creme dental|pasta (de|dental)|gel dental|pasta de dente/)) return 'creme_dental';
  if (has(n, /repelente/)) return 'repelente';
  if (has(n, /protetor labial|hidratante labial|balsamo labial/)) return 'protetor_labial';
  if (has(n, /alcool em gel|alcool gel|gel antisseptico|antisseptico|higienizador/)) return 'antisseptico';
  if (has(n, /esmalte/)) return 'esmalte';
  if (has(n, /batom/)) return 'batom';
  if (has(n, /perfume|colonia/)) return 'perfume';
  if (has(n, /protetor solar|filtro solar|bloqueador solar/)) return 'protetor_solar';
  if (has(n, /condicionador/)) return 'condicionador';
  if (has(n, /shampoo|xampu/)) return 'shampoo';
  if (has(n, /cabelo|cabelos|capilar/)) return 'cabelo';
  if (has(n, /sabonete/)) return 'sabonete';
  if (has(n, /desodorante/)) return 'desodorante';
  if (has(n, /hidratante|creme (para|pro|de) (o )?(rosto|face|corpo)/)) {
    if (has(n, /rosto|facial|face\b/)) return 'hidratante_facial';
    if (has(n, /corpo|corporal|pernas|bracos|maos|pes\b/)) return 'hidratante_corporal';
    return 'hidratante';
  }
  if (has(n, /creme (para|pro|de) (o )?rosto|creme facial/)) return 'hidratante_facial';
  return undefined;
}

export function maxPriceFrom(n: string): number | undefined {
  const m =
    n.match(/(?:ate|no maximo|maximo de|por ate|menos de|abaixo de|nao passe de)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/) ??
    n.match(/r\$\s*(\d+(?:[.,]\d{1,2})?)/) ??
    n.match(/(\d+(?:[.,]\d{1,2})?)\s*reais/);
  if (!m?.[1]) return undefined;
  const value = Number(m[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : undefined;
}

/** Quem vai usar: vale a ÚLTIMA pessoa citada ("não é para o meu pai, é para a minha mãe"). */
export function relativeFrom(n: string): Relative | null {
  const pai = n.lastIndexOf('pai');
  const mae = Math.max(n.lastIndexOf('mae'), n.lastIndexOf('mamae'));
  if (pai < 0 && mae < 0) return null;
  return mae > pai ? 'mae' : 'pai';
}

export function extract(text: string): Extracted {
  const n = fold(text).toLowerCase();
  const rx = has(n, RX_WORDS);
  const symptom = SYMPTOMS.find(([re]) => re.test(n));
  const days = n.match(/(?:ha|faz|ja faz|durante)\s*(\d{1,2})\s*dias?/) ?? n.match(/(\d{1,2})\s*dias?/);
  const category = categoryFrom(n);
  return {
    ...(category ? { category } : {}),
    ...(maxPriceFrom(n) !== undefined ? { maxPriceCents: maxPriceFrom(n)! } : {}),
    skin: skinTypesFromName(text, 'hidratante_facial'),
    relative: relativeFrom(n),
    wantsReorder: has(n, /repetir|ultima compra|comprar de novo|mesma compra/),
    rx,
    // Produto de cosmético tem prioridade: "creme para dor" é raro, mas "repelente" não é saúde de sintoma.
    health: !category && symptom ? { label: symptom[1] } : null,
    ...(days?.[1] ? { symptomDays: Number(days[1]) } : {}),
  };
}
