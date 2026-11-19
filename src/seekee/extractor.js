/**
 * Extrator do provedor Seekee.
 *
 * Busca o título na API pública do Seekee (`api.js`), confirma o resultado pelo TMDB e abre a página
 * `/pt/detail/<movie|drama>/<slug>[/<episódio>]` na rede de espelhos, que publica no `__NEXT_DATA__`
 * as playlists HLS (`mediaInfoList`), as legendas (`episodeVo[].subtitlingList`), as temporadas
 * (`seasons`) e as versões de áudio (`dubbingList`) do título.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchText } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { searchSeekee } from './api.js';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} StreamRequest
 */

/**
 * @typedef {object} Candidate
 * @property {'movie'|'drama'} type - Tipo do caminho na fonte.
 * @property {string} websiteParam - Identificador e slug da página (`<id>-<Slug>`).
 * @property {number|null} season - Temporada indicada no título (`Temporada N`/`Season N`).
 * @property {number} score - Maior semelhança do título ou do slug com os títulos do TMDB.
 */

// `h5.onfilom.com`, devolvido pela busca, responde 403 do Cloudflare; os espelhos servem os mesmos caminhos.
const MIRRORS = [
  'es.cuevana4br.com',
  'play.cuevana19.com',
  'flixlat.com',
  'latino.solo-latino.com',
  'video.playspelis.com',
  'www3.dramasfree.com',
  'ww20.321moviesfree.com',
];
// Os espelhos respondem 403 ao User-Agent de Chrome desktop do bloco http; o de Chrome Android passa.
const MIRROR_HEADERS = Object.freeze({
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
});
const DETAIL_URL =/^https?:\/\/[^/]+\/pt\/detail\/(movie|drama)\/([^/?#]+)/;
const NEXT_DATA = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/;
const LANGUAGE_PREFIX = /^\s*\[[^\]]*\]\s*/;
const BRACKET_SUFFIX = /\s*\[[^\]]*\]\s*$/;
const SEASON_SUFFIX = /\s*(?:Temporada|Season)\s*(\d+)\s*$/i;
// Índice + 2 é o valor: II = 2 ... X = 10. "V" fica de fora por colidir com títulos como "V de Vingança".
const ROMAN_NUMERALS = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const TYPE_CODE = Object.freeze({ movie: 'movie', tv: 'drama' });
const MIN_SCORE = 0.85;
const YEAR_TOLERANCE = 1;
const QUALITY_BY_DEFINITION = Object.freeze({
  GROOT_HD: '1080p',
  GROOT_SD: '720p',
  GROOT_LD: '540p',
  GROOT_FD: '360p',
});
const PORTUGUESE_AUDIO = 'pt';
// `languageName` "Áudio Português-PT" marca português de Portugal, mesmo com rótulo 🇧🇷 na busca.
const EUROPEAN_PORTUGUESE = /portugu[eê]s[\s-]*(?:pt|portugal)\b/i;
const ORIGINAL_AUDIO_MODE = '0';
// `pt`, `pt_BR`, `pt-br` e `pob` (código de legenda brasileira) contam como legenda em português.
const PORTUGUESE_SUBTITLE = /^(?:pt|pob)(?:[_-]|$)/i;

/**
 * Remove URL e hashes longos da mensagem para os logs não carregarem tokens `hdnts` do CDN.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}

/**
 * Localiza os streams do pedido: TMDB, busca assinada, página confirmada e versões de áudio.
 * @param {StreamRequest} request - Pedido validado.
 * @param {string} providerName - Nome exibido no formato e nos logs.
 * @returns {Promise<Stream[]>} Streams sem URL repetida; lista vazia em ausência reconhecida.
 * @throws {Error} Em falha do TMDB, da busca, dos espelhos ou quando nenhuma versão de áudio produz stream.
 */
