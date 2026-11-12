/**
 * Classificação de faixas e estrutura do Verifile do TheRARBG.
 *
 * A fonte publica listas de áudio e legenda por arquivo analisado. Este módulo lê somente os
 * metadados fornecidos: não presume idioma pelo nome da release, não transforma legenda em áudio e
 * não trata áudio `und` como estrangeiro. A política regional está na decisão 4 do design da change
 * `add-therarbg-provider`.
 */

import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';

/** Rótulo de áudio português sem região comprovada. */
export const PORTUGUESE_UNKNOWN = LANGUAGE.DUBBED_NON_PT_BR;
/** Rótulo de legenda portuguesa completa sem região comprovada. */
export const SUBTITLED_UNKNOWN = LANGUAGE.SUBTITLED_NON_PT_BR;

// Códigos ISO 639-2/639-1 aceitos pelo formatador, convertidos para ISO 639-1.
const FORMAT_LANGUAGE = Object.freeze({
  por: 'pt',
  pt: 'pt',
  pob: 'pt',
  eng: 'en',
  en: 'en',
  spa: 'es',
  es: 'es',
  fra: 'fr',
  fre: 'fr',
  fr: 'fr',
  ita: 'it',
  it: 'it',
  deu: 'de',
  ger: 'de',
  de: 'de',
  jpn: 'ja',
  ja: 'ja',
  kor: 'ko',
  ko: 'ko',
  zho: 'zh',
  chi: 'zh',
  zh: 'zh',
  rus: 'ru',
  ru: 'ru',
  hin: 'hi',
  hi: 'hi',
});

// Códigos que não identificam um idioma estrangeiro.
const UNKNOWN_LANGUAGE = new Set(['', 'und', 'unk', 'unknown', 'zxx', 'mul', 'mis']);

const BRAZIL_WORDS = /\b(?:brazil|brasil|brazilian|brasileiro|brasileira)\b/;
const PORTUGAL_WORDS = /\b(?:portugal|european|europeu|europeia)\b/;
const PORTUGUESE_WORD = /\b(?:portuguese|portugues)\b/;

/**
 * @typedef {object} TrackInfo
 * @property {string} rawLanguage - Código ou texto de idioma recebido.
 * @property {string} title - Título da faixa, quando houver.
 * @property {string} language - Nome de idioma informado pela fonte, quando houver.
 * @property {string|null} url - URL externa real da legenda, quando a fonte fornecer.
 * @property {'BR'|'PT'|'unknown'|null} portuguese - Região quando a faixa é portuguesa; `null` quando não é.
 * @property {boolean} identified - Se o idioma foi identificado (português ou estrangeiro).
 * @property {boolean} foreign - Se é um idioma estrangeiro identificado.
 * @property {boolean} complete - Só para legendas: `forced === false`.
 */

/**
 * @typedef {object} TrackClassification
 * @property {'Dublado'|'Dual Áudio'|'Português (Dialeto Desconhecido)'|'Legendado'|'Legendado (Dialeto Desconhecido)'} language
 * @property {string[]|undefined} formatLanguages - Códigos ISO 639-1 aceitos pelo formatador.
 * @property {string|undefined} message - Descrição das legendas embutidas, quando houver.
 * @property {Array<{url: string, language: string}>|undefined} externalSubtitles - Legendas com URL real fornecida pela fonte.
 */

/**
 * Confere a estrutura de uma resposta Verifile concluída e o hash esperado.
 *
 * Estado em fila, em análise, desconhecido ou reprovado é triagem; estrutura ausente ou hash
 * divergente é falha de contrato.
 *
 * @param {*} data - JSON de `/api/v1/verifile/<hash>/`.
 * @param {string} expectedHash - Hash hexadecimal de 40 caracteres do torrent selecionado.
 * @param {string} expectedPostId - ID do post selecionado, quando a fonte informar `post.id`.
 * @returns {{ result: object }|{ triage: string }} Resultado validado ou motivo de triagem.
 * @throws {Error} Se a resposta não for objeto, faltar campo obrigatório, o hash divergir ou o
 *   `result` não tiver a estrutura de faixas esperada.
 * @example
 * const inspected = inspectVerification(payload, '6ff479e8c37929b883268c6849a56e0caecec8c8', '942153');
 * // inspected.result.file === 'Filme.2026.2160p.mp4'
 */
export function inspectVerification(data, expectedHash, expectedPostId) {
  if (!isPlainObject(data)) throw new Error('Verifile retornou um objeto inválido');

  const status = readText(data.status, 'Verifile.status');
  const verifile = readText(data.verifile, 'Verifile.verifile');
  const hash = normalizeHash(readText(data.infoHash, 'Verifile.infoHash'));

  if (hash !== normalizeHash(expectedHash)) {
    throw new Error(`Verifile identificou o hash ${hash}, diferente do torrent ${normalizeHash(expectedHash)}`);
  }
  if (data.post !== undefined && data.post !== null) {
    if (!isPlainObject(data.post)) throw new Error('Verifile.post deve ser objeto');
    if (data.post.id !== undefined && String(data.post.id) !== String(expectedPostId)) {
      throw new Error(`Verifile pertence ao post ${data.post.id}, diferente do torrent ${expectedPostId}`);
    }
  }
  if (status !== 'done' || verifile !== 'verified') {
    return { triage: `verificação não concluída (status ${status}, verifile ${verifile})` };
  }

  if (!isPlainObject(data.result)) throw new Error('Verifile concluído sem result');
  const { result } = data;
  if (typeof result.file !== 'string' || result.file.trim() === '') {
    throw new Error('Verifile.result.file ausente ou vazio');
  }
  if (!Array.isArray(result.audio)) throw new Error('Verifile.result.audio deve ser lista');
  if (!Array.isArray(result.subtitles)) throw new Error('Verifile.result.subtitles deve ser lista');
  return { result };
}

