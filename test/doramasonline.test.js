const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'doramasonline');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const SOURCE = 'https://doramasonline.net';
const EP_POUSANDO_1 = `${SOURCE}/br/episodio/pousando-no-amor-temporada-1-episodio-1/`;
const EP_ROUND_6_1 = `${SOURCE}/br/episodio/round-6-squid-game-temporada-1-episodio-1/`;
const MOVIE_SE_ESSE_AMOR = `${SOURCE}/br/filmes/even-if-this-love-disappears-tonight-se-esse-amor-desaparecesse-hoje/`;

const tmdbPousando = readJson('tmdb-pousando.json');
const tmdbParasita = readJson('tmdb-parasita.json');
const tmdbTheGlory = readJson('tmdb-the-glory.json');
const tmdbSeEsseAmor = readJson('tmdb-se-esse-amor.json');
const tmdbRound6 = readJson('tmdb-round-6.json');
const tmdbWallToWall = readJson('tmdb-wall-to-wall.json');
// O TMDB em pt-BR publica "A Lição"; o título inglês é o termo da busca observada nesta fonte.
const tmdbTheGloryNamed = { ...tmdbTheGlory, name: 'The Glory', original_name: 'The Glory' };
const tmdbItaewon = readJson('tmdb-itaewon.json');
const searchPousando = read('search-pousando.html');
const searchItaewon = read('search-itaewon.html');
const searchParasita = read('search-parasita.html');
const searchTheGlory = read('search-the-glory.html');
const searchSeEsseAmor = read('search-se-esse-amor.html');
const searchRound6 = read('search-round-6.html');
const searchRound62023 = read('search-round-6-2023.html');
const searchMeus84 = read('search-meus-84.html');
const searchEmpty = read('search-empty.html');
const searchNoLink = read('search-no-link.html');
const seriesPousando = read('series-pousando.html');
const seriesPousandoNoList = read('series-pousando-no-list.html');
const seriesItaewon = read('series-itaewon.html');
const seriesRound6 = read('series-round-6.html');
const episodePousando = read('episode-pousando-1-1.html');
const episodeItaewon = read('episode-itaewon-16.html');
const episodeRound6 = read('episode-round-6-1-1.html');
const episodeTrailerOnly = read('episode-trailer-only.html');
const episodeMissingContainer = read('episode-missing-container.html');
const movieParasita = read('movie-parasita.html');
const movieSeEsseAmor = read('movie-se-esse-amor.html');
const movieWallToWall = read('movie-wall-to-wall.html');
const booonceivuDubbed = readJson('booonceivu-dubbed.json');
const booonceivuSubtitled = readJson('booonceivu-subtitled.json');
const booonceivuHtml = read('booonceivu-html.html');
const booonceivuInvalid = read('booonceivu-invalid.json');
const incvideoEmbed = read('incvideo-embed.html');
const incvideoEmbed907183 = read('incvideo-embed-907183.html');
const incvideoEmbed798109 = read('incvideo-embed-798109.html');
const incvideoEmbed966542 = read('incvideo-embed-966542.html');
const incvideoEmbed966543 = read('incvideo-embed-966543.html');
const incvideoNoPlayerjs = read('incvideo-no-playerjs.html');
const doV4 = read('do-v4-warning.html');
const aviso = read('aviso-strp2p.html');

const manifest = readJsonFromRoot('manifest.json');
const NOT_FOUND = '<!DOCTYPE html><html><body><h1>Página não encontrada</h1></body></html>';

let codes = {};

