/**
 * Temporada, episódio e opções de player do AnimesHD.
 *
 * A ficha publica cada temporada em `div.se-c`, com o número em `span.se-t` e os episódios em
 * `ul.episodios li`, com `div.numerando` no formato `S - E`. A numeração da fonte nem sempre segue o
 * TMDB; a temporada é escolhida pela data de estreia do primeiro episódio, que coincide com o
 * `airDate` da temporada do TMDB. A página do episódio publica os players em
 * `li.dooplay_player_option`.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { loadHtml, parseSourceDate, textOf } from './site.js';

const SEASON_NUMBER = /^\d+$/;
const EPISODE_RANGE = /^(\d+)\s*-\s*(\d+)$/;
const EPISODE_TITLE = /epis[oó]dio\s+0*(\d+)/i;
const PLAYER_NUMBER = /^\d+$/;
const DAY_MS = 86400000;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').SeasonInfo} SeasonInfo
 */

/**
 * @typedef {object} SourceSeason
 * @property {number} number - Número publicado em `span.se-t`.
 * @property {string|null} firstIso - Data do primeiro episódio em `AAAA-MM-DD`.
 * @property {number} episodeCount - Quantidade de `li` da temporada.
 * @property {number} index - Posição do `div.se-c`, para reabrir o bloco.
 */

/**
 * @typedef {object} EpisodeEntry
 * @property {number} sourceSeason - Temporada da fonte escolhida.
 * @property {string} url - URL publicada da página do episódio.
 */

/**
 * @typedef {object} MediaOption
 * @property {string} post - Valor de `data-post`.
 * @property {string} nume - Valor de `data-nume`.
 * @property {string} type - Valor de `data-type`.
 * @property {string} label - Rótulo de `span.title` ou `Opção <n>`.
 */

/**
 * Seleciona a temporada e o episódio pedidos pela lista publicada.
 *
 * A temporada é escolhida pela data do primeiro episódio quando o TMDB informa `airDate`, com
 * tolerância de um dia; empate é desempatado pela contagem de episódios. Sem data, a temporada 1
 * única é aceita como agrupada; fora disso, o número exato só é aceito com a mesma contagem de
 * episódios do TMDB. O episódio é escolhido pelo segundo número de `div.numerando`, exigindo o
 * primeiro número da temporada escolhida.
 *
 * @param {string} html - HTML da ficha confirmada.
 * @param {string} pageUrl - URL da ficha, para resolver links relativos.
 * @param {number} seasonNumber - Temporada pedida (1-based).
 * @param {number} episodeNumber - Episódio pedido (1-based).
 * @param {SeasonInfo[]} tmdbSeasons - Temporadas do TMDB, com `airDate` e `episodeCount`.
 * @returns {EpisodeEntry|null} Episódio selecionado ou `null` na ausência reconhecida.
 * @throws {Error} Se a ficha não tiver `div.se-c`, se uma temporada não tiver `span.se-t` numérico
 *   ou se o episódio encontrado não tiver `href`.
 * @example
 * selectEpisode(html, 'https://animeshd.to/animes/kimetsu-no-yaiba-demon-slayer-online/', 3, 1, seasons);
 * // { sourceSeason: 2, url: 'https://animeshd.to/episodios/kimetsu-no-yaiba-2-episodio-1/' }
 */
export function selectEpisode(html, pageUrl, seasonNumber, episodeNumber, tmdbSeasons) {
  const $ = loadHtml(html);
  const seasonBlocks = $('div.se-c');
  if (seasonBlocks.length === 0) throw new Error('Ficha confirmada sem div.se-c');

  const seasons = [];
  for (let index = 0; index < seasonBlocks.length; index += 1) {
    const block = seasonBlocks.eq(index);
    const numberText = textOf(block.find('span.se-t').eq(0));
    if (!SEASON_NUMBER.test(numberText)) {
      throw new Error(`Temporada ${index} sem span.se-t numérico: "${numberText}"`);
    }
    const firstItem = block.find('ul.episodios li').eq(0);
    const firstDate = textOf(firstItem.find('span.date').eq(0));
    seasons.push({
      number: Number(numberText),
      firstIso: parseSourceDate(firstDate),
      episodeCount: block.find('ul.episodios li').length,
      index,
    });
  }

  const tmdbSeason = Array.isArray(tmdbSeasons)
    ? tmdbSeasons.find((season) => season !== null && typeof season === 'object' && season.number === seasonNumber)
    : undefined;
  const chosen = chooseSeason(seasons, tmdbSeason, seasonNumber);
  if (chosen === null) return null;

  const block = seasonBlocks.eq(chosen.index);
  const items = block.find('ul.episodios li');
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    if (!matchesEpisode(item, chosen.number, episodeNumber)) continue;
    const link = item.find('div.episodiotitle a').eq(0);
    const href = link.attr('href');
    if (!href) {
      throw new Error(`Episódio ${seasonNumber}x${episodeNumber} sem href publicado`);
    }
    return { sourceSeason: chosen.number, url: new URL(href, pageUrl).href };
  }
  return null;
}

