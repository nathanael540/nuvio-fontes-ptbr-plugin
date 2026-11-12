const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

let code;
const codes = {};
let originCode;
let playerCode;
let mediaCode;

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'pobreflix-nixplay');
const themeHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'theme-page.html'), 'utf8');
const challengeHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'challenge-page.html'), 'utf8');
const blockedScriptHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'challenge-with-blocked-script.html'), 'utf8');
const movieHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'redeflix-movie.html'), 'utf8');
const seriesHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'redeflix-series.html'), 'utf8');
const noQualityHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'redeflix-no-quality.html'), 'utf8');

function makeMp4Buffer() {
  const buf = new Uint8Array(64);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 32);
  buf[4] = 0x66; // 'f'
  buf[5] = 0x74; // 't'
  buf[6] = 0x79; // 'y'
  buf[7] = 0x70; // 'p'
  buf[8] = 0x69; // 'i'
  buf[9] = 0x73; // 's'
  buf[10] = 0x6f; // 'o'
  buf[11] = 0x6d; // 'm'
  return buf.buffer;
}

test.before(async () => {
  const outDir = createTempDir('pobreflix-nixplay-test-');
  try {
    const gdriveDir = path.join(outDir, 'gdrive');
    const prismDir = path.join(outDir, 'prism');
    fs.mkdirSync(gdriveDir);
    fs.mkdirSync(prismDir);

    codes.gdrive = fs.readFileSync(await buildProvider('pobreflix-nixplay', { outDir: gdriveDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('pobreflix-nixplay', { outDir: prismDir, formatter: 'prism' }), 'utf8');
    code = codes.gdrive;

    const esbuild = require('esbuild');
    const originBuild = await esbuild.build({
      entryPoints: ['src/pobreflix-nixplay/catalog.js'],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      external: ['cheerio-without-node-native'],
    });
    originCode = originBuild.outputFiles[0].text;

    const playerBuild = await esbuild.build({
      stdin: { contents: fs.readFileSync('src/pobreflix-nixplay/player.js', 'utf8') + '\nexport { resolveSource };', resolveDir: path.resolve('src/pobreflix-nixplay'), loader: 'js' },
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      external: ['cheerio-without-node-native'],
    });
    playerCode = playerBuild.outputFiles[0].text;

    const mediaBuild = await esbuild.build({
      stdin: { contents: "export { probeMedia } from './src/_blocks/redeflix-player/index.mjs';", resolveDir: process.cwd(), loader: 'js' },
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      external: ['cheerio-without-node-native'],
    });
    mediaCode = mediaBuild.outputFiles[0].text;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function runtime(route = () => { throw new Error('fetch inesperado'); }, bundle = code) {
  const calls = [];
  const logs = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    TMDB_API_KEY: 'synthetic-app-key',
    URL, URLSearchParams, AbortController, DataView, ArrayBuffer, Uint8Array,
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    console: {
      error: (message) => logs.push(String(message)),
      warn: (message) => warnings.push(String(message)),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      let result;
      if (new URL(url).host === 'api.themoviedb.org') {
        const isTv = String(url).includes('/tv/');
        const title = isTv ? 'Breaking Bad' : String(url).includes('/550?') ? 'Clube da Luta' : 'Homem-Aranha: Um Novo Dia';
        result = { body: {
          title, name: title, original_title: title, original_name: title,
          release_date: '2026-01-01', first_air_date: '2008-01-01',
          external_ids: {}, alternative_titles: { titles: [], results: [] },
        } };
      } else {
        result = await route(new URL(url), init);
      }
      // Simula o seguimento nativo de redirecionamentos do fetch do app.
      const visited = new Set([String(url)]);
      while (result.status >= 300 && result.status < 400) {
        const next = new URL(result.headers.location, url).href;
        if (visited.has(next)) throw new Error('Ciclo de redirecionamento detectado pelo fetch');
        visited.add(next);
        result = await route(new URL(next), init);
        result.url = result.url || next;
      }
      if (result instanceof Error) throw result;
      const status = result.status || 200;
      let text = '';
      if (typeof result === 'string') {
        text = result;
      } else if (typeof result.text === 'function') {
        text = await result.text();
      } else if (typeof result.text === 'string') {
        text = result.text;
      } else if (typeof result.body === 'string') {
        text = result.body;
      } else if (result.body !== undefined) {
        text = JSON.stringify(result.body);
      }
      const headers = {
        get: (name) => {
          const key = Object.keys(result.headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
          return key ? result.headers[key] : null;
        },
        ...result.headers,
      };
      return {
        ok: status >= 200 && status < 300,
        status,
        headers,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
        arrayBuffer: async () => result.buffer || (result.bytes ? result.bytes.buffer : makeMp4Buffer()),
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return {
    context,
    calls,
    logs,
    warnings,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

// 1. Estrutura, entrada e domínios
test('1.1 carregamento CommonJS não acessa rede e entradas inválidas retornam [] com log', async () => {
  const rt = runtime();
  assert.equal(typeof rt.context.module.exports.getStreams, 'function');
  assert.equal(rt.calls.length, 0);

  const invalidInputs = [
    [null, 'movie', null, null],
    ['', 'movie', null, null],
    ['0', 'movie', null, null],
    ['-1', 'movie', null, null],
    ['abc', 'movie', null, null],
    ['123', 'anime', null, null],
    ['123', 'tv', null, null],
    ['123', 'tv', 0, 1],
    ['123', 'tv', 1, 0],
    ['123', 'tv', 1.5, 1],
    ['123', 'tv', 1, -2],
  ];

  for (const [id, type, season, episode] of invalidInputs) {
    rt.logs.length = 0;
    const res = await rt.getStreams(id, type, season, episode);
    assert.deepEqual(res, []);
    assert.equal(rt.calls.length, 0, `fetch chamado para entrada inválida ${id} ${type}`);
    assert.ok(rt.logs.length > 0);
    assert.match(rt.logs[0], /^\[PobreFlix NixPlay\] Entrada:/);
  }
});

test('1.2 aliases convergentes são lidos por fetchPage e POST só usa a origem final', async () => {
  const rt = runtime((url) => {
    if (url.host === 'pobreflix.monster') return { status: 301, headers: { location: 'https://pobreflix.garden/' } };
    if (url.host === 'pobreflix.garden') return { status: 301, headers: { location: 'https://pobreflix.cab/' } };
    if (url.host === 'pobreflix.cab') return { status: 301, headers: { location: 'https://pobreflix.boutique/' } };
    return { body: themeHtml };
  }, originCode);
  assert.deepEqual([...rt.context.module.exports.ALIASES], [
    'https://pobreflix.boutique', 'https://pobreflix.cab', 'https://pobreflix.garden', 'https://pobreflix.monster',
  ]);
  const result = await rt.context.module.exports.resolveEffectiveOrigin('https://pobreflix.monster');
  assert.equal(result.effectiveOrigin, 'https://pobreflix.boutique');
  assert.equal(rt.calls.length, 1);
  assert.equal(rt.calls[0].init.method, 'GET');
});

test('1.2 origem final não aprovada é rejeitada antes de qualquer POST', async () => {
  const rt = runtime(() => ({ body: themeHtml, url: 'https://evil-unapproved.com/' }), originCode);
  await assert.rejects(rt.context.module.exports.resolveEffectiveOrigin('https://pobreflix.boutique'), /Origem final não aprovada/);
  assert.ok(rt.calls.every((call) => call.init.method === 'GET'));
});

test('1.2 tema ausente rejeita a origem', async () => {
  const rt = runtime(() => ({ body: '<html>Tema genérico</html>' }), originCode);
  await assert.rejects(rt.context.module.exports.resolveEffectiveOrigin('https://pobreflix.boutique'), /Tema pobreflix-v10/);
});

test('1.3 falha de redirecionamento do fetch sobe sem virar ausência', async () => {
  const rt = runtime(() => { throw new Error('Ciclo de redirecionamento detectado pelo fetch'); }, originCode);
  await assert.rejects(rt.context.module.exports.resolveEffectiveOrigin('https://pobreflix.boutique'), /Ciclo/);
});

// 2. Consulta do player por TMDB
test('2.1 consulta player de filme e série com tipos e parâmetros corretos', async () => {
  const playerContext = {
    module: { exports: {} },
    URL, URLSearchParams,
    require: () => ({ load }),
    fetch: async (url, init) => {
      const body = init?.body || '';
      if (body.includes('type=movie')) {
        assert.ok(body.includes('tmdb=969681'));
        assert.ok(body.includes('season=&episode='));
        return {
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            type: 'movie',
            tmdb: '969681',
            season: 0,
            episode: 0,
            mode: 'embed',
            selected_provider: 'superflix',
          }),
        };
      }
      if (body.includes('type=episode')) {
        assert.ok(body.includes('tmdb=1396'));
        assert.ok(body.includes('season=2&episode=3'));
        return {
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            type: 'episode',
            tmdb: '1396',
            season: 2,
            episode: 3,
            mode: 'embed',
            selected_provider: 'superflix',
          }),
        };
      }
      throw new Error(`Chamada inesperada: ${body}`);
    },
  };
  vm.runInNewContext(playerCode, playerContext);

  const movieRes = await playerContext.module.exports.queryPlayer('https://pobreflix.boutique', {
    tmdbId: '969681', mediaType: 'movie', season: null, episode: null,
  });
  assert.equal(movieRes.status, 'ok');
  assert.equal(movieRes.data.tmdb, '969681');

  const seriesRes = await playerContext.module.exports.queryPlayer('https://pobreflix.boutique', {
    tmdbId: '1396', mediaType: 'tv', season: 2, episode: 3,
  });
  assert.equal(seriesRes.status, 'ok');
  assert.equal(seriesRes.data.season, 2);
  assert.equal(seriesRes.data.episode, 3);
});

test('2.1 resposta com identidade divergente falha', async () => {
  const playerContext = {
    module: { exports: {} },
    URL, URLSearchParams,
    require: () => ({ load }),
    fetch: async () => ({
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        type: 'movie',
        tmdb: '88888', // divergente de 969681
        season: 0,
        episode: 0,
      }),
    }),
  };
  vm.runInNewContext(playerCode, playerContext);
  await assert.rejects(
    playerContext.module.exports.queryPlayer('https://pobreflix.boutique', {
      tmdbId: '969681', mediaType: 'movie', season: null, episode: null,
    }),
    /Resposta com TMDB divergente/,
  );
});

test('2.2 distingue ausência funcional de falha operacional', async () => {
  const makePlayerTest = (status, body) => {
    const playerContext = {
      module: { exports: {} },
      URL, URLSearchParams,
      require: () => ({ load }),
      fetch: async () => ({
        status,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      }),
    };
    vm.runInNewContext(playerCode, playerContext);
    return playerContext.module.exports.queryPlayer('https://pobreflix.boutique', {
      tmdbId: '969681', mediaType: 'movie', season: null, episode: null,
    });
  };

  // 404 ausência título
  const absentTitle = await makePlayerTest(404, { success: false, message: 'Este título ainda não está disponível.' });
  assert.equal(absentTitle.status, 'absent');

  // 404 ausência episódio
  const absentEp = await makePlayerTest(404, { success: false, message: 'Episódio não sincronizado.' });
  assert.equal(absentEp.status, 'absent');

  // 400 falha operacional
  await assert.rejects(
    makePlayerTest(400, { success: false, message: 'Conteúdo inválido.' }),
    /HTTP 400 ao consultar player/,
  );

  // 404 rest_no_route falha operacional
  await assert.rejects(
    makePlayerTest(404, { code: 'rest_no_route', message: 'No route was found matching the URL and request method.' }),
    /HTTP 404 em.*rest_no_route/,
  );

  // JSON inválido
  await assert.rejects(
    makePlayerTest(200, '<html>502 Bad Gateway</html>'),
    /Resposta do player não é JSON válido/,
  );

  // success: false desconhecido
  await assert.rejects(
    makePlayerTest(200, { success: false, message: 'Erro desconhecido do servidor' }),
    /Player API erro/,
  );
});

// 3. Resolução de players e recuperação
test('3.1 detecção de página de desafio Turnstile e preservação de HTML com título blocked em script', async () => {
  const playerContext = {
    module: { exports: {} },
    URL, URLSearchParams,
    require: () => ({ load }),
  };
  vm.runInNewContext(playerCode, playerContext);
  const isChallenge = playerContext.module.exports.isChallengePage;

  assert.equal(isChallenge(challengeHtml), true);
  assert.equal(isChallenge(blockedScriptHtml), false);
  assert.equal(isChallenge(movieHtml), false);
});

test('3.2 migração RedeFlix usa o bloco e preserva o caminho pedido', async () => {
  const rt = runtime(async (url) => {
    if (url.host === 'redeflixapi.bar') return { status: 302, headers: { location: 'https://redeflixapi.click/' } };
    if (url.href === 'https://redeflixapi.click/') return { body: '<html>Início</html>' };
    if (url.pathname === '/filme/969681') return { body: movieHtml };
    if (url.pathname.endsWith('source.php')) return { body: { url: 'https://storage.example/movie.mp4' } };
    if (url.host === 'storage.example') return { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-63/1000000' } };
    throw new Error('URL inesperada: ' + url.href);
  }, playerCode);
  const streams = await rt.context.module.exports.resolveSource(
    { url: 'https://redeflixapi.bar/filme/969681', mode: 'embed_fallback' },
    'https://pobreflix.boutique', { tmdbId: '969681', mediaType: 'movie' }, { title: 'Título do TMDB', year: 2026 },
  );
  assert.equal(streams.length, 1);
  assert.ok(rt.calls.some((call) => call.url === 'https://redeflixapi.click/filme/969681'));
});

test('3.2 recuperação rejeita host e caminho não verificados antes de consumir tickets', async () => {
  for (const [url, expected] of [
    ['https://redeflixapi.bar/filme/550', /Caminho do player diverge/],
    ['https://evil.example/filme/969681', /Modo ou tipo de mídia desconhecido/],
  ]) {
    const rt = runtime(undefined, playerCode);
    await assert.rejects(rt.context.module.exports.resolveSource(
      { url }, 'https://pobreflix.boutique', { tmdbId: '969681', mediaType: 'movie' }, { title: 'Título', year: null },
    ), expected);
    assert.equal(rt.calls.length, 0);
  }
});

test('3.4 validação de mídia com Range 0-63, 206, Content-Type video e ftyp', async () => {
  const mediaContext = {
    module: { exports: {} },
    URL, AbortController, DataView, ArrayBuffer, Uint8Array,
    fetch: async (url, init) => {
      assert.equal(init.headers.Range, 'bytes=0-63');
      return {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-range': 'bytes 0-63/3241248247',
        },
        arrayBuffer: async () => makeMp4Buffer(),
      };
    },
  };
  vm.runInNewContext(mediaCode, mediaContext);

  const probed = await mediaContext.module.exports.probeMedia('https://storage.example.com/test.mp4', { verifySignature: true });
  assert.equal(probed.totalBytes, 3241248247);
  assert.equal(probed.size, '3.0 GB');
});

test('3.4 sonda falha quando assinatura ftyp está ausente', async () => {
  const mediaContext = {
    module: { exports: {} },
    URL, AbortController, DataView, ArrayBuffer, Uint8Array,
    fetch: async () => ({
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-range': 'bytes 0-63/1000',
      },
      arrayBuffer: async () => new Uint8Array(64).buffer, // sem 'ftyp'
    }),
  };
  vm.runInNewContext(mediaCode, mediaContext);
  await assert.rejects(
    mediaContext.module.exports.probeMedia('https://storage.example.com/test.mp4', { verifySignature: true }),
    /Assinatura ftyp não encontrada/,
  );
});

test('3.4 HLS usa interpretPlaylist e resolve variantes relativas à URL final sem duplicatas', async () => {
  const rt = runtime(() => ({
    url: 'https://cdn.example/final/master.m3u8',
    body: '#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\n1080/video.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\n720/video.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\n1080/video.m3u8',
  }), playerCode);
  const streams = await rt.context.module.exports.resolveSource(
    { mode: 'hls', url: 'https://example.com/master.m3u8' },
    'https://pobreflix.boutique', { mediaType: 'movie' }, { title: 'Título', year: null },
  );
  assert.equal(streams.length, 2);
  assert.equal(streams[0].url, 'https://cdn.example/final/1080/video.m3u8');
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[1].url, 'https://cdn.example/final/720/video.m3u8');
  assert.equal(streams[1].quality, '720p');
  assert.equal(rt.calls.length, 1);
});

// 3.5 & 3.6 Montagem de streams e formatação
test('3.5 montagem de streams com format obrigatório, dublado, legendado e qualidade desconhecida', async () => {
  const rt = runtime(async (url, init) => {
    const u = url.href;
    // Origem
    if (u === 'https://pobreflix.boutique/') {
      return { status: 200, text: async () => themeHtml };
    }
    // Player
    if (u === 'https://pobreflix.boutique/wp-json/api/v1/player') {
      return {
        status: 200,
        text: async () => JSON.stringify({
          success: true,
          type: 'episode',
          tmdb: '1396',
          season: 2,
          episode: 3,
          mode: 'embed',
          selected_provider: 'superflix',
          options: [{ provider: 'superflix', url: 'https://superflixapi.fun/serie/1396/2/3' }],
        }),
      };
    }
    // Embed SuperFlix retorna desafio
    if (u.includes('superflixapi.fun')) {
      return { status: 200, text: async () => challengeHtml };
    }
    // player-resolve
    if (u === 'https://pobreflix.boutique/wp-json/api/v1/player-resolve') {
      return {
        status: 200,
        text: async () => JSON.stringify({
          success: true,
          recoverable: true,
          mode: 'embed_fallback',
          url: 'https://redeflixapi.bar/serie/1396/2/3',
          fallback_provider: 'RedeFlixApi',
        }),
      };
    }
    // RedeFlix migração .bar -> .click
    if (u === 'https://redeflixapi.bar/serie/1396/2/3') {
      return { status: 301, headers: { location: 'https://redeflixapi.click/' } };
    }
    if (u === 'https://redeflixapi.click/') return { body: '<html>Início</html>' };
    if (u === 'https://redeflixapi.click/serie/1396/2/3') {
      return { status: 200, text: async () => seriesHtml };
    }
    // Tickets
    if (u.includes('source.php')) {
      const body = JSON.parse(init.body);
      const isLeg = body.ticket.includes('leg');
      return {
        status: 200,
        text: async () => JSON.stringify({
          url: `https://storage.example.com/videos/bb-${isLeg ? 'leg' : 'dub'}.mp4?sig=temp`,
          subtitle: isLeg ? 'https://redeflixapi.click/subtitles/bb-s02e03.vtt' : '',
        }),
      };
    }
    // Sonda de mídia
    if (u.includes('storage.example.com')) {
      return {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-range': 'bytes 0-63/772747565',
        },
        buffer: makeMp4Buffer(),
      };
    }
    throw new Error(`URL inesperada: ${u}`);
  }, codes.gdrive);

  const streams = await rt.getStreams('1396', 'tv', 2, 3);
  assert.equal(streams.length, 2);

  // Dublado em primeiro lugar
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].provider, 'RedeFlixApi');
  assert.equal(streams[0].type, 'mp4');
  assert.equal(streams[0].size, '736.9 MB');
  assert.match(streams[0].name, /^PobreFlix NixPlay 1080p/);
  assert.match(streams[0].name, /🌐 HTTP/);

  // Legendado com legenda externa
  assert.equal(streams[1].language, 'Legendado');
  assert.equal(streams[1].subtitles.length, 1);
  assert.equal(streams[1].subtitles[0].url, 'https://redeflixapi.click/subtitles/bb-s02e03.vtt');

  // Não inclui Range nos streams
  assert.equal(streams[0].headers?.Range, undefined);
});