export async function extractStreams(request, providerName) {
  const media = await getMediaInfo(request);
  const candidate = await findCandidate(media, request);
  if (candidate === null) return [];

  const loadPage = createPageLoader();
  const page = await openRequestedPage(candidate, request, loadPage);
  if (page === null || selectEpisode(page, request) === null) return [];

  const streams = [];
  const failures = [];
  for (const variant of selectVariants(page)) {
    const label = variantLabel(variant);
    try {
      const variantPage = variant.websiteParam === page.websiteParam
        ? page
        : await loadPage(detailPath(candidate.type, variant.websiteParam, request));
      streams.push(...buildVariantStreams(variantPage, media, request, providerName));
    } catch (error) {
      const reason = sanitizeMessage(error.message);
      console.warn(`[${providerName}] Opção ${label} descartada: ${reason}`);
      failures.push(`${label}: ${reason}`);
    }
  }

  if (streams.length === 0 && failures.length > 0) {
    throw new Error(`Nenhuma versão de áudio produziu stream (${failures.join('; ')})`);
  }
  const seen = new Set();
  return streams.filter((stream) => !seen.has(stream.url) && seen.add(stream.url));
}

/**
 * Busca pelo título PT-BR, original e alternativos, parando no primeiro termo com resultado confirmado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido validado.
 * @returns {Promise<Candidate|null>} Resultado escolhido, ou `null` quando a fonte não tem o título.
 */
async function findCandidate(media, request) {
  const queries = [];
  for (const title of [media.title, media.originalTitle].concat(media.alternativeTitles)) {
    const query = typeof title === 'string' ? title.trim() : '';
    if (query !== '' && !queries.includes(query)) queries.push(query);
  }
  for (const query of queries) {
    const confirmed = (await searchSeekee(query))
      .map((result) => confirmResult(result, media, request))
      .filter((candidate) => candidate !== null);
    if (confirmed.length > 0) return chooseCandidate(confirmed, request);
  }
  return null;
}

/**
 * Confirma tipo, título (ou slug) e ano de um resultado da busca.
 * @param {object} result - Item de `data` da busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido validado.
 * @returns {Candidate|null} Candidato confirmado, ou `null` quando o resultado não corresponde ao pedido.
 */
function confirmResult(result, media, request) {
  if (result === null || typeof result !== 'object' || result.typeCode !== TYPE_CODE[request.mediaType]) return null;
  const match = DETAIL_URL.exec(String(result.resourceUrl));
  if (match === null) return null;
  const websiteParam = match[2];

  const title = String(result.resourceTitle || '').replace(LANGUAGE_PREFIX, '');
  // O slug pode trazer o idioma no fim (`...-Season-2[Audio-pt-BR]`).
  const slug = websiteParam.slice(websiteParam.indexOf('-') + 1).replace(BRACKET_SUFFIX, '').replace(/-/g, ' ');
  const seasonMatch = SEASON_SUFFIX.exec(title) || SEASON_SUFFIX.exec(slug);
  const baseTitle = title.replace(SEASON_SUFFIX, '');
  // A fonte pode acrescentar subtítulo ao nome (`Arcane: League of Legends` para `Arcane` no TMDB).
  const names = [baseTitle, baseTitle.split(':')[0], slug.replace(SEASON_SUFFIX, '')];
  const mediaTitles = [media.title, media.originalTitle].concat(media.alternativeTitles);
  let score = 0;
  for (const name of names) {
    for (const mediaTitle of mediaTitles) {
      score = Math.max(
        score,
        titleSimilarity(name, mediaTitle),
        titleSimilarity(arabicNumerals(name), arabicNumerals(mediaTitle)),
      );
    }
  }
  if (score < MIN_SCORE || !yearMatches(result.endYear, media.year, request.mediaType)) return null;

  return { type: match[1], websiteParam, season: seasonMatch ? Number(seasonMatch[1]) : null, score };
}

