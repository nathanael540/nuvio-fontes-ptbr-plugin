/**
 * Constantes e endereços do Cineveo.
 *
 * O catálogo é indexado pelo ID do TMDB e publica o detalhe em JSON na API do próprio site. Filme
 * entrega os servidores no detalhe; série lista os episódios no detalhe e publica os servidores no
 * JSON de `<script id="initialEpisodeData">` da página do episódio.
 */

import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';

/** Nome exibido nos logs e no formatador de cada stream. */
export const PROVIDER_NAME = 'Cineveo';

/** Origem única da fonte, sem barra no final. */
export const SITE_URL = 'https://cineveo.cfd';

/** Caminho da API JSON do site. */
export const API_PATH = '/api';

/** Prefixo das páginas de episódio. */
export const EPISODE_PATH = '/series';

/** Tipo usado pela API para cada tipo de mídia do app. */
export const DETAIL_TYPE = Object.freeze({ movie: 'movie', tv: 'series' });

/** Grupos de áudio publicados pela fonte e o idioma de cada um. */
export const AUDIO_GROUPS = Object.freeze([
  Object.freeze({ key: 'dub', language: LANGUAGE.DUBBED }),
  Object.freeze({ key: 'leg', language: LANGUAGE.SUBTITLED }),
]);

/** Tipos de stream aceitos pela fonte; os demais são triagem. */
export const STREAM_TYPES = Object.freeze(['mp4', 'hls']);

/** Marcador do 404 próprio da fonte, diferente do JSON de sucesso. */
export const DOCUMENTED_NOT_FOUND = /<title>\s*404 Not Found\s*<\/title>/i;

/** Bloco JSON do episódio publicado na página. */
export const EPISODE_DATA = /<script\b[^>]*\bid="initialEpisodeData"[^>]*>([\s\S]*?)<\/script>/i;

/**
 * Monta a URL do detalhe por ID do TMDB.
 * @param {string} type - Tipo da API (`movie` ou `series`).
 * @param {string} id - ID do TMDB já validado.
 * @returns {string} URL absoluta de `action=details`.
 * @throws {Error} Se o tipo ou o ID não forem texto não vazio.
 * @example
 * detailUrl('movie', '502356');
 * // 'https://cineveo.cfd/api?action=details&type=movie&id=502356'
 */
export function detailUrl(type, id) {
  if (typeof type !== 'string' || type.trim() === '') throw new Error(`Tipo da API inválido: ${String(type)}`);
  if (typeof id !== 'string' || id.trim() === '') throw new Error(`ID do TMDB inválido: ${String(id)}`);
  const query = new URLSearchParams({ action: 'details', type: type.trim(), id: id.trim() }).toString();
  return `${SITE_URL}${API_PATH}?${query}`;
}

/**
 * Monta a URL da página do episódio no padrão publicado pela fonte.
 * @param {string} slug - Slug da série publicado no detalhe.
 * @param {number} season - Temporada a partir de 1.
 * @param {number} episode - Episódio a partir de 1.
 * @returns {string} URL absoluta da página do episódio.
 * @throws {Error} Se o slug estiver vazio ou a coordenada não for inteira a partir de 1.
 * @example
 * episodePageUrl('breaking-bad-3m68r', 1, 1);
 * // 'https://cineveo.cfd/series/breaking-bad-3m68r-t1-ep1.html'
 */
export function episodePageUrl(slug, season, episode) {
  if (typeof slug !== 'string' || slug.trim() === '') throw new Error(`Slug da série inválido: ${String(slug)}`);
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Coordenada inválida para a página do episódio: season=${season} episode=${episode}`);
  }
  return `${SITE_URL}${EPISODE_PATH}/${slug.trim()}-t${season}-ep${episode}.html`;
}
