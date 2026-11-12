/**
 * Lógica de extração do provedor (modelo): localiza o título na fonte e monta os streams.
 *
 * Segue o "Fluxo típico de um provedor" de src/_blocks/index.md. O código abaixo funciona contra
 * uma fonte fictícia, descrita aqui para que cada passo tenha um exemplo concreto. Troque as
 * constantes e os trechos marcados com "SUBSTITUA" pelo que a fonte real usa:
 * 1. Busca: `${SOURCE_URL}/?s=duna+parte+dois` lista os resultados como
 *    `<a class="item" href="/filme/duna-parte-dois/" data-year="2024">Duna: Parte Dois</a>`.
 * 2. Página do filme (ou do episódio, em `<página da série>temporada-1/episodio-2/`) traz o player como
 *    `<div id="player" data-player="https://player.fonte.exemplo/e/abc" data-server="Filemoon" data-audio="Dublado"></div>`.
 * 3. Página do player traz o vídeo num script:
 *    `<script>var file = "https:\/\/cdn.fonte.exemplo\/v\/master.m3u8"; var label = "1080p"; var size = "2.1 GB";</script>`.
 *
 * Erros (rede, parsing, dado ausente) são lançados com mensagem clara e sobem até `getStreams`.
 * Só a ausência esperada (a fonte não tem o título) vira lista vazia.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage, fetchText, playbackHeaders } from '../_blocks/http/index.mjs';
import { extractDataAttribute, extractScriptString } from '../_blocks/script-extract/index.mjs';
import { slugify } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';

// SUBSTITUA: endereço da fonte, sem barra no final.
const SOURCE_URL = 'https://fonte.exemplo';
// SUBSTITUA: tipo do stream que a fonte entrega (ex.: 'hls' para m3u8, 'mp4').
const STREAM_TYPE = 'hls';
// SUBSTITUA: idioma das legendas externas, se a fonte oferecer (ver passo 5).
const SUBTITLE_LANGUAGE = 'Português';
// SUBSTITUA: resultado da busca na fonte fictícia (grupos: 1 = href, 2 = ano, 3 = título).
const SEARCH_RESULT = /<a class="item" href="([^"]+)"(?: data-year="(\d{4})")?>([^<]+)<\/a>/;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} SearchResult
 * @property {string} title - Título do resultado na fonte.
 * @property {string|null} year - Ano de 4 dígitos ou null quando a fonte não informa.
 * @property {string} url - Endereço absoluto da página do resultado.
 */

/**
 * Localiza o título na fonte e monta os streams.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio quando a fonte não tem o título.
 * @throws {Error} Em falha de rede, parsing ou dado ausente na fonte.
 */
export async function extractStreams(request, providerName) {
  // 1. Valida temporada e episódio antes de qualquer requisição (null para filmes).
  const episode = readEpisode(request);

  // 2. Dados do TMDB: título em PT-BR, título original, ano e IMDb.
  //    ADAPTE: se a fonte aceita o ID do TMDB (ou o `media.imdbId`) no endereço, monte a URL do
  //    conteúdo com ele e pule o passo 3. Se a fonte também traz o título, `getMediaInfo` pode sair.
  //    Sem TMDB_API_KEY (ex.: no Node), lança aqui, antes de qualquer acesso à fonte.
  const media = await getMediaInfo(request);

  // 3. Busca por nome e escolha do resultado que corresponde ao título do TMDB.
  const searchHtml = await fetchText(searchUrl(media));
  const match = findBestMatch(parseSearchResults(searchHtml), media);
  // null é ausência esperada: a fonte não tem o título. Não é erro, então não há log.
  if (match === null) return [];

  // 4. Página do conteúdo -> player -> link do vídeo.
  const contentUrl = contentPageUrl(match.candidate.url, episode);
  const contentHtml = await fetchText(contentUrl);
  const playerUrl = required(extractDataAttribute(contentHtml, 'player'), `data-player em ${contentUrl}`);
  // fetchPage devolve a URL final após redirecionamentos: é ela que a hospedagem espera no Referer.
  const player = await fetchPage(playerUrl, { profile: 'player', headers: { Referer: contentUrl } });
  // ADAPTE: outras formas de achar o link estão no bloco script-extract (extractScriptJson para
  // listas de fontes, extractJsRedirect para players que redirecionam por script).
  const videoUrl = required(extractScriptString(player.text, 'file'), `file no player ${player.url}`);

  // 5. Montagem do stream. Preencha todos os opcionais que a fonte fornecer (docs/arch.md, seção 5).
  //    ADAPTE: com vários servidores ou qualidades, repita os passos 4 e 5 para cada um e devolva todos.
  //    Magnet: passe o link em `url`, sem `headers`; `buildStream` preenche `infoHash`. Informe `size`,
  //    `seeders` e `peers` quando a fonte trouxer. O `name` e o `title` vêm do formatador (`format`).
  const server = required(extractDataAttribute(contentHtml, 'server'), `data-server em ${contentUrl}`);
  const fields = {
    url: videoUrl,
    language: required(extractDataAttribute(contentHtml, 'audio'), `data-audio em ${contentUrl}`),
    headers: playbackHeaders(player.url),
    provider: server,
    type: STREAM_TYPE,
    format: formatDetails(providerName, media, episode),
  };
  // A qualidade é opcional: sem ela, `buildStream` descobre em `qualityHints`, no arquivo, na pasta
  // e na URL; sem correspondência, o stream sai com "Desconhecida" e não é descartado.
  const quality = extractScriptString(player.text, 'label');
  if (quality !== null) fields.quality = quality;
  // Opcionais que a fonte nem sempre traz: só entram quando existem.
  const size = extractScriptString(player.text, 'size');
  if (size !== null) fields.size = size;
  const subtitleUrl = extractScriptString(player.text, 'subtitle');
  if (subtitleUrl !== null) fields.subtitles = [{ url: subtitleUrl, language: SUBTITLE_LANGUAGE }];

  return [buildStream(fields)];
}

