import { fetchJson, fetchText } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { isCollectionTitle, seasonNumbers, readMagnet, episodeTarget, formatBytes } from '../_blocks/torrent-release/index.mjs';
import { languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { buildStream, buildTorrentFileUrl } from '../_blocks/stream-build/index.mjs';
import { fetchTorrentFiles, findEpisodeFile } from '../_blocks/torrent-files/index.mjs';
import { discoverQuality } from '../_blocks/quality-discovery/index.mjs';
import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';

const ORIGIN = 'https://www.limefilmes.com';
const NUMBERS = ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];

/** Busca posts compatíveis com o pedido. */
export async function findPosts(media, request) {
  const categories = {};
  for (const slug of ['filmes', 'series', 'colecao']) {
    const result = await fetchJson(`${ORIGIN}/wp-json/wp/v2/categories?slug=${slug}`, { profile: 'api' });
    if (!Array.isArray(result) || result.length !== 1 || !Number.isInteger(result[0].id)) {
      throw new Error(`Categoria ${slug} ausente ou inválida`);
    }
    categories[slug] = result[0].id;
  }
  for (const term of searchTerms(media)) {
    const params = new URLSearchParams({ search: term, per_page: '20', _fields: 'id,link,title,categories' });
    const posts = await fetchJson(`${ORIGIN}/wp-json/wp/v2/posts?${params}`, { profile: 'api' });
    if (!Array.isArray(posts)) throw new Error('Busca da REST não retornou lista JSON');
    const candidates = posts.map(readPost).map((post) => ({ ...post, score: matchScore(post, categories, media, request) }))
      .filter((post) => post.score !== null);
    const accepted = [];
    for (const post of candidates) {
      const html = await fetchText(post.link);
      const ids = [...html.matchAll(/imdb\.com\/title\/(tt\d+)/gi)].map((match) => match[1].toLowerCase());
      if (media.imdbId && ids.length && !ids.includes(media.imdbId.toLowerCase())) continue;
      accepted.push({ ...post, html });
    }
    if (accepted.length) {
      const best = Math.max(...accepted.map((post) => post.score));
      const selected = accepted.filter((post) => post.score === best);
      const titles = new Set(selected.map((post) => normalizeText(post.prepared)));
      if (titles.size > 1) return [];
      return selected;
    }
  }
  return [];
}

