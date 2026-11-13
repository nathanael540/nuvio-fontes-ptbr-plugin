/**
 * Extrator do Kairou: consulta a API pública de extração pelo ID do TMDB e monta os streams.
 *
 * A resposta do Kairou já traz as opções resolvidas (HLS e MP4) e as legendas. O provedor preserva
 * a URL de reprodução publicada, inclusive o proxy público `/api/proxy`, porque os hosts de origem
 * bloqueiam parte dos MP4. As opções 4K são descartadas por triagem, pois a fonte as reserva a
 * assinantes. Erros de rede, JSON inválido e estrutura inesperada são lançados; `ok: true` com
 * `streams: []` é ausência reconhecida.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { normalizeQuality } from '../_blocks/quality-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';

const SOURCE_URL = 'https://www.kairou.space';
const EXTRACT_PATH = '/api/extract';
const FOUR_K = '4K';
const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * Nomes legíveis das legendas por código de idioma da fonte. Código fora da tabela usa o próprio
 * texto, para não inventar um nome nem perder a legenda.
 */
const SUBTITLE_LANGUAGES = {
  pt: 'Português',
  'pt-br': 'Português (Brasil)',
  'pt-pt': 'Português (Portugal)',
  en: 'English',
  'en-us': 'English (US)',
  'en-gb': 'English (UK)',
  es: 'Español',
  'es-la': 'Español (Latinoamérica)',
  'es-es': 'Español (España)',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
  th: 'ไทย',
  id: 'Bahasa Indonesia',
  tr: 'Türkçe',
  pl: 'Polski',
  nl: 'Nederlands',
  sv: 'Svenska',
  da: 'Dansk',
  fi: 'Suomi',
  no: 'Norsk',
  cs: 'Čeština',
  hu: 'Magyar',
  ro: 'Română',
  el: 'Ελληνικά',
  he: 'עברית',
  uk: 'Українська',
  vi: 'Tiếng Việt',
};

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} ExtractPayload
 * @property {object[]} streams - Opções de mídia da fonte, na ordem da resposta.
 * @property {object[]} subtitles - Legendas do topo da resposta.
 */

/**
 * Valida o pedido, consulta o TMDB e a API de extração e monta os streams.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio quando a fonte não tem o título ou só
 *   oferece 4K.
 * @throws {Error} Em pedido inválido, falha de rede, JSON ou estrutura da resposta, ou quando todas
 *   as opções de mídia falham.
 */
export async function extractStreams(request, providerName) {
  validateRequest(request);

  const media = await getMediaInfo({ tmdbId: request.tmdbId, mediaType: request.mediaType });
  const payload = readPayload(await fetchJson(extractUrl(request, media), { profile: 'api' }));
  if (payload.streams.length === 0) return [];

  const streams = [];
  const seen = new Set();
  const causes = [];
  payload.streams.forEach((option, index) => {
    const label = optionLabel(option, index);
    try {
      const stream = buildOption(option, payload, media, request, providerName);
      if (stream === null || seen.has(stream.url)) return;
      seen.add(stream.url);
      streams.push(stream);
    } catch (error) {
      causes.push(`${label}: ${error.message}`);
      console.warn(`[${providerName}] Opção ${label} descartada: ${error.message}`);
    }
  });

  if (streams.length === 0 && causes.length > 0) {
    throw new Error(`Todas as opções falharam: [${causes.join('; ')}]`);
  }
  return streams;
}

/**
 * Valida o pedido antes de qualquer requisição.
 * @param {StreamRequest} request - Valores recebidos do app.
 * @returns {void}
 * @throws {Error} Se o ID não for numérico, se o tipo não for filme nem série, ou se uma série vier
 *   sem temporada e episódio inteiros a partir de 1.
 */
function validateRequest(request) {
  if (!/^\d+$/.test(String(request.tmdbId).trim())) {
    throw new Error(`ID do TMDB inválido: "${request.tmdbId}"`);
  }
  if (request.mediaType !== 'movie' && request.mediaType !== 'tv') {
    throw new Error(`Tipo de mídia inválido: "${request.mediaType}"`);
  }
  if (request.mediaType === 'tv') {
    const { season, episode } = request;
    if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
      throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
    }
  }
}

/**
 * Monta a URL da extração com os parâmetros que o site usa.
 * @param {StreamRequest} request - Pedido validado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string} URL absoluta de `/api/extract`.
 */
