/**
 * Catálogos DLE da rede BrStream: CineAgora, CineGratis e VisionCine.
 *
 * Origem: github.com/Ivadzf/ivadz-nuvio-repo, providers/cinegratis.js e providers/visioncine.js
 * (GPL-3.0). Os fluxos DLE de CineGratis e VisionCine foram reimplementados com os blocos
 * locais; o CineAgora é código local deste repositório (GPL-3.0).
 *
 * Cada catálogo tem busca, seções de tipo, adaptadores de resultado e de identidade e seletor
 * de espelho próprios. O player BrStream é o mesmo nos três, então o `index.js` une os streams
 * e deduplica pelo arquivo (`uid|md5|id`).
 */

import { titleSimilarity } from '../_blocks/title-match/index.mjs';

/**
 * Score mínimo de semelhança para aceitar um título.
 * @type {number}
 */
export const MIN_TITLE_SCORE = 0.85;

/**
 * Marcador de busca DLE sem resultados.
 * @type {RegExp}
 */
export const NO_RESULTS = /site search yielded no results/i;

/**
 * @typedef {object} CatalogResult
 * @property {string} title - Título principal do cartão.
 * @property {string[]} titles - Títulos publicados no cartão, para a pré-seleção.
 * @property {number|null} year - Ano publicado no cartão, quando houver.
 * @property {string} url - URL absoluta da página do candidato.
 */

/**
 * @typedef {object} CatalogIdentity
 * @property {string} title - Título PT-BR lido na página.
 * @property {string|null} originalTitle - Título original lido na página.
 * @property {number} year - Ano confirmado.
 * @property {string|null} imdbId - IMDb publicado, quando houver.
 */

/**
 * Lista imutável de catálogos na ordem de precedência da deduplicação.
 * @type {ReadonlyArray<object>}
 */
