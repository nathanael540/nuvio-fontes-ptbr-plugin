/**
 * Leitor da família `download-row`:
 * - `hdrtorrents.net`: `/pesquisa/<slug>/`, cartões `a.media-card-link` e vazio `.empty-state`
 * - `semtorrent.com`: `/pesquisa/<slug>/`, cartões `a.media-card-link` (páginas `/filme/` e `/serie/`) e vazio com `h1` "Pesquisa:"
 * - `brutotorrent.com`: `/pesquisa/<slug>/`, cartões `article.media-card` e vazio com `.alert` "Nada foi localizado" ou `h1` "Procurando por:"
 * - `temtorrents.com`: `/pesquisa/<slug>/`, cartões `article.media-list-item` e vazio com `h1` "Resultados de Busca para:"
 * - `redestorrents.com`: `/index.php?busca=<termo>&pagina=<n>`, cartões `a > article.custom-card` e vazio com "Nada foi localizado com os critérios informados"; a busca pagina até 12 páginas, parando em ficha confirmada, última página (menos de 20 cartões), estado vazio ou página repetida
 *
 * Na página interna, os downloads ficam em `.download-row` com `.download-name` e `a.download-btn`.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import {
  classifyMagnetOption,
  humanSize,
  resolveTorrentOptions,
  seasonNumbers,
} from '../_blocks/torrent-release/index.mjs';
import {
  collapse,
  fetchCatalogPage,
  loadHtml,
  matchTitleAndYear,
  readImdbIds,
  readPageLanguage,
  readYear,
  resolvePathOnOrigin,
  searchSlugs,
  searchTerms,
  selectConfirmedPages,
  titleRelated,
} from './common.js';
import { parseSearch as parseCustomCardSearch, prefilterCard as prefilterCustomCard } from './gratistorrent.js';

const SEARCH_PAGE_SIZE = 20;
const SEARCH_PAGE_LIMIT = 12;

/**
 * Coleta e resolve os streams de um catálogo da família `download-row`.
 * @param {object} catalog - Configuração do catálogo.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Streams do catálogo.
 */
