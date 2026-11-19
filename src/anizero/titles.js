/**
 * Identidade textual do AniZero: variantes de título, marcador de temporada e pontuação.
 *
 * A fonte repete o ano da série em todas as páginas sazonais e usa títulos como
 * "Kimetsu no Yaiba (Demon Slayer) S1". As variantes permitem comparar o título PT-BR, o original,
 * as alternativas, os romaji do TMDB e os apelidos entre parênteses sem depender de igualdade exata.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';

/** Score mínimo para aceitar uma ficha ou um candidato de busca. */
export const MIN_TITLE_SCORE = 0.85;

const SEASON_SUFFIX = /(?:\s*[-–—:|]\s*|\s+)(?:S(\d{1,2})|Season\s+(\d{1,2})|Temporada\s+(\d{1,2})|(\d{1,2})\s*ª?\s*Temporada)\s*$/i;
const AUDIO_SUFFIX = /(?:\s*[-–—:|]\s*|\s+)(?:Dublado|Legendado|Dublada|Legendada)\s*$/i;
const YEAR_SUFFIX = /(?:\s*[-–—:|]\s*|\s+)(?:19|20)\d{2}\s*$/;
const PARENTHETICAL = /\(([^()]*)\)/g;
const TITLE_SEPARATOR = /\s*[:–—]\s*|\s+-\s+/;

/**
 * Lê o número da temporada no sufixo do título.
 * @param {string} title - Título da ficha.
 * @returns {number|null} Número da temporada ou null quando o título não tem marcador.
 * @example
 * readSeasonNumber('Attack on Titan S2'); // 2
 * readSeasonNumber('Kimetsu no Yaiba (Demon Slayer) S1'); // 1
 * readSeasonNumber('Naruto Shippuden'); // null
 */
export function readSeasonNumber(title) {
  const match = String(title).match(SEASON_SUFFIX);
  if (match === null) return null;
  const value = match[1] || match[2] || match[3] || match[4];
  return Number(value);
}

/**
 * Remove o marcador de temporada do fim do título.
 * @param {string} title - Título da ficha.
 * @returns {string} Título sem o marcador.
 * @example
 * stripSeasonMarker('Baki – O Campeão S2'); // 'Baki – O Campeão'
 */
export function stripSeasonMarker(title) {
  return String(title).replace(SEASON_SUFFIX, '').replace(/[\s\-–—:|]+$/, '').trim();
}

/**
 * Gera variantes comparáveis de um título: completo, sem temporada, sem áudio, sem ano,
 * sem parênteses e por partes separadas por dois-pontos ou travessão.
 * @param {string} title - Título bruto.
 * @returns {string[]} Variantes não vazias, sem repetição normalizada.
 * @example
 * titleVariants('Kimetsu no Yaiba (Demon Slayer) S1');
 * // ['Kimetsu no Yaiba (Demon Slayer) S1', 'Kimetsu no Yaiba (Demon Slayer)', 'Kimetsu no Yaiba', 'Demon Slayer', ...]
 */
export function titleVariants(title) {
  const raw = String(title).trim();
  if (raw === '') return [];

  const candidates = [];
  const add = (value) => {
    const text = String(value).trim();
    if (text !== '') candidates.push(text);
  };

  add(raw);
  const withoutSeason = stripSeasonMarker(raw);
  add(withoutSeason);
  const withoutAudio = withoutSeason.replace(AUDIO_SUFFIX, '').trim();
  add(withoutAudio);
  const withoutYear = withoutAudio.replace(YEAR_SUFFIX, '').trim();
  add(withoutYear);

  for (const base of [withoutSeason, withoutAudio, withoutYear]) {
    for (const match of base.matchAll(PARENTHETICAL)) {
      add(base.replace(match[0], ' '));
      add(match[1]);
    }
    for (const part of base.split(TITLE_SEPARATOR)) add(part);
  }

  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    const key = normalizeText(candidate);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

/**
 * Lista os títulos comparáveis do TMDB, incluindo alternativas, romaji e suas variantes.
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo`.
 * @param {string} media.title - Título PT-BR.
 * @param {string} [media.originalTitle] - Título original.
 * @param {string[]} [media.alternativeTitles] - Alternativas brasileiras.
 * @param {Array<{title: string}>} [media.romajiTitles] - Títulos romaji/romanizados.
 * @returns {string[]} Títulos comparáveis sem repetição normalizada.
 */
export function mediaTitles(media) {
  const titles = [media.title, media.originalTitle];
  for (const alternative of media.alternativeTitles || []) titles.push(alternative);
  for (const romaji of media.romajiTitles || []) titles.push(romaji.title);

  const seen = new Set();
  const result = [];
  for (const title of titles) {
    if (typeof title !== 'string' || title.trim() === '') continue;
    for (const variant of titleVariants(title)) {
      const key = normalizeText(variant);
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      result.push(variant);
    }
  }
  return result;
}

/**
 * Mede a maior semelhança entre as variantes de um título da fonte e os títulos do TMDB.
 * @param {string} title - Título da fonte.
 * @param {object} media - Dados do TMDB.
 * @returns {number} Similaridade entre 0 e 1.
 * @example
 * titleScore('Kimetsu no Yaiba (Demon Slayer) S1', { title: 'Demon Slayer: Kimetsu no Yaiba', originalTitle: 'Kimetsu no Yaiba' });
 * // 1
 */
export function titleScore(title, media) {
  const sourceVariants = titleVariants(title);
  const tmdbVariants = mediaTitles(media);
  let best = 0;
  for (const source of sourceVariants) {
    for (const tmdb of tmdbVariants) {
      const score = titleSimilarity(source, tmdb);
      if (score > best) best = score;
    }
  }
  return best;
}

/**
 * Confirma se a ficha corresponde ao pedido do TMDB.
 *
 * O ano da ficha é o da série; por isso ele é aceito quando coincide, com tolerância de um ano,
 * com o ano da série ou com o ano da temporada pedida no TMDB.
 *
 * @param {object} page - Ficha lida por `readAnimePage`.
 * @param {string} page.title - Título da ficha.
 * @param {number|null} page.year - Ano publicado pela ficha.
 * @param {object} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @returns {{ score: number }|null} Pontuação quando a ficha corresponde; null caso contrário.
 */
export function matchAnimePage(page, media, season) {
  const allowedYears = [];
  if (Number.isInteger(media.year)) allowedYears.push(media.year);
  const seasonInfo = (media.seasons || []).find((item) => item.number === season);
  if (seasonInfo && Number.isInteger(seasonInfo.year)) allowedYears.push(seasonInfo.year);

  if (Number.isInteger(page.year) && allowedYears.length > 0) {
    const compatible = allowedYears.some((year) => Math.abs(page.year - year) <= 1);
    if (!compatible) return null;
  }

  const score = titleScore(page.title, media);
  if (score < MIN_TITLE_SCORE) return null;
  return { score };
}

/**
 * Pontua um candidato da busca para ordenar a abertura das fichas.
 * @param {{ title: string }} candidate - Resultado da busca.
 * @param {object} media - Dados do TMDB.
 * @returns {number} Similaridade entre 0 e 1.
 */
export function scoreCandidate(candidate, media) {
  return titleScore(candidate.title, media);
}
