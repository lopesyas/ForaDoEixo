/**
 * Tabela CMED (Anvisa): preço fábrica (PF) e preço máximo ao consumidor (PMC) por apresentação.
 * Funções puras: o script de geração lê o arquivo; os testes cobrem estas regras.
 *
 * Atenção: PMC é o TETO regulado de venda, não o preço praticado por uma rede específica.
 */
export type CmedTarja = 'sem_tarja' | 'vermelha' | 'vermelha_restricao' | 'preta' | 'desconhecida';

export interface CmedPresentation {
 
/** Os 9 primeiros dígitos do registro: é o `NU_REGISTRO_PRODUTO` do cadastro de medicamentos. */
  registration9: string;
  registration: string;
  ean: string;
  product: string;
  presentation: string;
  pmcCents: number;
  tarja: CmedTarja;
}

/** "1.234,56" -> 123456 · "27,44" -> 2744 · "-" ou vazio -> undefined. */
export function parseBrl(value: string | undefined): number | undefined {
  const t = (value ?? '').trim();
  if (!/\d/.test(t)) return undefined;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
}

export function parseCmedTarja(text: string | undefined): CmedTarja {
  const t = (text ?? '').toLowerCase();
  if (t.includes('sem tarja')) return 'sem_tarja';
  if (t.includes('preta')) return 'preta';
  if (t.includes('restri')) return 'vermelha_restricao';
  if (t.includes('vermelha')) return 'vermelha';
  return 'desconhecida';
}

const digits = (v: string | undefined) => (v ?? '').replace(/\D/g, '');

/** Linha da planilha -> apresentação. `icms` escolhe a coluna de PMC (ex.: 18 -> "PMC 18 %"). Sem PMC ou sem registro: null. */
export function parseCmedRow(rec: Record<string, string | undefined>, icms = 18): CmedPresentation | null {
  const registration = digits(rec['REGISTRO']);
  const pmcCents = parseBrl(rec[`PMC ${icms} %`]);
  if (registration.length < 9 || pmcCents === undefined) return null;
  const ean = digits(rec['EAN 1']);
  return {
    registration9: registration.slice(0, 9),
    registration,
    ean: ean.length >= 8 ? ean : '',
    product: (rec['PRODUTO'] ?? '').trim(),
    presentation: (rec['APRESENTAÇÃO'] ?? '').trim(),
    pmcCents,
    tarja: parseCmedTarja(rec['TARJA']),
  };
}

export type CmedIndex = Map<string, CmedPresentation[]>;

/** Agrupa por registro (9 dígitos); dentro de cada registro, da apresentação mais barata para a mais cara. */
export function buildCmedIndex(list: CmedPresentation[]): CmedIndex {
  const index: CmedIndex = new Map();
  for (const p of list) index.set(p.registration9, [...(index.get(p.registration9) ?? []), p]);
  for (const [, items] of index) items.sort((a, b) => a.pmcCents - b.pmcCents || a.presentation.localeCompare(b.presentation));
  return index;
}

/**
 * Dupla checagem de segurança: só é "sem receita" se a Anvisa (tarja 1) E a CMED (Sem Tarja, em TODAS as apresentações)
 * concordarem. Divergência ou tarja não informada vira "exige receita".
 */
export function confirmedOverTheCounter(anvisaTarja: number[], presentations: CmedPresentation[]): boolean {
  return anvisaTarja.length === 1 && anvisaTarja[0] === 1 && presentations.length > 0 && presentations.every((p) => p.tarja === 'sem_tarja');
}
