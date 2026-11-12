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
let hostsCode;
let extractorCode;

test.before(async () => {
  const outDir = createTempDir('pobreflixtv-test-');
  try {
    const gdriveDir = path.join(outDir, 'gdrive');
    const prismDir = path.join(outDir, 'prism');
    fs.mkdirSync(gdriveDir);
    fs.mkdirSync(prismDir);
    codes.gdrive = fs.readFileSync(await buildProvider('pobreflixtv', { outDir: gdriveDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('pobreflixtv', { outDir: prismDir, formatter: 'prism' }), 'utf8');
    code = codes.gdrive;

    const esbuild = require('esbuild');
    const hostsBuild = await esbuild.build({
      entryPoints: ['src/pobreflixtv/hosts.js'],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      external: ['cheerio-without-node-native'],
    });
    hostsCode = hostsBuild.outputFiles[0].text;
    const extractorBuild = await esbuild.build({
      entryPoints: ['src/pobreflixtv/extractor.js'],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      external: ['cheerio-without-node-native'],
    });
    extractorCode = extractorBuild.outputFiles[0].text;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

/**
 * URLSearchParams como o dos apps (JsBindings.kt do NuvioMobile e PluginRuntime.kt do NuvioTV): sem
 * Symbol.iterator, com entries()/keys()/values() devolvendo arrays e chaves sem repetição.
 */
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

function runtime(route = () => { throw new Error('fetch inesperado'); }, key = 'chave-ficticia', bundle = code, overrides = {}) {
  const calls = [];
  const logs = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    TMDB_API_KEY: key,
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    console: {
      error: (message) => logs.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      log: (message) => logs.push(String(message)),
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
    logs,
    warnings,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures/pobreflixtv', name), 'utf8');

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

function fullRoute(mediaType = 'movie') {
  return (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (mediaType === 'tv') {
        return { body: mockTmdb({ title: 'Breaking Bad', originalTitle: 'Breaking Bad', year: 2008 }) };
      }
      return { body: mockTmdb({ title: 'Duna', originalTitle: 'Dune', year: 2021 }) };
    }
    // Search
    if (url.searchParams.get('do') === 'buscarContent') {
      if (mediaType === 'tv') {
        return { body: { html: '<a href="https://www.pobreflixtv.golf/series/online/breaking-bad-dublado-3424/" class="block" title="Assistir Breaking Bad"><div class="blocktwo"><div class="top"><div>HD</div></div><div class="info"><h3>Breaking Bad</h3><p>2008</p></div></div></a>' } };
      }
      return { body: JSON.parse(fixture('search.json')) };
    }
    // Content page
    if (url.pathname.includes('/filmes/online/duna-dublado-2021')) {
      return fixture('movie_2021.html');
    }
    if (url.pathname.includes('/series/online/breaking-bad-dublado-3424')) {
      return fixture('series.html');
    }
    // Episodes list
    if (url.searchParams.get('do') === 'episodesList') {
      const audio = url.searchParams.get('audio');
      if (audio === 'Legendado') return { body: JSON.parse(fixture('episodes_leg.json')) };
      return { body: JSON.parse(fixture('episodes_dub.json')) };
    }
    // Episode page
    if (url.pathname.includes('/episodios/online/breaking-bad-2x3-dublado-3434')) {
      return fixture('episode_t2e3.html');
    }
    // Player data
    if (url.searchParams.get('do') === 'playerData') {
      return { body: JSON.parse(fixture('player_data.json')) };
    }
    // MixDrop embed
    if (url.hostname.includes('mixdrop')) {
      return { body: fixture('mixdrop_embed.html'), url: 'https://mxdrop.click/e/md_dub_123' };
    }
    // Streamtape embed
    if (url.hostname.includes('streamtape')) {
      return fixture('streamtape_embed.html');
    }

    throw new Error(`Requisição inesperada: ${url}`);
  };
}

// 1.1 Estrutura, CommonJS sem rede, coordenadas e TMDB key
test('1.1 carregamento CommonJS sem rede, coordenadas inválidas e TMDB key ausente', async () => {
  const app = runtime();
  assert.equal(typeof app.context.module.exports.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);

  // tv sem coordenadas inteiras
  for (const [season, episode] of [[null, 1], [0, 1], [1, -1], ['2', 3], [2, 1.5]]) {
    const res = await app.getStreams('100', 'tv', season, episode);
    assert.deepEqual(res, []);
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.logs.length, 5);
  assert.ok(app.logs.every((l) => l.includes('[Pobreflix HD] Falha:')));

  // tmdbId inválido
  for (const id of [null, '', 'abc', '0', '-5']) {
    const res = await app.getStreams(id, 'movie', null, null);
    assert.deepEqual(res, []);
  }
  assert.equal(app.calls.length, 0);

  // mediaType inválido
  const resInvalidType = await app.getStreams('100', 'anime', null, null);
  assert.deepEqual(resInvalidType, []);
  assert.equal(app.calls.length, 0);

  // TMDB_API_KEY ausente
  const appNoKey = runtime(undefined, '');
  const resNoKey = await appNoKey.getStreams('100', 'movie', null, null);
  assert.deepEqual(resNoKey, []);
  assert.equal(appNoKey.calls.length, 0);
  assert.match(appNoKey.logs[0], /TMDB_API_KEY indisponível/);
});

// 1.2 Fallback de domínio no extractor
test('1.2 principal com erro de conexão usa primeiro alias válido', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname === 'www.pobreflixtv.golf') {
      throw new Error('Falha de conexão com www.pobreflixtv.golf');
    }
    // Primeiro alias responde
    if (url.hostname === 'www.pobreflixtv.sarl') {
      const golfUrl = new URL(url.href.replace('www.pobreflixtv.sarl', 'www.pobreflixtv.golf'));
      const res = route(golfUrl, init);
      if (typeof res === 'string') return res.replaceAll('www.pobreflixtv.golf', 'www.pobreflixtv.sarl');
      if (res?.body?.html) return { body: { html: res.body.html.replaceAll('www.pobreflixtv.golf', 'www.pobreflixtv.sarl') } };
      return res;
    }
    return route(url, init);
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0);
  assert.ok(app.calls.some((c) => c.url.includes('www.pobreflixtv.golf')));
  assert.ok(app.calls.some((c) => c.url.includes('www.pobreflixtv.sarl')));
  assert.ok(app.logs.some((l) => l.includes('Sucesso no alias https://www.pobreflixtv.sarl')));
});

test('1.2 alias com redirect JSON para lista de domínios segue para o canônico', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname === 'www.pobreflixtv.sarl') {
      const dest = url.href.replace('www.pobreflixtv.sarl', 'www.pobreflixtv.golf');
      return { body: { redirect: dest, message: '' } };
    }
    return route(url, init);
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0);
});

