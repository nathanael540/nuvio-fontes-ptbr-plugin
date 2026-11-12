/**
 * Utilitários comuns aos leitores de página das seis famílias da Rede BaixaRápido.
 */

import { HEADER_PROFILES } from '../_blocks/http/index.mjs';
import { normalizeText, slugify } from '../_blocks/slugify/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { isCollectionTitle } from '../_blocks/torrent-release/index.mjs';

/**
 * Carrega o documento HTML usando o cheerio restrito do app.
 * @param {string} html - Documento HTML bruto.
 * @returns {*} Instância do cheerio.
 */
export function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}

/**
 * Normaliza espaços consecutivos em um único espaço.
 * @param {string|null|undefined} text - Texto de entrada.
 * @returns {string} Texto com espaços colapsados.
 */
export function collapse(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Extrai o primeiro ano válido (19xx ou 20xx) de um texto.
 * @param {string|null|undefined} text - Texto com possível ano.
 * @returns {number|null} Ano ou `null`.
 */
export function readYear(text) {
  const match = /\b(?:19|20)\d{2}\b/.exec(String(text || ''));
  return match ? Number(match[0]) : null;
}

/**
 * Extrai IDs do IMDb (`tt...`) presentes no HTML.
 * @param {string} html - HTML bruto da página.
 * @returns {string[]} Lista única de IDs `tt...` em minúsculas.
 */
export function readImdbIds(html) {
  return [...new Set([...String(html || '').matchAll(/imdb\.com\/(?:pt\/)?title\/(tt\d+)/gi)].map((match) => match[1].toLowerCase()))];
}

/**
 * Retorna os títulos de busca únicos de um `MediaInfo` em ordem de preferência.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Títulos não vazios sem duplicatas normalizadas.
 */
export function searchTerms(media) {
  const queries = [];
  for (const title of [media.title, media.originalTitle, ...(media.alternativeTitles || [])]) {
    if (typeof title !== 'string' || title.trim() === '') continue;
    const query = title.trim();
    if (!queries.some((item) => normalizeText(item) === normalizeText(query))) queries.push(query);
  }
  if (!queries.length) throw new Error('Busca: nenhum título disponível');
  return queries;
}

/**
 * Retorna os slugs únicos (com hífen) de um `MediaInfo` em ordem de preferência.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Slugs não vazios sem duplicatas.
 */
export function searchSlugs(media) {
  const slugs = [];
  for (const title of [media.title, media.originalTitle, ...(media.alternativeTitles || [])]) {
    if (typeof title !== 'string' || title.trim() === '') continue;
    let slug;
    try {
      slug = slugify(title);
    } catch {
      continue;
    }
    if (!slugs.includes(slug)) slugs.push(slug);
  }
  if (!slugs.length) throw new Error('Busca: nenhum título com letras latinas ou números');
  return slugs;
}

/**
 * Baixa uma página HTML de um catálogo, tentando o domínio reserva (`www`) apenas em falha de rede,
 * HTTP fora de 2xx/404, redirecionamento que perde a busca na home ou validador de busca que rejeita o HTML.
 *
 * @param {object} catalog - Configuração do catálogo (`origins`).
 * @param {string} path - Caminho e query (começando com `/`).
 * @param {object} [options] - Opções da requisição.
 * @param {string|null} [options.pinnedOrigin] - Se definido, fixa a consulta neste domínio.
 * @param {boolean} [options.allow404] - Se verdadeiro, devolve `{ status: 404 }` sem trocar de domínio.
 * @param {(html: string, responseUrl: string) => void} [options.validate] - Validador que lança erro `retryable` se o HTML não for reconhecido.
 * @returns {Promise<{ origin: string, status: number, text: string, url: string }>} Resposta obtida e domínio fixado.
 */
export async function fetchCatalogPage(catalog, path, options = {}) {
  const origins = options.pinnedOrigin ? [options.pinnedOrigin] : catalog.origins;
  const failures = [];
  for (const origin of origins) {
    const host = new URL(origin).host;
    const requestUrl = `${origin}${path}`;
    try {
      const response = await fetchRawHtml(requestUrl, Boolean(options.allow404));
      if (response.status === 404) {
        return { origin, status: 404, text: '', url: response.url };
      }
      if (isRedirectedToHome(path, response.url)) {
        const redirected = new Error(`redirecionamento para a home perdeu a busca em ${response.url}`);
        redirected.retryable = true;
        throw redirected;
      }
      if (options.validate) options.validate(response.text, response.url);
      return { origin, status: response.status, text: response.text, url: response.url };
    } catch (error) {
      if (!error.retryable && origins.length === 1) throw error;
      failures.push(`${host}: ${error.message}`);
      if (!error.retryable) break;
    }
  }
  throw new Error(`Todos os domínios falharam em ${path}: [${failures.join('; ')}]`);
}

/**
 * Converte um `href` (relativo ou absoluto) para o domínio fixado do catálogo.
 * @param {string} href - Endereço do cartão.
 * @param {string} origin - Origem ativa do catálogo.
 * @returns {string} Caminho relativo (`pathname` + `search`) validado.
 */
export function resolvePathOnOrigin(href, origin) {
  const url = new URL(href, origin);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`endereço inválido "${href}"`);
  }
  return `${url.pathname}${url.search}`;
}

