/**
 * Leitor da família `parabaixar` (`parabaixar.com`).
 *
 * A busca é `GET /index.php?s=<termo>`. Os cartões são `.capaname` com link
 * `/(filme|serie|desenho)/<slug>/` e `h2` com título e `(ANO)`. O vazio traz
 * "Nenhum resultado encontrado.". Na página de título, os downloads ficam em `#lista_links`
 * com o rótulo em `strong` ou `title` da âncora.
 */

import {
  classifyMagnetOption,
  humanSize,
  isCollectionTitle,
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
  searchTerms,
  selectConfirmedPages,
  titleRelated,
} from './common.js';

/**
 * Coleta e resolve os streams do catálogo Para Baixar.
 * @param {object} catalog - Configuração do catálogo.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Streams do catálogo.
 */
export async function collectParaBaixar(catalog, media, request) {
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
  for (const term of searchTerms(media)) {
    const path = `/index.php?${new URLSearchParams({ s: term })}`;
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
      if (detail.status === 404 || /erro-404-pagina-nao-encontrada/i.test(detail.url)) continue;
      const page = parseContent(detail.text, detail.url);
      if (page) pages.push(page);
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
  const items = $('.capaname');
  const cards = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items.eq(i);
    const link = item.find('h2 a');
    const href = link.attr('href') || item.find('a').attr('href');
    if (!href) throw new Error('cartão de busca sem endereço');
    const title = collapse(item.find('h2').text() || link.attr('title'));
    if (!title) throw new Error('cartão de busca sem título');
    const tipo = /\/filme\//i.test(href) ? 'Filmes' : (/\/serie\//i.test(href) ? 'Séries' : 'Desenhos');
    cards.push({
      href,
      title,
      tipo,
      year: readYear(title),
    });
  }
  if (cards.length) return { cards, empty: false };
  if (/nenhum resultado encontrado/i.test(html)) return { cards: [], empty: true };
  return { unrecognized: true, cards: [], empty: false };
}

/**
 * @param {object} card
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request
 * @returns {boolean}
 */
function prefilterCard(card, media, request) {
  if (request.mediaType === 'movie' && card.tipo !== 'Filmes') return false;
  if (request.mediaType === 'tv' && card.tipo !== 'Séries') return false;
  if (request.mediaType === 'movie' && isCollectionTitle(card.title)) return false;
  let seasons;
  try {
    seasons = seasonNumbers(card.title);
  } catch {
    return false;
  }
  if (request.mediaType === 'tv') {
    if (seasons.length !== 1 || seasons[0] !== request.season) return false;
  } else if (seasons.length > 0) {
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
  const container = $('#lista_links');
  if (!container.length) return null;
  const rawTitle = collapse($('h1').text());
  if (!rawTitle || /erro 404/i.test(rawTitle)) return null;
  const anchors = [];
  const paragraphs = container.find('p');
  let currentSection = '';
  for (let i = 0; i < paragraphs.length; i += 1) {
    const p = paragraphs.eq(i);
    const id = p.attr('id') || '';
    if (/versao/i.test(id)) {
      currentSection = collapse(p.text());
      continue;
    }
    const strongText = collapse(p.find('strong').text());
    const links = p.find('a');
    for (let j = 0; j < links.length; j += 1) {
      const link = links.eq(j);
      const href = link.attr('href') || '';
      if (!/^magnet:\?/i.test(href)) continue;
      const titleAttr = collapse(link.attr('title'));
      const label = collapse(`${strongText} ${titleAttr} ${currentSection}`);
      anchors.push({ href, label });
    }
  }
  if (!anchors.length) {
    const allLinks = container.find('a');
    for (let i = 0; i < allLinks.length; i += 1) {
      const link = allLinks.eq(i);
      const href = link.attr('href') || '';
      if (!/^magnet:\?/i.test(href)) continue;
      anchors.push({ href, label: collapse(link.attr('title') || link.text()) });
    }
  }
  if (!anchors.length) return null;
  return {
    url,
    rawTitle,
    year: readYear(rawTitle) || readYear($('.infos').text()),
    imdbIds: readImdbIds(html),
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
  return page.anchors
    .filter((anchor) => !/\blegendas\b/i.test(anchor.label))
    .map((anchor) => classifyMagnetOption({
      href: anchor.href,
      labelText: anchor.label,
      contextText: page.rawTitle,
      size: humanSize(anchor.label),
      addFallbackTrackers: true,
    }, media, request));
}
