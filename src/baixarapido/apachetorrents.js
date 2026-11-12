/**
 * Leitor da família `apachetorrents` (`apachetorrents.com`).
 *
 * A busca é `/pesquisa/<slug>/` com cartões `.capa-item` (`h2.capa-titulo a` ou `h2.title a`
 * trazendo `(Filme de YYYY)` ou `(Série de YYYY)`). O vazio traz `h1` com
 * `Torrents Encontrados para` e zero `.capa-item`.
 * Na página de título (`/<slug>-baixar-torrent/`), os downloads ficam em `.download-block`
 * com `.download-desc` e `a.btn-magnet`.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
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
  searchSlugs,
  selectConfirmedPages,
  titleRelated,
} from './common.js';

/**
 * Coleta e resolve os streams do catálogo Apache Torrents.
 * @param {object} catalog - Configuração do catálogo.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Streams do catálogo.
 */
export async function collectApacheTorrents(catalog, media, request) {
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
  for (const slug of searchSlugs(media)) {
    const path = `/pesquisa/${slug}/`;
    const response = await fetchCatalogPage(catalog, path, {
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
    pinnedOrigin = response.origin;
    if (response.status === 404) continue;
    const parsed = parseSearch(response.text);
    console.log(`[${catalog.logPrefix}] Busca "${slug}" em ${new URL(pinnedOrigin).host}: ${parsed.cards.length} cartão(ões)`);
    if (parsed.empty) continue;
    const cards = parsed.cards.filter((card) => prefilterCard(card, media, request));
    const pages = [];
    for (const card of cards) {
      const detailPath = resolvePathOnOrigin(card.href, pinnedOrigin);
      if (seen.has(detailPath)) continue;
      seen.add(detailPath);
      const detail = await fetchCatalogPage(catalog, detailPath, { pinnedOrigin, allow404: true });
      if (detail.status === 404) continue;
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
  const items = $('.capa-item');
  const cards = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items.eq(i);
    const titleNode = item.find('h2.capa-titulo').length ? item.find('h2.capa-titulo') : item.find('h2');
    const href = titleNode.find('a').attr('href') || item.find('a').attr('href');
    if (!href) throw new Error('cartão de busca sem endereço');
    const title = collapse(titleNode.text() || item.find('a').attr('title'));
    if (!title) throw new Error('cartão de busca sem título');
    let tipo = '';
    if (/\(\s*filme\s+de\s+/i.test(title)) tipo = 'Filmes';
    else if (/\(\s*s[eé]rie\s+de\s+/i.test(title)) tipo = 'Séries';
    else if (/\(\s*(?:desenho|anime)\s+de\s+/i.test(title)) tipo = 'Desenhos';
    cards.push({
      href,
      title,
      tipo,
      year: readYear(title),
    });
  }
  if (cards.length) return { cards, empty: false };
  const heading = collapse($('h1.page-title').text() || $('h1').text());
  if (/torrents encontrados para|pesquisa:|resultados/i.test(heading)) {
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
  const tipo = normalizeText(card.tipo || '');
  if (tipo === 'desenhos') return false;
  if (request.mediaType === 'movie' && tipo && !/\bfilmes?\b/.test(tipo)) return false;
  if (request.mediaType === 'tv' && tipo && !/\bseries?\b/.test(tipo)) return false;
  if (request.mediaType === 'movie' && isCollectionTitle(card.title)) return false;
  let seasons;
  try {
    seasons = seasonNumbers(card.title);
  } catch {
    return false;
  }
  if (request.mediaType === 'tv') {
    if (seasons.length && !seasons.includes(request.season)) return false;
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
  const blocks = $('.download-block');
  if (!blocks.length) return null;
  const rawTitle = collapse($('h1').text());
  if (!rawTitle) throw new Error(`página sem título em ${url}`);
  const anchors = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks.eq(i);
    const versao = collapse(block.find('.download-versao').text());
    const descs = block.find('.download-desc');
    if (descs.length) {
      for (let j = 0; j < descs.length; j += 1) {
        const desc = descs.eq(j);
        const descText = collapse(desc.text());
        const links = desc.find('a');
        for (let k = 0; k < links.length; k += 1) {
          const link = links.eq(k);
          const href = link.attr('href') || '';
          if (!/^magnet:\?/i.test(href)) continue;
          const titleAttr = collapse(link.attr('title'));
          anchors.push({ href, label: collapse(`${descText} ${titleAttr} ${versao}`) });
        }
      }
    } else {
      const links = block.find('a.btn-magnet').length ? block.find('a.btn-magnet') : block.find('a');
      for (let j = 0; j < links.length; j += 1) {
        const link = links.eq(j);
        const href = link.attr('href') || '';
        if (!/^magnet:\?/i.test(href)) continue;
        anchors.push({ href, label: collapse(`${link.attr('title') || ''} ${block.text()}`) });
      }
    }
  }
  if (!anchors.length) return null;
  return {
    url,
    rawTitle,
    year: readYear(rawTitle),
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
      addFallbackTrackers: false,
      allowSeriesPackWithoutSeason: true,
    }, media, request));
}
