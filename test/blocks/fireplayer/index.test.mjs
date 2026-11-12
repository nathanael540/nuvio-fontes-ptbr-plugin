import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import {
  blockReason,
  buildStreams,
  httpUrl,
  interpretPlaylist,
  loadHtml,
  originReferer,
  pageMeta,
  playEntries,
  redact,
  resolveEntries,
  unpackPacker,
} from '../../../src/_blocks/fireplayer/index.mjs';
import { resetAutoTemplate } from '../../../src/_blocks/custom-formatter/index.mjs';

const nodeRequire = createRequire(import.meta.url);
const { load } = nodeRequire('../../support/basic-html.js');
globalThis.require = () => ({ load });

const HASH_A = 'a'.repeat(32);
const HASH_B = 'b'.repeat(32);
const FIRE_A = `https://embedplayer2.xyz/video/${HASH_A}`;
const FIRE_B = `https://embedplayer2.xyz/video/${HASH_B}`;
const SECURED_A = 'https://cdn.example/master.m3u8?md5=fictionmd5&expires=999';
const MASTER_VARIANTS = fixture('master-variants.m3u8');
const MASTER_DUAL = fixture('master-dual.m3u8');
const MASTER_SUBS = fixture('master-subs.m3u8');
const MEDIA_PLAYLIST = fixture('media-playlist.m3u8');

function fixture(name) {
  return readFileSync(new URL(`../../fixtures/dooplay/${name}`, import.meta.url), 'utf8');
}

function context(extra = {}) {
  return {
    logName: 'Teste FirePlayer',
    domain: 'teste',
    request: { mediaType: 'movie', tmdbId: '100' },
    identity: { tmdbId: '100' },
    ...extra,
  };
}

function mockFetch(t, route) {
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const originalFetch = globalThis.fetch;
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const result = await route(new URL(url), init);
    if (result === undefined) throw new Error(`sem rota ${url}`);
    if (result instanceof Error) throw result;
    const text = typeof result === 'string'
      ? result
      : typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    const status = result.status || 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      url: result.url || String(url),
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  };
  console.log = (message) => logs.log.push(String(message));
  console.warn = (message) => logs.warn.push(String(message));
  console.error = (message) => logs.error.push(String(message));
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    globalThis.fetch = originalFetch;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  };
  t.after(restore);
  return { calls, logs, restore };
}

function formOf(call) {
  return new URLSearchParams(call.init.body || '');
}

function fireVideo(secured = SECURED_A) {
  return { hls: true, securedLink: secured };
}

