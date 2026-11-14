const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'embedmovies');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const SOURCE = 'https://embedmovies.org';
const MYEMBED = 'https://myembed.biz';
const PLAYERFLIX = 'https://playerflix.ink';
const EMBEDPLAYER = 'https://embedplayer2.xyz';
const WATCHPLAY_V1 = 'https://v1.watchplay.shop';
const WATCHPLAY_V2 = 'https://v2.watchplay.shop';
const CDN = 'https://cdn.example';
const HASH_A = 'a'.repeat(32);
const HASH_B = 'b'.repeat(32);
const HASH_C = 'c'.repeat(32);

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('embedmovies-test-');
  try {
    const gdriveDir = path.join(outDir, 'gdrive');
    const prismDir = path.join(outDir, 'prism');
    fs.mkdirSync(gdriveDir);
    fs.mkdirSync(prismDir);
    codes.gdrive = fs.readFileSync(await buildProvider('embedmovies', { outDir: gdriveDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('embedmovies', { outDir: prismDir, formatter: 'prism' }), 'utf8');
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function textOf(logs) {
  return [...logs.log, ...logs.warn, ...logs.error].join('\n');
}

function runtime(route, bundle = code) {
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const context = {
    module: { exports: {} },
    URL,
    URLSearchParams,
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
      calls.push({ url: String(url), init: init || {} });
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
  vm.runInNewContext(bundle, context, { filename: 'embedmovies.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

async function play(route, args = ['603', 'movie'], bundle = code) {
  const app = runtime(route, bundle);
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

function searchBody(init) {
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Referer, `${SOURCE}/`);
  assert.match(init.headers['Content-Type'], /application\/x-www-form-urlencoded/);
  return init.body;
}

function playerflixResponse({ title = 'Matrix', year = 1999, options }) {
  return {
    status: true,
    data: {
      title: { pt: title, en: title },
      release_date: `${year}-01-01`,
      options,
    },
  };
}

function vipOption(hash, label = 'VIP Player', embedId = hash) {
  return {
    embed: `${EMBEDPLAYER}/video/${hash}`,
    ...(embedId ? { embed_id: embedId } : {}),
    lang: 'pt-br',
    label,
    budget: 'success',
  };
}

function searchOnly(search) {
  return chain([
    (url, init) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') {
        searchBody(init);
        return { body: search };
      }
      return undefined;
    },
  ]);
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
  assert.ok(app.logs.error.every((line) => line.startsWith('[EmbedMovies] Entrada:')));
});

test('filme resolvido pelo catálogo com contrato completo, triagem e ordenação', async () => {
  const route = chain([
    (url, init) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') {
        assert.equal(searchBody(init), 'type=search&search=603');
        return { body: readJson('search-movie.json') };
      }
      if (url.origin === MYEMBED && url.pathname === '/filme/tt0133093') {
        assert.equal(init.headers.Referer, `${SOURCE}/`);
        return read('myembed-movie.html');
      }
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') {
        assert.equal(url.searchParams.get('type'), 'movie');
        assert.equal(url.searchParams.get('id'), 'tt0133093');
        assert.equal(url.searchParams.get('season'), 'null');
        assert.equal(url.searchParams.get('episode'), 'null');
        assert.equal(init.headers.Referer, `${PLAYERFLIX}/filme/tt0133093`);
        return { body: readJson('playerflix-movie.json') };
      }
      if (url.origin === EMBEDPLAYER && url.pathname === '/player/index.php') {
        assert.equal(url.searchParams.get('data'), HASH_A);
        assert.equal(url.searchParams.get('do'), 'getVideo');
        assert.equal(init.method, 'POST');
        assert.match(String(init.body), new RegExp(`hash=${HASH_A}`));
        return { body: readJson('embedplayer-api.json') };
      }
      if (url.origin === WATCHPLAY_V1 && url.pathname === '/movie/tt0133093') {
        assert.equal(init.headers.Referer, `${PLAYERFLIX}/`);
        return { url: `${WATCHPLAY_V2}/movie/tt0133093`, body: read('watchplay-movie.html') };
      }
      if (url.origin === CDN && url.pathname === '/watchplay/playlist.m3u8') {
        assert.equal(init.headers.Referer, `${WATCHPLAY_V2}/movie/tt0133093`);
        return read('watchplay-vod.m3u8');
      }
      if (url.origin === CDN && url.pathname === '/master.m3u8') {
        assert.equal(url.searchParams.get('md5'), 'fictional');
        return read('master.m3u8');
      }
      return undefined;
    },
  ]);

  const { streams, calls, logs } = await play(route);
  assert.equal(calls.length, 7);
  assert.equal(calls[0].url, `${SOURCE}/inc/Ajax.php`);
  assert.deepEqual(streams.map((stream) => stream.quality), ['1080p', '720p', '360p', 'Desconhecida']);

  const stream = streams[0];
  assert.equal(stream.url, `${CDN}/1080.m3u8`);
  assert.equal(stream.type, 'hls');
  assert.equal(stream.provider, 'embedplayer2.xyz');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.headers.Referer, `${EMBEDPLAYER}/video/${HASH_A}`);
  assert.equal(stream.headers.Origin, EMBEDPLAYER);
  assert.equal(stream.subtitles, undefined);
  assert.equal(stream.name, 'EmbedMovies 1080p\n🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');
  assert.equal(stream.title, '🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');

  const watchplay = streams.find((item) => item.quality === 'Desconhecida');
  assert.equal(watchplay.url, `${CDN}/watchplay/playlist.m3u8?md5=fictional&expires=999`);
  assert.equal(watchplay.type, 'hls');
  assert.equal(watchplay.provider, 'v2.watchplay.shop');
  assert.equal(watchplay.language, 'Dublado');
  assert.equal(watchplay.headers.Referer, `${WATCHPLAY_V2}/movie/tt0133093`);
  assert.equal(watchplay.name, 'EmbedMovies Desconhecida\n🗣️ Dublado\n🌐 HTTP 🔍 v2.watchplay.shop');

  assert.equal(logs.log.some((message) => message.includes('Opção WatchPlay descartada por triagem')), false);
  assert.ok(logs.log.some((message) => message.includes('Opção Embed Play descartada por triagem: host fora do conjunto: embedplayabyss.top')));
  assert.ok(logs.log.some((message) => message.includes('Opção Blogger descartada por triagem: host fora do conjunto: www.blogger.com')));
  assert.ok(logs.log.some((message) => message.includes('Opção OK descartada por triagem: host fora do conjunto: ok.ru')));
  assert.ok(logs.log.some((message) => message.includes('Opção Premium descartada por triagem: budget danger')));
  assert.equal(logs.error.length, 0);

  const prism = await play(route, ['603', 'movie'], codes.prism);
  assert.equal(
    prism.streams[0].name,
    '🚀 FHD 1080p\n🎬 Matrix (1999)\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz',
  );
  assert.equal(
    prism.streams[0].title,
    '🎬 Matrix (1999)\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz\n🔍EmbedMovies',
  );
});

