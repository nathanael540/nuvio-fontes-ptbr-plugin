/**
 * Página do Blogger: desescapa o HTML e extrai os MP4 progressivos do Google Video por `itag`.
 *
 * A página publica as URLs dentro de uma string JavaScript escapada; o `itag` só aparece depois do
 * desescape. O provedor aceita somente `videoplayback` com `itag` numérico, descarta o fluxo `sabr`
 * fragmentado e deduplica por URL exata. A extração é textual e local: sem rede, cheerio ou log.
 */

import { UNKNOWN_QUALITY } from '../_blocks/quality-discovery/index.mjs';
import { sortByQuality } from '../_blocks/stream-build/index.mjs';

const STREAMING_DATA_MARKER = 'streamingData';
const VIDEO_URL = /https?:\/\/(?:[a-z0-9-]+\.)+googlevideo\.com\/videoplayback\?[^\s"'<>\\]*/gi;
const ITAG_PARAM = /[?&]itag=(\d+)(?:&|$)/;
const TRAILING_PUNCTUATION = /[).,;:!\]]+$/;
const ITAG_QUALITIES = Object.freeze({ 18: '360p', 43: '360p', 22: '720p', 37: '1080p' });

/**
 * @typedef {object} VideoOption
 * @property {string} url - URL do MP4 progressivo no Google Video.
 * @property {string} quality - Qualidade normalizada pelo `itag` (`Desconhecida` fora do mapa).
 */

/**
 * Extrai as opções de MP4 progressivo publicadas na página do Blogger.
 *
 * @param {string} html - HTML bruto da página do player.
 * @returns {VideoOption[]} Opções sem URL repetida, da maior para a menor qualidade; lista vazia
 *   quando a página é válida mas não publica nenhum `itag` reconhecível.
 * @throws {Error} Se o HTML for vazio ou não tiver `streamingData` (bloqueio, login ou página
 *   inesperada); a mensagem é prefixada por `Blogger:`.
 * @example
 * extractVideoOptions('<script>var p = {"streamingData":...}</script>');
 * // [{ url: 'https://rr1---sn-example.googlevideo.com/videoplayback?itag=22', quality: '720p' }]
 */
export function extractVideoOptions(html) {
  if (typeof html !== 'string' || html.trim() === '') {
    throw new Error('Blogger: página vazia');
  }
  const text = unescapePage(html);
  if (!text.includes(STREAMING_DATA_MARKER)) {
    throw new Error('Blogger: página sem streamingData (bloqueio, login ou HTML inesperado)');
  }

  const options = [];
  const seen = new Set();
  for (const match of text.match(new RegExp(VIDEO_URL.source, 'gi')) || []) {
    const url = match.replace(TRAILING_PUNCTUATION, '');
    const itag = ITAG_PARAM.exec(url);
    if (itag === null || seen.has(url)) continue;
    seen.add(url);
    options.push({ url, quality: ITAG_QUALITIES[Number(itag[1])] || UNKNOWN_QUALITY });
  }
  return sortByQuality(options);
}

/**
 * Desescapa o HTML na ordem observada na página: `\uXXXX`, `\/`, `&quot;` e `&amp;`.
 * A ordem importa: o `itag` só aparece depois do primeiro passo e `&amp;` pode esconder um parâmetro.
 * @param {string} html - HTML bruto.
 * @returns {string} Texto desescapado.
 */
function unescapePage(html) {
  return html
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
