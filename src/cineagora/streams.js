/**
 * Montagem dos streams do CineAgora a partir do objeto `video` do BrStream.
 *
 * A fonte declara as resoluções em `video.quality` e o áudio no rótulo do espelho. O provedor
 * repassa só o que a fonte comprova: playlist master, qualidade máxima declarada, idioma pelo
 * rótulo/release e o nome da release decodificado.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { LANGUAGE, languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { normalizeQuality, UNKNOWN_QUALITY } from '../_blocks/quality-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';

const PROVIDER = 'BrStream';
const STREAM_TYPE = 'hls';

/**
 * @typedef {object} ResolvedVideo
 * @property {string} url - URL da playlist master.
 * @property {string} quality - Lista de qualidades como a fonte publica (JSON em texto).
 * @property {string|null} filename - Nome da release decodificado, quando disponível.
 */

/**
 * Monta um stream do CineAgora.
 * @param {{ video: ResolvedVideo, filename: string|null, label: string }} option - Opção resolvida.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {object} Stream validado pelo bloco stream-build.
 * @throws {Error} Se os dados da opção não formarem um stream válido.
 */
export function buildOptionStream(option, media, request) {
  const filename = option.filename || null;
  const languageHints = [option.label, filename].filter((text) => typeof text === 'string' && text.trim() !== '');
  const language = resolveLanguage(option.label, filename);
  const quality = highestQuality(option.video.quality);
  const format = { template: FORMATTER.AUTO, addon: 'CineAgora', title: media.title };
  if (media.year !== null) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  if (filename !== null) format.filename = filename;

  const fields = {
    url: option.video.url,
    provider: PROVIDER,
    type: STREAM_TYPE,
    languageHints,
    format,
  };
  if (quality !== null) fields.quality = quality;
  if (language !== null && language !== LANGUAGE.UNKNOWN) fields.language = language;
  return buildStream(fields);
}

/**
 * Resolve o idioma pelo rótulo do espelho e, quando ele não classifica, pela release.
 *
 * `Dublado` e `Legendado` são explícitos. Rótulo desconhecido com `DUAL`/`TRI` na release vira
 * `Dublado (Não PT-BR?)`, como o bloco language-discovery faz com "Dual Áudio": há áudio português,
 * mas a fonte não comprova a região. Sem conclusão, retorna null e o `buildStream` decide.
 *
 * @param {string} label - Texto do botão do espelho.
 * @param {string|null} filename - Nome da release decodificado.
 * @returns {string|null} Membro do enum LANGUAGE ou null.
 */
function resolveLanguage(label, filename) {
  const labelLanguage = languageFromTexts([label]);
  if (labelLanguage !== null) return labelLanguage;
  if (typeof filename === 'string' && /\b(?:dual|tri)\b/i.test(filename)) return LANGUAGE.DUBBED_NON_PT_BR;
  return languageFromTexts([filename]);
}

/**
 * Escolhe a maior resolução declarada em `video.quality`.
 *
 * A fonte publica a lista como JSON em texto (`"[\"720p\",\"480p\"]"`). Lista ausente, JSON
 * inválido ou entradas não reconhecidas resultam em `null`, deixando a descoberta local do
 * `buildStream` decidir.
 *
 * @param {*} raw - Valor de `video.quality`.
 * @returns {string|null} Qualidade normalizada ou null quando não há resolução confiável.
 */
function highestQuality(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let values;
  try {
    values = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(values)) return null;
  let best = null;
  for (const value of values) {
    if (typeof value !== 'string') continue;
    let normalized;
    try {
      normalized = normalizeQuality(value);
    } catch {
      continue;
    }
    if (normalized === UNKNOWN_QUALITY) continue;
    if (best === null || qualityRank(normalized) > qualityRank(best)) best = normalized;
  }
  return best;
}

/**
 * Altura de uma qualidade já normalizada, para comparar resoluções.
 * @param {string} quality - Qualidade normalizada.
 * @returns {number} Altura em pixels; `CAM` vale 0.
 */
function qualityRank(quality) {
  if (quality === '4K') return 2160;
  if (quality === 'CAM') return 0;
  const match = /^(\d{3,4})p$/.exec(quality);
  return match ? Number(match[1]) : 0;
}
