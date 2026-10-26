import type { ReasonCode, SafetyResult } from './types';

/**
 * Textos de segurança FIXOS. A IA nunca escreve estes textos.
 * Estado de revisão: pendente de farmacêutico e jurídico (números de serviços públicos devem ser reconferidos).
 */
export const MESSAGES_REVIEW_STATUS = 'pending-pharmacist-and-legal-review' as const;

export interface Notice {
  level: 'yellow' | 'red' | 'alert';
  text: string;
  why: string;
}

export interface Who {
  /** "seu pai" */
  who: string;
  /** "do seu pai" */
  de: string;
}

export const SELF: Who = { who: 'você', de: 'seu' };

export function emergencyNotice(kind: 'medical' | 'mental_health'): Notice {
  if (kind === 'mental_health') {
    return {
      level: 'alert',
      text: 'Você não precisa passar por isso sozinho. Ligue agora para o CVV no 188 (gratuito, 24 horas) ou procure um pronto atendimento.',
      why: 'Quando alguém pensa em se machucar, conversar com uma pessoa preparada agora é o mais importante. Esta orientação não depende de nenhum produto.',
    };
  }
  return {
    level: 'alert',
    text: 'Isso pode ser urgente. Ligue para o SAMU no 192 ou procure um pronto atendimento agora. Não espere para comprar nada.',
    why: 'Os sinais descritos podem indicar uma emergência. Esta orientação não depende de nenhum produto.',
  };
}

const ESCALATE_TEXT: Partial<Record<ReasonCode, (w: Who) => Pick<Notice, 'text' | 'why'>>> = {
  PREGNANCY: () => ({
    text: 'Na gravidez, o mais seguro é conversar com um farmacêutico ou com a equipe de saúde antes de comprar.',
    why: 'Vários remédios não são indicados na gravidez. Só um profissional consegue conferir o caso com segurança.',
  }),
  CHILD: (w) => ({
    text: `Para crianças pequenas, a dose e a escolha do remédio precisam de orientação. Vamos conversar com um farmacêutico antes de comprar para ${w.who === 'você' ? 'a criança' : w.who}.`,
    why: 'Em crianças pequenas, a dose depende do peso e da idade, e um erro pode ser perigoso.',
  }),
  ELDERLY: (w) => ({
    text: `Antes de indicar, um farmacêutico precisa conferir se este remédio é adequado para ${w.who === 'você' ? 'você' : w.who}.`,
    why: 'Em pessoas idosas, alguns remédios pedem mais cuidado com a dose e com outros remédios em uso.',
  }),
  PERSISTENT_SYMPTOM: () => ({
    text: 'Como o sintoma está durando, o mais seguro é conversar com um farmacêutico antes de comprar.',
    why: 'Sintoma que continua por vários dias merece uma avaliação antes de qualquer compra.',
  }),
};

/**
 * Converte o resultado de segurança em um aviso. Devolve null quando não há aviso a dar
 * (produto liberado, ou ainda faltam perguntas).
 */
export function noticeForResult(result: SafetyResult, who: Who = SELF): Notice | null {
  if (result.verdict === 'ALLOW' || result.verdict === 'CONDITION') return null;

  if (result.reasons.includes('RX_REQUIRED')) {
    return {
      level: 'red',
      text: 'Esse tipo de remédio só pode ser comprado com receita. Eu não indico nem escolho esse produto.',
      why: 'Remédios com receita precisam da avaliação de um profissional de saúde.',
    };
  }

  for (const reason of ['PREGNANCY', 'CHILD', 'ELDERLY', 'PERSISTENT_SYMPTOM'] as const) {
    if (result.reasons.includes(reason)) return { level: 'yellow', ...ESCALATE_TEXT[reason]!(who) };
  }

  return noSafeOptionNotice();
}

/** Aviso para a conferência de UM produto: diz por que ele não é indicado para as informações dadas. */
export function productVerdictNotice(result: SafetyResult, productName: string, who: Who = SELF): Notice {
  if (result.reasons.includes('RX_REQUIRED')) {
    return { level: 'red', text: `${productName} só pode ser comprado com receita. Eu não indico nem escolho esse produto.`, why: 'Remédios com receita precisam da avaliação de um profissional de saúde.' };
  }
  const escalated = noticeForResult(result, who);
  const parts: string[] = [];
  if (result.reasons.includes('ALLERGY')) parts.push(`contém uma substância à qual ${who.who === 'você' ? 'você' : who.who} tem alergia`);
  if (result.reasons.includes('CONTRAINDICATION')) parts.push('uma das condições informadas é contraindicação deste produto');
  if (result.reasons.includes('INTERACTION')) parts.push(`pode interagir com o remédio que ${who.who === 'você' ? 'você' : who.who} já usa`);
  if (parts.length > 0) {
    return { level: 'yellow', text: `Para as informações que você deu, ${productName} não é indicado: ${parts.join('; ')}. Um farmacêutico pode sugerir uma alternativa.`, why: 'Esta conferência usa uma lista simplificada de contraindicações e interações. Só um farmacêutico confirma o seu caso.' };
  }
  if (escalated) return escalated;
  return { level: 'yellow', text: `Antes de indicar ${productName}, um farmacêutico precisa confirmar o seu caso.`, why: 'Faltam informações para conferir com segurança.' };
}

/** Quando todos os candidatos foram barrados (alergia, interação, contraindicação). */
export function noSafeOptionNotice(): Notice {
  return {
    level: 'yellow',
    text: 'Com as informações que você passou, não encontrei um produto que eu possa indicar com segurança. Um farmacêutico pode ajudar.',
    why: 'Os produtos disponíveis não são indicados para a combinação de condições, alergias ou remédios em uso informada.',
  };
}

/** Quando a resposta da pessoa não permite conferir com segurança (ex.: "usa outro remédio" sem dizer qual). */
export function noticeForUnverified(kind: 'meds' | 'allergy', who: Who): Notice {
  return kind === 'meds'
    ? {
        level: 'yellow',
        text: `Antes de indicar, um farmacêutico precisa conferir se há interação com o remédio que ${who.who} já usa.`,
        why: 'Remédios usados ao mesmo tempo podem se atrapalhar. Só um profissional consegue conferir isso com segurança.',
      }
    : {
        level: 'yellow',
        text: `Antes de indicar, um farmacêutico precisa conferir a alergia ${who.de}.`,
        why: 'Alguns remédios têm substâncias que causam alergia. A conferência evita esse risco.',
      };
}