test('filme cuja única opção jogável é WatchPlay devolve HLS com qualidade Desconhecida', async () => {
  const route = chain([
    (url, init) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') {
        assert.equal(searchBody(init), 'type=search&search=603');
        return { body: readJson('search-movie.json') };
      }
      if (url.origin === MYEMBED && url.pathname === '/filme/tt0133093') {
        assert.equal(init.headers.Referer, `${SOURCE}/`);
        return read('myembed-movie.html');
      }
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') {
        return { body: readJson('playerflix-watchplay.json') };
      }
      if (url.origin === WATCHPLAY_V1 && url.pathname === '/movie/tt0133093') {
        assert.equal(init.headers.Referer, `${PLAYERFLIX}/`);
        return { url: `${WATCHPLAY_V2}/movie/tt0133093`, body: read('watchplay-movie.html') };
      }
      if (url.origin === CDN && url.pathname === '/watchplay/playlist.m3u8') {
        assert.equal(init.headers.Referer, `${WATCHPLAY_V2}/movie/tt0133093`);
        return read('watchplay-vod.m3u8');
      }
      return undefined;
    },
  ]);

  const { streams, calls, logs } = await play(route);
  assert.equal(calls.length, 5);
  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, `${CDN}/watchplay/playlist.m3u8?md5=fictional&expires=999`);
  assert.equal(stream.quality, 'Desconhecida');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.type, 'hls');
  assert.equal(stream.provider, 'v2.watchplay.shop');
  assert.equal(stream.name, 'EmbedMovies Desconhecida\n🗣️ Dublado\n🌐 HTTP 🔍 v2.watchplay.shop');
  assert.equal(logs.error.length, 0);
  assert.equal(logs.warn.length, 0);
  assert.ok(logs.log.some((message) => message.includes('Opção Embed Play descartada por triagem')));
  assert.equal(logs.log.some((message) => message.includes('WatchPlay descartada por triagem')), false);

  const prism = await play(route, ['603', 'movie'], codes.prism);
  assert.equal(prism.streams.length, 1);
  assert.equal(
    prism.streams[0].name,
    '❓ Desconhecida\n🎬 Matrix (1999)\n🗣️ Dublado\n🌐 HTTP\n📡 v2.watchplay.shop',
  );
  assert.equal(
    prism.streams[0].title,
    '🎬 Matrix (1999)\n🗣️ Dublado\n🌐 HTTP\n📡 v2.watchplay.shop\n🔍EmbedMovies',
  );
});

