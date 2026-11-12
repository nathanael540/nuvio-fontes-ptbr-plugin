const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const codes = {};
let code;

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'fshd');
const movieHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'movie-693134.html'), 'utf8');
const tvHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'tv-1396-1-1.html'), 'utf8');
const tvAbsentHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'tv-1396-absent-episode.html'), 'utf8');
const movieMalformedHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'movie-malformed.html'), 'utf8');
const optionsDubLegJson = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'options-dub-leg.json'), 'utf8'));
const playersFireplayerJson = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'players-fireplayer.json'), 'utf8'));
const videoRedirectHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'video-redirect.html'), 'utf8');
const videoRedirectBounceHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'video-redirect-bounce.html'), 'utf8');
const playerOfflineHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'player-offline.html'), 'utf8');
const playerUnsupportedHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'player-unsupported.html'), 'utf8');
const optionsMovieServersJson = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'options-movie-servers.json'), 'utf8'));
const fireplayerPackedHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'fireplayer-packed.html'), 'utf8');
const masterVariantsTxt = fs.readFileSync(path.join(FIXTURES_DIR, 'master-variants.txt'), 'utf8');
const masterUnknownTxt = fs.readFileSync(path.join(FIXTURES_DIR, 'master-unknown-quality.txt'), 'utf8');
const master1080Txt = fs.readFileSync(path.join(FIXTURES_DIR, 'master-series-1080-900.txt'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

test.before(async () => {
  const outDir = createTempDir('fshd-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('fshd', { outDir, formatter }), 'utf8');
    }
    const esbuild = require('esbuild');
    for (const name of ['api', 'extractor', 'packer']) {
      const result = await esbuild.build({
        entryPoints: [`src/fshd/${name}.js`], bundle: true, write: false,
        format: 'cjs', platform: 'neutral', external: ['cheerio-without-node-native'],
      });
      codes[name] = result.outputFiles[0].text;
    }
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function makeRuntime(route = () => { throw new Error('fetch inesperado'); }, key = 'chave-ficticia', bundle = code) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    TMDB_API_KEY: key,
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    console: {
      error: (msg) => errors.push(String(msg)),
      warn: (msg) => warnings.push(String(msg)),
      log: () => {},
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init);
      if (result instanceof Error) throw result;
      const text = typeof result === 'string'
        ? result
        : typeof result.body === 'string'
          ? result.body
          : JSON.stringify(result.body);
      return {
        ok: !result.status || result.status < 400,
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

function packedScript(payload, words = []) {
  const escaped = payload.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `eval(function(p,a,c,k,e,d){return p}('${escaped}',62,${words.length},'${words.join('|')}'.split('|'),0,{}));`;
}

test('1.1 carregamento CommonJS sem rede e rejeição de coordenadas inválidas antes do fetch', async () => {
  let fetchCalled = false;
  const { exports, errors } = makeRuntime(async () => {
    fetchCalled = true;
    return { status: 200, body: 'ok' };
  });

  assert.equal(typeof exports.getStreams, 'function');
  assert.equal(fetchCalled, false);

  // TV sem temporada
  const res1 = await exports.getStreams('1396', 'tv', null, 1);
  assert.deepEqual(Array.from(res1), []);
  assert.equal(fetchCalled, false);
  assert.match(errors[errors.length - 1], /\[FSHD\] Validação:.*temporada=null/);

  // TV sem episódio
  const res2 = await exports.getStreams('1396', 'tv', 1, null);
  assert.deepEqual(Array.from(res2), []);
  assert.equal(fetchCalled, false);
  assert.match(errors[errors.length - 1], /\[FSHD\] Validação:.*episódio=null/);

  // TV com temporada negativa
  const res3 = await exports.getStreams('1396', 'tv', -1, 1);
  assert.deepEqual(Array.from(res3), []);
  assert.equal(fetchCalled, false);
  assert.match(errors[errors.length - 1], /\[FSHD\] Validação:.*temporada=-1/);

  // Tipo de mídia desconhecido
  const res4 = await exports.getStreams('1396', 'anime', 1, 1);
  assert.deepEqual(Array.from(res4), []);
  assert.equal(fetchCalled, false);
  assert.match(errors[errors.length - 1], /\[FSHD\] Validação:.*Tipo de mídia inválido/);

  // ID do TMDB inválido
  const res5 = await exports.getStreams('abc', 'movie', null, null);
  assert.deepEqual(Array.from(res5), []);
  assert.equal(fetchCalled, false);
  assert.match(errors[errors.length - 1], /\[FSHD\] Validação:.*ID do TMDB inválido/);
});

test('1.2 e 1.3 roteamento direto de filme e episódio e tratamento de ausência (404)', async () => {
  // Teste de filme ausente (HTTP 404)
  const runtime404 = makeRuntime(async (url) => {
    if (url.pathname === '/filme/99999999') {
      return { status: 404, body: 'Not Found' };
    }
    throw new Error(`Rota inesperada: ${url.href}`);
  });

  const streams404 = await runtime404.exports.getStreams('99999999', 'movie', null, null);
  assert.deepEqual(Array.from(streams404), []);
  assert.equal(runtime404.errors.length, 0);

  // Teste de série com episódio ausente na estrutura
  const runtimeTvAbsent = makeRuntime(async (url) => {
    if (url.pathname === '/serie/1396/1/99') {
      return { status: 200, body: tvAbsentHtml };
    }
    throw new Error(`Rota inesperada: ${url.href}`);
  });

  const streamsTvAbsent = await runtimeTvAbsent.exports.getStreams('1396', 'tv', 1, 99);
  assert.deepEqual(Array.from(streamsTvAbsent), []);
  assert.equal(runtimeTvAbsent.errors.length, 0);

  // Teste de filme com layout corrompido (sem CONTENT_INFO) -> lança erro e loga [FSHD]
  const runtimeMalformed = makeRuntime(async (url) => {
    if (url.pathname === '/filme/693134') {
      return { status: 200, body: movieMalformedHtml };
    }
    throw new Error(`Rota inesperada: ${url.href}`);
  });

  const streamsMalformed = await runtimeMalformed.exports.getStreams('693134', 'movie', null, null);
  assert.deepEqual(Array.from(streamsMalformed), []);
  assert.ok(runtimeMalformed.errors.length > 0);
  assert.match(runtimeMalformed.errors[0], /\[FSHD\] Falha em movie 693134:.*CONTENT_INFO não encontrado/);
});

test('2.1 a 2.4 fluxo de APIs /api/options, /api/players, desempacotador Dean Edwards e legendas', async () => {
  const { exports, calls, warnings } = makeRuntime(async (url, init) => {
    if (url.pathname === '/filme/693134') {
      return { status: 200, body: movieHtml };
    }
    if (url.pathname === '/api/options') {
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['X-Requested-With'], 'XMLHttpRequest');
      const body = JSON.parse(init.body);
      assert.equal(body.content_id, 24966);
      assert.equal(body.content_type, '1');
      return { status: 200, body: optionsDubLegJson };
    }
    if (url.pathname === '/api/players') {
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      assert.equal(body.content_info, 24966);
      assert.equal(body.content_type, '1');
      assert.ok([162759, 162760].includes(body.video_id));
      return { status: 200, body: playersFireplayerJson };
    }
    if (url.pathname === '/video/cGF5bG9hZDEyMw==') {
      return { status: 200, body: videoRedirectHtml };
    }
    if (url.pathname === '/player/index.php') {
      return { status: 200, body: fireplayerPackedHtml };
    }
    if (url.pathname.endsWith('/master.txt')) {
      return { status: 200, body: masterVariantsTxt };
    }
    throw new Error(`URL inesperada no mock: ${url.href}`);
  });

  const streams = await exports.getStreams('693134', 'movie', null, null);
  assert.ok(Array.isArray(streams));
  // 2 opções (Dublado e Legendado) x 2 variantes (720p e 480p) = 4 streams
  assert.equal(streams.length, 4);
  assert.equal(warnings.length, 0);

  // Confere que ordenação por qualidade colocou 720p antes de 480p
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[1].quality, '720p');
  assert.equal(streams[2].quality, '480p');
  assert.equal(streams[3].quality, '480p');

  // Confere cabeçalhos obrigatórios
  for (const s of streams) {
    assert.equal(s.headers.Referer, 'https://112234152.xyz/');
    assert.equal(s.type, 'hls');
    assert.equal(s.provider, 'fshd');
    assert.ok(Array.isArray(s.subtitles));
    assert.equal(s.subtitles[0].language, 'Português (PT-BR)');
  }

  // Confere chamadas de API
  assert.ok(calls.some((c) => c.url.includes('/api/options')));
  assert.ok(calls.some((c) => c.url.includes('/api/players')));
});

test('3.1 a 3.4 master sem RESOLUTION preserva qualidade Desconhecida e falha parcial descarta apenas a opção', async () => {
  const { exports, warnings } = makeRuntime(async (url, init) => {
    if (url.pathname === '/serie/1396/1/1') {
      return { status: 200, body: tvHtml };
    }
    if (url.pathname === '/api/options') {
      const body = JSON.parse(init.body);
      assert.equal(body.content_id, 22628);
      assert.equal(body.content_type, '2');
      return { status: 200, body: optionsDubLegJson };
    }
    if (url.pathname === '/api/players') {
      const body = JSON.parse(init.body);
      if (body.video_id === 162760) {
        // Opção 2 (Legendado) falha com HTTP 500
        return { status: 500, body: 'Internal Server Error' };
      }
      return { status: 200, body: playersFireplayerJson };
    }
    if (url.pathname === '/video/cGF5bG9hZDEyMw==') {
      return { status: 200, body: videoRedirectHtml };
    }
    if (url.pathname === '/player/index.php') {
      return { status: 200, body: fireplayerPackedHtml };
    }
    if (url.pathname.endsWith('/master.txt')) {
      // Retorna master sem RESOLUTION
      return { status: 200, body: masterUnknownTxt };
    }
    throw new Error(`URL inesperada no mock: ${url.href}`);
  });

  const streams = await exports.getStreams('1396', 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].language, 'Dublado');

  // Confere que a opção falhada foi descartada com console.warn
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\[FSHD\] Opção Legendado descartada:.*500/);
});

test('3.3 fallback entre domínios em caso de erro HTTP 429 / rate limit ou falha de transporte', async () => {
  let domain1Calls = 0;
  let domain2Calls = 0;

  // Usa extractor com lista de domínios customizada
  const esbuild = require('esbuild');
  const extractorBuild = await esbuild.build({
    entryPoints: ['src/fshd/extractor.js'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'neutral',
    external: ['cheerio-without-node-native'],
  });
  const extractorBundle = extractorBuild.outputFiles[0].text;

  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    console: { error: () => {}, warn: () => {} },
    fetch: async (url) => {
      const parsed = new URL(url);
      if (parsed.host === 'fshd-primary.test') {
        domain1Calls += 1;
        // Primário retorna HTTP 429
        return {
          ok: false,
          status: 429,
          url: String(url),
          text: async () => JSON.stringify({ message: 'Limite atingido' }),
          json: async () => ({ message: 'Limite atingido' }),
        };
      }
      if (parsed.host === 'fshd-mirror.test') {
        domain2Calls += 1;
        if (parsed.pathname === '/filme/693134') {
          return { ok: true, status: 200, url: String(url), text: async () => movieHtml };
        }
        if (parsed.pathname === '/api/options') {
          return { ok: true, status: 200, url: String(url), text: async () => JSON.stringify({ options: [] }) };
        }
      }
      throw new Error(`Host desconhecido: ${parsed.host}`);
    },
  };
  vm.runInNewContext(extractorBundle, context);

  const streams = await context.module.exports.extractStreams(
    { tmdbId: '693134', mediaType: 'movie', season: null, episode: null },
    'FSHD',
    ['https://fshd-primary.test', 'https://fshd-mirror.test'],
  );

  assert.deepEqual(Array.from(streams), []);
  assert.ok(domain1Calls > 0);
  assert.ok(domain2Calls > 0);
});

test('formatação: templates Google Drive e Prism geram cabeçalho e delivery type 🌐 HTTP', async () => {
  for (const formatter of ['gdrive', 'prism']) {
    const runtime = makeRuntime(async (url) => {
      if (url.pathname === '/filme/693134') return { status: 200, body: movieHtml };
      if (url.pathname === '/api/options') return { status: 200, body: { options: [{ ID: 1, type: 1 }] } };
      if (url.pathname === '/api/players') return { status: 200, body: playersFireplayerJson };
      if (url.pathname === '/video/cGF5bG9hZDEyMw==') return { status: 200, body: videoRedirectHtml };
      if (url.pathname === '/player/index.php') return { status: 200, body: fireplayerPackedHtml };
      if (url.pathname.endsWith('/master.txt')) return { status: 200, body: masterVariantsTxt };
      throw new Error(`Inesperado: ${url.href}`);
    }, 'chave', codes[formatter]);

    const streams = await runtime.exports.getStreams('693134', 'movie', null, null);
    assert.ok(streams.length > 0);

    for (const s of streams) {
      assert.equal(typeof s.name, 'string');
      assert.equal(typeof s.title, 'string');
      // formatador gerou name e title e removeu format do objeto final
      assert.equal(s.format, undefined);
      // Tipo de entrega derivado da URL http(s)
      assert.match(s.name, /🌐\s*HTTP/);
      assert.match(s.title, /🌐\s*HTTP/);

      if (formatter === 'gdrive') {
        assert.match(s.name, new RegExp(`^FSHD\\s+${s.quality}`, 'm'));
      } else if (formatter === 'prism') {
        assert.match(s.name, new RegExp(s.quality));
      }
    }
  }
});

test('2.2 packer.js: lê o config JSON do FirePlayer e mantém só as legendas do HTML', () => {
  const { extractFirePlayerConfig } = makeRuntime(undefined, undefined, codes.packer).exports;
  const html = `${fireplayerPackedHtml}<track kind="captions" src="/subs/pt.vtt" srclang="pt" label="Português">`;

  const config = extractFirePlayerConfig(html, 'https://112234152.xyz/player/index.php?data=abc');
  assert.equal(config.videoUrl, 'https://112234152.xyz/hls/aa60d5b1c0f4b7f3a9d2e6c8b4a1f7e3/master.txt');
  assert.equal(config.videoSources, undefined);
  assert.equal(config.tracks.length, 1);
  assert.equal(config.tracks[0].url, 'https://112234152.xyz/subs/pt.vtt');
  assert.equal(config.tracks[0].language, 'pt');
  assert.equal(config.tracks[0].name, 'Português');

  // As faixas de miniaturas do config não viram legenda: só o <track> do HTML aparece.
  assert.ok(!config.tracks.some((track) => /thumbnail/.test(track.url)));

  // Sem packer, o host do player aparece na mensagem.
  assert.throws(
    () => extractFirePlayerConfig('<html>sem player</html>', 'https://abyssplayer.com/0-12N-Sfk'),
    /Player não suportado \(abyssplayer\.com\)/,
  );
  assert.throws(() => extractFirePlayerConfig('', 'https://example.com'), /HTML do FirePlayer ausente/);

  // Config ausente, JSON inválido e videoUrl ausente têm mensagens distintas.
  assert.throws(
    () => extractFirePlayerConfig(packedScript('FirePlayer(vhash,config,false)'), 'https://example.com'),
    /Configuração FirePlayer ausente/,
  );
  assert.throws(
    () => extractFirePlayerConfig(packedScript('FirePlayer(vhash,{videoUrl:x},false)'), 'https://example.com'),
    /Configuração FirePlayer não é JSON válido/,
  );
  assert.throws(
    () => extractFirePlayerConfig(packedScript('FirePlayer(vhash,{"hostList":{}},false)'), 'https://example.com'),
    /Configuração FirePlayer sem videoUrl/,
  );
});

function successfulRoute(url) {
  if (url.pathname === '/filme/693134') return movieHtml;
  if (url.pathname === '/api/options') return { body: { options: [{ ID: 1, type: 1 }] } };
  if (url.pathname === '/api/players') return { body: playersFireplayerJson };
  if (url.pathname.startsWith('/video/')) return videoRedirectHtml;
  if (url.pathname === '/player/index.php') return fireplayerPackedHtml;
  if (url.pathname.endsWith('/master.txt')) return masterVariantsTxt;
  throw new Error(`Rota inesperada: ${url.href}`);
}

test('revisão: título ausente, vazio ou fora do formato falha antes de consultar opções', async () => {
  for (const [mediaType, html, tmdbId] of [['movie', movieHtml, '693134'], ['tv', tvHtml, '1396']]) {
    for (const title of ['', '<title> - FSHD</title>', '<title>Duna: Parte Dois (2024) - FSHD</title>', '<title>FSHD - Outro Formato</title>']) {
      const runtime = makeRuntime(() => html.replace(/<title>.*?<\/title>/, title));
      const streams = await runtime.exports.getStreams(tmdbId, mediaType, 1, 1);
      assert.equal(streams.length, 0);
      assert.equal(runtime.calls.length, 1);
      assert.equal(runtime.errors.length, 1);
      assert.match(runtime.errors[0], /Formato de título inesperado em/);
    }
  }
});

test('revisão: legenda da query sem idioma é preservada sem inventar language ou name', () => {
  const { extractSubtitlesFromQuery } = makeRuntime(undefined, undefined, codes.api).exports;
  const subtitles = extractSubtitlesFromQuery('https://player.test/?sub1=https://subs.test/1.vtt&sub2=https://subs.test/2.vtt&lang2=en');
  assert.equal(subtitles.length, 2);
  assert.equal(subtitles[0].url, 'https://subs.test/1.vtt');
  assert.equal(Object.hasOwn(subtitles[0], 'language'), false);
  assert.equal(Object.hasOwn(subtitles[0], 'name'), false);
  assert.equal(subtitles[1].language, 'en');
  assert.throws(() => extractSubtitlesFromQuery('URL malformada'), /Invalid URL/);
});

test('revisão: configuração resolve caminhos contra playerUrl e ignora videoSources não utilizado', () => {
  const { extractFirePlayerConfig } = makeRuntime(undefined, undefined, codes.packer).exports;
  const script = packedScript(String.raw`FirePlayer(vhash,{"videoUrl":"media\/master.m3u8","videoSources":[{"file":"ignored"}]},false)`);
  const tracks = '<track src="subs/unknown.vtt"><track src="subs/en.vtt" label="English"><track src="subs/pt.vtt" label="Português" srclang="pt">';
  for (const base of ['', '<script>var player_base_url="https://wrong.test/invented/";</script>']) {
    const config = extractFirePlayerConfig(base + script + tracks, 'https://player.test/embed/nested/index.php?data=abc');
    assert.equal(config.videoUrl, 'https://player.test/embed/nested/media/master.m3u8');
    assert.equal(config.tracks[0].url, 'https://player.test/embed/nested/subs/unknown.vtt');
    assert.equal(Object.hasOwn(config.tracks[0], 'language'), false);
    assert.equal(Object.hasOwn(config.tracks[0], 'name'), false);
    assert.equal(config.tracks[1].language, 'English');
    assert.equal(config.tracks[2].language, 'pt');
    assert.equal(config.tracks[2].name, 'Português');
    assert.equal(Object.hasOwn(config, 'videoSources'), false);
    assert.equal(Object.hasOwn(config, 'playerBaseUrl'), false);
  }
});

test('revisão: master adaptativo preserva áudio externo, legendas e URL do master nos dois templates', async () => {
  const master = [
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Português",LANGUAGE="pt",URI="audio/pt.m3u8"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",URI="audio/en.m3u8"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="subs/en.vtt"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Português",LANGUAGE="pt",URI="https://fshd.link/content/subs/pt.srt"',
    '#EXT-X-STREAM-INF:RESOLUTION=1280x720,AUDIO="audio",SUBTITLES="subs"',
    '720.m3u8',
    '#EXT-X-STREAM-INF:RESOLUTION=854x480,AUDIO="audio",SUBTITLES="subs"',
    '480.m3u8',
  ].join('\n');
  for (const formatter of ['gdrive', 'prism']) {
    const runtime = makeRuntime((url) => url.pathname.endsWith('/master.txt') ? master : successfulRoute(url), undefined, codes[formatter]);
    const streams = await runtime.exports.getStreams('693134', 'movie', null, null);
    assert.equal(runtime.errors.length, 0);
    assert.equal(runtime.warnings.length, 0);
    assert.equal(streams.length, 1);
    assert.match(streams[0].url, /\/master.txt$/);
    assert.equal(streams[0].quality, '720p');
    assert.equal(streams[0].language, 'Dublado');
    assert.match(streams[0].name, /Reprodução adaptativa/);
    assert.equal(streams[0].subtitles.length, 2);
    assert.equal(streams[0].subtitles[0].language, 'Português (PT-BR)');
    assert.equal(streams[0].subtitles[1].language, 'en');
    assert.match(streams[0].subtitles[1].url, /\/subs\/en.vtt$/);
    assert.equal(streams[0].headers.Referer, 'https://112234152.xyz/');
  }
});

test('revisão: fluxo completo descarta legendas sem idioma com aviso e preserva os streams', async () => {
  const runtime = makeRuntime((url) => {
    if (url.pathname.startsWith('/video/')) return videoRedirectHtml.replace('&lang1=Portugu%C3%AAs%20(PT-BR)', '');
    if (url.pathname === '/player/index.php') return fireplayerPackedHtml + '<track src="/subs/unknown.vtt">';
    return successfulRoute(url);
  });
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.equal(streams[0].subtitles, undefined);
  assert.equal(runtime.errors.length, 0);
  assert.equal(runtime.warnings.length, 2);
  for (const warning of runtime.warnings) assert.match(warning, /\[FSHD\] Legenda descartada: idioma ausente/);
});

test('revisão: failover usa status HTTP e rejeição de fetch na página e em /api/options', async () => {
  for (const stage of ['page', 'options']) {
    for (const failure of [403, 451, 429, 500, 599, new Error('conexão recusada')]) {
      const runtime = makeRuntime((url) => {
        if (url.hostname === 'primary.test' && (stage === 'page' || url.pathname === '/api/options')) {
          return typeof failure === 'number' ? { status: failure, body: 'erro' } : failure;
        }
        if (url.pathname === '/api/options') return { body: { options: [] } };
        return movieHtml;
      }, undefined, codes.extractor);
      const streams = await runtime.exports.extractStreams(
        { tmdbId: '693134', mediaType: 'movie', season: null, episode: null },
        'FSHD', ['https://primary.test', 'https://mirror.test'],
      );
      assert.equal(streams.length, 0);
      assert.ok(runtime.calls.some((call) => call.url.startsWith('https://mirror.test/')));
    }
  }
});

test('revisão: parsing com fetch/network na mensagem ou URL não dispara failover', async () => {
  const { isTransportError } = makeRuntime(undefined, undefined, codes.api).exports;
  for (const message of ['fetch inválido', 'network JSON inválido', 'HTTP 500 dentro de texto inválido', 'timeout no parser']) {
    assert.equal(isTransportError(new Error(message)), false);
  }
  for (const status of [400, 401, 404]) assert.equal(isTransportError({ status }), false);

  for (const malformed of ['fetch network', '{"options":"fetch network"}']) {
    const runtime = makeRuntime((url) => url.pathname === '/api/options' ? malformed : movieHtml, undefined, codes.extractor);
    await assert.rejects(runtime.exports.extractStreams(
      { tmdbId: '693134', mediaType: 'movie', season: null, episode: null },
      'FSHD', ['https://fetch-network.test', 'https://mirror.test'],
    ), /Resposta de \/api\/options/);
    assert.equal(runtime.calls.length, 2);
    assert.ok(runtime.calls.every((call) => call.url.startsWith('https://fetch-network.test/')));
  }
});


// Seis servidores, três por áudio, como na página real de Duna: Parte Dois.
const SIX_OPTIONS = [1, 2, 3].map((id) => ({ ID: 100 + id, type: 1 })).concat([1, 2, 3].map((id) => ({ ID: 200 + id, type: 2 })));

function playersCalls(calls) {
  return calls.filter((c) => c.url.endsWith('/api/players')).map((c) => JSON.parse(c.init.body).video_id);
}

test('limite da fonte: um servidor por áudio quando o primeiro funciona', async () => {
  const runtime = makeRuntime((url) => (url.pathname === '/api/options'
    ? { body: { options: SIX_OPTIONS } }
    : successfulRoute(url)));
  const streams = await runtime.exports.getStreams('693134', 'movie');
  assert.deepEqual(playersCalls(runtime.calls), [101, 201]);
  assert.deepEqual([...new Set(streams.map((s) => s.language))].sort(), ['Dublado', 'Legendado']);
  assert.deepEqual(runtime.errors, []);
});

test('limite da fonte: servidor seguinte do mesmo áudio só é consultado se o anterior falhar', async () => {
  const runtime = makeRuntime((url, init) => {
    if (url.pathname === '/api/options') return { body: { options: SIX_OPTIONS } };
    if (url.pathname === '/api/players' && JSON.parse(init.body).video_id === 101) return { body: { message: 'sem video_url' } };
    return successfulRoute(url);
  });
  const streams = await runtime.exports.getStreams('693134', 'movie');
  assert.deepEqual(playersCalls(runtime.calls), [101, 102, 201]);
  assert.ok(streams.some((s) => s.language === 'Dublado'));
  assert.ok(runtime.warnings.some((w) => /Opção Dublado descartada: Resposta de \/api\/players sem video_url/.test(w)));
});

test('limite da fonte: o primeiro HTTP 429 encerra as consultas e gera erro claro', async () => {
  const runtime = makeRuntime((url) => {
    if (url.pathname === '/api/options') return { body: { options: SIX_OPTIONS } };
    if (url.pathname === '/api/players') return { status: 429, body: { message: 'Limite atingido. Tente novamente mais tarde.' } };
    return successfulRoute(url);
  });
  const streams = await runtime.exports.getStreams('693134', 'movie');
  assert.equal(streams.length, 0);
  assert.deepEqual(playersCalls(runtime.calls), [101]);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /\[FSHD\].*Limite de requisições da fonte atingido \(HTTP 429\)/);
  assert.equal(runtime.warnings.filter((w) => /não consultada: limite de requisições/.test(w)).length, 5);
});