/**
 * Troca algarismos romanos isolados de II a X por arábicos (`Gladiador II` e `Gladiador 2`, como
 * publicados pela fonte e pelo TMDB). Usado só como comparação adicional à do texto original.
 * @param {string} title - Título.
 * @returns {string} Título com os numerais convertidos.
 */
function arabicNumerals(title) {
  return title.replace(/\b(?:II|III|IV|VI|VII|VIII|IX|X)\b/g, (numeral) => String(ROMAN_NUMERALS.indexOf(numeral) + 2));
}

/**
 * Em filme, o ano publicado deve coincidir (com tolerância de um ano). Em série, `endYear` é o ano da
 * temporada: só descarta temporada anterior à estreia da série.
 * @param {*} endYear - Ano publicado na busca.
 * @param {number|null} mediaYear - Ano do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @returns {boolean} Se o ano é compatível.
 */
function yearMatches(endYear, mediaYear, mediaType) {
  const year = Number(endYear);
  if (!Number.isInteger(year) || year <= 0 || mediaYear === null) return true;
  if (mediaType === 'movie') return Math.abs(year - mediaYear) <= YEAR_TOLERANCE;
  return year >= mediaYear - YEAR_TOLERANCE;
}

/**
 * Fica com os resultados de maior semelhança e, em série, prefere o da temporada pedida.
 * @param {Candidate[]} confirmed - Candidatos confirmados, na ordem da busca.
 * @param {StreamRequest} request - Pedido validado.
 * @returns {Candidate} Candidato escolhido.
 */
function chooseCandidate(confirmed, request) {
  const best = Math.max(...confirmed.map((candidate) => candidate.score));
  const top = confirmed.filter((candidate) => candidate.score === best);
  return top.find((candidate) => candidate.season === request.season) || top[0];
}

/**
 * Abre a página do pedido; em série, troca de temporada pela lista `seasons` quando o resultado
 * escolhido é de outra temporada.
 * @param {Candidate} candidate - Resultado confirmado.
 * @param {StreamRequest} request - Pedido validado.
 * @param {(path: string) => Promise<object>} loadPage - Carregador da rede de espelhos.
 * @returns {Promise<object|null>} `pageProps` da página, ou `null` quando a temporada não existe na fonte.
 * @throws {Error} Se a página da temporada indicada pela fonte vier com outra temporada.
 */
async function openRequestedPage(candidate, request, loadPage) {
  const page = await loadPage(detailPath(candidate.type, candidate.websiteParam, request));
  if (request.mediaType === 'movie' || pageSeason(page) === request.season) return page;

  const seasons = Array.isArray(page.seasons) ? page.seasons : [];
  const target = seasons.find((season) => Number(season.seriesNo) === request.season);
  if (target === undefined || typeof target.websiteParam !== 'string') return null;

  const seasonPage = await loadPage(detailPath(candidate.type, target.websiteParam, request));
  if (pageSeason(seasonPage) !== request.season) {
    throw new Error(`Página da temporada ${request.season} veio com a temporada ${pageSeason(seasonPage)}`);
  }
  return seasonPage;
}

/**
 * Temporada da página: `seriesNo` ou, quando nulo (série de temporada única), o `seriesNo` da
 * entrada de `seasons` que aponta para a própria página.
 * @param {object} page - `pageProps` da página.
 * @returns {number|null} Temporada, ou `null` quando a página não a informa.
 */
function pageSeason(page) {
  const declared = toSeason(page.seriesNo);
  if (declared !== null) return declared;
  const seasons = Array.isArray(page.seasons) ? page.seasons : [];
  const own = seasons.find((season) => season && season.websiteParam === page.websiteParam);
  return own === undefined ? null : toSeason(own.seriesNo);
}

/**
 * @param {*} value - `seriesNo` publicado.
 * @returns {number|null} Inteiro a partir de 1, ou `null` quando ausente ou inválido.
 */
function toSeason(value) {
  if (value === null || value === undefined || value === '') return null;
  const season = Number(value);
  return Number.isInteger(season) && season >= 1 ? season : null;
}

