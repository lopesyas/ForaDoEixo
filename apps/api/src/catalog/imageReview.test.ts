import { describe, expect, it } from 'vitest';
import { attributionMarkdown, isAllowedImageUrl, reviewHtml, type ReviewItem } from './imageReview';
import type { Candidate } from './images';

const cand = (over: Partial<Candidate> = {}): Candidate => ({ code: '1', name: 'Hidratante <b>x</b>', brands: 'Nomma', imageUrl: 'https://images.openbeautyfacts.org/a.jpg', pageUrl: 'https://world.openbeautyfacts.org/product/1', source: 'openbeautyfacts', brazil: true, matchedBy: 'name', score: 0.9, ...over });
const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({ id: 'cos-1', name: 'Produto "A"', company: 'Nomma', priceLabel: 'R$ 12,90', candidates: [cand()], ...over });

describe('isAllowedImageUrl', () => {
  it.each([
    ['https://images.openbeautyfacts.org/images/products/1/front.jpg', true],
    ['https://static.openfoodfacts.org/images/x.jpg', true],
    ['https://world.openbeautyfacts.org/a.png', true],
    ['http://images.openbeautyfacts.org/a.jpg', false],
    ['https://evil.com/openbeautyfacts.org/a.jpg', false],
    ['https://openbeautyfacts.org.evil.com/a.jpg', false],
    ['file:///etc/passwd', false],
    ['lixo', false],
  ])('%s -> %s', (u, ok) => expect(isAllowedImageUrl(u)).toBe(ok));
});

describe('página de revisão', () => {
  it('escapa HTML do que vem da fonte (nada de código injetado) e do nosso nome', () => {
    const html = reviewHtml([item()]);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('Hidratante &lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('Produto &quot;A&quot;');
  });
  it('marca sozinha só o candidato seguro; o fraco fica para a pessoa', () => {
    const strong = reviewHtml([item({ candidates: [cand({ score: 0.9 })] })]);
    expect(strong).toMatch(/value="0" checked/);
    const weak = reviewHtml([item({ candidates: [cand({ score: 0.5 })] })]);
    expect(weak).not.toMatch(/value="0" checked/);
    expect(weak).toMatch(/value="-1" checked/);
  });
  it('sem candidatos, avisa que fica a ilustração genérica', () => {
    expect(reviewHtml([item({ candidates: [] })])).toContain('ilustração genérica');
  });
  it('o JSON embutido não fecha o <script> por engano', () => {
    expect(reviewHtml([item({ candidates: [cand({ name: '</script><script>alert(1)</script>' })] })])).not.toContain('</script><script>alert');
  });
});

describe('atribuição', () => {
  it('lista arquivo, produto, marca e link da fonte, e cita a licença', () => {
    const md = attributionMarkdown([{ id: 'cos-1', imageUrl: 'x', pageUrl: 'https://world.openbeautyfacts.org/product/1', name: 'A | B', brands: 'Nomma', source: 'openbeautyfacts', file: 'cos-1.jpg' }]);
    expect(md).toContain('CC BY-SA');
    expect(md).toContain('| `cos-1.jpg` | A / B | Nomma |');
  });
});