test('série acrescenta temporada e episódio ao player e preserva as coordenadas', async () => {
  const route = chain([
    (url, init) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') {
        assert.equal(searchBody(init), 'type=search&search=100088');
        return { body: readJson('search-tv.json') };
      }
      if (url.origin === MYEMBED && url.pathname === '/serie/100088/1/1') {
        assert.equal(init.headers.Referer, `${SOURCE}/`);
        return read('myembed-tv.html');
      }
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') {
        assert.equal(url.searchParams.get('type'), 'tv');
        assert.equal(url.searchParams.get('id'), '100088');
        assert.equal(url.searchParams.get('season'), '1');
        assert.equal(url.searchParams.get('episode'), '1');
        assert.equal(init.headers.Referer, `${PLAYERFLIX}/serie/100088/1/1`);
        return { body: readJson('playerflix-tv.json') };
      }
      if (url.origin === EMBEDPLAYER && url.pathname === '/player/index.php') {
        assert.equal(url.searchParams.get('data'), HASH_B);
        return { body: readJson('embedplayer-api.json') };
      }
      if (url.origin === WATCHPLAY_V1 && url.pathname === '/tvshow/100088/1/1') {
        assert.equal(init.headers.Referer, `${PLAYERFLIX}/`);
        return { url: `${WATCHPLAY_V2}/tvshow/100088/1/1`, body: read('watchplay-movie.html') };
      }
      if (url.origin === CDN && url.pathname === '/watchplay/playlist.m3u8') {
        return read('watchplay-vod.m3u8');
      }
      if (url.origin === CDN && url.pathname === '/master.m3u8') {
        return read('master.m3u8');
      }
      return undefined;
    },
  ]);

  const { streams, calls, logs } = await play(route, ['100088', 'tv', 1, 1]);
  assert.equal(calls.length, 7);
  assert.deepEqual(streams.map((stream) => stream.quality), ['1080p', '720p', '360p', 'Desconhecida']);
  assert.equal(streams[0].headers.Referer, `${EMBEDPLAYER}/video/${HASH_B}`);
  const watchplayGdrive = streams.find((item) => item.quality === 'Desconhecida');
  assert.equal(watchplayGdrive.provider, 'v2.watchplay.shop');
  assert.equal(watchplayGdrive.language, 'Dublado');
  assert.equal(logs.error.length, 0);

  const prism = await play(route, ['100088', 'tv', 1, 1], codes.prism);
  assert.equal(
    prism.streams[0].name,
    '🚀 FHD 1080p\n🎬 The Last of Us (2023) T01E01\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz',
  );
  assert.equal(
    prism.streams[0].title,
    '🎬 The Last of Us (2023) T01E01\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz\n🔍EmbedMovies',
  );
  const watchplay = prism.streams.find((stream) => stream.quality === 'Desconhecida');
  assert.match(watchplay.name, /^❓ Desconhecida\n🎬 The Last of Us \(2023\) T01E01\n🗣️ Dublado\n🌐 HTTP\n📡 v2\.watchplay\.shop$/);
  assert.match(watchplay.title, /🎬 The Last of Us \(2023\) T01E01/);
});

