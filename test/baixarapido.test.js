const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const HEX_720 = '51ca3ba90f04bf50394e9eb7e448ceea214d5ad6';
const HEX_1080 = '8cc4fdc2c777d1464d9043397309f45859b9297b';
const HEX_4K = '96fdc513d5551feb50b955e542ad3a9acd37f361';
const BASE32_RAW = '4uer23njhshkmv4blc3fvxpeaovtumwu';
const BASE32_HEX = 'e5091d6da93c8ea6578158b65adde403ab3a32d4';
const PACK = 'f32eb77f755f0d349271a74e930b1cc4bb37bb49';
const FILE_BYTES = 1610612736;
const KEY = 'chave-super-secreta';

const ALL_CATALOGS = [
  'baixarapido',
  'limpotorrents',
  'brutotorrent',
  'temtorrents',
  'gratistorrent',
  'hdrtorrents',
  'salvetorrent',
  'parabaixar',
  'semtorrent',
  'redestorrents',
  'apachetorrents',
];

// Variantes do build: os testes rodam no Google Drive, com o template fixado; Prism e o
// arquivo base (sorteio) são conferidos nos testes de formatação.
const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('baixarapido-test-');
  try {
    for (const formatter of [null, 'gdrive', 'prism']) {
      codes[formatter || 'base'] = fs.readFileSync(await buildProvider('baixarapido', { outDir, formatter }), 'utf8');
    }
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/baixarapido', name), 'utf8');
}

function hdrFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/hdrtorrents', name), 'utf8');
}

function gratisFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/gratistorrent', name), 'utf8');
}

function encode(value) {
  if (Number.isInteger(value)) return Buffer.from(`i${value}e`);
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes]);
  }
  if (typeof value === 'string') return encode(Buffer.from(value));
  if (Array.isArray(value)) return Buffer.concat([Buffer.from('l'), ...value.map(encode), Buffer.from('e')]);
  const keys = Object.keys(value).sort();
  return Buffer.concat([Buffer.from('d'), ...keys.flatMap((key) => [encode(key), encode(value[key])]), Buffer.from('e')]);
}

function torrent(paths, lengths) {
  return encode({
    announce: 'udp://tracker.example:80/announce',
    info: {
      name: 'pacote',
      'piece length': 262144,
      pieces: 'x',
      files: paths.map((file, index) => ({ length: lengths[index], path: [file] })),
    },
  });
}

const PACK_TORRENT = torrent(
  Array.from({ length: 13 }, (_, index) => (index === 12 ? '3 - Bit by a Dead Bee.mp4' : `other-${index}.mp4`)),
  Array.from({ length: 13 }, (_, index) => (index === 12 ? FILE_BYTES : 1000)),
);

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function moviePayload(extra = {}) {
  return {
    title: extra.title || 'Matrix',
    original_title: extra.original || extra.title || 'The Matrix',
    release_date: extra.year === null ? '' : `${extra.year || 1999}-03-31`,
    external_ids: { imdb_id: extra.imdb === undefined ? 'tt0133093' : extra.imdb },
    alternative_titles: { titles: extra.alts || [] },
    original_language: 'en',
    genres: [],
    origin_country: ['US'],
  };
}

function seriesPayload(extra = {}) {
  return {
    name: extra.name || 'Breaking Bad',
    original_name: extra.original || extra.name || 'Breaking Bad',
    first_air_date: `${extra.year || 2008}-01-20`,
    external_ids: { imdb_id: extra.imdb === undefined ? 'tt0903747' : extra.imdb },
    alternative_titles: { results: extra.alts || [] },
    original_language: 'en',
    genres: [],
    origin_country: ['US'],
  };
}

