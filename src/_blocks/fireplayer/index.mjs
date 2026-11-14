/**
 * Bloco fireplayer: cadeia de resolução dos agregadores de FirePlayer.
 *
 * Segue páginas do plenoflu/SuperCDN, PlayerFlix, GStream, myembed e VaiQueCol/embedplayer2
 * até o HLS final. A apresentação fica no bloco custom-formatter: o contexto informa `providerName`,
 * e o título e o ano vêm da mídia resolvida; o prefixo de log e a origem de catálogo também são
 * parâmetros.
 */

import { FORMATTER } from '../custom-formatter/index.mjs';
import { fetchJson, fetchPage, playbackHeaders } from '../http/index.mjs';
import { UNKNOWN_QUALITY } from '../quality-discovery/index.mjs';
import { normalizeText } from '../slugify/index.mjs';
import { LANGUAGE, normalizeLanguage } from '../language-discovery/index.mjs';
import { buildStream } from '../stream-build/index.mjs';

const MAX_HOPS = 6;
const PT = new Set(['pt', 'ptbr', 'por', 'portuguese', 'portugues', 'brasil', 'brazil', 'brazilian', 'legendado']);
const FOREIGN = new Set([
  'en', 'eng', 'english', 'es', 'spa', 'esp', 'spanish', 'latino', 'castellano', 'fr', 'fra', 'fre',
  'french', 'de', 'deu', 'ger', 'german', 'it', 'ita', 'italian', 'ja', 'jpn', 'japanese', 'ko', 'kor',
  'korean', 'zh', 'zho', 'chi', 'chinese', 'ru', 'rus', 'russian', 'ar', 'ara', 'arabic', 'tr', 'tur',
  'turkish', 'nl', 'nld', 'dut', 'dutch', 'pl', 'pol', 'polish', 'sv', 'swe', 'swedish', 'da', 'dan',
  'danish', 'nb', 'nor', 'norwegian', 'fi', 'fin', 'finnish', 'el', 'ell', 'gre', 'greek', 'he', 'heb',
  'hebrew', 'th', 'tha', 'thai', 'vi', 'vie', 'vietnamese', 'id', 'ind', 'indonesian', 'ms', 'msa',
  'may', 'malay', 'tl', 'tgl', 'filipino', 'uk', 'ukr', 'ukrainian', 'ro', 'ron', 'rum', 'romanian',
  'cs', 'ces', 'cze', 'czech', 'hu', 'hun', 'hungarian', 'fa', 'fas', 'per', 'persian', 'bn', 'ben',
  'bengali', 'ta', 'tam', 'tamil', 'te', 'tel', 'telugu', 'ml', 'mal', 'malayalam', 'ur', 'urd', 'urdu',
  'sw', 'swa', 'swahili', 'original',
]);
const DUB = new Set(['pt', 'ptbr', 'por', 'portuguese', 'portugues', 'dublado', 'dub', 'brasil', 'brazil', 'brazilian']);
const ORIGINAL = FOREIGN;

/**
 * @typedef {object} FireRequest
 * @property {'movie'|'tv'} mediaType - Tipo do pedido.
 * @property {number|string} tmdbId - ID do TMDB recebido do app.
 * @property {number|null} [season] - Temporada, em séries.
 * @property {number|null} [episode] - Episódio, em séries.
 */

/**
 * @typedef {object} FireEntry
 * @property {string} url - Endereço do player ou da página a seguir.
 * @property {string} referer - Contexto HTTP que autorizou a descoberta da opção.
 * @property {string} [label] - Rótulo da opção nos logs.
 * @property {string} [domain] - Origem usada nos logs; o contexto tem prioridade se ausente.
 * @property {string|null} [languageHint] - Idioma anunciado pela opção.
 * @property {string} [hash] - Hash de 32 hexadecimais conhecido, como `embed_id`.
 * @property {string} [budget] - Rótulo de orçamento do PlayerFlix; `danger` é triagem.
 * @property {{title: string, year: number|null}|null} [meta] - Título e ano da entrada.
 * @property {{url: string, text: string}} [page] - Página já baixada pelo chamador, para evitar nova requisição.
 */

/**
 * @typedef {object} FireResolved
 * @property {string} label - Rótulo da opção resolvida.
 * @property {string} domain - Origem usada nos logs.
 * @property {string} playerPage - URL da página final do FirePlayer.
 * @property {string} [playerHash] - Hash usado para obter o vídeo; ausente no WatchPlay.
 * @property {string} playlistUrl - URL da playlist HLS final.
 * @property {boolean} adaptive - Se o master depende de faixas externas.
 * @property {number|null} quality - Maior altura quando adaptativo.
 * @property {{url: string, quality: number}[]} variants - Variantes autossuficientes.
 * @property {'Dublado'|'Dublado (Não PT-BR?)'|'Legendado'|'Legendado (Não PT-BR?)'|null} language - Idioma comprovado.
 * @property {boolean} foreignOnly - Se a mídia comprova apenas áudio estrangeiro.
 * @property {{url: string, language: string, name?: string}[]} subtitles - Legendas validadas.
 * @property {Object<string, string>} headers - Cabeçalhos de reprodução do player final.
 * @property {{title: string, year: number|null}|null} meta - Título e ano da entrada.
 */

/**
 * @typedef {object} FireContext
 * @property {string} logName - Prefixo de log, como "DooPlay PT-BR".
 * @property {string} domain - Origem padrão dos logs quando a entrada não informa uma.
 * @property {FireRequest} request - Pedido recebido do app.
 * @property {{tmdbId?: number|string, imdbId?: string|null}} [identity] - Identidade conhecida do pedido.
 * @property {boolean} [directEpisode] - Usa `DIRECT_EPISODE_ID` do plenoflu quando `true`; padrão `false`, que mantém o fluxo legado por `TVSHOW_ID`.
 * @property {boolean} [resolveWatchplay] - Resolve a opção WatchPlay (`watchplay.shop`) em vez de descartá-la por triagem; padrão `false`. Opt-in do EmbedMovies.
 * @property {string} providerName - Nome do provedor exibido como `addon` do formatador; obrigatório em `buildStreams`.
 */

