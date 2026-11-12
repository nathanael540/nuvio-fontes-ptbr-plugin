/**
 * Operações no site Pobreflix HD (Invision Community com VideoBox).
 *
 * Implementa busca, confirmação de identidade por TMDB, listagem de episódios e leitura de playerData.
 */

import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { extractDataAttribute } from '../_blocks/script-extract/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';

/**
 * Bases de domínio oficiais do Pobreflix HD. O redirect aceita `base.tld` e `www.base.tld` com TLD
 * alfabético de um rótulo; uma nova base exige alteração desta lista e teste.
 * @type {ReadonlyArray<string>}
 */
export const ALLOWED_DOMAIN_BASES = Object.freeze(['pobreflixtv', 'flixtv', 'thepobretvflix']);

/**
 * Lista ordenada de domínios-semente do Pobreflix HD (principal e 14 aliases).
 * @type {ReadonlyArray<string>}
 */
export const DOMAINS = Object.freeze([
  'https://www.pobreflixtv.golf',
  'https://www.pobreflixtv.sarl',
  'https://www.pobreflixtv.food',
  'https://www.pobreflixtv.autos',
  'https://www.pobreflixtv.gift',
  'https://www.pobreflixtv.moe',
  'https://www.pobreflixtv.website',
  'https://www.pobreflixtv.top',
  'https://www.pobreflixtv.club',
  'https://www.pobreflixtv.link',
  'https://www.pobreflixtv.cloud',
  'https://www.pobreflixtv.wtf',
  'https://www.pobreflixtv.cfd',
  'https://www.pobreflixtv.cyou',
  'https://www.pobreflixtv.bond',
]);

/**
 * Verifica se a URL usa HTTPS e pertence a uma base de domínio permitida.
 *
 * Aceita somente host `base.tld` ou `www.base.tld`, com `base` em ALLOWED_DOMAIN_BASES e `tld`
 * alfabético com dois ou mais caracteres. Subdomínios arbitrários, lookalikes e HTTP são rejeitados.
 *
 * @param {string} url - URL para checar.
 * @returns {boolean} True se a URL puder ser seguida.
 */
export function isAllowedDomain(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;

  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith('www.')) hostname = hostname.slice(4);

  const labels = hostname.split('.');
  if (labels.length !== 2) return false;
  const [base, tld] = labels;
  return ALLOWED_DOMAIN_BASES.includes(base) && /^[a-z]{2,}$/.test(tld);
}

/**
 * Executa requisição AJAX e trata redirecionamento por corpo JSON {"redirect": "..."}.
 *
 * Segue um único redirect HTTPS dentro das bases permitidas; se o destino responder com outro
 * redirect, a cascata é rejeitada.
 *
 * @param {string} url - URL da requisição.
 * @returns {Promise<*>} Resposta JSON interpretada.
 * @throws {Error} Se houver erro de rede, HTTP fora de 2xx, JSON inválido, redirecionamento fora
 *   das bases permitidas ou redirecionamento em cascata.
 */
export async function fetchAjax(url) {
  const data = await fetchJson(url, { profile: 'api' });

  if (typeof data === 'object' && data !== null && typeof data.redirect === 'string') {
    if (!isAllowedDomain(data.redirect)) {
      throw new Error(`Redirecionamento para fora das bases permitidas: ${data.redirect}`);
    }
    const redirected = await fetchJson(data.redirect, { profile: 'api' });
    if (typeof redirected === 'object' && redirected !== null && typeof redirected.redirect === 'string') {
      throw new Error(`Redirecionamento repetido em cascata em ${data.redirect}`);
    }
    return redirected;
  }

  return data;
}

/**
 * Busca e confirma página de filme ou série no domínio.
 *
 * @param {string} domain - Domínio base.
 * @param {object} media - Dados do TMDB (title, originalTitle, alternativeTitles, year, tmdbId).
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @returns {Promise<{ candidate: object, pageHtml: string, pageUrl: string }|{ ambiguous: true }|null>}
 */
