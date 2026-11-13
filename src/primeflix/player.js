/**
 * Resolução de mídia do Primeflix: player `/vvv`, URL final e montagem do stream.
 *
 * O `/vvv` responde 307. Sem `Referer` da ficha, o `Location` volta malformado e a URL final
 * responde 404; com o `Referer`, a URL final é HTTP(S) de playlist HLS ou arquivo direto.
 * O corpo não é lido: a URL final vem de `response.url` e o `Range` do filme evita baixar o arquivo.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { HEADER_PROFILES } from '../_blocks/http/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { findCandidate, SOURCE_URL } from './catalog.js';

const PROVIDER_LABEL = 'Primeflix';
const MEDIA_TYPES = Object.freeze({ m3u8: 'hls', mkv: 'mkv', mp4: 'mp4' });
const MEDIA_EXTENSION = /\.([a-z0-9]+)$/i;

/**
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./catalog.js').StreamRequest} StreamRequest
 * @typedef {import('./catalog.js').Detail} Detail
 */

/**
 * @typedef {object} Episode
 * @property {number} season - Temporada a partir de 1.
 * @property {number} episode - Episódio a partir de 1.
 */

/**
 * @typedef {object} MediaUrl
 * @property {string} url - URL final HTTP(S) de mídia.
 * @property {string} filename - Nome do arquivo final, usado pelo formatador e pelo idioma.
 * @property {string} type - Tipo do stream: `hls`, `mkv` ou `mp4`.
 */

/**
 * Localiza a ficha confirmada, exige o episódio anunciado e monta o stream do pedido.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @returns {Promise<Stream[]>} Stream do pedido; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, layout alterado ou mídia não resolvida.
 */
export async function extractStreams(request) {
  const episode = readEpisode(request);
  const found = await findCandidate(request);
  if (found === null) return [];

  const { media, detail } = found;
  if (episode !== null && !detail.episodes.has(`${episode.season}:${episode.episode}`)) return [];

  const mediaUrl = await resolveMedia(buildPlayerUrl(detail, episode), detail.url, episode === null);
  return [
    buildStream({
      url: mediaUrl.url,
      provider: PROVIDER_LABEL,
      type: mediaUrl.type,
      format: formatDetails(media, episode, mediaUrl.filename),
    }),
  ];
}

/**
 * Lê temporada e episódio do pedido de série.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @returns {Episode|null} Coordenadas em séries; null em filmes.
 * @throws {Error} Se uma série vier sem temporada ou episódio inteiros a partir de 1.
 */
function readEpisode(request) {
  if (request.mediaType !== 'tv') return null;
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { season, episode };
}

/**
 * Monta a URL do player Playerjs.
 * @param {Detail} detail - Ficha confirmada.
 * @param {Episode|null} episode - Coordenadas em séries; null em filmes.
 * @returns {string} URL do `/vvv`.
 */
function buildPlayerUrl(detail, episode) {
  let url = `${SOURCE_URL}/vvv?id=${detail.vId}`;
  if (episode !== null) url += `&season=${episode.season}&episode=${episode.episode}`;
  return `${url}&mobile=1&get=video`;
}

/**
 * Resolve o redirecionamento do player e exige uma URL final de mídia.
 * @param {string} playerUrl - URL do `/vvv`.
 * @param {string} referer - URL da ficha, necessária para o `Location` absoluto.
 * @param {boolean} isMovie - Envia `Range: bytes=0-0` no filme para não baixar a mídia.
 * @returns {Promise<MediaUrl>} URL final, arquivo e tipo.
 * @throws {Error} Se o player responder fora de 2xx ou a URL final não for mídia HTTP(S).
 */
async function resolveMedia(playerUrl, referer, isMovie) {
  const headers = { ...HEADER_PROFILES.player, Referer: referer };
  if (isMovie) headers.Range = 'bytes=0-0';

  const response = await fetch(playerUrl, { headers });
  if (!response.ok) throw new Error(`Player do Primeflix respondeu HTTP ${response.status}`);
  await discardBody(response);
  return readMediaUrl(response.url);
}

/**
 * Encerra o corpo sem lê-lo: a URL final já basta e o arquivo não pode ser baixado.
 * @param {Response} response - Resposta do `/vvv` após os redirecionamentos.
 * @returns {Promise<void>} Conclui quando o corpo é cancelado ou não oferece cancelamento.
 */
async function discardBody(response) {
  const body = response.body;
  if (!body || typeof body.cancel !== 'function') return;
  try {
    await body.cancel();
  } catch {
    // Corpo já encerrado pelo runtime; a URL final continua válida.
  }
}

/**
 * Valida a URL final e deriva o tipo pela extensão, nunca pelo `Content-Type` do `/vvv`.
 * @param {string} finalUrl - URL final informada por `response.url`.
 * @returns {MediaUrl} URL final, arquivo e tipo.
 * @throws {Error} Se a URL faltar, não for HTTP(S) ou não tiver extensão de mídia reconhecida.
 */
function readMediaUrl(finalUrl) {
  if (typeof finalUrl !== 'string' || finalUrl.trim() === '') {
    throw new Error('Player do Primeflix sem URL final');
  }
  let parsed;
  try {
    parsed = new URL(finalUrl);
  } catch {
    throw new Error('Player do Primeflix com URL final inválida');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Player do Primeflix com URL final fora de HTTP(S)');
  }

  const segment = parsed.pathname.split('/').pop() || '';
  let filename;
  try {
    filename = decodeURIComponent(segment);
  } catch {
    filename = segment;
  }
  const extension = MEDIA_EXTENSION.exec(filename);
  const type = extension === null ? null : MEDIA_TYPES[extension[1].toLowerCase()];
  if (!type) throw new Error('Player do Primeflix sem extensão de mídia reconhecida');

  return { url: parsed.href, filename, type };
}

/**
 * Detalhes do stream para o formatador e para a descoberta local de idioma/qualidade.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {Episode|null} episode - Coordenadas em séries; null em filmes.
 * @param {string} filename - Nome do arquivo final.
 * @returns {object} Valor do campo `format` de `buildStream`.
 */
function formatDetails(media, episode, filename) {
  const format = {
    template: FORMATTER.AUTO,
    addon: PROVIDER_LABEL,
    title: media.title,
    filename,
  };
  if (media.year !== null) format.year = media.year;
  if (episode !== null) {
    format.season = episode.season;
    format.episode = episode.episode;
  }
  return format;
}
