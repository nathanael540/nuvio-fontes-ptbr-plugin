/**
 * Lógica de busca e extração de torrents do BeTor Search.
 *
 * Consulta a API pública por identificador (IMDb exato ou TMDB exato), pagina com size=100
 * conferindo a integridade dos dados e resolve opções isoladamente: filmes e
 * episódios avulsos como magnet, e pacotes de série como torrent://<hash>/<índice>.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson } from '../_blocks/http/index.mjs';
import { languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { discoverQuality } from '../_blocks/quality-discovery/index.mjs';
import { buildStream, buildTorrentFileUrl } from '../_blocks/stream-build/index.mjs';
import { fetchTorrentFiles, findEpisodeFile } from '../_blocks/torrent-files/index.mjs';
import {
  episodeTarget,
  formatBytes,
  humanSize,
  isCollectionTitle,
  readMagnet,
  seasonNumbers,
} from '../_blocks/torrent-release/index.mjs';

export const BETOR_SEARCH_URL = 'https://search.betor.top/v1/search/';
const PROVIDER_NAME = 'BeTor';
const PAGE_SIZE = 100;

/**
 * Consulta o BeTor Search por identificador exato e percorre todas as páginas.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv' }} request - Pedido validado.
 * @returns {Promise<object[]>} Lista de todos os itens encontrados.
 * @throws {Error} Em falha HTTP, JSON inválido ou paginação sem progresso/truncada.
 */
export async function searchBeTor(media, request) {
  const baseParams = {
    item_type: request.mediaType,
    size: String(PAGE_SIZE),
  };
  if (media.imdbId) {
    baseParams.imdb_id = media.imdbId;
  } else {
    baseParams.tmdb_id = media.tmdbId;
  }

  const allItems = [];
  let page = 1;
  let total = null;

  while (true) {
    const params = { ...baseParams, page: String(page) };
    const query = new URLSearchParams(params).toString();
    const url = `${BETOR_SEARCH_URL}?${query}`;
    const data = await fetchJson(url, { profile: 'api' });

    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
      throw new Error(`Resposta inválida do BeTor em ${url}`);
    }
    if (typeof data.total !== 'number' || !Number.isInteger(data.total) || data.total < 0) {
      throw new Error(`Total inválido retornado pelo BeTor em ${url}: ${data.total}`);
    }

    if (total === null) {
      total = data.total;
    }

    if (page === 1 && (total === 0 || data.items.length === 0)) {
      return [];
    }

    if (data.items.length === 0) {
      throw new Error(`Paginação sem progresso: página ${page} vazia com total ${total}`);
    }

    allItems.push(...data.items);

    if (allItems.length >= total) {
      break;
    }

    if (data.items.length < PAGE_SIZE) {
      throw new Error(
        `Paginação truncada na página ${page}: recebidos ${data.items.length} itens de ${PAGE_SIZE} esperados com total ${total}`,
      );
    }

    const maxPages = Math.ceil(total / PAGE_SIZE) + 1;
    if (page >= maxPages) {
      throw new Error(`Paginação excedeu limite esperado de páginas (${maxPages}) com total ${total}`);
    }

    page += 1;
  }

  return allItems;
}

/**
 * Coleta e resolve os streams do BeTor para o pedido atual.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Streams resolvidos (não ordenados).
 * @throws {Error} Se nenhuma opção produzir stream e alguma tiver falhado.
 */
