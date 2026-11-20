/**
 * Lista de episódios da página de série do RedeCanais.
 *
 * A fonte publica os episódios dentro de `div[itemprop="description"]`, com cabeçalhos
 * `Nª Temporada` e links `...-<N>a-temporada-episodio-<M>-..._<hash>.html`. O par é lido do
 * próprio `href`; nenhuma URL de episódio é montada. O `h1` do episódio confirma as coordenadas.
 */

const EPISODE_HREF = /(\d+)a-temporada-episodio-(\d+)(?:[-_.]|$)/i;
const EPISODE_HEADING = /(\d+)\s*(?:ª|a)?\s*Temporada\s*-\s*Epis[óo]dio\s*(\d+)/i;
const ANCHOR = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>[\s\S]*?<\/a>/gi;
const TAG = /<[^>]*>/g;

/**
 * @typedef {object} EpisodeLink
 * @property {string} url - URL absoluta do episódio publicada pela fonte.
 * @property {string} label - Texto do episódio anterior ao link `Assistir`, usado como evidência de áudio.
 */

/**
 * Seleciona os links publicados para o par temporada/episódio pedido.
 * @param {string} seriesHtml - HTML da página da série.
 * @param {string} seriesUrl - URL final da página da série.
 * @param {{ season: number, episode: number }} coords - Coordenadas pedidas.
 * @returns {EpisodeLink[]} Links do par, sem repetir URL; vazio quando o par não foi publicado.
 * @throws {Error} Se a página de série não tiver o contêiner de episódios.
 */
export function findEpisodeLinks(seriesHtml, seriesUrl, coords) {
  const description = findDescriptionContainer(seriesHtml);
  if (description === null) {
    throw new Error(`Página de série sem div[itemprop="description"] em ${seriesUrl}`);
  }

  const html = description.html();
  const links = [];
  const seen = new Set();
  let previousEnd = 0;
  let match;
  const pattern = new RegExp(ANCHOR.source, 'gi');
  while ((match = pattern.exec(html)) !== null) {
    const href = decodeEntities(match[1] !== undefined ? match[1] : match[2]);
    const label = textFromHtml(html.slice(previousEnd, match.index));
    previousEnd = match.index + match[0].length;

    const coordsMatch = EPISODE_HREF.exec(href);
    if (coordsMatch === null) continue;
    if (Number(coordsMatch[1]) !== coords.season || Number(coordsMatch[2]) !== coords.episode) continue;

    const url = new URL(href, seriesUrl).href;
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ url, label });
  }
  return links;
}

/**
 * Indica se a página publica o contêiner de episódios, usado para separar série de filme.
 * @param {string} html - HTML da ficha.
 * @returns {boolean} True quando existe `div[itemprop="description"]`.
 */
export function hasEpisodeContainer(html) {
  return findDescriptionContainer(html) !== null;
}

/**
 * Localiza o `div[itemprop="description"]` da página.
 * @param {string} html - HTML da ficha.
 * @returns {object|null} Seleção do contêiner ou null quando ausente.
 */
function findDescriptionContainer(html) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(html);
  const candidates = $('div[itemprop]');
  for (let index = 0; index < candidates.length; index += 1) {
    const node = candidates.eq(index);
    if (node.attr('itemprop') === 'description') return node;
  }
  return null;
}

/**
 * Confirma as coordenadas no `h1` da página do episódio.
 * @param {string} episodeHtml - HTML da página do episódio.
 * @param {string} episodeUrl - URL final da página do episódio.
 * @returns {{ season: number, episode: number, title: string }} Coordenadas e título do episódio.
 * @throws {Error} Se a página não tiver `h1` ou se o `h1` não publicar o par temporada/episódio.
 */
export function parseEpisodeHeading(episodeHtml, episodeUrl) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(episodeHtml);
  const heading = $('h1').eq(0).text().trim();
  if (heading === '') throw new Error(`Página de episódio sem h1 em ${episodeUrl}`);
  const match = EPISODE_HEADING.exec(heading);
  if (match === null) {
    throw new Error(`h1 do episódio sem temporada/episódio em ${episodeUrl}`);
  }
  return {
    season: Number(match[1]),
    episode: Number(match[2]),
    title: heading,
  };
}

/**
 * Remove tags e decodifica as entidades usadas nos rótulos de episódio.
 * @param {string} html - Trecho de HTML.
 * @returns {string} Texto sem tags, com espaços normalizados.
 */
function textFromHtml(html) {
  return decodeEntities(html.replace(TAG, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Decodifica as entidades HTML presentes nos rótulos da fonte.
 * @param {string} text - Texto com entidades.
 * @returns {string}
 */
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ordf;/gi, 'ª')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}
