/**
 * Tratamento do cadastro público de cosméticos da Anvisa (TA_CONSULTA_COSMETICOS).
 * Funções puras: o script lê o arquivo e usa estas funções, e os testes cobrem as regras.
 *
 * O cadastro tem NOME, EMPRESA e SITUAÇÃO do produto. Não tem preço, estoque, ingredientes nem tipo de pele.
 * Tudo isso que não vem do cadastro é SIMULADO e marcado como tal.
 */
export type CosmeticCategory =
  | 'hidratante_facial'
  | 'hidratante_corporal'
  | 'protetor_solar'
  | 'shampoo'
  | 'condicionador'
  | 'sabonete'
  | 'desodorante'
  | 'creme_dental'
  | 'repelente'
  | 'protetor_labial'
  | 'perfume'
  | 'batom'
  | 'esmalte'
  | 'antisseptico';

export type SkinType = 'seca' | 'oleosa' | 'mista' | 'normal' | 'sensivel';

export interface RegistryRow {
  process: string;
  name: string;
  company: string;
  expiresOn: string;
  situation: string;
  registration: string;
}

/** Sem acento, maiúsculo e com espaços simples: base para comparar texto. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (n: string, ...words: string[]) => words.some((w) => n.includes(w));

/** Classifica pelo nome. Devolve null para o que não nos interessa (kits, tintas, maquiagem etc.). */
export function classify(name: string): CosmeticCategory | null {
  const n = fold(name);
  if (has(n, ' KIT ', 'KIT ', 'REFIL')) return null;
  if (has(n, 'CREME DENTAL', 'PASTA DENTAL', 'GEL DENTAL')) return 'creme_dental';
  if (has(n, 'REPELENTE')) return 'repelente';
  if (has(n, 'GEL ANTISSEPTICO', 'ALCOOL EM GEL', 'ALCOOL GEL', 'ALCOOL 70', 'ANTISSEPTICO PARA MAOS', 'HIGIENIZADOR DE MAOS')) return 'antisseptico';
  if (has(n, 'ESMALTE')) return 'esmalte';
  if (has(n, 'BATOM')) return 'batom';
  if (has(n, 'PROTETOR LABIAL', 'HIDRATANTE LABIAL', 'BALSAMO LABIAL', 'MANTEIGA LABIAL')) return 'protetor_labial';
  if (has(n, 'DESODORANTE') && !has(n, 'PARA OS PES', 'PERNAS E PES')) return 'desodorante';
  if (has(n, 'CONDICIONADOR')) return 'condicionador';
  if (has(n, 'SHAMPOO') && !has(n, 'CONDICIONADOR')) return 'shampoo';
  if (has(n, 'SABONETE') && !has(n, 'ANTISSEPTICO')) return 'sabonete';
  if (has(n, 'PERFUME', 'COLONIA', 'DEO COLONIA', 'EAU DE')) return 'perfume';
  if (has(n, 'HIDRATANTE') && has(n, 'FACIAL', 'ROSTO')) return 'hidratante_facial';
  if (has(n, 'PROTETOR SOLAR', 'FILTRO SOLAR', 'BLOQUEADOR SOLAR')) return 'protetor_solar';
  if (has(n, 'HIDRATANTE') && has(n, 'CORPORAL', 'CORPO', 'MAOS', 'PES ')) return 'hidratante_corporal';
  return null;
}

const SKIN_WORDS: [RegExp, SkinType][] = [
  [/^(SECA|SECAS)$/, 'seca'],
  [/^(OLEOSA|OLEOSAS)$/, 'oleosa'],
  [/^(MISTA|MISTAS)$/, 'mista'],
  [/^(NORMAL|NORMAIS)$/, 'normal'],
  [/^(SENSIVEL|SENSIVEIS|DELICADA|DELICADAS)$/, 'sensivel'],
];
const SKIN_CATEGORIES = new Set<CosmeticCategory>(['hidratante_facial', 'hidratante_corporal', 'protetor_solar', 'sabonete']);

/**
 * Só o que o NOME afirma, lido logo depois de "PELE"/"PELES" ("Pele Normal a Seca" -> normal e seca).
 * "Delicada" sozinho (ex.: "Colônia Delicada") não conta. Fora de produtos de cuidado com a pele, devolve vazio.
 * Se o nome não cita, devolve vazio (desconhecido), nunca um palpite.
 */
