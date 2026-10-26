import { UiTurn, type ProductCard } from '@ia/shared';

/**
 * Único ponto de contato do front com o "motor". Hoje há apenas o cliente simulado;
 * depois entra um cliente HTTP com a mesma interface, sem tocar nos componentes.
 */
export interface ChatInput {
  conversationId: string;
  text?: string;
  actionId?: string;
  /** Perguntas de múltipla escolha. */
  actionIds?: string[];
}

export interface ChatClient {
  send(input: ChatInput): Promise<UiTurn>;
}

function maxPriceFrom(text: string): string | undefined {
  const match = text.match(/(?:r\$\s*|até\s*)(\d+(?:[.,]\d{1,2})?)/i);
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(',', '.'));
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const PRODUCTS = {
  p1: { id: 'p1', name: 'Hidratante Facial Hidra Leve 50 g', short: 'Hidra Leve', image: 'tube', priceCents: 1890, unitLabel: '100 g', pricePerUnitCents: 3780, reason: 'Indicado para pele seca. Hidratação intensa.' },
  p2: { id: 'p2', name: 'Creme Facial Suave Dia 100 g', short: 'Suave Dia', image: 'jar', priceCents: 1650, unitLabel: '100 g', pricePerUnitCents: 1650, reason: 'Serve para todos os tipos de pele. Rende mais.' },
} as const;
type ProductId = keyof typeof PRODUCTS;

function card(id: ProductId) {
  const { short: _short, ...rest } = PRODUCTS[id];
  return { ...rest, badges: [{ label: 'Dentro do seu orçamento', tone: 'success' }] };
}

function optionsTurn() {
  return {
    kind: 'OPTIONS',
    text: 'Encontrei 2 boas opções para você',
    products: [card('p1'), card('p2')],
  };
}

function compareTurn() {
  return {
    kind: 'COMPARE',
    text: 'Veja as diferenças. O Suave Dia rende mais; o Hidra Leve é feito para pele seca.',
    products: [card('p1'), card('p2')],
    rows: [
      { label: 'Preço', values: ['R$ 18,90', 'R$ 16,50'], better: 1 },
      { label: 'Quantidade', values: ['50 g', '100 g'], better: 1 },
      { label: 'Preço por 100 g', values: ['R$ 37,80', 'R$ 16,50'], better: 1 },
      { label: 'Indicado para', values: ['Pele seca', 'Todos os tipos'], better: 0 },
    ],
    actions: [
      { id: 'choose:p1', label: `Escolher ${PRODUCTS.p1.short}` },
      { id: 'choose:p2', label: `Escolher ${PRODUCTS.p2.short}` },
      { id: 'back:options', label: 'Voltar às opções' },
    ],
  };
}

type Relative = 'pai' | 'mae';
const WHO: Record<Relative, { who: string; de: string }> = {
  pai: { who: 'seu pai', de: 'do seu pai' },
  mae: { who: 'sua mãe', de: 'da sua mãe' },
};

/** "não é para o meu pai, é para a minha mãe": vale a última pessoa citada. */
function relativeFrom(text: string): Relative {
  const pai = text.lastIndexOf('pai');
  const mae = Math.max(text.lastIndexOf('mãe'), text.lastIndexOf('mae'));
  return mae > pai ? 'mae' : 'pai';
}

const withRelative = (id: string, rel: Relative) => `${rel}:${id}`;
const splitRelative = (id: string): [Relative, string] => {
  const match = id.match(/^(pai|mae):(.*)$/);
  return match ? [match[1] as Relative, match[2]!] : ['pai', id];
};

/** Vitrine da loja. Hoje vem da API; nos testes, de uma lista fixa. */
export interface Shelf {
  title: string;
  products: ProductCard[];
}
export interface CatalogClient {
  featured(): Promise<Shelf[]>;
}
export const mockCatalog: CatalogClient = {
  async featured() {
    return [
      {
        title: 'Melhores ofertas para você',
        products: [
          { id: 'p1', name: 'Hidratante Facial Hidra Leve 50 g', priceCents: 1890, unitLabel: '100 g', pricePerUnitCents: 3780, reason: 'Exemplo', badges: [] },
          { id: 'p2', name: 'Creme Facial Suave Dia 100 g', priceCents: 1650, unitLabel: '100 g', pricePerUnitCents: 1650, reason: 'Exemplo', badges: [] },
        ],
      },
    ];
  },
};