test.before(async () => {
  const outDir = createTempDir('doramasonline-test-');
  try {
    codes.base = fs.readFileSync(await buildProvider('doramasonline', { outDir }), 'utf8');
    codes.gdrive = fs.readFileSync(await buildProvider('doramasonline', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('doramasonline', { outDir, formatter: 'prism' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function readJsonFromRoot(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
}

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function makeResponse(result, requestUrl) {
  const status = result.status === undefined ? 200 : result.status;
  const headers = result.headers || {};
  const body = result.body === undefined || result.body === null
    ? ''
    : typeof result.body === 'string'
      ? result.body
      : JSON.stringify(result.body);
  return {
    ok: status >= 200 && status < 300,
    status,
    url: result.url || requestUrl,
    headers: {
      get: (name) => {
        const key = String(name).toLowerCase();
        return Object.prototype.hasOwnProperty.call(headers, key) ? headers[key] : null;
      },
      getSetCookie: () => result.setCookies || [],
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

async function dispatch(route, url, init) {
  const result = await route(new AppURL(url), init);
  if (result instanceof Error) throw result;
  if (result === undefined) throw new Error(`Rota inesperada: ${url}`);
  const status = result.status === undefined ? 200 : result.status;
  if (init.redirect === 'follow' && status >= 300 && status < 400 && result.headers && result.headers.location) {
    return dispatch(route, new URL(result.headers.location, url).href, init);
  }
  return makeResponse(result, url);
}

function makeRuntime(route = fullRoute(), bundle = codes.gdrive) {
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
      if (name === 'cheerio-without-node-native') return { load };
      throw new Error(`require inesperado: ${name}`);
    },
    console: {
      error: (message) => errors.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      log: () => {},
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      return dispatch(route, String(url), init || {});
    },
  };
  vm.runInNewContext(bundle, context);
  return { exports: context.module.exports, calls, errors, warnings };
}

function tmdbBody(url) {
  if (url.pathname.endsWith('/tv/94796')) return tmdbPousando;
  if (url.pathname.endsWith('/tv/96162')) return tmdbItaewon;
  if (url.pathname.endsWith('/tv/136283')) return tmdbTheGloryNamed;
  if (url.pathname.endsWith('/tv/93405')) return tmdbRound6;
  if (url.pathname.endsWith('/movie/496243')) return tmdbParasita;
  if (url.pathname.endsWith('/movie/1466115')) return tmdbSeEsseAmor;
  if (url.pathname.endsWith('/movie/1269208')) return tmdbWallToWall;
  throw new Error(`TMDB inesperado: ${url.pathname}`);
}

function searchBody(term) {
  if (term === 'Pousando no Amor') return searchPousando;
  if (term === 'Itaewon Class') return searchItaewon;
  if (term === 'Parasita') return searchParasita;
  if (term === 'The Glory') return searchTheGlory;
  if (term === 'Se Esse Amor Desaparecesse Hoje') return searchSeEsseAmor;
  if (term === 'Round 6') return searchRound6;
  if (term === 'Meus 84 m²') return searchMeus84;
  return searchEmpty;
}

function detailBody(pathname) {
  if (pathname === '/br/series/pousando-no-amor/') return seriesPousando;
  if (pathname === '/br/series/itaewon-class/') return seriesItaewon;
  if (pathname === '/br/series/round-6-squid-game/') return seriesRound6;
  if (pathname === '/br/filmes/parasita/') return movieParasita;
  if (pathname === '/br/filmes/even-if-this-love-disappears-tonight-se-esse-amor-desaparecesse-hoje/') return movieSeEsseAmor;
  if (pathname.startsWith('/br/filmes/wall-to-wall-meus-84-m')) return movieWallToWall;
  return null;
}

function episodeBody(pathname) {
  if (pathname === '/br/episodio/pousando-no-amor-temporada-1-episodio-1/') return episodePousando;
  if (pathname === '/br/episodio/itaewon-class-temporada-1-episodio-16-final/') return episodeItaewon;
  if (pathname === '/br/episodio/round-6-squid-game-temporada-1-episodio-1/') return episodeRound6;
  return null;
}

function booonceivuBody(url) {
  const id = url.searchParams.get('id') || '';
  if (id.startsWith('7MLr')) return booonceivuDubbed;
  if (id.startsWith('OuGb')) return booonceivuSubtitled;
  return id.startsWith('2WVa') ? booonceivuDubbed : booonceivuSubtitled;
}

function fullRoute(overrides = {}) {
  return async (url) => {
    const host = url.hostname;
    if (host === 'api.themoviedb.org') return { body: tmdbBody(url) };

    if (host === 'doramasonline.net') {
      if (url.pathname === '/' && url.searchParams.get('s') !== null) {
        if (overrides.search) return overrides.search(url);
        return { body: searchBody(url.searchParams.get('s')) };
      }
      if (url.pathname.startsWith('/br/series/') || url.pathname.startsWith('/br/filmes/')) {
        if (overrides.detail) return overrides.detail(url);
        const body = detailBody(url.pathname);
        return body === null ? { status: 404, body: NOT_FOUND } : { body };
      }
      if (url.pathname.startsWith('/br/episodio/')) {
        if (overrides.episode) return overrides.episode(url);
        const body = episodeBody(url.pathname);
        return body === null ? { status: 404, body: NOT_FOUND } : { body };
      }
      if (url.pathname === '/aviso/' || url.pathname === '/aviso') return { body: aviso };
      if (url.pathname.startsWith('/do/')) {
        if (overrides.internal) return overrides.internal(url);
        return { body: doV4, headers: { 'content-type': 'text/html; charset=UTF-8' } };
      }
      throw new Error(`Rota inesperada no site: ${url.pathname}`);
    }

    if (host.endsWith('booonceivu.shop')) {
      if (overrides.booonceivu) return overrides.booonceivu(url);
      if (host.startsWith('ru-')) return { body: booonceivuHtml, headers: { 'content-type': 'text/html; charset=UTF-8' } };
      return { body: booonceivuBody(url), headers: { 'content-type': 'application/json; charset=utf-8' } };
    }

    if (host === 'csst.online') {
      if (overrides.csst) return overrides.csst(url);
      const id = /\/embed\/(\d+)/.exec(url.pathname)[1];
      return { status: 301, headers: { location: `https://incvideo1.online/embed/${id}/` }, body: '' };
    }

    if (host === 'incvideo1.online' || host === 'www.incvideo1.online') {
      if (url.pathname.startsWith('/get_file/')) {
        if (overrides.getFile) return overrides.getFile(url);
        return {
          status: 302,
          headers: { location: `https://a92.filevideo1.com/remote_control.php?file=${encodeURIComponent(url.pathname)}` },
          body: '',
        };
      }
      if (overrides.embed) return overrides.embed(url);
      const id = /\/embed\/(\d+)/.exec(url.pathname)[1];
      const embedBody = id === '798109'
        ? incvideoEmbed798109
        : id === '966542'
          ? incvideoEmbed966542
          : id === '966543'
            ? incvideoEmbed966543
            : id === '907183'
              ? incvideoEmbed907183
              : incvideoEmbed;
      return {
        url: `https://incvideo1.online/embed/${id}/`,
        body: embedBody,
        headers: { 'content-type': 'text/html; charset=UTF-8', 'set-cookie': 'PHPSESSID=fixture; path=/' },
        setCookies: ['PHPSESSID=fixture; path=/', 'kt_ips=127.0.0.1; path=/'],
      };
    }

    if (host === 'a92.filevideo1.com') {
      if (overrides.media) return overrides.media(url);
      return { status: 206, headers: { 'content-type': 'video/mp4' }, body: 'ftyp', url: url.href };
    }

    if (host === 'png.strp2p.com') throw new Error('png.strp2p.com não deveria ser requisitado');
    throw new Error(`Host inesperado: ${host}`);
  };
}

function callCount(calls, fragment) {
  return calls.filter((call) => call.url.includes(fragment)).length;
}

function callsToPath(calls, pathname) {
  return calls.filter((call) => new URL(call.url).pathname === pathname).length;
}

function callsToHost(calls, host) {
  return calls.filter((call) => new URL(call.url).hostname === host);
}

function streamByLanguage(streams, language) {
  return streams.filter((stream) => stream.language === language);
}

test('manifesto registra o Doramas Online com filme e série', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'doramasonline');
  assert.ok(entry);
  assert.equal(entry.name, 'Doramas Online');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8', 'mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.logo, 'https://www.google.com/s2/favicons?domain=doramasonline.net&sz=128');
});

test('série confirma título e ano e resolve as duas opções Booonceivu', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0, runtime.warnings.join(' | '));
  assert.equal(streams.length, 6);
  assert.deepEqual([...streams.map((stream) => stream.quality)], ['1080p', '1080p', '720p', '720p', '360p', '360p']);
  assert.deepEqual([...streams.map((stream) => stream.language)], ['Dublado', 'Legendado', 'Dublado', 'Legendado', 'Dublado', 'Legendado']);
  for (const stream of streams) {
    assert.equal(stream.type, 'hls');
    assert.equal(stream.provider, 'Booonceivu');
    assert.equal('headers' in stream, false);
    assert.equal('size' in stream, false);
    assert.equal('seeders' in stream, false);
    assert.equal('peers' in stream, false);
    assert.equal('infoHash' in stream, false);
    assert.equal('format' in stream, false);
    assert.ok(stream.name.length > 0);
    assert.match(stream.title, /🌐 HTTP/);
    assert.match(stream.title, /Pousando no Amor/);
    assert.match(stream.title, /\(2019\)/);
    assert.match(stream.title, /T01E01/);
  }

  const dubbed = streamByLanguage(streams, 'Dublado');
  const subtitled = streamByLanguage(streams, 'Legendado');
  assert.equal(dubbed.length, 3);
  assert.equal(subtitled.length, 3);
  assert.equal(dubbed.every((stream) => !('subtitles' in stream)), true);
  for (const stream of subtitled) {
    const portuguese = stream.subtitles.find((subtitle) => subtitle.name === 'Português');
    const english = stream.subtitles.find((subtitle) => subtitle.name === 'English');
    assert.deepEqual({ ...portuguese }, {
      url: 'https://sk-boyceta.booonceivu.shop/legenda.vtt?url=fixture-9',
      language: 'pt-BR',
      name: 'Português',
    });
    assert.equal(english.language, 'English');
    assert.equal(english.name, 'English');
  }

  assert.equal(callsToHost(runtime.calls, 'data-limit-c.solo-latino.com').length, 0);
  assert.equal(callsToHost(runtime.calls, 'akm-cdn-play-web.onfilom.com').length, 0);
  const playerCalls = callsToHost(runtime.calls, 'sk-boyceta.booonceivu.shop');
  assert.equal(playerCalls.length, 2);
  for (const call of playerCalls) {
    assert.equal(new URL(call.url).searchParams.get('mode'), 'to-salvando-seu-ip');
    assert.equal(call.init.headers.Referer, EP_POUSANDO_1);
  }
  assert.equal(callsToPath(runtime.calls, '/br/series/pousando-no-amor/'), 1);
  assert.equal(callsToPath(runtime.calls, '/br/episodio/pousando-no-amor-temporada-1-episodio-1/'), 1);
});

test('série usa o href publicado com sufixo final e descarta o player interno quebrado', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('96162', 'tv', 1, 16);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Doramas Online\]/);
  assert.match(runtime.errors[0], /Nenhuma opção de player produziu stream/);
  assert.match(runtime.errors[0], /em vez de JSON/);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Doramas Online\] Opção LEGENDADO descartada:/);
  assert.equal(callsToPath(runtime.calls, '/br/episodio/itaewon-class-temporada-1-episodio-16-final/'), 1);
  assert.equal(callsToPath(runtime.calls, '/br/episodio/itaewon-class-temporada-1-episodio-16/'), 0);
});

