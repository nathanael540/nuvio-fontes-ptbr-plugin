const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Linter } = require('eslint');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'seekee');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const MIRRORS = [
  'es.cuevana4br.com',
  'play.cuevana19.com',
  'flixlat.com',
  'latino.solo-latino.com',
  'video.playspelis.com',
  'www3.dramasfree.com',
  'ww20.321moviesfree.com',
];
const SEARCH_HOST = 'h5-api.otv.cc';
const MOVIE_ID = '269149';
const TV_ID = '1396';
const PUBLIC_KEY_DER =
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCTV/esy4+CgwXa0XKDX+h++vlli2k+ugKTZxCb/Cm/pMhUj/rTDZYvMWaSR3Kjoi1R/E5uQEeBslOFNyRuSd4YXauHZT7Z9AuaLW8Wd4TOcy/vMpqRL91qsdDsNblIzK3R1eqwvm8+b7G/mjEYzwPFpcNwA9ZLVS33+VX2EvcP4wIDAQAB';

const PATHS = {
  zootopiaDub: '/pt/detail/movie/z7B5nbeAAIild16fgVSOw-Zootopia',
  zootopiaLeg: '/pt/detail/movie/MtfaTXRzhbUawiykJJOd1-Zootopia',
  s1e5Dub: '/pt/detail/drama/hQfMsSkCwfXy1XA0poRsb-Breaking-Bad-Season-1/5',
  s1e5Leg: '/pt/detail/drama/RXpSp81ElLAImfRyLJbEA-Breaking-Bad-Season-1/5',
  s1e99Dub: '/pt/detail/drama/hQfMsSkCwfXy1XA0poRsb-Breaking-Bad-Season-1/99',
  s1e3Dub: '/pt/detail/drama/hQfMsSkCwfXy1XA0poRsb-Breaking-Bad-Season-1/3',
  s4e3Dub: '/pt/detail/drama/VSRBlbJ1Xp8FqwMCi4D8c-Breaking-Bad-Season-4/3',
  s4e3Leg: '/pt/detail/drama/XHnnN9XrP0hSbiWduh4mo-Breaking-Bad-Season-4/3',
};
const PAGES = {
  [PATHS.zootopiaDub]: read('movie-zootopia-dub.html'),
  [PATHS.zootopiaLeg]: read('movie-zootopia-leg.html'),
  [PATHS.s1e5Dub]: read('tv-bb-s1e5-dub.html'),
  [PATHS.s1e5Leg]: read('tv-bb-s1e5-leg.html'),
  [PATHS.s1e99Dub]: read('tv-bb-s1e99-dub.html'),
  [PATHS.s1e3Dub]: read('tv-bb-s1e3-dub.html'),
  [PATHS.s4e3Dub]: read('tv-bb-s4e3-dub.html'),
  [PATHS.s4e3Leg]: read('tv-bb-s4e3-leg.html'),
};
const SEARCHES = {
  'Zootopia: Essa Cidade é o Bicho': readJson('search-zootopia-pt.json'),
  Zootopia: readJson('search-zootopia.json'),
  'Breaking Bad': readJson('search-breaking-bad.json'),
};
const EMPTY_SEARCH = readJson('search-empty.json');
const META = { movie: readJson('meta-movie.json'), tv: readJson('meta-tv.json') };

const codes = {};

