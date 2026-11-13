/**
 * Player do Dattebayo BR: abas SD, HD e FULLHD, assinatura pública e montagem dos streams.
 *
 * As abas `.Aba` são a lista de opções: cada uma tem `data-target` e um contêiner
 * `.playerContainer` com `var vid`. O serviço público de assinatura devolve a query AWS4 de curta
 * duração para a URL do vídeo. Cada opção é resolvida isoladamente; a URL assinada nunca entra em
 * log, fixture ou mensagem de erro.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { HEADER_PROFILES } from '../_blocks/http/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';

const SIGNATURE_URL = 'https://ads.animeyabu.net';
const PROVIDER_NAME = 'Dattebayo BR';
const STREAM_TYPE = 'mp4';
const QUALITY_BY_LABEL = Object.freeze({ SD: '480p', HD: '720p', FULLHD: '1080p' });

/**
 * @typedef {object} PlayerOption
 * @property {string} label - Rótulo normalizado da aba (`SD`, `HD` ou `FULLHD`).
 * @property {string} quality - Qualidade correspondente (`480p`, `720p` ou `1080p`).
 * @property {string} vid - URL do MP4 publicada pelo contêiner.
 * @property {string} [language] - Idioma da entrada, preenchido pela busca.
 * @property {string} [videoPageUrl] - Página do vídeo, usada no `Referer` da assinatura.
 */

/**
 * Lê as opções de player da página do vídeo.
 *
 * Aba sem contêiner correspondente ou sem `var vid` é erro de layout; contêiner sem aba não entra.
 * Ausência de qualquer aba é layout inesperado, não ausência do episódio.
 *
 * @param {string} html - HTML da página `/videos/<id>`.
 * @param {string} videoPageUrl - URL da página, usada nas mensagens de erro.
 * @returns {{ label: string, quality: string, vid: string }[]} Opções na ordem das abas.
 * @throws {Error} Se não houver abas, faltar `data-target`/rótulo ou a opção não tiver vídeo.
 */
export function extractPlayerOptions(html, videoPageUrl) {
  const $ = getCheerio().load(html);
  const tabs = $('.Aba');
  if (tabs.length === 0) throw new Error(`Página ${videoPageUrl} sem abas .Aba`);
  const options = [];
  for (let index = 0; index < tabs.length; index += 1) {
    const tab = tabs.eq(index);
    const target = tab.attr('data-target');
    const label = normalizeLabel(tab.text());
    if (!target || label === '') {
      throw new Error(`Aba ${index + 1} de ${videoPageUrl} sem data-target ou rótulo`);
    }
    const quality = QUALITY_BY_LABEL[label];
    if (quality === undefined) {
      throw new Error(`Rótulo de opção desconhecido em ${videoPageUrl}: "${label}"`);
    }
    const container = findContainer($, target);
    if (container === null) {
      throw new Error(`Aba ${label} de ${videoPageUrl} sem o contêiner #${target}`);
    }
    const script = container.find('script').html() || '';
    const match = /var\s+vid\s*=\s*['"]([^'"]+)['"]/.exec(script || container.html() || '');
    if (!match) throw new Error(`Player ${label} de ${videoPageUrl} sem var vid`);
    options.push({ label, quality, vid: match[1] });
  }
  return options;
}

/**
 * Resolve as opções em streams, deduplicando pelo `vid` e isolando a falha de cada opção.
 *
 * @param {PlayerOption[]} options - Opções com `language` e `videoPageUrl` preenchidos.
 * @param {object} request - Pedido validado recebido pelo provedor.
 * @param {'movie'|'tv'} request.mediaType - Tipo de mídia.
 * @param {number|null} request.season - Temporada em séries.
 * @param {number|null} request.episode - Episódio em séries.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<object[]>} Streams montados.
 * @throws {Error} Se todas as opções falharem, com a causa de cada uma.
 */
