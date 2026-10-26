/**
 * Tratamento do cadastro público de MEDICAMENTOS da Anvisa (TA_CONSULTA_MEDICAMENTOS).
 * Funções puras: o script lê o arquivo, os testes cobrem as regras.
 *
 * O que o cadastro TEM: nome, empresa, substâncias ativas, categoria regulatória (genérico, similar, novo…),
 * situação e a TARJA. O que NÃO tem: contraindicações, interações, dose, preço, estoque.
 * Contraindicações e interações abaixo são uma CURADORIA DE PROTÓTIPO por substância (conhecimento público,
 * simplificado) e precisam de validação farmacêutica antes de qualquer uso real.
 *
 * Princípio: só recomendamos o que sabemos conferir. Um medicamento só entra como "sem receita recomendável"
 * se TODAS as suas substâncias estiverem na tabela abaixo.
 */
import { fold, hash, titleCase, companyShort } from './cosmetics';
import { confirmedOverTheCounter, type CmedPresentation } from './cmed';
import type { Condition, InteractionClass } from '../domain/safety';

export type MedicineGroup = 'analgesico' | 'antiacido' | 'antialergico' | 'expectorante' | 'garganta' | 'sono';

export interface SubstanceRule {
  /** Reconhece a substância no texto do cadastro (já sem acento e em minúsculas). */
  match: RegExp;
  canonical: string;
  group: MedicineGroup;
  /** Para que serve, em linguagem simples. */
  use: string;
  avoidIf: Condition[];
  interactsWith: InteractionClass[];
  cautionElderly?: boolean;
}

