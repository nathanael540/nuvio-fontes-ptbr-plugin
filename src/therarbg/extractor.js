/**
 * Busca e extração de torrents do TheRARBG.
 *
 * Consulta a obra pelo IMDb associado ao pedido do TMDB, seleciona localmente apenas releases com
 * termo de português, confirma no máximo seis hashes por Verifile e classifica as faixas antes de
 * montar magnet ou `torrent://<hash>/<índice>`. Não usa o filtro `language` da busca nem inicia
 * verificações.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson } from '../_blocks/http/index.mjs';
import { discoverQuality, UNKNOWN_QUALITY } from '../_blocks/quality-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { buildStream, buildTorrentFileUrl } from '../_blocks/stream-build/index.mjs';
import { fetchTorrentFiles, findEpisodeFile } from '../_blocks/torrent-files/index.mjs';
import {
  episodeTarget,
  formatBytes,
  infoHashFromBtih,
  isCollectionTitle,
  readMagnet,
  seasonNumbers,
} from '../_blocks/torrent-release/index.mjs';
import { classifyTracks, inspectVerification } from './classify.js';
import { confirmHashes } from './verifile.js';

/** Base da API pública do TheRARBG. */
export const THERARBG_API = 'https://therarbg.com/api/v1';

const PROVIDER_NAME = 'TheRARBG';
/** Quantidade máxima de hashes confirmados por pedido. */
export const MAX_CONFIRMATIONS = 6;

const PORTUGUESE_TERMS = new Set([
  'pt',
  'ptbr',
  'por',
  'portuguese',
  'portugues',
  'brazil',
  'brasil',
  'brazilian',
]);
const PACK_WORDS = /\b(?:temporada|temporadas|completa|completo|complete|pack|season)\b/;

/**
 * @typedef {object} ValidRequest
 * @property {string} tmdbId - ID numérico do TMDB em texto.
 * @property {'movie'|'tv'} mediaType - Tipo pedido.
 * @property {number|null} season - Temporada para `tv`; `null` para filme.
 * @property {number|null} episode - Episódio para `tv`; `null` para filme.
 */

/**
 * @typedef {object} Candidate
 * @property {object} item - Item da listagem da obra.
 * @property {string} label - Rótulo curto para logs.
 * @property {number} index - Posição original na lista.
 * @property {string} hash - Hash normalizado.
 * @property {{ hash: string, href: string, dn: string|null, xl: string|null }} magnet - Magnet normalizado.
 * @property {number} seeders - Seeders positivos.
 * @property {number|undefined} leechers - Leechers válidos.
 * @property {number|undefined} size - Tamanho em bytes.
 * @property {string} quality - Qualidade descoberta localmente.
 * @property {number} qualityWeight - Peso para desempate.
 * @property {'single'|'pack'} kind - Episódio avulso ou pacote.
 */

/**
 * Coleta os streams do TheRARBG para o pedido atual.
 *
 * @param {{ tmdbId: string|number, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido recebido do app.
 * @param {string} [providerName] - Nome exibido pelo formatador; padrão `TheRARBG`.
 * @returns {Promise<object[]>} Streams resolvidos, sem ordenação final.
 * @throws {Error} Se o pedido for inválido, a obra ou o TMDB falhar, ou todas as opções falharem.
 * @example
 * const streams = await extractStreams({ tmdbId: '1263337', mediaType: 'movie', season: null, episode: null });
 */
export async function extractStreams(request, providerName = PROVIDER_NAME) {
  const valid = validateRequest(request);
  const media = await getMediaInfo({ tmdbId: valid.tmdbId, mediaType: valid.mediaType });
  if (!media.imdbId) {
    console.log(`[${providerName}] TMDB ${valid.tmdbId} sem IMDb; não há identidade pesquisável`);
    return [];
  }

  const work = await fetchWork(media, valid);
  if (work.torrents.length === 0) {
    console.log(`[${providerName}] Obra ${media.imdbId} sem torrents na resposta`);
    return [];
  }

  const selection = selectCandidates(work.torrents, media, valid, providerName);
  if (selection.candidates.length === 0) {
    if (selection.failures.length > 0) {
      throw new Error(`Todas as opções falharam: [${selection.failures.join('; ')}]`);
    }
    return [];
  }

  return confirmAndBuild(selection.candidates, media, valid, providerName, selection.failures);
}