function emptySearchForHost(hostname) {
  const host = hostname.replace(/^www\./, '');
  switch (host) {
    case 'baixarapido.com':
      return fixture('baixarapido-empty.html');
    case 'limpotorrents.com':
    case 'parabaixar.com':
      return '<main><h1>Busca</h1><p>Nenhum resultado encontrado.</p></main>';
    case 'salvetorrent.com':
      return '<div id="capas_pequenas"></div>';
    case 'gratistorrent.com':
      return gratisFixture('search-empty.html');
    case 'redestorrents.com':
      return '<main><h1>Encontrados para: X</h1><p>Nada foi localizado com os critérios informados.</p></main>';
    case 'hdrtorrents.net':
      return hdrFixture('search-empty.html');
    case 'brutotorrent.com':
      return '<main><h1>Procurando por: X</h1><div class="alert">Nada foi localizado com os filtros que você aplicou.</div></main>';
    case 'temtorrents.com':
      return '<main><h1>Resultados de Busca para: X</h1></main>';
    case 'semtorrent.com':
      return '<main><h1>Pesquisa: X</h1></main>';
    case 'apachetorrents.com':
      return '<main><h1 class="page-title">Torrents Encontrados para "X" – Dublado, Legendado e Dual Áudio</h1></main>';
    default:
      throw new Error(`host sem vazio padrão: ${hostname}`);
  }
}