export const SUBSTANCE_RULES: SubstanceRule[] = [
  { match: /^paracetamol$/, canonical: 'paracetamol', group: 'analgesico', use: 'dor e febre', avoidIf: ['liver_disease'], interactsWith: ['anticoagulant'] },
  { match: /^dipirona( monoidratada| sodica)?$/, canonical: 'dipirona', group: 'analgesico', use: 'dor e febre', avoidIf: [], interactsWith: [] },
  { match: /^ibuprofeno$/, canonical: 'ibuprofeno', group: 'analgesico', use: 'dor, febre e inflamação', avoidIf: ['stomach_ulcer', 'kidney_disease', 'hypertension', 'asthma'], interactsWith: ['anticoagulant', 'nsaid', 'antihypertensive'], cautionElderly: true },
  { match: /^naproxeno( sodico)?$/, canonical: 'naproxeno', group: 'analgesico', use: 'dor e inflamação', avoidIf: ['stomach_ulcer', 'kidney_disease', 'hypertension', 'asthma'], interactsWith: ['anticoagulant', 'nsaid', 'antihypertensive'], cautionElderly: true },
  { match: /^acido acetilsalicilico$/, canonical: 'ácido acetilsalicílico', group: 'analgesico', use: 'dor e febre', avoidIf: ['stomach_ulcer', 'kidney_disease', 'asthma'], interactsWith: ['anticoagulant', 'nsaid'], cautionElderly: true },
  { match: /^cafeina( anidra)?$/, canonical: 'cafeína', group: 'analgesico', use: 'reforço de analgésico', avoidIf: [], interactsWith: [] },
  { match: /^citrato de orfenadrina$/, canonical: 'orfenadrina', group: 'analgesico', use: 'dor muscular', avoidIf: [], interactsWith: ['sedative'], cautionElderly: true },
  { match: /^(mucato|dimetilsulfato) de isometepteno$|^isometepteno/, canonical: 'isometepteno', group: 'analgesico', use: 'dor de cabeça', avoidIf: ['hypertension'], interactsWith: [] },
  { match: /^carbonato de calcio$/, canonical: 'carbonato de cálcio', group: 'antiacido', use: 'azia e má digestão', avoidIf: ['kidney_disease'], interactsWith: [] },
  { match: /^hidroxido de aluminio$/, canonical: 'hidróxido de alumínio', group: 'antiacido', use: 'azia e má digestão', avoidIf: ['kidney_disease'], interactsWith: [] },
  { match: /^hidroxido de magnesio$/, canonical: 'hidróxido de magnésio', group: 'antiacido', use: 'azia e má digestão', avoidIf: ['kidney_disease'], interactsWith: [] },
  { match: /^bicarbonato de sodio$/, canonical: 'bicarbonato de sódio', group: 'antiacido', use: 'azia e má digestão', avoidIf: ['hypertension', 'kidney_disease'], interactsWith: [] },
  { match: /^(carbonato de sodio|acido citrico)$/, canonical: 'sais antiácidos', group: 'antiacido', use: 'azia e má digestão', avoidIf: ['hypertension', 'kidney_disease'], interactsWith: [] },
  { match: /^(cloridrato de )?fexofenadina$/, canonical: 'fexofenadina', group: 'antialergico', use: 'alergia', avoidIf: [], interactsWith: [] },
  { match: /^desloratadina$/, canonical: 'desloratadina', group: 'antialergico', use: 'alergia', avoidIf: [], interactsWith: [] },
  { match: /^loratadina$/, canonical: 'loratadina', group: 'antialergico', use: 'alergia', avoidIf: [], interactsWith: [] },
  { match: /^dicloridrato de levocetirizina$|^levocetirizina$/, canonical: 'levocetirizina', group: 'antialergico', use: 'alergia', avoidIf: ['kidney_disease'], interactsWith: ['sedative'] },
  { match: /^maleato de dexclorfeniramina$/, canonical: 'dexclorfeniramina', group: 'antialergico', use: 'alergia (pode dar sono)', avoidIf: ['asthma'], interactsWith: ['sedative'], cautionElderly: true },
  { match: /^(cloridrato de )?ambroxol$/, canonical: 'ambroxol', group: 'expectorante', use: 'tosse com catarro', avoidIf: [], interactsWith: [] },
  { match: /^acetilcisteina$/, canonical: 'acetilcisteína', group: 'expectorante', use: 'tosse com catarro', avoidIf: ['asthma', 'stomach_ulcer'], interactsWith: [] },
  { match: /^carbocisteina$/, canonical: 'carbocisteína', group: 'expectorante', use: 'tosse com catarro', avoidIf: ['stomach_ulcer'], interactsWith: [] },
  // Fitoterápicos de venda livre para sono leve. Podem dar sonolência: interagem com sedativos e pedem cautela em idosos.
  { match: /^passiflora incarnata/, canonical: 'passiflora', group: 'sono', use: 'sono leve e tensão (pode dar sonolência)', avoidIf: [], interactsWith: ['sedative'], cautionElderly: true },
  { match: /^valeriana officinalis/, canonical: 'valeriana', group: 'sono', use: 'sono leve e tensão (pode dar sonolência)', avoidIf: [], interactsWith: ['sedative', 'antidepressant'], cautionElderly: true },
  { match: /^melissa officinalis/, canonical: 'melissa', group: 'sono', use: 'sono leve e tensão (pode dar sonolência)', avoidIf: [], interactsWith: ['sedative'] },
  { match: /^cloridrato de benzidamina$|^benzidamina$/, canonical: 'benzidamina', group: 'garganta', use: 'dor e inflamação na garganta', avoidIf: ['asthma'], interactsWith: [] },
];

/** Sintoma -> grupos de medicamento que sabemos conferir. Sintoma fora daqui vai ao farmacêutico. */
export const SYMPTOM_GROUPS: Record<string, MedicineGroup[]> = {
  'dor de cabeça': ['analgesico'],
  febre: ['analgesico'],
  dor: ['analgesico'],
  'dor nas costas': ['analgesico'],
  azia: ['antiacido'],
  alergia: ['antialergico'],
  tosse: ['expectorante'],
  'dor de garganta': ['garganta'],
  'dificuldade para dormir': ['sono'],
};

export type Tarja = 1 | 2 | 3 | 4;

/** "2, 1" -> [1, 2]. Vazio ou lixo -> []. */
export function parseTarja(value: string): Tarja[] {
  const codes = value
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n): n is Tarja => n === 1 || n === 2 || n === 3 || n === 4);
  return [...new Set(codes)].sort();
}

