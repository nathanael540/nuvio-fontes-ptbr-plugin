/**
 * Bloco wordpress-torrent: busca na REST do WordPress e monta os streams de magnet de um catálogo.
 *
 * Serve sites de torrent em WordPress que publicam os magnets no HTML do post (ex.: rede Comando).
 * A lista vem de `/wp-json/wp/v2/posts` e o HTML do post está em `content.rendered`. Episódio
 * avulso e filme seguem como magnet; pacote da temporada e faixa de episódios viram
 * `torrent://<hash>/<índice>` com o arquivo do episódio. Em pedido de filme, posts de
 * coleção (trilogia, "todos os filmes") saem por triagem, porque o app tocaria o maior arquivo.
 *
 * Depende dos blocos http, slugify e torrent-release.
 */

import { fetchJson } from '../http/index.mjs';
import { normalizeText, slugify } from '../slugify/index.mjs';
import {
  classifyMagnetOption,
  isCollectionTitle,
  resolveTorrentOptions,
  seasonNumbers,
  splitSizes,
} from '../torrent-release/index.mjs';

const LABEL_WINDOW = 240;

/**
 * @typedef {object} WordpressCatalog
 * @property {string} name - Nome do catálogo; vai para o campo `provider` do stream.
 * @property {string[]} origins - Domínios do mesmo banco, em ordem de reserva (ex.: `https://site.tv`).
 * @property {string} logPrefix - Prefixo dos logs, sem colchetes (ex.: `Filmestorrent`).
 * @property {string} streamLabel - Nome do provedor exibido como `addon` do formatador (ex.: `Filmestorrent`).
 */

/**
 * Localiza os posts do título num catálogo e resolve cada magnet em isolamento.
 *
 * Busca primeiro pelo IMDb e depois pelos títulos do TMDB. Dentro do catálogo, troca de domínio só
 * por erro de rede, HTTP fora de 2xx ou corpo que não seja a lista JSON; lista vazia é busca válida.
 * Falha de uma opção vira `console.warn` e não derruba as outras; triagem vira `console.log`.
 * Todo stream sai formatado por `torrent-release`, com `streamLabel` como `addon` e a qualidade
 * desconhecida preservada como `Desconhecida`.
 *
 * @param {WordpressCatalog} catalog - Domínios e rótulos do catálogo.
 * @param {import('../tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB (`getMediaInfo`).
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido já validado.
 * @returns {Promise<object[]>} Streams do catálogo, ainda não ordenados; vazio quando o título não existe.
 * @throws {Error} Se o catálogo ou o MediaInfo forem inválidos, se todos os domínios falharem ou se
 *   nenhuma opção produzir stream depois de alguma falha.
 * @example
 * const streams = await collectWordpressTorrents({
 *   name: 'Comando', origins: ['https://filmestorrent.tv'], logPrefix: 'Filmestorrent', streamLabel: 'Filmestorrent',
 * }, media, { mediaType: 'movie', season: null, episode: null });
 */
export async function collectWordpressTorrents(catalog, media, request) {
  readCatalog(catalog);
  readMedia(media);
  const posts = await locatePosts(catalog, media, request);
  if (!posts.length) {
    console.log(`[${catalog.logPrefix}] Nenhum post corresponde a "${media.title}"`);
    return [];
  }
  const options = posts.flatMap((post) => optionsFrom(post, media, request));
  if (!options.length) {
    console.log(`[${catalog.logPrefix}] Nenhum magnet nos posts ${posts.map((post) => post.id).join(', ')}`);
    return [];
  }
  return resolveTorrentOptions(options, {
    logPrefix: catalog.logPrefix,
    streamLabel: catalog.streamLabel,
    provider: catalog.name,
  });
}

/**
 * @param {WordpressCatalog} catalog
 * @returns {void}
 */
function readCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object') throw new Error('catálogo deve ser objeto');
  for (const field of ['name', 'logPrefix', 'streamLabel']) {
    if (typeof catalog[field] !== 'string' || catalog[field].trim() === '') throw new Error(`catálogo sem ${field}`);
  }
  if (!Array.isArray(catalog.origins) || !catalog.origins.length ||
      !catalog.origins.every((origin) => /^https?:\/\/[^/]+$/.test(origin))) {
    throw new Error('catálogo.origins deve listar domínios http(s) sem barra final');
  }
}