export async function collectStreams(media, request) {
  const items = await searchBeTor(media, request);
  if (!items.length) return [];

  const streams = new Map();
  const failures = [];
  const candidates = new Map();

  // A triagem e os magnets são locais; nenhum pacote inicia rede nesta etapa.
  for (const [index, item] of items.entries()) {
    const result = settleItem(item, index, media, request);
    if (result.failure) {
      failures.push(result.failure);
      continue;
    }
    if (result.triage) continue;
    const key = result.stream ? result.stream.infoHash : result.pack.magnet.hash;
    const previous = candidates.get(key);
    if (!previous || (result.seeders ?? -1) > (previous.seeders ?? -1)) {
      candidates.set(key, result);
    }
  }

  for (const result of candidates.values()) {
    if (result.stream) streams.set(result.stream.infoHash, result.stream);
  }
  // Um único download de .torrent por vez, após deduplicar por hash.
  for (const result of candidates.values()) {
    if (!result.pack) continue;
    try {
      const resolved = await resolvePack(result.pack.item, result.pack.magnet, result.label, media, request);
      if (resolved.triage) {
        console.log(`[${PROVIDER_NAME}] Opção ${result.label} descartada por triagem: ${resolved.triage}`);
      } else {
        streams.set(resolved.stream.url, resolved.stream);
      }
    } catch (error) {
      console.warn(`[${PROVIDER_NAME}] Opção ${result.label} descartada: ${error.message}`);
      failures.push(`${result.label}: ${error.message}`);
    }
  }

  if (streams.size === 0 && failures.length > 0) {
    throw new Error(`Todas as opções falharam: [${failures.join('; ')}]`);
  }

  return [...streams.values()];
}

/**
 * Classifica um item sem rede, capturando falhas individuais.
 *
 * @param {object} item - Item da API do BeTor.
 * @param {number} index - Índice do item na lista.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {{ label?: string, stream?: object, pack?: object, seeders?: number, triage?: string, failure?: string }}
 */
function settleItem(item, index, media, request) {
  try {
    const result = classifyItem(item, media, request);
    if (result.triage) {
      console.log(`[${PROVIDER_NAME}] Opção ${result.label} descartada por triagem: ${result.triage}`);
      return { triage: result.triage };
    }
    return { ...result, seeders: readValidCount(item.torrent_num_seeds) };
  } catch (error) {
    const label = optionLabel(item, index);
    console.warn(`[${PROVIDER_NAME}] Opção ${label} descartada: ${error.message}`);
    return { failure: `${label}: ${error.message}` };
  }
}

/**
 * Classifica um item para gerar magnet, pacote pendente ou motivo de triagem.
 *
 * @param {object} item - Item retornado da API.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {{ label: string, stream?: object, pack?: object, triage?: string }}
 * @throws {Error} Se o item for inválido ou a montagem falhar.
 */
function classifyItem(item, media, request) {
  if (!item || typeof item !== 'object') {
    throw new Error('Item retornado não é um objeto válido');
  }
  if (!item.magnet_uri || typeof item.magnet_uri !== 'string') {
    throw new Error('Item sem link magnet válido');
  }

  const magnet = readMagnet(item.magnet_uri, { addFallbackTrackers: true });
  const label = `${item.item_type || request.mediaType} ${magnet.hash.slice(0, 8)}${item.provider_slug ? ` (${item.provider_slug})` : ''}`;

  if (request.mediaType === 'movie') {
    const title = `${item.torrent_name || ''} ${item.magnet_dn || ''}`;
    if (isCollectionTitle(title)) {
      return { label, triage: 'coleção de filmes' };
    }

    const quality = discoverQuality([item.torrent_name, item.magnet_dn, magnet.dn]);
    const language = languageFromTexts([item.torrent_name, item.magnet_dn, magnet.dn]);
    const size = formatItemSize(item, magnet);

    const stream = buildStream({
      url: magnet.href,
      quality,
      language: language || undefined,
      size: size || undefined,
      provider: item.provider_slug ? String(item.provider_slug) : undefined,
      type: 'magnet',
      seeders: readValidCount(item.torrent_num_seeds),
      peers: readValidCount(item.torrent_num_peers),
      format: {
        template: FORMATTER.AUTO,
        addon: PROVIDER_NAME,
        title: media.title,
        year: media.year ?? undefined,
        filename: magnet.dn || item.torrent_name || undefined,
      },
    });

    return { label, stream };
  }

  return classifyTvItem(item, magnet, label, media, request);
}

/**
 * Triagem local de itens para séries, adiando a rede dos pacotes.
 *
 * @param {object} item - Item da API.
 * @param {{ hash: string, href: string, dn: string|null, xl: string|null }} magnet - Magnet normalizado.
 * @param {string} label - Rótulo do log.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'tv', season: number, episode: number }} request - Pedido validado.
 * @returns {{ label: string, stream?: object, pack?: object, triage?: string }}
 */
