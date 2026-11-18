/**
 * Player `mgeb` da VenoPlay e montagem dos streams HLS.
 *
 * Cada item de `players` é uma opção independente. O `mgeb` publica `var sources`; só HLS
 * `.m3u8` HTTPS de `mgeb.space`/`mgeb.lat`, sem credencial, entra no contrato. `nhdapi.com` e
 * os hosts não comprovados são triagem sem requisição.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchText } from '../_blocks/http/index.mjs';
import { LANGUAGE, languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { UNKNOWN_QUALITY } from '../_blocks/quality-discovery/index.mjs';
import { extractScriptJson } from '../_blocks/script-extract/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';

const PROVIDER = 'MGEB';
const STREAM_TYPE = 'hls';
const ADDON = 'VenoPlay';
const MGEB_HOSTS = new Set(['mgeb.space', 'mgeb.lat']);
const TRIAGE_HOSTS = ['nhdapi.com', 'novix.x10.mx', 'infrastructuredesign.space', 'fontedecanais'];
const REJECTED_PARAMS = new Set(['username', 'token', 'password']);
const WORKERS = /\.workers\.dev$/i;
const HLS_PATH = /\.m3u8$/i;

/**
 * @typedef {object} PlayerOption
 * @property {string} url - URL da playlist HLS.
 * @property {string} label - Rótulo do player, ex.: "Dublado".
 */

/**
 * Resolve as opções de player em streams.
 *
 * Cada opção é isolada: a falha vira `console.warn` e não descarta as demais. Sem nenhum stream,
 * o erro agregado sobe quando alguma opção falhou; ausência em todas devolve `{ status: 'absent' }`.
 *
 * @param {{ name: string, url: string }[]} players - Opções publicadas pelo `get_players`.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<{ status: 'ok', streams: object[] }|{ status: 'absent' }>} Resultado das opções.
 * @throws {Error} Se todas as opções falharem ou se nenhuma produzir stream com falha registrada.
 * @example
 * const result = await resolvePlayers(players, request, media);
 * // { status: 'ok', streams: [...] }
 */
export async function resolvePlayers(players, request, media) {
  const streams = [];
  const failures = [];
  const seen = new Set();
  for (const player of players) {
    try {
      const options = await resolvePlayer(player);
      for (const option of options) {
        if (seen.has(option.url)) continue;
        seen.add(option.url);
        streams.push(buildPlayerStream(option, request, media));
      }
    } catch (error) {
      const detail = sanitizeMessage(error.message);
      failures.push(`${player.name}: ${detail}`);
      console.warn(`[${ADDON}] Opção ${player.name} descartada: ${detail}`);
    }
  }
  if (streams.length > 0) return { status: 'ok', streams };
  if (failures.length > 0) throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}`);
  return { status: 'absent' };
}

/**
 * Abre uma opção de player e devolve as fontes HLS aceitas.
 *
 * O host do player precisa ser `mgeb.space` ou `mgeb.lat`; os demais são triagem sem requisição.
 *
 * @param {{ name: string, url: string }} player - Opção de player.
 * @returns {Promise<PlayerOption[]>} Fontes HLS distintas; lista vazia é ausência/triagem.
 * @throws {Error} Se o player não publicar `var sources` ou a estrutura for inválida.
 */
async function resolvePlayer(player) {
  const url = new URL(player.url);
  if (isTriageHost(url.hostname)) return [];
  if (!MGEB_HOSTS.has(url.hostname)) return [];
  const html = await fetchWithAlternateHost(url);
  const sources = extractScriptJson(html, 'sources');
  if (sources === null) throw new Error('Player MGEB sem var sources');
  if (!Array.isArray(sources)) throw new Error('var sources não é lista');
  const options = [];
  for (const source of sources) {
    const file = readHlsSource(source);
    if (file !== null) options.push({ url: file, label: player.name });
  }
  return options;
}

/**
 * Busca o player e, em falha do host `mgeb`, tenta o outro host uma vez.
 *
 * @param {URL} url - URL do player.
 * @returns {Promise<string>} HTML do player.
 * @throws {Error} Se os dois hosts falharem.
 */
async function fetchWithAlternateHost(url) {
  try {
    return await fetchText(url.href);
  } catch (error) {
    const alternate = alternateHost(url);
    if (alternate === null) throw error;
    return fetchText(alternate);
  }
}

/**
 * Troca `mgeb.space` por `mgeb.lat`, ou vice-versa, preservando caminho e query.
 *
 * @param {URL} url - URL do player.
 * @returns {string|null} URL alternativa ou null quando o host não tem par.
 */
function alternateHost(url) {
  let host = null;
  if (url.hostname === 'mgeb.space') host = 'mgeb.lat';
  if (url.hostname === 'mgeb.lat') host = 'mgeb.space';
  if (host === null) return null;
  const alternate = new URL(url.href);
  alternate.hostname = host;
  return alternate.href;
}

/**
 * Triagem de uma fonte de `var sources`.
 *
 * @param {*} source - Item de `sources`.
 * @returns {string|null} URL HLS aceita ou null quando a fonte é descartada.
 */
function readHlsSource(source) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return null;
  if (String(source.type || '').toLowerCase() !== STREAM_TYPE) return null;
  if (typeof source.file !== 'string') return null;
  let url;
  try {
    url = new URL(source.file);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!MGEB_HOSTS.has(url.hostname)) return null;
  if (isTriageHost(url.hostname)) return null;
  if (WORKERS.test(url.hostname)) return null;
  if (url.username !== '' || url.password !== '') return null;
  for (const key of url.searchParams.keys()) {
    if (REJECTED_PARAMS.has(key.toLowerCase())) return null;
  }
  if (!HLS_PATH.test(url.pathname)) return null;
  return url.href;
}

/**
 * Identifica hosts de triagem que nunca devem ser requisitados para mídia.
 *
 * @param {string} hostname - Host da URL.
 * @returns {boolean} True quando o host é triagem.
 */
function isTriageHost(hostname) {
  const host = hostname.toLowerCase();
  return TRIAGE_HOSTS.some((value) => host === value || host.endsWith(`.${value}`) || host.includes(value));
}

/**
 * Monta o stream de uma fonte aceita.
 *
 * @param {PlayerOption} option - Fonte HLS aceita.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {object} Stream validado pelo bloco stream-build.
 * @throws {Error} Se os dados da opção não formarem um stream válido.
 */
function buildPlayerStream(option, request, media) {
  const format = { template: FORMATTER.AUTO, addon: ADDON, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  const fields = {
    url: option.url,
    provider: PROVIDER,
    type: STREAM_TYPE,
    quality: UNKNOWN_QUALITY,
    format,
  };
  const language = languageFromTexts([option.label]);
  if (language !== null && language !== LANGUAGE.UNKNOWN) fields.language = language;
  return buildStream(fields);
}

/**
 * Remove URL, token, hash e credencial das mensagens de log.
 *
 * @param {string} message - Mensagem recebida.
 * @returns {string} Mensagem saneada.
 * @example
 * sanitizeMessage('HTTP 403 em https://cdn.example/v.m3u8?token=abc');
 * // 'HTTP 403 em [url]'
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/\b[0-9a-f]{32}\b/gi, '[hash]')
    .replace(/\b[A-Za-z0-9_-]{28,}\b/g, '[token]');
}