export function skinTypesFromName(name: string, category?: CosmeticCategory): SkinType[] {
  if (category && !SKIN_CATEGORIES.has(category)) return [];
  const tokens = fold(name).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(Boolean);
  const found = new Set<SkinType>();
  tokens.forEach((token, i) => {
    if (token !== 'PELE' && token !== 'PELES') return;
    for (const next of tokens.slice(i + 1, i + 6)) {
      const hit = SKIN_WORDS.find(([re]) => re.test(next));
      if (hit) found.add(hit[1]);
      else if (!['A', 'E', 'OU', 'AO', 'EXTRA', 'DE'].includes(next)) break;
    }
  });
  const n = fold(name);
  if (/\bOIL ?-?FREE\b/.test(n)) found.add('oleosa');
  return [...found];
}

export function spfFromName(name: string): number | undefined {
  const m = fold(name).match(/\bFPS\s*(\d{1,3})\b/);
  return m ? Number(m[1]) : undefined;
}

/** "25/12/2030 00:00:00" -> Date (ou null). */
export function parseBrDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ativo = situação "S" e (sem data de vencimento, ou vencimento no futuro).
 * ATENÇÃO: é uma interpretação dos campos do arquivo; confirme com a documentação oficial antes de produção.
 */
export function isActive(row: Pick<RegistryRow, 'situation' | 'expiresOn'>, today: Date): boolean {
  if (row.situation !== 'S') return false;
  if (!row.expiresOn.trim()) return true;
  const expires = parseBrDate(row.expiresOn);
  return expires !== null && expires.getTime() > today.getTime();
}

const KEEP_UPPER = new Set(['FPS', 'UVA', 'UVB', 'PH', 'UV', 'DNA', 'AHA', 'BHA', 'PPD', 'SOS', 'ML', 'G', 'KG', 'MG']);
const SMALL = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'PARA', 'COM', 'A', 'O', 'AS', 'OS']);

/** "CREME FACIAL SUAVE FPS 30" -> "Creme Facial Suave FPS 30". */
export function titleCase(name: string): string {
  return name
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '') // símbolos soltos no começo do cadastro ("¿Sabonete…")
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, i) => {
      const upper = word.toUpperCase();
      if (KEEP_UPPER.has(fold(word))) return upper;
      if (/\d/.test(word)) return word.toUpperCase();
      if (i > 0 && SMALL.has(fold(word))) return word.toLowerCase();
      const firstLetter = word.search(/\p{L}/u); // aspas antes da palavra ("'oil Free'") não impedem a maiúscula
      if (firstLetter < 0) return word;
      return word.slice(0, firstLetter) + word.charAt(firstLetter).toUpperCase() + word.slice(firstLetter + 1).toLowerCase();
    })
    .join(' ');
}

const COMPANY_NOISE = /\b(LTDA\.?|S\/A|S\.A\.?|EPP|EIRELI|ME|INDUSTRIA|INDÚSTRIA|COMERCIO|COMÉRCIO|IND|IMP|EXP|COM|E|DE|DO|DA|COSMETICOS|COSMÉTICOS|PRODUTOS|DO BRASIL|BRASIL|IMPORTACAO|IMPORTAÇÃO|EXPORTACAO|EXPORTAÇÃO|HIGIENE)\b/gi;

/** Nome curto do fabricante para exibição. */
export function companyShort(company: string): string {
  const cleaned = company.replace(COMPANY_NOISE, ' ').replace(/[-.,]/g, ' ').replace(/\s+/g, ' ').trim();
  return titleCase(cleaned || company);
}

/** FNV-1a: sorteio determinístico (mesmo arquivo, mesmo catálogo). */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface SimulatedFields {
  priceCents: number;
  unitQty: number;
  unitLabel: 'g' | 'ml';
  inStock: boolean;
}