/**
 * Classifica áudio e legenda de um resultado Verifile já validado.
 *
 * Precedência: áudio brasileiro confirmado (Dublado ou Dual Áudio), áudio português sem região
 * (`Português (Dialeto Desconhecido)`), e, sem áudio português elegível, legenda portuguesa
 * completa com todos os áudios estrangeiros identificados (Legendado ou dialeto desconhecido).
 *
 * @param {object} result - Objeto `result` de `inspectVerification`.
 * @returns {TrackClassification|{ triage: string }} Classificação ou motivo de triagem.
 * @throws {Error} Se uma faixa tiver campo de tipo inválido ou região portuguesa contraditória.
 * @example
 * const classification = classifyTracks(result);
 * // { language: 'Português (Dialeto Desconhecido)', formatLanguages: ['en'], message: undefined }
 */
export function classifyTracks(result) {
  const audio = result.audio.map((track, index) => readTrack(track, `result.audio[${index}]`, false));
  const subtitles = result.subtitles.map((track, index) => readTrack(track, `result.subtitles[${index}]`, true));

  const brazilianAudio = audio.some((track) => track.portuguese === 'BR');
  const unknownAudio = audio.some((track) => track.portuguese === 'unknown');
  const europeanAudio = audio.some((track) => track.portuguese === 'PT');

  let language;
  if (brazilianAudio) {
    language = LANGUAGE.DUBBED;
  } else if (unknownAudio) {
    language = PORTUGUESE_UNKNOWN;
  } else if (europeanAudio) {
    return { triage: 'apenas áudio português europeu, sem áudio brasileiro ou de dialeto desconhecido' };
  } else {
    if (audio.length === 0 || !audio.every((track) => track.foreign && track.identified)) {
      return { triage: 'áudio não comprovadamente estrangeiro para sustentar a legenda portuguesa' };
    }
    const complete = subtitles.filter((track) => track.complete && track.portuguese !== null);
    const brazilianSubtitle = complete.some((track) => track.portuguese === 'BR');
    const unknownSubtitle = complete.some((track) => track.portuguese === 'unknown');
    const europeanSubtitle = complete.some((track) => track.portuguese === 'PT');
    if (brazilianSubtitle) {
      language = LANGUAGE.SUBTITLED;
    } else if (unknownSubtitle) {
      language = SUBTITLED_UNKNOWN;
    } else if (europeanSubtitle) {
      return { triage: 'apenas legenda portuguesa europeia' };
    } else {
      return { triage: 'sem áudio português elegível nem legenda portuguesa completa' };
    }
  }

  return {
    language,
    formatLanguages: formatLanguages(audio, language),
    message: embeddedSubtitlesMessage(subtitles),
    externalSubtitles: externalSubtitles(subtitles),
  };
}

/**
 * Códigos ISO 639-1 dos áudios, sem repetição, aceitos pelo formatador.
 *
 * `pt` é omitido quando o áudio português ficou sem região comprovada, porque o Prism o exibe com
 * bandeira brasileira; o rótulo `language` continua informando o português.
 *
 * @param {TrackInfo[]} audio - Faixas de áudio validadas.
 * @param {string} language - Rótulo principal já classificado.
 * @returns {string[]|undefined} Códigos aceitos ou `undefined` quando não há nenhum.
 */