test('ausência reconhecida sem correspondência exata não consulta o player', async () => {
  const empty = await play(searchOnly(readJson('search-empty.json')), ['999999999', 'movie']);
  assert.deepEqual(empty.streams, []);
  assert.equal(empty.calls.length, 1);
  assert.equal(empty.logs.error.length, 0);

  const mismatch = await play(searchOnly(readJson('search-type-mismatch.json')), ['603', 'movie']);
  assert.deepEqual(mismatch.streams, []);
  assert.equal(mismatch.calls.length, 1);
  assert.equal(mismatch.logs.error.length, 0);
  assert.equal(mismatch.logs.log.length, 0);
});

test('resposta inválida da busca é erro, não ausência', async () => {
  const cases = [
    {
      name: 'HTTP 500',
      route: chain([(url) => (url.pathname === '/inc/Ajax.php' ? { status: 500, body: 'erro' } : undefined)]),
      message: 'HTTP 500',
    },
    {
      name: 'JSON inválido',
      route: chain([(url) => (url.pathname === '/inc/Ajax.php' ? '<html>busca</html>' : undefined)]),
      message: 'Resposta não é JSON válido',
    },
    {
      name: 'success falso',
      route: searchOnly(readJson('search-malformed.json')),
      message: 'fora do contrato',
    },
    {
      name: 'sem results',
      route: searchOnly({ success: true }),
      message: 'fora do contrato',
    },
  ];

  for (const item of cases) {
    const result = await play(item.route);
    assert.deepEqual(result.streams, [], item.name);
    assert.equal(result.calls.length, 1, item.name);
    assert.ok(result.logs.error.some((line) => line.startsWith('[EmbedMovies]')), item.name);
    assert.ok(result.logs.error.some((line) => line.includes(item.message)), item.name);
  }
});

test('embed ausente ou fora dos domínios do player é erro de contrato', async () => {
  const base = readJson('search-movie.json');
  const changes = [
    (item) => { delete item.embed; },
    (item) => { item.embed = 'https://cdn.example/filme/tt0133093'; },
    (item) => { item.embed = 'ftp://myembed.biz/filme/tt0133093'; },
  ];

  for (const change of changes) {
    const search = JSON.parse(JSON.stringify(base));
    change(search.results[0]);
    const result = await play(searchOnly(search));
    assert.deepEqual(result.streams, []);
    assert.equal(result.calls.length, 1);
    assert.ok(result.logs.error.some((line) => line.includes('embed do catálogo ausente ou fora dos domínios do player')));
  }
});

test('player inexistente, sem iframe ou sem opções falha sem stream parcial', async () => {
  const base = readJson('search-movie.json');

  const missing = await play(chain([
    (url) => {
      if (url.pathname === '/inc/Ajax.php') return { body: base };
      if (url.origin === MYEMBED) return { status: 404, body: 'não encontrado' };
      return undefined;
    },
  ]));
  assert.deepEqual(missing.streams, []);
  assert.ok(missing.logs.error.some((line) => line.includes('HTTP 404')));

  const withoutIframe = await play(chain([
    (url) => {
      if (url.pathname === '/inc/Ajax.php') return { body: base };
      if (url.origin === MYEMBED) return '<html><body><div id="loading"></div></body></html>';
      return undefined;
    },
  ]));
  assert.deepEqual(withoutIframe.streams, []);
  assert.ok(withoutIframe.logs.error.some((line) => line.includes('iframe do myembed ausente')));

  const withoutOptions = await play(chain([
    (url) => {
      if (url.pathname === '/inc/Ajax.php') return { body: base };
      if (url.origin === MYEMBED) return read('myembed-movie.html');
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') {
        return { body: { status: true, data: {} } };
      }
      return undefined;
    },
  ]));
  assert.deepEqual(withoutOptions.streams, []);
  assert.ok(withoutOptions.logs.error.some((line) => line.includes('opções do PlayerFlix ausentes')));
});

