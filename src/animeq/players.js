/**
 * Leitura do player próprio do AnimeQ na página de episódio.
 */

import { loadHtml, textOf } from './html.js';

/**
 * @typedef {object} EpisodeOption
 * @property {string} label - Rótulo da aba/fonte.
 * @property {string} url - URL publicada no `<source>` ou `<iframe>`.
 */

/**
 * Coleta todas as fontes do player AnimeQ, inclusive as abas `hidden`.
 * @param {string} html - HTML da página do episódio.
 * @returns {EpisodeOption[]} Fontes na ordem dos blocos.
 */
export function collectEpisodeOptions(html) {
  const $ = loadHtml(html);
  const labels = new Map();
  const buttons = $('button[data-animeq-switch]');
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons.eq(index);
    const key = button.attr('data-animeq-switch');
    const name = button.attr('data-source-name');
    if (typeof key === 'string' && typeof name === 'string' && name.trim() !== '') {
      labels.set(key, name.trim());
    }
  }

  const options = [];
  const blocks = $('div.animeq-player__source');
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks.eq(index);
    const key = block.attr('data-animeq-source');
    const label = key !== undefined && labels.has(key) ? labels.get(key) : `Player ${index + 1}`;
    const sources = block.find('source');
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      const src = sources.eq(sourceIndex).attr('src');
      if (typeof src === 'string' && src.trim() !== '') options.push({ label, url: src.trim() });
    }
    const iframes = block.find('iframe');
    for (let frameIndex = 0; frameIndex < iframes.length; frameIndex += 1) {
      const src = iframes.eq(frameIndex).attr('src');
      if (typeof src === 'string' && src.trim() !== '') options.push({ label, url: src.trim() });
    }
  }
  return options;
}

/**
 * Lê o título do `h1` de uma ficha.
 * @param {string} html - HTML da página.
 * @returns {string} Título aparado.
 */
export function pageTitle(html) {
  const $ = loadHtml(html);
  return textOf($('h1').eq(0));
}
