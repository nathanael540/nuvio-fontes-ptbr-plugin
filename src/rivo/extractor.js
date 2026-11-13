/**
 * Extrator do provedor RIVO.
 *
 * Consulta a API pública do player (f.rivo.st) pelo ID do TMDB, distribui a
 * consulta pelos servidores de mídia publicados e monta os streams HLS/MP4 com
 * a qualidade, o idioma e as legendas anunciados.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';

const API_BASE = 'https://f.rivo.st';
const API_REFERER = 'https://f.rivo.st/';
const API_HEADERS = Object.freeze({ Referer: API_REFERER });
// O servidor 4 respondeu HTTP 401 nas URLs de mídia em 12/11/2026; volta quando a fonte corrigir.
const EXCLUDED_SERVER_IDS = new Set(['4']);
const SUPPORTED_KINDS = new Set(['hls', 'mp4']);
const HTTP_PROTOCOLS = ['http:', 'https:'];
const SUBTITLE_PROXY = `${API_BASE}/api/subtitle?url=`;

const PORTUGUESE = /\b(?:portuguese|portugues)\b/;
const BRAZIL = /\b(?:brazilian|brasil|brasileiro|brasileira|br)\b/;
const SUBTITLE_HINT = /\b(?:sub|subs|subtitled|subtitles?|legendado|legendada|legendas?)\b/;
const FOREIGN_LANGUAGE = /\b(?:english|ingles|spanish|espanhol|espanol|latino|castellano|french|frances|german|alemao|italian|italiano|japanese|japones|korean|coreano|chinese|chines|mandarim|turkish|turco|arabic|arabe|hindi|bengali|tamil|telugu|tagalog|indonesian|indonesio|kurdish|kurdo|ukr|ukrainian|ucraniano|russian|russo|dutch|holandes|polish|polones|swedish|sueco|danish|dinamarques|norwegian|noruegues|finnish|finlandes|greek|grego|hebrew|hebraico|czech|tcheco|hungarian|hungaro|romanian|romeno|persian|persa|thai|tailandes|vietnamese|vietnamita)\b/;

/**
 * Remove URL, query e hash longa das mensagens para os logs não carregarem mídia assinada.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}

/**
 * Busca a lista pública de servidores de mídia.
 * @returns {Promise<Array<{ id: string, label: string }>>} Servidores publicados.
 * @throws {Error} Se a resposta ou um item não tiver o contrato esperado.
 */
async function fetchServers() {
  const data = await fetchJson(`${API_BASE}/api/servers?v=7`, { profile: 'api', headers: API_HEADERS });
  if (!isPlainObject(data) || !Array.isArray(data.servers)) {
    throw new Error('Contrato de servidores inválido: "servers" ausente ou fora de array');
  }
  return data.servers.map((server, index) => {
    if (!isPlainObject(server)) {
      throw new Error(`Contrato de servidores inválido: item ${index} não é objeto`);
    }
    const id = nonEmptyText(server.id);
    const label = nonEmptyText(server.label);
    if (id === null) throw new Error(`Contrato de servidores inválido: item ${index} sem "id"`);
    if (label === null) throw new Error(`Contrato de servidores inválido: item ${index} sem "label"`);
    return { id, label };
  });
}

/**
 * Busca título e ano da obra, sem interromper o provedor em falha.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv' }} request - Pedido validado.
 * @param {string} providerName - Nome do provedor para o aviso.
 * @returns {Promise<{ title?: string, year?: number }>} Metadados disponíveis.
 */
async function fetchMeta(request, providerName) {
  try {
    const data = await fetchJson(`${API_BASE}/api/meta/${request.mediaType}/${request.tmdbId}`, {
      profile: 'api',
      headers: API_HEADERS,
    });
    if (!isPlainObject(data)) throw new Error('resposta fora do objeto esperado');
    const meta = {};
    const title = nonEmptyText(data.title);
    if (title !== null) meta.title = title;
    const year = readYear(data.year);
    if (year !== undefined) meta.year = year;
    if (meta.title === undefined && meta.year === undefined) {
      console.warn(`[${providerName}] Metadados indisponíveis; seguindo sem título/ano`);
    }
    return meta;
  } catch {
    console.warn(`[${providerName}] Metadados indisponíveis; seguindo sem título/ano`);
    return {};
  }
}

/**
 * Busca as fontes de um servidor pelo ID do TMDB e pelas coordenadas do episódio.
 * @param {{ id: string, label: string }} server - Servidor consultado.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<{ sources: Array<*>, subtitles: Array<*> }>} Fontes e legendas anunciadas.
 * @throws {Error} Se a resposta não tiver o contrato esperado.
 */
