/**
 * Bloco torrent-files: lista os arquivos de um torrent pelo hash e acha o arquivo de um episódio.
 *
 * Um pacote de temporada entregue como magnet faz o app tocar o maior arquivo, que costuma ser outro
 * episódio. O provedor usa este bloco para obter o índice do episódio e montar
 * `torrent://<hash>/<índice>` com `buildTorrentFileUrl` (bloco stream-build).
 *
 * O `.torrent` vem do cache público itorrents.org (aberto, sem conta e sem chave) e é lido
 * no aparelho: `response.arrayBuffer()` e decodificação bencode local, sem `TextDecoder`, que só
 * existe no NuvioMobile.
 *
 * Depende do bloco http (`HEADER_PROFILES`) para os cabeçalhos de navegador.
 */

import { HEADER_PROFILES } from '../http/index.mjs';

const TORRENT_CACHE = 'https://itorrents.org/torrent/';
const HEX_HASH = /^[0-9a-f]{40}$/i;
const VIDEO_EXTENSIONS = ['mkv', 'mp4', 'avi', 'm4v', 'ts', 'webm'];
const SAMPLE_WORDS = /\b(?:sample|amostra)\b/i;

// Temporada e episódio explícitos, com faixa opcional: S02E03, S2E3, S02E01-E02, T02E03, 2x03.
const SEASON_EPISODE_PATTERNS = [
  /\bS(\d{1,2}) ?E(\d{1,3})(?: ?- ?E?(\d{1,3}))?\b/i,
  /\bT(\d{1,2}) ?E(\d{1,3})(?: ?- ?E?(\d{1,3}))?\b/i,
  /\b(\d{1,2})x(\d{1,3})(?: ?- ?(\d{1,3}))?\b/i,
];
// Só episódio, aceito apenas em pacote da temporada pedida: E03, Ep 03, EP03, Episódio 03, Episode 03.
const EPISODE_ONLY_PATTERN = /\b(?:E|EP|Ep\.?|Epis[oó]dio|Episode) ?(\d{1,3})\b/i;
// Número no início do nome seguido de separador: "03 - Título", "3. Título", "03_Título".
const LEADING_NUMBER_PATTERN = /^(\d{1,3}) ?[-._)] ?\S|^(\d{1,3}) \S/;

/**
 * @typedef {object} TorrentFile
 * @property {number} index - Posição do arquivo na lista do torrent, a partir de zero.
 * @property {string} path - Caminho dentro do torrent, com as pastas separadas por "/".
 * @property {number} size - Tamanho em bytes.
 */

/**
 * Lista os arquivos de um torrent, na ordem do `.torrent`, a partir do hash.
 *
 * A ordem devolvida é o índice que o app usa em `torrent://<hash>/<índice>`; ela não segue a ordem
 * dos episódios nem o tamanho dos arquivos.
 *
 * @param {string} infoHash - Hash hexadecimal de 40 caracteres.
 * @returns {Promise<TorrentFile[]>} Arquivos do torrent; um item só em torrent de arquivo único.
 * @throws {Error} Se o hash não for hexadecimal de 40 caracteres, se o cache responder fora de 2xx,
 *   se o runtime não tiver `response.arrayBuffer` ou se o conteúdo não for um `.torrent` com `info`.
 * @example
 * const files = await fetchTorrentFiles('f32eb77f755f0d349271a74e930b1cc4bb37bb49');
 * // [{ index: 0, path: '2 - Grilled.mp4', size: 416945398 }, ...]
 */
export async function fetchTorrentFiles(infoHash) {
  if (typeof infoHash !== 'string' || !HEX_HASH.test(infoHash.trim())) {
    throw new Error(`infoHash deve ser hexadecimal de 40 caracteres (recebido: ${describe(infoHash)})`);
  }
  const url = `${TORRENT_CACHE}${infoHash.trim().toUpperCase()}.torrent`;
  const response = await fetch(url, { headers: { ...HEADER_PROFILES.player } });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  if (typeof response.arrayBuffer !== 'function') {
    throw new Error('response.arrayBuffer indisponível neste runtime');
  }
  return readTorrentFiles(new Uint8Array(await response.arrayBuffer()), url);
}

