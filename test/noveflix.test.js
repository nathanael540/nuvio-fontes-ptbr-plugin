const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'noveflix');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const searchAvenida = read('search-avenida.html');
const searchVale = read('search-vale.html');
const searchEmpty = read('search-empty.html');
const searchMalformed = read('search-malformed.html');
const show2012 = read('show-2012.html');
const show1988 = read('show-1988.html');
const show2025 = read('show-2025.html');
const showNoPost = read('show-no-post.html');
const ajaxEmbed = readJson('ajax-embed.json');
const ajaxEmpty = readJson('ajax-empty.json');
const ajaxInvalid = read('ajax-invalid.txt');
const embedPage = read('embed.html');
const gatePage = read('gate.html');
const gateNoIframe = read('gate-no-iframe.html');
const videoPage = read('video.html');
const videoRelative = read('video-relative.html');
const videoNoStream = read('video-no-stream.html');

const TV_ID = '45815';
const VALE_ID = '999001';
const ABSENT_ID = '999999';
const GATE_URL = 'https://esportesdavez.com/?aHR0cHM6Ly9uZmxpeHBhaW5lbC5jYy92aWRlby9BVkJSLTAwMQ==';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const TMDB_BY_ID = {
  [TV_ID]: tmdbTv({ title: 'Avenida Brasil', originalTitle: 'Avenida Brasil', year: 2012, alternativeTitles: ['Avenida Brasil'] }),
  [VALE_ID]: tmdbTv({ title: 'Vale Tudo', originalTitle: 'Vale Tudo', year: 1988, alternativeTitles: [] }),
  [ABSENT_ID]: tmdbTv({ title: 'Novela Inexistente', originalTitle: 'Missing Novel', year: 2020, alternativeTitles: [] }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('noveflix-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('noveflix', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('noveflix', { outDir, formatter: 'prism' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function makeRuntime(route = () => { throw new Error('fetch inesperado'); }, bundle = codes.gdrive) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    TMDB_API_KEY: 'chave-ficticia',
    require: (name) => {
      if (name === 'cheerio-without-node-native') return require('./support/basic-html.js');
      throw new Error(`require inesperado: ${name}`);
    },
    console: {
      error: (message) => errors.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      log: () => {},
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const result = await route(new AppURL(url), init || {});
      const text = typeof result === 'string'
        ? result
        : typeof result.body === 'string'
          ? result.body
          : JSON.stringify(result.body);
      const headers = result.headers || {};
      return {
        ok: result.status === undefined || result.status < 400,
        status: result.status || 200,
        url: result.url || String(url),
        headers: {
          get: (name) => {
            const wanted = String(name).toLowerCase();
            const found = Object.keys(headers).find((key) => key.toLowerCase() === wanted);
            return found === undefined ? null : headers[found];
          },
        },
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return { exports: context.module.exports, calls, errors, warnings };
}

function asResponse(value) {
  if (value === undefined) throw new Error('resposta indefinida');
  if (typeof value === 'string') return { body: value };
  if (value !== null && typeof value === 'object' && ('status' in value || 'body' in value)) return value;
  return { body: value };
}

function tmdbTv({ title, originalTitle, year, alternativeTitles }) {
  return {
    id: 1,
    name: title,
    original_name: originalTitle,
    first_air_date: `${year}-01-01`,
    genres: [{ id: 18 }],
    original_language: 'pt',
    origin_country: ['BR'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      results: alternativeTitles.map((entry) => ({ iso_3166_1: 'BR', title: entry, type: '' })),
    },
  };
}

function defaultTmdb(url) {
  const parts = url.pathname.split('/');
  const id = parts[3];
  const data = TMDB_BY_ID[id];
  if (!data) return { status: 404, body: { status_message: 'Not found' } };
  return parts[2] === 'tv' ? data : { status: 404, body: { status_message: 'Not found' } };
}

function makeRoute(options = {}) {
  return async (url, init) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname === 'noveflix.lol') {
      if (url.pathname === '/') {
        if (options.search) return asResponse(options.search(url.searchParams.get('s')));
        const term = (url.searchParams.get('s') || '').toLowerCase();
        if (term.includes('vale')) return asResponse(searchVale);
        if (term.includes('avenida')) return asResponse(searchAvenida);
        return asResponse(searchEmpty);
      }
      if (url.pathname === '/wp-admin/admin-ajax.php') {
        return asResponse(options.ajax === undefined ? ajaxEmbed : options.ajax(init));
      }
      if (url.pathname === '/assistir/avenida-brasil/') {
        return asResponse(options.show === undefined ? show2012 : options.show(url));
      }
      if (url.pathname === '/assistir/vale-tudo/') {
        return asResponse(options.show1988 === undefined ? show1988 : options.show1988);
      }
      if (url.pathname === '/assistir/vale-tudo-2025/') {
        return asResponse(options.show2025 === undefined ? show2025 : options.show2025);
      }
      return { status: 404, body: 'not found' };
    }
    if (url.hostname === 'novefx.biz') {
      return asResponse(options.embed === undefined ? embedPage : options.embed);
    }
    if (url.hostname === 'redirectnflix.com') {
      return asResponse({ status: 200, url: GATE_URL, body: options.gate === undefined ? gatePage : options.gate });
    }
    if (url.hostname === 'esportesdavez.com') {
      if (options.safelink) return asResponse(options.safelink(url));
      return asResponse({ status: 302, headers: { location: 'https://nflixpainel.cc/video/AVBR-001' } });
    }
    if (url.hostname === 'nflixpainel.cc') {
      if (url.pathname === '/stream.php') throw new Error('o provedor não deve baixar o MP4');
      if (url.pathname.startsWith('/video/')) {
        return asResponse({ status: 200, url: `https://nflixpainel.cc${url.pathname}`, body: options.video === undefined ? videoPage : options.video });
      }
      return { status: 404, body: 'not found' };
    }
    throw new Error(`Host inesperado: ${url.hostname}`);
  };
}

test('carrega o pacote sem rede e não usa APIs proibidas', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);
  assert.doesNotMatch(codes.gdrive, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
  assert.doesNotMatch(codes.prism, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
});

test('valida a entrada e recusa filme antes de qualquer requisição', async () => {
  const runtime = makeRuntime(makeRoute());
  const invalid = [
    ['abc', 'tv', 1, 1],
    ['0', 'tv', 1, 1],
    [-1, 'tv', 1, 1],
    [TV_ID, 'movie', null, null],
    [TV_ID, 'tv', null, 1],
    [TV_ID, 'tv', 1, 0],
    [TV_ID, 'tv', 1, 1.5],
  ];
  for (const args of invalid) assert.deepEqual(Array.from(await runtime.exports.getStreams(...args)), []);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
});

test('Avenida Brasil S01E01 percorre busca, ficha, Ajax, gate e stream.php', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors }));
  const [stream] = streams;
  assert.equal(stream.url, 'https://nflixpainel.cc/stream.php?slug=AVBR-001&e=1700000000&t=placeholder-token');
  assert.equal(stream.type, 'mp4');
  assert.equal(stream.provider, 'NoveFlix');
  assert.equal(stream.quality, 'Desconhecida');
  assert.equal(stream.language, 'Idioma Desconhecido');
  assert.equal(stream.headers, undefined);
  assert.match(stream.title, /Avenida Brasil/);
  assert.match(stream.title, /T01E01/);
  assert.ok(LANGUAGE_VALUES.includes(stream.language));
  assert.deepEqual(runtime.errors, []);

  const redirect = runtime.calls.find((call) => call.url.startsWith('https://redirectnflix.com/?'));
  assert.ok(redirect);
  const encoded = redirect.url.split('?')[1];
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), 'https://nflixpainel.cc/video/AVBR-001');
  assert.equal(runtime.calls.some((call) => call.url.includes('/stream.php')), false);

  const safelink = runtime.calls.find((call) => call.url.startsWith('https://esportesdavez.com'));
  assert.equal(safelink.init.redirect, 'manual');
  assert.equal(safelink.init.headers.Referer, GATE_URL);

  const video = runtime.calls.find((call) => call.url.includes('nflixpainel.cc/video/'));
  assert.equal(video.init.headers.Referer, 'https://esportesdavez.com/?safelink_redirect=placeholder-token');
});