test('filme Parasita confirma título e ano, tria os avisos e resolve os dois IncVideo', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('496243', 'movie', null, null);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0, runtime.warnings.join(' | '));
  assert.equal(streams.length, 5);
  assert.deepEqual([...streams.map((stream) => stream.type)], ['mp4', 'mp4', 'mp4', 'mp4', 'mp4']);
  assert.deepEqual([...streams.map((stream) => stream.provider)], ['IncVideo', 'IncVideo', 'IncVideo', 'IncVideo', 'IncVideo']);
  assert.deepEqual([...streams.map((stream) => stream.quality)], ['1080p', '720p', '720p', '360p', '360p']);
  assert.deepEqual([...streams.map((stream) => stream.language)], ['Legendado', 'Dublado', 'Legendado', 'Dublado', 'Legendado']);
  for (const stream of streams) {
    assert.equal('headers' in stream, false);
    assert.equal('subtitles' in stream, false);
    assert.ok(stream.url.startsWith('https://a92.filevideo1.com/remote_control.php?file='));
    assert.ok(stream.name.length > 0);
    assert.match(stream.title, /🌐 HTTP/);
    assert.match(stream.title, /🗣️ (Dublado|Legendado)/);
    assert.doesNotMatch(stream.title, /T01E01/);
  }

  const prismRuntime = makeRuntime(fullRoute(), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams('496243', 'movie', null, null);
  assert.equal(prismStreams.length, 5);
  assert.match(prismStreams[0].title, /Parasita/);
  assert.match(prismStreams[0].title, /\(2019\)/);
  assert.doesNotMatch(prismStreams[0].title, /T\d{2}E\d{2}/);

  assert.equal(callCount(runtime.calls, '/aviso/'), 0);
  assert.equal(callsToHost(runtime.calls, 'png.strp2p.com').length, 0);
  const getFileCalls = callsToHost(runtime.calls, 'www.incvideo1.online').filter((call) => call.url.includes('/get_file/'));
  assert.equal(getFileCalls.length, 5);
  for (const call of getFileCalls) {
    assert.equal(call.init.redirect, 'manual');
    assert.equal(call.init.headers.Referer, 'https://incvideo1.online/embed/' + (call.url.includes('907183') ? '907183' : '907184') + '/');
    assert.match(call.init.headers.Cookie, /PHPSESSID=fixture/);
  }
  const mediaCalls = callsToHost(runtime.calls, 'a92.filevideo1.com');
  assert.equal(mediaCalls.length, 5);
  for (const call of mediaCalls) {
    assert.equal(call.init.headers.Range, 'bytes=0-0');
    assert.equal('Referer' in call.init.headers, false);
    assert.equal('Cookie' in call.init.headers, false);
  }
  assert.equal(callsToPath(runtime.calls, '/br/filmes/parasita/'), 1);
});

