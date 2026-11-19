/**
 * Baixa Cine: busca HTML no catálogo público do site e magnet do post confirmado.
 *
 * O site publica cartões de filmes e séries consultáveis por busca (`https://baixacine.com/?s=`);
 * cada post no detalhe publica magnets. A confirmação da identidade entre resultado e
 * `MediaInfo` (título e ano) vem de `findBestMatch` do bloco `title-match`.
 */

import { fetchText } from '../_blocks/http/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { readMagnet } from '../_blocks/torrent-release/index.mjs';
import { discoverQuality } from '../_blocks/quality-discovery/index.mjs';
import { languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';

const ORIGIN = 'https://baixacine.com';
const PROVIDER_NAME = 'Baixa Cine';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('../_blocks/torrent-release/index.mjs').Magnet} Magnet
 */

/**
 * Localiza streams do título solicitado no catálogo do site.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<Stream[]>} Streams; lista vazia em ausência.
 * @throws {Error} Em falha de rede, parsing ou dado ausente na fonte.
 */
export async function collectStreams(media) {
  const match = await findContent(media);
  if (!match) return [];
  const detailHtml = await fetchText(match.url, { profile: 'page' });
  const magnets = readMagnets(detailHtml);
  if (!magnets.length) throw new Error(`Detalhe do post ${match.url} sem magnet válido`);
  const language = languageFromTexts([magnets[0].dn, 'Idioma / áudio Português']);
  const size = readSize(detailHtml);
  const streams = [];
  for (const magnet of magnets) {
    const format = formatDetails(media);
    if (magnet.dn) format.filename = magnet.dn;
    const fields = {
      url: magnet.href,
      quality: discoverQuality([magnet.dn, detailHtml]),
      language,
      provider: PROVIDER_NAME,
      type: 'magnet',
      format,
    };
    if (size !== null) fields.size = size;
    streams.push(buildStream(fields));
  }
  return streams;
}

/**
 * Busca o post confirmado pelo `MediaInfo`: por título do TMDB (PT-BR e alternativos) na página
 * de busca, escolhendo o cartão com maior semelhança de título/ano.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<{ url: string }|null>} Post confirmado ou null em ausência.
 * @throws {Error} Em falha de rede ou parsing.
 */
async function findContent(media) {
  for (const term of searchTerms(media)) {
    const html = await fetchText(searchUrl(term), { profile: 'page' });
    const match = findBestMatch(parseSearchResults(html), media);
    if (match) return { url: match.candidate.url };
  }
  return null;
}

/**
 * Termos de busca para o `MediaInfo`: título em português do Brasil e títulos originais e
 * alternativos, sem repetição nem vazio.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Termos não vazios em ordem de preferência.
 */
function searchTerms(media) {
  const terms = [];
  for (const title of [media.title, media.originalTitle, ...media.alternativeTitles]) {
    const value = typeof title === 'string' ? title.trim() : '';
    if (value && !terms.includes(value)) terms.push(value);
  }
  return terms;
}

/**
 * URL da página de busca do catálogo.
 * @param {string} term - Termo de busca não vazio.
 * @returns {string} URL absoluta da busca.
 */
function searchUrl(term) {
  return `${ORIGIN}/?s=${encodeURIComponent(term)}`;
}

/**
 * Carrega um HTML com o cheerio fornecido pelo app.
 * @param {string} html - HTML da página.
 * @returns {*} Instância do cheerio.
 * @throws {Error} Se o HTML não for texto.
 */
function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}

/**
 * Texto de um nó com espaços normalizados e sem marcas.
 * @param {*} node - Seleção do cheerio.
 * @returns {string} Texto aparado.
 */
function textOf(node) {
  return node.text().replace(/\s+/g, ' ').trim();
}

/**
 * Lê os cartões de resultado da página de busca: href, título e ano.
 * @param {string} html - HTML da página de busca.
 * @returns {{ title: string, year: number|null, url: string }[]} Cartões válidos; páginas sem
 * resultados devolvem lista vazia.
 */
function parseSearchResults(html) {
  const cards = loadHtml(html)('a.poster-link');
  const results = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const url = card.attr('href');
    const title = textOf(card.find('h3.poster-title'));
    const yearText = textOf(card.find('span.poster-year'));
    if (typeof url !== 'string' || url === '' || title === '') continue;
    results.push({ title, year: readYear(yearText), url: new URL(url, ORIGIN).href });
  }
  return results;
}

/**
 * Lê o ano de 4 dígitos de um texto de cartão.
 * @param {string} text - Texto do ano.
 * @returns {number|null} Ano ou null quando ausente.
 */
function readYear(text) {
  const match = /(\d{4})/.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * Extrai os magnets válidos do HTML do post: hash hexadecimal de 40 caracteres em `xt`
 * (base32 convertido), deduplicado por hash. magnets inválidos são descartados isoladamente.
 * @param {string} html - HTML do detalhe do post.
 * @returns {Magnet[]} Magnets válidos; lista vazia quando o post não traz magnet.
 */
function readMagnets(html) {
  const anchors = loadHtml(html)('a');
  const magnets = [];
  const seen = new Set();
  for (let index = 0; index < anchors.length; index += 1) {
    const href = anchors.eq(index).attr('href');
    if (typeof href !== 'string' || !/^magnet:\?/i.test(href)) continue;
    let magnet;
    try {
      magnet = readMagnet(href, { addFallbackTrackers: true });
    } catch (error) {
      console.warn(`[Baixa Cine] Magnet sem formato válido descartado: ${error.message}`);
      continue;
    }
    if (seen.has(magnet.hash)) continue;
    seen.add(magnet.hash);
    magnets.push(magnet);
  }
  return magnets;
}

/**
 * Lê o tamanho textual do arquivo do post a partir de "Tamanho do arquivo".
 * @param {string} html - HTML do detalhe do post.
 * @returns {string|null} Tamanho com unidade (ex.: "2.48 GB") ou null quando ausente.
 */
function readSize(html) {
  const match = /Tamanho do arquivo[\s\S]{0,400}?(\d+(?:[.,]\d+)?\s*(?:GB|MB|KB)\b)/i.exec(html);
  return match ? match[1] : null;
}

/**
 * Detalhes do stream para o formatador (bloco custom-formatter).
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {object} Valor do campo `format` de `buildStream`.
 */
function formatDetails(media) {
  const format = { template: FORMATTER.AUTO, addon: PROVIDER_NAME, title: media.title };
  if (media.year !== null) format.year = media.year;
  return format;
}
