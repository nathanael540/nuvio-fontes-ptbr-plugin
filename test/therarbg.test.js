const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'therarbg');
const HASH_A = '1111111111111111111111111111111111111111';
const HASH_B = '2222222222222222222222222222222222222222';
const HASH_C = '3333333333333333333333333333333333333333';
const HASH_D = '4444444444444444444444444444444444444444';
const BASE32_HASH = 'wt5d7ye2yneldaly33xknffywlylphvf';
const BASE32_HEX = 'b4fa3fe09ac348b18178deeea694b8b2f0b79ea5';
const FILE_BYTES = 2147483648;

const clone = (value) => JSON.parse(JSON.stringify(value));
const movieTitle = () => clone(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'movie-title.json'), 'utf8')));
const movieVerifile = () => clone(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'movie-verifile-942153.json'), 'utf8')));
const seriesTitle = () => clone(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'series-title.json'), 'utf8')));
const seriesVerifile = () => clone(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'series-verifile-pack.json'), 'utf8')));
const singleVerifile = () => clone(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'series-verifile-single.json'), 'utf8')));

const codes = {};
test.before(async () => {
  const outDir = createTempDir('therarbg-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('therarbg', { outDir, formatter }), 'utf8');
    }
    codes.base = fs.readFileSync(await buildProvider('therarbg', { outDir }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function encode(value) {
  if (Number.isInteger(value)) return Buffer.from(`i${value}e`);
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes]);
  }
  if (typeof value === 'string') return encode(Buffer.from(value));
  if (Array.isArray(value)) return Buffer.concat([Buffer.from('l'), ...value.map(encode), Buffer.from('e')]);
  const keys = Object.keys(value).sort();
  return Buffer.concat([Buffer.from('d'), ...keys.flatMap((key) => [encode(key), encode(value[key])]), Buffer.from('e')]);
}

function torrent(paths, lengths) {
  return encode({
    announce: 'udp://tracker.example:80/announce',
    info: {
      name: 'pacote',
      'piece length': 262144,
      pieces: 'x',
      files: paths.map((file, index) => ({ length: lengths[index], path: file.split('/') })),
    },
  });
}

function moviePayload(overrides = {}) {
  return {
    title: 'A Fera',
    original_title: 'Heart of the Beast',
    release_date: '2026-02-27',
    external_ids: { imdb_id: 'tt7526136' },
    alternative_titles: { titles: [] },
    original_language: 'en',
    genres: [],
    origin_country: ['US'],
    ...overrides,
  };
}

function seriesPayload(overrides = {}) {
  return {
    name: 'Breaking Bad',
    original_name: 'Breaking Bad',
    first_air_date: '2008-01-20',
    external_ids: { imdb_id: 'tt0903747' },
    alternative_titles: { results: [] },
    original_language: 'en',
    genres: [],
    origin_country: ['US'],
    ...overrides,
  };
}

function magnet(hash, name) {
  return `magnet:?xt=urn:btih:${hash.toUpperCase()}&dn=${encodeURIComponent(name)}&tr=${encodeURIComponent('https://tracker.example/announce')}`;
}

function audioTrack(lang, overrides = {}) {
  return {
    lang,
    codec: 'aac',
    title: null,
    layout: '2.0',
    channels: 2,
    profile: null,
    default: false,
    ...overrides,
  };
}

function subtitleTrack(lang, overrides = {}) {
  return { lang, codec: 'subrip', title: null, forced: false, ...overrides };
}

function movieItem(overrides = {}) {
  const name = overrides.name === undefined ? 'Filme.2026.POR.1080p' : overrides.name;
  const hash = overrides.hash === undefined ? HASH_A : overrides.hash;
  return {
    id: '900001',
    name,
    infoHash: hash,
    magnet: magnet(hash, name),
    category: 'Movies',
    size: 1000000000,
    seeders: 10,
    leechers: 2,
    imdb: 'tt7526136',
    qualityScore: 70,
    resolution: '1080p',
    source: 'WEB-DL',
    codec: 'x264',
    hdr: '',
    releaseGroup: 'GRP',
    verifile: 'verified',
    ...overrides,
  };
}

function seriesItem(overrides = {}) {
  const name = overrides.name === undefined ? 'Breaking.Bad.S05E14.1080p.POR' : overrides.name;
  const hash = overrides.hash === undefined ? HASH_A : overrides.hash;
  return {
    id: '910001',
    name,
    infoHash: hash,
    magnet: magnet(hash, name),
    category: 'TV',
    size: 2300000000,
    seeders: 20,
    leechers: 3,
    imdb: 'tt0903747',
    qualityScore: 74,
    resolution: '1080p',
    source: 'WEB-DL',
    codec: 'x264',
    hdr: '',
    releaseGroup: 'GRP',
    verifile: 'verified',
    ...overrides,
  };
}

function verifilePayload(item, overrides = {}) {
  const hash = item.infoHash.toLowerCase();
  return {
    infoHash: hash,
    post: { id: item.id, name: item.name },
    name: item.name,
    verifile: 'verified',
    status: 'done',
    result: {
      file: overrides.file === undefined ? `${item.name}.mkv` : overrides.file,
      size: overrides.size === undefined ? item.size : overrides.size,
      duration: 120,
      video: { codec: 'h264', hdr: '', bitrate: 1000000 },
      audio: overrides.audio === undefined ? [audioTrack('por'), audioTrack('eng')] : overrides.audio,
      subtitles: overrides.subtitles === undefined ? [] : overrides.subtitles,
    },
    ...overrides.top,
  };
}

function isHttpResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => ['status', 'body', 'bytes', 'rawBody'].includes(key));
}

function respond(value) {
  if (value === undefined) return { status: 404, body: { error: 'não encontrado' } };
  if (value instanceof Error) throw value;
  if (typeof value === 'function') return value();
  if (isHttpResponse(value)) return value;
  return { body: value };
}