const PRICE_RANGE: Record<CosmeticCategory, [number, number]> = {
  hidratante_facial: [1290, 6990],
  hidratante_corporal: [990, 4990],
  protetor_solar: [1990, 8990],
  shampoo: [790, 2990],
  condicionador: [790, 2990],
  sabonete: [190, 1290],
  desodorante: [690, 2490],
  creme_dental: [290, 1990],
  repelente: [1290, 3490],
  protetor_labial: [490, 2490],
  perfume: [2990, 19990],
  batom: [990, 4990],
  esmalte: [490, 1990],
  antisseptico: [390, 1990],
};
const QTY: Record<CosmeticCategory, number[]> = {
  hidratante_facial: [40, 50, 60, 100],
  hidratante_corporal: [200, 400, 500],
  protetor_solar: [50, 60, 120],
  shampoo: [250, 325, 400],
  condicionador: [250, 325, 400],
  sabonete: [85, 90, 150],
  desodorante: [55, 150, 200],
  creme_dental: [70, 90, 120],
  repelente: [100, 200, 240],
  protetor_labial: [4, 5, 10],
  perfume: [50, 100],
  batom: [3, 4, 5],
  esmalte: [8, 9, 10],
  antisseptico: [70, 200, 500],
};
const LIQUID = new Set<CosmeticCategory>(['shampoo', 'condicionador', 'desodorante', 'repelente', 'perfume', 'esmalte', 'antisseptico']);

/** Preço, quantidade e estoque SIMULADOS, estáveis por produto (a mesma entrada dá sempre o mesmo resultado). */
/** Preço simulado, inclinado para o barato (sempre há opções de orçamento baixo) e sempre terminando em ,90. */
export function priceFrom(min: number, max: number, seed: string): number {
  const u = (hash(seed) % 1000) / 1000;
  return Math.floor((min + Math.floor((max - min) * u * u)) / 100) * 100 + 90;
}

export function simulate(category: CosmeticCategory, seed: string): SimulatedFields {
  const h = hash(seed);
  const [min, max] = PRICE_RANGE[category];
  const qtyOptions = QTY[category];
  return {
    priceCents: priceFrom(min, max, seed),
    unitQty: qtyOptions[(h >>> 8) % qtyOptions.length]!,
    unitLabel: LIQUID.has(category) ? 'ml' : 'g',
    inStock: (h >>> 16) % 10 !== 0, // ~10% sem estoque, para testar o estado "indisponível"
  };
}

export interface CosmeticProduct {
  id: string;
  name: string;
  company: string;
  category: CosmeticCategory;
  skinTypes: SkinType[];
  spf?: number;
  risk: 'GREEN';
  source: { dataset: 'ANVISA TA_CONSULTA_COSMETICOS'; process: string; registration: string };
  /** Tudo aqui é inventado para a demonstração. */
  simulated: SimulatedFields;
}

export function toProduct(row: RegistryRow, category: CosmeticCategory): CosmeticProduct {
  const spf = spfFromName(row.name);
  return {
    id: `cos-${row.process}`,
    name: titleCase(row.name),
    company: companyShort(row.company),
    category,
    skinTypes: skinTypesFromName(row.name, category),
    ...(spf !== undefined ? { spf } : {}),
    risk: 'GREEN',
    source: { dataset: 'ANVISA TA_CONSULTA_COSMETICOS', process: row.process, registration: row.registration },
    simulated: simulate(category, row.process),
  };
}

export const TARGETS: Record<CosmeticCategory, number> = {
  hidratante_facial: 30,
  hidratante_corporal: 14,
  protetor_solar: 16,
  shampoo: 12,
  condicionador: 10,
  sabonete: 12,
  desodorante: 12,
  creme_dental: 8,
  repelente: 8,
  protetor_labial: 8,
  perfume: 10,
  batom: 8,
  esmalte: 6,
  antisseptico: 8,
};

/**
 * Escolhe uma amostra variada e determinística: no máximo 2 por empresa, sem nomes repetidos, e prioriza
 * quem cita o tipo de pele no nome (para a demonstração de "pele seca" ter produtos reais).
 */
export function pickSample(candidates: CosmeticProduct[], target: number): CosmeticProduct[] {
  const seenNames = new Set<string>();
  const perCompany = new Map<string, number>();
  const ranked = [...candidates].sort((a, b) => {
    const skin = Number(b.skinTypes.length > 0) - Number(a.skinTypes.length > 0);
    return skin !== 0 ? skin : hash(a.id) - hash(b.id);
  });
  const out: CosmeticProduct[] = [];
  for (const p of ranked) {
    const key = fold(p.name);
    if (seenNames.has(key) || (perCompany.get(p.company) ?? 0) >= 2) continue;
    seenNames.add(key);
    perCompany.set(p.company, (perCompany.get(p.company) ?? 0) + 1);
    out.push(p);
    if (out.length >= target) break;
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
