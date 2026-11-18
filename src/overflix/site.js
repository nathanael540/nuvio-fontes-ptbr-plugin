/**
 * Cliente VideoBox do OverFlix: busca, confirmação por TMDB, episódios e `playerData`.
 *
 * Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)
 *
 * As requisições AJAX usam o perfil `api`, com `Referer` da página correspondente, e seguem um
 * único `{ redirect: "https://..." }` por requisição, adotando o host de destino. A confirmação de
 * identidade é feita por `data-tmdb-id`; o host muda com frequência e não há allowlist fixa.
 */

import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { extractDataAttribute } from '../_blocks/script-extract/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';

/**
 * Bases padrão das hospedagens anunciadas pelo VideoBox do OverFlix.
 * Cada item de `playerData.players` com o mesmo rótulo normalizado substitui a URL.
 * @type {ReadonlyArray<{ key: string, name: string, url: string }>}
 */
export const DEFAULT_PLAYER_BASES = Object.freeze([
  Object.freeze({ key: 'mixdrop', name: 'MixDrop', url: 'https://mixdrop.top/e/' }),
  Object.freeze({ key: 'streamtape', name: 'Streamtape', url: 'https://streamtape.com/e/' }),
  Object.freeze({ key: 'doodstream', name: 'DoodStream', url: 'https://playmogo.com/e/' }),
  Object.freeze({ key: 'byse', name: 'Byse', url: 'https://bysebuho.com/e/' }),
]);

/**
 * Verifica se o valor é um objeto simples (não nulo e não lista).
 * @param {*} value - Valor a verificar.
 * @returns {boolean} True para objeto simples.
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Valida uma URL HTTPS e devolve a forma normalizada.
 * @param {string} value - URL candidata.
 * @param {string} label - Nome do dado na mensagem de erro.
 * @returns {string} URL normalizada.
 * @throws {Error} Se a URL for inválida ou não usar HTTPS.
 */
function readHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} inválido: "${value}"`);
  }
  if (parsed.protocol !== 'https:' || parsed.host === '') {
    throw new Error(`${label} não é HTTPS: "${value}"`);
  }
  return parsed.href;
}

/**
 * Executa uma requisição AJAX do VideoBox e segue um único redirecionamento JSON.
 *
 * @param {string} url - URL da requisição.
 * @param {string} [referer] - Página correspondente enviada no `Referer`.
 * @returns {Promise<{ data: *, url: string }>} Corpo interpretado e URL efetivamente usada.
 * @throws {Error} Em erro de rede/HTTP/JSON, destino inválido, não HTTPS ou cascata.
 */
export async function fetchAjax(url, referer) {
  const headers = referer === undefined ? undefined : { Referer: referer };
  const data = await fetchJson(url, { profile: 'api', headers });

  if (!isPlainObject(data) || typeof data.redirect !== 'string') {
    return { data, url };
  }

  const target = readHttpsUrl(data.redirect, 'Redirecionamento');
  const redirected = await fetchJson(target, { profile: 'api', headers });
  if (isPlainObject(redirected) && typeof redirected.redirect === 'string') {
    throw new Error(`Redirecionamento repetido em cascata em ${target}`);
  }
  return { data: redirected, url: target };
}

/**
 * Consulta `buscarContent` e devolve o HTML dos cartões.
 *
 * @param {string} origin - Origem HTTPS do catálogo.
 * @param {string} term - Termo de busca.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {string} [referer] - Página correspondente enviada no `Referer`.
 * @returns {Promise<{ html: string, origin: string }>} HTML e origem efetiva (após redirect).
 * @throws {Error} Se a resposta não trouxer `html` em texto.
 */
export async function buscarContent(origin, term, mediaType, referer) {
  const params = new URLSearchParams({
    app: 'videobox',
    module: 'video',
    controller: 'index',
    do: 'buscarContent',
    q: term,
    type: mediaType === 'tv' ? 'series' : 'filmes',
    genre: '',
    year: '',
    page: '1',
  });
  const result = await fetchAjax(`${origin}/index.php?${params.toString()}`, referer || `${origin}/`);
  if (!isPlainObject(result.data) || typeof result.data.html !== 'string') {
    throw new Error(`Resposta de busca em ${origin} sem campo html`);
  }
  return { html: result.data.html, origin: new URL(result.url).origin };
}

/**
 * Monta os termos de busca únicos a partir do TMDB.
 * @param {object} media - Dados do TMDB.
 * @returns {string[]} Termos na ordem: título, original e alternativos.
 */
function searchTerms(media) {
  const terms = [];
  for (const term of [media.title, media.originalTitle, ...(media.alternativeTitles || [])]) {
    if (typeof term !== 'string') continue;
    const trimmed = term.trim();
    if (trimmed !== '' && !terms.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      terms.push(trimmed);
    }
  }
  return terms;
}

/**
 * Extrai o primeiro ano de quatro dígitos de um texto.
 * @param {string} text - Texto do cartão.
 * @returns {number|null} Ano ou null quando não houver.
 */
function readYear(text) {
  const match = /\b(\d{4})\b/.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * Busca e confirma a ficha do filme ou da série pelo ID do TMDB.
 *
 * @param {string} origin - Origem HTTPS inicial do catálogo.
 * @param {object} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @returns {Promise<{ pageHtml: string, pageUrl: string, origin: string }|{ ambiguous: true, origin: string }|null>}
 *   Ficha confirmada, ambiguidade ou ausência.
 * @throws {Error} Em falha de requisição, layout ou ficha sem `data-tmdb-id`.
 */
export async function findConfirmedContent(origin, media, mediaType) {
  const { load } = require('cheerio-without-node-native');

  const mediaTitles = [media.title];
  if (media.originalTitle) mediaTitles.push(media.originalTitle);
  if (Array.isArray(media.alternativeTitles)) mediaTitles.push(...media.alternativeTitles);

  const expectedPath = mediaType === 'tv' ? '/series/online/' : '/filmes/online/';
  let currentOrigin = origin;

  for (const term of searchTerms(media)) {
    const search = await buscarContent(currentOrigin, term, mediaType);
    currentOrigin = search.origin;

    if (search.html === '') {
      continue;
    }

    const $ = load(search.html);
    const cards = $('a.block');

    const matchingCards = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards.eq(i);
      const href = card.attr('href') || '';
      if (!href.includes(expectedPath)) {
        continue;
      }

      const title = card.find('h3').text().trim();
      const yearText = card.find('.info p').text().trim() || card.find('p').text().trim();
      const year = readYear(yearText);
      if (media.year !== null && year !== null && year !== media.year) {
        continue;
      }

      const score = Math.max(...mediaTitles.map((item) => titleSimilarity(title, item)));
      if (score >= 0.85) {
        matchingCards.push({ href, score });
      }
    }

    matchingCards.sort((a, b) => b.score - a.score);
    const confirmedPages = [];

    for (const candidate of matchingCards.slice(0, 3)) {
      const page = await fetchPage(new URL(candidate.href, `${currentOrigin}/`).href, { profile: 'page' });
      const pageOrigin = new URL(readHttpsUrl(page.url, 'URL final da ficha')).origin;
      const pageTmdbId = extractDataAttribute(page.text, 'tmdb-id');
      if (pageTmdbId === null) {
        throw new Error(`Ficha sem data-tmdb-id em ${page.url}`);
      }
      if (pageTmdbId === String(media.tmdbId)) {
        confirmedPages.push({ pageHtml: page.text, pageUrl: page.url, origin: pageOrigin });
      }
    }

    if (confirmedPages.length > 1) {
      return { ambiguous: true, origin: currentOrigin };
    }
    if (confirmedPages.length === 1) {
      return confirmedPages[0];
    }
  }

  return null;
}

/**
 * Lê a seção `vbEpisodes` da ficha de série.
 *
 * @param {string} pageHtml - HTML da ficha confirmada.
 * @param {string} pageUrl - URL da ficha, usada em mensagens e como fallback do ID.
 * @returns {{ videoId: string, audio: string, seasons: number[] }} Dados da série.
 * @throws {Error} Se a seção, o ID ou o áudio declarado faltarem.
 */
export function readSeriesInfo(pageHtml, pageUrl) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(pageHtml);

  const section = $('section.vbEpisodes').eq(0);
  if (section.length === 0) {
    throw new Error(`Seção vbEpisodes ausente em ${pageUrl}`);
  }

  const videoId = section.attr('data-video-id') || /-([0-9]+)\/?$/.exec(pageUrl)?.[1];
  if (!videoId) {
    throw new Error(`ID da série não encontrado em ${pageUrl}`);
  }

  const currentAudio = (section.attr('data-current-audio') || '').trim();
  const audioSelect = $('.vbAudioSelect').text();
  const audio = /dublado/i.test(audioSelect) ? 'Dublado' : currentAudio;
  if (audio === '') {
    throw new Error(`Áudio não declarado na ficha da série ${pageUrl}`);
  }

  const seasons = [];
  const seasonNodes = $('section.vbEpisodes [data-season]');
  for (let i = 0; i < seasonNodes.length; i++) {
    const value = Number(seasonNodes.eq(i).attr('data-season'));
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Temporada inválida na ficha da série ${pageUrl}`);
    }
    if (!seasons.includes(value)) {
      seasons.push(value);
    }
  }

  return { videoId, audio, seasons };
}

/**
 * Consulta `episodesList` e seleciona o episódio pelo número inteiro.
 *
 * @param {string} origin - Origem HTTPS do catálogo.
 * @param {string} seriesVideoId - ID da série no VideoBox.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @param {string} audio - Áudio declarado na ficha.
 * @param {string} referer - URL da ficha da série.
 * @returns {Promise<{ videoId: string, episodeUrl: string }|null>} Episódio ou ausência.
 * @throws {Error} Se a resposta não trouxer `episodes` em lista ou o endereço for inválido.
 */