/**
 * Valida o pedido antes de qualquer acesso à rede.
 *
 * @param {*} request - Pedido recebido do app.
 * @returns {ValidRequest}
 * @throws {Error} Se o ID, o tipo ou as coordenadas de série forem inválidos.
 */
function validateRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('pedido inválido');
  const tmdbId = String(request.tmdbId === undefined ? '' : request.tmdbId).trim();
  if (!/^\d+$/.test(tmdbId) || Number(tmdbId) <= 0) {
    throw new Error(`tmdbId inválido: "${request.tmdbId}" (esperado inteiro positivo)`);
  }
  if (request.mediaType !== 'movie' && request.mediaType !== 'tv') {
    throw new Error(`mediaType inválido: "${request.mediaType}" (esperado "movie" ou "tv")`);
  }
  if (request.mediaType === 'tv') {
    if (!Number.isInteger(request.season) || request.season < 1) {
      throw new Error(`season inválida para tv: ${JSON.stringify(request.season)}`);
    }
    if (!Number.isInteger(request.episode) || request.episode < 1) {
      throw new Error(`episode inválido para tv: ${JSON.stringify(request.episode)}`);
    }
  }
  return {
    tmdbId,
    mediaType: request.mediaType,
    season: request.mediaType === 'tv' ? request.season : null,
    episode: request.mediaType === 'tv' ? request.episode : null,
  };
}

/**
 * Consulta a obra pelo IMDb e confere identidade, tipo e lista de torrents.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {ValidRequest} request - Pedido validado.
 * @returns {Promise<object>} Resposta da obra com `torrents` em lista.
 * @throws {Error} Se a resposta não for objeto, contradizer IMDb/TMDB/tipo ou não trouxer lista.
 */
async function fetchWork(media, request) {
  const query = request.mediaType === 'tv' ? `?season=${request.season}&episode=${request.episode}` : '';
  const url = `${THERARBG_API}/title/${encodeURIComponent(media.imdbId)}/${query}`;
  const data = await fetchJson(url, { profile: 'api' });
  if (!isPlainObject(data)) throw new Error(`Obra inválida em ${url}`);

  const imdb = typeof data.imdb === 'string' ? data.imdb.toLowerCase() : '';
  if (imdb !== media.imdbId.toLowerCase()) {
    throw new Error(`Obra ${url} identificou IMDb "${data.imdb}", esperado "${media.imdbId}"`);
  }
  if (data.tmdb !== undefined && data.tmdb !== null && String(data.tmdb) !== media.tmdbId) {
    throw new Error(`Obra ${url} identificou TMDB ${data.tmdb}, esperado ${media.tmdbId}`);
  }
  const type = typeof data.type === 'string' ? normalizeText(data.type) : '';
  const expectedType = request.mediaType === 'movie' ? 'movie' : 'tvseries';
  if (type !== expectedType) {
    throw new Error(`Obra ${url} tem tipo "${data.type}", incompatível com ${request.mediaType}`);
  }
  if (!Array.isArray(data.torrents)) throw new Error(`Obra ${url} sem lista "torrents"`);
  return data;
}

/**
 * Seleciona, deduplica e limita os candidatos sem fazer chamadas adicionais.
 *
 * @param {object[]} items - Itens de `work.torrents`.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {ValidRequest} request - Pedido validado.
 * @param {string} providerName - Nome usado nos logs.
 * @returns {{ candidates: Candidate[], failures: string[] }} Até seis candidatos e falhas locais.
 */
