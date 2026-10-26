/**
 * Busca automática de fotos de produtos (Open Beauty Facts / Open Food Facts), com revisão humana.
 *
 *   1) Buscar candidatos e gerar a página de revisão:
 *        npm run images:find                 (padrão: produtos da demonstração)
 *        npm run images:find -- --scope all --limit 200
 *   2) Abrir data/images/review.html, conferir as fotos e clicar em "Baixar approved.json".
 *      Colocar o arquivo em data/images/approved.json.
 *   3) Baixar só as aprovadas para o projeto:
 *        npm run images:apply
 *
 * Boas maneiras com a fonte: identifica o programa (User-Agent), espera entre as chamadas e não repete busca.
 * Nunca aplica uma foto sem aprovação. Só baixa de domínios das fontes abertas, por https.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJsonCatalog } from '../src/adapters/catalog/jsonCatalog';
import { attributionMarkdown, isAllowedImageUrl, reviewHtml, type Approved, type ReviewItem } from '../src/catalog/imageReview';
import { extensionFor, nameQueries, parseEan, parseSearch, rawCount, URLS, type Candidate } from '../src/catalog/images';
import { isMedicine, type CatalogProduct } from '../src/ports/catalog';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dataDir = resolve(root, 'data/images');
const productsDir = resolve(root, 'apps/web/src/assets/img/products');
const UA = 'ForaDoEixo-hackathon/1.0 (prototipo academico; uso nao comercial)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Erro de servidor ou limite (5xx, 429): a fonte às vezes está sobrecarregada, então tenta de novo com espera crescente. */
async function getJson(url: string, tries = 3): Promise<unknown> {
  let last = '';
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
      if (res.ok) return await res.json();
      last = `HTTP ${res.status}`;
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (attempt < tries) {
      console.log(`  (${last}; tentativa ${attempt} de ${tries}, espero ${attempt * 8}s)`);
      await sleep(attempt * 8_000);
    }
  }
  throw new Error(last || 'falha desconhecida');
}