export const CATALOGS = Object.freeze([
  {
    id: 'cineagora',
    name: 'CineAgora',
    baseUrl: 'https://cineagora.club',
    hosts: ['cineagora.club', 'www.cineagora.club'],
    sections: { movie: '/filmes-hd-online/', tv: '/series-online-hd-gratis/' },
    searchUrl: 'https://cineagora.club/index.php?do=search&subaction=search&story=',
    pageHeaders: {},
    mirrorSelector: '.mirrors .button',

    /**
     * Lê os cartões `a.item` da busca do CineAgora.
     * @param {object} $ - Instância do cheerio.
     * @param {string} pageUrl - URL da busca.
     * @param {object} catalog - Configuração do catálogo.
     * @returns {CatalogResult[]} Resultados na ordem da página.
     * @throws {Error} Se um cartão estiver fora do formato ou a busca não tiver cartões nem ausência.
     */
    parseResults($, pageUrl, catalog) {
      const items = $('a.item');
      if (items.length === 0) {
        if (NO_RESULTS.test($.html()) || isSearchPage($)) return [];
        throw new Error('Busca sem cartões nem mensagem explícita de ausência');
      }
      const results = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items.eq(index);
        const href = item.attr('href');
        const title = item.attr('data-title');
        if (!href || typeof title !== 'string' || title.trim() === '') {
          throw new Error(`Resultado ${index + 1} da busca sem href ou data-title`);
        }
        results.push({
          title: title.trim(),
          titles: [title.trim()],
          year: null,
          url: new URL(href, catalog.baseUrl).href,
        });
      }
      return results;
    },

    /**
     * Lê título, ano e IMDb da página do CineAgora.
     * @param {object} $ - Instância do cheerio.
     * @param {string} html - HTML da página.
     * @param {string} url - URL da página.
     * @returns {CatalogIdentity} Identidade lida.
     * @throws {Error} Se faltar `h1.title` ou o ano em `span.date a`.
     */
    readIdentity($, html, url) {
      const title = $('h1.title').eq(0).text().trim();
      if (title === '') throw new Error(`Página ${url} sem h1.title`);
      const yearText = $('span.date a').eq(0).text().trim();
      if (!/^\d{4}$/.test(yearText)) throw new Error(`Página ${url} sem ano em span.date`);
      const imdbHref = $('div.imdb a').eq(0).attr('href') || '';
      const imdb = /tt\d{5,}/.exec(imdbHref);
      return {
        title,
        originalTitle: null,
        year: Number(yearText),
        imdbId: imdb ? imdb[0] : null,
      };
    },

    /**
     * Confere a identidade do CineAgora com o TMDB.
     * @param {CatalogIdentity} identity - Identidade lida.
     * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
     * @returns {boolean} True quando o candidato pode ser aceito.
     */
    matchesIdentity(identity, media) {
      if (!titleMatches([identity.title], media)) return false;
      if (media.year !== null && identity.year !== media.year) return false;
      if (media.imdbId !== null && identity.imdbId !== media.imdbId) return false;
      return true;
    },
  },
  {
    id: 'cinegratis',
    name: 'CineGratis',
    baseUrl: 'https://cinegratis.co',
    hosts: ['cinegratis.co', 'www.cinegratis.co', 'cinegratis.tv', 'www.cinegratis.tv'],
    sections: { movie: '/filmes-hd-gratis/', tv: '/series-hd-online/' },
    searchUrl: 'https://cinegratis.co/index.php?do=search&subaction=search&story=',
    pageHeaders: {},
    mirrorSelector: '.player__mirrors .mirror',

    /**
     * Lê os resultados `li.film a.tt` da busca do CineGratis.
     * @param {object} $ - Instância do cheerio.
     * @param {string} pageUrl - URL da busca.
     * @param {object} catalog - Configuração do catálogo.
     * @returns {CatalogResult[]} Resultados na ordem da página.
     * @throws {Error} Se um resultado estiver fora do formato ou a busca não tiver resultados nem ausência.
     */
    parseResults($, pageUrl, catalog) {
      const links = $('li.film a.tt');
      if (links.length === 0) {
        if (NO_RESULTS.test($.html()) || isSearchPage($)) return [];
        throw new Error('Busca sem resultados nem mensagem explícita de ausência');
      }
      const results = [];
      let invalid = 0;
      for (let index = 0; index < links.length; index += 1) {
        const link = links.eq(index);
        const item = link.closest('li.film');
        const href = link.attr('href');
        const titles = [];
        const primary = link.text().trim();
        if (primary !== '') titles.push(primary);
        for (const selector of ['h2.film-tt .film-title', 'h2.film-tt .kt']) {
          const titleNodes = item.find(selector);
          for (let titleIndex = 0; titleIndex < titleNodes.length; titleIndex += 1) {
            const value = titleNodes.eq(titleIndex).text().trim();
            if (value !== '' && !titles.includes(value)) titles.push(value);
          }
        }
        const yearText = item.find('span.film-yil').first().text().trim();
        if (!href || titles.length === 0 || !/^\d{4}$/.test(yearText)) {
          invalid += 1;
          continue;
        }
        results.push({
          title: titles[0],
          titles,
          year: Number(yearText),
          url: new URL(href, catalog.baseUrl).href,
        });
      }
      if (results.length === 0) {
        throw new Error(`Busca com ${invalid} resultado(s) sem título ou ano`);
      }
      return results;
    },

    /**
     * Lê título, título original e IMDb da página do CineGratis.
     * @param {object} $ - Instância do cheerio.
     * @param {string} html - HTML da página.
     * @param {string} url - URL da página.
     * @param {CatalogResult} candidate - Resultado que abriu a página.
     * @returns {CatalogIdentity} Identidade lida.
     * @throws {Error} Se faltar `h1 > a` ou `h2`.
     */
    readIdentity($, html, url, candidate) {
      const heading = $('h1').first();
      const title = heading.find('a').first().text().trim();
      if (title === '') throw new Error(`Página ${url} sem h1 > a`);
      const original = $('h2').first().text().trim();
      if (original === '') throw new Error(`Página ${url} sem h2`);
      return {
        title,
        originalTitle: original,
        year: candidate.year,
        imdbId: findImdbId($),
      };
    },

    /**
     * Confere a identidade do CineGratis com o TMDB.
     * @param {CatalogIdentity} identity - Identidade lida.
     * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
     * @returns {boolean} True quando o candidato pode ser aceito.
     */
    matchesIdentity(identity, media) {
      if (!titleMatches([identity.title, identity.originalTitle], media)) return false;
      if (media.year !== null && identity.year !== media.year) return false;
      if (media.imdbId !== null && identity.imdbId !== null && identity.imdbId !== media.imdbId) return false;
      return true;
    },
  },
  {
    id: 'visioncine',
    name: 'VisionCine',
    baseUrl: 'https://visioncine.lol',
    hosts: ['visioncine.lol', 'www.visioncine.lol'],
    sections: { movie: '/ver-filmes-hd-online-gratis/', tv: '/series-online/' },
    searchUrl: 'https://visioncine.lol/index.php?do=search&subaction=search&story=',
    pageHeaders: { Referer: 'https://visioncine.lol/' },
    mirrorSelector: '.mirrors a.nav-link',

    /**
     * Lê os cartões `div.poster-container` da busca do VisionCine.
     * @param {object} $ - Instância do cheerio.
     * @param {string} pageUrl - URL da busca.
     * @param {object} catalog - Configuração do catálogo.
     * @returns {CatalogResult[]} Resultados na ordem da página.
     * @throws {Error} Se um cartão estiver fora do formato ou a busca não tiver cartões nem ausência.
     */
    parseResults($, pageUrl, catalog) {
      const containers = $('div.poster-container');
      if (containers.length === 0) {
        if (NO_RESULTS.test($.html()) || isSearchPage($)) return [];
        throw new Error('Busca sem cartões nem mensagem explícita de ausência');
      }
      const results = [];
      for (let index = 0; index < containers.length; index += 1) {
        const item = containers.eq(index);
        const link = item.find('a[href]').first();
        const href = link.attr('href');
        const title = item.find('h2.title').first().text().trim()
          || cleanAlt(item.find('img').first().attr('alt') || link.attr('title') || '');
        if (!href || title === '') {
          throw new Error(`Cartão ${index + 1} da busca sem href ou título`);
        }
        const yearText = item.find('.poster-year').first().text().trim();
        results.push({
          title,
          titles: [title],
          year: /^\d{4}$/.test(yearText) ? Number(yearText) : null,
          url: new URL(href, catalog.baseUrl).href,
        });
      }
      return results;
    },

    /**
     * Lê título, título original e ano da página do VisionCine.
     * @param {object} $ - Instância do cheerio.
     * @param {string} html - HTML da página.
     * @param {string} url - URL da página.
     * @param {CatalogResult} candidate - Resultado que abriu a página.
     * @returns {CatalogIdentity} Identidade lida.
     * @throws {Error} Se faltar título, `<small>` original ou ano.
     */
    readIdentity($, html, url, candidate) {
      const titleText = $('title').first().text().trim();
      const match = /^(.*?)\s*\((\d{4})\)/.exec(titleText);
      const title = match !== null ? match[1].trim() : candidate.title.trim();
      const year = match !== null ? Number(match[2]) : candidate.year;
      const original = $('h1').first().find('small').first().text().trim();
      if (title === '' || original === '') throw new Error(`Página ${url} sem título ou original`);
      if (year === null || !Number.isInteger(year)) throw new Error(`Página ${url} sem ano`);
      return {
        title,
        originalTitle: original,
        year,
        imdbId: null,
      };
    },

    /**
     * Confere a identidade do VisionCine com o TMDB.
     * @param {CatalogIdentity} identity - Identidade lida.
     * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
     * @returns {boolean} True quando o candidato pode ser aceito.
     */
    matchesIdentity(identity, media) {
      if (!titleMatches([identity.title, identity.originalTitle], media)) return false;
      if (media.year !== null && identity.year !== media.year) return false;
      return true;
    },
  },
]);

