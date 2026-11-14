/**
 * Leitura da página da obra no OxeAnimes.
 *
 * A página `/anime/<slug>` publica cartões com `href="/watch/<id>?anime=...&slug=..."`. O número do
 * episódio aparece no texto do cartão (`Episódio 1`, `T1 • EP 1`) ou no `alt` da imagem. A posição
 * do link nunca é usada como número.
 */

import { fetchText } from '../_blocks/http/index.mjs';
import { loadHtml } from './html.js';
import { buildAnimeUrl, SITE_HEADERS, resolveSiteUrl, SITE_URL } from './site.js';

const WATCH_PATH = '/watch/';
const EPISODE_PATTERN = /epis[oó]dio\s+(\d+)/i;
const EPISODE_SHORT_PATTERN = /\bep\s*(\d+)\b/i;

/**
 * @typedef {object} EpisodeLink
 * @property {string} id - ID do episódio lido do caminho `/watch/<id>`.
 * @property {number} number - Número do episódio anunciado no cartão.
 * @property {string} href - URL absoluta do link de reprodução.
 * @property {string|null} slug - Slug da obra informado no link, quando presente.
 */

/**
 * Abre a página de um candidato e devolve o link do episódio pedido.
 *
 * Para série, procura o cartão com o número igual ao episódio recebido. Para filme, usa a entrada
 * única; se houver mais de uma URL distinta, prefere o cartão rotulado `Episódio 1` e lança erro
 * quando o rótulo não é inequívoco.
 *
 * @param {import('./catalog.js').AudioCandidate} candidate - Candidato escolhido para o áudio.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {number|null} episode - Episódio pedido; `null` em filme.
 * @returns {Promise<EpisodeLink|null>} Link do episódio ou `null` na ausência reconhecida.
 * @throws {Error} Se a página responder fora de 2xx, não tiver link legível ou a estrutura for
 *   inesperada para filme.
 * @example
 * const link = await findEpisodeLink(candidate, 'tv', 1);
 * // link.id === '9677'
 */
export async function findEpisodeLink(candidate, mediaType, episode) {
  const html = await fetchText(buildAnimeUrl(candidate.slug), { headers: SITE_HEADERS });
  const entries = readWatchEntries(html);
  return selectEntry(entries, mediaType, episode);
}

/**
 * Lê e deduplica os links `/watch/` da página.
 * @param {string} html - HTML da página da obra.
 * @returns {EpisodeLink[]} Links com número legível, na ordem da página.
 * @throws {Error} Se um link `/watch/` não tiver número legível.
 */
function readWatchEntries(html) {
  const $ = loadHtml(html);
  const anchors = $('a');
  const entries = new Map();

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors.eq(index);
    const href = typeof anchor.attr('href') === 'string' ? anchor.attr('href').trim() : '';
    if (!href.startsWith(WATCH_PATH)) continue;

    const absolute = resolveSiteUrl(href);
    const existing = entries.get(absolute);
    if (existing && existing.number !== null) continue;
    const number = readEpisodeNumber(anchor);
    entries.set(absolute, {
      id: readEpisodeId(href),
      number,
      href: absolute,
      slug: readQuerySlug(href),
    });
  }

  if (entries.size === 0) return [];
  for (const entry of entries.values()) {
    if (entry.number === null) {
      throw new Error(`Link de reprodução sem número legível em ${entry.href}`);
    }
  }
  return [...entries.values()];
}

/**
 * Lê o número do episódio no `alt` da imagem ou no texto do cartão.
 * @param {*} anchor - Seleção do cheerio para o link.
 * @returns {number|null} Número lido ou `null` quando o cartão não publica número.
 */
function readEpisodeNumber(anchor) {
  const texts = [anchor.find('img').attr('alt'), anchor.text()];
  for (const text of texts) {
    if (typeof text !== 'string') continue;
    const match = EPISODE_PATTERN.exec(text) || EPISODE_SHORT_PATTERN.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Lê o ID do episódio do caminho `/watch/<id>`.
 * @param {string} href - Caminho publicado no link.
 * @returns {string} ID decodificado.
 * @throws {Error} Se o caminho não tiver ID.
 */
function readEpisodeId(href) {
  const path = href.split(/[?#]/)[0];
  const id = path.slice(WATCH_PATH.length);
  if (id === '') throw new Error(`Link de reprodução sem ID: "${href}"`);
  try {
    return decodeURIComponent(id);
  } catch (error) {
    throw new Error(`Link de reprodução com ID inválido: "${href}"`, { cause: error });
  }
}

/**
 * Lê o slug informado na query do link, quando presente.
 * @param {string} href - Caminho publicado no link.
 * @returns {string|null} Slug decodificado ou `null`.
 */
function readQuerySlug(href) {
  const value = new URL(href, SITE_URL).searchParams.get('slug');
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Escolhe a entrada pedida entre os links da página.
 * @param {EpisodeLink[]} entries - Links lidos da página.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {number|null} episode - Episódio pedido.
 * @returns {EpisodeLink|null} Entrada escolhida ou `null` na ausência.
 * @throws {Error} Se um filme tiver mais de uma entrada sem rótulo inequívoco.
 */
function selectEntry(entries, mediaType, episode) {
  if (mediaType === 'movie') {
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0];
    const firstEpisode = entries.filter((entry) => entry.number === 1);
    if (firstEpisode.length === 1) return firstEpisode[0];
    throw new Error(`Página de filme com ${entries.length} entradas distintas sem rótulo inequívoco`);
  }
  if (!Number.isInteger(episode) || episode < 1) {
    throw new Error(`Episódio inválido: ${episode} (esperado inteiro a partir de 1)`);
  }
  return entries.find((entry) => entry.number === episode) || null;
}