export async function collectDownloadRow(catalog, media, request) {
  const pages = catalog.cardVariant === 'custom-card'
    ? await locateCustomCardPages(catalog, media, request)
    : await locateSlugPages(catalog, media, request);
  if (!pages.length) {
    console.log(`[${catalog.logPrefix}] Nenhum resultado corresponde a "${media.title}"`);
    return [];
  }
  const options = pages.flatMap((page) => optionsFromPage(page, media, request));
  if (!options.length) {
    console.log(`[${catalog.logPrefix}] Nenhuma linha magnet nas páginas confirmadas`);
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
async function locateCustomCardPages(catalog, media, request) {
  let pinnedOrigin = null;
  const seen = new Set();
  const terms = searchTerms(media);
  for (let termIndex = 0; termIndex < terms.length; termIndex += 1) {
    const term = terms[termIndex];
    const pageLimit = termIndex === 0 ? SEARCH_PAGE_LIMIT : 1;
    const signatures = new Set();
    let pagesRead = 0;
    let stopReason = null;
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const query = new URLSearchParams({ busca: term });
      if (pageNumber > 1) query.set('pagina', String(pageNumber));
      const response = await fetchCatalogPage(catalog, `/index.php?${query}`, {
        pinnedOrigin,
        validate: (html) => {
          const parsed = parseCustomCardSearch(html);
          if (parsed.unrecognized) {
            const err = new Error('layout de busca não reconhecido');
            err.retryable = true;
            throw err;
          }
        },
      });
      pinnedOrigin = response.origin;
      const parsed = parseCustomCardSearch(response.text);
      pagesRead += 1;
      console.log(`[${catalog.logPrefix}] Busca "${term}" página ${pageNumber} em ${new URL(pinnedOrigin).host}: ${parsed.cards.length} cartão(ões)`);
      if (parsed.empty) {
        stopReason = 'estado vazio';
        break;
      }
      const signature = parsed.cards.map((card) => card.href).join('\n');
      if (signatures.has(signature)) {
        stopReason = 'página repetida';
        break;
      }
      signatures.add(signature);
      const pages = [];
      for (const card of parsed.cards.filter((item) => prefilterCustomCard(item, media, request))) {
        const detailPath = resolvePathOnOrigin(card.href, pinnedOrigin);
        if (seen.has(detailPath)) continue;
        seen.add(detailPath);
        const detail = await fetchCatalogPage(catalog, detailPath, { pinnedOrigin, allow404: true });
        if (detail.status === 404) continue;
        const page = readContent(detail.text, detail.url);
        if (page) pages.push(page);
      }
      const selected = selectConfirmedPages(pages, media, request, catalog.logPrefix);
      if (selected.length) {
        console.log(`[${catalog.logPrefix}] Busca "${term}": ${pagesRead} página(s) lidas, parada por ficha confirmada`);
        return selected;
      }
      if (parsed.cards.length < SEARCH_PAGE_SIZE) {
        stopReason = 'última página';
        break;
      }
    }
    if (!stopReason) stopReason = pageLimit === SEARCH_PAGE_LIMIT ? 'limite de 12 páginas' : 'limite de 1 página';
    console.log(`[${catalog.logPrefix}] Busca "${term}": ${pagesRead} página(s) lidas, parada por ${stopReason}`);
  }
  return [];
}

/**
 * @param {object} catalog
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {Promise<object[]>}
 */
async function locateSlugPages(catalog, media, request) {
  let pinnedOrigin = null;
  const seen = new Set();
  for (const slug of searchSlugs(media)) {
    const path = `/pesquisa/${slug}/`;
    const response = await fetchCatalogPage(catalog, path, {
      pinnedOrigin,
      allow404: true,
      validate: (html) => {
        readSearch(html, catalog.cardVariant);
      },
    });
    pinnedOrigin = response.origin;
    if (response.status === 404) continue;
    const allCards = readSearch(response.text, catalog.cardVariant);
    const cards = allCards.filter((card) => isCardType(card, request.mediaType));
    console.log(`[${catalog.logPrefix}] Busca "${slug}" em ${new URL(pinnedOrigin).host}: ${cards.length} cartão(s)`);
    const selectedCards = selectCards(cards, media, request);
    const candidatePages = [];
    for (const card of selectedCards) {
      const detailPath = resolvePathOnOrigin(card.href, pinnedOrigin);
      if (seen.has(detailPath)) continue;
      seen.add(detailPath);
      const detail = await fetchCatalogPage(catalog, detailPath, { pinnedOrigin, allow404: true });
      if (detail.status === 404) continue;
      const page = readContent(detail.text, detail.url);
      if (page) candidatePages.push(page);
    }
    const confirmed = selectConfirmedPages(candidatePages, media, request, catalog.logPrefix);
    if (confirmed.length) return confirmed;
  }
  return [];
}

/**
 * @param {string} html
 * @param {string} [variant]
 * @returns {{ href: string, tipo: string, title: string, year: number|null }[]}
 */
export function readSearch(html, variant) {
  const $ = loadHtml(html);
  if (variant === 'media-list-item') return readMediaListItems($);
  if (variant === 'bruto-card') return readBrutoCards($);
  return readMediaCardLinks($);
}

/**
 * Cartões `a.media-card-link` (usados por HDR Torrents e Sem Torrent).
 * @param {*} $
 * @returns {{ href: string, tipo: string, title: string, year: number|null }[]}
 */
function readMediaCardLinks($) {
  const cards = $('a.media-card-link');
  const empty = $('.empty-state');
  const heading = collapse($('h1').text());
  const isSearchHeading = /pesquisa:|procurando por|resultados|encontrados para/i.test(heading);
  if (!cards.length && !empty.length && !isSearchHeading) {
    const err = new Error('Busca: HTML sem cartões nem estado vazio');
    err.retryable = true;
    throw err;
  }
  const found = [];
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards.eq(i);
    const href = card.attr('href');
    if (!href) throw new Error('Busca: cartão sem endereço');
    const tipo = collapse(card.find('.badge-tipo').text()) || typeFromHref(href);
    if (!tipo) throw new Error('Busca: cartão sem tipo');
    const title = collapse(card.find('.media-card-title').text()) || collapse(card.attr('title'));
    if (!title) throw new Error('Busca: cartão sem título');
    const year = readYear(card.find('.media-card-year').text())
      || readYear(card.find('.badge-ano').text())
      || readYear(title);
    found.push({ href, tipo, title, year });
  }
  return found;
}

