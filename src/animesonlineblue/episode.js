/**
 * Áudios e players do episódio no Animes Online Blue.
 *
 * Cada áudio publicado na grade (`leg` e `dub`) é uma opção independente: `GET /api/episodio/<id>`
 * confirma o tipo e devolve o `playerUrl`. O player do Blogger é lido pelo bloco `blogger-video`,
 * que extrai os MP4 progressivos de `streamingData.formats`; URLs de mídia direta são aceitas e
 * hosts desconhecidos são triagem. A falha de uma opção preserva a outra.
 */

import { extractBloggerFormats } from '../_blocks/blogger-video/index.mjs';
import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson, fetchText } from '../_blocks/http/index.mjs';
import { LANGUAGE, languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { SITE_URL } from './catalog.js';

const EPISODE_PATH = '/api/episodio/';
const BLOGGER_HOSTS = new Set(['blogger.com', 'www.blogger.com']);
const BLOGGER_PATH = '/video.g';
const MEDIA_PATH = /\.(?:mp4|mkv|m3u8)$/i;
const HTTP_PROTOCOLS = ['http:', 'https:'];
const AUDIO_LABELS = Object.freeze({ leg: 'Legendado', dub: 'Dublado' });

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('./grid.js').AudioReference} AudioReference
 * @typedef {import('./grid.js').EpisodeEntry} EpisodeEntry
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number} season - Temporada pedida.
 * @property {number} episode - Episódio pedido.
 */

/**
 * @typedef {object} EpisodeData
 * @property {string|null} tipo - Tipo de áudio publicado ("Dublado"/"Legendado") ou `null`.
 * @property {string|null} title - Título do episódio ou `null`.
 * @property {string} playerUrl - URL do player, possivelmente vazia.
 */

/**
 * Resolve as opções de áudio do episódio e monta os streams.
 *
 * Cada opção é consultada e resolvida em isolamento. A falha de uma opção gera aviso
 * `[<provedor>] Opção <áudio> descartada: <causa>` e preserva a outra. Quando nenhuma opção produz
 * stream e ao menos uma falhou, lança erro agregado. Opções apenas triadas não são falha.
 *
 * @param {EpisodeEntry} entry - Episódio selecionado na grade.
 * @param {StreamRequest} request - Pedido do app.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor, usado nos logs e no formatador.
 * @param {string} slug - Slug confirmado da ficha, usado na página do anime e no `Referer`.
 * @returns {Promise<object[]>} Streams das opções que resolveram; vazio quando a fonte não publicou
 *   áudio ou quando todas as opções foram triadas.
 * @throws {Error} Se todas as opções falharem e nenhuma produzir stream.
 * @example
 * const streams = await resolveEpisodeStreams(entry, { season: 1, episode: 1 }, media, 'Animes Online Blue', 'kimetsu-no-yaiba');
 */
export async function resolveEpisodeStreams(entry, request, media, providerName, slug) {
  const options = listAudioOptions(entry);
  if (options.length === 0) return [];

  const pageUrl = buildPageUrl(slug);
  const results = await Promise.all(
    options.map((option) => resolveOption(option, pageUrl, request, media, providerName)),
  );

  const streams = [];
  const failures = [];
  for (const result of results) {
    if (result.ok) {
      streams.push(...result.streams);
      continue;
    }
    failures.push(`${result.label}: ${result.error.message}`);
    console.warn(`[${providerName}] Opção ${result.label} descartada: ${result.error.message}`);
  }

  if (streams.length > 0) return streams;
  if (failures.length > 0) throw new Error(`Nenhuma opção de áudio produziu stream: ${failures.join('; ')}`);
  return [];
}

/**
 * Lista as opções de áudio publicadas no episódio.
 * @param {EpisodeEntry} entry - Episódio selecionado.
 * @returns {{ field: 'leg'|'dub', label: string, id: number }[]} Opções não nulas, na ordem leg/dub.
 */
function listAudioOptions(entry) {
  const options = [];
  for (const field of ['leg', 'dub']) {
    const audio = entry[field];
    if (audio !== null) options.push({ field, label: AUDIO_LABELS[field], id: audio.id });
  }
  return options;
}

/**
 * Resolve uma opção de áudio sem deixar a falha escapar.
 * @param {{ field: 'leg'|'dub', label: string, id: number }} option - Opção de áudio.
 * @param {string} pageUrl - Página do anime, usada como `Referer`.
 * @param {StreamRequest} request - Pedido do app.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<{ ok: true, label: string, streams: object[] }|{ ok: false, label: string, error: Error }>} Resultado isolado.
 */
async function resolveOption(option, pageUrl, request, media, providerName) {
  try {
    const episode = await fetchEpisode(option.id, pageUrl);
    const player = classifyPlayer(episode.playerUrl);
    if (player.kind === 'triage') {
      console.log(`[${providerName}] Opção ${option.label} descartada por triagem: ${player.reason}`);
      return { ok: true, label: option.label, streams: [] };
    }

    const formats = player.kind === 'blogger'
      ? await readBloggerFormats(player.url)
      : [{ url: player.url, qualityLabel: null }];
    const streams = formats.map((format) => buildOptionStream(format, episode, request, media, providerName));
    return { ok: true, label: option.label, streams };
  } catch (error) {
    return { ok: false, label: option.label, error: new Error(sanitizeMessage(error.message)) };
  }
}

