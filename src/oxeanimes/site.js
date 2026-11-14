/**
 * Endereços e contexto HTTP do catálogo OxeAnimes.
 *
 * A fonte publica busca JSON, páginas por obra e uma API de episódio no mesmo domínio. O proxy de
 * reprodução exige `Referer` do site; nenhum endereço assinado é montado aqui.
 */

/** Origem do catálogo, usada como base de URLs relativas e como `Referer`. */
export const SITE_URL = 'https://oxeanimes.com.br/';

/**
 * Cabeçalhos de contexto enviados às rotas públicas da fonte.
 * @type {Readonly<Record<string, string>>}
 */
export const SITE_HEADERS = Object.freeze({ Referer: SITE_URL });

/**
 * Monta a URL da busca JSON.
 * @param {string} term - Termo de busca.
 * @returns {string} URL absoluta de `/api/chat-search`.
 * @throws {Error} Se o termo não for texto não vazio.
 * @example
 * buildSearchUrl('Kimetsu no Yaiba');
 * // 'https://oxeanimes.com.br/api/chat-search?q=Kimetsu+no+Yaiba'
 */
export function buildSearchUrl(term) {
  if (typeof term !== 'string' || term.trim() === '') {
    throw new Error(`termo de busca inválido: ${describe(term)} (esperado texto não vazio)`);
  }
  return `${SITE_URL}api/chat-search?${new URLSearchParams({ q: term.trim() }).toString()}`;
}

/**
 * Monta a URL da página de uma obra.
 * @param {string} slug - Slug publicado pela fonte, último segmento de `/anime/<slug>`.
 * @returns {string} URL absoluta da página da obra.
 * @throws {Error} Se o slug não for texto não vazio.
 * @example
 * buildAnimeUrl('kimetsu-no-yaiba');
 * // 'https://oxeanimes.com.br/anime/kimetsu-no-yaiba'
 */
export function buildAnimeUrl(slug) {
  if (typeof slug !== 'string' || slug.trim() === '') {
    throw new Error(`slug inválido: ${describe(slug)} (esperado texto não vazio)`);
  }
  return `${SITE_URL}anime/${encodeURIComponent(slug.trim())}`;
}

/**
 * Monta a URL da API do episódio.
 * @param {string} id - ID do episódio lido do link `/watch/<id>`.
 * @param {string} slug - Slug da obra, exigido pela API.
 * @returns {string} URL absoluta de `/api/episode/<id>`.
 * @throws {Error} Se o ID ou o slug não forem texto não vazio.
 * @example
 * buildEpisodeUrl('9677', 'kimetsu-no-yaiba');
 * // 'https://oxeanimes.com.br/api/episode/9677?slug=kimetsu-no-yaiba'
 */
export function buildEpisodeUrl(id, slug) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`ID de episódio inválido: ${describe(id)} (esperado texto não vazio)`);
  }
  if (typeof slug !== 'string' || slug.trim() === '') {
    throw new Error(`slug inválido: ${describe(slug)} (esperado texto não vazio)`);
  }
  return `${SITE_URL}api/episode/${encodeURIComponent(id.trim())}?${new URLSearchParams({ slug: slug.trim() }).toString()}`;
}

/**
 * Resolve um caminho relativo da fonte contra a origem do site.
 * @param {string} value - URL absoluta ou caminho relativo.
 * @returns {string} URL absoluta.
 * @throws {Error} Se o valor não for texto não vazio ou não formar URL http(s).
 * @example
 * resolveSiteUrl('/api/stream?url=abc');
 * // 'https://oxeanimes.com.br/api/stream?url=abc'
 */
export function resolveSiteUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`URL inválida: ${describe(value)} (esperado texto não vazio)`);
  }
  let url;
  try {
    url = new URL(value.trim(), SITE_URL);
  } catch (error) {
    throw new Error(`URL inválida: "${value.trim()}" (${error.message})`, { cause: error });
  }
  if (url.protocol !== 'https:') {
    throw new Error(`URL fora do HTTPS: "${value.trim()}"`);
  }
  return url.href;
}

/**
 * Representação curta de um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
