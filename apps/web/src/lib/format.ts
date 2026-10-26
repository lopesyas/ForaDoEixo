export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Mantém o número e a unidade juntos ("100 g" nunca quebra em duas linhas). */
export function keepUnits(text: string): string {
  return text.replace(/(\d) (g|mg|ml|kg|l)\b/gi, '$1\u00A0$2');
}
