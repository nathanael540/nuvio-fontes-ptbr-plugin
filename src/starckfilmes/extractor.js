/**
 * Extração de títulos e opções de torrent da fonte Starck Filmes.
 */

import { fetchText } from '../_blocks/http/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import {
  isCollectionTitle,
  seasonNumbers,
  classifyMagnetOption,
  resolveTorrentOptions,
} from '../_blocks/torrent-release/index.mjs';
import { decodeXid } from './xid.js';

export const SOURCE_URL = 'https://starckfilmes-v29.com';

/**
 * Carrega o documento HTML com o Cheerio do app.
 *
 * @param {string} html - Conteúdo HTML da página.
 * @returns {object} Instância do Cheerio.
 */
export function htmlDocument(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}

/**
 * Analisa os resultados da busca ignorando os destaques fixos do site.
 *
 * @param {string} html - HTML da página de busca.
 * @returns {{ link: string, title: string, year: number|null, yearText: string, audioType: string }[]} Lista de resultados.
 */
export function parseSearchResults(html) {
  const $ = htmlDocument(html);
  // O site exibe indicação explícita quando a busca é vazia
  if ($('.st-result').length || $('.st-msg').length) return [];

  const items = $('.home.post-catalog .item');
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const item = items.eq(i);
    const link = item.find('a').attr('href') || item.find('.sub-item a').attr('href');
    if (!link) continue;

    const title = item.find('h3 a.title').text().trim() ||
      item.find('a[title]').attr('title') ||
      item.find('.title').text().trim();
    if (!title) continue;

    const yearText = item.find('.footer-year').text().trim();
    const yearMatch = /\b((?:19|20)\d{2})\b/.exec(yearText || title);
    const year = yearMatch ? Number(yearMatch[1]) : null;
    const audioType = item.find('.footer-audio-type').text().trim();

    results.push({ link, title, year, yearText, audioType });
  }

  return results;
}

/**
 * Lê os metadados específicos da ficha, ignorando o cabeçalho genérico .infos.
 *
 * @param {string} html - HTML da página da ficha.
 * @returns {{ h1: string, postTitle: string, originalTitle: string|null, releaseYear: number|null }}
 */
export function parsePostMeta(html) {
  const $ = htmlDocument(html);
  const h1 = $('h1').text().trim();
  const postTitle = $('.post-title').text().trim();
  let originalTitle = null;
  let releaseYear = null;

  const paragraphs = $('p');
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs.eq(i);
    const spans = p.find('span');
    if (spans.length >= 2) {
      const key = spans.eq(0).text().trim().toLowerCase();
      const val = spans.eq(1).text().trim();
      if (key.includes('nome original')) {
        originalTitle = val;
      } else if (key.includes('lançamento') || key.includes('lancamento')) {
        const match = /\b((?:19|20)\d{2})\b/.exec(val);
        if (match) releaseYear = Number(match[1]);
      }
    }
  }

  return { h1, postTitle, originalTitle, releaseYear };
}

/**
 * Extrai as opções de download da ficha e decodifica o xid em link magnet.
 *
 * @param {string} html - HTML da página da ficha.
 * @param {string} postTitle - Título da postagem para contexto.
 * @returns {object[]} Opções preparadas para classifyMagnetOption.
 * @throws {Error} Se a ficha não contiver botões no seletor observado na fonte.
 */