async function fetchServerSources(server, request) {
  const params = request.mediaType === 'tv'
    ? { s: String(request.season), e: String(request.episode), server: server.id }
    : { server: server.id };
  const url = `${API_BASE}/api/source/${request.mediaType}/${request.tmdbId}?${new URLSearchParams(params).toString()}`;
  const data = await fetchJson(url, { profile: 'api', headers: API_HEADERS });
  if (!isPlainObject(data)) throw new Error('Contrato de fontes inválido: resposta não é objeto');
  if (!Array.isArray(data.sources)) throw new Error('Contrato de fontes inválido: "sources" ausente ou fora de array');
  const subtitles = data.subtitles === undefined ? [] : data.subtitles;
  if (!Array.isArray(subtitles)) throw new Error('Contrato de fontes inválido: "subtitles" fora de array');
  return { sources: data.sources, subtitles };
}

/**
 * Consulta todos os servidores em paralelo, capturando a falha de cada um.
 * @param {Array<{ id: string, label: string }>} servers - Servidores a consultar.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {string} providerName - Nome do provedor para os avisos.
 * @returns {Promise<Array<object>>} Resultado de cada servidor, na ordem recebida.
 */
async function fetchAllSources(servers, request, providerName) {
  return Promise.all(servers.map(async (server) => {
    try {
      const data = await fetchServerSources(server, request);
      return { server, status: data.sources.length === 0 ? 'empty' : 'ok', ...data };
    } catch (error) {
      console.warn(`[${providerName}] Servidor ${server.label} descartado: ${sanitizeMessage(error.message)}`);
      return { server, status: 'failed', error };
    }
  }));
}

/**
 * Converte as legendas anunciadas por um servidor, mantendo só as utilizáveis e sem repetição.
 * @param {Array<*>} rawSubtitles - Legendas da resposta do servidor.
 * @param {{ label: string }} server - Servidor de origem.
 * @param {string} providerName - Nome do provedor para os avisos.
 * @returns {Array<{ url: string, language: string }>} Legendas prontas para o stream.
 */
function buildSubtitles(rawSubtitles, server, providerName) {
  const subtitles = [];
  const seen = new Set();
  for (const item of rawSubtitles) {
    const url = isPlainObject(item) && isHttpUrl(item.url) ? item.url.trim() : null;
    const language = isPlainObject(item) ? nonEmptyText(item.label) : null;
    if (url === null || language === null) {
      console.warn(`[${providerName}] Legenda do servidor ${server.label} descartada: URL ou idioma ausente`);
      continue;
    }
    const finalUrl = item.direct === true ? url : `${SUBTITLE_PROXY}${encodeURIComponent(url)}`;
    if (seen.has(finalUrl)) continue;
    seen.add(finalUrl);
    subtitles.push({ url: finalUrl, language });
  }
  return subtitles;
}

/**
 * Lê o idioma do primeiro parêntese final do rótulo de qualidade.
 * @param {*} quality - Rótulo de qualidade anunciado pela fonte.
 * @returns {string|undefined} Membro do enum LANGUAGE ou undefined quando o rótulo não conclui.
 */
function languageFromQuality(quality) {
  if (typeof quality !== 'string') return undefined;
  const label = quality.trim();
  const match = label.match(/\(([^()]*)\)\s*$/);
  if (!match) return undefined;
  let text = normalizeText(match[1]);
  if (text === 'br' || text === 'brasil') {
    text = `${normalizeText(label.slice(0, match.index))} ${text}`.trim();
  }
  const hasPortuguese = PORTUGUESE.test(text);
  if (hasPortuguese) {
    const hasSubtitle = SUBTITLE_HINT.test(text);
    if (BRAZIL.test(text)) return hasSubtitle ? LANGUAGE.SUBTITLED : LANGUAGE.DUBBED;
    return hasSubtitle ? LANGUAGE.SUBTITLED_NON_PT_BR : LANGUAGE.DUBBED_NON_PT_BR;
  }
  if (FOREIGN_LANGUAGE.test(text)) return LANGUAGE.NON_PT_BR;
  return undefined;
}

/**
 * Monta o stream de uma fonte aceita ou classifica a fonte como triagem/malformada.
 * @param {*} raw - Item de `sources` recebido do servidor.
 * @param {object} context - Dados da montagem.
 * @param {{ id: string, label: string }} context.server - Servidor de origem.
 * @param {Array<{ url: string, language: string }>} context.subtitles - Legendas do mesmo servidor.
 * @param {{ season: number|null, episode: number|null }} context.request - Pedido validado.
 * @param {{ title?: string, year?: number }} context.meta - Metadados disponíveis.
 * @param {string} context.providerName - Nome do provedor exibido no formato.
 * @returns {{ status: 'stream', stream: object }|{ status: 'skipped' }|{ status: 'invalid', reason: string }} Resultado.
 */
