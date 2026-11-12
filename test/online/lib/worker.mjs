/**
 * Orquestração dos casos online em workers isolados.
 *
 * Cada caso roda em um worker próprio. O limite de tempo pertence ao harness; o provedor publicado
 * continua sem timeout e sem alteração. Um caso expirado é Inconclusivo e os demais prosseguem.
 */

import { Worker } from 'node:worker_threads';
import { classifyCase } from './classify.mjs';

export const DEFAULT_CASE_TIMEOUT_MS = 120000;

/**
 * Executa um caso em worker isolado e devolve o resultado bruto.
 *
 * @param {{ packagePath: string, packageHash: string, providerId: string, tmdbApiKey: string|null, request: object, timeoutMs?: number, WorkerImpl?: typeof Worker }} options - Pacote, pedido e limite.
 * @returns {Promise<object>} Resultado bruto do worker ou `{ timedOut: true }`.
 * @throws {Error} Se os argumentos obrigatórios faltarem.
 * @example
 * const raw = await runCase({ packagePath, packageHash, providerId: 'betor', tmdbApiKey: null, request });
 */
export function runCase({
  packagePath,
  packageHash,
  providerId,
  tmdbApiKey,
  request,
  timeoutMs = DEFAULT_CASE_TIMEOUT_MS,
  WorkerImpl = Worker,
}) {
  if (!packagePath || !packageHash || !providerId || !request) {
    throw new Error('runCase exige packagePath, packageHash, providerId e request');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`limite do caso inválido: ${timeoutMs}`);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const worker = new WorkerImpl(new URL('./case-worker.mjs', import.meta.url), {
      workerData: {
        packagePath,
        packageHash,
        providerId,
        tmdbApiKey,
        request,
      },
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate().then(
        () => resolve({ timedOut: true, timeoutMs }),
        () => resolve({ timedOut: true, timeoutMs }),
      );
    }, timeoutMs);

    worker.on('message', (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate().then(
        () => resolve(message),
        () => resolve(message),
      );
    });
    worker.on('error', (error) => {
      if (settled) return;
      finish({ thrownError: { message: error.message } });
    });
    worker.on('exit', (code) => {
      if (!settled) finish({ thrownError: { message: `worker encerrou com código ${code} sem resultado` } });
    });
  });
}

/**
 * Executa todos os casos da seleção, sequencialmente e sem parar no primeiro sucesso.
 *
 * @param {{ provider: object, selection: object, packagePath: string, packageHash: string, tmdbApiKey: string|null, timeoutMs?: number, runCaseImpl?: Function }} options - Contexto da rodada.
 * @returns {Promise<object[]>} Casos classificados com os metadados do título.
 * @example
 * const cases = await runProviderSample({ provider, selection, packagePath, packageHash, tmdbApiKey: null });
 */
export async function runProviderSample({
  provider,
  selection,
  packagePath,
  packageHash,
  tmdbApiKey,
  timeoutMs = DEFAULT_CASE_TIMEOUT_MS,
  runCaseImpl = runCase,
}) {
  const cases = [];
  for (const mediaType of provider.supportedTypes) {
    const sample = selection.types[mediaType];
    for (const title of sample.titles) {
      const request = {
        tmdbId: title.tmdbId,
        mediaType,
        season: mediaType === 'tv' ? title.season : null,
        episode: mediaType === 'tv' ? title.episode : null,
      };
      let raw;
      try {
        raw = await runCaseImpl({
          packagePath,
          packageHash,
          providerId: provider.id,
          tmdbApiKey,
          request,
          timeoutMs,
        });
      } catch (error) {
        raw = { thrownError: { message: error.message } };
      }
      const classified = classifyCase(raw);
      cases.push({
        mediaType,
        tmdbId: title.tmdbId,
        title: title.title,
        year: title.year,
        tags: title.tags,
        ...(mediaType === 'tv' ? { season: title.season, episode: title.episode } : {}),
        ...classified,
      });
    }
  }
  return cases;
}
