/**
 * Cliente da API pública do Super Animes (AnimesTVS).
 *
 * A fonte não publica HTML: `https://animestvs.org` e `https://api.animestvs.org` respondem JSON.
 * O catálogo completo vem de `GET /animes` e as listas de episódios, de `GET /episodios-dublados`
 * e `GET /episodios-legendados`. Não há conta, chave, token, cookie ou parâmetro de sessão.
 */

import { fetchJson } from '../_blocks/http/index.mjs';
import { describe, isPlainObject } from './text.js';

const API_BASE = 'https://api.animestvs.org';
const EPISODE_PATHS = Object.freeze({
  Dublado: '/episodios-dublados',
  Legendado: '/episodios-legendados',
});

/**
 * Baixa o catálogo completo de animes.
 * @returns {Promise<object[]>} Entradas publicadas na ordem da fonte.
 * @throws {Error} Em HTTP fora de 2xx, corpo não JSON ou envelope fora de lista.
 * @example
 * const catalog = await fetchCatalog();
 * // catalog[0].titulo === '.hack//G.U. Returner'
 */
export async function fetchCatalog() {
  const body = await fetchJson(`${API_BASE}/animes`, { profile: 'api' });
  return readList(body, 'catálogo');
}

/**
 * Baixa a lista completa de episódios de um áudio.
 * @param {'Dublado'|'Legendado'} audio - Áudio da lista.
 * @returns {Promise<object[]>} Linhas de episódio publicadas na ordem da fonte.
 * @throws {Error} Em áudio desconhecido, HTTP fora de 2xx, corpo não JSON ou envelope fora de lista.
 * @example
 * const rows = await fetchEpisodeList('Dublado');
 * // rows[0].episodio === 'Episódio 008'
 */
export async function fetchEpisodeList(audio) {
  if (!Object.prototype.hasOwnProperty.call(EPISODE_PATHS, audio)) {
    throw new Error(`áudio inválido: ${describe(audio)} (esperado Dublado ou Legendado)`);
  }
  const body = await fetchJson(`${API_BASE}${EPISODE_PATHS[audio]}`, { profile: 'api' });
  return readList(body, `lista de episódios ${audio}`);
}

/**
 * Exige que a resposta seja uma lista JSON.
 * @param {*} body - Corpo interpretado.
 * @param {string} label - Nome do recurso nas mensagens de erro.
 * @returns {object[]} A própria lista.
 * @throws {Error} Se o corpo não for lista.
 */
function readList(body, label) {
  if (!Array.isArray(body)) {
    throw new Error(`${label} fora do esquema: esperado lista (recebido: ${describe(body)})`);
  }
  for (const item of body) {
    if (!isPlainObject(item)) {
      throw new Error(`${label} fora do esquema: esperado objeto em cada item (recebido: ${describe(item)})`);
    }
  }
  return body;
}