/**
 * Reconhece uma página de busca DLE mesmo sem cartões.
 *
 * Consultas não latinas podem vir sem a mensagem “site search yielded no results”, mas com o
 * formulário de busca. Nesse caso, a lista vazia é ausência; uma página sem esses marcadores é
 * erro de layout.
 *
 * @param {object} $ - Instância do cheerio.
 * @returns {boolean} True quando a página tem o formulário de busca do catálogo.
 */
function isSearchPage($) {
  return $('input[name="story"]').length > 0 || $('#searchinput').length > 0;
}

/**
 * Títulos do TMDB usados na comparação.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Título PT-BR, original e alternativos.
 */
export function mediaTitles(media) {
  return [media.title, media.originalTitle, ...media.alternativeTitles];
}

/**
 * Maior semelhança entre os títulos do candidato e os títulos do TMDB.
 *
 * @param {string[]} titles - Títulos do candidato.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {number} Similaridade entre 0 e 1.
 */
export function bestTitleScore(titles, media) {
  const references = mediaTitles(media);
  let best = 0;
  for (const title of titles) {
    for (const reference of references) {
      const score = titleSimilarity(title, reference);
      if (score > best) best = score;
    }
  }
  return best;
}

/**
 * Confere se algum título do candidato atinge o score mínimo.
 *
 * @param {string[]} titles - Títulos do candidato.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {boolean} True quando a semelhança atinge `MIN_TITLE_SCORE`.
 */
