/**
 * Gera o catálogo de demonstração a partir do cadastro público de cosméticos da Anvisa.
 *
 *   node --import tsx apps/api/scripts/buildCosmeticsCatalog.ts [arquivo.csv|arquivo.csv.gz]
 *
 * O arquivo bruto fica no repositório, comprimido (data/raw/anvisa/*.CSV.gz).
 * Leitura em fluxo (sem carregar o arquivo inteiro), em windows-1252, separador ";".
 */
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { parse } from 'csv-parse';
import { TARGETS, classify, isActive, pickSample, toProduct, type CosmeticCategory, type CosmeticProduct, type RegistryRow } from '../src/catalog/cosmetics';

// Sem argumento, lê o arquivo bruto (comprimido) guardado no repositório.
const input = process.argv[2] ?? fileURLToPath(new URL('../../../data/raw/anvisa/TA_CONSULTA_COSMETICOS.CSV.gz', import.meta.url));

// "Hoje" fixo na geração: o catálogo é uma foto reproduzível, não muda se o script rodar de novo.
const TODAY = new Date(process.env.CATALOG_TODAY ?? new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const decoder = new TextDecoder('windows-1252');

const stats = { lidas: 0, malformadas: 0, ativas: 0, classificadas: 0 };
const candidates = new Map<CosmeticCategory, CosmeticProduct[]>();

const raw = createReadStream(input);
const source = input.endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
const parser = source.pipe(
  parse({ delimiter: ';', quote: '"', columns: true, relax_column_count: true, relax_quotes: true, skip_records_with_error: true, encoding: 'latin1', bom: true }),
);

for await (const rec of parser as AsyncIterable<Record<string, string>>) {
  stats.lidas++;
  const name = rec.NO_PRODUTO;
  if (!name) {
    stats.malformadas++;
    continue;
  }
  const row: RegistryRow = {
    process: rec.NU_PROCESSO ?? '',
    name: decoder.decode(Buffer.from(name, 'latin1')),
    company: decoder.decode(Buffer.from(rec.NO_RAZAO_SOCIAL_EMPRESA ?? '', 'latin1')),
    expiresOn: rec.DT_VENCIMENTO ?? '',
    situation: rec.ST_SITUACAO_PRODUTO ?? '',
    registration: rec.NU_REGISTRO ?? '',
  };
  if (!isActive(row, TODAY)) continue;
  stats.ativas++;
  const category = classify(row.name);
  if (!category) continue;
  stats.classificadas++;
  const list = candidates.get(category) ?? [];
  list.push(toProduct(row, category));
  candidates.set(category, list);
}

const catalog = (Object.keys(TARGETS) as CosmeticCategory[]).flatMap((c) => pickSample(candidates.get(c) ?? [], TARGETS[c]));

const out = resolve(dirname(new URL(import.meta.url).pathname), '../data/cosmetics.catalog.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      generatedFrom: 'Anvisa — Dados abertos: TA_CONSULTA_COSMETICOS',
      generatedAt: TODAY.toISOString().slice(0, 10),
      note: 'Nome e fabricante vêm do cadastro público. Preço, quantidade e estoque são SIMULADOS para a demonstração.',
      stats,
      products: catalog,
    },
    null,
    2,
  ) + '\n',
);

console.log(stats);
for (const [c, list] of candidates) console.log(`${c}: ${list.length} candidatos, ${catalog.filter((p) => p.category === c).length} escolhidos`);
console.log(`Catálogo com ${catalog.length} produtos em ${out}`);
