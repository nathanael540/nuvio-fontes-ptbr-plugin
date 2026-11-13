/**
 * Catálogo EmbedMovies e cadeia pública do player até os streams HLS.
 *
 * A busca aceita o ID do TMDB, confirma `tmdb_id` e `type` e devolve o campo `embed`, que aponta
 * para o invólucro `myembed.biz`. O bloco `fireplayer` segue esse invólucro até as opções do
 * PlayerFlix e resolve as que pertencem ao conjunto suportado; hosts fora dele são triagem.
 */

import { playEntries } from '../_blocks/fireplayer/index.mjs';
import { fetchJson } from '../_blocks/http/index.mjs';

const SOURCE_URL = 'https://embedmovies.org';
const SEARCH_URL = `${SOURCE_URL}/inc/Ajax.php`;
const PLAYER_HOSTS = ['myembed.biz', 'playerflix.ink'];

/**
 * Localiza o título no catálogo, monta o endereço do player e devolve os streams resolvidos.
 * @param {{tmdbId: string|number, mediaType: 'movie'|'tv', season: number|null, episode: number|null}} request - Pedido já validado.
 * @param {string} providerName - Nome do provedor no log e no formatador.
 * @returns {Promise<object[]>} Streams da cadeia; vazio em ausência reconhecida.
 * @throws {Error} Em falha de busca, contrato do catálogo ou de todas as opções.
 */
export async function extractStreams(request, providerName) {
  const item = await searchCatalog(request);
  if (item === null) return [];
  const entry = {
    url: playerUrl(item, request),
    referer: `${SOURCE_URL}/`,
    label: providerName,
    domain: 'embedmovies',
    languageHint: 'pt-br',
  };
  const meta = catalogMeta(item);
  if (meta !== null) entry.meta = meta;
  const { streams, failures } = await playEntries([entry], {
    logName: providerName,
    domain: 'embedmovies',
    request,
    identity: { tmdbId: String(request.tmdbId).trim(), imdbId: imdbIdOf(item) },
    providerName,
  });
  if (!streams.length && failures.length) {
    throw new Error(`Nenhuma opção entregou streams: ${failures.join('; ')}`);
  }
  return streams;
}

/**
 * Busca o ID do TMDB no catálogo e exige correspondência exata de identificador e tipo.
 * @param {{tmdbId: string|number, mediaType: 'movie'|'tv'}} request - Pedido já validado.
 * @returns {Promise<object|null>} Item confirmado ou null quando o catálogo não tem o título.
 * @throws {Error} Se a resposta não for 2xx, não for JSON ou estiver fora do contrato.
 */
async function searchCatalog(request) {
  const id = String(request.tmdbId).trim();
  const data = await fetchJson(SEARCH_URL, {
    method: 'POST',
    profile: 'api',
    headers: { Referer: `${SOURCE_URL}/` },
    form: { type: 'search', search: id },
  });
  if (!data || data.success !== true || !Array.isArray(data.results)) {
    throw new Error('Resposta da busca do catálogo fora do contrato');
  }
  return data.results.find((item) => item
    && Number(item.tmdb_id) === Number(id)
    && item.type === request.mediaType) || null;
}

/**
 * Usa o `embed` confirmado como player; em série, acrescenta temporada e episódio ao caminho.
 * @param {{embed?: string}} item - Item confirmado do catálogo.
 * @param {{mediaType: 'movie'|'tv', season: number|null, episode: number|null}} request - Pedido já validado.
 * @returns {string} Endereço do player.
 * @throws {Error} Se o `embed` faltar, não for HTTP(S) ou apontar para host fora da fonte.
 */
function playerUrl(item, request) {
  const embed = playerAddress(item.embed);
  if (embed === null) throw new Error('embed do catálogo ausente ou fora dos domínios do player');
  if (request.mediaType === 'movie') return embed.href;
  const base = embed.href.replace(/\/+$/, '');
  const episode = playerAddress(`${base}/${request.season}/${request.episode}`);
  if (episode === null) throw new Error('embed do catálogo não formou endereço de episódio válido');
  return episode.href;
}

/**
 * Valida um endereço HTTP(S) de um dos domínios públicos de player da fonte.
 * @param {unknown} value - Valor recebido do catálogo.
 * @returns {URL|null} URL aceita ou null.
 */
function playerAddress(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const allowed = PLAYER_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return allowed ? url : null;
  } catch {
    return null;
  }
}

/**
 * Título e ano do catálogo para o formatador; sem título, o bloco usa o título do PlayerFlix.
 * @param {object} item - Item confirmado do catálogo.
 * @returns {{title: string, year?: number}|null} Metadados ou null.
 */
function catalogMeta(item) {
  const title = localizedTitle(item.title);
  if (title === null) return null;
  const year = releaseYear(item.release_date);
  return year === null ? { title } : { title, year };
}

function localizedTitle(title) {
  if (!title || typeof title !== 'object') return null;
  for (const language of ['pt', 'en']) {
    const value = title[language];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function releaseYear(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

function imdbIdOf(item) {
  return typeof item.imdb_id === 'string' && item.imdb_id.trim() ? item.imdb_id.trim() : null;
}
