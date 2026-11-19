/**
 * Resolvedores de player do TopAnimes.
 *
 * Cada opção é independente: a função devolve as mídias publicadas pelo host ou lista vazia
 * quando o player está desativado/sem fonte. Host fora do contrato é triagem, não falha.
 *
 * Cadeias observadas em 19/11/2026:
 * 1. `*.booonceivu.shop` com `mode=to-salvando-seu-ip` devolve JSON de mídias HLS e legendas VTT;
 *    o mesmo host pode devolver HTML com `jwplayer(...).setup({sources})` e MP4 assinado.
 * 2. `topanimes.net/antivirusN/...` devolve HTML de jwplayer com HLS assinado; o `/antivirus2`
 *    exige `Referer` de `topanimes.net` na reprodução.
 * 3. `blogger.com/video.g` publica `streamingData.formats`; o bloco `blogger-video` lê os MP4.
 * 4. `litch.alibabacdn.net` (KojimaCDN) publica `file` vazio e um aviso de player desativado.
 * 5. `csst.online`, `fsst.online` e `incvideo*.online` (Ruplay) redirecionam para um HTML com
 *    `new Playerjs({file:"[360p]https://.../get_file/..."})`; o MP4 responde sem cabeçalho ou com
 *    `Referer` da origem final, e responde 403 com `Referer` de `topanimes.net`.
 * 6. `filemoon.*` (Byse) responde `api/videos/<código>` com `playback` em AES-256-GCM, decifrado
 *    localmente em `byse.js` para ler `sources` HLS e `tracks`.
 */

import { extractBloggerFormats } from '../_blocks/blogger-video/index.mjs';
import { DEFAULT_USER_AGENT, fetchJson, fetchPage, fetchText } from '../_blocks/http/index.mjs';
import { normalizeQuality } from '../_blocks/quality-discovery/index.mjs';
import { decryptPlayback } from './byse.js';

const SOURCE_URL = 'https://topanimes.net';
const SOURCE_HOST = 'topanimes.net';
const BOOONCEIVU_SUFFIX = '.booonceivu.shop';
const ANTIVIRUS_PATH = /^\/antivirus\d+\//;
const RUPLAY_HOST = /^(?:csst\.online|fsst\.online|incvideo\d+\.online)$/;
const FILEMOON_HOST = /^filemoon\.[a-z]{2,}$/;
const MODE = 'to-salvando-seu-ip';
const PLAYBACK_HEADERS = Object.freeze({ 'User-Agent': DEFAULT_USER_AGENT, Referer: `${SOURCE_URL}/` });
const BOOONCEIVU_QUALITY = Object.freeze({ SD: '1080p', LD: '720p', FD: '360p' });

/**
 * @typedef {object} PlayerOption
 * @property {number} number - Valor numérico de `data-nume`.
 * @property {string} label - Rótulo da opção.
 * @property {string} url - URL absoluta do iframe.
 */

/**
 * @typedef {object} Media
 * @property {string} url - URL HTTP(S) da mídia.
 * @property {string} [type] - `hls` ou `mp4`.
 * @property {string} [quality] - Qualidade normalizada.
 * @property {string} provider - Rótulo da opção.
 * @property {Object<string, string>} [headers] - Cabeçalhos de reprodução.
 * @property {Array<{ url: string, language: string }>} [subtitles] - Legendas externas.
 */

/**
 * Resolve uma opção de player em isolamento.
 * @param {PlayerOption} option - Opção lida da página.
 * @param {string} pageUrl - URL final da ficha ou do episódio, usada como contexto.
 * @returns {Promise<Media[]>} Mídias publicadas; vazio em triagem ou player desativado.
 * @throws {Error} Em resposta não-2xx, JSON/HTML estruturalmente inválido ou URL insegura.
 * @example
 * const medias = await resolveOption({ number: 1, label: 'Vidstreaming', url: 'https://sk-boyceta.booonceivu.shop/?id=...' }, 'https://topanimes.net/episodio/x/');
 */