function selectCandidates(items, media, request, providerName) {
  const candidates = [];
  const failures = [];

  for (const [index, item] of items.entries()) {
    try {
      const result = classifyCandidate(item, index, media, request, providerName);
      if (result.candidate) candidates.push(result.candidate);
    } catch (error) {
      const label = optionLabel(item, index);
      console.warn(`[${providerName}] Opção ${label} descartada: ${error.message}`);
      failures.push(`${label}: ${error.message}`);
    }
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const previous = unique.get(candidate.hash);
    if (!previous || isBetterCandidate(candidate, previous)) unique.set(candidate.hash, candidate);
  }

  const selected = [...unique.values()]
    .sort(
      (a, b) =>
        b.seeders - a.seeders ||
        b.qualityWeight - a.qualityWeight ||
        a.index - b.index,
    )
    .slice(0, MAX_CONFIRMATIONS);

  return { candidates: selected, failures };
}

/**
 * Classifica um item localmente e devolve candidato, triagem silenciosa ou motivo de triagem.
 *
 * @param {*} item - Item da listagem.
 * @param {number} index - Posição original.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {ValidRequest} request - Pedido validado.
 * @param {string} providerName - Nome usado nos logs.
 * @returns {{ candidate?: Candidate }}
 * @throws {Error} Se um campo obrigatório do item selecionado estiver inválido.
 */
function classifyCandidate(item, index, media, request, providerName) {
  if (!isPlainObject(item)) throw new Error('item não é objeto');
  if (typeof item.name !== 'string' || item.name.trim() === '') throw new Error('item sem nome de release');
  const name = item.name.trim();
  if (!hasPortugueseTerm(name)) return {};

  const label = optionLabel(item, index);
  if (item.verifile !== 'verified') {
    return logTriage(providerName, label, `verifile "${item.verifile}" não concluído como verified`);
  }
  const seeders = positiveInteger(item.seeders);
  if (seeders === null) {
    return logTriage(providerName, label, 'seeders ausentes ou não positivos');
  }
  if (typeof item.magnet !== 'string' || item.magnet.trim() === '') {
    throw new Error('item sem link magnet');
  }
  const magnet = readMagnet(item.magnet);
  if (typeof item.infoHash !== 'string' || item.infoHash.trim() === '') {
    throw new Error('item sem infoHash');
  }
  const hash = infoHashFromBtih(item.infoHash);
  if (hash !== magnet.hash) {
    throw new Error(`infoHash ${hash} diverge do magnet ${magnet.hash}`);
  }
  if (item.imdb !== undefined && item.imdb !== null) {
    if (typeof item.imdb !== 'string' || item.imdb.toLowerCase() !== media.imdbId.toLowerCase()) {
      throw new Error(`item identificou IMDb "${item.imdb}", esperado "${media.imdbId}"`);
    }
  }

  let kind;
  if (request.mediaType === 'movie') {
    if (isCollectionTitle(name)) return logTriage(providerName, label, 'coleção de filmes');
  } else {
    const episode = classifyEpisode(name, request);
    if (episode.triage) return logTriage(providerName, label, episode.triage);
    kind = episode.kind;
  }

  const size = positiveInteger(item.size);
  const xlBytes = magnet.xl && /^\d+$/.test(magnet.xl) ? positiveInteger(Number(magnet.xl)) : null;
  const quality = discoverQuality([item.resolution, name, magnet.dn]);
  const qualityWeight = qualityWeightOf(item.qualityScore, quality);

  return {
    candidate: {
      item,
      label,
      index,
      hash,
      magnet,
      seeders,
      leechers: nonNegativeInteger(item.leechers),
      size: size || xlBytes,
      quality,
      qualityWeight,
      kind: kind || 'single',
    },
  };
}

/**
 * Registra uma triagem que não é falha técnica.
 *
 * @param {string} providerName - Nome usado no log.
 * @param {string} label - Rótulo do item.
 * @param {string} reason - Motivo.
 * @returns {object} Objeto vazio, para uso direto no fluxo.
 */
function logTriage(providerName, label, reason) {
  console.log(`[${providerName}] Opção ${label} descartada por triagem: ${reason}`);
  return {};
}

