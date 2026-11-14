/**
 * Carregamento e texto do HTML do NoveFlix.
 */

/**
 * Carrega um HTML com o cheerio fornecido pelo app.
 * @param {string} html - HTML da página.
 * @returns {*} Instância do cheerio.
 * @throws {Error} Se o HTML não for texto.
 */
export function loadHtml(html) {
  if (typeof html !== 'string') throw new Error(`HTML inválido: ${typeof html} (esperado texto)`);
  const { load } = require('cheerio-without-node-native');
  return load(html);
}

/**
 * Texto de um nó com espaços normalizados.
 * @param {*} node - Seleção do cheerio.
 * @returns {string} Texto aparado.
 */
export function textOf(node) {
  return node.text().replace(/\s+/g, ' ').trim();
}