test('todas as opções apenas em triagem devolvem vazio sem console.error', async () => {
  const response = playerflixResponse({
    options: [
      { embed: 'https://embedplayabyss.top/player.html?v=exemplo', lang: 'pt-br', label: 'Embed Play', budget: 'success' },
      { embed: 'https://www.blogger.com/video.g?v=exemplo', lang: 'pt-br', label: 'Blogger', budget: 'success' },
      { embed: 'https://ok.ru/video/123', lang: 'pt-br', label: 'OK', budget: 'success' },
      { embed: 'https://superflixapi.fun/filme/tt0133093', lang: 'pt-br', label: 'Premium', budget: 'danger' },
    ],
  });
  const result = await play(chain([
    (url) => {
      if (url.pathname === '/inc/Ajax.php' && url.origin === SOURCE) return { body: readJson('search-movie.json') };
      if (url.origin === MYEMBED) return read('myembed-movie.html');
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') return { body: response };
      return undefined;
    },
  ]));

  assert.deepEqual(result.streams, []);
  assert.equal(result.calls.length, 3);
  assert.equal(result.logs.error.length, 0);
  assert.equal(result.logs.warn.length, 0);
  assert.ok(result.logs.log.some((message) => message.includes('host fora do conjunto: embedplayabyss.top')));
  assert.ok(result.logs.log.some((message) => message.includes('host fora do conjunto: www.blogger.com')));
  assert.ok(result.logs.log.some((message) => message.includes('host fora do conjunto: ok.ru')));
  assert.ok(result.logs.log.some((message) => message.includes('Premium descartada por triagem: budget danger')));
  assert.equal(result.logs.log.some((message) => message.includes('WatchPlay')), false);
});

test('falha isolada de uma opção preserva os streams da outra', async () => {
  const response = playerflixResponse({
    options: [vipOption(HASH_A), vipOption(HASH_B, 'Player secundário')],
  });
  const result = await play(chain([
    (url) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') return { body: readJson('search-movie.json') };
      if (url.origin === MYEMBED) return read('myembed-movie.html');
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') return { body: response };
      if (url.origin === EMBEDPLAYER && url.pathname === '/player/index.php') {
        if (url.searchParams.get('data') === HASH_B) return { status: 500, body: 'falha isolada' };
        return { body: readJson('embedplayer-api.json') };
      }
      if (url.origin === CDN && url.pathname === '/master.m3u8') return read('master.m3u8');
      return undefined;
    },
  ]));

  assert.equal(result.streams.length, 3);
  assert.equal(result.streams[0].headers.Referer, `${EMBEDPLAYER}/video/${HASH_A}`);
  assert.equal(result.logs.error.length, 0);
  assert.ok(result.logs.warn.some((message) => message.includes('Opção Player secundário descartada:')));
});

test('todas as opções com falha técnica sobem erro com causas e logs saneados', async () => {
  const response = playerflixResponse({
    options: [vipOption(HASH_A), vipOption(HASH_B, 'Player secundário')],
  });
  const result = await play(chain([
    (url) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') return { body: readJson('search-movie.json') };
      if (url.origin === MYEMBED) return read('myembed-movie.html');
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') return { body: response };
      if (url.origin === EMBEDPLAYER) return { status: 500, body: 'falha total' };
      return undefined;
    },
  ]));

  assert.deepEqual(result.streams, []);
  assert.equal(result.logs.error.length, 1);
  assert.ok(result.logs.error[0].startsWith('[EmbedMovies] Nenhuma opção entregou streams:'));
  assert.match(result.logs.error[0], /VIP Player/);

  const logs = textOf(result.logs);
  assert.doesNotMatch(logs, /m3u8|md5=|expires=|[a-f0-9]{32,}/i);
  assert.doesNotMatch(result.logs.error[0], new RegExp(HASH_A, 'i'));
});