function runtime(route, source = code) {
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const context = {
    module: { exports: {} },
    TMDB_API_KEY: KEY,
    URL: AppURL,
    URLSearchParams,
    Uint8Array,
    ArrayBuffer,
    DataView,
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
      const status = result.status || 200;
      const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
      const response = {
        ok: status >= 200 && status < 300,
        status,
        url: result.responseUrl || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
      if (result.bytes) {
        response.arrayBuffer = async () => {
          const bytes = result.bytes;
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        };
      }
      return response;
    },
  };
  vm.runInNewContext(source, context, { filename: 'baixarapido.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

test('carrega CommonJS sem rede e rejeita entrada inválida antes do fetch', async () => {
  const app = runtime(() => { throw new Error('fetch inesperado'); });
  assert.equal(typeof app.getStreams, 'function');
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(code, /Promise\.allSettled|AbortController|searchParams\.set|searchParams\.append|setTimeout/);
  assert.doesNotMatch(code, /redetorrent\.xyz|cdn\.redestorrents\.com|apachetorrent\.com|hdrtorrent\.site/);
  for (const args of [
    ['tt1', 'movie', null, null],
    ['100', 'series', null, null],
    ['100', 'tv', null, 1],
    ['100', 'tv', 0, 1],
    ['100', 'tv', 1, -1],
    ['100', 'tv', '2', 3],
    ['100', 'tv', 2, 1.5],
  ]) {
    assert.deepEqual(await app.getStreams(...args), []);
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.logs.error.length, 7);
  assert.ok(app.logs.error.every((message) => message.startsWith('[Baixa Rápido] Entrada:')));
});

test('onze catálogos em paralelo: deduplica mesmo hash na ordem da decisão 4, inclui exclusivo 4K do limpotorrents e descarta coleções e archive.org', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    const host = url.hostname;
    if (host === 'baixarapido.com') {
      if (url.pathname === '/pesquisa/matrix/') return { body: fixture('baixarapido-search-matrix.html') };
      if (url.pathname === '/baixar/matrix/') return { body: fixture('baixarapido-movie-matrix.html') };
      if (url.pathname === '/baixar/arquivo-matrix-tri-audio/') {
        return {
          body: '<main><h1>Matrix (Tri Áudio)</h1><div id="download-zone"><a href="https://archive.org/download/m/m.mkv">MKV</a></div></main>',
        };
      }
      return { status: 404, body: '' };
    }
    if (host === 'limpotorrents.com') {
      if (url.pathname === '/index.php') return { body: fixture('limpo-search-matrix.html') };
      if (url.pathname === '/matrix-4k-torrent-filme-1999-baixar/') return { body: fixture('limpo-movie-4k.html') };
      return { status: 404, body: '' };
    }
    if (host === 'brutotorrent.com') {
      if (url.pathname === '/pesquisa/matrix/') return { body: fixture('bruto-search-matrix.html') };
      if (url.pathname === '/matrix-torrent-dublado-download/') return { body: hdrFixture('movie-matrix.html') };
      return { status: 404, body: '' };
    }
    if (host === 'temtorrents.com') {
      if (url.pathname === '/pesquisa/matrix/') return { body: fixture('tem-search-matrix.html') };
      if (url.pathname === '/matrix-baixar/') return { body: hdrFixture('movie-matrix.html') };
      return { status: 404, body: '' };
    }
    if (host === 'gratistorrent.com') {
      if (url.pathname === '/index.php') return { body: gratisFixture('search-movie.html') };
      if (url.pathname === '/matrix-download-torrent/') return { body: gratisFixture('page-movie.html') };
      if (url.pathname === '/matrix-legendado-download-torrent/') return { body: gratisFixture('page-movie-legendado.html') };
      return { status: 404, body: '' };
    }
    if (host === 'hdrtorrents.net') {
      if (url.pathname === '/pesquisa/matrix/') return { body: hdrFixture('search-matrix.html') };
      if (url.pathname === '/matrix-torrent-download/') return { body: hdrFixture('movie-matrix.html') };
      return { status: 404, body: '' };
    }
    if (host === 'salvetorrent.com') {
      if (url.pathname === '/index.php') return { body: fixture('salve-search-matrix.html') };
      if (url.pathname === '/matrix-torrent-download/') return { body: fixture('salve-movie-matrix.html') };
      return { status: 404, body: '' };
    }
    if (host === 'parabaixar.com') {
      if (url.pathname === '/index.php') return { body: fixture('parabaixar-search-matrix.html') };
      if (url.pathname === '/filme/matrix/') return { body: fixture('parabaixar-movie-matrix.html') };
      return { status: 404, body: '' };
    }
    if (host === 'semtorrent.com' || host === 'redestorrents.com' || host === 'apachetorrents.com') {
      if (url.pathname.startsWith('/pesquisa/') || url.pathname === '/index.php') {
        return { body: emptySearchForHost(host) };
      }
      return { status: 404, body: '' };
    }
    throw new Error(`requisição inesperada: ${url.href}`);
  });

  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(app.logs.error.length, 0, app.logs.error.join('\n'));
  assert.equal(app.logs.warn.length, 0, app.logs.warn.join('\n'));

  // Confirma que os 11 catálogos foram consultados
  const contactedHosts = new Set(app.calls.map((c) => new URL(c.url).hostname));
  for (const catalog of ALL_CATALOGS) {
    const expectedHost = catalog === 'hdrtorrents' ? 'hdrtorrents.net' : `${catalog}.com`;
    assert.ok(contactedHosts.has(expectedHost), `catálogo ${catalog} não consultado`);
  }

  // O hash 720p e o 1080p saem apenas uma vez, e o provider vem do baixarapido (primeiro na ordem da decisão 4)
  const matching720 = streams.filter((s) => s.infoHash === HEX_720);
  const matching1080 = streams.filter((s) => s.infoHash === HEX_1080);
  const matching4K = streams.filter((s) => s.infoHash === HEX_4K);
  assert.equal(matching720.length, 1);
  assert.equal(matching720[0].provider, 'baixarapido');
  assert.deepEqual({ name: matching720[0].name, title: matching720[0].title }, {
    name: 'Baixa Rápido 720p\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 baixarapido\n📁 Matrix (1999) 720p Dublado',
    title: ['🗣️ Dublado', '🧲 P2P 📦 796 MB 👥 ?/? 🔍 baixarapido', '📁 Matrix (1999) 720p Dublado'].join('\n'),
  });
  assert.equal(matching1080.length, 1);
  assert.equal(matching1080[0].provider, 'baixarapido');
  assert.deepEqual({ name: matching1080[0].name, title: matching1080[0].title }, {
    name: 'Baixa Rápido 1080p\n🗣️ Idioma Desconhecido\n🧲 P2P 👥 ?/? 🔍 baixarapido\n📁 Matrix (1999) 1080p Dual Audio',
    title: ['🗣️ Idioma Desconhecido', '🧲 P2P 📦 2.03 GB 👥 ?/? 🔍 baixarapido', '📁 Matrix (1999) 1080p Dual Audio'].join('\n'),
  });

  // O 4K exclusivo do limpotorrents entra com provider 'limpotorrents'
  assert.equal(matching4K.length, 1);
  assert.equal(matching4K[0].provider, 'limpotorrents');
  assert.equal(matching4K[0].quality, '4K');

  // Nenhum link archive.org ou Google Drive entra
  assert.ok(streams.every((s) => s.url.startsWith('magnet:?xt=urn:btih:')));
});