/**
 * Códigos de tarja (INFERIDOS pelas amostras do arquivo; o dicionário fornecido é de Alimentos e não os descreve):
 *   1 = venda sem prescrição (ex.: Tylenol, Advil, AAS) · 2 = com prescrição · 3 = com prescrição e retenção
 *   (ex.: antibióticos) · 4 = tarja preta (ex.: zolpidem, fluoxetina).
 * Regra CONSERVADORA: um produto com qualquer apresentação que exija prescrição, ou sem tarja informada, NÃO é tratado como livre.
 */
export function riskFromTarja(tarja: Tarja[]): 'YELLOW' | 'RED' {
  return tarja.length === 1 && tarja[0] === 1 ? 'YELLOW' : 'RED';
}

/** "dipirona, dipirona monoidratada" -> ["dipirona", "dipirona monoidratada"] (sem acento, minúsculas, sem repetição). */
export function parseSubstances(value: string): string[] {
  return [...new Set(value.split(',').map((s) => fold(s).toLowerCase()).filter(Boolean))];
}

export function ruleFor(substance: string): SubstanceRule | undefined {
  return SUBSTANCE_RULES.find((r) => r.match.test(substance));
}

export interface Curated {
  group: MedicineGroup;
  use: string;
  substances: string[]; // nomes canônicos para exibição e para alergias
  avoidIf: Condition[];
  interactsWith: InteractionClass[];
  cautionElderly: boolean;
}

/** Junta as regras de todas as substâncias; devolve null se alguma não for conhecida (então não recomendamos). */
export function curate(substances: string[]): Curated | null {
  if (substances.length === 0) return null;
  const rules = substances.map(ruleFor);
  if (rules.some((r) => r === undefined)) return null;
  const known = rules as SubstanceRule[];
  const main = known.find((r) => r.use !== 'reforço de analgésico') ?? known[0]!;
  return {
    group: main.group,
    use: [...new Set(known.map((r) => r.use).filter((u) => u !== 'reforço de analgésico'))].join(', ') || main.use,
    substances: [...new Set(known.map((r) => r.canonical))],
    avoidIf: [...new Set(known.flatMap((r) => r.avoidIf))],
    interactsWith: [...new Set(known.flatMap((r) => r.interactsWith))],
    cautionElderly: known.some((r) => r.cautionElderly),
  };
}

export interface MedicineRow {
  process: string;
  seq: string;
  name: string;
  company: string;
  substances: string;
  category: string;
  tarja: string;
  active: string; // VALIDADE_SITUACAO
  authorization: string; // TIPO_AUTORIZACAO
  registration: string;
}

/** Ativo = situação "Ativo" e registrado (não só notificado). Interpretação dos campos; confirmar na documentação de Medicamentos. */
export function isActiveMedicine(row: Pick<MedicineRow, 'active' | 'authorization'>): boolean {
  return row.active === 'Ativo' && row.authorization === 'REGISTRADO';
}

export interface MedicineProduct {
  id: string;
  name: string;
  company: string;
  /** Categoria regulatória do cadastro: Genérico, Similar, Novo… */
  regulatory: string;
  risk: 'YELLOW' | 'RED';
  tarja: Tarja[];
  /** Só em produtos sem receita que sabemos conferir. */
  group?: MedicineGroup;
  use?: string;
  substances: string[];
  avoidIf: Condition[];
  interactsWith: InteractionClass[];
  cautionElderly: boolean;
  source: { dataset: 'ANVISA TA_CONSULTA_MEDICAMENTOS'; process: string; registration: string };
  /** `priceCents` é o PMC da CMED (preço máximo regulado); só o estoque é simulado. */
  simulated: { priceCents: number; inStock: boolean };
  /** De onde vem o preço: tabela CMED, apresentação de menor PMC. */
  pricing: { source: 'CMED'; publishedAt: string; icms: number; presentation: string; ean: string; registration13: string };
}

/** Data da lista CMED usada e alíquota de ICMS da coluna de PMC (conferir ao trocar a planilha). */
export const CMED_PUBLISHED_AT = '2026-10-09';
export const CMED_ICMS = 18;


