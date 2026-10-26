import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Garante que os pares de cores dos tokens atendem WCAG 2.2 AA (4,5:1 para texto). */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');
function block(selector: string) {
  const start = css.indexOf(selector);
  return css.slice(start, css.indexOf('}', start));
}
function tokens(scope: string) {
  const map: Record<string, string> = {};
  for (const m of scope.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) map[m[1]!] = m[2]!;
  return map;
}

const pairs: [string, string][] = [
  ['color-text', 'color-bg'],
  ['color-text', 'color-surface'],
  ['color-primary', 'color-bg'],
  ['color-on-primary', 'color-primary'],
  ['color-success', 'color-success-bg'],
  ['color-warning', 'color-warning-bg'],
  ['color-danger', 'color-danger-bg'],
  ['color-text', 'color-warning-bg'],
  ['color-text', 'color-danger-bg'],
  ['color-text', 'color-page-bg'],
  ['color-primary', 'color-page-bg'],
  ['color-offer', 'color-bg'],
  ['color-offer', 'color-page-bg'],
  ['color-on-navy', 'color-navy'],
  ['color-text', 'color-slot'],
];

describe.each([
  ['padrão', () => tokens(block(':root {'))],
  ['alto contraste', () => ({ ...tokens(block(':root {')), ...tokens(block(":root[data-contrast='high']")) })],
])('contraste — %s', (_name, get) => {
  const t = get();
  it.each(pairs)('%s sobre %s >= 4,5:1', (fg, bg) => {
    expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
});
