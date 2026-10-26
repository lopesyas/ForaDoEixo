import type { Candidate } from './images';
import { preselect } from './images';

export interface ReviewItem {
  id: string;
  name: string;
  company: string;
  priceLabel: string;
  candidates: Candidate[];
}

export interface Approved {
  id: string;
  imageUrl: string;
  pageUrl: string;
  name: string;
  brands: string;
  source: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Só baixamos imagens dos domínios das fontes abertas (e sempre por https): o arquivo de aprovados não pode apontar para qualquer lugar. */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)(openbeautyfacts|openfoodfacts)\.org$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** Página única para revisar os candidatos: o melhor já vem marcado quando é seguro; a pessoa confirma, troca ou escolhe "nenhuma". */
export function reviewHtml(items: ReviewItem[]): string {
  const rows = items
    .map((it) => {
      const pre = preselect(it.candidates);
      const options = it.candidates
        .map(
          (c, i) => `<label class="opt"><input type="radio" name="p-${esc(it.id)}" value="${i}" ${pre === c ? 'checked' : ''}>
  <img src="${esc(c.imageUrl)}" alt="" loading="lazy" width="150" height="150">
  <span><b>${esc(c.name || '(sem nome)')}</b><br>${esc(c.brands)}<br>
  <small>${c.matchedBy === 'ean' ? 'código de barras igual' : `semelhança ${Math.round(c.score * 100)}%`}${c.brazil ? ' · vendido no Brasil' : ''} · <a href="${esc(c.pageUrl)}" target="_blank" rel="noopener">ver na fonte</a></small></span></label>`,
        )
        .join('\n');
      return `<section class="item" data-id="${esc(it.id)}">
<h2>${esc(it.name)}</h2><p>${esc(it.company)} · ${esc(it.priceLabel)} · <code>${esc(it.id)}</code></p>
<div class="opts">${options || '<p><i>Nenhum candidato encontrado: fica a ilustração genérica.</i></p>'}
<label class="opt none"><input type="radio" name="p-${esc(it.id)}" value="-1" ${pre ? '' : 'checked'}> <span><b>Nenhuma destas</b> (usar a ilustração genérica)</span></label></div></section>`;
    })
    .join('\n');
  const data = JSON.stringify(items.map((it) => ({ id: it.id, candidates: it.candidates }))).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Revisão de fotos de produtos</title>
<style>body{font:16px system-ui,sans-serif;max-width:60rem;margin:1rem auto;padding:0 1rem}.item{border:1px solid #bbb;border-radius:8px;padding:1rem;margin:1rem 0}.opts{display:flex;flex-wrap:wrap;gap:1rem}.opt{display:flex;gap:.5rem;align-items:flex-start;border:2px solid #ddd;border-radius:8px;padding:.5rem;max-width:22rem}.opt:has(input:checked){border-color:#0227cf;background:#eef2ff}img{object-fit:contain;background:#fff}button{font:inherit;font-weight:700;padding:.75rem 1.25rem;border-radius:999px;border:0;background:#0227cf;color:#fff;cursor:pointer;position:sticky;bottom:1rem}</style>
<h1>Revisão de fotos de produtos</h1>
<p>Para cada produto, confira se a foto é <b>do mesmo produto</b> (mesma marca e mesma embalagem). Na dúvida, escolha "Nenhuma destas". Fotos: Open Beauty Facts / Open Food Facts, licença CC BY-SA.</p>
${rows}
<button id="export">Baixar approved.json</button>
<script>
const data=${data};
document.getElementById('export').onclick=()=>{
  const approved=[];
  for(const it of data){
    const v=document.querySelector('input[name="p-'+it.id+'"]:checked');
    const i=v?Number(v.value):-1; if(i<0)continue;
    const c=it.candidates[i];
    approved.push({id:it.id,imageUrl:c.imageUrl,pageUrl:c.pageUrl,name:c.name,brands:c.brands,source:c.source});
  }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(approved,null,2)],{type:'application/json'}));
  a.download='approved.json'; a.click();
  alert(approved.length+' foto(s) aprovada(s). Coloque o arquivo em data/images/approved.json e rode: npm run images:apply');
};
</script></html>`;
}

export function attributionMarkdown(entries: (Approved & { file: string })[]): string {
  const lines = entries
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => `| \`${e.file}\` | ${e.name.replace(/\|/g, '/')} | ${e.brands.replace(/\|/g, '/')} | [${e.source === 'openbeautyfacts' ? 'Open Beauty Facts' : 'Open Food Facts'}](${e.pageUrl}) |`);
  return `# Fotos de produtos

Fotos de produtos vindas do **Open Beauty Facts** e do **Open Food Facts** (contribuidores da comunidade), sob licença
**Creative Commons Atribuição-CompartilhaIgual (CC BY-SA)**. Cada foto foi **aprovada por uma pessoa** como sendo do mesmo produto.
Atribuição: © contribuidores do Open Beauty Facts / Open Food Facts, ver o link de cada produto.

| Arquivo | Produto na fonte | Marca | Fonte |
|---|---|---|---|
${lines.join('\n')}
`;
}