test.before(async () => {
  const outDir = createTempDir('seekee-test-');
  try {
    codes.base = fs.readFileSync(await buildProvider('seekee', { outDir }), 'utf8');
    codes.gdrive = fs.readFileSync(await buildProvider('seekee', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('seekee', { outDir, formatter: 'prism' }), 'utf8');
    codes.min = fs.readFileSync(await buildProvider('seekee', { outDir, formatter: 'prism', minify: true }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

/**
 * Lê o `pageProps` de uma página de fixture.
 * @param {string} html - Página.
 * @returns {object} pageProps.
 */
function pageProps(html) {
  return JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]).props.pageProps;
}

/**
 * Remonta uma página de fixture com o pageProps alterado.
 * @param {string} html - Página original.
 * @param {(props: object) => void} change - Alteração aplicada ao pageProps.
 * @returns {string} Página alterada.
 */
function editPage(html, change) {
  const props = pageProps(html);
  change(props);
  const data = JSON.stringify({ props: { pageProps: props } });
  return html.replace(/(<script id="__NEXT_DATA__"[^>]*>)[\s\S]*?(<\/script>)/, (_, open, close) => `${open}${data}${close}`);
}

function makeRuntime(route, { bundle = codes.gdrive, random, scraperId } = {}) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const context = vm.createContext({
    module: { exports: {} },
    URL,
    URLSearchParams,
    btoa,
    atob,
    TMDB_API_KEY: 'chave-ficticia',
    SCRAPER_ID: scraperId,
    require: (name) => {
      if (name === 'crypto-js') return require('crypto-js');
      throw new Error(`require inesperado: ${name}`);
    },
    console: {
      error: (message) => errors.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      log: () => {},
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const result = await route(new URL(url), init || {});
      const status = result.status || 200;
      const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
      return {
        ok: status >= 200 && status < 300,
        status,
        url: String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  });
  if (random !== undefined) vm.runInContext(`Math.random = () => ${random};`, context);
  vm.runInContext(bundle, context);
  // Copia o resultado para este realm: arrays do vm não passam no deepStrictEqual.
  const getStreams = async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args)));
  return { getStreams, calls, errors, warnings, exports: Object.keys(context.module.exports) };
}

/**
 * Rota padrão: TMDB, busca e espelhos servidos pelas fixtures.
 * @param {object} [options] - Substituições.
 * @returns {(url: URL) => Promise<{ status?: number, body: * }>} Rota.
 */
function seekeeRoute(options = {}) {
  const searches = options.searches || SEARCHES;
  const pages = { ...PAGES, ...(options.pages || {}) };
  const meta = { movie: options.movieMeta || META.movie, tv: META.tv };
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (url.pathname === `/3/movie/${MOVIE_ID}`) return { body: meta.movie };
      if (url.pathname === `/3/tv/${TV_ID}`) return { body: meta.tv };
      throw new Error(`Rota TMDB inesperada: ${url.pathname}`);
    }
    if (url.hostname === SEARCH_HOST) {
      if (options.search) return options.search(url);
      return { body: searches[url.searchParams.get('keyWord')] || EMPTY_SEARCH };
    }
    if (MIRRORS.includes(url.hostname)) {
      if (options.mirror) {
        const custom = options.mirror(url);
        if (custom !== undefined) return custom;
      }
      const page = pages[url.pathname];
      if (page === undefined) throw new Error(`Página inesperada: ${url.pathname}`);
      return { body: page };
    }
    throw new Error(`Host inesperado: ${url.hostname}`);
  };
}

const mirrorPaths = (calls) => calls.filter((call) => MIRRORS.includes(new URL(call.url).hostname)).map((call) => new URL(call.url).pathname);
const searchTerms = (calls) => calls.filter((call) => new URL(call.url).hostname === SEARCH_HOST).map((call) => new URL(call.url).searchParams.get('keyWord'));
const playlistUrls = (html) => pageProps(html).mediaInfoList.map((item) => item.mediaUrl);

test('1.1 carrega o pacote sem rede e sem APIs fora do runtime', () => {
  let fetched = false;
  const runtime = makeRuntime(async () => {
    fetched = true;
    return { body: '' };
  });
  assert.equal(typeof runtime.getStreams, 'function');
  assert.equal(fetched, false);
  for (const code of [codes.gdrive, codes.prism]) {
    assert.doesNotMatch(code, /BigInt|TextEncoder|Promise\.allSettled|setTimeout|require\(['"]node:/);
  }
});

test('1.1 busca assinada: query, cabeçalhos do cliente, aeskey RSA e sign MD5 conferidos', async () => {
  const runtime = makeRuntime(seekeeRoute(), { random: 0.5 });
  await runtime.getStreams(MOVIE_ID, 'movie', null, null);
  const call = runtime.calls.find((entry) => new URL(entry.url).hostname === SEARCH_HOST);
  const url = new URL(call.url);
  assert.equal(url.pathname, '/quan/h5/search/search');
  assert.equal(url.search, `?${new URLSearchParams({ enterType: 'user', keyWord: 'Zootopia: Essa Cidade é o Bicho' })}`);

  const headers = call.init.headers;
  assert.equal(headers.lang, 'pt');
  assert.equal(headers.versionCode, '182');
  assert.equal(headers.clientType, 'android_buscari');
  assert.equal(headers.deviceId, '8'.repeat(32));
  assert.match(headers.currentTime, /^\d{13}$/);
  assert.match(headers.sign, /^[0-9a-f]{32}$/);

  // Math.random = 0.5: chave AES "8888888888888888" e enchimento PKCS#1 com bytes 0x80.
  const aesKey = '8'.repeat(16);
  const block = Buffer.concat([Buffer.from([0, 2]), Buffer.alloc(109, 0x80), Buffer.from([0]), Buffer.from(aesKey)]);
  const publicKey = crypto.createPublicKey({ key: Buffer.from(PUBLIC_KEY_DER, 'base64'), format: 'der', type: 'spki' });
  const expectedAesKey = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_NO_PADDING }, block);
  assert.equal(headers.aeskey, expectedAesKey.toString('base64'));

  // Valores em ordem decrescente de "chave=valor": keyWord antes de enterType.
  const values = Buffer.from('Zootopia: Essa Cidade é o Bichouser', 'utf8').toString('base64');
  const payload = `${headers.currentTime}${values}`.replace(/\+/g, '-').replace(/\//g, '_');
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(aesKey), null);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]).toString('base64');
  assert.equal(headers.sign, crypto.createHash('md5').update(encrypted).digest('hex'));
});

