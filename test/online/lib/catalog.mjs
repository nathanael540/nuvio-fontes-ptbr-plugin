/**
 * Catálogos de referência e perfis de nicho da verificação online.
 *
 * Os catálogos têm no mínimo 20 títulos por tipo e não são truncados. O perfil de um provedor só
 * declara um nicho exclusivo quando a fonte realmente se restringe a ele; sem entrada, o provedor é
 * generalista e usa todos os candidatos do tipo.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA_VERSION = 1;
export const MIN_TITLES = 20;
export const MEDIA_TYPES = ['movie', 'tv'];
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lê e valida um catálogo de um tipo.
 *
 * @param {string} rootDir - Raiz do repositório.
 * @param {'movie'|'tv'} mediaType - Tipo do catálogo.
 * @returns {object} Catálogo validado.
 * @throws {Error} Se o arquivo não existir, não for JSON válido ou violar o formato.
 * @example
 * const movie = loadCatalog('C:/repo', 'movie');
 * // movie.titles.length >= 20
 */
export function loadCatalog(rootDir, mediaType) {
  const file = path.join(rootDir, 'test', 'online', 'catalogs', `${mediaType}.json`);
  const catalog = readJson(file, `catálogo ${mediaType}`);
  return validateCatalog(catalog, { mediaType });
}

/**
 * Lê e valida os dois catálogos.
 *
 * @param {string} rootDir - Raiz do repositório.
 * @returns {{ movie: object, tv: object }} Catálogos validados.
 * @throws {Error} Se qualquer catálogo estiver ausente ou inválido.
 * @example
 * const catalogs = loadCatalogs('C:/repo');
 * // catalogs.tv.revision === '2026-11-12.1'
 */
export function loadCatalogs(rootDir) {
  return {
    movie: loadCatalog(rootDir, 'movie'),
    tv: loadCatalog(rootDir, 'tv'),
  };
}

/**
 * Valida a estrutura de um catálogo.
 *
 * @param {object} catalog - Documento lido do JSON.
 * @param {{ mediaType?: 'movie'|'tv' }} [options] - Tipo esperado; confere também o campo do documento.
 * @returns {object} O próprio catálogo, quando válido.
 * @throws {Error} Se o documento violar qualquer regra do formato.
 * @example
 * validateCatalog({ ...catalog, titles: catalog.titles.slice(0, 19) });
 * // lança: catálogo "movie" exige no mínimo 20 títulos distintos
 */
export function validateCatalog(catalog, { mediaType } = {}) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('catálogo deve ser um objeto');
  }
  if (catalog.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`catálogo com schemaVersion ${catalog.schemaVersion}; esperado ${SCHEMA_VERSION}`);
  }
  if (!MEDIA_TYPES.includes(catalog.mediaType)) {
    throw new Error(`catálogo com mediaType inválido: "${catalog.mediaType}"`);
  }
  if (mediaType !== undefined && catalog.mediaType !== mediaType) {
    throw new Error(`catálogo "${mediaType}" declara mediaType "${catalog.mediaType}"`);
  }
  const label = `catálogo "${catalog.mediaType}"`;
  assertText(catalog.revision, `${label} sem revision`);
  if (!DATE_PATTERN.test(catalog.curatedAt || '')) {
    throw new Error(`${label} com curatedAt inválido: "${catalog.curatedAt}" (use AAAA-MM-DD)`);
  }
  assertUrl(catalog.popularitySource, `${label} sem popularitySource`);
  assertUrl(catalog.verificationSource, `${label} sem verificationSource`);

  if (!Array.isArray(catalog.titles)) {
    throw new Error(`${label} deve ter uma lista titles`);
  }
  if (catalog.titles.length < MIN_TITLES) {
    throw new Error(`${label} exige no mínimo ${MIN_TITLES} títulos distintos (tem ${catalog.titles.length})`);
  }

  const seen = new Set();
  for (const [index, title] of catalog.titles.entries()) {
    validateTitle(title, catalog.mediaType, `${label}, título ${index + 1}`);
    const id = String(title.tmdbId);
    if (seen.has(id)) {
      throw new Error(`${label} repete o tmdbId ${id}`);
    }
    seen.add(id);
  }
  return catalog;
}

