const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const codes = {};
let hostsCode;
let siteCode;
let domainCode;

test.before(async () => {
  const outDir = createTempDir('overflix-test-');
  try {
    const gdriveDir = path.join(outDir, 'gdrive');
    const prismDir = path.join(outDir, 'prism');
    fs.mkdirSync(gdriveDir);
    fs.mkdirSync(prismDir);
    codes.gdrive = fs.readFileSync(await buildProvider('overflix', { outDir: gdriveDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('overflix', { outDir: prismDir, formatter: 'prism' }), 'utf8');

    const esbuild = require('esbuild');
    for (const [name, entry] of [['hosts', 'src/overflix/hosts.js'], ['site', 'src/overflix/site.js'], ['domain', 'src/overflix/domain.js']]) {
      const build = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'neutral',
        external: ['cheerio-without-node-native'],
      });
      const text = build.outputFiles[0].text;
      if (name === 'hosts') hostsCode = text;
      if (name === 'site') siteCode = text;
      if (name === 'domain') domainCode = text;
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

class AppURLSearchParams {
  constructor(init) {
    this._params = {};
    if (init && typeof init === 'object' && !Array.isArray(init)) {
      for (const key of Object.keys(init)) this._params[key] = String(init[key]);
    } else if (typeof init === 'string') {
      for (const pair of init.replace(/^\?/, '').split('&')) {
        const parts = pair.split('=');
        if (parts[0]) this._params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
      }
    }
  }

  toString() {
    return Object.keys(this._params).map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(this._params[key])}`).join('&');
  }

  get(key) { return Object.hasOwn(this._params, key) ? this._params[key] : null; }

  entries() { return Object.keys(this._params).map((key) => [key, this._params[key]]); }
}

function runtime(route = () => { throw new Error('fetch inesperado'); }, key = 'chave-ficticia', bundle = codes.gdrive, overrides = {}) {
  const calls = [];
  const errors = [];
  const infos = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    TMDB_API_KEY: key,
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    console: {
      error: (message) => errors.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      log: (message) => infos.push(String(message)),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init);
      if (result instanceof Error) throw result;
      const text = typeof result === 'string' ? result : typeof result?.body === 'string' ? result.body : JSON.stringify(result?.body ?? result);
      return {
        ok: !result?.status || result.status < 400,
        status: result?.status || 200,
        url: result?.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  Object.assign(context, overrides);
  vm.runInNewContext(bundle, context);
  return {
    context,
    calls,
    errors,
    infos,
    warnings,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/overflix', name), 'utf8');
const site = (route) => runtime(route, undefined, siteCode).context.module.exports;
const hosts = (route) => runtime(route, undefined, hostsCode).context.module.exports;

function mockTmdb({ title = 'Duna', originalTitle = 'Dune', year = 2021, imdbId = 'tt1160419' } = {}) {
  return {
    title,
    original_title: originalTitle,
    release_date: `${year}-10-01`,
    name: title,
    original_name: originalTitle,
    first_air_date: `${year}-01-01`,
    external_ids: { imdb_id: imdbId },
    alternative_titles: { titles: [], results: [] },
  };
}

const HOST = 'www.overflix.center';
const FALLBACK_HOST = 'www.overflix.download';

function seriesCard(host = HOST) {
  return `<a href="https://${host}/series/online/breaking-bad-dublado-30207/" class="block" title="Assistir Breaking Bad"><div class="blocktwo"><div class="top"><div>HD</div></div><div class="info"><h3>Breaking Bad</h3><p>2008</p></div></div></a>`;
}

function fullRoute(mediaType = 'movie') {
  return (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (mediaType === 'tv') {
        return { body: mockTmdb({ title: 'Breaking Bad', originalTitle: 'Breaking Bad', year: 2008 }) };
      }
      return { body: mockTmdb() };
    }
    if (url.hostname === 'www.overflix.win') {
      return { body: fixture('home.html'), url: `https://${HOST}/` };
    }
    if (url.searchParams.get('do') === 'buscarContent') {
      if (mediaType === 'tv') return { body: { html: seriesCard(url.hostname) } };
      const search = JSON.parse(fixture('search_movie.json'));
      return { body: { ...search, html: search.html.replaceAll(HOST, url.hostname) } };
    }
    if (url.pathname.includes('/filmes/online/duna-dublado-171')) {
      return fixture('movie.html');
    }
    if (url.pathname.includes('/series/online/breaking-bad-dublado-30207')) {
      return fixture('series.html');
    }
    if (url.searchParams.get('do') === 'episodesList') {
      if (url.searchParams.get('audio') === 'Legendado') return { body: JSON.parse(fixture('episodes_leg.json')) };
      return { body: JSON.parse(fixture('episodes_dub.json')) };
    }
    if (url.searchParams.get('do') === 'playerData') {
      return { body: JSON.parse(fixture('player_data.json')) };
    }
    if (url.hostname === 'mxdrop.click' || url.hostname === 'mixdrop.top') {
      return { body: fixture('mixdrop_embed.html'), url: `https://${url.hostname}${url.pathname}` };
    }
    if (url.hostname === 'streamtape.com') {
      return fixture('streamtape_embed.html');
    }
    if (url.hostname === 'playmogo.com') {
      if (url.pathname.startsWith('/pass_md5/')) return 'https://cdn.example/u5kj/video~';
      return { body: fixture('doodstream_embed.html'), url: 'https://playmogo.com/e/dood_leg_005' };
    }
    throw new Error(`Requisição inesperada: ${url}`);
  };
}

function indexCalls(app, host) {
  return app.calls.filter((call) => {
    const parsed = new URL(call.url);
    return parsed.hostname === host && parsed.pathname === '/index.php';
  });
}

// 1.1 Fronteira: CommonJS, sem rede no carregamento, entrada e chave
test('1.1 carregamento CommonJS sem rede, coordenadas inválidas e TMDB key ausente', async () => {
  const app = runtime();
  assert.equal(typeof app.context.module.exports.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(codes.gdrive, /\basync\s+function\b|\bawait\s/);

  for (const [season, episode] of [[null, 1], [0, 1], [1, -1], ['2', 3], [2, 1.5]]) {
    assert.deepEqual(await app.getStreams('100', 'tv', season, episode), []);
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.errors.length, 5);
  assert.ok(app.errors.every((line) => line.includes('[OverFlix] Falha em')));

  for (const id of [null, '', 'abc', '0', '-5']) {
    assert.deepEqual(await app.getStreams(id, 'movie', null, null), []);
  }
  assert.equal(app.calls.length, 0);

  assert.deepEqual(await app.getStreams('100', 'anime', null, null), []);
  assert.equal(app.calls.length, 0);

  const noKey = runtime(undefined, '');
  assert.deepEqual(await noKey.getStreams('100', 'movie', null, null), []);
  assert.equal(noKey.calls.length, 0);
  assert.match(noKey.errors[0], /TMDB_API_KEY indisponível/);
});

// 1.3, 1.4, 7.4, 7.5 Manifest e pacotes gerados
test('1.3, 1.4 e 7.4 manifest e pacotes gerados anunciam o OverFlix', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'manifest.json'), 'utf8'));
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'overflix');
  assert.ok(entry);
  assert.equal(entry.name, 'OverFlix');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/overflix.js');
  assert.match(entry.logo, /^https:\/\//);
  for (const file of ['providers/overflix.js', 'gdrive/providers/overflix.js', 'prism/providers/overflix.js']) {
    const { getStreams } = require(path.join(__dirname, '..', file));
    assert.equal(typeof getStreams, 'function', file);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'providers/overflix.js'), 'utf8'), /\basync\s+function\b|\bawait\s/);
});

