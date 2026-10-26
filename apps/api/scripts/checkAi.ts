/**
 * Teste de conexão com a IA: faz uma chamada de verdade e mostra se funcionou.
 *
 *   npm run ai:check
 *
 * Lê o .env da raiz. Nunca imprime a chave.
 */
import { fileURLToPath } from 'node:url';
import { createOpenAiCompatibleLlm, redact } from '../src/adapters/llm/openaiCompatible';
import { loadConfig } from '../src/config';
import { rulesAreEnough, understand } from '../src/domain/intent/understand';
import { extract } from '../src/domain/intent/extract';
import { triage } from '../src/domain/safety';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  /* sem .env */
}

const base = loadConfig();
// `npm run ai:check -- --second` testa o segundo provedor (LLM2_*).
const second = process.argv.includes('--second');
const config = second
  ? { ...base, LLM_BASE_URL: base.LLM2_BASE_URL, LLM_API_KEY: base.LLM2_API_KEY, LLM_MODEL: base.LLM2_MODEL, fallbackModels: base.fallbackModels2, llmConfigured: base.llm2Configured, LLM_REASONING_EFFORT: '' as const }
  : base;
if (!config.llmConfigured) {
  console.error(second ? 'Segundo provedor não configurado. Preencha LLM2_BASE_URL, LLM2_API_KEY e LLM2_MODEL no .env.' : 'IA não configurada. Preencha LLM_BASE_URL, LLM_API_KEY (ou GEMINI_API_KEY) e LLM_MODEL no .env.');
  process.exit(1);
}

async function listModels(): Promise<string[]> {
  try {
    const res = await fetch(`${config.LLM_BASE_URL.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${config.LLM_API_KEY}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.log(`  Não consegui listar os modelos: HTTP ${res.status} → ${redact(await res.text(), config.LLM_API_KEY).slice(0, 200).replace(/\s+/g, ' ')}`);
      return [];
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    const all = (data.data ?? []).map((m) => m.id.replace(/^models\//, ''));
    const ids = /openrouter\.ai/.test(config.LLM_BASE_URL) ? all.filter((id) => id.endsWith(':free')) : all;
    console.log(`  Modelos ${/openrouter\.ai/.test(config.LLM_BASE_URL) ? 'GRATUITOS (:free) ' : ''}que a chave enxerga (${ids.length}):\n   ${ids.slice(0, 40).join('\n   ')}`);
    return ids;
  } catch (e) {
    console.log(`  Não consegui listar os modelos: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

console.log(`Provedor: ${new URL(config.LLM_BASE_URL).host} · modelo: ${config.LLM_MODEL}\n\nDiagnóstico da conexão:`);

/** Monta o pedido aos poucos, parâmetro por parâmetro, para achar qual deles o provedor rejeita. */
type Extra = Record<string, unknown>;
const messages = [
  { role: 'system', content: 'Responda somente com JSON.' },
  { role: 'user', content: 'Devolva {"ok": true}' },
];
async function attempt(label: string, extra: Extra, model = config.LLM_MODEL) {
  const started = Date.now();
  try {
    const res = await fetch(`${config.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.LLM_API_KEY}` },
      body: JSON.stringify({ model, messages, ...extra }),
      signal: AbortSignal.timeout(15_000), // nenhuma chamada fica pendurada
    });
    const raw = redact(await res.text(), config.LLM_API_KEY);
    let preview = raw.slice(0, 260).replace(/\s+/g, ' ');
    if (res.ok) {
      try {
        const content = (JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
        preview = content ? `resposta: ${content.slice(0, 120).replace(/\s+/g, ' ')}` : `SEM TEXTO NA RESPOSTA → ${preview}`;
      } catch {
        /* mantém o trecho cru */
      }
    }
    console.log(`  ${res.ok ? 'OK  ' : 'ERRO'} ${label.padEnd(44)} HTTP ${res.status} (${Date.now() - started} ms) ${res.ok ? '' : '→ '}${preview}`);
    return res.ok;
  } catch (e) {
    console.log(`  ERRO ${label.padEnd(44)} ${redact(e instanceof Error ? e.message : String(e), config.LLM_API_KEY).slice(0, 200)}`);
    return false;
  }
}

const effort = config.LLM_REASONING_EFFORT || 'low';
const isGoogle = /googleapis\.com/.test(config.LLM_BASE_URL);
const baseline = await attempt('1. mínimo (modelo + mensagens)', {});
await attempt('2. + response_format json_object', { response_format: { type: 'json_object' } });
const jsonMode = config.LLM_JSON_MODE === 'true';
await attempt('3. + temperature 0', { temperature: 0 });
await attempt('4. + max_tokens 200', { max_tokens: 200 });
await attempt('5. + max_completion_tokens 200', { max_completion_tokens: 200 });
if (config.LLM_REASONING_EFFORT) await attempt(`6. + reasoning_effort ${effort}`, { reasoning_effort: effort });
const full = await attempt('7. tudo como o adaptador envia', { temperature: 0, max_tokens: 200, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}), ...(config.LLM_REASONING_EFFORT ? { reasoning_effort: config.LLM_REASONING_EFFORT } : {}) });