function extractUrl(request, media) {
  const params = new URLSearchParams();
  params.append('tmdbId', String(request.tmdbId).trim());
  params.append('type', request.mediaType === 'movie' ? 'movie' : 'series');
  params.append('title', media.title);
  if (request.mediaType === 'tv') {
    params.append('season', String(request.season));
    params.append('episode', String(request.episode));
  }
  if (media.kind === 'anime') params.append('isAnime', '1');
  return `${SOURCE_URL}${EXTRACT_PATH}?${params.toString()}`;
}

/**
 * Valida o envelope da resposta e separa streams e legendas.
 * @param {*} payload - Corpo JSON devolvido pela API.
 * @returns {ExtractPayload} Streams e legendas da resposta.
 * @throws {Error} Se a resposta não for objeto, se `ok` não for `true`, se `streams` não for lista ou
 *   se `subtitles` estiver presente fora do formato de lista.
 */
function readPayload(payload) {
  if (!isPlainObject(payload)) throw new Error('Resposta da extração não é objeto');
  if (payload.ok !== true) {
    const reason = failureReason(payload);
    throw new Error(`Extração recusada pela fonte${reason ? `: ${reason}` : ''}`);
  }
  if (!Array.isArray(payload.streams)) {
    throw new Error('Resposta da extração sem "streams" como lista');
  }
  return {
    streams: payload.streams,
    subtitles: readSubtitleList(payload.subtitles),
  };
}

/**
 * Lista de legendas do topo da resposta; ausência vale lista vazia.
 * @param {*} value - Valor recebido em `payload.subtitles`.
 * @returns {object[]} Lista de legendas.
 * @throws {Error} Se o valor informado não for lista.
 */
function readSubtitleList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('Resposta da extração com "subtitles" fora do formato de lista');
  return value;
}

/**
 * Motivo informado pela fonte quando `ok` não é `true`.
 * @param {object} payload - Corpo JSON da resposta.
 * @returns {string} Texto do motivo ou string vazia.
 */
function failureReason(payload) {
  for (const key of ['error', 'message', 'reason']) {
    const value = text(payload[key]);
    if (value) return value;
  }
  return '';
}

/**
 * Monta uma opção de mídia. Opção 4K retorna `null` por triagem, sem contar como falha.
 * @param {*} option - Item de `streams`.
 * @param {ExtractPayload} payload - Resposta validada.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido validado.
 * @param {string} providerName - Nome do provedor para o formatador.
 * @returns {Stream|null} Stream montado ou null quando a opção é 4K.
 * @throws {Error} Se a opção for inválida ou `buildStream` rejeitar os campos.
 */
function buildOption(option, payload, media, request, providerName) {
  if (!isPlainObject(option)) throw new Error('Opção de mídia inválida');
  if (isFourK(option)) return null;

  const fields = {
    url: httpUrl(option.url),
    format: formatDetails(providerName, media, request),
  };
  const quality = qualityFromOption(option);
  if (quality) fields.quality = quality;
  const language = streamLanguage(option, payload);
  if (language) fields.language = language;
  const provider = text(option.source);
  if (provider) fields.provider = provider;
  const type = streamType(option);
  if (type) fields.type = type;
  const subtitles = subtitlesFor(option, payload);
  if (subtitles.length > 0) fields.subtitles = subtitles;

  return buildStream(fields);
}

/**
 * Texto de qualidade da fonte quando ele é uma resolução reconhecível. Rótulos como "Auto" não
 * declaram qualidade: o campo é omitido e `buildStream` descobre localmente, sem descartar o stream.
 * @param {object} option - Item de `streams`.
 * @returns {string} Texto de qualidade ou string vazia.
 */
function qualityFromOption(option) {
  const quality = text(option.quality);
  if (!quality) return '';
  try {
    normalizeQuality(quality);
    return quality;
  } catch {
    return '';
  }
}

/**
 * Indica se a fonte reserva a opção a assinantes (4K).
 * @param {object} option - Item de `streams`.
 * @returns {boolean} `true` para `is4k: true` ou qualidade normalizada "4K".
 */
function isFourK(option) {
  if (option.is4k === true) return true;
  const quality = text(option.quality);
  if (!quality) return false;
  try {
    return normalizeQuality(quality) === FOUR_K;
  } catch {
    return false;
  }
}

/**
 * Classifica o áudio da opção e, sem dublagem, se há legenda em português.
 * @param {object} option - Item de `streams`.
 * @param {ExtractPayload} payload - Resposta validada.
 * @returns {string|null} Membro de `LANGUAGE` ou null quando a fonte não informa `isDub`.
 */
function streamLanguage(option, payload) {
  if (option.isDub === true) return LANGUAGE.DUBBED;
  if (option.isDub !== false) return null;
  return offersPortugueseSubtitles(option, payload) ? LANGUAGE.SUBTITLED : LANGUAGE.NON_PT_BR;
}