test('3.5 variante Prism aplica selos de qualidade e formatação Prism', async () => {
  const rt = runtime(async (url) => {
    const u = url.href;
    if (u === 'https://pobreflix.boutique/') return { status: 200, text: async () => themeHtml };
    if (u === 'https://pobreflix.boutique/wp-json/api/v1/player') {
      return {
        status: 200,
        text: async () => JSON.stringify({
          success: true, type: 'movie', tmdb: '969681', season: 0, episode: 0,
          mode: 'embed', selected_provider: 'superflix',
          options: [{ provider: 'superflix', url: 'https://superflixapi.fun/filme/969681' }],
        }),
      };
    }
    if (u.includes('superflixapi.fun')) return { status: 200, text: async () => challengeHtml };
    if (u === 'https://pobreflix.boutique/wp-json/api/v1/player-resolve') {
      return {
        status: 200,
        text: async () => JSON.stringify({
          success: true, recoverable: true, mode: 'embed_fallback',
          url: 'https://redeflixapi.click/filme/969681', fallback_provider: 'RedeFlixApi',
        }),
      };
    }
    if (u === 'https://redeflixapi.click/filme/969681') return { status: 200, text: async () => movieHtml };
    if (u.includes('source.php')) {
      return {
        status: 200,
        text: async () => JSON.stringify({ url: 'https://storage.example.com/videos/movie.mp4?sig=temp', subtitle: '' }),
      };
    }
    if (u.includes('storage.example.com')) {
      return {
        status: 206,
        headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-63/3241248247' },
        buffer: makeMp4Buffer(),
      };
    }
    throw new Error(`URL inesperada: ${u}`);
  }, codes.prism);

  const streams = await rt.getStreams('969681', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.match(streams[0].name, /^🚀 FHD 1080p/);
  assert.match(streams[0].name, /🌐 HTTP/);
});

test('3.5 preservação de mídia sem qualidade identificada como Desconhecida', async () => {
  const rt = runtime(async (url) => {
    const u = url.href;
    if (u === 'https://pobreflix.boutique/') return { status: 200, text: async () => themeHtml };
    if (u === 'https://pobreflix.boutique/wp-json/api/v1/player') {
      return {
        status: 200,
        text: async () => JSON.stringify({
          success: true, type: 'movie', tmdb: '550', season: 0, episode: 0,
          mode: 'embed', selected_provider: 'superflix',
          options: [{ provider: 'superflix', url: 'https://superflixapi.fun/filme/550' }],
        }),
      };
    }
    if (u.includes('superflixapi.fun')) return { status: 200, text: async () => challengeHtml };
    if (u === 'https://pobreflix.boutique/wp-json/api/v1/player-resolve') {
      return {
        status: 200,
        text: async () => JSON.stringify({
          success: true, recoverable: true, mode: 'embed_fallback',
          url: 'https://redeflixapi.click/filme/550', fallback_provider: 'RedeFlixApi',
        }),
      };
    }
    if (u === 'https://redeflixapi.click/filme/550') return { status: 200, text: async () => noQualityHtml };
    if (u.includes('source.php')) {
      return {
        status: 200,
        text: async () => JSON.stringify({ url: 'https://storage.example.com/videos/movie-nq.mp4', subtitle: '' }),
      };
    }
    if (u.includes('storage.example.com')) {
      return {
        status: 206,
        headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-63/500000000' },
        buffer: makeMp4Buffer(),
      };
    }
    throw new Error(`URL inesperada: ${u}`);
  }, codes.gdrive);

  const streams = await rt.getStreams('550', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.match(streams[0].name, /^PobreFlix NixPlay Desconhecida/);
});

// Orquestração de Fallback
test('fallback: principal falha e alias seguinte resolve com sucesso', async () => {
  const rt = runtime(async (url) => {
    const u = url.href;
    // boutique fora do ar
    if (u.includes('pobreflix.boutique')) {
      return new Error('Conexão recusada em boutique');
    }
    // cab resolve
    if (u === 'https://pobreflix.cab/') {
      return { status: 200, text: async () => themeHtml };
    }
    if (u === 'https://pobreflix.cab/wp-json/api/v1/player') {
      return {
        status: 200,
        text: async () => JSON.stringify({
          success: true, type: 'movie', tmdb: '969681', season: 0, episode: 0,
          mode: 'video', url: 'https://storage.example.com/direct.mp4',
        }),
      };
    }
    if (u.includes('storage.example.com')) {
      return {
        status: 206,
        headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-63/1000000' },
        buffer: makeMp4Buffer(),
      };
    }
    throw new Error(`URL inesperada: ${u}`);
  });

  const streams = await rt.getStreams('969681', 'movie', null, null);
  assert.equal(streams.length, 1);
  // Não há log de erro final porque obteve streams, mas há a tentativa com o próximo
});

test('fallback: todas as origens ausentes retornam [] sem erro agregado', async () => {
  const rt = runtime(async (url) => {
    const u = url.href;
    if (u.endsWith('/')) return { status: 200, text: async () => themeHtml };
    if (u.includes('/wp-json/api/v1/player')) {
      return {
        status: 404,
        text: async () => JSON.stringify({ success: false, message: 'Este título ainda não está disponível.' }),
      };
    }
    throw new Error(`URL inesperada: ${u}`);
  });

  const streams = await rt.getStreams('999999999', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(rt.logs.length, 0); // Ausência funcional limpa sem erro
});

test('fallback: todas as origens falhando registram erro agregado saneado', async () => {
  const rt = runtime(async (url) => {
    const u = url.href;
    if (u.endsWith('/')) {
      return new Error(`Queda de rede em ${u}?token=secret123`);
    }
    throw new Error(`URL inesperada: ${u}`);
  });

  const streams = await rt.getStreams('969681', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(rt.logs.length, 1);
  assert.match(rt.logs[0], /^\[PobreFlix NixPlay\] Falha em movie 969681:/);
  assert.ok(!rt.logs[0].includes('token=secret123'), 'Segredos de query string devem ser omitidos do log');
});

const movieRequest = { tmdbId: '969681', mediaType: 'movie', season: null, episode: null };
const apiPlayer = (data) => ({ body: { success: true, type: 'movie', tmdb: '969681', season: 0, episode: 0, ...data } });
const partialMp4 = () => ({ status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-63/1000000' } });

test('revisão: todas as opções únicas são resolvidas em isolamento e não acionam recuperação após sucesso', async () => {
  const rt = runtime((url) => {
    if (url.pathname === '/wp-json/api/v1/player') return apiPlayer({
      mode: 'video', options: [
        { provider: 'Quebrado', url: 'https://storage.example/broken.mp4' },
        { provider: 'Servidor A', label: 'Dublado 720p', url: 'https://storage.example/a.mp4' },
        { provider: 'Servidor B', language: 'Legendado', url: 'https://storage.example/b.1080p.mp4' },
        { provider: 'Servidor A', label: 'Dublado 720p', url: 'https://storage.example/a.mp4' },
      ],
    });
    if (url.pathname === '/broken.mp4') throw new Error('Rede indisponível?sig=temporaria');
    if (url.host === 'storage.example') return partialMp4();
    throw new Error('Requisição inesperada: ' + url.href);
  }, playerCode);
  const result = await rt.context.module.exports.resolvePlayer('https://pobreflix.boutique', movieRequest);
  assert.equal(result.streams.length, 2);
  assert.equal(result.streams[0].quality, '720p');
  assert.equal(result.streams[0].language, 'Dublado');
  assert.equal(result.streams[1].quality, '1080p');
  assert.equal(result.streams[1].language, 'Legendado');
  assert.equal(rt.calls.filter((call) => call.url === 'https://storage.example/a.mp4').length, 1);
  assert.equal(rt.calls.filter((call) => call.url.endsWith('/player-resolve')).length, 0);
  assert.equal(rt.warnings.length, 1);
  assert.match(rt.warnings[0], /Quebrado.*Rede indisponível/);
});

test('revisão: recupera uma única vez depois que todas as opções falham e usa título/ano do TMDB', async () => {
  const rt = runtime((url) => {
    if (url.pathname === '/wp-json/api/v1/player') return apiPlayer({
      mode: 'video', options: [{ url: 'https://storage.example/a.mp4' }, { url: 'https://storage.example/b.mp4' }],
    });
    if (url.pathname === '/wp-json/api/v1/player-resolve') {
      assert.equal(rt.calls.filter((call) => call.url.includes('storage.example')).length, 2);
      return { body: { success: true, recoverable: true, mode: 'video', url: 'https://storage.example/recovered.720p.mp4' } };
    }
    if (url.pathname.startsWith('/recovered.')) return partialMp4();
    if (url.host === 'storage.example') throw new Error('Mídia indisponível');
    throw new Error('URL inesperada: ' + url.href);
  }, codes.prism);
  // Usa a fronteira pública completa, incluindo a leitura do catálogo.
  const originalFetch = rt.context.fetch;
  rt.context.fetch = (url, init) => String(url) === 'https://pobreflix.boutique/'
    ? Promise.resolve({ ok: true, status: 200, url: String(url), text: async () => themeHtml })
    : originalFetch(url, init);
  const streams = await rt.getStreams('969681', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.match(streams[0].name, /Homem-Aranha: Um Novo Dia \(2026\)/);
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].provider, undefined);
  assert.equal(streams[0].language, 'Idioma Desconhecido');
  assert.equal(rt.warnings.length, 2);
  assert.equal(rt.calls.filter((call) => call.url.endsWith('/player-resolve')).length, 1);
  assert.equal(rt.calls.filter((call) => call.url.includes('api.themoviedb.org')).length, 1);
});

test('revisão: falha de rede do embed preserva a causa e não vira bloqueio', async () => {
  const rt = runtime((url) => {
    if (url.pathname === '/wp-json/api/v1/player') return apiPlayer({
      mode: 'embed', options: [{ provider: 'superflix', url: 'https://superflixapi.fun/filme/969681' }],
    });
    if (url.host === 'superflixapi.fun') throw new Error('Conexão recusada no embed');
    if (url.pathname.endsWith('/player-resolve')) throw new Error('Recuperação indisponível');
    throw new Error('URL inesperada');
  }, playerCode);
  await assert.rejects(rt.context.module.exports.resolvePlayer('https://pobreflix.boutique', movieRequest), /Conexão recusada no embed.*Recuperação indisponível/);
  assert.match(rt.warnings[0], /Conexão recusada no embed/);
  assert.doesNotMatch(rt.warnings[0], /Desafio|bloqueio/i);
  assert.equal(rt.calls.filter((call) => call.url.endsWith('/player-resolve')).length, 1);
});

test('revisão: SuperFlix sem desafio não é chamado de bloqueio só pelo nome do servidor', async () => {
  const rt = runtime((url) => {
    if (url.pathname === '/wp-json/api/v1/player') return apiPlayer({ mode: 'embed', selected_provider: 'superflix', url: 'https://superflixapi.fun/filme/969681' });
    if (url.host === 'superflixapi.fun') return { body: '<html><title>Player</title></html>' };
    if (url.pathname.endsWith('/player-resolve')) return { body: { success: true, recoverable: true, mode: 'video', url: 'https://storage.example/direct.mp4' } };
    return partialMp4();
  }, playerCode);
  const result = await rt.context.module.exports.resolvePlayer('https://pobreflix.boutique', movieRequest);
  assert.equal(result.streams.length, 1);
  assert.match(rt.warnings[0], /sem contrato de resolução/);
  assert.doesNotMatch(rt.warnings[0], /Desafio reconhecido/);
});

test('revisão: dados opcionais ausentes são omitidos e qualidade é descoberta localmente em MP4/HLS', async () => {
  for (const [mode, url, body, expected] of [
    ['video', 'https://storage.example/direct.1080p.mp4', null, '1080p'],
    ['video', 'https://storage.example/direct.mp4', null, 'Desconhecida'],
    ['hls', 'https://storage.example/master.m3u8', '#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\nvideo.m3u8', '720p'],
    ['hls', 'https://storage.example/master.m3u8', '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nvideo.1080p.m3u8', 'Desconhecida'],
  ]) {
    const rt = runtime((target) => {
      if (target.pathname === '/wp-json/api/v1/player') return apiPlayer({ mode, url });
      if (target.href === url) return body ? { body } : partialMp4();
      throw new Error('URL inesperada: ' + target.href);
    }, playerCode);
    const result = await rt.context.module.exports.resolvePlayer('https://pobreflix.boutique', movieRequest);
    assert.equal(result.streams[0].quality, expected);
    assert.equal(result.streams[0].language, 'Idioma Desconhecido');
    assert.equal(result.streams[0].provider, undefined);
    assert.equal(rt.calls.length, 3); // player, TMDB e mídia; nenhuma sonda extra para qualidade.
  }
});

test('revisão: MIME HLS tem prioridade sobre video e resolução da variante prevalece sobre rótulo', async () => {
  const rt = runtime((url) => {
    if (url.pathname === '/wp-json/api/v1/player') return apiPlayer({ mode: 'video', mime: 'video/mpegurl', label: 'Dublado 1080p', selected_provider: 'Servidor real', url: 'https://storage.example/master.m3u8' });
    return { body: '#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\n720.m3u8' };
  }, playerCode);
  const result = await rt.context.module.exports.resolvePlayer('https://pobreflix.boutique', movieRequest);
  assert.equal(result.streams[0].quality, '720p');
  assert.equal(result.streams[0].language, 'Dublado');
  assert.equal(result.streams[0].provider, 'Servidor real');
  assert.equal(result.streams[0].type, 'm3u8');
});

test('revisão: ausência da chave TMDB é erro claro antes de resolver mídia', async () => {
  const rt = runtime((url) => {
    assert.equal(url.pathname, '/wp-json/api/v1/player');
    return apiPlayer({ mode: 'video', url: 'https://storage.example/direct.mp4' });
  }, playerCode);
  delete rt.context.TMDB_API_KEY;
  await assert.rejects(rt.context.module.exports.resolvePlayer('https://pobreflix.boutique', movieRequest), /TMDB_API_KEY indisponível/);
  assert.equal(rt.calls.length, 1);
});

test('HLS compartilhado preserva master adaptativo, áudio e legendas externas sem miniaturas', async () => {
  const rt = runtime(() => ({ body: [
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Português",LANGUAGE="pt",URI="audio/pt.m3u8"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="audio/en.m3u8"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Português",LANGUAGE="pt",URI="subs/pt.m3u8"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="thumbs",NAME="thumbnails",URI="preview.vtt"',
    '#EXT-X-STREAM-INF:RESOLUTION=1920x1080,AUDIO="audio",SUBTITLES="subs"',
    '1080.m3u8',
    '#EXT-X-STREAM-INF:RESOLUTION=1280x720,AUDIO="audio",SUBTITLES="subs"',
    '720.m3u8',
  ].join('\n') }), playerCode);
  const streams = await rt.context.module.exports.resolveSource(
    { mode: 'hls', url: 'https://cdn.example/master.m3u8', language: 'Dublado' },
    'https://pobreflix.boutique', { mediaType: 'movie' }, { title: 'Título', year: null },
  );
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/master.m3u8');
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Dublado');
  assert.match(streams[0].name, /Reprodução adaptativa/);
  assert.equal(streams[0].subtitles.length, 1);
  assert.equal(streams[0].subtitles[0].url, 'https://cdn.example/subs/pt.m3u8');
  assert.equal(streams[0].subtitles[0].language, 'pt');
});

test('HLS compartilhado preserva playlist sem resolução e rejeita conteúdo inválido', async () => {
  for (const body of [
    '#EXTM3U\n#EXTINF:10,\nsegment.ts\n#EXT-X-ENDLIST',
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nvideo.1080p.m3u8',
  ]) {
    const rt = runtime(() => ({ body }), playerCode);
    const streams = await rt.context.module.exports.resolveSource(
      { mode: 'hls', url: 'https://cdn.example/master.m3u8' },
      'https://pobreflix.boutique', { mediaType: 'movie' }, { title: 'Título', year: null },
    );
    assert.equal(streams.length, 1);
    assert.equal(streams[0].url, 'https://cdn.example/master.m3u8');
    assert.equal(streams[0].quality, 'Desconhecida');
    assert.doesNotMatch(streams[0].name, /Reprodução adaptativa/);
    assert.equal(streams[0].language, 'Idioma Desconhecido');
  }
  for (const [body, expected] of [
    ['<html>Página de erro</html>', /não é playlist HLS/],
    ['#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080', /sem URI/],
  ]) {
    const rt = runtime(() => ({ body }), playerCode);
    await assert.rejects(rt.context.module.exports.resolveSource(
      { mode: 'hls', url: 'https://cdn.example/master.m3u8' },
      'https://pobreflix.boutique', { mediaType: 'movie' }, { title: 'Título', year: null },
    ), expected);
  }
});
