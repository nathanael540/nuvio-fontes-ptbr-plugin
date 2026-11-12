/**
 * Identidade da avaliação online.
 *
 * A evidência só vale para o mesmo pacote executado, os mesmos tipos suportados, o mesmo perfil e os
 * mesmos catálogos. Qualquer mudança nesses componentes cria outra identidade e não herda aprovação.
 */

import { createHash } from 'node:crypto';

export const PROTOCOL_VERSION = 1;
export const IDENTITY_ALGORITHM = 'sha256-json-v1';

/**
 * Calcula o hash de um catálogo, incluindo revisão e títulos.
 *
 * @param {object} catalog - Catálogo validado.
 * @returns {string} SHA-256 hexadecimal.
 * @example
 * catalogHash(catalogs.movie);
 */
export function catalogHash(catalog) {
  return sha256Json({
    mediaType: catalog.mediaType,
    revision: catalog.revision,
    curatedAt: catalog.curatedAt,
    titles: catalog.titles,
  });
}

/**
 * Calcula o hash do perfil efetivo.
 *
 * @param {{ exclusiveTag: string|null }} profile - Perfil efetivo.
 * @returns {string} SHA-256 hexadecimal.
 * @example
 * profileHash({ exclusiveTag: null });
 */
export function profileHash(profile) {
  return sha256Json({ exclusiveTag: profile.exclusiveTag });
}

/**
 * Monta a identidade completa de uma avaliação.
 *
 * @param {{ packageHash: string, supportedTypes: string[], profile: { exclusiveTag: string|null }, catalogs: { movie: object, tv: object } }} options - Componentes da identidade.
 * @returns {{ algorithm: string, protocolVersion: number, hash: string, packageHash: string, supportedTypes: string[], profile: object, catalogs: object }} Identidade.
 * @throws {Error} Se algum componente obrigatório faltar.
 * @example
 * evaluationIdentity({ packageHash, supportedTypes: ['movie'], profile, catalogs }).hash;
 */
export function evaluationIdentity({ packageHash, supportedTypes, profile, catalogs }) {
  if (typeof packageHash !== 'string' || !/^[a-f0-9]{64}$/.test(packageHash)) {
    throw new Error('identidade exige packageHash SHA-256');
  }
  if (!Array.isArray(supportedTypes) || supportedTypes.length === 0) {
    throw new Error('identidade exige supportedTypes não vazio');
  }
  const catalogRefs = {
    movie: { revision: catalogs.movie.revision, hash: catalogHash(catalogs.movie) },
    tv: { revision: catalogs.tv.revision, hash: catalogHash(catalogs.tv) },
  };
  const identity = {
    algorithm: IDENTITY_ALGORITHM,
    protocolVersion: PROTOCOL_VERSION,
    packageHash,
    supportedTypes: supportedTypes.slice(),
    profile: { exclusiveTag: profile.exclusiveTag },
    catalogs: catalogRefs,
  };
  return { ...identity, hash: sha256Json(identity) };
}

/**
 * Compara duas identidades pela hash.
 *
 * @param {string|undefined} left - Primeira hash.
 * @param {string|undefined} right - Segunda hash.
 * @returns {boolean} True quando ambas existem e são iguais.
 * @example
 * sameIdentity('a'.repeat(64), 'a'.repeat(64)); // true
 */
export function sameIdentity(left, right) {
  return typeof left === 'string' && left !== '' && left === right;
}

/**
 * Serializa de forma estável e calcula SHA-256.
 * @param {unknown} value - Valor serializável.
 * @returns {string} Hash hexadecimal.
 */
function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}
