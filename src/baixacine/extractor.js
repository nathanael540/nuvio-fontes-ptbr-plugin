/**
 * Baixa Cine: busca HTML no formulário público do site e magnet do post confirmado.
 *
 * O site consulta o catálogo pelo formulário `index.php?busca=` (a rota `/?s=` é ignorada e
 * devolve a home); cada post no detalhe publica magnets. A confirmação da identidade entre
 * resultado e `MediaInfo` usa título, ano e tipo, com variantes de título para sufixos de
 * edição e temporada, via `findBestMatch` do bloco `title-match`.
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
// Separa títulos compostos do cartão ("The Avengers - Os Vingadores - 4K").
const TITLE_SEPARATOR = /\s+[-–—/|]\s+/;
// Sufixos de edição ou temporada no fim do título do cartão.
const TITLE_SUFFIX = /\s*(?:[-–—|/]\s*)?(?:\(?\s*(?:4k|60\s*fps|imax(?:\s+open\s+matte)?|blu-?ray|web-?dl|webrip|dublado|legendado|legendada|nacional|completo|completa|hd|sd)\s*\)?|\d+ª?\s*(?:at[ée]\s*ª?\s*\d+\s*)?temporada(?:\s+completa)?|todas\s+as\s+temporadas)\s*$/i;
// Tamanho textual de um único arquivo, como o site publica.
const SIZE_VALUE = /^\d+(?:[.,]\d+)?\s*(?:GB|MB|KB)$/i;

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
  const $ = loadHtml(detailHtml);
  const magnets = readMagnets($);
  if (!magnets.length) throw new Error(`Detalhe do post ${match.url} sem magnet válido`);
  const audio = readInfo($, 'Idioma / áudio');
  const quality = readInfo($, 'Qualidade');
  const size = readSize($, magnets.length);
  const streams = [];
  for (const magnet of magnets) {
    const format = formatDetails(media);
    if (magnet.dn) format.filename = magnet.dn;
    const language = languageFromTexts([magnet.dn, audio]);
    const fields = {
      url: magnet.href,
      quality: discoverQuality([magnet.dn, magnets.length === 1 ? quality : null]),
      provider: PROVIDER_NAME,
      type: 'magnet',
      format,
    };
    if (language) fields.language = language;
    if (size) fields.size = size;
    streams.push(buildStream(fields));
  }
  return streams;
}

/**
 * Busca o post confirmado pelo `MediaInfo`: por título do TMDB (PT-BR e alternativos) no
 * formulário de busca do site, escolhendo o cartão com maior semelhança de título/ano. Em pedido
 * de série, o ano do cartão é ignorado (o site publica o ano da temporada, não o da série).
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<{ url: string }|null>} Post confirmado ou null em ausência.
 * @throws {Error} Em falha de rede ou parsing.
 */
async function findContent(media) {
  const matchMedia = media.mediaType === 'tv' ? { ...media, year: null } : media;
  for (const term of searchTerms(media)) {
    const html = await fetchText(searchUrl(term), { profile: 'page' });
    const results = filterByType(parseSearchResults(html), media.mediaType);
    const match = findBestMatch(expandCandidates(results), matchMedia);
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
 * URL do formulário de busca do catálogo (a rota `/?s=` é ignorada pelo site).
 * @param {string} term - Termo de busca não vazio.
 * @returns {string} URL absoluta da busca.
 */
function searchUrl(term) {
  return `${ORIGIN}/index.php?busca=${encodeURIComponent(term)}`;
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
 * Mantém só os cartões do tipo pedido: filme descarta cartões de temporada; série exige o termo
 * "Temporada" no título, porque o site publica séries como pacotes de temporada.
 * @param {{ title: string, year: number|null, url: string }[]} results - Cartões da busca.
 * @param {'movie'|'tv'} mediaType - Tipo pedido pelo app.
 * @returns {{ title: string, year: number|null, url: string }[]} Cartões do tipo pedido.
 */
function filterByType(results, mediaType) {
  return results.filter((result) => {
    const season = /\btemporadas?\b/i.test(result.title);
    return mediaType === 'tv' ? season : !season;
  });
}

/**
 * Expande cada cartão nas variantes de título usadas na confirmação. Cada variante preserva ano e
 * URL do cartão original.
 * @param {{ title: string, year: number|null, url: string }[]} results - Cartões do tipo pedido.
 * @returns {{ title: string, year: number|null, url: string }[]} Cartões com variantes de título.
 */
function expandCandidates(results) {
  const candidates = [];
  for (const result of results) {
    for (const title of titleVariants(result.title)) candidates.push({ ...result, title });
  }
  return candidates;
}

/**
 * Variantes de um título de cartão: o título completo, o título sem sufixos e os trechos separados
 * por " - ", " / ", " | " ou travessão.
 * @param {string} title - Título do cartão.
 * @returns {string[]} Variantes não vazias, sem repetição.
 */
function titleVariants(title) {
  const variants = new Set([title.trim(), baseTitle(title)]);
  for (const part of title.split(TITLE_SEPARATOR)) {
    const value = part.trim();
    if (value === '') continue;
    variants.add(value);
    variants.add(baseTitle(value));
  }
  variants.delete('');
  return [...variants];
}

/**
 * Remove do fim do título sufixos de edição ("4K", "IMAX", "Legendado") e de temporada
 * ("5ª Temporada", "Todas as Temporadas"), preservando o núcleo do título.
 * @param {string} title - Título do cartão.
 * @returns {string} Título sem os sufixos reconhecidos.
 */
function baseTitle(title) {
  let value = title.trim();
  let next = value.replace(TITLE_SUFFIX, '').trim();
  while (next !== value && next !== '') {
    value = next;
    next = value.replace(TITLE_SUFFIX, '').trim();
  }
  return value;
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
 * @param {*} $ - Documento do cheerio com o detalhe do post.
 * @returns {Magnet[]} Magnets válidos; lista vazia quando o post não traz magnet.
 */
function readMagnets($) {
  const anchors = $('a');
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
 * Lê o valor de uma linha `tech-info` do detalhe pelo rótulo exato.
 * @param {*} $ - Documento do cheerio com o detalhe do post.
 * @param {string} label - Rótulo da linha (ex.: "Idioma / áudio").
 * @returns {string|null} Texto do valor ou null quando a linha não existe.
 */
function readInfo($, label) {
  const rows = $('.tech-info-row');
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows.eq(index);
    if (textOf(row.find('.tech-info-label')) === label) {
      return textOf(row.find('.tech-info-value'));
    }
  }
  return null;
}

/**
 * Lê o tamanho textual de um post com um único magnet. Em posts com vários magnets o site lista
 * tamanhos combinados ("1.28 GB / 2.35 GB / 2.46 GB") sem relação verificável com cada arquivo;
 * nesse caso o campo fica ausente em vez de receber um valor possivelmente errado.
 * @param {*} $ - Documento do cheerio com o detalhe do post.
 * @param {number} magnetCount - Quantidade de magnets válidos do post.
 * @returns {string|null} Tamanho com unidade (ex.: "2.48 GB") ou null quando ausente ou ambíguo.
 */
function readSize($, magnetCount) {
  if (magnetCount !== 1) return null;
  const value = readInfo($, 'Tamanho do arquivo');
  return value !== null && SIZE_VALUE.test(value) ? value : null;
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