/**
 * Sonda a API nova ("Interactions") direto por HTTP, com o cabeçalho x-goog-api-key.
 * O formato exato do pedido eu NÃO consegui confirmar na documentação: estas são tentativas. Se uma funcionar, escrevo o adaptador certo.
 */
async function nativeProbe(path: string, body: unknown, label: string) {
  const root = config.LLM_BASE_URL.replace(/\/openai\/?$/, '').replace(/\/$/, '');
  const started = Date.now();
  try {
    const res = await fetch(`${root}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.LLM_API_KEY },
      body: JSON.stringify(body),
    });
    const raw = redact(await res.text(), config.LLM_API_KEY).slice(0, 260).replace(/\s+/g, ' ');
    console.log(`  ${res.ok ? 'OK  ' : 'ERRO'} ${label.padEnd(44)} HTTP ${res.status} (${Date.now() - started} ms) → ${raw}`);
    return res.ok;
  } catch (e) {
    console.log(`  ERRO ${label.padEnd(44)} ${redact(e instanceof Error ? e.message : String(e), config.LLM_API_KEY).slice(0, 200)}`);
    return false;
  }
}

if (!baseline) {
  await attempt(config.LLM_MODEL.startsWith('models/') ? 'sem prefixo "models/" no modelo' : 'com prefixo "models/" no modelo', {}, config.LLM_MODEL.startsWith('models/') ? config.LLM_MODEL.slice(7) : `models/${config.LLM_MODEL}`);
  const ids = await listModels();
  // Testa alguns outros modelos de texto: se TODOS negam, o bloqueio é do projeto/conta, não do modelo.
  const textModels = ids.filter((id) => /flash|pro/.test(id) && !/tts|image|embedding|transcribe|audio|live|omni|robotics|computer|banana|argon|customtools/.test(id) && id !== config.LLM_MODEL);
  const prefer = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-flash-lite'];
  const others = [...prefer.filter((m) => textModels.includes(m)), ...textModels.filter((m) => !prefer.includes(m))].slice(0, 4);
  if (!isGoogle) {
    // Testa cada modelo que a chave enxerga: sobrecarga (429) costuma ser de um modelo só.
    const candidates = ids.filter((id) => !/embed|whisper|tts|guard|moderat|rerank/i.test(id) && id !== config.LLM_MODEL).slice(0, 8);
    console.log('\nTestando os outros modelos da lista:');
    const working: string[] = [];
    for (const m of candidates) if (await attempt(`modelo ${m}`, {}, m)) working.push(m);
    if (working.length > 0) {
      console.log(`\nFuncionam agora: ${working.join(', ')}.`);
      console.log(`Sugestão para o .env (o modelo configurado falhou, então não entra na lista):\n  LLM_MODEL=${working[0]}\n  LLM_FALLBACK_MODELS=${working.slice(1).join(',')}`);
    } else {
      console.log('\nNenhum modelo respondeu agora. Se o erro for 429, o provedor está sobrecarregado: espere uns minutos e rode de novo. Se for 401/403, confira a chave.');
    }
    process.exit(2);
  }
  console.log('\nAPI nova (Interactions), por HTTP direto:');
  const prompt = 'Responda apenas: ok';
  const native =
    (await nativeProbe('/interactions', { model: config.LLM_MODEL, input: prompt }, 'POST /interactions (modelo simples)')) ||
    (await nativeProbe('/interactions', { model: `models/${config.LLM_MODEL.replace(/^models\//, '')}`, input: prompt }, 'POST /interactions (models/…)')) ||
    (await nativeProbe(`/models/${config.LLM_MODEL.replace(/^models\//, '')}:generateContent`, { contents: [{ parts: [{ text: prompt }] }] }, 'POST :generateContent (API clássica)'));
  if (native) console.log('\nAlguma forma da API nativa FUNCIONA com a sua chave. Me mande a linha OK acima (sem a chave) que eu escrevo o adaptador para ela.');
  console.log('\nTestando outros modelos de texto:');
  let anyOk = '';
  for (const m of others) if (await attempt(`modelo ${m}`, {}, m)) anyOk ||= m;
  if (anyOk) {
    console.log(`\nO modelo ${anyOk} FUNCIONA com a sua chave. Troque LLM_MODEL no .env por ele e rode de novo.`);
  } else {
    console.log('\nTodos negaram: o bloqueio é do PROJETO/CONTA do Google, não do modelo nem do nosso código.');
    console.log('Caminhos: (1) no Google AI Studio, gere uma chave em um projeto NOVO (ou com outra conta Google); (2) confira se aceitou os termos e se a conta é elegível; (3) contate o suporte, como a mensagem pede; (4) use outro provedor (ex.: Groq) mudando só LLM_BASE_URL, LLM_API_KEY e LLM_MODEL no .env.');
  }
  process.exit(2);
}
if (!full) {
  console.log('\nO pedido mínimo funciona, mas o que o adaptador envia não: o parâmetro que falhou está nas linhas acima. Me mande estas linhas (sem a chave).');
  process.exit(2);
}

const llm = createOpenAiCompatibleLlm({
  baseUrl: config.LLM_BASE_URL,
  apiKey: config.LLM_API_KEY,
  model: config.LLM_MODEL,
  timeoutMs: config.LLM_TIMEOUT_MS,
  fallbackModels: config.fallbackModels,
  jsonMode,
  ...(config.LLM_REASONING_EFFORT ? { reasoningEffort: config.LLM_REASONING_EFFORT } : {}),
});

console.log('\nTestes de entendimento:');

const samples = [
  'minha cabeça está estourando há 2 dias, é para minha mãe',
  'queria um creme para o rosto, pele bem seca, uns vinte reais',
  'quero amoxicilina',
  'meu pai está sem força de um lado do corpo',
];

let failed = 0;
for (const text of samples) {
  const started = Date.now();
  const u = await understand(text, llm);
  const ms = Date.now() - started;
  // Se as regras já entendem o pedido, a IA nem é chamada (de propósito): isso não é falha.
  const byDesign = u.mode === 'rules' && !u.aiFailed && rulesAreEnough(extract(text), text);
  if (u.mode !== 'ai' && !byDesign) failed++;
  const rulesEmergency = triage(text).triggered;
  console.log(`\n"${text}"\n  modo: ${u.mode}${byDesign ? ' (as regras bastam; a IA não foi chamada)' : ''} (${ms} ms)${u.aiEmergency ? ' · EMERGÊNCIA vista pela IA' : ''}${rulesEmergency ? ' · EMERGÊNCIA vista pelas regras' : ''}`);
  console.log('  entendido:', JSON.stringify({ categoria: u.extracted.category, valorMax: u.extracted.maxPriceCents, pele: u.extracted.skin, pessoa: u.extracted.relative, saude: u.extracted.health?.label, dias: u.extracted.symptomDays, receita: u.extracted.rx }));
}
console.log(failed === 0 ? '\nOK: a IA respondeu em todos os casos.' : `\n${failed} de ${samples.length} chamadas caíram no modo por regras (a IA não respondeu ou devolveu formato inválido). Veja o modelo, a URL e a chave.`);
process.exit(failed === 0 ? 0 : 2);
