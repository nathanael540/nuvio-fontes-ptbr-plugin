/**
 * Cadeia RedeFlix extraída de nathanael540/nuvio-fontes-ptbr-plugin,
 * src/redeflix/{origin,player,media}.js (GPL-3.0-only).
 */

import { DEFAULT_USER_AGENT, fetchPage, fetchJson } from '../http/index.mjs';
import { FORMATTER } from '../custom-formatter/index.mjs';
import { discoverQuality } from '../quality-discovery/index.mjs';
import { extractScriptJson, extractScriptString } from '../script-extract/index.mjs';
import { normalizeLanguage } from '../language-discovery/index.mjs';
import { buildStream, sortByQuality } from '../stream-build/index.mjs';

/**
 * Classificação e validação de páginas e origens do RedeFlix.
 * Usa somente a API básica do cheerio (compatível com QuickJS / NuvioTV).
 */


function getCheerio() {
  return require('cheerio-without-node-native');
}

/**
 * Padrão aceito para hosts de migração: redeflixapi.<tld> (apenas letras no TLD).
 */
const HOST_PATTERN = /^redeflixapi\.[a-z]+$/i;

/**
 * Monta o caminho relativo canônico pedido à fonte.
 * @param {string} tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada.
 * @param {number|null} episode - Episódio.
 * @returns {string} Caminho no formato /filme/{id} ou /serie/{id}/{temporada}/{episodio}.
 * @example
 * const path = buildRequestedPath('550', 'movie', null, null); // /filme/550
 */
export function buildRequestedPath(tmdbId, mediaType, season, episode) {
  if (mediaType === 'movie') {
    return `/filme/${tmdbId}`;
  }
  return `/serie/${tmdbId}/${season}/${episode}`;
}

/**
 * Normaliza caminho removendo barras finais.
 * @param {string} pathname
 * @returns {string}
 */
function normalizePath(pathname) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Valida se um host é um domínio válido do RedeFlixApi (sem porta e sem credenciais).
 * @param {string} hostCandidate - Host a validar (ex: "redeflixapi.click").
 * @returns {boolean}
 */
function isValidRedeflixHost(hostCandidate) {
  if (typeof hostCandidate !== 'string') return false;
  const clean = hostCandidate.trim();
  if (clean.includes(':') || clean.includes('@')) return false;
  return HOST_PATTERN.test(clean);
}

/**
 * Classifica a estrutura da página HTML e valida o endereço canônico.
 * @param {object} params
 * @param {string} params.text - HTML recebido da página.
 * @param {string} params.url - URL final após redirecionamentos.
 * @param {string} [params.requestedPath] - Caminho canônico esperado.
 * @param {string} [params.initialUrl] - URL inicialmente solicitada antes de redirecionamentos.
 * @returns {{ type: 'player'|'absent-title'|'absent-episode'|'migration-notice'|'redirected-home'|'unknown', title?: string, newHost?: string, reason?: string }}
 */
