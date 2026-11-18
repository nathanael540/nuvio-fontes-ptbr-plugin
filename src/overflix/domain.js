/**
 * Descoberta do domínio vigente do OverFlix.
 *
 * Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)
 *
 * A semente pode responder com redirecionamento para o host atual ou publicar o domínio em
 * `window.domainAlertPayload` (JSON em Base64 com `baseUrl` em Base64). Qualquer falha cai no
 * host de fallback; a descoberta nunca lança e não guarda cache entre chamadas.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { extractScriptString } from '../_blocks/script-extract/index.mjs';

/**
 * Semente consultada a cada chamada.
 * @type {string}
 */
export const SEED_URL = 'https://www.overflix.win';

/**
 * Host usado quando a descoberta falha.
 * @type {string}
 */
export const FALLBACK_ORIGIN = 'https://www.overflix.download';

/**
 * Decodifica Base64 normalizando o alfabeto URL-safe e o padding.
 * @param {string} value - Texto codificado.
 * @returns {string} Texto decodificado.
 */
function decodeBase64(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

/**
 * Valida uma URL HTTPS e devolve a origem.
 * @param {string} value - URL candidata.
 * @param {string} label - Nome do dado na mensagem de erro.
 * @returns {string} Origem HTTPS.
 * @throws {Error} Se a URL for inválida ou não usar HTTPS.
 */
function readHttpsOrigin(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} vazio`);
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`${label} inválido: "${value}"`);
  }
  if (parsed.protocol !== 'https:' || parsed.host === '') {
    throw new Error(`${label} não é HTTPS: "${value}"`);
  }
  return parsed.origin;
}

/**
 * Descobre o domínio atual do OverFlix, sem cache.
 * @returns {Promise<string>} Origem HTTPS do host atual ou do fallback.
 */
export async function discoverDomain() {
  try {
    const page = await fetchPage(SEED_URL, { profile: 'page' });
    const finalOrigin = readHttpsOrigin(page.url, 'URL final da semente');
    if (finalOrigin !== new URL(SEED_URL).origin) {
      return finalOrigin;
    }

    const payload = extractScriptString(page.text, 'domainAlertPayload');
    if (payload === null) {
      throw new Error('domainAlertPayload ausente na semente');
    }

    const data = JSON.parse(decodeBase64(payload));
    if (typeof data?.baseUrl !== 'string' || data.baseUrl.trim() === '') {
      throw new Error('baseUrl ausente no domainAlertPayload');
    }

    const baseUrl = data.baseUrl.trim();
    const resolved = /^https?:\/\//i.test(baseUrl) ? baseUrl : decodeBase64(baseUrl).trim();
    return readHttpsOrigin(resolved, 'baseUrl');
  } catch {
    return FALLBACK_ORIGIN;
  }
}