/**
 * Acha, na lista de arquivos de um torrent, o único arquivo de vídeo do episódio pedido.
 *
 * Considera só vídeos (mkv, mp4, avi, m4v, ts, webm) que não sejam amostras. Aceita temporada e
 * episódio explícitos no nome ou nas pastas (`S02E03`, `S2E3`, `T02E03`, `2x03`, com faixa como
 * `S02E01-E03`), exigindo a temporada pedida. Só com `seasonPack: true` aceita também o número do
 * episódio sozinho (`E03`, `Ep 03`, `Episódio 03`, `Episode 03` ou `03 - Título` no início do nome).
 *
 * @param {TorrentFile[]} files - Saída de `fetchTorrentFiles`.
 * @param {object} target - Episódio pedido.
 * @param {number} target.season - Temporada, inteiro positivo.
 * @param {number} target.episode - Episódio, inteiro positivo.
 * @param {boolean} target.seasonPack - `true` quando a fonte anuncia o torrent como pacote da temporada pedida.
 * @returns {number|null} Índice do arquivo, ou `null` se não houver exatamente um candidato.
 * @throws {Error} Se `files` não for lista de arquivos ou se temporada, episódio ou `seasonPack` forem inválidos.
 * @example
 * findEpisodeFile(files, { season: 2, episode: 3, seasonPack: true });
 * // 12 (arquivo "3 - Bit by a Dead Bee.mp4")
 */
export function findEpisodeFile(files, target) {
  if (!Array.isArray(files)) throw new Error(`files deve ser lista (recebido: ${describe(files)})`);
  const { season, episode, seasonPack } = target || {};
  if (!Number.isInteger(season) || season < 1) throw new Error(`season deve ser inteiro positivo (recebido: ${describe(season)})`);
  if (!Number.isInteger(episode) || episode < 1) throw new Error(`episode deve ser inteiro positivo (recebido: ${describe(episode)})`);
  if (typeof seasonPack !== 'boolean') throw new Error(`seasonPack deve ser booleano (recebido: ${describe(seasonPack)})`);

  const candidates = files.filter((file, position) => {
    if (!file || typeof file.path !== 'string' || !Number.isInteger(file.index)) {
      throw new Error(`files[${position}] deve ter path em texto e index inteiro`);
    }
    return isVideo(file.path) && matchesEpisode(file.path, season, episode, seasonPack);
  });
  return candidates.length === 1 ? candidates[0].index : null;
}

/**
 * Converte o `.torrent` em lista de arquivos.
 * @param {Uint8Array} bytes - Conteúdo do `.torrent`.
 * @param {string} url - Origem, para as mensagens de erro.
 * @returns {TorrentFile[]}
 * @throws {Error} Se o bencode for inválido ou faltar `info`.
 */
function readTorrentFiles(bytes, url) {
  let torrent;
  try {
    torrent = decodeBencode(bytes);
  } catch (error) {
    throw new Error(`.torrent inválido em ${url}: ${error.message}`, { cause: error });
  }
  const info = torrent && torrent.info;
  if (!info || typeof info !== 'object') throw new Error(`.torrent sem "info" em ${url}`);
  const name = info.name ? bytesToText(info.name) : '';
  if (!Array.isArray(info.files)) {
    if (!name || !Number.isInteger(info.length)) throw new Error(`.torrent de arquivo único sem name/length em ${url}`);
    return [{ index: 0, path: name, size: info.length }];
  }
  return info.files.map((file, index) => {
    if (!file || !Array.isArray(file.path) || !Number.isInteger(file.length)) {
      throw new Error(`.torrent com info.files[${index}] sem path/length em ${url}`);
    }
    return { index, path: file.path.map(bytesToText).join('/'), size: file.length };
  });
}

/**
 * Decodifica bencode. Strings ficam como `Uint8Array`; chaves de dicionário viram texto latin1.
 * @param {Uint8Array} bytes
 * @returns {*}
 * @throws {Error} Se o conteúdo estiver truncado ou fora do formato.
 */
