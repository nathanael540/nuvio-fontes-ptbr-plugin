const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const KEY = 'chave-ficticia-tmdb';
const HASH = 'a'.repeat(32);
const FAG = 'https://filmesamadoresgratis.com';
const POBRE = 'https://www.pobreflixnow.rest';
const POBREX = 'https://pobrexflix.art';
const HYPE = 'https://hypetvflix.one';
const FIRE = `https://embedplayer2.xyz/video/${HASH}`;
const SECURED = 'https://cdn.example/master.m3u8?md5=fictionmd5&expires=999';
const VIDEO_OK = { hls: true, securedLink: SECURED, videoSource: 'https://cdn.example/master.txt' };

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('dooplay-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('dooplay', { outDir, formatter }), 'utf8');
    }
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/dooplay', name), 'utf8');

function movieInfo(extra = {}) {
  return {
    title: extra.title || 'Filme Fictício',
    original_title: extra.original || extra.title || 'Filme Fictício',
    release_date: `${extra.year || 2026}-01-02`,
    external_ids: { imdb_id: extra.imdb === undefined ? 'tt9000001' : extra.imdb },
    alternative_titles: { titles: (extra.alts || []).map((title) => ({ iso_3166_1: 'BR', title })) },
    original_language: 'en',
    genres: [],
    origin_country: ['US'],
  };
}

function seriesInfo(extra = {}) {
  return {
    name: extra.name || 'Breaking Bad',
    original_name: extra.original || extra.name || 'Breaking Bad',
    first_air_date: `${extra.year || 2008}-01-20`,
    external_ids: { imdb_id: extra.imdb || 'tt0903747' },
    alternative_titles: { results: (extra.alts || []).map((title) => ({ iso_3166_1: 'BR', title })) },
    original_language: 'en',
    genres: [],
    origin_country: ['US'],
  };
}

function runtime(route, key = KEY, bundle = code) {
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const context = {
    module: { exports: {} },
    URL,
    URLSearchParams,
    TMDB_API_KEY: key,
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
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init || {});
      if (result instanceof Error) throw result;
      const text = typeof result === 'string'
        ? result
        : typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
      const status = result.status || 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  vm.runInNewContext(bundle, context, { filename: 'dooplay.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function textOf(logs) {
  return [...logs.log, ...logs.warn, ...logs.error].join('\n');
}

function formOf(call) {
  return new URLSearchParams(call?.init?.body || '');
}

function hostOf(call) {
  return new URL(call.url).hostname;
}

async function play(route, args = ['100', 'movie'], key = KEY, bundle = code) {
  const app = runtime(route, key, bundle);
  const streams = await app.getStreams(...args);
  return { ...app, streams };
}

function jsonItems(items) {
  return { body: { items } };
}

function card(origin, pathname, title, year) {
  return `<div class="search-page"><article><div class="title"><a href="${origin}${pathname}">${title}</a></div><span class="year">${year}</span></div></article></div>`;
}

function buttons(items) {
  return items.map((item) => `<li class="dooplay_player_option" data-type="${item.type || 'movie'}" data-post="${item.post}" data-nume="${item.nume}"><span class="title">${item.label}</span><span class="flag">${item.nume}</span></li>`).join('');
}

function movieHtml({ post = '164791', label = 'Dublado BK', imdb = 'tt9000001', extra = '', type = 'movie' } = {}) {
  return `<html><body><a href="https://www.imdb.com/title/${imdb}/">imdb</a>${extra}<ul>${buttons([{ post, label, nume: '1', type }])}</ul></body></html>`;
}

function seriesList(origin, episodes) {
  const items = episodes.map((episode, index) => `<li class="mark-${index + 1}"><div class="numerando">${episode.label}</div><a href="${origin}/episodios/serie-${episode.season}x${episode.episode}/">ver</a></li>`).join('');
  return `<html><body><a href="https://www.imdb.com/title/tt0903747/">imdb</a><ul>${items}</ul></body></html>`;
}

function fireChain(playlist = 'master-variants.m3u8', video = VIDEO_OK) {
  return (url) => {
    if (url.hostname === 'embedplayer2.xyz' && url.pathname === '/player/index.php') return { body: video };
    if (url.hostname === 'cdn.example') return fixture(playlist);
    if (url.hostname === 'vaiquecol.com' && url.pathname === '/player/index.php') return { body: video };
    return undefined;
  };
}

function restMovie(url) {
  if (url.hostname === 'api.themoviedb.org') return { body: movieInfo() };
  if (url.hostname !== 'filmesamadoresgratis.com') return undefined;
  if (url.pathname.includes('/dcfilter/')) {
    return url.searchParams.get('keyword') === 'Filme Fictício'
      ? jsonItems([{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }])
      : jsonItems([]);
  }
  if (url.pathname === '/filme/filme-ficticio/') return movieHtml();
  if (url.pathname.includes('/dooplayer/v2/')) return { body: { embed_url: FIRE, type: 'iframe' } };
  return undefined;
}

function emptyEverywhere(info) {
  return (url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: info };
    if (url.pathname.includes('/dcfilter/')) return jsonItems([]);
    if (url.pathname === '/' && url.searchParams.has('s')) return fixture('search-empty.html');
    return undefined;
  };
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

test('carregamento CommonJS sem rede e entradas inválidas antes do fetch', async () => {
  const app = runtime(() => { throw new Error('fetch inesperado'); });
  assert.equal(typeof app.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(code, /AbortController|Promise\.allSettled|\beval\s*\(|new Function/);
  for (const args of [['abc', 'movie'], ['100', 'livro'], ['100', 'tv', 0, 1], ['100', 'tv', null, 1], ['100', 'tv', 2, 1.5]]) {
    assert.deepEqual(await app.getStreams(...args), []);
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.logs.error.length, 5);
  assert.ok(app.logs.error.every((line) => line.startsWith('[DooPlay PT-BR] Entrada:')));
});

test('origem seguinte entrega depois de falha da primeira', async () => {
  const { streams, calls, logs } = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.hostname === 'filmesamadoresgratis.com' ? { status: 500, body: 'fora' } : undefined),
    (url) => {
      if (url.hostname !== 'www.pobreflixnow.rest') return undefined;
      if (url.searchParams.has('s')) {
        return url.searchParams.get('s') === 'Filme Fictício' ? card(POBRE, '/filmes/filme-b/', 'Filme Fictício', 2026) : fixture('search-empty.html');
      }
      if (url.pathname === '/filmes/filme-b/') return movieHtml({ post: '71242' });
      if (url.pathname === '/wp-admin/admin-ajax.php') return { body: { embed_url: FIRE, type: 'iframe' } };
      return undefined;
    },
    fireChain(),
  ]));
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map((stream) => stream.quality), ['720p', '360p']);
  assert.equal(streams[0].url, 'https://cdn.example/file-1080p.css');
  assert.equal(streams[0].type, 'hls');
  assert.equal(streams[0].language, 'Dublado');
  assert.ok(logs.warn.some((line) => line.includes('filmesamadoresgratis.com') && line.includes('Busca')));
  assert.equal(logs.error.length, 0);
  assert.ok(!calls.some((call) => hostOf(call) === 'pobrexflix.art'));
  const ajax = calls.find((call) => call.url.includes('admin-ajax.php'));
  assert.equal(formOf(ajax).get('post'), '71242');
  assert.ok(!calls.some((call) => call.url.includes('72773') || call.url.includes('70499')));
});