/**
 * Confirma os hashes selecionados e monta os streams, isolando falhas por opção.
 *
 * @param {Candidate[]} candidates - Candidatos já limitados.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {ValidRequest} request - Pedido validado.
 * @param {string} providerName - Nome usado nos logs e no formatador.
 * @param {string[]} localFailures - Falhas já registradas na seleção local.
 * @returns {Promise<object[]>} Streams válidos.
 * @throws {Error} Se nenhuma opção produzir stream e alguma tiver falhado.
 */
async function confirmAndBuild(candidates, media, request, providerName, localFailures = []) {
  const confirmations = await confirmHashes(candidates.map((candidate) => candidate.hash));
  const streams = [];
  const packs = [];
  const failures = localFailures.slice();

  for (const [index, confirmation] of confirmations.entries()) {
    const candidate = candidates[index];
    if (confirmation.skipped) {
      console.log(`[${providerName}] Opção ${candidate.label} não confirmada: cota esgotada`);
      continue;
    }
    if (confirmation.error) {
      console.warn(`[${providerName}] Opção ${candidate.label} descartada: ${confirmation.error.message}`);
      failures.push(`${candidate.label}: ${confirmation.error.message}`);
      continue;
    }
    try {
      const inspected = inspectVerification(confirmation.data, candidate.hash, candidate.item.id);
      if (inspected.triage) {
        console.log(`[${providerName}] Opção ${candidate.label} descartada por triagem: ${inspected.triage}`);
        continue;
      }
      const result = inspected.result;
      if (request.mediaType === 'tv') {
        const fileTriage = verifiedFileTriage(result.file, request, candidate.kind);
        if (fileTriage) {
          console.log(`[${providerName}] Opção ${candidate.label} descartada por triagem: ${fileTriage}`);
          continue;
        }
      }
      const classification = classifyTracks(result);
      if (classification.triage) {
        console.log(`[${providerName}] Opção ${candidate.label} descartada por triagem: ${classification.triage}`);
        continue;
      }
      if (candidate.kind === 'pack') {
        packs.push({ candidate, result, classification });
      } else {
        streams.push(buildMagnetStream(candidate, media, request, providerName, classification, result));
      }
    } catch (error) {
      console.warn(`[${providerName}] Opção ${candidate.label} descartada: ${error.message}`);
      failures.push(`${candidate.label}: ${error.message}`);
    }
  }

  // Uma única leitura de .torrent por vez, depois da classificação de português.
  for (const pack of packs) {
    try {
      const stream = await resolvePack(pack, media, request, providerName);
      if (stream.triage) {
        console.log(`[${providerName}] Opção ${pack.candidate.label} descartada por triagem: ${stream.triage}`);
      } else {
        streams.push(stream.stream);
      }
    } catch (error) {
      console.warn(`[${providerName}] Opção ${pack.candidate.label} descartada: ${error.message}`);
      failures.push(`${pack.candidate.label}: ${error.message}`);
    }
  }

  const unique = new Map();
  for (const stream of streams) {
    if (!unique.has(stream.url)) unique.set(stream.url, stream);
  }
  if (unique.size === 0 && failures.length > 0) {
    throw new Error(`Todas as opções falharam: [${failures.join('; ')}]`);
  }
  return [...unique.values()];
}

/**
 * Monta um stream magnet para filme ou episódio avulso.
 *
 * @param {Candidate} candidate - Candidato confirmado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {ValidRequest} request - Pedido validado.
 * @param {string} providerName - Nome do provedor.
 * @param {object} classification - Saída de `classifyTracks`.
 * @param {object} result - Resultado Verifile.
 * @returns {object} Stream validado por `buildStream`.
 */
function buildMagnetStream(candidate, media, request, providerName, classification, result) {
  const filename = candidate.magnet.dn || candidate.item.name;
  const stream = buildStream({
    url: magnetWithSize(candidate.magnet, candidate.size),
    quality: candidate.quality,
    language: classification.language,
    size: candidate.size ? formatBytes(candidate.size) : undefined,
    provider: providerName,
    type: 'magnet',
    seeders: candidate.seeders,
    peers: candidate.leechers,
    subtitles: classification.externalSubtitles,
    format: formatDetails(candidate, media, request, providerName, classification, result, filename),
  });
  return stream;
}