function formatLanguages(audio, language) {
  const codes = [];
  for (const track of audio) {
    const code = FORMAT_LANGUAGE[track.rawLanguage];
    if (!code) continue;
    if (code === 'pt' && language === PORTUGUESE_UNKNOWN) continue;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes.length > 0 ? codes : undefined;
}

/**
 * Descreve as legendas portuguesas embutidas, sem criar URLs externas.
 *
 * @param {TrackInfo[]} subtitles - Faixas de legenda validadas.
 * @returns {string|undefined} Mensagem para `format.message`, ou `undefined` sem legenda portuguesa.
 */
function embeddedSubtitlesMessage(subtitles) {
  const labels = [];
  for (const track of subtitles) {
    if (track.portuguese === null) continue;
    const label =
      track.portuguese === 'BR'
        ? 'Português (Brasil)'
        : track.portuguese === 'PT'
          ? 'Português (Portugal)'
          : 'Português (dialeto desconhecido)';
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.length > 0 ? `Legendas embutidas: ${labels.join(', ')}` : undefined;
}

/**
 * Lê uma faixa de áudio ou legenda.
 *
 * @param {*} track - Item da lista `audio` ou `subtitles`.
 * @param {string} label - Caminho do campo nas mensagens de erro.
 * @param {boolean} subtitle - Se a faixa é legenda, exigindo `forced` booleano quando presente.
 * @returns {TrackInfo}
 * @throws {Error} Se a faixa não for objeto ou tiver campo obrigatório de tipo inválido.
 */
function readTrack(track, label, subtitle) {
  if (!isPlainObject(track)) throw new Error(`${label} deve ser objeto`);
  if (track.lang !== undefined && track.lang !== null && typeof track.lang !== 'string') {
    throw new Error(`${label}.lang deve ser texto`);
  }
  if (track.title !== undefined && track.title !== null && typeof track.title !== 'string') {
    throw new Error(`${label}.title deve ser texto`);
  }
  if (track.language !== undefined && track.language !== null && typeof track.language !== 'string') {
    throw new Error(`${label}.language deve ser texto`);
  }
  if (subtitle && track.forced !== undefined && typeof track.forced !== 'boolean') {
    throw new Error(`${label}.forced deve ser booleano`);
  }
  if (subtitle && track.url !== undefined && track.url !== null) {
    if (typeof track.url !== 'string' || !/^https?:\/\/\S+$/i.test(track.url.trim())) {
      throw new Error(`${label}.url deve ser URL http(s) real`);
    }
  }

  const rawLanguage = normalizeText(track.lang || '');
  const title = typeof track.title === 'string' ? track.title : '';
  const titleRegion = readTitleRegion(title, label);
  let portuguese = portugueseKind(rawLanguage);
  if (portuguese === null && UNKNOWN_LANGUAGE.has(rawLanguage) && PORTUGUESE_WORD.test(normalizeText(title))) {
    portuguese = 'unknown';
  }
  if (portuguese !== null && portuguese !== 'unknown') {
    if (titleRegion !== null && titleRegion !== portuguese) {
      throw new Error(`${label} indica regiões portuguesas contraditórias`);
    }
  } else if (portuguese === 'unknown' && titleRegion !== null) {
    portuguese = titleRegion;
  }

  const identified = portuguese !== null || !UNKNOWN_LANGUAGE.has(rawLanguage);
  return {
    rawLanguage,
    title,
    language: typeof track.language === 'string' ? track.language.trim() : '',
    url: subtitle && typeof track.url === 'string' ? track.url.trim() : null,
    portuguese,
    identified,
    foreign: portuguese === null && identified,
    complete: subtitle && track.forced === false,
  };
}

/**
 * Legendas com URL externa real fornecida pela fonte, sem inferir endereço.
 *
 * @param {TrackInfo[]} subtitles - Faixas de legenda validadas.
 * @returns {Array<{url: string, language: string}>|undefined}
 */
function externalSubtitles(subtitles) {
  const items = [];
  for (const track of subtitles) {
    if (!track.url) continue;
    const language = track.language || track.title || track.rawLanguage;
    if (!language) continue;
    if (items.some((item) => item.url === track.url)) continue;
    items.push({ url: track.url, language });
  }
  return items.length > 0 ? items : undefined;
}

/**
 * Região portuguesa indicada pelo título da faixa, ou `null`.
 *
 * @param {string} title - `title` da faixa.
 * @param {string} label - Caminho do campo nas mensagens de erro.
 * @returns {'BR'|'PT'|null}
 * @throws {Error} Se o título indicar Brasil e Portugal ao mesmo tempo.
 */
function readTitleRegion(title, label) {
  const normalized = normalizeText(title);
  const brazil = BRAZIL_WORDS.test(normalized) || /\bpt br\b/.test(normalized);
  const portugal = PORTUGAL_WORDS.test(normalized) || /\bpt pt\b/.test(normalized);
  if (brazil && portugal) throw new Error(`${label} indica Brasil e Portugal ao mesmo tempo`);
  if (brazil) return 'BR';
  if (portugal) return 'PT';
  return null;
}

/**
 * Região de um código de idioma português, ou `null` quando não é português.
 *
 * @param {string} code - Código já normalizado.
 * @returns {'BR'|'PT'|'unknown'|null}
 */
function portugueseKind(code) {
  if (code === 'pob' || code === 'pt br' || code === 'por br') return 'BR';
  if (code === 'pt pt' || code === 'por pt') return 'PT';
  if (code === 'por' || code === 'pt' || code === 'ptbr' || code === 'portuguese' || code === 'portugues') {
    return 'unknown';
  }
  return null;
}

/**
 * Normaliza um hash hexadecimal para comparação.
 *
 * @param {string} hash - Hash recebido.
 * @returns {string}
 * @throws {Error} Se não for hexadecimal de 40 caracteres.
 */
function normalizeHash(hash) {
  const value = String(hash).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error(`hash inválido no Verifile: "${hash}"`);
  return value;
}

/**
 * Lê um texto obrigatório.
 *
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string}
 * @throws {Error} Se não for texto não vazio.
 */
function readText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} ausente ou vazio`);
  }
  return value.trim();
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