/**
 * Indica se a opção ou a resposta oferece legenda em português.
 * @param {object} option - Item de `streams`.
 * @param {ExtractPayload} payload - Resposta validada.
 * @returns {boolean} `true` para legenda com `lang` "pt" ou "pt-BR".
 */
function offersPortugueseSubtitles(option, payload) {
  return [option.subtitles, payload.subtitles].some(
    (list) => Array.isArray(list) && list.some((item) => isPlainObject(item) && isPortugueseLang(item.lang)),
  );
}

/**
 * Indica se o código de idioma da legenda é português do Brasil ou português sem região.
 * @param {*} value - Código recebido em `lang`.
 * @returns {boolean} `true` para "pt", "pt-BR", "pt_BR" e "ptbr".
 */
function isPortugueseLang(value) {
  return /^pt(?:[-_ ]?br)?$/i.test(text(value));
}

/**
 * Tipo do stream informado pela fonte; sem ele, infere de `isHls`.
 * @param {object} option - Item de `streams`.
 * @returns {string|null} Tipo do stream ou null quando não há informação.
 */
function streamType(option) {
  const declared = text(option.type);
  if (declared) return declared;
  if (option.isHls === true) return 'hls';
  if (option.isHls === false) return 'mp4';
  return null;
}

/**
 * Legendas da opção, ou as da resposta quando a opção não traz lista preenchida.
 * @param {object} option - Item de `streams`.
 * @param {ExtractPayload} payload - Resposta validada.
 * @returns {object[]} Legendas válidas, sem URL repetida.
 */
function subtitlesFor(option, payload) {
  const own = Array.isArray(option.subtitles) && option.subtitles.length > 0;
  return readSubtitles(own ? option.subtitles : payload.subtitles);
}

/**
 * Resolve, normaliza e deduplica as legendas. Legenda inválida é omitida sem descartar o vídeo.
 * @param {object[]} list - Lista de legendas da opção ou da resposta.
 * @returns {object[]} Legendas no formato do contrato, na ordem da lista.
 */
function readSubtitles(list) {
  const subtitles = new Map();
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    let url;
    try {
      url = httpUrl(item.url);
    } catch {
      continue;
    }
    const language = subtitleLanguage(item.lang);
    if (!language) continue;
    const subtitle = { url, language };
    const name = text(item.label);
    if (name) subtitle.name = name;
    if (!subtitles.has(url)) subtitles.set(url, subtitle);
  }
  return [...subtitles.values()];
}

/**
 * Nome legível do idioma da legenda, com o código bruto como reserva.
 * @param {*} value - Código recebido em `lang`.
 * @returns {string} Nome do idioma ou string vazia quando o código está ausente.
 */
function subtitleLanguage(value) {
  const code = text(value);
  if (!code) return '';
  const key = code.toLowerCase().replace(/_/g, '-');
  return SUBTITLE_LANGUAGES[key] || code;
}

/**
 * Resolve uma URL de reprodução ou legenda, aceitando apenas HTTP(S).
 * @param {*} value - Endereço relativo ou absoluto publicado pela fonte.
 * @returns {string} URL absoluta.
 * @throws {Error} Se o endereço faltar, for inválido ou não usar HTTP(S).
 */
function httpUrl(value) {
  const raw = text(value);
  if (!raw) throw new Error('URL de mídia ausente');
  let url;
  try {
    url = new URL(raw, SOURCE_URL);
  } catch {
    throw new Error(`URL de mídia inválida: "${raw}"`);
  }
  if (!HTTP_PROTOCOLS.includes(url.protocol)) {
    throw new Error(`URL de mídia não é HTTP(S): "${raw}"`);
  }
  return url.href;
}

/**
 * Detalhes do stream para o formatador (bloco custom-formatter).
 * @param {string} providerName - Nome do provedor exibido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido validado.
 * @returns {object} Valor do campo `format` de `buildStream`.
 */
function formatDetails(providerName, media, request) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  return format;
}

/**
 * Rótulo da opção nas mensagens: `id` da fonte ou posição na lista.
 * @param {*} option - Item de `streams`.
 * @param {number} index - Posição a partir de zero.
 * @returns {string} Rótulo estável para o aviso.
 */
function optionLabel(option, index) {
  const id = isPlainObject(option) ? text(option.id) : '';
  return id || String(index + 1);
}

/**
 * Texto não vazio, sem espaços nas pontas.
 * @param {*} value - Valor recebido.
 * @returns {string} Texto limpo ou string vazia.
 */
function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * Indica se o valor é um objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean} `true` para objeto simples.
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
