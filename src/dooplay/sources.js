/** Origens DooPlay: busca, confirmação, episódio e botões. A mídia fica em players.js. */
import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { blockReason, httpUrl, loadHtml, originReferer } from '../_blocks/fireplayer/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { findBestMatch, titleSimilarity } from '../_blocks/title-match/index.mjs';
import { playEntries } from './players.js';

export const SOURCES = [
  { domain: 'filmesamadoresgratis.com', mode: 'rest', origin: 'https://filmesamadoresgratis.com' },
  { domain: 'www.pobreflixnow.rest', mode: 'ajax', origin: 'https://www.pobreflixnow.rest' },
  { domain: 'pobrexflix.art', mode: 'iframe', origin: 'https://pobrexflix.art' },
  { domain: 'hypetvflix.one', mode: 'iframe', origin: 'https://hypetvflix.one' },
  { domain: 'megafilmehdonline.blog', mode: 'iframe', origin: 'https://megafilmehdonline.blog' },
  { domain: 'boraflix.mom', mode: 'iframe', origin: 'https://boraflix.mom' },
];

/** @returns {Promise<{ status: 'sucesso', streams: object[] } | { status: 'ausencia', reason: string }>} */
export async function resolveSource(source, media, request) {
  request.stage = 'Busca';
  const content = await findContent(source, media, request);
  if (!content) return { status: 'ausencia', reason: 'título ausente' };
  let page = content;
  if (request.mediaType === 'tv') {
    request.stage = 'Episódio';
    const episode = await findEpisode(page, request);
    if (!episode) return { status: 'ausencia', reason: 'episódio ausente' };
    page = episode;
  }
  request.stage = 'Opções';
  const entries = readEntries(source, page, media, request);
  if (!entries.length) return { status: 'ausencia', reason: 'sem opção de reprodução' };
  const played = await playEntries(source.domain, entries, { media, request });
  if (!played.streams.length) {
    if (played.failures.length) throw new Error(played.failures.join('; '));
    return { status: 'ausencia', reason: 'opções descartadas por triagem' };
  }
  return { status: 'sucesso', streams: played.streams };
}

async function findContent(source, media, request) {
  const queries = [media.imdbId, media.title, media.originalTitle, ...media.alternativeTitles].filter(Boolean);
  const seen = new Set();
  const candidates = [];
  for (const query of queries) {
    const key = normalizeText(query);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const found = source.mode === 'rest'
      ? await searchJson(source, query, media)
      : await searchHtml(source, query, media);
    for (const item of found) {
      if (!candidates.some((candidate) => candidate.url === item.url)) candidates.push(item);
    }
  }
  const shortlist = rank(candidates, media);
  if (!shortlist.length) return null;
  const confirmed = [];
  let missingIframe = 0;
  for (const candidate of shortlist) {
    request.stage = 'Conteúdo';
    const page = await fetchPage(candidate.url, { headers: { Referer: originReferer(source.origin) } });
    const identity = readIdentity(page.text);
    if (identity.imdbIds.length && media.imdbId && !identity.imdbIds.includes(media.imdbId)) continue;
    if (identity.tmdbIds.length && !identity.tmdbIds.includes(String(media.tmdbId))) continue;
    if (source.mode === 'iframe' && request.mediaType === 'movie' && !identity.imdbIds.length) {
      missingIframe += 1;
      continue;
    }
    confirmed.push({ url: page.url, html: page.text, title: candidate.title, year: candidate.year });
  }
  if (confirmed.length === 1) return confirmed[0];
  if (!confirmed.length && missingIframe === shortlist.length) throw new Error('iframe de identidade ausente');
  return null;
}

function rank(candidates, media) {
  const titles = [media.title, media.originalTitle, ...media.alternativeTitles].filter((title) => typeof title === 'string' && title.trim());
  const viable = candidates.filter((candidate) => candidate.year == null || media.year == null || candidate.year === media.year);
  if (!viable.length) return [];
  findBestMatch(viable, media, { yearTolerance: 0 });
  const pool = viable.map((candidate) => ({
    candidate,
    score: Math.max(
      ...titles.map((title) => titleSimilarity(candidate.title, title)),
      isPrefix(candidate.title, titles) && candidate.year === media.year ? 0.85 : 0,
    ),
  })).filter((item) => item.score >= 0.85);
  if (!pool.length) return [];
  const highest = Math.max(...pool.map((item) => item.score));
  return pool.filter((item) => item.score === highest).map((item) => item.candidate);
}

