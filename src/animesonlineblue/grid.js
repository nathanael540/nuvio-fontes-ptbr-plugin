/**
 * Grade de temporadas e episódios do Animes Online Blue.
 *
 * A página do anime publica a árvore pelo protocolo RSC do Next.js: `GET /anime/<slug>?_rsc=1`
 * responde `text/x-component` com o bloco `"temporadas":[{ numero, nome, eps: [...] }]`. A temporada
 * é escolhida por `numero` e o episódio por `eps[].num`, nunca pela posição visual. Cada episódio
 * publica os identificadores de áudio em `leg` e `dub`, que podem ser nulos.
 */

import { fetchText } from '../_blocks/http/index.mjs';
import { SITE_URL } from './catalog.js';

const ANIME_PATH = '/anime/';
const TEMPORADAS_MARKER = /"temporadas"\s*:\s*/;
const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * @typedef {object} AudioReference
 * @property {number} id - Identificador usado em `/api/episodio/<id>`.
 */

/**
 * @typedef {object} EpisodeEntry
 * @property {number} season - Temporada selecionada.
 * @property {number} episode - Episódio selecionado.
 * @property {AudioReference|null} leg - Áudio legendado publicado, ou `null`.
 * @property {AudioReference|null} dub - Áudio dublado publicado, ou `null`.
 */

/**
 * Busca e lê a grade de temporadas do anime.
 * @param {string} slug - Slug da ficha em `/anime/<slug>`.
 * @returns {Promise<object[]>} Temporadas validadas, na ordem publicada pelo RSC.
 * @throws {Error} Se o slug for inválido, a resposta não for 2xx, o bloco `temporadas` não existir,
 *   o JSON extraído for inválido ou uma temporada não tiver `numero` e `eps`.
 * @example
 * const seasons = await fetchSeasons('kimetsu-no-yaiba');
 * // [{ numero: 1, nome: 'Kimetsu no Yaiba', eps: [...] }]
 */
export async function fetchSeasons(slug) {
  const pageUrl = buildPageUrl(slug);
  const url = `${pageUrl}?${new URLSearchParams({ _rsc: '1' }).toString()}`;
  const text = await fetchText(url, {
    profile: 'page',
    headers: {
      RSC: '1',
      Accept: 'text/x-component',
      Referer: pageUrl,
    },
  });
  return readTemporadas(text);
}

/**
 * Seleciona a temporada e o episódio pedidos.
 *
 * A ausência da temporada ou do episódio é reconhecida e devolve `null`; entrada de episódio sem os
 * campos `leg`/`dub` ou com identificador inválido é erro de estrutura.
 *
 * @param {object[]} seasons - Temporadas lidas do RSC.
 * @param {number} seasonNumber - Temporada pedida (1-based).
 * @param {number} episodeNumber - Episódio pedido (1-based).
 * @returns {EpisodeEntry|null} Episódio selecionado ou `null` na ausência reconhecida.
 * @throws {Error} Se o episódio escolhido não publicar `leg`/`dub` válidos.
 * @example
 * const entry = selectEpisode(seasons, 1, 1);
 * // { season: 1, episode: 1, leg: { id: 156586 }, dub: { id: 158759 } }
 */
export function selectEpisode(seasons, seasonNumber, episodeNumber) {
  const season = seasons.find((item) => item.numero === seasonNumber);
  if (season === undefined) return null;

  const episode = season.eps.find((item) => item !== null && typeof item === 'object' && item.num === episodeNumber);
  if (episode === undefined) return null;

  return {
    season: seasonNumber,
    episode: episodeNumber,
    leg: readAudio(episode, 'leg', seasonNumber, episodeNumber),
    dub: readAudio(episode, 'dub', seasonNumber, episodeNumber),
  };
}