test('limite da fonte: HTTP 429 depois de um áudio servido preserva os streams obtidos', async () => {
  const runtime = makeRuntime((url, init) => {
    if (url.pathname === '/api/options') return { body: { options: SIX_OPTIONS } };
    if (url.pathname === '/api/players' && JSON.parse(init.body).video_id >= 200) return { status: 429, body: {} };
    return successfulRoute(url);
  });
  const streams = await runtime.exports.getStreams('693134', 'movie');
  assert.deepEqual(playersCalls(runtime.calls), [101, 201]);
  assert.ok(streams.length > 0 && streams.every((s) => s.language === 'Dublado'));
  assert.deepEqual(runtime.errors, []);
});

test('servidores de filme sem caminho aberto são ignorados sem chamar /api/players', async () => {
  const runtime = makeRuntime((url) => {
    if (url.pathname === '/filme/693134') return { status: 200, body: movieHtml };
    if (url.pathname === '/api/options') return { status: 200, body: optionsMovieServersJson };
    return successfulRoute(url);
  });

  const streams = await runtime.exports.getStreams('693134', 'movie');
  assert.deepEqual(playersCalls(runtime.calls), [147899, 147902]);
  assert.equal(streams.length, 4);
  assert.deepEqual(runtime.errors, []);

  const ignored = runtime.warnings.filter((warning) => /ignorado: sem caminho aberto até a mídia/.test(warning));
  assert.equal(ignored.length, 4);
  assert.equal(ignored.filter((warning) => warning.includes('Servidor Abyss ')).length, 2);
  assert.equal(ignored.filter((warning) => warning.includes('Servidor StreamPlay ')).length, 2);
});