test('1.2 alias com redirect JSON para fora da lista falha a tentativa e segue ao próximo', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname === 'www.pobreflixtv.golf') {
      return { body: { redirect: 'https://site-malicioso.com/lander', message: '' } };
    }
    if (url.hostname === 'www.pobreflixtv.sarl') {
      const golfUrl = new URL(url.href.replace('www.pobreflixtv.sarl', 'www.pobreflixtv.golf'));
      const res = route(golfUrl, init);
      if (typeof res === 'string') return res.replaceAll('www.pobreflixtv.golf', 'www.pobreflixtv.sarl');
      if (res?.body?.html) return { body: { html: res.body.html.replaceAll('www.pobreflixtv.golf', 'www.pobreflixtv.sarl') } };
      return res;
    }
    return route(url, init);
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0);
  assert.ok(app.logs.some((l) => l.includes('Sucesso no alias https://www.pobreflixtv.sarl')));
});

test('1.2 todos os domínios falham: loga uma linha por domínio e retorna []', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return { body: mockTmdb() };
    }
    throw new Error('Rede inacessível');
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.deepEqual(streams, []);
  // 15 domínios tentados
  assert.equal(app.logs.length, 1, 'uma única captura na fronteira com o app');
  const domainLogs = app.logs[0].split('\n').filter((l) => l.startsWith('[Pobreflix HD] Domínio https://www.pobreflixtv.'));
  assert.equal(domainLogs.length, 15);
  for (const log of domainLogs) {
    assert.ok(!log.includes('chave-ficticia'));
  }
});