function searchTerms(media) {
  const terms = [];
  for (const title of [media.title, media.originalTitle]) {
    if (!title || !title.trim()) continue;
    const digits = title.replace(/\b(um|dois|três|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/gi, (word) => {
      const index = NUMBERS.findIndex((item) => normalizeText(item) === normalizeText(word));
      return String(index + 1);
    });
    for (const value of [title, digits]) if (!terms.includes(value)) terms.push(value);
  }
  if (!terms.length) throw new Error('TMDB sem título para busca');
  return terms;
}

function readPost(post) {
  if (!post || !Number.isInteger(post.id) || typeof post.link !== 'string' ||
      !post.title || typeof post.title.rendered !== 'string' || !Array.isArray(post.categories)) {
    throw new Error('Post da REST sem id, link, título ou categorias');
  }
  const title = post.title.rendered.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').trim();
  const year = /\(((?:19|20)\d{2})\)/.exec(title);
  const prepared = title.replace(/\(((?:19|20)\d{2})\)/g, '')
    .replace(/\b\d+\s*[ªaºo]\s*temporada\b/gi, '')
    .replace(/\b(10|[1-9])\b/g, (_, digit) => NUMBERS[Number(digit) - 1]).trim();
  return { ...post, title, prepared, year: year ? Number(year[1]) : null };
}

function matchScore(post, categories, media, request) {
  if (!post.categories.includes(categories[request.mediaType === 'movie' ? 'filmes' : 'series'])) return null;
  if (request.mediaType === 'movie') {
    if (post.categories.includes(categories.colecao) || isCollectionTitle(post.title) || /\b\d{4}\s+a\s+\d{4}\b/i.test(post.title)) return null;
    if (post.year === null || (media.year !== null && Math.abs(post.year - media.year) > 1)) return null;
  } else {
    const seasons = seasonNumbers(`${post.title} ${post.link.replace(/-/g, ' ')}`);
    if (seasons.length !== 1 || seasons[0] !== request.season) return null;
  }
  const matchMedia = request.mediaType === 'tv' ? { ...media, year: null } : media;
  const candidate = { title: post.prepared, year: request.mediaType === 'tv' ? null : post.year };
  const match = findBestMatch([candidate], matchMedia, { yearTolerance: 1 });
  if (match) return match.score;
  const normalized = normalizeText(post.prepared);
  const prefix = [media.title, media.originalTitle, ...media.alternativeTitles].some((title) => {
    const value = normalizeText(title);
    return value && (normalized === value || normalized.startsWith(`${value} `));
  });
  return prefix ? 0.85 : null;
}

/** Retorna as opções dos posts encontrados. */
export async function collectStreams(media, request) {
  const posts = await findPosts(media, request);
  const options = posts.flatMap((post) => readOptions(post.html));
  const results = await Promise.all(options.map((option) => makeStream(option, media, request)
    .then((stream) => ({ stream }))
    .catch((error) => {
      console.warn(`[LimeFilmes] Opção descartada: ${error.message}`);
      return { error };
    })));
  const streams = new Map();
  for (const result of results) if (result.stream) streams.set(result.stream.infoHash, result.stream);
  if (!streams.size && results.some((result) => result.error)) throw new Error('Todas as opções de magnet falharam');
  return [...streams.values()];
}

function readOptions(html) {
  const article = /<article\b[^>]*\bclass\s*=\s*["'][^"']*\bpost-block\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (!article) throw new Error('Artigo do post ausente');
  const content = article[1].split(/<[^>]+class=["'][^"']*\brelated-section\b/i)[0];
  const options = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(match[1]);
    if (!href) continue;
    let raw = href[1].replace(/&amp;/gi, '&');
    if (/^magnet%3a/i.test(raw)) raw = decodeURIComponent(raw);
    const decoded = raw.replace(/(xt=urn)%3a(btih)%3a/gi, '$1:$2:');
    if (!/^magnet:\?/i.test(decoded)) continue;
    const button = /\bclass\s*=\s*["'][^"']*\bdownload-btn\b/i.test(match[1]);
    const headers = [...content.slice(0, match.index).matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
    const label = strip(button ? match[2] : headers.length ? headers[headers.length - 1][1] : '');
    options.push({ href: decoded, label });
  }
  return options;
}

function strip(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

async function makeStream(option, media, request) {
  if (!option.label) throw new Error('Magnet sem rótulo');
  const magnet = readMagnet(option.href);
  const quality = discoverQuality([option.label, magnet.dn]);
  const language = languageFromTexts([option.label, magnet.dn]);
  const sizeMatch = /\b\d+(?:[.,]\d+)?\s*(?:GB|MB)\b/i.exec(option.label);
  const size = sizeMatch ? sizeMatch[0] : null;
  let url = magnet.href;
  let filename = magnet.dn || undefined;
  let folderName;
  let folderSize;
  let streamSize = size || undefined;

  if (request.mediaType === 'tv') {
    const label = option.label.replace(/\bE(\d+)\s*-\s*E?(\d+)/gi, 'Episódios $1 ao $2')
      .replace(/\bEp\s*[-:]?\s*(\d+)\s*\/\s*(\d+)/gi, 'Episódios $1 ao $2')
      .replace(/\bEp\s*[-:]?\s*(\d+)/gi, 'Episódio $1');
    const episode = episodeTarget(label) || episodeTarget(magnet.dn || '');
    if (episode && ((episode.season && episode.season !== request.season) || !episode.episodes.includes(request.episode))) return null;
    const seasons = seasonNumbers(`${option.label} ${magnet.dn || ''}`);
    if (seasons.length && !seasons.includes(request.season)) return null;
    if (!episode || episode.kind === 'range') {
      const files = await fetchTorrentFiles(magnet.hash);
      const index = findEpisodeFile(files, { season: request.season, episode: request.episode, seasonPack: true });
      if (index === null) {
        console.log(`[LimeFilmes] Pacote ${magnet.hash.slice(0, 8)} descartado: episódio não identificado`);
        return null;
      }
      url = buildTorrentFileUrl(magnet.hash, index);
      const file = files.find((item) => item.index === index);
      filename = file ? file.path : undefined;
      folderName = magnet.dn || undefined;
      folderSize = size || undefined;
      if (file && Number.isInteger(file.size) && file.size >= 0) {
        streamSize = formatBytes(file.size);
      }
    }
  }

  const format = {
    template: FORMATTER.AUTO,
    addon: 'LimeFilmes',
    title: media.title,
  };
  if (media.year !== null && media.year !== undefined) format.year = media.year;
  if (request.mediaType === 'tv') {
    if (request.season) format.season = request.season;
    if (request.episode) format.episode = request.episode;
  }
  if (filename) format.filename = filename;
  if (folderName) format.folderName = folderName;
  if (folderSize && folderSize !== streamSize) format.folderSize = folderSize;

  const stream = {
    url,
    quality,
    infoHash: magnet.hash,
    type: url.startsWith('magnet:') ? 'magnet' : 'torrent',
    language: language || undefined,
    format,
  };
  if (streamSize) stream.size = streamSize;
  return buildStream(stream);
}
