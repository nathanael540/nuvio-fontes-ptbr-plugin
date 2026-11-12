/**
 * Bloco language-discovery: padronização e descoberta local do modo de idioma de streams.
 *
 * Aplica o enum fechado LANGUAGE (seis valores em pt-BR) e as regras de precedência,
 * convenção PT-BR e distinção entre português confirmado, identificação brasileira e
 * dialeto com ressalva (design, decisões 1 e 2).
 *
 * Depende apenas do bloco slugify.
 */

import { normalizeText } from '../slugify/index.mjs';

/**
 * Enum imutável com os seis modos de idioma padronizados do contrato global (design, decisão 1).
 * Não inclui "Dual Áudio" nem variações livres.
 * @readonly
 * @enum {string}
 */
export const LANGUAGE = Object.freeze({
  DUBBED: 'Dublado',
  DUBBED_NON_PT_BR: 'Dublado (Não PT-BR?)',
  SUBTITLED: 'Legendado',
  SUBTITLED_NON_PT_BR: 'Legendado (Não PT-BR?)',
  NON_PT_BR: 'Não PT-BR',
  UNKNOWN: 'Idioma Desconhecido',
});

/** Lista imutável dos valores aceitos de LANGUAGE. */
export const LANGUAGE_MODES = Object.freeze(Object.values(LANGUAGE));

/** Referência compatível ao valor desconhecido do enum. */
export const UNKNOWN_LANGUAGE = LANGUAGE.UNKNOWN;

const EXACT_MAPPINGS = [
  ['dublado', LANGUAGE.DUBBED],
  ['dublado nao pt br', LANGUAGE.DUBBED_NON_PT_BR],
  ['portugues dialeto desconhecido', LANGUAGE.DUBBED_NON_PT_BR],
  ['legendado', LANGUAGE.SUBTITLED],
  ['legendado nao pt br', LANGUAGE.SUBTITLED_NON_PT_BR],
  ['legendado dialeto desconhecido', LANGUAGE.SUBTITLED_NON_PT_BR],
  ['nao pt br', LANGUAGE.NON_PT_BR],
  ['idioma desconhecido', LANGUAGE.UNKNOWN],
];

const KNOWN_FOREIGN_REGEX = /\b(?:ingles|english|espanhol|spanish|japones|japanese|frances|french|alemao|german|italiano|italian|coreano|korean|russo|russian|mandarim|chines|chinese)\b/;
const BRAZIL_REGION_REGEX = /\b(?:ptbr|pt br|pob|brazil|brasil|brazilian|brasileiro|brasileira|br)\b/;
const NON_BR_REGION_REGEX = /\b(?:ptpt|pt pt|portugal|european|europeu|europeia)\b/;
const EXPLICIT_PT_REGEX = /\b(?:portugues|portuguese|por)\b/;

/**
 * Analisa um texto e extrai indícios linguísticos normalizados.
 * @param {string} text - Texto a analisar.
 * @returns {object|null} Indícios encontrados ou null.
 */