test('vídeo offline na fonte descarta a opção e consulta o servidor seguinte do mesmo áudio', async () => {
  const options = { options: [{ ID: 11, type: 2 }, { ID: 12, type: 2 }] };
  const runtime = makeRuntime((url, init) => {
    if (url.pathname === '/serie/1396/1/1') return { status: 200, body: tvHtml };
    if (url.pathname === '/api/options') return { status: 200, body: options };
    if (url.pathname === '/api/players') {
      const videoId = JSON.parse(init.body).video_id;
      return { status: 200, body: { video_url: `https://fshd.link/video/${videoId === 11 ? 'offline' : 'ok'}` } };
    }
    if (url.pathname === '/video/offline') return { status: 200, body: videoRedirectBounceHtml };
    if (url.hostname === '32891098.xyz' && url.pathname.startsWith('/bounce/')) {
      return { status: 404, body: playerOfflineHtml };
    }
    if (url.pathname === '/video/ok') return { status: 200, body: videoRedirectHtml };
    if (url.pathname === '/player/index.php') return { status: 200, body: fireplayerPackedHtml };
    if (url.pathname.endsWith('/master.txt')) return { status: 200, body: masterVariantsTxt };
    throw new Error(`URL inesperada no mock: ${url.href}`);
  });

  const streams = await runtime.exports.getStreams('1396', 'tv', 1, 1);
  assert.deepEqual(playersCalls(runtime.calls), [11, 12]);
  assert.equal(streams.length, 2);
  assert.equal(streams[0].headers.Referer, 'https://112234152.xyz/');
  assert.ok(runtime.warnings.some((warning) => /Vídeo offline na fonte \(32891098\.xyz\)/.test(warning)));
  assert.deepEqual(runtime.errors, []);
});