test('1.2 título ausente em resposta válida consulta apenas um domínio e não faz fallback', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return { body: mockTmdb() };
    }
    if (url.searchParams.get('do') === 'buscarContent') {
      return { body: { html: '' } };
    }
    throw new Error('Inesperado');
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(app.logs.length, 0);
  const siteCalls = app.calls.filter((c) => !c.url.includes('api.themoviedb.org'));
  assert.ok(siteCalls.every((c) => c.url.includes('www.pobreflixtv.golf')));
});

// 2.1 Busca, identidade, homônimos, ambiguidade
test('2.1 homônimos: busca traz 1984 e 2021; aceita somente 2021', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: mockTmdb({ title: 'Duna', year: 2021 }) };
    if (url.searchParams.get('do') === 'buscarContent') return { body: JSON.parse(fixture('search_homonyms.json')) };
    if (url.pathname.includes('1984')) return fixture('movie_1984.html');
    if (url.pathname.includes('2021')) return fixture('movie_2021.html');
    if (url.searchParams.get('do') === 'playerData') return { body: JSON.parse(fixture('player_data.json')) };
    if (url.hostname.includes('mixdrop')) return { body: fixture('mixdrop_embed.html'), url: 'https://mxdrop.click/e/md_dub_123' };
    if (url.hostname.includes('streamtape')) return fixture('streamtape_embed.html');
    throw new Error(`Inesperado: ${url}`);
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0);
  // Não deve chamar playerData com ID 1984
  assert.ok(!app.calls.some((c) => c.url.includes('id=1984')));
  assert.ok(app.calls.some((c) => c.url.includes('id=2021')));
});

test('2.1 título em português diferente do original tenta termos alternativos', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return {
        body: {
          title: 'Um Sonho de Liberdade',
          original_title: 'The Shawshank Redemption',
          release_date: '1994-09-23',
          external_ids: { imdb_id: 'tt0111161' },
          alternative_titles: { titles: [{ title: 'Rita Hayworth' }], results: [] },
        },
      };
    }
    if (url.searchParams.get('do') === 'buscarContent') {
      const q = url.searchParams.get('q');
      if (q === 'Um Sonho de Liberdade') return { body: { html: '' } };
      if (q === 'The Shawshank Redemption') {
        return {
          body: {
            html: '<a href="https://www.pobreflixtv.golf/filmes/online/shawshank-278/" class="block" title="Assistir The Shawshank Redemption"><div class="blocktwo"><div class="top"><div>HD</div></div><div class="info"><h3>The Shawshank Redemption</h3><p>1994</p></div></div></a>',
          },
        };
      }
    }
    if (url.pathname.includes('shawshank-278')) {
      return '<html><div id="view" data-video-id="278" data-tmdb-id="278"></div></html>';
    }
    if (url.searchParams.get('do') === 'playerData') return { body: JSON.parse(fixture('player_data.json')) };
    if (url.hostname.includes('mixdrop')) return { body: fixture('mixdrop_embed.html'), url: 'https://mxdrop.click/e/1' };
    if (url.hostname.includes('streamtape')) return fixture('streamtape_embed.html');
    throw new Error(`Inesperado: ${url}`);
  });

  const streams = await app.getStreams('278', 'movie', null, null);
  assert.ok(streams.length > 0);
  const searchQueries = app.calls.filter((c) => c.url.includes('buscarContent')).map((c) => new URL(c.url).searchParams.get('q'));
  assert.deepEqual(searchQueries, ['Um Sonho de Liberdade', 'The Shawshank Redemption']);
});

test('2.1 ambiguidade: dois candidatos confirmam mesmo TMDB retorna [] sem fallback', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: mockTmdb() };
    if (url.searchParams.get('do') === 'buscarContent') {
      return {
        body: {
          html: '<a href="https://www.pobreflixtv.golf/filmes/online/duna-dub-1/" class="block"><div><div class="top"><div>HD</div></div><div class="info"><h3>Duna</h3><p>2021</p></div></div></a><a href="https://www.pobreflixtv.golf/filmes/online/duna-dub-2/" class="block"><div><div class="top"><div>HD</div></div><div class="info"><h3>Duna</h3><p>2021</p></div></div></a>',
        },
      };
    }
    if (url.pathname.includes('duna-dub-1') || url.pathname.includes('duna-dub-2')) {
      return '<html><div id="view" data-video-id="100" data-tmdb-id="438631"></div></html>';
    }
    throw new Error(`Inesperado: ${url}`);
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.deepEqual(app.logs, ['[Pobreflix HD] Mais de uma página confirma o TMDB 438631 em https://www.pobreflixtv.golf']);
  // Não fez fallback para outros domínios
  const siteCalls = app.calls.filter((c) => !c.url.includes('api.themoviedb.org'));
  assert.ok(siteCalls.every((c) => c.url.includes('www.pobreflixtv.golf')));
});