function makeRoute(config = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') return respond(config.tmdb);
    if (url.hostname === 'therarbg.com' && url.pathname.startsWith('/api/v1/title/')) {
      return respond(config.title);
    }
    if (url.hostname === 'therarbg.com' && url.pathname.startsWith('/api/v1/verifile/')) {
      const hash = url.pathname.split('/')[4];
      return respond((config.verifiles || {})[hash]);
    }
    if (url.hostname === 'itorrents.org') {
      const hash = path.basename(url.pathname, '.torrent').toLowerCase();
      const bytes = (config.torrents || {})[hash];
      if (bytes === undefined) return { status: 404, body: '' };
      return { bytes: typeof bytes === 'function' ? await bytes() : bytes };
    }
    throw new Error(`rota inesperada: ${url}`);
  };
}

function runtime(route, bundle = codes.gdrive, options = {}) {
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const context = {
    module: { exports: {} },
    URL,
    URLSearchParams,
    Uint8Array,
    ArrayBuffer,
    DataView,
    console: {
      log: (message) => logs.log.push(String(message)),
      warn: (message) => logs.warn.push(String(message)),
      error: (message) => logs.error.push(String(message)),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const result = await route(new URL(url), init || {});
      if (result instanceof Error) throw result;
      const status = result.status === undefined ? 200 : result.status;
      const text = result.rawBody !== undefined
        ? result.rawBody
        : typeof result.body === 'string'
          ? result.body
          : JSON.stringify(result.body === undefined ? {} : result.body);
      const response = {
        ok: status >= 200 && status < 300,
        status,
        url: String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
      if (result.bytes) {
        response.arrayBuffer = async () => {
          const bytes = result.bytes;
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        };
      }
      return response;
    },
  };
  if (!options.withoutKey) context.TMDB_API_KEY = 'chave-de-teste';
  vm.runInNewContext(bundle, context, { filename: 'therarbg.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function callsTo(runner, host, prefix) {
  return runner.calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === host && (!prefix || url.pathname.startsWith(prefix));
  });
}

function movieConfig(items, payloads, overrides = {}) {
  const title = movieTitle();
  title.torrents = items;
  return {
    tmdb: overrides.tmdb === undefined ? moviePayload() : overrides.tmdb,
    title: overrides.title === undefined ? title : overrides.title,
    verifiles: payloads || {},
    torrents: overrides.torrents || {},
  };
}

function seriesConfig(items, payloads, overrides = {}) {
  const title = seriesTitle();
  title.torrents = items;
  return {
    tmdb: overrides.tmdb === undefined ? seriesPayload() : overrides.tmdb,
    title: overrides.title === undefined ? title : overrides.title,
    verifiles: payloads || {},
    torrents: overrides.torrents || {},
  };
}

test('1.1 entrada inválida não acessa a rede e o carregamento não faz requisições', async () => {
  const runner = runtime(() => {
    throw new Error('fetch não deve ser chamado');
  });
  const cases = [
    ['abc', 'movie', null, null],
    ['0', 'movie', null, null],
    ['-1', 'movie', null, null],
    ['1', 'anime', null, null],
    ['1', 'tv', null, 1],
    ['1', 'tv', 0, 1],
    ['1', 'tv', 1, null],
    ['1', 'tv', 1, 0],
  ];
  for (const args of cases) assert.deepEqual(await runner.getStreams(...args), []);
  assert.equal(runner.calls.length, 0);
  assert.equal(runner.logs.error.length, cases.length);
  assert.ok(runner.logs.error.every((message) => message.startsWith('[TheRARBG]')));
});

test('1.2 IMDb ausente encerra como triagem sem consultar a obra', async () => {
  const route = makeRoute({
    tmdb: moviePayload({ external_ids: { imdb_id: null } }),
    title: () => {
      throw new Error('a obra não deve ser consultada');
    },
  });
  const runner = runtime(route);
  assert.deepEqual(await runner.getStreams('1263337', 'movie', null, null), []);
  assert.equal(callsTo(runner, 'api.themoviedb.org').length, 1);
  assert.equal(callsTo(runner, 'therarbg.com').length, 0);
  assert.ok(runner.logs.log.some((message) => message.includes('sem IMDb')));
});

test('1.3 chave do TMDB ausente e falha do TMDB são registradas na fronteira', async () => {
  const withoutKey = runtime(() => {
    throw new Error('fetch não deve ser chamado');
  }, codes.gdrive, { withoutKey: true });
  assert.deepEqual(await withoutKey.getStreams('1263337', 'movie', null, null), []);
  assert.equal(withoutKey.calls.length, 0);
  assert.ok(withoutKey.logs.error.some((message) => message.includes('TMDB_API_KEY')));

  const failing = runtime(makeRoute({ tmdb: { status: 500, body: {} } }));
  assert.deepEqual(await failing.getStreams('1263337', 'movie', null, null), []);
  assert.equal(callsTo(failing, 'therarbg.com').length, 0);
  assert.ok(failing.logs.error.some((message) => message.includes('TMDB respondeu HTTP 500')));
});

test('1.4 identidade, tipo e lista da obra são conferidos antes do Verifile', async () => {
  const wrongImdb = movieTitle();
  wrongImdb.imdb = 'tt0000000';
  const wrongType = movieTitle();
  wrongType.type = 'tvSeries';
  const wrongTmdb = movieTitle();
  wrongTmdb.tmdb = 1;
  const noList = movieTitle();
  delete noList.torrents;
  const cases = [
    { title: wrongImdb, pattern: /IMDb/ },
    { title: wrongType, pattern: /tipo/ },
    { title: wrongTmdb, pattern: /TMDB/ },
    { title: noList, pattern: /torrents/ },
    { title: { status: 503, body: {} }, pattern: /HTTP 503/ },
    { title: { rawBody: '{invalido', body: null }, pattern: /JSON válido/ },
  ];
  for (const entry of cases) {
    const runner = runtime(makeRoute({ tmdb: moviePayload(), title: entry.title }));
    assert.deepEqual(await runner.getStreams('1263337', 'movie', null, null), []);
    assert.equal(callsTo(runner, 'therarbg.com', '/api/v1/verifile/').length, 0);
    assert.ok(runner.logs.error.some((message) => entry.pattern.test(message)), entry.pattern);
  }

  const empty = movieTitle();
  empty.torrents = [];
  const runner = runtime(makeRoute({ tmdb: moviePayload(), title: empty }));
  assert.deepEqual(await runner.getStreams('1263337', 'movie', null, null), []);
  assert.equal(callsTo(runner, 'therarbg.com', '/api/v1/verifile/').length, 0);
  assert.ok(runner.logs.log.some((message) => message.includes('sem torrents')));
});

test('1.5 IMDb divergente em item gera falha isolada e resumo agregado', async () => {
  const item = movieItem({ imdb: 'tt9999999' });
  const runner = runtime(makeRoute(movieConfig([item], {})));
  assert.deepEqual(await runner.getStreams('1263337', 'movie', null, null), []);
  assert.equal(callsTo(runner, 'therarbg.com', '/api/v1/verifile/').length, 0);
  assert.ok(runner.logs.warn.some((message) => message.includes('IMDb')));
  assert.ok(runner.logs.error.some((message) => message.includes('Todas as opções falharam')));
});

test('2.1 a consulta de série acrescenta temporada e episódio e aceita tvSeries', async () => {
  const item = seriesItem({ hash: HASH_A });
  const payload = verifilePayload(item, { file: 'Breaking.Bad.S05E14.1080p.POR.mkv' });
  const runner = runtime(makeRoute(seriesConfig([item], { [HASH_A]: payload })));
  const streams = await runner.getStreams('1396', 'tv', 5, 14);
  assert.equal(streams.length, 1);
  const titleCalls = callsTo(runner, 'therarbg.com', '/api/v1/title/');
  assert.equal(titleCalls.length, 1);
  const url = new URL(titleCalls[0].url);
  assert.equal(url.pathname, '/api/v1/title/tt0903747/');
  assert.equal(url.searchParams.get('season'), '5');
  assert.equal(url.searchParams.get('episode'), '14');

  const movie = runtime(makeRoute(movieConfig([movieItem()], { [HASH_A]: verifilePayload(movieItem()) })));
  assert.equal((await movie.getStreams('1263337', 'movie', null, null)).length, 1);
  assert.equal(new URL(callsTo(movie, 'therarbg.com', '/api/v1/title/')[0].url).search, '');
});

test('2.2 seleção local reconhece termos delimitados e ignora falsos positivos', async () => {
  const names = [
    'Filme.2026.MULTi.POR.1080p',
    'Filme [PT-BR] 2026',
    'Filme.PORTUGUÊS.720p',
    'Filme.pt_br.1080p',
    'Filme.pt.br.1080p',
    'Portrait.2026.1080p',
    'Import.2026.1080p',
    'Filme.BR-Rip.MULTi.DUAL.Subbed.Dubbed',
  ];
  const items = names.map((name, index) => movieItem({ id: `item-${index}`, name, hash: `${String(index + 1).repeat(40)}` }));
  const verifiles = Object.fromEntries(
    items.map((item) => [item.infoHash, verifilePayload(item, { audio: [audioTrack('por')] })]),
  );
  const runner = runtime(makeRoute(movieConfig(items, verifiles)));
  const streams = await runner.getStreams('1263337', 'movie', null, null);
  assert.equal(streams.length, 5);
  const requested = callsTo(runner, 'therarbg.com', '/api/v1/verifile/').map((call) => new URL(call.url).pathname.split('/')[4]);
  assert.deepEqual(requested.sort(), items.slice(0, 5).map((item) => item.infoHash).sort());
});

test('2.3 hash base32 é normalizado e hash divergente não gera stream', async () => {
  const item = movieItem({
    hash: BASE32_HASH,
    magnet: `magnet:?xt=urn:btih:${BASE32_HASH}&dn=Filme.POR`,
  });
  const payload = verifilePayload({ ...item, infoHash: BASE32_HEX, id: item.id });
  const runner = runtime(makeRoute(movieConfig([item], { [BASE32_HEX]: payload })));
  const streams = await runner.getStreams('1263337', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, BASE32_HEX);
  assert.ok(callsTo(runner, 'therarbg.com', '/api/v1/verifile/')[0].url.includes(BASE32_HEX));

  const divergent = movieItem({ infoHash: HASH_B });
  const failing = runtime(makeRoute(movieConfig([divergent], {})));
  assert.deepEqual(await failing.getStreams('1263337', 'movie', null, null), []);
  assert.ok(failing.logs.warn.some((message) => message.includes('diverge do magnet')));
  assert.equal(callsTo(failing, 'therarbg.com', '/api/v1/verifile/').length, 0);
});

test('2.4 orçamento, deduplicação, desempate e ausência de reposição', async () => {
  const items = Array.from({ length: 8 }, (_, index) =>
    movieItem({
      id: `item-${index}`,
      name: `Filme.2026.POR.${1080 + index}p`,
      hash: String(index + 1).repeat(40),
      seeders: 100 - index,
      qualityScore: 90 - index,
    }),
  );
  const verifiles = Object.fromEntries(items.map((item) => [item.infoHash, verifilePayload(item, { audio: [audioTrack('por')] })]));
  items.push(movieItem({ id: 'duplicado', name: 'Filme.2026.POR.2160p', hash: items[0].infoHash, seeders: 1 }));
  const runner = runtime(makeRoute(movieConfig(items, verifiles)));
  const streams = await runner.getStreams('1263337', 'movie', null, null);
  assert.equal(streams.length, 6);
  const requested = callsTo(runner, 'therarbg.com', '/api/v1/verifile/').map((call) => new URL(call.url).pathname.split('/')[4]);
  assert.equal(requested.length, 6);
  assert.deepEqual(requested, items.slice(0, 6).map((item) => item.infoHash));
  assert.equal(streams[0].seeders, 100);
});

test('2.5 contagens ausentes, seeders não positivos e Xl do magnet', async () => {
  const noSeeders = movieItem({ seeders: undefined });
  const noLeechers = movieItem({ leechers: undefined, hash: HASH_B, name: 'Filme.2026.POR.720p' });
  const runner = runtime(
    makeRoute(
      movieConfig([noSeeders, noLeechers], {
        [noLeechers.infoHash]: verifilePayload(noLeechers, { audio: [audioTrack('por')] }),
      }),
    ),
  );
  const streams = await runner.getStreams('1263337', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].peers, undefined);
  assert.equal(callsTo(runner, 'therarbg.com', '/api/v1/verifile/').length, 1);

  const item = movieItem({ hash: HASH_C, size: undefined, magnet: `${magnet(HASH_C, 'Filme.POR')}&xl=12345` });
  const payload = verifilePayload(item, { audio: [audioTrack('por')], size: 12345 });
  const withXl = runtime(makeRoute(movieConfig([item], { [HASH_C]: payload })));
  const [stream] = await withXl.getStreams('1263337', 'movie', null, null);
  assert.equal(stream.size, '12345 B');
  assert.ok(stream.url.includes('xl=12345'));
  assert.ok(!stream.url.includes('xl=12345&xl='));
});