test('funções puras não fazem rede; cheerio usa eq; HLS e redação são estáveis', async (t) => {
  const { calls } = mockFetch(t, () => {
    throw new Error('fetch inesperado');
  });

  assert.equal(httpUrl('/embed/1', 'https://player.example'), 'https://player.example/embed/1');
  assert.equal(originReferer('https://plenoflu.com/movie/1'), 'https://plenoflu.com/');
  assert.equal(blockReason('<html>cf-turnstile</html>'), 'Turnstile');
  assert.equal(blockReason('<html>player</html>'), null);
  assert.deepEqual(pageMeta('<title>Matrix (1999) - SuperCDN</title>'), { title: 'Matrix', year: 1999 });
  assert.deepEqual(pageMeta('<title>Sem Ano</title>'), { title: 'Sem Ano', year: null });
  assert.equal(pageMeta('<html></html>'), null);
  assert.equal(unpackPacker(fixture('packed.html')), `var hash="${HASH_A}"`);
  assert.equal(unpackPacker('<html></html>'), null);

  const $ = loadHtml('<div class="player_select_item" data-id="dyn:movie:1"></div><div class="player_select_item" data-id="dyn:movie:2"></div>');
  assert.equal($('.player_select_item').eq(0).attr('data-id'), 'dyn:movie:1');
  assert.equal($('.player_select_item').eq(1).attr('data-id'), 'dyn:movie:2');

  const variants = interpretPlaylist(MASTER_VARIANTS, 'https://cdn.example/master.m3u8');
  assert.equal(variants.adaptive, false);
  assert.deepEqual(variants.variants.map((variant) => variant.quality), [360, 720]);
  assert.equal(variants.variants[1].url, 'https://cdn.example/file-1080p.css');

  const dual = interpretPlaylist(MASTER_DUAL, 'https://cdn.example/master-dual.m3u8');
  assert.equal(dual.adaptive, true);
  assert.equal(dual.quality, 480);
  assert.equal(dual.language, 'Dublado');

  const subs = interpretPlaylist(MASTER_SUBS, 'https://cdn.example/master-subs.m3u8');
  assert.deepEqual(subs.subtitles.map((track) => track.url), ['https://cdn.example/caption.jpg']);
  assert.equal(subs.subtitles[0].language, 'por');
  assert.equal(subs.foreignOnly, true);

  const media = interpretPlaylist(MEDIA_PLAYLIST, 'https://cdn.example/media.m3u8');
  assert.equal(media.adaptive, false);
  assert.deepEqual(media.variants, []);
  assert.equal(media.quality, null);
  const noResolution = interpretPlaylist('#EXTM3U\n#EXT-X-STREAM-INF:NAME="HD"\nhttps://cdn.example/x', 'https://cdn.example/x');
  assert.deepEqual(noResolution.variants, []);
  assert.equal(noResolution.adaptive, false);
  assert.throws(() => interpretPlaylist('<html>erro</html>', 'https://cdn.example/x'), /não é playlist HLS/);

  globalThis.TMDB_API_KEY = 'chave-ficticia';
  const redacted = redact(`erro em https://cdn.example/x.m3u8?md5=abc com ${HASH_A} e chave-ficticia`);
  assert.equal(redacted.includes('chave-ficticia'), false);
  assert.equal(redacted.includes(HASH_A), false);
  assert.equal(redacted.includes('cdn.example'), false);
  delete globalThis.TMDB_API_KEY;
  assert.equal(calls.length, 0);
});

test('FirePlayer direto por hash e por script empacotado usa o mesmo fluxo', async (t) => {
  const { calls, logs } = mockFetch(t, (url) => {
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'cdn.example') return MASTER_VARIANTS;
    if (url.hostname === 'vaiquecol.com' && url.pathname === '/embed2/tt9000001') return fixture('packed.html');
    if (url.hostname === 'vaiquecol.com' && url.pathname === '/player/index.php') return { body: fireVideo() };
    return undefined;
  });

  const direct = await resolveEntries([
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'VIP', meta: { title: 'Filme', year: 2026 } },
  ], context());
  assert.equal(direct.failures.length, 0);
  assert.equal(direct.resolved.length, 1);
  assert.equal(direct.resolved[0].playerHash, HASH_A);
  assert.equal(direct.resolved[0].playlistUrl, SECURED_A);
  assert.deepEqual(direct.resolved[0].variants.map((variant) => variant.quality), [360, 720]);
  assert.equal(direct.resolved[0].headers.Referer, FIRE_A);
  assert.deepEqual(direct.resolved[0].meta, { title: 'Filme', year: 2026 });

  const post = calls.find((call) => call.url.includes('embedplayer2.xyz/player/index.php'));
  assert.equal(post.url, `https://embedplayer2.xyz/player/index.php?data=${HASH_A}&do=getVideo`);
  assert.equal(formOf(post).get('hash'), HASH_A);
  assert.equal(formOf(post).get('r'), 'https://playerflix.ink/');

  const packed = await resolveEntries([
    { url: 'https://vaiquecol.com/embed2/tt9000001', referer: 'https://plenoflu.com/', label: 'vaiquecol' },
  ], context());
  assert.equal(packed.failures.length, 0);
  assert.equal(packed.resolved[0].playerHash, HASH_A);
  const page = calls.find((call) => call.url === 'https://vaiquecol.com/embed2/tt9000001');
  assert.equal(page.init.headers.Referer, 'https://plenoflu.com/');
  const packedPost = calls.find((call) => call.url.includes('vaiquecol.com/player/index.php'));
  assert.equal(formOf(packedPost).get('hash'), HASH_A);
  assert.equal(formOf(packedPost).get('r'), 'https://plenoflu.com/');

  const text = [...logs.log, ...logs.warn, ...logs.error].join('\n');
  assert.equal(text.includes(HASH_A), false);
  assert.equal(text.includes('fictionmd5'), false);
});

