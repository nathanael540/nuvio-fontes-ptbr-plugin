/**
 * Leitura das linhas de episódio do Super Animes (AnimesTVS).
 *
 * Cada linha publica `anime` (o mesmo título do catálogo, com sufixo de áudio), `episodio`
 * (`Episódio NNN` ou `Filme`) e `link_video` (MP4 no CDN da fonte). A qualidade não é declarada
 * em campo próprio; o diretório do CDN (`fullhd`, `hd3`, `hd2`, `iphoneb`) é a única evidência
 * local, e `like`/`thunder3` não identificam resolução.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import { cleanTitle, describe, isPlainObject } from './text.js';

const EPISODE_LABEL = /Epis[oó]dio\s+0*(\d+)/i;
const BARE_NUMBER = /^0*(\d+)$/;
const MOVIE_LABEL = 'filme';

/**
 * Lê o número do episódio publicado no rótulo.
 * @param {*} label - Valor de `episodio`.
 * @returns {number|null} Número do episódio, 1 para `Filme`, ou null quando não identificado.
 * @example
 * readEpisodeNumber('Episódio 008'); // 8
 * readEpisodeNumber('Filme'); // 1
 */
export function readEpisodeNumber(label) {
  if (typeof label !== 'string') return null;
  const text = label.trim();
  const match = EPISODE_LABEL.exec(text);
  if (match !== null) return Number(match[1]);
  if (normalizeText(text) === MOVIE_LABEL) return 1;
  const bare = BARE_NUMBER.exec(text);
  return bare === null ? null : Number(bare[1]);
}

/**
 * Seleciona as linhas do episódio de uma entrada.
 * @param {object[]} list - Lista completa de episódios do áudio.
 * @param {string} entryTitle - Título da entrada no catálogo.
 * @param {number} episode - Episódio local pedido.
 * @returns {Array<{ url: string, quality: string|null }>} Linhas encontradas, na ordem da fonte.
 * @throws {Error} Se uma linha correspondente tiver `link_video` fora de HTTP(S).
 * @example
 * selectEpisodeRows(rows, 'Kimetsu no Yaiba (Dublado)', 1);
 * // [{ url: 'https://cdn.../1.mp4', quality: '1080p' }]
 */
export function selectEpisodeRows(list, entryTitle, episode) {
  const target = normalizeText(cleanTitle(entryTitle));
  const found = [];
  for (const row of list) {
    if (!isPlainObject(row) || typeof row.anime !== 'string') continue;
    if (normalizeText(cleanTitle(row.anime)) !== target) continue;
    if (readEpisodeNumber(row.episodio) !== episode) continue;
    const url = readVideoUrl(row.link_video);
    found.push({ url, quality: qualityFromVideoUrl(url) });
  }
  return found;
}

/**
 * Valida o endereço de vídeo publicado.
 * @param {*} value - Valor de `link_video`.
 * @returns {string} URL HTTP(S) normalizada.
 * @throws {Error} Se o valor não for uma URL HTTP(S) válida.
 */
function readVideoUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`linha de episódio com link_video inválido (recebido: ${describe(value)})`);
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('linha de episódio com link_video inválido (não é URL)');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`linha de episódio com link_video fora de HTTP(S) (recebido: ${parsed.protocol})`);
  }
  return parsed.href;
}

/**
 * Deriva a qualidade do diretório do CDN.
 *
 * A resolução foi conferida nos arquivos publicados: `fullhd` e `like` entregaram 1920x1080,
 * `hd3` entregou 1280x720, `hd2` entregou 960x720 e `iphoneb` entregou 560x420. `like` e
 * `thunder3` são servidores/origens e não identificam resolução, então ficam desconhecidos.
 *
 * @param {string} url - URL HTTP(S) do vídeo.
 * @returns {string|null} Qualidade normalizada ou null quando o diretório não a identifica.
 * @example
 * qualityFromVideoUrl('https://cdn.exemplo/dublados/fullhd/1.mp4'); // '1080p'
 */
export function qualityFromVideoUrl(url) {
  const match = /\/(?:dublados|legendados)\/([^/]+)\//i.exec(new URL(url).pathname);
  if (match === null) return null;
  const bucket = match[1].toLowerCase();
  if (bucket === 'fullhd') return '1080p';
  if (bucket === 'hd3' || bucket === 'hd2') return '720p';
  if (bucket === 'iphoneb') return '420p';
  return null;
}