test('1.1 código de protocolo diferente de "00000" é erro técnico, não ausência', async () => {
  const runtime = makeRuntime(seekeeRoute({ search: () => ({ body: { code: '-10005', msg: 'sign error', data: null } }) }));
  assert.deepEqual(await runtime.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Seekee\] Falha em movie 269149: .*recusou.*-10005/);
  assert.deepEqual(searchTerms(runtime.calls), ['Zootopia: Essa Cidade é o Bicho']);
});

test('1.1 HTTP fora de 2xx na busca é erro técnico', async () => {
  const runtime = makeRuntime(seekeeRoute({ search: () => ({ status: 500, body: 'erro' }) }));
  assert.deepEqual(await runtime.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(runtime.errors[0], /HTTP 500/);
});

test('1.2 filme confirmado pelo título PT-BR: Dublado e Legendado ordenados, com legendas', async () => {
  for (const bundle of [codes.gdrive, codes.prism]) {
    const runtime = makeRuntime(seekeeRoute(), { bundle });
    const streams = await runtime.getStreams(MOVIE_ID, 'movie', null, null);
    assert.deepEqual(runtime.errors, []);
    assert.deepEqual(runtime.warnings, []);
    assert.deepEqual(searchTerms(runtime.calls), ['Zootopia: Essa Cidade é o Bicho']);
    assert.deepEqual(mirrorPaths(runtime.calls), [PATHS.zootopiaDub, PATHS.zootopiaLeg]);

    assert.deepEqual(streams.map((stream) => `${stream.quality} ${stream.language}`), [
      '720p Dublado',
      '720p Legendado',
      '540p Dublado',
      '540p Legendado',
      '360p Dublado',
    ]);
    const dubUrls = playlistUrls(PAGES[PATHS.zootopiaDub]);
    const legUrls = playlistUrls(PAGES[PATHS.zootopiaLeg]);
    assert.deepEqual(streams.map((stream) => stream.url), [dubUrls[0], legUrls[0], dubUrls[1], legUrls[1], dubUrls[2]]);
    for (const stream of streams) {
      assert.equal(stream.headers, undefined);
      assert.match(stream.title, new RegExp(`^🗣️ ${stream.language}$`, 'm'));
      if (bundle === codes.gdrive) assert.match(stream.name, new RegExp(`^Seekee ${stream.quality}\\n`));
      else assert.match(stream.title, /^🎬 Zootopia: Essa Cidade é o Bicho \(2016\)$/m);
    }
    const subtitled = streams.find((stream) => stream.language === 'Legendado');
    assert.deepEqual(subtitled.subtitles.map((item) => item.language), ['English', 'Español', 'português']);
    assert.ok(subtitled.subtitles.every((item) => /^https:\/\/subtitles\.cuevana4br\.com\/.+\.srt$/.test(item.url)));
    assert.equal(streams.find((stream) => stream.language === 'Dublado').subtitles, undefined);
  }
});

test('1.2 sem candidato no título PT-BR, tenta o título original', async () => {
  const searches = { Zootopia: SEARCHES.Zootopia };
  const runtime = makeRuntime(seekeeRoute({ searches }));
  const streams = await runtime.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(searchTerms(runtime.calls), ['Zootopia: Essa Cidade é o Bicho', 'Zootopia']);
  assert.equal(streams.length, 5);
  assert.deepEqual(runtime.errors, []);
});

test('1.2 título ausente no catálogo devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(seekeeRoute({ searches: {} }));
  assert.deepEqual(await runtime.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.deepEqual(searchTerms(runtime.calls), ['Zootopia: Essa Cidade é o Bicho', 'Zootopia']);
  assert.deepEqual(mirrorPaths(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
});

test('1.2 filme com ano divergente e série no lugar de filme são descartados', async () => {
  const movieMeta = { ...META.movie, release_date: '2005-01-01' };
  const runtime = makeRuntime(seekeeRoute({ movieMeta }));
  assert.deepEqual(await runtime.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.deepEqual(mirrorPaths(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.1 série na temporada da busca: Dublado e Legendado, sem dublagens de terceiros', async () => {
  const runtime = makeRuntime(seekeeRoute(), { bundle: codes.prism });
  const streams = await runtime.getStreams(TV_ID, 'tv', 1, 5);
  assert.deepEqual(runtime.errors, []);
  // O filme "Breaking" da busca fica de fora pelo tipo; as versões es e tr nunca são abertas.
  assert.deepEqual(mirrorPaths(runtime.calls), [PATHS.s1e5Dub, PATHS.s1e5Leg]);
  assert.deepEqual(streams.map((stream) => `${stream.quality} ${stream.language}`), [
    '720p Dublado',
    '720p Legendado',
    '540p Dublado',
    '540p Legendado',
    '360p Dublado',
  ]);
  for (const stream of streams) assert.match(stream.title, /^🎬 Breaking Bad \(2008\) T01E05$/m);
});

test('1.2 título com subtítulo após dois-pontos e slug com sufixo de idioma é confirmado', async () => {
  // Como "Arcane: League of Legends" (slug "...-Season-2[Audio-pt-BR]") para "Arcane" no TMDB.
  const param = 'hQfMsSkCwfXy1XA0poRsb-Heisenberg-Saga-Season-1[Audio-pt-BR]';
  const search = {
    code: '00000',
    msg: 'Success',
    data: [{
      resourceUrl: `https://h5.onfilom.com/pt/detail/drama/${param}`,
      resourceTitle: '[Português Dublado]Breaking Bad: A Química do Mal Temporada 1',
      typeCode: 'drama',
      endYear: 2008,
    }],
  };
  const runtime = makeRuntime(seekeeRoute({
    searches: { 'Breaking Bad': search },
    pages: { [`/pt/detail/drama/${param}/5`]: PAGES[PATHS.s1e5Dub] },
  }));
  const streams = await runtime.getStreams(TV_ID, 'tv', 1, 5);
  assert.deepEqual(mirrorPaths(runtime.calls), [`/pt/detail/drama/${param}/5`, PATHS.s1e5Leg]);
  assert.equal(streams.length, 5);
  assert.deepEqual(runtime.errors, []);
});

test('1.2 numeral romano na fonte confere com o arábico do TMDB', async () => {
  // Como "Gladiador II" na fonte para "Gladiador 2" no TMDB.
  const movieMeta = { ...META.movie, title: 'Zootopia 2', original_title: 'Zootopia 2' };
  const search = {
    code: '00000',
    msg: 'Success',
    data: [{
      resourceUrl: `https://h5.onfilom.com${PATHS.zootopiaDub}`,
      resourceTitle: '[Português Dublado]Zootopia II',
      typeCode: 'movie',
      endYear: 2016,
    }],
  };
  const runtime = makeRuntime(seekeeRoute({ movieMeta, searches: { 'Zootopia 2': search } }));
  const streams = await runtime.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(runtime.errors, []);
  assert.equal(streams.length, 5);
});

test('2.1 série de temporada única com seriesNo nulo usa a própria entrada de seasons', async () => {
  // Doramas e novelas (ex.: Hotel Del Luna) publicam seriesNo null e seasons só com a própria página.
  const singleSeason = (html) => editPage(html, (props) => {
    props.seriesNo = null;
    props.seasons = [{ id: props.id, name: 'Temporada 1', seriesNo: 1, websiteParam: props.websiteParam, episodes: [] }];
  });
  const runtime = makeRuntime(seekeeRoute({
    pages: { [PATHS.s1e5Dub]: singleSeason(PAGES[PATHS.s1e5Dub]), [PATHS.s1e5Leg]: singleSeason(PAGES[PATHS.s1e5Leg]) },
  }));
  const streams = await runtime.getStreams(TV_ID, 'tv', 1, 5);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(mirrorPaths(runtime.calls), [PATHS.s1e5Dub, PATHS.s1e5Leg]);
  assert.equal(streams.length, 5);
});

test('2.1 temporada fora do top-5 é localizada pela lista seasons', async () => {
  const runtime = makeRuntime(seekeeRoute());
  const streams = await runtime.getStreams(TV_ID, 'tv', 4, 3);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(mirrorPaths(runtime.calls), [PATHS.s1e3Dub, PATHS.s4e3Dub, PATHS.s4e3Leg]);
  const urls = playlistUrls(PAGES[PATHS.s4e3Dub]).concat(playlistUrls(PAGES[PATHS.s4e3Leg]));
  assert.equal(streams.length, 5);
  assert.ok(streams.every((stream) => urls.includes(stream.url)));
});

test('2.1 episódio inexistente com queda silenciosa para o episódio 1 é ausência', async () => {
  const runtime = makeRuntime(seekeeRoute());
  assert.deepEqual(await runtime.getStreams(TV_ID, 'tv', 1, 99), []);
  assert.deepEqual(mirrorPaths(runtime.calls), [PATHS.s1e99Dub]);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.1 áudio original sem legenda em português sai como Gringo', async () => {
  const withoutPortuguese = editPage(PAGES[PATHS.s1e5Leg], (props) => {
    for (const entry of props.episodeVo) entry.subtitlingList = entry.subtitlingList.filter((item) => item.languageAbbr !== 'pt');
  });
  const runtime = makeRuntime(seekeeRoute({ pages: { [PATHS.s1e5Leg]: withoutPortuguese } }));
  const streams = await runtime.getStreams(TV_ID, 'tv', 1, 5);
  assert.deepEqual([...new Set(streams.map((stream) => stream.language))], ['Dublado', 'Gringo']);
  const gringo = streams.find((stream) => stream.language === 'Gringo');
  assert.deepEqual(gringo.subtitles.map((item) => item.language), ['English', 'Español']);
});

test('2.1 áudio de Portugal (languageName "Áudio Português-PT") sai como Dublado (Não PT-BR?)', async () => {
  const european = editPage(PAGES[PATHS.s1e5Dub], (props) => {
    props.languageName = 'Áudio Português-PT';
  });
  const runtime = makeRuntime(seekeeRoute({ pages: { [PATHS.s1e5Dub]: european } }));
  const streams = await runtime.getStreams(TV_ID, 'tv', 1, 5);
  assert.deepEqual([...new Set(streams.map((stream) => stream.language))], ['Dublado (Não PT-BR?)', 'Legendado']);
});

test('2.1 espelho com 403 passa para o seguinte e as próximas páginas começam por ele', async () => {
  const runtime = makeRuntime(seekeeRoute({
    mirror: (url) => (url.hostname === MIRRORS[0] ? { status: 403, body: 'Just a moment...' } : undefined),
  }));
  const streams = await runtime.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(streams.length, 5);
  const hosts = runtime.calls.map((call) => new URL(call.url).hostname).filter((host) => MIRRORS.includes(host));
  assert.deepEqual(hosts, [MIRRORS[0], MIRRORS[1], MIRRORS[1]]);
  assert.deepEqual(runtime.errors, []);
});

test('2.1 página sem __NEXT_DATA__ também troca de espelho', async () => {
  const runtime = makeRuntime(seekeeRoute({
    mirror: (url) => (url.hostname === MIRRORS[0] ? { body: '<html><body>manutenção</body></html>' } : undefined),
  }));
  assert.equal((await runtime.getStreams(MOVIE_ID, 'movie', null, null)).length, 5);
});

test('2.1 todos os espelhos bloqueados é erro técnico com a causa de cada um', async () => {
  const runtime = makeRuntime(seekeeRoute({ mirror: () => ({ status: 403, body: 'bloqueado' }) }));
  assert.deepEqual(await runtime.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Nenhum espelho entregou a página/);
  for (const host of MIRRORS) assert.match(runtime.errors[0], new RegExp(`${host.replace(/\./g, '\\.')}: HTTP 403`));
});

test('2.1 páginas dos espelhos usam User-Agent de Chrome Android', async () => {
  const runtime = makeRuntime(seekeeRoute());
  await runtime.getStreams(MOVIE_ID, 'movie', null, null);
  const pageCalls = runtime.calls.filter((call) => MIRRORS.includes(new URL(call.url).hostname));
  assert.ok(pageCalls.length > 0);
  for (const call of pageCalls) assert.match(call.init.headers['User-Agent'], /Android .*Mobile Safari/);
});

test('2.1 falha de uma versão de áudio preserva a outra com aviso', async () => {
  const runtime = makeRuntime(seekeeRoute({
    mirror: (url) => (url.pathname === PATHS.s1e5Leg ? { status: 502, body: 'bad gateway' } : undefined),
  }));
  const streams = await runtime.getStreams(TV_ID, 'tv', 1, 5);
  assert.deepEqual([...new Set(streams.map((stream) => stream.language))], ['Dublado']);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Seekee\] Opção áudio original \(en\) descartada: Nenhum espelho/);
  assert.doesNotMatch(runtime.warnings[0], /https?:\/\//);
  assert.deepEqual(runtime.errors, []);
});

test('2.1 nenhuma versão com mídia é erro agregado', async () => {
  const empty = (html) => editPage(html, (props) => {
    props.mediaInfoList = [];
  });
  const runtime = makeRuntime(seekeeRoute({
    pages: { [PATHS.s1e5Dub]: empty(PAGES[PATHS.s1e5Dub]), [PATHS.s1e5Leg]: empty(PAGES[PATHS.s1e5Leg]) },
  }));
  assert.deepEqual(await runtime.getStreams(TV_ID, 'tv', 1, 5), []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.errors[0], /Nenhuma versão de áudio produziu stream/);
});

test('entrada inválida de série é rejeitada antes de qualquer requisição', async () => {
  for (const [season, episode] of [[0, 1], [1, null], [1.5, 2]]) {
    const runtime = makeRuntime(seekeeRoute());
    assert.deepEqual(await runtime.getStreams(TV_ID, 'tv', season, episode), []);
    assert.deepEqual(runtime.calls, []);
    assert.match(runtime.errors[0], /^\[Seekee\] Falha em tv 1396: Entrada: série sem temporada\/episódio válidos/);
  }
});


test('mesmo pacote atende dois pisos e aceita ID legado ou prefixado', async () => {
  const pages = {
    [PATHS.zootopiaDub]: editPage(PAGES[PATHS.zootopiaDub], (props) => {
      props.mediaInfoList[0].currentDefinition = 'GROOT_HD';
    }),
  };
  const route = seekeeRoute({ pages });
  const load = (scraperId, bundle = codes.prism, random) => makeRuntime(route, { bundle, scraperId, random });
  const get = (runtime) => runtime.getStreams(MOVIE_ID, 'movie', null, null);
  const at720 = await get(load('repo-mobile:seekee--http-720p-pt-br'));
  const at1080 = await get(load('repo-tv:seekee--http-1080p-pt-br'));
  assert.deepEqual(at720.map((stream) => stream.quality), ['1080p', '720p']);
  assert.deepEqual(at1080, at720.slice(0, 1));
  for (const bundle of [codes.prism, codes.gdrive]) {
    assert.deepEqual(await get(load('repo:seekee', bundle)), await get(load('repo:seekee--all-all-all', bundle)));
  }
  assert.deepEqual(await get(load('repo:seekee', codes.base, 0)), await get(load('repo:seekee', codes.gdrive)));
  assert.deepEqual(await get(load('repo:seekee', codes.base, 0.99)), await get(load('repo:seekee', codes.prism)));
  const invalid = load('repo:seekee--http-720p-pt-br-extra');
  assert.deepEqual(await get(invalid), []);
  assert.deepEqual(invalid.calls, []);
  assert.match(invalid.errors[0], /ID de manifest inválido/);
});

test('pacote minificado ES2016 preserva resultados, exportações e logs', async () => {
  const parseErrors = new Linter().verify(codes.min, [{ languageOptions: { ecmaVersion: 2016, sourceType: 'script' } }]);
  assert.deepEqual(parseErrors, []);
  assert.ok(codes.min.length < codes.prism.length);
  for (const route of [seekeeRoute(), seekeeRoute({ search: () => ({ status: 500, body: 'erro' }) })]) {
    const scraperId = 'repo:seekee--http-720p-pt-br';
    const dev = makeRuntime(route, { bundle: codes.prism, scraperId });
    const min = makeRuntime(route, { bundle: codes.min, scraperId });
    assert.deepEqual(await min.getStreams(MOVIE_ID, 'movie', null, null), await dev.getStreams(MOVIE_ID, 'movie', null, null));
    assert.deepEqual(min.exports, dev.exports);
    assert.deepEqual(min.errors, dev.errors);
    assert.deepEqual(min.warnings, dev.warnings);
  }
});
