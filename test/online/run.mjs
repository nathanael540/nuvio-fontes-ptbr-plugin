#!/usr/bin/env node
/**
 * Runner da verificação online de um provedor.
 *
 * Uso:
 *   npm run test:online -- --provider <id> [--seed <valor>] [--timeout <ms>] [--record]
 *
 * O build precisa ser executado antes. O comando usa o pacote de `providers/<id>.js`, sortea cinco
 * títulos por tipo suportado, executa cada caso em worker e grava um relatório sanitizado em
 * `test/artifacts/online/`. Com `--record`, também acrescenta a rodada em `providers.md`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalogs, loadProfiles, resolveProfile } from './lib/catalog.mjs';
import { aggregateProvider } from './lib/classify.mjs';
import { readTmdbApiKey } from './lib/fetch.mjs';
import { evaluationIdentity } from './lib/identity.mjs';
import { resolveProviderPackage } from './lib/loader.mjs';
import { buildReport, createRunId, formatSummary, writeReport } from './lib/report.mjs';
import { buildSelection, createSeed } from './lib/sample.mjs';
import { DEFAULT_CASE_TIMEOUT_MS, runProviderSample } from './lib/worker.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const USAGE = `Uso: npm run test:online -- --provider <id> [--seed <valor>] [--timeout <ms>] [--record]

Executa o pacote já gerado em providers/<id>.js com rede real, sorteia cinco títulos por tipo
suportado e grava um relatório sanitizado em test/artifacts/online/<run-id>/result.json.

Opções:
  --provider <id>   ID do provedor no manifest (obrigatório)
  --seed <valor>    Semente para repetir a mesma seleção
  --timeout <ms>    Limite externo por caso (padrão: ${DEFAULT_CASE_TIMEOUT_MS})
  --record          Acrescenta a rodada em providers.md
  --help            Mostra esta ajuda

Antes de executar, rode node build.js <id>. Se o provedor consultar o TMDB, defina TMDB_API_KEY no
ambiente local. A chave não é gravada em arquivo, relatório ou histórico.

Exemplos:
  npm run test:online -- --provider betor
  npm run test:online -- --provider dooplay --seed 20261112
  npm run test:online -- --provider fshd --record`;

/**
 * Lê os argumentos da linha de comando.
 *
 * @param {string[]} argv - Argumentos após o nome do script.
 * @returns {{ help: boolean, provider: string|null, seed: string|null, record: boolean, timeoutMs: number }} Opções.
 * @throws {Error} Se faltar valor ou houver argumento desconhecido.
 * @example
 * parseArgs(['--provider', 'betor', '--record']);
 */
export function parseArgs(argv) {
  const options = { help: false, provider: null, seed: null, record: false, timeoutMs: DEFAULT_CASE_TIMEOUT_MS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--record') {
      options.record = true;
      continue;
    }
    if (arg === '--provider' || arg === '--seed' || arg === '--timeout') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`faltou valor para ${arg}`);
      }
      index += 1;
      if (arg === '--provider') options.provider = value;
      if (arg === '--seed') options.seed = value;
      if (arg === '--timeout') {
        if (!/^\d+$/.test(value) || Number(value) <= 0) {
          throw new Error(`--timeout inválido: "${value}" (use inteiro positivo em ms)`);
        }
        options.timeoutMs = Number(value);
      }
      continue;
    }
    throw new Error(`argumento desconhecido: "${arg}"`);
  }
  if (!options.help && !options.provider) {
    throw new Error('informe --provider <id>');
  }
  return options;
}

/**
 * Executa a verificação e devolve o código de saída.
 *
 * @param {{ argv: string[], rootDir?: string, env?: NodeJS.ProcessEnv, now?: () => Date, runCaseImpl?: Function, writeReportImpl?: Function, recordImpl?: Function, log?: Function, logError?: Function, artifactsDir?: string }} options - Contexto do comando.
 * @returns {Promise<number>} Código 0 (funciona), 1 (sem resolução por tipo), 2 (inconclusivo) ou 3 (argumento/preparação/registro inválido).
 * @example
 * const code = await runCli({ argv: ['--provider', 'betor'], runCaseImpl: fake });
 */