test('ausência em todas as origens não é falha e o resumo traz as classes', async () => {
  const { streams, logs, calls } = await play(emptyEverywhere(movieInfo()));
  assert.deepEqual(streams, []);
  assert.equal(logs.error.length, 0);
  assert.ok(logs.log.some((line) => line.includes('Nenhuma origem entregou streams') && line.includes('filmesamadoresgratis.com=ausencia') && line.includes('boraflix.mom=ausencia')));
  assert.equal(calls.filter((call) => call.url.includes('dcfilter')).length > 0, true);
  assert.ok(calls.some((call) => call.url.startsWith(`${POBRE}/?`) && call.url.includes('search-page') === false));
});

test('falha de todas as origens resume com console.error e a classe de cada domínio', async () => {
  const { streams, logs, calls } = await play((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: movieInfo() };
    return { status: 500, body: 'fora' };
  });
  assert.deepEqual(streams, []);
  const summary = logs.error.find((line) => line.includes('Nenhuma origem entregou streams'));
  for (const domain of ['filmesamadoresgratis.com', 'www.pobreflixnow.rest', 'pobrexflix.art', 'hypetvflix.one', 'megafilmehdonline.blog', 'boraflix.mom']) {
    assert.ok(summary.includes(`${domain}=falha`), summary);
  }
  assert.deepEqual(calls.slice(1).map(hostOf), [
    'filmesamadoresgratis.com', 'www.pobreflixnow.rest', 'pobrexflix.art', 'hypetvflix.one', 'megafilmehdonline.blog', 'boraflix.mom',
  ]);
});

test('TMDB ausente ou com erro encerra antes das origens e não revela a chave', async () => {
  const missing = runtime(() => { throw new Error('não deveria'); }, '');
  assert.deepEqual(await missing.getStreams('100', 'movie'), []);
  assert.equal(missing.calls.length, 0);
  assert.match(missing.logs.error[0], /TMDB_API_KEY/);
  const failed = await play(() => ({ status: 500, body: `erro ${KEY}` }));
  assert.deepEqual(failed.streams, []);
  assert.equal(failed.calls.length, 1);
  assert.match(failed.logs.error[0], /\[DooPlay PT-BR\] TMDB:/);
  assert.equal(textOf(failed.logs).includes(KEY), false);
});