test('série nos novos catálogos (semtorrent, redestorrents e apachetorrents): mesmo pacote T2 vira um único torrent://, converte base32 e descarta El Camino por IMDb/tipo', async () => {
  const elCaminoHtml = `<main><h1 class="movie-title">Breaking Bad: El Camino (2019)</h1>
    <script type="application/ld+json">{"@type":"Movie","sameAs":"https://www.imdb.com/title/tt9243946/"}</script>
    <div class="download-row"><div class="download-name">DUBLADO 1080P</div>
    <a class="download-btn" href="magnet:?xt=urn:btih:${HEX_1080}&amp;dn=El.Camino.1080p">Baixar</a></div></main>`;

  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: seriesPayload() };
    if (url.hostname === 'itorrents.org') {
      if (url.pathname.endsWith(`${PACK.toUpperCase()}.torrent`)) return { bytes: PACK_TORRENT, body: '' };
      return { status: 404, body: '' };
    }
    const host = url.hostname;
    if (host === 'semtorrent.com') {
      if (url.pathname === '/pesquisa/breaking-bad/') return { body: fixture('sem-search-breaking.html') };
      if (url.pathname === '/serie/breaking-bad-2-temporada/') return { body: hdrFixture('series-breaking-bad.html') };
      if (url.pathname === '/filme/el-camino-um-filme-breaking-bad/') return { body: elCaminoHtml };
      return { status: 404, body: '' };
    }
    if (host === 'redestorrents.com') {
      if (url.pathname === '/index.php') return { body: fixture('redes-search-breaking.html') };
      if (url.pathname === '/breaking-bad-2-temporada-download/') return { body: hdrFixture('series-breaking-bad.html') };
      if (url.pathname === '/el-camino-breaking-bad-download/') return { body: elCaminoHtml };
      return { status: 404, body: '' };
    }
    if (host === 'apachetorrents.com') {
      if (url.pathname === '/pesquisa/breaking-bad/') return { body: fixture('apache-search-breaking.html') };
      if (url.pathname === '/breaking-bad-2-temporada-baixar-torrent/') return { body: fixture('apache-series-breaking.html') };
      return { status: 404, body: '' };
    }
    if (url.pathname.startsWith('/baixar/')) return { status: 404, body: '' };
    return { body: emptySearchForHost(host) };
  });

  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.equal(app.logs.error.length, 0, app.logs.error.join('\n'));
  // 2 streams: o episódio 3 avulso em 1080p (base32 convertido do Apache) e o pacote T2 em 720p (deduplicado entre Sem, Redes e Apache, ficando Sem Torrent)
  assert.equal(streams.length, 2);
  assert.equal(streams[0].infoHash, BASE32_HEX);
  assert.equal(streams[0].provider, 'apachetorrents');
  assert.equal(streams[0].type, 'magnet');
  assert.ok(!streams[0].url.includes(BASE32_RAW));

  assert.equal(streams[1].url, `torrent://${PACK}/12`);
  assert.equal(streams[1].infoHash, PACK);
  assert.equal(streams[1].provider, 'semtorrent');
  assert.equal(streams[1].type, 'torrent');
  assert.equal(streams[1].size, '1.50 GB');
  assert.deepEqual(streams[1].title.split('\n'), [
    '🗣️ Dublado',
    '🧲 P2P 📦 1.50 GB / 4.98 GB 👥 ?/? 🔍 semtorrent',
    '📁 Breaking.Bad.S02.720p/3 - Bit by a Dead Bee.mp4',
  ]);

  // El Camino (tt9243946) não gerou stream
  assert.ok(!streams.some((s) => s.infoHash === HEX_1080));
  assert.ok(app.logs.log.some((m) => /IMDb divergente/.test(m)));
});