export async function runCli({
  argv,
  rootDir = ROOT_DIR,
  env = process.env,
  now = () => new Date(),
  runCaseImpl,
  writeReportImpl = writeReport,
  recordImpl,
  log = console.log,
  logError = console.error,
  artifactsDir = path.join(rootDir, 'test', 'artifacts', 'online'),
}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    logError(error.message);
    return 3;
  }
  if (options.help) {
    log(USAGE);
    return 0;
  }

  let manifest;
  let catalogs;
  let profiles;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
    catalogs = loadCatalogs(rootDir);
    profiles = loadProfiles(rootDir, { manifest, catalogs });
  } catch (error) {
    logError(error.message);
    return 3;
  }

  const provider = manifest.scrapers.find((scraper) => scraper.id === options.provider);
  if (!provider) {
    logError(`provedor "${options.provider}" não está no manifest`);
    return 3;
  }

  const seed = options.seed || createSeed();
  const profile = resolveProfile(profiles, provider.id);
  const packageInfo = resolveProviderPackage({ rootDir, manifest, providerId: provider.id });
  const identity = evaluationIdentity({
    packageHash: packageInfo.packageHash,
    supportedTypes: provider.supportedTypes,
    profile,
    catalogs,
  });
  const runId = createRunId({ providerId: provider.id, seed, now: now() });

  let selection;
  try {
    selection = buildSelection({ provider, catalogs, exclusiveTag: profile.exclusiveTag, seed });
  } catch (error) {
    const summary = aggregateProvider({ provider, cases: [] });
    const report = buildReport({
      runId,
      generatedAt: now().toISOString(),
      provider,
      identity,
      selection: { seed, algorithm: 'sha256-fisher-yates-v1', exclusiveTag: profile.exclusiveTag, types: {} },
      cases: [],
      summary,
      preparationFailure: error.message,
    });
    const reportPath = persistReport({ writeReportImpl, artifactsDir, report, logError });
    if (!reportPath) return 3;
    log(formatSummary(report, reportPath));
    if (options.record) {
      await recordAndReportError({ report, rootDir, recordImpl, logError });
    }
    return 3;
  }

  if (provider.enabled === false) {
    const summary = aggregateProvider({ provider, cases: [] });
    const report = buildReport({
      runId,
      generatedAt: now().toISOString(),
      provider,
      identity,
      selection,
      cases: [],
      summary,
    });
    const reportPath = persistReport({ writeReportImpl, artifactsDir, report, logError });
    if (!reportPath) return 3;
    log(formatSummary(report, reportPath));
    if (options.record) {
      return await recordAndReportError({ report, rootDir, recordImpl, logError });
    }
    return 2;
  }

  const tmdbApiKey = readTmdbApiKey(env);
  const cases = await runProviderSample({
    provider,
    selection,
    packagePath: packageInfo.file,
    packageHash: packageInfo.packageHash,
    tmdbApiKey,
    timeoutMs: options.timeoutMs,
    runCaseImpl,
  });
  const summary = aggregateProvider({ provider, cases });
  const report = buildReport({
    runId,
    generatedAt: now().toISOString(),
    provider,
    identity,
    selection,
    cases,
    summary,
  });
  const reportPath = persistReport({ writeReportImpl, artifactsDir, report, logError });
  if (!reportPath) return 3;
  log(formatSummary(report, reportPath));
  if (options.record) {
    return await recordAndReportError({ report, rootDir, recordImpl, logError });
  }
  return summary.exitCode;
}

/**
 * Grava o relatório e converte falha de persistência em código 3.
 * @param {{ writeReportImpl: Function, artifactsDir: string, report: object, logError: Function }} options - Contexto.
 * @returns {string|null} Caminho gravado ou null em falha.
 */
function persistReport({ writeReportImpl, artifactsDir, report, logError }) {
  try {
    return writeReportImpl({ artifactsDir, report });
  } catch (error) {
    logError(`falha ao gravar o relatório: ${error.message}`);
    return null;
  }
}

/**
 * Registra a rodada e converte falha de persistência em código 3.
 * @param {{ report: object, rootDir: string, recordImpl?: Function, logError: Function }} options - Contexto.
 * @returns {Promise<number>} Código da rodada ou 3 quando o registro falhar.
 */
async function recordAndReportError({ report, rootDir, recordImpl, logError }) {
  try {
    if (recordImpl) {
      await recordImpl({ rootDir, report });
    } else {
      const { recordRun } = await import('./lib/record.mjs');
      recordRun({ rootDir, report });
    }
    return report.summary.exitCode;
  } catch (error) {
    logError(`falha ao registrar a rodada: ${error.message}`);
    return 3;
  }
}

async function main() {
  process.exitCode = await runCli({ argv: process.argv.slice(2) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
