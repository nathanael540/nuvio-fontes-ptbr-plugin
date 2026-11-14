/**
 * Carregamento do HTML com o cheerio fornecido pelo app.
 *
 * O `require` fica dentro da função para não fazer trabalho no carregamento do módulo. Apenas a API
 * básica aceita pelo NuvioTV é usada pelo leitor de páginas.
 */

/**
 * Carrega um HTML com o cheerio fornecido pelo app.
 * @param {string} html - HTML da página.
 * @returns {*} Instância do cheerio.
 * @throws {Error} Se o HTML não for texto.
 * @example
 * const $ = loadHtml('<a href="/watch/1">Episódio 1</a>');
 */
export function loadHtml(html) {
  if (typeof html !== 'string') {
    throw new Error(`HTML inválido: ${typeof html} (esperado texto)`);
  }
  const { load } = require('cheerio-without-node-native');
  return load(html);
}