// ---------------------------------------------------------------- sonda
// npm run images:find -- --probe "vagisil sabonete"   mostra exatamente o que a fonte devolve (para diagnosticar)
const probe = arg('probe');
if (probe) {
  for (const source of ['openbeautyfacts', 'openfoodfacts'] as const) {
    const url = URLS.search(source, probe);
    console.log(`\n${source}: ${url}`);
    try {
      const json = await getJson(url, 2);
      const list = ((json as { products?: { code?: string; product_name?: string; brands?: string; image_front_url?: string }[] }).products ?? []).slice(0, 5);
      console.log(`  ${rawCount(json)} resultado(s)`);
      for (const p of list) console.log(`   - ${p.code} | ${p.product_name ?? '(sem nome)'} | ${p.brands ?? ''} | foto: ${p.image_front_url ? 'sim' : 'não'}`);
    } catch (e) {
      console.log(`  erro: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(7_000);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- aplicar
if (process.argv.includes('--apply')) {
  const file = resolve(dataDir, 'approved.json');
  if (!existsSync(file)) {
    console.error(`Não achei ${file}. Rode "npm run images:find", revise data/images/review.html e salve o approved.json.`);
    process.exit(1);
  }
  const approved = JSON.parse(readFileSync(file, 'utf8')) as Approved[];
  const known = new Set((await createJsonCatalog().all()).map((p) => p.id));
  mkdirSync(productsDir, { recursive: true });
  const manifestPath = resolve(productsDir, 'attribution.json');
  const manifest: (Approved & { file: string })[] = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
  let ok = 0;
  for (const a of approved) {
    if (!known.has(a.id)) { console.log(`- ${a.id}: produto não existe no catálogo, ignorado`); continue; }
    if (!isAllowedImageUrl(a.imageUrl)) { console.log(`- ${a.id}: endereço de imagem não permitido, ignorado`); continue; }
    try {
      const res = await fetch(a.imageUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
      const ext = extensionFor(res.headers.get('content-type') ?? '');
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!res.ok || !ext || bytes.length < 1_000 || bytes.length > 2_000_000) throw new Error(`resposta inválida (${res.status}, ${bytes.length} bytes)`);
      const name = `${a.id}.${ext}`;
      writeFileSync(resolve(productsDir, name), bytes);
      const i = manifest.findIndex((m) => m.id === a.id);
      const entry = { ...a, file: name };
      if (i >= 0) manifest[i] = entry; else manifest.push(entry);
      ok++;
      console.log(`✓ ${a.id} -> products/${name}`);
    } catch (e) {
      console.log(`✗ ${a.id}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(500);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(resolve(productsDir, 'ATTRIBUTION.md'), attributionMarkdown(manifest));
  console.log(`\n${ok} foto(s) aplicada(s). Atribuição em ${resolve(productsDir, 'ATTRIBUTION.md')}.`);
  process.exit(0);
}

// ---------------------------------------------------------------- buscar
const catalog = await createJsonCatalog().all();
const scope = arg('scope') ?? 'demo';
const limit = Number(arg('limit') ?? (scope === 'all' ? 200 : 80));
const only = arg('ids')?.split(',');

/** Demonstração: os mais baratos de cada categoria (é o que o assistente mostra primeiro, com orçamento) e os da vitrine. */
function pickScope(): CatalogProduct[] {
  const inStock = catalog.filter((p) => p.simulated.inStock && !(isMedicine(p) && p.risk === 'RED'));
  if (only) return catalog.filter((p) => only.includes(p.id));
  if (scope === 'all') return inStock;
  const key = (p: CatalogProduct) => (isMedicine(p) ? (p.group ?? 'x') : p.category);
  const groups = new Map<string, CatalogProduct[]>();
  for (const p of inStock) groups.set(key(p), [...(groups.get(key(p)) ?? []), p]);
  return [...groups.values()].flatMap((list) => list.sort((a, b) => a.simulated.priceCents - b.simulated.priceCents).slice(0, isMedicine(list[0]!) ? 2 : 3));
}

const todo = pickScope().slice(0, limit);
console.log(`Buscando fotos para ${todo.length} produtos (escopo: ${only ? 'ids' : scope}). Isso leva alguns minutos: espero entre as chamadas para respeitar a fonte.\n`);

const items: ReviewItem[] = [];
let n = 0;
for (const p of todo) {
  n++;
  let cands: Candidate[] = [];
  let raw = 0;
  try {
    if (isMedicine(p)) {
      // Remédio: só por código de barras (EAN) da CMED. Busca por nome poderia trazer outro produto, e isso é risco de segurança.
      for (const source of ['openfoodfacts', 'openbeautyfacts'] as const) {
        cands = parseEan(await getJson(URLS.ean(source, p.pricing.ean)), source, p, p.pricing.ean);
        await sleep(1_000);
        if (cands.length) break;
      }
    } else {
      // Consultas da mais específica para a mais simples; para na primeira em que a fonte devolve algo.
      for (const q of nameQueries(p)) {
        const json = await getJson(URLS.search('openbeautyfacts', q));
        raw = rawCount(json);
        cands = parseSearch(json, 'openbeautyfacts', p);
        await sleep(7_000); // a busca por texto tem limite baixo na fonte
        if (raw > 0) break;
      }
    }
  } catch (e) {
    console.log(`  (falha na busca: ${e instanceof Error ? e.message : e})`);
    await sleep(7_000);
  }
  console.log(`[${n}/${todo.length}] ${p.name} -> ${cands.length ? `${cands.length} candidato(s), melhor ${Math.round(cands[0]!.score * 100)}%` : isMedicine(p) ? 'sem foto para este código de barras' : raw === 0 ? 'a fonte não tem nada parecido' : `a fonte devolveu ${raw}, mas nenhum parece o mesmo produto`}`);
  items.push({ id: p.id, name: p.name, company: p.company, priceLabel: brl(p.simulated.priceCents), candidates: cands });
}

mkdirSync(dataDir, { recursive: true });
writeFileSync(resolve(dataDir, 'candidates.json'), JSON.stringify(items, null, 2) + '\n');
writeFileSync(resolve(dataDir, 'review.html'), reviewHtml(items));
const withAny = items.filter((i) => i.candidates.length).length;
console.log(`\nPronto: ${withAny} de ${items.length} produtos têm candidatos.\nAbra ${resolve(dataDir, 'review.html')}, confira as fotos e clique em "Baixar approved.json".\nDepois salve em data/images/approved.json e rode: npm run images:apply`);
