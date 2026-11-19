/**
 * Resolução do player do AnimesHD.
 *
 * A página do episódio expande cada opção em `POST /wp-admin/admin-ajax.php`, que devolve um
 * `embed_url`. A amostra publica somente o Blogger, cujo HTML entrega MP4 progressivos em
 * `streamingData.formats`; host fora do Blogger é triagem.
 */

import { extractBloggerFormats } from '../_blocks/blogger-video/index.mjs';
import { fetchJson, fetchText } from '../_blocks/http/index.mjs';
import { SITE_URL } from './site.js';

const AJAX_URL = `${SITE_URL}/wp-admin/admin-ajax.php`;
const BLOGGER_HOSTS = ['blogger.com', 'www.blogger.com'];

/**
 * @typedef {import('./episode.js').MediaOption} MediaOption
 */

/**
 * @typedef {object} PlayerResolution
 * @property {'formats'} kind - Resultado com formatos do Blogger.
 * @property {{ url: string, qualityLabel: string|null }[]} formats - MP4 progressivos.
 */

/**
 * @typedef {object} TriageResolution
 * @property {'triage'} kind - Resultado sem mídia suportada.
 * @property {string} reason - Motivo da triagem.
 */

/**
 * Expande uma opção DooPlay e lê os formatos do Blogger.
 *
 * A opção é tratada isoladamente: HTTP, JSON, `embed_url` ausente ou HTML do Blogger sem
 * `streamingData.formats` sobem como erro para quem chamou descartar só essa opção. Host fora de
 * `blogger.com`/`www.blogger.com` devolve triagem, sem erro.
 *
 * @param {MediaOption} option - Opção publicada na página do episódio.
 * @param {string} pageUrl - URL da página do episódio, usada como `Referer`.
 * @returns {Promise<PlayerResolution|TriageResolution>} Formatos do Blogger ou triagem.
 * @throws {Error} Se o AJAX, o `embed_url` ou o HTML do Blogger não seguirem o contrato esperado.
 * @example
 * const resolution = await resolvePlayerOption({ post: '2011', nume: '1', type: 'tv', label: 'Legendado' }, episodeUrl);
 * // { kind: 'formats', formats: [{ url: 'https://...', qualityLabel: '720p' }] }
 */
export async function resolvePlayerOption(option, pageUrl) {
  const data = await fetchJson(AJAX_URL, {
    method: 'POST',
    profile: 'api',
    headers: { Referer: pageUrl },
    form: {
      action: 'doo_player_ajax',
      post: option.post,
      nume: option.nume,
      type: option.type,
    },
  });

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Resposta do player não é objeto');
  }
  const embedUrl = data.embed_url;
  if (typeof embedUrl !== 'string' || embedUrl.trim() === '') {
    throw new Error('Resposta do player sem embed_url');
  }

  let embed;
  try {
    embed = new URL(embedUrl.trim());
  } catch (error) {
    throw new Error('Resposta do player com embed_url inválido', { cause: error });
  }
  if (embed.protocol !== 'http:' && embed.protocol !== 'https:') {
    throw new Error(`Resposta do player com embed_url fora de HTTP(S): "${embedUrl}"`);
  }

  const host = embed.hostname.toLowerCase();
  if (!BLOGGER_HOSTS.includes(host)) {
    return { kind: 'triage', reason: `host ${host} não suportado` };
  }

  const html = await fetchText(embed.href, { profile: 'page' });
  return { kind: 'formats', formats: extractBloggerFormats(html) };
}