test('homônimo, ano, tradução e busca vazia distinta de busca bloqueada', async () => {
  const homonym = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => {
      if (!url.pathname.includes('/dcfilter/')) return undefined;
      if (url.searchParams.get('keyword') !== 'Filme Fictício') return jsonItems([]);
      return jsonItems([
        { url: `${FAG}/filme/antigo/`, title: 'Filme Fictício', year: 1984, type: 'Filme' },
        { url: `${FAG}/filme/certo/`, title: 'Filme Fictício', year: 2026, type: 'Filme' },
      ]);
    },
    (url) => (url.pathname === '/filme/certo/' ? movieHtml() : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: FIRE } } : undefined),
    fireChain(),
  ]));
  assert.equal(homonym.streams.length, 2);
  assert.ok(!homonym.calls.some((call) => call.url.includes('/filme/antigo/')));

  const translated = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo({ title: 'Duna', original: 'Dune' }) } : undefined),
    (url) => {
      if (!url.pathname.includes('/dcfilter/')) return undefined;
      const keyword = url.searchParams.get('keyword');
      if (keyword === 'Dune') return jsonItems([{ url: `${FAG}/filme/dune/`, title: 'Dune', year: 2026, type: 'Filme' }]);
      return jsonItems([]);
    },
    (url) => (url.pathname === '/filme/dune/' ? movieHtml() : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: FIRE } } : undefined),
    fireChain(),
  ]), ['100', 'movie'], KEY, codes.prism);
  assert.equal(translated.streams[0].title.startsWith('🎬 Duna (2026)'), true);

  const prefix = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: seriesInfo() } : undefined),
    (url) => {
      if (!url.pathname.includes('/dcfilter/')) return undefined;
      if (url.searchParams.get('type') !== 'tvshows') return jsonItems([]);
      if (url.searchParams.get('keyword') === 'Breaking Bad') {
        return jsonItems([{ url: `${FAG}/serie/breaking-bad/`, title: 'Breaking Bad: A Química do Mal', year: 2008, type: 'Série' }]);
      }
      return jsonItems([]);
    },
    (url) => (url.pathname === '/serie/breaking-bad/' ? seriesList(FAG, [{ label: 'T2 E3', season: 2, episode: 3 }]) : undefined),
    (url) => (url.pathname === '/episodios/serie-2x3/' ? movieHtml({ post: '261890', type: 'tv', label: 'Dublado' }) : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: FIRE } } : undefined),
    fireChain(),
  ]), ['1396', 'tv', 2, 3], KEY, codes.prism);
  assert.match(prefix.streams[0].title, /T02E03/);

  const saul = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: seriesInfo() } : undefined),
    (url) => {
      if (url.pathname.includes('/dcfilter/') && url.searchParams.get('keyword') === 'Breaking Bad') {
        return jsonItems([{ url: `${FAG}/serie/better-call-saul/`, title: 'Better Call Saul', year: 2015, type: 'Série' }]);
      }
      if (url.pathname.includes('/dcfilter/')) return jsonItems([]);
      if (url.searchParams.has('s')) return fixture('search-empty.html');
      return undefined;
    },
  ]), ['1396', 'tv', 2, 3]);
  assert.deepEqual(saul.streams, []);
  assert.ok(!saul.calls.some((call) => call.url.includes('better-call-saul')));
  assert.equal(saul.logs.error.length, 0);

  const blocked = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.hostname === 'filmesamadoresgratis.com' ? jsonItems([]) : undefined),
    (url) => (url.hostname === 'www.pobreflixnow.rest' ? '<html>Just a moment challenge-platform</html>' : undefined),
    (url) => (url.searchParams.has('s') ? fixture('search-empty.html') : undefined),
  ]));
  assert.deepEqual(blocked.streams, []);
  assert.ok(blocked.logs.warn.some((line) => line.includes('www.pobreflixnow.rest') && line.includes('desafio Cloudflare')));
  assert.ok(blocked.logs.log.some((line) => line.includes('filmesamadoresgratis.com ausência')));
});

test('IMDb ou TMDB divergente e empate não escolhem página nem reutilizam slug', async () => {
  const divergent = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/errado/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/errado/' ? movieHtml({ imdb: 'tt9000999', extra: '<a href="https://www.themoviedb.org/movie/999999">tmdb</a>' }) : undefined),
    (url) => (url.searchParams.has('s') ? fixture('search-empty.html') : undefined),
  ]));
  assert.deepEqual(divergent.streams, []);
  assert.ok(!divergent.calls.some((call) => call.url.includes('dooplayer') || call.url.includes('embedplayer')));

  const ambiguous = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/') && url.searchParams.get('keyword') === 'Filme Fictício'
      ? jsonItems([
        { url: `${FAG}/filme/um/`, title: 'Filme Fictício', year: 2026, type: 'Filme' },
        { url: `${FAG}/filme/dois/`, title: 'Filme Fictício', year: 2026, type: 'Filme' },
      ])
      : url.pathname.includes('/dcfilter/') ? jsonItems([]) : undefined),
    (url) => (url.pathname === '/filme/um/' || url.pathname === '/filme/dois/' ? movieHtml() : undefined),
    (url) => (url.searchParams.has('s') ? fixture('search-empty.html') : undefined),
  ]));
  assert.deepEqual(ambiguous.streams, []);
  assert.equal(ambiguous.logs.error.length, 0);
  assert.ok(!ambiguous.calls.some((call) => call.url.includes('dooplayer')));

  const posts = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.hostname === 'filmesamadoresgratis.com' ? jsonItems([]) : undefined),
    (url) => (url.hostname === 'www.pobreflixnow.rest' ? fixture('search-empty.html') : undefined),
    (url) => {
      if (url.hostname !== 'pobrexflix.art') return undefined;
      if (url.searchParams.get('s') === 'Filme Fictício') return card(POBREX, '/filmes/slug-71242/', 'Filme Fictício', 2026);
      if (url.searchParams.has('s')) return fixture('search-empty.html');
      if (url.pathname === '/filmes/slug-71242/') {
        return `<html><body><iframe class="metaframe" src="https://myembed.biz/filme/tt9000001"></iframe><li class="dooplay_player_option" data-post="71242" data-nume="1" data-type="movie"><span class="title">ignorar</span></li></body></html>`;
      }
      return undefined;
    },
    (url) => (url.hostname === 'myembed.biz' ? '<html><body><iframe id="video-player" src="https://embedplayer2.xyz/video/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"></iframe></body></html>' : undefined),
    fireChain(),
  ]));
  assert.equal(posts.streams.length, 2);
  assert.ok(posts.calls.some((call) => call.url.includes('/filmes/slug-71242/')));
  assert.ok(!posts.calls.some((call) => call.url.includes('admin-ajax') || call.url.includes('72773') || call.url.includes('70499') || call.url.includes('dooplayer')));
  assert.equal(posts.calls.filter((call) => hostOf(call) === 'hypetvflix.one').length, 0);
});