/**
 * Monta a URL da página do anime.
 * @param {string} slug - Slug publicado pela busca.
 * @returns {string} URL absoluta de `/anime/<slug>`.
 * @throws {Error} Se o slug não for texto não vazio ou não formar uma URL HTTP(S) do site.
 * @example
 * buildPageUrl('kimetsu-no-yaiba');
 * // 'https://animesonline.blue/anime/kimetsu-no-yaiba'
 */
function buildPageUrl(slug) {
  if (typeof slug !== 'string' || slug.trim() === '') {
    throw new Error(`Slug de anime inválido: ${String(slug)} (esperado texto não vazio)`);
  }
  const url = new URL(`${SITE_URL}${ANIME_PATH}${encodeURIComponent(slug.trim())}`);
  if (!HTTP_PROTOCOLS.includes(url.protocol)) {
    throw new Error(`Slug de anime fora de HTTP(S): "${slug}"`);
  }
  return url.href;
}

/**
 * Extrai e valida o bloco `temporadas` da resposta RSC.
 * @param {string} text - Corpo `text/x-component`.
 * @returns {object[]} Temporadas validadas.
 * @throws {Error} Se o bloco não existir, o JSON for inválido ou a estrutura estiver fora do contrato.
 */
function readTemporadas(text) {
  if (typeof text !== 'string') throw new Error('Resposta RSC não é texto');

  const marker = TEMPORADAS_MARKER.exec(text);
  if (marker === null) throw new Error('Resposta RSC sem o bloco temporadas');

  const start = text.indexOf('[', marker.index + marker[0].length);
  if (start === -1) throw new Error('Bloco temporadas sem lista JSON');
  const end = findArrayEnd(text, start);

  let seasons;
  try {
    seasons = JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    throw new Error(`Bloco temporadas com JSON inválido: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(seasons)) throw new Error('Bloco temporadas não é uma lista');
  seasons.forEach((season, index) => validateSeason(season, index));
  return seasons;
}

/**
 * Encontra o colchete que fecha a lista JSON, respeitando strings e escapes.
 * @param {string} text - Texto da resposta.
 * @param {number} start - Índice do `[` de abertura.
 * @returns {number} Índice do `]` de fechamento.
 * @throws {Error} Se a lista não terminar.
 */
function findArrayEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('Bloco temporadas sem fechamento');
}

/**
 * Valida uma temporada lida do RSC.
 * @param {*} season - Valor bruto.
 * @param {number} index - Posição na lista, para a mensagem de erro.
 * @returns {void}
 * @throws {Error} Se a temporada não for objeto, não tiver `numero` inteiro ou `eps` em lista.
 */
function validateSeason(season, index) {
  if (season === null || typeof season !== 'object' || Array.isArray(season)) {
    throw new Error(`Temporada ${index} inválida: esperado objeto`);
  }
  if (!Number.isInteger(season.numero)) {
    throw new Error(`Temporada ${index} sem numero inteiro`);
  }
  if (!Array.isArray(season.eps)) {
    throw new Error(`Temporada ${season.numero} sem lista eps`);
  }
}

/**
 * Lê o identificador de um áudio publicado no episódio.
 * @param {object} episode - Entrada do episódio no RSC.
 * @param {'leg'|'dub'} field - Campo de áudio.
 * @param {number} season - Temporada, para a mensagem de erro.
 * @param {number} number - Episódio, para a mensagem de erro.
 * @returns {AudioReference|null} Referência validada ou `null` quando o áudio não foi publicado.
 * @throws {Error} Se o campo não existir ou a referência não tiver `id` inteiro positivo.
 */
function readAudio(episode, field, season, number) {
  const label = `Episódio ${season}x${String(number).padStart(2, '0')}`;
  if (!Object.prototype.hasOwnProperty.call(episode, field)) {
    throw new Error(`${label} sem o campo ${field}`);
  }
  const value = episode[field];
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} com ${field} fora do contrato`);
  }
  if (!Number.isInteger(value.id) || value.id <= 0) {
    throw new Error(`${label} com ${field}.id inválido: ${String(value.id)}`);
  }
  return { id: value.id };
}