test('3.1 Verifile lê apenas verificações existentes e trata estados sem repetir chamadas', async () => {
  const { inspectVerification } = await import('../src/therarbg/classify.js');
  const done = verifilePayload(movieItem(), { audio: [audioTrack('por')] });

  for (const [status, verifile] of [['queued', 'pending'], ['unknown', 'none'], ['failed', 'rejected']]) {
    const payload = clone(done);
    payload.status = status;
    payload.verifile = verifile;
    assert.match(inspectVerification(payload, HASH_A, '900001').triage, /não concluída/);
  }
  assert.equal(inspectVerification(done, HASH_A, '900001').result.file, 'Filme.2026.POR.1080p.mkv');
  assert.throws(() => inspectVerification(null, HASH_A, '900001'), /inválido/);
  assert.throws(() => inspectVerification({ ...done, infoHash: HASH_B }, HASH_A, '900001'), /hash/);
  assert.throws(() => inspectVerification({ ...done, post: { id: 'outro' } }, HASH_A, '900001'), /post/);
  const withoutResult = clone(done);
  delete withoutResult.result;
  assert.throws(() => inspectVerification(withoutResult, HASH_A, '900001'), /result/);
  const withoutAudio = clone(done);
  delete withoutAudio.result.audio;
  assert.throws(() => inspectVerification(withoutAudio, HASH_A, '900001'), /audio/);

  const runner = runtime(makeRoute(movieConfig([movieItem()], { [HASH_A]: done })));
  const streams = await runner.getStreams('1263337', 'movie', null, null);
  assert.equal(streams.length, 1);
  const calls = callsTo(runner, 'therarbg.com', '/api/v1/verifile/');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, undefined);
  assert.equal(calls[0].init.body, undefined);
  assert.equal(new URL(calls[0].url).pathname, `/api/v1/verifile/${HASH_A}/`);

  const pendingItem = movieItem({ verifile: 'pending' });
  const pending = runtime(makeRoute(movieConfig([pendingItem], {})));
  assert.deepEqual(await pending.getStreams('1263337', 'movie', null, null), []);
  assert.equal(callsTo(pending, 'therarbg.com', '/api/v1/verifile/').length, 0);
  assert.ok(pending.logs.log.some((message) => message.includes('verifile "pending"')));

  const notDone = verifilePayload(movieItem(), { audio: [audioTrack('por')] });
  notDone.status = 'queued';
  const queued = runtime(makeRoute(movieConfig([movieItem()], { [HASH_A]: notDone })));
  assert.deepEqual(await queued.getStreams('1263337', 'movie', null, null), []);
  assert.ok(queued.logs.log.some((message) => message.includes('não concluída')));
  assert.equal(queued.logs.error.length, 0);
});