test('PlayerFlix, GStream e plenoflu entregam entradas complementares e isolam falhas', async (t) => {
  const { calls, logs } = mockFetch(t, (url, init) => {
    if (url.hostname === 'playerflix.ink' && url.pathname === '/inc/Ajax.php') {
      return { body: { status: true, data: {
        title: { pt: 'Filme Fictício', en: 'Fictional Movie' },
        release_date: '2026-01-02',
        options: [
          { label: 'Premium', embed: 'https://superflixapi.boats/x', budget: 'danger', lang: 'pt-br' },
          { label: 'VIP Player', embed: FIRE_B, embed_id: HASH_B, lang: 'pt-br', budget: 'success' },
          { label: 'WatchPlay', embed: 'https://v2.watchplay.shop/e/1', lang: 'pt-br', budget: 'success' },
        ],
      } } };
    }
    if (url.hostname === 'embed.embedplayer.site' && url.pathname !== '/stream') {
      return '<div class="player_select_item" idS="ruim"></div><div class="player_select_item" idS="bom"></div>';
    }
    if (url.pathname === '/stream') {
      return formOf({ init }).get('idS') === 'ruim'
        ? { status: 522, body: '' }
        : { body: { resources: { sources: [{ file: FIRE_A }] } } };
    }
    if (url.hostname === 'plenoflu.com' && url.pathname === '/movie/100') {
      return '<title>Filme Fictício (2026) - SuperCDN</title><div class="player_select_item" data-id="dyn:movie:12327:vaiquecol"></div>';
    }
    if (url.hostname === 'plenoflu.com' && url.pathname === '/api') {
      return formOf({ init }).get('action') === 'getPlayer'
        ? { body: { data: { video_url: Buffer.from('https://vaiquecol.com/embed2/tt9000001').toString('base64') } } }
        : { body: { data: { options: [] } } };
    }
    if (url.hostname === 'vaiquecol.com' && url.pathname === '/embed2/tt9000001') return fixture('packed.html');
    if (url.hostname === 'vaiquecol.com' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'cdn.example') return MASTER_VARIANTS;
    return undefined;
  });

  const { resolved, failures } = await resolveEntries([
    { url: 'https://playerflix.ink/filme/100', referer: 'https://plenoflu.com/', label: 'PlayerFlix' },
    { url: 'https://embed.embedplayer.site/tt9000001', referer: 'https://embed.embedplayer.site/', label: 'GStream' },
    { url: 'https://plenoflu.com/movie/100', referer: 'https://plenoflu.com/', label: 'plenoflu' },
  ], context());

  assert.equal(failures.length, 0);
  assert.equal(resolved.length, 3);
  assert.ok(resolved.some((media) => media.playerHash === HASH_A));
  assert.ok(resolved.some((media) => media.playerHash === HASH_B));
  assert.ok(logs.log.some((line) => line.includes('budget danger')));
  assert.ok(logs.log.some((line) => line.includes('playlist sem RESOLUTION')));
  assert.ok(logs.warn.some((line) => line.includes('HTTP 522')));
  assert.ok(logs.warn.every((line) => !line.includes(HASH_A) && !line.includes('cdn.example')));

  const plenoPage = calls.find((call) => call.url === 'https://plenoflu.com/movie/100');
  assert.equal(plenoPage.init.headers.Referer, 'https://plenoflu.com/');
  const getPlayer = calls.find((call) => call.url === 'https://plenoflu.com/api');
  assert.equal(formOf(getPlayer).get('action'), 'getPlayer');
  const gstreamPost = calls.find((call) => call.url === 'https://embed.embedplayer.site/stream');
  assert.equal(gstreamPost.init.method, 'POST');
  assert.equal(gstreamPost.init.headers.Referer, 'https://embed.embedplayer.site/tt9000001');
});

