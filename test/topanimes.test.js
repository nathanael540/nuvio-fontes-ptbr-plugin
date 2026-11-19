const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CryptoJS = require('crypto-js');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'topanimes');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const tmdbSolo = readJson('tmdb-127532.json');
const tmdbNaruto = readJson('tmdb-31910.json');
const tmdbChainsaw = readJson('tmdb-1218925.json');
const tmdbFrieren = readJson('tmdb-209867.json');
const tmdbBleach = readJson('tmdb-30984.json');
const tmdbAot = readJson('tmdb-1429.json');
const tmdbChihiro = readJson('tmdb-129.json');
const tmdbAkira = readJson('tmdb-149.json');
const tmdbMononoke = readJson('tmdb-128.json');
const tmdbDemon = readJson('tmdb-85937.json');

const searchSolo = read('search-solo-leveling.html');
const searchFrieren = read('search-frieren.html');
const searchNaruto = read('search-naruto.html');
const searchBleach = read('search-bleach.html');
const searchBleachS2 = read('search-bleach-s2.html');
const searchAot = read('search-aot.html');
const searchChainsaw = read('search-chainsaw.html');
const searchChihiro = read('search-chihiro.html');
const searchAkira = read('search-akira.html');
const searchMononoke = read('search-mononoke.html');
const searchDemon = read('search-demon-slayer.html');
const searchNoResult = read('search-no-result.html');
const searchBroken = read('search-broken.html');

const detailSolo = read('detail-solo-leveling.html');
const detailSoloSub = read('detail-solo-leveling-sub.html');
const detailSolo2 = read('detail-solo-leveling-2.html');
const detailSolo2Dub = read('detail-solo-leveling-2-dublado.html');
const detailFrieren = read('detail-frieren.html');
const detailFrierenDub = read('detail-frieren-dublado.html');
const detailNaruto = read('detail-naruto.html');
const detailBleach = read('detail-bleach.html');
const detailBleachS2 = read('detail-bleach-s2.html');
const detailAot = read('detail-aot.html');
const detailChainsaw = read('detail-chainsaw.html');
const detailKojima = read('detail-kojima.html');
const detailAkira = read('detail-akira.html');
const detailMononoke = read('detail-mononoke.html');
const detailDemon = read('detail-demon-slayer.html');
const detailNoH1 = read('detail-no-h1.html');
const detailDuplicate = read('detail-duplicate.html');

const episodeSolo = read('episode-solo-leveling.html');
const episodeFrieren = read('episode-frieren.html');
const episodeFrierenDub = read('episode-frieren-dublado.html');
const episodeNaruto = read('episode-naruto.html');
const episodeBleach = read('episode-bleach.html');
const episodeBleachS2 = read('episode-bleach-s2.html');
const episodeAot = read('episode-aot.html');
const episodeOffline = read('episode-offline.html');
const episodeBrokenOption = read('episode-broken-option.html');
const episodeMixed = read('episode-mixed.html');
const episodeFilemoon = read('episode-filemoon.html');
const episodeFilemoonNl = read('episode-filemoon-nl.html');

const playerBooonceivu = read('player-booonceivu.json');
const playerBooonceivuNoSubs = read('player-booonceivu-no-subs.json');
const playerBooonceivuError = read('player-booonceivu-error.json');
const playerZuplay = read('player-booonceivu-zuplay.html');
const playerAntivirus = read('player-antivirus.html');
const playerKojima = read('player-kojima.html');
const playerBlogger = read('player-blogger.html');
const playerRuplay = read('player-ruplay.html');
const playerFilemoon = readJson('player-filemoon.json');
const playerFilemoonInvalid = readJson('player-filemoon-invalid.json');

let codes = {};