test('2.1 HTML de busca inesperado (bloqueio ou layout desconhecido) aciona fallback', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname === 'www.pobreflixtv.golf' && url.searchParams.get('do') === 'buscarContent') {
      return { body: { html: '<h1>Just a moment...</h1>' } };
    }
    if (url.hostname === 'www.pobreflixtv.sarl') {
      const golfUrl = new URL(url.href.replace('www.pobreflixtv.sarl', 'www.pobreflixtv.golf'));
      return route(golfUrl, init);
    }
    return route(url, init);
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0);
  assert.ok(app.logs.some((l) => l.includes('Sucesso no alias https://www.pobreflixtv.sarl')));
});

// 2.2 Seleção exata de episódio
test('2.2 série resolve T2 E3 e ignora T1 E3', async () => {
  const app = runtime(fullRoute('tv'));
  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.ok(streams.length > 0);
  assert.ok(app.calls.some((c) => c.url.includes('breaking-bad-2x3-dublado-3434')));
  assert.ok(!app.calls.some((c) => c.url.includes('1x3')));
});

test('2.2 episódio presente apenas na listagem legendada é resolvido', async () => {
  const route = fullRoute('tv');
  const app = runtime((url, init) => {
    if (url.searchParams.get('do') === 'episodesList') {
      const audio = url.searchParams.get('audio');
      if (audio === 'Dublado') return { body: { canEdit: '', episodes: [] } };
      return { body: JSON.parse(fixture('episodes_leg.json')) };
    }
    if (url.pathname.includes('breaking-bad-2x3-legendado-72780')) {
      return '<html><div id="view" class="eps" data-video-id="72780" data-tmdb-id="1396" data-temp="2" data-ep="3"></div></html>';
    }
    return route(url, init);
  });

  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.ok(streams.length > 0);
  assert.ok(app.calls.some((c) => c.url.includes('audio=Legendado')));
});

test('2.2 episódio ausente nas duas listagens retorna [] sem erro', async () => {
  const route = fullRoute('tv');
  const app = runtime((url, init) => {
    if (url.searchParams.get('do') === 'episodesList') {
      return { body: { canEdit: '', episodes: [] } };
    }
    return route(url, init);
  });

  const streams = await app.getStreams('1396', 'tv', 2, 99);
  assert.deepEqual(streams, []);
  assert.equal(app.logs.length, 0);
});

test('2.2 página do episódio com temporada divergente gera erro de estrutura', async () => {
  const route = fullRoute('tv');
  const app = runtime((url, init) => {
    if (url.pathname.includes('breaking-bad-2x3-dublado-3434')) {
      return '<html><div id="view" class="eps" data-video-id="3434" data-tmdb-id="1396" data-temp="1" data-ep="3"></div></html>';
    }
    return route(url, init);
  });

  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(streams, []);
  assert.ok(app.logs.some((l) => l.includes('temporada divergente')));
});

// 3.1 playerData e leitura de opções
test('3.1 playerData com entidades &amp;, listas vazias e conteúdo bloqueado', async () => {
  const route = fullRoute('movie');
  // Lista legendada vazia
  const appNoLeg = runtime((url, init) => {
    if (url.searchParams.get('do') === 'playerData') {
      return {
        body: {
          players: [{ name: 'MixDrop', url: 'https://mixdrop.top/e/' }],
          servers_dub: 'mixdrop=md123',
          servers_leg: '',
        },
      };
    }
    return route(url, init);
  });
  const streamsNoLeg = await appNoLeg.getStreams('438631', 'movie', null, null);
  assert.equal(streamsNoLeg.length, 1);
  assert.equal(streamsNoLeg[0].language, 'Dublado');

  // Conteúdo bloqueado
  const appBlocked = runtime((url, init) => {
    if (url.searchParams.get('do') === 'playerData') {
      return { status: 404, body: 'Conteúdo bloqueado' };
    }
    return route(url, init);
  });
  const streamsBlocked = await appBlocked.getStreams('438631', 'movie', null, null);
  assert.deepEqual(streamsBlocked, []);
  assert.ok(appBlocked.logs.some((l) => l.includes('Conteúdo bloqueado') || l.includes('HTTP 404')));

  // Falta de players
  const appNoPlayers = runtime((url, init) => {
    if (url.searchParams.get('do') === 'playerData') {
      return { body: {} };
    }
    return route(url, init);
  });
  const streamsNoPlayers = await appNoPlayers.getStreams('438631', 'movie', null, null);
  assert.deepEqual(streamsNoPlayers, []);
  assert.ok(appNoPlayers.logs.some((l) => l.includes('sem array players')));
});