// 2.1 Descoberta por redirect e por payload
test('2.1 descoberta por redirect usa o host final em todas as requisições', async () => {
  const app = runtime(fullRoute('movie'));
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0, app.errors.join(' | '));

  assert.equal(new URL(app.calls[1].url).hostname, 'www.overflix.win');
  const afterSeed = app.calls.slice(2).filter((call) => {
    const hostname = new URL(call.url).hostname;
    return hostname !== 'api.themoviedb.org' && !['mxdrop.click', 'mixdrop.top', 'streamtape.com', 'playmogo.com', 'cdn.example'].includes(hostname);
  });
  assert.ok(afterSeed.every((call) => new URL(call.url).hostname === HOST));
  assert.ok(afterSeed.some((call) => call.url.includes('do=buscarContent')));
  assert.ok(afterSeed.some((call) => call.url.includes('do=playerData')));
  assert.equal(indexCalls(app, 'www.overflix.win').length, 0);
});

test('2.1 descoberta por payload Base64 duplo decodifica o host', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname === 'www.overflix.win') return fixture('home_payload.html');
    return route(url, init);
  });
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0, app.errors.join(' | '));
  assert.ok(app.calls.some((call) => new URL(call.url).hostname === HOST && call.url.includes('buscarContent')));
});

test('2.1 payload com baseUrl já em HTTP(S) usa a URL como veio', async () => {
  const payload = Buffer.from(JSON.stringify({ baseUrl: `https://${HOST}` })).toString('base64');
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname === 'www.overflix.win') {
      return `<html><script>window.domainAlertPayload = "${payload}";</script></html>`;
    }
    return route(url, init);
  });
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0, app.errors.join(' | '));
});