function classifyTvItem(item, magnet, label, media, request) {
  const combinedText = `${item.torrent_name || ''} ${item.magnet_dn || ''}`.trim();
  const apiSeasons = Array.isArray(item.seasons) ? item.seasons.filter((s) => Number.isInteger(s) && s > 0) : [];
  let textSeasons = [];
  try {
    textSeasons = seasonNumbers(combinedText);
  } catch (error) {
    throw new Error(`Temporadas no texto inválidas: ${error.message}`, { cause: error });
  }

  if (apiSeasons.length > 0 && textSeasons.length > 0) {
    const overlap = apiSeasons.some((s) => textSeasons.includes(s));
    if (!overlap) {
      return { label, triage: 'conflito entre temporadas da API e do texto' };
    }
  }

  if (apiSeasons.length > 0 && !apiSeasons.includes(request.season)) {
    return { label, triage: `temporada ${apiSeasons.join(', ')} da API não é a temporada ${request.season}` };
  }
  if (textSeasons.length > 0 && !textSeasons.includes(request.season)) {
    return { label, triage: `temporada ${textSeasons.join(', ')} do texto não é a temporada ${request.season}` };
  }

  const apiEpisodes = Array.isArray(item.episodes)
    ? item.episodes.filter((p) => p && Number.isInteger(p.season) && Number.isInteger(p.episode))
    : [];

  if (apiEpisodes.length > 0) {
    const seasonPairs = apiEpisodes.filter((p) => p.season === request.season);
    if (seasonPairs.length === 0) {
      return { label, triage: 'fonte indica o episódio pedido apenas em outra temporada' };
    }
    const hasEpisode = seasonPairs.some((p) => p.episode === request.episode);
    if (!hasEpisode) {
      return { label, triage: `não contém o episódio ${request.episode}` };
    }
  }

  let spec;
  try {
    spec = episodeTarget(item.torrent_name) || episodeTarget(item.magnet_dn) || episodeTarget(combinedText);
  } catch (error) {
    throw new Error(`Rótulo de episódio inválido: ${error.message}`, { cause: error });
  }

  if (spec) {
    if (spec.season && spec.season !== request.season) {
      return { label, triage: `temporada ${spec.season} do episódio não é a temporada ${request.season}` };
    }
    if (!spec.episodes.includes(request.episode)) {
      return { label, triage: `não contém o episódio ${request.episode}` };
    }
    if (apiEpisodes.length > 0) {
      const seasonPairs = apiEpisodes.filter((p) => p.season === request.season);
      const apiEpNumbers = seasonPairs.map((p) => p.episode);
      if (!spec.episodes.some((e) => apiEpNumbers.includes(e))) {
        return { label, triage: 'conflito entre episódios da API e do texto' };
      }
    }
  }

  const isPackIndicated =
    (spec && spec.kind === 'range') ||
    apiEpisodes.length > 1 ||
    (spec === null && /temporada|completa|complete|pack/i.test(combinedText));

  const isProvenSingle =
    !isPackIndicated &&
    ((spec && spec.kind === 'single' && spec.episodes[0] === request.episode) ||
      (spec === null && apiEpisodes.length === 1 && apiEpisodes[0].season === request.season && apiEpisodes[0].episode === request.episode));

  if (isProvenSingle) {
    const quality = discoverQuality([item.torrent_name, item.magnet_dn, magnet.dn]);
    const language = languageFromTexts([item.torrent_name, item.magnet_dn, magnet.dn]);
    const size = formatItemSize(item, magnet);

    const stream = buildStream({
      url: magnet.href,
      quality,
      language: language || undefined,
      size: size || undefined,
      provider: item.provider_slug ? String(item.provider_slug) : undefined,
      type: 'magnet',
      seeders: readValidCount(item.torrent_num_seeds),
      peers: readValidCount(item.torrent_num_peers),
      format: {
        template: FORMATTER.AUTO,
        addon: PROVIDER_NAME,
        title: media.title,
        year: media.year ?? undefined,
        season: request.season,
        episode: request.episode,
        filename: magnet.dn || item.torrent_name || undefined,
      },
    });

    return { label, stream };
  }

  const isPack =
    isPackIndicated ||
    apiSeasons.includes(request.season) ||
    textSeasons.includes(request.season);

  if (isPack) {
    return { label, pack: { item, magnet } };
  }

  return { label, triage: 'opção sem identificação segura de temporada e episódio' };
}