test('3.1 playerData lê os servidores com o URLSearchParams não iterável dos apps', async () => {
  const app = runtime(fullRoute('movie'), 'chave-ficticia', code, { URLSearchParams: AppURLSearchParams });
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0, app.logs.join(' | '));
  assert.ok(!app.logs.some((l) => l.includes('not iterable')));
  assert.deepEqual([...new Set(streams.map((s) => s.language))].sort(), ['Dublado', 'Legendado']);
});

// 3.2 Extrator MixDrop
test('3.2 MixDrop desempacota PACKER sem eval, lê wurl e trata remoção', async () => {
  const { unpackPacker } = await import('../src/_blocks/fireplayer/index.mjs');
  const unpacked = unpackPacker(fixture('mixdrop_embed.html'));
  assert.ok(unpacked.includes('MDCore.wurl = "//delivery.mxcontent.net/v2/test_video.mp4?s=sig123&e=exp456"'));

  const app = runtime((url) => {
    if (url.href.includes('removed')) return '<html>File not found</html>';
    return { body: fixture('mixdrop_embed.html'), url: 'https://mxdrop.click/e/123' };
  }, undefined, hostsCode);

  const resolved = await app.context.module.exports.resolveMixDrop('https://mixdrop.top/e/123', 'https://www.pobreflixtv.golf/');
  assert.equal(resolved.url, 'https://delivery.mxcontent.net/v2/test_video.mp4?s=sig123&e=exp456');
  assert.equal(resolved.headers.Referer, 'https://mxdrop.click/e/123');
  assert.ok(resolved.headers['User-Agent']);

  await assert.rejects(app.context.module.exports.resolveMixDrop('https://mixdrop.top/e/removed'), /removido/);
});

// 3.3 Extrator Streamtape
test('3.3 Streamtape analisa texto de robotlink, ignora iscas e trata remoção', async () => {
  const app = runtime((url) => {
    if (url.href.includes('removed')) return '<html>Video not found</html>';
    return fixture('streamtape_embed.html');
  }, undefined, hostsCode);

  const resolved = await app.context.module.exports.resolveStreamtape('https://streamtape.com/e/123');
  assert.equal(resolved.url, 'https://streamtape.com/get_video?id=test_tape&expires=123&ip=127.0.0.1&token=ken&stream=1');
  assert.ok(!resolved.url.includes('bait'));

  await assert.rejects(app.context.module.exports.resolveStreamtape('https://streamtape.com/e/removed'), /removido/);
});