test.before(async () => {
  const outDir = createTempDir('topanimes-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('topanimes', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('topanimes', { outDir, formatter: 'prism' }), 'utf8');
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
  const logs = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    TMDB_API_KEY: 'chave-ficticia',
    require: (name) => {
      if (name === 'cheerio-without-node-native') return { load };
      if (name === 'crypto-js') return CryptoJS;
      throw new Error(`require inesperado: ${name}`);
    },
    console: {
      error: (message) => errors.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      log: (message) => logs.push(String(message)),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const result = await route(new AppURL(url), init || {});
      if (result instanceof Error) throw result;
      if (result === undefined) throw new Error(`Rota inesperada: ${url}`);
      const text = typeof result === 'string'
        ? result
        : typeof result.body === 'string'
          ? result.body
          : JSON.stringify(result.body);
      return {
        ok: result.status === undefined || result.status < 400,
        status: result.status || 200,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return { exports: context.module.exports, calls, errors, warnings, logs };
}

function searchResponse(term) {
  if (term.includes('Solo Leveling') || term.includes('Ore dake')) return { body: searchSolo };
  if (term.includes('Sousou no Frieren')) return { body: searchFrieren };
  if (term.includes('Naruto Shippuden')) return { body: searchNaruto };
  if (term.includes('Sennen Kessen-hen')) return { body: searchBleachS2 };
  if (term === 'Bleach' || term === 'BLEACH') return { body: searchBleach };
  if (term.includes('Attack on Titan') || term.includes('Shingeki no Kyojin')) return { body: searchAot };
  if (term.includes('Chainsaw Man')) return { body: searchChainsaw };
  if (term.includes('A Viagem de Chihiro')) return { body: searchChihiro };
  if (term.includes('Akira')) return { body: searchAkira };
  if (term.includes('Mononoke')) return { body: searchMononoke };
  if (term.includes('Demon Slayer') || term.includes('Kimetsu')) return { body: searchDemon };
  return { body: searchNoResult };
}

function fullRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (url.pathname === '/3/tv/127532') return { body: tmdbSolo };
      if (url.pathname === '/3/tv/31910') return { body: tmdbNaruto };
      if (url.pathname === '/3/tv/209867') return { body: tmdbFrieren };
      if (url.pathname === '/3/tv/30984') return { body: tmdbBleach };
      if (url.pathname === '/3/tv/1429') return { body: tmdbAot };
      if (url.pathname === '/3/movie/1218925') return { body: tmdbChainsaw };
      if (url.pathname === '/3/movie/129') return { body: tmdbChihiro };
      if (url.pathname === '/3/movie/149') return { body: tmdbAkira };
      if (url.pathname === '/3/movie/128') return { body: tmdbMononoke };
      if (url.pathname === '/3/tv/85937') return { body: tmdbDemon };
      throw new Error(`TMDB inesperado: ${url.pathname}`);
    }

    if (url.hostname === 'topanimes.net') {
      if (url.pathname === '/') {
        if (options.searchBroken) return { body: searchBroken };
        return searchResponse(url.searchParams.get('s') || '');
      }
      if (url.pathname === '/animes/solo-leveling-dublado/') return { body: options.detailBroken ? detailNoH1 : detailSolo };
      if (url.pathname === '/animes/solo-leveling/') return { body: detailSoloSub };
      if (url.pathname === '/animes/solo-leveling-2/') return { body: detailSolo2 };
      if (url.pathname === '/animes/solo-leveling-2-dublado/') return { body: detailSolo2Dub };
      if (url.pathname === '/animes/sousou-no-frieren/') return { body: detailFrieren };
      if (url.pathname === '/animes/sousou-no-frieren-dublado/') return { body: detailFrierenDub };
      if (url.pathname === '/animes/naruto-shippuden-dublado/' || url.pathname === '/animes/naruto-shippuden/') return { body: detailNaruto };
      if (url.pathname === '/animes/bleach/') return { body: detailBleach };
      if (url.pathname === '/animes/bleach-sennen-kessen-hen-ketsubetsu-tan/') return { body: detailBleachS2 };
      if (url.pathname === '/animes/shingeki-no-kyojin/') return { body: detailAot };
      if (url.pathname === '/animes/shingeki-no-kyojin-2/') return { body: detailAot };
      if (url.pathname === '/filmes/chainsaw-man-o-filme-arco-da-reze-dublado/') return { body: options.detailBroken ? detailNoH1 : options.duplicate ? detailDuplicate : detailChainsaw };
      if (url.pathname === '/filmes/chainsaw-man-the-movie-reze-arc/') return { body: detailChainsaw };
      if (url.pathname === '/filmes/a-viagem-de-chihiro-dublado/') return { body: detailKojima };
      if (url.pathname === '/filmes/akira/') return { body: detailAkira };
      if (url.pathname === '/filmes/princesa-mononoke-dublado/') return { body: detailMononoke };
      if (url.pathname === '/animes/kimetsu-no-yaiba/') return { body: detailDemon };

      if (url.pathname === '/episodio/solo-leveling-dublado-episodio-1/') return { body: options.mixedEpisode ? episodeMixed : episodeSolo };
      if (url.pathname === '/episodio/solo-leveling-episodio-1/') return { body: episodeOffline };
      if (url.pathname === '/episodio/solo-leveling-2-dublado-episodio-1/') return { body: episodeSolo };
      if (url.pathname === '/episodio/solo-leveling-2-episodio-1/') return { body: episodeSolo };
      if (url.pathname === '/episodio/sousou-no-frieren-episodio-1/') return { body: episodeFrieren };
      if (url.pathname === '/episodio/sousou-no-frieren-dublado-episodio-1/') return { body: episodeFrierenDub };
      if (url.pathname === '/episodio/naruto-shippuden-dublado-episodio-1/') return { body: episodeNaruto };
      if (url.pathname === '/episodio/naruto-shippuden-dublado-episodio-33/') return { body: episodeNaruto };
      if (url.pathname === '/episodio/bleach-episodio-1/') return { body: options.brokenOption ? episodeBrokenOption : episodeBleach };
      if (url.pathname === '/episodio/bleach-sennen-kessen-hen-ketsubetsu-tan-episodio-1/') return { body: episodeBleachS2 };
      if (url.pathname === '/episodio/shingeki-no-kyojin-episodio-1/') return { body: episodeAot };
      if (url.pathname === '/episodio/kimetsu-no-yaiba-episodio-1/') return { body: options.filemoonHost === 'filemoon.nl' ? episodeFilemoonNl : episodeFilemoon };

      if (url.pathname.startsWith('/antivirus2/') || url.pathname.startsWith('/antivirus5/')) {
        return { body: playerAntivirus };
      }
      throw new Error(`Rota TopAnimes inesperada: ${url.pathname}`);
    }

    if (url.hostname === 'sk-boyceta.booonceivu.shop') {
      if (options.booonceivuStatus) return { status: options.booonceivuStatus, body: 'erro' };
      const id = url.searchParams.get('id') || '';
      if (id.includes('frieren-sub') || id.includes('movie-json')) return { body: playerBooonceivu };
      if (id.includes('error')) return { body: playerBooonceivuError };
      return { body: playerBooonceivuNoSubs };
    }
    if (url.hostname === 'ru-boyceta.booonceivu.shop') return { body: playerZuplay };
    if (url.hostname === 'blogger.com' || url.hostname === 'www.blogger.com') {
      if (options.bloggerStatus) return { status: options.bloggerStatus, body: 'erro' };
      if (url.searchParams.get('token') === 'falha') return { status: 500, body: 'erro' };
      return { body: playerBlogger };
    }
    if (url.hostname === 'litch.alibabacdn.net') return { body: playerKojima };
    if (url.hostname === 'csst.online' || url.hostname === 'incvideo1.online' || url.hostname === 'www.incvideo1.online') {
      return { body: playerRuplay, url: `https://incvideo1.online${url.pathname}` };
    }
    if (url.hostname === 'filemoon.sx' || url.hostname === 'filemoon.nl') {
      if (url.pathname === '/api/videos/fixture01/') {
        return { body: options.filemoonInvalid ? playerFilemoonInvalid : playerFilemoon };
      }
      throw new Error(`Rota Filemoon inesperada: ${url.pathname}`);
    }

    throw new Error(`Host inesperado: ${url.hostname}`);
  };
}

function qualities(streams) {
  return Array.from(streams, (stream) => stream.quality);
}

function byProvider(streams, provider) {
  return streams.filter((stream) => stream.provider === provider);
}

test('1.1 carrega o pacote sem rede e valida a entrada', async () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });

  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);

  const invalidId = await runtime.exports.getStreams('abc', 'movie', null, null);
  assert.deepEqual(Array.from(invalidId), []);
  assert.match(runtime.errors[0], /\[TopAnimes\]/);

  const invalidType = await runtime.exports.getStreams('1', 'anime', null, null);
  assert.deepEqual(Array.from(invalidType), []);

  const invalidSeason = await runtime.exports.getStreams('1', 'tv', null, 1);
  assert.deepEqual(Array.from(invalidSeason), []);
  assert.equal(fetchCalled, false);
});