/**
 * @param {import('../tmdb-info/index.mjs').MediaInfo} media
 * @returns {void}
 */
function readMedia(media) {
  if (!media || typeof media.title !== 'string' || typeof media.originalTitle !== 'string') {
    throw new Error('MediaInfo sem title ou originalTitle');
  }
  if (!Array.isArray(media.alternativeTitles)) throw new Error('MediaInfo sem alternativeTitles');
  if (media.year !== null && !Number.isInteger(media.year)) throw new Error('MediaInfo.year inválido');
  if (media.imdbId !== null && typeof media.imdbId !== 'string') throw new Error('MediaInfo.imdbId inválido');
}

/**
 * @param {WordpressCatalog} catalog
 * @param {import('../tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {Promise<object[]>}
 */
async function locatePosts(catalog, media, request) {
  if (typeof media.imdbId === 'string' && media.imdbId !== '') {
    const byImdb = await searchPosts(catalog, media.imdbId);
    const selected = byImdb.filter((post) => matches(catalog, post, media, request, true));
    if (selected.length) return selected;
  }
  for (const query of searchQueries(media, request)) {
    const posts = await searchPosts(catalog, query);
    const selected = posts.filter((post) => matches(catalog, post, media, request, false));
    if (selected.length) return selected;
  }
  return [];
}

/**
 * @param {WordpressCatalog} catalog
 * @param {string} term
 * @returns {Promise<object[]>}
 */
async function searchPosts(catalog, term) {
  const failures = [];
  for (const origin of catalog.origins) {
    const host = new URL(origin).host;
    const url = postsUrl(origin, term);
    try {
      const data = await fetchJson(url, { profile: 'api' });
      if (!Array.isArray(data)) {
        failures.push(`${host}: resposta não é a lista JSON da REST`);
        continue;
      }
      console.log(`[${catalog.logPrefix}] Busca "${term}" em ${host}: ${data.length} post(s)`);
      return data.map(readPost);
    } catch (error) {
      failures.push(`${host}: ${error.message}`);
    }
  }
  throw new Error(`Todos os domínios falharam na busca "${term}": [${failures.join('; ')}]`);
}

/**
 * @param {string} origin
 * @param {string} search
 * @returns {string}
 */
function postsUrl(origin, search) {
  const query = new URLSearchParams({
    search,
    _fields: 'id,link,title,content',
    per_page: '20',
  });
  return `${origin}/wp-json/wp/v2/posts?${query}`;
}

/**
 * @param {object} item
 * @returns {object}
 */
function readPost(item) {
  if (!item || !Number.isInteger(item.id) || !item.title || typeof item.title.rendered !== 'string' ||
      !item.content || typeof item.content.rendered !== 'string') {
    throw new Error('post da REST fora do formato esperado (id, title.rendered, content.rendered)');
  }
  const html = item.content.rendered;
  const title = strip(item.title.rendered);
  return {
    id: item.id,
    title,
    html,
    imdbIds: [...new Set([...html.matchAll(/imdb\.com\/title\/(tt\d+)/gi)].map((match) => match[1]))],
    audio: labeled(html, ['Áudio', 'Audio', 'Idioma', 'Idiomas', 'Idioma do Áudio']),
    sizeField: labeled(html, ['Tamanho']),
    year: readYear(html, title),
  };
}

/**
 * @param {WordpressCatalog} catalog
 * @param {object} post
 * @param {import('../tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @param {boolean} requireImdb
 * @returns {boolean}
 */
function matches(catalog, post, media, request, requireImdb) {
  if (request.mediaType === 'movie' && isCollectionTitle(post.title)) {
    console.log(`[${catalog.logPrefix}] Post ${post.id} descartado por triagem: coleção de filmes`);
    return false;
  }
  if (requireImdb) {
    if (!post.imdbIds.includes(media.imdbId)) return false;
  } else if (media.imdbId && post.imdbIds.length && !post.imdbIds.includes(media.imdbId)) {
    return false;
  }
  const seasons = seasonNumbers(post.title);
  if (request.mediaType === 'tv') {
    if (seasons.length !== 1 || seasons[0] !== request.season) return false;
  } else if (seasons.length) {
    return false;
  }
  if (!requireImdb && !titleCovers(post.title, media)) return false;
  if (!requireImdb && request.mediaType === 'movie' && !yearCompatible(post, media)) return false;
  return true;
}