test('host não suportado é descartado com o host na mensagem', async () => {
  const redirect = '<html><body><script>window.location.href = "https://abyssplayer.com/0-12N-Sfk";</script></body></html>';
  const runtime = makeRuntime((url) => {
    if (url.pathname === '/serie/1396/1/1') return { status: 200, body: tvHtml };
    if (url.pathname === '/api/options') return { status: 200, body: { options: [{ ID: 1, type: 1 }] } };
    if (url.pathname === '/api/players') return { status: 200, body: { video_url: 'https://fshd.link/video/abyss' } };
    if (url.pathname === '/video/abyss') return { status: 200, body: redirect };
    if (url.hostname === 'abyssplayer.com') return { status: 200, body: playerUnsupportedHtml };
    throw new Error(`URL inesperada no mock: ${url.href}`);
  });

  const streams = await runtime.exports.getStreams('1396', 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.ok(runtime.warnings.some((warning) => /Player não suportado \(abyssplayer\.com\)/.test(warning)));
  assert.match(runtime.errors[0], /Player não suportado \(abyssplayer\.com\)/);
});

test('bounce em outro domínio usa o Referer da página final e as legendas da URL do redirecionamento', async () => {
  const runtime = makeRuntime((url) => {
    if (url.pathname === '/serie/1396/1/1') return { status: 200, body: tvHtml };
    if (url.pathname === '/api/options') return { status: 200, body: { options: [{ ID: 1, type: 1 }] } };
    if (url.pathname === '/api/players') return { status: 200, body: { video_url: 'https://fshd.link/video/bounce' } };
    if (url.pathname === '/video/bounce') return { status: 200, body: videoRedirectBounceHtml };
    if (url.hostname === '32891098.xyz' && url.pathname.startsWith('/bounce/')) {
      // Simula o bounce perdendo a query ao chegar ao player final.
      return { status: 200, body: fireplayerPackedHtml, url: 'https://32891098.xyz/player/final' };
    }
    if (url.pathname.endsWith('/master.txt')) return { status: 200, body: masterVariantsTxt };
    throw new Error(`URL inesperada no mock: ${url.href}`);
  });

  const streams = await runtime.exports.getStreams('1396', 'tv', 1, 1);
  assert.equal(streams.length, 2);
  for (const stream of streams) {
    assert.equal(stream.headers.Referer, 'https://32891098.xyz/');
    assert.equal(stream.subtitles.length, 1);
    assert.equal(stream.subtitles[0].url, 'https://fshd.link/content/subs/950387.srt');
    assert.equal(stream.subtitles[0].language, 'Português (PT-BR)');
  }
  assert.deepEqual(runtime.errors, []);
});

test('série sem nomes de servidor consulta todas as opções de áudio', async () => {
  const runtime = makeRuntime((url) => {
    if (url.pathname === '/serie/1396/1/1') return { status: 200, body: tvHtml };
    if (url.pathname === '/api/options') return { status: 200, body: optionsDubLegJson };
    return successfulRoute(url);
  });

  const streams = await runtime.exports.getStreams('1396', 'tv', 1, 1);
  assert.deepEqual(playersCalls(runtime.calls), [162759, 162760]);
  assert.equal(streams.length, 4);
  assert.deepEqual(runtime.warnings, []);
});

test('qualidades de série acima de 720p são preservadas na ordem decrescente', async () => {
  const runtime = makeRuntime((url) => {
    if (url.pathname === '/serie/1396/1/1') return { status: 200, body: tvHtml };
    if (url.pathname === '/api/options') return { status: 200, body: { options: [{ ID: 1, type: 1 }] } };
    if (url.pathname === '/api/players') return { status: 200, body: playersFireplayerJson };
    if (url.pathname === '/video/cGF5bG9hZDEyMw==') return { status: 200, body: videoRedirectHtml };
    if (url.pathname === '/player/index.php') return { status: 200, body: fireplayerPackedHtml };
    if (url.pathname.endsWith('/master.txt')) return { status: 200, body: master1080Txt };
    throw new Error(`URL inesperada no mock: ${url.href}`);
  });

  const streams = await runtime.exports.getStreams('1396', 'tv', 1, 1);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '900p']);
  assert.deepEqual(runtime.errors, []);
});