test('3.2 HTTP 429 interrompe novas confirmações e falhas parciais ficam isoladas', async () => {
  const { confirmHashes } = await import('../src/therarbg/verifile.js');
  const hashes = Array.from({ length: 6 }, (_, index) => String(index + 1).repeat(40));
  const gates = [];
  let started = 0;
  let active = 0;
  let maxActive = 0;
  const resultsPromise = confirmHashes(hashes, {
    fetcher: (hash) => {
      started += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise((resolve, reject) => {
        gates.push({
          hash,
          resolve: (value) => {
            active -= 1;
            resolve(value);
          },
          reject: (error) => {
            active -= 1;
            reject(error);
          },
        });
      });
    },
  });
  assert.equal(started, 3);
  gates[1].reject(Object.assign(new Error('HTTP 429'), { status: 429, quotaExhausted: true }));
  gates[0].resolve({ ok: 0 });
  gates[2].resolve({ ok: 2 });
  const results = await resultsPromise;
  assert.equal(started, 3);
  assert.equal(maxActive, 3);
  assert.deepEqual(results.map((result) => result.skipped === true), [false, false, false, true, true, true]);
  assert.equal(results[0].data.ok, 0);
  assert.equal(results[1].error.quotaExhausted, true);
  assert.equal(results[2].data.ok, 2);

  const first = movieItem();
  const second = movieItem({ id: '900002', hash: HASH_B, name: 'Filme.2026.POR.720p', resolution: '720p' });
  const partial = runtime(
    makeRoute(
      movieConfig([first, second], {
        [HASH_A]: verifilePayload(first, { audio: [audioTrack('por')] }),
        [HASH_B]: { status: 429, body: {} },
      }),
    ),
  );
  const streams = await partial.getStreams('1263337', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, HASH_A);
  assert.ok(partial.logs.warn.some((message) => message.includes('429')));
  assert.equal(partial.logs.error.length, 0);

  const failing = runtime(
    makeRoute(
      movieConfig([first, second], {
        [HASH_A]: { status: 500, body: {} },
        [HASH_B]: { status: 500, body: {} },
      }),
    ),
  );
  assert.deepEqual(await failing.getStreams('1263337', 'movie', null, null), []);
  assert.ok(failing.logs.error.some((message) => message.includes('[TheRARBG]') && message.includes('Todas as opções falharam')));
});