test('episódio direto exige DIRECT_EPISODE_ID; legado por TVSHOW_ID continua disponível', async (t) => {
  const first = mockFetch(t, (url, init) => {
    if (url.hostname === 'plenoflu.com' && url.pathname.startsWith('/tvshow/')) {
      return '<title>Breaking Bad (2008) - SuperCDN</title>'
        + 'var TVSHOW_ID = 26798;\nvar DIRECT_EPISODE_ID = 58258;'
        + '<div class="episodeOption" data-contentid="58258"><div class="episodeNum">Episódio 3</div></div>';
    }
    if (url.hostname === 'plenoflu.com' && url.pathname === '/api') {
      if (formOf({ init }).get('action') === 'get_season_episodes') {
        return { body: { data: { html: '<div class="episodeOption" data-contentid="58258"><div class="episodeNum">Episódio 3</div></div>' } } };
      }
      return { body: { data: { options: [{ display_type: 'vaiquecol', url: FIRE_A }] } } };
    }
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'cdn.example') return MASTER_VARIANTS;
    return undefined;
  });

  const tv = context({ request: { mediaType: 'tv', tmdbId: '1396', season: 2, episode: 3 }, identity: { tmdbId: '1396' }, directEpisode: true });
  const direct = await resolveEntries([
    { url: 'https://plenoflu.com/tvshow/1396/2/3', referer: 'https://plenoflu.com/', label: 'plenoflu' },
  ], tv);
  assert.equal(direct.failures.length, 0);
  assert.equal(direct.resolved[0].meta.year, 2008);
  const directOptions = first.calls.find((call) => call.url === 'https://plenoflu.com/api' && formOf(call).get('action') === 'getOptions');
  assert.equal(formOf(directOptions).get('contentid'), '58258');
  assert.equal(first.calls.some((call) => formOf(call).get('action') === 'get_season_episodes'), false);

  const legacy = await resolveEntries([
    { url: 'https://plenoflu.com/tvshow/1396/2/3', referer: 'https://plenoflu.com/', label: 'plenoflu' },
  ], context({ request: { mediaType: 'tv', tmdbId: '1396', season: 2, episode: 3 }, identity: { tmdbId: '1396' } }));
  assert.equal(legacy.failures.length, 0);
  assert.ok(first.calls.some((call) => formOf(call).get('action') === 'get_season_episodes'));

  const contradictory = await resolveEntries([
    { url: 'https://plenoflu.com/tvshow/1396/2/4', referer: 'https://plenoflu.com/', label: 'plenoflu' },
  ], tv);
  assert.equal(contradictory.resolved.length, 0);
  assert.match(contradictory.failures[0], /coordenadas contraditórias/);

  first.restore();
  mockFetch(t, () => '<title>Breaking Bad (2008) - SuperCDN</title>var TVSHOW_ID = 26798;');
  const missing = await resolveEntries([
    { url: 'https://plenoflu.com/tvshow/1396/2/3', referer: 'https://plenoflu.com/', label: 'plenoflu' },
  ], tv);
  assert.match(missing.failures[0], /DIRECT_EPISODE_ID ausente/);
});

test('página pré-carregada evita nova requisição e metadados vêm da fonte ou do chamador', async (t) => {
  const { calls } = mockFetch(t, (url, init) => {
    if (url.hostname === 'plenoflu.com' && url.pathname === '/api') {
      if (formOf({ init }).get('action') === 'getPlayer') {
        return { body: { data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      }
      return { body: { data: { options: [{ display_type: 'vaiquecol', url: FIRE_A }] } } };
    }
    if (url.hostname === 'playerflix.ink') {
      return { body: { status: true, data: { options: [{ embed: FIRE_A, label: 'VIP', lang: 'pt-br' }] } } };
    }
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'cdn.example') return MASTER_VARIANTS;
    return undefined;
  });

  const page = { url: 'https://plenoflu.com/movie/100', text: '<title>Filme da Página (2026) - SuperCDN</title><div class="player_select_item" data-id="dyn:movie:1:vaiquecol"></div>' };
  const preloaded = await resolveEntries([
    { url: 'https://plenoflu.com/movie/100', referer: 'https://plenoflu.com/', label: 'plenoflu', page },
  ], context());
  assert.equal(preloaded.failures.length, 0);
  assert.deepEqual(preloaded.resolved[0].meta, { title: 'Filme da Página', year: 2026 });
  assert.equal(calls.some((call) => call.url === page.url), false);

  const fallback = await resolveEntries([
    { url: 'https://playerflix.ink/filme/100', referer: 'https://playerflix.ink/filme/100', label: 'PlayerFlix', meta: { title: 'Do Chamador', year: 2025 } },
  ], context());
  assert.equal(fallback.resolved[0].meta.title, 'Do Chamador');

  const noTitle = await resolveEntries([
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'VIP', meta: { title: 'Do Chamador', year: null } },
  ], context());
  assert.equal(noTitle.resolved[0].meta.title, 'Do Chamador');
});