/**
 * Resolve o arquivo de um episódio em pacote depois da classificação e confere o arquivo verificado.
 *
 * @param {{ candidate: Candidate, result: object, classification: object }} pack - Pacote classificado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {ValidRequest} request - Pedido validado.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<{ stream?: object, triage?: string }>} Stream ou motivo de triagem.
 * @throws {Error} Se a lista do torrent falhar ou o índice não existir.
 */
async function resolvePack(pack, media, request, providerName) {
  const { candidate, result, classification } = pack;
  const files = await fetchTorrentFiles(candidate.hash);
  const index = findEpisodeFile(files, {
    season: request.season,
    episode: request.episode,
    seasonPack: true,
  });
  if (index === null) {
    return { triage: `arquivo do episódio ${request.season}x${request.episode} não identificado no torrent` };
  }
  const file = files.find((entry) => entry.index === index);
  if (!file) throw new Error(`índice ${index} ausente na lista do torrent ${candidate.hash}`);
  if (!verifiedFileMatches(result.file, files, index)) {
    return { triage: `arquivo verificado "${result.file}" não corresponde ao episódio selecionado` };
  }

  const url = buildTorrentFileUrl(candidate.hash, index);
  const fileSize = Number.isInteger(file.size) && file.size >= 0 ? formatBytes(file.size) : undefined;
  const packSize = candidate.size ? formatBytes(candidate.size) : undefined;
  const quality = discoverQuality([candidate.item.resolution, file.path, candidate.item.name, candidate.magnet.dn]);
  const details = formatDetails(
    candidate,
    media,
    request,
    providerName,
    classification,
    result,
    file.path,
  );
  details.folderName = candidate.magnet.dn || candidate.item.name;
  if (packSize && packSize !== fileSize) details.folderSize = packSize;

  return {
    stream: buildStream({
      url,
      quality,
      language: classification.language,
      size: fileSize || packSize,
      provider: providerName,
      type: 'torrent',
      seeders: candidate.seeders,
      peers: candidate.leechers,
      subtitles: classification.externalSubtitles,
      format: details,
    }),
  };
}

/**
 * Monta os detalhes de formatação a partir da release e das faixas verificadas.
 *
 * @param {Candidate} candidate - Candidato.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {ValidRequest} request - Pedido validado.
 * @param {string} providerName - Nome do provedor.
 * @param {object} classification - Saída de `classifyTracks`.
 * @param {object} result - Resultado Verifile.
 * @param {string} filename - Nome do arquivo ou da release.
 * @returns {object} Detalhes aceitos por `formatStream`.
 */
function formatDetails(candidate, media, request, providerName, classification, result, filename) {
  const video = isPlainObject(result.video) ? result.video : {};
  const duration = positiveNumber(result.duration);
  const details = {
    template: FORMATTER.AUTO,
    addon: providerName,
    title: media.title,
    year: media.year === null ? undefined : media.year,
    filename,
    source: optionalText(candidate.item.source),
    encode: optionalText(candidate.item.codec) || optionalText(video.codec),
    visualTags: visualTags(candidate.item, video),
    audioTags: audioTags(result.audio),
    audioChannels: audioChannelTags(result.audio),
    releaseGroup: optionalText(candidate.item.releaseGroup),
    bitrate: positiveNumber(video.bitrate),
    duration: duration === undefined ? undefined : Math.round(duration),
    message: classification.message,
  };
  if (request.mediaType === 'tv') {
    details.season = request.season;
    details.episode = request.episode;
  }
  return details;
}

/**
 * Acrescenta `xl=<bytes>` ao magnet quando ele não trouxer o parâmetro, preservando `dn` e trackers.
 *
 * @param {{ href: string, xl: string|null }} magnet - Magnet normalizado.
 * @param {number|undefined} size - Tamanho em bytes.
 * @returns {string} Magnet preservado ou com `xl` textual.
 */
