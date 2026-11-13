const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'doramogo');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const MOVIE_ID = '1269208';
const TV_ID = '94796';
const SWEET_HOME_ID = '96648';
const ITAEWON_ID = '96162';
const LOJA_ID = '215072';

const SERIES_URL = 'https://forks-doramas.madfirebox.shop/P/pousando-no-amor/01-temporada/01/stream.m3u8';
const SWEET_HOME_URL = 'https://forks-doramas.madfirebox.shop/S/sweet-home/02-temporada/01/stream.m3u8';
const ITAEWON_URL = 'https://forks-doramas.madfirebox.shop/I/itaewon-class-legendado/01-temporada/01/stream.m3u8';
const LOJA_DUB_URL = 'https://forks-doramas.madfirebox.shop/U/uma-loja-para-assassinos-2025/01-temporada/01/stream.m3u8';
const LOJA_LEG_URL = 'https://forks-doramas.madfirebox.shop/U/uma-loja-para-assassinos-legendado/01-temporada/01/stream.m3u8';
const MOVIE_URL = 'https://forks-filmes.madfirebox.shop/W/wall-to-wall/stream/stream.m3u8';

const tmdbMovie = readJson('tmdb-wall-to-wall.json');
const tmdbPousando = readJson('tmdb-pousando.json');
const tmdbSweetHome = readJson('tmdb-sweet-home.json');
const tmdbItaewon = readJson('tmdb-itaewon.json');
const tmdbLoja = readJson('tmdb-loja.json');

const searchPousando = read('search-pousando.html');
const searchNoId = read('search-no-id.html');
const searchSweetHome = read('search-sweet-home.html');
const searchItaewon = read('search-itaewon.html');
const searchTwoAudio = read('search-two-audio.html');
const searchMeus84 = read('search-meus84.html');
const searchEmpty = read('search-empty.html');

const seriesPousando = read('series-pousando.html');
const seriesPousandoNoList = read('series-pousando-no-list.html');
const seriesSweetHome = read('series-sweet-home.html');
const seriesItaewon = read('series-itaewon.html');
const seriesLojaDub = read('series-loja-dub.html');
const seriesLojaLeg = read('series-loja-leg.html');
const seriesWallToWall = read('series-wall-to-wall.html');
const seriesWallToWallNoEntry = read('series-wall-to-wall-no-entry.html');

const episodePousando = read('episode-pousando.html');
const episodePousando16 = read('episode-pousando-17.html');
const episodePousandoNoConfig = read('episode-pousando-no-config.html');
const episodeSweetHome = read('episode-sweet-home-s2.html');
const episodeItaewon = read('episode-itaewon.html');
const episodeLojaDub = read('episode-loja-dub.html');
const episodeLojaLeg = read('episode-loja-leg.html');
const episodeWallToWall = read('episode-wall-to-wall.html');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const NOT_FOUND = '<!DOCTYPE html><html><body><h1>Página não encontrada</h1></body></html>';

let codes = {};