test('T2 E3 ignora outro E3, episódio ausente é ausência e iframe sem números não é preenchido', async () => {
  const episode = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: seriesInfo() } : undefined),
    (url) => {
      if (!url.pathname.includes('/dcfilter/')) return undefined;
      return url.searchParams.get('keyword') === 'Breaking Bad'
        ? jsonItems([{ url: `${FAG}/serie/breaking-bad/`, title: 'Breaking Bad', year: 2008, type: 'Série' }])
        : jsonItems([]);
    },
    (url) => (url.pathname === '/serie/breaking-bad/'
      ? seriesList(FAG, [{ label: 'T1 E3', season: 1, episode: 3 }, { label: '2 - 3', season: 2, episode: 3 }])
      : undefined),
    (url) => (url.pathname === '/episodios/serie-2x3/' ? movieHtml({ post: '261890', type: 'tv' }) : undefined),
    (url) => (url.pathname.includes('/dooplayer/v2/261890/tv/1') ? { body: { embed_url: FIRE } } : undefined),
    fireChain(),
  ]), ['1396', 'tv', 2, 3], KEY, codes.prism);
  assert.match(episode.streams[0].title, /Breaking Bad \(2008\) T02E03/);
  assert.ok(episode.calls.some((call) => call.url.includes('/episodios/serie-2x3/')));
  assert.ok(!episode.calls.some((call) => call.url.includes('/episodios/serie-1x3/')));

  const missing = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: seriesInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Breaking Bad'
        ? [{ url: `${FAG}/serie/breaking-bad/`, title: 'Breaking Bad', year: 2008, type: 'Série' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/serie/breaking-bad/' ? seriesList(FAG, [{ label: 'T1 E1', season: 1, episode: 1 }]) : undefined),
    (url) => (url.searchParams.has('s') ? fixture('search-empty.html') : undefined),
  ]), ['1396', 'tv', 2, 3]);
  assert.deepEqual(missing.streams, []);
  assert.equal(missing.logs.error.length, 0);
  assert.ok(missing.logs.log.some((line) => line.includes('episódio ausente')));
  assert.ok(!missing.calls.some((call) => call.url.includes('dooplayer')));

  const broken = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: seriesInfo() } : undefined),
    (url) => {
      if (url.hostname === 'filmesamadoresgratis.com') return jsonItems([]);
      if (url.hostname === 'www.pobreflixnow.rest') return fixture('search-empty.html');
      if (url.hostname === 'pobrexflix.art' && url.searchParams.get('s') === 'Breaking Bad') return card(POBREX, '/series/breaking/', 'Breaking Bad', 2008);
      if (url.hostname === 'pobrexflix.art' && url.searchParams.has('s')) return fixture('search-empty.html');
      if (url.pathname === '/series/breaking/') return seriesList(POBREX, [{ label: 'T2 E3', season: 2, episode: 3 }]);
      if (url.pathname === '/episodios/serie-2x3/' && url.hostname === 'pobrexflix.art') {
        return '<html><body><iframe class="metaframe" src="https://myembed.biz/serie/1396/"></iframe></body></html>';
      }
      if (url.hostname === 'hypetvflix.one' && url.searchParams.get('s') === 'Breaking Bad') return card(HYPE, '/series/breaking-h/', 'Breaking Bad', 2008);
      if (url.hostname === 'hypetvflix.one' && url.searchParams.has('s')) return fixture('search-empty.html');
      if (url.pathname === '/series/breaking-h/') return seriesList(HYPE, [{ label: 'T2 E3', season: 2, episode: 3 }]);
      if (url.hostname === 'hypetvflix.one' && url.pathname === '/episodios/serie-2x3/') {
        return '<html><body><iframe class="metaframe" src="https://myembed.biz/serie/1396/2/3"></iframe></body></html>';
      }
      if (url.hostname === 'myembed.biz') return `<html><body><iframe id="video-player" src="${FIRE}"></iframe></body></html>`;
      return undefined;
    },
    fireChain(),
  ]), ['1396', 'tv', 2, 3]);
  assert.equal(broken.streams.length, 2);
  assert.ok(broken.logs.warn.some((line) => line.includes('pobrexflix.art') && line.includes('coordenadas ausentes')));
  assert.ok(!broken.calls.some((call) => call.url === 'https://myembed.biz/serie/1396/' || call.url.includes('season=2')));
  assert.ok(broken.calls.some((call) => call.url === 'https://myembed.biz/serie/1396/2/3'));
  assert.equal(broken.logs.error.length, 0);
});

