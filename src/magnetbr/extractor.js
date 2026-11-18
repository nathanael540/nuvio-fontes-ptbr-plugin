/**
 * Lógica de busca, triagem e extração de torrents do catálogo agregado MagnetBR.
 *
 * Consulta `https://magnetbr.flixbr.online/indexers/db` por IMDb e por títulos de fallback,
 * tria identidade, temporada e episódio localmente e resolve pacotes de temporada via
 * cache público itorrents.org (`torrent://<hash>/<índice>`).
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson } from '../_blocks/http/index.mjs';
import {
  LANGUAGE,
  languageFromTexts,
  normalizeLanguage,
} from '../_blocks/language-discovery/index.mjs';
import { discoverQuality } from '../_blocks/quality-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream, buildTorrentFileUrl } from '../_blocks/stream-build/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { fetchTorrentFiles, findEpisodeFile } from '../_blocks/torrent-files/index.mjs';
import {
  episodeTarget,
  formatBytes,
  humanSize,
  infoHashFromBtih,
  isCollectionTitle,
  readMagnet,
  seasonNumbers,
} from '../_blocks/torrent-release/index.mjs';

export const MAGNETBR_DB_URL = 'https://magnetbr.flixbr.online/indexers/db';
const PROVIDER_NAME = 'MagnetBR';
const MIN_TITLE_SIMILARITY = 0.85;
const MIN_SIZE_BYTES = 1024 * 1024;
const YEAR_TOLERANCE = 1;

/**
 * Sanitiza mensagens de erro ou aviso para não expor TMDB_API_KEY, queries de URL ou magnets completos.
 *
 * @param {string} message - Mensagem original.
 * @returns {string} Mensagem sanitizada.
 */