/**
 * Lê o HTML com a API básica do cheerio fornecido pelo app.
 *
 * O cheerio é carregado só durante o pedido, nunca no carregamento do módulo. Use `eq(i)` para
 * percorrer coleções, porque o NuvioTV não garante a indexação direta por colchetes.
 *
 * @param {string} html - HTML da página.
 * @returns {*} Função `$` do cheerio.
 * @throws {Error} Se o módulo do cheerio não estiver disponível no runtime.
 * @example
 * const $ = loadHtml('<div class="player" data-id="1"></div>');
 * $('.player').eq(0).attr('data-id'); // '1'
 */
export function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}

/**
 * Converte um valor em URL HTTP(S) absoluta.
 *
 * @param {string} value - Endereço absoluto ou relativo.
 * @param {string} base - Base para resolver endereços relativos.
 * @returns {string} URL absoluta.
 * @throws {Error} Se o valor estiver vazio, não for texto ou não usar HTTP(S).
 * @example
 * httpUrl('/embed/1', 'https://player.example'); // 'https://player.example/embed/1'
 */
export function httpUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Endereço obrigatório ausente');
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Endereço não é HTTP(S)');
  return url.href;
}

/**
 * Devolve a origem com barra final, forma aceita como Referer pela sondagem.
 *
 * @param {string} url - URL HTTP(S) de referência.
 * @returns {string} Origem com barra final.
 * @throws {Error} Se a URL for inválida ou não usar HTTP(S).
 * @example
 * originReferer('https://plenoflu.com/movie/1'); // 'https://plenoflu.com/'
 */
export function originReferer(url) {
  return new URL(url).origin + '/';
}

/**
 * Reconhece páginas de verificação ou bloqueio que não entregam mídia.
 *
 * @param {string} html - Corpo da resposta.
 * @returns {string|null} Motivo da triagem, ou `null` quando não há bloqueio reconhecido.
 * @example
 * blockReason('<html>cf-turnstile</html>'); // 'Turnstile'
 * blockReason('<html>player</html>'); // null
 */
export function blockReason(html) {
  if (/cf-turnstile|turnstileSiteKey|challenges\.cloudflare\.com\/turnstile/i.test(html)) return 'Turnstile';
  if (/g-recaptcha|recaptcha\/api/i.test(html)) return 'reCAPTCHA';
  if (/challenge-platform|cf-browser-verification|Just a moment/i.test(html)) return 'desafio Cloudflare';
  return null;
}

/**
 * Lê título e ano do `<title>` de uma página do plenoflu.
 *
 * O sufixo " - SuperCDN" e o ano entre parênteses são separados do título. Devolve `null` quando
 * a página não tem título utilizável; o chamador decide se isso é falha da entrada.
 *
 * @param {string} html - HTML da página.
 * @returns {{title: string, year: number|null}|null} Título e ano, ou `null`.
 * @example
 * pageMeta('<title>Matrix (1999) - SuperCDN</title>'); // { title: 'Matrix', year: 1999 }
 */
export function pageMeta(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const text = decodeEntities(match[1]).replace(/\s+/g, ' ').trim().replace(/\s+-\s+SuperCDN\s*$/i, '').trim();
  const year = /\((\d{4})\)\s*$/.exec(text);
  const title = (year ? text.slice(0, year.index) : text).trim();
  if (!title) return null;
  return { title, year: year ? Number(year[1]) : null };
}

/**
 * Remove segredo, hash de player, URL e assinatura do texto de log.
 *
 * @param {string} message - Texto a sanear.
 * @returns {string} Texto sem chave do TMDB, URL, hash hexadecimal longo ou parâmetro assinado.
 * @example
 * redact('HTTP 522 em https://cdn.example/x.m3u8?md5=abc'); // 'HTTP 522 em [url]'
 */
