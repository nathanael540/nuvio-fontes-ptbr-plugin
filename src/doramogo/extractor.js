/**
 * Extrator do Doramogo: confirma a obra pelo ID do TMDB, escolhe a variante de áudio, seleciona
 * o episódio ou o filme e monta os streams HLS publicados pela página.
 *
 * A busca e o TMDB são etapas fatais. Cada página confirmada é uma variante de áudio independente:
 * a falha de uma vira aviso e não impede as demais; sem nenhum stream e com alguma falha, o erro
 * sobe com a causa de cada variante.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage, fetchText, playbackHeaders } from '../_blocks/http/index.mjs';
import { LANGUAGE, normalizeLanguage } from '../_blocks/language-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { buildHlsUrl, readDetailPage, readEpisodeConfig, readSearchCards } from './site.js';

const SOURCE_URL = 'https://www.doramogo.net';
const STREAM_TYPE = 'hls';
const PROVIDER_ID = 'doramogo';
const MIN_TITLE_SIMILARITY = 0.5;
const EPISODE_COORDINATE = /temporada-(\d+)\/episodio-(\d+)/;
const MOVIE_ENTRY = { season: 1, episode: 1 };

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./site.js').SearchCard} SearchCard
 * @typedef {import('./site.js').DetailPage} DetailPage
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} Candidate
 * @property {string} title - Título do cartão.
 * @property {string} url - URL da ficha.
 * @property {string|null} tmdbId - ID do pôster do cartão.
 * @property {{ url: string, page: DetailPage }|null} detail - Ficha já lida na confirmação, quando houver.
 * @property {string} [label] - Rótulo usado nos avisos de variante.
 */

/**
 * Localiza o título na fonte e monta os streams.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio quando a fonte não tem o título ou a coordenada.
 * @throws {Error} Em falha de rede, estrutura inválida, configuração ausente ou todas as variantes quebradas.
 */
export async function extractStreams(request, providerName) {
  const episode = readEpisode(request);
  const media = await getMediaInfo(request);
  const candidates = await findCandidates(media);
  if (candidates.length === 0) return [];

  const streams = [];
  const failures = [];
  for (const candidate of candidates) {
    try {
      const stream = await resolveCandidate(candidate, media, episode, providerName);
      if (stream !== null) streams.push(stream);
    } catch (error) {
      const label = candidate.label || candidate.title;
      failures.push({ label, error });
      console.warn(`[${providerName}] Opção ${label} descartada: ${error.message}`);
    }
  }

  if (streams.length === 0 && failures.length > 0) {
    const causes = failures.map(({ label, error }) => `${label}=${error.message}`).join('; ');
    throw new Error(`Nenhuma variante de áudio produziu stream: ${causes}`);
  }
  return streams;
}

/**
 * Lê temporada e episódio do pedido antes de qualquer requisição.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @returns {{ season: number, episode: number }|null} Temporada e episódio em séries; null em filmes.
 * @throws {Error} Se uma série vier sem temporada ou episódio inteiros a partir de 1.
 */
function readEpisode(request) {
  if (request.mediaType !== 'tv') return null;
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { season, episode };
}

/**
 * Consulta a busca com as variantes de título do TMDB até confirmar candidatos.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<Candidate[]>} Páginas confirmadas, deduplicadas por URL.
 * @throws {Error} Em falha de rede ou resposta que não é a página de busca esperada.
 */
async function findCandidates(media) {
  for (const title of titleQueries(media)) {
    const url = `${SOURCE_URL}/search/?q=${encodeURIComponent(title)}`;
    const html = await fetchText(url);
    const cards = readSearchCards(html, SOURCE_URL);
    const candidates = await confirmCards(cards, media);
    if (candidates.length > 0) return candidates;
  }
  return [];
}

/**
 * Variantes de título para a busca, sem repetir a mesma consulta.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Títulos PT-BR, original e alternativos.
 */