test('1.2 filme resolve OdaCDN, Vidstreaming, Zuplay e Ruplay, ignora trailer e triagem', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('1218925', 'movie', null, null);

  assert.equal(streams.length, 8);
  assert.deepEqual(qualities(streams), ['1080p', '1080p', '1080p', '1080p', '720p', '720p', '360p', '360p']);
  for (const stream of streams) {
    assert.equal(stream.language, 'Dublado');
    assert.match(stream.name, /TopAnimes/);
    assert.equal(stream.title.length > 0, true);
  }

  const oda = byProvider(streams, 'OdaCDN');
  assert.equal(oda.length, 1);
  assert.equal(oda[0].type, 'hls');
  assert.match(oda[0].headers.Referer, /topanimes\.net/);
  assert.equal(oda[0].headers['User-Agent'] !== undefined, true);

  const vid = byProvider(streams, 'Vidstreaming');
  assert.equal(vid.length, 3);
  assert.equal(vid[0].subtitles.length, 2);
  assert.equal(vid[0].subtitles[0].language, 'Português');

  const zuplay = byProvider(streams, 'Zuplay');
  assert.equal(zuplay.length, 1);
  assert.equal(zuplay[0].type, 'mp4');
  assert.equal(zuplay[0].headers, undefined);

  const ruplay = byProvider(streams, 'Ruplay');
  assert.equal(ruplay.length, 3);
  assert.equal(ruplay[0].headers.Referer, 'https://incvideo1.online/');

  const hosts = runtime.calls.map((call) => new AppURL(call.url).hostname);
  assert.equal(hosts.includes('csst.online'), true);
  assert.equal(hosts.includes('www.youtube.com'), false);
  const ranged = runtime.calls.filter((call) => call.init.headers && call.init.headers.Range !== undefined);
  assert.deepEqual(ranged, []);
  assert.equal(runtime.calls.some((call) => call.init.method === 'HEAD'), false);
});