test.before(async () => {
  const outDir = createTempDir('doramogo-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('doramogo', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('doramogo', { outDir, formatter: 'prism' }), 'utf8');
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
  return { exports: context.module.exports, calls, errors, warnings };
}

function tmdbBody(url) {
  if (url.pathname.endsWith(`/movie/${MOVIE_ID}`)) return tmdbMovie;
  if (url.pathname.endsWith(`/tv/${TV_ID}`)) return tmdbPousando;
  if (url.pathname.endsWith(`/tv/${SWEET_HOME_ID}`)) return tmdbSweetHome;
  if (url.pathname.endsWith(`/tv/${ITAEWON_ID}`)) return tmdbItaewon;
  if (url.pathname.endsWith(`/tv/${LOJA_ID}`)) return tmdbLoja;
  throw new Error(`TMDB inesperado: ${url.pathname}`);
}

function searchBody(term) {
  if (term === 'Pousando no Amor') return searchPousando;
  if (term === 'Sweet Home') return searchSweetHome;
  if (term === 'Itaewon Class') return searchItaewon;
  if (term === 'Uma Loja Para Assassinos') return searchTwoAudio;
  if (term === 'Meus 84 m²') return searchMeus84;
  return searchEmpty;
}

function detailBody(slug) {
  if (slug === 'pousando-no-amor') return seriesPousando;
  if (slug === 'sweet-home') return seriesSweetHome;
  if (slug === 'itaewon-class-legendado') return seriesItaewon;
  if (slug === 'uma-loja-para-assassinos-2025') return seriesLojaDub;
  if (slug === 'uma-loja-para-assassinos-legendado') return seriesLojaLeg;
  if (slug === 'wall-to-wall') return seriesWallToWall;
  return null;
}

function episodeBody(slug, season, episode) {
  const key = `${slug}/${season}/${episode}`;
  if (key === 'pousando-no-amor/1/1') return { body: episodePousando };
  if (key === 'pousando-no-amor/1/16') return { body: episodePousando16 };
  if (key === 'pousando-no-amor/1/17') {
    return { url: 'https://www.doramogo.net/series/pousando-no-amor/temporada-1/episodio-16', body: episodePousando16 };
  }
  if (key === 'sweet-home/2/1') return { body: episodeSweetHome };
  if (key === 'itaewon-class-legendado/1/1') return { body: episodeItaewon };
  if (key === 'uma-loja-para-assassinos-2025/1/1') return { body: episodeLojaDub };
  if (key === 'uma-loja-para-assassinos-legendado/1/1') return { body: episodeLojaLeg };
  if (key === 'wall-to-wall/1/1') return { body: episodeWallToWall };
  return null;
}

function fullRoute(overrides = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: tmdbBody(url) };
    if (url.hostname !== 'www.doramogo.net') throw new Error(`Host inesperado: ${url.hostname}`);
    if (url.pathname === '/search/') {
      if (overrides.search) return overrides.search(url);
      return { body: searchBody(url.searchParams.get('q')) };
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'series') throw new Error(`Rota inesperada: ${url.pathname}`);
    if (parts.length === 2) {
      if (overrides.detail) return overrides.detail(url);
      const body = detailBody(parts[1]);
      return body === null ? { status: 404, body: NOT_FOUND } : { body };
    }
    if (parts.length === 4) {
      if (overrides.episode) return overrides.episode(url);
      const season = /^temporada-(\d+)$/.exec(parts[2]);
      const episode = /^episodio-(\d+)$/.exec(parts[3]);
      const result = season && episode ? episodeBody(parts[1], Number(season[1]), Number(episode[1])) : null;
      return result || { status: 404, body: NOT_FOUND };
    }
    throw new Error(`Rota inesperada: ${url.pathname}`);
  };
}

function callCount(calls, fragment) {
  return calls.filter((call) => call.url.includes(fragment)).length;
}

function callsToPath(calls, pathname) {
  return calls.filter((call) => new URL(call.url).pathname === pathname).length;
}

test('manifesto registra o Doramogo com filme e série', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'doramogo');
  assert.ok(entry);
  assert.equal(entry.name, 'Doramogo');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
});

test('filme resolve HLS no host alternativo e monta o contrato', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, MOVIE_URL);
  assert.equal(stream.type, 'hls');
  assert.equal(stream.provider, 'doramogo');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.quality, 'Desconhecida');
  assert.equal('size' in stream, false);
  assert.equal('subtitles' in stream, false);
  assert.equal('seeders' in stream, false);
  assert.equal('peers' in stream, false);
  assert.equal('infoHash' in stream, false);
  assert.equal('format' in stream, false);
  assert.match(stream.name, /^Doramogo Desconhecida/);
  assert.match(stream.title, /🌐 HTTP/);
  assert.match(stream.title, /🗣️ Dublado/);
  assert.equal(stream.headers.Referer, 'https://www.doramogo.net/series/wall-to-wall/temporada-1/episodio-01');
  assert.equal(stream.headers.Origin, 'https://www.doramogo.net');
  assert.ok(stream.headers['User-Agent'].includes('Mozilla/5.0'));
  assert.equal(callsToPath(runtime.calls, '/series/wall-to-wall'), 1);
  assert.equal(callsToPath(runtime.calls, '/series/wall-to-wall/temporada-1/episodio-01'), 1);
});

