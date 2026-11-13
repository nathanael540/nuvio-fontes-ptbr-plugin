const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'brflix');
const KEY = Buffer.from('4f9c2d1e8a7b6c5d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d', 'hex');
const IV = Buffer.from('000102030405060708090a0b', 'hex');

const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const codes = {};
let code;

test.before(async () => {
  const outDir = createTempDir('brflix-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('brflix', { outDir, formatter }), 'utf8');
    }
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function runtime(route = () => { throw new Error('fetch inesperado'); }, bundle = code) {
  const calls = [];
  const logs = [];
  const context = {
    module: { exports: {} },
    URL,
    URLSearchParams,
    require: (name) => {
      if (name === 'crypto-js') return require('crypto-js');
      throw new Error(`require inesperado: ${name}`);
    },
    console: {
      error: (message) => logs.push({ level: 'error', message: String(message) }),
      warn: (message) => logs.push({ level: 'warn', message: String(message) }),
      log: (message) => logs.push({ level: 'log', message: String(message) }),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const result = await route(new URL(url), init || {});
      if (result instanceof Error) throw result;
      const status = result.status || 200;
      const text = typeof result === 'string'
        ? result
        : result.body !== undefined
          ? (typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
          : result.text !== undefined ? result.text : JSON.stringify(result);
      return {
        ok: status >= 200 && status < 300,
        status,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return {
    context,
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

const messages = (app, level) => app.logs.filter((entry) => entry.level === level).map((entry) => entry.message);

function payloadOf(resolution, iv = IV) {
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(resolution), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

function envelope(resolution) {
  return { ok: resolution.ok, enc: true, payload: payloadOf(resolution) };
}

function encryptedText(text) {
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, IV);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { ok: true, enc: true, payload: `${IV.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}` };
}

function library(url) {
  if (url.pathname !== '/best-stream-resolve') throw new Error(`Requisição inesperada: ${url.href}`);
  const id = url.searchParams.get('tmdbId');
  if (id === '872585') return fixture('movie-hls-mp4.json');
  if (id === '1396') return fixture('series-hls-mp4.json');
  if (id === '999999999') return fixture('absent.json');
  if (id === '76341') return fixture('iframe-only.json');
  throw new Error(`Título inesperado: ${id}`);
}

function requestUrl(call) {
  return new URL(call.url);
}

test('carregamento CommonJS sem rede e entrada inválida não consulta a fonte', async () => {
  const app = runtime();
  assert.equal(typeof app.context.module.exports.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
  for (const [season, episode] of [[null, 1], [0, 1], [1, -1], ['2', 3], [2, 1.5]]) {
    assert.deepEqual(await app.getStreams('100', 'tv', season, episode), []);
  }
  assert.deepEqual(await app.getStreams('tt1', 'movie', null, null), []);
  assert.deepEqual(await app.getStreams('100', 'series', null, null), []);
  assert.equal(app.calls.length, 0);
  assert.equal(messages(app, 'error').length, 7);
  assert.ok(messages(app, 'error').every((log) => /^\[BRFlix\] Entrada:/.test(log)));
});

test('filme usa o agregado por TMDB, decifra o payload e devolve HLS e MP4', async () => {
  const app = runtime(library);
  const streams = await app.getStreams('872585', 'movie', null, null);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(messages(app, 'warn').length, 0, messages(app, 'warn').join('\n'));
  assert.equal(streams.length, 2);

  const hls = streams.find((stream) => stream.type === 'hls');
  const mp4 = streams.find((stream) => stream.type === 'mp4');
  assert.equal(hls.quality, '720p');
  assert.equal(hls.language, 'Dublado');
  assert.equal(hls.provider, 'BRFLIX Alternativo');
  assert.match(hls.url, /^https:\/\/brflix\.lat\/embedplayer-proxy\//);
  assert.equal(hls.name, 'BRFlix 720p\n🗣️ Dublado\n🌐 HTTP 🔍 BRFLIX Alternativo');
  assert.equal(hls.title, '🗣️ Dublado\n🌐 HTTP 🔍 BRFLIX Alternativo');
  assert.equal(mp4.quality, '720p');
  assert.equal(mp4.language, 'Dublado');
  assert.equal(mp4.provider, 'BRFLIX Oficial');
  assert.match(mp4.url, /^https:\/\/brflix\.lat\/dynamic-proxy\//);
  assert.deepEqual(hls.headers, {
    'User-Agent': hls.headers['User-Agent'],
    Referer: 'https://brflix.lat/',
    Origin: 'https://brflix.lat',
  });
  assert.match(hls.headers['User-Agent'], /Mozilla/);

  assert.equal(app.calls.length, 1);
  const url = requestUrl(app.calls[0]);
  assert.equal(`${url.origin}${url.pathname}`, 'https://brflix.lat/best-stream-resolve');
  assert.equal(url.searchParams.get('mediaType'), 'movie');
  assert.equal(url.searchParams.get('tmdbId'), '872585');
  assert.equal(url.searchParams.get('dubbed'), '1');
  assert.equal(url.searchParams.get('hq'), '0');
  assert.equal(url.searchParams.has('season'), false);
  assert.equal(url.searchParams.has('episode'), false);
  assert.equal(app.calls[0].init.headers['X-Brflix-Enc'], '1');
  assert.equal(app.calls[0].init.headers.Referer, 'https://brflix.lat/');
});

test('série envia temporada e episódio e devolve os dois formatos', async () => {
  const app = runtime(library);
  const streams = await app.getStreams('1396', 'tv', 1, 1);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(messages(app, 'warn').length, 0, messages(app, 'warn').join('\n'));
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map((stream) => stream.type).sort(), ['hls', 'mp4']);
  assert.ok(streams.every((stream) => stream.quality === '720p' && stream.language === 'Dublado'));

  const url = requestUrl(app.calls[0]);
  assert.equal(url.searchParams.get('mediaType'), 'tv');
  assert.equal(url.searchParams.get('tmdbId'), '1396');
  assert.equal(url.searchParams.get('season'), '1');
  assert.equal(url.searchParams.get('episode'), '1');
  assert.equal(url.searchParams.get('dubbed'), '1');
  assert.equal(url.searchParams.get('hq'), '0');
});

test('ausência reconhecida e candidato only-iframe devolvem lista vazia sem log', async () => {
  const absent = runtime(library);
  assert.deepEqual(await absent.getStreams('999999999', 'movie', null, null), []);
  assert.equal(absent.logs.length, 0);
  assert.equal(absent.calls.length, 1);

  const iframe = runtime(library);
  assert.deepEqual(await iframe.getStreams('76341', 'movie', null, null), []);
  assert.equal(iframe.logs.length, 0);
  assert.equal(iframe.calls.length, 1);
});

test('resposta sem cifra é aceita diretamente', async () => {
  const app = runtime(() => fixture('plain.json'));
  const streams = await app.getStreams('1', 'movie', null, null);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map((stream) => stream.url), [
    'https://cdn.example/brflix/movie/alternativo.mp4',
    'https://cdn.example/brflix/movie/master.m3u8',
  ]);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].type, 'mp4');
  assert.equal(streams[1].quality, '720p');
  assert.equal(streams[1].language, 'Dublado');
  assert.equal(streams[1].type, 'hls');
});

test('payload inválido, estrutura inválida e resultado sem ok sobem como erro', async () => {
  const cases = [
    [() => fixture('invalid-structure.json'), /sem candidatos nem URL/],
    [() => ({ ok: true, enc: true }), /Payload cifrado ausente/],
    [() => ({ ok: true, enc: true, payload: 'AAAA:AAAAAAAAAAAAAAAAAAAAAA==:AAAA' }), /IV do BRFlix com 3 bytes/],
    [() => ({ ok: true, enc: true, payload: '!!!!:!!!!:!!!!' }), /Base64 inválido em IV/],
    [() => encryptedText('isto não é JSON'), /não é JSON válido/],
    [() => envelope({ candidates: [] }), /sem campo ok/],
    [() => envelope({ ok: true, candidates: {} }), /Candidatos do BRFlix inválidos/],
  ];
  for (const [route, pattern] of cases) {
    const app = runtime(route);
    assert.deepEqual(await app.getStreams('1', 'movie', null, null), []);
    assert.match(messages(app, 'error')[0], pattern);
  }

  const absent = runtime(() => ({ ok: false, enc: false }));
  assert.deepEqual(await absent.getStreams('1', 'movie', null, null), []);
  assert.equal(absent.logs.length, 0);
});

test('payload sintético cobre URL relativa, HLS, MP4, idioma, qualidade e deduplicação', async () => {
  const resolution = {
    ok: true,
    url: 'https://cdn.example/brflix/topo.mp4',
    type: 'mp4',
    provider: 'BRFLIX Topo',
    dubbed: true,
    quality: 1080,
    candidates: [
      { provider: 'BRFLIX HLS', url: '/dynamic-proxy/hls/master.m3u8', type: 'hls', dubbed: true, quality: 720 },
      { provider: 'BRFLIX MP4', url: 'https://cdn.example/brflix/movie.mp4', type: 'mp4', dubbed: false, quality: 1080 },
      { provider: 'BRFLIX HLS', url: '/dynamic-proxy/hls/master.m3u8', type: 'hls', dubbed: true, quality: 720 },
    ],
  };
  const app = runtime(() => envelope(resolution));
  const streams = await app.getStreams('1', 'movie', null, null);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(messages(app, 'warn').length, 0);
  assert.equal(streams.length, 2);
  assert.equal(app.calls.length, 1);

  assert.deepEqual(streams.map((stream) => stream.url), [
    'https://cdn.example/brflix/movie.mp4',
    'https://brflix.lat/dynamic-proxy/hls/master.m3u8',
  ]);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].provider, 'BRFLIX MP4');
  assert.equal(streams[0].name, 'BRFlix 1080p\n🗣️ Legendado\n🌐 HTTP 🔍 BRFLIX MP4');
  assert.equal(streams[1].quality, '720p');
  assert.equal(streams[1].language, 'Dublado');
  assert.equal(streams[1].provider, 'BRFLIX HLS');
  assert.equal(streams[1].type, 'hls');
});

test('sem candidates, a URL de nível superior vira o único candidato', async () => {
  const cases = [
    { ok: true, url: '/topo.mp4', type: 'mp4', provider: 'BRFLIX Topo', dubbed: false, quality: 720 },
    { ok: true, url: '/topo-vazio.mp4', type: 'mp4', provider: 'BRFLIX Topo', dubbed: true, quality: 720, candidates: [] },
  ];
  for (const resolution of cases) {
    const app = runtime(() => envelope(resolution));
    const streams = await app.getStreams('1', 'movie', null, null);
    assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
    assert.equal(streams.length, 1);
    assert.equal(streams[0].url, `https://brflix.lat${resolution.url}`);
    assert.equal(streams[0].quality, '720p');
    assert.equal(streams[0].language, resolution.dubbed ? 'Dublado' : 'Legendado');
  }
});

test('qualidade fracionária é ignorada e campos ausentes não são inventados', async () => {
  const resolution = {
    ok: true,
    candidates: [
      { url: '/hls/master.m3u8', type: 'hls', quality: 1.1979 },
      { url: '/mp4/video.mp4', type: 'mp4', dubbed: true, quality: 720 },
    ],
  };
  const app = runtime(() => envelope(resolution));
  const streams = await app.getStreams('1', 'movie', null, null);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(app.calls.length, 1);
  assert.equal(streams.length, 2);
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[1].quality, 'Desconhecida');
  assert.equal(streams[1].language, 'Idioma Desconhecido');
  assert.ok(!('provider' in streams[1]));
  assert.equal(streams[1].name, 'BRFlix Desconhecida\n🗣️ Idioma Desconhecido\n🌐 HTTP');
});

test('candidato inválido é descartado com aviso e preserva o válido', async () => {
  const resolution = {
    ok: true,
    candidates: [
      { provider: 'Ruim', url: 'http://[inválido', type: 'hls' },
      { provider: 'Bom', url: '/ok.mp4', type: 'mp4', dubbed: false, quality: 720 },
    ],
  };
  const app = runtime(() => envelope(resolution));
  const streams = await app.getStreams('1', 'movie', null, null);
  assert.equal(messages(app, 'error').length, 0);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://brflix.lat/ok.mp4');
  assert.equal(streams[0].provider, 'Bom');
  assert.match(messages(app, 'warn')[0], /^\[BRFlix\] Opção Ruim descartada: Endereço de mídia inválido$/);
});

test('todos os candidatos inválidos sobem como erro agregado', async () => {
  const resolution = {
    ok: true,
    candidates: [
      { provider: 'A', url: 'http://[inválido', type: 'hls' },
      { provider: 'B', url: '', type: 'mp4' },
    ],
  };
  const app = runtime(() => envelope(resolution));
  assert.deepEqual(await app.getStreams('1', 'movie', null, null), []);
  assert.equal(messages(app, 'warn').length, 2);
  const error = messages(app, 'error')[0];
  assert.match(error, /^\[BRFlix\] Candidatos: Todas as opções falharam:/);
  assert.match(error, /A: Endereço de mídia inválido/);
  assert.match(error, /B: Endereço de mídia ausente/);
});

test('falha HTTP, falha de rede e JSON inválido preservam a falha até getStreams', async () => {
  const http = runtime(() => ({ status: 500, text: '' }));
  assert.deepEqual(await http.getStreams('1', 'movie', null, null), []);
  assert.match(messages(http, 'error')[0], /^\[BRFlix\] Consulta: HTTP 500/);

  const network = runtime(() => new Error('rede indisponível'));
  assert.deepEqual(await network.getStreams('1', 'movie', null, null), []);
  assert.match(messages(network, 'error')[0], /^\[BRFlix\] Consulta: rede indisponível$/);

  const invalid = runtime(() => '{');
  assert.deepEqual(await invalid.getStreams('1', 'movie', null, null), []);
  assert.match(messages(invalid, 'error')[0], /Resposta não é JSON válido/);
});

test('duas chamadas consultam a fonte de novo e recebem URLs distintas', async () => {
  let count = 0;
  const app = runtime(() => {
    count += 1;
    return envelope({
      ok: true,
      candidates: [{ provider: 'BRFLIX Teste', url: `https://cdn.example/brflix/${count}.mp4`, type: 'mp4', dubbed: true, quality: 720 }],
    });
  });
  const first = await app.getStreams('1', 'movie', null, null);
  const second = await app.getStreams('1', 'movie', null, null);
  assert.equal(app.calls.length, 2);
  assert.equal(first[0].url, 'https://cdn.example/brflix/1.mp4');
  assert.equal(second[0].url, 'https://cdn.example/brflix/2.mp4');
  assert.equal(messages(app, 'error').length, 0);
});

test('formatador Prism usa o mesmo contrato e a variante gdrive permanece válida', async () => {
  const app = runtime(() => fixture('plain.json'), codes.prism);
  const streams = await app.getStreams('1', 'movie', null, null);
  assert.equal(streams[0].name, '🚀 FHD 1080p\n🗣️ Legendado\n🌐 HTTP\n📡 BRFLIX Alternativo');
  assert.equal(streams[0].title, '🗣️ Legendado\n🌐 HTTP\n📡 BRFLIX Alternativo\n🔍BRFlix');
  assert.equal(streams[1].name, '💿 HD 720p\n🗣️ Dublado\n🌐 HTTP\n📡 BRFLIX Exemplo');
  assert.equal(streams[1].title, '🗣️ Dublado\n🌐 HTTP\n📡 BRFLIX Exemplo\n🔍BRFlix');
});
