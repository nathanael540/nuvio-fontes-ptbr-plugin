/**
 * Extrator do provedor AnimesHD.
 *
 * O fluxo é: TMDB -> variantes de busca -> confirmação de título e ano na ficha -> temporada pela
 * data de estreia -> episódio pelo `numerando` -> opções DooPlay -> AJAX -> formatos do Blogger ->
 * streams formatados. A ausência de título, temporada, episódio ou opção é reconhecida; falha de
 * rede, HTTP ou estrutura sobe até `getStreams`.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { DEFAULT_USER_AGENT } from '../_blocks/http/index.mjs';
import { languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { findCandidate } from './catalog.js';
import { fetchOptions, selectEpisode } from './episode.js';
import { resolvePlayerOption } from './players.js';
import { sanitizeMessage } from './site.js';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('./episode.js').MediaOption} MediaOption
 * @typedef {import('./players.js').PlayerResolution} PlayerResolution
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'tv'} mediaType - Tipo de mídia; filmes são recusados antes desta etapa.
 * @property {number|null} season - Temporada pedida.
 * @property {number|null} episode - Episódio pedido.
 */

/**
 * Localiza a série no AnimesHD e monta os streams do episódio.
 * @param {StreamRequest} request - Valores já validados pelo ponto de entrada.
 * @param {string} providerName - Nome do provedor, usado nos logs e no formatador.
 * @returns {Promise<object[]>} Streams encontrados; vazio na ausência reconhecida de título,
 *   temporada, episódio ou opções.
 * @throws {Error} Em falha de rede, HTTP, parsing ou estrutura inesperada, ou quando todas as
 *   opções conhecidas falham.
 * @example
 * const streams = await extractStreams({ tmdbId: '85937', mediaType: 'tv', season: 3, episode: 1 }, 'AnimesHD');
 */
export async function extractStreams(request, providerName) {
  const media = await getMediaInfo(request);
  const candidate = await findCandidate(media, providerName);
  if (candidate === null) return [];

  const entry = selectEpisode(candidate.html, candidate.url, request.season, request.episode, media.seasons);
  if (entry === null) return [];

  const options = await fetchOptions(entry.url);
  if (options.length === 0) return [];

  return resolveOptions(options, entry.url, request, media, providerName);
}

/**
 * Resolve cada opção em isolamento, monta os streams e aplica deduplicação.
 *
 * A falha de uma opção gera aviso `[<provedor>] Opção <rótulo> descartada: <causa>` e preserva as
 * demais. Quando nenhuma opção produz stream e ao menos uma falhou, sobe o erro agregado. Opções só
 * triadas não são falha.
 *
 * @param {MediaOption[]} options - Opções publicadas na página.
 * @param {string} pageUrl - URL da página do episódio, usada como `Referer`.
 * @param {StreamRequest} request - Pedido do app.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<object[]>} Streams únicos, na ordem de resolução.
 * @throws {Error} Se todas as opções falharem e nenhuma produzir stream.
 */
async function resolveOptions(options, pageUrl, request, media, providerName) {
  const results = await Promise.all(
    options.map((option) => resolveOption(option, pageUrl, request, media, providerName)),
  );

  const streams = [];
  const seenUrls = new Set();
  const failures = [];
  for (const result of results) {
    if (!result.ok) {
      failures.push(`${result.label}: ${result.error.message}`);
      console.warn(`[${providerName}] Opção ${result.label} descartada: ${result.error.message}`);
      continue;
    }
    for (const stream of result.streams) {
      if (seenUrls.has(stream.url)) continue;
      seenUrls.add(stream.url);
      streams.push(stream);
    }
  }

  if (streams.length > 0) return streams;
  if (failures.length > 0) throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}`);
  return [];
}

/**
 * Resolve uma opção sem deixar a falha escapar.
 * @param {MediaOption} option - Opção publicada.
 * @param {string} pageUrl - URL da página do episódio.
 * @param {StreamRequest} request - Pedido do app.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<{ ok: true, label: string, streams: object[] }|{ ok: false, label: string, error: Error }>} Resultado isolado.
 */
async function resolveOption(option, pageUrl, request, media, providerName) {
  try {
    const resolution = await resolvePlayerOption(option, pageUrl);
    if (resolution.kind === 'triage') {
      console.log(`[${providerName}] Opção ${option.label} descartada por triagem: ${resolution.reason}`);
      return { ok: true, label: option.label, streams: [] };
    }
    const streams = resolution.formats.map((format) =>
      buildFormatStream(format, option, request, media, providerName),
    );
    return { ok: true, label: option.label, streams };
  } catch (error) {
    return { ok: false, label: option.label, error: new Error(sanitizeMessage(error.message)) };
  }
}

/**
 * Monta o stream de um formato do Blogger com `buildStream` e o campo `format`.
 *
 * O `User-Agent` é o mesmo usado para abrir o HTML do Blogger: a URL do `googlevideo.com` é
 * vinculada a esse cabeçalho e responde 403 com outro valor.
 *
 * @param {{ url: string, qualityLabel: string|null }} format - Formato devolvido pelo bloco `blogger-video`.
 * @param {MediaOption} option - Opção de origem.
 * @param {StreamRequest} request - Pedido do app.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor.
 * @returns {object} Stream validado.
 */
function buildFormatStream(format, option, request, media, providerName) {
  const fields = {
    url: format.url,
    format: formatDetails(providerName, media, request),
    provider: 'Blogger',
    type: 'mp4',
    headers: { 'User-Agent': DEFAULT_USER_AGENT },
  };
  if (typeof format.qualityLabel === 'string' && format.qualityLabel !== '') {
    fields.qualityHints = [format.qualityLabel];
  }

  const language = languageFromTexts([option.label]);
  if (language !== null) {
    fields.language = language;
  } else {
    fields.languageHints = [option.label];
  }
  return buildStream(fields);
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
