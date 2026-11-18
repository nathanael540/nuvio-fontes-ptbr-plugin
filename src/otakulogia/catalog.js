/**
 * Catálogo do Otakulogia: termos de busca, confirmação de identidade, temporada, episódio e filme.
 *
 * As buscas usam os títulos do TMDB e param no primeiro termo com correspondência. A seleção de
 * temporada usa o nome declarado (`Temporada N` ou `Filme`), nunca a posição no array, e a seleção
 * de episódio usa a numeração da URL de `videoUrl`, nunca `episodeNumber`.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import { searchAnimes } from './api.js';

const MAX_SEARCH_TERMS = 8;
const MAX_CANDIDATES = 3;

const EPISODE_URL_NUMBER = /(\d+)\.mp4(?:$|\?)/i;
const MOVIE_SEASON_NAME = /^Filme(?:\s*\|.*)?$/i;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 */

/**
 * @typedef {object} Candidate
 * @property {*} upstreamCid - Identificador da obra no catálogo de origem.
 */

/**
 * @typedef {object} EpisodeOption
 * @property {object} episode - Episódio publicado com as URLs e o `audioType`.
 * @property {string|null} seasonAudioType - `audioType` da linha de temporada, usado como fallback.
 */

/**
 * Localiza os itens confirmados para a mídia do TMDB.
 *
 * As buscas rodam em paralelo e a leitura para no primeiro termo, na ordem do TMDB, que tiver item
 * confirmado, levando no máximo três itens distintos para o detalhe. Um termo que falha e outro que
 * confirma geram apenas aviso; sem nenhuma correspondência, qualquer falha sobe como erro agregado.
 *
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<Candidate[]>} Itens confirmados, no máximo três.
 * @throws {Error} Se nenhuma busca confirmar o título e ao menos uma tiver falhado.
 * @example
 * const candidates = await findCandidates(media);
 * // [{ upstreamCid: 201, name: 'Demon Slayer', ... }]
 */
export async function findCandidates(media) {
  const terms = buildSearchTerms(media);
  const outcomes = await Promise.all(terms.map((term) => collectTerm(term, media)));
  const failures = outcomes.filter((outcome) => !outcome.ok);
  const confirmed = outcomes.find((outcome) => outcome.ok && outcome.items.length > 0);

  if (confirmed !== undefined) {
    for (const failure of failures) {
      console.warn(`[Otakulogia] Busca "${failure.term}" descartada: ${failure.error.message}`);
    }
    return uniqueCandidates(confirmed.items).slice(0, MAX_CANDIDATES);
  }

  if (failures.length > 0) {
    const causes = failures.map((failure) => `"${failure.term}": ${failure.error.message}`).join('; ');
    throw new Error(`Nenhuma busca confirmou o título e ${failures.length} falharam: ${causes}`);
  }
  return [];
}

/**
 * Monta os termos de busca na ordem do TMDB, sem repetir o texto normalizado e com no máximo oito.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Títulos PT-BR, original, alternativos brasileiros e romaji.
 * @example
 * buildSearchTerms(media); // ['Demon Slayer', 'Kimetsu no Yaiba', 'Caçadores de Demônios']
 */
