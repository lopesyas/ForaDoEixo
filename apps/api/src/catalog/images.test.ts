import { describe, expect, it } from 'vitest';
import { extensionFor, nameQueries, nameQuery, rawCount, parseEan, parseSearch, preselect, scoreName, tokens, URLS } from './images';

const product = { name: 'Hidratante Facial Pele Seca Nomma', company: 'Nomma Cosméticos' };
const raw = (over: Record<string, unknown> = {}) => ({ code: '7891000000017', product_name: 'Hidratante Facial Pele Seca', brands: 'Nomma', image_front_url: 'https://images.openbeautyfacts.org/images/products/789/front.jpg', countries_tags: ['en:brazil'], ...over });

describe('tokens e consulta', () => {
  it('tira acento, tamanho e palavras de ligação', () => {
    expect(tokens('Creme Facial para a Pele Seca 50 g de Dia')).toEqual(['creme', 'facial', 'pele', 'seca', 'dia']);
  });
  it('a consulta junta as palavras do nome com a marca, sem repetir', () => {
    expect(nameQuery(product)).toBe('hidratante facial pele seca nomma');
  });
});

describe('nameQueries e rawCount', () => {
  it('vai da consulta específica para a simples, sem repetir nem deixar vazia', () => {
    const q = nameQueries({ name: 'Hidratante Facial Pele Seca Nomma Cosméticos 50 g', company: 'Nomma' });
    expect(q.length).toBeGreaterThanOrEqual(2);
    expect(q[0]!.split(' ').length).toBeGreaterThan(q[q.length - 1]!.split(' ').length - 1);
    expect(new Set(q).size).toBe(q.length);
    expect(q.every((x) => x.trim().length > 0)).toBe(true);
  });
  it('sem marca, ainda devolve consultas', () => {
    expect(nameQueries({ name: 'Shampoo Anticaspa', company: '' }).length).toBeGreaterThan(0);
  });
  it('rawCount conta o que a fonte devolveu, e tolera lixo', () => {
    expect(rawCount({ products: [{}, {}, {}] })).toBe(3);
    expect(rawCount(null)).toBe(0);
    expect(rawCount({ products: 'x' })).toBe(0);
  });
});

describe('scoreName', () => {
  it('nome quase igual e mesma marca: nota alta', () => {
    expect(scoreName(product, { name: 'Hidratante Facial Pele Seca', brands: 'Nomma', brazil: true })).toBeGreaterThan(0.8);
  });
  it('outro produto da mesma marca: nota baixa', () => {
    expect(scoreName(product, { name: 'Shampoo Anticaspa', brands: 'Nomma', brazil: true })).toBeLessThan(0.4);
  });
  it('nada em comum: zero', () => {
    expect(scoreName(product, { name: 'Chocolate ao leite', brands: 'Outra', brazil: false })).toBe(0);
  });
  it('nunca passa de 1', () => {
    expect(scoreName(product, { name: 'Hidratante Facial Pele Seca Nomma', brands: 'Nomma Cosméticos', brazil: true })).toBeLessThanOrEqual(1);
  });
});

describe('parseSearch', () => {
  it('ordena do melhor para o pior, corta o que é fraco e limita a 3', () => {
    const json = { products: [raw({ code: '1', product_name: 'Shampoo', brands: 'X' }), raw({ code: '2' }), raw({ code: '3', product_name: 'Hidratante Facial Pele Seca Nomma' }), raw({ code: '4' }), raw({ code: '5' })] };
    const out = parseSearch(json, 'openbeautyfacts', product);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out.map((c) => c.code)).not.toContain('1');
    expect(out[0]!.score).toBeGreaterThanOrEqual(out[1]!.score);
    expect(out[0]!.pageUrl).toBe(`https://world.openbeautyfacts.org/product/${out[0]!.code}`);
  });
  it('ignora produtos sem foto, sem código ou com foto fora de https', () => {
    const json = { products: [raw({ image_front_url: undefined }), raw({ code: undefined }), raw({ image_front_url: 'http://x/y.jpg' })] };
    expect(parseSearch(json, 'openbeautyfacts', product)).toEqual([]);
  });
  it.each([null, {}, { products: 'x' }, 'lixo'])('resposta inesperada (%j) não quebra', (j) => {
    expect(parseSearch(j, 'openbeautyfacts', product)).toEqual([]);
  });
});

describe('parseEan e pré-seleção', () => {
  it('código de barras igual é prova forte, mesmo com nome diferente', () => {
    const [c] = parseEan({ status: 1, product: raw({ product_name: 'Nome totalmente diferente', brands: '' }) }, 'openfoodfacts', product, '7891000000017');
    expect(c!.matchedBy).toBe('ean');
    expect(c!.score).toBeGreaterThanOrEqual(0.9);
  });
  it('status 0 (não encontrado) devolve vazio', () => {
    expect(parseEan({ status: 0 }, 'openfoodfacts', product, '1')).toEqual([]);
  });
  it('pré-seleciona só EAN igual ou nome muito parecido; o resto fica para a pessoa', () => {
    const strong = parseSearch({ products: [raw({ product_name: 'Hidratante Facial Pele Seca Nomma' })] }, 'openbeautyfacts', product);
    expect(preselect(strong)).not.toBeNull();
    const weak = parseSearch({ products: [raw({ product_name: 'Hidratante Facial', brands: '', countries_tags: [] })] }, 'openbeautyfacts', product, 0.3);
    expect(weak[0]!.score).toBeLessThan(0.8);
    expect(preselect(weak)).toBeNull();
    expect(preselect([])).toBeNull();
  });
});

describe('urls e extensões', () => {
  it('monta as consultas com texto escapado', () => {
    expect(URLS.search('openbeautyfacts', 'pele seca & dia')).toContain('search_terms=pele%20seca%20%26%20dia');
    expect(URLS.ean('openfoodfacts', '789')).toBe('https://world.openfoodfacts.org/api/v2/product/789.json?fields=code,product_name,brands,image_front_url');
  });
  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp; charset=x', 'webp'],
    ['text/html', null],
  ])('%s -> %s', (t, ext) => expect(extensionFor(t)).toBe(ext));
});