export async function resolveOption(option, pageUrl) {
  const url = new URL(option.url);
  const host = url.hostname.toLowerCase();

  if (host === SOURCE_HOST) {
    if (url.pathname.startsWith('/off/')) return [];
    if (url.pathname.startsWith('/aviso/')) {
      const nested = url.searchParams.get('url');
      if (typeof nested !== 'string' || nested.trim() === '') {
        throw new Error('Aviso sem o parâmetro url');
      }
      return resolveNested(nested, option.label);
    }
    if (ANTIVIRUS_PATH.test(url.pathname)) return resolveJwplayer(url.href, option.label, PLAYBACK_HEADERS);
    return [];
  }

  if (isBooonceivu(host)) return resolveBooonceivu(url.href, option.label, pageUrl);
  if (isBlogger(host)) return resolveBlogger(url.href, option.label);
  if (isRuplay(host)) return resolveRuplay(url.href, option.label);
  if (isFilemoon(host)) return resolveFilemoon(url.href, option.label);
  if (host === 'litch.alibabacdn.net') return resolveJwplayer(url.href, option.label, undefined);
  return [];
}

/**
 * Resolve a URL interna de `/aviso/?url=`.
 * @param {string} raw - URL aninhada já decodificada.
 * @param {string} label - Rótulo da opção.
 * @returns {Promise<Media[]>} Mídias da URL aninhada; vazio quando o host é triagem.
 * @throws {Error} Se a URL não for válida ou o player não puder ser lido.
 */
async function resolveNested(raw, label) {
  const url = new URL(stripPosterSuffix(raw));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];
  const host = url.hostname.toLowerCase();
  if (isBooonceivu(host)) return resolveBooonceivu(url.href, label, `${SOURCE_URL}/`);
  if (isBlogger(host)) return resolveBlogger(url.href, label);
  if (isRuplay(host)) return resolveRuplay(url.href, label);
  if (isFilemoon(host)) return resolveFilemoon(url.href, label);
  if (host === 'litch.alibabacdn.net') return resolveJwplayer(url.href, label, undefined);
  return [];
}

/**
 * Resolve o player Booonceivu, que pode responder JSON ou HTML de jwplayer.
 * @param {string} url - URL do iframe.
 * @param {string} label - Rótulo da opção.
 * @param {string} pageUrl - Página de origem, usada como `Referer` na descoberta.
 * @returns {Promise<Media[]>} Mídias HLS/MP4 com legendas quando publicadas.
 * @throws {Error} Em HTTP não-2xx, JSON sem `status`/`midias` ou HTML de jwplayer inválido.
 */
async function resolveBooonceivu(url, label, pageUrl) {
  const requestUrl = addMode(url);
  const text = await fetchText(requestUrl, {
    profile: 'page',
    headers: { Referer: pageUrl || `${SOURCE_URL}/` },
  });
  const data = tryJson(text);

  if (data !== null && typeof data === 'object' && !Array.isArray(data) && typeof data.status === 'string') {
    if (data.status !== 'success') return [];
    if (!Array.isArray(data.midias)) throw new Error('Booonceivu sem a lista midias');
    const subtitles = readSubtitles(data.legendas);
    return data.midias.map((item) => {
      if (item === null || typeof item !== 'object' || typeof item.url !== 'string') {
        throw new Error('Booonceivu com mídia sem url');
      }
      const mediaUrl = httpUrl(item.url, 'Booonceivu midia');
      return {
        url: mediaUrl,
        type: mediaType(mediaUrl, 'hls'),
        quality: booonceivuQuality(item.qualidade),
        provider: label,
        subtitles,
      };
    });
  }

  const sources = readJwplayerSources(text);
  return sources.map((source) => ({ ...source, provider: label }));
}

/**
 * Resolve um HTML de jwplayer (`sources`) em mídias.
 * @param {string} url - URL do player.
 * @param {string} label - Rótulo da opção.
 * @param {Object<string, string>|undefined} headers - Cabeçalhos de reprodução, quando exigidos.
 * @returns {Promise<Media[]>} Mídias publicadas; vazio quando o player está desativado.
 * @throws {Error} Em HTTP não-2xx ou `sources` malformado.
 */
async function resolveJwplayer(url, label, headers) {
  const text = await fetchText(url, { profile: 'page' });
  return readJwplayerSources(text).map((source) => ({ ...source, provider: label, headers }));
}

/**
 * Resolve o player do Blogger em MP4 progressivos.
 * @param {string} url - URL `blogger.com/video.g`.
 * @param {string} label - Rótulo da opção.
 * @returns {Promise<Media[]>} Um MP4 por formato progressivo.
 * @throws {Error} Em HTTP não-2xx ou HTML sem `streamingData.formats`.
 */
