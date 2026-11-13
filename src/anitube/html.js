/**
 * Utilitários de HTML do provedor AniTube.
 *
 * O app entrega o `cheerio` restrito (NuvioTV) ou o `cheerio-without-node-native`; o carregamento
 * fica dentro da função para não fazer trabalho no carregamento do módulo.
 */

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