function isPrefix(title, titles) {
  const text = normalizeText(title);
  return titles.some((item) => {
    const base = normalizeText(item);
    return base && (text === base || text.startsWith(`${base} `));
  });
}

async function searchJson(source, query, media) {
  const type = media.mediaType === 'tv' ? 'tvshows' : 'movies';
  const url = `${source.origin}/wp-json/dcfilter/v1/results?${new URLSearchParams({ keyword: query, type, page: '1' })}`;
  const data = await fetchJson(url, { profile: 'api', headers: { Referer: originReferer(source.origin) } });
  if (!data || !Array.isArray(data.items)) throw new Error('Busca JSON inválida');
  return data.items.map((item) => {
    if (!item || typeof item.url !== 'string' || typeof item.title !== 'string' || !item.title.trim()) {
      throw new Error('Item de busca incompleto');
    }
    const address = httpUrl(item.url, source.origin);
    return { url: address, title: cleanTitle(item.title), year: readYear(String(item.year || item.title)), type: item.type, keep: accepts(address, media.mediaType) };
  }).filter((item) => item.keep);
}

async function searchHtml(source, query, media) {
  const url = `${source.origin}/?${new URLSearchParams({ s: query })}`;
  const page = await fetchPage(url, { headers: { Referer: originReferer(source.origin) } });
  if (!/search-page|search-results|search-no-results/.test(page.text)) {
    throw new Error(blockReason(page.text) || 'HTML de busca não reconhecido');
  }
  const articles = loadHtml(page.text)('.search-page article');
  if (!articles.length) {
    if (/search-no-results|no-result|No results/i.test(page.text)) return [];
    throw new Error(blockReason(page.text) || 'Busca sem cartões nem mensagem explícita de ausência');
  }
  const found = [];
  for (let index = 0; index < articles.length; index += 1) {
    const article = articles.eq(index);
    const href = article.find('.title a').attr('href') || article.find('a').attr('href');
    if (!href) throw new Error('Cartão de busca sem endereço');
    const address = httpUrl(href, page.url);
    if (!accepts(address, media.mediaType)) continue;
    const raw = article.find('.title').text().trim();
    if (!raw) throw new Error('Cartão de busca sem título');
    found.push({ url: address, title: cleanTitle(raw), year: readYear(article.find('.year').text()) || readYear(raw) });
  }
  return found;
}

async function findEpisode(seriesPage, request) {
  const items = loadHtml(seriesPage.html)('li');
  let saw = false;
  let target = null;
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    if (!/\bmark-\d+\b/.test(item.attr('class') || '')) continue;
    saw = true;
    const coords = readCoords(item, seriesPage.url);
    if (coords.season === request.season && coords.episode === request.episode) {
      if (target) throw new Error('episódio repetido na listagem');
      target = coords.url;
    }
  }
  if (!saw) throw new Error('listagem de episódios não reconhecida');
  if (!target) return null;
  const page = await fetchPage(target, { headers: { Referer: seriesPage.url } });
  return { url: page.url, html: page.text, title: seriesPage.title, year: seriesPage.year };
}

function readCoords(item, pageUrl) {
  const numerando = item.find('.numerando').text();
  const fromText = /T\s*(\d+)\s*E\s*(\d+)/i.exec(numerando) || /(\d+)\s*-\s*(\d+)/.exec(numerando) || /(\d+)\s*x\s*(\d+)/i.exec(numerando);
  const anchors = item.find('a');
  let href = '';
  for (let index = 0; index < anchors.length; index += 1) {
    const value = anchors.eq(index).attr('href') || '';
    if (value.includes('/episodios/')) href = value;
  }
  if (!href) throw new Error('coordenadas ausentes na listagem');
  const url = httpUrl(href, pageUrl);
  const fromUrl = /-(\d+)x(\d+)\/?$/.exec(new URL(url).pathname);
  const season = fromText ? Number(fromText[1]) : fromUrl && Number(fromUrl[1]);
  const episode = fromText ? Number(fromText[2]) : fromUrl && Number(fromUrl[2]);
  if (!season || !episode) throw new Error('coordenadas ausentes na listagem');
  if (fromUrl && (Number(fromUrl[1]) !== season || Number(fromUrl[2]) !== episode)) {
    throw new Error('coordenadas contraditórias na listagem');
  }
  return { season, episode, url };
}

