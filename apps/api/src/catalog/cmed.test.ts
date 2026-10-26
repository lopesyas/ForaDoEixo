import { describe, expect, it } from 'vitest';
import { buildCmedIndex, confirmedOverTheCounter, parseBrl, parseCmedRow, parseCmedTarja, type CmedPresentation } from './cmed';

const rec = (over: Record<string, string> = {}) => ({ REGISTRO: '1862000230029', 'EAN 1': '7891058005993', PRODUTO: 'NOVALGINA FLASH', 'APRESENTAÇÃO': '(1000 + 130) MG COM CT BL X 8', 'PMC 18 %': '25,80', TARJA: 'Tarja Sem Tarja', ...over });

describe('parseBrl', () => {
  it.each([
    ['27,44', 2744],
    ['1.234,56', 123456],
    ['0,99', 99],
    ['-', undefined],
    ['', undefined],
    ['    -     ', undefined],
    ['0,00', undefined],
  ])('%j -> %j', (v, expected) => expect(parseBrl(v)).toBe(expected));
});

describe('parseCmedTarja', () => {
  it.each([
    ['Tarja Sem Tarja', 'sem_tarja'],
    ['Tarja Vermelha', 'vermelha'],
    ['Tarja Vermelha sob restrição', 'vermelha_restricao'],
    ['Tarja Preta', 'preta'],
    ['- (*)', 'desconhecida'],
    ['', 'desconhecida'],
  ])('%j -> %s', (v, expected) => expect(parseCmedTarja(v)).toBe(expected));
});

describe('parseCmedRow', () => {
  it('lê registro (9 dígitos para o cruzamento), EAN, apresentação, PMC e tarja', () => {
    expect(parseCmedRow(rec())).toEqual({ registration9: '186200023', registration: '1862000230029', ean: '7891058005993', product: 'NOVALGINA FLASH', presentation: '(1000 + 130) MG COM CT BL X 8', pmcCents: 2580, tarja: 'sem_tarja' });
  });
  it('sem PMC na alíquota escolhida ou sem registro: descarta', () => {
    expect(parseCmedRow(rec({ 'PMC 18 %': '-' }))).toBeNull();
    expect(parseCmedRow(rec({ REGISTRO: '' }))).toBeNull();
  });
  it('a alíquota escolhe a coluna', () => {
    expect(parseCmedRow({ ...rec(), 'PMC 12 %': '20,00' }, 12)!.pmcCents).toBe(2000);
  });
  it('EAN ausente vira vazio', () => {
    expect(parseCmedRow(rec({ 'EAN 1': '    -     ' }))!.ean).toBe('');
  });
});

describe('buildCmedIndex e dupla checagem', () => {
  const p = (over: Partial<CmedPresentation>): CmedPresentation => parseCmedRow(rec())! && { ...parseCmedRow(rec())!, ...over };
  it('agrupa pelo registro e ordena da mais barata para a mais cara', () => {
    const idx = buildCmedIndex([p({ pmcCents: 3000, presentation: 'B' }), p({ pmcCents: 1000, presentation: 'A' }), p({ registration9: '999999999' })]);
    expect(idx.get('186200023')!.map((x) => x.presentation)).toEqual(['A', 'B']);
    expect(idx.size).toBe(2);
  });
  it.each([
    [[1], ['sem_tarja'], true],
    [[1], ['sem_tarja', 'sem_tarja'], true],
    [[1], ['vermelha'], false],
    [[1], ['desconhecida'], false],
    [[1], ['sem_tarja', 'vermelha'], false],
    [[1, 2], ['sem_tarja'], false],
    [[2], ['sem_tarja'], false],
    [[], ['sem_tarja'], false],
    [[1], [], false],
  ] as const)('anvisa %j + cmed %j -> %s', (anvisa, tarjas, expected) => {
    expect(confirmedOverTheCounter([...anvisa], tarjas.map((t) => p({ tarja: t })))).toBe(expected);
  });
});
