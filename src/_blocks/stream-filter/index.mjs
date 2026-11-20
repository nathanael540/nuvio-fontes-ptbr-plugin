import { readDelivery } from '../custom-formatter/index.mjs';
import { LANGUAGE } from '../language-discovery/index.mjs';
import { QUALITY, qualityToHeight } from '../quality-discovery/index.mjs';

export const STREAM_TYPES = Object.freeze(['P2P', 'HTTP', 'all']);
export const QUALITY_FLOORS = Object.freeze([...Object.values(QUALITY).map((height) => `${height}p`), 'all']);

const PT_BR = [LANGUAGE.DUBBED, LANGUAGE.SUBTITLED];
const PT = [...PT_BR, LANGUAGE.DUBBED_NON_PT_BR, LANGUAGE.SUBTITLED_NON_PT_BR];
const FOREIGN = [...PT, LANGUAGE.NON_PT_BR];
const LANGUAGES = { 'pt-br': PT_BR, pt: PT, gringo: FOREIGN, all: [...FOREIGN, LANGUAGE.UNKNOWN] };
export const LANGUAGE_LEVELS = Object.freeze(Object.keys(LANGUAGES));

/** Filtros opcionais por eixo. @typedef {{type: string, quality: string, language: string}} Filters */

/**
 * Interpreta o ID entregue pelo app. O ID base legado usa a lista completa.
 * @param {string} scraperId - ID do app, opcionalmente precedido pelo ID do repositório.
 * @param {string} baseId - ID do provedor no cadastro.
 * @returns {Filters} Combinação indicada pelo manifest.
 * @throws {Error} Se o ID base ou a combinação forem inválidos.
 * @example
 * readStreamFilters('repo:seekee--http-720p-pt-br', 'seekee');
 */
export function readStreamFilters(scraperId, baseId) {
  const id = scraperId.slice(scraperId.lastIndexOf(':') + 1);
  if (id === baseId) return { type: 'all', quality: 'all', language: 'all' };
  const prefix = `${baseId}--`;
  if (id.startsWith(prefix)) {
    const [typeId, quality, ...languageParts] = id.slice(prefix.length).split('-');
    const type = STREAM_TYPES.find((value) => value.toLowerCase() === typeId);
    const language = languageParts.join('-');
    if (type && QUALITY_FLOORS.includes(quality) && LANGUAGE_LEVELS.includes(language)) {
      return { type, quality, language };
    }
  }
  throw new Error(`ID de manifest inválido para ${baseId}: ${scraperId}`);
}

/**
 * Aplica os filtros à lista final e preserva os objetos e a ordem dos aceitos.
 * @param {object[]} streams - Streams já normalizados pelo provedor.
 * @param {Filters} filters - Combinação validada para o manifest.
 * @returns {object[]} Streams que passam em todos os filtros ativos.
 * @example
 * filterStreams([], { type: 'HTTP', quality: '720p', language: 'pt-br' }); // []
 */
export function filterStreams(streams, { type, quality, language }) {
  if (type === 'all' && quality === 'all' && language === 'all') return streams;
  const floor = qualityToHeight(quality);
  return streams.filter((stream) => (
    (language === 'all' || LANGUAGES[language].includes(stream.language)) &&
    (floor === null || qualityToHeight(stream.quality) >= floor) &&
    (type === 'all' || readDelivery(stream.url) === type)
  ));
}
