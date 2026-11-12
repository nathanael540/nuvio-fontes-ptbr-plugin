/**
 * Bloco title-match: escolhe, entre os resultados de uma busca por título, o que corresponde
 * ao filme ou série do TMDB.
 *
 * Útil quando a fonte não aceita o ID do TMDB e a busca por nome devolve vários resultados
 * parecidos: compara cada resultado com os títulos (PT-BR, original e alternativos) e o ano
 * do TMDB para não tocar o título errado.
 */

import { normalizeText } from '../slugify/index.mjs';

const DEFAULT_MIN_SCORE = 0.85;
const DEFAULT_YEAR_TOLERANCE = 1;
const FOUR_DIGIT_YEAR = /^\d{4}$/;

/**
 * @typedef {object} Candidate
 * @property {string} title - Título do resultado na fonte.
 * @property {number|string|null} [year] - Ano do resultado: inteiro, string de 4 dígitos (ex.: "2024") ou `null`.
 */

/**
 * @typedef {object} MatchResult
 * @property {Candidate} candidate - O candidato escolhido, o mesmo objeto recebido (com todos os seus campos).
 * @property {number} score - Similaridade do título do candidato, de 0 a 1.
 */

/**
 * Mede a semelhança entre dois títulos, de 0 (nada em comum) a 1 (iguais).
 *
 * Títulos iguais sem diferenciar maiúsculas e espaços nas pontas valem 1, inclusive em
 * escritas não latinas (ex.: coreano). Nos demais casos, compara os textos normalizados
 * (`normalizeText`) pelo coeficiente de Dice sobre pares de caracteres, ignorando espaços;
 * se algum texto normalizado ficar vazio, vale 0.
 *
 * @param {string} a - Primeiro título.
 * @param {string} b - Segundo título.
 * @returns {number} Similaridade entre 0 e 1.
 * @throws {Error} Se `a` ou `b` não for string.
 * @example
 * titleSimilarity('Duna: Parte Dois', 'duna parte dois'); // 1
 * titleSimilarity('Duna Parte Dois', 'Duna Parte 2'); // ~0.76
 * titleSimilarity('Duna', 'Titanic'); // 0
 */
export function titleSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    throw new Error(`titleSimilarity espera duas strings, recebeu ${typeof a} e ${typeof b}`);
  }

  const plainA = a.trim().toLowerCase();
  if (plainA !== '' && plainA === b.trim().toLowerCase()) return 1;

  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);
  if (normalizedA === '' || normalizedB === '') return 0;
  if (normalizedA === normalizedB) return 1;

  return diceCoefficient(normalizedA.split(' ').join(''), normalizedB.split(' ').join(''));
}

/**
 * Escolhe o candidato cujo título mais se parece com algum título do TMDB, respeitando o ano.
 *
 * O score de um candidato é a maior `titleSimilarity` entre o título dele e `media.title`,
 * `media.originalTitle` e `media.alternativeTitles`. Quando o candidato e `media` têm ano e a
 * diferença passa de `yearTolerance`, o candidato é descartado; sem ano em um dos lados, não.
 * Entre os que restam com score maior ou igual a `minScore`, vence o de maior score; no empate,
 * o de ano igual ao de `media`; persistindo o empate, o primeiro do array.
 *
 * Retornar `null` é uma ausência esperada (a fonte não tem o título): quem chama decide o que fazer.
 *
 * @param {Candidate[]} candidates - Resultados da busca na fonte; outros campos são preservados.
 * @param {object} media - Dados do TMDB, compatíveis com `MediaInfo` do bloco `tmdb-info`.
 * @param {string} media.title - Título em português do Brasil.
 * @param {string} [media.originalTitle] - Título no idioma original.
 * @param {string[]} [media.alternativeTitles] - Títulos alternativos.
 * @param {number|null} [media.year] - Ano de lançamento.
 * @param {object} [options] - Opções da escolha.
 * @param {number} [options.minScore] - Score mínimo, de 0 a 1; padrão 0.85.
 * @param {number} [options.yearTolerance] - Diferença máxima de anos aceita, inteiro maior ou igual a 0; padrão 1.
 * @returns {MatchResult|null} O candidato escolhido e seu score, ou `null` se nenhum passar.
 * @throws {Error} Se `candidates` não for array, se um item não for objeto com `title` string ou tiver
 *   `year` inválido, se `media.title` não for string, se `media.originalTitle` não for string, se
 *   `media.alternativeTitles` não for array de strings, se `media.year` não for inteiro ou `null`,
 *   se `minScore` estiver fora de [0, 1] ou se `yearTolerance` não for inteiro maior ou igual a 0.
 * @example
 * const results = [{ title: 'Duna', year: 2021 }, { title: 'Duna: Parte Dois', year: 2024, url: '/f/1' }];
 * findBestMatch(results, { title: 'Duna: Parte Dois', originalTitle: 'Dune: Part Two', year: 2024 });
 * // { candidate: results[1], score: 1 }
 */