async function resolveBlogger(url, label) {
  const text = await fetchText(url, { profile: 'page' });
  return extractBloggerFormats(text).map((format) => ({
    url: format.url,
    type: 'mp4',
    quality: qualityFromLabel(format.qualityLabel),
    provider: label,
    headers: { 'User-Agent': DEFAULT_USER_AGENT },
  }));
}

/**
 * Resolve um embed Ruplay/IncVideo até os MP4 publicados no `Playerjs`.
 * @param {string} url - URL do embed (`csst.online`, `fsst.online` ou `incvideo*.online`).
 * @param {string} label - Rótulo da opção.
 * @returns {Promise<Media[]>} Um MP4 por qualidade publicada.
 * @throws {Error} Em HTTP não-2xx, HTML sem `Playerjs/file` ou `file` sem URL `/get_file/`.
 */
async function resolveRuplay(url, label) {
  const embed = await fetchPage(url, { profile: 'page' });
  const file = readPlayerjsFile(embed.text);
  if (file === null) throw new Error('Embed Ruplay sem Playerjs/file');
  const sources = parsePlayerjsSources(file);
  if (sources.length === 0) throw new Error('Playerjs sem URL /get_file/');

  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    Referer: `${new URL(embed.url).origin}/`,
  };
  return sources.map((source) => ({
    url: source.url,
    type: 'mp4',
    quality: source.quality,
    provider: label,
    headers,
  }));
}

/**
 * Resolve um embed Filemoon/Byse decifrando o `playback` da API local.
 * @param {string} url - URL do embed (`filemoon.*` com `/e/<código>`).
 * @param {string} label - Rótulo da opção.
 * @returns {Promise<Media[]>} Fontes HLS/MP4 com qualidade, legendas e sem cabeçalhos de reprodução.
 * @throws {Error} Em HTTP não-2xx, URL sem código, JSON sem `playback`, decifragem inválida ou fonte sem URL.
 */
async function resolveFilemoon(url, label) {
  const parsed = new URL(url);
  const code = readFilemoonCode(parsed);
  const data = await fetchJson(`${parsed.origin}/api/videos/${encodeURIComponent(code)}/`, {
    profile: 'api',
    headers: { Referer: url, Accept: 'application/json' },
  });
  if (data === null || typeof data !== 'object' || data.playback === undefined) {
    throw new Error('Filemoon sem playback na resposta');
  }

  const playback = decryptPlayback(data.playback);
  if (!Array.isArray(playback.sources) || playback.sources.length === 0) {
    throw new Error('Playback do Filemoon sem fontes');
  }

  const subtitles = readPlaybackSubtitles(playback.tracks);
  const medias = [];
  for (const source of playback.sources) {
    if (source === null || typeof source !== 'object' || typeof source.url !== 'string') {
      throw new Error('Fonte do Filemoon sem url');
    }
    const mediaUrl = httpUrl(source.url, 'Fonte do Filemoon');
    const type = mediaType(mediaUrl, source.mime_type);
    if (type === undefined) continue;

    const media = { url: mediaUrl, type, provider: label };
    const quality = Number.isInteger(source.height) && source.height > 0
      ? source.height
      : qualityFromLabel(source.label);
    if (quality !== undefined) media.quality = quality;
    if (subtitles !== undefined) media.subtitles = subtitles;
    medias.push(media);
  }
  return medias;
}

/**
 * Lê o campo `file` do primeiro objeto `new Playerjs({...})` do HTML.
 * @param {string} html - HTML do embed.
 * @returns {string|null} Valor bruto de `file` ou null quando o player não existe.
 */