/**
 * Cartões `article.media-card` do Bruto Torrent (`a.media-card-cover`, `h2.media-card-title`, `p.media-card-meta`).
 * @param {*} $
 * @returns {{ href: string, tipo: string, title: string, year: number|null }[]}
 */
function readBrutoCards($) {
  const cards = $('article.media-card');
  const heading = collapse($('h1').text());
  const alertText = collapse($('.alert').text());
  const isEmpty = /nada foi localizado/i.test(alertText) || /procurando por/i.test(heading);
  if (!cards.length && !isEmpty) {
    const err = new Error('Busca: HTML sem cartões nem estado vazio');
    err.retryable = true;
    throw err;
  }
  const found = [];
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards.eq(i);
    const titleNode = card.find('h2.media-card-title');
    const href = titleNode.find('a').attr('href') || card.find('a.media-card-cover').attr('href');
    if (!href) throw new Error('Busca: cartão sem endereço');
    const title = collapse(titleNode.text());
    if (!title) throw new Error('Busca: cartão sem título');
    const meta = collapse(card.find('p.media-card-meta').text());
    const tipo = /\bfilmes?\b/i.test(meta) ? 'Filmes' : (/\bs[eé]ries?\b/i.test(meta) ? 'Séries' : 'Desenhos');
    const year = readYear(meta) || readYear(title);
    found.push({ href, tipo, title, year });
  }
  return found;
}

/**
 * Cartões `article.media-list-item` do Tem Torrents (`data-title`, `data-tipo`, `ul.media-meta`).
 * @param {*} $
 * @returns {{ href: string, tipo: string, title: string, year: number|null }[]}
 */
function readMediaListItems($) {
  const cards = $('article.media-list-item');
  const heading = collapse($('h1').text());
  const isEmpty = /resultados de busca para|resultados da busca/i.test(heading);
  if (!cards.length && !isEmpty) {
    const err = new Error('Busca: HTML sem cartões nem estado vazio');
    err.retryable = true;
    throw err;
  }
  const found = [];
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards.eq(i);
    const href = card.find('h2.media-title a').attr('href') || card.find('a').attr('href');
    if (!href) throw new Error('Busca: cartão sem endereço');
    const title = collapse(card.attr('data-title') || card.find('h2.media-title').text());
    if (!title) throw new Error('Busca: cartão sem título');
    const meta = collapse(card.find('ul.media-meta').text());
    const tipo = collapse(card.attr('data-tipo')) || (/\bfilmes?\b/i.test(meta) ? 'Filmes' : 'Séries');
    const year = readYear(meta) || readYear(title);
    found.push({ href, tipo, title, year });
  }
  return found;
}

/**
 * @param {string} href
 * @returns {string}
 */