/** Devolve o produto tratado, ou null se não vale entrar no catálogo de demonstração. */
export function toMedicine(row: MedicineRow, cmed: CmedPresentation[]): MedicineProduct | null {
  if (!isActiveMedicine(row)) return null;
  // Sem preço CMED não entra: o preço mostrado é sempre o regulado, nunca inventado.
  const cheapest = cmed[0];
  if (!cheapest) return null;
  const tarja = parseTarja(row.tarja);
  // Dupla checagem: "sem receita" só se a Anvisa E a CMED concordarem; senão, exige receita.
  const risk = confirmedOverTheCounter(tarja, cmed) ? 'YELLOW' : 'RED';
  const pricing = { source: 'CMED' as const, publishedAt: CMED_PUBLISHED_AT, icms: CMED_ICMS, presentation: cheapest.presentation, ean: cheapest.ean, registration13: cheapest.registration };
  const substances = parseSubstances(row.substances);
  const base = {
    id: `med-${row.seq}`,
    name: titleCase(row.name),
    company: companyShort(row.company),
    regulatory: row.category || 'Não informada',
    tarja,
    source: { dataset: 'ANVISA TA_CONSULTA_MEDICAMENTOS' as const, process: row.process, registration: row.registration },
  };
  const stock = (hash(row.seq) >>> 16) % 10 !== 0;

  if (risk === 'RED') {
    if (substances.length === 0) return null;
    return {
      ...base,
      risk,
      substances: substances.map((s) => titleCase(s).toLowerCase()),
      avoidIf: [],
      interactsWith: [],
      cautionElderly: false,
      simulated: { priceCents: cheapest.pmcCents, inStock: stock },
      pricing,
    };
  }
  const curated = curate(substances);
  if (!curated) return null;
  return {
    ...base,
    risk,
    group: curated.group,
    use: curated.use,
    substances: curated.substances,
    avoidIf: curated.avoidIf,
    interactsWith: curated.interactsWith,
    cautionElderly: curated.cautionElderly,
    simulated: { priceCents: cheapest.pmcCents, inStock: stock },
    pricing,
  };
}

/** Remédios de receita comuns em farmácia, para a demonstração do bloqueio (e para reconhecer o pedido pelo nome). */
export const RX_DEMO_SUBSTANCES = ['amoxicilina', 'azitromicina', 'cefalexina', 'zolpidem', 'fluoxetina', 'sertralina', 'clonazepam', 'alprazolam', 'losartana', 'enalapril', 'atenolol', 'metformina', 'omeprazol', 'sinvastatina', 'sildenafila'];

/** Receita para a demonstração: tarja informada e substância conhecida (nada de soro hospitalar ou oncológico). */
export function isDemoRx(p: MedicineProduct): boolean {
  return p.risk === 'RED' && p.tarja.length > 0 && p.substances.some((s) => RX_DEMO_SUBSTANCES.some((d) => fold(s).toLowerCase().includes(d)));
}

export const MEDICINE_TARGETS = { analgesico: 24, antiacido: 6, antialergico: 12, expectorante: 8, garganta: 3, sono: 3, receita: 16 } as const;

/** Amostra variada e determinística: no máximo 2 por empresa, sem nomes repetidos e priorizando combinações diferentes de substâncias. */
export function pickMedicines(candidates: MedicineProduct[], target: number): MedicineProduct[] {
  const seenNames = new Set<string>();
  const perCompany = new Map<string, number>();
  const perSubstances = new Map<string, number>();
  const ranked = [...candidates].sort((a, b) => hash(a.id) - hash(b.id));
  const out: MedicineProduct[] = [];
  for (const p of ranked) {
    const key = fold(p.name);
    const subs = p.substances.join('+');
    if (seenNames.has(key) || (perCompany.get(p.company) ?? 0) >= 2 || (perSubstances.get(subs) ?? 0) >= 3) continue;
    seenNames.add(key);
    perCompany.set(p.company, (perCompany.get(p.company) ?? 0) + 1);
    perSubstances.set(subs, (perSubstances.get(subs) ?? 0) + 1);
    out.push(p);
    if (out.length >= target) break;
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