function titleQueries(media) {
  const seen = new Set();
  const queries = [];
  for (const value of [media.title, media.originalTitle, ...media.alternativeTitles]) {
    if (typeof value !== 'string') continue;
    const title = value.trim();
    if (title === '') continue;
    const key = normalizeText(title) || title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(title);
  }
  return queries;
}

/**
 * Confirma cartões do tipo pedido pelo ID do TMDB no pôster; sem ID no cartão, consulta a ficha.
 * @param {SearchCard[]} cards - Cartões da busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<Candidate[]>} Páginas confirmadas, sem URL repetida.
 * @throws {Error} Se a ficha necessária para confirmar um cartão sem ID for inválida.
 */
async function confirmCards(cards, media) {
  const expectedType = media.mediaType === 'movie' ? 'filme' : 'dorama';
  const confirmed = [];
  const seen = new Set();
  for (const card of cards) {
    if (normalizeText(card.type) !== expectedType) continue;
    if (card.tmdbId !== null) {
      if (card.tmdbId === media.tmdbId) addCandidate(confirmed, seen, card, null);
      continue;
    }
    if (!plausibleTitle(card.title, media)) continue;
    const page = await fetchPage(card.url);
    const detail = readDetailPage(page.text);
    if (detail.tmdbId !== media.tmdbId) continue;
    addCandidate(confirmed, seen, card, { url: page.url, page: detail });
  }
  return confirmed;
}

/**
 * Verifica se o título do cartão sem ID é próximo o bastante para consultar a ficha.
 * @param {string} cardTitle - Título exibido no cartão.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {boolean}
 */
function plausibleTitle(cardTitle, media) {
  return [media.title, media.originalTitle, ...media.alternativeTitles]
    .some((title) => titleSimilarity(cardTitle, title) >= MIN_TITLE_SIMILARITY);
}

/**
 * Acrescenta um candidato, ignorando URL repetida.
 * @param {Candidate[]} confirmed - Lista em construção.
 * @param {Set<string>} seen - URLs já confirmadas.
 * @param {SearchCard} card - Cartão confirmado.
 * @param {{ url: string, page: DetailPage }|null} detail - Ficha já lida, quando houver.
 * @returns {void}
 */
function addCandidate(confirmed, seen, card, detail) {
  if (seen.has(card.url)) return;
  seen.add(card.url);
  confirmed.push({ title: card.title, url: card.url, tmdbId: card.tmdbId, detail });
}

/**
 * Resolve uma variante de áudio: ficha, episódio ou filme, configuração e stream.
 * @param {Candidate} candidate - Página confirmada.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {{ season: number, episode: number }|null} episode - Coordenada em séries; null em filmes.
 * @param {string} providerName - Nome do provedor no formatador.
 * @returns {Promise<Stream|null>} Stream ou null quando a coordenada não existe na fonte.
 * @throws {Error} Em ficha, episódio ou configuração inválidos.
 */
async function resolveCandidate(candidate, media, episode, providerName) {
  const detail = candidate.detail || await loadDetail(candidate.url);
  candidate.label = detail.page.audioLabel || candidate.title;

  const selected = selectEntry(detail.page, media.mediaType, episode);
  if (selected === null) return null;

  const page = await fetchPage(selected.url);
  if (!keepsCoordinate(page.url, selected.url, episode, media.mediaType)) return null;

  const config = readEpisodeConfig(page.text);
  if (!matchesRequest(config, media.mediaType, episode, slugFromUrl(detail.url))) return null;

  const language = detail.page.audioLabel === null
    ? LANGUAGE.UNKNOWN
    : normalizeLanguage(detail.page.audioLabel) || LANGUAGE.UNKNOWN;

  return buildStream({
    url: buildHlsUrl(config),
    headers: playbackHeaders(page.url),
    language,
    provider: PROVIDER_ID,
    type: STREAM_TYPE,
    format: formatDetails(providerName, media, episode),
  });
}

