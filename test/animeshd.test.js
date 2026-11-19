const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'animeshd');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const tmdbDemon = readJson('tmdb-demon.json');
const tmdbAttack = readJson('tmdb-attack.json');
const tmdbOnePiece = readJson('tmdb-one-piece.json');
const tmdbCount = readJson('tmdb-count.json');
const searchDemon = read('search-demon.html');
const searchAttack = read('search-attack.html');
const searchOnePiece = read('search-one-piece.html');
const searchCount = read('search-count.html');
const searchAlien = read('search-alien.html');
const searchEmpty = read('search-empty.html');
const searchMalformed = read('search-malformed.html');
const pageDemon = read('page-demon.html');
const pageAttack = read('page-attack.html');
const pageOnePiece = read('page-one-piece.html');
const pageCount = read('page-count.html');
const pageBerserk = read('page-berserk.html');
const pageWrongYear = read('page-wrong-year.html');
const pageNoTitle = read('page-no-title.html');
const pageNoDate = read('page-no-date.html');
const pageNoSeasons = read('page-no-seasons.html');
const pageNoHref = read('page-no-href.html');
const episodeSingle = read('episode-single.html');
const episodeTwo = read('episode-two.html');
const episodeP1 = read('episode-p1.html');
const episodeEmpty = read('episode-empty.html');
const episodeMalformed = read('episode-malformed.html');
const episodeTrailer = read('episode-trailer.html');
const ajaxBlogger = readJson('ajax-blogger.json');
const ajaxEmpty = readJson('ajax-empty.json');
const ajaxUnknown = readJson('ajax-unknown.json');
const ajaxBlank = readJson('ajax-blank.json');
const bloggerFormats = read('blogger-formats.html');
const bloggerEmpty = read('blogger-empty.html');
const bloggerUnknown = read('blogger-unknown.html');

let codes = {};

test.before(async () => {
  const outDir = createTempDir('animeshd-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('animeshd', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('animeshd', { outDir, formatter: 'prism' }), 'utf8');
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

function tmdbResponse(url) {
  const id = url.pathname.split('/').pop();
  if (id === '85937') return { body: tmdbDemon };
  if (id === '1429') return { body: tmdbAttack };
  if (id === '37854') return { body: tmdbOnePiece };
  if (id === '9001') return { body: tmdbCount };
  return { status: 404, body: 'TMDB ausente' };
}

function searchResponse(query) {
  if (query === 'Kimetsu no Yaiba') return { body: searchDemon };
  if (query === 'Shingeki no Kyojin') return { body: searchAttack };
  if (query === 'One Piece') return { body: searchOnePiece };
  if (query === 'Contagem') return { body: searchCount };
  return { body: searchEmpty };
}

function pageResponse(url) {
  if (url.pathname.includes('kimetsu-no-yaiba-demon-slayer')) return { body: pageDemon };
  if (url.pathname.includes('shingeki-no-kyojin')) return { body: pageAttack };
  if (url.pathname.includes('one-piece-online')) return { body: pageOnePiece };
  if (url.pathname.includes('contagem')) return { body: pageCount };
  if (url.pathname.includes('berserk')) return { body: pageBerserk };
  return { status: 404, body: 'página ausente' };
}

function episodeResponse(url) {
  if (url.pathname.startsWith('/episodios/')) return { body: episodeSingle };
  return { status: 404, body: 'episódio ausente' };
}

function ajaxResponse(init) {
  const form = new URLSearchParams(init.body || '');
  if (form.get('nume') === '2') {
    return { body: { embed_url: 'https://www.blogger.com/video.g?token=LEG', type: 'iframe' } };
  }
  return { body: ajaxBlogger };
}

function bloggerResponse(url) {
  const token = url.searchParams.get('token');
  if (token === 'LEG') return { body: bloggerEmpty };
  if (token === 'UNKNOWN') return { body: bloggerUnknown };
  return { body: bloggerFormats };
}

function fullRoute(overrides = {}) {
  return async (url, init) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (overrides.tmdb) {
        return typeof overrides.tmdb === 'function' ? overrides.tmdb(url) : { body: overrides.tmdb };
      }
      return tmdbResponse(url);
    }
    if (url.hostname === 'animeshd.to') {
      if (url.pathname === '/' && url.searchParams.has('s')) {
        if (overrides.search) {
          return typeof overrides.search === 'function'
            ? overrides.search(url.searchParams.get('s'), url)
            : { body: overrides.search };
        }
        return searchResponse(url.searchParams.get('s'));
      }
      if (url.pathname.startsWith('/animes/')) {
        if (overrides.page) {
          return typeof overrides.page === 'function' ? overrides.page(url) : { body: overrides.page };
        }
        return pageResponse(url);
      }
      if (url.pathname.startsWith('/episodios/')) {
        if (overrides.episode) {
          return typeof overrides.episode === 'function' ? overrides.episode(url) : { body: overrides.episode };
        }
        return episodeResponse(url);
      }
      if (url.pathname === '/wp-admin/admin-ajax.php' && init.method === 'POST') {
        if (overrides.ajax) {
          return typeof overrides.ajax === 'function' ? overrides.ajax(init) : { body: overrides.ajax };
        }
        return ajaxResponse(init);
      }
      throw new Error(`Rota AnimesHD inesperada: ${url.pathname}`);
    }
    if (url.hostname === 'www.blogger.com') {
      if (overrides.blogger) {
        return typeof overrides.blogger === 'function' ? overrides.blogger(url) : { body: overrides.blogger };
      }
      return bloggerResponse(url);
    }
    throw new Error(`Host inesperado: ${url.hostname}`);
  };
}

function episodeCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname.startsWith('/episodios/'));
}