/**
 * Lê temporada e episódio do pedido.
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
 * Monta a URL de busca da fonte.
 * SUBSTITUA pelo formato da fonte. Alternativa para buscas que aceitam o título como está:
 * `${SOURCE_URL}/?s=${encodeURIComponent(media.title)}`. `slugify` lança erro para títulos sem letras
 * latinas nem números (ex.: em coreano); nesses casos, busque pelo título original ou use encodeURIComponent.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string} URL de busca.
 * @throws {Error} Se o título não gerar slug.
 */
function searchUrl(media) {
  return `${SOURCE_URL}/?s=${slugify(media.title, { separator: '+' })}`;
}

/**
 * Lê os resultados do HTML da busca.
 * SUBSTITUA: este parsing é específico da fonte. O exemplo usa uma expressão regular
 * (SEARCH_RESULT) sobre a marcação descrita no topo do arquivo. Com cheerio, o equivalente é:
 * `import cheerio from 'cheerio-without-node-native';` e
 * `const $ = cheerio.load(html); $('a.item')` lendo `attr('href')`, `attr('data-year')` e `text()`.
 * No NuvioTV, o cheerio aceita só a API básica (docs/arch.md, seção 3, item 7).
 * Lista vazia (a busca não achou nada) é válida e leva a `findBestMatch` a retornar null. Se a fonte
 * exibir uma mensagem de "nenhum resultado", vale conferi-la para distinguir de uma mudança no layout.
 * @param {string} html - HTML da página de busca.
 * @returns {SearchResult[]} Resultados na ordem da página.
 */
function parseSearchResults(html) {
  const results = [];
  // RegExp nova a cada chamada: a flag "g" guarda estado (lastIndex) entre execuções.
  const pattern = new RegExp(SEARCH_RESULT, 'g');
  let match;
  while ((match = pattern.exec(html)) !== null) {
    results.push({
      title: match[3].trim(),
      year: match[2] === undefined ? null : match[2],
      url: new URL(match[1], SOURCE_URL).href,
    });
  }
  return results;
}

/**
 * Endereço da página que contém o player: a do filme ou a do episódio da série.
 * SUBSTITUA pelo formato de episódio da fonte.
 * @param {string} resultUrl - Página do resultado escolhido na busca.
 * @param {{ season: number, episode: number }|null} episode - Temporada e episódio; null em filmes.
 * @returns {string} URL absoluta da página.
 */
function contentPageUrl(resultUrl, episode) {
  if (episode === null) return resultUrl;
  return new URL(`temporada-${episode.season}/episodio-${episode.episode}/`, resultUrl).href;
}

/**
 * Detalhes do stream para o formatador (bloco custom-formatter), que gera o `name` e o `title`.
 * ADAPTE: acrescente o que a fonte entregar (filename, source, encode, releaseGroup, languages,
 * bitrate, duration etc.; lista no JSDoc de `formatStream`). Campo sem dado não entra.
 * @param {string} providerName - Nome do provedor exibido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {{ season: number, episode: number }|null} episode - Temporada e episódio; null em filmes.
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

/**
 * Exige um valor que a fonte deveria fornecer. Os blocos de extração retornam null quando não
 * encontram; para dado obrigatório isso indica mudança na fonte e vira erro.
 * @param {string|null} value - Valor extraído.
 * @param {string} description - O que faltou e onde, para a mensagem de erro.
 * @returns {string} O próprio valor.
 * @throws {Error} Se o valor for null.
 */
function required(value, description) {
  if (value === null) throw new Error(`Não encontrado: ${description}`);
  return value;
}