export function createMockClient(delayMs = 300): ChatClient {
  return {
    async send({ text, actionId, actionIds }) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const said = (text ?? '').toLowerCase();

      let turn: unknown;
      // Triagem de emergência vem antes de tudo e não passa por interpretação.
      if (/dor no peito|falta de ar|desmai/.test(said)) {
        turn = {
          kind: 'SAFETY_NOTICE',
          level: 'alert',
          text: 'Isso pode ser urgente. Ligue para o SAMU no 192 ou procure um pronto atendimento agora. Não espere para comprar nada.',
          why: 'Dor no peito e falta de ar podem indicar uma emergência. Esta orientação não depende de nenhum produto.',
          actions: [{ id: 'handoff', label: 'Chamar uma pessoa agora', tone: 'primary' }],
        };
      } else if (/antibi[oó]tico|amoxicilina|tarja/.test(said)) {
        turn = {
          kind: 'SAFETY_NOTICE',
          level: 'red',
          text: 'Esse tipo de remédio só pode ser comprado com receita. Eu não indico nem escolho esse produto.',
          why: 'Antibióticos e outros remédios com receita precisam da avaliação de um profissional de saúde.',
          actions: [
            { id: 'handoff', label: 'Falar com farmacêutico agora', tone: 'primary' },
            { id: 'prescription', label: 'Enviar minha receita' },
          ],
        };
      } else if (actionIds?.length) {
        // Saúde: nesta demonstração, qualquer resposta leva ao farmacêutico (sintoma de 2 dias, pessoa de risco).
        const parsed = actionIds.map(splitRelative);
        const who = WHO[parsed[0]![0]];
        const has = (id: string) => parsed.some(([, key]) => key === id);
        const reason = has('cond:pressure')
          ? {
              text: 'Com pressão alta e dor de cabeça há 2 dias, o mais seguro é conversar com um farmacêutico antes de comprar.',
              why: 'Dor de cabeça que dura mais de 1 dia em pessoa com pressão alta precisa de avaliação. Alguns remédios para dor podem não ser indicados para quem tem pressão alta.',
            }
          : has('med:other')
            ? {
                text: `Antes de indicar, um farmacêutico precisa conferir se há interação com o remédio que ${who.who} já usa.`,
                why: 'Remédios usados ao mesmo tempo podem se atrapalhar. Só um profissional consegue conferir isso com segurança.',
              }
            : has('allergy')
              ? {
                  text: `Antes de indicar, um farmacêutico precisa conferir a alergia ${who.de}.`,
                  why: 'Alguns remédios têm substâncias que causam alergia. A conferência evita esse risco.',
                }
              : {
                  text: 'Anotei as respostas. Como a dor dura 2 dias, o melhor é um farmacêutico confirmar antes de indicar.',
                  why: 'Dor que dura mais de 1 dia merece uma avaliação antes de qualquer compra.',
                };
        turn = {
          kind: 'SAFETY_NOTICE',
          level: 'yellow',
          ...reason,
          actions: [{ id: 'handoff', label: 'Falar com farmacêutico agora', tone: 'primary' }],
        };
      } else if (actionId === 'handoff' || actionId === 'prescription') {
        turn = {
          kind: 'UNCONFIRMED',
          text:
            actionId === 'handoff'
              ? 'Estou chamando uma pessoa. Nesta demonstração a conexão é simulada e o tempo de espera não é confirmado.'
              : 'O envio de receita ainda não está disponível nesta demonstração.',
          actions: [{ id: 'change', label: 'Mudar meu pedido' }],
        };
      } else if (actionId === 'confirm:hidratante') {
        turn = {
          kind: 'QUESTION',
          text: 'Para escolher melhor, sua pele é:',
          actions: [
            { id: 'skin:dry', label: 'Seca', summary: { label: 'Tipo de pele', value: 'seca' } },
            { id: 'skin:oily', label: 'Oleosa', summary: { label: 'Tipo de pele', value: 'oleosa' } },
            { id: 'skin:unknown', label: 'Não sei', summary: { label: 'Tipo de pele', value: 'não informado' } },
          ],
        };
      } else if (actionId?.startsWith('confirm:saude')) {
        const rel: Relative = actionId.endsWith(':mae') ? 'mae' : 'pai';
        const who = WHO[rel].who;
        turn = {
          kind: 'QUESTION',
          multi: true,
          text: `Para indicar com segurança, preciso saber: ${who} usa algum remédio ou tem alguma condição?`,
          actions: [
            { id: withRelative('cond:pressure', rel), label: 'Tem pressão alta', summary: { label: 'Condições', value: 'pressão alta' } },
            { id: withRelative('med:other', rel), label: 'Usa outro remédio', summary: { label: 'Remédios', value: 'usa outro remédio' } },
            { id: withRelative('allergy', rel), label: 'Tem alergia', summary: { label: 'Alergias', value: 'tem alergia' } },
            { id: withRelative('none', rel), label: 'Nenhum desses', exclusive: true, summary: { label: 'Condições', value: 'nenhuma informada' } },
          ],
        };
      } else if (actionId?.startsWith('skin:') || actionId === 'back:options') {
        turn = optionsTurn();
      } else if (actionId?.startsWith('compare:')) {
        turn = compareTurn();
      } else if (said.includes('hidratante')) {
        const max = maxPriceFrom(said);
        turn = {
          kind: 'CONFIRM',
          text: 'Entendi o que você procura. Está certo?',
          summary: [
            { label: 'Produto', value: 'hidratante para o rosto' },
            ...(max ? [{ label: 'Valor máximo', value: max }] : []),
          ],
          actions: [
            { id: 'confirm:hidratante', label: 'Está certo', tone: 'primary' },
            { id: 'change', label: 'Mudar' },
          ],
        };
      } else if (/\bpai\b|\bm[ãa]e\b|\bdor\b/.test(said)) {
        const rel = relativeFrom(said);
        turn = {
          kind: 'CONFIRM',
          text: 'Entendi o que você procura. Está certo?',
          summary: [
            { label: 'Para quem', value: WHO[rel].who },
            { label: 'Necessidade', value: 'dor de cabeça' },
          ],
          actions: [
            { id: `confirm:saude:${rel}`, label: 'Está certo', tone: 'primary' },
            { id: 'change', label: 'Mudar' },
          ],
        };
      } else {
        turn = {
          kind: 'NOT_FOUND',
          text: 'Não encontrei esse produto. Quer ajustar o pedido ou ver parecidos?',
          actions: [{ id: 'change', label: 'Mudar meu pedido' }],
        };
      }
      return UiTurn.parse(turn);
    },
  };
}

export const mockClient = createMockClient();