function searchCalls(calls) {
  return calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === 'animeshd.to' && url.pathname === '/' && url.searchParams.has('s');
  });
}

test('1.1 carrega o pacote sem rede e expõe getStreams', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);
});

test('1.1 valida entrada antes de qualquer requisição', async () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });

  const badId = await runtime.exports.getStreams('abc', 'movie', null, null);
  assert.deepEqual(Array.from(badId), []);
  assert.match(runtime.errors[0], /\[AnimesHD\] Falha em movie abc: Entrada: ID do TMDB inválido/);

  const badType = await runtime.exports.getStreams('85937', 'anime', null, null);
  assert.deepEqual(Array.from(badType), []);
  assert.match(runtime.errors[1], /Entrada: tipo de mídia inválido/);

  const noSeason = await runtime.exports.getStreams('85937', 'tv', null, 1);
  assert.deepEqual(Array.from(noSeason), []);
  assert.match(runtime.errors[2], /Entrada: série sem temporada\/episódio válidos/);

  assert.equal(fetchCalled, false);
});

test('1.2 filme é recusado sem requisição', async () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  const streams = await runtime.exports.getStreams('603', 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(fetchCalled, false);
  assert.deepEqual(runtime.errors, []);
});

test('2.1 e 5.1 resolvem Demon Slayer S01E01 com qualidade e idioma', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  const [first, second] = streams;
  assert.equal(first.quality, '720p');
  assert.equal(first.language, 'Legendado');
  assert.equal(first.provider, 'Blogger');
  assert.equal(first.type, 'mp4');
  assert.equal(first.url, 'https://media.example.test/720.mp4');
  assert.equal(first.format, undefined);
  assert.equal(first.headers.Referer, undefined);
  assert.match(first.headers['User-Agent'], /^Mozilla\/5\.0/);
  assert.match(first.name, /720p/);
  assert.match(first.title, /T01E01/);
  assert.match(first.title, /AnimesHD/);
  assert.equal(second.quality, '360p');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.1 e 3.1 alinham a temporada 3 do TMDB com a temporada 2 da fonte', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('85937', 'tv', 3, 1);

  assert.equal(streams.length, 2);
  assert.match(streams[0].title, /T03E01/);
  const calls = episodeCalls(runtime.calls);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, '/episodios/kimetsu-no-yaiba-2-episodio-1/');
  assert.deepEqual(runtime.errors, []);
});