function readEntries(source, page, media, request) {
  const $ = loadHtml(page.html);
  if (source.mode === 'iframe') {
    const src = $('iframe.metaframe').attr('src');
    if (!src) throw new Error('iframe myembed ausente');
    const url = httpUrl(src, page.url);
    if (request.mediaType === 'tv') assertSeriesIframe(url, media, request);
    return [{ label: 'myembed', url, referer: page.url, languageHint: null }];
  }
  const buttons = $('li.dooplay_player_option');
  if (!buttons.length) throw new Error('página sem player reconhecido');
  const entries = [];
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons.eq(index);
    const nume = button.attr('data-nume') || '';
    if (!/^[1-9]\d*$/.test(nume)) continue;
    const post = button.attr('data-post');
    const type = button.attr('data-type') || request.mediaType;
    if (!post) throw new Error('botão sem data-post');
    if (type !== request.mediaType) throw new Error('tipo do player diverge do pedido');
    const label = button.find('.title').text().trim() || `Opção ${nume}`;
    entries.push({
      kind: 'dooplayer', label, post, nume, type, mode: source.mode, origin: source.origin,
      referer: page.url, languageHint: label,
    });
  }
  return entries;
}

function assertSeriesIframe(url, media, request) {
  const match = /\/serie\/(\d+)\/(\d+)\/(\d+)\/?$/.exec(new URL(url).pathname);
  if (!match) throw new Error('coordenadas ausentes');
  if (match[1] !== String(media.tmdbId) || Number(match[2]) !== request.season || Number(match[3]) !== request.episode) {
    throw new Error('coordenadas contraditórias');
  }
}

function readIdentity(html) {
  const imdbIds = new Set();
  const tmdbIds = new Set();
  const sameAs = [];
  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = block[1].trim();
    if (!raw) continue;
    try {
      collectSameAs(JSON.parse(raw), sameAs);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('JSON-LD inválido', { cause: error });
      throw error;
    }
  }
  for (const value of sameAs) addIds(value, imdbIds, tmdbIds);
  for (const href of html.matchAll(/href=["']([^"']+)["']/gi)) addIds(href[1], imdbIds, tmdbIds);
  for (const src of html.matchAll(/<iframe[^>]*src=["']([^"']+)["']/gi)) addIds(src[1], imdbIds, tmdbIds);
  return { imdbIds: [...imdbIds], tmdbIds: [...tmdbIds] };
}

function collectSameAs(node, found) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectSameAs(item, found));
    return;
  }
  if (node.sameAs != null) {
    const values = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs];
    values.forEach((item) => found.push(String(item)));
  }
  Object.values(node).forEach((value) => {
    if (value && typeof value === 'object') collectSameAs(value, found);
  });
}

function addIds(value, imdbIds, tmdbIds) {
  const imdb = /tt\d{5,}/.exec(value);
  if (imdb) imdbIds.add(imdb[0]);
  const tmdb = /themoviedb\.org\/(?:movie|tv)\/(\d+)/.exec(value);
  if (tmdb) tmdbIds.add(tmdb[1]);
  const serie = /\/serie\/(\d+)\/\d+\/\d+/.exec(value);
  if (serie) tmdbIds.add(serie[1]);
}

function accepts(url, mediaType) {
  const path = new URL(url).pathname;
  if (path.includes('/episodios/')) return false;
  if (mediaType === 'movie') return /^\/filmes?\//.test(path);
  return /^\/series?\//.test(path);
}

function cleanTitle(value) {
  return value.replace(/\s+\((?:19|20)\d{2}\)\s*$/, '').trim();
}

function readYear(text) {
  const match = /\b(?:19|20)\d{2}\b/.exec(text || '');
  return match ? Number(match[0]) : null;
}