test('série resolve episódio HLS dublado com temporada e episódio', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, SERIES_URL);
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.quality, 'Desconhecida');
  assert.match(stream.name, /^❓ Desconhecida/);
  assert.match(stream.name, /T01E01/);
  assert.match(stream.title, /Pousando no Amor/);
  assert.match(stream.title, /\(2019\)/);
  assert.equal(stream.headers.Referer, 'https://www.doramogo.net/series/pousando-no-amor/temporada-1/episodio-01');
});

test('temporada posterior escolhe o episódio da temporada pedida', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(SWEET_HOME_ID, 'tv', 2, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, SWEET_HOME_URL);
  assert.match(streams[0].name, /T02E01/);
  assert.equal(callCount(runtime.calls, '/sweet-home/temporada-2/episodio-01'), 1);
});

test('variante legendada usa o rótulo da ficha', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams(ITAEWON_ID, 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, ITAEWON_URL);
  assert.equal(streams[0].language, 'Legendado');
});

test('duas variantes de áudio do mesmo ID devolvem os dois streams', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams(LOJA_ID, 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 0);
  assert.equal(streams.length, 2);
  assert.deepEqual(
    [...streams.map((stream) => stream.language)].sort(),
    ['Dublado', 'Legendado'],
  );
  assert.deepEqual(
    [...streams.map((stream) => stream.url)].sort(),
    [LOJA_DUB_URL, LOJA_LEG_URL].sort(),
  );
  assert.equal(callsToPath(runtime.calls, '/series/uma-loja-para-assassinos-2025'), 1);
  assert.equal(callsToPath(runtime.calls, '/series/uma-loja-para-assassinos-legendado'), 1);
});

test('cartão sem ID confirma a identidade pelo pôster da ficha', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchNoId }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, SERIES_URL);
  assert.equal(callsToPath(runtime.calls, '/series/pousando-no-amor'), 1);
  assert.equal(callsToPath(runtime.calls, '/series/pousando-no-amor/temporada-1/episodio-01'), 1);
});

test('título decorado é confirmado pelo ID do TMDB', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchItaewon }) }));
  const streams = await runtime.exports.getStreams(ITAEWON_ID, 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
});

test('tipo conflitante no cartão devolve lista vazia sem erro', async () => {
  const movieRuntime = makeRuntime(fullRoute({ search: () => ({ body: searchPousando }) }));
  const movieStreams = await movieRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(movieStreams.length, 0);
  assert.equal(movieRuntime.errors.length, 0, movieRuntime.errors.join(' | '));

  const tvRuntime = makeRuntime(fullRoute({ search: () => ({ body: searchMeus84 }) }));
  const tvStreams = await tvRuntime.exports.getStreams(SWEET_HOME_ID, 'tv', 1, 1);
  assert.equal(tvStreams.length, 0);
  assert.equal(tvRuntime.errors.length, 0, tvRuntime.errors.join(' | '));
});

test('ID conflitante no pôster descarta o candidato sem erro', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchItaewon }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(callCount(runtime.calls, '/series/itaewon-class-legendado'), 0);
});

test('título ausente devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchEmpty }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
});

test('episódio ausente na ficha devolve lista vazia sem chamar a página', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 18);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(callCount(runtime.calls, '/temporada-1/episodio-18'), 0);
});

