/**
 * Leitor da família `lista-download` (`limpotorrents.com` e `salvetorrent.com`).
 *
 * A busca é `GET /index.php?s=<termo>`.
 * - No Limpo Torrent, os cartões são `.blog_bloco` (`h2.blog_titulo a`, `ul.blog_dados strong`,
 *   eventual link `imdb.com/title/tt...`) e o vazio traz "Nenhum resultado encontrado".
 * - No Salve Torrent, os cartões são `#capas_pequenas .capa_lista` (`span.capa_categoria`, `h3`,
 *   `Lançamento (ANO)`) e o vazio traz `#capas_pequenas` sem `.capa_lista`.
 *
 * Na página de título, os magnets ficam em `#lista_download`, onde o `title` da âncora ou o
 * texto/elemento anterior traz o rótulo completo da opção.
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
  searchTerms,
  selectConfirmedPages,
  titleRelated,
} from './common.js';

/**
 * Coleta e resolve os streams de um catálogo da família `lista-download`.
 * @param {object} catalog - Configuração do catálogo.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Streams do catálogo.
 */
export async function collectListaDownload(catalog, media, request) {
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
        const parsed = parseSearch(html, catalog.cardVariant);
        if (parsed.unrecognized) {
          const err = new Error('layout de busca não reconhecido');
          err.retryable = true;
          throw err;
        }
      },
    });
    pinnedOrigin = response.origin;
    const parsed = parseSearch(response.text, catalog.cardVariant);
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
      const page = parseContent(detail.text, detail.url, card);
      if (page) pages.push(page);
    }
    const selected = selectConfirmedPages(pages, media, request, catalog.logPrefix);
    if (selected.length) return selected;
  }
  return [];
}

/**
 * @param {string} html
 * @param {string} [variant]
 * @returns {{ unrecognized?: boolean, cards: object[], empty: boolean }}
 */
export function parseSearch(html, variant) {
  if (variant === 'salvetorrent') return parseSalveSearch(html);
  return parseLimpoSearch(html);
}

/**
 * @param {string} html
 * @returns {{ unrecognized?: boolean, cards: object[], empty: boolean }}
 */
function parseLimpoSearch(html) {
  const $ = loadHtml(html);
  const blocks = $('.blog_bloco');
  const cards = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks.eq(i);
    const titleLink = block.find('h2.blog_titulo a');
    const href = titleLink.attr('href') || block.find('a').attr('href');
    if (!href) throw new Error('cartão de busca sem endereço');
    const title = collapse(titleLink.text() || block.find('h2').text());
    if (!title) throw new Error('cartão de busca sem título');
    const firstStrong = collapse(block.find('ul.blog_dados strong').eq(0).text());
    const imdbIds = [];
    const links = block.find('a');
    for (let j = 0; j < links.length; j += 1) {
      const linkHref = links.eq(j).attr('href') || '';
      const match = /imdb\.com\/(?:pt\/)?title\/(tt\d+)/i.exec(linkHref);
      if (match) imdbIds.push(match[1].toLowerCase());
    }
    cards.push({
      href,
      title,
      tipo: firstStrong,
      year: readYear(title),
      imdbIds,
    });
  }
  if (cards.length) return { cards, empty: false };
  if (/nenhum resultado encontrado/i.test(html)) return { cards: [], empty: true };
  return { unrecognized: true, cards: [], empty: false };
}

/**
 * @param {string} html
 * @returns {{ unrecognized?: boolean, cards: object[], empty: boolean }}
 */
function parseSalveSearch(html) {
  const $ = loadHtml(html);
  const grid = $('#capas_pequenas');
  const items = grid.find('.capa_lista');
  const cards = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items.eq(i);
    const href = item.find('a').attr('href');
    if (!href) throw new Error('cartão de busca sem endereço');
    const title = collapse(item.find('h3').text() || item.find('a').attr('title'));
    if (!title) throw new Error('cartão de busca sem título');
    const tipo = collapse(item.find('.capa_categoria').text());
    const year = readYear(item.text()) || readYear(title);
    cards.push({
      href,
      title,
      tipo,
      year,
      imdbIds: [],
    });
  }
  if (cards.length) return { cards, empty: false };
  if (grid.length) return { cards: [], empty: true };
  return { unrecognized: true, cards: [], empty: false };
}