test('2.1 falha da semente usa o fallback e continua a chamada', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname === 'www.overflix.win') throw new Error('semente fora do ar');
    return route(url, init);
  });
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0, app.errors.join(' | '));
  assert.ok(app.calls.some((call) => new URL(call.url).hostname === FALLBACK_HOST && call.url.includes('buscarContent')));
  assert.ok(app.calls.every((call) => new URL(call.url).hostname !== HOST));
});

test('2.1 payload ausente ou inválido cai no fallback', async () => {
  for (const html of [fixture('home.html'), '<html><script>window.domainAlertPayload = "invalido";</script></html>']) {
    const app = runtime((url) => {
      if (url.hostname === 'www.overflix.win') return { body: html, url: url.href };
      throw new Error('não deveria consultar a fonte');
    }, undefined, domainCode);
    assert.equal(await app.context.module.exports.discoverDomain(), 'https://www.overflix.download');
  }
});

test('2.3 duas chamadas executam duas descobertas e usam hosts independentes', async () => {
  let seedCalls = 0;
  const searchHosts = [];
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: mockTmdb() };
    if (url.hostname === 'www.overflix.win') {
      seedCalls++;
      return { body: fixture('home.html'), url: seedCalls === 1 ? `https://${HOST}/` : 'https://www.overflix.lat/' };
    }
    if (url.searchParams.get('do') === 'buscarContent') {
      searchHosts.push(url.hostname);
      return { body: { html: '' } };
    }
    throw new Error(`Inesperado: ${url}`);
  });

  assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
  assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
  assert.equal(seedCalls, 2);
  assert.deepEqual([...new Set(searchHosts)], [HOST, 'www.overflix.lat']);
  assert.equal(app.errors.length, 0);
});

// 3.1 AJAX e redirect JSON
test('3.1 fetchAjax segue um redirect HTTPS e rejeita destino HTTP, inválido e cascata', async () => {
  const allowed = site((url) => {
    if (url.hostname === 'www.overflix.win') {
      return { body: { redirect: `https://${HOST}/index.php?do=buscarContent` } };
    }
    if (url.hostname === HOST) return { body: { html: '' } };
    throw new Error(`Inesperado: ${url}`);
  });
  const ok = await allowed.fetchAjax('https://www.overflix.win/index.php');
  assert.equal(ok.data.html, '');
  assert.equal(new URL(ok.url).hostname, HOST);

  for (const [redirect, pattern] of [
    ['http://www.overflix.center/index.php', /não é HTTPS/],
    ['não é url', /inválido/],
  ]) {
    const app = site((url) => {
      if (url.hostname === 'www.overflix.win') return { body: { redirect } };
      throw new Error('não deveria seguir');
    });
    await assert.rejects(() => app.fetchAjax('https://www.overflix.win/index.php'), pattern);
  }

  const cascade = site((url) => {
    if (url.hostname === 'www.overflix.win') return { body: { redirect: `https://${HOST}/a` } };
    if (url.hostname === HOST) return { body: { redirect: 'https://www.overflix.lat/b' } };
    throw new Error('não deveria seguir');
  });
  await assert.rejects(() => cascade.fetchAjax('https://www.overflix.win/index.php'), /cascata/);
});