test('um catálogo fora do ar registra console.warn e os outros entregam; todos falhando retorna [] com erro de cada um', async () => {
  const oneDown = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload({ original: 'Matrix' }) };
    if (url.hostname.includes('limpotorrents.com')) return new Error('ECONNREFUSED limpotorrents');
    if (url.hostname === 'baixarapido.com') {
      if (url.pathname === '/pesquisa/matrix/') return { body: fixture('baixarapido-search-matrix.html') };
      if (url.pathname === '/baixar/matrix/') return { body: fixture('baixarapido-movie-matrix.html') };
      return { status: 404, body: '' };
    }
    return { body: emptySearchForHost(url.hostname) };
  });

  const streams = await oneDown.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.equal(oneDown.logs.error.length, 0);
  assert.equal(oneDown.logs.warn.length, 1);
  assert.match(oneDown.logs.warn[0], /^\[Baixa Rápido\] Catálogo descartado: limpotorrents:/);

  const allDown = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload({ original: 'Matrix' }) };
    return { status: 503, body: 'offline' };
  });

  assert.deepEqual(await allDown.getStreams('603', 'movie', null, null), []);
  assert.equal(allDown.logs.error.length, 1);
  for (const catalog of ALL_CATALOGS) {
    assert.match(allDown.logs.error[0], new RegExp(`${catalog}:`));
  }
});

test('ausência em todos os onze catálogos (incluindo Sem e Apache sem mensagem explícita) retorna [] sem erro e sem consultar www', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return { body: moviePayload({ title: 'Viajo Porque Preciso', original: 'Viajo Porque Preciso', imdb: 'tt1526306', year: 2009 }) };
    }
    if (url.hostname.startsWith('www.')) {
      throw new Error(`www consultado sem falha no principal: ${url.href}`);
    }
    if (url.pathname.startsWith('/baixar/')) return { status: 404, body: '' };
    return { body: emptySearchForHost(url.hostname) };
  });

  const streams = await app.getStreams('87199', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(app.logs.error.length, 0);
  assert.equal(app.logs.warn.length, 0);
  assert.equal(app.calls.filter((c) => new URL(c.url).hostname.startsWith('www.')).length, 0);
});

test('domínio www é acionado quando o principal responde 503 ou redireciona a busca para a home perdendo o termo', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload({ original: 'Matrix' }) };
    // apachetorrents.com redireciona a busca para a home (como apachetorrent.com faria), acionando www.apachetorrents.com
    if (url.hostname === 'apachetorrents.com') {
      return { status: 200, responseUrl: 'https://apachetorrents.com/', body: '<html><h1>Home</h1></html>' };
    }
    if (url.hostname === 'www.apachetorrents.com') {
      if (url.pathname === '/pesquisa/matrix/') {
        return {
          body: '<main><h1 class="page-title">Torrents Encontrados para "Matrix"</h1><div class="capa-item"><h2 class="capa-titulo"><a href="https://www.apachetorrents.com/matrix-baixar-torrent/">Matrix (Filme de 1999)</a></h2></div></main>',
        };
      }
      if (url.pathname === '/matrix-baixar-torrent/') {
        return {
          body: `<main><h1>Matrix (1999)</h1><div class="download-block"><p class="download-desc">DUBLADO 720P / 796 MB<a href="magnet:?xt=urn:btih:${HEX_720}&amp;dn=Matrix.720p&amp;tr=udp%3A%2F%2Ftracker.example%3A80" class="btn-magnet">Download</a></p></div></main>`,
        };
      }
    }
    // semtorrent.com retorna 503 e www.semtorrent.com entrega busca vazia válida
    if (url.hostname === 'semtorrent.com') return { status: 503, body: 'unavailable' };
    if (url.hostname === 'www.semtorrent.com') return { body: emptySearchForHost(url.hostname) };

    if (url.pathname.startsWith('/baixar/')) return { status: 404, body: '' };
    return { body: emptySearchForHost(url.hostname) };
  });

  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(app.logs.error.length, 0, app.logs.error.join('\n'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, HEX_720);
  assert.equal(streams[0].provider, 'apachetorrents');
  assert.ok(app.calls.some((c) => c.url.startsWith('https://www.apachetorrents.com/')));
  assert.ok(app.calls.some((c) => c.url.startsWith('https://www.semtorrent.com/')));
});