/**
 * @param {object} card
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request
 * @returns {boolean}
 */
function prefilterCard(card, media, request) {
  const href = String(card.href || '');
  if (/torrent-desenho|torrent-anime/i.test(href)) return false;
  const tipo = normalizeText(card.tipo || '');
  if (tipo === 'anime' || tipo === 'desenho' || tipo === 'desenhos') return false;
  if (request.mediaType === 'movie' && tipo && !/\bfilmes?\b/.test(tipo)) return false;
  if (request.mediaType === 'tv' && tipo && !/\bseries?\b/.test(tipo)) return false;
  if (request.mediaType === 'movie' && isCollectionTitle(card.title)) return false;

  const targetImdb = media.imdbId ? media.imdbId.toLowerCase() : null;
  if (targetImdb && card.imdbIds && card.imdbIds.length > 0 && !card.imdbIds.includes(targetImdb)) {
    return false;
  }

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
 * @param {object} card
 * @returns {object|null}
 */
function parseContent(html, url, card) {
  const $ = loadHtml(html);
  const container = $('#lista_download');
  if (!container.length) return null;
  const rawTitle = collapse($('h1').text() || card.title);
  if (!rawTitle) throw new Error(`página sem título em ${url}`);
  const anchors = readListaDownloadAnchors($, html);
  if (!anchors.length) return null;
  const pageImdbIds = [...new Set([...(card.imdbIds || []), ...readImdbIds(html)])];
  const infoText = collapse($('#informacoes').text());
  return {
    url,
    rawTitle,
    year: card.year || readYear(rawTitle) || readYear(infoText),
    imdbIds: pageImdbIds,
    infoSize: humanSize(infoText),
    anchors,
  };
}

/**
 * Extrai os pares `{ href, label }` de `#lista_download` combinando o atributo `title` da âncora
 * com o rótulo imediatamente anterior no HTML quando o texto do botão é genérico (`MAGNET LINK`, `BAIXAR`).
 * @param {*} $
 * @param {string} html
 * @returns {{ href: string, label: string }[]}
 */
function readListaDownloadAnchors($, html) {
  const links = $('#lista_download a');
  const found = [];
  for (let i = 0; i < links.length; i += 1) {
    const link = links.eq(i);
    const href = link.attr('href') || '';
    if (!/^magnet:\?/i.test(href)) continue;
    const titleAttr = collapse(link.attr('title'));
    const textContent = collapse(link.text());
    const contextBefore = labelBeforeMagnet(html, href);
    const label = collapse(`${titleAttr} ${contextBefore} ${textContent}`);
    found.push({ href, label });
  }
  return found;
}

/**
 * @param {string} html
 * @param {string} href
 * @returns {string}
 */
function labelBeforeMagnet(html, href) {
  const hashMatch = /btih:([^&#\s"']+)/i.exec(href);
  if (!hashMatch) return '';
  const idx = html.toLowerCase().indexOf(hashMatch[1].toLowerCase());
  if (idx === -1) return '';
  const windowText = html.slice(Math.max(0, idx - 350), idx);
  return collapse(windowText.replace(/<[^>]+>/g, ' '));
}

/**
 * @param {object} page
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {object[]}
 */
function optionsFromPage(page, media, request) {
  const singlePageSize = page.anchors.length === 1 ? page.infoSize : null;
  return page.anchors
    .filter((anchor) => !/\blegendas\b/i.test(anchor.label))
    .map((anchor) => classifyMagnetOption({
      href: anchor.href,
      labelText: anchor.label,
      contextText: page.rawTitle,
      size: humanSize(anchor.label) || singlePageSize,
      addFallbackTrackers: true,
    }, media, request));
}