test('2.1 série por numerando resolve dublado e preserva a triagem da variante legendada', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('127532', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  assert.deepEqual(qualities(streams), ['1080p', '720p', '360p']);
  for (const stream of streams) {
    assert.equal(stream.language, 'Dublado');
    assert.equal(stream.type, 'hls');
    assert.equal(stream.provider, 'Vidstreaming');
  }
  const episodeCalls = runtime.calls.filter((call) => call.url.includes('/episodio/'));
  assert.deepEqual(episodeCalls.map((call) => new AppURL(call.url).pathname), [
    '/episodio/solo-leveling-dublado-episodio-1/',
    '/episodio/solo-leveling-episodio-1/',
  ]);
  assert.deepEqual(runtime.errors, []);
});

test('2.2 temporada 2 usa o par 2 - 1 publicado', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('127532', 'tv', 2, 1);

  assert.equal(streams.length, 3);
  assert.equal(streams[0].language, 'Dublado');
  const episodeCalls = runtime.calls.filter((call) => call.url.includes('/episodio/'));
  assert.equal(episodeCalls[0].url, 'https://topanimes.net/episodio/solo-leveling-2-dublado-episodio-1/');
});

test('2.3 temporada com numeração absoluta encontra o episódio 33', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('31910', 'tv', 2, 1);

  assert.equal(streams.length, 3);
  const episodeCalls = runtime.calls.filter((call) => call.url.includes('/episodio/'));
  assert.equal(episodeCalls[0].url, 'https://topanimes.net/episodio/naruto-shippuden-dublado-episodio-33/');
});

test('2.4 temporada declarada no título usa numeração local quando não há numerando', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('31910', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  const episodeCalls = runtime.calls.filter((call) => call.url.includes('/episodio/'));
  assert.equal(episodeCalls[0].url, 'https://topanimes.net/episodio/naruto-shippuden-dublado-episodio-1/');
});

test('3.1 Blogger devolve MP4 progressivos com qualidade e User-Agent', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('30984', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  assert.deepEqual(qualities(streams), ['720p', '360p', '144p']);
  for (const stream of streams) {
    assert.equal(stream.type, 'mp4');
    assert.equal(stream.provider, 'NOA');
    assert.equal(stream.headers['User-Agent'] !== undefined, true);
    assert.equal(stream.language, 'Idioma Desconhecido');
  }
});

test('3.2 prefixo de título e temporada 2 confirmam Bleach: Sennen Kessen-hen', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('30984', 'tv', 2, 1);

  assert.equal(streams.length, 3);
  const detailCalls = runtime.calls.filter((call) => call.url.includes('/animes/'));
  assert.equal(detailCalls[0].url, 'https://topanimes.net/animes/bleach-sennen-kessen-hen-ketsubetsu-tan/');
});