// 3.6 Extrator DoodStream
test('3.6 DoodStream resolve pass_md5 + token + expiry, rejeita RELOAD e integra em getStreams', async () => {
  const app = runtime((url, init) => {
    if (url.href.includes('removed')) return '<html>File you are looking for is not found</html>';
    if (url.href.includes('no-pass')) return '<html>Sem pass</html>';
    if (url.href.includes('reload-embed')) {
      return '<html><script>$.get(\'/pass_md5/reload/tok_reload\', function(){});</script></html>';
    }
    if (url.pathname.startsWith('/pass_md5/reload/')) return 'RELOAD';
    if (url.pathname.startsWith('/pass_md5/')) {
      assert.equal(init?.headers?.Referer, 'https://playmogo.com/e/dood123');
      return 'https://cdn.example/u5kj/video~';
    }
    return { body: fixture('doodstream_embed.html'), url: 'https://playmogo.com/e/dood123' };
  }, undefined, hostsCode);

  const resolved = await app.context.module.exports.resolveDoodStream(
    'https://dood.example/e/dood123',
    'https://www.pobreflixtv.golf/filmes/online/duna-2021/'
  );
  assert.match(resolved.url, /^https:\/\/cdn\.example\/u5kj\/video~[A-Za-z0-9]{10}\?token=dood_tok_789&expiry=\d+$/);
  assert.equal(resolved.headers.Referer, 'https://playmogo.com/');
  assert.ok(resolved.headers['User-Agent']);

  await assert.rejects(app.context.module.exports.resolveDoodStream('https://playmogo.com/e/removed'), /removido/);
  await assert.rejects(app.context.module.exports.resolveDoodStream('https://playmogo.com/e/no-pass'), /pass_md5 não encontrado/);
  await assert.rejects(app.context.module.exports.resolveDoodStream('https://playmogo.com/e/reload-embed'), /RELOAD/);

  // Integração via getStreams quando playerData anuncia DoodStream
  const route = fullRoute('movie');
  const fullApp = runtime((url, init) => {
    if (url.searchParams.get('do') === 'playerData') {
      return {
        body: {
          players: [{ label: 'DoodStream', name: 'DoodStream', url: 'https://playmogo.com/e/' }],
          servers_dub: 'doodstream=dood123',
          servers_leg: '',
        },
      };
    }
    if (url.hostname === 'playmogo.com' && url.pathname === '/e/dood123') {
      return { body: fixture('doodstream_embed.html'), url: 'https://playmogo.com/e/dood123' };
    }
    if (url.hostname === 'playmogo.com' && url.pathname.startsWith('/pass_md5/')) {
      return 'https://cdn.example/u5kj/video~';
    }
    return route(url, init);
  });
  const streams = await fullApp.getStreams('438631', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'DoodStream');
  assert.equal(streams[0].language, 'Dublado');
  assert.match(streams[0].url, /^https:\/\/cdn\.example\/u5kj\/video~[A-Za-z0-9]{10}\?token=dood_tok_789&expiry=\d+$/);
  assert.equal(streams[0].headers.Referer, 'https://playmogo.com/');
});

test('3.2 MixDrop rejeita script ausente, ilegível ou sem wurl', async () => {
  for (const [html, expected] of [
    ['<html>Sem script</html>', /script empacotado não encontrado/],
    ["eval(function(p,a,c,k,e,d){}('0',36,1,'poster'.split('|'),0,{}))", /wurl não encontrado/],
    ["eval(function(p,a,c,k,e,d){}(invalid))", /string|empacotador/i],
  ]) {
    const app = runtime(() => html, undefined, hostsCode);
    await assert.rejects(app.context.module.exports.resolveMixDrop('https://mixdrop.top/e/test'), expected);
  }
});

test('3.4 descoberta local reconhece resolução na URL sem requisições extras', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname.includes('mixdrop')) {
      return fixture('mixdrop_embed.html').replace('test_video.mp4', 'test_video.1080p.mp4');
    }
    return route(url, init);
  });
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.deepEqual(streams.map((s) => s.quality), ['1080p', '1080p', 'Desconhecida', 'Desconhecida']);
  assert.ok(app.calls.every((c) => !c.url.includes('delivery.mxcontent.net') && !c.url.includes('/get_video')));
});

// 3.4 Contrato, formatador (gdrive e prism), qualidade e sem dual inventado
test('3.4 selo HD preserva qualidade Desconhecida sem inferir 720p', async () => {
  const app = runtime(fullRoute('movie'));
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length >= 2);
  for (const s of streams) {
    assert.equal(s.quality, 'Desconhecida');
    assert.equal(s.type, 'mp4');
    assert.ok(s.url.startsWith('https://'));
    assert.ok(!s.url.includes('/e/')); // Não é página de player
    assert.ok(s.language === 'Dublado' || s.language === 'Legendado');
    assert.notEqual(s.language, 'Dual Áudio'); // Sem Dual Áudio inventado
    assert.ok(s.name.includes('Pobreflix HD Desconhecida'));
    assert.ok(s.name.includes('🌐 HTTP'));
  }
});

test('3.4 variante Prism inclui emoji e coordenadas de série', async () => {
  const appPrism = runtime(fullRoute('tv'), 'chave-ficticia', codes.prism);
  const streams = await appPrism.getStreams('1396', 'tv', 2, 3);
  assert.ok(streams.length > 0);
  assert.ok(streams[0].name.includes('❓ Desconhecida'));
  assert.ok(streams[0].name.includes('T02E03'));
  assert.ok(streams[0].name.includes('🌐 HTTP'));
});