/**
 * Limpa sufixos comuns de títulos de filmes e séries nos sites da rede.
 * @param {string} rawTitle - Título bruto do cartão ou `h1`.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @returns {string} Título limpo para comparação.
 */
export function cleanMediaTitle(rawTitle, mediaType) {
  let cleaned = collapse(String(rawTitle || '').split('·')[0])
    .replace(/\((?:filme|s[eé]rie|desenho|anime)\s+de\s+(?:19|20)\d{2}\)/gi, ' ')
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(/\((?:tri\s*[aá]udio|dual\s*[aá]udio|dublado|legendado|4k|uhd|hd|cam|bluray|web-dl)\)/gi, ' ');
  if (mediaType === 'tv') {
    cleaned = cleaned
      .replace(/\d{1,2}\s*[ªº°a]?\s*(?:a|ao|até|e)\s*\d{1,2}\s*[ªº°a]?\s*temporadas?(?:\s+completas?)?/gi, ' ')
      .replace(/\d{1,2}\s*[ªº°a]?\s*temporadas?(?:\s+completas?)?(?:\s+parte\s*\d+)?/gi, ' ')
      .replace(/temporadas?\s*\d{1,2}(?:\s+completas?)?/gi, ' ')
      .replace(/\bS\d{1,2}(?:E\d{1,3})?\b/gi, ' ');
  }
  cleaned = cleaned
    .replace(/\b(?:torrent|download|baixar|assistir|online|gr[aá]tis|completo|completa|dublado|dublada|legendado|legendada|dual\s*[aá]udio|tri\s*[aá]udio|nacional|5\.1|7\.1|bluray|bdrip|web-dl|webrip|hdrip|hdcam|camrip|cam|cinema|uhd|ultra\s*hd|full\s*hd|fhd|4k|2160p|1080p|720p|480p|mkv|mp4|imax|open\s*matte)\b/gi, ' ')
    .replace(/[-–—:|/]+/g, ' ');
  return collapse(cleaned);
}

/**
 * Verifica se um título de cartão tem relação mínima de palavras com algum título do TMDB.
 * @param {string} cardTitle - Título do cartão.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {boolean} `true` quando compartilha a primeira palavra significativa.
 */
export function titleRelated(cardTitle, media) {
  const haystack = new Set(normalizeText(cardTitle).split(' ').filter(Boolean));
  return searchTerms(media).some((title) => {
    const words = normalizeText(title).split(' ').filter((word) => word.length >= 3);
    const required = words.length ? [words[0]] : normalizeText(title).split(' ').filter(Boolean);
    return required.length > 0 && required.every((word) => haystack.has(word));
  });
}

/**
 * Verifica se o título limpo casa com o `MediaInfo` via igualdade normalizada, palavras ou `findBestMatch`.
 * @param {string} rawTitle - Título bruto da página ou cartão.
 * @param {number|null} year - Ano extraído (usado apenas em filmes).
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {number} [yearTolerance=1] - Tolerância de ano em filmes.
 * @returns {{ matched: boolean, score: number }} Resultado da correspondência.
 */
