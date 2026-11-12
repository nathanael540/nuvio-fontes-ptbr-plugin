/** Resolução de uma opção HLS ou MP4. Falha lança; triagem sem prova devolve lista vazia. */
import { DEFAULT_USER_AGENT, fetchPage, playbackHeaders } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { UNKNOWN_QUALITY } from '../_blocks/quality-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';

const RANGE = 'bytes=0-65535';
const PROBE_BYTES = 65536;
const DUB_WORDS = new Set(['pt', 'ptbr', 'por', 'portuguese', 'portugues', 'dublado', 'dub', 'dubbed', 'bra', 'brasil', 'brazil', 'brazilian']);
const ORIGINAL_WORDS = new Set(['en', 'eng', 'english', 'original', 'legendado']);
const SUBTITLE_PT = new Set(['pt', 'ptbr', 'por', 'portuguese', 'portugues', 'brasil', 'brazil', 'brazilian', 'legendado', 'legenda', 'leg']);

/**
 * Lê a mídia da opção. Lista vazia significa descarte por triagem (sem tkhd ou sem RESOLUTION).
 * @param {{ url: string, kind: 'hls'|'mp4', noReferrer: boolean, subtitles: object[] }} option
 * @param {string} pageUrl - URL final da página do espelho.
 * @returns {Promise<object[]>} Variantes com url, qualidade, headers e idioma quando houver prova.
 */
export async function resolveOption(option, pageUrl) {
  const headers = optionHeaders(option, pageUrl);
  if (option.kind === 'mp4') {
    const height = await mp4VideoHeight(option.url, headers);
    const quality = height ?? UNKNOWN_QUALITY;
    return [{ url: option.url, quality, headers }];
  }
  const playlist = await fetchPlaylist(option.url, headers);
  const variants = hlsVariants(playlist, option.subtitles);
  if (!variants.length) {
    return [{ url: option.url, quality: UNKNOWN_QUALITY, headers }];
  }
  return variants.map((variant) => ({ ...variant, headers }));
}

/** Uqload e MP4 ficam sem Referer. HLS interno usa a página que respondeu. */
export function optionHeaders(option, pageUrl) {
  const host = new URL(option.url).hostname;
  if (option.noReferrer || /uqload/i.test(host) || option.kind === 'mp4') {
    return { 'User-Agent': DEFAULT_USER_AGENT };
  }
  return playbackHeaders(pageUrl);
}

async function fetchPlaylist(url, headers) {
  const page = await fetchPage(url, { profile: 'player', headers });
  if (!/^#EXTM3U(?:\r?\n|$)/.test(page.text.trim())) throw new Error('Resposta não é playlist HLS');
  return page;
}

async function mp4VideoHeight(url, headers) {
  const response = await fetch(url, { headers: { ...headers, Range: RANGE } });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  if (typeof response.arrayBuffer !== 'function') {
    throw new Error('response.arrayBuffer indisponível neste runtime');
  }
  return readMp4VideoHeight(await response.arrayBuffer());
}

/** Altura da primeira faixa de vídeo nos primeiros 64 KB, ou `null` se o tkhd não estiver lá. */
export function readMp4VideoHeight(buffer) {
  if (!buffer || typeof buffer.byteLength !== 'number') throw new Error('MP4 sem ArrayBuffer');
  const length = Math.min(buffer.byteLength, PROBE_BYTES);
  const view = new DataView(buffer, 0, length);
  const moov = findBox(view, 0, length, 'moov');
  if (!moov) return null;
  let offset = moov.start;
  while (offset + 8 <= moov.end) {
    const box = readBox(view, offset, moov.end);
    if (!box) break;
    if (box.type === 'trak') {
      const tkhd = findBox(view, box.start, box.end, 'tkhd');
      if (tkhd) {
        const height = tkhdHeight(view, tkhd);
        if (height) return height;
      }
    }
    offset = box.next;
  }
  return null;
}

function readBox(view, offset, limit) {
  if (offset + 8 > limit) return null;
  const size32 = view.getUint32(offset);
  const type = boxType(view, offset + 4);
  let header = 8;
  let size = size32;
  if (size32 === 1) {
    if (offset + 16 > limit) return null;
    if (view.getUint32(offset + 8) !== 0) return null;
    size = view.getUint32(offset + 12);
    header = 16;
  } else if (size32 === 0) {
    size = limit - offset;
  }
  if (size < header) throw new Error('Caixa MP4 inválida');
  const end = Math.min(offset + size, limit);
  return { type, start: offset + header, end, next: end };
}

function findBox(view, start, end, type) {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBox(view, offset, end);
    if (!box) return null;
    if (box.type === type) return box;
    if (box.next <= offset) return null;
    offset = box.next;
  }
  return null;
}