function typeFromHref(href) {
  if (/\/filme\//i.test(href)) return 'Filmes';
  if (/\/serie\//i.test(href)) return 'Séries';
  return '';
}

/**
 * @param {{ href: string, tipo: string }} card
 * @param {'movie'|'tv'} mediaType
 * @returns {boolean}
 */
function isCardType(card, mediaType) {
  const text = normalizeText(card.tipo || '');
  const href = String(card.href || '');
  if (mediaType === 'movie') {
    if (/\/serie\/|\/desenho\//i.test(href)) return false;
    return /\bfilmes?\b/.test(text);
  }
  if (/\/filme\/|\/desenho\//i.test(href)) return false;
  return /\bseries?\b/.test(text);
}

/**
 * @param {{ href: string, tipo: string, title: string, year: number|null }[]} cards
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request
 * @returns {object[]}
 */
function selectCards(cards, media, request) {
  let pool;
  if (request.mediaType === 'tv') {
    const exact = cards.filter((card) => {
      try {
        const seasons = seasonNumbers(card.title);
        return seasons.length === 1 && seasons[0] === request.season;
      } catch {
        return false;
      }
    });
    const covering = cards.filter((card) => {
      try {
        return seasonNumbers(card.title).includes(request.season);
      } catch {
        return false;
      }
    });
    pool = exact.length ? exact : covering;
  } else {
    pool = cards.filter((card) => {
      try {
        return seasonNumbers(card.title).length === 0;
      } catch {
        return false;
      }
    });
  }
  return pool.filter((card) => {
    if (request.mediaType === 'movie' && card.year !== null && media.year !== null && Math.abs(card.year - media.year) > 1) {
      return false;
    }
    return matchTitleAndYear(card.title, request.mediaType === 'tv' ? null : card.year, media, request.mediaType, 1).matched
      || titleRelated(card.title, media);
  });
}

/**
 * @param {string} html
 * @param {string} pageUrl
 * @returns {object|null}
 */
function readContent(html, pageUrl) {
  const $ = loadHtml(html);
  const headline = collapse(
    $('h1.item-h1').text()
    || $('h1.item-title').text()
    || $('h1.item-titulo').text()
    || $('h1.movie-title').text()
    || $('h1').text(),
  );
  if (!headline) throw new Error(`Conteúdo: HTML sem título em ${pageUrl}`);
  const rows = readRows($, html);
  if (!rows.length) return null;
  const specs = specMap($);
  return {
    url: pageUrl,
    headline,
    rawTitle: headline,
    year: readYear(headline.split('·')[0]) || readYear(specs.Lançamento),
    imdbIds: readImdbIds(html),
    audio: readPageLanguage(html),
    rows,
    specs,
    yearTolerance: 0,
  };
}

/**
 * @param {*} $
 * @param {string} html
 * @returns {{ name: string, href: string }[]}
 */
function readRows($, html) {
  const rows = $('.download-row');
  const found = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows.eq(i);
    const name = collapse(row.find('.download-name').text());
    const href = row.find('a.download-btn').attr('href') || row.find('a').attr('href') || '';
    if (!/^magnet:\?/i.test(href)) continue;
    found.push({ name, href });
  }
  if (!found.length && /magnet:\?/i.test(html)) {
    throw new Error('Conteúdo: magnets na página não puderam ser lidos');
  }
  return found;
}

/**
 * @param {*} $
 * @returns {Record<string, string>}
 */
function specMap($) {
  const keys = $('dt');
  const values = $('dd');
  const specs = {};
  const count = Math.min(keys.length, values.length);
  for (let i = 0; i < count; i += 1) {
    const key = collapse(keys.eq(i).text());
    const value = collapse(values.eq(i).text());
    if (key && value && specs[key] === undefined) specs[key] = value;
  }
  return specs;
}

/**
 * @param {object} page
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {object[]}
 */
function optionsFromPage(page, media, request) {
  const singlePageSize = page.rows.length === 1 ? humanSize(page.specs.Tamanho) : null;
  return page.rows.map((row) => classifyMagnetOption({
    href: row.href,
    labelText: row.name,
    contextText: page.headline,
    audio: page.audio || page.specs.Idiomas || page.specs.Idioma || page.specs['Áudio'] || null,
    qualityFallback: page.specs.Qualidade || null,
    size: humanSize(row.name) || singlePageSize,
    addFallbackTrackers: false,
  }, media, request));
}