test('capítulo 179 monta AVBR-179 no redirecionador', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 179);
  assert.equal(streams.length, 1);
  const redirect = runtime.calls.find((call) => call.url.startsWith('https://redirectnflix.com/?'));
  const encoded = redirect.url.split('?')[1];
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), 'https://nflixpainel.cc/video/AVBR-179');
});

test('Vale Tudo de 1988 rejeita a ficha de 2025 pelo ano', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(VALE_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors }));
  assert.match(streams[0].title, /1988/);
  assert.doesNotMatch(streams[0].title, /2025/);
  assert.equal(runtime.calls.some((call) => call.url.includes('/assistir/vale-tudo-2025/')), true);
  assert.equal(runtime.calls.some((call) => call.url.includes('/assistir/vale-tudo/')), true);
  assert.deepEqual(runtime.errors, []);
});

test('capítulo 180 acima do total devolve lista vazia sem tocar o gate', async () => {
  const runtime = makeRuntime(makeRoute());
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 180)), []);
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.calls.some((call) => call.url.startsWith('https://redirectnflix.com/')), false);
});

test('temporada diferente de 1 é ausência sem requisição', async () => {
  const runtime = makeRuntime(makeRoute());
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 2, 1)), []);
  assert.equal(runtime.calls.length, 0);
});