export function buildSearchTerms(media) {
  const titles = [media.title, media.originalTitle]
    .concat(media.alternativeTitles)
    .concat(media.romajiTitles.map((item) => item.title));
  const seen = new Set();
  const terms = [];
  for (const title of titles) {
    if (typeof title !== 'string' || title.trim() === '') continue;
    const normalized = normalizeText(title);
    if (normalized === '' || seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(title.trim());
    if (terms.length === MAX_SEARCH_TERMS) break;
  }
  return terms;
}

/**
 * Executa um termo e converte o resultado ou a falha em um objeto, para `Promise.all` sem
 * `Promise.allSettled`.
 * @param {string} term - Termo de busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<{ ok: true, term: string, items: object[] }|{ ok: false, term: string, error: Error }>}
 *   Resultado do termo.
 */
async function collectTerm(term, media) {
  try {
    const items = await searchAnimes(term);
    return { ok: true, term, items: confirmItems(items, media) };
  } catch (error) {
    return { ok: false, term, error };
  }
}

/**
 * Confirma os itens pelo título e pelo ano do TMDB.
 *
 * Compara `name` e `nameEn` com os títulos do TMDB por igualdade normalizada e aceita diferença de
 * até um ano quando os dois lados publicam ano.
 *
 * @param {object[]} items - Itens devolvidos pela busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {object[]} Itens confirmados, na ordem da fonte.
 * @throws {Error} Se um item ou um campo usado na confirmação estiver fora do esquema.
 * @example
 * confirmItems(items, media); // somente os itens com título e ano compatíveis
 */
export function confirmItems(items, media) {
  const titles = knownTitles(media);
  const confirmed = [];
  for (const item of items) {
    if (!isPlainObject(item)) {
      throw new Error(`searchAnimes.items fora do esquema: esperado objeto (recebido: ${describe(item)})`);
    }
    const names = [readOptionalText(item.name, 'name'), readOptionalText(item.nameEn, 'nameEn')];
    const matchesTitle = names.some((name) => {
      if (name === null) return false;
      const normalized = normalizeText(name);
      return normalized !== '' && titles.has(normalized);
    });
    if (!matchesTitle) continue;
    const itemYear = readOptionalYear(item.year);
    if (itemYear !== null && media.year !== null && Math.abs(itemYear - media.year) > 1) continue;
    confirmed.push(item);
  }
  return confirmed;
}

/**
 * Seleciona os episódios pedidos das linhas de temporada com o nome declarado.
 * @param {object} detail - Detalhe validado pelo cliente GraphQL.
 * @param {number} season - Temporada pedida, a partir de 1.
 * @param {number} episode - Episódio pedido, a partir de 1.
 * @returns {EpisodeOption[]} Uma opção por linha de temporada correspondente; vazio na ausência.
 * @throws {Error} Se uma linha correspondente tiver `upstreamTid` fora de inteiro.
 * @example
 * selectSeriesEpisodes(detail, 2, 1); // episódio 1 da linha 'Temporada 2'
 */
// Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0). A seleção por nome de
// temporada e a filtragem por `upstreamTempId` foram portadas desse arquivo; nenhuma URL de mídia,
// token ou cookie foi copiada.
export function selectSeriesEpisodes(detail, season, episode) {
  const matcher = seasonNameMatcher(season);
  const options = [];
  for (const row of seasonRows(detail)) {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!matcher.test(name)) continue;
    const upstreamTid = requireSeasonTid(row);
    const episodes = episodesOfSeason(detail, upstreamTid);
    const numbered = numberEpisodes(episodes);
    if (numbered === null) continue;
    const selected = numbered.find((entry) => entry.number === episode);
    if (selected === undefined) continue;
    options.push({ episode: selected.episode, seasonAudioType: readOptionalText(row.audioType, 'seasons.audioType') });
  }
  return options;
}

/**
 * Seleciona as opções de filme: todas as linhas `Filme` ou, sem elas, a única temporada de episódio
 * único.
 * @param {object} detail - Detalhe validado pelo cliente GraphQL.
 * @returns {EpisodeOption[]} Todas as opções distintas por linha; vazio quando não há candidato
 *   único ou quando não existe linha `Filme`.
 * @throws {Error} Se uma linha `Filme` tiver `upstreamTid` fora de inteiro.
 * @example
 * selectMovieEpisodes(detail); // opções das linhas 'Filme | Dublado' e 'Filme | Legendado'
 */
export function selectMovieEpisodes(detail) {
  const movieRows = seasonRows(detail).filter((row) => MOVIE_SEASON_NAME.test(seasonName(row)));
  if (movieRows.length > 0) {
    const options = [];
    for (const row of movieRows) {
      const upstreamTid = requireSeasonTid(row);
      for (const episode of episodesOfSeason(detail, upstreamTid)) {
        options.push({ episode, seasonAudioType: readOptionalText(row.audioType, 'seasons.audioType') });
      }
    }
    return options;
  }

  const singleEpisodeSeasons = seasonRows(detail).filter((row) => {
    const upstreamTid = trySeasonTid(row);
    return upstreamTid !== null && episodesOfSeason(detail, upstreamTid).length === 1;
  });
  if (singleEpisodeSeasons.length !== 1) return [];
  const [row] = singleEpisodeSeasons;
  const [episode] = episodesOfSeason(detail, requireSeasonTid(row));
  return [{ episode, seasonAudioType: readOptionalText(row.audioType, 'seasons.audioType') }];
}

/**
 * Títulos conhecidos do TMDB, normalizados para comparação.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Set<string>} Títulos não vazios.
 */
function knownTitles(media) {
  const titles = [media.title, media.originalTitle]
    .concat(media.alternativeTitles)
    .concat(media.romajiTitles.map((item) => item.title));
  const normalized = new Set();
  for (const title of titles) {
    if (typeof title !== 'string') continue;
    const text = normalizeText(title);
    if (text !== '') normalized.add(text);
  }
  return normalized;
}

/**
 * Remove candidatos repetidos pelo `upstreamCid`, mantendo a ordem da fonte.
 * @param {object[]} items - Itens confirmados.
 * @returns {object[]} Itens sem `upstreamCid` repetido.
 */
