/**
 * Extrator do SeuDorama: consulta a API pelo ID do TMDB, lê a página do Blogger e monta os MP4.
 *
 * A API devolve o endereço do player para o par temporada/episódio; a página publica os MP4
 * progressivos do Google Video. A URL de mídia é vinculada ao IP e expira, então é resolvida a cada
 * pedido e nunca é cacheada, registrada ou usada em sonda. O idioma fica `Idioma Desconhecido`
 * porque a API e o Blogger não publicam áudio nem legenda.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { DEFAULT_USER_AGENT, fetchText } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { fetchVideoUrl, normalizeRequest } from './api.js';
import { extractVideoOptions } from './blogger.js';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./api.js').StreamRequest} StreamRequest
 * @typedef {import('./api.js').TvRequest} TvRequest
 */

/**
 * Valida o pedido, consulta a API, lê a página do Blogger e monta os streams.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio quando a obra não está no catálogo ou a
 *   página não publica `itag` reconhecível.
 * @throws {Error} Em pedido inválido, falha de rede, HTTP, JSON, estrutura ou TMDB.
 */
export async function extractStreams(request, providerName) {
  const normalized = normalizeRequest(request);
  const videoUrl = await fetchVideoUrl(normalized, DEFAULT_USER_AGENT);
  if (videoUrl === null) return [];

  const media = await readMediaInfo(normalized);
  const html = await readBloggerPage(videoUrl);
  return extractVideoOptions(html).map((option) => buildStream({
    url: option.url,
    quality: option.quality,
    type: 'mp4',
    provider: providerName,
    language: LANGUAGE.UNKNOWN,
    headers: { 'User-Agent': DEFAULT_USER_AGENT },
    format: formatDetails(providerName, media, normalized),
  }));
}

/**
 * Lê título e ano do TMDB para o formatador.
 * @param {TvRequest} request - Pedido normalizado.
 * @returns {Promise<MediaInfo>} Dados do título.
 * @throws {Error} Se o TMDB falhar; a mensagem é prefixada por `TMDB:`.
 */
async function readMediaInfo(request) {
  try {
    return await getMediaInfo({ tmdbId: request.tmdbId, mediaType: 'tv' });
  } catch (error) {
    throw new Error(`TMDB: ${error.message}`, { cause: error });
  }
}

/**
 * Baixa a página do Blogger com o mesmo User-Agent usado na reprodução.
 * @param {string} videoUrl - URL do player devolvida pela API.
 * @returns {Promise<string>} HTML da página.
 * @throws {Error} Em falha de rede ou HTTP; a mensagem é prefixada por `Blogger:`.
 */
async function readBloggerPage(videoUrl) {
  try {
    return await fetchText(videoUrl, { headers: { 'User-Agent': DEFAULT_USER_AGENT } });
  } catch (error) {
    throw new Error(`Blogger: ${error.message}`, { cause: error });
  }
}

/**
 * Detalhes do stream para o formatador (bloco custom-formatter).
 * @param {string} providerName - Nome do provedor exibido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {TvRequest} request - Pedido normalizado.
 * @returns {object} Valor do campo `format` de `buildStream`.
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