// 3.2 Busca e termos
test('3.2 busca envia type, tenta termos sem repetição e aceita só cartão do tipo', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return {
        body: {
          ...mockTmdb({ title: 'Um Sonho de Liberdade', originalTitle: 'The Shawshank Redemption', year: 1994 }),
          alternative_titles: { titles: [{ iso_3166_1: 'BR', title: 'Rita Hayworth' }], results: [] },
        },
      };
    }
    if (url.hostname === 'www.overflix.win') return { body: fixture('home.html'), url: `https://${HOST}/` };
    if (url.searchParams.get('do') === 'buscarContent') {
      const term = url.searchParams.get('q');
      assert.equal(url.searchParams.get('type'), 'filmes');
      if (term === 'Um Sonho de Liberdade') return { body: { html: '' } };
      if (term === 'The Shawshank Redemption') {
        return { body: { html: '<a href="https://www.overflix.center/series/online/x-1/" class="block"><h3>The Shawshank Redemption</h3><p>1994</p></a>' } };
      }
      return { body: { html: '<a href="https://www.overflix.center/filmes/online/shawshank-278/" class="block"><h3>The Shawshank Redemption</h3><p>1994</p></a>' } };
    }
    if (url.pathname.includes('shawshank-278')) {
      return '<html><div id="view" data-video-id="278" data-tmdb-id="278"></div></html>';
    }
    if (url.searchParams.get('do') === 'playerData') {
      return { body: { players: [{ label: 'MixDrop', url: 'https://mixdrop.top/e/' }], servers_dub: 'mixdrop=md1', servers_leg: '' } };
    }
    if (url.hostname === 'mixdrop.top') return { body: fixture('mixdrop_embed.html'), url: 'https://mixdrop.top/e/md1' };
    throw new Error(`Inesperado: ${url}`);
  });

  const streams = await app.getStreams('278', 'movie', null, null);
  assert.ok(streams.length > 0, app.errors.join(' | '));
  const queries = app.calls.filter((call) => call.url.includes('buscarContent')).map((call) => new URL(call.url).searchParams.get('q'));
  assert.deepEqual(queries, ['Um Sonho de Liberdade', 'The Shawshank Redemption', 'Rita Hayworth']);
  assert.ok(!app.calls.some((call) => call.url.includes('/series/online/x-1/')));
});

// 3.3 Confirmação por TMDB e ano
test('3.3 homônimo de outro ano é descartado antes da ficha', async () => {
  const homonyms = {
    html: '<a href="https://www.overflix.center/filmes/online/duna-dublado-1984/" class="block"><h3>Duna</h3><p>1984</p></a><a href="https://www.overflix.center/filmes/online/duna-dublado-171/" class="block"><h3>Duna</h3><p>2021</p></a>',
  };
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.searchParams.get('do') === 'buscarContent') return { body: homonyms };
    return route(url, init);
  });
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0, app.errors.join(' | '));
  assert.ok(!app.calls.some((call) => call.url.includes('1984')));
  assert.ok(app.calls.some((call) => call.url.includes('duna-dublado-171')));
});

test('3.3 ficha com TMDB divergente é descartada sem virar erro', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.pathname.includes('duna-dublado-171')) {
      return '<html><div id="view" data-video-id="171" data-tmdb-id="999"></div></html>';
    }
    return route(url, init);
  });
  assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
  assert.equal(app.errors.length, 0);
  assert.ok(!app.calls.some((call) => call.url.includes('do=playerData')));
});

test('3.5 ficha sem data-tmdb-id é erro de estrutura', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.pathname.includes('duna-dublado-171')) {
      return '<html><div id="view" data-video-id="171"></div></html>';
    }
    return route(url, init);
  });
  assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /^\[OverFlix\] Falha em movie 438631: .*data-tmdb-id/);
});

test('3.4 duas fichas confirmam o mesmo TMDB e viram ausência por ambiguidade', async () => {
  const cards = {
    html: '<a href="https://www.overflix.center/filmes/online/duna-dub-1/" class="block"><h3>Duna</h3><p>2021</p></a><a href="https://www.overflix.center/filmes/online/duna-dub-2/" class="block"><h3>Duna</h3><p>2021</p></a>',
  };
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: mockTmdb() };
    if (url.hostname === 'www.overflix.win') return { body: fixture('home.html'), url: `https://${HOST}/` };
    if (url.searchParams.get('do') === 'buscarContent') return { body: cards };
    if (url.pathname.includes('duna-dub-1') || url.pathname.includes('duna-dub-2')) {
      return '<html><div id="view" data-video-id="1" data-tmdb-id="438631"></div></html>';
    }
    throw new Error(`Inesperado: ${url}`);
  });
  assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
  assert.equal(app.errors.length, 0);
  assert.equal(app.infos.length, 1);
  assert.match(app.infos[0], /Mais de uma ficha confirma o TMDB 438631/);
  assert.ok(!app.calls.some((call) => call.url.includes('do=playerData')));
  assert.ok(!app.calls.some((call) => call.url.includes('duna-dub-3')));
});