test('opção sem embed_id lê o hash na página do player e não devolve stream parcial', async () => {
  const response = playerflixResponse({
    options: [{ ...vipOption(HASH_C, 'VIP sem id', null), embed: `${EMBEDPLAYER}/video/player-exemplo` }],
  });
  const result = await play(chain([
    (url) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') return { body: readJson('search-movie.json') };
      if (url.origin === MYEMBED) return read('myembed-movie.html');
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') return { body: response };
      if (url.origin === EMBEDPLAYER && url.pathname === '/video/player-exemplo') {
        return read('embedplayer-video.html');
      }
      if (url.origin === EMBEDPLAYER && url.pathname === '/player/index.php') {
        assert.equal(url.searchParams.get('data'), HASH_C);
        return { body: readJson('embedplayer-api.json') };
      }
      if (url.origin === CDN && url.pathname === '/master.m3u8') return read('master.m3u8');
      return undefined;
    },
  ]));

  assert.equal(result.streams.length, 3);
  assert.equal(result.streams[0].headers.Referer, `${EMBEDPLAYER}/video/player-exemplo`);
  assert.ok(result.calls.some((call) => call.url === `${EMBEDPLAYER}/video/player-exemplo`));
});

test('opções e streams repetidos são deduplicados', async () => {
  const option = vipOption(HASH_A);
  const response = playerflixResponse({ options: [option, option] });
  const result = await play(chain([
    (url) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') return { body: readJson('search-movie.json') };
      if (url.origin === MYEMBED) return read('myembed-movie.html');
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') return { body: response };
      if (url.origin === EMBEDPLAYER && url.pathname === '/player/index.php') {
        return { body: readJson('embedplayer-api.json') };
      }
      if (url.origin === CDN && url.pathname === '/master.m3u8') return read('master.m3u8');
      return undefined;
    },
  ]));

  assert.equal(result.streams.length, 3);
});

test('sem título no catálogo, o título do PlayerFlix é usado', async () => {
  const search = readJson('search-movie.json');
  search.results[0].title = null;
  const result = await play(chain([
    (url) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') return { body: search };
      if (url.origin === MYEMBED) return read('myembed-movie.html');
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') return { body: readJson('playerflix-movie.json') };
      if (url.origin === EMBEDPLAYER && url.pathname === '/player/index.php') {
        return { body: readJson('embedplayer-api.json') };
      }
      if (url.origin === CDN && url.pathname === '/master.m3u8') return read('master.m3u8');
      return undefined;
    },
  ]), ['603', 'movie'], codes.prism);

  assert.equal(result.streams.length, 3);
  assert.match(result.streams[0].name, /🎬 Matrix \(1999\)/);
});

test('cada execução consulta o catálogo e o player de novo', async () => {
  const route = chain([
    (url) => {
      if (url.origin === SOURCE && url.pathname === '/inc/Ajax.php') return { body: readJson('search-movie.json') };
      if (url.origin === MYEMBED) return read('myembed-movie.html');
      if (url.origin === PLAYERFLIX && url.pathname === '/inc/Ajax.php') return { body: readJson('playerflix-movie.json') };
      if (url.origin === EMBEDPLAYER && url.pathname === '/player/index.php') {
        return { body: readJson('embedplayer-api.json') };
      }
      if (url.origin === CDN && url.pathname === '/master.m3u8') return read('master.m3u8');
      return undefined;
    },
  ]);
  const app = runtime(route);
  const first = await app.getStreams('603', 'movie');
  const second = await app.getStreams('603', 'movie');
  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.equal(app.calls.filter((call) => call.url === `${SOURCE}/inc/Ajax.php`).length, 2);
  assert.equal(app.calls.filter((call) => call.url.startsWith(`${EMBEDPLAYER}/player/index.php`)).length, 2);
});

test('fixtures não contêm URL de mídia real', () => {
  for (const file of fs.readdirSync(FIXTURES)) {
    const content = read(file);
    for (const [value] of content.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
      const url = new URL(value.replace(/\\\//g, '/'));
      const media = /\.(?:m3u8|mp4|mkv|ts)$/i.test(url.pathname) || /\/(?:hls|cdn)\//.test(url.pathname);
      if (media) assert.equal(url.hostname, 'cdn.example', `${file}: ${value}`);
    }
  }
});