export function matchTitleAndYear(rawTitle, year, media, mediaType, yearTolerance = 1) {
  if (mediaType === 'movie' && year !== null && media.year !== null && Math.abs(year - media.year) > yearTolerance) {
    return { matched: false, score: 0 };
  }
  const title = cleanMediaTitle(rawTitle, mediaType);
  if (!title) return { matched: false, score: 0 };
  const candidateNorm = normalizeText(title);
  for (const target of searchTerms(media)) {
    if (normalizeText(target) === candidateNorm) return { matched: true, score: 1 };
  }
  const checkYear = mediaType === 'tv' ? null : year;
  const best = findBestMatch([{ title, year: checkYear }], media, { yearTolerance });
  if (best) return { matched: true, score: best.score };
  return { matched: false, score: 0 };
}

/**
 * Seleciona as páginas confirmadas para o pedido (descarta coleções em filme, confirma por IMDb ou por título/ano sem empate ambíguo).
 * @param {object[]} pages - Páginas lidas.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido validado.
 * @param {string} logPrefix - Prefixo de log do catálogo.
 * @returns {object[]} Páginas aceitas.
 */
export function selectConfirmedPages(pages, media, request, logPrefix) {
  const confirmed = [];
  const byTitle = [];
  for (const page of pages) {
    const raw = page.rawTitle || page.headline || page.title || '';
    if (request.mediaType === 'movie' && isCollectionTitle(raw)) {
      console.log(`[${logPrefix}] Página descartada por triagem: coleção de filmes (${raw})`);
      continue;
    }
    const pageImdbIds = (page.imdbIds || []).map((id) => id.toLowerCase());
    const targetImdb = media.imdbId ? media.imdbId.toLowerCase() : null;
    if (targetImdb && pageImdbIds.includes(targetImdb)) {
      confirmed.push(page);
      continue;
    }
    if (targetImdb && pageImdbIds.length > 0) {
      console.log(`[${logPrefix}] Página descartada por IMDb divergente: "${raw}" (${pageImdbIds.join(', ')})`);
      continue;
    }
    const match = matchTitleAndYear(raw, page.year ?? null, media, request.mediaType, page.yearTolerance ?? 1);
    if (match.matched) {
      byTitle.push({ page, score: match.score, norm: normalizeText(cleanMediaTitle(raw, request.mediaType)) });
    } else {
      console.log(`[${logPrefix}] Página descartada: "${raw}"`);
    }
  }
  if (confirmed.length) return confirmed;
  if (!byTitle.length) return [];
  const best = byTitle.reduce((max, item) => Math.max(max, item.score), 0);
  const top = byTitle.filter((item) => item.score === best);
  const names = new Set(top.map((item) => item.norm));
  if (names.size > 1) return [];
  return top.map((item) => item.page);
}

/**
 * @param {string} requestUrl
 * @param {boolean} allow404
 * @returns {Promise<{ status: number, text: string, url: string }>}
 */
async function fetchRawHtml(requestUrl, allow404) {
  let response;
  try {
    response = await fetch(requestUrl, { headers: { ...HEADER_PROFILES.page } });
  } catch (error) {
    const failure = new Error(`falha de rede em ${requestUrl}: ${error.message}`);
    failure.retryable = true;
    throw failure;
  }
  if (response.status >= 500) {
    const failure = new Error(`HTTP ${response.status} em ${requestUrl}`);
    failure.retryable = true;
    throw failure;
  }
  if (allow404 && response.status === 404) {
    return { status: 404, text: '', url: response.url || requestUrl };
  }
  if (!response.ok) {
    const failure = new Error(`HTTP ${response.status} em ${requestUrl}`);
    failure.retryable = response.status === 403 || response.status === 429 || response.status >= 500;
    throw failure;
  }
  const finalUrl = typeof response.url === 'string' && response.url !== '' ? response.url : requestUrl;
  return { status: response.status, text: await response.text(), url: finalUrl };
}

/**
 * Detecta quando uma requisição de busca ou página foi redirecionada para a raiz do site (`/`), perdendo a consulta.
 * @param {string} requestedPath
 * @param {string} responseUrl
 * @returns {boolean}
 */
function isRedirectedToHome(requestedPath, responseUrl) {
  if (!requestedPath || requestedPath === '/') return false;
  try {
    const finalParsed = new URL(responseUrl);
    const isHomePath = finalParsed.pathname === '/' || finalParsed.pathname === '/index.php';
    const hasSearchQuery = finalParsed.searchParams.has('s') || finalParsed.searchParams.has('busca');
    return isHomePath && !hasSearchQuery;
  } catch {
    return false;
  }
}