test('títulos de filme e de série seguem o formato novo, sem ano', async () => {
  // O template Prism exibe o título; o Google Drive não o inclui por desenho.
  const movieRuntime = makeRuntime((url) => successfulRoute(url), undefined, codes.prism);
  const movieStreams = await movieRuntime.exports.getStreams('693134', 'movie');
  assert.ok(movieStreams.length > 0);
  assert.ok(movieStreams[0].title.includes('Duna: Parte Dois'));
  assert.ok(!movieStreams[0].title.includes('(2024)'));
  assert.ok(!movieStreams[0].title.includes('FSHD —'));

  const tvRuntime = makeRuntime((url) => {
    if (url.pathname === '/serie/1396/1/1') return { status: 200, body: tvHtml };
    if (url.pathname === '/api/options') return { status: 200, body: { options: [{ ID: 1, type: 1 }] } };
    return successfulRoute(url);
  }, undefined, codes.prism);
  const tvStreams = await tvRuntime.exports.getStreams('1396', 'tv', 1, 1);
  assert.ok(tvStreams.length > 0);
  assert.ok(tvStreams[0].title.includes('Breaking Bad'));
  assert.ok(!tvStreams[0].title.includes('(2008)'));
  assert.ok(!tvStreams[0].title.includes('FSHD —'));
});

test('manifest do fshd anuncia só séries', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'fshd');
  assert.ok(entry);
  assert.deepEqual(entry.supportedTypes, ['tv']);
  assert.equal(entry.version, '1.2.0');
  assert.match(entry.description, /séries/i);
});
