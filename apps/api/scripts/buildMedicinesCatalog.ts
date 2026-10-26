/**
 * Gera o catálogo de medicamentos de demonstração a partir do cadastro público da Anvisa.
 *
 *   node --import tsx apps/api/scripts/buildMedicinesCatalog.ts [arquivo.csv|arquivo.csv.gz]
 *
 * Sem argumento, lê data/raw/anvisa/TA_CONSULTA_MEDICAMENTOS.CSV.gz (o arquivo bruto, comprimido, fica no repositório).
 */
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { parse } from 'csv-parse';
import { buildCmedIndex, parseCmedRow } from '../src/catalog/cmed';
import { CMED_ICMS, MEDICINE_TARGETS, isDemoRx, pickMedicines, toMedicine, type MedicineProduct, type MedicineRow } from '../src/catalog/medicines';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const input = process.argv[2] ?? `${root}data/raw/anvisa/TA_CONSULTA_MEDICAMENTOS.CSV.gz`;
const cmedPath = process.env.CMED_FILE ?? `${root}data/raw/cmed/lista_PMC_20261009.csv.gz`;
const decoder = new TextDecoder('windows-1252');
const fix = (s: string | undefined) => decoder.decode(Buffer.from(s ?? '', 'latin1'));

// Tabela CMED (UTF-8, vírgula): carregada inteira, são ~26 mil apresentações.
const cmedRows: Record<string, string>[] = [];
const cmedParser = createReadStream(cmedPath).pipe(createGunzip()).pipe(parse({ columns: true, relax_column_count: true, bom: true, skip_records_with_error: true }));
for await (const rec of cmedParser as AsyncIterable<Record<string, string>>) cmedRows.push(rec);
const cmed = buildCmedIndex(cmedRows.map((r) => parseCmedRow(r, CMED_ICMS)).filter((p): p is NonNullable<typeof p> => p !== null));

const raw = createReadStream(input);
const source = input.endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
const parser = source.pipe(parse({ delimiter: ';', quote: '"', columns: true, relax_column_count: true, relax_quotes: true, skip_records_with_error: true, encoding: 'latin1', bom: true }));

const stats = { lidas: 0, ativasRegistradas: 0, livres: 0, receita: 0 };
const pool = { analgesico: [] as MedicineProduct[], antiacido: [] as MedicineProduct[], antialergico: [] as MedicineProduct[], expectorante: [] as MedicineProduct[], garganta: [] as MedicineProduct[], sono: [] as MedicineProduct[], receita: [] as MedicineProduct[] };

for await (const rec of parser as AsyncIterable<Record<string, string>>) {
  stats.lidas++;
  const row: MedicineRow = {
    process: rec.NU_PROCESSO ?? '',
    seq: rec.CO_SEQ_PRODUTO ?? '',
    name: fix(rec.NO_PRODUTO),
    company: fix(rec.NO_RAZAO_SOCIAL_EMPRESA),
    substances: fix(rec.SUBSTANCIAS_MEDICAMENTOS),
    category: fix(rec.DS_TIPO_CATEGORIA_REGULATORIA),
    tarja: rec.CO_TARJA ?? '',
    active: rec.VALIDADE_SITUACAO ?? '',
    authorization: rec.TIPO_AUTORIZACAO ?? '',
    registration: rec.NU_REGISTRO_PRODUTO ?? '',
  };
  if (!row.name || !row.seq) continue;
  const product = toMedicine(row, cmed.get(row.registration.trim()) ?? []);
  if (!product) continue;
  stats.ativasRegistradas++;
  if (product.risk === 'RED') {
    stats.receita++;
    if (isDemoRx(product)) pool.receita.push(product);
  } else if (product.group) {
    stats.livres++;
    pool[product.group].push(product);
  }
}

const catalog = [
  ...pickMedicines(pool.analgesico, MEDICINE_TARGETS.analgesico),
  ...pickMedicines(pool.antiacido, MEDICINE_TARGETS.antiacido),
  ...pickMedicines(pool.antialergico, MEDICINE_TARGETS.antialergico),
  ...pickMedicines(pool.expectorante, MEDICINE_TARGETS.expectorante),
  ...pickMedicines(pool.garganta, MEDICINE_TARGETS.garganta),
  ...pickMedicines(pool.sono, MEDICINE_TARGETS.sono),
  ...pickMedicines(pool.receita, MEDICINE_TARGETS.receita),
];

const out = fileURLToPath(new URL('../data/medicines.catalog.json', import.meta.url));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      generatedFrom: 'Anvisa — Dados abertos: TA_CONSULTA_MEDICAMENTOS',
      note: 'Nome, empresa, substâncias e tarja vêm do cadastro público da Anvisa. Preço (PMC), apresentação e EAN vêm da tabela CMED. Contraindicações e interações são curadoria de PROTÓTIPO por substância (validar com farmacêutico). Só o ESTOQUE é SIMULADO.',
      tarjaCodes: 'Confirmados pela tabela CMED (milhares de produtos cruzados): 1=Sem tarja; 2=Tarja vermelha; 3=Tarja vermelha sob restrição; 4=Tarja preta. Sem receita só se Anvisa E CMED concordarem.',
      stats,
      products: catalog,
    },
    null,
    2,
  ) + '\n',
);
console.log(stats);
console.log(`Candidatos: analgésico ${pool.analgesico.length}, antiácido ${pool.antiacido.length}, antialérgico ${pool.antialergico.length}, expectorante ${pool.expectorante.length}, garganta ${pool.garganta.length}, sono ${pool.sono.length}, receita ${pool.receita.length}`);
console.log(`Catálogo com ${catalog.length} medicamentos em ${out}`);