test('filme com título decorado confirma a ficha e resolve Booonceivu e IncVideo', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('1466115', 'movie', null, null);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.warnings[0], /^\[Doramas Online\] Opção DUBLADO \(2\) descartada:/);
  assert.match(runtime.warnings[0], /em vez de JSON/);
  assert.match(runtime.warnings[1], /^\[Doramas Online\] Opção LEGENDADO \(2\) descartada:/);
  assert.match(runtime.warnings[1], /em vez de JSON/);
  assert.equal(streams.length, 12);

  const hls = streams.filter((stream) => stream.type === 'hls');
  const mp4 = streams.filter((stream) => stream.type === 'mp4');
  assert.equal(hls.length, 6);
  assert.equal(mp4.length, 6);
  assert.equal(hls.every((stream) => stream.provider === 'Booonceivu'), true);
  assert.equal(mp4.every((stream) => stream.provider === 'IncVideo'), true);
  assert.equal(streamByLanguage(streams, 'Dublado').length, 6);
  assert.equal(streamByLanguage(streams, 'Legendado').length, 6);
  assert.equal(streams.filter((stream) => stream.quality === '1080p').length, 4);
  assert.equal(streams.filter((stream) => stream.quality === '720p').length, 4);
  assert.equal(streams.filter((stream) => stream.quality === '360p').length, 4);
  assert.equal(streams.filter((stream) => 'subtitles' in stream).length, 3);
  for (const stream of streams) {
    assert.equal('headers' in stream, false);
    assert.equal('format' in stream, false);
    assert.match(stream.title, /Se Esse Amor Desaparecesse Hoje/);
    assert.match(stream.title, /\(2025\)/);
    assert.doesNotMatch(stream.title, /T\d{2}E\d{2}/);
  }

  assert.equal(callsToHost(runtime.calls, 'ru-boyceta.booonceivu.shop').length, 2);
  assert.equal(callsToHost(runtime.calls, 'abyssplayer.com').length, 0);
  assert.equal(callsToHost(runtime.calls, 'png.strp2p.com').length, 0);
  assert.equal(callCount(runtime.calls, MOVIE_SE_ESSE_AMOR), 1);
});