/**
 * Caminho da página na fonte; em série, já com o episódio.
 * @param {'movie'|'drama'} type - Tipo do caminho.
 * @param {string} websiteParam - Identificador e slug.
 * @param {StreamRequest} request - Pedido validado.
 * @returns {string} Caminho absoluto, sem domínio.
 */
function detailPath(type, websiteParam, request) {
  const path = `/pt/detail/${type}/${websiteParam.replace(/ /g, '%20')}`;
  return request.mediaType === 'tv' ? `${path}/${request.episode}` : path;
}

/**
 * Carregador de páginas da rede de espelhos. Troca de espelho só em erro de rede, HTTP fora de 2xx ou
 * página sem `__NEXT_DATA__`, e começa as próximas leituras pelo último espelho que respondeu.
 * @returns {(path: string) => Promise<object>} Função que devolve o `pageProps` do caminho.
 */
function createPageLoader() {
  let start = 0;
  return async function loadPage(path) {
    const failures = [];
    for (let offset = 0; offset < MIRRORS.length; offset += 1) {
      const index = (start + offset) % MIRRORS.length;
      try {
        const pageProps = readPageProps(await fetchText(`https://${MIRRORS[index]}${path}`, { headers: MIRROR_HEADERS }));
        start = index;
        return pageProps;
      } catch (error) {
        failures.push(`${MIRRORS[index]}: ${sanitizeMessage(error.message)}`);
      }
    }
    throw new Error(`Nenhum espelho entregou a página (${failures.join('; ')})`);
  };
}

/**
 * @param {string} html - Página do espelho.
 * @returns {object} `props.pageProps` do `__NEXT_DATA__`.
 * @throws {Error} Se a página não tiver `__NEXT_DATA__` com `pageProps`.
 */
function readPageProps(html) {
  const match = NEXT_DATA.exec(html);
  if (match === null) throw new Error('página sem __NEXT_DATA__');
  const data = JSON.parse(match[1]);
  const pageProps = data && data.props && data.props.pageProps;
  if (!pageProps || typeof pageProps !== 'object' || typeof pageProps.websiteParam !== 'string') {
    throw new Error('__NEXT_DATA__ sem pageProps do título');
  }
  return pageProps;
}

/**
 * Entrada do episódio pedido em `episodeVo`. Em série, a fonte devolve o episódio 1 quando o pedido
 * não existe, por isso exige `currentEpisodeNumber` igual ao episódio.
 * @param {object} page - `pageProps` da página.
 * @param {StreamRequest} request - Pedido validado.
 * @returns {object|null} Entrada do episódio, ou `null` quando o episódio não existe na página.
 * @throws {Error} Se a página não tiver `episodeVo`.
 */
function selectEpisode(page, request) {
  if (!Array.isArray(page.episodeVo) || page.episodeVo.length === 0) {
    throw new Error(`Página ${page.websiteParam} sem episodeVo`);
  }
  if (request.mediaType === 'movie') return page.episodeVo[0];
  if (Number(page.currentEpisodeNumber) !== request.episode) return null;
  return page.episodeVo.find((entry) => Number(entry.seriesNo) === request.episode) || null;
}

/**
 * Escolhe, entre a página aberta e `dubbingList`, a versão com áudio em português (a brasileira antes
 * da de Portugal) e a primeira em áudio original de outro idioma. Dublagens em terceiros idiomas
 * (`es`, `tr` etc.) ficam de fora.
 * @param {object} page - `pageProps` da página confirmada.
 * @returns {object[]} Versões com `websiteParam`, `audioLanguageCode` e `dubMode`, sem repetição.
 */
