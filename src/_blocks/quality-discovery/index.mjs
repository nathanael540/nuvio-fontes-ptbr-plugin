/**
 * Bloco quality-discovery: normaliza a qualidade e descobre a qualidade em textos já obtidos.
 *
 * A descoberta é somente local: lê rótulos, `dn`, nomes de arquivo, pastas e URLs que o provedor já
 * tem em memória. Não faz requisição, sondagem, medição nem espera. Quando nada é reconhecido,
 * devolve `UNKNOWN_QUALITY` para o stream continuar na lista com a qualidade explicitamente
 * desconhecida, em vez de ser descartado.
 *
 * Referência avaliada: divijbindlish/parse-torrent-name (MIT,
 * https://github.com/divijbindlish/parse-torrent-name). Apenas as ideias de resolução
 * (`[0-9]{3,4}p`) e de fonte baixa (`CamRip`, `HDCAM`, `HD-TS`, `TELESYNC`, `TS`) foram
 * consideradas; nenhum trecho de código foi copiado. O parser completo daquela biblioteca
 * (título, temporada, episódio, codec, áudio e grupo) fica fora deste bloco.
 */

import { normalizeText } from '../slugify/index.mjs';

/** Qualidade exibida quando a fonte não informa e a descoberta local não encontra. */
export const UNKNOWN_QUALITY = 'Desconhecida';

const UHD_HEIGHT = 2160;
const FOUR_K = '4K';
const FULL_HD = '1080p';
const CAM = 'CAM';

const QUALITY_TOKEN = /^(\d{3,4})p$/;
// Alturas aceitas em palavra só de dígitos; evita que o ano em "Duna 2024" vire "2024p".
const KNOWN_HEIGHTS = ['144', '240', '360', '480', '540', '576', '720', '1080', '1440', '2160', '4320'];
// "full hd" vira uma palavra só antes de procurar os rótulos, para não ser lido como "hd".
const FULL_HD_SEQUENCE = /\bfull hd\b/g;

// Rótulos de qualidade em ordem de prioridade: o primeiro grupo com palavra presente vence.
const QUALITY_LABEL_RULES = [
  [['4k', 'uhd'], FOUR_K],
  [['fhd', 'fullhd'], FULL_HD],
  [['cam', 'ts', 'hdcam', 'hdts', 'telesync'], CAM],
  [['hd'], '720p'],
  [['sd'], '480p'],
];

// Fonte baixa: prevalece sobre qualquer resolução no mesmo texto.
const CAM_WORDS = /(?:^| )(?:cam|camrip|hdcam|hdts|ts|telesync)(?: |$)/;
// Procura a última qualidade no texto bruto, inclusive colada ao container ("MP4720P").
const QUALITY_SEARCH = /(?:(?:\b|(?:mp4|mkv))(?:144|240|360|480|540|576|720|1080|1440|2160|4320)p|\b\d{3,4}p|\b(?:full\s*hd|hdcam|telesync|camrip|hdts|uhd|4k|fhd|cam|hd|sd))\b/gi;

/**
 * Converte a qualidade informada pela fonte no texto que o app exibe.
 *
 * Número: inteiro de 3–4 dígitos (alturas reais de HLS, como 800 ou 1038, são aceitas), devolvido
 * como "<n>p"; 2160 vira "4K". Texto: normalizado por `normalizeText` (bloco slugify) e lido por
 * palavras, nesta prioridade:
 * 1. palavra "<n>p" com 3–4 dígitos ("1080p");
 * 2. palavra só de dígitos, apenas se for altura conhecida (144, 240, 360, 480, 540, 576, 720, 1080,
 *    1440, 2160, 4320), para que um ano como 2024 não vire qualidade;
 * 3. "4k" ou "uhd" → "4K";
 * 4. "fhd", "fullhd" ou a sequência "full hd" → "1080p";
 * 5. "cam", "ts", "hdcam", "hdts" ou "telesync" → "CAM";
 * 6. "hd" → "720p" (palavra inteira: "HDTV" não conta);
 * 7. "sd" → "480p".
 *
 * @param {number|string} value - Qualidade como a fonte fornece.
 * @returns {string} "<n>p", "4K" ou "CAM".
 * @throws {Error} Se o valor não for reconhecido.
 * @example
 * normalizeQuality(1080); // '1080p'
 * normalizeQuality('WEB-DL 1080p x264'); // '1080p'
 * normalizeQuality('UHD 4K'); // '4K'
 * normalizeQuality('Duna 2024'); // lança Error
 */
export function normalizeQuality(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 9999) {
    return heightToQuality(value);
  }
  if (typeof value === 'string') {
    const quality = qualityFromWords(words(normalizeText(value).replace(FULL_HD_SEQUENCE, 'fullhd')));
    if (quality) return quality;
  }
  throw new Error(`Qualidade não reconhecida: ${describe(value)} (esperado 3–4 dígitos, ex.: "1080p", ou 4K, UHD, FHD, HD, SD, CAM)`);
}