export function redact(message) {
  let text = String(message);
  const key = globalThis.TMDB_API_KEY;
  if (typeof key === 'string' && key.trim()) {
    for (const secret of [key, key.trim(), encodeURIComponent(key.trim())]) {
      if (secret) text = text.split(secret).join('[redigido]');
    }
  }
  return text
    .replace(/https?:\/\/[^\s'"]+/gi, '[url]')
    .replace(/[a-f0-9]{32,}/gi, '[hash]')
    .replace(/(md5|expires|key|token|signature|sig)=[^&\s'"]+/gi, '$1=[redigido]');
}

/**
 * Registra uma opção descartada por triagem, sem tratá-la como falha.
 *
 * @param {string} logName - Prefixo de log do consumidor.
 * @param {string} domain - Origem da opção.
 * @param {string} label - Rótulo da opção.
 * @param {string} cause - Motivo da triagem.
 * @returns {void}
 * @example
 * logTriage('DooPlay PT-BR', 'catálogo', 'WatchPlay', 'playlist sem RESOLUTION');
 */
export function logTriage(logName, domain, label, cause) {
  console.log(`[${logName}] ${domain} Opção ${label} descartada por triagem: ${redact(cause)}`);
}

/**
 * Registra uma falha isolada de opção com `console.warn`.
 *
 * @param {string} logName - Prefixo de log do consumidor.
 * @param {string} domain - Origem da opção.
 * @param {string} label - Rótulo da opção.
 * @param {string} cause - Causa saneada.
 * @returns {void}
 * @example
 * warnOption('DooPlay PT-BR', 'catálogo', 'Player 1', 'HTTP 522');
 */
export function warnOption(logName, domain, label, cause) {
  console.warn(`[${logName}] ${domain} Opção ${label} descartada: ${redact(cause)}`);
}

/**
 * Desempacota o formato `p,a,c,k,e,d` sem executar JavaScript remoto.
 *
 * @param {string} source - Texto onde pode haver um empacotador.
 * @returns {string|null} Texto desempacotado, ou `null` se não houver empacotador.
 * @throws {Error} Se o empacotador existir e estiver ilegível.
 * @example
 * unpackPacker("eval(function(p,a,c,k,e,d){...}('0',1,1,'hash'.split('|'),0,{}))");
 */
export function unpackPacker(source) {
  const marker = source.indexOf('function(p,a,c,k,e,d)');
  if (marker < 0) return null;
  const call = source.indexOf('}(', marker);
  if (call < 0) return null;
  let cursor = call + 2;
  const payload = readString(source, cursor);
  cursor = skipComma(source, payload.end);
  const radix = readNumber(source, cursor);
  cursor = skipComma(source, radix.end);
  const count = readNumber(source, cursor);
  cursor = skipComma(source, count.end);
  const dictionary = readString(source, cursor);
  return substitute(payload.value, radix.value, count.value, dictionary.value.split('|'));
}

/**
 * Interpreta uma playlist HLS já baixada.
 *
 * A extensão da URL não decide o formato. Master com faixa externa vira uma reprodução
 * adaptativa; variantes autossuficientes saem separadas. Variante sem `RESOLUTION` válida é
 * ignorada; playlist sem variante utilizável devolve a própria URL, para o stream ser preservado com
 * qualidade desconhecida. Legendas com "thumb" no rótulo são descartadas.
 *
 * @param {string} text - Conteúdo da playlist.
 * @param {string} playlistUrl - URL usada como base para as faixas.
 * @returns {{adaptive: boolean, url: string, quality: number|null, variants: {url: string, quality: number}[], language: 'Dublado'|null, foreignOnly: boolean, subtitles: {url: string, language: string, name?: string}[]}} Interpretação.
 * @throws {Error} Se não for HLS, se a variante não tiver URI ou se os atributos forem inválidos.
 * @example
 * interpretPlaylist('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=640x360\n360.m3u8', 'https://cdn.example/master.m3u8');
 * // { adaptive: false, url: 'https://cdn.example/master.m3u8', quality: null,
 * //   variants: [{ url: 'https://cdn.example/360.m3u8', quality: 360 }], ... }
 */
export function interpretPlaylist(text, playlistUrl) {
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== '#EXTM3U') throw new Error('Resposta não é playlist HLS');
  const medias = lines
    .filter((line) => line.startsWith('#EXT-X-MEDIA:'))
    .map((line) => attributes(line.slice(line.indexOf(':') + 1)));
  const variants = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index].startsWith('#EXT-X-STREAM-INF:')) continue;
    const info = attributes(lines[index].slice(lines[index].indexOf(':') + 1));
    const resolution = /^(\d+)x([1-9]\d{2,3})$/.exec(info.RESOLUTION || '');
    const uri = lines[index + 1];
    if (!uri || uri.startsWith('#')) throw new Error('Variante HLS sem URI');
    if (!resolution) continue;
    index += 1;
    variants.push({ info, quality: Number(resolution[2]), url: mediaUrl(uri, playlistUrl) });
  }
  const audio = audioOf(medias, variants);
  const subtitles = subtitleTracks(medias, playlistUrl);
  const external = variants.length > 0 && variants.some((variant) => hasExternal(medias, variant.info));
  return {
    adaptive: external,
    url: playlistUrl,
    quality: external ? Math.max(...variants.map((variant) => variant.quality)) : null,
    variants: external ? [] : variants.map((variant) => ({ url: variant.url, quality: variant.quality })),
    language: audio.language,
    foreignOnly: audio.foreignOnly,
    subtitles,
  };
}

/**
 * Resolve todas as entradas aplicáveis e devolve a mídia final, sem parar no primeiro sucesso.
 *
 * Cada entrada falha sozinha. Triagem devolve lista vazia sem falha; falha técnica
 * gera `console.warn` e entra em `failures`. Nada é deduplicado aqui: a identidade completa
 * (host/hash), o modo, a qualidade, o idioma e os cabeçalhos ficam no resultado para o chamador.
 *
 * @param {FireEntry[]} entries - Opções descobertas pelo consumidor.
 * @param {FireContext} context - Prefixo de log, origem padrão e pedido.
 * @returns {Promise<{resolved: FireResolved[], failures: string[]}>} Mídia resolvida e falhas.
 * @throws {Error} Se `entries` não for array ou o contexto não tiver log, origem e pedido válidos.
 * @example
 * const { resolved, failures } = await resolveEntries([
 *   { url: 'https://vaiquecol.com/embed2/tt1234567', referer: 'https://plenoflu.com/', label: 'vaiquecol' },
 * ], { logName: 'FirePlayer PT-BR', domain: 'plenoflu', request: { mediaType: 'movie', tmdbId: 1 } });
 */
export async function resolveEntries(entries, context) {
  if (!Array.isArray(entries)) throw new Error('entries deve ser array');
  assertContext(context);
  const settled = await Promise.all(entries.map((entry) => settleEntry(entry, context)));
  const resolved = [];
  const failures = [];
  for (const result of settled) {
    if (result.failure) failures.push(result.failure);
    for (const media of result.resolved || []) resolved.push(media);
  }
  return { resolved, failures };
}

/**
 * Monta os streams a partir das mídias resolvidas, com o formatador do provedor.
 *
 * O `format` leva `providerName` como `addon`, título e ano de `media.meta`, temporada e episódio
 * do pedido e, em reprodução adaptativa, `message: 'Reprodução adaptativa'`. Playlist sem variante
 * utilizável vira um único stream com a URL da playlist e qualidade `Desconhecida`.
 *
 * @param {FireResolved[]} resolved - Resultado de `resolveEntries`.
 * @param {FireContext} context - Contexto com `providerName`.
 * @returns {object[]} Streams validados por `buildStream`.
 * @throws {Error} Se `resolved` não for array, se `providerName` faltar, se `media.meta.title` faltar
 *   ou se um campo for inválido.
 * @example
 * buildStreams(resolved, { ...context, providerName: 'FirePlayer PT-BR' });
 */
export function buildStreams(resolved, context) {
  if (!Array.isArray(resolved)) throw new Error('resolved deve ser array');
  assertBuildContext(context);
  const streams = [];
  for (const media of resolved) {
    const fields = {
      provider: new URL(media.playerPage).hostname,
      type: 'hls',
      headers: media.headers,
      format: formatDetails(context, media),
      ...(media.language ? { language: media.language } : {}),
      ...(media.subtitles.length ? {
        subtitles: media.subtitles.map((track) => ({ ...track, headers: media.headers })),
      } : {}),
    };
    if (media.adaptive) {
      streams.push(buildStream({ ...fields, url: media.playlistUrl, quality: media.quality }));
    } else if (media.variants.length) {
      for (const variant of media.variants) {
        streams.push(buildStream({ ...fields, url: variant.url, quality: variant.quality }));
      }
    } else {
      streams.push(buildStream({ ...fields, url: media.playlistUrl, quality: UNKNOWN_QUALITY }));
    }
  }
  return streams;
}

