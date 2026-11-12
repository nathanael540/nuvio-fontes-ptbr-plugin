/** Expansão dos botões DooPlay e ponte para a cadeia compartilhada do FirePlayer. */
import { fetchJson } from '../_blocks/http/index.mjs';
import {
  httpUrl,
  playEntries as playSharedEntries,
  redact,
  warnOption,
} from '../_blocks/fireplayer/index.mjs';
import { PROVIDER } from './log.js';

/**
 * Resolve as opções de uma origem DooPlay, expandindo os botões `dooplayer` antes da cadeia.
 *
 * A apresentação e a deduplicação ficam no bloco `fireplayer`; o título e o ano vêm do TMDB,
 * que é a fonte de identidade da origem. O fluxo de episódio continua o legado do plenoflu,
 * porque o DooPlay não usa `DIRECT_EPISODE_ID`.
 *
 * @param {string} domain - Domínio da origem nos logs.
 * @param {object[]} entries - Opções descobertas na página.
 * @param {{media: object, request: object}} ctx - Dados do TMDB e pedido do app.
 * @returns {Promise<{streams: object[], failures: string[]}>} Streams montados e falhas isoladas.
 * @throws {Error} Se a expansão dos botões ou a montagem dos streams falharem fora de uma opção.
 * @example
 * const { streams, failures } = await playEntries('filmesamadoresgratis.com', entries, { media, request });
 */
export async function playEntries(domain, entries, ctx) {
  const expanded = await Promise.all(entries.map(async (entry) => {
    if (entry.kind !== 'dooplayer') return { entry };
    try {
      return { entry: await fetchEmbed(entry) };
    } catch (error) {
      if (error.triage) return { triage: error.message, label: entry.label };
      warnOption(PROVIDER, domain, entry.label, error.message);
      return { failure: `${entry.label}: ${redact(error.message)}` };
    }
  }));
  for (const result of expanded) {
    if (result.triage) console.log(`[${PROVIDER}] ${domain} Opção ${result.label} descartada por triagem: ${redact(result.triage)}`);
  }
  const failures = expanded.filter((result) => result.failure).map((result) => result.failure);
  const prepared = expanded.filter((result) => result.entry).map((result) => ({
    ...result.entry,
    domain,
    meta: result.entry.meta || { title: ctx.media.title, year: ctx.media.year },
  }));
  const played = await playSharedEntries(prepared, {
    logName: PROVIDER,
    domain,
    request: ctx.request,
    identity: { tmdbId: ctx.media.tmdbId, imdbId: ctx.media.imdbId },
    directEpisode: false,
    providerName: 'DooPlay PT-BR',
  });
  return { streams: played.streams, failures: [...failures, ...played.failures] };
}

async function fetchEmbed(entry) {
  const referer = entry.referer;
  const type = entry.type;
  let data;
  if (entry.mode === 'rest') {
    data = await readJson(`${entry.origin}/wp-json/dooplayer/v2/${entry.post}/${type}/${entry.nume}`, {
      profile: 'api', headers: { Referer: referer },
    });
  } else {
    data = await readJson(`${entry.origin}/wp-admin/admin-ajax.php`, {
      method: 'POST', profile: 'api', headers: { Referer: referer },
      form: { action: 'doo_player_ajax', post: entry.post, nume: entry.nume, type },
    });
  }
  if (!data || typeof data.embed_url !== 'string' || !data.embed_url.trim()) throw new Error('embed_url ausente');
  return { label: entry.label, url: httpUrl(data.embed_url, referer), referer, languageHint: entry.languageHint };
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
