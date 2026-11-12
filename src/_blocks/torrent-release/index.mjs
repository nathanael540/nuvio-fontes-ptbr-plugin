/**
 * Bloco torrent-release: leitura de magnets, rótulos de release e montagem de streams de torrent.
 *
 * Reúne o que se repete nos catálogos de torrent: hash do magnet (hexadecimal ou base32 de 32
 * caracteres convertido para 40 hexadecimais), parâmetros `dn` e `xl`, trackers padrão quando
 * ausentes, qualidade e idioma do rótulo e do `dn`, temporada e episódio ou faixa do rótulo,
 * triagem de coleções de filmes em pedido de filme e resolução isolada de opções como
 * magnet ou `torrent://<hash>/<índice>` via `torrent-files`.
 *
 * Sempre formata o `name` e o `title` pelo bloco custom-formatter (campo `format` do `buildStream`),
 * com o `streamLabel` como `addon`. A qualidade é descoberta localmente nos
 * textos já obtidos; sem correspondência, o stream sai com `Desconhecida`.
 *
 * Depende dos blocos slugify, stream-build, quality-discovery, custom-formatter e torrent-files.
 */

import { FORMATTER } from '../custom-formatter/index.mjs';
import { discoverQuality, UNKNOWN_QUALITY } from '../quality-discovery/index.mjs';
import { normalizeText } from '../slugify/index.mjs';
import { languageFromTexts } from '../language-discovery/index.mjs';
import { buildStream, buildTorrentFileUrl } from '../stream-build/index.mjs';
import { fetchTorrentFiles, findEpisodeFile } from '../torrent-files/index.mjs';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SIZE_TOKEN = /(\d+(?:[.,]\d+)?)\s*(GB|MB|KB)\b/gi;
// Título já normalizado (normalizeText): sem acentos, minúsculas.
const COLLECTION_TITLE = /\b(?:trilogia|duologia|quadrilogia|pentalogia|todos os filmes|colecao|saga completa|collection)\b/;
const FALLBACK_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.openbittorrent.com:80/announce',
  'http://tracker.trackerfix.com:80/announce',
];

/**
 * Converte hash base32 de 32 caracteres (RFC 4648, sem padding) ou hexadecimal de 40 caracteres
 * em hash hexadecimal minúsculo de 40 caracteres.
 *
 * @param {string} raw - Valor de `xt=urn:btih:`.
 * @returns {string} Hash hexadecimal minúsculo de 40 caracteres.
 * @throws {Error} Se o hash não tiver 40 hexadecimais nem 32 caracteres base32 válidos.
 * @example
 * infoHashFromBtih('tg4qittt7aulezavga3sya5fglaejhyc');
 * // '99b9044e73f828b2641530372c03a532c0449f02'
 */
export function infoHashFromBtih(raw) {
  const value = String(raw || '').trim();
  if (/^[0-9a-f]{40}$/i.test(value)) return value.toLowerCase();
  if (value.length === 32 && /^[a-z0-9]{32}$/i.test(value)) return base32ToHex(value);
  throw new Error(`hash btih inválido: "${raw}" (esperado hexadecimal de 40 caracteres ou base32 de 32)`);
}

/**
 * Lê um link magnet, normaliza o hash em `xt=urn:btih:` para hexadecimal de 40 caracteres e extrai
 * os parâmetros `dn` e `xl`.
 *
 * @param {string} href - URL magnet da página.
 * @param {object} [options] - Opções de normalização da URL.
 * @param {boolean} [options.addFallbackTrackers] - Acrescenta trackers públicos quando o magnet não traz `tr=`.
 * @returns {{ hash: string, href: string, dn: string|null, xl: string|null }} Magnet normalizado e metadados.
 * @throws {Error} Se não for link magnet com `xt=urn:btih:` válido.
 * @example
 * readMagnet('magnet:?xt=urn:btih:51CA3BA90F04BF50394E9EB7E448CEEA214D5AD6&dn=Matrix+720p');
 * // { hash: '51ca3ba90f04bf50394e9eb7e448ceea214d5ad6', href: 'magnet:?xt=urn:btih:51ca3ba9...', dn: 'Matrix 720p', xl: null }
 */