/**
 * Lê e valida os perfis de nicho contra o manifest e os catálogos.
 *
 * @param {string} rootDir - Raiz do repositório.
 * @param {{ manifest: object, catalogs: { movie: object, tv: object } }} context - Manifest e catálogos já validados.
 * @returns {object} Documento de perfis validado.
 * @throws {Error} Se o arquivo não existir, não for JSON válido ou violar o formato.
 * @example
 * const profiles = loadProfiles('C:/repo', { manifest, catalogs });
 * // profiles.providers vazio para provedores generalistas
 */
export function loadProfiles(rootDir, context) {
  const file = path.join(rootDir, 'test', 'online', 'profiles.json');
  const profiles = readJson(file, 'perfis de nicho');
  return validateProfiles(profiles, context);
}

/**
 * Valida perfis de nicho.
 *
 * IDs de provedores precisam existir no manifest, tags precisam existir nos catálogos e cada perfil
 * precisa manter ao menos cinco candidatos por tipo suportado.
 *
 * @param {object} profiles - Documento lido do JSON.
 * @param {{ manifest: object, catalogs: { movie: object, tv: object } }} context - Manifest e catálogos validados.
 * @returns {object} O próprio documento, quando válido.
 * @throws {Error} Se um provedor ou tag for desconhecido ou a amostra ficar insuficiente.
 * @example
 * validateProfiles({ schemaVersion: 1, providers: { dooplay: { exclusiveTag: 'anime' } } }, context);
 */
export function validateProfiles(profiles, { manifest, catalogs }) {
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    throw new Error('perfis devem ser um objeto');
  }
  if (profiles.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`perfis com schemaVersion ${profiles.schemaVersion}; esperado ${SCHEMA_VERSION}`);
  }
  assertText(profiles.revision, 'perfis sem revision');
  if (!DATE_PATTERN.test(profiles.curatedAt || '')) {
    throw new Error(`perfis com curatedAt inválido: "${profiles.curatedAt}" (use AAAA-MM-DD)`);
  }
  if (!profiles.providers || typeof profiles.providers !== 'object' || Array.isArray(profiles.providers)) {
    throw new Error('perfis devem ter um objeto providers');
  }

  const scrapers = new Map(manifest.scrapers.map((scraper) => [scraper.id, scraper]));
  const knownTags = new Set(catalogs.movie.titles.flatMap((title) => title.tags)
    .concat(catalogs.tv.titles.flatMap((title) => title.tags)));

  for (const [providerId, profile] of Object.entries(profiles.providers)) {
    const scraper = scrapers.get(providerId);
    if (!scraper) {
      throw new Error(`perfil para provedor desconhecido: "${providerId}"`);
    }
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error(`perfil de "${providerId}" deve ser um objeto`);
    }
    for (const key of Object.keys(profile)) {
      if (key !== 'exclusiveTag') {
        throw new Error(`perfil de "${providerId}" tem campo desconhecido: "${key}"`);
      }
    }
    if (!('exclusiveTag' in profile)) {
      throw new Error(`perfil de "${providerId}" sem exclusiveTag; omita a entrada para um generalista`);
    }
    const tag = profile.exclusiveTag;
    if (tag !== null && (typeof tag !== 'string' || !TAG_PATTERN.test(tag))) {
      throw new Error(`perfil de "${providerId}" com exclusiveTag inválida: "${tag}"`);
    }
    if (tag !== null) {
      if (!knownTags.has(tag)) {
        throw new Error(`perfil de "${providerId}" usa tag desconhecida: "${tag}"`);
      }
      for (const mediaType of scraper.supportedTypes) {
        const eligible = filterTitles(catalogs[mediaType].titles, tag).length;
        if (eligible < 5) {
          throw new Error(
            `perfil de "${providerId}" tem só ${eligible} títulos ${mediaType} com a tag "${tag}"; mínimo 5`,
          );
        }
      }
    }
  }
  return profiles;
}

