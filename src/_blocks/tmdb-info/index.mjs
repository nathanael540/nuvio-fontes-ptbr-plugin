/**
 * Bloco tmdb-info: dados de um filme ou série no TMDB a partir do ID recebido pelo app.
 *
 * Útil quando a fonte não aceita o ID do TMDB e exige busca por nome ou endereço com o título.
 * Usa a chave que o NuvioMobile e o NuvioTV entregam ao plugin em `globalThis.TMDB_API_KEY`;
 * nenhuma chave fica no repositório.
 */

const TMDB_API_URL = 'https://api.themoviedb.org/3';
const LANGUAGE = 'pt-BR';
const BRAZIL = 'BR';
const ANIMATION_GENRE_ID = 16;
// Idiomas originais tratados como dorama quando a série não é animação (TMDB usa "cn" para cantonês).
const DORAMA_LANGUAGES = ['ko', 'zh', 'cn', 'ja', 'th'];

/**
 * @typedef {'movie'|'series'|'anime'|'dorama'} MediaKind
 */

/**
 * @typedef {object} RomajiTitle
 * @property {string} title - Título em romaji ou romanizado.
 * @property {number|null} season - Temporada nomeada pelo tipo do título (ex.: `Season 2 Romaji`); `null` quando o tipo não nomeia temporada.
 */

/**
 * @typedef {object} SeasonInfo
 * @property {number} number - Número da temporada no TMDB (0 para especiais).
 * @property {string} name - Nome da temporada.
 * @property {string|null} airDate - Data de estreia no formato AAAA-MM-DD; `null` quando ausente.
 * @property {number|null} year - Ano de estreia derivado de `airDate`; `null` quando ausente.
 * @property {number} episodeCount - Quantidade de episódios informada pelo TMDB.
 */

/**
 * @typedef {object} MediaInfo
 * @property {string} tmdbId - ID numérico do TMDB.
 * @property {'movie'|'tv'} mediaType - Tipo recebido do app.
 * @property {MediaKind} kind - Classificação: anime (animação japonesa), dorama (série asiática que não é animação), filme ou série.
 * @property {string} title - Título em português do Brasil. Sem tradução no TMDB, vem o título padrão do próprio TMDB.
 * @property {string} originalTitle - Título no idioma original.
 * @property {number|null} year - Ano de lançamento; `null` quando o TMDB não tem data.
 * @property {string|null} imdbId - ID do IMDb (ex.: "tt15239678"); `null` quando o TMDB não tem.
 * @property {string[]} alternativeTitles - Títulos alternativos registrados para o Brasil, sem repetir `title`.
 * @property {RomajiTitle[]} romajiTitles - Títulos romaji/romanizados de `alternative_titles`, sem repetir título e temporada.
 * @property {SeasonInfo[]} seasons - Temporadas regulares e especiais da série, na ordem do TMDB, incluindo a temporada 0; lista vazia em filme ou quando o TMDB não traz a lista.
 * @property {string} originalLanguage - Código ISO 639-1 do idioma original (ex.: "en", "ja").
 * @property {string[]} originCountries - Códigos ISO 3166-1 dos países de origem.
 * @property {number[]} genreIds - IDs de gênero do TMDB.
 */

/**
 * Obtém título, ano, ID do IMDb e classificação de um filme ou série no TMDB, em português do Brasil.
 *
 * Faz uma única requisição à API do TMDB. Para séries, retorna os dados da série (não do episódio).
 *
 * @param {{ tmdbId: string|number, mediaType: 'movie'|'tv' }} request - Mesmos valores que o app passa para `getStreams`.
 * @returns {Promise<MediaInfo>} Dados do título.
 * @throws {Error} Se `tmdbId` não for numérico, se `mediaType` for inválido, se o app não fornecer
 *   `TMDB_API_KEY`, se o TMDB responder com erro HTTP ou se a resposta não tiver os campos esperados.
 * @example
 * const info = await getMediaInfo({ tmdbId: '693134', mediaType: 'movie' });
 * // info.title === 'Duna: Parte Dois', info.year === 2024, info.kind === 'movie'
 */
export async function getMediaInfo(request) {
  const tmdbId = String(request.tmdbId).trim();
  const { mediaType } = request;

  if (!/^\d+$/.test(tmdbId)) {
    throw new Error(`tmdbId inválido: "${request.tmdbId}" (esperado ID numérico do TMDB)`);
  }
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error(`mediaType inválido: "${mediaType}" (esperado "movie" ou "tv")`);
  }

  const url =
    `${TMDB_API_URL}/${mediaType}/${tmdbId}` +
    `?api_key=${encodeURIComponent(readApiKey())}` +
    `&language=${LANGUAGE}` +
    '&append_to_response=external_ids,alternative_titles';

  const response = await fetch(url);
  if (!response.ok) {
    // A URL não entra na mensagem para não expor a chave nos logs.
    throw new Error(`TMDB respondeu HTTP ${response.status} para ${mediaType} ${tmdbId}`);
  }

  return toMediaInfo(await response.json(), tmdbId, mediaType);
}

/**
 * Lê a chave do TMDB entregue pelo app.
 * @returns {string}
 * @throws {Error} Se a chave não existir.
 */