test('3.3 áudio português sem região vira dialeto desconhecido e o áudio tem precedência', async () => {
  const { classifyTracks, PORTUGUESE_UNKNOWN } = await import('../src/therarbg/classify.js');
  const base = (audio, subtitles = []) => ({ file: 'Filme.2026.mkv', audio, subtitles });

  let classification = classifyTracks(base([audioTrack('por'), audioTrack('eng')]));
  assert.equal(classification.language, PORTUGUESE_UNKNOWN);
  assert.deepEqual(classification.formatLanguages, ['en']);
  assert.equal(classification.message, undefined);

  classification = classifyTracks(base([audioTrack('pob'), audioTrack('eng')]));
  assert.equal(classification.language, 'Dublado');
  assert.deepEqual(classification.formatLanguages, ['pt', 'en']);

  assert.equal(classifyTracks(base([audioTrack('pob')])).language, 'Dublado');
  assert.equal(
    classifyTracks(base([audioTrack('por', { title: 'Português (Brasil)' }), audioTrack('eng')])).language,
    'Dublado',
  );
  assert.equal(
    classifyTracks(base([audioTrack('por', { title: 'Português (Brasil)' })])).language,
    'Dublado',
  );
  assert.match(classifyTracks(base([audioTrack('por', { title: 'Português (Portugal)' })])).triage, /europeu/);
  assert.match(classifyTracks(base([audioTrack('pt-pt')])).triage, /europeu/);
  assert.throws(
    () => classifyTracks(base([audioTrack('por', { title: 'Português (Brasil) e Portugal' })])),
    /Brasil e Portugal/,
  );

  classification = classifyTracks(base(
    [audioTrack('por'), audioTrack('eng')],
    [subtitleTrack('por', { title: 'Brazilian' })],
  ));
  assert.equal(classification.language, PORTUGUESE_UNKNOWN);
  assert.match(classification.message, /Português \(Brasil\)/);

  const brazilianName = movieItem({ name: 'Filme.2026.PT-BR.Dublado.1080p' });
  const generic = verifilePayload(brazilianName, {
    audio: [audioTrack('por'), audioTrack('eng')],
    subtitles: [subtitleTrack('por', { title: 'Brazilian' })],
  });
  const brazilianRunner = runtime(makeRoute(movieConfig([brazilianName], { [HASH_A]: generic })));
  const [unknownStream] = await brazilianRunner.getStreams('1263337', 'movie', null, null);
  assert.equal(unknownStream.language, PORTUGUESE_UNKNOWN);
  assert.ok(unknownStream.title.includes(PORTUGUESE_UNKNOWN));

  const foreignName = movieItem({ hash: HASH_B, id: '900002', name: 'Filme.2026.POR.Dublado.1080p' });
  const foreignTracks = verifilePayload(foreignName, {
    audio: [audioTrack('eng')],
    subtitles: [subtitleTrack('por', { title: 'Brazilian' })],
  });
  const foreignRunner = runtime(makeRoute(movieConfig([foreignName], { [HASH_B]: foreignTracks })));
  const [subtitled] = await foreignRunner.getStreams('1263337', 'movie', null, null);
  assert.equal(subtitled.language, 'Legendado');
});

test('3.4 legenda completa sustenta Legendado conforme a região e exige áudio estrangeiro', async () => {
  const { classifyTracks, SUBTITLED_UNKNOWN } = await import('../src/therarbg/classify.js');
  const base = (audio, subtitles) => ({ file: 'Filme.2026.mkv', audio, subtitles });
  const english = [audioTrack('eng')];

  assert.equal(
    classifyTracks(base(english, [subtitleTrack('por', { title: 'Brazilian' })])).language,
    'Legendado',
  );
  const unknown = classifyTracks(base(english, [subtitleTrack('por')]));
  assert.equal(unknown.language, SUBTITLED_UNKNOWN);
  assert.match(unknown.message, /dialeto desconhecido/);

  assert.match(classifyTracks(base(english, [subtitleTrack('por', { forced: true })])).triage, /completa/);
  const withoutForced = { lang: 'por', codec: 'subrip', title: null };
  assert.match(classifyTracks(base(english, [withoutForced])).triage, /completa/);
  assert.match(
    classifyTracks(base(english, [subtitleTrack('por', { title: 'Português (Portugal)' })])).triage,
    /europeia/,
  );

  for (const lang of [undefined, 'und']) {
    const und = audioTrack('und');
    if (lang === undefined) delete und.lang;
    assert.match(
      classifyTracks(base([und], [subtitleTrack('por', { title: 'Brazilian' })])).triage,
      /estrangeiro/,
    );
  }
  assert.match(
    classifyTracks(base([audioTrack('eng'), audioTrack('und')], [subtitleTrack('por', { title: 'Brazilian' })])).triage,
    /estrangeiro/,
  );
  assert.match(classifyTracks(base([], [subtitleTrack('por', { title: 'Brazilian' })])).triage, /estrangeiro/);
  assert.match(classifyTracks(base(english, [])).triage, /sem áudio português/);

  const item = movieItem();
  const payload = verifilePayload(item, { audio: [audioTrack('eng')], subtitles: [] });
  const tmdb = moviePayload({ original_language: 'pt', origin_country: ['BR'] });
  const runner = runtime(makeRoute(movieConfig([item], { [HASH_A]: payload }, { tmdb })));
  assert.deepEqual(await runner.getStreams('1263337', 'movie', null, null), []);
  assert.equal(runner.logs.error.length, 0);
});

