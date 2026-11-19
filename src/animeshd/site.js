/**
 * Acesso e utilitários do site do AnimesHD.
 *
 * A fonte é um WordPress com tema DooPlay e catálogo somente de séries de anime. A busca é
 * `GET /?s=<termo>`, as fichas ficam em `/animes/<slug>/` e os episódios em `/episodios/<slug>/`.
 * O carregamento do cheerio fica dentro da função para não fazer trabalho no carregamento do módulo.
 */

/** Origem do catálogo, usada como base das URLs. */
export const SITE_URL = 'https://animeshd.to';

/** Caminho das fichas de anime. */
export const ANIME_PATH = '/animes/';

/** Caminho das páginas de episódio. */
export const EPISODE_PATH = '/episodios/';

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const ENGLISH_DATE = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Monta a URL da busca HTML.
 * @param {string} term - Termo de busca.
 * @returns {string} URL absoluta de `/?s=<termo>`.
 * @throws {Error} Se o termo não for texto não vazio.
 * @example
 * buildSearchUrl('Kimetsu no Yaiba');
 * // 'https://animeshd.to/?s=Kimetsu+no+Yaiba'
 */
export function buildSearchUrl(term) {
  if (typeof term !== 'string' || term.trim() === '') {
    throw new Error(`Termo de busca inválido: ${String(term)} (esperado texto não vazio)`);
  }
  return `${SITE_URL}/?${new URLSearchParams({ s: term.trim() }).toString()}`;
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
 * Converte a data publicada pela fonte em `AAAA-MM-DD`.
 *
 * A fonte usa datas em inglês, como `Apr. 06, 2019`, no `span.date` da ficha e dos episódios.
 * Também aceita uma data já em ISO para manter os testes e o leitor previsíveis.
 *
 * @param {string} text - Data publicada.
 * @returns {string|null} Data em `AAAA-MM-DD` ou `null` quando o texto não contém data válida.
 * @example
 * parseSourceDate('Apr. 06, 2019'); // '2019-04-06'
 * parseSourceDate('sem data'); // null
 */
export function parseSourceDate(text) {
  if (typeof text !== 'string') return null;
  const value = text.trim();
  const iso = ISO_DATE.exec(value);
  if (iso !== null) {
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return value;
  }

  const match = ENGLISH_DATE.exec(value);
  if (match === null) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) return null;
  const day = Number(match[2]);
  if (day < 1 || day > 31) return null;
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Lê o ano de uma data publicada.
 * @param {string} text - Data publicada.
 * @returns {number|null} Ano de quatro dígitos ou `null` quando a data não é válida.
 * @example
 * readYear('Apr. 06, 2019'); // 2019
 */
export function readYear(text) {
  const date = parseSourceDate(text);
  return date === null ? null : Number(date.slice(0, 4));
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
