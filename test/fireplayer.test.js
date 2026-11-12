const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const KEY = 'chave-ficticia-tmdb';
const HASH_A = 'a'.repeat(32);
const HASH_B = 'b'.repeat(32);
const PLENO = 'https://plenoflu.com';
const PLAYERFLIX = 'https://playerflix.ink';
const GSTREAM = 'https://embed.embedplayer.site';
const FIRE_A = `https://embedplayer2.xyz/video/${HASH_A}`;
const FIRE_B = `https://embedplayer2.xyz/video/${HASH_B}`;
const SECURED_A = 'https://cdn.example/master-a.m3u8?md5=fictional1&expires=999';
const SECURED_B = 'https://cdn.example/master-b.m3u8?md5=fictional2&expires=999';

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('fireplayer-test-');
  try {
    const gdriveDir = path.join(outDir, 'gdrive');
    const prismDir = path.join(outDir, 'prism');
    fs.mkdirSync(gdriveDir);
    fs.mkdirSync(prismDir);
    codes.gdrive = fs.readFileSync(await buildProvider('fireplayer', { outDir: gdriveDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('fireplayer', { outDir: prismDir, formatter: 'prism' }), 'utf8');
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/dooplay', name), 'utf8');

function textOf(logs) {
  return [...logs.log, ...logs.warn, ...logs.error].join('\n');
}

function runtime(route, key = KEY, bundle = code) {
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const context = {
    module: { exports: {} },
    URL,
    URLSearchParams,
    TMDB_API_KEY: key,
    atob: (value) => Buffer.from(value, 'base64').toString('utf8'),
    btoa: (value) => Buffer.from(value, 'utf8').toString('base64'),
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    console: {
      log: (message) => logs.log.push(String(message)),
      warn: (message) => logs.warn.push(String(message)),
      error: (message) => logs.error.push(String(message)),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init || {});
      if (result instanceof Error) throw result;
      const status = result.status || 200;
      const text = typeof result === 'string'
        ? result
        : typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
      return {
        ok: status >= 200 && status < 300,
        status,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  vm.runInNewContext(bundle, context, { filename: 'fireplayer.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

async function play(route, args = ['603', 'movie'], key = KEY, bundle = code) {
  const app = runtime(route, key, bundle);
  const streams = await app.getStreams(...args);
  return { ...app, streams };
}

function chain(handlers) {
  return async (url, init) => {
    for (const handler of handlers) {
      const result = handler(url, init);
      if (result !== undefined) return result;
    }
    throw new Error(`sem rota ${url.href}`);
  };
}

function playerflixMovieResponse({ title = 'Matrix', year = 1999, options = [] } = {}) {
  return {
    body: {
      status: true,
      data: {
        title: { pt: title, en: title },
        release_date: `${year}-03-31`,
        options,
      },
    },
  };
}

function playerflixSeriesResponse({ title = 'Breaking Bad', season = 2, episode = 3, options = [] } = {}) {
  return {
    body: {
      status: true,
      data: {
        title: { pt: title, en: title },
        release_date: '2008-01-20',
        season,
        episode,
        options,
      },
    },
  };
}

function plenofluMovieHtml(title = 'Matrix (1999)', imdb = 'tt0133093') {
  return `<html><head><title>${title}</title></head><body>
    <div class="video_caption_url" data-caption="${imdb}"></div>
    <div class="player_select_item" data-id="dyn:movie:principal">Principal</div>
  </body></html>`;
}

function plenofluSeriesHtml(title = 'Breaking Bad (2008)', directId = '58258') {
  return `<html><head><title>${title}</title></head><body>
    <script>var DIRECT_EPISODE_ID = ${directId};</script>
    <div class="video_caption_url" data-caption="tt0903747"></div>
  </body></html>`;
}

function plenofluAbsenceHtml() {
  return {
    status: 404,
    body: '<html><body>404 - Página não encontrada. O Conteúdo Que Você Procura Não Está Disponível</body></html>',
  };
}

test('carregamento CommonJS sem rede e entradas inválidas antes do fetch', async () => {
  const app = runtime(() => { throw new Error('fetch inesperado'); });
  assert.equal(typeof app.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(code, /AbortController|Promise\.allSettled|\beval\s*\(|new Function/);

  const invalidInputs = [
    ['abc', 'movie'],
    ['0', 'movie'],
    ['-10', 'movie'],
    ['100', 'anime'],
    ['100', 'tv', 0, 1],
    ['100', 'tv', null, 1],
    ['100', 'tv', 2, 0],
    ['100', 'tv', 2, -1],
    ['100', 'tv', 2, 'tres'],
  ];

  for (const args of invalidInputs) {
    const streams = await app.getStreams(...args);
    assert.deepEqual(streams, []);
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.logs.error.length, invalidInputs.length);
  assert.ok(app.logs.error.every((line) => line.startsWith('[FirePlayer PT-BR] Entrada:')));
});

test('rotas diretas de filme e episódio com Referer próprio', async () => {
  // Teste de filme
  const movieRoute = chain([
    (url, init) => {
      if (url.origin === PLENO && url.pathname === '/movie/603') {
        assert.equal(init?.headers?.Referer, `${PLENO}/`);
        return plenofluMovieHtml('Matrix (1999)', 'tt0133093');
      }
      if (url.origin === PLENO && url.pathname === '/api') {
        return { body: { status: true, data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      }
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') {
        assert.equal(url.searchParams.get('id'), '603');
        assert.equal(url.searchParams.get('type'), 'movie');
        assert.equal(init?.headers?.Referer, `${PLAYERFLIX}/filme/603`);
        return playerflixMovieResponse({ options: [] });
      }
      if (url.origin === 'https://embedplayer2.xyz' && url.pathname === '/player/index.php') {
        return { body: { hls: true, securedLink: SECURED_A } };
      }
      if (url.origin === 'https://cdn.example' && url.pathname === '/master-a.m3u8') {
        return fixture('master-variants.m3u8');
      }
      if (url.origin === GSTREAM) {
        if (url.pathname === '/stream') return { body: { resources: { sources: [{ file: FIRE_A }] } } };
        return '<html><input name="idS" value="12345"></html>';
      }
      return undefined;
    },
  ]);

  const { streams: movieStreams, calls: movieCalls } = await play(movieRoute, ['603', 'movie'], '');
  assert.ok(movieStreams.length > 0);
  assert.ok(movieCalls.some((call) => call.url.startsWith(`${PLENO}/movie/603`)));
  assert.ok(movieCalls.some((call) => call.url.startsWith(`${PLAYERFLIX}/inc/Ajax.php?type=movie&id=603`)));

  // Teste de série
  const seriesRoute = chain([
    (url, init) => {
      if (url.origin === PLENO && url.pathname === '/tvshow/1396/2/3') {
        assert.equal(init?.headers?.Referer, `${PLENO}/`);
        return plenofluSeriesHtml('Breaking Bad (2008)', '58258');
      }
      if (url.origin === PLENO && url.pathname === '/api') {
        return { body: { status: true, data: { options: [{ url: FIRE_A, display_type: 'Principal' }] } } };
      }
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') {
        assert.equal(url.searchParams.get('id'), '1396');
        assert.equal(url.searchParams.get('type'), 'tv');
        assert.equal(url.searchParams.get('season'), '2');
        assert.equal(url.searchParams.get('episode'), '3');
        assert.equal(init?.headers?.Referer, `${PLAYERFLIX}/serie/1396/2/3`);
        return playerflixSeriesResponse({ options: [] });
      }
      if (url.origin === 'https://embedplayer2.xyz' && url.pathname === '/player/index.php') {
        return { body: { hls: true, securedLink: SECURED_A } };
      }
      if (url.origin === 'https://cdn.example' && url.pathname === '/master-a.m3u8') {
        return fixture('master-variants.m3u8');
      }
      return undefined;
    },
  ]);

  const { streams: tvStreams, calls: tvCalls } = await play(seriesRoute, ['1396', 'tv', 2, 3], '');
  assert.ok(tvStreams.length > 0);
  assert.ok(tvCalls.some((call) => call.url.startsWith(`${PLENO}/tvshow/1396/2/3`)));
  assert.ok(tvCalls.some((call) => call.url.startsWith(`${PLAYERFLIX}/inc/Ajax.php?type=tv&id=1396`)));
  // GStream não deve ser chamado para série
  assert.ok(!tvCalls.some((call) => call.url.includes(GSTREAM)));
});

test('título real da fonte e ausência reconhecida no plenoflu', async () => {
  const route = chain([
    (url) => {
      if (url.origin === PLENO && url.pathname.startsWith('/movie/')) {
        return plenofluAbsenceHtml();
      }
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') {
        return playerflixMovieResponse({
          title: 'Oppenheimer',
          year: 2023,
          options: [{ label: 'VIP', embed: FIRE_B, embed_id: HASH_B, lang: 'Dublado' }],
        });
      }
      if (url.origin === 'https://embedplayer2.xyz' && url.pathname === '/player/index.php') {
        return { body: { hls: true, securedLink: SECURED_B } };
      }
      if (url.origin === 'https://cdn.example' && url.pathname === '/master-b.m3u8') {
        return fixture('master-variants.m3u8');
      }
      return undefined;
    },
  ]);

  const { streams, logs } = await play(route, ['872585', 'movie'], '');
  assert.ok(streams.length > 0);
  assert.equal(streams[0].name, 'FirePlayer PT-BR 720p\n🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');
  assert.equal(streams[0].title, '🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');
  assert.ok(logs.log.some((msg) => msg.includes('plenoflu ausência: conteúdo não encontrado')));
  assert.equal(logs.error.length, 0);

  const prismApp = await play(route, ['872585', 'movie'], '', codes.prism);
  assert.equal(prismApp.streams[0].name, '💿 HD 720p\n🎬 Oppenheimer (2023)\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz');
  assert.equal(prismApp.streams[0].title, '🎬 Oppenheimer (2023)\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz\n🔍FirePlayer PT-BR');
});

test('falha de contrato quando opções estão ausentes', async () => {
  const route = chain([
    (url) => {
      if (url.origin === PLENO) return plenofluAbsenceHtml();
      if (url.origin === PLAYERFLIX) return { body: { status: true, data: {} } }; // sem options
      return undefined;
    },
  ]);

  const { streams, logs } = await play(route, ['999', 'movie'], '');
  assert.deepEqual(streams, []);
  assert.ok(logs.error.some((msg) => msg.includes('opções do PlayerFlix ausentes')));
});

test('enriquecimento TMDB independente e GStream condicional', async () => {
  // Cenário 1: Chave ausente
  let tmdbCalled = false;
  const noKeyRoute = chain([
    (url) => {
      if (url.origin.includes('themoviedb.org')) {
        tmdbCalled = true;
        return { status: 500, body: 'erro' };
      }
      if (url.origin === PLENO && url.pathname === '/movie/603') return plenofluMovieHtml('Matrix (1999)', 'tt0133093');
      if (url.origin === PLENO && url.pathname === '/api') {
        return { body: { status: true, data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      }
      if (url.origin === PLAYERFLIX) return playerflixMovieResponse({ options: [] });
      if (url.origin === 'https://embedplayer2.xyz') return { body: { hls: true, securedLink: SECURED_A } };
      if (url.pathname === '/master-a.m3u8') return fixture('master-variants.m3u8');
      if (url.origin === GSTREAM) {
        if (url.pathname === '/stream') return { body: { resources: { sources: [{ file: FIRE_B }] } } };
        return '<html><input name="idS" value="12345"></html>';
      }
      return undefined;
    },
  ]);

  const noKeyResult = await play(noKeyRoute, ['603', 'movie'], '');
  assert.equal(tmdbCalled, false);
  assert.ok(noKeyResult.streams.length > 0);

  // Cenário 2: TMDB falha (500) não impede PlayerFlix
  const tmdbFailRoute = chain([
    (url) => {
      if (url.origin.includes('themoviedb.org')) return { status: 500, body: 'erro interno TMDB' };
      if (url.origin === PLENO) return plenofluAbsenceHtml();
      if (url.origin === PLAYERFLIX) {
        return playerflixMovieResponse({
          title: 'Matrix',
          year: 1999,
          options: [{ label: 'PlayerFlix 1', embed: FIRE_A, embed_id: HASH_A }],
        });
      }
      if (url.origin === 'https://embedplayer2.xyz') return { body: { hls: true, securedLink: SECURED_A } };
      if (url.pathname === '/master-a.m3u8') return fixture('master-variants.m3u8');
      return undefined;
    },
  ]);

  const failResult = await play(tmdbFailRoute, ['603', 'movie'], KEY);
  assert.ok(failResult.streams.length > 0);
  assert.ok(failResult.logs.warn.some((msg) => msg.includes('TMDB metadados:')));

  // Cenário 3: Contradição de IDs entre TMDB e Plenoflu
  const contradictionRoute = chain([
    (url) => {
      if (url.origin.includes('themoviedb.org')) {
        return {
          body: {
            title: 'Filme TMDB',
            original_title: 'Filme TMDB',
            release_date: '2026-01-01',
            external_ids: { imdb_id: 'tt1111111' },
            alternative_titles: { titles: [] },
          },
        };
      }
      if (url.origin === PLENO && url.pathname === '/movie/603') {
        return plenofluMovieHtml('Filme Divergente', 'tt2222222');
      }
      if (url.origin === PLAYERFLIX) {
        return playerflixMovieResponse({
          title: 'Filme TMDB',
          year: 2026,
          options: [{ label: 'Opção 1', embed: FIRE_A, embed_id: HASH_A }],
        });
      }
      if (url.origin === 'https://embedplayer2.xyz') return { body: { hls: true, securedLink: SECURED_A } };
      if (url.pathname === '/master-a.m3u8') return fixture('master-variants.m3u8');
      return undefined;
    },
  ]);

  const contraResult = await play(contradictionRoute, ['603', 'movie'], KEY);
  assert.ok(contraResult.streams.length > 0);
  assert.ok(contraResult.logs.warn.some((msg) => msg.includes('contradiz o TMDB')));
});

test('agregar entradas sem parar no primeiro sucesso e falhas parciais/totais', async () => {
  // Sucesso de ambas as entradas (plenoflu entrega 480p adaptativo e PlayerFlix entrega 720p)
  const bothRoute = chain([
    (url) => {
      if (url.origin === PLENO && url.pathname === '/movie/603') return plenofluMovieHtml('Matrix (1999)', 'tt0133093');
      if (url.origin === PLENO && url.pathname === '/api') return { body: { status: true, data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      if (url.origin === PLAYERFLIX) {
        return playerflixMovieResponse({
          title: 'Matrix',
          year: 1999,
          options: [{ label: 'PlayerFlix 720p', embed: FIRE_B, embed_id: HASH_B }],
        });
      }
      if (url.origin === 'https://embedplayer2.xyz' && url.pathname === '/player/index.php') {
        const hash = url.searchParams.get('hash') || (url.searchParams.get('r') ? HASH_A : HASH_B);
        return { body: { hls: true, securedLink: hash === HASH_A ? SECURED_A : SECURED_B } };
      }
      if (url.pathname === '/master-a.m3u8') return fixture('master-dual.m3u8'); // 480p adaptativo
      if (url.pathname === '/master-b.m3u8') return fixture('master-variants.m3u8'); // 720p, 480p, 360p
      if (url.origin === GSTREAM) {
        if (url.pathname === '/stream') return { body: { resources: { sources: [{ file: FIRE_A }] } } };
        return '<html><input name="idS" value="12345"></html>';
      }
      return undefined;
    },
  ]);

  const bothResult = await play(bothRoute, ['603', 'movie'], '');
  assert.ok(bothResult.streams.length >= 2);
  // Maior qualidade primeiro
  assert.equal(bothResult.streams[0].quality, '720p');

  // Falha total técnica gera console.error
  const failTotalRoute = chain([
    (url) => {
      if (url.origin === PLENO) return { status: 500, body: 'erro interno no plenoflu' };
      if (url.origin === PLAYERFLIX) return { status: 502, body: 'bad gateway' };
      return undefined;
    },
  ]);

  const failTotal = await play(failTotalRoute, ['603', 'movie'], '');
  assert.deepEqual(failTotal.streams, []);
  assert.ok(failTotal.logs.error.some((msg) => msg.includes('Nenhuma entrada entregou streams:')));
});

test('episódio direto plenoflu via DIRECT_EPISODE_ID e coordenadas', async () => {
  const route = chain([
    (url) => {
      if (url.origin === PLENO && url.pathname === '/tvshow/1396/2/3') {
        return plenofluSeriesHtml('Breaking Bad (2008)', '58258');
      }
      if (url.origin === PLENO && url.pathname === '/api') {
        return { body: { status: true, data: { options: [{ url: FIRE_A, display_type: 'Dublado' }] } } };
      }
      if (url.origin === PLAYERFLIX) return playerflixSeriesResponse({ options: [] });
      if (url.origin === 'https://embedplayer2.xyz') return { body: { hls: true, securedLink: SECURED_A } };
      if (url.pathname === '/master-a.m3u8') return fixture('master-dual.m3u8');
      return undefined;
    },
  ]);

  const { streams } = await play(route, ['1396', 'tv', 2, 3], '');
  assert.ok(streams.length > 0);
  assert.equal(streams[0].name, 'FirePlayer PT-BR 480p\n🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz\nℹ️ Reprodução adaptativa');
  assert.equal(streams[0].title, '🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz\nℹ️ Reprodução adaptativa');

  const prismApp = await play(route, ['1396', 'tv', 2, 3], '', codes.prism);
  assert.equal(prismApp.streams[0].name, '💩 Baixa qualidade 480p\n🎬 Breaking Bad (2008) T02E03\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz\nℹ️ Reprodução adaptativa');
  assert.equal(prismApp.streams[0].title, '🎬 Breaking Bad (2008) T02E03\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz\n🔍FirePlayer PT-BR\nℹ️ Reprodução adaptativa');
});

test('deduplicação de recursos finais e combinação de legendas', async () => {
  // Duas entradas apontam para o mesmo player e mesmo hash
  const dedupeRoute = chain([
    (url) => {
      if (url.origin === PLENO && url.pathname === '/movie/603') {
        return plenofluMovieHtml('Matrix (1999)', 'tt0133093');
      }
      if (url.origin === PLENO && url.pathname === '/api') return { body: { status: true, data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      if (url.origin === PLAYERFLIX) {
        return playerflixMovieResponse({
          title: 'Matrix',
          year: 1999,
          options: [{ label: 'PlayerFlix Duplicado', embed: FIRE_A, embed_id: HASH_A }],
        });
      }
      if (url.origin === 'https://embedplayer2.xyz') {
        return {
          body: {
            hls: true,
            securedLink: SECURED_A,
          },
        };
      }
      if (url.pathname === '/master-a.m3u8') return fixture('master-dual.m3u8');
      if (url.origin === GSTREAM) {
        if (url.pathname === '/stream') return { body: { resources: { sources: [{ file: FIRE_A }] } } };
        return '<html><input name="idS" value="12345"></html>';
      }
      return undefined;
    },
  ]);

  const { streams } = await play(dedupeRoute, ['603', 'movie'], '');
  // Deve ter deduplicado para 1 stream adaptativo (já que ambos apontam para FIRE_A com o mesmo hash)
  assert.equal(streams.length, 1);
});

test('master adaptativo com áudio externo e qualidade real', async () => {
  const route = chain([
    (url) => {
      if (url.origin === PLENO && url.pathname === '/movie/603') return plenofluMovieHtml('Matrix (1999)', 'tt0133093');
      if (url.origin === PLENO && url.pathname === '/api') return { body: { status: true, data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      if (url.origin === PLAYERFLIX) return playerflixMovieResponse({ options: [] });
      if (url.origin === 'https://embedplayer2.xyz') return { body: { hls: true, securedLink: SECURED_A } };
      if (url.pathname === '/master-a.m3u8') return fixture('master-dual.m3u8'); // Master com TYPE=AUDIO
      if (url.origin === GSTREAM) {
        if (url.pathname === '/stream') return { body: { resources: { sources: [{ file: FIRE_A }] } } };
        return '<html><input name="idS" value="12345"></html>';
      }
      return undefined;
    },
  ]);

  const { streams } = await play(route, ['603', 'movie'], '');
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '480p');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].type, 'hls');
  assert.equal(streams[0].provider, 'embedplayer2.xyz');
  assert.equal(streams[0].name, 'FirePlayer PT-BR 480p\n🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz\nℹ️ Reprodução adaptativa');
  assert.equal(streams[0].title, '🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz\nℹ️ Reprodução adaptativa');

  const prismApp = await play(route, ['603', 'movie'], '', codes.prism);
  assert.equal(prismApp.streams[0].name, '💩 Baixa qualidade 480p\n🎬 Matrix (1999)\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz\nℹ️ Reprodução adaptativa');
  assert.equal(prismApp.streams[0].title, '🎬 Matrix (1999)\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz\n🔍FirePlayer PT-BR\nℹ️ Reprodução adaptativa');
});

test('idioma e legendas comprovados e descarte de áudio estrangeiro sem PT', async () => {
  // Mídia estrangeira (ENG) sem legenda PT deve ser descartada
  const englishOnlyM3u8 = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="eng",DEFAULT=YES,URI="https://cdn.example/audio-eng.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=750000,RESOLUTION=842x480,NAME="480p",AUDIO="audio"
https://cdn.example/480.css`;

  const route = chain([
    (url) => {
      if (url.origin === PLENO && url.pathname === '/movie/603') return plenofluMovieHtml('Matrix (1999)', 'tt0133093');
      if (url.origin === PLENO && url.pathname === '/api') return { body: { status: true, data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      if (url.origin === PLAYERFLIX) return playerflixMovieResponse({ options: [] });
      if (url.origin === 'https://embedplayer2.xyz') return { body: { hls: true, securedLink: SECURED_A } };
      if (url.pathname === '/master-a.m3u8') return englishOnlyM3u8;
      if (url.origin === GSTREAM) {
        if (url.pathname === '/stream') return { body: { resources: { sources: [{ file: FIRE_A }] } } };
        return '<html><input name="idS" value="12345"></html>';
      }
      return undefined;
    },
  ]);

  const { streams, logs } = await play(route, ['603', 'movie'], '');
  assert.equal(streams.length, 0);
  assert.ok(textOf(logs).includes('sem legenda PT'));
});

test('legenda WebVTT válida em extensão .jpg é aceita', async () => {
  const masterWithJpgSub = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="eng",DEFAULT=YES,URI="https://cdn.example/audio-eng.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Português",LANGUAGE="por",DEFAULT=YES,URI="https://cdn.example/sub.jpg"
#EXT-X-STREAM-INF:BANDWIDTH=750000,RESOLUTION=842x480,NAME="480p",AUDIO="audio",SUBTITLES="subs"
https://cdn.example/480.css`;

  const route = chain([
    (url) => {
      if (url.origin === PLENO && url.pathname === '/movie/603') return plenofluMovieHtml('Matrix (1999)', 'tt0133093');
      if (url.origin === PLENO && url.pathname === '/api') return { body: { status: true, data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      if (url.origin === PLAYERFLIX) return playerflixMovieResponse({ options: [] });
      if (url.origin === 'https://embedplayer2.xyz') return { body: { hls: true, securedLink: SECURED_A } };
      if (url.pathname === '/master-a.m3u8') return masterWithJpgSub;
      if (url.pathname === '/sub.jpg') return 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nLegenda em português';
      if (url.origin === GSTREAM) {
        if (url.pathname === '/stream') return { body: { resources: { sources: [{ file: FIRE_A }] } } };
        return '<html><input name="idS" value="12345"></html>';
      }
      return undefined;
    },
  ]);

  const { streams } = await play(route, ['603', 'movie'], '');
  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.ok(streams[0].subtitles.length > 0);
  assert.equal(streams[0].subtitles[0].url, 'https://cdn.example/sub.jpg');
});

test('ausência de securedLink faz fallback para videoSource com diagnóstico', async () => {
  const route = chain([
    (url) => {
      if (url.origin === PLENO && url.pathname === '/movie/603') return plenofluMovieHtml('Matrix (1999)', 'tt0133093');
      if (url.origin === PLENO && url.pathname === '/api') return { body: { status: true, data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      if (url.origin === PLAYERFLIX) return playerflixMovieResponse({ options: [] });
      if (url.origin === 'https://embedplayer2.xyz') {
        // securedLink ausente, usa videoSource
        return { body: { hls: true, videoSource: 'https://cdn.example/source.txt' } };
      }
      if (url.pathname === '/source.txt') return fixture('master-variants.m3u8');
      if (url.origin === GSTREAM) {
        if (url.pathname === '/stream') return { body: { resources: { sources: [{ file: FIRE_A }] } } };
        return '<html><input name="idS" value="12345"></html>';
      }
      return undefined;
    },
  ]);

  const { streams, logs } = await play(route, ['603', 'movie'], '');
  assert.ok(streams.length > 0);
  assert.ok(textOf(logs).includes('videoSource usado porque securedLink está ausente'));
});

test('playlist sem RESOLUTION é preservada como Desconhecida sem mensagem adaptativa', async () => {
  const directPlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment.ts\n#EXT-X-ENDLIST';
  const route = chain([
    (url) => {
      if (url.origin === PLENO && url.pathname === '/movie/603') return plenofluMovieHtml('Matrix (1999)', 'tt0133093');
      if (url.origin === PLENO && url.pathname === '/api') return { body: { status: true, data: { video_url: Buffer.from(FIRE_A).toString('base64') } } };
      if (url.origin === PLAYERFLIX) return playerflixMovieResponse({ options: [] });
      if (url.origin === 'https://embedplayer2.xyz') return { body: { hls: true, securedLink: SECURED_A } };
      if (url.pathname === '/master-a.m3u8') return directPlaylist;
      return undefined;
    },
  ]);

  const { streams } = await play(route, ['603', 'movie'], '');
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].url, SECURED_A);
  assert.equal(streams[0].name, 'FirePlayer PT-BR Desconhecida\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 embedplayer2.xyz');
  assert.equal(streams[0].title, '🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 embedplayer2.xyz');

  const prismApp = await play(route, ['603', 'movie'], '', codes.prism);
  assert.equal(prismApp.streams[0].quality, 'Desconhecida');
  assert.equal(prismApp.streams[0].name, '❓ Desconhecida\n🎬 Matrix (1999)\n🗣️ Idioma Desconhecido\n🌐 HTTP\n📡 embedplayer2.xyz');
  assert.equal(prismApp.streams[0].title, '🎬 Matrix (1999)\n🗣️ Idioma Desconhecido\n🌐 HTTP\n📡 embedplayer2.xyz\n🔍FirePlayer PT-BR');
});
