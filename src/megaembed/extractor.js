/** Páginas de embed da MegaEmbed e triagem das opções anunciadas. */
import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage } from '../_blocks/http/index.mjs';
import { extractScriptJson } from '../_blocks/script-extract/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { resolveOption } from './player.js';

export const MIRRORS = ['https://megaembed.com', 'https://mgeb.lat', 'https://mgeb.space'];

/** Valida o pedido, percorre os espelhos e devolve os streams ainda não ordenados. */
export async function extractStreams(request) {
  if (!/^\d+$/.test(String(request.tmdbId).trim())) throw new Error('ID do TMDB inválido');
  if (!['movie', 'tv'].includes(request.mediaType)) throw new Error('Tipo de mídia inválido');
  if (request.mediaType === 'tv' &&
      ![request.season, request.episode].every((number) => Number.isInteger(number) && number > 0)) {
    throw new Error('Temporada e episódio devem ser inteiros positivos');
  }

  request.stage = 'Página';
  const page = await loadPage(request);
  if (!page) return [];

  request.stage = 'Fontes';
  const selected = selectOptions(page.sources, page.url);
  const causes = [];
  for (const failure of selected.failures) {
    causes.push(`${failure.label}: ${failure.message}`);
    console.warn(`[MegaEmbed] Opção ${failure.label} descartada: ${failure.message}`);
  }
  if (!selected.accepted.length) {
    if (causes.length) throw new Error(`Todas as opções falharam: [${causes.join('; ')}]`);
    return [];
  }

  const title = contentTitle(page.text);
  request.stage = 'Mídia';
  // allSettled não está confirmado no QuickJS: cada promessa já nasce resolvida.
  const settled = await Promise.all(selected.accepted.map((option) => settleOption(option, page.url, title, request)));
  const streams = new Map();
  for (const result of settled) {
    if (result.failure) {
      causes.push(result.failure);
      continue;
    }
    for (const stream of result.streams) {
      streams.set(`${stream.url}|${stream.quality}|${stream.language || ''}`, stream);
    }
  }
  if (!streams.size && causes.length) throw new Error(`Todas as opções falharam: [${causes.join('; ')}]`);
  return [...streams.values()];
}

/** Falha de uma opção vira aviso; triagem que devolve lista vazia não é falha. */
function settleOption(option, pageUrl, title, request) {
  return resolveOption(option, pageUrl)
    .then((variants) => ({
      streams: variants.map((variant) => buildStream({
        url: variant.url,
        format: {
          template: FORMATTER.AUTO,
          addon: 'MegaEmbed',
          title,
          ...(request.mediaType === 'tv' ? { season: request.season, episode: request.episode } : {}),
        },
        quality: variant.quality,
        provider: option.provider,
        type: option.kind === 'mp4' ? 'mp4' : 'hls',
        headers: variant.headers,
        ...(variant.language ? { language: variant.language } : {}),
        ...(option.subtitles.length ? { subtitles: option.subtitles } : {}),
      })),
    }))
    .catch((error) => {
      console.warn(`[MegaEmbed] Opção ${option.label} descartada: ${error.message}`);
      return { failure: `${option.label}: ${error.message}` };
    });
}

/** Primeiro espelho com `var sources` utilizável. Lista vazia encerra; HTML irreconhecível segue. */
async function loadPage(request) {
  const failures = [];
  for (const origin of MIRRORS) {
    const host = new URL(origin).host;
    try {
      const page = await fetchPage(embedUrl(origin, request));
      const parsed = readSources(page.text);
      if (parsed.empty) return null;
      if (parsed.blocked) {
        failures.push(`${host}: resposta sem var sources reconhecível`);
        continue;
      }
      return { ...page, sources: parsed.sources };
    } catch (error) {
      failures.push(`${host}: ${error.message}`);
    }
  }
  throw new Error(`Todos os espelhos falharam: [${failures.join(', ')}]`);
}

function embedUrl(origin, request) {
  const id = String(request.tmdbId).trim();
  if (request.mediaType === 'tv') return `${origin}/embed/${id}/${request.season}/${request.episode}`;
  return `${origin}/embed/${id}`;
}

