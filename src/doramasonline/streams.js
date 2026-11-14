/**
 * Montagem dos streams do Doramas Online.
 *
 * O player define o tipo de mídia, a qualidade nominal e as legendas; o rótulo da opção e o
 * título do embed definem o idioma. Todo stream sai de `buildStream` com `format`, sem `name`,
 * `title`, cabeçalhos de reprodução inventados ou metadados que a fonte não publica.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { LANGUAGE, normalizeLanguage } from '../_blocks/language-discovery/index.mjs';
import { normalizeQuality, UNKNOWN_QUALITY } from '../_blocks/quality-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';

/** Qualidade nominal publicada pelo player Booonceivu; não é uma medição da playlist. */
export const BOOONCEIVU_QUALITIES = Object.freeze({ SD: '1080p', LD: '720p', FD: '360p' });

/**
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 */

/**
 * @typedef {object} PlayerSubtitle
 * @property {string} url - URL http(s) da legenda.
 * @property {string} label - Rótulo publicado pelo player.
 */

/**
 * @typedef {object} PlayerSource
 * @property {string} url - URL http(s) da mídia.
 * @property {string|null} quality - Rótulo de qualidade publicado pelo player.
 */

/**
 * @typedef {object} StreamContext
 * @property {MediaInfo} media - Dados do TMDB.
 * @property {{ season: number, episode: number }|null} episode - Coordenada em séries; null em filmes.
 * @property {string} providerName - Nome do provedor exibido pelo formatador.
 * @property {string} label - Rótulo da opção DooPlay.
 * @property {string|null} embedTitle - Título do embed, quando o player publica.
 * @property {string} provider - Player de origem: `Booonceivu`, `IncVideo` ou `Doramas Online`.
 * @property {string} type - Tipo do stream: `hls` ou `mp4`.
 * @property {Object<string, string>} [qualityMap] - Mapa de rótulos do player para qualidade.
 */

/**
 * Monta os streams de uma opção a partir das mídias publicadas pelo player.
 * @param {StreamContext} context - Dados do pedido e da opção.
 * @param {PlayerSource[]} sources - Mídias publicadas.
 * @param {PlayerSubtitle[]} subtitles - Legendas publicadas.
 * @returns {Stream[]} Streams validados, na ordem publicada.
 * @throws {Error} Se uma mídia ou legenda for inválida ou se o formatador rejeitar os dados.
 * @example
 * buildOptionStreams(
 *   { media, episode: { season: 1, episode: 1 }, providerName: 'Doramas Online', label: 'DUBLADO', embedTitle: null, provider: 'Booonceivu', type: 'hls', qualityMap: BOOONCEIVU_QUALITIES },
 *   [{ url: 'https://cdn.exemplo/video.m3u8', quality: 'SD' }],
 *   [],
 * );
 */
export function buildOptionStreams(context, sources, subtitles) {
  if (!Array.isArray(sources)) throw new Error('Mídias do player devem ser lista');
  if (!Array.isArray(subtitles)) throw new Error('Legendas do player devem ser lista');

  const subtitleItems = subtitles.map(readSubtitle);
  const language = resolveOptionLanguage(context.label, context.embedTitle, subtitles.map((item) => item.label));

  return sources.map((source) => {
    const fields = {
      url: source.url,
      type: context.type,
      provider: context.provider,
      quality: normalizeSourceQuality(source.quality, context.qualityMap || {}),
      language,
      format: formatDetails(context.providerName, context.media, context.episode),
    };
    if (subtitleItems.length > 0) fields.subtitles = subtitleItems;
    return buildStream(fields);
  });
}

/**
 * Resolve o idioma da opção: rótulo DooPlay, título do embed e legendas em português, nesta ordem.
 * @param {string} label - Rótulo da opção (ex.: `DUBLADO (2)`).
 * @param {string|null} embedTitle - Título do embed (ex.: `..._DUB`); `null` quando ausente.
 * @param {string[]} subtitleLabels - Rótulos das legendas publicadas.
 * @returns {string} Um dos seis valores de `LANGUAGE`.
 * @example
 * resolveOptionLanguage('LEGENDADO', null, ['English']); // 'Legendado'
 */
export function resolveOptionLanguage(label, embedTitle, subtitleLabels) {
  const optionLanguage = normalizeLanguage(label);
  if (optionLanguage !== null && optionLanguage !== LANGUAGE.UNKNOWN) return optionLanguage;

  if (typeof embedTitle === 'string' && embedTitle.trim() !== '') {
    const embedLanguage = normalizeLanguage(embedTitle);
    if (embedLanguage !== null && embedLanguage !== LANGUAGE.UNKNOWN) return embedLanguage;
  }

  if (subtitleLabels.some(isPortugueseSubtitle)) return LANGUAGE.SUBTITLED;
  return LANGUAGE.UNKNOWN;
}

/**
 * Normaliza a qualidade publicada pelo player, usando o mapa do próprio player quando houver.
 * @param {string|null} label - Rótulo de qualidade da fonte.
 * @param {Object<string, string>} qualityMap - Mapa de rótulos para qualidade normalizada.
 * @returns {string} `<n>p`, `4K`, `CAM` ou `Desconhecida`.
 * @example
 * normalizeSourceQuality('SD', BOOONCEIVU_QUALITIES); // '1080p'
 * normalizeSourceQuality('720p', {}); // '720p'
 */
export function normalizeSourceQuality(label, qualityMap) {
  if (typeof label !== 'string' || label.trim() === '') return UNKNOWN_QUALITY;
  const key = normalizeText(label).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(qualityMap, key)) return qualityMap[key];
  try {
    return normalizeQuality(label);
  } catch {
    return UNKNOWN_QUALITY;
  }
}

/**
 * Lê uma legenda publicada pelo player.
 * @param {PlayerSubtitle} subtitle - Legenda da fonte.
 * @returns {{ url: string, language: string, name: string }} Legenda no contrato de `buildStream`.
 * @throws {Error} Se a URL não for http(s) ou o rótulo estiver vazio.
 */
function readSubtitle(subtitle) {
  if (typeof subtitle !== 'object' || subtitle === null) throw new Error('Legenda do player deve ser objeto');
  const { url, label } = subtitle;
  assertHttpUrl(url, 'Legenda do player');
  if (typeof label !== 'string' || label.trim() === '') throw new Error('Legenda do player sem rótulo');
  const name = label.trim();
  return { url, language: isPortugueseSubtitle(name) ? 'pt-BR' : name, name };
}

/**
 * Indica se o rótulo identifica português.
 * @param {string} label - Rótulo da legenda.
 * @returns {boolean}
 */
function isPortugueseSubtitle(label) {
  const normalized = normalizeText(label);
  return normalized === 'portugues'
    || normalized.startsWith('portugues ')
    || normalized === 'pt'
    || normalized.startsWith('pt ');
}

/**
 * Exige uma URL http(s).
 * @param {string} url - URL recebida.
 * @param {string} label - Nome do campo nas mensagens.
 * @returns {void}
 * @throws {Error} Se a URL for inválida ou não usar http(s).
 */
function assertHttpUrl(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} com URL inválida`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} deve usar http ou https`);
  }
}

/**
 * Detalhes do stream para o formatador, que gera `name` e `title`.
 * @param {string} providerName - Nome do provedor exibido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {{ season: number, episode: number }|null} episode - Coordenada em séries; null em filmes.
 * @returns {object} Valor do campo `format` de `buildStream`.
 */
function formatDetails(providerName, media, episode) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (episode !== null) {
    format.season = episode.season;
    format.episode = episode.episode;
  }
  return format;
}