export async function findConfirmedContent(domain, media, mediaType) {
  const { load } = require('cheerio-without-node-native');

  const searchTerms = [];
  for (const term of [media.title, media.originalTitle, ...(media.alternativeTitles || [])]) {
    if (typeof term === 'string') {
      const trimmed = term.trim();
      if (trimmed && !searchTerms.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
        searchTerms.push(trimmed);
      }
    }
  }

  const mediaTitles = [media.title];
  if (media.originalTitle) mediaTitles.push(media.originalTitle);
  if (Array.isArray(media.alternativeTitles)) mediaTitles.push(...media.alternativeTitles);

  const typeParam = mediaType === 'tv' ? 'series' : 'filmes';
  const expectedPath = mediaType === 'tv' ? '/series/online/' : '/filmes/online/';

  for (const term of searchTerms) {
    const params = new URLSearchParams({
      app: 'videobox',
      module: 'video',
      controller: 'index',
      do: 'buscarContent',
      q: term,
      type: typeParam,
      genre: '',
      year: '',
      page: '1',
    });
    const searchUrl = `${domain}/index.php?${params.toString()}`;
    const res = await fetchAjax(searchUrl);

    if (typeof res?.html !== 'string') {
      throw new Error(`Resposta de busca em ${domain} sem campo html`);
    }

    if (res.html === '') {
      // 0 resultados para este termo
      continue;
    }

    const $ = load(res.html);
    const cards = $('a.block');

    if (cards.length === 0) {
      throw new Error(`Estrutura inesperada na busca de ${domain}`);
    }

    const matchingCards = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards.eq(i);
      const href = card.attr('href') || '';
      if (!href.includes(expectedPath)) {
        continue;
      }

      const title = card.find('h3').text().trim();
      const yearText = card.find('.info p').text().trim() || card.find('p').text().trim();
      const yearMatch = /^\d{4}$/.exec(yearText);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
      const topText = card.find('.top').text();
      const hasHd = /HD/i.test(topText);

      if (media.year !== null && year !== null && year !== media.year) {
        // yearTolerance: 0 quando o ano é conhecido
        continue;
      }

      const score = Math.max(...mediaTitles.map((t) => titleSimilarity(title, t)));
      if (score >= 0.85) {
        matchingCards.push({ href, title, year, hasHd, score });
      }
    }

    matchingCards.sort((a, b) => b.score - a.score);

    const candidatesToProbe = matchingCards.slice(0, 3);
    const confirmedPages = [];

    for (const candidate of candidatesToProbe) {
      const page = await fetchPage(candidate.href, { profile: 'page' });
      if (!isAllowedDomain(page.url)) {
        throw new Error(`Redirecionamento para fora das bases permitidas: ${page.url}`);
      }

      const pageTmdbId = extractDataAttribute(page.text, 'tmdb-id');
      if (pageTmdbId === String(media.tmdbId)) {
        confirmedPages.push({ candidate, pageHtml: page.text, pageUrl: page.url });
      }
    }

    if (confirmedPages.length > 1) {
      // Ambiguidade: mais de uma página confirma o mesmo TMDB
      return { ambiguous: true };
    }

    if (confirmedPages.length === 1) {
      return confirmedPages[0];
    }
  }

  // Título não encontrado
  return null;
}

/**
 * Seleciona o episódio exato para série, consultando o host final do conteúdo.
 *
 * @param {string} contentOrigin - Origem da página do conteúdo, já no host final permitido.
 * @param {object} seriesContent - Resultado de findConfirmedContent para série.
 * @param {number} targetSeason - Temporada (1-based).
 * @param {number} targetEpisode - Episódio (1-based).
 * @param {object} media - Dados do TMDB.
 * @returns {Promise<{ videoId: string, pageUrl: string, pageHtml: string, hasHd: boolean }|null>}
 */