/**
 * @param {import('../tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request
 * @returns {string[]}
 */
function searchQueries(media, request) {
  const queries = [];
  for (const title of [media.title, media.originalTitle, ...media.alternativeTitles]) {
    if (typeof title !== 'string' || title.trim() === '') continue;
    let words;
    try {
      words = slugify(title, { separator: ' ' });
    } catch {
      continue;
    }
    const query = request.mediaType === 'tv' ? `${words} ${request.season} temporada` : words;
    if (!queries.includes(query)) queries.push(query);
  }
  if (!queries.length) throw new Error('nenhum título com letras latinas ou números para buscar');
  return queries;
}

/**
 * @param {string} postTitle
 * @param {import('../tmdb-info/index.mjs').MediaInfo} media
 * @returns {boolean}
 */
function titleCovers(postTitle, media) {
  const haystack = new Set(normalizeText(postTitle).split(' ').filter(Boolean));
  return [media.title, media.originalTitle, ...media.alternativeTitles].some((title) => {
    if (typeof title !== 'string' || title.trim() === '') return false;
    const words = normalizeText(title).split(' ').filter(Boolean);
    const significant = words.filter((word) => word.length >= 3);
    const required = significant.length ? significant : words;
    return required.length > 0 && required.every((word) => haystack.has(word));
  });
}

/**
 * @param {object} post
 * @param {import('../tmdb-info/index.mjs').MediaInfo} media
 * @returns {boolean}
 */
function yearCompatible(post, media) {
  if (post.year === null || media.year === null) return true;
  return Math.abs(post.year - media.year) <= 1;
}

/**
 * @param {string} html
 * @param {string} title
 * @returns {number|null}
 */
function readYear(html, title) {
  const field = labeled(html, ['Ano de Lançamento', 'Lançamento no Brasil', 'Lançamento']);
  const fromField = field && /((?:19|20)\d{2})/.exec(field);
  if (fromField) return Number(fromField[1]);
  const fromTitle = /\(((?:19|20)\d{2})\)/.exec(title);
  return fromTitle ? Number(fromTitle[1]) : null;
}

/**
 * @param {object} post
 * @param {import('../tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {object[]}
 */
function optionsFrom(post, media, request) {
  const anchors = magnetAnchors(post.html);
  if (!anchors.length && /magnet:\?/i.test(post.html)) {
    throw new Error(`magnets no post ${post.id} não puderam ser lidos`);
  }
  const sizes = splitSizes(post.sizeField);
  return anchors.map((anchor, index) => {
    const assignedSize = sizes.length === anchors.length || sizes.length === 1
      ? (sizes.length === 1 ? sizes[0] : sizes[index])
      : null;
    return classifyMagnetOption({
      href: anchor.href,
      labelText: `${anchor.before} ${anchor.inner}`.trim(),
      contextText: post.title,
      audio: post.audio,
      size: assignedSize,
    }, media, request);
  });
}

/**
 * @param {string} html
 * @returns {{ href: string, inner: string, before: string }[]}
 */
function magnetAnchors(html) {
  const found = [];
  const pattern = /<a\b[^>]*href=(["'])(magnet:\?[\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let previous = 0;
  while ((match = pattern.exec(html)) !== null) {
    const before = strip(html.slice(previous, match.index)).slice(-LABEL_WINDOW);
    previous = match.index + match[0].length;
    found.push({ href: decodeEntities(match[2]), inner: strip(match[3]), before });
  }
  return found;
}

/**
 * @param {string} html
 * @param {string[]} names
 * @returns {string|null}
 */
function labeled(html, names) {
  for (const name of names) {
    const match = new RegExp(`<(?:strong|b)>\\s*${name}\\s*:?\\s*</(?:strong|b)>\\s*:?\\s*([^<]+)`, 'i').exec(html);
    if (match) return strip(match[1]);
  }
  return null;
}

/**
 * @param {string} html
 * @returns {string}
 */
function strip(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