/**
 * Campo `format` do stream para uma mídia resolvida.
 * @param {FireContext} context - Contexto com `providerName` e o pedido.
 * @param {FireResolved} media - Mídia resolvida.
 * @returns {object} Valor do campo `format` de `buildStream`.
 * @throws {Error} Se `media.meta.title` faltar.
 */
function formatDetails(context, media) {
  const title = media.meta && media.meta.title;
  if (typeof title !== 'string' || !title.trim()) throw new Error('media.meta.title ausente');
  const format = { template: FORMATTER.AUTO, addon: context.providerName, title };
  if (media.meta.year !== null && media.meta.year !== undefined) format.year = media.meta.year;
  const { season, episode } = context.request;
  if (Number.isInteger(season) && Number.isInteger(episode)) {
    format.season = season;
    format.episode = episode;
  }
  if (media.adaptive) format.message = 'Reprodução adaptativa';
  return format;
}

/**
 * Resolve entradas e monta os streams, sem repetir URL, qualidade e idioma iguais.
 *
 * Atalho para consumidores que não precisam da identidade completa antes de montar a lista.
 * O novo provedor FirePlayer usa `resolveEntries` e deduplica pelo contexto completo.
 *
 * @param {FireEntry[]} entries - Opções descobertas pelo consumidor.
 * @param {FireContext} context - Contexto completo, com `providerName`.
 * @returns {Promise<{streams: object[], failures: string[]}>} Streams e falhas.
 * @throws {Error} Se as entradas ou o contexto forem inválidos.
 * @example
 * const { streams, failures } = await playEntries(entries, context);
 */
export async function playEntries(entries, context) {
  const { resolved, failures } = await resolveEntries(entries, context);
  const streams = new Map();
  for (const stream of buildStreams(resolved, context)) {
    streams.set(`${stream.url}|${stream.quality}|${stream.language || ''}`, stream);
  }
  return { streams: [...streams.values()], failures };
}

function assertContext(context) {
  if (!context || typeof context !== 'object') throw new Error('contexto ausente');
  if (typeof context.logName !== 'string' || !context.logName.trim()) throw new Error('logName ausente');
  if (typeof context.domain !== 'string' || !context.domain.trim()) throw new Error('domain ausente');
  if (!context.request || !['movie', 'tv'].includes(context.request.mediaType)) {
    throw new Error('request.mediaType inválido');
  }
}

function assertBuildContext(context) {
  assertContext(context);
  if (typeof context.providerName !== 'string' || !context.providerName.trim()) throw new Error('providerName ausente');
}

function settleEntry(entry, context) {
  const domain = entry.domain || context.domain;
  const label = entry.label || domain;
  return Promise.resolve()
    .then(() => {
      if (entry.budget === 'danger') {
        logTriage(context.logName, domain, label, 'budget danger');
        return { resolved: [] };
      }
      return resolveUrl(entry, context, new Set());
    })
    .then((result) => {
      if (result.triage) {
        logTriage(context.logName, domain, label, result.triage);
        return { resolved: [] };
      }
      return { resolved: result.resolved || [] };
    })
    .catch((error) => {
      if (error.triage) {
        logTriage(context.logName, domain, label, error.message);
        return { resolved: [] };
      }
      if (!error.logged) warnOption(context.logName, domain, label, error.message);
      return { failure: `${label}: ${redact(error.message)}` };
    });
}

async function resolveUrl(entry, context, visited) {
  if (!entry || typeof entry !== 'object') throw new Error('opção inválida');
  if (!entry.url) throw new Error('endereço da opção ausente');
  if (!entry.referer) throw new Error('referer da opção ausente');
  if (visited.has(entry.url)) throw new Error('cadeia cíclica');
  if (visited.size >= MAX_HOPS) throw new Error('limite da cadeia');
  if (missingCoords(entry.url, context.request)) throw new Error('coordenadas ausentes');
  if (contradicts(entry.url, context.request)) throw new Error('coordenadas contraditórias');

  const nextVisited = new Set(visited);
  nextVisited.add(entry.url);
  const host = new URL(entry.url).hostname;
  if (isHost(host, 'watchplay.shop')) {
    return context.resolveWatchplay === true
      ? resolveWatchplay(entry, context)
      : { triage: 'playlist sem RESOLUTION' };
  }
  if (isHost(host, 'youtube.com') || host === 'youtu.be') return { triage: 'trailer' };
  if (isHost(host, 'myembed.biz')) return followMyembed(entry, context, nextVisited);
  if (isHost(host, 'playerflix.ink')) return expandPlayerflix(entry, context, nextVisited);
  if (isHost(host, 'embedplayer.site')) return expandGstream(entry, context, nextVisited);
  if (isHost(host, 'plenoflu.com')) return expandPleno(entry, context, nextVisited);
  if (isHost(host, 'vaiquecol.com') || isHost(host, 'embedplayer2.xyz')) return resolveFire(entry, context);
  return { triage: `host fora do conjunto: ${host}` };
}

async function followMyembed(entry, context, visited) {
  const read = await readHtml(entry.url, { headers: { Referer: originReferer(entry.referer) } });
  if (read.triage) return read;
  const $ = loadHtml(read.page.text);
  const src = $('iframe#video-player').attr('src') || $('iframe').attr('src');
  if (!src) throw new Error('iframe do myembed ausente');
  return resolveUrl({
    ...entry, url: httpUrl(src, read.page.url), referer: read.page.url,
  }, context, visited);
}

