/**
 * Leitor da família `gratistorrent` (`gratistorrent.com`).
 *
 * A busca é `GET /index.php?busca=<termo>`. O estado vazio explícito traz o heading
 * "Resultados da Busca" com "(0 Itens)". Os cartões são `a > article.custom-card`.
 * Na página de título, os magnets ficam em `.download-section a` e o tamanho geral em `Tamanho`.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import {
  classifyMagnetOption,
  resolveTorrentOptions,
  seasonNumbers,
  splitSizes,
} from '../_blocks/torrent-release/index.mjs';
import {
  collapse,
  fetchCatalogPage,
  loadHtml,
  readImdbIds,
  readYear,
  resolvePathOnOrigin,
  searchTerms,
  selectConfirmedPages,
  titleRelated,
} from './common.js';

/**
 * Coleta e resolve os streams do catálogo Grátis Torrent.
 * @param {object} catalog - Configuração do catálogo.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Streams do catálogo.
 */
export async function collectGratisTorrent(catalog, media, request) {
  const pages = await locatePages(catalog, media, request);
  if (!pages.length) {
    console.log(`[${catalog.logPrefix}] Nenhum post corresponde a "${media.title}"`);
    return [];
  }
  const options = pages.flatMap((page) => optionsFromPage(page, media, request));
  if (!options.length) {
    console.log(`[${catalog.logPrefix}] Nenhum magnet nos posts ${pages.map((page) => page.url).join(', ')}`);
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
  for (const term of searchTerms(media)) {
    const path = `/index.php?${new URLSearchParams({ busca: term })}`;
    const response = await fetchCatalogPage(catalog, path, {
      pinnedOrigin,
      validate: (html) => {
        const parsed = parseSearch(html);
        if (parsed.unrecognized) {
          const err = new Error('layout de busca não reconhecido');
          err.retryable = true;
          throw err;
        }
      },
    });
    pinnedOrigin = response.origin;
    const parsed = parseSearch(response.text);
    console.log(`[${catalog.logPrefix}] Busca "${term}" em ${new URL(pinnedOrigin).host}: ${parsed.cards.length} cartão(ões)`);
    if (parsed.empty) continue;
    const cards = parsed.cards.filter((card) => prefilterCard(card, media, request));
    const pages = [];
    for (const card of cards) {
      const detailPath = resolvePathOnOrigin(card.href, pinnedOrigin);
      if (seen.has(detailPath)) continue;
      seen.add(detailPath);
      const detail = await fetchCatalogPage(catalog, detailPath, { pinnedOrigin, allow404: true });
      if (detail.status === 404) continue;
      pages.push(parseContent(detail.text, detail.url));
    }
    const selected = selectConfirmedPages(pages, media, request, catalog.logPrefix);
    if (selected.length) return selected;
  }
  return [];
}

/**
 * @param {string} html
 * @returns {{ unrecognized?: boolean, cards: object[], empty: boolean }}
 */
export function parseSearch(html) {
  const $ = loadHtml(html);
  const heading = collapse($('h1').text());
  const cards = [];
  const links = $('a');
  for (let index = 0; index < links.length; index += 1) {
    const link = links.eq(index);
    const card = link.find('article.custom-card');
    if (!card.length) continue;
    const title = collapse(card.attr('data-title') || card.find('.card-title-text').text());
    if (!title) throw new Error('cartão de busca sem título');
    const href = link.attr('href');
    if (!href) throw new Error('cartão de busca sem endereço');
    cards.push({
      href,
      title,
      tipo: collapse(card.attr('data-tipo')),
      year: readYear(card.find('.badge-year').text()) || readYear(title),
    });
  }
  if (cards.length) return { cards, empty: false };
  const bodyText = `${heading} ${collapse($('main').text())}`;
  const explicitEmpty = (
    (/resultados da busca/i.test(heading) && /\(\s*0\s+itens\s*\)/i.test(bodyText)) ||
    (/encontrados para/i.test(heading) && /nada foi localizado com os crit[eé]rios informados/i.test(bodyText))
  );
  if (explicitEmpty) return { cards: [], empty: true };
  return { unrecognized: true, cards: [], empty: false };
}

/**
 * @param {object} card
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request
 * @returns {boolean}
 */
export function prefilterCard(card, media, request) {
  const tipo = normalizeText(card.tipo || '');
  if (request.mediaType === 'movie' && tipo && !/\bfilmes?\b/.test(tipo)) return false;
  if (request.mediaType === 'tv' && tipo && !/\bseries?\b/.test(tipo)) return false;
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
 * @returns {object}
 */
function parseContent(html, url) {
  const $ = loadHtml(html);
  if (!$('.download-section').length) throw new Error(`página sem seção de download em ${url}`);
  const rawTitle = collapse($('h1.movie-title').text() || $('h1').text());
  if (!rawTitle) throw new Error(`página sem título em ${url}`);
  const anchors = readAnchors($);
  if (!anchors.some((anchor) => /^magnet:/i.test(anchor.href)) && /magnet:\?/i.test(html)) {
    throw new Error(`magnets da página não puderam ser lidos em ${url}`);
  }
  return {
    url,
    rawTitle,
    year: readYear(rawTitle),
    imdbIds: readImdbIds(html),
    sizeField: readSizeField(html),
    anchors,
  };
}

/**
 * @param {object} page
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {object[]}
 */
function optionsFromPage(page, media, request) {
  const magnets = page.anchors.filter((anchor) => /^magnet:\?xt=urn:btih:/i.test(anchor.href) && !/\blegendas\b/i.test(anchor.label));
  const sizes = splitSizes(page.sizeField);
  return magnets.map((anchor, magnetIndex) => {
    const fallbackSize = sizes.length === magnets.length ? sizes[magnetIndex] : null;
    return classifyMagnetOption({
      href: anchor.href,
      labelText: anchor.label,
      contextText: page.rawTitle,
      size: fallbackSize,
      addFallbackTrackers: true,
      allowSeriesPackWithoutSeason: true,
    }, media, request);
  });
}

/**
 * @param {*} $
 * @returns {{ href: string, label: string }[]}
 */
function readAnchors($) {
  const links = $('.download-section a');
  const found = [];
  for (let index = 0; index < links.length; index += 1) {
    const link = links.eq(index);
    found.push({
      href: link.attr('href') || '',
      label: collapse(link.text()),
    });
  }
  return found;
}

/**
 * @param {string} html
 * @returns {string|null}
 */
function readSizeField(html) {
  const match = /<small>\s*Tamanho\s*<\/small>\s*<strong>\s*([^<]+)<\/strong>/i.exec(html);
  return match ? collapse(match[1]) : null;
}