function magnetWithSize(magnet, size) {
  if (magnet.xl !== null) return magnet.href;
  if (positiveInteger(size) === null) return magnet.href;
  const separator = magnet.href.includes('?') ? '&' : '?';
  return `${magnet.href}${separator}xl=${size}`;
}

/**
 * Confere temporada e episódio na release, distinguindo avulso de pacote.
 *
 * @param {string} name - Nome da release.
 * @param {ValidRequest} request - Pedido de série validado.
 * @returns {{ kind?: 'single'|'pack', triage?: string }}
 * @throws {Error} Se o rótulo de episódio ou temporada for inválido.
 */
function classifyEpisode(name, request) {
  let spec;
  try {
    spec = episodeTarget(name);
  } catch (error) {
    throw new Error(`rótulo de episódio inválido: ${error.message}`, { cause: error });
  }
  if (spec) {
    if (spec.season && spec.season !== request.season) {
      return { triage: `temporada ${spec.season} da release não é a temporada ${request.season}` };
    }
    if (!spec.episodes.includes(request.episode)) {
      return { triage: `release não contém o episódio ${request.episode}` };
    }
    if (spec.kind === 'range' || PACK_WORDS.test(normalizeText(name))) {
      return { kind: 'pack' };
    }
    return { kind: 'single' };
  }

  let seasons;
  try {
    seasons = seasonNumbers(name);
  } catch (error) {
    throw new Error(`temporada inválida na release: ${error.message}`, { cause: error });
  }
  if (seasons.length === 0) {
    return { triage: 'release sem identificação segura de temporada e episódio' };
  }
  if (!seasons.includes(request.season)) {
    return { triage: `temporada ${seasons.join(', ')} da release não é a temporada ${request.season}` };
  }
  return { kind: 'pack' };
}

/**
 * Confere as coordenadas do arquivo analisado pelo Verifile.
 *
 * @param {string} file - Caminho ou basename informado em `result.file`.
 * @param {ValidRequest} request - Pedido de série validado.
 * @param {'single'|'pack'} kind - Tipo do candidato.
 * @returns {string|null} Motivo de triagem ou `null`.
 * @throws {Error} Se o rótulo de episódio do arquivo for inválido.
 */
function verifiedFileTriage(file, request, kind) {
  let spec;
  try {
    spec = episodeTarget(file);
  } catch (error) {
    throw new Error(`rótulo de episódio inválido no arquivo verificado: ${error.message}`, { cause: error });
  }
  if (spec) {
    if (spec.season && spec.season !== request.season) {
      return `arquivo verificado pertence à temporada ${spec.season}, não à ${request.season}`;
    }
    if (!spec.episodes.includes(request.episode)) {
      return `arquivo verificado não contém o episódio ${request.episode}`;
    }
    return null;
  }
  if (kind === 'single') return 'arquivo verificado sem coordenadas do episódio';
  return null;
}

/**
 * Diz se `result.file` corresponde ao índice selecionado na lista do torrent.
 *
 * @param {string} verified - Caminho ou basename de `result.file`.
 * @param {Array<{ index: number, path: string }>} files - Arquivos do torrent.
 * @param {number} selectedIndex - Índice escolhido por `findEpisodeFile`.
 * @returns {boolean}
 */
function verifiedFileMatches(verified, files, selectedIndex) {
  const path = verified.trim().replace(/\\/g, '/');
  if (path.includes('/')) {
    return files.some((file) => file.index === selectedIndex && file.path === path);
  }
  const matches = files.filter((file) => baseName(file.path) === path);
  return matches.length === 1 && matches[0].index === selectedIndex;
}

/**
 * Nome do arquivo sem as pastas.
 *
 * @param {string} path - Caminho no torrent.
 * @returns {string}
 */