function decodeBencode(bytes) {
  let position = 0;
  const ascii = (start, end) => {
    let text = '';
    for (let i = start; i < end; i++) text += String.fromCharCode(bytes[i]);
    return text;
  };
  const indexOf = (byte, from) => {
    for (let i = from; i < bytes.length; i++) if (bytes[i] === byte) return i;
    throw new Error(`fim inesperado na posição ${from}`);
  };
  function parse() {
    if (position >= bytes.length) throw new Error('fim inesperado');
    const byte = bytes[position];
    if (byte === 0x69) { // i<inteiro>e
      const end = indexOf(0x65, position);
      const text = ascii(position + 1, end);
      if (!/^-?\d+$/.test(text)) throw new Error(`inteiro inválido na posição ${position}`);
      position = end + 1;
      return Number(text);
    }
    if (byte === 0x6c) { // l...e
      position++;
      const list = [];
      while (bytes[position] !== 0x65) list.push(parse());
      position++;
      return list;
    }
    if (byte === 0x64) { // d...e
      position++;
      const dict = {};
      while (bytes[position] !== 0x65) {
        const key = parse();
        if (!(key instanceof Uint8Array)) throw new Error('chave de dicionário não é texto');
        dict[latin1(key)] = parse();
      }
      position++;
      return dict;
    }
    if (byte >= 0x30 && byte <= 0x39) { // <tamanho>:<bytes>
      const colon = indexOf(0x3a, position);
      const length = Number(ascii(position, colon));
      if (!Number.isInteger(length) || colon + 1 + length > bytes.length) throw new Error(`texto truncado na posição ${position}`);
      const value = bytes.subarray(colon + 1, colon + 1 + length);
      position = colon + 1 + length;
      return value;
    }
    throw new Error(`byte inesperado ${byte} na posição ${position}`);
  }
  const value = parse();
  if (position !== bytes.length) throw new Error('conteúdo após o fim do bencode');
  return value;
}

/**
 * Texto de um caminho do torrent: UTF-8 quando válido, senão latin1.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToText(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('caminho do torrent não é texto');
  return utf8(bytes) ?? latin1(bytes);
}

/** @param {Uint8Array} bytes @returns {string} */
function latin1(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

/**
 * Decodifica UTF-8 estrito; `null` se a sequência for inválida.
 * @param {Uint8Array} bytes
 * @returns {string|null}
 */
function utf8(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length;) {
    const byte = bytes[i];
    let extra;
    let code;
    if (byte < 0x80) { extra = 0; code = byte; } else if ((byte & 0xe0) === 0xc0) { extra = 1; code = byte & 0x1f; } else if ((byte & 0xf0) === 0xe0) { extra = 2; code = byte & 0x0f; } else if ((byte & 0xf8) === 0xf0) { extra = 3; code = byte & 0x07; } else return null;
    if (i + extra >= bytes.length && extra > 0) return null;
    for (let k = 1; k <= extra; k++) {
      const next = bytes[i + k];
      if ((next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 0x3f);
    }
    if ((extra === 1 && code < 0x80) || (extra === 2 && code < 0x800) || (extra === 3 && (code < 0x10000 || code > 0x10ffff))) return null;
    text += String.fromCodePoint(code);
    i += extra + 1;
  }
  return text;
}

/** @param {string} path @returns {boolean} */
function isVideo(path) {
  const name = path.split('/').pop();
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return VIDEO_EXTENSIONS.includes(extension) && !SAMPLE_WORDS.test(path.replace(/[._]/g, ' '));
}

/**
 * Diz se o caminho identifica o episódio pedido.
 * @param {string} path
 * @param {number} season
 * @param {number} episode
 * @param {boolean} seasonPack
 * @returns {boolean}
 */
function matchesEpisode(path, season, episode, seasonPack) {
  const segments = path.split('/');
  const name = segments[segments.length - 1].replace(/\.[^.]+$/, '');
  const text = segments.slice(0, -1).concat(name).join(' ').replace(/[._]/g, ' ');
  for (const pattern of SEASON_EPISODE_PATTERNS) {
    const match = pattern.exec(name.replace(/[._]/g, ' ')) || pattern.exec(text);
    if (match) {
      const first = Number(match[2]);
      const last = match[3] ? Number(match[3]) : first;
      return Number(match[1]) === season && episode >= first && episode <= last;
    }
  }
  if (!seasonPack) return false;
  const only = EPISODE_ONLY_PATTERN.exec(name.replace(/[._]/g, ' '));
  if (only) return Number(only[1]) === episode;
  const leading = LEADING_NUMBER_PATTERN.exec(name);
  if (leading) return Number(leading[1] || leading[2]) === episode;
  return false;
}

/** @param {*} value @returns {string} */
function describe(value) {
  if (typeof value === 'string') return `"${value}"`;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
