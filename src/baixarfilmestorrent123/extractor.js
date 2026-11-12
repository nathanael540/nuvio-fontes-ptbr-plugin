/**
 * Lógica de extração do provedor Baixar Filmes Via-Torrent.
 *
 * Localiza o título na busca do feed do Blogger (alt=json, max-results=20), confirma pelo IMDb
 * do post ou pelo título (com findBestMatch) e ano, extrai magnets hexadecimais de 40 caracteres
 * do HTML do post via Cheerio do app, e resolve filmes como magnet e episódios em pacote de
 * temporada como torrent://<hash>/<índice>.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson } from '../_blocks/http/index.mjs';
import { discoverQuality } from '../_blocks/quality-discovery/index.mjs';
import { languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { buildStream, buildTorrentFileUrl } from '../_blocks/stream-build/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { fetchTorrentFiles, findEpisodeFile } from '../_blocks/torrent-files/index.mjs';

const SOURCE_URL = 'https://baixarfilmestorrent123.blogspot.com';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 */

/**
 * Localiza o título no blog e extrai os streams correspondentes.
 * @param {MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {string} providerName - Nome do provedor para o rótulo dos streams.
 * @returns {Promise<Stream[]>} Streams encontrados (ainda não ordenados); vazio se ausente.
 */
export async function extractStreams(media, request, providerName) {
  const matchingEntry = await findMatchingPost(media, request);
  if (!matchingEntry) return [];

  const html = String(matchingEntry.content?.$t || '');
  const options = extractMagnetOptions(html);
  if (!options.length) return [];

  const sizes = extractSizes(html);
  assignSizes(options, sizes);

  const postVideoQuality = extractPostVideoQuality(html);
  const postAudio = extractPostAudio(html);

  // Settle isolated options
  const results = await Promise.all(
    options.map((option) =>
      resolveOption(option, media, request, providerName, postVideoQuality, postAudio)
        .then((stream) => ({ stream }))
        .catch((error) => ({ failure: `${option.hash.slice(0, 8)}: ${error.message}` }))
    )
  );

  const streams = [];
  const failures = [];
  for (const result of results) {
    if (result.failure) failures.push(result.failure);
    if (result.stream) streams.push(result.stream);
  }

  if (!streams.length && failures.length) {
    throw new Error(`Todas as opções falharam: ${failures.join('; ')}`);
  }

  return streams;
}

/**
 * Busca no feed pelas variações de título até encontrar um post aceito.
 * @param {MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {Promise<object|null>}
 */
async function findMatchingPost(media, request) {
  const candidateTitles = [media.title, media.originalTitle, ...(media.alternativeTitles || [])];
  const queries = [...new Set(candidateTitles.map((t) => String(t || '').trim()).filter(Boolean))];

  for (const query of queries) {
    const entries = await searchFeed(query);
    for (const entry of entries) {
      if (matchesEntry(entry, media, request)) {
        return entry;
      }
    }
  }
  return null;
}

/**
 * Consulta o feed do Blogger via query em texto.
 * @param {string} query
 * @returns {Promise<object[]>} Lista de posts (entry).
 */
async function searchFeed(query) {
  const url = `${SOURCE_URL}/feeds/posts/default?alt=json&max-results=20&q=${encodeURIComponent(query)}`;
  const data = await fetchJson(url);
  if (!data || typeof data !== 'object' || !data.feed) {
    throw new Error(`feed ausente na resposta de ${url}`);
  }
  const total = Number(data.feed.openSearch$totalResults?.$t || 0);
  const entries = Array.isArray(data.feed.entry) ? data.feed.entry : [];
  if (total === 0 || entries.length === 0) return [];
  return entries;
}

/**
 * Verifica se um post corresponde ao pedido e ao título do TMDB.
 * @param {object} entry
 * @param {MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {boolean}
 */