function baseName(path) {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

/**
 * Indica se o nome tem um termo de português delimitado.
 *
 * @param {string} name - Nome da release.
 * @returns {boolean}
 */
function hasPortugueseTerm(name) {
  const tokens = normalizeText(name).split(' ').filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    if (PORTUGUESE_TERMS.has(tokens[index])) return true;
    if (tokens[index] === 'pt' && tokens[index + 1] === 'br') return true;
  }
  return false;
}

/**
 * Compara duplicatas do mesmo hash.
 *
 * @param {Candidate} candidate - Candidato novo.
 * @param {Candidate} previous - Candidato já guardado.
 * @returns {boolean} `true` quando o novo deve substituir o anterior.
 */
function isBetterCandidate(candidate, previous) {
  if (candidate.seeders !== previous.seeders) return candidate.seeders > previous.seeders;
  if (candidate.qualityWeight !== previous.qualityWeight) {
    return candidate.qualityWeight > previous.qualityWeight;
  }
  return candidate.index < previous.index;
}

/**
 * Peso de qualidade para desempate: `qualityScore` da fonte ou altura descoberta.
 *
 * @param {*} score - Campo `qualityScore` do item.
 * @param {string} quality - Qualidade normalizada.
 * @returns {number}
 */
function qualityWeightOf(score, quality) {
  if (typeof score === 'number' && Number.isFinite(score)) return score;
  if (quality === UNKNOWN_QUALITY) return 0;
  if (quality === '4K') return 2160;
  const match = /^(\d{3,4})p$/.exec(quality);
  return match ? Number(match[1]) : 0;
}

/**
 * Tags de vídeo disponíveis na listagem e no Verifile.
 *
 * @param {object} item - Item da listagem.
 * @param {object} video - Objeto `video` do Verifile.
 * @returns {string[]|undefined}
 */
function visualTags(item, video) {
  const tags = [];
  for (const value of [item.hdr, video.hdr]) {
    const text = optionalText(value);
    if (text && !tags.includes(text)) tags.push(text);
  }
  return tags.length > 0 ? tags : undefined;
}

/**
 * Tags de áudio: perfil da faixa ou, sem perfil, o codec.
 *
 * @param {object[]} tracks - `result.audio`.
 * @returns {string[]|undefined}
 */
function audioTags(tracks) {
  const values = [];
  for (const track of tracks) {
    if (!isPlainObject(track)) continue;
    const text = optionalText(track.profile) || optionalText(track.codec);
    if (text && !values.includes(text)) values.push(text);
  }
  return values.length > 0 ? values : undefined;
}

/**
 * Canais de áudio: layout da faixa ou a contagem em canais.
 *
 * @param {object[]} tracks - `result.audio`.
 * @returns {string[]|undefined}
 */
function audioChannelTags(tracks) {
  const values = [];
  for (const track of tracks) {
    if (!isPlainObject(track)) continue;
    const layout = optionalText(track.layout);
    const text = layout || (Number.isInteger(track.channels) && track.channels > 0
      ? `${track.channels} canais`
      : undefined);
    if (text && !values.includes(text)) values.push(text);
  }
  return values.length > 0 ? values : undefined;
}

/**
 * Lê um texto opcional.
 *
 * @param {*} value - Valor recebido.
 * @returns {string|undefined}
 */
function optionalText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Lê um inteiro positivo.
 *
 * @param {*} value - Valor recebido.
 * @returns {number|null}
 */
function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Lê um inteiro não negativo.
 *
 * @param {*} value - Valor recebido.
 * @returns {number|undefined}
 */
function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Lê um número finito maior que zero.
 *
 * @param {*} value - Valor recebido.
 * @returns {number|undefined}
 */
function positiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Indica se o valor é um objeto simples.
 *
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Rótulo curto do item para logs.
 *
 * @param {object} item - Item da listagem.
 * @param {number} index - Posição original.
 * @returns {string}
 */
function optionLabel(item, index) {
  const id = item && item.id !== undefined && item.id !== null ? String(item.id) : `item-${index + 1}`;
  return `post ${id}`;
}
