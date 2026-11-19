const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');
const { slugify } = require('../src/_blocks/slugify/index.mjs');

const HASH = '9b3ab9f099e430bd155e8da9ddd59419f3b97fdb';
const PACK = 'a91b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d';
const EP7 = 'e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7';
const LANGUAGE_MODES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];
const FILE_BYTES = 1610612736;

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('baixetorrent-org-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('baixetorrent-org', { outDir, formatter }), 'utf8');
    }
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/baixetorrent-org', name), 'utf8');
}

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
      files: paths.map((file, index) => ({ length: lengths[index], path: [file] })),
    },
  });
}

const PACK_TORRENT = torrent(
  ['leia-me.txt', 'S05E01 - Arcanjo Renegado.mkv', 'S05E02 - Arcanjo Renegado.mkv'],
  [100, FILE_BYTES, 2000],
);

function moviePayload() {
  return {
    title: 'Tigre de Papel',
    original_title: 'Paper Tiger',
    release_date: '2026-11-07',
    external_ids: {},
    alternative_titles: { titles: [] },
    original_language: 'en',
    genres: [],
    origin_country: ['BR'],
  };
}

function seriesPayload() {
  return {
    name: 'Arcanjo Renegado',
    original_name: 'Arcanjo Renegado',
    first_air_date: '2026-04-01',
    external_ids: {},
    alternative_titles: { results: [] },
    original_language: 'en',
    genres: [],
    origin_country: ['BR'],
  };
}

function post(id, title, html) {
  return { id, link: `https://www.baixetorrent.org/${id}/`, title: { rendered: title }, content: { rendered: html } };
}

function runtime(route, bundle = code) {
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const context = {
    module: { exports: {} },
    TMDB_API_KEY: 'chave-de-teste',
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
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init || {});
      if (result instanceof Error) throw result;
      const status = result.status || 200;
      const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
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
  vm.runInNewContext(bundle, context, { filename: 'baixetorrent-org.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function serve({ movie, series, bySearch = {}, torrents = {}, fail }) {
  return (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (url.pathname.includes('/movie/')) return { body: movie };
      if (url.pathname.includes('/tv/')) return { body: series };
      throw new Error(`TMDB inesperado: ${url.pathname}`);
    }
    if (url.hostname === 'itorrents.org') {
      const name = url.pathname.split('/').pop();
      if (!torrents[name]) return { status: 404, body: 'ausente' };
      return { bytes: torrents[name], body: '' };
    }
    if (url.hostname !== 'www.baixetorrent.org' || url.pathname !== '/wp-json/wp/v2/posts') {
      throw new Error(`URL inesperada: ${url.href}`);
    }
    if (fail) {
      const failed = fail(url.hostname, url.searchParams.get('search'));
      if (failed) return failed;
    }
    const search = url.searchParams.get('search');
    if (!Object.prototype.hasOwnProperty.call(bySearch, search)) {
      throw new Error(`busca inesperada em ${url.hostname}: ${search}`);
    }
    return { body: bySearch[search] };
  };
}

const moviePost = () => post(12286, 'Tigre de Papel (2026)', fixture('movie.html'));
const episodePost = () => post(28002, 'Arcanjo Renegado 5ª Temporada (2026)',
  `<p><a href="magnet:?xt=urn:btih:${EP7}&amp;dn=Arcanjo%20Renegado%20S05E07">S05E07 1080p</a></p>`);
const packPost = () => post(27585, 'Arcanjo Renegado 5ª Temporada (2026)',
  `<p>Arcanjo Renegado 5ª Temporada BluRay 2160p</p><p><a href="magnet:?xt=urn:btih:${PACK}&amp;dn=Arcanjo%20Renegado%20S05">2160p</a></p>`);

test('filme: magnets do catálogo são streams formatados', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { 'tigre de papel': [moviePost()] },
  }));
  const streams = await app.getStreams('12345', 'movie', null, null);
  assert.equal(app.logs.error.length, 0, app.logs.error.join('\n'));
  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.ok(stream.url.startsWith(`magnet:?xt=urn:btih:${HASH}`), stream.url);
  assert.equal(stream.infoHash, HASH);
  assert.equal(stream.type, 'magnet');
  assert.equal(stream.provider, 'Baixe Torrents');
  assert.equal(stream.quality, 'CAM');
  assert.equal(stream.size, '3.13 GB');
  assert.ok(LANGUAGE_MODES.includes(stream.language));
  assert.match(stream.name, /Baixe Torrents/);
  assert.match(stream.title, /Baixe Torrents/);
  assert.equal(app.calls.some((call) => call.url.includes('itorrents.org')), false);
});

test('episódio avulso: magnets do post viram streams magnet', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { [`${slugify(seriesPayload().name, { separator: ' ' })} 5 temporada`]: [episodePost()] },
  }));
  const streams = await app.getStreams('27585', 'tv', 5, 7);
  assert.equal(app.logs.error.length, 0, app.logs.error.join('\n'));
  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.ok(stream.url.startsWith('magnet:?xt=urn:btih:'), stream.url);
  assert.equal(stream.infoHash, EP7);
  assert.equal(stream.type, 'magnet');
  assert.equal(stream.provider, 'Baixe Torrents');
  assert.equal(app.calls.some((call) => call.url.includes('itorrents.org')), false);
});

test('pacote da temporada: magnets viram torrent:// com índice do episódio', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { [`${slugify(seriesPayload().name, { separator: ' ' })} 5 temporada`]: [packPost()] },
    torrents: { [`${PACK.toUpperCase()}.torrent`]: PACK_TORRENT },
  }));
  const streams = await app.getStreams('27585', 'tv', 5, 1);
  assert.equal(app.logs.error.length, 0, app.logs.error.join('\n'));
  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.equal(stream.url, `torrent://${PACK}/1`);
  assert.equal(stream.infoHash, PACK);
  assert.equal(stream.type, 'torrent');
  assert.deepEqual(
    app.calls.filter((call) => call.url.includes('itorrents.org')).map((call) => call.url),
    [`https://itorrents.org/torrent/${PACK.toUpperCase()}.torrent`],
  );
});

test('ausência: post sem magnet aceitável devolve lista vazia', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { 'tigre de papel': [], 'paper tiger': [] },
  }));
  assert.deepEqual(await app.getStreams('12345', 'movie', null, null), []);
  assert.equal(app.logs.error.length, 0);
});

test('carrega CommonJS sem rede e rejeita entrada inválida antes do fetch', async () => {
  const app = runtime(() => { throw new Error('fetch inesperado'); });
  assert.equal(typeof app.getStreams, 'function');
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(code, /Promise\.allSettled|AbortController|searchParams\.set|searchParams\.append/);
  for (const args of [
    ['tt1', 'movie', null, null],
    ['100', 'series', null, null],
    ['100', 'tv', null, 1],
    ['100', 'tv', 0, 1],
    ['100', 'tv', 1, -1],
    ['100', 'tv', '2', 3],
    ['100', 'tv', 2, 1.5],
  ]) {
    assert.deepEqual(await app.getStreams(...args), []);
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.logs.error.length, 7);
  assert.ok(app.logs.error.every((message) => message.startsWith('[BaixeTorrents] Entrada:')));
});