async function expandPlayerflix(entry, context, visited) {
  const pageUrl = entry.url;
  const ajax = pageUrl.includes('/inc/Ajax.php') ? pageUrl : playerflixAjax(pageUrl);
  const referer = pageUrl.includes('/inc/Ajax.php') ? entry.referer : pageUrl;
  const data = await readJson(ajax, { profile: 'api', headers: { Referer: referer } });
  const options = data && data.data && data.data.options;
  if (!data || data.status === false || !Array.isArray(options)) throw new Error('opções do PlayerFlix ausentes');
  const meta = entry.meta || playerflixMeta(data) || null;
  if (!meta) throw new Error('título do PlayerFlix ausente');
  const children = options.map((option, index) => ({
    label: text(option.label) || `Opção ${index + 1}`,
    url: text(option.embed),
    hash: text(option.embed_id),
    referer,
    languageHint: text(option.lang) || entry.languageHint,
    budget: option.budget,
    meta,
  }));
  return settleChildren(children, context, visited);
}

function playerflixAjax(pageUrl) {
  const parts = new URL(pageUrl).pathname.split('/').filter(Boolean);
  const origin = new URL(pageUrl).origin;
  if (parts[0] === 'filme' && parts[1]) {
    return `${origin}/inc/Ajax.php?type=movie&id=${encodeURIComponent(parts[1])}&season=null&episode=null`;
  }
  if ((parts[0] === 'serie' || parts[0] === 'tv') && parts.length >= 4) {
    return `${origin}/inc/Ajax.php?type=tv&id=${encodeURIComponent(parts[1])}`
      + `&season=${encodeURIComponent(parts[2])}&episode=${encodeURIComponent(parts[3])}`;
  }
  throw new Error('página PlayerFlix não reconhecida');
}

async function expandGstream(entry, context, visited) {
  const read = await readHtml(entry.url, { headers: { Referer: originReferer(entry.referer) } });
  if (read.triage) return read;
  const reason = guarded(read.page.text, /player_select_item/);
  if (reason) return { triage: reason };
  const items = loadHtml(read.page.text)('.player_select_item');
  if (!items.length) throw new Error('GStream sem idS');
  const jobs = [];
  for (let index = 0; index < items.length; index += 1) {
    const idS = items.eq(index).attr('idS');
    if (!idS) throw new Error('idS ausente');
    jobs.push({ label: `GStream ${index + 1}`, idS });
  }
  const settled = await Promise.all(jobs.map((job) => postGstream(job.idS, read.page.url)
    .then((file) => ({ child: {
      label: job.label, url: file, referer: read.page.url, languageHint: entry.languageHint, meta: entry.meta || null,
    } }))
    .catch((error) => {
      if (/HTTP 451\b/.test(error.message)) {
        logTriage(context.logName, entry.domain || context.domain, job.label, 'HTTP 451');
        return { resolved: [] };
      }
      warnOption(context.logName, entry.domain || context.domain, job.label, error.message);
      return { failure: `${job.label}: ${redact(error.message)}` };
    })));
  const ready = settled.filter((result) => result.child).map((result) => result.child);
  const nested = ready.length ? await settleChildren(ready, context, visited) : { resolved: [] };
  const failures = settled.filter((result) => result.failure).map((result) => result.failure);
  if ((nested.resolved || []).length) return nested;
  if (failures.length || nested.failure) {
    const error = new Error(`Todas as opções falharam: [${failures.join('; ')}]`);
    error.logged = true;
    throw error;
  }
  return { resolved: [] };
}

async function postGstream(idS, pageUrl) {
  const data = await readJson(new URL('/stream', pageUrl).href, {
    method: 'POST', profile: 'api', form: { idS }, headers: { Referer: pageUrl },
  });
  const file = data && data.resources && data.resources.sources && data.resources.sources[0]
    && data.resources.sources[0].file;
  if (typeof file !== 'string' || !file.trim()) throw new Error('arquivo de mídia ausente');
  return httpUrl(file, pageUrl);
}

async function expandPleno(entry, context, visited) {
  const read = await readEntryPage(entry, { headers: { Referer: originReferer(entry.referer) } });
  if (read.triage) return read;
  const meta = entry.meta || pageMeta(read.page.text) || null;
  if (!meta) throw new Error('título do plenoflu ausente');
  const next = { ...entry, meta };
  const path = new URL(read.page.url).pathname;
  if (context.request.mediaType === 'tv') {
    const series = /^\/tvshow\/([^/]+)\/(\d+)\/(\d+)\/?$/.exec(path);
    if (!series) throw new Error('coordenadas ausentes');
    assertSeriesIdentity(series[1], Number(series[2]), Number(series[3]), context);
    if (context.directEpisode) {
      const direct = /\bDIRECT_EPISODE_ID\s*=\s*(\d+)/.exec(read.page.text);
      if (!direct) throw new Error('DIRECT_EPISODE_ID ausente');
      return plenoDirect(next, read.page, direct[1], context, visited);
    }
    return plenoSeriesLegacy(next, read.page, context, visited);
  }
  const movie = /^\/movie\/([^/]+)\/?$/.exec(path);
  if (!movie) throw new Error('página de filme não reconhecida');
  assertMovieIdentity(movie[1], context);
  return plenoMovie(next, read.page, context, visited);
}

function assertSeriesIdentity(id, season, episode, context) {
  if (season !== context.request.season || episode !== context.request.episode) {
    throw new Error('coordenadas contraditórias');
  }
  assertExternalId(id, context);
}

function assertMovieIdentity(id, context) {
  assertExternalId(id, context);
}

function assertExternalId(id, context) {
  const identity = context.identity || {};
  if (/^\d+$/.test(id)) {
    if (identity.tmdbId != null && id !== String(identity.tmdbId)) throw new Error('identidade contraditória');
    return;
  }
  if (/^tt\d{5,}$/.test(id)) {
    if (identity.imdbId && id !== identity.imdbId) throw new Error('identidade contraditória');
    return;
  }
  throw new Error('identificador da página não reconhecido');
}

async function plenoDirect(entry, page, directId, context, visited) {
  const data = await readJson(new URL('/api', page.url).href, {
    method: 'POST', profile: 'api', headers: { Referer: page.url },
    form: { action: 'getOptions', contentid: directId },
  });
  const list = data && data.data && data.data.options;
  if (!Array.isArray(list)) throw new Error('opções do plenoflu ausentes');
  const children = list.map((option, index) => {
    if (typeof option.url !== 'string' || !option.url.trim()) throw new Error('url da opção ausente');
    return {
      label: text(option.display_type) || text(option.type) || `plenoflu ${index + 1}`,
      url: httpUrl(option.url, page.url), referer: page.url, languageHint: entry.languageHint,
      meta: entry.meta || null,
    };
  });
  return settleChildren(children, context, visited);
}