export function readMagnet(href, options = {}) {
  const text = String(href || '').trim();
  if (!/^magnet:\?/i.test(text)) throw new Error(`link magnet inválido: "${href}"`);
  const raw = /btih:([^&#\s]+)/i.exec(text);
  if (!raw) throw new Error(`magnet sem xt=urn:btih: "${href}"`);
  const hash = infoHashFromBtih(raw[1]);
  let normalized = text.replace(/(xt=urn:btih:)[^&#\s]+/i, `$1${hash}`);
  if (options && options.addFallbackTrackers && !/[?&]tr=/i.test(normalized)) {
    const extra = FALLBACK_TRACKERS.map((tracker) => `tr=${encodeURIComponent(tracker)}`).join('&');
    normalized = `${normalized}&${extra}`;
  }
  return {
    hash,
    href: normalized,
    dn: decodeParam(magnetParam(text, 'dn')),
    xl: magnetParam(text, 'xl'),
  };
}

/**
 * Lê um parâmetro da query de um link magnet.
 *
 * @param {string} url - URL magnet.
 * @param {string} name - Nome do parâmetro (ex.: `dn`, `xl`).
 * @returns {string|null} Valor do parâmetro ou `null` quando ausente.
 * @throws {Error} Se `url` ou `name` não forem texto.
 * @example
 * magnetParam('magnet:?xt=urn:btih:51ca3ba90f04bf50394e9eb7e448ceea214d5ad6&xl=1024', 'xl');
 * // '1024'
 */
export function magnetParam(url, name) {
  if (typeof url !== 'string' || typeof name !== 'string') {
    throw new Error('url e name devem ser texto');
  }
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  return new URLSearchParams(query).get(name);
}

/**
 * Indica se o título descreve uma coleção de filmes (trilogia, "todos os filmes", coleção, saga completa).
 *
 * "Tri Áudio" não é coleção e retorna `false`.
 *
 * @param {string} title - Título da página, cartão ou post.
 * @returns {boolean} `true` quando é coleção de filmes.
 * @throws {Error} Se `title` não for texto.
 * @example
 * isCollectionTitle('Matrix - Todos os Filmes (1999)'); // true
 * isCollectionTitle('Matrix (Tri Áudio) (1999)'); // false
 */
export function isCollectionTitle(title) {
  if (typeof title !== 'string') throw new Error('title deve ser texto');
  return COLLECTION_TITLE.test(normalizeText(title));
}

/**
 * Extrai os números de temporada citados em um título ou rótulo.
 *
 * Reconhece `2ª Temporada`, `2a Temporada`, `Temporada 2`, `1ª a 5ª Temporada`, `S02`, `S02E03` e `T02E03`.
 *
 * @param {string} text - Título ou rótulo.
 * @returns {number[]} Números de temporada (inteiros positivos, sem repetição).
 * @throws {Error} Se `text` não for texto ou tiver faixa de temporadas inválida.
 * @example
 * seasonNumbers('Breaking Bad - 2ª Temporada Completa'); // [2]
 */
export function seasonNumbers(text) {
  if (typeof text !== 'string') throw new Error('text deve ser texto');
  const found = [];
  const add = (value) => {
    const number = Number(value);
    if (number >= 1 && number <= 80 && !found.includes(number)) found.push(number);
  };
  for (const match of text.matchAll(/(\d{1,2})\s*[ªº°a]?\s*(?:a|ao|até)\s*(\d{1,2})\s*[ªº°a]?\s*temporadas?/gi)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (end < start || end - start > 30) throw new Error(`faixa de temporadas inválida: ${match[0]}`);
    for (let number = start; number <= end; number += 1) add(number);
  }
  for (const match of text.matchAll(/(\d{1,2})\s*[ªº°]\s*temporadas?/gi)) add(match[1]);
  for (const match of text.matchAll(/\b(\d{1,2})a\s*temporadas?/gi)) add(match[1]);
  for (const match of text.matchAll(/(\d{1,2})\s+a\s+temporadas?/gi)) add(match[1]);
  // `\b` impede ler "Temporada 720p" como temporada 72.
  for (const match of text.matchAll(/temporadas?\s*(\d{1,2})\b/gi)) add(match[1]);
  for (const match of text.matchAll(/\b(\d{1,2})\s+temporadas?\b/gi)) add(match[1]);
  for (const match of text.matchAll(/\bS(\d{1,2})(?:\s*E\d{1,3})?\b/gi)) add(match[1]);
  for (const match of text.matchAll(/\bT(\d{1,2})\s*E\d{1,3}\b/gi)) add(match[1]);
  return found;
}

/**
 * Extrai o último rótulo de episódio ou faixa de episódios de um texto.
 *
 * Reconhece episódios avulsos (`03º EPISÓDIO`, `Episódio 03`, `S02E03`), listas (`01º E 02º EPISÓDIO`,
 * `S01E01-02`, `S02E01-E03`) e faixas (`01º AO 06º EPISÓDIO`, `Episódios 01 ao 06`).
 *
 * @param {string} text - Rótulo do magnet ou `dn`.
 * @returns {{ kind: 'single'|'range', season?: number, episodes: number[] }|null} Episódio(s) ou `null` quando não há menção a episódio.
 * @throws {Error} Se houver faixa ou número de episódio inválido.
 * @example
 * episodeTarget('01º AO 04º EPISÓDIO DUBLADO 1080P');
 * // { kind: 'range', episodes: [1, 2, 3, 4] }
 */
export function episodeTarget(text) {
  if (!text) return null;
  const specs = [
    { type: 'ord-range', re: /(\d{1,3})\s*[ºª°]?\s*(?:ao|a|até)\s*(\d{1,3})\s*[ºª°]?\s*epis[oó]dios?\b/gi },
    { type: 'word-range', re: /epis[oó]dios?\s+(\d{1,3})\s*(?:ao|a|até)\s*(\d{1,3})/gi },
    { type: 'sxe-list', re: /\bS(\d{1,2})\s*E(\d{1,3}(?:\s*-\s*E?\d{1,3})+)/gi },
    { type: 'ord-list', re: /((?:\d{1,3}\s*[ºª°]\s*(?:,|e)\s*)+\d{1,3}\s*[ºª°]?)\s*epis[oó]dios?\b/gi },
    { type: 'ord-single', re: /(\d{1,3})\s*[ºª°]\s*epis[oó]dio\b/gi },
    { type: 'sxe', re: /\bS(\d{1,2})\s*E(\d{1,3})\b/gi },
    { type: 'word', re: /epis[oó]dio\s*[-:]?\s*(\d{1,3})\b/gi },
  ];
  let best = null;
  for (const spec of specs) {
    for (const match of String(text).matchAll(spec.re)) {
      const endIndex = match.index + match[0].length;
      if (!best || endIndex > best.endIndex || (endIndex === best.endIndex && match.index < best.index)) {
        best = { spec, match, index: match.index, endIndex };
      }
    }
  }
  if (!best) return null;
  const { type } = best.spec;
  const { match } = best;
  if (type === 'ord-range' || type === 'word-range') {
    return { kind: 'range', episodes: inclusive(Number(match[1]), Number(match[2]), match[0]) };
  }
  if (type === 'sxe-list') {
    const numbers = match[2].split(/\s*-\s*E?/i).map(Number).filter((number) => Number.isInteger(number) && number >= 1);
    if (numbers.length < 2) throw new Error(`lista de episódios inválida: ${match[0]}`);
    const episodes = numbers.length === 2 ? inclusive(numbers[0], numbers[1], match[0]) : numbers;
    return { kind: 'range', season: Number(match[1]), episodes };
  }
  if (type === 'ord-list') {
    const episodes = [...match[1].matchAll(/(\d{1,3})/g)].map((item) => Number(item[1])).filter((number) => number >= 1);
    if (episodes.length < 2) throw new Error(`lista de episódios inválida: ${match[0]}`);
    return { kind: 'range', episodes };
  }
  if (type === 'sxe') {
    return { kind: 'single', season: Number(match[1]), episodes: [Number(match[2])] };
  }
  const episode = Number(match[1]);
  if (episode < 1) throw new Error(`episódio inválido: ${match[0]}`);
  return { kind: 'single', episodes: [episode] };
}

/**
 * Extrai a qualidade normalizada a partir de textos candidatos (rótulo do botão, `dn`, título da página).
 *
 * Usa `discoverQuality` (bloco quality-discovery): quando o mesmo texto traz `CAM` (`CAM`, `CAMRIP`,
 * `HDCAM`, `TELESYNC`) junto com uma resolução (`1080P CAM`), `CAM` prevalece; resolução colada ao
 * container (`MP4720P`) é reconhecida.
 *
 * Mantido para consumidores que exigem a qualidade: lança quando a descoberta devolve
 * `UNKNOWN_QUALITY`. Quem monta o stream deve usar `discoverQuality` e preservar `Desconhecida`.
 *
 * @param {(string|null|undefined)[]} parts - Textos candidatos em ordem de preferência.
 * @returns {string} Qualidade normalizada (`4K`, `1080p`, `720p`, `CAM` etc.).
 * @throws {Error} Se nenhum texto contiver qualidade reconhecida.
 * @example
 * qualityFromTexts(['DOWNLOAD DUBLADO MP4720P', 'Matrix.1999']); // '720p'
 * qualityFromTexts(['CAM CINEMA 1080P']); // 'CAM'
 */
export function qualityFromTexts(parts) {
  const quality = discoverQuality(parts);
  if (quality === UNKNOWN_QUALITY) throw new Error('qualidade não reconhecida');
  return quality;
}

/**
 * Extrai o último tamanho legível (`796 MB`, `2.03 GB`) presente em um texto.
 *
 * @param {string|null|undefined} text - Texto do rótulo ou ficha.
 * @returns {string|null} Tamanho padronizado com ponto decimal ou `null`.
 * @throws {Error} Se `text` for definido e não for texto.
 * @example
 * humanSize('DUBLADO 720P / 796 MB'); // '796 MB'
 */
export function humanSize(text) {
  if (text === null || text === undefined || text === '') return null;
  if (typeof text !== 'string') throw new Error('text deve ser texto');
  const matches = [...text.matchAll(new RegExp(SIZE_TOKEN.source, 'gi'))];
  if (!matches.length) return null;
  const match = matches[matches.length - 1];
  return `${match[1].replace(',', '.')} ${match[2].toUpperCase()}`;
}

/**
 * Separa um campo `Tamanho` com múltiplos valores separados por `|`.
 *
 * @param {string|null|undefined} text - Texto do campo Tamanho (ex.: `796 MB | 2.03 GB`).
 * @returns {string[]} Lista de tamanhos válidos.
 * @throws {Error} Se `text` for definido e não for texto.
 * @example
 * splitSizes('796 MB | 2.03 GB'); // ['796 MB', '2.03 GB']
 */
export function splitSizes(text) {
  if (text === null || text === undefined || text === '') return [];
  if (typeof text !== 'string') throw new Error('text deve ser texto');
  return text.split('|').map((part) => humanSize(part)).filter(Boolean);
}

/**
 * Formata um tamanho em bytes (`xl` ou arquivo do `.torrent`) em `GB`, `MB` ou `B`.
 *
 * @param {number} bytes - Quantidade de bytes.
 * @returns {string} Tamanho formatado.
 * @throws {Error} Se `bytes` não for número finito maior ou igual a zero.
 * @example
 * formatBytes(1610612736); // '1.50 GB'
 */
export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    throw new Error(`bytes inválido: ${bytes}`);
  }
  const gib = 1024 ** 3;
  const mib = 1024 ** 2;
  if (bytes >= gib) return `${(bytes / gib).toFixed(2)} GB`;
  if (bytes >= mib) return `${(bytes / mib).toFixed(2)} MB`;
  return `${Math.trunc(bytes)} B`;
}

/**
 * Classifica um candidato de magnet para o pedido atual (filme, episódio avulso, pacote ou triagem).
 *
 * @param {object} input - Dados extraídos da opção de magnet na página.
 * @param {string} input.href - Link magnet bruto.
 * @param {string} [input.labelText] - Texto do rótulo imediato do botão/linha.
 * @param {string} [input.contextText] - Texto de contexto adicional (título da página/post).
 * @param {string|null} [input.audio] - Campo de áudio/idioma da ficha da página.
 * @param {string|null} [input.qualityFallback] - Campo de qualidade da ficha da página.
 * @param {string|null} [input.size] - Tamanho já atribuído ao magnet, se houver.
 * @param {boolean} [input.addFallbackTrackers] - Se verdadeiro, completa trackers quando ausentes.
 * @param {boolean} [input.allowSeriesPackWithoutSeason] - Em série, permite pacote sem número de temporada no rótulo quando a página é da série.
 * @param {import('../tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {object} Opção classificada pronta para `resolveTorrentOptions`.
 * @throws {Error} Se `input`, `media` ou `request` não forem objetos.
 * @example
 * classifyMagnetOption({ href: 'magnet:?xt=urn:btih:51ca3ba90f04bf50394e9eb7e448ceea214d5ad6&dn=Matrix.720p', labelText: '720p Dublado' }, media, { mediaType: 'movie', season: null, episode: null });
 */
export function classifyMagnetOption(input, media, request) {
  if (!input || typeof input !== 'object') throw new Error('input deve ser objeto');
  if (!media || typeof media !== 'object') throw new Error('media deve ser objeto');
  if (!request || typeof request !== 'object') throw new Error('request deve ser objeto');
  const rawHash = /btih:([^&#\s]+)/i.exec(String(input.href || ''));
  let magnet;
  try {
    magnet = readMagnet(input.href, { addFallbackTrackers: Boolean(input.addFallbackTrackers) });
  } catch (error) {
    const suffix = rawHash ? rawHash[1].slice(0, 8) : 'sem-hash';
    return { label: rawHash ? `magnet ${suffix}` : 'magnet sem hash', failure: error };
  }
  const labelText = String(input.labelText || '').trim();
  const contextText = String(input.contextText || '').trim();
  const xlBytes = magnet.xl && /^\d+$/.test(magnet.xl) ? Number(magnet.xl) : null;
  const size = input.size || humanSize(labelText) || (xlBytes && xlBytes > 0 ? formatBytes(xlBytes) : null);
  const option = {
    hash: magnet.hash,
    href: magnet.href,
    dn: magnet.dn,
    xl: magnet.xl,
    labelText,
    contextText,
    audio: input.audio || null,
    qualityFallback: input.qualityFallback || null,
    media,
    season: request.season,
    episode: request.episode,
    size,
    label: `magnet ${magnet.hash.slice(0, 8)}`,
  };
  if (request.mediaType !== 'tv') {
    option.kind = 'filme';
    option.label = `filme ${magnet.hash.slice(0, 8)}`;
    return option;
  }
  return classifySeriesOption(option, input, request);
}

/**
 * Resolve uma lista de opções classificadas em isolamento, montando streams magnet ou
 * `torrent://<hash>/<índice>`.
 *
 * @param {object[]} options - Opções vindas de `classifyMagnetOption`.
 * @param {object} config - Rótulos do catálogo/provedor.
 * @param {string} config.logPrefix - Prefixo dos logs sem colchetes (ex.: `Baixa Rápido/hdrtorrents`).
 * @param {string} config.streamLabel - Nome do provedor exibido como `addon` do formatador (ex.: `Baixa Rápido`).
 * @param {string} [config.provider] - Valor do campo `provider` do stream, quando aplicável.
 * @returns {Promise<object[]>} Streams resolvidos do catálogo, sem duplicar a mesma `url`.
 * @throws {Error} Se nenhuma opção produzir stream e ao menos uma tiver falhado.
 * @example
 * const streams = await resolveTorrentOptions(options, { logPrefix: 'Baixa Rápido', streamLabel: 'Baixa Rápido', provider: 'baixarapido' });
 * // name e title vêm do formatador; sem qualidade nos textos, o stream sai com "Desconhecida"
 */
export async function resolveTorrentOptions(options, config) {
  if (!Array.isArray(options)) throw new Error('options deve ser lista');
  if (!config || typeof config.logPrefix !== 'string' || typeof config.streamLabel !== 'string') {
    throw new Error('config deve informar logPrefix e streamLabel');
  }
  const pending = [];
  for (const option of options) {
    if (option.triage) {
      console.log(`[${config.logPrefix}] Opção ${option.label} descartada por triagem: ${option.triage}`);
      continue;
    }
    pending.push(option);
  }
  if (!pending.length) return [];
  // allSettled não está confirmado no QuickJS: cada promessa já nasce resolvida.
  const settled = await Promise.all(pending.map((option) => settleOption(option, config)));
  const streams = new Map();
  const failures = [];
  for (const result of settled) {
    if (result.failure) failures.push(result.failure);
    if (result.stream) streams.set(result.stream.url, result.stream);
  }
  if (!streams.size && failures.length) {
    throw new Error(`Todas as opções falharam: [${failures.join('; ')}]`);
  }
  return [...streams.values()];
}

/**
 * @param {object} option
 * @param {object} input
 * @param {{ season: number, episode: number }} request
 * @returns {object}
 */
function classifySeriesOption(option, input, request) {
  const combined = `${option.labelText} ${option.dn || ''}`.trim();
  let spec;
  try {
    spec = episodeTarget(option.labelText) || episodeTarget(option.dn || '');
  } catch (error) {
    option.failure = error;
    option.label = `pacote ${option.hash.slice(0, 8)}`;
    return option;
  }
  let seasons;
  try {
    seasons = seasonNumbers(combined);
  } catch (error) {
    option.failure = error;
    option.label = `pacote ${option.hash.slice(0, 8)}`;
    return option;
  }
  if (spec && spec.season && spec.season !== request.season) {
    option.triage = `temporada ${spec.season} não é a temporada ${request.season}`;
    option.label = `episódio ${option.hash.slice(0, 8)}`;
    return option;
  }
  if (!(spec && spec.season) && seasons.length && !seasons.includes(request.season)) {
    option.triage = `temporada ${seasons.join(', ')} não é a temporada ${request.season}`;
    option.label = `pacote ${option.hash.slice(0, 8)}`;
    return option;
  }
  if (spec && !spec.episodes.includes(request.episode)) {
    option.triage = `não contém o episódio ${request.episode}`;
    option.label = `episódio ${option.hash.slice(0, 8)}`;
    return option;
  }
  if (spec && spec.kind === 'single') {
    option.kind = 'episodio';
    option.label = `episódio ${request.episode} ${option.hash.slice(0, 8)}`;
    return option;
  }
  const pageSeasons = seasonNumbers(option.contextText);
  if (spec || seasons.length || pageSeasons.includes(request.season) || /temporada|complet[ao]|complete/i.test(combined) || input.allowSeriesPackWithoutSeason) {
    option.kind = 'pacote';
    option.label = `pacote ${option.hash.slice(0, 8)}`;
    return option;
  }
  option.triage = 'rótulo sem episódio nem temporada';
  return option;
}

/**
 * @param {object} option
 * @param {{ logPrefix: string, streamLabel: string, provider?: string }} config
 * @returns {Promise<{ stream?: object, failure?: string }>}
 */
function settleOption(option, config) {
  return resolveSingleOption(option, config)
    .then((result) => {
      if (result.triage) {
        console.log(`[${config.logPrefix}] Opção ${option.label} descartada por triagem: ${result.triage}`);
        return {};
      }
      return { stream: result.stream };
    })
    .catch((error) => {
      console.warn(`[${config.logPrefix}] Opção ${option.label} descartada: ${error.message}`);
      return { failure: `${option.label}: ${error.message}` };
    });
}

/**
 * @param {object} option
 * @param {{ streamLabel: string, provider?: string }} config
 * @returns {Promise<{ stream?: object, triage?: string }>}
 */
async function resolveSingleOption(option, config) {
  if (option.failure) throw option.failure;
  const quality = discoverQuality([option.labelText, option.dn, option.contextText, option.qualityFallback]);
  const language = languageFromTexts([option.dn, option.labelText, option.audio, option.contextText]);
  if (option.kind === 'pacote') {
    const files = await fetchTorrentFiles(option.hash);
    const index = findEpisodeFile(files, { season: option.season, episode: option.episode, seasonPack: true });
    if (index === null) {
      return { triage: `arquivo do episódio ${option.season}x${option.episode} não identificado` };
    }
    const file = files.find((item) => item.index === index);
    if (!file) throw new Error(`índice ${index} ausente na lista do torrent ${option.hash}`);
    return { stream: buildPackStream(option, file, quality, language, config) };
  }
  return { stream: buildMagnetStream(option, quality, language, config) };
}

/**
 * @param {object} option
 * @param {string} quality
 * @param {string|null} language
 * @param {{ streamLabel: string, provider?: string }} config
 * @returns {object}
 */
function buildMagnetStream(option, quality, language, config) {
  return finishStream(option, config, {
    url: option.href,
    quality,
    language,
    type: 'magnet',
    size: option.size,
  }, option.dn ? { filename: option.dn } : {});
}

/**
 * @param {object} option
 * @param {{ index: number, path: string, size: number }} file
 * @param {string} quality
 * @param {string|null} language
 * @param {{ streamLabel: string, provider?: string }} config
 * @returns {object}
 */
function buildPackStream(option, file, quality, language, config) {
  const size = Number.isInteger(file.size) && file.size >= 0 ? formatBytes(file.size) : option.size;
  return finishStream(option, config, {
    url: buildTorrentFileUrl(option.hash, file.index),
    quality,
    language,
    type: 'torrent',
    size,
  }, packRelease(option, file, size));
}

/**
 * Arquivo, pasta e tamanho do pacote para o formatador.
 * @param {object} option
 * @param {{ path: string }} file
 * @param {string|null} size - Tamanho exibido do arquivo do episódio.
 * @returns {{ filename: string, folderName?: string, folderSize?: string }}
 */
function packRelease(option, file, size) {
  const release = { filename: file.path };
  if (option.dn) release.folderName = option.dn;
  if (option.size && option.size !== size) release.folderSize = option.size;
  return release;
}

/**
 * @param {object} option
 * @param {{ streamLabel: string, provider?: string }} config
 * @param {{ url: string, quality: string, language: string|null, type: string, size: string|null }} fields
 * @param {{ filename?: string, folderName?: string, folderSize?: string }} release - Arquivo e pacote, para o formatador.
 * @returns {object}
 */
function finishStream(option, config, fields, release) {
  const stream = {
    url: fields.url,
    quality: fields.quality,
    infoHash: option.hash,
    type: fields.type,
    format: formatDetails(option, config, release),
  };
  if (config.provider) stream.provider = config.provider;
  if (fields.language) stream.language = fields.language;
  if (fields.size) stream.size = fields.size;
  return buildStream(stream);
}

/**
 * Campo `format` do stream (bloco custom-formatter): título e ano do TMDB, temporada e episódio
 * pedidos e o arquivo ou pacote da release.
 * @param {object} option
 * @param {{ streamLabel: string }} config
 * @param {{ filename?: string, folderName?: string, folderSize?: string }} release
 * @returns {object}
 */
function formatDetails(option, config, release) {
  const format = { template: FORMATTER.AUTO, addon: config.streamLabel, title: option.media.title };
  if (option.media.year !== null && option.media.year !== undefined) format.year = option.media.year;
  if (Number.isInteger(option.season) && Number.isInteger(option.episode)) {
    format.season = option.season;
    format.episode = option.episode;
  }
  return Object.assign(format, release);
}

/**
 * Converte hash base32 de 32 caracteres (RFC 4648, sem padding) em 40 hexadecimais.
 * @param {string} b32
 * @returns {string}
 */
function base32ToHex(b32) {
  const clean = b32.trim().toUpperCase();
  if (clean.length !== 32) throw new Error(`hash base32 deve ter 32 caracteres (recebido: "${b32}")`);
  let bits = '';
  for (let index = 0; index < clean.length; index += 1) {
    const value = BASE32.indexOf(clean[index]);
    if (value === -1) throw new Error(`hash btih inválido (hash base32 inválido: caractere "${clean[index]}" em "${b32}")`);
    bits += value.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let index = 0; index < 160; index += 4) hex += parseInt(bits.slice(index, index + 4), 2).toString(16);
  return hex;
}

/**
 * @param {number} start
 * @param {number} end
 * @param {string} label
 * @returns {number[]}
 */
function inclusive(start, end, label) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end - start > 80) {
    throw new Error(`faixa de episódios inválida: ${label}`);
  }
  const episodes = [];
  for (let number = start; number <= end; number += 1) episodes.push(number);
  return episodes;
}

/**
 * @param {string|null} value
 * @returns {string|null}
 */
function decodeParam(value) {
  if (!value) return null;
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}
