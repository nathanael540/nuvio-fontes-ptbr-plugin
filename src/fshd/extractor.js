/**
 * Extrator principal do provedor FSHD.
 * Orquestra resolução de rotas diretas, APIs de opções/players, FirePlayer e playlists HLS.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { interpretPlaylist, originReferer } from '../_blocks/fireplayer/index.mjs';
import { UNKNOWN_QUALITY } from '../_blocks/quality-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import {
  FALLBACK_DOMAINS,
  extractSubtitlesFromQuery,
  fetchContentDetails,
  fetchHlsMaster,
  fetchOptions,
  fetchPlayerVideoUrl,
  isTransportError,
  resolvePlayerEmbed,
} from './api.js';
import { extractFirePlayerConfig } from './packer.js';

// Servidores que não têm caminho aberto até a mídia nos filmes; nas séries a página não os nomeia.
const UNSUPPORTED_SERVERS = new Set(['abyss', 'streamplay', 'dood li']);

/**
 * Indica se o erro é o limite de requisições da fonte (HTTP 429), lançado pelo bloco http ou pela navegação.
 * @param {Error} error - Erro capturado.
 * @returns {boolean} True para HTTP 429.
 */
function isRateLimit(error) {
  return error.status === 429 || /^HTTP 429 /.test(error.message);
}

/**
 * Indica se o nome do servidor não tem caminho aberto até a mídia.
 * @param {string} name - Nome lido da página de conteúdo.
 * @returns {boolean} True para Abyss, StreamPlay e dood.li.
 */
function isUnsupportedServer(name) {
  return UNSUPPORTED_SERVERS.has(normalizeText(name));
}

/**
 * Extrai os streams para o conteúdo solicitado através das origens configuradas.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Requisição validada.
 * @param {string} providerName - Nome do provedor ("FSHD").
 * @param {readonly string[]} [domains] - Lista ordenada de domínios (padrão FALLBACK_DOMAINS).
 * @returns {Promise<Array<object>>} Lista de streams montados e validados pelo buildStream.
 * @throws {Error} Se todas as origens ou todas as opções falharem.
 */
export async function extractStreams(request, providerName = 'FSHD', domains = FALLBACK_DOMAINS) {
  const domainFailures = [];

  for (const domain of domains) {
    let contentDetails;
    try {
      contentDetails = await fetchContentDetails(domain, request);
    } catch (error) {
      if (isTransportError(error)) {
        domainFailures.push({ domain, stage: 'Navegação', error });
        continue;
      }
      // Erro de parsing em página 200: regra "sem defaults silenciosos"
      throw error;
    }

    if (contentDetails.absent) {
      // Conteúdo inexistente no catálogo (HTTP 404 ou episódio não listado)
      return [];
    }

    const { contentId, contentType, pageUrl, title, year, servers } = contentDetails;
    if (!title) throw new Error(`Título ausente na página de conteúdo ${pageUrl}`);
    const serverNames = new Map((servers || []).map((server) => [server.id, server.name]));
    let options;
    try {
      options = await fetchOptions(domain, contentId, contentType, pageUrl);
    } catch (error) {
      if (isTransportError(error)) {
        domainFailures.push({ domain, stage: 'Options', error });
        continue;
      }
      throw error;
    }

    if (!options || options.length === 0) {
      return [];
    }

    const streams = [];
    const optionFailures = [];
    // A fonte limita /api/players por janela de tempo (HTTP 429): basta um servidor por áudio, e os
    // demais só são consultados se o anterior falhar. Opção sem áudio identificado é sempre consultada.
    const servedLanguages = new Set();
    let rateLimited = false;

    for (const option of options) {
      const optionLabel = option.language || `Player ${option.id}`;
      if (option.language && servedLanguages.has(option.language)) continue;
      const serverName = serverNames.get(String(option.id));
      if (serverName && isUnsupportedServer(serverName)) {
        console.warn(`[${providerName}] Servidor ${serverName} ignorado: sem caminho aberto até a mídia`);
        continue;
      }
      if (rateLimited) {
        console.warn(`[${providerName}] Opção ${optionLabel} não consultada: limite de requisições da fonte atingido`);
        continue;
      }
      try {
        // 1. Obtém a URL do player pela API
        const videoUrl = await fetchPlayerVideoUrl(domain, contentId, contentType, option.id, pageUrl);

        // 2. Resolve a página do reprodutor / embed
        const { playerUrl, html, redirectUrl } = await resolvePlayerEmbed(videoUrl, pageUrl);

        // 3. Extrai legendas da URL do redirecionamento por script (onde a fonte publica subN/langN)
        const querySubtitles = extractSubtitlesFromQuery(redirectUrl);

        // 4. Desempacota o script do FirePlayer
        const config = extractFirePlayerConfig(html, playerUrl);

        // 5. Baixa e interpreta a playlist HLS mestre
        const playerReferer = originReferer(playerUrl);
        const masterText = await fetchHlsMaster(config.videoUrl, playerReferer);
        const playlist = interpretPlaylist(masterText, config.videoUrl);

        // Combina legendas da query, do player e do master.
        const combinedSubtitles = [];
        for (const track of [...querySubtitles, ...config.tracks, ...playlist.subtitles]) {
          if (!track.language) {
            console.warn(`[${providerName}] Legenda descartada: idioma ausente em ${track.url}`);
            continue;
          }
          if (!combinedSubtitles.some((sub) => sub.url === track.url)) {
            combinedSubtitles.push(track);
          }
        }

        const variants = playlist.adaptive
          ? [{ url: playlist.url, quality: playlist.quality }]
          : playlist.variants.length
            ? playlist.variants
            : [{ url: playlist.url, quality: UNKNOWN_QUALITY }];

        // 6. Constrói os streams para cada variante de resolução
        for (const variant of variants) {
          const stream = buildStream({
            url: variant.url,
            quality: variant.quality,
            language: playlist.language || option.language || undefined,
            type: 'hls',
            provider: 'fshd',
            headers: {
              Referer: playerReferer,
            },
            subtitles: combinedSubtitles.length > 0 ? combinedSubtitles : undefined,
            format: {
              template: FORMATTER.AUTO,
              addon: providerName,
              title,
              message: playlist.adaptive ? 'Reprodução adaptativa' : undefined,
              year: year || undefined,
              season: request.season || undefined,
              episode: request.episode || undefined,
            },
          });
          streams.push(stream);
        }
        if (option.language) servedLanguages.add(option.language);
      } catch (optionError) {
        // Falha isolada por opção; com HTTP 429, as demais também falhariam e prolongariam o bloqueio.
        console.warn(`[${providerName}] Opção ${optionLabel} descartada: ${optionError.message}`);
        optionFailures.push({ label: optionLabel, error: optionError });
        if (isRateLimit(optionError)) rateLimited = true;
      }
    }

    if (rateLimited && streams.length === 0) {
      throw new Error(`Limite de requisições da fonte atingido (HTTP 429) em ${domain}/api/players`);
    }

    if (streams.length > 0) {
      return streams;
    }

    if (optionFailures.length > 0) {
      const reasons = optionFailures.map((f) => `${f.label}: ${f.error.message}`).join('; ');
      throw new Error(`Todas as opções falharam: ${reasons}`);
    }

    return [];
  }

  // Se todos os domínios falharam por transporte
  const domainReasons = domainFailures.map((f) => `${f.domain} (${f.stage}): ${f.error.message}`).join('; ');
  throw new Error(`Todos os domínios falharam: ${domainReasons || 'Origens indisponíveis'}`);
}
