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
const playerCodes = {};
let mediaCode;
test.before(async () => {
  const outDir = createTempDir('redeflix-test-');
  try {
    const gdriveDir = path.join(outDir, 'gdrive');
    const prismDir = path.join(outDir, 'prism');
    fs.mkdirSync(gdriveDir);
    fs.mkdirSync(prismDir);
    codes.gdrive = fs.readFileSync(await buildProvider('redeflix', { outDir: gdriveDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('redeflix', { outDir: prismDir, formatter: 'prism' }), 'utf8');
    code = codes.gdrive;

    const esbuild = require('esbuild');
    const originBuild = await esbuild.build({
      stdin: { contents: fs.readFileSync('src/_blocks/redeflix-player/index.mjs', 'utf8') + '\nexport { isValidRedeflixHost, classifyResponse };', resolveDir: path.resolve('src/_blocks/redeflix-player'), loader: 'js' },
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      external: ['cheerio-without-node-native'],
    });
    originCode = originBuild.outputFiles[0].text;
    for (const formatter of ['gdrive', 'prism']) {
      const playerBuild = await esbuild.build({
        stdin: { contents: fs.readFileSync('src/_blocks/redeflix-player/index.mjs', 'utf8') + '\nexport { readPlayerConfig, readPlayerPage, resolveOptionTicket, sortRedeflixStreams };', resolveDir: path.resolve('src/_blocks/redeflix-player'), loader: 'js' },
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'neutral',
        external: ['cheerio-without-node-native'],
        define: { NUVIO_FORMATTER: JSON.stringify(formatter) },
      });
      playerCodes[formatter] = playerBuild.outputFiles[0].text;
    }
    playerCode = playerCodes.gdrive;
    const mediaBuild = await esbuild.build({
      stdin: { contents: fs.readFileSync('src/_blocks/redeflix-player/index.mjs', 'utf8') + '\nexport { formatSize };', resolveDir: path.resolve('src/_blocks/redeflix-player'), loader: 'js' },
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
    URL, URLSearchParams, AbortController,
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
      const result = await route(new URL(url), init);
      if (result instanceof Error) throw result;
      const status = result.status || 200;
      const text = typeof result === 'string' ? result : typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
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

function originRuntime(route = () => { throw new Error('fetch inesperado'); }) {
  const calls = [];
  const context = {
    module: { exports: {} },
    URL, URLSearchParams,
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init);
      if (result instanceof Error) throw result;
      const status = result.status || 200;
      const text = typeof result === 'string' ? result : typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
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
      };
    },
  };
  vm.runInNewContext(originCode, context);
  return { exports: context.module.exports, calls };
}

function playerRuntime(route = () => { throw new Error('fetch inesperado'); }, bundle = playerCode) {
  const calls = [];
  const context = {
    module: { exports: {} },
    URL, URLSearchParams, AbortController,
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init);
      if (result instanceof Error) throw result;
      const status = result.status || 200;
      const text = typeof result === 'string' ? result : typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
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
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return { exports: context.module.exports, calls };
}

function mediaRuntime(route = () => { throw new Error('fetch inesperado'); }) {
  const calls = [];
  const bodyReads = [];
  const context = {
    module: { exports: {} },
    URL, URLSearchParams, AbortController,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init);
      if (result instanceof Error) throw result;
      const status = result.status || 200;
      const headers = {
        get: (name) => {
          const key = Object.keys(result.headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
          return key ? result.headers[key] : null;
        },
        ...result.headers,
      };
      return {
        status,
        headers,
        text: async () => { bodyReads.push('text'); return ''; },
        json: async () => { bodyReads.push('json'); return {}; },
        blob: async () => { bodyReads.push('blob'); return {}; },
        arrayBuffer: async () => { bodyReads.push('arrayBuffer'); return new ArrayBuffer(0); },
      };
    },
  };
  vm.runInNewContext(mediaCode, context);
  return { exports: context.module.exports, calls, bodyReads };
}

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/redeflix', name), 'utf8');

test('1.1 carregamento CommonJS sem rede e coordenadas inválidas antes do fetch', async () => {
  const app = runtime();
  assert.equal(typeof app.context.module.exports.getStreams, 'function');
  assert.equal(app.calls.length, 0, 'carregamento não deve chamar fetch');
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/, 'saída CommonJS compilada para es2016');

  // Pedidos inválidos para tmdbId
  for (const badId of ['abc', '0', '-10', '', null, undefined, {}]) {
    const res = await app.getStreams(badId, 'movie', null, null);
    assert.deepEqual(res, []);
  }

  // Tipo inválido
  for (const badType of ['anime', 'series', '', null, 123]) {
    const res = await app.getStreams('100', badType, null, null);
    assert.deepEqual(res, []);
  }

  // Temporada e episódio inválidos para tv
  for (const [season, episode] of [[null, 1], [1, null], [0, 1], [1, 0], [1, -1], [-1, 1], ['2', 3], [2, 1.5], [undefined, 1]]) {
    const res = await app.getStreams('100', 'tv', season, episode);
    assert.deepEqual(res, []);
  }

  assert.equal(app.calls.length, 0, 'nenhum fetch deve ter sido disparado para entradas inválidas');
  assert.ok(app.logs.length > 0);
  assert.ok(app.logs.every((log) => /^\[RedeFlix\] Entrada:/.test(log)), 'todos os logs de entrada devem ter prefixo [RedeFlix] Entrada:');
});

test('1.2 classificação estrutural, canonical e head > title via origin.js', () => {
  const { classifyResponse, buildRequestedPath, isValidRedeflixHost } = originRuntime().exports;

  // buildRequestedPath
  assert.equal(buildRequestedPath('969681', 'movie', null, null), '/filme/969681');
  assert.equal(buildRequestedPath('1396', 'tv', 2, 3), '/serie/1396/2/3');

  // isValidRedeflixHost
  assert.ok(isValidRedeflixHost('redeflixapi.click'));
  assert.ok(isValidRedeflixHost('redeflixapi.bar'));
  assert.ok(isValidRedeflixHost('redeflixapi.store'));
  assert.ok(!isValidRedeflixHost('redeflixapi.click:8080'), 'porta é proibida');
  assert.ok(!isValidRedeflixHost('user@redeflixapi.click'), 'credenciais são proibidas');
  assert.ok(!isValidRedeflixHost('outrodominio.com'), 'fora do padrão redeflixapi.<tld>');
  assert.ok(!isValidRedeflixHost('redeflixapi.click/filme'), 'caminho no host');

  // Player de filme
  const moviePlayer = classifyResponse({
    text: fixture('movie-player.html'),
    url: 'https://redeflixapi.click/filme/969681',
    requestedPath: '/filme/969681',
    initialUrl: 'https://redeflixapi.click/filme/969681',
  });
  assert.equal(moviePlayer.type, 'player');
  assert.match(moviePlayer.title, /Assistir Filme Exemplo/);

  // Player de série
  const seriesPlayer = classifyResponse({
    text: fixture('series-player.html'),
    url: 'https://redeflixapi.click/serie/1396/2/3',
    requestedPath: '/serie/1396/2/3',
    initialUrl: 'https://redeflixapi.click/serie/1396/2/3',
  });
  assert.equal(seriesPlayer.type, 'player');
  assert.match(seriesPlayer.title, /Assistir Série Exemplo/);

  // Título inexistente (absent-title)
  const absentTitle = classifyResponse({
    text: fixture('absent-title.html'),
    url: 'https://redeflixapi.click/filme/999999999',
    requestedPath: '/filme/999999999',
    initialUrl: 'https://redeflixapi.click/filme/999999999',
  });
  assert.equal(absentTitle.type, 'absent-title');

  // Episódio sem reprodução (absent-episode)
  const absentEpisode = classifyResponse({
    text: fixture('absent-episode.html'),
    url: 'https://redeflixapi.click/serie/1396/99/99',
    requestedPath: '/serie/1396/99/99',
    initialUrl: 'https://redeflixapi.click/serie/1396/99/99',
  });
  assert.equal(absentEpisode.type, 'absent-episode');

  // Aviso de migração (migration-notice)
  const migration = classifyResponse({
    text: fixture('migration-notice.html'),
    url: 'https://redeflixapi.store/filme/969681',
    requestedPath: '/filme/969681',
    initialUrl: 'https://redeflixapi.store/filme/969681',
  });
  assert.equal(migration.type, 'migration-notice');
  assert.equal(migration.newHost, 'redeflixapi.bar');

  // Redirecionamento para a página inicial (redirected-home)
  const redirected = classifyResponse({
    text: fixture('redirected-home.html'),
    url: 'https://redeflixapi.click/',
    requestedPath: '/filme/969681',
    initialUrl: 'https://redeflixapi.bar/filme/969681',
  });
  assert.equal(redirected.type, 'redirected-home');
  assert.equal(redirected.newHost, 'redeflixapi.click');

  // Desafio genérico (unknown)
  const challenge = classifyResponse({
    text: fixture('generic-challenge.html'),
    url: 'https://redeflixapi.click/filme/969681',
    requestedPath: '/filme/969681',
    initialUrl: 'https://redeflixapi.click/filme/969681',
  });
  assert.equal(challenge.type, 'unknown');

  // Blocked dentro de script em página de player válida
  // Deve ler head > title e continuar sendo classificado como player
  const sandbox = classifyResponse({
    text: fixture('sandbox-blocked.html'),
    url: 'https://redeflixapi.click/filme/969681',
    requestedPath: '/filme/969681',
    initialUrl: 'https://redeflixapi.click/filme/969681',
  });
  assert.equal(sandbox.type, 'player');
  assert.equal(sandbox.title, 'Assistir Filme 969681 - RedeFlix');

  // Canonical divergente deve virar unknown e falha, NUNCA ausência nem player
  const canonicalDivergent = classifyResponse({
    text: fixture('canonical-divergent.html'),
    url: 'https://redeflixapi.click/filme/969681',
    requestedPath: '/filme/969681',
    initialUrl: 'https://redeflixapi.click/filme/969681',
  });
  assert.equal(canonicalDivergent.type, 'unknown');
  assert.match(canonicalDivergent.reason, /Canonical divergente/);

  // HTTP 200 com HTML arbitrário é unknown (falha), nunca ausência
  const random200 = classifyResponse({
    text: '<html><head><title>OK</title></head><body><h1>Sucesso 200</h1></body></html>',
    url: 'https://redeflixapi.click/filme/969681',
    requestedPath: '/filme/969681',
    initialUrl: 'https://redeflixapi.click/filme/969681',
  });
  assert.equal(random200.type, 'unknown');
});

test('1.3 seguimento de migração, limite, ciclo e orçamento de GETs', async () => {
  // Cenário 1: Cadeia .store -> .bar -> .click
  const chainApp = originRuntime((url) => {
    if (url.host === 'redeflixapi.store') {
      return { status: 200, body: fixture('migration-notice.html'), url: url.href };
    }
    if (url.host === 'redeflixapi.bar') {
      // Simula redirecionamento 301 para a página inicial de .click
      return { status: 200, body: fixture('redirected-home.html'), url: 'https://redeflixapi.click/' };
    }
    if (url.host === 'redeflixapi.click') {
      return { status: 200, body: fixture('movie-player.html'), url: url.href };
    }
    throw new Error(`Host não esperado: ${url.host}`);
  });

  const budget = { getCount: 0, maxGets: 6 };
  const res = await chainApp.exports.resolveOriginPage('https://redeflixapi.store', '/filme/969681', budget);
  assert.equal(res.status, 'player');
  assert.equal(res.effectiveOrigin, 'https://redeflixapi.click');
  assert.equal(budget.getCount, 3);
  assert.deepEqual(chainApp.calls.map((c) => c.url), [
    'https://redeflixapi.store/filme/969681',
    'https://redeflixapi.bar/filme/969681',
    'https://redeflixapi.click/filme/969681',
  ]);
  // Garantir que nenhum POST foi feito
  assert.ok(chainApp.calls.every((c) => (c.init?.method || 'GET') === 'GET'));

  // Cenário 2: Host fora do padrão (rejeitado sem POST nem próximo fetch)
  const badHostApp = originRuntime(() => ({
    status: 200,
    body: fixture('migration-notice.html').replace('redeflixapi.bar', 'site-malicioso.com'),
    url: 'https://redeflixapi.store/filme/969681',
  }));
  await assert.rejects(
    badHostApp.exports.resolveOriginPage('https://redeflixapi.store', '/filme/969681', { getCount: 0, maxGets: 6 }),
    /não aprovado|inválido/i,
  );
  assert.equal(badHostApp.calls.length, 1);

  // Cenário 3: Porta ou credenciais no host candidato
  for (const malicious of ['redeflixapi.click:8080', 'admin@redeflixapi.click']) {
    const maliciousApp = originRuntime(() => ({
      status: 200,
      body: fixture('migration-notice.html').replace('redeflixapi.bar', malicious),
      url: 'https://redeflixapi.store/filme/969681',
    }));
    await assert.rejects(
      maliciousApp.exports.resolveOriginPage('https://redeflixapi.store', '/filme/969681', { getCount: 0, maxGets: 6 }),
      /não aprovado|inválido/i,
    );
  }

  // Cenário 4: Ciclo de migração (.a -> .b -> .a)
  const cycleApp = originRuntime((url) => {
    if (url.host === 'redeflixapi.click') {
      return {
        status: 200,
        body: fixture('migration-notice.html').replace('redeflixapi.bar', 'redeflixapi.bar'),
        url: url.href,
      };
    }
    if (url.host === 'redeflixapi.bar') {
      return {
        status: 200,
        body: fixture('migration-notice.html').replace('redeflixapi.bar', 'redeflixapi.click'),
        url: url.href,
      };
    }
  });
  await assert.rejects(
    cycleApp.exports.resolveOriginPage('https://redeflixapi.click', '/filme/969681', { getCount: 0, maxGets: 6 }),
    /ciclo de migração/i,
  );

  // Cenário 5: Limite de 3 migrações por alias excedido
  let hopIndex = 0;
  const hops = ['redeflixapi.a', 'redeflixapi.b', 'redeflixapi.c', 'redeflixapi.d', 'redeflixapi.e'];
  const hopsApp = originRuntime(() => {
    hopIndex++;
    return {
      status: 200,
      body: fixture('migration-notice.html').replace('redeflixapi.bar', hops[hopIndex] || 'redeflixapi.end'),
      url: 'https://redeflixapi.test/filme/1',
    };
  });
  await assert.rejects(
    hopsApp.exports.resolveOriginPage('https://redeflixapi.a', '/filme/1', { getCount: 0, maxGets: 10 }),
    /limite de migrações/i,
  );

  // Cenário 6: Orçamento de 6 GETs de página esgotado
  const exhaustedBudget = { getCount: 6, maxGets: 6 };
  const budgetApp = originRuntime();
  await assert.rejects(
    budgetApp.exports.resolveOriginPage('https://redeflixapi.click', '/filme/969681', exhaustedBudget),
    /orçamento/i,
  );
  assert.equal(budgetApp.calls.length, 0);
});

test('1.4 laço de origens em getStreams, deduplicação, ausência e falhas agregadas', async () => {
  const moviePlayerHtml = fixture('movie-player.html') + '<script>var mockStreams = [{"url":"https://r2.storage/video.mp4","name":"RedeFlix - Dublado","title":"Filme Exemplo (2024)","quality":"1080p","language":"Dublado"}];</script>';

  // Cenário 1: Principal ok -> apenas .click é chamado, retorna streams
  const okApp = runtime((url) => {
    if (url.host === 'redeflixapi.click') {
      return { status: 200, body: moviePlayerHtml, url: url.href };
    }
    throw new Error(`Chamada inesperada para ${url}`);
  });
  const streams = await okApp.getStreams('969681', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(okApp.calls.length, 1);
  assert.equal(okApp.calls[0].url, 'https://redeflixapi.click/filme/969681');
  assert.equal(okApp.logs.length, 0);

  // Cenário 2: Principal com HTTP 520 / rede e segundo ok (.bar)
  const fallbackApp = runtime((url) => {
    if (url.host === 'redeflixapi.click') {
      return { status: 520, body: 'Cloudflare 520' };
    }
    if (url.host === 'redeflixapi.bar') {
      // .bar responde com o player de https://redeflixapi.bar
      return {
        status: 200,
        body: moviePlayerHtml.replaceAll('redeflixapi.click', 'redeflixapi.bar'),
        url: url.href,
      };
    }
    throw new Error(`Chamada inesperada para ${url}`);
  });
  const streamsFallback = await fallbackApp.getStreams('969681', 'movie', null, null);
  assert.equal(streamsFallback.length, 1);
  assert.equal(fallbackApp.calls.length, 2);
  assert.equal(fallbackApp.calls[0].url, 'https://redeflixapi.click/filme/969681');
  assert.equal(fallbackApp.calls[1].url, 'https://redeflixapi.bar/filme/969681');
  assert.equal(fallbackApp.logs.length, 0);

  // Cenário 3: Aliases convergentes
  // .click falha, .bar redireciona para .click (mesma origem efetiva já testada)
  // o laço não repete tentativas redundantes na mesma origem efetiva
  const convApp = runtime((url) => {
    if (url.host === 'redeflixapi.click') {
      return { status: 520, body: 'Cloudflare 520' };
    }
    if (url.host === 'redeflixapi.bar') {
      // Redireciona para https://redeflixapi.click/
      return { status: 200, body: fixture('redirected-home.html'), url: 'https://redeflixapi.click/' };
    }
    if (url.host === 'redeflixapi.store') {
      // .store tem aviso apontando para redeflixapi.click
      return {
        status: 200,
        body: fixture('migration-notice.html').replace('redeflixapi.bar', 'redeflixapi.click'),
        url: url.href,
      };
    }
  });
  const convRes = await convApp.getStreams('969681', 'movie', null, null);
  assert.deepEqual(convRes, []);
  assert.ok(convApp.calls.length >= 2);
  assert.equal(convApp.logs.length, 1);
  assert.match(convApp.logs[0], /\[RedeFlix\] Falha em movie 969681:/);

  // Cenário 4: Todas ausentes
  const absentApp = runtime((url) => {
    return {
      status: 200,
      body: fixture('absent-title.html').replaceAll('redeflixapi.click', url.host),
      url: url.href,
    };
  });
  const absentRes = await absentApp.getStreams('999999999', 'movie', null, null);
  assert.deepEqual(absentRes, []);
  assert.equal(absentApp.logs.length, 0, 'todas ausentes não deve emitir console.error');

  // Cenário 5: Ausência + falha
  // .click falha (HTTP 500), .bar responde ausência
  const mixApp = runtime((url) => {
    if (url.host === 'redeflixapi.click') {
      return { status: 500, body: 'Erro interno' };
    }
    if (url.host === 'redeflixapi.bar') {
      return {
        status: 200,
        body: fixture('absent-title.html').replaceAll('redeflixapi.click', 'redeflixapi.bar'),
        url: url.href,
      };
    }
  });
  const mixRes = await mixApp.getStreams('999999999', 'movie', null, null);
  assert.deepEqual(mixRes, []);
  assert.equal(mixApp.logs.length, 1);
  assert.match(mixApp.logs[0], /https:\/\/redeflixapi\.click/);
  assert.ok(!mixApp.logs[0].includes('redeflixapi.bar'));

  // Cenário 6: Todas falhando
  const failApp = runtime(() => {
    return { status: 520, body: 'Erro de rede 520' };
  });
  const failRes = await failApp.getStreams('969681', 'movie', null, null);
  assert.deepEqual(failRes, []);
  assert.equal(failApp.logs.length, 1);
  assert.match(failApp.logs[0], /^\[RedeFlix\] Falha em movie 969681:/);
  assert.match(failApp.logs[0], /https:\/\/redeflixapi\.click/);
  assert.match(failApp.logs[0], /https:\/\/redeflixapi\.bar/);
  assert.match(failApp.logs[0], /https:\/\/redeflixapi\.store/);
});

test('2.1 leitura de configurações do player e botões de áudio via player.js', () => {
  const { readPlayerConfig, readPlayerPage } = playerRuntime().exports;

  // 1. Dublado e Legendado (filme)
  const movieHtml = fixture('movie-player.html');
  const movieConfig = readPlayerConfig(movieHtml, 'https://redeflixapi.click');
  assert.equal(movieConfig.playbackResolveTicket, 'ticket-resolve-mov-1');
  assert.equal(movieConfig.fastLaunchTickets.default, 'ticket-fast-dub-1');
  assert.equal(movieConfig.fastLaunchTickets.legendado, 'ticket-fast-leg-1');
  assert.equal(movieConfig.playbackResolveUrl, 'https://redeflixapi.click/playback-resolve.php');
  assert.equal(movieConfig.playerKysShellBaseUrl, 'https://redeflixapi.click/playerkys/shell.php');

  const moviePage = JSON.parse(JSON.stringify(readPlayerPage(movieHtml, movieConfig)));
  assert.equal(moviePage.title, 'Filme Exemplo');
  assert.equal(moviePage.year, 2024);
  assert.equal(moviePage.quality, '1080p');
  assert.equal(moviePage.episodeName, null);
  assert.equal(moviePage.options.length, 2);
  assert.deepEqual(moviePage.options.map((o) => o.language), ['Dublado', 'Legendado']);
  assert.deepEqual(moviePage.options.map((o) => o.serverKey), ['default', 'legendado']);

  // 2. Só Dublado (série)
  const seriesHtml = fixture('series-player.html');
  const seriesConfig = readPlayerConfig(seriesHtml, 'https://redeflixapi.click');
  const seriesPage = JSON.parse(JSON.stringify(readPlayerPage(seriesHtml, seriesConfig)));
  assert.equal(seriesPage.title, 'Série Exemplo');
  assert.equal(seriesPage.year, null);
  assert.equal(seriesPage.quality, '1080p');
  assert.equal(seriesPage.episodeName, 'O Começo do Fim');
  assert.equal(seriesPage.options.length, 1);
  assert.equal(seriesPage.options[0].language, 'Dublado');

  // 3. Só Legendado
  const onlyLegHtml = movieHtml
    .replace(/<button[^>]*data-server="default"[\s\S]*?<\/button>/i, '')
    .replace('"default":"ticket-fast-dub-1",', '');
  const onlyLegConfig = readPlayerConfig(onlyLegHtml, 'https://redeflixapi.click');
  const onlyLegPage = JSON.parse(JSON.stringify(readPlayerPage(onlyLegHtml, onlyLegConfig)));
  assert.equal(onlyLegPage.options.length, 1);
  assert.equal(onlyLegPage.options[0].language, 'Legendado');

  // 4. Chave desconhecida no data-server
  const unknownKeyHtml = movieHtml.replace('data-server="legendado"', 'data-server="custom_server"');
  assert.throws(
    () => readPlayerPage(unknownKeyHtml, movieConfig),
    /chave de servidor desconhecida/i,
  );

  // 5. Rótulo divergente da chave (data-server="default" com texto "Legendado")
  const divergentLabelHtml = movieHtml.replace(
    '<span class="server-pill-label">Dublado</span>',
    '<span class="server-pill-label">Legendado</span>',
  );
  assert.throws(
    () => readPlayerPage(divergentLabelHtml, movieConfig),
    /rótulo .* diverge da chave/i,
  );

  // 6. Qualidade ausente no player sai como Desconhecida
  const missingQualityHtml = movieHtml.replace(' - 2024 - 1080p', ' - 2024');
  const missingQualityPage = readPlayerPage(missingQualityHtml, movieConfig);
  assert.equal(missingQualityPage.quality, 'Desconhecida');

  // 7. Botão sem ticket (sem fastTicket e sem playbackResolveTicket)
  const noTicketConfig = {
    ...movieConfig,
    fastLaunchTickets: {},
    playbackResolveTicket: null,
  };
  assert.throws(
    () => readPlayerPage(movieHtml, noTicketConfig),
    /sem ticket disponível/i,
  );

  // 8. Host de resolução diferente da origem efetiva
  const badResolveUrlHtml = movieHtml.replace(
    'https://redeflixapi.click/playback-resolve.php',
    'https://outro-host.com/playback-resolve.php',
  );
  assert.throws(
    () => readPlayerConfig(badResolveUrlHtml, 'https://redeflixapi.click'),
    /diverge da origem efetiva/i,
  );
});

test('2.2 resolução de tickets rápidos e alternativos, cabeçalhos, 403 e segredos protegidos', async () => {
  const originResult = {
    effectiveOrigin: 'https://redeflixapi.click',
    page: { url: 'https://redeflixapi.click/filme/969681', text: fixture('movie-player.html') },
    config: {
      playbackResolveTicket: 'ticket-resolve-init',
      playbackResolveUrl: 'https://redeflixapi.click/playback-resolve.php',
      playerKysShellBaseUrl: 'https://redeflixapi.click/playerkys/shell.php',
    },
  };

  // 1. Caminho rápido (source.php direto com fastTicket)
  const fastApp = playerRuntime((url, init) => {
    assert.equal(url.href, 'https://redeflixapi.click/playerkys/source.php');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['X-Requested-With'], 'RedeFlixPlayer');
    assert.equal(init.headers.Origin, 'https://redeflixapi.click');
    assert.equal(init.headers.Referer, 'https://redeflixapi.click/playerkys/shell.php');
    const body = JSON.parse(init.body);
    assert.equal(body.ticket, 'secret-fast-ticket-1');
    return {
      status: 200,
      body: { url: 'https://cf.storage.example/video.mp4?secretSig=123', subtitle: '' },
    };
  });
  const fastOption = { serverKey: 'default', language: 'Dublado', fastTicket: 'secret-fast-ticket-1' };
  const fastRes = await fastApp.exports.resolveOptionTicket(fastOption, originResult, {});
  assert.equal(fastRes.videoUrl, 'https://cf.storage.example/video.mp4?secretSig=123');
  assert.equal(fastApp.calls.length, 1);

  // 2. Caminho alternativo (playback-resolve.php encadeando nextTicket para a segunda opção)
  const sharedState = {};
  let resolveCallCount = 0;
  const altApp = playerRuntime((url, init) => {
    if (url.pathname === '/playback-resolve.php') {
      resolveCallCount++;
      const body = JSON.parse(init.body);
      if (resolveCallCount === 1) {
        assert.equal(body.ticket, 'ticket-resolve-init');
        assert.equal(body.server, 'default');
        return {
          status: 200,
          body: {
            launchTicket: 'launch-ticket-1',
            nextTicket: 'chained-next-ticket-2',
          },
        };
      }
      if (resolveCallCount === 2) {
        assert.equal(body.ticket, 'chained-next-ticket-2', 'segunda opção deve usar nextTicket da primeira');
        assert.equal(body.server, 'legendado');
        return {
          status: 200,
          body: {
            launchTicket: 'launch-ticket-2',
            nextTicket: null,
          },
        };
      }
    }
    if (url.pathname === '/playerkys/source.php') {
      const body = JSON.parse(init.body);
      return {
        status: 200,
        body: { url: `https://cf.storage.example/${body.ticket}.mp4`, subtitle: '' },
      };
    }
  });

  const opt1 = { serverKey: 'default', language: 'Dublado', fastTicket: null };
  const opt2 = { serverKey: 'legendado', language: 'Legendado', fastTicket: null };
  const res1 = await altApp.exports.resolveOptionTicket(opt1, originResult, sharedState);
  assert.equal(res1.videoUrl, 'https://cf.storage.example/launch-ticket-1.mp4');
  assert.equal(sharedState.nextTicket, 'chained-next-ticket-2');

  const res2 = await altApp.exports.resolveOptionTicket(opt2, originResult, sharedState);
  assert.equal(res2.videoUrl, 'https://cf.storage.example/launch-ticket-2.mp4');
  assert.equal(sharedState.nextTicket, undefined, 'ticket deve ser consumido');

  // Tentativa com ticket já consumido ou indisponível
  await assert.rejects(
    altApp.exports.resolveOptionTicket(opt2, originResult, sharedState),
    /nenhum ticket disponível/i,
  );

  // 3. Ticket já usado ou expirado (HTTP 403)
  const forbiddenApp = playerRuntime(() => ({
    status: 403,
    body: { error: 'Esta autorização já foi utilizada.' },
  }));
  const secretFastTicket = 'top-secret-ticket-403';
  try {
    await forbiddenApp.exports.resolveOptionTicket(
      { serverKey: 'default', language: 'Dublado', fastTicket: secretFastTicket },
      originResult,
      {},
    );
    assert.fail('Deveria ter lançado erro');
  } catch (err) {
    assert.ok(!err.message.includes(secretFastTicket), 'ticket não pode aparecer na mensagem de erro');
    assert.match(err.message, /HTTP 403/);
  }

  // 4. HTML 200 de domínio antigo no lugar de JSON (ex: resposta de aviso em playback-resolve)
  const html200App = playerRuntime(() => ({
    status: 200,
    body: fixture('migration-notice.html'),
  }));
  await assert.rejects(
    html200App.exports.resolveOptionTicket(fastOption, originResult, {}),
    /não é JSON válido/i,
  );

  // 5. JSON sem URL
  const noUrlApp = playerRuntime(() => ({
    status: 200,
    body: { error: '', subtitle: '' },
  }));
  await assert.rejects(
    noUrlApp.exports.resolveOptionTicket(fastOption, originResult, {}),
    /sem URL/i,
  );

  // 6. URL não HTTPS (ex: http:// ou embed)
  const httpUrlApp = playerRuntime(() => ({
    status: 200,
    body: { url: 'http://inseguro.example/video.mp4' },
  }));
  await assert.rejects(
    httpUrlApp.exports.resolveOptionTicket(fastOption, originResult, {}),
    /não é HTTPS/i,
  );
});

test('3.1 sonda GET Range mínimo, formatSize, 206 obrigatório e corpo nunca lido', async () => {
  const { formatSize } = mediaRuntime().exports;

  // formatSize
  assert.equal(formatSize(924002405), '0.9 GB');
  assert.equal(formatSize(3400543351), '3.2 GB');
  assert.equal(formatSize(245684822), '234.3 MB');
  assert.equal(formatSize(1024 * 500), '500.0 KB');
  assert.equal(formatSize(512), '512 B');
  assert.throws(() => formatSize(-1), /inválido/);
  assert.throws(() => formatSize(null), /inválido/);

  // 1. Resposta 206 válida
  const okApp = mediaRuntime((url, init) => {
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Range, 'bytes=0-0');
    return {
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-range': 'bytes 0-0/773587888',
      },
    };
  });
  const res = await okApp.exports.probeMedia('https://cf.storage.example/video.mp4');
  assert.equal(res.totalBytes, 773587888);
  assert.equal(res.size, '737.8 MB');
  assert.equal(okApp.calls.length, 1);
  assert.equal(okApp.bodyReads.length, 0, 'corpo da resposta nunca deve ser lido');
  assert.equal(okApp.calls[0].init.method, 'GET');
  assert.equal(okApp.calls[0].init.headers.Range, 'bytes=0-0');

  // 2. HTTP 200 sem faixa (servidor ignorou Range)
  const status200App = mediaRuntime(() => ({
    status: 200,
    headers: {
      'content-type': 'video/mp4',
      'content-length': '773587888',
    },
  }));
  await assert.rejects(
    status200App.exports.probeMedia('https://cf.storage.example/video.mp4'),
    /esperado 206/i,
  );
  assert.equal(status200App.bodyReads.length, 0);

  // 3. HTML (Content-Type não é vídeo)
  const htmlApp = mediaRuntime(() => ({
    status: 206,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'content-range': 'bytes 0-0/5000',
    },
  }));
  await assert.rejects(
    htmlApp.exports.probeMedia('https://cf.storage.example/video.mp4'),
    /Content-Type não é vídeo/i,
  );
  assert.equal(htmlApp.bodyReads.length, 0);

  // 4. Erro HTTP (403, 404, 500)
  for (const status of [403, 404, 500]) {
    const errApp = mediaRuntime(() => ({ status, headers: {} }));
    await assert.rejects(
      errApp.exports.probeMedia('https://cf.storage.example/video.mp4'),
      /esperado 206/i,
    );
    assert.equal(errApp.bodyReads.length, 0);
  }

  // 5. Content-Type sem video/ (ex: application/octet-stream)
  const octetApp = mediaRuntime(() => ({
    status: 206,
    headers: {
      'content-type': 'application/octet-stream',
      'content-range': 'bytes 0-0/773587888',
    },
  }));
  await assert.rejects(
    octetApp.exports.probeMedia('https://cf.storage.example/video.mp4'),
    /Content-Type não é vídeo/i,
  );
  assert.equal(octetApp.bodyReads.length, 0);

  // 6. Content-Range ausente ou sem total numérico (bytes */*)
  for (const badRange of ['', 'bytes 0-0/*', 'bytes 0-0/abc', 'bytes 0-0/-10']) {
    const badRangeApp = mediaRuntime(() => ({
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-range': badRange,
      },
    }));
    await assert.rejects(
      badRangeApp.exports.probeMedia('https://cf.storage.example/video.mp4'),
      /Content-Range inválido|Total numérico inválido/i,
    );
    assert.equal(badRangeApp.bodyReads.length, 0);
  }

  // 7. Confirmação de que não há GET sem Range nem HEAD
  assert.ok(okApp.calls.every((c) => c.init?.method === 'GET' && c.init?.headers?.Range === 'bytes=0-0'));
  assert.ok(okApp.calls.every((c) => c.init?.method !== 'HEAD'));
});

