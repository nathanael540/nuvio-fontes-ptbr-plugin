/**
 * Páginas de obra e de episódio do AniBunker.
 *
 * A obra publica `h1`, `Formato`, `Ano` e `Adicionados: N legendado e M dublado`. O episódio publica
 * `data-video-id` no contêiner do player e botões `data-player-id`. Filme usa a entrada única com
 * número 1; série usa o episódio pedido quando a faixa anunciada o alcança.
 */

import { loadHtml, textOf } from './html.js';
import { expectedSeasonYear, seasonMatches, titleMatches, yearMatches } from './titles.js';

const TRACKS = Object.freeze([
  Object.freeze({ suffix: 'legendado', label: 'Legendado' }),
  Object.freeze({ suffix: 'dublado', label: 'Dublado' }),
]);

const PLAYER_LABELS = Object.freeze({
  token: 'YTube',
  url_drive: 'Gdrive',
  url_hd: 'HD+',
  url_hd_2: 'HD 2',
  url_hd_3: 'HD 3',
  sendvid: 'Sendvid',
  url_mega: 'Mega',
});

/**
 * @typedef {object} AnimePage
 * @property {string} title - Texto do `h1`.
 * @property {string} format - `Filme` ou `Anime` conforme publicado.
 * @property {number} year - Ano da obra.
 * @property {{ legendado: number, dublado: number }} audioCounts - Faixas anunciadas.
 * @property {string} url - Página absoluta da obra.
 */

/**
 * @typedef {object} EpisodeOption
 * @property {string} label - Faixa de áudio exibida nos avisos.
 * @property {string} language - Membro de `LANGUAGE` correspondente à faixa.
 * @property {string} url - Página absoluta do episódio.
 */

/**
 * @typedef {object} EpisodePage
 * @property {string} videoId - `data-video-id` do contêiner.
 * @property {{ id: string, label: string }[]} players - Botões `data-player-id` na ordem publicada.
 * @property {string} url - Página absoluta do episódio.
 */

/**
 * Lê a página de uma obra.
 *
 * @param {string} html - HTML da página `/anime/<slug>`.
 * @param {string} pageUrl - URL absoluta da página.
 * @returns {AnimePage} Título, formato, ano e contagens de áudio.
 * @throws {Error} Se faltar `h1`, `.field-info`, `Formato`, `Ano` ou `Adicionados`.
 * @example
 * readAnimePage(html, 'https://anibunker.com/anime/jujutsu-kaisen');
 * // { title: 'Jujutsu Kaisen', format: 'Anime', year: 2020, audioCounts: { legendado: 24, dublado: 24 }, url: '...' }
 */
export function readAnimePage(html, pageUrl) {
  const $ = loadHtml(html);
  if ($('.field-info').length === 0) {
    throw new Error(`Ficha do AniBunker em ${pageUrl} sem .field-info`);
  }
  const title = textOf($('h1').eq(0));
  if (title === '') throw new Error(`Ficha do AniBunker em ${pageUrl} sem h1`);

  const fields = {};
  const items = $('.field-info');
  for (let index = 0; index < items.length; index += 1) {
    const text = textOf(items.eq(index));
    const match = /^([^:]+):\s*(.+)$/.exec(text);
    if (match === null) continue;
    fields[match[1].trim().toLowerCase()] = match[2].trim();
  }

  const format = fields.formato;
  if (!format) throw new Error(`Ficha do AniBunker em ${pageUrl} sem Formato`);
  const yearText = fields.ano;
  if (!yearText || !/^\d{4}$/.test(yearText)) {
    throw new Error(`Ficha do AniBunker em ${pageUrl} sem Ano`);
  }
  const added = fields.adicionados;
  if (!added) throw new Error(`Ficha do AniBunker em ${pageUrl} sem Adicionados`);

  return {
    title,
    format,
    year: Number(yearText),
    audioCounts: readAudioCounts(added, pageUrl),
    url: pageUrl,
  };
}

/**
 * Confere se a página corresponde ao pedido.
 *
 * Exige formato compatível (`Filme` em filme, `Anime` em série), título semelhante aos títulos do
 * TMDB ou ao termo da busca, ano da temporada/filme e temporada compatível.
 *
 * @param {AnimePage} page - Página lida.
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo`.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {number|null} season - Temporada pedida; `null` em filme.
 * @param {string|null} query - Termo que encontrou o candidato.
 * @returns {boolean} `true` quando a página confirma a obra pedida.
 * @example
 * confirmAnimePage(page, media, 'tv', 2, 'Jujutsu Kaisen 2'); // true
 */