test('embed ausente, budget danger, idioma estrangeiro e JSON do player', async () => {
  const two = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/'
      ? `<html><body><a href="https://www.imdb.com/title/tt9000001/">imdb</a><ul>${buttons([{ post: '10', nume: '1', label: 'Canal 1' }, { post: '10', nume: '2', label: 'Dublado' }])}</ul></body></html>`
      : undefined),
    (url) => (url.pathname.includes('/dooplayer/v2/10/movie/1') ? { body: {} } : undefined),
    (url) => (url.pathname.includes('/dooplayer/v2/10/movie/2') ? { body: { embed_url: FIRE } } : undefined),
    fireChain(),
  ]));
  assert.equal(two.streams.length, 2);
  assert.ok(two.logs.warn.some((line) => line.includes('embed_url ausente')));

  const danger = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/' ? movieHtml({ label: 'Player' }) : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: 'https://playerflix.ink/filme/tt9000001' } } : undefined),
    (url) => (url.hostname === 'playerflix.ink' ? {
      body: { status: true, data: { options: [
        { label: 'Premium', embed: 'https://superflixapi.boats/x', budget: 'danger', lang: 'pt-br' },
        { label: 'VIP Player', embed: FIRE, embed_id: HASH, lang: 'pt-br', budget: 'success' },
        { label: 'Original', embed: FIRE, embed_id: HASH, lang: 'en-us', budget: 'success' },
      ] } },
    } : undefined),
    (url) => (url.hostname === 'cdn.example' && url.pathname === '/master.m3u8' ? fixture('master-variants.m3u8') : undefined),
    (url) => (url.hostname === 'cdn.example' ? `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="eng",URI="https://cdn.example/en.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720,AUDIO="audio"
https://cdn.example/720.m3u8` : undefined),
    (url) => (url.hostname === 'embedplayer2.xyz' ? { body: VIDEO_OK } : undefined),
  ]));
  assert.ok(danger.logs.log.some((line) => line.includes('budget danger')));
  assert.ok(danger.logs.log.some((line) => line.includes('lang não PT-BR')));
  assert.equal(danger.logs.warn.length, 0);
  assert.ok(!danger.calls.some((call) => call.url.includes('superflix')));
  assert.equal(danger.streams.length, 2);
  assert.equal(danger.streams[0].language, 'Dublado');
  assert.equal(danger.streams[0].headers.Referer, FIRE);
  assert.equal(danger.streams[0].headers.Origin, 'https://embedplayer2.xyz');
  assert.equal(danger.streams[0].provider, 'embedplayer2.xyz');
  assert.equal(danger.streams[0].name, 'DooPlay PT-BR 720p\n🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');
  assert.equal(danger.streams[0].title, '🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');
});

test('ciclo, salto, host fora, verificação e HTTP 451 não derrubam a opção que funciona; HTTP 522 é falha isolada', async () => {
  const cycle = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/' ? movieHtml() : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: 'https://embed.embedplayer.site/tt9000001' } } : undefined),
    (url) => (url.hostname === 'embed.embedplayer.site' && url.pathname !== '/stream'
      ? '<div class="player_select_item" idS="abc123"></div>'
      : undefined),
    (url) => (url.pathname === '/stream' ? { body: { resources: { iframe: true, sources: [{ file: 'https://embed.embedplayer.site/tt9000001' }] } } } : undefined),
    (url) => (url.searchParams.has('s') || url.pathname.includes('/dcfilter/') ? undefined : undefined),
    emptyEverywhere(movieInfo()),
  ]));
  assert.deepEqual(cycle.streams, []);
  assert.ok(textOf(cycle.logs).includes('cadeia cíclica'));
  assert.ok(cycle.logs.error.some((line) => line.includes('filmesamadoresgratis.com=falha')));

  const hops = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/' ? movieHtml() : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: 'https://playerflix.ink/filme/hop1' } } : undefined),
    (url) => {
      if (url.hostname !== 'playerflix.ink') return undefined;
      const step = Number(url.searchParams.get('id').replace('hop', ''));
      return { body: { status: true, data: { options: [{ label: 'Próximo', embed: `https://playerflix.ink/filme/hop${step + 1}`, lang: 'pt-br' }] } } };
    },
    (url) => (url.searchParams.has('s') ? fixture('search-empty.html') : undefined),
  ]));
  assert.equal(hops.calls.filter((call) => call.url.includes('/inc/Ajax.php')).length, 6);
  assert.ok(textOf(hops.logs).includes('limite da cadeia'));
  assert.ok(!hops.calls.some((call) => call.url.includes('/filme/hop7')));

  const beside = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/'
      ? `<html><body><a href="https://www.imdb.com/title/tt9000001/">imdb</a><ul>${buttons([
        { post: '10', nume: '1', label: 'Turnstile' },
        { post: '10', nume: '2', label: 'Captcha' },
        { post: '10', nume: '3', label: 'Nuvem' },
        { post: '10', nume: '4', label: 'Bloqueio' },
        { post: '10', nume: '5', label: 'Queda' },
        { post: '10', nume: '6', label: 'Fora' },
        { post: '10', nume: '7', label: 'Dublado' },
      ])}</ul></body></html>`
      : undefined),
    (url) => {
      if (!url.pathname.includes('/dooplayer/')) return undefined;
      const target = {
        1: 'https://vaiquecol.com/embed2/turn',
        2: 'https://vaiquecol.com/embed2/captcha',
        3: 'https://vaiquecol.com/embed2/cloud',
        4: 'https://vaiquecol.com/embed2/deny',
        5: 'https://vaiquecol.com/embed2/down',
        6: 'https://fshd.link/e/x',
        7: FIRE,
      }[url.pathname.split('/').pop()];
      return { body: { embed_url: target } };
    },
    (url) => {
      if (url.pathname === '/embed2/turn') return '<html>cf-turnstile</html>';
      if (url.pathname === '/embed2/captcha') return '<html>g-recaptcha</html>';
      if (url.pathname === '/embed2/cloud') return '<html>Just a moment</html>';
      if (url.pathname === '/embed2/deny') return { status: 451, body: '' };
      if (url.pathname === '/embed2/down') return { status: 522, body: '' };
      return undefined;
    },
    fireChain(),
  ]));
  assert.equal(beside.streams.length, 2);
  for (const reason of ['Turnstile', 'reCAPTCHA', 'desafio Cloudflare', 'HTTP 451', 'host fora do conjunto: fshd.link']) {
    assert.ok(beside.logs.log.some((line) => line.includes(reason)), reason);
  }
  assert.ok(beside.logs.warn.some((line) => line.includes('HTTP 522')));
  assert.equal(beside.logs.error.length, 0);
  assert.ok(!beside.calls.some((call) => call.url.includes('fshd.link')));
  assert.equal(textOf(beside.logs).includes('cf_clearance'), false);
});