export function extractOptions(html, postTitle) {
  const $ = htmlDocument(html);
  const buttons = $('.post-buttons .btn-down');
  if (!buttons.length) {
    throw new Error('Ficha sem botões de download em .post-buttons .btn-down');
  }

  const options = [];
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons.eq(i);
    const a = btn.attr('href') ? btn : btn.find('a');
    const href = a.attr('href') || btn.attr('href') || '';
    const xidMatch = /[?&]xid=([^"'\s&]+)/i.exec(href) || /xid=([^"'\s&]+)/i.exec(href);
    if (!xidMatch) continue;

    const rawXid = xidMatch[1];
    const spans = btn.find('.text span');
    const parts = [];
    for (let j = 0; j < spans.length; j++) {
      const text = spans.eq(j).text().trim();
      if (text && !/^download$/i.test(text)) {
        parts.push(text);
      }
    }
    const labelText = parts.length ? parts.join(' ') : btn.text().replace(/download/gi, '').trim();

    try {
      const magnet = decodeXid(rawXid);
      options.push({
        href: magnet,
        labelText,
        contextText: postTitle,
      });
    } catch (error) {
      options.push({
        label: `xid ${rawXid.slice(0, 8)}`,
        failure: error,
      });
    }
  }

  return options;
}

/**
 * Localiza fichas na fonte que correspondam exatamente ao pedido.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<{ post: object, html: string }[]>} Fichas compatíveis com o HTML obtido.
 */
export async function findMatchingPosts(media, request) {
  const candidateTitles = [media.title, media.originalTitle, ...(media.alternativeTitles || [])];
  const queries = [...new Set(candidateTitles.map((t) => String(t || '').trim()).filter(Boolean))];

  for (const query of queries) {
    const url = `${SOURCE_URL}/?s=${encodeURIComponent(query)}`;
    const searchHtml = await fetchText(url, { profile: 'page' });
    const results = parseSearchResults(searchHtml);
    if (!results.length) continue;

    const accepted = [];
    for (const post of results) {
      if (request.mediaType === 'movie') {
        if (isCollectionTitle(post.title) || /\b\d{4}\s*-\s*\d{4}\b/.test(post.yearText)) continue;
        if (seasonNumbers(post.title).length > 0 || /\b\d+\s*[ªaºo]\s*temporada\b/i.test(post.title)) continue;
        if (post.year !== null && media.year !== null && Math.abs(post.year - media.year) > 1) continue;

        const match = findBestMatch([{ title: post.title, year: post.year }], media, { yearTolerance: 1 });
        if (!match) continue;
      } else {
        const seasons = seasonNumbers(`${post.title} ${post.link.replace(/-/g, ' ')}`);
        if (seasons.length !== 1 || seasons[0] !== request.season) continue;

        const titleWithoutSeason = post.title
          .replace(/\s*(?:[-–—]\s*)?\d+\s*[ªaºo]\s*temporada(?:\s+completa)?\s*$/i, '')
          .trim();
        const match = findBestMatch([{ title: titleWithoutSeason, year: null }], { ...media, year: null });
        if (!match) continue;
      }

      // Baixa a ficha para confirmação dos metadados específicos
      const postHtml = await fetchText(post.link, { profile: 'page' });
      const meta = parsePostMeta(postHtml);

      if (request.mediaType === 'movie') {
        if (isCollectionTitle(meta.h1) || isCollectionTitle(meta.postTitle)) continue;
        if (seasonNumbers(`${meta.h1} ${meta.postTitle}`).length > 0) continue;
        if (meta.releaseYear !== null && media.year !== null && Math.abs(meta.releaseYear - media.year) > 1) {
          continue;
        }
      } else {
        const h1Seasons = seasonNumbers(`${meta.h1} ${meta.postTitle}`);
        if (h1Seasons.length && !h1Seasons.includes(request.season)) continue;
      }

      accepted.push({ post, html: postHtml });
    }

    if (accepted.length) {
      return accepted;
    }
  }

  return [];
}

/**
 * Extrai e resolve streams do Starck Filmes para o pedido.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Metadados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Lista de streams construídos.
 */
export async function extractStreams(media, request) {
  const posts = await findMatchingPosts(media, request);
  if (!posts.length) return [];

  const rawOptions = posts.flatMap(({ post, html }) => {
    try {
      return extractOptions(html, post.title);
    } catch (error) {
      return [{ label: `Ficha ${post.link}`, failure: error }];
    }
  });
  if (!rawOptions.length) return [];

  const classified = rawOptions.map((opt) => {
    if (opt.failure) return opt;
    return classifyMagnetOption({ ...opt, addFallbackTrackers: true }, media, request);
  });

  const resolved = await resolveTorrentOptions(classified, {
    logPrefix: 'Starck Filmes',
    streamLabel: 'Starck Filmes',
  });

  // Deduplicação dentro do provedor (chave única de stream)
  const streams = new Map();
  for (const stream of resolved) {
    const key = stream.url.startsWith('magnet:') ? stream.infoHash : stream.url;
    if (!streams.has(key)) {
      streams.set(key, stream);
    }
  }

  return [...streams.values()];
}