async function plenoSeriesLegacy(entry, page, context, visited) {
  const show = /TVSHOW_ID\s*=\s*(\d+)/.exec(page.text);
  if (!show) throw new Error('TVSHOW_ID ausente');
  const data = await readJson(new URL('/api', page.url).href, {
    method: 'POST', profile: 'api', headers: { Referer: page.url },
    form: { action: 'get_season_episodes', tvshow_id: show[1], season: String(context.request.season) },
  });
  const html = data && data.data && data.data.html;
  if (typeof html !== 'string') throw new Error('lista de episódios do plenoflu inválida');
  const contentId = episodeContentId(html, context.request.episode);
  if (!contentId) throw new Error('episódio ausente no plenoflu');
  return plenoDirect(entry, page, contentId, context, visited);
}

async function plenoMovie(entry, page, context, visited) {
  const reason = guarded(page.text, /data-id=/);
  if (reason) return { triage: reason };
  const items = loadHtml(page.text)('.player_select_item');
  const children = [];
  for (let index = 0; index < items.length; index += 1) {
    const videoId = items.eq(index).attr('data-id');
    if (!videoId || !videoId.startsWith('dyn:')) continue;
    const data = await readJson(new URL('/api', page.url).href, {
      method: 'POST', profile: 'api', headers: { Referer: page.url },
      form: { action: 'getPlayer', video_id: videoId },
    });
    const encoded = data && data.data && data.data.video_url;
    if (typeof encoded !== 'string' || !encoded.trim()) throw new Error('video_url ausente');
    children.push({
      label: videoId.split(':').pop(), url: httpUrl(decodeBase64(encoded), page.url),
      referer: page.url, languageHint: entry.languageHint, meta: entry.meta || null,
    });
  }
  if (!children.length) throw new Error('plenoflu sem players');
  return settleChildren(children, context, visited);
}