/** `null` de extração, JSON inválido ou valor que não é lista contam como página bloqueada. */
function readSources(html) {
  let sources;
  try {
    sources = extractScriptJson(html, 'sources');
  } catch (error) {
    if (/JSON de "sources"|sem fechamento/.test(error.message)) return { blocked: true };
    throw error;
  }
  if (!Array.isArray(sources)) return { blocked: true };
  if (!sources.length) return { empty: true };
  return { sources };
}

/**
 * Separa opções reproduzíveis das falhas de leitura.
 * `serverBound` e `*.workers.dev` saem da lista sem contar como falha.
 * @returns {{ accepted: object[], failures: { label: string, message: string }[] }}
 */
export function selectOptions(sources, pageUrl) {
  const accepted = [];
  const failures = [];
  sources.forEach((item, index) => {
    const label = optionLabel(item, index);
    try {
      const option = classifyOption(item, pageUrl, label);
      if (option) accepted.push(option);
    } catch (error) {
      failures.push({ label, message: error.message });
    }
  });
  return { accepted, failures };
}

function optionLabel(item, index) {
  if (item && typeof item === 'object' && !Array.isArray(item) && typeof item.label === 'string' && item.label.trim()) {
    return item.label.trim();
  }
  return String(index + 1);
}

/** `null` é descarte de triagem. Dado inválido na opção lança e vira falha isolada. */
function classifyOption(item, pageUrl, label) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Opção de fonte inválida');
  if (item.serverBound === true) return null;
  const url = httpUrl(item.file, pageUrl);
  if (isWorkers(url)) return null;
  const kind = mediaKind(item, url);
  const provider = sourceLabel(url);
  return {
    label,
    url,
    kind,
    provider,
    display: ['Uqload', 'Streamtape'].includes(provider) ? provider : kind.toUpperCase(),
    noReferrer: item.noReferrer === true,
    subtitles: readTracks(item.tracks, pageUrl),
  };
}

function isWorkers(url) {
  const host = new URL(url).hostname;
  return host === 'workers.dev' || host.endsWith('.workers.dev');
}

function mediaKind(item, url) {
  const path = new URL(url).pathname;
  if (item.type === 'mp4' || /\.mp4$/i.test(path)) return 'mp4';
  if (item.type === 'hls' || path.includes('/includes/hls.php') || /\.m3u8$/i.test(path)) return 'hls';
  throw new Error(`Tipo de fonte não suportado${item.type ? `: ${item.type}` : ''}`);
}

/** Hospedagem de origem para `provider`; host desconhecido fica com o domínio, que não vai para o nome. */
export function sourceLabel(url) {
  const host = new URL(url).hostname;
  if (/uqload/i.test(host)) return 'Uqload';
  if (/streamtape|tapecontent/i.test(host)) return 'Streamtape';
  if (/(^|\.)megaembed\.com$|(^|\.)mgeb\.lat$|(^|\.)mgeb\.space$/i.test(host) || new URL(url).pathname.includes('/includes/hls.php')) {
    return 'MegaEmbed';
  }
  return host;
}

function readTracks(tracks, pageUrl) {
  if (tracks == null) return [];
  if (!Array.isArray(tracks)) throw new Error('tracks não é uma lista');
  const subtitles = new Map();
  for (const track of tracks) {
    if (!track || typeof track !== 'object' || Array.isArray(track)) throw new Error('Faixa inválida');
    if (track.kind && track.kind !== 'subtitles' && track.kind !== 'captions') continue;
    const language = text(track.language) || text(track.label);
    if (!language) throw new Error('Legenda sem idioma identificado');
    const raw = text(track.file) || text(track.url);
    if (!raw) throw new Error('Legenda sem URL');
    const subtitle = {
      url: httpUrl(raw, pageUrl),
      language,
      ...(text(track.label) ? { name: text(track.label) } : {}),
    };
    subtitles.set(`${subtitle.url}|${language}`, subtitle);
  }
  return [...subtitles.values()];
}

function contentTitle(html) {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title = match ? decode(match[1].trim()) : '';
  if (!title) throw new Error('Página sem título');
  return title;
}

function decode(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/** Resolve somente endereços HTTP(S), preservando query e a base da página. */
export function httpUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Endereço de mídia ausente');
  let url;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error('Endereço de mídia inválido');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Endereço de mídia não é HTTP(S)');
  return url.href;
}
