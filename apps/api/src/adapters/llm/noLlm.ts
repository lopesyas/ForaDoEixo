import { LlmUnavailable, type LlmPort } from '../../ports/llm';

/** Sem IA configurada: o sistema funciona só por regras. */
export const noLlm: LlmPort = {
  enabled: false,
  label: 'desligada (modo por regras)',
  async json() {
    throw new LlmUnavailable('IA não configurada');
  },
};