test('gate sem iframe é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ gate: gateNoIframe }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[NoveFlix\]/);
  assert.doesNotMatch(runtime.errors[0], /placeholder-token/);
});

test('safelink com 200 direto usa a URL final como página de vídeo', async () => {
  const runtime = makeRuntime(makeRoute({
    safelink: () => ({ status: 200, url: 'https://nflixpainel.cc/video/AVBR-001', body: '' }),
  }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1);
  const video = runtime.calls.find((call) => call.url.includes('nflixpainel.cc/video/'));
  assert.equal(video.init.headers.Referer, 'https://esportesdavez.com/?safelink_redirect=placeholder-token');
});

test('safelink 302 sem Location é erro', async () => {
  const runtime = makeRuntime(makeRoute({ safelink: () => ({ status: 302 }) }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Location/);
});

test('safelink 404 é erro da opção', async () => {
  const runtime = makeRuntime(makeRoute({ safelink: () => ({ status: 404, body: 'not found' }) }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /HTTP 404/);
});

test('stream.php relativo é resolvido contra a página de vídeo', async () => {
  const runtime = makeRuntime(makeRoute({ video: videoRelative }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://nflixpainel.cc/stream.php?slug=AVBR-001&e=1700000000&t=placeholder-token');
});

test('página de vídeo sem stream.php é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ video: videoNoStream }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /stream\.php/);
});

test('busca vazia devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchEmpty }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(ABSENT_ID, 'tv', 1, 1)), []);
  assert.deepEqual(runtime.errors, []);
});

test('busca malformada é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchMalformed }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[NoveFlix\]/);
});

test('busca fora do ar sobe para getStreams', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => ({ status: 503, body: 'down' }) }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /HTTP 503/);
});

test('ficha sem data-post é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ show: () => showNoPost }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /data-post/);
});

test('AJAX sem embed_url devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute({ ajax: () => ajaxEmpty }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.calls.some((call) => call.url.includes('novefx.biz')), false);
});

test('JSON inválido no AJAX é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ ajax: () => ajaxInvalid }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[NoveFlix\]/);
});
