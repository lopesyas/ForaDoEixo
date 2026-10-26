import type { Action, ProductCard, UiTurn } from '@ia/shared';
import { UiTurn as UiTurnSchema } from '@ia/shared';
import { fold, type CosmeticCategory, type CosmeticProduct, type SkinType } from '../catalog/cosmetics';
import { SYMPTOM_GROUPS, type MedicineProduct } from '../catalog/medicines';
import { extract, type Extracted, type Relative } from '../domain/intent/extract';
import { emergencyNotice, evaluate, noSafeOptionNotice, noticeForResult, noticeForUnverified, productVerdictNotice, screen, triage, type AgeRange, type Condition, type InteractionClass, type SafetyProduct } from '../domain/safety';
import { noLlm } from '../adapters/llm/noLlm';
import { understand } from '../domain/intent/understand';
import { isMedicine, type CatalogPort } from '../ports/catalog';
import type { LlmPort } from '../ports/llm';
import { converse } from './converse';
import { explain } from './explain';
import { DEMO_PERSONA, pickReorder, remaining, type Persona } from './persona';

export interface ChatInput {
  conversationId: string;
  text?: string;
  actionId?: string;
  actionIds?: string[];
}

/** Estado de cada conversa. Fica no servidor: o front só manda o que a pessoa disse ou tocou. */
interface HealthState {
  /** Idade, condições e remédios vieram do perfil salvo (com consentimento), não de perguntas. */
  fromProfile?: boolean;
  ageRange?: AgeRange;
  days?: number;
  conditions: Condition[];
  medClasses: InteractionClass[];
  allergies: string[];
  unverified: { meds: boolean; allergy: boolean };
  pending: ('meds' | 'allergy')[];
}

interface State {
  /** Conferência de UM produto (botão "Esse produto é para mim?"): a conversa avalia este produto, não um grupo. */
  checkProductId?: string;
  smallTalk?: number;
  /** Perfil de demonstração ativo (só depois do consentimento). */
  persona?: Persona;
  /** O que foi oferecido por último: permite entender respostas digitadas ("sim", "tenho 62 anos", "pele seca"). */
  awaiting?: { actions: { id: string; label: string; exclusive?: boolean }[]; multi: boolean };
  health?: HealthState;
  intent: Extracted;
  category?: CosmeticCategory;
  skin?: SkinType;
  lastOptionIds: string[];
}

export interface ConversationStore {
  get(id: string): State | undefined;
  set(id: string, state: State): void;
}

/** Guarda em memória, com teto: conversas antigas saem sozinhas (nada de dado de saúde acumulando). */
export function createMemoryStore(max = 500): ConversationStore {
  const map = new Map<string, State>();
  return {
    get: (id) => map.get(id),
    set(id, state) {
      map.delete(id);
      map.set(id, state);
      while (map.size > max) map.delete(map.keys().next().value as string);
    },
  };
}