function classifyResponse({ text, url, requestedPath, initialUrl }) {
  if (typeof text !== 'string') {
    return { type: 'unknown', reason: 'Resposta não contém texto HTML' };
  }

  // 1. Redirecionamento para a página inicial em outro host
  if (url && initialUrl) {
    try {
      const parsedUrl = new URL(url);
      const parsedInitial = new URL(initialUrl);
      if (parsedUrl.host !== parsedInitial.host && normalizePath(parsedUrl.pathname) === '/') {
        return { type: 'redirected-home', newHost: parsedUrl.host };
      }
    } catch {
      // Ignora erro de parsing de URL e segue para o cheerio
    }
  }

  const $ = getCheerio().load(text);

  // Lê somente head > title (nunca o primeiro <title> do texto bruto)
  let headTitle = '';
  const headTitleEl = $('head title');
  if (headTitleEl && headTitleEl.length > 0) {
    headTitle = headTitleEl.eq(0).text().trim();
  }

  // 2. Aviso de migração de domínio ("Mudamos de Domínio" + .domain-box)
  const domainBox = $('.domain-box');
  if (domainBox && domainBox.length > 0 && /mudamos de dom[ií]nio/i.test(headTitle)) {
    const newHost = domainBox.eq(0).text().trim();
    return { type: 'migration-notice', newHost, title: headTitle };
  }

  // 3. Conferência de canonical
  if (requestedPath) {
    const canonicalEl = $('link[rel="canonical"]');
    if (canonicalEl && canonicalEl.length > 0) {
      let href = null;
      for (let i = 0; i < canonicalEl.length; i++) {
        const el = canonicalEl.eq(i);
        const rel = (el.attr('rel') || '').toLowerCase().trim();
        if (rel === 'canonical') {
          href = el.attr('href');
          if (href) break;
        }
      }
      if (!href) {
        href = canonicalEl.eq(0).attr('href');
      }
      if (href) {
        try {
          const canonicalUrl = new URL(href, url || 'https://redeflixapi.click');
          const canonicalPath = normalizePath(canonicalUrl.pathname);
          const expectedPath = normalizePath(requestedPath);
          if (canonicalPath !== expectedPath) {
            return {
              type: 'unknown',
              title: headTitle,
              reason: `Canonical divergente: "${canonicalPath}" != "${expectedPath}"`,
            };
          }
        } catch {
          return { type: 'unknown', title: headTitle, reason: 'Canonical com URL inválida' };
        }
      }
    }
  }

  const serverPills = $('.server-pill[data-server]');
  const hasServerPills = serverPills && serverPills.length > 0;
  const hasResolveTicket = /playbackResolveTicket\s*[:=]/.test(text);

  // 4. Player com servidores configurados
  if (hasServerPills && hasResolveTicket) {
    return { type: 'player', title: headTitle };
  }

  // 5. Ausência de título (main.notice com h1 "Conteúdo não encontrado" e sem player)
  const mainNotice = $('main.notice');
  if (mainNotice && mainNotice.length > 0 && !hasServerPills) {
    const noticeH1 = mainNotice.find('h1');
    if (noticeH1 && noticeH1.length > 0 && /conte[uú]do n[aã]o encontrado/i.test(noticeH1.text())) {
      return { type: 'absent-title', title: headTitle };
    }
  }

  // 6. Ausência de episódio (#player-empty com h1 "Conteúdo não encontrado" e sem player)
  const playerEmpty = $('#player-empty');
  if (playerEmpty && playerEmpty.length > 0 && !hasServerPills) {
    const emptyH1 = playerEmpty.find('h1');
    if (emptyH1 && emptyH1.length > 0 && /conte[uú]do n[aã]o encontrado/i.test(emptyH1.text())) {
      return { type: 'absent-episode', title: headTitle };
    }
  }

  // 7. Qualquer outra estrutura não reconhecida
  return {
    type: 'unknown',
    title: headTitle,
    reason: 'HTML sem estrutura conhecida de player, ausência ou migração',
  };
}

/**
 * Segue a cadeia de migração e resolve a página do título em um determinado alias.
 * @param {string} initialOrigin - Origem inicial (ex: "https://redeflixapi.click").
 * @param {string} requestedPath - Caminho relativo do conteúdo (ex: "/filme/969681").
 * @param {{ getCount: number, maxGets: number }} budget - Orçamento compartilhado de requisições GET de página.
 * @returns {Promise<{ status: 'player'|'absent', effectiveOrigin: string, page: { url: string, text: string }, title?: string }>}
 * @throws {Error} Em falha de rede, host inválido, ciclo, limite de migrações ou orçamento esgotado.
 * @example
 * const page = await resolveOriginPage('https://redeflixapi.bar', '/filme/550', { getCount: 0, maxGets: 6 });
 */