test('3.3 wrapper /antivirus devolve HLS com Referer de reprodução', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('1429', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].type, 'hls');
  assert.equal(streams[0].provider, 'MK');
  assert.equal(streams[0].headers.Referer, 'https://topanimes.net/');
});

test('3.4 Ruplay via /aviso limpa o sufixo &poster e devolve MP4 com Referer da origem', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('149', 'movie', null, null);

  assert.equal(streams.length, 3);
  assert.deepEqual(qualities(streams), ['1080p', '720p', '360p']);
  for (const stream of streams) {
    assert.equal(stream.provider, 'Ruplay');
    assert.equal(stream.type, 'mp4');
    assert.equal(stream.headers['User-Agent'] !== undefined, true);
    assert.equal(stream.headers.Referer, 'https://incvideo1.online/');
  }

  const csstCalls = runtime.calls.filter((call) => new AppURL(call.url).hostname === 'csst.online');
  assert.equal(csstCalls.length, 1);
  assert.equal(new AppURL(csstCalls[0].url).pathname, '/embed/805424');
  assert.equal(csstCalls[0].url.includes('poster='), false);
  assert.deepEqual(runtime.warnings, []);
});

test('3.5 Ruplay direto em csst.online resolve o mesmo Playerjs', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('128', 'movie', null, null);

  assert.equal(streams.length, 3);
  for (const stream of streams) {
    assert.equal(stream.provider, 'Ruplay');
    assert.equal(stream.language, 'Dublado');
  }
  const embed = runtime.calls.find((call) => new AppURL(call.url).hostname === 'csst.online');
  assert.equal(new AppURL(embed.url).pathname, '/embed/850753/');
});

test('3.6 Filemoon/Byse decifra o playback e devolve HLS com legendas', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'Filemoon');
  assert.equal(streams[0].type, 'hls');
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].url, 'https://media.example.test/filemoon/master.m3u8?token=fixture');
  assert.equal(streams[0].headers, undefined);
  assert.equal(streams[0].subtitles.length, 1);
  assert.equal(streams[0].subtitles[0].language, 'pt-br');

  const apiCall = runtime.calls.find((call) => new AppURL(call.url).hostname === 'filemoon.sx');
  assert.equal(new AppURL(apiCall.url).pathname, '/api/videos/fixture01/');
  assert.match(apiCall.init.headers.Referer, /^https:\/\/filemoon\.sx\/e\/fixture01\?poster=/);
  assert.equal(apiCall.init.headers.Accept, 'application/json');
  assert.deepEqual(runtime.warnings, []);
});