const LABEL: Record<CosmeticCategory, string> = {
  hidratante_facial: 'hidratante para o rosto',
  hidratante_corporal: 'hidratante para o corpo',
  protetor_solar: 'protetor solar',
  shampoo: 'shampoo',
  condicionador: 'condicionador',
  sabonete: 'sabonete',
  desodorante: 'desodorante',
  creme_dental: 'creme dental',
  repelente: 'repelente',
  protetor_labial: 'protetor labial',
  perfume: 'perfume',
  batom: 'batom',
  esmalte: 'esmalte',
  antisseptico: 'álcool em gel ou antisséptico',
};
const SKIN_LABEL: Record<SkinType, string> = { seca: 'seca', oleosa: 'oleosa', mista: 'mista', normal: 'normal', sensivel: 'sensível' };
const ASKS_SKIN = new Set<CosmeticCategory>(['hidratante_facial', 'hidratante_corporal', 'protetor_solar', 'sabonete']);
const IMAGE: Record<CosmeticCategory, ProductCard['image']> = {
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
const WHO: Record<Relative, { who: string; de: string }> = { pai: { who: 'seu pai', de: 'do seu pai' }, mae: { who: 'sua mãe', de: 'da sua mãe' } };
const SELF = { who: 'você', de: 'seu' };

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const per100 = (p: CosmeticProduct) => Math.round((p.simulated.priceCents / p.simulated.unitQty) * 100);
const unit100 = (p: CosmeticProduct) => `100 ${p.simulated.unitLabel}`;

const ALLERGY_CHOICES = ['dipirona', 'paracetamol', 'ibuprofeno', 'naproxeno', 'ácido acetilsalicílico'];
const CLASS_CHOICES: [InteractionClass, string][] = [
  ['anticoagulant', 'Anticoagulante (afina o sangue)'],
  ['antihypertensive', 'Remédio para pressão'],
  ['antidepressant', 'Antidepressivo'],
  ['sedative', 'Para dormir ou ansiedade'],
  ['nsaid', 'Outro anti-inflamatório'],
  ['diabetes_med', 'Remédio para diabetes'],
];

export function createChatService(deps: { catalog: CatalogPort; store?: ConversationStore; llm?: LlmPort; /** A IA escreve a frase de abertura das opções (mais lento). Padrão: desligado. */ aiExplain?: boolean }) {
  const store = deps.store ?? createMemoryStore();
  const llm = deps.llm ?? noLlm;
  // Se a IA falhou agora há pouco, não insiste por um tempo: o resto da conversa segue por regras, sem esperar.
  let aiDownUntil = 0;
  const live = (): LlmPort => (Date.now() < aiDownUntil ? noLlm : llm);
  const explainLlm = () => (deps.aiExplain ? live() : noLlm);

  const turn = (t: unknown): UiTurn => UiTurnSchema.parse(t); // nada sai da API fora do contrato

  /** Menu por áreas: o usuário reconhece e toca, em vez de ter que lembrar o que pedir (heurística 6 de Nielsen). */
  const MENU: Record<string, { label: string; items: { label: string; say: string }[] }> = {
    pele: { label: 'Pele e rosto', items: [{ label: 'Hidratante para o rosto', say: 'hidratante para o rosto' }, { label: 'Hidratante para o corpo', say: 'hidratante para o corpo' }, { label: 'Protetor solar', say: 'protetor solar' }, { label: 'Sabonete', say: 'sabonete' }, { label: 'Protetor labial', say: 'protetor labial' }] },
    cabelo: { label: 'Cabelo', items: [{ label: 'Shampoo', say: 'shampoo' }, { label: 'Condicionador', say: 'condicionador' }] },
    higiene: { label: 'Higiene e proteção', items: [{ label: 'Desodorante', say: 'desodorante' }, { label: 'Creme dental', say: 'creme dental' }, { label: 'Álcool em gel', say: 'álcool em gel' }, { label: 'Repelente', say: 'repelente' }] },
    beleza: { label: 'Perfumes e maquiagem', items: [{ label: 'Perfume', say: 'perfume' }, { label: 'Batom', say: 'batom' }, { label: 'Esmalte', say: 'esmalte' }] },
    saude: { label: 'Remédios sem receita', items: [{ label: 'Dor de cabeça ou dor no corpo', say: 'estou com dor de cabeça' }, { label: 'Febre', say: 'estou com febre' }, { label: 'Azia', say: 'estou com azia' }, { label: 'Alergia', say: 'estou com alergia' }, { label: 'Tosse', say: 'estou com tosse' }, { label: 'Dor de garganta', say: 'estou com dor de garganta' }] },
  };
  const menuTop = (text: string, kind: 'QUESTION' | 'NOT_FOUND' = 'QUESTION'): UiTurn =>
    turn({
      kind,
      text,
      actions: [...Object.entries(MENU).map(([key, m]) => ({ id: `menu:${key}`, label: m.label })), { id: 'menu:historico', label: 'Meu histórico (demonstração)' }, { id: 'menu:outro', label: 'Outro' }],
    });
  function menuArea(key: string): UiTurn | null {
    if (key === 'outro') {
      return turn({
        kind: 'QUESTION',
        text: 'Sem problema. Escreva com as suas palavras o que você procura, por exemplo "protetor solar para criança" ou o nome do produto. Se preferir, volte para as áreas.',
        actions: [{ id: 'menu', label: 'Ver as áreas de novo' }],
      });
    }
    const area = MENU[key];
    if (!area) return null;
    return turn({
      kind: 'QUESTION',
      text: `${area.label}: o que você procura?`,
      actions: [...area.items.map((i) => ({ id: `say:${i.say}`, label: i.label })), { id: 'menu', label: 'Voltar às áreas' }],
    });
  }

  const notFound = (): UiTurn =>
    menuTop('Não encontrei isso no catálogo desta demonstração. Escolha uma área abaixo ou escreva de outro jeito, pelo nome do produto, por exemplo.', 'NOT_FOUND');

  function confirmCosmetic(state: State, category: CosmeticCategory): UiTurn {
    const i = state.intent;
    return turn({
      kind: 'CONFIRM',
      text: 'Entendi o que você procura. Está certo?',
      summary: [
        { label: 'Produto', value: LABEL[category] },
        ...(i.maxPriceCents ? [{ label: 'Valor máximo', value: brl(i.maxPriceCents) }] : []),
        ...(i.skin[0] ? [{ label: 'Tipo de pele', value: SKIN_LABEL[i.skin[0]] }] : []),
      ],
      actions: [
        { id: 'confirm', label: 'Está certo', tone: 'primary' },
        { id: 'change', label: 'Mudar' },
      ],
    });
  }

  function askSkin(): UiTurn {
    return turn({
      kind: 'QUESTION',
      text: 'Para escolher melhor, sua pele é:',
      actions: (['seca', 'oleosa', 'mista'] as SkinType[])
        .map((s) => ({ id: `skin:${s}`, label: SKIN_LABEL[s][0]!.toUpperCase() + SKIN_LABEL[s].slice(1), summary: { label: 'Tipo de pele', value: SKIN_LABEL[s] } }))
        .concat([{ id: 'skin:unknown', label: 'Não sei', summary: { label: 'Tipo de pele', value: 'não informado' } }]),
    });
  }

  function card(p: CosmeticProduct, extra: { badges?: ProductCard['badges']; reason: string }): ProductCard {
    return {
      id: p.id,
      name: p.name,
      priceCents: p.simulated.priceCents,
      image: IMAGE[p.category as CosmeticCategory],
      categoryKey: p.category,
      unitLabel: unit100(p),
      pricePerUnitCents: per100(p),
      reason: extra.reason,
      badges: extra.badges ?? [],
    };
  }

  /** Sugestão para completar a compra (cosméticos apenas, nunca em saúde). Vira um botão que inicia o pedido. */
  const COMPLEMENT: Partial<Record<CosmeticCategory, CosmeticCategory>> = {
    hidratante_facial: 'protetor_solar',
    protetor_solar: 'hidratante_corporal',
    shampoo: 'condicionador',
    condicionador: 'shampoo',
    desodorante: 'sabonete',
    esmalte: 'batom',
    batom: 'esmalte',
  };
  const complementActions = (category: CosmeticCategory) => {
    const next = COMPLEMENT[category];
    return next ? [{ id: `say:${LABEL[next]}`, label: `Para completar: ver ${LABEL[next]}` }] : [];
  };

  async function search(state: State): Promise<UiTurn> {
    const category = state.category!;
    const max = state.intent.maxPriceCents;
    const skin = state.skin;
    const all = (await deps.catalog.byCategory(category)).filter((p) => p.simulated.inStock);

    if (all.length === 0) return notFound();

    const fits = (p: CosmeticProduct) => max === undefined || p.simulated.priceCents <= max;
    const skinOf = (p: CosmeticProduct): 'match' | 'unknown' | 'other' => {
      if (!skin || !ASKS_SKIN.has(category)) return 'match';
      if (p.skinTypes.includes(skin)) return 'match';
      return p.skinTypes.length === 0 ? 'unknown' : 'other';
    };
    const rank = (a: CosmeticProduct, b: CosmeticProduct) =>
      Number(skinOf(b) === 'match') - Number(skinOf(a) === 'match') || per100(a) - per100(b) || a.simulated.priceCents - b.simulated.priceCents;

    const inBudget = all.filter(fits).filter((p) => skinOf(p) !== 'other').sort(rank);
    const exact = inBudget.filter((p) => skinOf(p) === 'match');
    const chosen = (exact.length > 0 ? exact : inBudget).slice(0, 3);

    const reasonFor = (p: CosmeticProduct, idx: number) => {
      const parts: string[] = [];
      if (skin && ASKS_SKIN.has(category)) parts.push(skinOf(p) === 'match' ? `Indicado para pele ${SKIN_LABEL[skin]}, segundo o nome registrado.` : 'O nome registrado não informa o tipo de pele.');
      if (p.spf) parts.push(`FPS ${p.spf}.`);
      if (idx === 0 && chosen.length > 1 && per100(p) === Math.min(...chosen.map(per100))) parts.push(`Menor preço por ${unit100(p)} entre as opções.`);
      return parts.join(' ') || `${p.company}.`;
    };

    if (chosen.length > 0) {
      const productCards = chosen.map((p, i) =>
        card(p, {
          reason: reasonFor(p, i),
          badges: [
            ...(max !== undefined ? [{ label: 'Dentro do seu orçamento', tone: 'success' as const }] : []),
            ...(skinOf(p) === 'unknown' ? [{ label: 'Tipo de pele não informado', tone: 'warning' as const }] : []),
          ],
        }),
      );
      state.lastOptionIds = chosen.map((p) => p.id);
      if (exact.length === 0 && skin && ASKS_SKIN.has(category)) {
        return turn({
          kind: 'PARTIAL',
          text: `Não encontrei um produto que cite pele ${SKIN_LABEL[skin]} dentro do que você pediu. Estes são os mais próximos, mas não informam o tipo de pele.`,
          products: productCards,
          actions: [],
        });
      }
      const fallback = `Encontrei ${chosen.length === 1 ? '1 boa opção' : `${chosen.length} boas opções`} para você`;
      const pedido = [LABEL[category], skin && ASKS_SKIN.has(category) ? `pele ${SKIN_LABEL[skin]}` : '', max !== undefined ? `até ${brl(max)}` : ''].filter(Boolean).join(', ');
      const sentence = await explain({ kind: 'cosmetico', pedido, produtos: productCards.map((c) => ({ nome: c.name, preco: brl(c.priceCents), detalhe: c.reason })) }, explainLlm());
      return turn({ kind: 'OPTIONS', text: sentence ?? fallback, products: productCards, actions: complementActions(category) });
    }

    // Nada dentro do orçamento: mostra os mais próximos, dizendo com clareza que passam do valor.
    const nearest = all.filter((p) => skinOf(p) !== 'other').sort((a, b) => a.simulated.priceCents - b.simulated.priceCents).slice(0, 2);
    if (nearest.length > 0 && max !== undefined) {
      state.lastOptionIds = nearest.map((p) => p.id);
      return turn({
        kind: 'PARTIAL',
        text: `Não encontrei ${LABEL[category]} até ${brl(max)}. Estes são os mais baratos que achei, e passam do seu valor.`,
        products: nearest.map((p) =>
          card(p, { reason: reasonFor(p, 1), badges: [{ label: `${brl(p.simulated.priceCents - max)} acima do seu valor`, tone: 'warning' }] }),
        ),
        actions: [{ id: 'change', label: 'Mudar meu pedido' }],
      });
    }
    return notFound();
  }

  async function compare(ids: string[], state: State): Promise<UiTurn> {
    const [first, second] = await deps.catalog.byIds(ids.slice(0, 2));
    if (!first || !second) return notFound();
    if (isMedicine(first) && isMedicine(second)) return compareMedicines(first, second);
    if (isMedicine(first) || isMedicine(second)) return notFound();
    const a: CosmeticProduct = first;
    const b: CosmeticProduct = second;
    const cardOf = (p: CosmeticProduct) => card(p, { reason: p.company });
    const lower = (x: number, y: number): 0 | 1 | undefined => (x === y ? undefined : x < y ? 0 : 1);
    const skin = state.skin;
    const skinCell = (p: CosmeticProduct) => (p.skinTypes.length ? `Pele ${p.skinTypes.map((s) => SKIN_LABEL[s]).join(' e ')}` : 'Não informado');
    const skinBetter = skin ? (a.skinTypes.includes(skin) !== b.skinTypes.includes(skin) ? (a.skinTypes.includes(skin) ? 0 : 1) : undefined) : undefined;
    const sameUnit = a.simulated.unitLabel === b.simulated.unitLabel;
    const short = (p: CosmeticProduct) => p.name.split(' ').slice(0, 3).join(' ');

    const rows: { label: string; values: [string, string]; better?: 0 | 1 }[] = [
      { label: 'Preço', values: [brl(a.simulated.priceCents), brl(b.simulated.priceCents)], ...(lower(a.simulated.priceCents, b.simulated.priceCents) !== undefined ? { better: lower(a.simulated.priceCents, b.simulated.priceCents)! } : {}) },
      { label: 'Quantidade', values: [`${a.simulated.unitQty} ${a.simulated.unitLabel}`, `${b.simulated.unitQty} ${b.simulated.unitLabel}`] },
    ];
    if (sameUnit) {
      rows.push({ label: `Preço por ${unit100(a)}`, values: [brl(per100(a)), brl(per100(b))], ...(lower(per100(a), per100(b)) !== undefined ? { better: lower(per100(a), per100(b))! } : {}) });
    }
    if (ASKS_SKIN.has(a.category as CosmeticCategory)) {
      rows.push({ label: 'Indicado para', values: [skinCell(a), skinCell(b)], ...(skinBetter !== undefined ? { better: skinBetter } : {}) });
    }
    if (a.spf || b.spf) rows.push({ label: 'FPS', values: [a.spf ? String(a.spf) : 'Não informado', b.spf ? String(b.spf) : 'Não informado'] });
    rows.push({ label: 'Fabricante', values: [a.company, b.company] });

    const cheaper = lower(per100(a), per100(b));
    const hints: string[] = [];
    if (cheaper !== undefined && sameUnit) hints.push(`${short(cheaper === 0 ? a : b)} rende mais por real gasto.`);
    if (skinBetter !== undefined && skin) hints.push(`${short(skinBetter === 0 ? a : b)} cita pele ${SKIN_LABEL[skin]} no nome.`);

    return turn({
      kind: 'COMPARE',
      text: ['Veja as diferenças.', ...hints].join(' '),
      products: [cardOf(a), cardOf(b)],
      rows,
      actions: [
        { id: `choose:${a.id}`, label: `Escolher ${short(a)}` },
        { id: `choose:${b.id}`, label: `Escolher ${short(b)}` },
        { id: 'back:options', label: 'Voltar às opções' },
      ],
    });
  }

  // ---------- medicamentos ----------
  const medCard = (p: MedicineProduct): ProductCard => ({
    id: p.id,
    name: p.name,
    priceCents: p.simulated.priceCents,
    image: 'box',
    categoryKey: p.risk === 'RED' ? 'receita' : (p.group ?? 'receita'),
    reason: `Princípio ativo: ${p.substances.join(', ')}. Para ${p.use}.`,
    badges: [
      { label: 'Venda sem receita', tone: 'neutral' },
      { label: 'Preço máximo (CMED)', tone: 'neutral' },
      { label: 'Leia a bula antes de usar', tone: 'warning' },
    ],
  });

  function compareMedicines(a: MedicineProduct, b: MedicineProduct): UiTurn {
    const short = (p: MedicineProduct) => p.name.split(' ').slice(0, 3).join(' ');
    const cheaper: 0 | 1 | undefined = a.simulated.priceCents === b.simulated.priceCents ? undefined : a.simulated.priceCents < b.simulated.priceCents ? 0 : 1;
    return turn({
      kind: 'COMPARE',
      text: 'Veja as diferenças. A dose e o modo de usar estão na bula: leia antes de usar.',
      products: [medCard(a), medCard(b)],
      rows: [
        { label: 'Preço', values: [brl(a.simulated.priceCents), brl(b.simulated.priceCents)], ...(cheaper !== undefined ? { better: cheaper } : {}) },
        { label: 'Princípio ativo', values: [a.substances.join(', '), b.substances.join(', ')] },
        { label: 'Para que serve', values: [a.use ?? 'Não informado', b.use ?? 'Não informado'] },
        { label: 'Tipo', values: [a.regulatory, b.regulatory] },
        { label: 'Fabricante', values: [a.company, b.company] },
      ],
      actions: [
        { id: `choose:${a.id}`, label: `Escolher ${short(a)}` },
        { id: `choose:${b.id}`, label: `Escolher ${short(b)}` },
        { id: 'back:options', label: 'Voltar às opções' },
      ],
    });
  }

  // ---------- saúde ----------
  const whoOf = (state: State) => (state.intent.relative ? WHO[state.intent.relative] : SELF);
  const emptyHealth = (days?: number): HealthState => ({ ...(days !== undefined ? { days } : {}), conditions: [], medClasses: [], allergies: [], unverified: { meds: false, allergy: false }, pending: [] });

  function askAge(state: State, preface?: string): UiTurn {
    const ages: [AgeRange, string][] = [['under12', 'Menos de 12 anos'], ['12-17', '12 a 17 anos'], ['18-49', '18 a 49 anos'], ['50-64', '50 a 64 anos'], ['65plus', '65 anos ou mais']];
    return turn({
      kind: 'QUESTION',
      text: `${preface ? `${preface} ` : ''}${state.intent.relative ? `Qual é a idade ${whoOf(state).de}?` : 'Qual é a sua idade?'}`,
      actions: ages.map(([id, label]) => ({ id: `age:${id}`, label, summary: { label: 'Idade', value: label.toLowerCase() } })),
    });
  }

  function askDays(preface?: string): UiTurn {
    return turn({
      kind: 'QUESTION',
      text: preface ? `${preface} Há quanto tempo está assim?` : 'Há quanto tempo está assim?',
      actions: [
        { id: 'days:0', label: 'Começou hoje', summary: { label: 'Há quanto tempo', value: 'começou hoje' } },
        { id: 'days:1', label: '1 dia', summary: { label: 'Há quanto tempo', value: '1 dia' } },
        { id: 'days:2', label: '2 dias', summary: { label: 'Há quanto tempo', value: '2 dias' } },
        { id: 'days:3', label: '3 dias ou mais', summary: { label: 'Há quanto tempo', value: '3 dias ou mais' } },
      ],
    });
  }

  function askHealth(state: State): UiTurn {
    return turn({
      kind: 'QUESTION',
      multi: true,
      text: `Para indicar com segurança, preciso saber: ${whoOf(state).who} usa algum remédio ou tem alguma condição?`,
      actions: [
        { id: 'cond:pressure', label: 'Tem pressão alta', summary: { label: 'Condições', value: 'pressão alta' } },
        { id: 'cond:ulcer', label: 'Tem úlcera ou problema no estômago', summary: { label: 'Condições', value: 'problema no estômago' } },
        { id: 'cond:kidney', label: 'Tem problema nos rins', summary: { label: 'Condições', value: 'problema nos rins' } },
        { id: 'cond:liver', label: 'Tem problema no fígado', summary: { label: 'Condições', value: 'problema no fígado' } },
        { id: 'cond:asthma', label: 'Tem asma', summary: { label: 'Condições', value: 'asma' } },
        { id: 'cond:pregnant', label: 'Está grávida', summary: { label: 'Condições', value: 'gravidez' } },
        { id: 'med:other', label: 'Usa outro remédio', summary: { label: 'Remédios', value: 'usa outro remédio' } },
        { id: 'allergy', label: 'Tem alergia a remédio', summary: { label: 'Alergias', value: 'tem alergia' } },
        { id: 'none', label: 'Nenhum desses', exclusive: true, summary: { label: 'Condições', value: 'nenhuma informada' } },
      ],
    });
  }

  function askMeds(state: State): UiTurn {
    return turn({
      kind: 'QUESTION',
      multi: true,
      text: `Que tipo de remédio ${whoOf(state).who} usa?`,
      actions: [
        ...CLASS_CHOICES.map(([id, label]) => ({ id: `mc:${id}`, label, summary: { label: 'Remédios', value: label.toLowerCase() } })),
        { id: 'mc:unknown', label: 'Não sei qual', exclusive: true, summary: { label: 'Remédios', value: 'não sabe qual' } },
      ],
    });
  }

  function askAllergy(state: State): UiTurn {
    return turn({
      kind: 'QUESTION',
      multi: true,
      text: `${whoOf(state).who === 'você' ? 'Você' : whoOf(state).who[0]!.toUpperCase() + whoOf(state).who.slice(1)} tem alergia a algum destes?`,
      actions: [
        ...ALLERGY_CHOICES.map((a) => ({ id: `alg:${a}`, label: a[0]!.toUpperCase() + a.slice(1), summary: { label: 'Alergias', value: a } })),
        { id: 'alg:other', label: 'Outra ou não sei', exclusive: true, summary: { label: 'Alergias', value: 'outra ou não sabe' } },
      ],
    });
  }

  const toSafety = (p: MedicineProduct): SafetyProduct => ({ id: p.id, name: p.name, risk: p.risk, ingredients: p.substances, avoidIf: p.avoidIf, interactsWith: p.interactsWith, ...(p.cautionElderly ? { cautionElderly: true } : {}) });

  function pharmacistNotice(n: { level: 'yellow' | 'red' | 'alert'; text: string; why: string }): UiTurn {
    return turn({ kind: 'SAFETY_NOTICE', level: n.level, text: n.text, why: n.why, actions: [{ id: 'handoff', label: 'Falar com farmacêutico agora', tone: 'primary' }] });
  }

  /** Respondeu a pergunta de condições: guarda e segue para os esclarecimentos que faltarem. */
  function afterMain(state: State, ids: string[]): Promise<UiTurn> | UiTurn {
    const h = state.health!;
    const has = (id: string) => ids.includes(id);
    h.conditions = [
      ...(has('cond:pressure') ? (['hypertension'] as const) : []),
      ...(has('cond:ulcer') ? (['stomach_ulcer'] as const) : []),
      ...(has('cond:kidney') ? (['kidney_disease'] as const) : []),
      ...(has('cond:liver') ? (['liver_disease'] as const) : []),
      ...(has('cond:asthma') ? (['asthma'] as const) : []),
      ...(has('cond:pregnant') ? (['pregnancy'] as const) : []),
    ];
    h.pending = [...(has('med:other') ? (['meds'] as const) : []), ...(has('allergy') ? (['allergy'] as const) : [])];
    return nextHealthStep(state);
  }

  function nextHealthStep(state: State): Promise<UiTurn> | UiTurn {
    const h = state.health!;
    const next = h.pending[0];
    if (next === 'meds') return askMeds(state);
    if (next === 'allergy') return askAllergy(state);
    return decideHealth(state);
  }

  function afterFollowUp(state: State, ids: string[]): Promise<UiTurn> | UiTurn {
    const h = state.health!;
    const step = h.pending.shift();
    if (step === 'meds') {
      if (ids.includes('mc:unknown')) h.unverified.meds = true;
      else h.medClasses = ids.map((i) => i.slice(3) as InteractionClass);
    } else if (step === 'allergy') {
      if (ids.includes('alg:other')) h.unverified.allergy = true;
      else h.allergies = ids.map((i) => i.slice(4));
    }
    return nextHealthStep(state);
  }

  async function decideHealth(state: State): Promise<UiTurn> {
    const h = state.health!;
    const who = whoOf(state);
    // O que a regra não consegue conferir sozinha vai ao farmacêutico.
    if (h.unverified.meds) return pharmacistNotice(noticeForUnverified('meds', who));
    if (h.unverified.allergy) return pharmacistNotice(noticeForUnverified('allergy', who));

    if (state.checkProductId) {
      const [product] = await deps.catalog.byIds([state.checkProductId]);
      if (!product || !isMedicine(product)) return notFound();
      const verdict = evaluate(toSafety(product), { ageRange: h.ageRange, conditions: h.conditions, allergies: h.allergies, medClasses: h.medClasses }, { symptomDays: h.days });
      if (verdict.verdict === 'ALLOW') {
        return turn({
          kind: 'OPTIONS',
          comparable: false,
          text: `Para as informações que você deu, não vejo impedimento para ${product.name}. Leia a bula antes de usar e, na dúvida, fale com um farmacêutico.`,
          products: [medCard(product)],
          actions: [{ id: 'handoff', label: 'Falar com farmacêutico' }],
        });
      }
      return pharmacistNotice(productVerdictNotice(verdict, product.name, who));
    }

    const groups = SYMPTOM_GROUPS[state.intent.health?.label ?? ''] ?? [];
    const candidates = await deps.catalog.otcByGroups(groups);
    if (candidates.length === 0) return noOptions(state);

    const result = screen(candidates.map(toSafety), { ageRange: h.ageRange, conditions: h.conditions, allergies: h.allergies, medClasses: h.medClasses }, { symptomDays: h.days });
    const byId = new Map(candidates.map((p) => [p.id, p]));

    const allowed = result.allowed.map((e) => byId.get(e.product.id)!);
    if (allowed.length > 0) {
      // Variedade: uma opção por combinação de substâncias, as mais baratas primeiro.
      const seen = new Set<string>();
      // Primeiro os que servem para o que a pessoa descreveu (ex.: dor de cabeça antes de dor muscular), depois o mais barato.
      const wanted = ({ 'dor de cabeça': ['dor de cabeça'], 'dor nas costas': ['muscular'], febre: ['febre'] } as Record<string, string[]>)[state.intent.health?.label ?? ''] ?? [];
      const relevance = (p: MedicineProduct) => (wanted.some((w) => p.use?.includes(w)) ? 0 : 1);
      const picks = allowed
        .sort((x, y) => relevance(x) - relevance(y) || x.simulated.priceCents - y.simulated.priceCents)
        .filter((p) => {
          const key = p.substances.join('+');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 3);
      state.lastOptionIds = picks.map((p) => p.id);
      const fallback = `Encontrei ${picks.length === 1 ? '1 opção' : `${picks.length} opções`} sem receita que não têm impedimento para as informações que você deu`;
      const cards = picks.map(medCard);
      const sentence = await explain({ kind: 'medicamento', pedido: state.intent.health?.label ?? 'um remédio', produtos: cards.map((c) => ({ nome: c.name, preco: brl(c.priceCents), detalhe: c.reason })) }, explainLlm());
      return turn({ kind: 'OPTIONS', text: sentence ?? fallback, products: cards });
    }

    // Nada liberado: se algum caso pede o farmacêutico (persistência, gravidez, criança…), o aviso diz isso.
    const escalate = result.blocked.find((e) => e.result.verdict === 'ESCALATE');
    if (escalate) return pharmacistNotice(noticeForResult(escalate.result, who)!);
    return pharmacistNotice(noSafeOptionNotice());
  }

  function noOptions(state: State): UiTurn {
    return turn({
      kind: 'UNCONFIRMED',
      text: `Ainda não tenho opções cadastradas para ${state.intent.health?.label ?? 'esse caso'} nesta demonstração. Um farmacêutico pode ajudar.`,
      actions: [{ id: 'handoff', label: 'Falar com farmacêutico agora', tone: 'primary' }],
    });
  }

  // ---------- entrada ----------
  // ---------- perfil de demonstração (histórico com consentimento) ----------
  function askConsent(): UiTurn {
    return turn({
      kind: 'QUESTION',
      text: `Posso usar o histórico do perfil de demonstração da ${DEMO_PERSONA.name}? São dados simulados e só valem enquanto você permitir. Com ele eu sugiro a reposição do que está acabando e já sei o perfil de quem você cuida, sem repetir todas as perguntas.`,
      actions: [
        { id: 'persona:yes', label: 'Sim, usar o histórico', tone: 'primary' },
        { id: 'persona:no', label: 'Agora não' },
      ],
    });
  }

  async function reorderTurn(persona: Persona): Promise<UiTurn> {
    const picks = await pickReorder(persona, deps.catalog);
    const rx = (await deps.catalog.findPrescription(persona.rx.query))[0];
    const rxLine = rx ? ` Seu remédio de uso contínuo (${rx.name}) ${remaining(persona.rx)} e só se compra com receita: não posso incluí-lo, mas um farmacêutico pode ajudar.` : '';
    if (picks.length === 0) {
      return turn({ kind: 'UNCONFIRMED', text: `Não consegui confirmar produtos em estoque para repetir agora.${rxLine}`, actions: [{ id: 'handoff', label: 'Falar com farmacêutico agora', tone: 'primary' }] });
    }
    return turn({
      kind: 'OPTIONS',
      comparable: false,
      text: `Oi, ${persona.name}! Olhando o seu histórico, estes produtos estão acabando.${rxLine}`,
      products: picks.map(({ product, note }) => card(product, { reason: note })),
      actions: [
        { id: 'cart:all', label: 'Adicionar tudo ao carrinho', tone: 'primary' },
        ...(rx ? [{ id: 'handoff', label: 'Falar com farmacêutico sobre a receita' }] : []),
        { id: 'persona:off', label: 'Parar de usar meu histórico' },
      ],
    });
  }

  async function handleText(id: string, text: string): Promise<UiTurn> {
    const tri = triage(text);
    if (tri.triggered) {
      const n = emergencyNotice(tri.kind!);
      return turn({ kind: 'SAFETY_NOTICE', level: n.level, text: n.text, why: n.why, actions: [{ id: 'handoff', label: 'Chamar uma pessoa agora', tone: 'primary' }] });
    }
    const understood = await understand(text, live());
    if (understood.aiFailed) aiDownUntil = Date.now() + 30_000;
    if (understood.aiEmergency) {
      const n = emergencyNotice('medical');
      return turn({ kind: 'SAFETY_NOTICE', level: n.level, text: n.text, why: n.why, actions: [{ id: 'handoff', label: 'Chamar uma pessoa agora', tone: 'primary' }] });
    }
    const intent = understood.extracted;
    const previous = store.get(id);
    const state: State = { intent, lastOptionIds: [], ...(previous?.persona ? { persona: previous.persona } : {}), ...(previous?.smallTalk ? { smallTalk: previous.smallTalk } : {}) };
    store.set(id, state);

    if (intent.rx) {
      const generic = noticeForResult(evaluate({ id: 'rx', name: 'rx', risk: 'RED', ingredients: [], avoidIf: [], interactsWith: [] }, {}), SELF)!;
      const found = (await deps.catalog.findPrescription(text))[0];
      return turn({
        kind: 'SAFETY_NOTICE',
        level: generic.level,
        text: found ? `${found.name} (${found.substances.join(', ')}) só pode ser comprado com receita. Eu não indico nem escolho esse produto.` : generic.text,
        why: generic.why,
        actions: [
          { id: 'handoff', label: 'Falar com farmacêutico agora', tone: 'primary' },
          { id: 'prescription', label: 'Enviar minha receita' },
        ],
      });
    }
    if (intent.wantsReorder) return state.persona ? reorderTurn(state.persona) : askConsent();
    if (intent.health) {
      state.health = emptyHealth(intent.symptomDays);
      return turn({
        kind: 'CONFIRM',
        text: 'Entendi o que você procura. Está certo?',
        summary: [
          { label: 'Para quem', value: intent.relative ? WHO[intent.relative].who : 'você' },
          { label: 'Necessidade', value: intent.health.label },
          ...(intent.symptomDays !== undefined ? [{ label: 'Há quanto tempo', value: `${intent.symptomDays} ${intent.symptomDays === 1 ? 'dia' : 'dias'}` }] : []),
        ],
        actions: [
          { id: 'confirm', label: 'Está certo', tone: 'primary' },
          { id: 'change', label: 'Mudar' },
        ],
      });
    }
    if (intent.category === 'cabelo') {
      return turn({
        kind: 'QUESTION',
        text: 'Para o cabelo, você quer shampoo ou condicionador?',
        actions: [
          { id: 'cat:shampoo', label: 'Shampoo', summary: { label: 'Produto', value: LABEL.shampoo } },
          { id: 'cat:condicionador', label: 'Condicionador', summary: { label: 'Produto', value: LABEL.condicionador } },
        ],
      });
    }
    if (intent.category === 'hidratante') {
      return turn({
        kind: 'QUESTION',
        text: 'O hidratante é para o rosto ou para o corpo?',
        actions: [
          { id: 'cat:hidratante_facial', label: 'Rosto', summary: { label: 'Produto', value: LABEL.hidratante_facial } },
          { id: 'cat:hidratante_corporal', label: 'Corpo', summary: { label: 'Produto', value: LABEL.hidratante_corporal } },
        ],
      });
    }
    if (intent.category) {
      state.category = intent.category;
      if (intent.skin[0]) state.skin = intent.skin[0];
      return confirmCosmetic(state, intent.category);
    }
    // Não é uma categoria conhecida: tenta o NOME do produto antes de desistir.
    const byName = await deps.catalog.searchByName(text);
    if (byName.cosmetics.length > 0) {
      const found = byName.cosmetics;
      state.category = found[0]!.category as CosmeticCategory;
      state.lastOptionIds = found.map((p) => p.id);
      return turn({
        kind: 'OPTIONS',
        text: `Encontrei ${found.length === 1 ? '1 produto' : `${found.length} produtos`} com esse nome`,
        products: found.map((p) => card(p, { reason: `${p.company}.` })),
      });
    }
    const otc = byName.otc[0];
    if (otc?.group) {
      // Remédio, mesmo sem receita, só depois das perguntas de segurança.
      const label = GROUP_SYMPTOM[otc.group] ?? 'dor';
      state.intent = { ...intent, health: { label } };
      state.health = emptyHealth(intent.symptomDays);
      return turn({
        kind: 'CONFIRM',
        text: `Para ${otc.name} (ou algo parecido), preciso fazer algumas perguntas antes de indicar. Posso continuar?`,
        summary: [{ label: 'Necessidade', value: label }],
        actions: [
          { id: 'confirm', label: 'Pode continuar', tone: 'primary' },
          { id: 'change', label: 'Mudar' },
        ],
      });
    }
    // A IA responde com naturalidade ao que não está no catálogo; as áreas continuam à mão.
    const said = await converse(text, 'O que o cliente pediu não está no catálogo (que tem cosméticos, higiene, beleza e remédios sem receita). Diga isso com gentileza e ofereça ajuda com o que existe.', live());
    return said ? menuTop(said, 'NOT_FOUND') : notFound();
  }

  async function handleAction(id: string, input: ChatInput): Promise<UiTurn> {
    const state = store.get(id);
    const actionId = input.actionId ?? '';
    if (actionId === 'handoff' || actionId === 'prescription') {
      return turn({
        kind: 'UNCONFIRMED',
        text:
          actionId === 'handoff'
            ? 'Estou chamando uma pessoa. Nesta demonstração a conexão é simulada e o tempo de espera não é confirmado.'
            : 'O envio de receita ainda não está disponível nesta demonstração.',
        actions: [{ id: 'change', label: 'Mudar meu pedido' }],
      });
    }
    if (actionId.startsWith('say:')) return handleText(id, actionId.slice(4));
    if (actionId.startsWith('check:')) {
      const [product] = await deps.catalog.byIds([actionId.slice(6)]);
      if (!product) return notFound();
      if (!isMedicine(product)) {
        return turn({ kind: 'UNCONFIRMED', text: `${product.name} é um produto de cuidado ou higiene: não precisa de conferência de saúde. Se quiser, me conte para quem é e eu ajudo a escolher.`, actions: [{ id: 'menu', label: 'Ver áreas' }] });
      }
      if (product.risk === 'RED') return pharmacistNotice(productVerdictNotice(evaluate(toSafety(product), {}, {}), product.name));
      const prev = store.get(id);
      const fresh: State = { intent: { ...extract(''), health: { label: product.use ?? 'um remédio' } }, lastOptionIds: [], health: emptyHealth(), checkProductId: product.id, ...(prev?.persona ? { persona: prev.persona } : {}) };
      store.set(id, fresh);
      return askAge(fresh, `Vou conferir ${product.name} para você.`);
    }
    if (actionId === 'persona:yes') {
      const st = store.get(id) ?? { intent: extract(''), lastOptionIds: [] };
      st.persona = DEMO_PERSONA;
      store.set(id, st);
      return reorderTurn(DEMO_PERSONA);
    }
    if (actionId === 'persona:no' || actionId === 'persona:off') {
      const st = store.get(id);
      if (st) delete st.persona;
      return menuTop(actionId === 'persona:off' ? 'Pronto, parei de usar o histórico. Em que posso ajudar?' : 'Tudo bem, sem usar o histórico. Em que posso ajudar?');
    }
    if (actionId === 'menu:historico') return store.get(id)?.persona ? reorderTurn(DEMO_PERSONA) : askConsent();
    if (actionId === 'menu') return menuTop('Estas são as áreas em que posso ajudar. Toque em uma, ou escreva o que procura.');
    if (actionId.startsWith('menu:')) return menuArea(actionId.slice(5)) ?? notFound();
    if (!state) return notFound(); // conversa expirada: recomeça sem quebrar

    if (actionId.startsWith('cat:')) {
      const category = actionId.slice(4) as CosmeticCategory;
      if (!(category in LABEL)) return notFound();
      state.category = category;
      state.intent = { ...state.intent, category };
      store.set(id, state);
      return confirmCosmetic(state, category);
    }
    if (actionId === 'confirm') {
      if (state.intent.health) {
        const groups = SYMPTOM_GROUPS[state.intent.health.label];
        if (!groups) return noOptions(state);
        const profile = state.intent.relative ? state.persona?.beneficiaries[state.intent.relative] : undefined;
        if (profile && state.health) {
          // Modo Cuidador: o perfil salvo (com consentimento) dispensa as perguntas de idade e condições.
          Object.assign(state.health, { fromProfile: true, ageRange: profile.ageRange, conditions: profile.conditions, medClasses: profile.medClasses, allergies: [] });
          const preface = `Usei o perfil salvo ${state.intent.relative === 'mae' ? 'da sua mãe' : 'do seu pai'} (${profile.label}), com a sua permissão.`;
          return state.health.days === undefined ? askDays(preface) : decideHealth(state);
        }
        return askAge(state);
      }
      if (!state.category) return notFound();
      if (ASKS_SKIN.has(state.category) && !state.skin) return askSkin();
      return search(state);
    }
    if (actionId.startsWith('skin:')) {
      const value = actionId.slice(5);
      state.skin = value === 'unknown' ? undefined : (value as SkinType);
      store.set(id, state);
      return search(state);
    }
    if (actionId.startsWith('age:') && state.health) {
      state.health.ageRange = actionId.slice(4) as AgeRange;
      return state.checkProductId || state.health.days !== undefined ? askHealth(state) : askDays();
    }
    if (actionId.startsWith('days:') && state.health) {
      state.health.days = Number(actionId.slice(5));
      return state.health.fromProfile ? decideHealth(state) : askHealth(state);
    }
    if (actionId.startsWith('compare:')) return compare(actionId.slice(8).split(','), state);
    if (actionId === 'back:options') {
      if (state.intent.health) {
        const products = await deps.catalog.byIds(state.lastOptionIds);
        const meds = products.filter(isMedicine);
        if (meds.length === 0) return notFound();
        return turn({ kind: 'OPTIONS', text: `Encontrei ${meds.length === 1 ? '1 opção' : `${meds.length} opções`} sem receita`, products: meds.map(medCard) });
      }
      const products = await deps.catalog.byIds(state.lastOptionIds);
      if (products.length === 0) return notFound();
      return search(state);
    }
    return notFound();
  }

  // ---------- conversa livre ----------
  const GROUP_SYMPTOM: Record<string, string> = { analgesico: 'dor de cabeça', antiacido: 'azia', antialergico: 'alergia', expectorante: 'tosse', garganta: 'dor de garganta', sono: 'dificuldade para dormir' };
  const norm = (t: string) => fold(t).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const hasWord = (text: string, key: string) => ` ${text} `.includes(` ${key} `);

  const suggestions = [...Object.entries(MENU).map(([key, m]) => ({ id: `menu:${key}`, label: m.label })), { id: 'menu:historico', label: 'Meu histórico (demonstração)' }, { id: 'menu:outro', label: 'Outro' }];

  /** Cumprimento, agradecimento e "o que você faz?": só quando a frase não traz nenhum pedido. */
  async function smallTalk(id: string, text: string): Promise<UiTurn | null> {
    const n = norm(text);
    const words = n.split(' ').filter(Boolean);
    if (words.length === 0 || words.length > 6) return null;
    const e = extract(text);
    if (e.category || e.health || e.rx || e.wantsReorder) return null;
    const state = store.get(id) ?? { intent: e, lastOptionIds: [] };
    const talks = (state.smallTalk ?? 0) + 1;
    state.smallTalk = talks;
    store.set(id, state);
    const reply = (t: string) => turn({ kind: 'QUESTION', text: t, actions: suggestions });
    // A IA escreve a resposta de conversa; se falhar ou não passar na verificação, vale o texto fixo.
    const voiced = async (situation: string, fixed: string) => reply((await converse(text, situation, live())) ?? fixed);
    if (/^(quero |queria |tem |ver )?(outro|outra|outros|outras)( produto| produtos| coisa| opcao| opcoes| item)?( entao| agora)?$/.test(n)) return reply('Claro! Estas são as áreas em que posso ajudar. Toque em uma, ou escreva o que procura.');
    if (/\b(categorias|menu|opcoes|catalogo|o que (voces )?tem|areas)\b/.test(n)) return reply('Estas são as áreas em que posso ajudar. Toque em uma, ou escreva o que procura.');
    if (/\b(tudo bem|tudo bom|como vai|como voce esta|como esta)\b/.test(n)) return voiced('O cliente perguntou como você está.', 'Tudo bem, obrigado por perguntar! Em que posso ajudar você hoje?');
    if (/^(oi+e?|ola|opa|e ai|eai|hey|hello|bom dia|boa tarde|boa noite|alo)\b/.test(n)) {
      return reply(
        talks > 1
          ? 'Oi de novo! Me diga o que você procura, ou toque em uma área.'
          : 'Olá! Eu sou o Assistente Pague Menos. Posso ajudar a encontrar produtos de cuidado, higiene e beleza, ou orientar sobre remédios sem receita. O que você precisa hoje? Escreva do seu jeito ou toque em uma área.',
      );
    }
    if (/\b(obrigad[oa]?|valeu|brigad[oa]?|agradeco)\b/.test(n)) return voiced('O cliente agradeceu.', 'Por nada! Se precisar de mais alguma coisa, é só dizer.');
    if (/\b(ajuda|ajudar|o que (voce )?(faz|pode)|como funciona|quem e voce)\b/.test(n)) {
      return reply('Eu converso com você para encontrar o produto certo: pergunto o que falta, mostro poucas opções e comparo. Em remédios, só indico os sem receita e que não tenham impedimento para o seu caso. Em caso de dúvida, chamo um farmacêutico. O que você procura?');
    }
    return null;
  }

  function ageFromNumber(n: number): AgeRange {
    return n < 12 ? 'under12' : n < 18 ? '12-17' : n < 50 ? '18-49' : n < 65 ? '50-64' : '65plus';
  }

  /** Transforma o que a pessoa digitou numa resposta à pergunta em aberto, ou devolve null (então é um pedido novo). */
  function matchAnswer(state: State, text: string): { actionId?: string; actionIds?: string[]; reply?: UiTurn } | null {
    const awaiting = state.awaiting;
    if (!awaiting || awaiting.actions.length === 0) return null;
    const n = norm(text);
    if (!n) return null;
    const ids = awaiting.actions.map((a) => a.id);
    // Frase longa, ou que já traz um pedido completo, é um pedido novo e não a resposta a um botão (nem mesmo a um botão de área).
    const fresh = extract(text);
    const exactLabel = awaiting.actions.some((a) => norm(a.label) === n);
    const newRequest = !exactLabel && (n.split(' ').length > 5 || Boolean(fresh.category || fresh.health || fresh.rx));
    if (newRequest && !awaiting.actions.some((a) => a.id.startsWith('age:') || a.id.startsWith('days:') || a.id.startsWith('cond:') || a.id.startsWith('skin:'))) return null;

    if (ids.includes('persona:yes')) {
      if (/^(sim|pode|claro|ok|quero|autorizo|usar)( |$)/.test(n)) return { actionId: 'persona:yes' };
      if (/^(nao|agora nao|prefiro nao)( |$)/.test(n)) return { actionId: 'persona:no' };
    }
    if (ids.includes('confirm') && /^(sim|isso|correto|certo|ta certo|esta certo|exato|isso mesmo|confirmo|pode ser|ok|claro|positivo)( |$)/.test(n)) return { actionId: 'confirm' };
    if ((ids.includes('confirm') || ids.includes('change')) && /^(nao|errado|incorreto|mudar|trocar|negativo)( |$)/.test(n) && n.split(' ').length <= 4) {
      return { reply: turn({ kind: 'QUESTION', text: 'Tudo bem, vamos de novo. O que você precisa?', actions: suggestions }) };
    }

    const age = ids.find((i) => i.startsWith('age:')) ? n.match(/\b(\d{1,3})\b/) : null;
    if (age) return { actionId: `age:${ageFromNumber(Number(age[1]))}` };

    if (ids.some((i) => i.startsWith('days:'))) {
      if (/\b(hoje|agora)\b/.test(n)) return { actionId: 'days:0' };
      const d = n.match(/\b(\d{1,2})\b/);
      if (d) return { actionId: `days:${Math.min(3, Number(d[1]))}` };
      if (/\b(uma semana|semana|varios dias|muitos dias)\b/.test(n)) return { actionId: 'days:3' };
    }

    const keysOf = (label: string) => {
      const k = norm(label);
      return [k, k.replace(/^(tem problema no|tem problema nos|tem|usa|esta) /, '')].filter((x) => x.length >= 3);
    };
    const hits = awaiting.actions.filter((a) => a.id !== 'change' && keysOf(a.label).some((k) => hasWord(n, k)));

    if (awaiting.multi) {
      const exclusive = awaiting.actions.find((a) => a.exclusive);
      if (exclusive && /^(nenhum|nenhuma|nada|nao tem|nao|nao uso|sem )/.test(n) && hits.length === 0) return { actionIds: [exclusive.id] };
      const chosen = hits.filter((a) => !a.exclusive);
      if (chosen.length > 0) return { actionIds: chosen.map((a) => a.id) };
      return exclusive && hits.includes(exclusive) ? { actionIds: [exclusive.id] } : null;
    }
    if (hits.length === 0) return null;
    const best = hits.sort((x, y) => Math.max(...keysOf(y.label).map((k) => k.length)) - Math.max(...keysOf(x.label).map((k) => k.length)))[0]!;
    return { actionId: best.id };
  }

  async function inner(input: ChatInput): Promise<UiTurn> {
    if (input.actionIds?.length) {
      const state = store.get(input.conversationId);
      if (!state?.health) return notFound();
      const ids = input.actionIds;
      const stage = state.health.pending.length > 0 && !ids.some((i) => i.startsWith('cond:') || i === 'none' || i === 'med:other' || i === 'allergy') ? 'follow' : 'main';
      return stage === 'main' ? afterMain(state, ids) : afterFollowUp(state, ids);
    }
    if (input.text !== undefined) {
      const text = input.text;
      // Emergência vem antes de tudo, inclusive de respostas a perguntas em aberto.
      if (triage(text).triggered) return handleText(input.conversationId, text);
      const state = store.get(input.conversationId);
      const answer = state ? matchAnswer(state, text) : null;
      if (answer?.reply) return answer.reply;
      if (answer) return inner({ conversationId: input.conversationId, ...(answer.actionIds ? { actionIds: answer.actionIds } : { actionId: answer.actionId }) });
      return (await smallTalk(input.conversationId, text)) ?? handleText(input.conversationId, text);
    }
    return handleAction(input.conversationId, input);
  }

  return {
    async handle(input: ChatInput): Promise<UiTurn> {
      const result = await inner(input);
      // Guarda o que foi oferecido, para entender a próxima resposta digitada.
      const state = store.get(input.conversationId);
      if (state) state.awaiting = { actions: result.actions.map((a) => ({ id: a.id, label: a.label, ...(a.exclusive ? { exclusive: true } : {}) })), multi: result.kind === 'QUESTION' && result.multi };
      return result;
    },
  };
}

export type ChatService = ReturnType<typeof createChatService>;
export type { Action };
