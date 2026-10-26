import type { FilterState } from '@ia/shared';
import { toQueryString } from '../api/store';

/** Páginas de categoria da loja. `cat` são as categorias do catálogo; o que não tem produto aqui mostra uma tela de ajuda. */
export interface Preset {
  title: string;
  cat: string[];
  sort?: FilterState['sort'];
  /** Explicação para quem chega em uma categoria que exige receita ou que não existe no catálogo da demonstração. */
  note?: string;
}

const NONE = ['sem_catalogo'];
export const MEDS = ['analgesico', 'antiacido', 'antialergico', 'expectorante', 'garganta', 'sono'];

export const PRESETS: Record<string, Preset> = {
  ofertas: { title: 'Ofertas', cat: [], sort: 'unit' },
  medicamentos: { title: 'Medicamentos e Saúde', cat: [...MEDS, 'receita'] },
  dermo: { title: 'Dermo e Beleza', cat: ['hidratante_facial', 'hidratante_corporal', 'protetor_solar', 'protetor_labial', 'perfume', 'batom', 'esmalte'] },
  skincare: { title: 'SkinCare', cat: ['hidratante_facial', 'hidratante_corporal', 'protetor_solar', 'protetor_labial'] },
  higiene: { title: 'Higiene pessoal', cat: ['sabonete', 'desodorante', 'creme_dental', 'antisseptico', 'shampoo', 'condicionador', 'repelente'] },
  cabelo: { title: 'Cabelo', cat: ['shampoo', 'condicionador'] },
  'vida-saudavel': { title: 'Vida Saudável', cat: ['sono', 'antiacido'] },
  azia: { title: 'Azia e Gastrite', cat: ['antiacido'] },
  'protetor-solar-facial': { title: 'Protetor Solar Facial', cat: ['protetor_solar'] },
  especiais: { title: 'Medicamentos especiais', cat: ['receita'], note: 'Estes medicamentos só são vendidos com receita. Eu não indico nem escolho produtos desta área: um farmacêutico pode ajudar.' },
  emagrecedores: { title: 'Emagrecedores', cat: NONE, note: 'Remédios para emagrecer exigem receita e acompanhamento. Não indico esses produtos: um farmacêutico pode orientar.' },
  whey: { title: 'Whey Protein', cat: NONE, note: 'Esta categoria ainda não está no catálogo da demonstração.' },
  mamaes: { title: 'Mamães e bebês', cat: NONE, note: 'Esta categoria ainda não está no catálogo da demonstração.' },
  conveniencia: { title: 'Conveniência', cat: NONE, note: 'Esta categoria ainda não está no catálogo da demonstração.' },
  marcas: { title: 'Marcas Exclusivas', cat: [], sort: 'name' },
};

export const catalogHash = (slug: string, filters: Partial<FilterState> = {}, extra: Record<string, string> = {}) => {
  const qs = new URLSearchParams(toQueryString(filters));
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return `#/${slug === '' ? 'busca' : `c/${slug}`}${s ? `?${s}` : ''}`;
};

/** Lê os filtros da URL; o que a URL não diz vem da categoria. */
export function filtersFromParams(params: URLSearchParams, preset?: Preset): FilterState {
  const cat = params.get('cat');
  const max = Number(params.get('max'));
  const sort = params.get('sort');
  const skin = params.get('skin');
  return {
    cat: cat !== null ? cat.split(',').filter(Boolean) : (preset?.cat ?? []),
    q: params.get('q') ?? '',
    ...(Number.isInteger(max) && max > 0 ? { maxCents: max } : {}),
    ...(skin && ['seca', 'oleosa', 'mista', 'normal', 'sensivel'].includes(skin) ? { skin } : {}),
    ...(params.get('company') ? { company: params.get('company')! } : {}),
    sort: sort === 'price' || sort === 'unit' || sort === 'name' ? sort : (preset?.sort ?? 'relevance'),
  };
}
