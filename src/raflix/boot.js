/** Boot JSON do VidRift: faixas Orion, token de reprodução e legenda PT. */
import { fetchJson, fetchText, playbackHeaders } from '../_blocks/http/index.mjs';
import { isPlainObject, optionalText, readHttpUrl, readText } from './shared.js';

const PT_BR_TRACK = 'brazilian portuguese';
const ORIGINAL_TRACK = 'original';
const PT_LANG = 'pt';
const SUBTITLE_LANGUAGE = 'Português';

/**
 * Consulta o boot do VidRift e valida os campos usados pelo provedor.
 *
 * Título ainda não lançado, em cartaz ou com episódio por estrear é ausência reconhecida.
 * `meta.orionStreams` deve ser lista ou null; cada faixa é normalizada com URL absoluta,
 * tipo em minúsculas, altura máxima de `rungs` e legenda resolvida contra a origem.
 *
 * @param {string} origin - Origem publicada pelo Raflix, ex.: "https://embed.vidrift.in".
 * @param {string} path - Caminho do embed, ex.: "movie/550" ou "tv/100088/1/1".
 * @returns {Promise<{ absent: boolean, playbackToken?: string, tracks?: object[] }>} Boot validado.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx, JSON inválido ou estrutura inesperada.
 * @example
 * const boot = await loadBoot('https://embed.vidrift.in', 'movie/550');
 * // { absent: false, playbackToken: '...', tracks: [...] }
 */
export async function loadBoot(origin, path) {
  const url = `${origin}/api/boot/${path}`;
  const body = await fetchJson(url, { profile: 'api', headers: { Referer: `${origin}/` } });
  if (!isPlainObject(body) || !isPlainObject(body.meta)) {
    throw new Error(`Boot do VidRift sem "meta" em ${url}`);
  }
  const meta = body.meta;
  if (meta.unreleased || meta.inCinemas || meta.airsSoon) return { absent: true };
  if (meta.orionStreams !== null && !Array.isArray(meta.orionStreams)) {
    throw new Error('Boot do VidRift com "meta.orionStreams" inválido');
  }
  const playbackToken = readText(meta.playbackToken, 'meta.playbackToken');
  return {
    absent: false,
    playbackToken,
    tracks: (meta.orionStreams || []).map((item, index) => readTrack(item, index, origin)),
  };
}

/**
 * Seleciona a faixa de áudio dublado PT-BR anunciada pela Orion.
 * @param {object[]} tracks - Faixas normalizadas do boot.
 * @returns {object|null} Faixa HLS "Brazilian Portuguese" ou null.
 */
export function selectDubladoTrack(tracks) {
  return tracks.find((track) => track.type === 'hls' && track.name.toLowerCase().includes(PT_BR_TRACK)) || null;
}

/**
 * Seleciona a faixa Original da Orion, usada para localizar a legenda PT.
 * @param {object[]} tracks - Faixas normalizadas do boot.
 * @returns {object|null} Faixa "Original" ou null.
 */
export function selectOriginalTrack(tracks) {
  return tracks.find((track) => track.name.toLowerCase().includes(ORIGINAL_TRACK)) || null;
}

/**
 * Lê a primeira legenda de idioma `pt` da lista da faixa Original ou, na falta dela,
 * confirma a legenda genérica em `/api/subtitles/<caminho>/Portuguese`.
 *
 * A legenda da Orion exige `Referer` e `User-Agent`; a genérica não recebe cabeçalhos.
 * HTTP 404 da legenda genérica é ausência; outras falhas ficam registradas em `failures`
 * para que a opção de legenda seja descartada sem derrubar um stream dublado.
 *
 * @param {object} [options] - Dados da consulta.
 * @param {object|null} [options.track] - Faixa Original normalizada, quando existir.
 * @param {string} options.origin - Origem do VidRift.
 * @param {string} options.path - Caminho do embed.
 * @returns {Promise<{ subtitle: object|null, failures: string[] }>} Legenda PT e falhas da opção.
 * @example
 * const { subtitle } = await readPtSubtitle({ origin: 'https://embed.vidrift.in', path: 'movie/550' });
 */
export async function readPtSubtitle({ track, origin, path }) {
  const failures = [];
  if (track && track.subtitleListUrl) {
    try {
      const body = await fetchJson(track.subtitleListUrl, {
        profile: 'api',
        headers: { Referer: `${origin}/` },
      });
      if (!isPlainObject(body) || !Array.isArray(body.tracks)) {
        throw new Error('Lista de legendas do VidRift sem "tracks"');
      }
      const pt = body.tracks.find((item) => isPlainObject(item) && optionalText(item.lang)?.toLowerCase() === PT_LANG);
      if (pt) {
        const url = readHttpUrl(pt.url, `${origin}/`, 'legenda PT do VidRift');
        const label = optionalText(pt.label);
        return {
          subtitle: {
            url,
            language: SUBTITLE_LANGUAGE,
            ...(label === null ? {} : { name: label }),
            headers: playbackHeaders(`${origin}/`),
          },
          failures,
        };
      }
    } catch (error) {
      failures.push(`Orion: ${error.message}`);
    }
  }

  const genericUrl = `${origin}/api/subtitles/${path}/Portuguese`;
  try {
    const body = await fetchText(genericUrl, { profile: 'player' });
    if (/^WEBVTT(?:\r?\n|$)/.test(body.trim())) {
      return { subtitle: { url: genericUrl, language: SUBTITLE_LANGUAGE }, failures };
    }
    failures.push('Legenda genérica: resposta não é VTT');
  } catch (error) {
    if (!error.message.startsWith('HTTP 404')) failures.push(`Legenda genérica: ${error.message}`);
  }
  return { subtitle: null, failures };
}

/**
 * Valida e normaliza uma faixa Orion do boot.
 * @param {*} item - Item recebido em `meta.orionStreams`.
 * @param {number} index - Posição na lista, usada nas mensagens de erro.
 * @param {string} origin - Origem do VidRift para resolver URLs relativas.
 * @returns {object} Faixa com `name`, `type`, `url`, `provider`, `rungs` e `subtitleListUrl`.
 * @throws {Error} Se a faixa não for objeto ou faltar um campo obrigatório.
 */
function readTrack(item, index, origin) {
  if (!isPlainObject(item)) throw new Error(`Boot do VidRift com faixa ${index} inválida`);
  const label = `meta.orionStreams[${index}]`;
  return {
    name: readText(item.name, `${label}.name`),
    type: readText(item.type, `${label}.type`).toLowerCase(),
    url: readHttpUrl(item.url, `${origin}/`, `${label}.url`),
    provider: optionalText(item.provider) || 'Orion',
    rungs: readRungs(item.rungs, index),
    subtitleListUrl: item.subtitleListUrl === undefined || item.subtitleListUrl === null
      ? null
      : readHttpUrl(item.subtitleListUrl, `${origin}/`, `${label}.subtitleListUrl`),
  };
}

/**
 * Lê as alturas válidas de `rungs`, ignorando itens fora do formato.
 * @param {*} value - Valor recebido no boot.
 * @param {number} index - Posição da faixa, usada nas mensagens de erro.
 * @returns {number[]} Alturas em pixels, sem repetição de validação.
 * @throws {Error} Se `rungs` for informado e não for lista.
 */
function readRungs(value, index) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`meta.orionStreams[${index}].rungs deve ser lista`);
  const heights = [];
  for (const rung of value) {
    if (isPlainObject(rung) && Number.isInteger(rung.height) && rung.height > 0) heights.push(rung.height);
  }
  return heights;
}