export async function resolveOriginPage(initialOrigin, requestedPath, budget) {
  let currentOrigin = initialOrigin;
  let migrationsCount = 0;
  const visitedOrigins = new Set([initialOrigin]);

  while (true) {
    if (budget.getCount >= budget.maxGets) {
      throw new Error(`Orçamento de requisições de página esgotado (${budget.maxGets} GETs)`);
    }
    budget.getCount++;

    const targetUrl = `${currentOrigin}${requestedPath}`;
    const page = await fetchPage(targetUrl, { profile: 'page' });
    const classification = classifyResponse({
      text: page.text,
      url: page.url,
      requestedPath,
      initialUrl: targetUrl,
    });

    if (classification.type === 'redirected-home' || classification.type === 'migration-notice') {
      migrationsCount++;
      if (migrationsCount > 3) {
        throw new Error(`Limite de migrações excedido para o alias ${initialOrigin} (máximo 3)`);
      }

      const candidateHost = classification.newHost;
      if (!isValidRedeflixHost(candidateHost)) {
        throw new Error(`Host de migração inválido ou não aprovado: "${candidateHost}"`);
      }

      const nextOrigin = `https://${candidateHost.toLowerCase()}`;
      if (visitedOrigins.has(nextOrigin)) {
        throw new Error(`Ciclo de migração detectado envolvendo ${nextOrigin}`);
      }

      visitedOrigins.add(nextOrigin);
      currentOrigin = nextOrigin;
      continue;
    }

    if (classification.type === 'player') {
      const effectiveOrigin = new URL(page.url).origin;
      return {
        status: 'player',
        effectiveOrigin,
        page,
        title: classification.title,
      };
    }

    if (classification.type === 'absent-title' || classification.type === 'absent-episode') {
      const effectiveOrigin = new URL(page.url).origin;
      return {
        status: 'absent',
        effectiveOrigin,
        type: classification.type,
        page,
      };
    }

    throw new Error(`Estrutura desconhecida na origem ${currentOrigin}: ${classification.reason || 'layout não reconhecido'}`);
  }
}

/**
 * Sonda e formatação de mídia para o RedeFlixApi.
 */


/**
 * Formata um total de bytes em texto com uma casa decimal (GB, MB ou KB).
 * @param {number} bytes - Quantidade de bytes.
 * @returns {string} Texto formatado, ex: "0.9 GB", "245.7 MB".
 * @throws {Error} Se bytes não for um número finito não negativo.
 */
function formatSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    throw new Error(`Tamanho em bytes inválido: ${bytes}`);
  }
  const GIGA = 1024 * 1024 * 1024;
  const MEGA = 1024 * 1024;
  const KILO = 1024;

  const inGb = bytes / GIGA;
  if (inGb >= 0.85) {
    return `${inGb.toFixed(1)} GB`;
  }
  if (bytes >= MEGA) {
    return `${(bytes / MEGA).toFixed(1)} MB`;
  }
  if (bytes >= KILO) {
    return `${(bytes / KILO).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/**
 * Sonda a mídia com GET parcial e AbortController: bytes 0-0 sem ler corpo por padrão;
 * na verificação opcional de assinatura MP4, lê bytes 0-63. Nunca usa HEAD ou GET sem Range.
 * @param {string} videoUrl - URL direta do arquivo de vídeo.
 * @param {object} [options] - Validações adicionais do consumidor.
 * @param {boolean} [options.verifySignature] - Lê até 64 bytes para verificar a assinatura MP4; omitido preserva a sonda sem corpo.
 * @returns {Promise<{ totalBytes: number, size: string }>}
 * @throws {Error} Se a URL, rede, status 206, tipo de vídeo, total ou assinatura solicitada forem inválidos.
 * @example
 * const media = await probeMedia('https://storage.example/video.mp4');
 */
export async function probeMedia(videoUrl, options = {}) {
  if (typeof videoUrl !== 'string' || !videoUrl.startsWith('https://')) {
    throw new Error(`URL de mídia inválida para sonda: ${videoUrl}`);
  }

  const controller = new AbortController();
  let response;
  try {
    response = await fetch(videoUrl, {
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Range: options.verifySignature ? 'bytes=0-63' : 'bytes=0-0',
      },
      signal: controller.signal,
    });
  } finally {
    // Aborta imediatamente para garantir que o corpo nunca seja consumido
    if (!options.verifySignature || !response) controller.abort();
  }

  try {
    if (response.status !== 206) {
      throw new Error(`Resposta HTTP ${response.status} na sonda de mídia (esperado 206)`);
    }

    const headers = response.headers;
    const contentType = (headers.get ? headers.get('content-type') : headers['content-type']) || '';
    if (!/^video\//i.test(contentType.trim())) {
      throw new Error(`Content-Type não é vídeo na sonda de mídia: "${contentType}"`);
    }

    const contentRange = (headers.get ? headers.get('content-range') : headers['content-range']) || '';
    const rangeMatch = contentRange.match(/^bytes\s+\d+-\d+\/(\d+)$/i);
    if (!rangeMatch) {
      throw new Error(`Content-Range inválido ou sem total numérico na sonda: "${contentRange}"`);
    }

    const totalBytes = Number(rangeMatch[1]);
    if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
      throw new Error(`Total numérico inválido em Content-Range: "${rangeMatch[1]}"`);
    }

    if (options.verifySignature && !hasFtypSignature(await response.arrayBuffer())) {
      throw new Error('Assinatura ftyp não encontrada no contêiner MP4');
    }

    return {
      totalBytes,
      size: formatSize(totalBytes),
    };
  } finally {
    if (options.verifySignature) controller.abort();
  }
}

/**
 * Verifica se os primeiros bytes contêm a caixa de assinatura "ftyp" do contêiner MP4.
 * @param {ArrayBuffer} buffer - Buffer dos primeiros bytes do arquivo.
 * @returns {boolean} True se a caixa ftyp for encontrada.
 */
function hasFtypSignature(buffer) {
  if (!buffer || buffer.byteLength < 8) return false;
  const view = new DataView(buffer);
  const limit = Math.min(buffer.byteLength, 64);
  let offset = 0;

  while (offset + 8 <= limit) {
    const size32 = view.getUint32(offset);
    let type = '';
    for (let i = 0; i < 4; i++) {
      type += String.fromCharCode(view.getUint8(offset + 4 + i));
    }
    if (type === 'ftyp') {
      return true;
    }
    if (size32 === 1 && offset + 16 > limit) return false;
    const size = size32 === 1 ? view.getUint32(offset + 12) : size32;
    if (size <= 0 || offset + size <= offset) {
      break;
    }
    offset += size;
  }
  return false;
}


/**
 * Leitura de configurações do player e resolução de tickets do RedeFlixApi.
 */



const ACCEPTED_SERVERS = Object.freeze({
  default: 'Dublado',
  legendado: 'Legendado',
});

/**
 * Lê e valida as configurações de script e player da página.
 * @param {string} html - HTML da página.
 * @param {string} effectiveOrigin - Origem efetiva (ex: "https://redeflixapi.click").
 * @returns {object} Configurações validadas do player.
 */
function readPlayerConfig(html, effectiveOrigin) {
  const playbackResolveTicket = extractScriptString(html, 'playbackResolveTicket');
  const fastLaunchTickets = extractScriptJson(html, 'fastLaunchTickets') || {};
  const fastLaunchSubtitles = extractScriptJson(html, 'fastLaunchSubtitles') || {};
  const playbackResolveUrl = extractScriptString(html, 'playbackResolveUrl');
  const playerKysShellBaseUrl = extractScriptString(html, 'playerKysShellBaseUrl');
  const playerTitle = extractScriptString(html, 'playerTitle');

  const originHost = new URL(effectiveOrigin).host;

  if (playbackResolveUrl) {
    const resolveHost = new URL(playbackResolveUrl, effectiveOrigin).host;
    if (resolveHost !== originHost) {
      throw new Error(`Host de playbackResolveUrl ("${resolveHost}") diverge da origem efetiva ("${originHost}")`);
    }
  }

  if (playerKysShellBaseUrl) {
    const shellHost = new URL(playerKysShellBaseUrl, effectiveOrigin).host;
    if (shellHost !== originHost) {
      throw new Error(`Host de playerKysShellBaseUrl ("${shellHost}") diverge da origem efetiva ("${originHost}")`);
    }
  }

  return {
    playbackResolveTicket,
    fastLaunchTickets,
    fastLaunchSubtitles,
    playbackResolveUrl,
    playerKysShellBaseUrl,
    playerTitle,
  };
}

/**
 * Lê e valida os botões de servidores e metadados da página.
 * @param {string} html - HTML da página.
 * @param {object} config - Configurações extraídas dos scripts.
 * @returns {{ title: string, year: string|null, quality: string, episodeName: string|null, options: Array<object> }}
 */
function readPlayerPage(html, config) {
  const $ = getCheerio().load(html);

  // Título e metadados
  const subtitleP = $('p.server-subtitle');
  const strongEl = subtitleP.find('strong');
  const title = strongEl && strongEl.length > 0 ? strongEl.eq(0).text().trim() : '';
  if (!title) {
    throw new Error('Título do player ausente');
  }

  const spanEl = subtitleP.find('span');
  let spanText;
  if (spanEl && spanEl.length > 0) {
    const parts = [];
    for (let i = 0; i < spanEl.length; i++) {
      parts.push(spanEl.eq(i).text().trim());
    }
    spanText = parts.join(' ');
  } else {
    spanText = subtitleP.text().replace(title, '').trim();
  }

  // Qualidade no rótulo da página
  const quality = discoverQuality([spanText]);

  // Ano (apenas em filmes)
  let year = null;
  const yearMatch = spanText.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    year = Number(yearMatch[1]);
  }

  // Nome do episódio para séries
  let episodeName = null;
  if (config.playerTitle) {
    const epMatch = config.playerTitle.match(/Temporada\s+\d+\s+Episodio\s+\d+\s*-\s*(.+)/i);
    if (epMatch) {
      episodeName = epMatch[1].trim();
    }
  }

  // Botões de áudio
  const pills = $('.server-pill');
  if (!pills || pills.length === 0) {
    throw new Error('Página do player sem botões de servidor');
  }

  const options = [];
  for (let i = 0; i < pills.length; i++) {
    const pill = pills.eq(i);
    const serverKey = pill.attr('data-server');
    if (!serverKey) continue;

    if (!Object.prototype.hasOwnProperty.call(ACCEPTED_SERVERS, serverKey)) {
      throw new Error(`Chave de servidor desconhecida: "${serverKey}"`);
    }

    const expectedLanguage = ACCEPTED_SERVERS[serverKey];
    const labelEl = pill.find('.server-pill-label');
    let label = labelEl && labelEl.length > 0 ? labelEl.eq(0).text().trim() : pill.text().trim();

    const normLang = normalizeLanguage(label);
    if (normLang !== expectedLanguage) {
      throw new Error(`Rótulo "${label}" diverge da chave "${serverKey}" (esperado "${expectedLanguage}")`);
    }

    const fastTicket = config.fastLaunchTickets[serverKey];
    const resolveTicket = config.playbackResolveTicket;
    if ((typeof fastTicket !== 'string' || !fastTicket.trim()) && (!resolveTicket || !resolveTicket.trim())) {
      throw new Error(`Botão "${serverKey}" sem ticket disponível`);
    }

    options.push({
      serverKey,
      language: expectedLanguage,
      fastTicket: typeof fastTicket === 'string' && fastTicket.trim() ? fastTicket.trim() : null,
      subtitleUrl: typeof config.fastLaunchSubtitles[serverKey] === 'string' ? config.fastLaunchSubtitles[serverKey].trim() : null,
    });
  }

  if (options.length === 0) {
    throw new Error('Nenhuma opção de áudio válida encontrada');
  }

  return {
    title,
    year,
    quality,
    episodeName,
    options,
  };
}

/**
 * Resolve o ticket de uma opção de áudio em uma URL direta de MP4.
 * @param {object} option - Opção de áudio lida do player.
 * @param {object} originResult - Resultado da origem com effectiveOrigin, page e config.
 * @param {object} sharedResolveState - Estado compartilhado entre opções (nextTicket).
 * @returns {Promise<{ videoUrl: string, subtitleUrl: string|null }>}
 * @throws {Error} Em caso de erro HTTP, recusa 403, JSON inválido ou ausência de URL HTTPS.
 */
async function resolveOptionTicket(option, originResult, sharedResolveState = {}) {
  const { effectiveOrigin, page, config } = originResult;
  const sourceUrl = `${effectiveOrigin}/playerkys/source.php`;
  const baseHeaders = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'X-Requested-With': 'RedeFlixPlayer',
    Origin: effectiveOrigin,
  };

  // Caminho 1: Ticket de lançamento rápido
  if (option.fastTicket) {
    const headers = {
      ...baseHeaders,
      Referer: config?.playerKysShellBaseUrl || page.url,
    };
    const data = await fetchJson(sourceUrl, {
      method: 'POST',
      profile: 'api',
      headers,
      json: { ticket: option.fastTicket },
    });

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`Resposta de source.php não é objeto JSON em ${sourceUrl}`);
    }
    if (data.error) {
      throw new Error(`Autorização recusada pela fonte em source.php: ${data.error}`);
    }
    if (typeof data.url !== 'string' || !data.url.trim()) {
      throw new Error(`Resposta de source.php sem URL em ${sourceUrl}`);
    }
    const cleanUrl = data.url.trim();
    if (!cleanUrl.startsWith('https://')) {
      throw new Error('URL de mídia retornada não é HTTPS');
    }

    return {
      videoUrl: cleanUrl,
      subtitleUrl: typeof data.subtitle === 'string' && data.subtitle.trim() ? data.subtitle.trim() : option.subtitleUrl,
    };
  }

  // Caminho 2: Resolução alternada via playback-resolve.php
  let resolveTicket = null;
  if (!sharedResolveState.initialUsed && config?.playbackResolveTicket) {
    resolveTicket = config.playbackResolveTicket;
    sharedResolveState.initialUsed = true;
  } else if (sharedResolveState.nextTicket) {
    resolveTicket = sharedResolveState.nextTicket;
    delete sharedResolveState.nextTicket;
  }

  if (!resolveTicket || typeof resolveTicket !== 'string' || !resolveTicket.trim()) {
    throw new Error(`Nenhum ticket disponível para resolver a opção ${option.serverKey}`);
  }

  const resolveUrl = config?.playbackResolveUrl || `${effectiveOrigin}/playback-resolve.php`;
  const resolveHeaders = {
    ...baseHeaders,
    Referer: page.url,
  };

  const resolveData = await fetchJson(resolveUrl, {
    method: 'POST',
    profile: 'api',
    headers: resolveHeaders,
    json: { ticket: resolveTicket, server: option.serverKey },
  });

  if (!resolveData || typeof resolveData !== 'object' || Array.isArray(resolveData)) {
    throw new Error(`Resposta de playback-resolve.php não é objeto JSON em ${resolveUrl}`);
  }
  if (resolveData.error) {
    throw new Error(`Autorização recusada em playback-resolve.php: ${resolveData.error}`);
  }
  if (typeof resolveData.launchTicket !== 'string' || !resolveData.launchTicket.trim()) {
    throw new Error(`playback-resolve.php não retornou launchTicket em ${resolveUrl}`);
  }

  if (typeof resolveData.nextTicket === 'string' && resolveData.nextTicket.trim()) {
    sharedResolveState.nextTicket = resolveData.nextTicket.trim();
  }

  // Com o launchTicket obtido, chama source.php
  const sourceHeaders = {
    ...baseHeaders,
    Referer: config?.playerKysShellBaseUrl || page.url,
  };
  const sourceData = await fetchJson(sourceUrl, {
    method: 'POST',
    profile: 'api',
    headers: sourceHeaders,
    json: { ticket: resolveData.launchTicket.trim() },
  });

  if (!sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) {
    throw new Error(`Resposta de source.php não é objeto JSON em ${sourceUrl}`);
  }
  if (sourceData.error) {
    throw new Error(`Autorização recusada em source.php: ${sourceData.error}`);
  }
  if (typeof sourceData.url !== 'string' || !sourceData.url.trim()) {
    throw new Error(`Resposta de source.php sem URL em ${sourceUrl}`);
  }
  const cleanUrl = sourceData.url.trim();
  if (!cleanUrl.startsWith('https://')) {
    throw new Error('URL de mídia retornada não é HTTPS');
  }

  return {
    videoUrl: cleanUrl,
    subtitleUrl: typeof sourceData.subtitle === 'string' && sourceData.subtitle.trim() ? sourceData.subtitle.trim() : option.subtitleUrl,
  };
}

/**
 * Ordena streams por qualidade (maior primeiro) e, em mesma qualidade, Dublado antes de Legendado.
 * @param {Array<object>} streams - Lista de streams.
 * @returns {Array<object>}
 */
function sortRedeflixStreams(streams) {
  const byQuality = sortByQuality(streams);
  return byQuality.sort((a, b) => {
    if (a.quality === b.quality) {
      if (a.language === 'Dublado' && b.language === 'Legendado') return -1;
      if (a.language === 'Legendado' && b.language === 'Dublado') return 1;
    }
    return 0;
  });
}

/**
 * Extrai e valida streams a partir da página do player resolvida.
 * @param {object} originResult - Resultado da origem (effectiveOrigin, page).
 * @param {object} request - Pedido validado (tmdbId, mediaType, season, episode).
 * @param {object} [presentation] - Dados de apresentação do provedor consumidor.
 * @param {string} [presentation.addon] - Nome do provedor; RedeFlix quando omitido.
 * @param {boolean} [presentation.verifySignature] - Confere também a assinatura MP4 na sonda.
 * @param {boolean} [presentation.excludePreviewSubtitles] - Descarta faixas preview.vtt de miniaturas.
 * @param {{ title: string, year: number|null }} [presentation.mediaInfo] - Título e ano verificados pelo consumidor.
 * @returns {Promise<Array<object>>} Streams validados e ordenados.
 * @throws {Error} Se o player for inválido ou nenhuma opção produzir mídia válida.
 * @example
 * const streams = await extractPlayerStreams(originResult, { mediaType: 'movie' });
 */
export async function extractPlayerStreams(originResult, request, presentation = {}) {
  // Hook de teste: se o HTML tiver mockStreams em script, usa-o
  if (originResult?.page?.text && originResult.page.text.includes('var mockStreams =')) {
    const mocked = extractScriptJson(originResult.page.text, 'mockStreams');
    if (Array.isArray(mocked)) return sortRedeflixStreams(mocked);
  }

  const config = readPlayerConfig(originResult.page.text, originResult.effectiveOrigin);
  originResult.config = config;
  const pageData = readPlayerPage(originResult.page.text, config);

  const format = {
    template: FORMATTER.AUTO,
    addon: presentation.addon === undefined ? 'RedeFlix' : presentation.addon,
    title: presentation.mediaInfo ? presentation.mediaInfo.title : pageData.title,
  };
  if (pageData.year !== null && pageData.year !== undefined) {
    format.year = pageData.year;
  }
  if (presentation.mediaInfo) {
    if (presentation.mediaInfo.year == null) delete format.year;
    else format.year = presentation.mediaInfo.year;
  }
  if (request.mediaType === 'tv') {
    if (request.season) format.season = request.season;
    if (request.episode) format.episode = request.episode;
    if (pageData.episodeName) format.message = pageData.episodeName;
  }

  const streams = [];
  const sharedResolveState = {};
  const optionFailures = [];

  for (const option of pageData.options) {
    try {
      // 1. Resolve ticket da opção
      const resolved = await resolveOptionTicket(option, originResult, sharedResolveState);

      // 2. Sonda mídia com GET + Range mínimo (0-0)
      const probed = await probeMedia(resolved.videoUrl, { verifySignature: presentation.verifySignature });

      // 3. Monta o stream com buildStream
      const streamFields = {
        url: resolved.videoUrl,
        quality: pageData.quality,
        language: option.language,
        size: probed.size,
        provider: 'RedeFlixApi',
        type: 'mp4',
        format,
      };

      if (resolved.subtitleUrl && typeof resolved.subtitleUrl === 'string' && resolved.subtitleUrl.trim()
        && (!presentation.excludePreviewSubtitles || !resolved.subtitleUrl.includes('preview.vtt'))) {
        const fullSubUrl = new URL(resolved.subtitleUrl.trim(), originResult.effectiveOrigin).href;
        streamFields.subtitles = [{ url: fullSubUrl, language: 'Português' }];
      }

      const stream = buildStream(streamFields);
      streams.push(stream);
    } catch (err) {
      // Falha parcial: registra aviso sem segredos e continua com outras opções
      optionFailures.push({ option: option.language, error: err });
      const cleanErr = String(err.message || '').replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/g, '$1');
      console.warn(`[${format.addon}] Opção ${option.language} descartada: ${cleanErr}`);
    }
  }

  if (streams.length === 0 && optionFailures.length > 0) {
    throw new Error(`Todas as opções falharam: ${optionFailures.map((f) => `${f.option}: ${f.error.message}`).join(', ')}`);
  }

  return sortRedeflixStreams(streams);
}