function readPlayerjsFile(html) {
  const match = /new\s+Playerjs\s*\(\s*\{[\s\S]*?\bfile\s*:\s*(["'])([\s\S]*?)\1/.exec(html);
  return match === null ? null : match[2];
}

/**
 * Extrai as URLs `/get_file/` e a qualidade de cada uma do campo `file` do Playerjs.
 * @param {string} file - Valor bruto do campo `file`.
 * @returns {Array<{ url: string, quality: string|undefined }>} Fontes na ordem publicada, sem repetição.
 * @throws {Error} Se uma URL `/get_file/` não for HTTP(S) válida.
 * @example
 * parsePlayerjsSources('[360p]https://cdn/get_file/a.mp4/,[720p]https://cdn/get_file/b.mp4/');
 * // [{ url: 'https://cdn/get_file/a.mp4/', quality: '360p' }, ...]
 */
function parsePlayerjsSources(file) {
  const sources = [];
  const seen = new Set();
  const pattern = /(?:\[([^\]]+)\])?\s*(https?:\/\/[^,\s"']+)/g;
  let match;
  while ((match = pattern.exec(file)) !== null) {
    if (!match[2].includes('/get_file/') || seen.has(match[2])) continue;
    const url = httpUrl(match[2], 'Playerjs file');
    seen.add(match[2]);
    sources.push({ url, quality: qualityFromLabel(match[1]) });
  }
  return sources;
}

/**
 * Lê o código do embed Filemoon a partir da rota `/e/<código>`.
 * @param {URL} url - URL do embed.
 * @returns {string} Código publicado.
 * @throws {Error} Se a rota não tiver um código alfanumérico.
 */
function readFilemoonCode(url) {
  const segments = url.pathname.split('/').filter(Boolean);
  const code = segments[0] === 'e' ? segments[1] : null;
  if (typeof code !== 'string' || !/^[a-z0-9]+$/i.test(code)) {
    throw new Error('Filemoon sem código na URL');
  }
  return code;
}

/**
 * Lê as legendas válidas do `playback` do Filemoon, ignorando faixas sem idioma ou URL.
 * @param {*} raw - Valor de `tracks`.
 * @returns {Array<{ url: string, language: string, name?: string }>|undefined} Legendas; undefined sem faixas.
 * @throws {Error} Se `tracks` existir fora de lista.
 */
function readPlaybackSubtitles(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new Error('tracks do Filemoon fora de lista');

  const subtitles = [];
  for (const track of raw) {
    if (track === null || typeof track !== 'object') continue;
    if (typeof track.language !== 'string' || track.language.trim() === '') continue;
    let url;
    try {
      url = httpUrl(track.url, 'Legenda do Filemoon');
    } catch {
      continue;
    }
    const subtitle = { url, language: track.language.trim() };
    if (typeof track.title === 'string' && track.title.trim() !== '') subtitle.name = track.title.trim();
    subtitles.push(subtitle);
  }
  return subtitles.length > 0 ? subtitles : undefined;
}

/**
 * Remove o sufixo malformado `&poster=` que a fonte concatena sem `?`.
 * @param {string} raw - URL aninhada já decodificada.
 * @returns {string} URL sem o sufixo quando ele não faz parte de uma query válida.
 * @example
 * stripPosterSuffix('https://csst.online/embed/805424&poster=https://img/x.jpg');
 * // 'https://csst.online/embed/805424'
 */
function stripPosterSuffix(raw) {
  const marker = raw.indexOf('&poster=');
  if (marker === -1) return raw;
  const query = raw.indexOf('?');
  if (query !== -1 && query < marker) return raw;
  return raw.slice(0, marker);
}

/**
 * Lê o array `sources` de um HTML de jwplayer.
 * @param {string} html - HTML do player.
 * @returns {Array<{ url: string, type: string|undefined, quality: string|undefined }>} Fontes com arquivo válido.
 * @throws {Error} Se o array não fechar, não for JSON válido ou uma fonte tiver URL insegura.
 */
function readJwplayerSources(html) {
  const match = /(?:^|[^\w$])sources\s*[:=]\s*\[/.exec(html);
  if (!match) return [];
  const start = match.index + match[0].length - 1;
  const end = findClosingBracket(html, start);
  if (end === -1) throw new Error('jwplayer sources sem fechamento');

  let raw;
  try {
    raw = JSON.parse(html.slice(start, end + 1));
  } catch (error) {
    throw new Error(`jwplayer sources inválido: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(raw)) throw new Error('jwplayer sources não é lista');

  const sources = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const file = typeof item.file === 'string' ? item.file.trim() : '';
    if (file === '') continue;
    const url = httpUrl(file, 'jwplayer file');
    sources.push({
      url,
      type: mediaType(url, item.type),
      quality: qualityFromLabel(item.label),
    });
  }
  return sources;
}

/**
 * Lê legendas do JSON do Booonceivu, ignorando itens sem URL ou rótulo válidos.
 * @param {*} raw - Valor de `legendas`.
 * @returns {Array<{ url: string, language: string }>|undefined} Legendas únicas; undefined quando a chave não existe.
 * @throws {Error} Se `legendas` existir fora de lista.
 */
function readSubtitles(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new Error('Booonceivu com legendas fora de lista');

  const subtitles = [];
  const seen = new Set();
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (label === '' || typeof item.url !== 'string') continue;
    let url;
    try {
      url = httpUrl(item.url, 'Booonceivu legenda');
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    subtitles.push({ url, language: label });
  }
  return subtitles;
}

/**
 * Qualidade do Booonceivu: SD/LD/FD seguem o mapa do próprio player; o restante usa o rótulo.
 * @param {*} value - Valor de `qualidade`.
 * @returns {string|undefined} Qualidade normalizada ou undefined.
 */
function booonceivuQuality(value) {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (BOOONCEIVU_QUALITY[text] !== undefined) return BOOONCEIVU_QUALITY[text];
  return qualityFromLabel(value);
}

/**
 * Converte um rótulo de qualidade em texto normalizado, sem lançar erro.
 * @param {*} value - Rótulo publicado.
 * @returns {string|undefined} Qualidade ou undefined quando não reconhecida.
 */
function qualityFromLabel(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return undefined;
  try {
    return normalizeQuality(text);
  } catch {
    return undefined;
  }
}

/**
 * Tipo da mídia pelo campo declarado ou pela extensão.
 * @param {string} url - URL da mídia.
 * @param {*} declared - Valor de `type` do player.
 * @returns {string|undefined} `hls`, `mp4` ou undefined.
 */
function mediaType(url, declared) {
  const type = typeof declared === 'string' ? declared.toLowerCase() : '';
  if (type.includes('mpegurl') || type.includes('hls') || /\.m3u8(?:$|[?#])/i.test(url)) return 'hls';
  if (type.includes('mp4') || /\.mp4(?:$|[?#])/i.test(url)) return 'mp4';
  return undefined;
}

/**
 * Acrescenta `mode=to-salvando-seu-ip` sem usar `searchParams.set`, que não atualiza `href` no app.
 * @param {string} url - URL do iframe.
 * @returns {string} URL com o parâmetro.
 */
function addMode(url) {
  if (/[?&]mode=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}mode=${MODE}`;
}

/**
 * Tenta interpretar o texto como JSON.
 * @param {string} text - Corpo da resposta.
 * @returns {*} Valor interpretado ou null quando não é JSON.
 */
function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Valida uma URL HTTP(S).
 * @param {string} value - Endereço.
 * @param {string} label - Nome do campo nas mensagens.
 * @returns {string} URL normalizada.
 * @throws {Error} Se não for URL HTTP(S).
 */
function httpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`${label} inválida: "${value}"`, { cause: error });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} não é HTTP(S): "${value}"`);
  }
  return url.href;
}

/**
 * Índice do `]` que fecha o `[` em `start`, ignorando strings.
 * @param {string} text - Texto completo.
 * @param {number} start - Índice do `[`.
 * @returns {number} Índice do fechamento ou -1.
 */
function findClosingBracket(text, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Indica se o host pertence à família Booonceivu.
 * @param {string} host - Hostname em minúsculas.
 * @returns {boolean}
 */
function isBooonceivu(host) {
  return host === 'booonceivu.shop' || host.endsWith(BOOONCEIVU_SUFFIX);
}

/**
 * Indica se o host é o Blogger.
 * @param {string} host - Hostname em minúsculas.
 * @returns {boolean}
 */
function isBlogger(host) {
  return host === 'blogger.com' || host.endsWith('.blogger.com');
}

/**
 * Indica se o host pertence à família Ruplay/IncVideo.
 * @param {string} host - Hostname em minúsculas.
 * @returns {boolean}
 */
function isRuplay(host) {
  return RUPLAY_HOST.test(bareHost(host));
}

/**
 * Indica se o host pertence à família Filemoon/Byse.
 * @param {string} host - Hostname em minúsculas.
 * @returns {boolean}
 */
function isFilemoon(host) {
  return FILEMOON_HOST.test(bareHost(host));
}

/**
 * Remove o prefixo `www.` para comparar o domínio registrado.
 * @param {string} host - Hostname em minúsculas.
 * @returns {string} Hostname sem `www.`.
 */
function bareHost(host) {
  return host.startsWith('www.') ? host.slice(4) : host;
}