test('3.5 legenda embutida é descrita sem virar stream.subtitles e SRT solto não conta', async () => {
  const { classifyTracks } = await import('../src/therarbg/classify.js');
  const url = 'https://subs.example/filme.pt-BR.srt';
  const external = classifyTracks({
    file: 'Filme.2026.mkv',
    audio: [audioTrack('eng')],
    subtitles: [subtitleTrack('por', { title: 'Brazilian', url, language: 'Português (Brasil)' })],
  });
  assert.equal(external.language, 'Legendado');
  assert.deepEqual(external.externalSubtitles, [{ url, language: 'Português (Brasil)' }]);
  assert.match(external.message, /Português \(Brasil\)/);

  const item = movieItem();
  const payload = verifilePayload(item, {
    audio: [audioTrack('por'), audioTrack('eng')],
    subtitles: [subtitleTrack('por', { title: 'Brazilian' })],
  });
  const embedded = runtime(makeRoute(movieConfig([item], { [HASH_A]: payload })));
  const [stream] = await embedded.getStreams('1263337', 'movie', null, null);
  assert.equal(stream.subtitles, undefined);
  assert.ok(stream.title.includes('Legendas embutidas: Português (Brasil)'));

  const pack = seriesItem({ name: 'Breaking.Bad.S05.2160p.POR' });
  const noPortuguese = verifilePayload(pack, {
    file: 'Breaking.Bad.S05E14.2160p.mkv',
    audio: [audioTrack('eng')],
    subtitles: [],
  });
  const srtOnly = seriesConfig([pack], { [HASH_A]: noPortuguese }, {
    torrents: { [HASH_A]: torrent(['Breaking.Bad.S05E14.pt-BR.srt'], [120000]) },
  });
  const onlySeparate = runtime(makeRoute(srtOnly));
  assert.deepEqual(await onlySeparate.getStreams('1396', 'tv', 5, 14), []);
  assert.equal(callsTo(onlySeparate, 'itorrents.org').length, 0);
  assert.ok(onlySeparate.logs.log.some((message) => message.includes('sem áudio português')));
});

test('3.6 streams preservam metadados e magnet nos três formatos, com ordenação e qualidade desconhecida', async () => {
  const { PORTUGUESE_UNKNOWN } = await import('../src/therarbg/classify.js');
  const main = movieItem({
    name: 'Filme.2026.POR.2160p.HDR.WEB-DL.x265-GRP',
    resolution: '2160p',
    source: 'WEB-DL',
    codec: 'x265',
    hdr: 'HDR10',
    releaseGroup: 'GRP',
    size: 2147483648,
    seeders: 42,
    leechers: 7,
  });
  const secondary = movieItem({
    id: '900002',
    hash: HASH_B,
    name: 'Filme.2026.POR.1080p',
    resolution: '1080p',
    seeders: 100,
    size: 1073741824,
  });
  const verifiles = {
    [HASH_A]: verifilePayload(main, {
      audio: [
        audioTrack('por'),
        audioTrack('eng', { profile: 'DTS', layout: '5.1', channels: 6 }),
      ],
      subtitles: [subtitleTrack('por', { title: 'Brazilian' })],
    }),
    [HASH_B]: verifilePayload(secondary, { audio: [audioTrack('por'), audioTrack('eng')] }),
  };
  const config = makeRoute(movieConfig([main, secondary], verifiles));

  for (const [label, bundle] of [['gdrive', codes.gdrive], ['prism', codes.prism], ['base', codes.base]]) {
    const runner = runtime(config, bundle);
    const streams = await runner.getStreams('1263337', 'movie', null, null);
    assert.deepEqual(streams.map((stream) => stream.quality), ['4K', '1080p'], label);
    const [stream] = streams;
    assert.equal(stream.size, '2.00 GB');
    assert.equal(stream.language, PORTUGUESE_UNKNOWN);
    assert.equal(stream.seeders, 42);
    assert.equal(stream.peers, 7);
    assert.equal(stream.infoHash, HASH_A);
    assert.equal(stream.provider, 'TheRARBG');
    assert.equal(stream.type, 'magnet');
    assert.equal(stream.subtitles, undefined);
    assert.ok(stream.url.startsWith(`magnet:?xt=urn:btih:${HASH_A.toUpperCase()}`));
    assert.ok(stream.url.includes('dn=Filme.2026.POR.2160p.HDR.WEB-DL.x265-GRP'));
    assert.ok(stream.url.includes('tr='));
    assert.ok(stream.url.endsWith('&xl=2147483648'));
    assert.ok(!stream.name.includes('🇧🇷'));
    assert.ok(!stream.title.includes('🇧🇷'));
    assert.ok(stream.name.includes('TheRARBG'));
    assert.ok(stream.title.includes(PORTUGUESE_UNKNOWN));
    assert.ok(stream.title.includes('HDR10'));
    assert.ok(stream.title.includes('WEB-DL'));
    assert.ok(stream.title.includes('x265'));
    assert.ok(stream.title.includes('GRP'));
    assert.ok(stream.title.includes('DTS'));
    assert.ok(stream.title.includes('5.1'));
    assert.ok(stream.title.includes('2m:0s'));
    assert.ok(stream.title.includes('1.0 Mbps'));
    assert.ok(stream.title.includes('Legendas embutidas: Português (Brasil)'));
  }

  const unknownItem = movieItem({ hash: HASH_C, id: '900003', name: 'Filme.2026.POR', resolution: undefined });
  const unknownPayload = verifilePayload(unknownItem, { audio: [audioTrack('por')] });
  const unknownRunner = runtime(makeRoute(movieConfig([unknownItem], { [HASH_C]: unknownPayload })));
  const [unknown] = await unknownRunner.getStreams('1263337', 'movie', null, null);
  assert.equal(unknown.quality, 'Desconhecida');
  assert.ok(unknown.name.includes('Desconhecida'));
});