function matchesEntry(entry, media, request) {
  const rawTitle = String(entry.title?.$t || '').trim();
  const html = String(entry.content?.$t || '');
  const categories = Array.isArray(entry.category) ? entry.category.map((c) => String(c.term || '')) : [];

  const hasSeriesTag = categories.some((term) => /s[ée]rie/i.test(term));
  const seasonInTitle = extractSeasonNumber(rawTitle);
  const isSeries = hasSeriesTag || seasonInTitle !== null;

  if (request.mediaType === 'movie') {
    if (isSeries) return false;
  } else {
    // Série exige a temporada pedida no título
    if (seasonInTitle === null || seasonInTitle !== request.season) return false;
  }

  // 1. Confirmação por IMDb do post
  const imdbMatch = /imdb\.com\/(?:pt\/)?title\/(tt\d+)/i.exec(html);
  const postImdb = imdbMatch ? imdbMatch[1].toLowerCase() : null;
  const targetImdb = media.imdbId ? media.imdbId.trim().toLowerCase() : null;

  if (postImdb && targetImdb) {
    return postImdb === targetImdb;
  }

  // 2. Sem IMDb no post: findBestMatch no título limpo e no Título original
  const cleanedTitle = cleanTitle(rawTitle);
  const originalTitle = extractOriginalTitle(html);
  // Filme usa o ano da ficha; série não leva ano de estreia
  const postYear = request.mediaType === 'movie' ? extractYear(html) : null;

  const candidateList = [];
  if (cleanedTitle) {
    candidateList.push({ title: cleanedTitle, year: postYear });
  }
  if (originalTitle && originalTitle !== cleanedTitle) {
    candidateList.push({ title: originalTitle, year: postYear });
  }

  if (!candidateList.length) return false;

  const match = findBestMatch(candidateList, media, {
    yearTolerance: request.mediaType === 'movie' ? 1 : 0,
  });
  return match !== null;
}

/**
 * Remove sufixos como "- Torrent" e referências a temporadas do título do post.
 * @param {string} title
 * @returns {string}
 */
function cleanTitle(title) {
  return title
    .replace(/\s*-\s*torrent\b.*$/i, '')
    .replace(/\s*(\d+[ªa]?\s*temporada|season\s*\d+|[st]\d{1,2})\b.*$/i, '')
    .trim();
}

/**
 * Extrai o número da temporada citado no título do post.
 * @param {string} title
 * @returns {number|null}
 */
function extractSeasonNumber(title) {
  const match = /(\d+)[ªa]?\s*temporada/i.exec(title)
    || /\bseason\s*(\d+)/i.exec(title)
    || /\b[st](\d{1,2})\b/i.exec(title);
  return match ? Number(match[1]) : null;
}

/**
 * Extrai o "Título original" do corpo da ficha do post.
 * @param {string} html
 * @returns {string|null}
 */
function extractOriginalTitle(html) {
  const text = html.replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, ' ');
  const match = /T[íi]tulo\s*original\s*:\s*([^<\n\r»]+)/i.exec(text);
  if (!match) return null;
  const val = match[1].split(/\s*(?:Tempo de|Distribuidor|Formato|Qualidade|Áudio|Audio|Idioma|Legenda|Servidor|Gênero|Genero|Tamanho|Ano|Lançamento|Lancamento|Duração|Duracao|IMDb|Sinopse)\s*:/i)[0];
  const cleaned = val.trim();
  return cleaned || null;
}

/**
 * Extrai o ano de lançamento da ficha técnica do post.
 * @param {string} html
 * @returns {number|null}
 */
function extractYear(html) {
  const text = html.replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, ' ');
  const match = /(?:Ano\s*de\s*Lan[çc]amento|Lan[çc]amento)\s*:\s*(\d{4})/i.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * Extrai opções magnet do HTML do post usando o Cheerio do app.
 * @param {string} html
 * @returns {Array<{ hash: string, url: string, text: string, dn: string|null, xl: string|null }>}
 */
