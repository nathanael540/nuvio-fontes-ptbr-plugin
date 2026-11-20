const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const BASE = 'https://cineveo.cfd';
const MOVIE_ID = '502356';
const SERIES_ID = '1396';
const MIXED_ID = '96162';

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('cineveo-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('cineveo', { outDir, formatter }), 'utf8');
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
      const status = result.status === undefined ? 200 : result.status;
      const text = typeof result === 'string' ? result : typeof result.text === 'string' ? result.text : '';
      const headers = result.headers || {};
      return {
        ok: status >= 200 && status < 300,
        status,
        url: result.url || String(url),
        headers: { get: (name) => headers[name.toLowerCase()] ?? null },
        text: async () => text,
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return {
    context, calls, logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/cineveo', name), 'utf8');
const messages = (app, level) => app.logs.filter((entry) => entry.level === level).map((entry) => entry.message);
const json = (value) => ({ text: JSON.stringify(value), headers: { 'content-type': 'application/json; charset=utf-8' } });
const jsonText = (text) => ({ text, headers: { 'content-type': 'application/json; charset=utf-8' } });
const html = (text) => ({ text, headers: { 'content-type': 'text/html; charset=utf-8' } });
const episodeHtml = (data) => `<html><body><script id="initialEpisodeData" type="application/json">${JSON.stringify(data)}</script></body></html>`;

function library(url) {
  if (url.pathname === '/api') {
    const action = url.searchParams.get('action');
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('id');
    if (action === 'details' && type === 'movie' && id === MOVIE_ID) return jsonText(fixture('movie.json'));
    if (action === 'details' && type === 'series' && id === SERIES_ID) return jsonText(fixture('series-breaking-bad.json'));
    if (action === 'details' && type === 'series' && id === MIXED_ID) return jsonText(fixture('series-itaewon.json'));
    if (action === 'details') return { status: 404, ...html(fixture('404.html')) };
  }
  if (url.pathname === '/series/breaking-bad-3m68r-t1-ep1.html') return html(fixture('episode-breaking-bad.html'));
  if (url.pathname === '/series/itaewon-class-legendado-t1-ep1.html') return html(fixture('episode-itaewon.html'));
  throw new Error(`Requisição inesperada: ${url.href}`);
}

function movieServer(overrides = {}) {
  return {
    id: 'server-1',
    name: 'Servidor 1',
    quality: '720p',
    url: 'https://media.example/video.mp4',
    type: 'mp4',
    audio: 'dub',
    ...overrides,
  };
}

function movieDetail(servers, overrides = {}) {
  return {
    type: 'movie',
    item: {
      id: 550,
      tmdb_id: 550,
      slug: 'clube-da-luta',
      type: 'movie',
      name: 'Clube da Luta',
      year: '1999',
    },
    servers,
    ...overrides,
  };
}

function seriesDetail(overrides = {}) {
  return {
    type: 'series',
    item: {
      id: 1396,
      tmdb_id: 1396,
      slug: 'breaking-bad-3m68r',
      type: 'series',
      name: 'Breaking Bad',
      year: '2008',
    },
    episodes: [{ id: 943931, tmdb_id: 1396, season: 1, episode: 1, title: 'Piloto', available: true }],
    ...overrides,
  };
}

test('carregamento CommonJS sem rede e entrada inválida antes de qualquer requisição', async () => {
  const app = runtime();
  assert.equal(typeof app.context.module.exports.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(code, /AbortController|Promise\.allSettled|setTimeout|SCRAPER_SETTINGS/);

  const invalid = [
    ['tt1', 'movie', null, null],
    ['502356', 'series', null, null],
    ['502356', 'tv', null, null],
    ['502356', 'tv', 0, 1],
    ['502356', 'tv', 1, 0],
    ['502356', 'tv', 1.5, 1],
    ['502356', 'tv', '1', '2'],
  ];
  for (const args of invalid) {
    assert.deepEqual(await app.getStreams(...args), []);
  }
  assert.equal(app.calls.length, 0);
  const errors = messages(app, 'error');
  assert.equal(errors.length, invalid.length);
  assert.ok(errors.every((log) => /^\[Cineveo\] Entrada:/.test(log)));
});

test('filme lê os grupos dublado e legendado e mantém a URL publicada', async () => {
  const app = runtime(library);
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(messages(app, 'warn').length, 0, messages(app, 'warn').join('\n'));
  assert.deepEqual(streams.map((stream) => [stream.quality, stream.language]), [
    ['1080p', 'Dublado'],
    ['1080p', 'Legendado'],
    ['720p', 'Dublado'],
    ['720p', 'Legendado'],
  ]);
  assert.deepEqual(streams.map((stream) => stream.type), ['mp4', 'mp4', 'mp4', 'mp4']);
  assert.equal(streams[0].url, 'https://media.example/cineveo/super-mario-bros-o-filme-dublado-1080p.mp4');
  assert.equal(streams[2].url, `${BASE}/api/vod-resolve?token=EXAMPLE_TOKEN_DUB`);
  for (const stream of streams) {
    assert.match(stream.name, /^Cineveo \d{3,4}p\n🗣️ (Dublado|Legendado)\n🌐 HTTP$/);
    assert.match(stream.title, /^🗣️ (Dublado|Legendado)\n🌐 HTTP$/);
    assert.ok(!('provider' in stream));
    assert.ok(!('headers' in stream));
    assert.ok(!('size' in stream));
    assert.ok(!('subtitles' in stream));
    assert.ok(!('format' in stream));
  }
  assert.equal(app.calls.length, 1);
  assert.match(app.calls[0].url, /action=details&type=movie&id=502356/);
});

test('formatador recebe título, ano e coordenada da série', async () => {
  const app = runtime(library, codes.prism);
  const movie = await app.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(movie[0].name, '🚀 FHD 1080p\n🎬 Super Mario Bros. O Filme (2023)\n🗣️ Dublado\n🌐 HTTP');
  assert.equal(movie[0].title, '🎬 Super Mario Bros. O Filme (2023)\n🗣️ Dublado\n🌐 HTTP\n🔍Cineveo');

  const episode = await app.getStreams(SERIES_ID, 'tv', 1, 1);
  assert.equal(episode[0].name, '🚀 FHD 1080p\n🎬 Breaking Bad (2008) T01E01\n🗣️ Dublado\n🌐 HTTP');
  assert.equal(episode[0].title, '🎬 Breaking Bad (2008) T01E01\n🗣️ Dublado\n🌐 HTTP\n🔍Cineveo');
});

test('qualidade usa o anúncio do servidor e cai em Desconhecida sem resolução', async () => {
  const detail = movieDetail({
    dub: [
      movieServer({ name: 'Servidor 1', quality: '1080p' }),
      movieServer({ name: 'Player Principal', quality: 'HD', url: 'https://media.example/video-2.mp4' }),
      movieServer({ name: 'Servidor sem rótulo', quality: '', url: 'https://media.example/video-3.mp4' }),
      movieServer({ name: 'Servidor sem rótulo 2', quality: 'Original', url: 'https://media.example/video-4.mp4' }),
    ],
  });
  const app = runtime(() => json(detail));
  const streams = await app.getStreams('550', 'movie', null, null);
  assert.deepEqual(streams.map((stream) => stream.quality), ['1080p', '720p', 'Desconhecida', 'Desconhecida']);
  assert.equal(messages(app, 'warn').length, 0);
});

test('filme usa download quando falta url e resolve caminho relativo contra a fonte', async () => {
  const detail = movieDetail({
    dub: [{
      id: 's1',
      name: 'Player',
      quality: '720p',
      type: 'mp4',
      audio: 'dub',
      download: '/api?action=episodeDownload&episode_id=1&audio=dub&server=s1',
    }],
  });
  const app = runtime(() => json(detail));
  const [stream] = await app.getStreams('550', 'movie', null, null);
  assert.equal(stream.url, `${BASE}/api?action=episodeDownload&episode_id=1&audio=dub&server=s1`);
});

test('servidor sem endereço falha isolado e a opção válida continua', async () => {
  const detail = movieDetail({
    dub: [
      { id: 'broken', name: 'Quebrado', quality: '1080p', type: 'mp4', audio: 'dub' },
      movieServer({ name: 'Válido' }),
    ],
  });
  const app = runtime(() => json(detail));
  const streams = await app.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://media.example/video.mp4');
  assert.equal(messages(app, 'error').length, 0);
  assert.deepEqual(messages(app, 'warn'), [
    '[Cineveo] Opção dub: Quebrado descartada: servidor sem "url" nem "download"',
  ]);
});

test('todas as opções falham e o erro agregado sobe para a fronteira', async () => {
  const detail = movieDetail({
    dub: [
      { id: 'a', name: 'Quebrado 1', quality: '1080p', type: 'mp4', audio: 'dub' },
      { id: 'b', name: 'Quebrado 2', quality: '720p', type: 'mp4', audio: 'dub' },
    ],
  });
  const app = runtime(() => json(detail));
  assert.deepEqual(await app.getStreams('550', 'movie', null, null), []);
  assert.equal(messages(app, 'warn').length, 2);
  const errors = messages(app, 'error');
  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /^\[Cineveo\] Servidores: Todas as opções falharam: \[dub: Quebrado 1: servidor sem "url" nem "download"; dub: Quebrado 2: servidor sem "url" nem "download"\]$/,
  );
});

test('detalhe sem servidores é ausência sem erro', async () => {
  for (const servers of [{}, { dub: [], leg: [] }, undefined, null]) {
    const app = runtime(() => json(movieDetail(servers)));
    assert.deepEqual(await app.getStreams('550', 'movie', null, null), []);
    assert.equal(app.logs.length, 0, `${JSON.stringify(servers)}: ${app.logs.map((entry) => entry.message).join(' | ')}`);
  }
});

test('404 documentado é ausência; 404 sem o corpo e JSON inválido são falhas', async () => {
  const documented = runtime(library);
  assert.deepEqual(await documented.getStreams('99999999', 'movie', null, null), []);
  assert.equal(documented.logs.length, 0);

  const unexpected = runtime(() => ({ status: 404, ...html('<html><title>Not Found</title></html>') }));
  assert.deepEqual(await unexpected.getStreams('550', 'movie', null, null), []);
  assert.match(messages(unexpected, 'error')[0], /^\[Cineveo\] Detalhe: HTTP 404 em https:\/\/cineveo\.cfd\/api\?/);

  const invalid = runtime(() => jsonText('<!doctype html>'));
  assert.deepEqual(await invalid.getStreams('550', 'movie', null, null), []);
  assert.match(messages(invalid, 'error')[0], /^\[Cineveo\] Detalhe: Resposta não é JSON válido em https:\/\/cineveo\.cfd\/api\?/);

  const serverError = runtime(() => ({ status: 500, text: 'erro' }));
  assert.deepEqual(await serverError.getStreams('550', 'movie', null, null), []);
  assert.match(messages(serverError, 'error')[0], /^\[Cineveo\] Detalhe: HTTP 500 em/);
});

test('tipo ou identificador divergente é falha de estrutura', async () => {
  const detail = movieDetail({});
  const wrongType = runtime(() => json({ ...detail, type: 'series' }));
  assert.deepEqual(await wrongType.getStreams('550', 'movie', null, null), []);
  assert.match(messages(wrongType, 'error')[0], /^\[Cineveo\] Detalhe: Tipo divergente em .*: esperado "movie", recebido "series"$/);

  const wrongId = runtime(() => json({ ...detail, item: { ...detail.item, tmdb_id: 551 } }));
  assert.deepEqual(await wrongId.getStreams('550', 'movie', null, null), []);
  assert.match(messages(wrongId, 'error')[0], /^\[Cineveo\] Detalhe: tmdb_id divergente em .*: esperado 550, recebido 551$/);
});

test('série lê o episódio disponível e monta os streams da página', async () => {
  const app = runtime(library);
  const streams = await app.getStreams(SERIES_ID, 'tv', 1, 1);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(messages(app, 'warn').length, 0, messages(app, 'warn').join('\n'));
  assert.equal(streams.length, 3);
  assert.deepEqual(streams.map((stream) => stream.quality), ['1080p', '720p', '720p']);
  assert.ok(streams.every((stream) => stream.language === 'Dublado'));
  assert.equal(
    streams[0].url,
    `${BASE}/api?action=episodeDownload&episode_id=943931&audio=dub&server=2f16de71dc455b283ba5dbe7ab27e0fe`,
  );
  assert.equal(app.calls.length, 2);
  assert.match(app.calls[0].url, /action=details&type=series&id=1396/);
  assert.equal(app.calls[1].url, `${BASE}/series/breaking-bad-3m68r-t1-ep1.html`);
});

test('série mistura dublado e legendado e deduplica mesma URL e idioma', async () => {
  const app = runtime(library);
  const streams = await app.getStreams(MIXED_ID, 'tv', 1, 1);
  assert.equal(messages(app, 'error').length, 0, messages(app, 'error').join('\n'));
  assert.equal(streams.length, 4);
  assert.deepEqual(streams.map((stream) => [stream.quality, stream.language]), [
    ['1080p', 'Legendado'],
    ['720p', 'Dublado'],
    ['720p', 'Dublado'],
    ['720p', 'Legendado'],
  ]);
  assert.equal(new Set(streams.map((stream) => stream.url)).size, 4);
  const repeated = `${BASE}/api?action=episodeDownload&episode_id=1491293&audio=leg&server=8cfbce7a5fa5766e8c7665ef204f975a`;
  assert.equal(streams.filter((stream) => stream.url === repeated).length, 1);
});

test('mesma URL em áudios diferentes permanece e grupo desconhecido vira Idioma Desconhecido', async () => {
  const shared = 'https://media.example/video-compartilhado.mp4';
  const detail = movieDetail({
    dub: [movieServer({ name: 'Dublado', url: shared })],
    leg: [movieServer({ name: 'Legendado', url: shared })],
    audio: [movieServer({ name: 'Outro grupo', url: shared })],
  });
  const app = runtime(() => json(detail));
  const streams = await app.getStreams('550', 'movie', null, null);
  assert.deepEqual(streams.map((stream) => stream.language), ['Dublado', 'Legendado', 'Idioma Desconhecido']);
  assert.ok(streams.every((stream) => stream.url === shared));
  assert.equal(messages(app, 'error').length, 0);
  assert.equal(messages(app, 'warn').length, 0);
});

test('episódio não listado ou indisponível é ausência sem abrir página inventada', async () => {
  const app = runtime(library);
  assert.deepEqual(await app.getStreams(SERIES_ID, 'tv', 2, 9), []);
  assert.equal(app.calls.length, 1);
  assert.equal(app.logs.length, 0);

  const unavailableDetail = seriesDetail({
    episodes: [{ id: 943931, tmdb_id: 1396, season: 1, episode: 1, title: 'Piloto', available: false }],
  });
  const unavailable = runtime(() => json(unavailableDetail));
  assert.deepEqual(await unavailable.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.equal(unavailable.calls.length, 1);
  assert.equal(unavailable.logs.length, 0);
});

test('página sem bloco é falha; coordenada divergente é ausência; série divergente é falha', async () => {
  const missing = runtime((url) => {
    if (url.pathname === '/api') return jsonText(fixture('series-breaking-bad.json'));
    return html('<html><body>sem dados</body></html>');
  });
  assert.deepEqual(await missing.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(messages(missing, 'error')[0], /^\[Cineveo\] Episódio: Bloco "initialEpisodeData" ausente em /);

  const divergent = runtime((url) => {
    if (url.pathname === '/api') return jsonText(fixture('series-breaking-bad.json'));
    return html(episodeHtml({
      type: 'series',
      series: { tmdb_id: 1396 },
      episode: { season: 1, episode: 2 },
      servers: { dub: [], leg: [] },
    }));
  });
  assert.deepEqual(await divergent.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.equal(divergent.logs.length, 0);

  const otherSeries = runtime((url) => {
    if (url.pathname === '/api') return jsonText(fixture('series-breaking-bad.json'));
    return html(episodeHtml({
      type: 'series',
      series: { tmdb_id: 999 },
      episode: { season: 1, episode: 1 },
      servers: { dub: [], leg: [] },
    }));
  });
  assert.deepEqual(await otherSeries.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(messages(otherSeries, 'error')[0], /^\[Cineveo\] Episódio: tmdb_id divergente em /);
});

test('tipo não suportado é triagem com aviso e não derruba as demais opções', async () => {
  const detail = movieDetail({
    dub: [
      movieServer({ name: 'MKV', type: 'mkv' }),
      movieServer({ name: 'MP4', url: 'https://media.example/video.mp4' }),
    ],
  });
  const app = runtime(() => json(detail));
  const streams = await app.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(messages(app, 'error').length, 0);
  assert.match(messages(app, 'warn')[0], /descartada por triagem: tipo "mkv" não suportado/);

  const onlyTriage = runtime(() => json(movieDetail({
    dub: [movieServer({ name: 'MKV', type: 'mkv' })],
  })));
  assert.deepEqual(await onlyTriage.getStreams('550', 'movie', null, null), []);
  assert.equal(messages(onlyTriage, 'warn').length, 1);
  assert.equal(messages(onlyTriage, 'error').length, 0);
});

test('estrutura inesperada na fonte é falha explícita', async () => {
  const badServers = runtime(() => json(movieDetail([])));
  assert.deepEqual(await badServers.getStreams('550', 'movie', null, null), []);
  assert.match(messages(badServers, 'error')[0], /^\[Cineveo\] Servidores: Campo "servers" inválido/);

  const badGroup = runtime(() => json(movieDetail({ dub: 'servidor' })));
  assert.deepEqual(await badGroup.getStreams('550', 'movie', null, null), []);
  assert.match(messages(badGroup, 'error')[0], /^\[Cineveo\] Servidores: Grupo de áudio "dub" inválido/);

  const badEpisodes = runtime(() => json(seriesDetail({ episodes: undefined })));
  assert.deepEqual(await badEpisodes.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(messages(badEpisodes, 'error')[0], /^\[Cineveo\] Detalhe: Campo "episodes" ausente ou inválido/);
});