test('FirePlayer desempacota, recusa hash ausente, hls falso e videoSource vazio; WatchPlay é triagem', async () => {
  const packed = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/' ? movieHtml({ label: 'Player' }) : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: 'https://plenoflu.com/movie/tt9000001' } } : undefined),
    (url) => (url.hostname === 'plenoflu.com' && url.pathname === '/movie/tt9000001'
      ? '<div class="player_select_item" data-id="dyn:movie:1:vaiquecol"></div>'
      : undefined),
    (url) => (url.hostname === 'plenoflu.com' && url.pathname === '/api'
      ? { body: { data: { video_url: Buffer.from('https://vaiquecol.com/embed2/tt9000001').toString('base64') } } }
      : undefined),
    (url) => (url.hostname === 'vaiquecol.com' && url.pathname === '/embed2/tt9000001' ? fixture('packed.html') : undefined),
    (url) => (url.hostname === 'vaiquecol.com' && url.pathname === '/player/index.php' ? { body: VIDEO_OK } : undefined),
    (url) => (url.hostname === 'cdn.example' ? fixture('master-variants.m3u8') : undefined),
  ]));
  const videoPost = packed.calls.find((call) => call.url.includes('vaiquecol.com/player/index.php'));
  assert.equal(formOf(videoPost).get('hash'), HASH);
  assert.equal(formOf(videoPost).get('r'), 'https://plenoflu.com/');
  assert.equal(videoPost.init.headers.Referer, 'https://vaiquecol.com/embed2/tt9000001');
  const plenoGet = packed.calls.find((call) => call.url.includes('plenoflu.com/movie/'));
  assert.equal(plenoGet.init.headers.Referer, `${FAG}/`);
  assert.equal(packed.streams[0].provider, 'vaiquecol.com');
  assert.ok(packed.calls.some((call) => call.url.includes('md5=fictionmd5') && call.url.includes('expires=999')));
  assert.equal(textOf(packed.logs).includes(HASH), false);
  assert.equal(textOf(packed.logs).includes('fictionmd5'), false);

  async function lone(embed, page, video) {
    return play(chain([
      (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
      (url) => (url.pathname.includes('/dcfilter/')
        ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
          ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
          : [])
        : undefined),
      (url) => (url.pathname === '/filme/filme-ficticio/' ? movieHtml() : undefined),
      (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: embed } } : undefined),
      (url) => (url.hostname === 'vaiquecol.com' && url.pathname.startsWith('/embed2/') ? page : undefined),
      (url) => (url.pathname === '/player/index.php' ? { body: video } : undefined),
      (url) => (url.hostname === 'playerflix.ink' ? { body: { status: true, data: { options: [
        { label: 'Watch', embed: 'https://v2.watchplay.shop/e/1', lang: 'pt-br' },
        { label: 'VIP', embed: FIRE, embed_id: HASH, lang: 'pt-br' },
      ] } } } : undefined),
      (url) => (url.searchParams.has('s') ? fixture('search-empty.html') : undefined),
      fireChain(),
    ]));
  }
  const noHash = await lone('https://vaiquecol.com/embed2/vazio', fixture('packed-empty.html'), VIDEO_OK);
  assert.deepEqual(noHash.streams, []);
  assert.ok(noHash.logs.warn.some((line) => line.includes('hash ausente')));
  const falseHls = await lone(FIRE, '', { hls: false });
  assert.ok(falseHls.logs.warn.some((line) => line.includes('hls falso')));
  const noSource = await lone(FIRE, '', { hls: true });
  assert.ok(noSource.logs.warn.some((line) => line.includes('videoSource ausente')));
  const watch = await lone('https://playerflix.ink/filme/tt9000001', '', VIDEO_OK);
  assert.equal(watch.streams.length, 2);
  assert.ok(watch.logs.log.some((line) => line.includes('playlist sem RESOLUTION')));
  assert.ok(!watch.calls.some((call) => call.url.includes('watchplay.shop')));
  assert.equal(watch.logs.warn.some((line) => line.includes('Watch')), false);
});