function extractMagnetOptions(html) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(html);
  const anchors = $('a');
  const options = [];
  const seenHashes = new Map();

  for (let i = 0; i < anchors.length; i += 1) {
    const a = anchors.eq(i);
    const href = (a.attr('href') || '').trim();
    if (!/^magnet:\?/i.test(href)) continue;

    const match = /^magnet:\?(?:[^&]*&)*?xt=urn:btih:([^&]+)/i.exec(href);
    if (!match) continue;
    const rawHash = match[1];
    if (!/^[0-9a-f]{40}$/i.test(rawHash)) {
      // btih que não tem 40 hexadecimais derruba só essa opção
      continue;
    }
    const hash = rawHash.toLowerCase();
    const normalizedUrl = href.replace(rawHash, hash);
    const text = a.text().replace(/\u00a0|&nbsp;/g, ' ').trim();

    if (seenHashes.has(hash)) {
      const existing = seenHashes.get(hash);
      if (!existing.text && text) {
        existing.text = text;
      }
    } else {
      const option = {
        hash,
        url: normalizedUrl,
        text,
        dn: extractQueryParam(href, 'dn'),
        xl: extractQueryParam(href, 'xl'),
      };
      seenHashes.set(hash, option);
      options.push(option);
    }
  }
  return options;
}

/**
 * Lê parâmetro de query de uma URL.
 * @param {string} url
 * @param {string} param
 * @returns {string|null}
 */
function extractQueryParam(url, param) {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return null;
  const searchParams = new URLSearchParams(url.slice(qIndex + 1));
  return searchParams.get(param);
}

/**
 * Extrai tamanhos informados no campo Tamanho da ficha.
 * @param {string} html
 * @returns {string[]}
 */
function extractSizes(html) {
  const text = html.replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, ' ');
  const match = /(?:^|\n|[»\s])Tamanho\s*:?\s*([^<\n»]+)/i.exec(text);
  if (!match) return [];
  return [...match[1].matchAll(/(\d+(?:[.,]\d+)?\s*(?:GB|MB|KB))\b/gi)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim()
  );
}

/**
 * Associa tamanhos às opções conforme regras de contagem ou parâmetro xl.
 * @param {Array<object>} options
 * @param {string[]} sizes
 * @returns {void}
 */
function assignSizes(options, sizes) {
  for (let i = 0; i < options.length; i += 1) {
    const opt = options[i];
    if (opt.xl) {
      const bytes = Number(opt.xl);
      if (Number.isFinite(bytes) && bytes > 0) {
        opt.size = formatBytes(bytes);
        continue;
      }
    }
    if (sizes.length === 1) {
      opt.size = sizes[0];
    } else if (sizes.length === options.length) {
      opt.size = sizes[i];
    } else {
      opt.size = undefined;
    }
  }
}

/**
 * Extrai a qualidade de vídeo anunciada na ficha.
 * @param {string} html
 * @returns {string|null}
 */
function extractPostVideoQuality(html) {
  const text = html.replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, ' ');
  const match = /(?:Qualidade\s*de\s*V[íi]deo|Qualidade)\s*:\s*([^<\n»]+)/i.exec(text);
  return match ? match[1].trim() : null;
}

/**
 * Extrai o áudio ou idioma anunciado na ficha.
 * @param {string} html
 * @returns {string|null}
 */
function extractPostAudio(html) {
  const text = html.replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, ' ');
  // Ignora "Qualidade de Áudio"
  const match = /(?:^|\s|[»])(?:(?<!Qualidade\s*de\s*)[Áá]udio|Idioma)\s*:\s*([^<\n»]+)/i.exec(text);
  if (!match) return null;
  const val = match[1].trim();
  if (/^\d+$/.test(val)) return null;
  return val;
}

/**
 * Converte bytes em string legível.
 * @param {number} bytes
 * @returns {string|null}
 */
function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  const gib = 1024 ** 3;
  const mib = 1024 ** 2;
  if (bytes >= gib) return `${(bytes / gib).toFixed(2)} GB`;
  if (bytes >= mib) return `${(bytes / mib).toFixed(2)} MB`;
  return `${Math.trunc(bytes)} B`;
}

/**
 * Resolve a qualidade normalizada da opção ou a sentinela Desconhecida.
 * @param {object} option
 * @param {string|null} postQuality
 * @returns {string}
 */
function resolveQuality(option, postQuality) {
  return discoverQuality([option.text, option.dn, postQuality]);
}

/**
 * Resolve o idioma normalizado da opção.
 * @param {object} option
 * @param {string|null} postAudio
 * @returns {string|null}
 */
