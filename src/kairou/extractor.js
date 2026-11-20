/**
 * Extrator do Kairou: consulta a API pública de extração por POST com o ID do TMDB e monta os streams.
 *
 * O corpo JSON identifica o título pelo `target` (ID do TMDB, com temporada e episódio em série). A
 * resposta já traz as opções resolvidas (HLS e MP4) e as legendas. O provedor preserva a URL de
 * reprodução publicada, inclusive o proxy público `/api/stream/<id>`, porque é ele que entrega a
 * mídia. As opções 4K são descartadas por triagem, pois a fonte as reserva a assinantes. Erros de
 * rede, JSON inválido e estrutura inesperada são lançados; HTTP 200 com `streams: []` é ausência
 * reconhecida.
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
  const payload = readPayload(
    await fetchJson(`${SOURCE_URL}${EXTRACT_PATH}`, {
      method: 'POST',
      profile: 'api',
      json: extractBody(request, media),
    }),
  );
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
 * Monta o corpo JSON da extração com os campos que o site envia.
 * @param {StreamRequest} request - Pedido validado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {{ target: string, imdbId?: string, title: string, originalTitle: string, isAnime: boolean }}
 *   Corpo da requisição; `imdbId` só entra quando o TMDB o fornece.
 */
function extractBody(request, media) {
  const tmdbId = String(request.tmdbId).trim();
  const body = {
    target: request.mediaType === 'tv' ? `${tmdbId}/${request.season}/${request.episode}` : tmdbId,
    title: media.title,
    originalTitle: media.originalTitle,
    isAnime: media.kind === 'anime',
  };
  if (media.imdbId) body.imdbId = media.imdbId;
  return body;
}

/**
 * Valida o envelope da resposta e separa streams e legendas.
 * @param {*} payload - Corpo JSON devolvido pela API.
 * @returns {ExtractPayload} Streams e legendas da resposta.
 * @throws {Error} Se a resposta não for objeto, se `streams` não for lista ou se `subtitles`
 *   estiver presente fora do formato de lista.
 */
function readPayload(payload) {
  if (!isPlainObject(payload)) throw new Error('Resposta da extração não é objeto');
  if (!Array.isArray(payload.streams)) {
    const reason = failureReason(payload);
    throw new Error(`Resposta da extração sem "streams" como lista${reason ? `: ${reason}` : ''}`);
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
 * Motivo informado pela fonte em uma resposta sem `streams`.
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
    url: httpUrl(option.streamUrl),
    format: formatDetails(providerName, media, request),
  };
  const quality = qualityFromOption(option);
  if (quality) fields.quality = quality;
  const language = streamLanguage(option, payload);
  if (language) fields.language = language;
  const type = streamType(option);
  if (type) fields.type = type;
  const subtitles = subtitlesFor(payload);
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
 * @returns {string|null} Membro de `LANGUAGE` ou null quando a fonte não informa áudio nem `isPtBr`.
 */
function streamLanguage(option, payload) {
  const audio = text(option.audio);
  if (option.isPtBr === true) return LANGUAGE.DUBBED;
  if (option.isPtBr === false) {
    if (/dublado|dubbed/i.test(audio)) return LANGUAGE.DUBBED_NON_PT_BR;
    return offersPortugueseSubtitles(payload) ? LANGUAGE.SUBTITLED : LANGUAGE.NON_PT_BR;
  }
  if (/pt[-_ ]?br/i.test(audio)) return LANGUAGE.DUBBED;
  if (/dublado|dubbed/i.test(audio)) return LANGUAGE.DUBBED_NON_PT_BR;
  if (offersPortugueseSubtitles(payload)) return LANGUAGE.SUBTITLED;
  return audio ? LANGUAGE.NON_PT_BR : null;
}

/**
 * Indica se a resposta oferece legenda em português.
 * @param {ExtractPayload} payload - Resposta validada.
 * @returns {boolean} `true` para legenda com `lang` "pt" ou "pt-BR".
 */
function offersPortugueseSubtitles(payload) {
  return payload.subtitles.some((item) => isPlainObject(item) && isPortugueseLang(item.lang));
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
 * Tipo do stream informado pela fonte em `format`.
 * @param {object} option - Item de `streams`.
 * @returns {string|null} Tipo do stream ou null quando não há informação.
 */
function streamType(option) {
  const declared = text(option.format);
  return declared || null;
}

/**
 * Legendas do topo da resposta.
 * @param {ExtractPayload} payload - Resposta validada.
 * @returns {object[]} Legendas válidas, sem URL repetida.
 */
function subtitlesFor(payload) {
  return readSubtitles(payload.subtitles);
}

/**
 * Resolve, normaliza e deduplica as legendas. Legenda inválida é omitida sem descartar o vídeo.
 * @param {object[]} list - Lista de legendas da resposta.
 * @returns {object[]} Legendas no formato do contrato, na ordem da lista.
 */
function readSubtitles(list) {
  const subtitles = new Map();
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    let url;
    try {
      url = httpUrl(subtitleUrl(item));
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
 * Endereço da legenda: `trackUrl` é o campo atual do cliente da fonte; `url` fica como reserva de
 * respostas antigas.
 * @param {object} item - Item de `subtitles`.
 * @returns {string} Endereço publicado, relativo ou absoluto.
 */
function subtitleUrl(item) {
  return text(item.trackUrl) || text(item.url);
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
 * Rótulo da opção nas mensagens: `label` legível da fonte ou posição na lista.
 * @param {*} option - Item de `streams`.
 * @param {number} index - Posição a partir de zero.
 * @returns {string} Rótulo estável para o aviso.
 */
function optionLabel(option, index) {
  const label = isPlainObject(option) ? text(option.label) : '';
  return label || String(index + 1);
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