/**
 * Consulta a API do episódio e valida a resposta.
 * @param {number} id - Identificador do áudio.
 * @param {string} pageUrl - Página do anime, usada como `Referer`.
 * @returns {Promise<EpisodeData>} Dados do episódio.
 * @throws {Error} Se a resposta não for 2xx, o JSON for inválido ou a estrutura esperada faltar.
 */
async function fetchEpisode(id, pageUrl) {
  const url = `${SITE_URL}${EPISODE_PATH}${id}`;
  const data = await fetchJson(url, { profile: 'api', headers: { Referer: pageUrl } });
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Episódio ${id} com resposta fora do contrato`);
  }

  const tipo = readOptionalText(data.tipo);
  const title = readOptionalText(data.title);
  if (tipo === null && title === null) {
    throw new Error(`Episódio ${id} sem tipo ou título para confirmar o idioma`);
  }
  return {
    tipo,
    title,
    playerUrl: typeof data.playerUrl === 'string' ? data.playerUrl.trim() : '',
  };
}

/**
 * Classifica o `playerUrl` publicado pelo episódio.
 * @param {string} playerUrl - URL recebida da API.
 * @returns {{ kind: 'blogger', url: string }|{ kind: 'direct', url: string }|{ kind: 'triage', reason: string }} Classificação.
 */
function classifyPlayer(playerUrl) {
  if (playerUrl === '') return { kind: 'triage', reason: 'episódio sem playerUrl' };

  let url;
  try {
    url = new URL(playerUrl);
  } catch {
    return { kind: 'triage', reason: 'playerUrl inválida' };
  }
  if (!HTTP_PROTOCOLS.includes(url.protocol)) {
    return { kind: 'triage', reason: 'playerUrl fora de HTTP(S)' };
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOGGER_HOSTS.has(hostname) && url.pathname === BLOGGER_PATH) {
    return { kind: 'blogger', url: url.href };
  }
  if (MEDIA_PATH.test(url.pathname)) return { kind: 'direct', url: url.href };
  return { kind: 'triage', reason: `host ${hostname} não suportado` };
}

/**
 * Lê os formatos progressivos do player do Blogger.
 * @param {string} playerUrl - URL de `blogger.com/video.g?token=...`.
 * @returns {Promise<{ url: string, qualityLabel: string|null }[]>} Formatos na ordem publicada.
 * @throws {Error} Se a página não responder 2xx ou não publicar MP4 progressivo.
 */
async function readBloggerFormats(playerUrl) {
  const html = await fetchText(playerUrl, { profile: 'player' });
  return extractBloggerFormats(html);
}

/**
 * Monta um stream para um formato do player.
 * @param {{ url: string, qualityLabel: string|null }} format - Formato resolvido.
 * @param {EpisodeData} episode - Dados do áudio consultado.
 * @param {StreamRequest} request - Pedido do app.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor.
 * @returns {object} Stream validado por `buildStream`.
 */
function buildOptionStream(format, episode, request, media, providerName) {
  const fields = {
    url: format.url,
    format: formatDetails(providerName, media, request),
    provider: providerName,
    type: 'mp4',
  };
  if (format.qualityLabel !== null) fields.qualityHints = [format.qualityLabel];

  const language = confirmedLanguage(episode);
  if (language !== null) {
    fields.language = language;
  } else {
    const hints = [episode.tipo, episode.title].filter((value) => value !== null);
    if (hints.length > 0) fields.languageHints = hints;
  }
  return buildStream(fields);
}

/**
 * Confirma o idioma somente quando a resposta declara "Dublado" ou "Legendado".
 * @param {EpisodeData} episode - Dados do áudio.
 * @returns {string|null} Membro do enum `LANGUAGE` ou `null` para a descoberta local.
 */
function confirmedLanguage(episode) {
  const language = languageFromTexts([episode.tipo, episode.title]);
  if (language === LANGUAGE.DUBBED || language === LANGUAGE.SUBTITLED) return language;
  return null;
}

/**
 * Detalhes do stream para o formatador.
 * @param {string} providerName - Nome do provedor.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @returns {object} Valor do campo `format`.
 */
function formatDetails(providerName, media, request) {
  const format = {
    template: FORMATTER.AUTO,
    addon: providerName,
    title: media.title,
    season: request.season,
    episode: request.episode,
  };
  if (media.year !== null) format.year = media.year;
  return format;
}

/**
 * Monta a URL da página do anime usada como `Referer`.
 * @param {string} slug - Slug confirmado da ficha.
 * @returns {string} URL da página do anime.
 */
function buildPageUrl(slug) {
  return `${SITE_URL}/anime/${encodeURIComponent(slug)}`;
}

/**
 * Remove URL e hash longos das mensagens de log e das causas agregadas.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}

/**
 * Devolve o texto aparado ou `null` quando ausente ou vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null}
 */
function readOptionalText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}
