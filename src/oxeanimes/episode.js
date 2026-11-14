/**
 * Leitura da API do episódio e triagem do proxy de reprodução do OxeAnimes.
 *
 * A API devolve `streamUrl` e `sources[]`. O proxy `/api/stream` é preferido porque o CDN direto
 * responde 403; uma fonte HLS absoluta só entra quando não há proxy. Fontes `embed` e opções fora
 * de HTTPS são triagem, não falha. A playlist nunca é aberta.
 */

import { fetchJson } from '../_blocks/http/index.mjs';
import { LANGUAGE, languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { normalizeQuality } from '../_blocks/quality-discovery/index.mjs';
import { buildAnimeUrl, buildEpisodeUrl, SITE_HEADERS, SITE_URL } from './site.js';

const PROXY_PATH = '/api/stream';
const HLS_PATH = /\.m3u8(?:$|[?#])/i;
const DUBBED_LANGUAGES = [LANGUAGE.DUBBED, LANGUAGE.DUBBED_NON_PT_BR];
const SUBTITLED_LANGUAGES = [LANGUAGE.SUBTITLED, LANGUAGE.SUBTITLED_NON_PT_BR];
const RESOLUTION = /\b(\d{3,4})p\b/i;

/**
 * @typedef {object} SourceOption
 * @property {string} label - Rótulo publicado pela fonte; vazio quando ausente.
 * @property {string} type - Tipo declarado (`hls`, `embed` ou outro).
 * @property {string} url - URL já resolvida contra o site.
 */

/**
 * @typedef {object} EpisodeMedia
 * @property {string} url - URL HLS absoluta do proxy ou da fonte direta.
 * @property {string|undefined} quality - Qualidade numérica declarada no rótulo; ausente sem número.
 * @property {string} language - Membro do enum `LANGUAGE` confirmado pela fonte ou pelo áudio.
 */

/**
 * Consulta a API do episódio e resolve a mídia de uma opção de áudio.
 *
 * @param {{ id: string, slug: string|null }} link - Link lido da página da obra.
 * @param {string} fallbackSlug - Slug do candidato usado quando o link não traz `slug`.
 * @param {string} fallbackLanguage - Idioma da opção, usado quando o título não confirma áudio ou legenda.
 * @returns {Promise<EpisodeMedia|null>} Mídia HLS ou `null` quando a opção é só `embed`.
 * @throws {Error} Se a API responder fora de 2xx, não for JSON válido ou estiver fora do esquema.
 * @example
 * const media = await fetchEpisodeMedia(link, 'kimetsu-no-yaiba', 'Legendado');
 * // media.url.startsWith('https://oxeanimes.com.br/api/stream?url=')
 */
export async function fetchEpisodeMedia(link, fallbackSlug, fallbackLanguage) {
  const slug = link.slug || fallbackSlug;
  const url = buildEpisodeUrl(link.id, slug);
  const body = await fetchJson(url, {
    profile: 'api',
    headers: { ...SITE_HEADERS, Referer: buildAnimeUrl(slug) },
  });

  const sources = readSources(body, url);
  const selected = selectHls(body.streamUrl, sources, url);
  if (selected === null) return null;

  const source = sources.find((item) => item.url === selected.url);
  return {
    url: selected.url,
    quality: source === undefined ? undefined : declaredQuality(source.label),
    language: confirmLanguage(body, fallbackLanguage),
  };
}

/**
 * Lê e valida a lista de fontes.
 * @param {object} body - Corpo da API do episódio.
 * @param {string} url - URL consultada, para a mensagem de erro.
 * @returns {SourceOption[]} Fontes resolvidas.
 * @throws {Error} Se `sources` não for lista ou algum item estiver fora do esquema.
 */
function readSources(body, url) {
  if (body.sources === undefined || body.sources === null) return [];
  if (!Array.isArray(body.sources)) {
    throw new Error(`Episódio fora do esquema em ${url}: "sources" fora de array`);
  }
  const sources = [];
  body.sources.forEach((source, index) => {
    if (!isPlainObject(source)) {
      throw new Error(`Episódio fora do esquema em ${url}: sources[${index}] não é objeto`);
    }
    const label = source.label === undefined || source.label === null ? '' : source.label;
    const type = nonEmptyText(source.type);
    const rawUrl = nonEmptyText(source.url);
    if (typeof label !== 'string' || type === null || rawUrl === null) {
      throw new Error(`Episódio fora do esquema em ${url}: sources[${index}] sem "label", "type" ou "url"`);
    }
    const resolved = resolveOptionUrl(rawUrl, `sources[${index}].url em ${url}`);
    if (resolved !== null) sources.push({ label: label.trim(), type, url: resolved });
  });
  return sources;
}

/**
 * Escolhe a mídia HLS: primeiro o proxy, depois uma fonte HLS direta.
 * @param {*} streamUrl - Valor de `streamUrl`.
 * @param {SourceOption[]} sources - Fontes validadas.
 * @param {string} url - URL da API, para a mensagem de erro.
 * @returns {{ url: string }|null} Mídia escolhida ou `null` na triagem.
 * @throws {Error} Se `streamUrl` estiver malformado.
 */
function selectHls(streamUrl, sources, url) {
  const proxies = [];
  const direct = [];

  if (streamUrl !== undefined && streamUrl !== null) {
    const raw = nonEmptyText(streamUrl);
    if (raw === null) throw new Error(`Episódio fora do esquema em ${url}: "streamUrl" inválido`);
    const resolved = resolveOptionUrl(raw, `streamUrl em ${url}`);
    if (resolved !== null) {
      if (isProxyUrl(resolved)) proxies.push(resolved);
      else if (HLS_PATH.test(resolved)) direct.push(resolved);
    }
  }

  for (const source of sources) {
    if (source.type !== 'hls') continue;
    if (isProxyUrl(source.url)) proxies.push(source.url);
    else direct.push(source.url);
  }

  if (proxies.length > 0) return { url: proxies[0] };
  if (direct.length > 0) return { url: direct[0] };
  return null;
}

/**
 * Confirma o idioma pelo título do episódio ou da obra, com a opção como reserva.
 * @param {object} body - Corpo da API do episódio.
 * @param {string} fallbackLanguage - Idioma da opção de áudio.
 * @returns {string} Membro do enum `LANGUAGE`.
 */
function confirmLanguage(body, fallbackLanguage) {
  const texts = [body.title, body.animeTitle];
  const confirmed = languageFromTexts(texts);
  if (DUBBED_LANGUAGES.includes(confirmed)) return confirmed;
  if (SUBTITLED_LANGUAGES.includes(confirmed)) return confirmed;
  return fallbackLanguage;
}

/**
 * Lê a resolução numérica de um rótulo; "FHD" sem número não vira qualidade.
 * @param {string} label - Rótulo publicado.
 * @returns {string|undefined} Qualidade normalizada ou `undefined`.
 */
function declaredQuality(label) {
  const match = RESOLUTION.exec(label);
  return match ? normalizeQuality(match[0]) : undefined;
}

/**
 * Resolve uma URL de opção e aceita somente HTTPS; HTTP é triagem.
 * @param {string} value - URL absoluta ou caminho relativo.
 * @param {string} label - Contexto para a mensagem de erro.
 * @returns {string|null} URL absoluta HTTPS ou `null` quando o protocolo não é aceito.
 * @throws {Error} Se o valor não formar URL.
 */
function resolveOptionUrl(value, label) {
  let url;
  try {
    url = new URL(value, SITE_URL);
  } catch (error) {
    throw new Error(`URL inválida em ${label}: "${value}" (${error.message})`, { cause: error });
  }
  return url.protocol === 'https:' ? url.href : null;
}

/**
 * Indica se a URL é o proxy de streaming da própria fonte.
 * @param {string} value - URL absoluta.
 * @returns {boolean}
 */
function isProxyUrl(value) {
  return new URL(value).pathname === PROXY_PATH;
}

/**
 * Indica se o valor é objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Devolve o texto aparado ou `null` quando vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null}
 */
function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}
