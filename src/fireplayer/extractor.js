/** Consultas diretas aos agregadores de FirePlayer e união da mídia resolvida. */
import { HEADER_PROFILES } from '../_blocks/http/index.mjs';
import {
  buildStreams,
  pageMeta,
  redact,
  resolveEntries,
  warnOption,
} from '../_blocks/fireplayer/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { PROVIDER } from './identity.js';

const PLENOFLU = 'https://plenoflu.com';
const PLAYERFLIX = 'https://playerflix.ink';
const GSTREAM = 'https://embed.embedplayer.site';

/**
 * Consulta plenoflu, PlayerFlix e, em filme com IMDb, GStream; reúne a mídia sem parar no primeiro sucesso.
 *
 * O plenoflu é lido uma vez para reconhecer ausência e obter título/IMDb; a página é entregue ao bloco
 * para evitar nova requisição. O enriquecimento do TMDB é opcional e falha isoladamente.
 *
 * @param {{tmdbId: number|string, mediaType: 'movie'|'tv', season?: number|null, episode?: number|null}} request - Pedido já validado.
 * @returns {Promise<{streams: object[], failures: string[]}>} Streams únicos e falhas saneadas.
 * @throws {Error} Se a montagem dos streams falhar fora de uma mídia isolada.
 * @example
 * const { streams, failures } = await extractStreams({ tmdbId: '603', mediaType: 'movie' });
 */
export async function extractStreams(request) {
  const id = String(request.tmdbId).trim();
  const identity = { tmdbId: id, imdbId: null };
  const playerflixTask = runEntries([playerflixEntry(id, request)], 'playerflix', request, identity);
  const [playerflix, tmdb, pleno] = await Promise.all([
    playerflixTask,
    enrich(request),
    loadPlenoflu(id, request),
  ]);

  const meta = tmdb.meta || pleno.meta || null;
  let contradiction = null;
  if (tmdb.imdbId && pleno.imdbId && tmdb.imdbId !== pleno.imdbId) {
    contradiction = 'IMDb da página contradiz o TMDB; opção do plenoflu descartada';
    warnOption(PROVIDER, 'plenoflu', 'página', contradiction);
  }
  const imdbId = tmdb.imdbId || (!contradiction ? pleno.imdbId : null) || null;
  identity.imdbId = imdbId;

  const plenoTask = pleno.entry && !contradiction
    ? runEntries([{ ...pleno.entry, meta: tmdb.meta || pleno.entry.meta }], 'plenoflu', request, identity)
    : Promise.resolve({ resolved: [], failures: [] });
  const gstreamTask = request.mediaType === 'movie' && imdbId
    ? runEntries(
      [{ url: `${GSTREAM}/${imdbId}`, referer: `${GSTREAM}/${imdbId}`, label: 'GStream', domain: 'gstream', meta }],
      'gstream',
      request,
      identity,
    )
    : Promise.resolve({ resolved: [], failures: [] });
  const [plenoMedia, gstream] = await Promise.all([plenoTask, gstreamTask]);

  const resolved = [...plenoMedia.resolved, ...playerflix.resolved, ...gstream.resolved];
  const failures = [
    ...plenoMedia.failures,
    ...playerflix.failures,
    ...gstream.failures,
    ...pleno.failures,
    ...(contradiction ? [contradiction] : []),
  ];
  return buildMedia(mergeResolved(resolved), failures, request);
}

async function loadPlenoflu(id, request) {
  const url = request.mediaType === 'tv'
    ? `${PLENOFLU}/tvshow/${id}/${request.season}/${request.episode}`
    : `${PLENOFLU}/movie/${id}`;
  try {
    const response = await fetch(url, {
      headers: { ...HEADER_PROFILES.page, Referer: `${PLENOFLU}/` },
    });
    const text = await response.text();
    if (response.ok) {
      const page = { url: response.url || url, text };
      const meta = pageMeta(text);
      return {
        entry: { url, referer: `${PLENOFLU}/`, label: 'plenoflu', domain: 'plenoflu', page, meta },
        meta,
        imdbId: pageImdb(text),
        failures: [],
      };
    }
    if (response.status === 404 && isPlenofluAbsence(text)) {
      console.log(`[${PROVIDER}] plenoflu ausência: conteúdo não encontrado`);
      return { failures: [] };
    }
    const cause = response.status === 404 ? 'HTTP 404 sem página de ausência reconhecida' : `HTTP ${response.status}`;
    return reportPlenoflu(cause);
  } catch (error) {
    return reportPlenoflu(error.message);
  }
}

function reportPlenoflu(cause) {
  warnOption(PROVIDER, 'plenoflu', 'página', cause);
  return { failures: [`plenoflu: ${redact(cause)}`] };
}