test('3.1 usa a temporada 3 da fonte para a temporada 4 do TMDB', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('85937', 'tv', 4, 1);

  assert.equal(streams.length, 2);
  assert.equal(
    new URL(episodeCalls(runtime.calls)[0].url).pathname,
    '/episodios/kimetsu-no-yaiba-3-episodio-1/',
  );
});

test('3.2 temporada 2 do TMDB (Mugen Train) é ausência', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('85937', 'tv', 2, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(episodeCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.2 e 2.3 Attack on Titan confirma pelo título entre parênteses', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('1429', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.equal(
    new URL(episodeCalls(runtime.calls)[0].url).pathname,
    '/episodios/shingeki-no-kyojin-episodio-1/',
  );
  assert.deepEqual(runtime.errors, []);
});

test('3.3 One Piece S01E01 usa a temporada 1 única', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('37854', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.equal(new URL(episodeCalls(runtime.calls)[0].url).pathname, '/episodios/one-piece-episodio-1/');
});

test('3.3 One Piece S02E01 é ausência em temporada agrupada', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('37854', 'tv', 2, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(episodeCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('3.2 Contagem usa a contagem de episódios quando não há data', async () => {
  const runtime = makeRuntime(fullRoute());
  const first = await runtime.exports.getStreams('9001', 'tv', 1, 1);
  assert.equal(first.length, 2);
  assert.equal(new URL(episodeCalls(runtime.calls)[0].url).pathname, '/episodios/contagem-episodio-1/');

  const secondRuntime = makeRuntime(fullRoute());
  const second = await secondRuntime.exports.getStreams('9001', 'tv', 2, 1);
  assert.equal(second.length, 2);
  assert.equal(
    new URL(episodeCalls(secondRuntime.calls)[0].url).pathname,
    '/episodios/contagem-2-episodio-1/',
  );
});

test('3.2 contagem divergente é ausência', async () => {
  const mismatch = {
    ...tmdbCount,
    seasons: [
      { season_number: 1, episode_count: 3, name: 'Temporada 1', air_date: null },
      { season_number: 2, episode_count: 1, name: 'Temporada 2', air_date: null },
    ],
  };
  const runtime = makeRuntime(fullRoute({ tmdb: mismatch }));
  const streams = await runtime.exports.getStreams('9001', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(episodeCalls(runtime.calls).length, 0);
});

test('2.3 resultado alheio é ausência', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchAlien }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 ano divergente é ausência', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageWrongYear }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 ficha 404 é pulada e o próximo candidato confirma', async () => {
  const runtime = makeRuntime(fullRoute({
    page: (url) => {
      if (url.pathname.includes('kimetsu-no-yaiba-demon-slayer')) return { status: 404, body: 'removida' };
      if (url.pathname.includes('berserk')) return { body: pageDemon };
      return { status: 404, body: 'ausente' };
    },
  }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.equal(searchCalls(runtime.calls).length > 0, true);
});

test('2.3 ficha sem h1 é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageNoTitle }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[AnimesHD\].*sem h1/);
});

test('2.3 ficha sem data é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageNoDate }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[AnimesHD\].*sem span\.date/);
});

test('2.4 busca sem cartões e sem marcador é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchMalformed }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[AnimesHD\].*sem cartões/);
});

test('2.4 busca sem resultado é ausência', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchEmpty }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 falha de um termo com correspondência em outro continua, com aviso', async () => {
  const runtime = makeRuntime(fullRoute({
    search: (query) => {
      if (query === 'Kimetsu no Yaiba') return { body: searchDemon };
      if (query === 'Demon Slayer: Kimetsu no Yaiba') return { status: 500, body: 'falha simulada' };
      return { body: searchEmpty };
    },
  }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.equal(runtime.warnings.some((message) => message.includes('Busca "Demon Slayer: Kimetsu no Yaiba" descartada')), true);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 todas as buscas falham e o erro agregado sobe', async () => {
  const runtime = makeRuntime(fullRoute({
    search: () => ({ status: 500, body: 'falha simulada' }),
  }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[AnimesHD\].*Nenhuma busca produziu candidato/);
});

test('4.1 episódio sem opções é ausência', async () => {
  const runtime = makeRuntime(fullRoute({ episode: episodeEmpty }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('4.1 página de episódio sem estrutura é erro', async () => {
  const runtime = makeRuntime(fullRoute({ episode: episodeMalformed }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[AnimesHD\].*sem h1\.epih1/);
});

test('4.1 trailer é ignorado', async () => {
  const runtime = makeRuntime(fullRoute({ episode: episodeTrailer }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('4.2 e 5.1 opção Dublado e Legendado com falha isolada', async () => {
  const runtime = makeRuntime(fullRoute({ episode: episodeTwo }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  for (const stream of streams) assert.equal(stream.language, 'Dublado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[AnimesHD\] Opção Legendado descartada/);
  assert.deepEqual(runtime.errors, []);
});

test('4.2 todas as opções falham e o erro agregado sobe', async () => {
  const runtime = makeRuntime(fullRoute({
    episode: episodeTwo,
    blogger: bloggerEmpty,
  }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.errors[0], /\[AnimesHD\].*Nenhuma opção produziu stream/);
});

test('4.1 host não suportado é triagem', async () => {
  const runtime = makeRuntime(fullRoute({ ajax: ajaxUnknown }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(runtime.logs.some((message) => message.includes('triagem')), true);
});

test('4.1 AJAX sem embed_url é falha isolada', async () => {
  const runtime = makeRuntime(fullRoute({ ajax: ajaxEmpty }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.warnings[0], /sem embed_url/);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream/);
});

test('4.1 AJAX com embed_url vazio é falha isolada', async () => {
  const runtime = makeRuntime(fullRoute({ ajax: ajaxBlank }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.warnings[0], /sem embed_url/);
});

test('4.2 Blogger sem streamingData é falha isolada', async () => {
  const runtime = makeRuntime(fullRoute({ blogger: bloggerEmpty }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.warnings[0], /streamingData/);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream/);
});

test('5.2 rótulo P1 fica Idioma Desconhecido', async () => {
  const runtime = makeRuntime(fullRoute({ episode: episodeP1 }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  for (const stream of streams) assert.equal(stream.language, 'Idioma Desconhecido');
});

test('5.2 duas opções para a mesma URL geram um stream', async () => {
  const runtime = makeRuntime(fullRoute({ episode: episodeTwo, ajax: ajaxBlogger }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams).map((stream) => stream.quality), ['720p', '360p']);
});

test('5.3 qualidade desconhecida fica no fim da ordenação', async () => {
  const runtime = makeRuntime(fullRoute({
    episode: episodeTwo,
    ajax: (init) => {
      const form = new URLSearchParams(init.body || '');
      if (form.get('nume') === '2') {
        return { body: { embed_url: 'https://www.blogger.com/video.g?token=UNKNOWN', type: 'iframe' } };
      }
      return { body: ajaxBlogger };
    },
  }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams).map((stream) => stream.quality), ['720p', '360p', 'Desconhecida']);
});

test('5.3 ficha sem temporadas é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageNoSeasons }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[AnimesHD\].*sem div\.se-c/);
});

test('5.3 episódio sem href é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageNoHref }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[AnimesHD\].*sem href publicado/);
});

test('5.4 logs não contêm URL ou token', async () => {
  const runtime = makeRuntime(fullRoute({
    episode: episodeTwo,
    blogger: bloggerEmpty,
  }));
  await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.ok(runtime.warnings.length > 0);
  assert.ok(runtime.errors.length > 0);
  for (const message of [...runtime.warnings, ...runtime.errors]) {
    assert.equal(message.includes('https://'), false);
    assert.equal(message.includes('EXAMPLE'), false);
  }
});

test('6.1 usa o template Prism quando o build fixa o formato', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('85937', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.match(streams[0].name, /720p/);
  assert.match(streams[0].title, /AnimesHD/);
  assert.equal(streams[0].format, undefined);
});