test('videoSource substitui securedLink sem levar a assinatura para o log', async () => {
  const { streams, logs } = await play(chain([
    restMovie,
    (url) => (url.pathname === '/player/index.php' ? { body: { hls: true, videoSource: 'https://cdn.example/master.txt' } } : undefined),
    (url) => (url.pathname === '/master.txt' ? fixture('master-dual.m3u8') : undefined),
  ]));
  assert.equal(streams[0].url, 'https://cdn.example/master.txt');
  assert.ok(logs.log.some((line) => line.includes('videoSource usado')));
  assert.equal(textOf(logs).includes('fictionmd5'), false);
});

test('HLS usa RESOLUTION, mantém master com áudio externo e verifica legenda pelo conteúdo', async () => {
  const variants = await play(chain([restMovie, fireChain('master-variants.m3u8')]));
  assert.deepEqual(variants.streams.map((stream) => stream.quality), ['720p', '360p']);
  assert.equal(variants.streams[0].url.endsWith('.css'), true);
  assert.equal(variants.streams.every((stream) => stream.quality !== '1080p'), true);
  assert.equal(variants.streams[0].size, undefined);
  assert.equal(variants.streams[0].behaviorHints, undefined);

  const dual = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/' ? movieHtml({ label: 'Dublado' }) : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: FIRE } } : undefined),
    fireChain('master-dual.m3u8'),
  ]));
  assert.equal(dual.streams.length, 1);
  assert.equal(dual.streams[0].quality, '480p');
  assert.equal(dual.streams[0].language, 'Dublado');
  assert.equal(dual.streams[0].url, SECURED);
  assert.match(dual.streams[0].title, /Reprodução adaptativa/);
  assert.equal(dual.streams[0].name, 'DooPlay PT-BR 480p\n🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz\nℹ️ Reprodução adaptativa');

  const subs = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/' ? movieHtml({ label: 'Canal 1' }) : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: FIRE } } : undefined),
    (url) => (url.hostname === 'embedplayer2.xyz' ? { body: VIDEO_OK } : undefined),
    (url) => (url.pathname.endsWith('/caption.jpg') ? fixture('caption.vtt') : undefined),
    (url) => (url.hostname === 'cdn.example' ? fixture('master-subs.m3u8') : undefined),
  ]));
  assert.equal(subs.streams.length, 1);
  assert.equal(subs.streams[0].language, 'Legendado');
  assert.equal(subs.streams[0].subtitles[0].url, 'https://cdn.example/caption.jpg');
  assert.ok(!subs.calls.some((call) => call.url.includes('thumb.jpg')));

  const media = await play(chain([restMovie, fireChain('media-playlist.m3u8'), (url) => (url.searchParams.has('s') ? fixture('search-empty.html') : undefined)]));
  assert.equal(media.streams.length, 1);
  assert.equal(media.streams[0].quality, 'Desconhecida');
  assert.equal(media.streams[0].name, 'DooPlay PT-BR Desconhecida\n🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');
  assert.equal(media.streams[0].title, '🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');
});

test('GStream isola idS, plenoflu lê a série e duplicata de stream sai uma vez', async () => {
  const gstream = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/' ? movieHtml({ label: 'Principal HD' }) : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: 'https://embed.embedplayer.site/tt9000001' } } : undefined),
    (url) => (url.hostname === 'embed.embedplayer.site' && url.pathname !== '/stream'
      ? '<div class="player_select_item" idS="ruim"></div><div class="player_select_item" idS="bom"></div>'
      : undefined),
    (url, init) => {
      if (url.pathname !== '/stream') return undefined;
      return formOf({ init }).get('idS') === 'ruim' ? { status: 522, body: '' } : { body: { resources: { sources: [{ file: FIRE }] } } };
    },
    fireChain(),
  ]));
  assert.equal(gstream.streams.length, 2);
  assert.equal(gstream.streams[0].language, 'Idioma Desconhecido');
  assert.equal(gstream.streams[0].name, 'DooPlay PT-BR 720p\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 embedplayer2.xyz');
  assert.ok(gstream.logs.warn.some((line) => line.includes('HTTP 522')));

  const pleno = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: seriesInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Breaking Bad'
        ? [{ url: `${FAG}/serie/breaking-bad/`, title: 'Breaking Bad', year: 2008, type: 'Série' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/serie/breaking-bad/' ? seriesList(FAG, [{ label: 'T2 E3', season: 2, episode: 3 }]) : undefined),
    (url) => (url.pathname === '/episodios/serie-2x3/' ? movieHtml({ type: 'tv', label: 'Player' }) : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: 'https://plenoflu.com/tvshow/1396/2/3' } } : undefined),
    (url) => (url.hostname === 'plenoflu.com' && url.pathname.startsWith('/tvshow/')
      ? 'var TVSHOW_ID = 26798;'
      : undefined),
    (url, init) => {
      if (url.pathname !== '/api') return undefined;
      const action = formOf({ init }).get('action');
      if (action === 'get_season_episodes') {
        return { body: { data: { html: '<div class="episodeOption " data-contentid="111"><div class="episodeNum">Episódio 1</div></div><div class="episodeOption " data-contentid="58258"><div class="episodeNum">Episódio 3</div></div>' } } };
      }
      assert.equal(formOf({ init }).get('contentid'), '58258');
      return { body: { data: { options: [
        { display_type: 'superflix', url: 'https://superflixapi.boats/x' },
        { display_type: 'vaiquecol', url: FIRE },
      ] } } };
    },
    fireChain(),
  ]), ['1396', 'tv', 2, 3], KEY, codes.prism);
  assert.equal(pleno.streams.length, 2);
  assert.ok(pleno.logs.log.some((line) => line.includes('host fora do conjunto: superflixapi.boats')));
  assert.match(pleno.streams[0].title, /T02E03/);

  const duplicate = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/'
      ? `<html><body><a href="https://www.imdb.com/title/tt9000001/">imdb</a><ul>${buttons([{ post: '10', nume: '1', label: 'Dublado' }, { post: '10', nume: '2', label: 'Dublado' }])}</ul></body></html>`
      : undefined),
    (url) => (url.pathname.includes('/dooplayer/') ? { body: { embed_url: FIRE } } : undefined),
    fireChain(),
  ]));
  assert.equal(duplicate.streams.length, 2);
});