test('série com título decorado confirma a ficha e tria os players q1n', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('93405', 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0);
  assert.equal(streams.length, 2);
  assert.deepEqual([...streams.map((stream) => stream.type)], ['mp4', 'mp4']);
  assert.deepEqual([...streams.map((stream) => stream.provider)], ['IncVideo', 'IncVideo']);
  assert.deepEqual([...streams.map((stream) => stream.quality)], ['720p', '360p']);
  assert.deepEqual([...streams.map((stream) => stream.language)], ['Legendado', 'Legendado']);
  for (const stream of streams) {
    assert.equal('headers' in stream, false);
    assert.match(stream.title, /Round 6/);
    assert.match(stream.title, /\(2021\)/);
    assert.match(stream.title, /T01E01/);
  }

  assert.equal(callsToHost(runtime.calls, 'q1n.net').length, 0);
  assert.equal(callsToPath(runtime.calls, '/br/series/round-6-squid-game/'), 1);
  assert.equal(callCount(runtime.calls, EP_ROUND_6_1), 1);
});

test('filme decorado sem mídia suportada confirma a identidade e devolve lista vazia', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('1269208', 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0);
  assert.equal(callCount(runtime.calls, '/br/filmes/wall-to-wall-meus-84-m'), 1);
  assert.equal(callsToHost(runtime.calls, 'png.strp2p.com').length, 0);
});