/**
 * Escolhe a temporada da fonte correspondente ao pedido do TMDB.
 * @param {SourceSeason[]} seasons - Temporadas publicadas pela fonte.
 * @param {SeasonInfo|undefined} tmdbSeason - Temporada do TMDB, quando existe.
 * @param {number} requestedSeason - Temporada pedida.
 * @returns {SourceSeason|null} Temporada escolhida ou `null` quando não há correspondência segura.
 */
function chooseSeason(seasons, tmdbSeason, requestedSeason) {
  if (tmdbSeason !== undefined && typeof tmdbSeason.airDate === 'string' && tmdbSeason.airDate !== '') {
    const candidates = seasons.filter(
      (season) => season.firstIso !== null && dayDistance(season.firstIso, tmdbSeason.airDate) <= 1,
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const exact = candidates.filter((season) => season.episodeCount === tmdbSeason.episodeCount);
      return exact.length === 1 ? exact[0] : null;
    }
  }

  if (seasons.length === 1 && requestedSeason === 1) return seasons[0];

  if (tmdbSeason !== undefined && Number.isInteger(tmdbSeason.episodeCount)) {
    const exact = seasons.filter(
      (season) => season.number === requestedSeason && season.episodeCount === tmdbSeason.episodeCount,
    );
    if (exact.length === 1) return exact[0];
    return null;
  }

  const byNumber = seasons.filter((season) => season.number === requestedSeason);
  return byNumber.length === 1 ? byNumber[0] : null;
}

/**
 * Distância em dias entre duas datas ISO.
 * @param {string} left - Data `AAAA-MM-DD`.
 * @param {string} right - Data `AAAA-MM-DD`.
 * @returns {number} Diferença absoluta em dias.
 */
function dayDistance(left, right) {
  return Math.abs((Date.parse(left) - Date.parse(right)) / DAY_MS);
}

/**
 * Indica se o `li` corresponde à temporada e ao episódio pedidos.
 * @param {*} item - Seleção do `li`.
 * @param {number} sourceSeason - Temporada da fonte escolhida.
 * @param {number} episodeNumber - Episódio pedido.
 * @returns {boolean}
 */
function matchesEpisode(item, sourceSeason, episodeNumber) {
  const range = textOf(item.find('div.numerando').eq(0));
  const match = EPISODE_RANGE.exec(range);
  if (match !== null) {
    return Number(match[1]) === sourceSeason && Number(match[2]) === episodeNumber;
  }
  const title = textOf(item.find('div.episodiotitle a').eq(0));
  const titleMatch = EPISODE_TITLE.exec(title);
  return titleMatch !== null && Number(titleMatch[1]) === episodeNumber;
}

/**
 * Obtém as opções de player da página do episódio.
 *
 * Cada `li.dooplay_player_option` com `data-nume` numérico é uma opção independente. `data-nume`
 * não numérico é trailer e fica de fora. Página 404 é ausência; página 200 com `h1.epih1` e sem
 * opções também é ausência; página 200 sem `h1.epih1` e sem opções é erro de estrutura.
 *
 * @param {string} episodeUrl - URL publicada do episódio.
 * @returns {Promise<MediaOption[]>} Opções na ordem do documento; vazio na ausência.
 * @throws {Error} Se a página responder fora de 2xx (exceto 404), não tiver a estrutura esperada ou
 *   uma opção não tiver `data-post`/`data-type`.
 * @example
 * const options = await fetchOptions('https://animeshd.to/episodios/one-piece-episodio-1/');
 * // [{ post: '2011', nume: '1', type: 'tv', label: 'Legendado' }]
 */
export async function fetchOptions(episodeUrl) {
  let page;
  try {
    page = await fetchPage(episodeUrl, { profile: 'page' });
  } catch (error) {
    if (/^HTTP 404\b/.test(error.message)) return [];
    throw error;
  }

  const $ = loadHtml(page.text);
  const hasHeading = $('h1.epih1').length > 0 || $('#info h1').length > 0;
  const items = $('li.dooplay_player_option');
  const options = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const nume = item.attr('data-nume');
    if (typeof nume !== 'string' || !PLAYER_NUMBER.test(nume.trim())) continue;
    const post = item.attr('data-post');
    const type = item.attr('data-type');
    if (typeof post !== 'string' || post.trim() === '') {
      throw new Error(`Opção ${nume} sem data-post`);
    }
    if (typeof type !== 'string' || type.trim() === '') {
      throw new Error(`Opção ${nume} sem data-type`);
    }
    const label = textOf(item.find('span.title').eq(0)) || `Opção ${nume.trim()}`;
    options.push({ post: post.trim(), nume: nume.trim(), type: type.trim(), label });
  }

  if (options.length === 0) {
    if (hasHeading) return [];
    throw new Error('Página de episódio sem h1.epih1 e sem li.dooplay_player_option');
  }
  return options;
}
