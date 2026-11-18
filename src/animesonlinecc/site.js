/**
 * Acesso e utilitários do site do AnimesOnlineCC.
 *
 * A fonte é um WordPress com tema DooPlay e catálogo somente de animes. A busca é
 * `GET /?s=<termo>`, as fichas ficam em `/anime/<slug>/` e os episódios em `/episodio/<slug>/`.
 * O carregamento do cheerio fica dentro da função para não fazer trabalho no carregamento do módulo.
 */

/** Origem do catálogo, usada como base das URLs. */
export const SITE_URL = 'https://animesonlinecc.to';

/** Caminho das fichas de anime. */
export const ANIME_PATH = '/anime/';

/** Caminho das páginas de episódio. */
export const EPISODE_PATH = '/episodio/';

/**
 * Monta a URL da busca HTML.
 * @param {string} term - Termo de busca.
 * @returns {string} URL absoluta de `/?s=<termo>`.
 * @throws {Error} Se o termo não for texto não vazio.
 * @example
 * buildSearchUrl('Naruto Shippuden');
 * // 'https://animesonlinecc.to/?s=Naruto+Shippuden'
 */
export function buildSearchUrl(term) {
  if (typeof term !== 'string' || term.trim() === '') {
    throw new Error(`Termo de busca inválido: ${String(term)} (esperado texto não vazio)`);
  }
  return `${SITE_URL}/?${new URLSearchParams({ s: term.trim() }).toString()}`;
}

/**
 * Monta a URL da ficha do anime.
 * @param {string} slug - Slug publicado pela busca.
 * @returns {string} URL absoluta de `/anime/<slug>/`.
 * @throws {Error} Se o slug não for texto não vazio.
 * @example
 * buildAnimeUrl('naruto-shippuden');
 * // 'https://animesonlinecc.to/anime/naruto-shippuden/'
 */
export function buildAnimeUrl(slug) {
  if (typeof slug !== 'string' || slug.trim() === '') {
    throw new Error(`Slug de anime inválido: ${String(slug)} (esperado texto não vazio)`);
  }
  return `${SITE_URL}${ANIME_PATH}${encodeURIComponent(slug.trim())}/`;
}

/**
 * Carrega um HTML com o cheerio fornecido pelo app.
 * @param {string} html - HTML da página.
 * @returns {*} Instância do cheerio.
 */
export function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}

/**
 * Texto de um nó com espaços normalizados.
 * @param {*} node - Seleção do cheerio.
 * @returns {string} Texto sem espaços repetidos nas pontas.
 */
export function textOf(node) {
  return node.text().replace(/\s+/g, ' ').trim();
}

/**
 * Remove URL e hash longos das mensagens de log e das causas agregadas.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 * @example
 * sanitizeMessage('HTTP 500 em https://host.example/e/abc');
 * // 'HTTP 500 em [url]'
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}