function inspectText(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const normalized = normalizeText(trimmed);
  if (normalized === '') return null;

  const exact = EXACT_MAPPINGS.find(([label]) => normalized === label);
  if (exact) {
    if (exact[1] === LANGUAGE.DUBBED) return { audio: 'pt_br' };
    if (exact[1] === LANGUAGE.DUBBED_NON_PT_BR) return { audio: 'non_pt_br' };
    if (exact[1] === LANGUAGE.SUBTITLED) return { sub: 'pt_br' };
    if (exact[1] === LANGUAGE.SUBTITLED_NON_PT_BR) return { sub: 'non_pt_br' };
    if (exact[1] === LANGUAGE.NON_PT_BR) return { foreign: true };
    if (exact[1] === LANGUAGE.UNKNOWN) return { unknown: true };
  }

  // Remove encode/format tags que contenham "br" ou "bd" para evitar falsos positivos
  const cleaned = normalized
    .replace(/\b(?:brrip|bdrip|br rip|bd rip)\b/g, ' ')
    .replace(/\bdublada\b/g, 'dublado')
    .replace(/\blegendada\b/g, 'legendado')
    .trim();

  const hasExplicitPt = EXPLICIT_PT_REGEX.test(cleaned);
  const hasBr = BRAZIL_REGION_REGEX.test(cleaned);
  const hasNonBr = NON_BR_REGION_REGEX.test(cleaned);
  const hasForeign = KNOWN_FOREIGN_REGEX.test(cleaned);

  const hasAudio = /\b(?:dub|dublado|dubbed|nacional)\b/.test(cleaned)
    || (/\baudio\b/.test(cleaned) && (hasBr || hasNonBr || hasExplicitPt));
  const hasSub = /\b(?:leg|legendado|legenda|legendas|sub|subbed|subtitled|softsub)\b/.test(cleaned);

  const result = {};

  if (hasAudio) {
    if (hasNonBr) {
      result.audio = 'non_pt_br';
    } else if (hasExplicitPt && !hasBr) {
      result.audio = 'non_pt_br';
    } else {
      result.audio = 'pt_br';
    }
  }

  if (hasSub) {
    if (hasNonBr) {
      result.sub = 'non_pt_br';
    } else if (hasExplicitPt && !hasBr) {
      result.sub = 'non_pt_br';
    } else {
      result.sub = 'pt_br';
    }
  }

  if (!hasAudio && !hasSub) {
    if (hasExplicitPt) {
      if (hasNonBr) {
        result.audio = 'non_pt_br';
      } else if (hasBr) {
        result.audio = 'pt_br';
      } else {
        result.audio = 'non_pt_br';
      }
    } else if (hasForeign) {
      result.foreign = true;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Converte indícios extraídos no membro correspondente do enum.
 * @param {object|null} info - Indícios linguísticos.
 * @returns {string|null} Membro do enum LANGUAGE ou null.
 */
function resolveInfo(info) {
  if (!info) return null;
  if (info.audio === 'pt_br') return LANGUAGE.DUBBED;
  if (info.audio === 'non_pt_br') return LANGUAGE.DUBBED_NON_PT_BR;
  if (info.sub === 'pt_br') return LANGUAGE.SUBTITLED;
  if (info.sub === 'non_pt_br') return LANGUAGE.SUBTITLED_NON_PT_BR;
  if (info.foreign) return LANGUAGE.NON_PT_BR;
  if (info.unknown) return LANGUAGE.UNKNOWN;
  return null;
}

/**
 * Normaliza um texto informado pela fonte para um membro do enum LANGUAGE ou `null`.
 *
 * Função auxiliar de resultado intermediário: retorna um membro reconhecido de `LANGUAGE` ou `null`
 * quando a informação for inconclusiva ou ausente, permitindo que a tentativa prossiga para outras
 * pistas. O valor `null` é restrito a este resultado intermediário e nunca compõe a saída final.
 *
 * @param {string} value - Texto bruto informado pela fonte (rótulo, metadado ou nome).
 * @returns {string|null} Membro do enum `LANGUAGE` reconhecido ou `null` se inconclusivo.
 * @throws {Error} Se o valor não for texto.
 * @example
 * normalizeLanguage('Dublado'); // 'Dublado'
 * normalizeLanguage('Dublado (Não PT-BR?)'); // 'Dublado (Não PT-BR?)'
 * normalizeLanguage('en'); // null
 */
export function normalizeLanguage(value) {
  if (typeof value !== 'string') {
    throw new Error(`Idioma deve ser texto (recebido: ${String(value)})`);
  }
  const info = inspectText(value);
  return resolveInfo(info);
}

/**
 * Procura o modo de idioma em uma lista de textos candidatos em ordem de prioridade.
 *
 * Função auxiliar de resultado intermediário: percorre os textos e retorna o primeiro membro
 * do enum `LANGUAGE` reconhecido, ou `null` se nenhum texto for conclusivo, permitindo que a
 * tentativa continue em outras fontes ou caia na descoberta final. O valor `null` é restrito a
 * este resultado intermediário e nunca compõe a saída final.
 *
 * @param {(string|null|undefined)[]} parts - Textos candidatos em ordem de prioridade.
 * @returns {string|null} Membro do enum `LANGUAGE` reconhecido ou `null` se inconclusivo.
 * @throws {Error} Se `parts` não for lista.
 * @example
 * languageFromTexts(['DUBLADA 1080P']); // 'Dublado'
 * languageFromTexts(['Filme.1080p.mkv']); // null
 */
export function languageFromTexts(parts) {
  if (!Array.isArray(parts)) {
    throw new Error('parts deve ser lista');
  }
  for (const part of parts) {
    if (typeof part !== 'string' || part.trim() === '') continue;
    const recognized = normalizeLanguage(part);
    if (recognized) return recognized;
  }
  return null;
}

/**
 * Descobre o idioma pelos textos locais confiáveis (nomes de arquivo, pasta e pistas).
 *
 * Função de resolução final: analisa os textos recebidos conforme as regras de modalidade,
 * convenção PT-BR, conflito regional e prioridade de áudio sobre legenda. Sempre retorna um
 * membro do enum `LANGUAGE`, retornando `LANGUAGE.UNKNOWN` ('Idioma Desconhecido') quando não
 * houver conclusão conclusiva. Nunca retorna `null` e não utiliza listas genéricas de códigos ISO.
 *
 * @param {object} [hints] - Indícios textuais para descoberta.
 * @param {(string|null|undefined)[]} [hints.texts] - Textos locais candidatos (arquivo, pasta, pistas).
 * @param {string[]} [hints.codes] - Mantido por compatibilidade de assinatura; não é usado na descoberta.
 * @returns {string} Membro final do enum `LANGUAGE` (sempre definido, inclusive `LANGUAGE.UNKNOWN`).
 * @throws {Error} Se `texts` ou `codes` forem informados e não forem listas.
 * @example
 * discoverLanguage({ texts: ['Filme.DUBLADO.mkv'] }); // 'Dublado'
 * discoverLanguage({ texts: ['Filme.1080p.mkv'] }); // 'Idioma Desconhecido'
 */
export function discoverLanguage({ codes, texts = [] } = {}) {
  if (codes !== undefined && !Array.isArray(codes)) {
    throw new Error('codes deve ser lista');
  }
  if (!Array.isArray(texts)) {
    throw new Error('texts deve ser lista');
  }

  const audioObservations = [];
  const subObservations = [];
  let hasForeign = false;

  for (const text of texts) {
    if (typeof text !== 'string') continue;
    const info = inspectText(text);
    if (!info) continue;
    if (info.audio) audioObservations.push(info.audio);
    if (info.sub) subObservations.push(info.sub);
    if (info.foreign) hasForeign = true;
  }

  // 1. Áudio (prioridade sobre legenda)
  if (audioObservations.length > 0) {
    const hasPtBr = audioObservations.includes('pt_br');
    const hasNonPtBr = audioObservations.includes('non_pt_br');
    // Conflito regional ou português sem região -> Dublado (Não PT-BR?)
    if (hasNonPtBr || (hasPtBr && hasNonPtBr)) {
      return LANGUAGE.DUBBED_NON_PT_BR;
    }
    return LANGUAGE.DUBBED;
  }

  // 2. Legenda (quando não há áudio português)
  if (subObservations.length > 0) {
    const hasPtBr = subObservations.includes('pt_br');
    const hasNonPtBr = subObservations.includes('non_pt_br');
    // Conflito regional ou português sem região -> Legendado (Não PT-BR?)
    if (hasNonPtBr || (hasPtBr && hasNonPtBr)) {
      return LANGUAGE.SUBTITLED_NON_PT_BR;
    }
    return LANGUAGE.SUBTITLED;
  }

  // 3. Idioma estrangeiro conhecido sem português
  if (hasForeign) {
    return LANGUAGE.NON_PT_BR;
  }

  // 4. Sem conclusão conclusiva
  return LANGUAGE.UNKNOWN;
}