test('título decorado não supera ano divergente', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchRound62023 }) }));
  const streams = await runtime.exports.getStreams('93405', 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0);
  assert.equal(callsToPath(runtime.calls, '/br/series/round-6-squid-game/'), 0);
});

test('The Glory de 2025 é rejeitado pelo ano do TMDB de 2022', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('136283', 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0);
  assert.equal(callCount(runtime.calls, '/?s=The%20Glory'), 1);
  assert.equal(callsToPath(runtime.calls, '/br/series/the-glory/'), 0);
});

test('título ausente devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchEmpty }) }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
});

test('tipo conflitante é descartado por triagem', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchPousando }) }));
  const streams = await runtime.exports.getStreams('496243', 'movie', null, null);
  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
});

test('cartão sem link é falha de estrutura registrada', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchNoLink }) }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Doramas Online\]/);
  assert.match(runtime.errors[0], /sem link/);
});

test('busca fora do ar sobe para getStreams e devolve lista vazia', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ status: 503, body: 'indisponível' }) }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Doramas Online\]/);
  assert.match(runtime.errors[0], /HTTP 503/);
});

test('temporada ausente devolve lista vazia sem abrir episódio', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('94796', 'tv', 2, 1);
  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(callCount(runtime.calls, '/temporada-2/episodio-1/'), 0);
});

test('ficha sem lista de episódios é falha de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ detail: () => ({ body: seriesPousandoNoList }) }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /sem lista de episódios/);
});