// 4.1 Série: vbEpisodes, áudio e temporada
test('4.1 série lê vbEpisodes e prefere Dublado quando o seletor oferece', async () => {
  const route = fullRoute('tv');
  const app = runtime((url, init) => {
    if (url.pathname.includes('/series/online/breaking-bad-dublado-30207')) return fixture('series_audio_select.html');
    return route(url, init);
  });
  const streams = await app.getStreams('64464', 'tv', 1, 2);
  assert.ok(streams.length > 0, app.errors.join(' | '));
  const listCall = app.calls.find((call) => call.url.includes('do=episodesList'));
  assert.equal(new URL(listCall.url).searchParams.get('audio'), 'Dublado');
  assert.equal(new URL(listCall.url).searchParams.get('season'), '1');
});

test('4.1 série sem áudio declarado é erro de estrutura', async () => {
  const route = fullRoute('tv');
  const app = runtime((url, init) => {
    if (url.pathname.includes('/series/online/breaking-bad-dublado-30207')) return fixture('series_no_audio.html');
    return route(url, init);
  });
  assert.deepEqual(await app.getStreams('64464', 'tv', 1, 1), []);
  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /Áudio não declarado/);
});

test('4.2 temporada não anunciada devolve ausência sem consultar episodesList', async () => {
  const app = runtime(fullRoute('tv'));
  assert.deepEqual(await app.getStreams('64464', 'tv', 9, 1), []);
  assert.equal(app.errors.length, 0);
  assert.ok(!app.calls.some((call) => call.url.includes('do=episodesList')));
});

test('4.2 episódio exato usa número como inteiro e remove o prefixo serie3=', async () => {
  const app = runtime(fullRoute('tv'));
  const streams = await app.getStreams('64464', 'tv', 1, 1);
  assert.ok(streams.length > 0, app.errors.join(' | '));
  const playerCall = app.calls.find((call) => call.url.includes('do=playerData'));
  assert.ok(playerCall);
  assert.equal(playerCall.init.headers.Referer, 'https://www.overflix.center/episodios/online/breaking-bad-1x1-dublado-3425/');
  assert.ok(!app.calls.some((call) => call.url.includes('serie3=')));
});

test('4.2 episódio ausente na temporada devolve ausência sem erro', async () => {
  const app = runtime(fullRoute('tv'));
  assert.deepEqual(await app.getStreams('64464', 'tv', 1, 9), []);
  assert.equal(app.errors.length, 0);
  assert.ok(!app.calls.some((call) => call.url.includes('do=playerData')));
});

// 4.3 playerData, bases e override
test('4.3 players sobrescreve a base padrão e players ausente usa a base padrão', async () => {
  const shared = fullRoute('movie');
  const overridden = runtime(shared);
  const streamsOverridden = await overridden.getStreams('438631', 'movie', null, null);
  assert.ok(streamsOverridden.length > 0);
  assert.ok(overridden.calls.some((call) => new URL(call.url).hostname === 'mxdrop.click'));

  const defaults = runtime((url, init) => {
    if (url.searchParams.get('do') === 'playerData') {
      return { body: { servers_dub: 'mixdrop=md_dub_001', servers_leg: '' } };
    }
    return shared(url, init);
  });
  const streamsDefault = await defaults.getStreams('438631', 'movie', null, null);
  assert.equal(streamsDefault.length, 1);
  assert.equal(streamsDefault[0].provider, 'MixDrop');
  assert.ok(defaults.calls.some((call) => new URL(call.url).hostname === 'mixdrop.top' && call.url.includes('md_dub_001')));
});

test('4.3 players fora do contrato e playerData que não é objeto são erro', async () => {
  for (const body of [[], { players: {} }, { players: 'MixDrop', servers_dub: '', servers_leg: '' }]) {
    const route = fullRoute('movie');
    const app = runtime((url, init) => {
      if (url.searchParams.get('do') === 'playerData') return { body };
      return route(url, init);
    });
    assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
    assert.equal(app.errors.length, 1, JSON.stringify(body));
  }
});