test('idioma e legendas só entram com prova; áudio estrangeiro sem PT é descartado', async (t) => {
  const first = mockFetch(t, (url) => {
    if (url.hostname === 'playerflix.ink') {
      return { body: { status: true, data: {
        title: { pt: 'Filme' }, release_date: '2026-01-02',
        options: [{ label: 'Original', embed: FIRE_A, embed_id: HASH_A, lang: 'en-us' }],
      } } };
    }
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.pathname.endsWith('/caption.jpg')) return fixture('caption.vtt');
    if (url.hostname === 'cdn.example') {
      return `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="eng",URI="https://cdn.example/en.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Português",LANGUAGE="por",URI="https://cdn.example/caption.jpg"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720,AUDIO="audio",SUBTITLES="subs"
https://cdn.example/720.m3u8`;
    }
    return undefined;
  });

  const result = await resolveEntries([
    { url: 'https://playerflix.ink/filme/100', referer: 'https://playerflix.ink/filme/100', label: 'PlayerFlix' },
  ], context());
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].language, 'Legendado');
  assert.deepEqual(result.resolved[0].subtitles, [{ url: 'https://cdn.example/caption.jpg', language: 'por', name: 'Português' }]);

  first.restore();
  const second = mockFetch(t, (url) => {
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'cdn.example') {
      return `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="eng",URI="https://cdn.example/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720,AUDIO="audio"
https://cdn.example/720.m3u8`;
    }
    return undefined;
  });
  const foreign = await resolveEntries([
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'Original', languageHint: 'en-us' },
  ], context());
  assert.equal(foreign.resolved.length, 0);
  assert.equal(foreign.failures.length, 0);

  second.restore();
  mockFetch(t, (url) => {
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'cdn.example') {
      return `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="und",LANGUAGE="und",URI="https://cdn.example/und.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720,AUDIO="audio"
https://cdn.example/720.m3u8`;
    }
    return undefined;
  });
  const undefinedLanguage = await resolveEntries([
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'Original' },
  ], context());
  assert.equal(undefinedLanguage.resolved.length, 1);
  assert.equal(undefinedLanguage.resolved[0].language, null);
});

test('master adaptativo, variantes, falha de securedLink e HTML 200 são tratados', async (t) => {
  mockFetch(t, (url) => {
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') {
      return { body: { hls: true, videoSource: 'https://cdn.example/master.txt' } };
    }
    if (url.hostname === 'cdn.example' && url.pathname === '/master.txt') return MASTER_DUAL;
    return undefined;
  });
  const fallback = await resolveEntries([
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'VIP' },
  ], context());
  assert.equal(fallback.resolved[0].playlistUrl, 'https://cdn.example/master.txt');
  assert.equal(fallback.resolved[0].adaptive, true);
  assert.equal(fallback.resolved[0].quality, 480);
  assert.equal(fallback.resolved[0].headers.Referer, FIRE_A);

  const second = mockFetch(t, (url) => {
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'cdn.example') return '<html>erro 200</html>';
    return undefined;
  });
  const html = await resolveEntries([
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'VIP' },
  ], context());
  assert.equal(html.resolved.length, 0);
  assert.match(html.failures[0], /não é playlist HLS/);

  second.restore();
  mockFetch(t, (url) => {
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: { hls: false } };
    return undefined;
  });
  const falseHls = await resolveEntries([
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'VIP' },
  ], context());
  assert.match(falseHls.failures[0], /hls falso/);
});