test('3.7 domínio filemoon.* alternativo usa a API da própria origem', async () => {
  const runtime = makeRuntime(fullRoute({ filemoonHost: 'filemoon.nl' }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'Filemoon');
  const apiCall = runtime.calls.find((call) => new AppURL(call.url).hostname === 'filemoon.nl');
  assert.equal(new AppURL(apiCall.url).pathname, '/api/videos/fixture01/');
});

test('3.8 playback inválido do Filemoon descarta só a opção e sobe o erro agregado', async () => {
  const runtime = makeRuntime(fullRoute({ filemoonInvalid: true }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[TopAnimes\] Opção Filemoon descartada: key_parts ausente/);
  assert.match(runtime.errors[0], /\[TopAnimes\].*Nenhuma opção produziu stream/);
});

test('4.1 duas variantes de áudio: dublado e legendado com legendas PT', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('209867', 'tv', 1, 1);

  assert.equal(streams.length, 6);
  const dublado = streams.filter((stream) => stream.language === 'Dublado');
  const legendado = streams.filter((stream) => stream.language === 'Legendado');
  assert.equal(dublado.length, 3);
  assert.equal(legendado.length, 3);
  for (const stream of legendado) {
    assert.equal(stream.subtitles.length, 2);
    assert.equal(stream.subtitles[0].language, 'Português');
  }
});

test('4.2 deduplica URL e qualidade entre opções iguais', async () => {
  const runtime = makeRuntime(fullRoute({ duplicate: true }));
  const streams = await runtime.exports.getStreams('1218925', 'movie', null, null);

  assert.equal(streams.length, 3);
  assert.deepEqual(qualities(streams), ['1080p', '720p', '360p']);
});

test('4.3 player desativado não gera stream nem erro', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('129', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('5.1 busca sem resultado é ausência', async () => {
  const runtime = makeRuntime(async (url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: tmdbChihiro };
    if (url.hostname === 'topanimes.net' && url.pathname === '/') return { body: searchNoResult };
    throw new Error('Rota inesperada');
  });
  const streams = await runtime.exports.getStreams('129', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('5.2 busca sem estrutura sobe para getStreams', async () => {
  const runtime = makeRuntime(fullRoute({ searchBroken: true }));
  const streams = await runtime.exports.getStreams('1218925', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[TopAnimes\].*search-page/);
});

test('5.3 ficha sem h1 sobe para getStreams', async () => {
  const runtime = makeRuntime(fullRoute({ detailBroken: true }));
  const streams = await runtime.exports.getStreams('1218925', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[TopAnimes\].*h1/);
});

test('5.4 opção numérica sem iframe é triagem', async () => {
  const runtime = makeRuntime(fullRoute({ brokenOption: true }));
  const streams = await runtime.exports.getStreams('30984', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.errors, []);
});

test('5.5 ficha 404 é candidato removido e não interrompe os demais', async () => {
  const baseRoute = fullRoute();
  const runtime = makeRuntime(async (url) => {
    if (url.pathname === '/animes/solo-leveling-dublado/') return { status: 404, body: 'not found' };
    if (url.pathname === '/episodio/solo-leveling-episodio-1/') return { body: episodeSolo };
    return baseRoute(url);
  });
  const streams = await runtime.exports.getStreams('127532', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  assert.deepEqual(runtime.errors, []);
});

test('6.1 falha de uma opção preserva a outra e gera aviso', async () => {
  const runtime = makeRuntime(fullRoute({ mixedEpisode: true }));
  const streams = await runtime.exports.getStreams('127532', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  assert.equal(streams[0].provider, 'Vidstreaming');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[TopAnimes\] Opção Blogger descartada/);
});

test('6.2 todas as opções falham e o erro agregado sobe', async () => {
  const runtime = makeRuntime(fullRoute({ mixedEpisode: true, bloggerStatus: 500, booonceivuStatus: 500 }));
  const streams = await runtime.exports.getStreams('127532', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.errors[0], /\[TopAnimes\].*Nenhuma opção produziu stream/);
});

test('6.3 todas as opções são triagem e a saída é vazia sem erro', async () => {
  const baseRoute = fullRoute();
  const runtime = makeRuntime(async (url) => {
    if (url.pathname === '/episodio/shingeki-no-kyojin-episodio-1/') return { body: episodeOffline };
    return baseRoute(url);
  });
  const streams = await runtime.exports.getStreams('1429', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('7.1 pacote prism mantém o contrato de nome e título', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('1218925', 'movie', null, null);

  assert.equal(streams.length, 8);
  assert.match(streams[0].name, /FHD 1080p/);
  assert.match(streams[0].title, /TopAnimes/);
  assert.equal(streams[0].url.startsWith('https://'), true);
});

test('7.2 estado de erro do Booonceivu é ausência, não falha', async () => {
  const runtime = makeRuntime(async (url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: tmdbSolo };
    if (url.hostname === 'topanimes.net' && url.pathname === '/') return { body: searchSolo };
    if (url.pathname === '/animes/solo-leveling-dublado/') return { body: detailSolo };
    if (url.pathname === '/animes/solo-leveling/') return { body: detailSoloSub };
    if (url.pathname === '/animes/solo-leveling-2-dublado/') return { body: detailSolo2Dub };
    if (url.pathname === '/animes/solo-leveling-2/') return { body: detailSolo2 };
    if (url.pathname === '/episodio/solo-leveling-dublado-episodio-1/') return { body: episodeSolo };
    if (url.pathname === '/episodio/solo-leveling-episodio-1/') return { body: episodeOffline };
    if (url.pathname === '/episodio/solo-leveling-2-dublado-episodio-1/') return { body: episodeSolo };
    if (url.pathname === '/episodio/solo-leveling-2-episodio-1/') return { body: episodeSolo };
    if (url.hostname === 'sk-boyceta.booonceivu.shop') return { body: playerBooonceivuError };
    throw new Error(`Rota inesperada: ${url.hostname}${url.pathname}`);
  });
  const streams = await runtime.exports.getStreams('127532', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});