function uniqueCandidates(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = String(item.upstreamCid);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

/**
 * Regex do nome de temporada pedida, aceitando zero à esquerda e sufixo após `|`.
 * @param {number} season - Temporada pedida.
 * @returns {RegExp} Expressão ancorada no nome completo.
 */
function seasonNameMatcher(season) {
  return new RegExp(`^Temporada\\s*0*${season}(?:\\s*\\|.*)?$`, 'i');
}

/**
 * Linhas de `seasons` validadas como objetos.
 * @param {object} detail - Detalhe validado pelo cliente GraphQL.
 * @returns {object[]} Linhas de temporada.
 * @throws {Error} Se alguma linha não for objeto.
 */
function seasonRows(detail) {
  return detail.seasons.map((row) => {
    if (!isPlainObject(row)) {
      throw new Error(`animeCatalogDetail.seasons fora do esquema: esperado objeto (recebido: ${describe(row)})`);
    }
    return row;
  });
}

/**
 * Nome de uma linha de temporada.
 * @param {object} row - Linha de temporada.
 * @returns {string} Nome aparado; vazio quando ausente.
 */
function seasonName(row) {
  return typeof row.name === 'string' ? row.name.trim() : '';
}

/**
 * Exige `upstreamTid` inteiro em uma linha selecionada.
 * @param {object} row - Linha de temporada.
 * @returns {number} Identificador da temporada.
 * @throws {Error} Se `upstreamTid` não for inteiro.
 */
function requireSeasonTid(row) {
  if (!Number.isInteger(row.upstreamTid)) {
    throw new Error(`temporada "${seasonName(row)}" sem upstreamTid inteiro (recebido: ${describe(row.upstreamTid)})`);
  }
  return row.upstreamTid;
}

/**
 * `upstreamTid` inteiro ou null, para linhas que ainda não foram selecionadas.
 * @param {object} row - Linha de temporada.
 * @returns {number|null} Identificador da temporada.
 */
function trySeasonTid(row) {
  return Number.isInteger(row.upstreamTid) ? row.upstreamTid : null;
}

/**
 * Episódios de uma temporada, pelo `upstreamTempId`.
 * @param {object} detail - Detalhe validado pelo cliente GraphQL.
 * @param {number} upstreamTid - Identificador da temporada.
 * @returns {object[]} Episódios da temporada.
 * @throws {Error} Se algum episódio não for objeto.
 */
function episodesOfSeason(detail, upstreamTid) {
  return detail.episodes.filter((episode) => {
    if (!isPlainObject(episode)) {
      throw new Error(`animeCatalogDetail.episodes fora do esquema: esperado objeto (recebido: ${describe(episode)})`);
    }
    return episode.upstreamTempId === upstreamTid;
  });
}

/**
 * Número do episódio extraído da URL de `videoUrl` (último token numérico antes de `.mp4`).
 * @param {object} episode - Episódio publicado.
 * @param {string} label - Rótulo do episódio nas mensagens de erro.
 * @returns {number} Número do episódio.
 * @throws {Error} Se `videoUrl` não for texto ou não tiver número antes de `.mp4`.
 */
function readEpisodeUrlNumber(episode, label) {
  if (typeof episode.videoUrl !== 'string') {
    throw new Error(`${label}.videoUrl deve ser texto (recebido: ${describe(episode.videoUrl)})`);
  }
  const match = EPISODE_URL_NUMBER.exec(episode.videoUrl);
  if (match === null) {
    throw new Error(`${label}.videoUrl sem número antes de .mp4 (recebido: "${episode.videoUrl}")`);
  }
  return Number(match[1]);
}

/**
 * Ordena os episódios pelo número da URL e exige sequência contígua começando em 1.
 * @param {object[]} episodes - Episódios da temporada.
 * @returns {{ number: number, episode: object }[]|null} Episódios numerados, ou null quando a
 *   temporada é ambígua (URL sem número ou sequência com buraco).
 */
function numberEpisodes(episodes) {
  const numbered = [];
  for (const [index, episode] of episodes.entries()) {
    try {
      numbered.push({ number: readEpisodeUrlNumber(episode, `episodes[${index}]`), episode });
    } catch {
      return null;
    }
  }
  numbered.sort((a, b) => a.number - b.number);
  for (const [index, entry] of numbered.entries()) {
    if (entry.number !== index + 1) return null;
  }
  return numbered;
}

/**
 * Lê um texto opcional do esquema.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string|null} Texto ou null quando ausente.
 * @throws {Error} Se o valor não for texto nem null/undefined.
 */
function readOptionalText(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${label} fora do esquema: esperado texto ou null (recebido: ${describe(value)})`);
  }
  return value;
}

/**
 * Lê um ano opcional do esquema.
 * @param {*} value - Valor recebido.
 * @returns {number|null} Ano inteiro ou null quando ausente.
 * @throws {Error} Se o valor não for inteiro nem null/undefined.
 */
function readOptionalYear(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value)) {
    throw new Error(`year fora do esquema: esperado inteiro ou null (recebido: ${describe(value)})`);
  }
  return value;
}

/**
 * Indica se o valor é um objeto simples (não nulo e não lista).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Representação curta de um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