test('3.2 montagem de streams com buildStream, títulos, HD -> 720p, legendas e falha parcial', async () => {
  function standardRoute(url, init) {
    if (url.pathname === '/playerkys/source.php') {
      const body = JSON.parse(init.body);
      const isLeg = body.ticket.includes('leg');
      return {
        status: 200,
        body: {
          url: `https://cf.storage.example/${isLeg ? 'legendado' : 'dublado'}.mp4?secretSig=123`,
          subtitle: isLeg ? 'https://redeflixapi.click/subs/legendado.vtt' : '',
        },
      };
    }
    if (url.pathname.endsWith('.mp4')) {
      const isLeg = url.pathname.includes('legendado');
      return {
        status: 206,
        headers: {
          'content-type': 'video/mp4',
          'content-range': isLeg ? 'bytes 0-0/476874244' : 'bytes 0-0/924002405',
        },
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  }

  // 1. Filme com as duas opções: Dublado e Legendado
  const movieOriginResult = {
    effectiveOrigin: 'https://redeflixapi.click',
    page: { url: 'https://redeflixapi.click/filme/969681', text: fixture('movie-player.html') },
  };
  const movieApp = playerRuntime(standardRoute);
  const movieStreams = JSON.parse(JSON.stringify(await movieApp.exports.extractPlayerStreams(movieOriginResult, {
    tmdbId: '969681',
    mediaType: 'movie',
    season: null,
    episode: null,
  })));

  assert.equal(movieStreams.length, 2);
  assert.equal(movieStreams[0].name, 'RedeFlix 1080p\n🗣️ Dublado\n🌐 HTTP 🔍 RedeFlixApi');
  assert.equal(movieStreams[0].title, '🗣️ Dublado\n🌐 HTTP 📦 0.9 GB 🔍 RedeFlixApi');
  assert.equal(movieStreams[0].provider, 'RedeFlixApi');
  assert.equal(movieStreams[0].type, 'mp4');
  assert.equal(movieStreams[0].language, 'Dublado');
  assert.equal(movieStreams[0].quality, '1080p');
  assert.equal(movieStreams[0].size, '0.9 GB');
  assert.ok(!('headers' in movieStreams[0]), 'headers deve ser omitido');
  assert.ok(!('subtitles' in movieStreams[0]), 'Dublado sem legenda externa');

  assert.equal(movieStreams[1].name, 'RedeFlix 1080p\n🗣️ Legendado\n🌐 HTTP 🔍 RedeFlixApi');
  assert.equal(movieStreams[1].title, '🗣️ Legendado\n🌐 HTTP 📦 454.8 MB 🔍 RedeFlixApi');
  assert.equal(movieStreams[1].language, 'Legendado');
  assert.equal(movieStreams[1].size, '454.8 MB');
  assert.equal(movieStreams[1].subtitles.length, 1);
  assert.equal(movieStreams[1].subtitles[0].url, 'https://redeflixapi.click/subs/legendado.vtt');
  assert.equal(movieStreams[1].subtitles[0].language, 'Português');

  // Ordenação: com mesma qualidade (1080p), Dublado antes de Legendado
  assert.deepEqual(movieStreams.map((s) => s.language), ['Dublado', 'Legendado']);

  // Prism para filme
  const prismMovieApp = playerRuntime(standardRoute, playerCodes.prism);
  const prismMovieStreams = JSON.parse(JSON.stringify(await prismMovieApp.exports.extractPlayerStreams(movieOriginResult, {
    tmdbId: '969681',
    mediaType: 'movie',
    season: null,
    episode: null,
  })));
  assert.equal(prismMovieStreams[0].name, '🚀 FHD 1080p\n🎬 Filme Exemplo (2024)\n🗣️ Dublado\n🌐 HTTP\n📡 RedeFlixApi');
  assert.equal(
    prismMovieStreams[0].title,
    '🎬 Filme Exemplo (2024)\n🗣️ Dublado\n🌐 HTTP 📦 0.9 GB\n📡 RedeFlixApi\n🔍RedeFlix',
  );
  assert.equal(prismMovieStreams[1].name, '🚀 FHD 1080p\n🎬 Filme Exemplo (2024)\n🗣️ Legendado\n🌐 HTTP\n📡 RedeFlixApi');
  assert.equal(
    prismMovieStreams[1].title,
    '🎬 Filme Exemplo (2024)\n🗣️ Legendado\n🌐 HTTP 📦 454.8 MB\n📡 RedeFlixApi\n🔍RedeFlix',
  );

  // 2. Só Legendado
  const onlyLegHtml = fixture('movie-player.html')
    .replace(/<button[^>]*data-server="default"[\s\S]*?<\/button>/i, '')
    .replace('"default":"ticket-fast-dub-1",', '');
  const onlyLegOrigin = {
    effectiveOrigin: 'https://redeflixapi.click',
    page: { url: 'https://redeflixapi.click/filme/969681', text: onlyLegHtml },
  };
  const onlyLegApp = playerRuntime(standardRoute);
  const onlyLegStreams = JSON.parse(JSON.stringify(await onlyLegApp.exports.extractPlayerStreams(onlyLegOrigin, {
    tmdbId: '969681',
    mediaType: 'movie',
    season: null,
    episode: null,
  })));
  assert.equal(onlyLegStreams.length, 1);
  assert.equal(onlyLegStreams[0].language, 'Legendado');

  // 3. Série T2 E3
  const seriesOriginResult = {
    effectiveOrigin: 'https://redeflixapi.click',
    page: { url: 'https://redeflixapi.click/serie/1396/2/3', text: fixture('series-player.html') },
  };
  const seriesApp = playerRuntime(standardRoute);
  const seriesStreams = JSON.parse(JSON.stringify(await seriesApp.exports.extractPlayerStreams(seriesOriginResult, {
    tmdbId: '1396',
    mediaType: 'tv',
    season: 2,
    episode: 3,
  })));
  assert.equal(seriesStreams.length, 1);
  assert.equal(seriesStreams[0].name, 'RedeFlix 1080p\n🗣️ Dublado\n🌐 HTTP 🔍 RedeFlixApi\nℹ️ O Começo do Fim');
  assert.equal(seriesStreams[0].title, '🗣️ Dublado\n🌐 HTTP 📦 0.9 GB 🔍 RedeFlixApi\nℹ️ O Começo do Fim');

  const prismSeriesApp = playerRuntime(standardRoute, playerCodes.prism);
  const prismSeriesStreams = JSON.parse(JSON.stringify(await prismSeriesApp.exports.extractPlayerStreams(seriesOriginResult, {
    tmdbId: '1396',
    mediaType: 'tv',
    season: 2,
    episode: 3,
  })));
  assert.equal(prismSeriesStreams[0].name, '🚀 FHD 1080p\n🎬 Série Exemplo T02E03\n🗣️ Dublado\n🌐 HTTP\n📡 RedeFlixApi\nℹ️ O Começo do Fim');
  assert.equal(
    prismSeriesStreams[0].title,
    '🎬 Série Exemplo T02E03\n🗣️ Dublado\n🌐 HTTP 📦 0.9 GB\n📡 RedeFlixApi\n🔍RedeFlix\nℹ️ O Começo do Fim',
  );

  // 3.1 Página sem qualidade sai como Desconhecida
  const unknownQualityHtml = fixture('movie-player.html').replace(' - 2024 - 1080p', ' - 2024');
  const unknownQualityOrigin = {
    effectiveOrigin: 'https://redeflixapi.click',
    page: { url: 'https://redeflixapi.click/filme/969681', text: unknownQualityHtml },
  };
  const unknownApp = playerRuntime(standardRoute);
  const unknownStreams = JSON.parse(JSON.stringify(await unknownApp.exports.extractPlayerStreams(unknownQualityOrigin, {
    tmdbId: '969681',
    mediaType: 'movie',
    season: null,
    episode: null,
  })));
  assert.equal(unknownStreams.length, 2);
  assert.equal(unknownStreams[0].quality, 'Desconhecida');
  assert.equal(unknownStreams[0].name, 'RedeFlix Desconhecida\n🗣️ Dublado\n🌐 HTTP 🔍 RedeFlixApi');

  const prismUnknownApp = playerRuntime(standardRoute, playerCodes.prism);
  const prismUnknownStreams = JSON.parse(JSON.stringify(await prismUnknownApp.exports.extractPlayerStreams(unknownQualityOrigin, {
    tmdbId: '969681',
    mediaType: 'movie',
    season: null,
    episode: null,
  })));
  assert.equal(prismUnknownStreams[0].quality, 'Desconhecida');
  assert.equal(prismUnknownStreams[0].name, '❓ Desconhecida\n🎬 Filme Exemplo (2024)\n🗣️ Dublado\n🌐 HTTP\n📡 RedeFlixApi');

  // 4. HD -> 720p
  const hdHtml = fixture('movie-player.html').replace('1080p', 'HD');
  const hdOrigin = {
    effectiveOrigin: 'https://redeflixapi.click',
    page: { url: 'https://redeflixapi.click/filme/969681', text: hdHtml },
  };
  const hdApp = playerRuntime(standardRoute);
  const hdStreams = JSON.parse(JSON.stringify(await hdApp.exports.extractPlayerStreams(hdOrigin, {
    tmdbId: '969681',
    mediaType: 'movie',
    season: null,
    episode: null,
  })));
  assert.equal(hdStreams[0].quality, '720p');

  // 5. Falha parcial (uma opção falha na sonda, outra segue e a falha é registrada)
  const partialApp = playerRuntime((url, init) => {
    if (url.pathname === '/playerkys/source.php') {
      const body = JSON.parse(init.body);
      const isLeg = body.ticket.includes('leg');
      return {
        status: 200,
        body: { url: `https://cf.storage.example/${isLeg ? 'legendado' : 'dublado'}.mp4`, subtitle: '' },
      };
    }
    if (url.pathname.includes('dublado.mp4')) {
      return { status: 403, headers: {} };
    }
    if (url.pathname.includes('legendado.mp4')) {
      return {
        status: 206,
        headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-0/476874244' },
      };
    }
  });
  const partialStreams = JSON.parse(JSON.stringify(await partialApp.exports.extractPlayerStreams(movieOriginResult, {
    tmdbId: '969681',
    mediaType: 'movie',
    season: null,
    episode: null,
  })));
  assert.equal(partialStreams.length, 1);
  assert.equal(partialStreams[0].language, 'Legendado');
});

test('3.3 URL assinada só como host e caminho, segredos nunca em logs ou fixtures', async () => {
  // Teste de sanitização no app
  const secretTicket = 'very-secret-ticket-999';
  const secretSig = 'X-Amz-Signature=abcdef123456';
  const queryUrl = `https://r2.storage.example/video.mp4?${secretSig}&other=param`;

  const secretApp = runtime((url) => {
    if (url.host === 'redeflixapi.click') {
      return {
        status: 200,
        body: fixture('movie-player.html'),
        url: url.href,
      };
    }
    if (url.pathname === '/playerkys/source.php') {
      return {
        status: 200,
        body: { url: queryUrl },
      };
    }
    if (url.pathname.endsWith('.mp4')) {
      // Falha proposital na sonda para disparar log de erro
      return new Error(`Falha de rede em ${queryUrl} com ticket ${secretTicket}`);
    }
    return { status: 520, body: '' };
  });

  const res = await secretApp.getStreams('969681', 'movie', null, null);
  assert.deepEqual(res, []);
  assert.ok(secretApp.logs.length > 0);
  for (const log of secretApp.logs) {
    assert.ok(!log.includes(secretSig), `Assinatura exposta no log: ${log}`);
    assert.ok(!log.includes('abcdef123456'), `Assinatura exposta no log: ${log}`);
    assert.ok(!log.includes(secretTicket), `Ticket exposto no log: ${log}`);
    assert.ok(!log.includes('other=param'), `Query exposta no log: ${log}`);
    if (log.includes('https://r2.storage.example')) {
      assert.ok(log.includes('https://r2.storage.example/video.mp4'), `Host e caminho preservados no log: ${log}`);
    }
  }

  // Verifica fixtures do repositório em test/fixtures/redeflix/
  const fixtureDir = path.join(__dirname, 'fixtures/redeflix');
  const fixtureFiles = fs.readdirSync(fixtureDir);
  for (const file of fixtureFiles) {
    const content = fs.readFileSync(path.join(fixtureDir, file), 'utf8');
    assert.doesNotMatch(content, /X-Amz-Signature=[a-f0-9]{32,}/i, `Assinatura real em fixture ${file}`);
    assert.doesNotMatch(content, /X-Amz-Credential=[^&\s]+/i, `Credencial real em fixture ${file}`);
  }
});