function selectVariants(page) {
  const options = [page].concat(Array.isArray(page.dubbingList) ? page.dubbingList : [])
    .filter((option) => option && typeof option.websiteParam === 'string');
  const portugueseOptions = options.filter((option) => option.audioLanguageCode === PORTUGUESE_AUDIO);
  const portuguese = portugueseOptions.find((option) => !isEuropeanPortuguese(option)) || portugueseOptions[0];
  const original = options.find((option) =>
    String(option.dubMode) === ORIGINAL_AUDIO_MODE && option.audioLanguageCode !== PORTUGUESE_AUDIO);
  const variants = [portuguese, original].filter((option) => option !== undefined);
  return variants.filter((option, index) =>
    variants.findIndex((other) => other.websiteParam === option.websiteParam) === index);
}

/**
 * @param {object} variant - Versão de áudio.
 * @returns {string} Rótulo para logs.
 */
function variantLabel(variant) {
  return variant.audioLanguageCode === PORTUGUESE_AUDIO
    ? 'áudio português'
    : `áudio original (${variant.audioLanguageCode || 'idioma não informado'})`;
}

/**
 * Monta os streams HLS de uma versão de áudio.
 * @param {object} page - `pageProps` da versão.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido validado.
 * @param {string} providerName - Nome exibido no formato.
 * @returns {Stream[]} Streams da versão; lista vazia quando o episódio não existe nela.
 * @throws {Error} Se a página não tiver playlist em `mediaInfoList`.
 */
function buildVariantStreams(page, media, request, providerName) {
  const episode = selectEpisode(page, request);
  if (episode === null) return [];
  const playlists = (Array.isArray(page.mediaInfoList) ? page.mediaInfoList : [])
    .filter((item) => item && typeof item.mediaUrl === 'string' && /^https?:\/\//i.test(item.mediaUrl));
  if (playlists.length === 0) throw new Error(`Página ${page.websiteParam} sem playlist em mediaInfoList`);

  const subtitleList = Array.isArray(episode.subtitlingList) ? episode.subtitlingList : [];
  const language = classifyLanguage(page, subtitleList);
  const subtitles = subtitleList
    .filter((item) => item && typeof item.subtitlingUrl === 'string' && /^https?:\/\//i.test(item.subtitlingUrl))
    .map((item) => ({ url: item.subtitlingUrl, language: item.language || item.languageAbbr }));
  const definitions = Array.isArray(episode.definitionList) ? episode.definitionList : [];
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }

  return playlists.map((item) => {
    const definition = definitions.find((entry) => entry && entry.code === item.currentDefinition);
    const fields = {
      url: item.mediaUrl,
      format,
      language,
      qualityHints: [QUALITY_BY_DEFINITION[item.currentDefinition], definition && definition.description],
    };
    if (subtitles.length > 0) fields.subtitles = subtitles;
    return buildStream(fields);
  });
}

/**
 * @param {object} option - Página ou item de `dubbingList`.
 * @returns {boolean} Se `languageName` marca português de Portugal.
 */
function isEuropeanPortuguese(option) {
  return EUROPEAN_PORTUGUESE.test(String(option.languageName || ''));
}

/**
 * Áudio português sai `Dublado` (o catálogo `pt` é brasileiro), exceto quando `languageName` marca
 * Portugal, que sai `Dublado (Não PT-BR?)`; áudio estrangeiro com legenda em português sai
 * `Legendado`; sem ela, `Gringo`.
 * @param {object} page - `pageProps` da versão.
 * @param {object[]} subtitleList - `subtitlingList` do episódio.
 * @returns {string} Membro de `LANGUAGE`.
 */
function classifyLanguage(page, subtitleList) {
  if (page.audioLanguageCode === PORTUGUESE_AUDIO) {
    return isEuropeanPortuguese(page) ? LANGUAGE.DUBBED_NON_PT_BR : LANGUAGE.DUBBED;
  }
  const hasPortuguese = subtitleList.some((item) => item && PORTUGUESE_SUBTITLE.test(String(item.languageAbbr)));
  return hasPortuguese ? LANGUAGE.SUBTITLED : LANGUAGE.NON_PT_BR;
}