test('4.4 servidores com &amp; e identificador com caractere especial são preservados', async () => {
  const app = site((url) => {
    if (url.searchParams.get('do') === 'playerData') {
      return {
        body: {
          servers_dub: 'mixdrop=id=with+plus&amp;streamtape=st_001',
          servers_leg: '',
        },
      };
    }
    throw new Error(`Inesperado: ${url}`);
  });
  const options = await app.fetchPlayerOptions(`https://${HOST}`, '171', `https://${HOST}/filmes/online/duna-dublado-171/`);
  assert.deepEqual(Array.from(options, (option) => option.embedUrl), ['https://mixdrop.top/e/id=with+plus', 'https://streamtape.com/e/st_001']);
  assert.deepEqual(Array.from(options, (option) => option.language), ['Dublado', 'Dublado']);
});

// 4.5 Triagem silenciosa
test('4.5 Byse e host desconhecido são triagem e listas vazias são ausência', async () => {
  for (const body of [
    { players: [{ label: 'Byse', url: 'https://bysebuho.com/e/' }, { label: 'Desconhecido', url: 'https://exemplo.test/e/' }], servers_dub: 'byse=b1&desconhecido=d1', servers_leg: '' },
    { players: [], servers_dub: '', servers_leg: '' },
    { players: [], servers_dub: 'byse=b1', servers_leg: 'byse=b2' },
  ]) {
    const route = fullRoute('movie');
    const app = runtime((url, init) => {
      if (url.searchParams.get('do') === 'playerData') return { body };
      return route(url, init);
    });
    assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
    assert.equal(app.errors.length, 0);
    assert.equal(app.warnings.length, 0);
    assert.ok(!app.calls.some((call) => new URL(call.url).hostname === 'bysebuho.com'));
  }
});

// 5.1 Resolvedores
test('5.1 MixDrop desempacota PACKER, lê wurl e trata remoção', async () => {
  const app = hosts((url) => {
    if (url.href.includes('removed')) return '<html>File not found</html>';
    return { body: fixture('mixdrop_embed.html'), url: 'https://mxdrop.click/e/123' };
  });
  const resolved = await app.resolveMixDrop('https://mxdrop.click/e/123', 'https://www.overflix.center/');
  assert.equal(resolved.url, 'https://delivery.mxcontent.net/v2/test_video.mp4?s=sig123&e=exp456');
  assert.equal(resolved.headers.Referer, 'https://mxdrop.click/e/123');
  assert.ok(resolved.headers['User-Agent']);
  await assert.rejects(() => app.resolveMixDrop('https://mxdrop.click/e/removed'), /removido/);
});

test('5.1 Streamtape analisa robotlink e trata remoção', async () => {
  const app = hosts((url) => {
    if (url.href.includes('removed')) return '<html>Video not found</html>';
    return fixture('streamtape_embed.html');
  });
  const resolved = await app.resolveStreamtape('https://streamtape.com/e/123');
  assert.equal(resolved.url, 'https://streamtape.com/get_video?id=test_tape&expires=123&ip=127.0.0.1&token=ken&stream=1');
  assert.ok(!resolved.url.includes('bait'));
  await assert.rejects(() => app.resolveStreamtape('https://streamtape.com/e/removed'), /removido/);
});

test('5.1 DoodStream resolve pass_md5 + token + expiry e rejeita RELOAD e remoção', async () => {
  const app = hosts((url) => {
    if (url.href.includes('removed')) return '<html>File you are looking for is not found</html>';
    if (url.href.includes('no-pass')) return '<html>Sem pass</html>';
    if (url.href.includes('reload-embed')) return '<html><script>$.get(\'/pass_md5/reload/tok_reload\', function(){});</script></html>';
    if (url.pathname.startsWith('/pass_md5/reload/')) return 'RELOAD';
    if (url.pathname.startsWith('/pass_md5/')) return 'https://cdn.example/u5kj/video~';
    return { body: fixture('doodstream_embed.html'), url: 'https://playmogo.com/e/dood_leg_005' };
  });
  const resolved = await app.resolveDoodStream('https://playmogo.com/e/dood_leg_005', `https://${HOST}/filmes/online/duna-dublado-171/`);
  assert.match(resolved.url, /^https:\/\/cdn\.example\/u5kj\/video~[A-Za-z0-9]{10}\?token=dood_tok_789&expiry=\d+$/);
  assert.equal(resolved.headers.Referer, 'https://playmogo.com/');
  assert.ok(resolved.headers['User-Agent']);
  await assert.rejects(() => app.resolveDoodStream('https://playmogo.com/e/removed'), /removido/);
  await assert.rejects(() => app.resolveDoodStream('https://playmogo.com/e/no-pass'), /pass_md5 não encontrado/);
  await assert.rejects(() => app.resolveDoodStream('https://playmogo.com/e/reload-embed'), /RELOAD/);
});