test('3.0 fixtures da sondagem preservam as faixas reais sem rede', async () => {
  const { classifyTracks, inspectVerification, PORTUGUESE_UNKNOWN } = await import('../src/therarbg/classify.js');
  const movie = inspectVerification(movieVerifile(), '6ff479e8c37929b883268c6849a56e0caecec8c8', 942153);
  const movieClassification = classifyTracks(movie.result);
  assert.equal(movieClassification.language, PORTUGUESE_UNKNOWN);
  assert.deepEqual(movieClassification.formatLanguages, ['en', 'es']);
  assert.match(movieClassification.message, /Legendas embutidas: Português \(dialeto desconhecido\)/);
  assert.equal(movie.result.audio.length, 3);

  const pack = inspectVerification(seriesVerifile(), '4def9e7e8c5729738d0d24f2af5ce856db5d37d2', '95cd74');
  assert.equal(classifyTracks(pack.result).language, PORTUGUESE_UNKNOWN);
  const single = inspectVerification(singleVerifile(), 'c14c14c14c14c14c14c14c14c14c14c14c14c14c', '960014');
  assert.equal(classifyTracks(single.result).language, PORTUGUESE_UNKNOWN);
});

test('4.1 episódio avulso exato vira magnet e pacote não substitui o episódio', async () => {
  const pack = seriesItem({ id: '95cd74', name: 'Breaking.Bad.S05.2160p.POR' });
  const single = seriesItem({
    id: '960014',
    name: 'Breaking.Bad.S05E14.1080p.WEB-DL.POR',
    hash: HASH_B,
    seeders: 120,
  });
  const wrong13 = seriesItem({
    id: '960013',
    name: 'Breaking.Bad.S05E13.1080p.WEB-DL.POR',
    hash: HASH_C,
    seeders: 300,
  });
  const wrong12 = seriesItem({
    id: '960012',
    name: 'Breaking.Bad.S05E12.1080p.WEB-DL.POR',
    hash: HASH_D,
    seeders: 80,
  });
  const verifiles = {
    [HASH_A]: verifilePayload(pack, {
      file: 'Breaking.Bad.S05E14.2160p.mkv',
      audio: [audioTrack('por'), audioTrack('eng')],
      subtitles: [],
    }),
    [HASH_B]: verifilePayload(single, {
      file: 'Breaking.Bad.S05E14.1080p.WEB-DL.POR.mkv',
      audio: [audioTrack('por'), audioTrack('eng')],
      subtitles: [],
    }),
  };
  const runner = runtime(makeRoute(seriesConfig([pack, single, wrong13, wrong12], verifiles)));
  const streams = await runner.getStreams('1396', 'tv', 5, 14);
  assert.equal(streams.length, 1);
  assert.ok(streams[0].url.startsWith(`magnet:?xt=urn:btih:${HASH_B.toUpperCase()}`));
  assert.equal(callsTo(runner, 'therarbg.com', '/api/v1/verifile/').length, 2);
  assert.ok(runner.logs.warn.some((message) => message.includes('HTTP 404')));
  assert.ok(!streams.some((stream) => stream.url.includes(HASH_A)));

  const wrongFile = seriesItem({ name: 'Breaking.Bad.S05E14.1080p.POR' });
  const wrongPayload = verifilePayload(wrongFile, {
    file: 'Breaking.Bad.S05E13.1080p.mkv',
    audio: [audioTrack('por'), audioTrack('eng')],
    subtitles: [],
  });
  const conflicting = runtime(makeRoute(seriesConfig([wrongFile], { [HASH_A]: wrongPayload })));
  assert.deepEqual(await conflicting.getStreams('1396', 'tv', 5, 14), []);
  assert.ok(conflicting.logs.log.some((message) => message.includes('não contém o episódio 14')));

  const noCoordinates = seriesItem({ name: 'Breaking.Bad.S05E14.1080p.POR' });
  const noCoordinatesPayload = verifilePayload(noCoordinates, {
    file: 'Breaking.Bad.episodio.mkv',
    audio: [audioTrack('por')],
    subtitles: [],
  });
  const ambiguous = runtime(makeRoute(seriesConfig([noCoordinates], { [HASH_A]: noCoordinatesPayload })));
  assert.deepEqual(await ambiguous.getStreams('1396', 'tv', 5, 14), []);
  assert.ok(ambiguous.logs.log.some((message) => message.includes('sem coordenadas do episódio')));
});