export function confirmAnimePage(page, media, mediaType, season, query) {
  if (mediaType === 'movie') {
    if (!/^filme$/i.test(page.format)) return false;
  } else if (!/^anime$/i.test(page.format)) {
    return false;
  }
  if (!titleMatches(page.title, media, query)) return false;
  if (!yearMatches(page.year, expectedSeasonYear(media, mediaType, season))) return false;
  if (mediaType === 'tv' && !seasonMatches(page.title, media, season)) return false;
  return true;
}

/**
 * Monta as páginas de áudio viáveis para o pedido.
 *
 * Em filme o número é sempre 1 e basta a faixa ter sido anunciada. Em série a faixa só é viável
 * quando a contagem alcança o episódio pedido. Sem faixa viável, a lista é vazia.
 *
 * @param {AnimePage} page - Página confirmada.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {number|null} episode - Episódio pedido; `null` em filme.
 * @returns {EpisodeOption[]} Faixas na ordem legendado/dublado.
 * @example
 * buildEpisodeOptions(page, 'tv', 1);
 * // [{ label: 'Legendado', language: 'Legendado', url: 'https://anibunker.com/anime/x-episodio-1-legendado' }, ...]
 */
export function buildEpisodeOptions(page, mediaType, episode) {
  const number = mediaType === 'movie' ? 1 : episode;
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Episódio inválido para o AniBunker: ${episode}`);
  }
  const base = page.url.replace(/\/+$/, '');
  const options = [];
  for (const track of TRACKS) {
    const count = page.audioCounts[track.suffix];
    const viable = mediaType === 'movie' ? count > 0 : count >= number;
    if (!viable) continue;
    options.push({
      label: track.label,
      language: track.label,
      url: `${base}-episodio-${number}-${track.suffix}`,
    });
  }
  return options;
}

/**
 * Lê a página de um episódio.
 *
 * @param {string} html - HTML da página `/anime/<slug>-episodio-<n>-<audio>`.
 * @param {string} pageUrl - URL absoluta da página.
 * @returns {EpisodePage} Vídeo e players na ordem publicada.
 * @throws {Error} Se faltar `data-video-id` ou algum botão `data-player-id`.
 * @example
 * readEpisodePage(html, 'https://anibunker.com/anime/jujutsu-kaisen-episodio-1-legendado');
 * // { videoId: '15912', players: [{ id: 'token', label: 'YTube' }], url: '...' }
 */
export function readEpisodePage(html, pageUrl) {
  const $ = loadHtml(html);
  const container = $('[data-video-id]').eq(0);
  const videoId = container.length === 0 ? '' : String(container.attr('data-video-id') || '').trim();
  if (videoId === '') throw new Error(`Episódio do AniBunker em ${pageUrl} sem data-video-id`);

  const buttons = $('[data-player-id]');
  const players = [];
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons.eq(index);
    const id = String(button.attr('data-player-id') || '').trim();
    if (id === '') continue;
    players.push({ id, label: playerLabel(id, textOf(button)) });
  }
  if (players.length === 0) throw new Error(`Episódio do AniBunker em ${pageUrl} sem player`);

  return { videoId, players, url: pageUrl };
}

/**
 * Lê as contagens `N legendado` e `M dublado`.
 * @param {string} text - Texto do campo `Adicionados`.
 * @param {string} pageUrl - Página, para a mensagem de erro.
 * @returns {{ legendado: number, dublado: number }}
 * @throws {Error} Se alguma das contagens não existir.
 */
function readAudioCounts(text, pageUrl) {
  const legendado = /(\d+)\s+legendad[oa]s?/i.exec(text);
  const dublado = /(\d+)\s+dublad[oa]s?/i.exec(text);
  if (legendado === null || dublado === null) {
    throw new Error(`Ficha do AniBunker em ${pageUrl} sem contagem de áudios`);
  }
  return { legendado: Number(legendado[1]), dublado: Number(dublado[1]) };
}

/**
 * Rótulo do player: o nome conhecido do botão, senão o texto publicado, senão o id.
 * @param {string} id - `data-player-id`.
 * @param {string} text - Texto do botão.
 * @returns {string}
 */
function playerLabel(id, text) {
  if (PLAYER_LABELS[id]) return PLAYER_LABELS[id];
  if (text !== '') return text;
  return id;
}
