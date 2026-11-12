/**
 * Leitor da família `baixarapido` (`baixarapido.com`).
 *
 * A busca combina candidatos diretos (`/baixar/<slug>/` e, em série, `/baixar/<slug>-<n>a-temporada/`
 * e `/baixar/<slug>-<n>-temporada/`) com a busca `/pesquisa/<slug>/`.
 * Os cartões da busca são `a` envolvendo `article.movie-card`. O estado vazio explícito exibe
 * "0 Títulos" / "Página 1 de 0". Os magnets ficam em `#download-zone`.
 */

import {
  classifyMagnetOption,
  resolveTorrentOptions,
  seasonNumbers,
} from '../_blocks/torrent-release/index.mjs';
import {
  collapse,
  fetchCatalogPage,
  loadHtml,
  readImdbIds,
  readYear,
  resolvePathOnOrigin,
  searchSlugs,
  selectConfirmedPages,
  titleRelated,
} from './common.js';

/**
 * Coleta e resolve os streams do catálogo Baixa Rápido.
 * @param {object} catalog - Configuração do catálogo.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Streams do catálogo.
 */
export async function collectBaixaRapido(catalog, media, request) {
  const pages = await locatePages(catalog, media, request);
  if (!pages.length) {
    console.log(`[${catalog.logPrefix}] Nenhum resultado corresponde a "${media.title}"`);
    return [];
  }
  const options = pages.flatMap((page) => optionsFromPage(page, media, request));
  if (!options.length) {
    console.log(`[${catalog.logPrefix}] Nenhum magnet nas páginas confirmadas`);
    return [];
  }
  return resolveTorrentOptions(options, {
    logPrefix: catalog.logPrefix,
    streamLabel: catalog.streamLabel,
    provider: catalog.provider,
    formatter: catalog.formatter,
  });
}

/**
 * @param {object} catalog
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {Promise<object[]>}
 */
async function locatePages(catalog, media, request) {
  let pinnedOrigin = null;
  const seen = new Set();
  const candidates = [];

  for (const slug of searchSlugs(media)) {
    const searchPath = `/pesquisa/${slug}/`;
    const searchRes = await fetchCatalogPage(catalog, searchPath, {
      pinnedOrigin,
      allow404: true,
      validate: (html) => {
        const parsed = parseSearch(html);
        if (parsed.unrecognized) {
          const err = new Error('layout de busca não reconhecido');
          err.retryable = true;
          throw err;
        }
      },
    });
    pinnedOrigin = searchRes.origin;

    for (const directPath of directPathsForSlug(slug, request)) {
      if (seen.has(directPath)) continue;
      seen.add(directPath);
      const detail = await fetchCatalogPage(catalog, directPath, { pinnedOrigin, allow404: true });
      if (detail.status === 404 || isNotFoundUrl(detail.url)) continue;
      const page = parseContent(detail.text, detail.url);
      if (page && matchesPageMediaType(page, request)) candidates.push(page);
    }

    if (searchRes.status !== 404) {
      const parsed = parseSearch(searchRes.text);
      console.log(`[${catalog.logPrefix}] Busca "${slug}" em ${new URL(pinnedOrigin).host}: ${parsed.cards.length} cartão(ões)`);
      const filteredCards = parsed.cards.filter((card) => prefilterCard(card, media, request));
      for (const card of filteredCards) {
        const detailPath = resolvePathOnOrigin(card.href, pinnedOrigin);
        if (seen.has(detailPath)) continue;
        seen.add(detailPath);
        const detail = await fetchCatalogPage(catalog, detailPath, { pinnedOrigin, allow404: true });
        if (detail.status === 404 || isNotFoundUrl(detail.url)) continue;
        const page = parseContent(detail.text, detail.url);
        if (page && matchesPageMediaType(page, request)) candidates.push(page);
      }
    }

    const confirmed = selectConfirmedPages(candidates, media, request, catalog.logPrefix);
    if (confirmed.length) return confirmed;
  }
  return [];
}

/**
 * @param {string} slug
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request
 * @returns {string[]}
 */
function directPathsForSlug(slug, request) {
  if (request.mediaType === 'tv') {
    return [
      `/baixar/${slug}-${request.season}a-temporada/`,
      `/baixar/${slug}-${request.season}-temporada/`,
      `/baixar/${slug}/`,
    ];
  }
  return [`/baixar/${slug}/`];
}

/**
 * @param {string} url
 * @returns {boolean}
 */
function isNotFoundUrl(url) {
  return /erro-404-pagina-nao-encontrada/i.test(String(url || ''));
}

/**
 * @param {string} html
 * @returns {{ unrecognized?: boolean, cards: object[], empty: boolean }}
 */