test('4.2 pacote resolve o arquivo do episódio com uma leitura por hash e sem paralelismo', async () => {
  const { PORTUGUESE_UNKNOWN } = await import('../src/therarbg/classify.js');
  const packA = seriesItem({ name: 'Breaking.Bad.S05.2160p.POR' });
  const packB = seriesItem({ id: '910002', name: 'Breaking.Bad.S05.1080p.POR', hash: HASH_B, seeders: 10 });
  const fileA = 'Breaking.Bad.S05E14.2160p.mkv';
  const fileB = 'Breaking.Bad.S05E14.1080p.mkv';
  const verifiles = {
    [HASH_A]: verifilePayload(packA, {
      file: fileA,
      audio: [audioTrack('por'), audioTrack('eng')],
      subtitles: [subtitleTrack('por', { title: 'Brazilian' })],
    }),
    [HASH_B]: verifilePayload(packB, {
      file: fileB,
      audio: [audioTrack('por'), audioTrack('eng')],
      subtitles: [],
    }),
  };
  let active = 0;
  let maxActive = 0;
  const delayed = (paths, lengths) => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return torrent(paths, lengths);
  };
  const torrents = {
    [HASH_A]: delayed(
      ['Breaking.Bad.S05E13.2160p.mkv', fileA, 'Breaking.Bad.S05E15.2160p.mkv'],
      [100, FILE_BYTES, 300],
    ),
    [HASH_B]: delayed(
      ['Breaking.Bad.S05E13.1080p.mkv', fileB],
      [100, 1073741824],
    ),
  };
  const runner = runtime(makeRoute(seriesConfig([packA, packB], verifiles, { torrents })));
  const streams = await runner.getStreams('1396', 'tv', 5, 14);
  assert.equal(streams.length, 2);
  assert.equal(maxActive, 1);
  assert.equal(callsTo(runner, 'itorrents.org').length, 2);
  const byHash = Object.fromEntries(streams.map((stream) => [stream.infoHash, stream]));
  assert.equal(byHash[HASH_A].url, `torrent://${HASH_A}/1`);
  assert.equal(byHash[HASH_B].url, `torrent://${HASH_B}/1`);
  assert.equal(byHash[HASH_A].size, '2.00 GB');
  assert.ok(byHash[HASH_A].title.includes('2.00 GB / 2.14 GB'));
  assert.ok(byHash[HASH_A].name.includes('pacote 2.14 GB'));
  assert.ok(byHash[HASH_A].title.includes('Breaking.Bad.S05E14.2160p.mkv'));
  assert.equal(byHash[HASH_A].language, PORTUGUESE_UNKNOWN);

  const missingFiles = runtime(makeRoute(seriesConfig([packA], { [HASH_A]: verifiles[HASH_A] })));
  assert.deepEqual(await missingFiles.getStreams('1396', 'tv', 5, 14), []);
  assert.ok(missingFiles.logs.warn.some((message) => message.includes('HTTP 404')));
  assert.ok(missingFiles.logs.error.some((message) => message.includes('Todas as opções falharam')));
});

test('4.3 result.file precisa corresponder ao arquivo do episódio selecionado', async () => {
  const pack = seriesItem({ name: 'Breaking.Bad.S05.2160p.POR' });
  const payload = verifilePayload(pack, {
    file: 'Breaking.Bad.S05E14.2160p.mkv',
    audio: [audioTrack('por'), audioTrack('eng')],
    subtitles: [],
  });
  const paths = ['Breaking.Bad.S05E13.2160p.mkv', 'Breaking.Bad.S05E14.2160p.mkv'];
  const lengths = [100, FILE_BYTES];

  const wrongEpisode = clone(payload);
  wrongEpisode.result.file = 'Breaking.Bad.S05E13.2160p.mkv';
  const wrongRunner = runtime(makeRoute(seriesConfig([pack], { [HASH_A]: wrongEpisode }, {
    torrents: { [HASH_A]: torrent(paths, lengths) },
  })));
  assert.deepEqual(await wrongRunner.getStreams('1396', 'tv', 5, 14), []);
  assert.equal(callsTo(wrongRunner, 'itorrents.org').length, 0);
  assert.ok(wrongRunner.logs.log.some((message) => message.includes('não contém o episódio 14')));

  const fullPath = clone(payload);
  fullPath.result.file = 'Breaking Bad S05/Breaking.Bad.S05E14.2160p.mkv';
  const fullRunner = runtime(makeRoute(seriesConfig([pack], { [HASH_A]: fullPath }, {
    torrents: {
      [HASH_A]: torrent(['Breaking Bad S05/Breaking.Bad.S05E13.2160p.mkv', 'Breaking Bad S05/Breaking.Bad.S05E14.2160p.mkv'], lengths),
    },
  })));
  const [matched] = await fullRunner.getStreams('1396', 'tv', 5, 14);
  assert.equal(matched.url, `torrent://${HASH_A}/1`);

  const wrongFolder = clone(payload);
  wrongFolder.result.file = 'Outra Pasta/Breaking.Bad.S05E14.2160p.mkv';
  const folderRunner = runtime(makeRoute(seriesConfig([pack], { [HASH_A]: wrongFolder }, {
    torrents: { [HASH_A]: torrent(paths, lengths) },
  })));
  assert.deepEqual(await folderRunner.getStreams('1396', 'tv', 5, 14), []);
  assert.ok(folderRunner.logs.log.some((message) => message.includes('não corresponde ao episódio selecionado')));

  const duplicated = clone(payload);
  duplicated.result.file = 'Breaking.Bad.S05E14.2160p.mkv';
  const duplicateRunner = runtime(makeRoute(seriesConfig([pack], { [HASH_A]: duplicated }, {
    torrents: {
      [HASH_A]: torrent([
        'Breaking.Bad.S05E14.2160p.mkv',
        'Sample/Breaking.Bad.S05E14.2160p.mkv',
      ], lengths),
    },
  })));
  assert.deepEqual(await duplicateRunner.getStreams('1396', 'tv', 5, 14), []);
  assert.ok(duplicateRunner.logs.log.some((message) => message.includes('não corresponde ao episódio selecionado')));
});