test('hash base32 inválido descarta só a opção com aviso e preserva o magnet válido', async () => {
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload({ original: 'Matrix' }) };
    if (url.hostname === 'gratistorrent.com') {
      if (url.pathname === '/index.php') {
        return {
          body: '<main><h1>Resultados da Busca: Matrix</h1><div>(1 Itens)</div><a href="https://gratistorrent.com/matrix/"><article class="custom-card" data-title="Matrix" data-tipo="Filmes"><div class="badge-year">1999</div></article></a></main>',
        };
      }
      if (url.pathname === '/matrix/') {
        return {
          body: `<main><h1 class="movie-title">Matrix (1999)</h1><div class="download-section">
            <a class="btn-magnet-base" href="magnet:?xt=urn:btih:11111111111111111111111111111111">Baixar DUBLADO 1080P</a>
            <a class="btn-magnet-base" href="magnet:?xt=urn:btih:${HEX_720}&amp;dn=Matrix.720p">Baixar DUBLADO 720P / 796 MB</a>
          </div></main>`,
        };
      }
    }
    if (url.pathname.startsWith('/baixar/')) return { status: 404, body: '' };
    return { body: emptySearchForHost(url.hostname) };
  });

  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, HEX_720);
  assert.equal(streams[0].provider, 'gratistorrent');
  assert.ok(app.logs.warn.some((m) => /hash base32 inválido/.test(m)));
  assert.equal(app.logs.error.length, 0);
});


function baixaRapidoOnly(url) {
  if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
  if (url.hostname === 'baixarapido.com') {
    if (url.pathname === '/pesquisa/matrix/') return { body: fixture('baixarapido-search-matrix.html') };
    if (url.pathname === '/baixar/matrix/') return { body: fixture('baixarapido-movie-matrix.html') };
    return { status: 404, body: '' };
  }
  return { body: emptySearchForHost(url.hostname) };
}

test('formatador: a variante Prism usa o selo e o título do TMDB', async () => {
  const app = runtime(baixaRapidoOnly, codes.prism);
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(app.logs.error.length, 0, app.logs.error.join('\n'));
  assert.deepEqual(streams.map((stream) => stream.name).sort(), [
    '💿 HD 720p\n🎬 Matrix (1999)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?\n📡 baixarapido',
    '🚀 FHD 1080p\n🎬 Matrix (1999)\n🗣️ Idioma Desconhecido\n🧲 P2P 🌱 ?/?\n📡 baixarapido',
  ]);
  for (const stream of streams) {
    const lines = stream.title.split('\n');
    assert.equal(lines[0], '🎬 Matrix (1999)');
    assert.equal(lines[lines.length - 1], '🔍Baixa Rápido');
  }
});

test('formatador: o arquivo base aplica um único template sorteado a toda a resposta', async () => {
  for (let run = 0; run < 4; run += 1) {
    const app = runtime(baixaRapidoOnly, codes.base);
    const streams = await app.getStreams('603', 'movie', null, null);
    assert.equal(streams.length, 2);
    const gdrive = streams.filter((stream) => stream.name.startsWith('Baixa Rápido '));
    assert.ok(gdrive.length === 0 || gdrive.length === streams.length, `templates misturados: ${streams.map((s) => s.name).join(', ')}`);
  }
});

test('release sem qualidade no rótulo, no dn e na URL continua na lista com Desconhecida', async () => {
  const hashUnknown = 'e'.repeat(40);
  const app = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'baixarapido.com') {
      if (url.pathname === '/pesquisa/matrix/') return { body: fixture('baixarapido-search-matrix.html') };
      if (url.pathname === '/baixar/matrix/') {
        const html = fixture('baixarapido-movie-matrix.html');
        return {
          body: html.replace(
            '</div>\n</main>',
            `<div itemprop="workExample">
              <a href="magnet:?xt=urn:btih:${hashUnknown}&amp;dn=Matrix.1999.SemQualidade" title="Baixar Arquivo">
                <span>DOWNLOAD TORRENT DUBLADO</span>
              </a>
            </div></div>\n</main>`,
          ),
        };
      }
      return { status: 404, body: '' };
    }
    return { body: emptySearchForHost(url.hostname) };
  });

  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 3);
  const unknown = streams.find((s) => s.infoHash === hashUnknown);
  assert.ok(unknown, 'stream sem qualidade deve ser preservado');
  assert.equal(unknown.quality, 'Desconhecida');
  assert.equal(streams[streams.length - 1].quality, 'Desconhecida');
  assert.equal(unknown.name, 'Baixa Rápido Desconhecida\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 baixarapido\n📁 Matrix.1999.SemQualidade');
});
