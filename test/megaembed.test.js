const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const UQLOAD = 'https://strm1.uqload.vc/fiction/master.m3u8';
const INTERNAL = 'https://megaembed.com/includes/hls.php?url=v2fiction&file=master.m3u8&referer=fiction';
const DIRECT = 'https://streamtape.com/get_video?id=fictiondirect&expires=999&ip=203.0.113.11&token=fiction&stream=1';

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('megaembed-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('megaembed', { outDir, formatter }), 'utf8');
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
    URL, URLSearchParams, Uint8Array, DataView, ArrayBuffer,
    console: {
      error: (message) => logs.push({ level: 'error', message: String(message) }),
      warn: (message) => logs.push({ level: 'warn', message: String(message) }),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init);
      if (result instanceof Error) throw result;
      const status = result.status || 200;
      const text = typeof result === 'string' ? result : result.text ?? (typeof result.body === 'string' ? result.body : '');
      return {
        ok: status >= 200 && status < 300,
        status,
        url: result.url || String(url),
        text: async () => text,
        arrayBuffer: result.bytes ? async () => Uint8Array.from(result.bytes).buffer : undefined,
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return {
    context, calls, logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/megaembed', name), 'utf8');
const messages = (app, level) => app.logs.filter((entry) => entry.level === level).map((entry) => entry.message);

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value >>> 0);
  return bytes;
}
function box(type, payload) {
  return Buffer.concat([u32(8 + payload.length), Buffer.from(type, 'ascii'), payload]);
}
function tkhd(version, width, height) {
  const widthAt = version === 0 ? 76 : 88;
  const payload = Buffer.alloc(widthAt + 8);
  payload[0] = version;
  payload.writeUInt32BE(width * 65536, widthAt);
  payload.writeUInt32BE(height * 65536, widthAt + 4);
  return box('tkhd', payload);
}
function movie(tracks) {
  const traks = tracks.map(([width, height, version = 0]) => box('trak', tkhd(version, width, height)));
  return [...Buffer.concat([box('ftyp', Buffer.from('isom')), box('moov', Buffer.concat(traks))])];
}
function moovPastProbe() {
  const ftyp = box('ftyp', Buffer.from('isom'));
  const free = box('free', Buffer.alloc(65536 - ftyp.length - 8));
  const moov = box('moov', box('trak', tkhd(0, 1920, 800)));
  return [...Buffer.concat([ftyp, free, moov])];
}

function page(sources, title = 'Filme Fictício') {
  return `<title>${title}</title><script>var sources = ${JSON.stringify(sources)};</script>`;
}
function hls(file, label = 'Opção HLS') {
  return { file, type: 'hls', label, direct: true, noReferrer: true };
}

function library(url) {
  if (url.pathname === '/embed/969681') return fixture('movie.html');
  if (url.pathname === '/embed/1396/2/3') return fixture('series.html');
  if (url.pathname === '/embed/99999999') return fixture('empty.html');
  if (url.hostname.includes('uqload') && url.pathname.endsWith('/series/master.m3u8')) return fixture('series.m3u8');
  if (url.hostname.includes('uqload') && url.pathname.endsWith('/master.m3u8')) return fixture('uqload.m3u8');
  if (url.pathname.includes('/includes/hls.php') && url.searchParams.get('file') === 'master.m3u8') return fixture('internal.m3u8');
  if (url.hostname === 'streamtape.com' && url.searchParams.get('id') === 'fictiondirect') return { bytes: movie([[0, 0], [1920, 800]]) };
  throw new Error(`Requisição inesperada: ${url.href}`);
}

test('carregamento CommonJS sem rede, sem timeout e sem coordenadas inválidas no fetch', async () => {
  const app = runtime();
  assert.equal(typeof app.context.module.exports.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(code, /AbortController|Promise\.allSettled/);
  for (const [season, episode] of [[null, 1], [0, 1], [1, -1], ['2', 3], [2, 1.5]]) {
    assert.deepEqual(await app.getStreams('100', 'tv', season, episode), []);
  }
  assert.deepEqual(await app.getStreams('tt1', 'movie', null, null), []);
  assert.deepEqual(await app.getStreams('100', 'series', null, null), []);
  assert.equal(app.calls.length, 0);
  assert.equal(messages(app, 'error').length, 7);
  assert.ok(messages(app, 'error').every((log) => /^\[MegaEmbed\] Entrada:/.test(log)));
});

test('filme usa o espelho primário, qualidades reais, cabeçalhos e legenda, e ignora triagem', async () => {
  const app = runtime(library);
  const streams = await app.getStreams('969681', 'movie', null, null);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(messages(app, 'warn').length, 0, messages(app, 'warn').join('\n'));
  assert.deepEqual(streams.map((item) => item.quality), ['800p', '800p', '534p', '400p']);
  assert.deepEqual(streams.map((item) => item.provider), ['MegaEmbed', 'Streamtape', 'Uqload', 'Uqload']);
  assert.deepEqual(streams.map((item) => item.type), ['hls', 'mp4', 'hls', 'hls']);
  assert.equal(streams[0].name, 'MegaEmbed 800p\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 MegaEmbed');
  assert.equal(streams[0].title, '🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 MegaEmbed');
  assert.equal(streams[1].name, 'MegaEmbed 800p\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 Streamtape');
  assert.equal(streams[1].title, '🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 Streamtape');
  assert.equal(streams[2].name, 'MegaEmbed 534p\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 Uqload');
  assert.equal(streams[2].title, '🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 Uqload');
  assert.equal(streams[0].headers.Referer, 'https://megaembed.com/embed/969681');
  assert.equal(streams[0].headers.Origin, 'https://megaembed.com');
  assert.equal(streams[0].url, 'https://megaembed.com/includes/800.m3u8');
  assert.deepEqual(Object.keys(streams[2].headers), ['User-Agent']);
  assert.match(streams[2].headers['User-Agent'], /Mozilla/);
  assert.equal(streams[2].subtitles.length, 1);
  assert.equal(streams[2].subtitles[0].url, 'https://subs.example/fiction-en.vtt');
  assert.equal(streams[2].subtitles[0].language, 'en');
  assert.equal(streams[2].subtitles[0].name, 'English');
  assert.equal(streams[2].language, 'Idioma Desconhecido');
  assert.ok(!('subtitles' in streams[0]));
  assert.deepEqual(Object.keys(streams[1].headers), ['User-Agent']);
  assert.ok(app.calls.every((call) => call.url.startsWith('https://megaembed.com/') || call.url.startsWith('https://strm1.uqload.vc/') || call.url.startsWith('https://streamtape.com/')));
  assert.ok(!app.calls.some((call) => /workers\.dev|fictionbound|iframe\.m3u8|\/534\/|\/400\/|\/800\.m3u8/.test(call.url)));
  const uqload = app.calls.find((call) => call.url === UQLOAD);
  assert.equal(uqload.init.headers.Referer, undefined);
  assert.equal(uqload.init.headers.Origin, undefined);
  const mp4 = app.calls.find((call) => call.url === DIRECT);
  assert.equal(mp4.init.headers.Range, 'bytes=0-65535');
  assert.equal(mp4.init.headers.Referer, undefined);
  assert.match(mp4.init.headers['User-Agent'], /Mozilla/);
  const internal = app.calls.find((call) => call.url === INTERNAL);
  assert.equal(internal.init.headers.Referer, 'https://megaembed.com/embed/969681');
});

test('série pede o episódio exato e preenche Dublado só com faixa de áudio', async () => {
  const app = runtime(library);
  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].name, 'MegaEmbed 720p\n🗣️ Dublado\n🌐 HTTP 🔍 Uqload');
  assert.equal(streams[0].title, '🗣️ Dublado\n🌐 HTTP 🔍 Uqload');
  assert.ok(app.calls.some((call) => call.url === 'https://megaembed.com/embed/1396/2/3'));
  assert.ok(!app.calls.some((call) => /\/embed\/1396\/1\//.test(call.url)));
});

test('Dual Áudio e Legendado exigem prova; sem faixa o idioma sai', async () => {
  const dual = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Português",LANGUAGE="pt-br"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",LANGUAGE="en"\n#EXT-X-STREAM-INF:RESOLUTION=1280x720,AUDIO="aac"\nhttps://cdn.example/dual.m3u8\n';
  const original = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",LANGUAGE="en"\n#EXT-X-STREAM-INF:RESOLUTION=1280x720,AUDIO="aac"\nhttps://cdn.example/en.m3u8\n';
  const sources = [hls('https://cdn.example/master.m3u8', 'Opção 1')];
  const legendado = [{
    ...hls('https://cdn.example/master.m3u8', 'Opção 1'),
    tracks: [{ file: 'https://subs.example/pt.vtt', language: 'pt-BR', label: 'Português', kind: 'subtitles' }],
  }];
  const app = runtime((url) => url.pathname === '/embed/1' ? page(sources) : dual);
  assert.equal((await app.getStreams('1', 'movie', null, null))[0].language, 'Dublado');
  const leg = runtime((url) => url.pathname === '/embed/1' ? page(legendado) : original);
  const legStream = (await leg.getStreams('1', 'movie', null, null))[0];
  assert.equal(legStream.language, 'Legendado');
  assert.equal(legStream.subtitles[0].language, 'pt-BR');
  const plain = runtime((url) => url.pathname === '/embed/1' ? page(sources) : '#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=640x360\nhttps://cdn.example/360.m3u8\n');
  assert.equal((await plain.getStreams('1', 'movie', null, null))[0].language, 'Idioma Desconhecido');
});

test('áudio estrangeiro comprovado sem legenda PT sai como Gringo', async () => {
  const english = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",LANGUAGE="en"\n#EXT-X-STREAM-INF:RESOLUTION=1280x720,AUDIO="aac"\nhttps://cdn.example/en.m3u8\n';
  const app = runtime((url) => url.pathname === '/embed/1'
    ? page([hls('https://cdn.example/master.m3u8', 'Opção 1')])
    : english);
  const stream = (await app.getStreams('1', 'movie', null, null))[0];
  assert.equal(stream.language, 'Gringo');
  assert.equal(stream.name, 'MegaEmbed 720p\n🗣️ Gringo\n🌐 HTTP 🔍 cdn.example');
});

test('lista vazia encerra a rotação; HTML sem sources e falha de rede passam ao próximo espelho', async () => {
  const absent = runtime(library);
  assert.deepEqual(await absent.getStreams('99999999', 'movie', null, null), []);
  assert.equal(absent.logs.length, 0);
  assert.deepEqual(absent.calls.map((call) => call.url), ['https://megaembed.com/embed/99999999']);

  const blocked = runtime((url) => {
    if (url.pathname !== '/embed/969681') return library(url);
    if (url.hostname === 'megaembed.com') return fixture('blocked.html');
    if (url.hostname === 'mgeb.lat') return fixture('movie.html');
    throw new Error(`espelho inesperado ${url.hostname}`);
  });
  const streams = await blocked.getStreams('969681', 'movie', null, null);
  assert.equal(streams.length, 4);
  assert.equal(blocked.logs.length, 0);
  assert.ok(blocked.calls.some((call) => call.url.startsWith('https://mgeb.lat/embed/969681')));
  assert.ok(!blocked.calls.some((call) => call.url.startsWith('https://mgeb.space/')));
  assert.equal(streams[0].headers.Referer, 'https://mgeb.lat/embed/969681');

  const network = runtime((url) => {
    if (url.hostname === 'megaembed.com' && url.pathname.startsWith('/embed/')) return new Error('rede indisponível');
    return library(url);
  });
  assert.equal((await network.getStreams('969681', 'movie', null, null)).length, 4);
  assert.equal(network.logs.length, 0);

  const down = runtime(() => ({ status: 520, text: '' }));
  assert.deepEqual(await down.getStreams('969681', 'movie', null, null), []);
  assert.match(messages(down, 'error')[0], /Todos os espelhos falharam: \[megaembed\.com: HTTP 520/);
  assert.match(messages(down, 'error')[0], /mgeb\.lat: HTTP 520/);
  assert.match(messages(down, 'error')[0], /mgeb\.space: HTTP 520/);
});

test('HTTP 500 em uma opção preserva as outras e registra console.warn', async () => {
  const sources = [
    hls('https://good.example/master.m3u8', 'Opção Boa'),
    hls('https://bad.example/master.m3u8', 'Opção Ruim'),
  ];
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\nhttps://good.example/720.m3u8\n';
  const app = runtime((url) => {
    if (url.pathname === '/embed/7') return page(sources);
    if (url.hostname === 'bad.example') return { status: 500, text: '' };
    return master;
  });
  const streams = await app.getStreams('7', 'movie', null, null);
  assert.deepEqual(streams.map((item) => item.quality), ['720p']);
  assert.equal(streams[0].url, 'https://good.example/720.m3u8');
  assert.equal(streams[0].name, 'MegaEmbed 720p\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 good.example');
  assert.equal(streams[0].title, '🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 good.example');
  assert.equal(messages(app, 'error').length, 0);
  assert.match(messages(app, 'warn')[0], /\[MegaEmbed\] Opção Opção Ruim descartada: HTTP 500/);
});

test('todas as opções falhando devolvem lista vazia e o erro agregado cita cada causa', async () => {
  const sources = [hls('https://a.example/master.m3u8', 'Opção A'), hls('https://b.example/master.m3u8', 'Opção B')];
  const app = runtime((url) => url.pathname === '/embed/8' ? page(sources) : { status: 502, text: '' });
  assert.deepEqual(await app.getStreams('8', 'movie', null, null), []);
  assert.equal(messages(app, 'warn').length, 2);
  const error = messages(app, 'error')[0];
  assert.match(error, /^\[MegaEmbed\] Mídia: Todas as opções falharam:/);
  assert.match(error, /Opção A: HTTP 502/);
  assert.match(error, /Opção B: HTTP 502/);
});

test('triagem pura descarta serverBound e workers.dev; tkhd ausente e master sem RESOLUTION preservam Desconhecida', async () => {
  const sources = [
    { file: 'https://streamtape.com/get_video?id=bound&token=fiction', type: 'mp4', label: 'Presa', serverBound: true },
    { file: 'https://cdn.playercdns.workers.dev/ps/includes/hls.php?url=v2fiction', type: 'hls', label: 'Worker' },
    { file: 'https://streamtape.com/get_video?id=semtkhd&token=fiction', type: 'mp4', label: 'Sem tkhd' },
    hls('https://cdn.example/master.m3u8', 'Sem RESOLUTION'),
  ];
  const bare = '#EXTM3U\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x800,URI="https://cdn.example/iframe.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://cdn.example/video.m3u8\n';
  const app = runtime((url) => {
    if (url.pathname === '/embed/9') return page(sources);
    if (url.hostname === 'streamtape.com') return { bytes: movie([[0, 0]]) };
    return bare;
  });
  const streams = await app.getStreams('9', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map((item) => item.quality), ['Desconhecida', 'Desconhecida']);
  assert.equal(streams[0].name, 'MegaEmbed Desconhecida\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 Streamtape');
  assert.equal(streams[0].title, '🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 Streamtape');
  assert.equal(streams[1].name, 'MegaEmbed Desconhecida\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 cdn.example');
  assert.equal(streams[1].title, '🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 cdn.example');
  assert.equal(app.logs.length, 0, app.logs.map((entry) => entry.message).join('\n'));
  assert.ok(!app.calls.some((call) => /bound|workers\.dev|iframe/.test(call.url)));
});

test('arrayBuffer ausente descarta só o MP4; sozinho, vira erro agregado', async () => {
  const mixed = [hls(UQLOAD, 'Opção HLS'), { file: DIRECT, type: 'mp4', label: 'Opção MP4' }];
  const withHls = runtime((url) => {
    if (url.pathname === '/embed/10') return page(mixed);
    if (url.hostname === 'streamtape.com') return { text: '' };
    return fixture('uqload.m3u8');
  });
  const kept = await withHls.getStreams('10', 'movie', null, null);
  assert.deepEqual(kept.map((item) => item.quality), ['534p', '400p']);
  assert.equal(messages(withHls, 'error').length, 0);
  assert.match(messages(withHls, 'warn')[0], /arrayBuffer/);

  const alone = runtime((url) => url.pathname === '/embed/10' ? page([{ file: DIRECT, type: 'mp4', label: 'Opção MP4' }]) : { text: '' });
  assert.deepEqual(await alone.getStreams('10', 'movie', null, null), []);
  assert.match(messages(alone, 'warn')[0], /Opção MP4 descartada: response\.arrayBuffer/);
  assert.match(messages(alone, 'error')[0], /arrayBuffer/);
});

test('tkhd versão 1, faixa de áudio ignorada e moov fora dos 64 KB', async () => {
  const only = (bytes) => runtime((url) => url.pathname === '/embed/11'
    ? page([{ file: DIRECT, type: 'mp4', label: 'MP4' }])
    : { bytes });
  assert.equal((await only(movie([[1280, 534, 1]])).getStreams('11', 'movie', null, null))[0].quality, '534p');
  assert.equal((await only(movie([[0, 0], [1280, 720]])).getStreams('11', 'movie', null, null))[0].quality, '720p');
  const late = only(moovPastProbe());
  const lateStreams = await late.getStreams('11', 'movie', null, null);
  assert.equal(lateStreams.length, 1);
  assert.equal(lateStreams[0].quality, 'Desconhecida');
  assert.equal(lateStreams[0].name, 'MegaEmbed Desconhecida\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 Streamtape');
  assert.equal(late.logs.length, 0);
});

test('variante HLS inválida no meio do master descarta só essa opção', async () => {
  const sources = [
    hls('https://bad.example/master.m3u8', 'Mista'),
    { file: DIRECT, type: 'mp4', label: 'MP4' },
  ];
  const mixed = '#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\nhttps://bad.example/ok.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://bad.example/sem.m3u8\n';
  const app = runtime((url) => {
    if (url.pathname === '/embed/12') return page(sources);
    if (url.hostname === 'streamtape.com') return { bytes: movie([[640, 360]]) };
    return mixed;
  });
  const streams = await app.getStreams('12', 'movie', null, null);
  assert.deepEqual(streams.map((item) => item.quality), ['360p']);
  assert.match(messages(app, 'warn')[0], /Mista descartada: Variante HLS sem RESOLUTION válida/);
  assert.equal(messages(app, 'error').length, 0);
});

test('opções repetidas colapsam e grupo de áudio citado sem faixa falha isolado', async () => {
  const sources = [hls(UQLOAD, 'Um'), hls(UQLOAD, 'Dois')];
  const app = runtime((url) => url.pathname === '/embed/13' ? page(sources) : fixture('uqload.m3u8'));
  const streams = await app.getStreams('13', 'movie', null, null);
  assert.deepEqual(streams.map((item) => `${item.url}|${item.quality}`), [
    'https://strm1.uqload.vc/fiction/534/index.m3u8|534p',
    'https://strm1.uqload.vc/fiction/400/index.m3u8|400p',
  ]);
  const missing = '#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1280x720,AUDIO="ausente"\nhttps://cdn.example/v.m3u8\n';
  const broken = runtime((url) => url.pathname === '/embed/13' ? page([hls('https://cdn.example/master.m3u8', 'Grupo')]) : missing);
  assert.deepEqual(await broken.getStreams('13', 'movie', null, null), []);
  assert.match(messages(broken, 'warn')[0], /Grupo HLS AUDIO ausente/);
  assert.match(messages(broken, 'error')[0], /Grupo HLS AUDIO ausente/);
});

test('formatador: a variante Prism inclui título da página e coordenadas de série sem ano inventado', async () => {
  const movieApp = runtime(library, codes.prism);
  const movieStreams = await movieApp.getStreams('969681', 'movie', null, null);
  assert.equal(movieStreams[0].name, '💿 HD 800p\n🎬 Filme Fictício\n🗣️ Idioma Desconhecido\n🌐 HTTP\n📡 MegaEmbed');
  assert.equal(movieStreams[0].title, '🎬 Filme Fictício\n🗣️ Idioma Desconhecido\n🌐 HTTP\n📡 MegaEmbed\n🔍MegaEmbed');

  const tvApp = runtime(library, codes.prism);
  const tvStreams = await tvApp.getStreams('1396', 'tv', 2, 3);
  assert.equal(tvStreams[0].name, '💿 HD 720p\n🎬 Série Fictícia T02E03\n🗣️ Dublado\n🌐 HTTP\n📡 Uqload');
  assert.equal(tvStreams[0].title, '🎬 Série Fictícia T02E03\n🗣️ Dublado\n🌐 HTTP\n📡 Uqload\n🔍MegaEmbed');
});
