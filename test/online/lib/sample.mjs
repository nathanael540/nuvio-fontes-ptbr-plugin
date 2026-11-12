/**
 * Seleção reproduzível da amostra online.
 *
 * A semente e o algoritmo ficam no relatório e no histórico. A seleção independe da ordem dos
 * resultados da fonte e não repõe candidatos: os cinco títulos são preparados antes das consultas.
 */

import { createHash, randomBytes } from 'node:crypto';
import { filterTitles } from './catalog.mjs';

export const SAMPLE_SIZE = 5;
export const SAMPLE_ALGORITHM = 'sha256-fisher-yates-v1';

/**
 * Gera uma semente hexadecimal quando o operador não informa uma.
 *
 * @returns {string} Semente aleatória de 32 caracteres hexadecimais.
 * @example
 * const seed = createSeed();
 * // '9f2c...'
 */
export function createSeed() {
  return randomBytes(16).toString('hex');
}

/**
 * Seleciona cinco títulos distintos por tipo, após o filtro de nicho.
 *
 * @param {{ providerId: string, mediaType: 'movie'|'tv', titles: object[], exclusiveTag: string|null, seed: string, count?: number }} options - Contexto da seleção.
 * @returns {{ algorithm: string, seed: string, mediaType: 'movie'|'tv', exclusiveTag: string|null, candidates: number, titles: object[] }} Amostra preparada.
 * @throws {Error} Se a semente for vazia ou houver menos candidatos que o tamanho da amostra.
 * @example
 * selectSample({ providerId: 'dooplay', mediaType: 'movie', titles, exclusiveTag: null, seed: 'abc' });
 */
export function selectSample({ providerId, mediaType, titles, exclusiveTag, seed, count = SAMPLE_SIZE }) {
  if (typeof seed !== 'string' || seed.trim() === '') {
    throw new Error('semente vazia: informe --seed ou gere uma automaticamente');
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`tamanho da amostra inválido: ${count}`);
  }
  const eligible = filterTitles(titles, exclusiveTag);
  if (eligible.length < count) {
    const filtro = exclusiveTag === null ? 'sem filtro de nicho' : `com a tag "${exclusiveTag}"`;
    throw new Error(
      `amostra insuficiente para "${providerId}" em ${mediaType}: ${eligible.length} elegíveis ${filtro}; mínimo ${count}`,
    );
  }

  const pool = eligible.map((title) => cloneTitle(title));
  const random = createPrng(`${seed}\n${providerId}\n${mediaType}\n${exclusiveTag ?? 'generalista'}`);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  const selected = pool.slice(0, count);
  if (new Set(selected.map((title) => title.tmdbId)).size !== count) {
    throw new Error(`seleção de ${mediaType} repetiu um tmdbId`);
  }
  return {
    algorithm: SAMPLE_ALGORITHM,
    seed,
    mediaType,
    exclusiveTag,
    candidates: eligible.length,
    titles: selected,
  };
}

/**
 * Prepara a seleção de todos os tipos suportados por um provedor.
 *
 * @param {{ provider: object, catalogs: { movie: object, tv: object }, exclusiveTag: string|null, seed: string }} options - Provedor do manifest, catálogos e perfil.
 * @returns {{ seed: string, algorithm: string, exclusiveTag: string|null, types: Record<string, object> }} Seleção por tipo.
 * @throws {Error} Se algum tipo não tiver cinco candidatos elegíveis.
 * @example
 * const selection = buildSelection({ provider, catalogs, exclusiveTag: null, seed: 'abc' });
 * // selection.types.movie.titles.length === 5
 */
export function buildSelection({ provider, catalogs, exclusiveTag, seed }) {
  const types = {};
  for (const mediaType of provider.supportedTypes) {
    types[mediaType] = selectSample({
      providerId: provider.id,
      mediaType,
      titles: catalogs[mediaType].titles,
      exclusiveTag,
      seed,
    });
  }
  return { seed, algorithm: SAMPLE_ALGORITHM, exclusiveTag, types };
}

/**
 * Cria o gerador determinístico baseado em SHA-256 com contador.
 *
 * @param {string} scope - Semente e escopo da seleção.
 * @returns {() => number} Função que devolve números em [0, 1).
 * @example
 * const random = createPrng('semente\ndooplay\nmovie\ngeneralista');
 * const first = random();
 */
function createPrng(scope) {
  let counter = 0;
  return () => {
    const digest = createHash('sha256').update(`${scope}\n${counter}`).digest();
    counter += 1;
    return digest.readUInt32BE(0) / 0x100000000;
  };
}

/**
 * Copia um título para a amostra sem compartilhar listas de tags.
 *
 * @param {object} title - Entrada do catálogo.
 * @returns {object} Cópia independente do título.
 * @example
 * const copy = cloneTitle({ tmdbId: '603', title: 'Matrix', tags: [] });
 */
function cloneTitle(title) {
  return { ...title, tags: title.tags.slice() };
}