async function enrich(request) {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || !key.trim()) return {};
  try {
    const info = await getMediaInfo({ tmdbId: String(request.tmdbId).trim(), mediaType: request.mediaType });
    return {
      meta: { title: info.title, year: info.year },
      imdbId: info.imdbId,
    };
  } catch (error) {
    console.warn(`[${PROVIDER}] TMDB metadados: ${redact(error.message)}`);
    return {};
  }
}

function playerflixEntry(id, request) {
  if (request.mediaType === 'tv') {
    return {
      url: `${PLAYERFLIX}/inc/Ajax.php?type=tv&id=${encodeURIComponent(id)}`
        + `&season=${request.season}&episode=${request.episode}`,
      referer: `${PLAYERFLIX}/serie/${id}/${request.season}/${request.episode}`,
      label: 'PlayerFlix',
      domain: 'playerflix',
    };
  }
  return {
    url: `${PLAYERFLIX}/inc/Ajax.php?type=movie&id=${encodeURIComponent(id)}&season=null&episode=null`,
    referer: `${PLAYERFLIX}/filme/${id}`,
    label: 'PlayerFlix',
    domain: 'playerflix',
  };
}

function runEntries(entries, domain, request, identity) {
  return resolveEntries(entries, {
    logName: PROVIDER,
    domain,
    request,
    identity,
    directEpisode: true,
  });
}

function buildMedia(resolved, failures, request) {
  const streams = [];
  const causes = [...failures];
  for (const media of resolved) {
    if (!media.meta || typeof media.meta.title !== 'string' || !media.meta.title.trim()) {
      const cause = 'título ausente na mídia resolvida';
      warnOption(PROVIDER, media.domain || 'mídia', media.label || 'opção', cause);
      causes.push(`${media.label || 'opção'}: ${cause}`);
      continue;
    }
    try {
      streams.push(...buildStreams([media], {
        logName: PROVIDER,
        domain: media.domain || 'mídia',
        request,
        identity: {},
        providerName: PROVIDER,
      }));
    } catch (error) {
      warnOption(PROVIDER, media.domain || 'mídia', media.label || 'opção', error.message);
      causes.push(`${media.label || 'opção'}: ${redact(error.message)}`);
    }
  }
  return { streams, failures: causes };
}

function mergeResolved(resolved) {
  const merged = [];
  const byKey = new Map();
  for (const media of resolved) {
    const key = mediaKey(media);
    const current = byKey.get(key);
    if (!current) {
      const copy = {
        ...media,
        variants: media.variants.map((variant) => ({ ...variant })),
        subtitles: media.subtitles.map((track) => ({ ...track })),
      };
      byKey.set(key, copy);
      merged.push(copy);
      continue;
    }
    current.subtitles = mergeSubtitles(current.subtitles, media.subtitles);
    if (!media.adaptive) {
      for (const variant of media.variants) {
        if (!current.variants.some((item) => item.quality === variant.quality)) {
          current.variants.push({ ...variant });
        }
      }
    }
  }
  return merged;
}

function mediaKey(media) {
  const identity = `${new URL(media.playerPage).host}|${media.playerHash}`;
  const mode = media.adaptive ? `adaptive:${media.quality}` : 'variants';
  return `${identity}|${mode}|${media.language || ''}|${headersKey(media.headers)}`;
}

function headersKey(headers) {
  return Object.keys(headers).sort().map((name) => `${name}=${headers[name]}`).join('&');
}

function mergeSubtitles(current, incoming) {
  const result = current.map((track) => ({ ...track }));
  for (const track of incoming) {
    const duplicate = result.some((item) => item.url === track.url
      && item.language === track.language
      && (item.name || '') === (track.name || ''));
    if (!duplicate) result.push({ ...track });
  }
  return result;
}

function pageImdb(html) {
  const match = /video_caption_url\s*[:=]\s*['"](tt\d{5,})['"]/i.exec(html)
    || /(?:vaiquecol\.com\/embed2\/|imdb\.com\/title\/)(tt\d{5,})/i.exec(html)
    || /\b(tt\d{5,})\b/i.exec(html);
  return match ? match[1] : null;
}

function isPlenofluAbsence(html) {
  const text = html.replace(/<[^>]+>/g, ' ');
  return /404\s*-\s*P[aá]gina n[aã]o encontrada/i.test(text)
    && (/Obrigado\s+Por\s+Escolher\s+Nosso\s+Site/i.test(text)
      || /O\s+Conte[uú]do\s+Que\s+Voc[eê]\s+Procura\s+N[aã]o\s+Est[aá]\s+Dispon[ií]vel/i.test(text));
}
