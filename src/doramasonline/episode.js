/**
 * Leitura das páginas do Doramas Online: ficha de filme/série e seleção do episódio publicado.
 *
 * A ficha de série usa o tema DooPlay: cada temporada fica em `div.se-c`, com `span.se-t` e uma
 * lista `ul.episodios` em que cada `li` traz `div.numerando` ("S - E") e o link de
 * `div.episodiotitle a`. O endereço publicado é a única fonte de verdade; sufixos como `-final`
 * não são reconstruídos a partir de números.
 */

export const SOURCE_URL = 'https://doramasonline.net';

const FOUR_DIGIT_YEAR = /^(\d{4})/;
const SEASON_EPISODE = /^(\d+)\s*-\s*(\d+)$/;

/**
 * @typedef {object} EpisodeLink
 * @property {number} season - Temporada a partir de 1.
 * @property {number} episode - Episódio a partir de 1.
 * @property {string} url - Endereço absoluto do episódio publicado na ficha.
 */

/**
 * @typedef {object} DetailPage
 * @property {string} url - URL final da ficha.
 * @property {string} title - Título principal da ficha.
 * @property {number|null} year - Ano de `span.date`; `null` quando ausente.
 * @property {EpisodeLink[]} episodes - Episódios de todas as temporadas.
 */

/**
 * @typedef {object} SelectedPage
 * @property {string} url - Endereço da página que publica os players.
 * @property {boolean} current - `true` quando a própria ficha é a página de players (filme).
 */

/**
 * Lê a ficha de um filme ou de uma série.
 * @param {string} html - HTML da ficha.
 * @param {string} pageUrl - URL final da ficha, guardada para o filme.
 * @returns {DetailPage} Título, ano e episódios publicados.
 * @throws {Error} Se a ficha não tiver título, se uma temporada não tiver lista ou se um episódio não tiver coordenada/link.
 * @example
 * const detail = readDetailPage(html, 'https://doramasonline.net/br/series/pousando-no-amor/');
 * detail.episodes[0]; // { season: 1, episode: 1, url: '.../episodio/pousando-no-amor-temporada-1-episodio-1/' }
 */
export function readDetailPage(html, pageUrl) {
  if (typeof html !== 'string') throw new Error('Ficha do Doramas Online: HTML inválido');
  if (typeof pageUrl !== 'string' || pageUrl === '') throw new Error('Ficha do Doramas Online sem URL');

  const $ = loadHtml(html);
  const title = $('.sheader .data h1').eq(0).text().trim();
  if (title === '') throw new Error('Ficha do Doramas Online sem título');

  const yearText = $('.sheader .extra span.date').eq(0).text().trim();
  const yearMatch = FOUR_DIGIT_YEAR.exec(yearText);

  return {
    url: pageUrl,
    title,
    year: yearMatch ? Number(yearMatch[1]) : null,
    episodes: readEpisodes($),
  };
}

/**
 * Escolhe a página de players do pedido: a própria ficha em filme ou o link exato do episódio.
 * @param {DetailPage} detail - Ficha lida.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {{ season: number, episode: number }|null} episode - Coordenada em séries; null em filmes.
 * @returns {SelectedPage|null} Página escolhida ou `null` quando a coordenada não existe na ficha.
 * @example
 * const selected = selectEpisode(detail, 'tv', { season: 1, episode: 16 });
 * // { url: '.../itaewon-class-temporada-1-episodio-16-final/', current: false }
 */
export function selectEpisode(detail, mediaType, episode) {
  if (mediaType === 'movie') return { url: detail.url, current: true };
  const match = detail.episodes.find((item) => item.season === episode.season && item.episode === episode.episode);
  return match === undefined ? null : { url: match.url, current: false };
}

/**
 * Lê todas as temporadas e episódios publicados na ficha.
 * @param {*} $ - Instância do cheerio.
 * @returns {EpisodeLink[]} Episódios na ordem da página.
 * @throws {Error} Se uma temporada não tiver lista, um episódio não tiver numeração ou link, ou a numeração divergir da temporada.
 */
function readEpisodes($) {
  const episodes = [];
  const blocks = $('div.se-c');

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks.eq(blockIndex);
    const season = readSeason(block, blockIndex);
    const list = block.find('ul.episodios').eq(0);
    if (list.length === 0) throw new Error(`Temporada ${season} da ficha sem lista de episódios`);
    const items = list.find('li');
    if (items.length === 0) throw new Error(`Temporada ${season} da ficha sem episódios`);

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      episodes.push(readEpisode(items.eq(itemIndex), season, blockIndex, itemIndex));
    }
  }

  return episodes;
}

/**
 * Lê a temporada de um bloco `se-c`.
 * @param {*} block - Bloco da temporada.
 * @param {number} blockIndex - Posição do bloco, usada nas mensagens.
 * @returns {number} Temporada publicada em `span.se-t`.
 * @throws {Error} Se `span.se-t` não existir ou não for inteiro.
 */
function readSeason(block, blockIndex) {
  const text = block.find('span.se-t').eq(0).text().trim();
  const season = Number(text);
  if (text === '' || !Number.isInteger(season) || season < 0) {
    throw new Error(`Temporada ${blockIndex + 1} da ficha sem span.se-t válido (recebido: "${text}")`);
  }
  return season;
}

/**
 * Lê um episódio de um `li`.
 * @param {*} item - Item da lista.
 * @param {number} season - Temporada do bloco.
 * @param {number} blockIndex - Posição do bloco, usada nas mensagens.
 * @param {number} itemIndex - Posição do item, usada nas mensagens.
 * @returns {EpisodeLink} Episódio com a URL publicada.
 * @throws {Error} Se faltar `div.numerando`, o par `S - E`, a coordenada exata ou o `href`.
 */
function readEpisode(item, season, blockIndex, itemIndex) {
  const context = `Temporada ${season}, episódio ${itemIndex + 1}`;
  const numerando = item.find('div.numerando').eq(0).text().trim();
  const match = SEASON_EPISODE.exec(numerando);
  if (!match) throw new Error(`${context} sem div.numerando no formato "S - E" (recebido: "${numerando}")`);

  const itemSeason = Number(match[1]);
  const itemEpisode = Number(match[2]);
  if (itemSeason !== season) {
    throw new Error(`${context} com numerando "${numerando}" fora da temporada ${season}`);
  }

  const href = item.find('div.episodiotitle a[href]').eq(0).attr('href');
  if (!href) throw new Error(`${context} sem link em div.episodiotitle a`);

  return {
    season: itemSeason,
    episode: itemEpisode,
    url: new URL(href, SOURCE_URL).href,
  };
}

/**
 * Carrega o HTML com o cheerio fornecido pelo app.
 * @param {string} html - Documento HTML.
 * @returns {*} Instância do cheerio.
 */
function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}