/**
 * Resolve um pacote já triado e deduplicado, preservando os metadados da API.
 *
 * @param {object} item - Item da API.
 * @param {{ hash: string, href: string, dn: string|null, xl: string|null }} magnet - Magnet normalizado.
 * @param {string} label - Rótulo do log.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ season: number, episode: number }} request - Episódio solicitado.
 * @returns {Promise<{ label: string, stream?: object, triage?: string }>}
 * @throws {Error} Se a leitura do torrent ou a montagem falhar.
 */
async function resolvePack(item, magnet, label, media, request) {
  const files = await fetchTorrentFiles(magnet.hash);
  const fileIdx = findEpisodeFile(files, {
    season: request.season,
    episode: request.episode,
    seasonPack: true,
  });
  if (fileIdx === null) {
    return { label, triage: `arquivo do episódio ${request.season}x${request.episode} não identificado no torrent` };
  }
  const file = files.find((f) => f.index === fileIdx);
  if (!file) {
    throw new Error(`índice ${fileIdx} ausente na lista do torrent ${magnet.hash}`);
  }

  const url = buildTorrentFileUrl(magnet.hash, file.index);
  const fileSize = Number.isInteger(file.size) && file.size >= 0 ? formatBytes(file.size) : null;
  const packSize = formatItemSize(item, magnet);
  const quality = discoverQuality([file.path, item.torrent_name, item.magnet_dn, magnet.dn]);
  const language = languageFromTexts([item.torrent_name, item.magnet_dn, magnet.dn]);

  const stream = buildStream({
    url,
    quality,
    language: language || undefined,
    size: fileSize || packSize || undefined,
    provider: item.provider_slug ? String(item.provider_slug) : undefined,
    type: 'torrent',
    seeders: readValidCount(item.torrent_num_seeds),
    peers: readValidCount(item.torrent_num_peers),
    format: {
      template: FORMATTER.AUTO,
      addon: PROVIDER_NAME,
      title: media.title,
      year: media.year ?? undefined,
      season: request.season,
      episode: request.episode,
      filename: file.path,
      folderName: magnet.dn || item.torrent_name || undefined,
      folderSize: packSize && packSize !== fileSize ? packSize : undefined,
    },
  });

  return { label, stream };
}

/**
 * Formata o tamanho de um item a partir dos bytes ou dos textos.
 *
 * @param {object} item - Item da API.
 * @param {{ dn: string|null, xl: string|null }} magnet - Metadados do magnet.
 * @returns {string|null}
 */
export function formatItemSize(item, magnet) {
  if (typeof item.torrent_size === 'number' && Number.isFinite(item.torrent_size) && item.torrent_size > 0) {
    return formatBytes(item.torrent_size);
  }
  const xlBytes = magnet && magnet.xl && /^\d+$/.test(magnet.xl) ? Number(magnet.xl) : null;
  if (xlBytes && xlBytes > 0) {
    return formatBytes(xlBytes);
  }
  return humanSize(item.torrent_name) || humanSize(item.magnet_dn);
}

/**
 * Valida se um número de seeds ou peers é inteiro não-negativo.
 *
 * @param {*} value - Valor da API.
 * @returns {number|undefined}
 */
function readValidCount(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Rótulo descritivo do item para log.
 *
 * @param {object} item - Item da API.
 * @param {number} index - Posição do item na lista.
 * @returns {string}
 */
function optionLabel(item, index) {
  const rawHash = item && (item.magnet_xt || item.magnet_uri)
    ? /btih:([^&#\s]+)/i.exec(String(item.magnet_xt || item.magnet_uri))
    : null;
  const suffix = rawHash ? rawHash[1].slice(0, 8) : `item-${index + 1}`;
  const provider = item && item.provider_slug ? ` (${item.provider_slug})` : '';
  return `torrent ${suffix}${provider}`;
}
