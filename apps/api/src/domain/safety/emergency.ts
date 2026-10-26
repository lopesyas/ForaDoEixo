/**
 * Triagem de emergência: roda ANTES de qualquer interpretação, sem IA, e é conservadora de propósito
 * (mencionar o sinal já aciona o alerta; é melhor um falso alarme do que ignorar uma emergência).
 */
export type EmergencyKind = 'medical' | 'mental_health';

export interface EmergencyResult {
  triggered: boolean;
  kind?: EmergencyKind;
  matched: string[];
}

const PATTERNS: { id: string; kind: EmergencyKind; re: RegExp }[] = [
  { id: 'chest-pain', kind: 'medical', re: /dor (forte )?(no|em) (o )?peito|aperto no peito/ },
  { id: 'breathing', kind: 'medical', re: /falta de ar|dificuldade (para|pra|de|em) respirar|nao consigo respirar/ },
  { id: 'fainting', kind: 'medical', re: /desmai|perdeu os sentidos|inconsciente/ },
  { id: 'seizure', kind: 'medical', re: /convuls/ },
  {
    id: 'stroke',
    kind: 'medical',
    re: /fala (enrolada|embolada|arrastada)|rosto (esta |ta )?(torto|caido|caindo)|boca (esta |ta )?(torta|caida|caindo)|(boca|rosto)( \w+){0,4} (esta |ta )?(torta|torto|caida|caido|caindo)|paralisia|paralisad|perdeu a forca|sem forca (de|em|no|na|do|da) (um )?(lado|braco|perna|corpo)|fraqueza (de|em|no|na|do|da) (um )?(lado|braco|perna)|(um|meio) lado do corpo|dormencia (de|em|no|na|do|da) (um )?(lado|braco|perna|rosto)|formigamento (de|em|no|na|do|da) (um )?(lado|braco|rosto)|nao consegue (falar|andar|levantar)|perdeu a fala|visao (turva|escura) de repente/,
  },
  { id: 'unresponsive', kind: 'medical', re: /nao (acorda|responde|reage)|desacordad|engasgou|engasgad|nao consegue respirar/ },
  { id: 'poison-burn', kind: 'medical', re: /bebeu (veneno|produto de limpeza|alvejante)|tomou (veneno|produto de limpeza)|queimadura (grave|extensa)|choque eletrico/ },
  { id: 'worst-headache', kind: 'medical', re: /pior dor de cabeca da (minha )?vida|dor de cabeca (muito )?(forte )?(e )?(de repente|repentina|subita)/ },
  { id: 'bleeding', kind: 'medical', re: /sangramento (intenso|forte|muito)|muito sangue|vomit\w* sangue/ },
  { id: 'overdose', kind: 'medical', re: /overdose|tomou (remedio|comprimido)s? (demais|a mais)|engoli (muito|varios) (remedio|comprimido)|intoxica/ },
  { id: 'allergic-shock', kind: 'medical', re: /garganta (esta |ta )?(fechando|inchando)|labios inchad|reacao alergica grave/ },
  { id: 'self-harm', kind: 'mental_health', re: /quero morrer|me matar|suicid|tirar minha vida|me machucar/ },
];

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function triage(text: string): EmergencyResult {
  const t = normalize(text);
  const hits = PATTERNS.filter((p) => p.re.test(t));
  if (hits.length === 0) return { triggered: false, matched: [] };
  // Saúde mental tem prioridade no tipo de orientação.
  const kind = hits.some((h) => h.kind === 'mental_health') ? 'mental_health' : 'medical';
  return { triggered: true, kind, matched: hits.map((h) => h.id) };
}