export function parseSearch(html) {
  const $ = loadHtml(html);
  const cards = [];
  const links = $('a');
  for (let i = 0; i < links.length; i += 1) {
    const link = links.eq(i);
    const card = link.find('article.movie-card');
    if (!card.length) continue;
    const href = link.attr('href');
    if (!href) throw new Error('cartão de busca sem endereço');
    const title = collapse(card.find('.movie-title').text() || link.attr('title'));
    if (!title) throw new Error('cartão de busca sem título');
    const year = readYear(card.find('.badge-year').text()) || readYear(title);
    const imgAlt = collapse(card.find('img').attr('alt'));
    const itemtype = collapse(card.attr('itemtype'));
    let tipo = '';
    if (/TVSeries/i.test(itemtype) || /\bs[eé]ries?\b/i.test(imgAlt)) tipo = 'Séries';
    else if (/Movie/i.test(itemtype) || /\bfilmes?\b/i.test(imgAlt)) tipo = 'Filmes';
    cards.push({ href, title, year, tipo });
  }
  if (cards.length) return { cards, empty: false };
  const body = `${collapse($('h1').text())} ${collapse($('main').text())}`;
  if (/\b0\s+t[ií]tulos\b/i.test(body) || /p[aá]gina\s+1\s+de\s+0\b/i.test(body)) {
    return { cards: [], empty: true };
  }
  return { unrecognized: true, cards: [], empty: false };
}

/**
 * @param {object} card
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request
 * @returns {boolean}
 */
function prefilterCard(card, media, request) {
  if (request.mediaType === 'movie' && card.tipo === 'Séries') return false;
  if (request.mediaType === 'tv' && card.tipo === 'Filmes') return false;
  let seasons;
  try {
    seasons = seasonNumbers(card.title);
  } catch {
    return false;
  }
  if (request.mediaType === 'tv') {
    if (seasons.length && !seasons.includes(request.season)) return false;
  } else if (seasons.length) {
    return false;
  }
  if (request.mediaType === 'movie' && card.year !== null && media.year !== null && Math.abs(card.year - media.year) > 1) {
    return false;
  }
  return titleRelated(card.title, media);
}

/**
 * @param {string} html
 * @param {string} url
 * @returns {object|null}
 */
function parseContent(html, url) {
  const $ = loadHtml(html);
  const zone = $('#download-zone');
  if (!zone.length) return null;
  const rawTitle = collapse($('h1').text());
  if (!rawTitle) throw new Error(`página sem título em ${url}`);
  const anchors = [];
  const links = zone.find('a');
  for (let i = 0; i < links.length; i += 1) {
    const link = links.eq(i);
    const href = link.attr('href') || '';
    const label = collapse(link.text() || link.attr('title'));
    anchors.push({ href, label });
  }
  if (!anchors.some((a) => /^magnet:\?/i.test(a.href))) return null;
  const isTvSchema = /"@type"\s*:\s*"TVSeries"/i.test(html) || /itemtype="https?:\/\/schema\.org\/TVSeries"/i.test(html);
  const isMovieSchema = /"@type"\s*:\s*"Movie"/i.test(html) || /itemtype="https?:\/\/schema\.org\/Movie"/i.test(html);
  return {
    url,
    rawTitle,
    year: readYear(rawTitle),
    imdbIds: readImdbIds(html),
    isTvSchema,
    isMovieSchema,
    anchors,
  };
}

/**
 * @param {object} page
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request
 * @returns {boolean}
 */
function matchesPageMediaType(page, request) {
  const hasSeasonOrEp = /temporada|epis[oó]dio/i.test(
    `${page.rawTitle} ${page.anchors.map((a) => a.label).join(' ')}`,
  );
  if (request.mediaType === 'movie') {
    if (page.isTvSchema && !page.isMovieSchema) return false;
    let seasons;
    try {
      seasons = seasonNumbers(page.rawTitle);
    } catch {
      return false;
    }
    return seasons.length === 0;
  }
  if (page.isMovieSchema && !page.isTvSchema && !hasSeasonOrEp) return false;
  let seasons;
  try {
    seasons = seasonNumbers(page.rawTitle);
  } catch {
    return false;
  }
  if (seasons.length && !seasons.includes(request.season)) return false;
  return true;
}

/**
 * @param {object} page
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {object[]}
 */
function optionsFromPage(page, media, request) {
  return page.anchors
    .filter((anchor) => /^magnet:\?xt=urn:btih:/i.test(anchor.href) && !/\blegendas\b/i.test(anchor.label))
    .map((anchor) => classifyMagnetOption({
      href: anchor.href,
      labelText: anchor.label,
      contextText: page.rawTitle,
      addFallbackTrackers: true,
      allowSeriesPackWithoutSeason: true,
    }, media, request));
}