test('só trailer devolve lista vazia sem aviso', async () => {
  const runtime = makeRuntime(fullRoute({ episode: () => ({ body: episodeTrailerOnly }) }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0);
});

test('opção sem contêiner é descartada e preserva a outra', async () => {
  const runtime = makeRuntime(fullRoute({ episode: () => ({ body: episodeMissingContainer }) }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Doramas Online\] Opção LEGENDADO descartada:/);
  assert.match(runtime.warnings[0], /#source-player-2/);
  assert.equal(streams.length, 3);
  assert.equal(streams.every((stream) => stream.language === 'Dublado'), true);
});

test('status diferente de success é ausência da opção', async () => {
  const runtime = makeRuntime(fullRoute({
    booonceivu: (url) => {
      if ((url.searchParams.get('id') || '').startsWith('2WVa')) return { body: booonceivuBody(url), headers: { 'content-type': 'application/json' } };
      return { body: { status: 'error' }, headers: { 'content-type': 'application/json' } };
    },
  }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0);
  assert.equal(streams.length, 3);
  assert.equal(streams.every((stream) => stream.language === 'Dublado'), true);
});

test('JSON inválido de uma opção é falha isolada', async () => {
  const runtime = makeRuntime(fullRoute({
    booonceivu: (url) => {
      if ((url.searchParams.get('id') || '').startsWith('2WVa')) return { body: booonceivuBody(url), headers: { 'content-type': 'application/json' } };
      return { body: booonceivuInvalid, headers: { 'content-type': 'application/json' } };
    },
  }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Doramas Online\] Opção LEGENDADO descartada:/);
  assert.match(runtime.warnings[0], /JSON inválido/);
  assert.equal(streams.length, 3);
});

test('todas as opções quebradas sobem o erro agregado', async () => {
  const runtime = makeRuntime(fullRoute({
    booonceivu: () => ({ body: booonceivuInvalid, headers: { 'content-type': 'application/json' } }),
  }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Doramas Online\]/);
  assert.match(runtime.errors[0], /Nenhuma opção de player produziu stream/);
  assert.equal(runtime.warnings.length, 2);
});

test('IncVideo com uma fonte 404 preserva as outras', async () => {
  const runtime = makeRuntime(fullRoute({
    getFile: (url) => (url.pathname.includes('907184_360p')
      ? { status: 404, body: 'not found' }
      : {
        status: 302,
        headers: { location: `https://a92.filevideo1.com/remote_control.php?file=${encodeURIComponent(url.pathname)}` },
        body: '',
      }),
  }));
  const streams = await runtime.exports.getStreams('496243', 'movie', null, null);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0);
  assert.equal(streams.length, 4);
  assert.equal(streams.some((stream) => stream.quality === '360p' && stream.language === 'Legendado'), false);
});

test('embed IncVideo sem Playerjs é falha da opção e a outra resolve', async () => {
  const runtime = makeRuntime(fullRoute({
    embed: (url) => (url.pathname.includes('907183')
      ? { body: incvideoNoPlayerjs, headers: { 'content-type': 'text/html' }, url: url.href }
      : {
        url: 'https://incvideo1.online/embed/907184/',
        body: incvideoEmbed,
        headers: { 'content-type': 'text/html', 'set-cookie': 'PHPSESSID=fixture' },
        setCookies: ['PHPSESSID=fixture'],
      }),
  }));
  const streams = await runtime.exports.getStreams('496243', 'movie', null, null);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Doramas Online\] Opção DUBLADO \(2\) descartada:/);
  assert.match(runtime.warnings[0], /Playerjs/);
  assert.equal(streams.length, 3);
  assert.equal(streams.every((stream) => stream.language === 'Legendado'), true);
});