// 3.5 Falha isolada de uma opção preserva a outra
test('3.5 falha de Streamtape preserva MixDrop e registra aviso da opção', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname.includes('streamtape')) {
      return { status: 404, body: 'File not found' };
    }
    return route(url, init);
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.equal(streams.length, 2); // 2 streams do MixDrop (Dub e Leg)
  assert.ok(streams.every((s) => s.provider === 'MixDrop'));
  assert.equal(app.logs.length, 0, 'sucesso parcial não registra console.error');
  assert.equal(app.warnings.length, 2);
  assert.ok(app.warnings.every((l) => l.startsWith('[Pobreflix HD] Opção Streamtape') && l.includes('em https://www.pobreflixtv.golf descartada:')));
});

test('3.5 todas as opções falham: retorna [] e registra erros', async () => {
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname.includes('streamtape') || url.hostname.includes('mixdrop')) {
      return { status: 404, body: 'File not found' };
    }
    return route(url, init);
  });

  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(app.logs.length, 1, 'o erro agregado chega à captura única');
  assert.match(app.logs[0], /Todas as opções falharam:/);
  assert.ok(app.logs.some((l) => l.includes('Host Streamtape')));
  assert.ok(app.logs.some((l) => l.includes('Host MixDrop')));
  assert.equal(app.warnings.length, 4);
  const siteCalls = app.calls.filter((c) => c.url.includes('pobreflixtv.'));
  assert.ok(siteCalls.every((c) => new URL(c.url).hostname === 'www.pobreflixtv.golf'), 'falha de host não aciona fallback de domínio');
});

test('3.5 logs não contêm chave TMDB, tokens nem assinaturas', async () => {
  const secret = 'segredo-secreto-123';
  const route = fullRoute('movie');
  const app = runtime((url, init) => {
    if (url.hostname.includes('streamtape') || url.hostname.includes('mixdrop')) {
      throw new Error(`Falha com chave ${secret}, token=token_secreto&sig=assinatura_secreta em https://cdn.example/video.mp4?s=url_assinada`);
    }
    return route(url, init);
  }, secret);

  await app.getStreams('438631', 'movie', null, null);
  assert.equal(app.logs.length, 1);
  assert.equal(app.warnings.length, 4);
  for (const log of [...app.logs, ...app.warnings]) {
    assert.ok(!log.includes(secret));
    assert.doesNotMatch(log, /token_secreto|assinatura_secreta|url_assinada/);
  }
});

test('3.5 extractor lança erro agregado e não confunde triagem com falha', async () => {
  const route = fullRoute('movie');
  const failed = runtime((url, init) => {
    if (url.hostname.includes('mixdrop') || url.hostname.includes('streamtape')) {
      return { status: 404, body: 'File not found' };
    }
    return route(url, init);
  }, undefined, extractorCode);
  await assert.rejects(
    failed.context.module.exports.extractStreams({ tmdbId: '438631', mediaType: 'movie', season: null, episode: null }, 'Pobreflix HD'),
    /Todas as opções falharam:.*MixDrop.*Streamtape/
  );
  assert.equal(failed.logs.length, 0, 'extractor lança sem console.error');

  const ignored = runtime((url, init) => {
    if (url.searchParams.get('do') === 'playerData') {
      return { body: { players: [{ label: 'Byse', url: 'https://byse.example/e/' }], servers_dub: 'byse=test', servers_leg: '' } };
    }
    return route(url, init);
  });
  assert.deepEqual(await ignored.getStreams('438631', 'movie', null, null), []);
  assert.equal(ignored.logs.length, 0);
  assert.equal(ignored.warnings.length, 0);
});

test('coleções sem índices numéricos percorrem todos os cartões do app via eq(i)', async () => {
  const $ = load(JSON.parse(fixture('search_homonyms.json')).html);
  const cards = $('a.block');
  assert.equal(cards.length, 2);
  assert.equal(cards[0], undefined, 'o runtime do app não expõe elementos como array');
  const app = runtime(fullRoute('movie'));
  const streams = await app.getStreams('438631', 'movie', null, null);
  assert.ok(streams.length > 0);
});

