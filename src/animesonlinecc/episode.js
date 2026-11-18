/**
 * Temporada, episódio e opções de player do AnimesOnlineCC.
 *
 * A ficha publica as temporadas em `div.se-c` com o número em `span.se-t` e os episódios em
 * `div.numerando` ("Ep - N") e `div.episodiotitle a`. O episódio é escolhido pelo número declarado e
 * o `href` publicado é a fonte da verdade. A página do episódio publica cada player em
 * `div[id^="option-"]`, com o `src` no próprio `div` ou no `iframe` interno, e o rótulo em
 * `ul.idTabs a[href="#option-N"]`.
 *
 * Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0).
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { loadHtml, textOf } from './site.js';

const SEASON_NUMBER = /^\d+$/;
const EPISODE_NUMBER = /\bep\s*[-–—]?\s*0*(\d+)\b/i;
const EPISODE_TITLE_NUMBER = /\bepis[oó]dio\s+0*(\d+)\b/i;
const OPTION_ID = /^option-(\d+)$/;
const OPTION_HREF = /^#(option-\d+)$/;

/**
 * @typedef {object} EpisodeEntry
 * @property {number} season - Temporada selecionada.
 * @property {number} episode - Episódio selecionado.
 * @property {string} url - URL publicada da página do episódio.
 */

/**
 * @typedef {object} MediaOption
 * @property {string} id - Identificador do bloco (`option-1`).
 * @property {string} label - Rótulo da aba (`Dublado`, `Legendado`) ou `Opção <n>`.
 * @property {string} url - URL do embed.
 */

/**
 * Seleciona a temporada e o episódio pedidos pela lista publicada.
 *
 * A temporada é escolhida pelo número de `span.se-t` e o episódio pelo número de `div.numerando` ou
 * pelo texto de `div.episodiotitle a`, usando o `href` publicado. Temporada ou episódio ausente
 * devolve `null`, sem mapeamento por posição ou numeração absoluta.
 *
 * @param {string} html - HTML da ficha confirmada.
 * @param {string} pageUrl - URL da ficha, para resolver links relativos.
 * @param {number} seasonNumber - Temporada pedida (1-based).
 * @param {number} episodeNumber - Episódio pedido (1-based).
 * @returns {EpisodeEntry|null} Episódio selecionado ou `null` na ausência reconhecida.
 * @throws {Error} Se a ficha não tiver `div.se-c`, se uma temporada não tiver `span.se-t` numérico
 *   ou se o episódio encontrado não tiver `href`.
 * @example
 * selectEpisode(html, 'https://animesonlinecc.to/anime/naruto-shippuden/', 1, 1);
 * // { season: 1, episode: 1, url: 'https://animesonlinecc.to/episodio/naruto-shippuden-episodio-1/' }
 */
export function selectEpisode(html, pageUrl, seasonNumber, episodeNumber) {
  const $ = loadHtml(html);
  const seasons = $('div.se-c');
  if (seasons.length === 0) throw new Error('Ficha confirmada sem div.se-c');

  for (let index = 0; index < seasons.length; index += 1) {
    const block = seasons.eq(index);
    if (readSeasonNumber(block, index) !== seasonNumber) continue;

    const items = block.find('li');
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items.eq(itemIndex);
      const link = item.find('div.episodiotitle a').eq(0);
      const number = readItemNumber(item, link);
      if (number !== episodeNumber) continue;
      const href = link.attr('href');
      if (!href) throw new Error(`Episódio ${seasonNumber}x${episodeNumber} sem href publicado`);
      return { season: seasonNumber, episode: episodeNumber, url: new URL(href, pageUrl).href };
    }
    return null;
  }
  return null;
}

/**
 * Lê o número de uma temporada publicada.
 * @param {*} block - Seleção do `div.se-c`.
 * @param {number} index - Posição da temporada, para a mensagem de erro.
 * @returns {number} Número da temporada.
 * @throws {Error} Se `span.se-t` não tiver um número.
 */
function readSeasonNumber(block, index) {
  const text = textOf(block.find('span.se-t'));
  if (!SEASON_NUMBER.test(text)) {
    throw new Error(`Temporada ${index} sem span.se-t numérico: "${text}"`);
  }
  return Number(text);
}

/**
 * Lê o número do episódio pelo `div.numerando` ou pelo texto do link.
 * @param {*} item - Seleção do `li` do episódio.
 * @param {*} link - Seleção do link de `div.episodiotitle`.
 * @returns {number|null} Número do episódio ou `null` quando a entrada não declara número.
 */
function readItemNumber(item, link) {
  for (const text of [textOf(item.find('div.numerando')), textOf(link)]) {
    const match = EPISODE_NUMBER.exec(text) || EPISODE_TITLE_NUMBER.exec(text);
    if (match !== null) return Number(match[1]);
  }
  return null;
}