test('entrada inválida é rejeitada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(() => { throw new Error('fetch inesperado'); });
  assert.equal((await runtime.exports.getStreams('abc', 'movie', null, null)).length, 0);
  assert.equal((await runtime.exports.getStreams('94796', 'anime', 1, 1)).length, 0);
  assert.equal((await runtime.exports.getStreams('94796', 'tv', null, 1)).length, 0);
  assert.equal((await runtime.exports.getStreams('94796', 'tv', 0, 1)).length, 0);

  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, 4);
});

test('pacote base exporta getStreams e gera name e title pelo formatador', async () => {
  const runtime = makeRuntime(fullRoute(), codes.base);
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(streams.length, 6);
  assert.equal(streams.every((stream) => stream.name.length > 0 && stream.title.length > 0), true);
});

test('variante Prism gera name e title com qualidade e idioma', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);
  assert.equal(streams.length, 6);
  const [first] = streams;
  assert.match(first.name, /1080p|FHD/);
  assert.match(first.title, /🗣️ Dublado/);
  assert.match(first.title, /T01E01/);
});

test('/aviso/ com destino csst.online segue o fluxo IncVideo', async () => {
  const avisoEpisode = episodePousando.replace(
    /src="https:\/\/sk-boyceta\.booonceivu\.shop\/[^"]*"/g,
    'src="https://doramasonline.net/aviso/?url=https%3A%2F%2Fcsst.online%2Fembed%2F907184%2F"',
  );
  const runtime = makeRuntime(fullRoute({ episode: () => ({ body: avisoEpisode }) }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0, runtime.warnings.join(' | '));
  assert.equal(streams.length, 6);
  assert.equal(streams.every((stream) => stream.type === 'mp4' && stream.provider === 'IncVideo'), true);
  assert.equal(callsToHost(runtime.calls, 'sk-boyceta.booonceivu.shop').length, 0);
});

test('rótulo desconhecido com legenda English mantém idioma desconhecido', async () => {
  const unknownEpisode = episodePousando
    .replace('<span class="title">DUBLADO</span>', '<span class="title">OPÇÃO 1</span>')
    .replace('<span class="title">LEGENDADO</span>', '<span class="title">OPÇÃO 2</span>');
  const englishOnly = {
    status: 'success',
    midias: [{ qualidade: 'SD', url: booonceivuDubbed.midias[0].url }],
    legendas: [{ label: 'English', url: 'https://sk-boyceta.booonceivu.shop/legenda.vtt?url=fixture-en' }],
  };
  const runtime = makeRuntime(fullRoute({
    episode: () => ({ body: unknownEpisode }),
    booonceivu: () => ({ body: englishOnly, headers: { 'content-type': 'application/json' } }),
  }));
  const streams = await runtime.exports.getStreams('94796', 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0);
  assert.equal(streams.length, 2);
  for (const stream of streams) {
    assert.equal(stream.language, 'Idioma Desconhecido');
    assert.deepEqual([...stream.subtitles.map((subtitle) => subtitle.language)], ['English']);
    assert.deepEqual([...stream.subtitles.map((subtitle) => subtitle.name)], ['English']);
  }
});

test('fixtures são sanitizadas e mantêm os marcadores da fonte', () => {
  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /hdnts=|X-Amz-|signature=|token=|PHPSESSID=|Cookie:/i, name);
  }
  assert.match(read('booonceivu-subtitled.json'), /"Português"/);
  assert.match(read('booonceivu-subtitled.json'), /"English"/);
  assert.match(read('incvideo-embed.html'), /\/get_file\//);
  assert.match(read('incvideo-embed-798109.html'), /\/get_file\//);
  assert.match(read('movie-se-esse-amor.html'), /Even If This Love Disappears Tonight \(Se Esse Amor Desaparecesse Hoje\)/);
  assert.match(read('series-round-6.html'), /episodio-9-final/);
  assert.match(read('episode-round-6-1-1.html'), /q1n\.net/);
  assert.match(read('series-itaewon.html'), /episodio-16-final/);
});