export function sanitizeMessage(message) {
  let clean = String(message || '');
  const apiKey = typeof globalThis.TMDB_API_KEY === 'string' ? globalThis.TMDB_API_KEY.trim() : '';
  if (apiKey !== '') {
    clean = clean.split(apiKey).join('[REDACTED]');
  }
  clean = clean.replace(/magnet:\?[^\s"'\]]+/gi, 'magnet:?[REDACTED]');
  clean = clean.replace(/(https?:\/\/[^\s?"'\]]+)\?[^\s"'\]]+/gi, '$1');
  return clean;
}

/**
 * Executa uma consulta única ao endpoint `db` do MagnetBR e valida o contrato da resposta.
 *
 * @param {Record<string, string>} params - Parâmetros de busca (`q`, `season`, `ep`).
 * @returns {Promise<object[]>} Lista `results` validada.
 * @throws {Error} Em falha HTTP, JSON inválido ou resposta fora do contrato `{ count, results }`.
 */
export async function queryMagnetBr(params) {
  const query = new URLSearchParams(params).toString();
  const url = `${MAGNETBR_DB_URL}?${query}`;
  let data;
  try {
    data = await fetchJson(url, { profile: 'api' });
  } catch (error) {
    throw new Error(sanitizeMessage(error.message), { cause: error });
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.results)) {
    throw new Error(`Resposta inválida do MagnetBR em ${MAGNETBR_DB_URL}`);
  }
  if (typeof data.count !== 'number' || !Number.isInteger(data.count) || data.count < 0) {
    throw new Error(`Contagem inválida retornada pelo MagnetBR: ${String(data.count)}`);
  }

  return data.results;
}

/**
 * Monta a lista de termos de busca deduplicados (IMDb, título PT-BR, original e alternativos).
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @returns {string[]} Termos de busca sem repetição.
 */
export function buildSearchTerms(media) {
  const rawTerms = [
    media.imdbId,
    media.title,
    media.originalTitle,
    ...(Array.isArray(media.alternativeTitles) ? media.alternativeTitles : []),
  ];
  const terms = [];
  const seen = new Set();
  for (const raw of rawTerms) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(trimmed);
  }
  return terms;
}

/**
 * Coleta e resolve os streams do MagnetBR para o pedido atual.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Streams resolvidos (não ordenados).
 * @throws {Error} Em erro fatal de busca ou se todas as opções aceitas falharem.
 */
export async function collectStreams(media, request) {
  const terms = buildSearchTerms(media);
  let acceptedEntries = [];

  for (const term of terms) {
    const rawEntries = await fetchAttemptEntries(term, request);
    if (rawEntries.length === 0) continue;

    const compatible = [];
    for (const [index, entry] of rawEntries.entries()) {
      const label = optionLabel(entry.item, index);
      const issue = triageEntry(entry, media, request);
      if (issue) {
        console.log(`[${PROVIDER_NAME}] Opção ${label} descartada por triagem: ${issue}`);
        continue;
      }
      compatible.push(entry);
    }

    if (compatible.length > 0) {
      acceptedEntries = compatible;
      break;
    }
  }

  if (acceptedEntries.length === 0) return [];

  const streamsByUrl = new Map();
  const singleHashes = new Set();
  const packCandidates = new Map();
  const failures = [];

  for (const [index, entry] of acceptedEntries.entries()) {
    const settled = settleAcceptedEntry(entry, index, media, request);
    if (settled.failure) {
      failures.push(settled.failure);
      continue;
    }
    if (settled.triage) {
      console.log(`[${PROVIDER_NAME}] Opção ${settled.label} descartada por triagem: ${settled.triage}`);
      continue;
    }
    if (settled.stream) {
      singleHashes.add(settled.stream.infoHash);
      if (!streamsByUrl.has(settled.stream.url)) {
        streamsByUrl.set(settled.stream.url, settled.stream);
      }
      continue;
    }
    if (settled.pack) {
      const hash = settled.pack.magnet.hash;
      const previous = packCandidates.get(hash);
      if (!previous || (settled.seeders ?? -1) > (previous.seeders ?? -1)) {
        packCandidates.set(hash, settled);
      }
    }
  }

  for (const [hash, candidate] of packCandidates.entries()) {
    if (singleHashes.has(hash)) continue;
    try {
      const resolved = await resolvePackCandidate(candidate.pack, candidate.label, media, request);
      if (resolved.triage) {
        console.log(`[${PROVIDER_NAME}] Opção ${candidate.label} descartada por triagem: ${resolved.triage}`);
      } else if (resolved.stream && !streamsByUrl.has(resolved.stream.url)) {
        streamsByUrl.set(resolved.stream.url, resolved.stream);
      }
    } catch (error) {
      const cause = sanitizeMessage(error.message);
      console.warn(`[${PROVIDER_NAME}] Opção ${candidate.label} descartada: ${cause}`);
      failures.push(`${candidate.label}: ${cause}`);
    }
  }

  if (streamsByUrl.size === 0 && failures.length > 0) {
    throw new Error(`Todas as opções falharam: [${failures.join('; ')}]`);
  }

  return [...streamsByUrl.values()];
}

/**
 * Executa as consultas de uma tentativa de busca (filme: 1 consulta; série: exata + temporada)
 * e une os resultados sem repetir hash quando já identificável.
 *
 * @param {string} term - Termo de busca (`q`).
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<{ item: object, source: 'movie'|'exact'|'season' }[]>}
 */
async function fetchAttemptEntries(term, request) {
  if (request.mediaType === 'movie') {
    const results = await queryMagnetBr({ q: term });
    return results.map((item) => ({ item, source: 'movie' }));
  }

  const exactResults = await queryMagnetBr({
    q: term,
    season: String(request.season),
    ep: String(request.episode),
  });
  const seasonResults = await queryMagnetBr({
    q: term,
    season: String(request.season),
  });

  const entries = [];
  const indexByHash = new Map();

  const append = (items, source) => {
    for (const item of items) {
      const hashKey = extractItemHashKey(item);
      if (hashKey && indexByHash.has(hashKey)) {
        const existingIdx = indexByHash.get(hashKey);
        const existingEntry = entries[existingIdx];
        const existingSeeds = readValidCount(existingEntry.item.seed_count) ?? -1;
        const nextSeeds = readValidCount(item.seed_count) ?? -1;
        if (existingEntry.source === source && nextSeeds > existingSeeds) {
          entries[existingIdx] = { item, source };
        }
        continue;
      }
      if (hashKey) indexByHash.set(hashKey, entries.length);
      entries.push({ item, source });
    }
  };

  append(exactResults, 'exact');
  append(seasonResults, 'season');
  return entries;
}

/**
 * Extrai uma chave de hash normalizada de um item para unir consultas sem perder itens malformados.
 *
 * @param {object} item - Item retornado pela API.
 * @returns {string|null} Hash hexadecimal de 40 caracteres ou null se não puder ser extraído.
 */
function extractItemHashKey(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.info_hash === 'string') {
    try {
      return infoHashFromBtih(item.info_hash);
    } catch {
      // Continua tentando pelo link magnet.
    }
  }
  const rawMagnet = typeof item.magnet_link === 'string' && item.magnet_link.trim() !== ''
    ? item.magnet_link
    : typeof item.magnet === 'string' ? item.magnet : '';
  const match = /btih:([^&#\s]+)/i.exec(rawMagnet);
  if (!match) return null;
  try {
    return infoHashFromBtih(match[1]);
  } catch {
    return null;
  }
}

/**
 * Avalia se um item bruto deve ser descartado por triagem de identidade, tipo, coleção ou coordenadas.
 *
 * @param {{ item: object, source: 'movie'|'exact'|'season' }} entry - Item com origem da consulta.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {string|null} Motivo de triagem ou null quando aceito.
 */
function triageEntry(entry, media, request) {
  const { item, source } = entry;
  if (!item || typeof item !== 'object') return null;

  const itemImdbDigits = normalizeImdbDigits(item.imdb);
  const mediaImdbDigits = normalizeImdbDigits(media.imdbId);
  if (itemImdbDigits !== null && mediaImdbDigits !== null && itemImdbDigits !== mediaImdbDigits) {
    return `IMDb "${item.imdb}" diferente de "${media.imdbId}"`;
  }

  const categoryIssue = checkCategoryCompatibility(item.category, request.mediaType);
  if (categoryIssue) return categoryIssue;

  const titleMatch = hasTitleEvidence(item, media);
  if (itemImdbDigits === null && !titleMatch) {
    return 'item sem IMDb e sem título compatível';
  }
  if (!titleMatch) {
    return 'título incompatível com o pedido';
  }

  const releaseTexts = collectReleaseTexts(item);
  const combinedText = releaseTexts.join(' ');

  if (request.mediaType === 'movie') {
    if (isCollectionTitle(combinedText)) {
      return 'coleção de filmes';
    }
    const itemYear = parseItemYear(item.year);
    if (itemYear !== null && Number.isInteger(media.year) && Math.abs(itemYear - media.year) > YEAR_TOLERANCE) {
      return `ano ${itemYear} incompatível com ${media.year}`;
    }
    return null;
  }

  return triageTvEntry(item, source, combinedText, itemImdbDigits !== null && itemImdbDigits === mediaImdbDigits, media, request);
}

/**
 * Triagem específica de séries: temporada, episódio, temporadas conflitantes e ano da temporada.
 *
 * @param {object} item - Item da API.
 * @param {'exact'|'season'} source - Origem da consulta.
 * @param {string} combinedText - Textos da release concatenados.
 * @param {boolean} hasConfirmedImdb - Se o IMDb do item bate com o IMDb do TMDB.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ season: number, episode: number }} request - Coordenadas pedidas.
 * @returns {string|null} Motivo de triagem ou null se compatível.
 */
function triageTvEntry(item, source, combinedText, hasConfirmedImdb, media, request) {
  let seasons;
  try {
    seasons = seasonNumbers(combinedText);
  } catch {
    return 'faixa de temporadas inválida no texto';
  }

  if (seasons.length > 1) {
    return `temporadas conflitantes no texto (${seasons.join(', ')})`;
  }
  if (seasons.length === 1 && seasons[0] !== request.season) {
    return `temporada ${seasons[0]} diferente da temporada ${request.season}`;
  }

  let spec;
  try {
    spec = findEpisodeSpec(item, combinedText);
  } catch {
    return 'rótulo de episódio inválido no texto';
  }

  if (spec) {
    if (spec.season && spec.season !== request.season) {
      return `temporada ${spec.season} do episódio diferente da temporada ${request.season}`;
    }
    if (!spec.episodes.includes(request.episode)) {
      return `episódio ${spec.episodes.join(', ')} não contém o episódio ${request.episode}`;
    }
  }

  const seasonYear = findTmdbSeasonYear(media, request.season);
  const itemYear = parseItemYear(item.year);
  if (seasonYear !== null && itemYear !== null && Math.abs(itemYear - seasonYear) > YEAR_TOLERANCE) {
    return `ano ${itemYear} incompatível com o ano ${seasonYear} da temporada ${request.season}`;
  }

  const hasExplicitCoords = seasons.length > 0 || spec !== null;
  if (!hasExplicitCoords) {
    if (source !== 'exact') {
      return 'item da consulta de temporada sem temporada ou episódio explícitos';
    }
    if (!hasConfirmedImdb) {
      return 'item sem coordenadas explícitas e sem IMDb confirmado';
    }
  }

  if (source === 'season' && spec && spec.kind === 'single') {
    // Episódio único na consulta de temporada que já coincide com o pedido pode seguir,
    // mas pacote exige ausência de episódio único ou faixa.
  }

  return null;
}

/**
 * Classifica um item já aceito na triagem inicial em stream magnet, pacote pendente ou falha isolada.
 *
 * @param {{ item: object, source: 'movie'|'exact'|'season' }} entry - Entrada aceita.
 * @param {number} index - Posição para rótulo de fallback.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {{ label: string, stream?: object, pack?: object, seeders?: number, triage?: string, failure?: string }}
 */
function settleAcceptedEntry(entry, index, media, request) {
  const { item, source } = entry;
  const label = optionLabel(item, index);
  try {
    const rawMagnet = typeof item.magnet_link === 'string' && item.magnet_link.trim() !== ''
      ? item.magnet_link
      : typeof item.magnet === 'string' ? item.magnet : '';
    if (!rawMagnet) {
      throw new Error('Item sem link magnet válido');
    }
    const magnet = readMagnet(rawMagnet, { addFallbackTrackers: true });
    const seeders = readValidCount(item.seed_count);
    const peers = readValidCount(item.leech_count);
    const provider = readProviderSource(item.scraper_source);
    const language = classifyItemLanguage(item, magnet);
    const size = resolveItemSize(item);
    const filename = magnet.dn || firstNonEmptyText([item.magnet_original, item.title]);

    if (request.mediaType === 'movie') {
      const quality = discoverQuality([item.title, item.magnet_original, magnet.dn]);
      const stream = buildStream({
        url: magnet.href,
        quality,
        language,
        size: size || undefined,
        infoHash: magnet.hash,
        provider,
        type: 'magnet',
        seeders,
        peers,
        format: {
          template: FORMATTER.AUTO,
          addon: PROVIDER_NAME,
          title: media.title,
          year: media.year ?? undefined,
          filename: filename || undefined,
        },
      });
      return { label, stream, seeders };
    }

    const combinedText = collectReleaseTexts(item).join(' ');
    const spec = findEpisodeSpec(item, combinedText);
    const isSingleEpisode =
      (spec && spec.kind === 'single' && spec.episodes[0] === request.episode) ||
      (source === 'exact' && spec === null);

    if (isSingleEpisode) {
      const quality = discoverQuality([item.title, item.magnet_original, magnet.dn]);
      const stream = buildStream({
        url: magnet.href,
        quality,
        language,
        size: size || undefined,
        infoHash: magnet.hash,
        provider,
        type: 'magnet',
        seeders,
        peers,
        format: {
          template: FORMATTER.AUTO,
          addon: PROVIDER_NAME,
          title: media.title,
          year: media.year ?? undefined,
          season: request.season,
          episode: request.episode,
          filename: filename || undefined,
        },
      });
      return { label, stream, seeders };
    }

    return {
      label,
      seeders,
      pack: {
        item,
        magnet,
        language,
        packSize: size,
        provider,
        seeders,
        peers,
        folderName: filename,
      },
    };
  } catch (error) {
    const cause = sanitizeMessage(error.message);
    console.warn(`[${PROVIDER_NAME}] Opção ${label} descartada: ${cause}`);
    return { label, failure: `${label}: ${cause}` };
  }
}

/**
 * Resolve um pacote de temporada no cache itorrents.org e monta o stream `torrent://<hash>/<índice>`.
 *
 * @param {object} pack - Dados preparados do pacote.
 * @param {string} label - Rótulo da opção para logs.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ season: number, episode: number }} request - Episódio solicitado.
 * @returns {Promise<{ stream?: object, triage?: string }>}
 */
async function resolvePackCandidate(pack, label, media, request) {
  const { item, magnet, language, packSize, provider, seeders, peers, folderName } = pack;
  const files = await fetchTorrentFiles(magnet.hash);
  const fileIdx = findEpisodeFile(files, {
    season: request.season,
    episode: request.episode,
    seasonPack: true,
  });
  if (fileIdx === null) {
    return { triage: `arquivo do episódio ${request.season}x${request.episode} não identificado no pacote` };
  }
  const file = files.find((entry) => entry.index === fileIdx);
  if (!file) {
    throw new Error(`índice ${fileIdx} ausente na lista do torrent ${magnet.hash}`);
  }

  const url = buildTorrentFileUrl(magnet.hash, file.index);
  const fileSize = Number.isInteger(file.size) && file.size >= MIN_SIZE_BYTES
    ? formatBytes(file.size)
    : null;
  const size = fileSize || packSize || undefined;
  const quality = discoverQuality([file.path, item.title, item.magnet_original, magnet.dn]);

  const stream = buildStream({
    url,
    quality,
    language,
    size,
    infoHash: magnet.hash,
    provider,
    type: 'torrent',
    seeders,
    peers,
    format: {
      template: FORMATTER.AUTO,
      addon: PROVIDER_NAME,
      title: media.title,
      year: media.year ?? undefined,
      season: request.season,
      episode: request.episode,
      filename: file.path,
      folderName: folderName || undefined,
      folderSize: packSize && packSize !== size ? packSize : undefined,
    },
  });

  return { stream };
}

/**
 * Classifica o idioma do item a partir de `audio_tags`, `has_legenda`/`legend` e nomes originais,
 * sem usar `title`, `title_processed` ou `title_translated_processed`.
 *
 * @param {object} item - Item da API.
 * @param {{ dn: string|null }} magnet - Magnet normalizado.
 * @returns {string} Membro do enum `LANGUAGE`.
 */
export function classifyItemLanguage(item, magnet) {
  const audioMode = typeof item.audio_tags === 'string' && item.audio_tags.trim() !== ''
    ? normalizeLanguage(item.audio_tags)
    : null;

  if (audioMode === LANGUAGE.DUBBED || audioMode === LANGUAGE.DUBBED_NON_PT_BR) {
    return audioMode;
  }

  const hasLegendFlag = item.has_legenda === true || item.has_legenda === 1 || item.has_legenda === '1'
    || (typeof item.legend === 'string' && item.legend.trim() !== '');
  if (hasLegendFlag && typeof item.legend === 'string' && item.legend.trim() !== '') {
    const legendMode = normalizeLanguage(`Legenda ${item.legend}`);
    if (legendMode === LANGUAGE.SUBTITLED || legendMode === LANGUAGE.SUBTITLED_NON_PT_BR) {
      return legendMode;
    }
  }

  if (audioMode === LANGUAGE.NON_PT_BR) {
    return LANGUAGE.NON_PT_BR;
  }

  const fromOriginalNames = languageFromTexts([item.magnet_original, magnet ? magnet.dn : null]);
  return fromOriginalNames || LANGUAGE.UNKNOWN;
}

/**
 * Resolve o tamanho plausível de um item, ignorando valores em bytes isolados (< 1 MiB).
 *
 * @param {object} item - Item da API.
 * @returns {string|null} Tamanho formatado ou null quando ausente/corrompido.
 */
export function resolveItemSize(item) {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.size === 'string') {
    const parsed = humanSize(item.size);
    if (parsed) return parsed;
  }
  if (typeof item.size_bytes === 'number' && Number.isInteger(item.size_bytes) && item.size_bytes >= MIN_SIZE_BYTES) {
    return formatBytes(item.size_bytes);
  }
  return null;
}

/**
 * Extrai somente os dígitos de um identificador IMDb (`tt0133093` -> `0133093`).
 *
 * @param {*} value - Valor bruto do IMDb.
 * @returns {string|null} Dígitos do IMDb ou null quando ausente/inválido.
 */
function normalizeImdbDigits(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  const match = /^(?:tt)?(\d{5,10})$/i.exec(text);
  return match ? match[1] : null;
}

/**
 * Verifica compatibilidade entre `category` do MagnetBR e `mediaType` do pedido.
 *
 * @param {*} category - Categoria declarada pelo item (`Movies`, `TV`, `Anime`).
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @returns {string|null} Motivo de incompatibilidade ou null se compatível.
 */
function checkCategoryCompatibility(category, mediaType) {
  if (typeof category !== 'string' || category.trim() === '') return null;
  const normalized = category.trim().toLowerCase();
  if (normalized === 'anime') return null;
  if (mediaType === 'movie' && (normalized === 'movies' || normalized === 'movie')) return null;
  if (mediaType === 'tv' && (normalized === 'tv' || normalized === 'series')) return null;
  return `categoria "${category}" incompatível com "${mediaType}"`;
}

/**
 * Confere se o item apresenta evidência local de título compatível com os títulos do TMDB.
 *
 * @param {object} item - Item da API.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @returns {boolean} True quando há similaridade >= 0.85 ou título contido no texto da release.
 */
function hasTitleEvidence(item, media) {
  const mediaTitles = [
    media.title,
    media.originalTitle,
    ...(Array.isArray(media.alternativeTitles) ? media.alternativeTitles : []),
  ]
    .filter((t) => typeof t === 'string' && t.trim() !== '')
    .map((t) => t.trim());

  if (mediaTitles.length === 0) return false;

  const candidateTitles = [
    item.title,
    item.original_title,
    item.title_processed,
    item.title_translated_processed,
    item.magnet_original,
  ]
    .filter((t) => typeof t === 'string' && t.trim() !== '')
    .map((t) => cleanCandidateTitle(t))
    .filter((t) => t !== '');

  for (const candidate of candidateTitles) {
    for (const target of mediaTitles) {
      if (titleSimilarity(candidate, target) >= MIN_TITLE_SIMILARITY) {
        return true;
      }
    }
  }

  const releaseText = normalizeText(collectReleaseTexts(item).join(' '));
  if (releaseText === '') return false;
  const padded = ` ${releaseText} `;

  for (const target of mediaTitles) {
    const normTarget = normalizeText(target);
    if (normTarget !== '' && padded.includes(` ${normTarget} `)) {
      return true;
    }
  }

  return false;
}

/**
 * Limpa marcadores de release de um título candidato para comparação de similaridade.
 *
 * @param {string} raw - Título bruto do item.
 * @returns {string} Título limpo.
 */
function cleanCandidateTitle(raw) {
  return String(raw || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b.*$/i, ' ')
    .replace(/\bS\d{1,2}(?:E\d{1,3})?\b.*$/i, ' ')
    .replace(/\b(?:\d{1,2}[ªº°a]?\s*temporada|temporada\s*\d{1,2})\b.*$/i, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Coleta os textos relevantes da release para triagem de temporada, episódio e coleção.
 *
 * @param {object} item - Item da API.
 * @returns {string[]} Lista de textos não vazios.
 */
function collectReleaseTexts(item) {
  const dn = extractMagnetDn(item);
  return [item.title, item.original_title, item.magnet_original, dn]
    .filter((part) => typeof part === 'string' && part.trim() !== '');
}

/**
 * Extrai o parâmetro `dn` do link magnet do item sem lançar erro se o magnet for inválido.
 *
 * @param {object} item - Item da API.
 * @returns {string|null} Valor de `dn` ou null.
 */
function extractMagnetDn(item) {
  const raw = typeof item.magnet_link === 'string' && item.magnet_link.trim() !== ''
    ? item.magnet_link
    : typeof item.magnet === 'string' ? item.magnet : '';
  if (!raw) return null;
  try {
    return readMagnet(raw).dn;
  } catch {
    return null;
  }
}

/**
 * Procura especificação de episódio nos campos da release.
 *
 * @param {object} item - Item da API.
 * @param {string} combinedText - Texto combinado.
 * @returns {{ kind: 'single'|'range', season?: number, episodes: number[] }|null}
 */
function findEpisodeSpec(item, combinedText) {
  const dn = extractMagnetDn(item);
  return (
    episodeTarget(item.magnet_original) ||
    episodeTarget(dn) ||
    episodeTarget(item.title) ||
    episodeTarget(item.original_title) ||
    episodeTarget(combinedText)
  );
}

/**
 * Obtém o ano de estreia da temporada solicitada nos metadados do TMDB.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {number} seasonNumber - Número da temporada solicitada.
 * @returns {number|null} Ano da temporada ou null quando não informado.
 */
function findTmdbSeasonYear(media, seasonNumber) {
  if (!Array.isArray(media.seasons)) return null;
  const seasonInfo = media.seasons.find((s) => s && s.number === seasonNumber);
  if (seasonInfo && Number.isInteger(seasonInfo.year)) {
    return seasonInfo.year;
  }
  return null;
}

/**
 * Lê um ano de quatro dígitos informado no item.
 *
 * @param {*} value - Valor de `item.year`.
 * @returns {number|null} Ano inteiro ou null.
 */
function parseItemYear(value) {
  if (Number.isInteger(value) && value >= 1888 && value <= 2100) return value;
  if (typeof value === 'string' && /^\d{4}$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

/**
 * Lê uma contagem inteira não-negativa de seeders ou peers.
 *
 * @param {*} value - Valor de `seed_count` ou `leech_count`.
 * @returns {number|undefined}
 */
function readValidCount(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Lê o catálogo de origem (`scraper_source`) quando for texto não vazio.
 *
 * @param {*} value - Valor de `item.scraper_source`.
 * @returns {string|undefined}
 */
function readProviderSource(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

/**
 * Devolve o primeiro texto não vazio de uma lista.
 *
 * @param {(string|null|undefined)[]} values - Candidatos.
 * @returns {string|null}
 */
function firstNonEmptyText(values) {
  for (const val of values) {
    if (typeof val === 'string' && val.trim() !== '') return val.trim();
  }
  return null;
}

/**
 * Monta um rótulo seguro para logs usando o `id` do item ou os 8 primeiros caracteres do hash.
 *
 * @param {object} item - Item da API.
 * @param {number} index - Posição do item na lista.
 * @returns {string} Rótulo curto sem magnet completo.
 */
function optionLabel(item, index) {
  const hashKey = extractItemHashKey(item);
  const idPart = item && (typeof item.id === 'string' || typeof item.id === 'number') && String(item.id).trim() !== ''
    ? String(item.id).trim()
    : null;
  const identifier = hashKey ? hashKey.slice(0, 8) : idPart || `item-${index + 1}`;
  const source = item && typeof item.scraper_source === 'string' && item.scraper_source.trim() !== ''
    ? ` (${item.scraper_source.trim()})`
    : '';
  return `torrent ${identifier}${source}`;
}