function buildSourceStream(raw, { server, subtitles, request, meta, providerName }) {
  if (!isPlainObject(raw)) return { status: 'invalid', reason: 'item de fonte não é objeto' };
  const kind = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
  if (!SUPPORTED_KINDS.has(kind)) return { status: 'skipped' };
  if (!isHttpUrl(raw.url)) return { status: 'invalid', reason: 'URL da fonte inválida' };

  const fields = {
    url: raw.url,
    format: {
      template: FORMATTER.AUTO,
      addon: providerName,
      title: meta.title,
      year: meta.year,
      season: request.season === null ? undefined : request.season,
      episode: request.episode === null ? undefined : request.episode,
    },
    qualityHints: [raw.quality],
    provider: nonEmptyText(raw.subProvider) || server.label,
    type: kind,
  };
  const language = languageFromQuality(raw.quality);
  if (language !== undefined) fields.language = language;
  if (subtitles.length > 0) fields.subtitles = subtitles;

  try {
    return { status: 'stream', stream: buildStream(fields) };
  } catch (error) {
    return { status: 'invalid', reason: sanitizeMessage(error.message) };
  }
}

/**
 * Descreve o estado de um servidor para o erro agregado.
 * @param {string} status - Estado da consulta ('ok', 'empty' ou 'failed').
 * @param {number} valid - Streams novos produzidos.
 * @param {number} skipped - Fontes descartadas por triagem.
 * @param {number} invalid - Fontes suportadas malformadas.
 * @param {Error} [error] - Falha da consulta do servidor.
 * @returns {string} Descrição curta e saneada.
 */
function describeServer(status, valid, skipped, invalid, error) {
  if (status === 'failed') return `falha (${sanitizeMessage(error.message)})`;
  if (status === 'empty') return 'sem fontes';
  if (invalid > 0 && valid === 0) return `fontes inválidas (${invalid})`;
  if (valid === 0 && skipped > 0) return 'somente triagem';
  return `${valid} stream(s)`;
}

/**
 * Extrai os streams do pedido consultando o player público por ID do TMDB.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {string} [providerName] - Nome do provedor exibido no formato.
 * @returns {Promise<object[]>} Streams montados, na ordem dos servidores e das fontes.
 * @throws {Error} Se a consulta ou o contrato falharem, ou se todas as opções falharem sem stream.
 */
export async function extractStreams(request, providerName = 'RIVO') {
  const metaPromise = fetchMeta(request, providerName);
  const servers = await fetchServers();
  const targetServers = servers.filter((server) => !EXCLUDED_SERVER_IDS.has(server.id));
  const [results, meta] = await Promise.all([
    fetchAllSources(targetServers, request, providerName),
    metaPromise,
  ]);

  const streams = [];
  const seenUrls = new Set();
  const sourceFailures = [];
  const states = [];

  for (const result of results) {
    const { server } = result;
    const subtitles = result.status === 'failed' ? [] : buildSubtitles(result.subtitles, server, providerName);
    let valid = 0;
    let skipped = 0;
    let invalid = 0;
    if (result.status !== 'failed') {
      for (const raw of result.sources) {
        const outcome = buildSourceStream(raw, { server, subtitles, request, meta, providerName });
        if (outcome.status === 'stream') {
          if (seenUrls.has(outcome.stream.url)) continue;
          seenUrls.add(outcome.stream.url);
          streams.push(outcome.stream);
          valid += 1;
        } else if (outcome.status === 'skipped') {
          skipped += 1;
        } else {
          invalid += 1;
          console.warn(`[${providerName}] Fonte ${server.label} descartada: ${outcome.reason}`);
          sourceFailures.push(`${server.label}: ${outcome.reason}`);
        }
      }
    }
    states.push(`${server.label}=${describeServer(result.status, valid, skipped, invalid, result.error)}`);
  }

  if (streams.length > 0) return streams;

  const hasFailure = results.some((result) => result.status === 'failed') || sourceFailures.length > 0;
  if (!hasFailure) return [];

  const details = sourceFailures.length > 0 ? `; fontes inválidas: ${sourceFailures.join('; ')}` : '';
  throw new Error(`Nenhuma fonte produziu stream (${states.join('; ')})${details}`);
}

/**
 * Indica se o valor é objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Devolve o texto sem espaços nas pontas ou null quando vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null} Texto limpo ou null.
 */
function nonEmptyText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Lê um ano com quatro dígitos, em texto ou número.
 * @param {*} value - Valor recebido.
 * @returns {number|undefined} Ano ou undefined quando fora do formato.
 */
function readYear(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  const text = nonEmptyText(value);
  if (text === null || !/^\d{4}$/.test(text)) return undefined;
  return Number(text);
}

/**
 * Indica se o valor é uma URL HTTP(S).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    return HTTP_PROTOCOLS.includes(new URL(value.trim()).protocol);
  } catch {
    return false;
  }
}
