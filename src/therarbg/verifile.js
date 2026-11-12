/**
 * Leitura de verificações existentes do TheRARBG e fila limitada de confirmações.
 *
 * O Verifile é consultado somente por GET no hash já escolhido. Não há POST, polling, retry nem
 * espera: uma resposta 429 esgota a fila e impede novas confirmações, mas não interrompe as que já
 * começaram (decisão 3 do design da change `add-therarbg-provider`).
 */

import { HEADER_PROFILES } from '../_blocks/http/index.mjs';

/** Base do endpoint de verificação. */
export const VERIFILE_URL = 'https://therarbg.com/api/v1/verifile/';
/** Máximo de confirmações simultâneas. */
export const VERIFILE_CONCURRENCY = 3;

const HEX_HASH = /^[0-9a-f]{40}$/;

/**
 * Busca uma verificação existente pelo hash.
 *
 * @param {string} infoHash - Hash hexadecimal de 40 caracteres.
 * @returns {Promise<object>} JSON da verificação.
 * @throws {Error} Se o hash for inválido, se a resposta não for 2xx ou se o corpo não for JSON
 *   válido. HTTP 429 lança erro com `quotaExhausted: true`.
 * @example
 * const verification = await fetchVerifile('6ff479e8c37929b883268c6849a56e0caecec8c8');
 */
export async function fetchVerifile(infoHash) {
  const hash = readHash(infoHash);
  const url = `${VERIFILE_URL}${hash}/`;
  const response = await fetch(url, { headers: { ...HEADER_PROFILES.api } });
  if (response.status === 429) {
    const error = new Error(`HTTP 429 (cota) em ${url}`);
    error.status = 429;
    error.quotaExhausted = true;
    throw error;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`JSON inválido em ${url}: ${error.message}`, { cause: error });
  }
}

/**
 * Confirma até três hashes por vez, em ordem, parando de abrir novas consultas após um HTTP 429.
 *
 * As consultas já iniciadas terminam e devolvem seus resultados. Hashes ainda não iniciados saem
 * como `skipped`, sem retry nem espera pela janela da cota.
 *
 * @param {string[]} hashes - Hashes hexadecimais de 40 caracteres, sem repetição.
 * @param {object} [options] - Opções.
 * @param {Function} [options.fetcher] - Função `(hash) => Promise<object>`; padrão `fetchVerifile`.
 * @returns {Promise<Array<{ hash: string, data?: object, error?: Error, skipped?: boolean }>>}
 *   Resultado por hash, na ordem recebida.
 * @throws {Error} Se `hashes` não for lista ou algum hash for inválido.
 * @example
 * const results = await confirmHashes(['6ff479e8c37929b883268c6849a56e0caecec8c8']);
 */
export async function confirmHashes(hashes, options = {}) {
  if (!Array.isArray(hashes)) throw new Error('hashes deve ser lista');
  const list = hashes.map(readHash);
  const fetcher = options.fetcher === undefined ? fetchVerifile : options.fetcher;
  if (typeof fetcher !== 'function') throw new Error('options.fetcher deve ser função');

  const results = new Array(list.length);
  let next = 0;
  let exhausted = false;

  async function worker() {
    while (!exhausted) {
      const index = next;
      next += 1;
      if (index >= list.length) return;
      try {
        results[index] = { hash: list[index], data: await fetcher(list[index]) };
      } catch (error) {
        results[index] = { hash: list[index], error };
        if (error && error.quotaExhausted) exhausted = true;
      }
    }
  }

  const workers = [];
  for (let index = 0; index < Math.min(VERIFILE_CONCURRENCY, list.length); index += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  for (let index = 0; index < results.length; index += 1) {
    if (results[index] === undefined) results[index] = { hash: list[index], skipped: true };
  }
  return results;
}

/**
 * Valida e normaliza um hash hexadecimal de 40 caracteres.
 *
 * @param {*} value - Valor recebido.
 * @returns {string} Hash em minúsculas.
 * @throws {Error} Se não for hexadecimal de 40 caracteres.
 */
function readHash(value) {
  if (typeof value !== 'string' || !HEX_HASH.test(value.trim())) {
    throw new Error(`hash inválido: ${JSON.stringify(value)} (esperado hexadecimal de 40 caracteres)`);
  }
  return value.trim().toLowerCase();
}