export function titleMatches(titles, media) {
  return bestTitleScore(titles.filter((title) => typeof title === 'string' && title.trim() !== ''), media) >= MIN_TITLE_SCORE;
}

/**
 * Extrai um IMDb de `sameAs` do JSON-LD ou de um link visível.
 *
 * @param {object} $ - Instância do cheerio.
 * @returns {string|null} IMDb no formato `tt1234567`, quando publicado.
 */
function findImdbId($) {
  const scripts = $('script[type="application/ld+json"]');
  for (let index = 0; index < scripts.length; index += 1) {
    if (scripts.eq(index).attr('type') !== 'application/ld+json') continue;
    let value;
    try {
      value = JSON.parse(scripts.eq(index).text());
    } catch {
      continue;
    }
    const found = findSameAs(value);
    if (found !== null) return found;
  }
  const href = $('a[href*="imdb.com/title/tt"]').first().attr('href') || '';
  const match = /tt\d{5,}/.exec(href);
  return match ? match[0] : null;
}

/**
 * Procura um IMDb dentro de `sameAs` em um JSON-LD.
 *
 * @param {*} value - Valor JSON-LD.
 * @returns {string|null} IMDb encontrado ou null.
 */
function findSameAs(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSameAs(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  if (value.sameAs !== undefined) {
    const found = readImdbValue(value.sameAs);
    if (found !== null) return found;
  }
  for (const key of Object.keys(value)) {
    const found = findSameAs(value[key]);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Lê um IMDb de um valor `sameAs` (texto ou lista).
 *
 * @param {*} value - Valor de `sameAs`.
 * @returns {string|null} IMDb encontrado ou null.
 */
function readImdbValue(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readImdbValue(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== 'string') return null;
  const match = /tt\d{5,}/.exec(value);
  return match ? match[0] : null;
}

/**
 * Remove o prefixo "Assistir" e o sufixo "em HD" do `alt`/`title` do cartão.
 *
 * @param {string} value - Texto do atributo.
 * @returns {string} Título limpo.
 */
function cleanAlt(value) {
  return value
    .replace(/^Assistir\s+/i, '')
    .replace(/\s+em\s+HD$/i, '')
    .trim();
}