function resolveLanguage(option, postAudio) {
  return languageFromTexts([option.text, option.dn, postAudio]);
}

/**
 * Verifica se um magnet é de episódio avulso.
 * @param {object} option
 * @param {{ season: number, episode: number }} request
 * @returns {{ matches: boolean, episode?: number }|null}
 */
function checkSingleEpisode(option, request) {
  const combined = `${option.text} ${option.dn || ''}`;
  const epMatch = /(?:s0*(\d+)e0*(\d+)|t0*(\d+)e0*(\d+)|(\d+)x0*(\d+)|epis[óo]dio\s*0*(\d+))/i.exec(combined);
  if (!epMatch) return null;
  const epNum = Number(epMatch[2] || epMatch[4] || epMatch[6] || epMatch[7]);
  const sNum = epMatch[1] || epMatch[3] || epMatch[5] ? Number(epMatch[1] || epMatch[3] || epMatch[5]) : null;
  if (sNum !== null && sNum !== request.season) {
    return { matches: false };
  }
  return { matches: epNum === request.episode, episode: epNum };
}

/**
 * Resolve uma opção de stream isolada (filme, episódio avulso ou pacote de temporada).
 * @param {object} option
 * @param {MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @param {string} providerName
 * @param {string|null} postVideoQuality
 * @param {string|null} postAudio
 * @returns {Promise<Stream|null>}
 */
async function resolveOption(option, media, request, providerName, postVideoQuality, postAudio) {
  const quality = resolveQuality(option, postVideoQuality);
  const language = resolveLanguage(option, postAudio);

  const format = {
    template: FORMATTER.AUTO,
    addon: 'Baixar Filmes Via-Torrent',
    title: media.title,
  };
  if (media.year !== null && media.year !== undefined) {
    format.year = media.year;
  }
  if (request.mediaType === 'tv') {
    if (request.season) format.season = request.season;
    if (request.episode) format.episode = request.episode;
  }

  if (request.mediaType === 'movie') {
    if (option.dn) format.filename = option.dn;
    return buildStream({
      url: option.url,
      quality,
      language: language || undefined,
      size: option.size || undefined,
      type: 'magnet',
      format,
    });
  }

  // request.mediaType === 'tv'
  const singleEp = checkSingleEpisode(option, request);
  if (singleEp) {
    if (!singleEp.matches) {
      console.log(`[${providerName}] Opção ${option.hash.slice(0, 8)} descartada por triagem: não é o episódio pedido`);
      return null;
    }
    // Episódio avulso: sai como magnet sem consultar a lista de arquivos
    if (option.dn) format.filename = option.dn;
    return buildStream({
      url: option.url,
      quality,
      language: language || undefined,
      size: option.size || undefined,
      type: 'magnet',
      format,
    });
  }

  // Pacote de temporada: lê arquivos pelo cache itorrents.org
  let files;
  try {
    files = await fetchTorrentFiles(option.hash);
  } catch (error) {
    console.warn(`[${providerName}] Opção pacote ${option.hash.slice(0, 8)} descartada: ${error.message}`);
    return null;
  }

  const fileIndex = findEpisodeFile(files, {
    season: request.season,
    episode: request.episode,
    seasonPack: true,
  });

  if (fileIndex === null) {
    console.log(`[${providerName}] Opção pacote ${option.hash.slice(0, 8)} descartada por triagem: arquivo do episódio ${request.season}x${request.episode} não identificado`);
    return null;
  }

  const file = files.find((f) => f.index === fileIndex);
  if (!file) {
    throw new Error(`índice ${fileIndex} ausente na lista do torrent ${option.hash}`);
  }

  const packSize = Number.isInteger(file.size) && file.size >= 0 ? formatBytes(file.size) : option.size;
  format.filename = file.path;
  if (option.dn) format.folderName = option.dn;
  if (option.size) format.folderSize = option.size;

  return buildStream({
    url: buildTorrentFileUrl(option.hash, file.index),
    quality,
    language: language || undefined,
    size: packSize || undefined,
    type: 'torrent',
    format,
  });
}