export async function resolveStreams(options, request, media) {
  const unique = dedupeByVid(options);
  const streams = [];
  const failures = [];
  for (const option of unique) {
    try {
      const signedUrl = await signVid(option.vid, option.videoPageUrl);
      streams.push(buildOptionStream(option, signedUrl, request, media));
    } catch (error) {
      failures.push(`Opção ${option.label}: ${error.message}`);
      console.warn(`[${PROVIDER_NAME}] Opção ${option.label} descartada: ${error.message}`);
    }
  }
  if (streams.length === 0) {
    if (failures.length > 0) throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}`);
    throw new Error('Nenhuma opção de player disponível');
  }
  return streams;
}

/**
 * Deduplica opções pela URL do vídeo, preservando a primeira ocorrência.
 * @param {PlayerOption[]} options - Opções lidas.
 * @returns {PlayerOption[]} Opções únicas.
 */
function dedupeByVid(options) {
  const seen = new Set();
  const unique = [];
  for (const option of options) {
    if (seen.has(option.vid)) continue;
    seen.add(option.vid);
    unique.push(option);
  }
  return unique;
}

/**
 * Obtém a query assinada da URL de mídia no serviço público usado pelo player da fonte.
 *
 * A mensagem de erro não repete `vid` nem a assinatura; o chamador acrescenta o rótulo da opção.
 *
 * @param {string} vid - URL do MP4 publicada no contêiner.
 * @param {string} videoPageUrl - Página do vídeo, enviada como `Referer`.
 * @returns {Promise<string>} URL de mídia com a query assinada.
 * @throws {Error} Se o serviço responder fora de 2xx, não devolver JSON de lista ou não trouxer
 *   `publicidade` iniciada por `?`.
 */
async function signVid(vid, videoPageUrl) {
  const url = `${SIGNATURE_URL}?${new URLSearchParams({ token: '', url: vid })}`;
  const response = await fetch(url, {
    headers: { ...HEADER_PROFILES.page, Referer: videoPageUrl },
  });
  if (!response.ok) throw new Error(`Serviço de assinatura respondeu HTTP ${response.status}`);
  let data;
  try {
    data = JSON.parse(await response.text());
  } catch {
    throw new Error('Serviço de assinatura não devolveu JSON válido');
  }
  if (!Array.isArray(data)) throw new Error('Serviço de assinatura não devolveu uma lista');
  const query = data
    .map((entry) => (entry && typeof entry.publicidade === 'string' ? entry.publicidade : null))
    .find((value) => value !== null && value.startsWith('?'));
  if (query === undefined) throw new Error('Serviço de assinatura não devolveu publicidade');
  if (vid.indexOf('?') === -1) return `${vid}${query}`;
  return `${vid}&${query.slice(1)}`;
}

/**
 * Monta um stream pela opção do player.
 * @param {PlayerOption} option - Opção com rótulo, qualidade, idioma e página do vídeo.
 * @param {string} signedUrl - URL de mídia assinada.
 * @param {object} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {object} Stream validado pelo bloco stream-build.
 * @throws {Error} Se os dados da opção não formarem um stream válido.
 */
function buildOptionStream(option, signedUrl, request, media) {
  const format = { template: FORMATTER.AUTO, addon: PROVIDER_NAME, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  return buildStream({
    url: signedUrl,
    quality: option.quality,
    language: option.language,
    type: STREAM_TYPE,
    format,
  });
}

/**
 * Localiza o contêiner pelo `id`, sem depender de seletor CSS com id numérico.
 * @param {Function} $ - Instância do cheerio.
 * @param {string} target - Valor de `data-target` da aba.
 * @returns {object|null} Contêiner encontrado ou null.
 */
function findContainer($, target) {
  const containers = $('.playerContainer');
  for (let index = 0; index < containers.length; index += 1) {
    const container = containers.eq(index);
    if (container.attr('id') === target) return container;
  }
  return null;
}

/**
 * Normaliza o rótulo da aba para comparar com `SD`, `HD` e `FULLHD`.
 * @param {string} text - Texto da aba.
 * @returns {string} Rótulo em maiúsculas e sem espaços.
 */
function normalizeLabel(text) {
  return text.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Carrega o cheerio fornecido pelo app.
 * @returns {object} Módulo do cheerio.
 */
function getCheerio() {
  return require('cheerio-without-node-native');
}