function readApiKey() {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('TMDB_API_KEY indisponível: o app não forneceu a chave do TMDB ao plugin');
  }
  return key.trim();
}

/**
 * Converte a resposta do TMDB (filme ou série) em MediaInfo.
 * @param {object} data - JSON da API do TMDB com `external_ids` e `alternative_titles`.
 * @param {string} tmdbId
 * @param {'movie'|'tv'} mediaType
 * @returns {MediaInfo}
 * @throws {Error} Se faltar título, título original, IDs externos ou títulos alternativos.
 */
function toMediaInfo(data, tmdbId, mediaType) {
  const isMovie = mediaType === 'movie';
  const title = isMovie ? data.title : data.name;
  const originalTitle = isMovie ? data.original_title : data.original_name;
  const releaseDate = isMovie ? data.release_date : data.first_air_date;
  const alternatives = data.alternative_titles && (isMovie ? data.alternative_titles.titles : data.alternative_titles.results);

  const context = `${mediaType} ${tmdbId}`;
  if (!title || !originalTitle) throw new Error(`TMDB não retornou título para ${context}`);
  if (!data.external_ids) throw new Error(`TMDB não retornou external_ids para ${context}`);
  if (!Array.isArray(alternatives)) throw new Error(`TMDB não retornou alternative_titles para ${context}`);

  const genreIds = (data.genres || []).map((genre) => genre.id);
  const originalLanguage = data.original_language;

  return {
    tmdbId,
    mediaType,
    kind: classifyKind(mediaType, originalLanguage, genreIds),
    title,
    originalTitle,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    imdbId: data.external_ids.imdb_id || null,
    alternativeTitles: brazilianAlternativeTitles(alternatives, title),
    romajiTitles: romajiAlternativeTitles(alternatives),
    seasons: isMovie ? [] : readSeasons(data.seasons),
    originalLanguage,
    originCountries: data.origin_country || [],
    genreIds,
  };
}

/**
 * Títulos romaji ou romanizados de `alternative_titles`, sem repetir título e temporada.
 * @param {{ title: string, type?: string }[]} alternatives
 * @returns {RomajiTitle[]}
 */
function romajiAlternativeTitles(alternatives) {
  const titles = [];
  const seen = new Set();
  for (const item of alternatives) {
    if (!item || typeof item !== 'object') continue;
    const type = typeof item.type === 'string' ? item.type : '';
    if (!/romaji|romanized/i.test(type)) continue;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (title === '') continue;
    const match = /season\s+(\d+)/i.exec(type);
    const season = match ? Number(match[1]) : null;
    const key = `${title.toLowerCase()}\u0000${season === null ? '' : season}`;
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push({ title, season });
  }
  return titles;
}

/**
 * Lê as temporadas da resposta de série, preservando a temporada 0 e a ordem do TMDB.
 * Resposta sem a lista é série sem esse dado; filme e série sem `seasons` devolvem lista vazia.
 * @param {*} raw - Valor de `data.seasons`.
 * @returns {SeasonInfo[]}
 * @throws {Error} Se a lista existir com uma temporada sem número ou sem contagem de episódios.
 */
function readSeasons(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((season) => {
    const { season_number: number, episode_count: episodeCount, name, air_date: airDate } = season;
    if (!Number.isInteger(number) || !Number.isInteger(episodeCount)) {
      throw new Error('TMDB retornou temporada sem número ou contagem de episódios');
    }
    return {
      number,
      episodeCount,
      name: typeof name === 'string' ? name : '',
      airDate: typeof airDate === 'string' && airDate !== '' ? airDate : null,
      year: readYear(airDate),
    };
  });
}

/**
 * Lê um ano de uma data do TMDB.
 * @param {*} value - Data em texto (ex.: "2024-02-27").
 * @returns {number|null} Ano de quatro dígitos ou `null` quando a data não existe ou está fora do formato.
 */
function readYear(value) {
  if (typeof value !== 'string' || !/^\d{4}/.test(value)) return null;
  return Number(value.slice(0, 4));
}

/**
 * Títulos alternativos do Brasil, sem duplicatas e sem repetir o título principal.
 * @param {{ iso_3166_1: string, title: string }[]} alternatives
 * @param {string} title
 * @returns {string[]}
 */
function brazilianAlternativeTitles(alternatives, title) {
  const titles = alternatives.filter((item) => item.iso_3166_1 === BRAZIL).map((item) => item.title);
  return [...new Set(titles)].filter((item) => item !== title);
}

/**
 * Classifica o título como anime, dorama, filme ou série.
 * @param {'movie'|'tv'} mediaType
 * @param {string} originalLanguage
 * @param {number[]} genreIds
 * @returns {MediaKind}
 */
function classifyKind(mediaType, originalLanguage, genreIds) {
  const isAnimation = genreIds.includes(ANIMATION_GENRE_ID);
  if (isAnimation && originalLanguage === 'ja') return 'anime';
  if (mediaType === 'movie') return 'movie';
  if (!isAnimation && DORAMA_LANGUAGES.includes(originalLanguage)) return 'dorama';
  return 'series';
}