/**
 * Valida os marcadores de uma página de episódio.
 * @param {string} html - HTML da página.
 * @returns {void}
 * @throws {Error} Se a página não tiver `h1.epih1` nem `#info h1`.
 * @example
 * assertEpisodePage('<h1 class="epih1">Naruto Shippuden Episodio 1 Online</h1>'); // ok
 */
export function assertEpisodePage(html) {
  const $ = loadHtml(html);
  if ($('h1.epih1').length > 0 || $('#info h1').length > 0) return;
  throw new Error('Página de episódio sem h1.epih1 ou #info h1');
}

/**
 * Obtém as opções do episódio, com uma única tentativa de fallback na ficha do anime.
 *
 * O 404 da página do episódio é tratado como página removida e usa o fallback; 403 e 5xx sobem
 * como falha. Sem opções na página do episódio, o HTML já obtido da ficha confirmada é lido uma vez.
 *
 * @param {string} episodeUrl - URL publicada do episódio.
 * @param {string} animeUrl - URL da ficha confirmada, usada no `Referer` e no fallback.
 * @param {string} animeHtml - HTML da ficha confirmada.
 * @returns {Promise<MediaOption[]>} Opções publicadas; vazio quando as duas páginas não têm opções.
 * @throws {Error} Se a página do episódio responder 403/5xx, falhar a rede ou não tiver a estrutura.
 * @example
 * const options = await fetchOptions('https://animesonlinecc.to/episodio/naruto-shippuden-episodio-1/', animeUrl, animeHtml);
 * // [{ id: 'option-1', label: 'Dublado', url: 'https://www.blogger.com/video.g?token=EXAMPLE' }]
 */
export async function fetchOptions(episodeUrl, animeUrl, animeHtml) {
  let page;
  try {
    page = await fetchPage(episodeUrl, { profile: 'page', headers: { Referer: animeUrl } });
  } catch (error) {
    if (/^HTTP 404\b/.test(error.message)) return readOptions(animeHtml, animeUrl);
    throw error;
  }

  assertEpisodePage(page.text);
  const options = readOptions(page.text, page.url);
  if (options.length > 0) return options;
  return readOptions(animeHtml, animeUrl);
}

/**
 * Lê os blocos `option-*` de uma página.
 *
 * O `src` é lido primeiro do próprio `div` (formato documentado pelo Prisma) e, se ausente, do
 * primeiro `iframe[src]` interno (formato observado). O rótulo vem de `ul.idTabs a` com `href`
 * igual a `#<id>`; sem âncora, a opção é identificada por `Opção <n>`. Opções sem `src` ficam de
 * fora porque a terceira forma de embed não é suportada.
 *
 * @param {string} html - HTML da página.
 * @param {string} baseUrl - URL da página, para resolver `src` relativo e `//host`.
 * @returns {MediaOption[]} Opções na ordem do documento.
 * @throws {Error} Se um `src` publicado não formar URL válida.
 * @example
 * readOptions('<div id="option-1" src="https://host.example/e/1"></div>', 'https://animesonlinecc.to/episodio/x/');
 * // [{ id: 'option-1', label: 'Opção 1', url: 'https://host.example/e/1' }]
 */
export function readOptions(html, baseUrl) {
  const $ = loadHtml(html);
  const labels = readOptionLabels($);
  const player = $('div#playex');
  const scope = player.length > 0 ? player.find('div') : $('div');
  const options = [];

  for (let index = 0; index < scope.length; index += 1) {
    const div = scope.eq(index);
    const id = div.attr('id');
    if (typeof id !== 'string' || !OPTION_ID.test(id)) continue;
    const src = div.attr('src') || div.find('iframe[src]').eq(0).attr('src');
    if (typeof src !== 'string' || src.trim() === '') continue;
    options.push({ id, label: labels.get(id) || `Opção ${OPTION_ID.exec(id)[1]}`, url: readUrl(src, baseUrl) });
  }
  return options;
}

/**
 * Mapa de rótulos por `id` de opção, lido de `ul.idTabs a`.
 * @param {*} $ - Instância do cheerio.
 * @returns {Map<string, string>} Rótulos aparados.
 */
function readOptionLabels($) {
  const labels = new Map();
  const anchors = $('ul.idTabs a');
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors.eq(index);
    const href = anchor.attr('href');
    if (typeof href !== 'string') continue;
    const match = OPTION_HREF.exec(href);
    if (match === null) continue;
    const label = textOf(anchor);
    if (label !== '') labels.set(match[1], label);
  }
  return labels;
}

/**
 * Resolve um `src` contra a página e exige HTTP(S).
 * @param {string} src - Endereço publicado.
 * @param {string} baseUrl - URL da página.
 * @returns {string} URL absoluta.
 * @throws {Error} Se o endereço não formar URL HTTP(S).
 */
function readUrl(src, baseUrl) {
  let url;
  try {
    url = new URL(src.trim(), baseUrl);
  } catch (error) {
    throw new Error(`Embed com src inválido: "${src}"`, { cause: error });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Embed fora de HTTP(S): "${src}"`);
  }
  return url.href;
}