// 5.2 Contrato dos streams
test('5.2 streams dublados e legendados usam buildStream, provider, headers e sem name/title próprios', async () => {
  const app = runtime(fullRoute('movie'));
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.equal(streams.length, 4, app.errors.join(' | '));
  assert.deepEqual([...new Set(streams.map((stream) => stream.provider))].sort(), ['DoodStream', 'MixDrop', 'Streamtape']);
  assert.deepEqual([...new Set(streams.map((stream) => stream.language))].sort(), ['Dublado', 'Legendado']);
  for (const stream of streams) {
    assert.equal(stream.type, 'mp4');
    assert.equal(stream.quality, 'Desconhecida');
    assert.ok(stream.url.startsWith('https://'));
    assert.ok(stream.name.includes('OverFlix'));
    assert.ok(stream.name.includes('🌐 HTTP'));
    assert.ok(stream.headers['User-Agent']);
  }
});

test('5.2 variante Prism inclui coordenadas de série', async () => {
  const app = runtime(fullRoute('tv'), 'chave-ficticia', codes.prism);
  const streams = await app.getStreams('64464', 'tv', 1, 2);
  assert.ok(streams.length > 0, app.errors.join(' | '));
  assert.ok(streams[0].name.includes('❓ Desconhecida'));
  assert.ok(streams[0].name.includes('T01E02'));
  assert.ok(streams[0].name.includes('🌐 HTTP'));
});

test('5.3 qualidade não declarada não faz sonda de mídia', async () => {
  const app = runtime(fullRoute('movie'));
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.every((stream) => stream.quality === 'Desconhecida'));
  assert.ok(!app.calls.some((call) => call.url.includes('delivery.mxcontent.net')));
  assert.ok(!app.calls.some((call) => call.url.includes('/get_video')));
  assert.ok(!app.calls.some((call) => call.url.includes('cdn.example')));
});

test('5.4 duplicata por URL e idioma vira um stream; mesma URL em idiomas diferentes permanece', async () => {
  const route = fullRoute('movie');
  const duplicates = runtime((url, init) => {
    if (url.searchParams.get('do') === 'playerData') {
      return { body: { players: [{ label: 'MixDrop', url: 'https://mixdrop.top/e/' }], servers_dub: 'mixdrop=md_same&mixdrop=md_same', servers_leg: 'mixdrop=md_same' } };
    }
    return route(url, init);
  });
  const streams = await duplicates.getStreams('438631', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map((stream) => stream.language).sort(), ['Dublado', 'Legendado']);
  assert.equal(new Set(streams.map((stream) => stream.url)).size, 1);
});

// 5.5 Isolamento e erro agregado
test('5.5 falha de um host preserva os demais e avisa só a opção descartada', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname === 'streamtape.com' || url.hostname === 'playmogo.com') {
      return { status: 404, body: 'File not found' };
    }
    return route(url, init);
  });
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.ok(streams.every((stream) => stream.provider === 'MixDrop'));
  assert.equal(app.errors.length, 0);
  assert.equal(app.warnings.length, 2);
  assert.ok(app.warnings.every((line) => line.startsWith('[OverFlix] Opção') && line.includes('descartada:')));
});

test('5.5 todos os hosts falham geram erro agregado e lista vazia', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (['mxdrop.click', 'streamtape.com', 'playmogo.com'].includes(url.hostname)) {
      return { status: 404, body: 'File not found' };
    }
    return route(url, init);
  });
  assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /Todas as opções falharam:.*MixDrop.*Streamtape.*DoodStream/);
  assert.equal(app.warnings.length, 4);
});