export async function fetchEpisodesList(origin, seriesVideoId, season, episode, audio, referer) {
  const params = new URLSearchParams({
    app: 'videobox',
    module: 'video',
    controller: 'view',
    do: 'episodesList',
    id: seriesVideoId,
    season: String(season),
    audio,
  });
  const result = await fetchAjax(`${origin}/index.php?${params.toString()}`, referer);
  if (!isPlainObject(result.data) || !Array.isArray(result.data.episodes)) {
    throw new Error(`episodesList não retornou lista de episódios em ${origin}`);
  }

  const item = result.data.episodes.find((entry) => parseInt(entry?.number, 10) === episode);
  if (!item) {
    return null;
  }

  let rawUrl = item.url;
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error(`Episódio ${season}x${episode} sem endereço na lista`);
  }
  rawUrl = rawUrl.trim();
  if (rawUrl.startsWith('serie3=')) {
    rawUrl = rawUrl.slice('serie3='.length);
  }

  const episodeUrl = new URL(rawUrl, `${new URL(result.url).origin}/`).href;
  const videoId = /-([0-9]+)\/?$/.exec(episodeUrl)?.[1];
  if (!videoId) {
    throw new Error(`ID do episódio não encontrado em ${episodeUrl}`);
  }
  return { videoId, episodeUrl };
}

/**
 * Lê as bases publicadas em `players`, substituindo as padrão pelo rótulo normalizado.
 *
 * @param {*} players - Valor de `playerData.players`.
 * @returns {Array<{ key: string, name: string, url: string }>} Bases publicadas.
 * @throws {Error} Se `players` não for lista, um item não for objeto ou a URL não for HTTPS.
 */
function readPlayers(players) {
  if (players === undefined || players === null) {
    return [];
  }
  if (!Array.isArray(players)) {
    throw new Error('playerData.players não é lista');
  }

  const bases = [];
  for (let index = 0; index < players.length; index++) {
    const item = players[index];
    if (!isPlainObject(item)) {
      throw new Error(`playerData.players[${index}] não é objeto`);
    }
    const label = typeof item.label === 'string' ? item.label : item.name;
    if (typeof label !== 'string' || label.trim() === '') {
      continue;
    }
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key === '') {
      continue;
    }
    if (typeof item.url !== 'string' || item.url.trim() === '') {
      throw new Error(`playerData.players[${index}] sem URL`);
    }
    bases.push({ key, name: label.trim(), url: readHttpsUrl(item.url.trim(), `URL de ${label.trim()}`) });
  }
  return bases;
}

/**
 * Lê os pares `host=fileId` de `servers_dub`/`servers_leg`.
 *
 * @param {*} value - Valor do campo.
 * @param {string} language - Idioma do campo.
 * @param {Map<string, { name: string, url: string }>} playerMap - Bases por rótulo normalizado.
 * @returns {Array<{ hostKey: string, hostName: string, embedUrl: string, language: string }>} Opções.
 * @throws {Error} Se o campo tiver tipo diferente de texto.
 */
function readServers(value, language, playerMap) {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  if (typeof value !== 'string') {
    throw new Error(`playerData.servers_${language === 'Dublado' ? 'dub' : 'leg'} fora do contrato`);
  }

  const options = [];
  for (const pair of value.replaceAll('&amp;', '&').split('&')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileId = pair.slice(separator + 1);
    if (key === '' || fileId === '') continue;

    const player = playerMap.get(key);
    if (!player) continue;
    const embedUrl = player.url.endsWith('/') ? `${player.url}${fileId}` : `${player.url}/${fileId}`;
    options.push({ hostKey: key, hostName: player.name, embedUrl, language });
  }
  return options;
}

/**
 * Consulta `playerData` e monta as opções de servidor com o idioma do campo.
 *
 * @param {string} origin - Origem HTTPS do catálogo.
 * @param {string} videoId - ID do vídeo no VideoBox.
 * @param {string} referer - URL da ficha do filme ou do episódio.
 * @returns {Promise<Array<{ hostKey: string, hostName: string, embedUrl: string, language: string }>>} Opções anunciadas.
 * @throws {Error} Se `playerData` não for objeto ou algum campo estiver fora do contrato.
 */
export async function fetchPlayerOptions(origin, videoId, referer) {
  const params = new URLSearchParams({
    app: 'videobox',
    module: 'video',
    controller: 'view',
    do: 'playerData',
    id: videoId,
  });
  const result = await fetchAjax(`${origin}/index.php?${params.toString()}`, referer);

  if (!isPlainObject(result.data)) {
    throw new Error(`playerData não é objeto para ID ${videoId}`);
  }

  const playerMap = new Map(DEFAULT_PLAYER_BASES.map((base) => [base.key, { name: base.name, url: base.url }]));
  for (const base of readPlayers(result.data.players)) {
    playerMap.set(base.key, { name: base.name, url: base.url });
  }

  return [
    ...readServers(result.data.servers_dub, 'Dublado', playerMap),
    ...readServers(result.data.servers_leg, 'Legendado', playerMap),
  ];
}