export async function resolveSeriesEpisode(contentOrigin, seriesContent, targetSeason, targetEpisode, media) {
  const seriesVideoId =
    extractDataAttribute(seriesContent.pageHtml, 'video-id') ||
    /-([0-9]+)\/?$/.exec(seriesContent.pageUrl)?.[1];

  if (!seriesVideoId) {
    throw new Error(`ID da série não encontrado em ${seriesContent.pageUrl}`);
  }

  // 1. Tenta Dublado
  const dubParams = new URLSearchParams({
    app: 'videobox',
    module: 'video',
    controller: 'view',
    do: 'episodesList',
    id: seriesVideoId,
    season: String(targetSeason),
    audio: 'Dublado',
  });
  const dubRes = await fetchAjax(`${contentOrigin}/index.php?${dubParams.toString()}`);
  if (!Array.isArray(dubRes?.episodes)) {
    throw new Error(`episodesList não retornou array de episódios em ${contentOrigin}`);
  }

  let episodeItem = dubRes.episodes.find((ep) => parseInt(ep.number, 10) === targetEpisode);

  // 2. Se ausente no Dublado, tenta Legendado
  if (!episodeItem) {
    const legParams = new URLSearchParams({
      app: 'videobox',
      module: 'video',
      controller: 'view',
      do: 'episodesList',
      id: seriesVideoId,
      season: String(targetSeason),
      audio: 'Legendado',
    });
    const legRes = await fetchAjax(`${contentOrigin}/index.php?${legParams.toString()}`);
    if (!Array.isArray(legRes?.episodes)) {
      throw new Error(`episodesList legendado não retornou array de episódios em ${contentOrigin}`);
    }
    episodeItem = legRes.episodes.find((ep) => parseInt(ep.number, 10) === targetEpisode);
  }

  if (!episodeItem) {
    // Episódio ausente nas duas listagens
    return null;
  }

  const epPage = await fetchPage(episodeItem.url, { profile: 'page' });
  if (!isAllowedDomain(epPage.url)) {
    throw new Error(`Redirecionamento para fora das bases permitidas: ${epPage.url}`);
  }

  const epTmdb = extractDataAttribute(epPage.text, 'tmdb-id');
  const epTemp = extractDataAttribute(epPage.text, 'temp');
  const epNum = extractDataAttribute(epPage.text, 'ep');

  if (epTmdb !== String(media.tmdbId)) {
    throw new Error(`Página do episódio com TMDB divergente: esperado ${media.tmdbId}, obtido ${epTmdb}`);
  }
  if (parseInt(epTemp, 10) !== targetSeason) {
    throw new Error(`Página do episódio com temporada divergente: esperada ${targetSeason}, obtida ${epTemp}`);
  }
  if (parseInt(epNum, 10) !== targetEpisode) {
    throw new Error(`Página do episódio com episódio divergente: esperado ${targetEpisode}, obtido ${epNum}`);
  }

  const episodeVideoId =
    extractDataAttribute(epPage.text, 'video-id') ||
    /-([0-9]+)\/?$/.exec(epPage.url)?.[1];

  if (!episodeVideoId) {
    throw new Error(`ID do episódio não encontrado em ${epPage.url}`);
  }

  return {
    videoId: episodeVideoId,
    pageUrl: epPage.url,
    pageHtml: epPage.text,
    hasHd: seriesContent.candidate.hasHd,
  };
}

/**
 * Consulta playerData e extrai as opções de servidores.
 *
 * @param {string} contentOrigin - Origem final do conteúdo/episódio, já no host permitido.
 * @param {string} videoId - ID do vídeo no VideoBox.
 * @returns {Promise<Array<{ hostKey: string, hostName: string, embedUrl: string, language: string }>>}
 */
export async function fetchPlayerOptions(contentOrigin, videoId) {
  const params = new URLSearchParams({
    app: 'videobox',
    module: 'video',
    controller: 'view',
    do: 'playerData',
    id: videoId,
  });
  const url = `${contentOrigin}/index.php?${params.toString()}`;
  const data = await fetchAjax(url);

  if (typeof data === 'string' && data.includes('Conteúdo bloqueado')) {
    throw new Error(`Conteúdo bloqueado em playerData para ID ${videoId}`);
  }

  if (!Array.isArray(data?.players)) {
    throw new Error(`playerData sem array players para ID ${videoId}`);
  }

  const playerMap = new Map();
  for (const p of data.players) {
    const rawLabel = p.label || p.name || '';
    const key = rawLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key && p.url) {
      playerMap.set(key, { name: p.name || p.label || key, url: p.url });
    }
  }

  function parseServers(serversString, language) {
    if (!serversString || typeof serversString !== 'string') return [];
    const clean = serversString.replaceAll('&amp;', '&');
    const searchParams = new URLSearchParams(clean);
    const options = [];
    // O URLSearchParams dos apps não é iterável; entries() devolve array nos apps e iterador no Node.
    for (const [key, identifier] of searchParams.entries()) {
      if (!identifier) continue;
      const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const player = playerMap.get(normKey);
      if (!player) {
        continue;
      }
      const baseUrl = player.url;
      const embedUrl = baseUrl.endsWith('/') ? `${baseUrl}${identifier}` : `${baseUrl}/${identifier}`;
      options.push({
        hostKey: normKey,
        hostName: player.name,
        embedUrl,
        language,
      });
    }
    return options;
  }

  const dubOptions = parseServers(data.servers_dub, 'Dublado');
  const legOptions = parseServers(data.servers_leg, 'Legendado');

  return [...dubOptions, ...legOptions];
}