/**
 * Perfil efetivo de um provedor. Sem entrada, resulta em generalista.
 *
 * @param {object} profiles - Documento de perfis validado.
 * @param {string} providerId - ID do provedor.
 * @returns {{ exclusiveTag: string|null }} Perfil efetivo.
 * @throws {Error} Se o provedor não existir no documento de perfis.
 * @example
 * resolveProfile(profiles, 'dooplay'); // { exclusiveTag: null }
 */
export function resolveProfile(profiles, providerId) {
  const profile = profiles.providers[providerId];
  if (!profile) return { exclusiveTag: null };
  return { exclusiveTag: profile.exclusiveTag };
}

/**
 * Filtra títulos pelo nicho exclusivo. Sem tag, devolve todos os candidatos.
 *
 * @param {object[]} titles - Títulos de um catálogo.
 * @param {string|null} exclusiveTag - Tag exclusiva ou null para generalista.
 * @returns {object[]} Candidatos elegíveis, sem alterar a ordem original.
 * @example
 * filterTitles(movieTitles, 'anime').every((title) => title.tags.includes('anime'));
 */
export function filterTitles(titles, exclusiveTag) {
  if (exclusiveTag === null || exclusiveTag === undefined) return titles.slice();
  return titles.filter((title) => title.tags.includes(exclusiveTag));
}

/**
 * Valida um título do catálogo.
 * @param {object} title - Entrada da lista.
 * @param {'movie'|'tv'} mediaType - Tipo do catálogo.
 * @param {string} label - Rótulo para mensagens de erro.
 * @returns {void}
 * @throws {Error} Se o título violar o formato.
 */
function validateTitle(title, mediaType, label) {
  if (!title || typeof title !== 'object' || Array.isArray(title)) {
    throw new Error(`${label} deve ser um objeto`);
  }
  if (typeof title.tmdbId !== 'string' || !/^[1-9]\d*$/.test(title.tmdbId)) {
    throw new Error(`${label} com tmdbId inválido: "${title.tmdbId}"`);
  }
  assertText(title.title, `${label} sem title`);
  if (!Number.isInteger(title.year) || title.year < 1888 || title.year > 2100) {
    throw new Error(`${label} com year inválido: "${title.year}"`);
  }
  if (!Array.isArray(title.tags)) {
    throw new Error(`${label} deve ter uma lista tags`);
  }
  if (new Set(title.tags).size !== title.tags.length) {
    throw new Error(`${label} repete uma tag`);
  }
  for (const tag of title.tags) {
    if (typeof tag !== 'string' || !TAG_PATTERN.test(tag)) {
      throw new Error(`${label} com tag inválida: "${tag}"`);
    }
  }

  if (mediaType === 'movie') {
    if ('season' in title || 'episode' in title) {
      throw new Error(`${label} é filme e não aceita season/episode`);
    }
    return;
  }
  if (!Number.isInteger(title.season) || title.season <= 0) {
    throw new Error(`${label} de série exige season positivo`);
  }
  if (!Number.isInteger(title.episode) || title.episode <= 0) {
    throw new Error(`${label} de série exige episode positivo`);
  }
}

/**
 * Lê um JSON com mensagem de erro contextual.
 * @param {string} file - Caminho do arquivo.
 * @param {string} label - Rótulo do documento.
 * @returns {object} Conteúdo interpretado.
 * @throws {Error} Se o arquivo não existir ou não for JSON válido.
 */
function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`${label} não encontrado em ${file}: ${error.message}`, { cause: error });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} não é JSON válido em ${file}: ${error.message}`, { cause: error });
  }
}

/**
 * Exige texto não vazio.
 * @param {unknown} value - Valor a conferir.
 * @param {string} message - Mensagem de erro.
 * @returns {void}
 * @throws {Error} Se o valor não for texto com conteúdo.
 */
function assertText(value, message) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }
}

/**
 * Exige URL http(s) válida.
 * @param {unknown} value - Valor a conferir.
 * @param {string} message - Mensagem de erro.
 * @returns {void}
 * @throws {Error} Se o valor não for uma URL http(s).
 */
function assertUrl(value, message) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocolo');
  } catch {
    throw new Error(`${message}: "${value}"`);
  }
}