test('JSON, HTML e playlist inválidos registram a etapa e a recuperação preserva o aviso', async () => {
  const recovered = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.hostname === 'filmesamadoresgratis.com' && url.pathname.includes('/dcfilter/') ? 'não-json' : undefined),
    (url) => {
      if (url.hostname !== 'www.pobreflixnow.rest') return undefined;
      if (url.searchParams.get('s') === 'Filme Fictício') return card(POBRE, '/filmes/ok/', 'Filme Fictício', 2026);
      if (url.searchParams.has('s')) return fixture('search-empty.html');
      if (url.pathname === '/filmes/ok/') return movieHtml({ post: '72773' });
      if (url.pathname === '/wp-admin/admin-ajax.php') return { body: { embed_url: FIRE } };
      return undefined;
    },
    (url) => {
      if (url.hostname !== 'pobrexflix.art') return undefined;
      if (url.searchParams.has('s')) return card(POBREX, '/filmes/post-70499/', 'Filme Fictício', 2026);
      if (url.pathname === '/filmes/post-70499/') return movieHtml({ post: '70499' });
      return undefined;
    },
    fireChain(),
  ]));
  assert.equal(recovered.streams.length, 2);
  assert.ok(recovered.logs.warn.some((line) => line.startsWith('[DooPlay PT-BR] filmesamadoresgratis.com Busca:')));
  assert.equal(recovered.logs.error.length, 0);
  assert.equal(formOf(recovered.calls.find((call) => call.url.includes('admin-ajax.php'))).get('post'), '72773');
  assert.ok(!recovered.calls.some((call) => call.url.includes('70499') || call.url.includes('post-70499')));

  const badPage = await play(chain([
    (url) => (url.hostname === 'api.themoviedb.org' ? { body: movieInfo() } : undefined),
    (url) => (url.pathname.includes('/dcfilter/')
      ? jsonItems(url.searchParams.get('keyword') === 'Filme Fictício'
        ? [{ url: `${FAG}/filme/filme-ficticio/`, title: 'Filme Fictício', year: 2026, type: 'Filme' }]
        : [])
      : undefined),
    (url) => (url.pathname === '/filme/filme-ficticio/' ? '<html><body><a href="https://www.imdb.com/title/tt9000001/">imdb</a></body></html>' : undefined),
    (url) => (url.searchParams.has('s') ? fixture('search-empty.html') : undefined),
  ]));
  assert.ok(badPage.logs.warn.some((line) => line.includes('filmesamadoresgratis.com Opções:') && line.includes('página sem player')));

  const badList = await play(chain([
    restMovie,
    (url) => (url.hostname === 'embedplayer2.xyz' ? { body: VIDEO_OK } : undefined),
    (url) => (url.hostname === 'cdn.example' ? '#EXTM3U\n#EXT-X-STREAM-INF:NAME="HD"\nhttps://cdn.example/x.m3u8' : undefined),
    (url) => (url.searchParams.has('s') ? fixture('search-empty.html') : undefined),
  ]));
  assert.equal(badList.streams.length, 1);
  assert.equal(badList.streams[0].quality, 'Desconhecida');
  assert.equal(badList.streams[0].name, 'DooPlay PT-BR Desconhecida\n🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');
});

test('formatador: variantes gdrive e prism aplicam o formato aos streams de DooPlay', async () => {
  const gdrive = await play(chain([restMovie, fireChain()]), ['100', 'movie'], KEY, codes.gdrive);
  assert.equal(gdrive.streams[0].name, 'DooPlay PT-BR 720p\n🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');
  assert.equal(gdrive.streams[0].title, '🗣️ Dublado\n🌐 HTTP 🔍 embedplayer2.xyz');

  const prism = await play(chain([restMovie, fireChain()]), ['100', 'movie'], KEY, codes.prism);
  assert.equal(prism.streams[0].name, '💿 HD 720p\n🎬 Filme Fictício (2026)\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz');
  assert.equal(prism.streams[0].title, '🎬 Filme Fictício (2026)\n🗣️ Dublado\n🌐 HTTP\n📡 embedplayer2.xyz\n🔍DooPlay PT-BR');
});