test('episódio redirecionado para outra coordenada é ausência', async () => {
  const withEpisode17 = seriesPousando.replace(
    '</div></div></div>\n</body>',
    '<a href="https://www.doramogo.net/series/pousando-no-amor/temporada-1/episodio-17" class="dorama-one-episode-item"><span class="dorama-one-episode-number">EP 17</span><span class="episode-title"> Episodio 17 </span></a></div></div></div>\n</body>',
  );
  const runtime = makeRuntime(fullRoute({ detail: () => ({ body: withEpisode17 }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 17);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(callCount(runtime.calls, '/temporada-1/episodio-17'), 1);
});

test('filme sem entrada pseudoepisódio devolve lista vazia', async () => {
  const runtime = makeRuntime(fullRoute({ detail: () => ({ body: seriesWallToWallNoEntry }) }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(callCount(runtime.calls, '/temporada-1/episodio-01'), 0);
});

test('ficha de série sem lista de episódios é falha de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ detail: () => ({ body: seriesPousandoNoList }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Doramogo\]/);
  assert.match(runtime.errors[0], /sem lista de episódios/);
});

test('configuração de player ausente é falha de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ episode: () => ({ body: episodePousandoNoConfig }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Doramogo\]/);
  assert.match(runtime.errors[0], /urlConfig/);
});

test('falha de uma variante descarta só aquela opção', async () => {
  const runtime = makeRuntime(fullRoute({
    detail: (url) => url.pathname.includes('uma-loja-para-assassinos-legendado')
      ? { status: 500, body: 'erro' }
      : { body: detailBody(url.pathname.split('/').filter(Boolean)[1]) },
  }));
  const streams = await runtime.exports.getStreams(LOJA_ID, 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0, runtime.errors.join(' | '));
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Doramogo\] Opção/);
  assert.match(runtime.warnings[0], /descartada/);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, LOJA_DUB_URL);
  assert.equal(streams[0].language, 'Dublado');
});

test('falha de todas as variantes sobe erro agregado para getStreams', async () => {
  const runtime = makeRuntime(fullRoute({
    detail: () => ({ status: 500, body: 'erro' }),
  }));
  const streams = await runtime.exports.getStreams(LOJA_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Doramogo\]/);
  assert.match(runtime.errors[0], /Nenhuma variante de áudio produziu stream/);
  assert.match(runtime.errors[0], /HTTP 500/);
});

test('falha de rede na busca é registrada e devolve lista vazia', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Doramogo\]/);
  assert.match(runtime.errors[0], /HTTP 500/);
});

test('resposta que não é a página de busca é falha', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: '<html><body>bloqueio</body></html>' }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /sem a lista de resultados/);
});

test('entrada inválida é rejeitada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(() => { throw new Error('fetch inesperado'); });
  assert.equal((await runtime.exports.getStreams('abc', 'movie', null, null)).length, 0);
  assert.equal((await runtime.exports.getStreams(TV_ID, 'anime', 1, 1)).length, 0);
  assert.equal((await runtime.exports.getStreams(TV_ID, 'tv', null, 1)).length, 0);
  assert.equal((await runtime.exports.getStreams(TV_ID, 'tv', 0, 1)).length, 0);

  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, 4);
});

test('configuração de série e de filme monta as duas URLs HLS', async () => {
  const { buildHlsUrl, readEpisodeConfig } = await import('../src/doramogo/site.js');
  const series = readEpisodeConfig(episodePousando);
  const movie = readEpisodeConfig(episodeWallToWall);

  assert.deepEqual(series, {
    slug: 'pousando-no-amor',
    tipo: 'doramas',
    season: 1,
    episode: 1,
    fallbackUrl: 'https://forks-doramas.madfirebox.shop',
  });
  assert.equal(buildHlsUrl(series), SERIES_URL);
  assert.deepEqual(movie, {
    slug: 'wall-to-wall',
    tipo: 'filmes',
    season: 1,
    episode: 1,
    fallbackUrl: 'https://forks-filmes.madfirebox.shop',
  });
  assert.equal(buildHlsUrl(movie), MOVIE_URL);
  assert.throws(() => readEpisodeConfig(episodePousandoNoConfig), /urlConfig/);
});

test('fixtures são sanitizadas e mantêm os marcadores da fonte', () => {
  for (const name of fs.readdirSync(FIXTURES)) {
    if (!name.endsWith('.html')) continue;
    const content = read(name);
    assert.doesNotMatch(content, /PHPSESSID|token=|signature=|expires=|X-Amz-|md5=|\?version=/i, name);
  }
});
