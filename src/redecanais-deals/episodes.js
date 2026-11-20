/**
 * Lista de episódios da página de série do `redecanais.deals`.
 *
 * A página publica os links `Assistir` em `div.pm-category-description`, com cabeçalhos
 * `Nª Temporada` e links `...-<N>a-temporada-episodio-<M>_<hash>.html`. O par é lido do próprio
 * `href`; nenhuma URL de episódio é montada. O `h1` do episódio confirma as coordenadas.
 */

const EPISODE_HREF = /(\d+)a-temporada-episodio-(\d+)(?:[^\d]|$)/i;
const EPISODE_HEADING = /(\d+)\s*(?:ª|a)?\s*Temporada\s*-\s*Epis[óo]dio\s*(\d+)/i;

/**
 * @typedef {object} EpisodeLink
 * @property {string} url - URL absoluta do episódio publicada pela fonte.
 */

/**
 * Seleciona os links publicados para o par temporada/episódio pedido.
 * @param {string} seriesHtml - HTML da página da série.
 * @param {string} seriesUrl - URL final da página da série.
 * @param {{ season: number, episode: number }} coords - Coordenadas pedidas.
 * @returns {EpisodeLink[]} Links do par, sem repetir URL; vazio quando o par não foi publicado.
 * @throws {Error} Se a página de série não publicar nenhum link de episódio.
 */
export function findEpisodeLinks(seriesHtml, seriesUrl, coords) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(seriesHtml);
  const anchors = $('a');
  let published = false;
  const links = [];
  const seen = new Set();
  for (let index = 0; index < anchors.length; index += 1) {
    const href = anchors.eq(index).attr('href');
    if (href === undefined || href.trim() === '') continue;
    const match = EPISODE_HREF.exec(href);
    if (match === null) continue;
    published = true;
    if (Number(match[1]) !== coords.season || Number(match[2]) !== coords.episode) continue;
    const url = new URL(href, seriesUrl).href;
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ url });
  }
  if (!published) throw new Error(`Página de série sem lista de episódios em ${seriesUrl}`);
  return links;
}

/**
 * Confirma as coordenadas no `h1` da página do episódio.
 * @param {string} episodeHtml - HTML da página do episódio.
 * @param {string} episodeUrl - URL final da página do episódio.
 * @returns {{ season: number, episode: number }} Coordenadas publicadas no `h1`.
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
  return { season: Number(match[1]), episode: Number(match[2]) };
}