/**
 * Lê e valida a ficha de um candidato que ainda não teve a página carregada.
 * @param {string} url - URL da ficha.
 * @returns {Promise<{ url: string, page: DetailPage }>} URL final e ficha lida.
 * @throws {Error} Se a ficha for inválida.
 */
async function loadDetail(url) {
  const page = await fetchPage(url);
  return { url: page.url, page: readDetailPage(page.text) };
}

/**
 * Escolhe a entrada da ficha: o episódio pedido ou o pseudoepisódio de filme.
 * @param {DetailPage} detail - Ficha lida.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {{ season: number, episode: number }|null} episode - Coordenada em séries; null em filmes.
 * @returns {import('./site.js').EpisodeLink|null} Entrada correspondente ou null.
 * @throws {Error} Se a ficha de série não tiver lista de episódios.
 */
function selectEntry(detail, mediaType, episode) {
  if (mediaType === 'movie') {
    return detail.episodes.find((item) => item.season === MOVIE_ENTRY.season && item.episode === MOVIE_ENTRY.episode) || null;
  }
  if (detail.episodes.length === 0) throw new Error('Ficha da série sem lista de episódios');
  return detail.episodes.find((item) => item.season === episode.season && item.episode === episode.episode) || null;
}

/**
 * Confere se a página do episódio manteve a coordenada pedida após redirecionamentos.
 * @param {string} finalUrl - URL final da resposta.
 * @param {string} selectedUrl - URL escolhida na ficha.
 * @param {{ season: number, episode: number }|null} episode - Coordenada em séries; null em filmes.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @returns {boolean} Falso quando a página redirecionou para outra coordenada.
 */
function keepsCoordinate(finalUrl, selectedUrl, episode, mediaType) {
  if (mediaType === 'movie') return normalizePath(finalUrl) === normalizePath(selectedUrl);
  const match = EPISODE_COORDINATE.exec(normalizePath(finalUrl));
  return Boolean(match) && Number(match[1]) === episode.season && Number(match[2]) === episode.episode;
}

/**
 * Valida a configuração publicada contra o pedido e o slug da ficha.
 * @param {import('./site.js').EpisodeConfig} config - Configuração lida da página.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {{ season: number, episode: number }|null} episode - Coordenada em séries; null em filmes.
 * @param {string} slug - Slug da ficha confirmada.
 * @returns {boolean} Falso quando o tipo ou a coordenada divergem do pedido.
 * @throws {Error} Se o slug publicado divergir do slug da ficha.
 */
function matchesRequest(config, mediaType, episode, slug) {
  if (config.tipo !== (mediaType === 'movie' ? 'filmes' : 'doramas')) return false;
  if (config.slug !== slug) {
    throw new Error(`urlConfig com slug "${config.slug}" diverge da ficha "${slug}"`);
  }
  if (mediaType === 'movie') {
    return config.season === MOVIE_ENTRY.season && config.episode === MOVIE_ENTRY.episode;
  }
  return config.season === episode.season && config.episode === episode.episode;
}

/**
 * Extrai o slug da ficha a partir da URL final.
 * @param {string} url - URL da ficha.
 * @returns {string} Último segmento do caminho.
 */
function slugFromUrl(url) {
  const path = new URL(url).pathname.replace(/\/+$/, '');
  const parts = path.split('/');
  return parts[parts.length - 1];
}

/**
 * Normaliza o caminho de uma URL para comparação.
 * @param {string} url - URL recebida.
 * @returns {string} Caminho sem barra final.
 */
function normalizePath(url) {
  return new URL(url).pathname.replace(/\/+$/, '');
}

/**
 * Detalhes do stream para o formatador, que gera `name` e `title`.
 * @param {string} providerName - Nome do provedor exibido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {{ season: number, episode: number }|null} episode - Coordenada em séries; null em filmes.
 * @returns {object} Valor do campo `format` de `buildStream`.
 */
function formatDetails(providerName, media, episode) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (episode !== null) {
    format.season = episode.season;
    format.episode = episode.episode;
  }
  return format;
}