/**
 * Descobre a qualidade em textos que o provedor já obteve, sem rede e sem estimativa.
 *
 * Percorre os textos na ordem recebida, ignora `null`, `undefined` e texto vazio, e devolve a
 * qualidade normalizada do primeiro texto com correspondência. No mesmo texto, `CAM` (`CAM`,
 * `CAMRIP`, `HDCAM`, `HD-TS`, `HDTS`, `TS`, `TELESYNC`) prevalece sobre a resolução, e uma
 * resolução colada ao container (`MP4720P`) é reconhecida. Sem correspondência em nenhum texto,
 * devolve `UNKNOWN_QUALITY`; nunca estima a partir de título, ano ou bitrate.
 *
 * @param {(string|null|undefined)[]} texts - Textos já obtidos, em ordem de prioridade.
 * @returns {string} Qualidade normalizada ("<n>p", "4K" ou "CAM") ou `UNKNOWN_QUALITY`.
 * @throws {Error} Se `texts` não for lista ou se algum item não for texto, `null` ou `undefined`.
 * @example
 * discoverQuality(['DOWNLOAD DUBLADO MP4720P', 'Matrix.1999']); // '720p'
 * discoverQuality(['CAM CINEMA 1080P']); // 'CAM'
 * discoverQuality(['Matrix.1999']); // 'Desconhecida'
 */
export function discoverQuality(texts) {
  if (!Array.isArray(texts)) {
    throw new Error(`texts deve ser lista (recebido: ${describe(texts)})`);
  }
  for (const text of texts) {
    if (text !== null && text !== undefined && typeof text !== 'string') {
      throw new Error(`texts deve conter texto, null ou undefined (recebido: ${describe(text)})`);
    }
  }
  for (const text of texts) {
    if (text === null || text === undefined) continue;
    const quality = qualityFromText(text);
    if (quality) return quality;
  }
  return UNKNOWN_QUALITY;
}

/**
 * Qualidade de um texto, ou `null` quando nenhuma regra se aplica.
 * @param {string} text - Texto candidato.
 * @returns {string|null} Qualidade normalizada ou `null`.
 */
function qualityFromText(text) {
  if (text.trim() === '') return null;
  if (CAM_WORDS.test(normalizeText(text))) return CAM;
  const token = lastQualityToken(text);
  if (token) return normalizeQuality(token);
  try {
    return normalizeQuality(text);
  } catch {
    return null;
  }
}

/**
 * Última qualidade reconhecível no texto bruto, com o container separado de "MP4720P".
 * @param {string} text - Texto candidato.
 * @returns {string|null} Token de qualidade ou `null`.
 */
function lastQualityToken(text) {
  const matches = [...text.matchAll(new RegExp(QUALITY_SEARCH.source, 'gi'))];
  if (!matches.length) return null;
  const raw = matches[matches.length - 1][0].replace(/^(?:mp4|mkv)/i, '');
  const glued = /(\d{3,4}p)$/i.exec(raw);
  return glued ? glued[1] : raw;
}

/**
 * Texto da qualidade para uma altura em pixels.
 * @param {number} height - Altura, ex.: 1080.
 * @returns {string} "<n>p" ou "4K" para 2160.
 */
function heightToQuality(height) {
  return height === UHD_HEIGHT ? FOUR_K : `${height}p`;
}

/**
 * Qualidade a partir das palavras do texto normalizado, na prioridade de `normalizeQuality`.
 * @param {string[]} tokens - Palavras normalizadas, com "full hd" já unido em "fullhd".
 * @returns {string|null} Qualidade ou `null` se nenhuma regra se aplicar.
 */
function qualityFromWords(tokens) {
  const withP = tokens.map((token) => token.match(QUALITY_TOKEN)).find(Boolean);
  if (withP) return heightToQuality(Number(withP[1]));
  const height = tokens.find((token) => KNOWN_HEIGHTS.includes(token));
  if (height) return heightToQuality(Number(height));
  return firstRuleMatch(tokens, QUALITY_LABEL_RULES);
}

/**
 * Resultado da primeira regra que tem alguma palavra presente.
 * @param {string[]} tokens - Palavras normalizadas.
 * @param {Array<[string[], string]>} rules - Pares (palavras, resultado), em ordem de prioridade.
 * @returns {string|null} Resultado da regra ou `null` se nenhuma se aplicar.
 */
function firstRuleMatch(tokens, rules) {
  const rule = rules.find(([labels]) => labels.some((label) => tokens.includes(label)));
  return rule ? rule[1] : null;
}

/**
 * Palavras de um texto já normalizado por `normalizeText`.
 * @param {string} normalized - Texto normalizado (palavras separadas por um espaço).
 * @returns {string[]} Palavras; vazio para texto vazio.
 */
function words(normalized) {
  return normalized === '' ? [] : normalized.split(' ');
}

/**
 * Representação curta de um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