function episodeContentId(html, episode) {
  const blocks = html.match(/<div class="episodeOption[\s\S]*?<\/div>\s*<\/div>/gi) || [];
  for (const block of blocks) {
    const number = /Episódio\s+(\d+)/i.exec(block);
    const id = /data-contentid="(\d+)"/.exec(block);
    if (number && id && Number(number[1]) === episode) return id[1];
  }
  const loose = [...html.matchAll(/data-contentid="(\d+)"[\s\S]{0,240}?Episódio\s+(\d+)/gi)];
  const found = loose.find((match) => Number(match[2]) === episode);
  return found ? found[1] : null;
}

async function resolveFire(entry, context) {
  const hashInUrl = hashFromUrl(entry.url);
  const known = /^[a-f0-9]{32}$/i.test(entry.hash || '') ? entry.hash : hashInUrl;
  if (hashInUrl && entry.hash && /^[a-f0-9]{32}$/i.test(entry.hash) && hashInUrl !== entry.hash) {
    throw new Error('hash contraditório');
  }
  let playerPage = entry.url;
  let hash = known;
  if (!hash) {
    const read = await readHtml(entry.url, { profile: 'player', headers: { Referer: originReferer(entry.referer) } });
    if (read.triage) return read;
    const reason = guarded(read.page.text, /function\(p,a,c,k,e,d\)/);
    if (reason) return { triage: reason };
    playerPage = read.page.url;
    const unpacked = unpackPacker(read.page.text);
    hash = ((unpacked || read.page.text).match(/\b[a-f0-9]{32}\b/i) || [])[0];
    if (!hash) throw new Error('hash ausente');
  }
  // No app, searchParams.set não atualiza href; a query é montada como texto.
  const endpoint = `${new URL('/player/index.php', playerPage).href}?`
    + `data=${encodeURIComponent(hash)}&do=getVideo`;
  const data = await readJson(endpoint, {
    method: 'POST', profile: 'api', headers: { Referer: playerPage },
    form: { hash, r: originReferer(entry.referer) },
  });
  if (!data || data.hls !== true) throw new Error('hls falso');
  let media;
  if (typeof data.securedLink === 'string' && data.securedLink.trim()) {
    media = data.securedLink.trim();
  } else if (typeof data.videoSource === 'string' && data.videoSource.trim()) {
    media = data.videoSource.trim();
    console.log(`[${context.logName}] ${entry.domain || context.domain} videoSource usado porque securedLink está ausente`);
  } else {
    throw new Error('videoSource ausente');
  }
  const playlistUrl = httpUrl(media, playerPage);
  const playlist = await readHtml(playlistUrl, { profile: 'player', headers: { Referer: playerPage } });
  if (playlist.triage) return playlist;
  if (!playlist.page.text.trim().startsWith('#EXTM3U')) {
    const reason = blockReason(playlist.page.text);
    if (reason) return { triage: reason };
  }
  const interpreted = interpretPlaylist(playlist.page.text, playlist.page.url);
  const subtitles = await loadSubtitles(interpreted.subtitles, playerPage, entry, context);
  const choice = chooseLanguage(interpreted, entry.languageHint, subtitles);
  if (choice.discard) return { triage: 'lang não PT-BR sem legenda PT' };
  return {
    resolved: [{
      label: entry.label || entry.domain || context.domain,
      domain: entry.domain || context.domain,
      playerPage,
      playerHash: hash.toLowerCase(),
      playlistUrl: interpreted.url,
      adaptive: interpreted.adaptive,
      quality: interpreted.quality,
      variants: interpreted.variants,
      language: choice.language,
      foreignOnly: interpreted.foreignOnly,
      subtitles,
      headers: playbackHeaders(playerPage),
      meta: entry.meta || null,
    }],
  };
}

async function resolveWatchplay(entry, context) {
  const read = await readHtml(entry.url, { headers: { Referer: originReferer(entry.referer) } });
  if (read.triage) return read;
  const href = watchplayPlaylist(read.page.text);
  if (!href) throw new Error('playlist do WatchPlay ausente');
  const playlistUrl = httpUrl(href, read.page.url);
  const playlist = await readHtml(playlistUrl, { profile: 'player', headers: { Referer: read.page.url } });
  if (playlist.triage) return playlist;
  if (!playlist.page.text.replace(/^\uFEFF/, '').trim().startsWith('#EXTM3U')) {
    throw new Error('Resposta do WatchPlay não é playlist HLS');
  }
  const interpreted = interpretPlaylist(playlist.page.text, playlist.page.url);
  const subtitles = await loadSubtitles(interpreted.subtitles, read.page.url, entry, context);
  const choice = chooseLanguage(interpreted, entry.languageHint, subtitles);
  if (choice.discard) return { triage: 'lang não PT-BR sem legenda PT' };
  return {
    resolved: [{
      label: entry.label || entry.domain || context.domain,
      domain: entry.domain || context.domain,
      playerPage: read.page.url,
      playlistUrl: interpreted.url,
      adaptive: interpreted.adaptive,
      quality: interpreted.quality,
      variants: interpreted.variants,
      language: choice.language,
      foreignOnly: interpreted.foreignOnly,
      subtitles,
      headers: playbackHeaders(read.page.url),
      meta: entry.meta || null,
    }],
  };
}

function watchplayPlaylist(html) {
  const match = /["']([^"']*playlist\.m3u8[^"']*)["']/i.exec(html);
  return match ? match[1].replace(/\\\//g, '/') : null;
}

async function loadSubtitles(tracks, playerPage, entry, context) {
  const ready = [];
  for (const track of tracks) {
    const domain = entry.domain || context.domain;
    try {
      const read = await readHtml(track.url, { profile: 'player', headers: { Referer: playerPage } });
      if (read.triage) {
        console.warn(`[${context.logName}] ${domain} Opção ${entry.label || domain} legenda ${track.language} descartada: ${read.triage}`);
        continue;
      }
      if (!read.page.text.trim().replace(/^\uFEFF/, '').startsWith('WEBVTT')) {
        console.warn(`[${context.logName}] ${domain} Opção ${entry.label || domain} legenda ${track.language} descartada: conteúdo não é WebVTT`);
        continue;
      }
      ready.push(track);
    } catch (error) {
      console.warn(`[${context.logName}] ${domain} Opção ${entry.label || domain} legenda ${track.language} descartada: ${redact(error.message)}`);
    }
  }
  return ready;
}

function chooseLanguage(interpreted, hint, subtitles) {
  const hinted = hint ? normalizeLanguage(hint) : null;
  const ptSub = subtitles.some((track) => isPortuguese(`${track.language} ${track.name || ''}`));
  if (interpreted.language === LANGUAGE.DUBBED || interpreted.language === LANGUAGE.DUBBED_NON_PT_BR) {
    return { language: interpreted.language };
  }
  if (interpreted.foreignOnly) return ptSub ? { language: LANGUAGE.SUBTITLED } : { discard: true };
  if (hinted === LANGUAGE.NON_PT_BR && !ptSub) return { discard: true };
  if (hint && !hinted && isForeign(hint) && !ptSub) return { discard: true };
  if (hinted === LANGUAGE.SUBTITLED || hinted === LANGUAGE.SUBTITLED_NON_PT_BR) {
    return ptSub ? { language: LANGUAGE.SUBTITLED } : { discard: true };
  }
  if (hinted === LANGUAGE.DUBBED || hinted === LANGUAGE.DUBBED_NON_PT_BR) {
    return { language: hinted };
  }
  if (hint && isPortuguese(hint)) {
    const isNonPtBr = /\b(?:ptpt|pt pt|portugal|european|europeu|europeia)\b/i.test(hint) ||
      (/\b(?:portugues|portuguese|por|pt)\b/i.test(hint) && !/\b(?:ptbr|pt br|pob|brazil|brasil|brazilian|brasileiro|brasileira|br)\b/i.test(hint));
    return { language: isNonPtBr ? LANGUAGE.DUBBED_NON_PT_BR : LANGUAGE.DUBBED };
  }
  if (ptSub) return { language: LANGUAGE.SUBTITLED };
  return { language: null };
}

async function settleChildren(children, context, visited) {
  const settled = await Promise.all(children.map((child) => {
    const domain = child.domain || context.domain;
    if (child.budget === 'danger') {
      logTriage(context.logName, domain, child.label, 'budget danger');
      return Promise.resolve({ resolved: [] });
    }
    if (!child.url) {
      warnOption(context.logName, domain, child.label, 'embed ausente');
      return Promise.resolve({ failure: `${child.label}: embed ausente` });
    }
    return resolveUrl(child, context, new Set(visited))
      .then((result) => {
        if (result.triage) {
          logTriage(context.logName, domain, child.label, result.triage);
          return { resolved: [] };
        }
        return { resolved: result.resolved || [] };
      })
      .catch((error) => {
        if (error.triage) {
          logTriage(context.logName, domain, child.label, error.message);
          return { resolved: [] };
        }
        if (!error.logged) warnOption(context.logName, domain, child.label, error.message);
        return { failure: `${child.label}: ${redact(error.message)}` };
      });
  }));
  const resolved = settled.flatMap((result) => result.resolved || []);
  const failures = settled.filter((result) => result.failure).map((result) => result.failure);
  if (resolved.length) return { resolved };
  if (failures.length) {
    const error = new Error(`Todas as opções falharam: [${failures.join('; ')}]`);
    error.logged = true;
    throw error;
  }
  return { resolved: [] };
}

function missingCoords(url, request) {
  if (request.mediaType !== 'tv') return false;
  const parsed = new URL(url);
  if ([...parsed.searchParams.keys()].some((key) => (key === 'season' || key === 'episode') && !parsed.searchParams.get(key))) {
    return true;
  }
  const parts = parsed.pathname.split('/');
  const marker = parts.findIndex((part) => part === 'serie' || part === 'tvshow');
  if (marker < 0) return false;
  const rest = parts.slice(marker + 1).filter((part) => part !== '');
  return rest.length > 0 && rest.length < 3;
}

async function readEntryPage(entry, options) {
  if (entry.page === undefined) return readHtml(entry.url, options);
  if (!entry.page || typeof entry.page.url !== 'string' || typeof entry.page.text !== 'string') {
    throw new Error('página pré-carregada inválida');
  }
  return { page: entry.page };
}

async function readHtml(url, options) {
  try {
    return { page: await fetchPage(url, options) };
  } catch (error) {
    if (/HTTP 451\b/.test(error.message)) return { triage: 'HTTP 451' };
    throw error;
  }
}

async function readJson(url, options) {
  try {
    return await fetchJson(url, options);
  } catch (error) {
    if (/HTTP 451\b/.test(error.message)) {
      const triage = new Error('HTTP 451');
      triage.triage = true;
      throw triage;
    }
    throw error;
  }
}

function guarded(html, expected) {
  if (expected.test(html)) return null;
  return blockReason(html);
}

function decodeBase64(value) {
  try {
    return atob(value.trim());
  } catch {
    throw new Error('video_url não é base64');
  }
}

function contradicts(url, request) {
  if (request.mediaType !== 'tv') return false;
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const marker = parts.findIndex((part) => part === 'serie' || part === 'tvshow');
  if (marker < 0 || parts.length < marker + 4) return false;
  const season = Number(parts[marker + 2]);
  const episode = Number(parts[marker + 3]);
  if (!Number.isInteger(season) || !Number.isInteger(episode)) return false;
  return season !== request.season || episode !== request.episode;
}

function hashFromUrl(url) {
  const match = /\/video\/([a-f0-9]{32})\/?(?:$|\?|#)/i.exec(url);
  return match ? match[1] : '';
}

function isHost(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function playerflixMeta(data) {
  const payload = data && data.data;
  if (!payload || typeof payload !== 'object') return null;
  const titles = payload.title;
  const title = typeof titles === 'string' ? text(titles) : text(titles && (titles.pt || titles.en));
  if (!title) return null;
  const date = text(payload.release_date);
  const year = /^(\d{4})/.exec(date);
  return { title, year: year ? Number(year[1]) : null };
}

function decodeEntities(value) {
  return value.replace(/&(amp|quot|#39|lt|gt);/g, (entity, name) => ({
    amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>',
  })[name]);
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isPortuguese(value) {
  return normalizeText(value).split(' ').some((word) => PT.has(word));
}

function isForeign(value) {
  return normalizeText(value).split(' ').some((word) => FOREIGN.has(word));
}

function hasExternal(medias, info) {
  return ['AUDIO', 'SUBTITLES'].some((type) => {
    const group = info[type];
    if (!group || group === 'NONE') return false;
    return medias.some((media) => media.TYPE === type && media['GROUP-ID'] === group && media.URI);
  });
}

function audioOf(medias, variants) {
  const groups = new Set(variants.map((variant) => variant.info.AUDIO).filter((group) => group && group !== 'NONE'));
  const tracks = medias.filter((media) => media.TYPE === 'AUDIO' && (!groups.size || groups.has(media['GROUP-ID'])));
  let dub = false;
  let original = false;
  for (const track of tracks) {
    const text = `${track.NAME || ''} ${track.LANGUAGE || ''}`;
    const words = wordsOf(text);
    const tag = normalizeLanguage(text);
    if (words.some((word) => DUB.has(word)) || tag === LANGUAGE.DUBBED || tag === LANGUAGE.DUBBED_NON_PT_BR) {
      dub = true;
    }
    if (words.some((word) => ORIGINAL.has(word)) || tag === LANGUAGE.NON_PT_BR) original = true;
  }
  if (dub) return { language: LANGUAGE.DUBBED, foreignOnly: false };
  if (original) return { language: null, foreignOnly: true };
  return { language: null, foreignOnly: false };
}

function subtitleTracks(medias, playlistUrl) {
  const tracks = [];
  for (const media of medias) {
    if (media.TYPE !== 'SUBTITLES' || !media.URI) continue;
    const label = `${media.NAME || ''} ${media['GROUP-ID'] || ''} ${media.LANGUAGE || ''}`;
    if (/thumb/i.test(label)) continue;
    const language = media.LANGUAGE || media.NAME;
    if (!language) continue;
    const track = { url: mediaUrl(media.URI, playlistUrl), language };
    if (media.NAME) track.name = media.NAME;
    tracks.push(track);
  }
  return tracks;
}

function wordsOf(value) {
  return normalizeText(value).split(' ').filter(Boolean);
}

function mediaUrl(value, base) {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL de mídia não é HTTP(S)');
  return url.href;
}

function attributes(value) {
  const result = {};
  let position = 0;
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]+)(?:,|$)/g;
  for (const match of value.matchAll(pattern)) {
    if (match.index !== position || Object.prototype.hasOwnProperty.call(result, match[1])) {
      throw new Error('Atributos HLS inválidos');
    }
    position += match[0].length;
    result[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  if (position !== value.length) throw new Error('Atributos HLS inválidos');
  return result;
}

function substitute(payload, radix, count, words) {
  let value = payload;
  let index = count;
  while (index--) {
    if (!words[index]) continue;
    const token = encode(index, radix);
    value = value.replace(new RegExp(`\\b${token}\\b`, 'g'), words[index]);
  }
  return value;
}

function encode(value, radix) {
  const digit = value % radix;
  const higher = value < radix ? '' : encode(Math.floor(value / radix), radix);
  const symbol = digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36);
  return higher + symbol;
}

function skipComma(source, index) {
  let cursor = index;
  while (source[cursor] === ' ' || source[cursor] === '\n') cursor += 1;
  if (source[cursor] !== ',') throw new Error('empacotador ilegível');
  return cursor + 1;
}

function readNumber(source, index) {
  const match = /^\s*(\d+)/.exec(source.slice(index));
  if (!match) throw new Error('empacotador ilegível');
  return { value: Number(match[1]), end: index + match[0].length };
}

function readString(source, index) {
  let cursor = index;
  while (source[cursor] === ' ' || source[cursor] === '\n') cursor += 1;
  const quote = source[cursor];
  if (quote !== "'" && quote !== '"') throw new Error('empacotador ilegível');
  cursor += 1;
  let value = '';
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      value += source[cursor + 1];
      cursor += 2;
      continue;
    }
    if (char === quote) return { value, end: cursor + 1 };
    value += char;
    cursor += 1;
  }
  throw new Error('empacotador ilegível');
}