export function findBestMatch(candidates, media, options = {}) {
  const { minScore = DEFAULT_MIN_SCORE, yearTolerance = DEFAULT_YEAR_TOLERANCE } = options;
  if (typeof minScore !== 'number' || !(minScore >= 0 && minScore <= 1)) {
    throw new Error(`minScore inválido: "${minScore}" (esperado número entre 0 e 1)`);
  }
  if (!Number.isInteger(yearTolerance) || yearTolerance < 0) {
    throw new Error(`yearTolerance inválido: "${yearTolerance}" (esperado inteiro maior ou igual a 0)`);
  }
  if (!Array.isArray(candidates)) {
    throw new Error(`candidates inválido: esperado array, recebeu ${typeof candidates}`);
  }

  const mediaTitles = readMediaTitles(media);
  const mediaYear = readMediaYear(media.year);

  let best = null;
  candidates.forEach((candidate, index) => {
    const candidateYear = readCandidate(candidate, index);
    if (candidateYear !== null && mediaYear !== null && Math.abs(candidateYear - mediaYear) > yearTolerance) return;

    const score = Math.max(...mediaTitles.map((title) => titleSimilarity(candidate.title, title)));
    if (score < minScore) return;

    const exactYear = candidateYear !== null && candidateYear === mediaYear;
    if (best === null || score > best.score || (score === best.score && exactYear && !best.exactYear)) {
      best = { candidate, score, exactYear };
    }
  });

  return best === null ? null : { candidate: best.candidate, score: best.score };
}

/**
 * Coeficiente de Dice sobre bigramas (multiconjunto); textos de 1 caractere comparam por igualdade.
 * @param {string} a - Texto sem espaços, não vazio.
 * @param {string} b - Texto sem espaços, não vazio.
 * @returns {number}
 */
function diceCoefficient(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const counts = new Map();
  for (const bigram of bigrams(a)) counts.set(bigram, (counts.get(bigram) || 0) + 1);

  let common = 0;
  const bigramsB = bigrams(b);
  for (const bigram of bigramsB) {
    const count = counts.get(bigram) || 0;
    if (count > 0) {
      counts.set(bigram, count - 1);
      common += 1;
    }
  }
  return (2 * common) / (a.length - 1 + bigramsB.length);
}

/**
 * Pares de caracteres consecutivos de um texto.
 * @param {string} text
 * @returns {string[]}
 */
function bigrams(text) {
  const result = [];
  for (let i = 0; i < text.length - 1; i += 1) result.push(text.slice(i, i + 2));
  return result;
}

/**
 * Valida `media` e lista seus títulos (principal, original e alternativos).
 * @param {object} media
 * @returns {string[]}
 * @throws {Error} Se algum título estiver em formato inválido.
 */
function readMediaTitles(media) {
  if (typeof media !== 'object' || media === null || typeof media.title !== 'string') {
    throw new Error('media inválido: esperado objeto com title string');
  }
  const { title, originalTitle, alternativeTitles } = media;
  if (originalTitle !== undefined && typeof originalTitle !== 'string') {
    throw new Error(`media.originalTitle inválido: esperado string, recebeu ${typeof originalTitle}`);
  }
  if (alternativeTitles !== undefined && !(Array.isArray(alternativeTitles) && alternativeTitles.every((item) => typeof item === 'string'))) {
    throw new Error('media.alternativeTitles inválido: esperado array de strings');
  }
  return [title].concat(originalTitle === undefined ? [] : [originalTitle], alternativeTitles || []);
}

/**
 * Valida o ano de `media`.
 * @param {*} year
 * @returns {number|null}
 * @throws {Error} Se não for inteiro, `null` ou ausente.
 */
function readMediaYear(year) {
  if (year === undefined || year === null) return null;
  if (!Number.isInteger(year)) throw new Error(`media.year inválido: "${year}" (esperado inteiro ou null)`);
  return year;
}

/**
 * Valida um candidato e lê o ano dele.
 * @param {*} candidate
 * @param {number} index - Posição no array, para a mensagem de erro.
 * @returns {number|null}
 * @throws {Error} Se o candidato não for objeto com `title` string ou se `year` for inválido.
 */
function readCandidate(candidate, index) {
  if (typeof candidate !== 'object' || candidate === null || typeof candidate.title !== 'string') {
    throw new Error(`candidates[${index}] inválido: esperado objeto com title string`);
  }
  const { year } = candidate;
  if (year === undefined || year === null) return null;
  if (Number.isInteger(year)) return year;
  if (typeof year === 'string' && FOUR_DIGIT_YEAR.test(year)) return Number(year);
  throw new Error(`candidates[${index}].year inválido: "${year}" (esperado inteiro, string de 4 dígitos ou null)`);
}
