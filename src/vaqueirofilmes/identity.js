/** Identidade do catálogo VaqueiroFilmes: leitura do JSON-LD e confirmação de título e ano. */
import { titleSimilarity } from '../_blocks/title-match/index.mjs';

const MIN_SCORE = 0.85;
const MAX_CANDIDATES = 3;
const JSON_LD_SCRIPT = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Títulos conhecidos do TMDB, sem duplicatas e sem vazios.
 * @param {object} media - Dados do TMDB.
 * @returns {string[]} Título PT-BR, original e alternativos.
 */
export function knownTitles(media) {
  return [...new Set([media.title, media.originalTitle, ...media.alternativeTitles].filter(isText))];
}

/**
 * Ordena os resultados da busca pela semelhança com os títulos do TMDB e limita a triagem a três.
 * @param {Array<{ title: string, url: string, year?: number|null }>} candidates - Resultados da busca.
 * @param {object} media - Dados do TMDB.
 * @returns {Array<{ title: string, url: string, year?: number|null }>} Candidatos mais próximos.
 */
export function rankCandidates(candidates, media) {
  const titles = knownTitles(media);
  return candidates
    .map((candidate) => ({
      candidate,
      score: Math.max(...titles.map((title) => titleSimilarity(candidate.title, title))),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((item) => item.candidate);
}

/**
 * Lê o JSON-LD da página do filme. JSON-LD ausente ou inválido é falha de parsing; página sem nó
 * Movie/TVSeries é descartada pelo chamador.
 * @param {string} html - HTML da página do candidato.
 * @param {string} pageUrl - URL da página, usada nas mensagens de erro.
 * @returns {{ type: string|null, names: string[], year: number|null }} Identidade declarada.
 * @throws {Error} Se não houver bloco JSON-LD ou se algum bloco não for JSON válido.
 */
export function readMovieIdentity(html, pageUrl) {
  const blocks = [];
  JSON_LD_SCRIPT.lastIndex = 0;
  let match;
  while ((match = JSON_LD_SCRIPT.exec(html)) !== null) blocks.push(match[1].trim());
  if (!blocks.length) throw new Error(`JSON-LD ausente em ${pageUrl}`);

  const nodes = [];
  for (const block of blocks) {
    let value;
    try {
      value = JSON.parse(block);
    } catch (error) {
      throw new Error(`JSON-LD inválido em ${pageUrl}`, { cause: error });
    }
    collectTypedNodes(value, nodes);
  }

  const movie = nodes.find((node) => hasType(node, 'Movie'));
  if (movie) return readIdentityNode(movie, 'Movie');
  const series = nodes.find((node) => hasType(node, 'TVSeries'));
  if (series) return readIdentityNode(series, 'TVSeries');
  return { type: null, names: [], year: null };
}

/**
 * Confirma um candidato contra o título e o ano do TMDB.
 * @param {{ type: string|null, names: string[], year: number|null }} identity - Identidade da página.
 * @param {object} media - Dados do TMDB.
 * @returns {boolean} `true` quando o candidato é o filme pedido.
 */
export function isConfirmed(identity, media) {
  if (identity.type !== 'Movie') return false;
  if (media.year !== null && identity.year !== media.year) return false;
  const titles = knownTitles(media);
  return identity.names.some((name) => titles.some((title) => titleSimilarity(name, title) >= MIN_SCORE));
}

/**
 * Percorre o JSON-LD e reúne objetos com `@type`.
 * @param {*} node - Nó atual.
 * @param {object[]} nodes - Lista acumulada, alterada no lugar.
 * @returns {void}
 */
function collectTypedNodes(node, nodes) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectTypedNodes(item, nodes));
    return;
  }
  if (node['@type'] !== undefined) nodes.push(node);
  Object.values(node).forEach((value) => {
    if (value !== null && typeof value === 'object') collectTypedNodes(value, nodes);
  });
}

/**
 * Indica se o nó declara o tipo informado.
 * @param {object} node - Nó JSON-LD.
 * @param {string} type - Tipo procurado.
 * @returns {boolean}
 */
function hasType(node, type) {
  const value = node['@type'];
  return Array.isArray(value) ? value.includes(type) : value === type;
}

/**
 * Extrai tipo, nomes e ano de um nó JSON-LD.
 * @param {object} node - Nó Movie ou TVSeries.
 * @param {string} type - Tipo já identificado.
 * @returns {{ type: string, names: string[], year: number|null }}
 */
function readIdentityNode(node, type) {
  const names = [node.name, node.alternateName]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(isText)
    .map(cleanText)
    .filter(isText);
  return { type, names: [...new Set(names)], year: readYear(node.datePublished) };
}

/**
 * Ano de uma data JSON-LD.
 * @param {*} value - Valor de `datePublished`.
 * @returns {number|null}
 */
function readYear(value) {
  if (typeof value !== 'string') return null;
  const match = /\b(\d{4})\b/.exec(value);
  return match ? Number(match[1]) : null;
}

/**
 * Remove marcação e entidades HTML comuns de um nome.
 * @param {string} value - Texto recebido.
 * @returns {string}
 */
function cleanText(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Decodifica entidades HTML numéricas e as mais comuns em títulos do WordPress.
 * @param {string} text - Texto com entidades.
 * @returns {string}
 */
export function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (_, name) => ({
      amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
    })[name.toLowerCase()]);
}

/**
 * Converte um code point em texto, preservando o caractere recebido quando inválido.
 * @param {number} code - Code point.
 * @returns {string}
 */
function fromCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * Indica se o valor é texto não vazio.
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}