test('playEntries e buildStreams formatam nome, título, headers e deduplicação do chamador', async (t) => {
  mockFetch(t, (url) => {
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'cdn.example') return MASTER_VARIANTS;
    return undefined;
  });

  const full = context({ providerName: 'Teste FirePlayer' });
  const entries = [
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'Um', meta: { title: 'Filme', year: 2026 } },
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'Dois', meta: { title: 'Filme', year: 2026 } },
  ];
  resetAutoTemplate(() => 0);
  const played = await playEntries(entries, full);
  assert.equal(played.failures.length, 0);
  assert.deepEqual(played.streams.map((stream) => stream.quality), ['360p', '720p']);
  assert.equal(played.streams[0].name, 'Teste FirePlayer 360p\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 embedplayer2.xyz');
  assert.equal('format' in played.streams[0], false);
  assert.equal(played.streams[0].provider, 'embedplayer2.xyz');
  assert.equal(played.streams[0].type, 'hls');
  assert.equal(played.streams[0].headers.Referer, FIRE_A);

  resetAutoTemplate(() => 0.99);
  const { resolved } = await resolveEntries(entries, full);
  const [prism] = buildStreams(resolved, full);
  assert.match(prism.name, /🎬 Filme \(2026\)\n🗣️ Idioma Desconhecido\n🌐 HTTP\n📡 embedplayer2.xyz/);
  assert.match(prism.title, /🎬 Filme \(2026\)/);

  assert.throws(() => buildStreams([], context()), /providerName ausente/);
  assert.throws(
    () => buildStreams([{
      adaptive: false,
      headers: {},
      language: null,
      meta: null,
      playerPage: 'https://embedplayer2.xyz/video/x',
      playlistUrl: 'https://cdn.example/media.m3u8',
      quality: null,
      subtitles: [],
      variants: [],
    }], full),
    /media\.meta\.title ausente/,
  );
});

test('buildStreams preserva playlist sem variante com Desconhecida', () => {
  resetAutoTemplate(() => 0);
  const [stream] = buildStreams([{
    adaptive: false,
    headers: {},
    language: null,
    meta: { title: 'Filme', year: 2026 },
    playerPage: 'https://embedplayer2.xyz/video/x',
    playlistUrl: 'https://cdn.example/media.m3u8',
    quality: null,
    subtitles: [],
    variants: [],
  }], context({ providerName: 'Teste FirePlayer' }));
  assert.equal(stream.quality, 'Desconhecida');
  assert.equal(stream.url, 'https://cdn.example/media.m3u8');
  assert.equal(stream.name, 'Teste FirePlayer Desconhecida\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 embedplayer2.xyz');
});

test('triagem, host fora do conjunto e falha técnica ficam separados da opção válida', async (t) => {
  const { logs } = mockFetch(t, (url) => {
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: fireVideo() };
    if (url.hostname === 'cdn.example') return MASTER_VARIANTS;
    if (url.hostname === 'playerflix.ink') return { body: { status: false } };
    if (url.hostname === 'vaiquecol.com' && url.pathname === '/embed2/down') return { status: 522, body: '' };
    return undefined;
  });

  const result = await resolveEntries([
    { url: 'https://v2.watchplay.shop/e/1', referer: 'https://playerflix.ink/filme/100', label: 'WatchPlay' },
    { url: 'https://www.youtube.com/watch?v=1', referer: 'https://playerflix.ink/filme/100', label: 'Trailer' },
    { url: 'https://fora.example/x', referer: 'https://playerflix.ink/filme/100', label: 'Fora' },
    { url: 'https://vaiquecol.com/embed2/down', referer: 'https://playerflix.ink/filme/100', label: 'Down' },
    { url: 'https://embed.embedplayer.site/tt9000001', referer: 'https://embed.embedplayer.site/', label: 'GStream', budget: 'danger' },
    { url: FIRE_A, referer: 'https://playerflix.ink/filme/100', label: 'VIP', meta: { title: 'Filme', year: 2026 } },
  ], context());

  assert.equal(result.resolved.length, 1);
  assert.match(result.failures[0], /Down: HTTP 522/);
  assert.ok(logs.log.some((line) => line.includes('playlist sem RESOLUTION')));
  assert.ok(logs.log.some((line) => line.includes('trailer')));
  assert.ok(logs.log.some((line) => line.includes('host fora do conjunto: fora.example')));
  assert.ok(logs.log.some((line) => line.includes('budget danger')));
  assert.ok(logs.warn.some((line) => line.includes('HTTP 522')));
  assert.equal(logs.error.length, 0);
});
