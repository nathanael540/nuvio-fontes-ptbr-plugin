/**
 * Utilitários de texto e leitura de campos do catálogo Super Animes (AnimesTVS).
 *
 * O catálogo publica os títulos em romaji, com o sufixo `(Dublado)` ou `(Legendado)` na variante
 * de áudio. A remoção desse sufixo permite comparar as duas variantes com os títulos do TMDB sem
 * favorecer uma delas na similaridade.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';

const AUDIO_SUFFIX = /\s*(?:[([]\s*(?:dublado|legendado)\s*[)\]]|[-–—]\s*(?:dublado|legendado)(?:\s*\[[^]]*\])?)\s*$/i;
const SPECIAL_TITLE = /\b(?:movie|filme|film|ova|oad|ona|special|especial|recap|picture drama|short|pilot)\b/i;
const SEASON_PATTERNS = [
  /\bseason\s+0*(\d+)\b/i,
  /\b0*(\d+)(?:st|nd|rd|th)\s+season\b/i,
  /\btemporada\s+0*(\d+)\b/i,
  /\b0*(\d+)\s*ª?\s*temporada\b/i,
];
const PART_PATTERN = /\bpart(?:e)?\s+(\d+)\b/i;
const TRAILING_NUMBER = /\s(\d{1,2})$/;

/**
 * Remove o sufixo de áudio do título publicado.
 * @param {string} title - Título do catálogo.
 * @returns {string} Título sem o sufixo `(Dublado)`/`(Legendado)`.
 * @example
 * cleanTitle('Kimetsu no Yaiba (Dublado)'); // 'Kimetsu no Yaiba'
 */
export function cleanTitle(title) {
  return String(title).replace(AUDIO_SUFFIX, '').trim();
}

/**
 * Lê o áudio da entrada do catálogo, normalizando `audio` e `tipo`.
 * @param {object} entry - Entrada do catálogo.
 * @returns {'Dublado'|'Legendado'|null} Áudio reconhecido ou null.
 * @example
 * readAudio({ audio: 'Dublado' }); // 'Dublado'
 */
export function readAudio(entry) {
  const raw = typeof entry.audio === 'string' && entry.audio.trim() !== '' ? entry.audio : entry.tipo;
  if (typeof raw !== 'string') return null;
  const normalized = normalizeText(raw);
  if (normalized === 'dublado') return 'Dublado';
  if (normalized === 'legendado') return 'Legendado';
  return null;
}

/**
 * Lê a quantidade de episódios da entrada; texto não numérico vira null.
 * @param {*} value - Valor de `episodios`.
 * @returns {number|null} Inteiro maior ou igual a zero, ou null quando desconhecido.
 * @example
 * readCount('12'); // 12
 */
export function readCount(value) {
  const parsed = Number.parseInt(String(value === null || value === undefined ? '' : value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Lê um ano de quatro dígitos.
 * @param {*} value - Valor de `ano`.
 * @returns {number|null} Ano ou null.
 * @example
 * readYear(2019); // 2019
 */
export function readYear(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d{4}$/.test(value)) return Number(value);
  return null;
}

/**
 * Indica se o ano da entrada é compatível com o ano de referência.
 * @param {*} entryYear - Ano publicado pela fonte.
 * @param {number|null} referenceYear - Ano do TMDB.
 * @param {number} tolerance - Diferença máxima aceita.
 * @returns {boolean} True quando um dos anos é ausente ou a diferença cabe na tolerância.
 * @example
 * yearMatches(2020, 2019, 1); // true
 */
export function yearMatches(entryYear, referenceYear, tolerance) {
  const year = readYear(entryYear);
  return year === null || referenceYear === null || Math.abs(year - referenceYear) <= tolerance;
}

/**
 * Extrai o número de temporada declarado no título, quando houver.
 *
 * Reconhece `Season N`, `Nth Season`, `Temporada N`, `Nª Temporada` e um número no fim do título
 * (`Boku no Hero Academia 2`). Um `Part N` no fim não é temporada.
 *
 * @param {string} title - Título sem o sufixo de áudio.
 * @returns {number|null} Temporada declarada ou null.
 * @example
 * parseSeason('Shingeki no Kyojin Season 3 Part 2'); // 3
 */
export function parseSeason(title) {
  for (const pattern of SEASON_PATTERNS) {
    const match = pattern.exec(title);
    if (match !== null) return Number(match[1]);
  }
  if (PART_PATTERN.test(title)) return null;
  const trailing = TRAILING_NUMBER.exec(title);
  if (trailing === null) return null;
  const value = Number(trailing[1]);
  return value >= 2 ? value : null;
}

/**
 * Extrai o número da parte declarada no título; sem `Part N`, vale 1.
 * @param {string} title - Título sem o sufixo de áudio.
 * @returns {number} Número da parte.
 * @example
 * parsePart('Shingeki no Kyojin Season 3 Part 2'); // 2
 */
export function parsePart(title) {
  const match = PART_PATTERN.exec(title);
  return match === null ? 1 : Number(match[1]);
}

/**
 * Indica se o título descreve um filme, OVA, especial ou outro extra.
 * @param {string} title - Título sem o sufixo de áudio.
 * @returns {boolean} True para extra fora da temporada regular.
 * @example
 * isSpecialTitle('Kimetsu no Yaiba Movie: Mugen Ressha-hen'); // true
 */
export function isSpecialTitle(title) {
  return SPECIAL_TITLE.test(title);
}

/**
 * Indica se o valor é um objeto simples (não nulo e não lista).
 * @param {*} value - Valor recebido.
 * @returns {boolean} True para objeto simples.
 * @example
 * isPlainObject({}); // true
 */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Representação curta de um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string} Texto entre aspas ou representação direta.
 * @example
 * describe('x'); // '"x"'
 */
export function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