test('5.5 todas as opções em triagem devolvem [] sem aviso nem erro', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.searchParams.get('do') === 'playerData') {
      return { body: { players: [{ label: 'Byse', url: 'https://bysebuho.com/e/' }], servers_dub: 'byse=1', servers_leg: 'byse=2' } };
    }
    return route(url, init);
  });
  assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
  assert.equal(app.errors.length, 0);
  assert.equal(app.warnings.length, 0);
});

// 5.6 Sanitização
test('5.6 logs e avisos não expõem chave, token, expiry, sig nem query de URL', async () => {
  const secret = 'segredo-secreto-123';
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (['mxdrop.click', 'streamtape.com', 'playmogo.com'].includes(url.hostname)) {
      throw new Error(`Falha com chave ${secret}, token=token_secreto&expiry=999&sig=assinatura_secreta em https://cdn.example/video.mp4?s=url_assinada`);
    }
    return route(url, init);
  }, secret);

  assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
  for (const line of [...app.errors, ...app.warnings]) {
    assert.ok(!line.includes(secret));
    assert.doesNotMatch(line, /token_secreto|assinatura_secreta|url_assinada|999/);
  }
});

// 6.2 Etapas fatais
test('6.2 HTTP 503, JSON inválido, busca sem html e playerData fora do contrato são erro', async () => {
  const cases = [
    (url) => url.searchParams.get('do') === 'buscarContent' ? { status: 503, body: 'indisponível' } : null,
    (url) => url.searchParams.get('do') === 'buscarContent' ? 'não é json' : null,
    (url) => url.searchParams.get('do') === 'buscarContent' ? { body: { foo: 'bar' } } : null,
    (url) => url.searchParams.get('do') === 'playerData' ? { body: [] } : null,
  ];

  for (const override of cases) {
    const route = fullRoute('movie');
    const app = runtime((url, init) => {
      const result = override(url);
      return result === null ? route(url, init) : result;
    });
    assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
    assert.equal(app.errors.length, 1, String(override));
    assert.match(app.errors[0], /^\[OverFlix\] Falha em movie 438631:/);
  }
});

// 6.3 Ausência sem erro
test('6.3 título ausente devolve [] sem log', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.searchParams.get('do') === 'buscarContent') return { body: { html: '' } };
    return route(url, init);
  });
  assert.deepEqual(await app.getStreams('438631', 'movie', null, null), []);
  assert.equal(app.errors.length, 0);
  assert.equal(app.infos.length, 0);
  const siteOnly = app.calls.filter((call) => call.url.includes('/index.php'));
  assert.ok(siteOnly.every((call) => new URL(call.url).hostname === HOST));
});

// 4.6, 6.5 Fixtures
test('4.6 e 6.5 fixtures são HTML/JSON sanitizados, sem cookie e sem arquivo binário', () => {
  const dir = path.join(__dirname, 'fixtures/overflix');
  const files = fs.readdirSync(dir).sort();
  assert.deepEqual(files, [
    'doodstream_embed.html',
    'episodes_dub.json',
    'episodes_leg.json',
    'home.html',
    'home_payload.html',
    'mixdrop_embed.html',
    'movie.html',
    'player_data.json',
    'search_movie.json',
    'series.html',
    'series_audio_select.html',
    'series_no_audio.html',
    'streamtape_embed.html',
  ]);
  for (const file of files) {
    assert.match(file, /\.(html|json)$/);
    const content = fs.readFileSync(path.join(dir, file));
    assert.ok(!content.includes(0), `${file} contém byte nulo`);
    const text = content.toString('utf8');
    assert.doesNotMatch(text, /set-cookie|^\s*cookie\s*:/im, file);
    assert.doesNotMatch(text, /http:\/\//, file);
  }
  assert.match(fixture('player_data.json'), /&amp;/);
  assert.match(fixture('episodes_dub.json'), /"number":"1"/);
});

test('coleções sem índices numéricos percorrem todos os cartões do app via eq(i)', async () => {
  const $ = load(JSON.parse(fixture('search_movie.json')).html);
  const cards = $('a.block');
  assert.equal(cards.length, 1);
  assert.equal(cards[0], undefined);
  const app = runtime(fullRoute('movie'), 'chave-ficticia', codes.gdrive, { URLSearchParams: AppURLSearchParams });
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0, app.errors.join(' | '));
});
