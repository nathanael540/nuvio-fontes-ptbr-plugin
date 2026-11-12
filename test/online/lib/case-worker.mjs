/**
 * Worker de um único caso online.
 *
 * Recebe o caminho e o hash do pacote, executa o CommonJS em contexto isolado, captura o console e
 * devolve somente dados serializáveis. O encerramento por tempo é feito pelo processo principal.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { createCaseGlobals } from './fetch.mjs';
import { loadProviderModule } from './loader.mjs';

const MAX_MESSAGES = 20;

/**
 * Executa o caso e envia o resultado ao processo principal.
 * @returns {Promise<void>}
 */
async function main() {
  const { packagePath, packageHash, providerId, tmdbApiKey, request } = workerData;
  let code;
  try {
    code = fs.readFileSync(packagePath, 'utf8');
  } catch (error) {
    parentPort.postMessage({ preparationError: `pacote ausente: ${error.message}` });
    return;
  }
  const actualHash = createHash('sha256').update(code, 'utf8').digest('hex');
  if (actualHash !== packageHash) {
    parentPort.postMessage({
      preparationError: `hash do pacote diverge antes da execução: esperado ${packageHash}, lido ${actualHash}`,
    });
    return;
  }

  const consoleMessages = { log: [], warn: [], error: [] };
  const capture = (level) => (message) => {
    if (consoleMessages[level].length < MAX_MESSAGES) {
      consoleMessages[level].push(String(message));
    }
  };
  const consoleMock = {
    log: capture('log'),
    info: capture('log'),
    debug: capture('log'),
    warn: capture('warn'),
    error: capture('error'),
  };

  let loaded;
  try {
    loaded = loadProviderModule({
      code,
      filename: packagePath,
      expectedHash: packageHash,
      globals: {
        ...createCaseGlobals({ tmdbApiKey, providerId }),
        console: consoleMock,
      },
    });
  } catch (error) {
    parentPort.postMessage({ preparationError: error.message, consoleMessages });
    return;
  }

  try {
    const streams = await loaded.getStreams(request.tmdbId, request.mediaType, request.season, request.episode);
    parentPort.postMessage({
      streams: toPlain(streams),
      consoleMessages,
      executedHash: loaded.packageHash,
    });
  } catch (error) {
    parentPort.postMessage({
      thrownError: { message: error && error.message ? String(error.message) : String(error) },
      consoleMessages,
      executedHash: loaded.packageHash,
    });
  }
}

/**
 * Converte a saída em dado clonável, sem preservar protótipos.
 * @param {unknown} value - Saída do provedor.
 * @returns {unknown} Cópia serializável.
 * @throws {Error} Se houver ciclo ou valor não serializável.
 */
function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

main().catch((error) => {
  parentPort.postMessage({ preparationError: `falha no worker: ${error.message}` });
});