function boxType(view, offset) {
  let type = '';
  for (let index = 0; index < 4; index++) type += String.fromCharCode(view.getUint8(offset + index));
  return type;
}

/** Largura no offset 76 (versão 0) ou 88 (versão 1) a partir de version/flags. Altura em seguida. */
function tkhdHeight(view, box) {
  if (box.start >= view.byteLength) return null;
  const version = view.getUint8(box.start);
  const widthAt = version === 0 ? 76 : version === 1 ? 88 : null;
  if (widthAt == null) throw new Error(`tkhd com versão não suportada: ${version}`);
  const heightOffset = box.start + widthAt + 4;
  if (heightOffset + 4 > view.byteLength || heightOffset + 4 > box.end) return null;
  const width = view.getUint32(box.start + widthAt) >>> 16;
  const height = view.getUint32(heightOffset) >>> 16;
  if (!width || !height) return null;
  return height;
}

/** Uma entrada por `#EXT-X-STREAM-INF` com RESOLUTION. Sem nenhuma, devolve `[]`. */
export function hlsVariants(playlist, subtitles) {
  const lines = playlist.text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== '#EXTM3U') throw new Error('Cabeçalho HLS inválido');
  const renditions = lines
    .filter((line) => line.startsWith('#EXT-X-MEDIA:'))
    .map((line) => attributes(line.slice(line.indexOf(':') + 1)))
    .filter((item) => item.TYPE === 'AUDIO');
  const entries = [];
  for (let index = 1; index < lines.length; index++) {
    if (!lines[index].startsWith('#EXT-X-STREAM-INF:')) continue;
    const info = attributes(lines[index].slice(lines[index].indexOf(':') + 1));
    const uri = lines[index + 1];
    if (!uri || uri.startsWith('#')) throw new Error('Variante HLS sem URI');
    index += 1;
    entries.push({
      resolution: /^(\d+)x([1-9]\d{2,3})$/.exec(info.RESOLUTION || ''),
      url: mediaUrl(uri, playlist.url),
      audio: info.AUDIO,
    });
  }
  const valid = entries.filter((entry) => entry.resolution && Number(entry.resolution[1]) >= 1);
  if (!valid.length) return [];
  if (valid.length !== entries.length) throw new Error('Variante HLS sem RESOLUTION válida');
  return valid.map((entry) => {
    const related = entry.audio ? renditions.filter((item) => item['GROUP-ID'] === entry.audio) : renditions;
    if (entry.audio && !related.length) throw new Error('Grupo HLS AUDIO ausente');
    const language = classifyLanguage(related, subtitles);
    return {
      url: entry.url,
      quality: Number(entry.resolution[2]),
      ...(language ? { language } : {}),
    };
  });
}

function classifyLanguage(renditions, subtitles) {
  let dub = false;
  let original = false;
  for (const rendition of renditions) {
    const words = wordsOf(`${rendition.NAME || ''} ${rendition.LANGUAGE || ''}`);
    if (words.some((word) => DUB_WORDS.has(word))) dub = true;
    if (words.some((word) => ORIGINAL_WORDS.has(word))) original = true;
  }
  if (dub) return LANGUAGE.DUBBED;
  if (original && (subtitles || []).some((subtitle) => wordsOf(`${subtitle.language} ${subtitle.name || ''}`).some((word) => SUBTITLE_PT.has(word)))) {
    return LANGUAGE.SUBTITLED;
  }
  return null;
}

function wordsOf(value) {
  return normalizeText(value).split(' ').filter(Boolean);
}

function mediaUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('URL de mídia ausente');
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de mídia não é HTTP(S)');
  return url.href;
}

/** Lista de atributos HLS: vírgulas dentro de aspas pertencem ao valor. */
function attributes(text) {
  const result = {};
  let position = 0;
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]+)(?:,|$)/g;
  for (const match of text.matchAll(pattern)) {
    if (match.index !== position || Object.prototype.hasOwnProperty.call(result, match[1])) {
      throw new Error('Atributos HLS inválidos');
    }
    position += match[0].length;
    result[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  if (position !== text.length) throw new Error('Atributos HLS inválidos');
  return result;
}
