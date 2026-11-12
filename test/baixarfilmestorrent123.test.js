const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const HASH_720 = 'b592ff236336f8a6dfca189ca350511af94b4807';
const HASH_1080 = '4a97a8df6253bb49c830071b33436c189380b5cf';
const HASH_BIGBANG = '2ee33781f92afd6cf629b23dd2df1a44b7f76da3';

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('baixarfilmestorrent123-test-');
  try {
    const gdriveDir = path.join(outDir, 'gdrive');
    const prismDir = path.join(outDir, 'prism');
    fs.mkdirSync(gdriveDir);
    fs.mkdirSync(prismDir);
    codes.gdrive = fs.readFileSync(await buildProvider('baixarfilmestorrent123', { outDir: gdriveDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('baixarfilmestorrent123', { outDir: prismDir, formatter: 'prism' }), 'utf8');
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/baixarfilmestorrent123', name), 'utf8');
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

const BIGBANG_FILES = Array.from({ length: 23 }, (_, index) => {
  if (index === 9) return '3 - A Sublimação Bárbara.mp4';
  const ep = index >= 2 ? index + 2 : index + 1;
  return `${ep} - Outro.mp4`;
});
const BIGBANG_TORRENT = torrent(
  BIGBANG_FILES,
  BIGBANG_FILES.map((_, i) => (i === 9 ? 211088973 : 200000000)),
);

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function moviePayload(extra = {}) {
  return {
    title: extra.title || 'Nossos Amantes',
    original_title: extra.original || extra.title || 'Nuestros amantes',
    release_date: extra.year === null ? '' : `${extra.year || 2017}-04-01`,
    external_ids: { imdb_id: extra.imdb === undefined ? 'tt4631532' : extra.imdb },
    alternative_titles: { titles: extra.alts || [] },
    original_language: 'es',
    genres: [],
    origin_country: ['ES'],
  };
}

function seriesPayload(extra = {}) {
  return {
    name: extra.name || 'Big Bang: A Teoria',
    original_name: extra.original || extra.name || 'The Big Bang Theory',
    first_air_date: `${extra.year || 2007}-09-24`,
    external_ids: { imdb_id: extra.imdb === undefined ? 'tt0898266' : extra.imdb },
    alternative_titles: { results: extra.alts || [] },
    original_language: 'en',
    genres: [],
    origin_country: ['US'],
  };
}

function runtime(route, bundle = code) {
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const context = {
    module: { exports: {} },
    TMDB_API_KEY: 'chave-de-teste',
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
        url: String(url),
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
  vm.runInNewContext(bundle, context, { filename: 'baixarfilmestorrent123.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function serve({ movie, series, byQuery = {}, torrents = {}, fail }) {
  return (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (url.pathname.includes('/movie/')) return { body: movie };
      if (url.pathname.includes('/tv/')) return { body: series };
      throw new Error(`TMDB inesperado: ${url.pathname}`);
    }
    if (url.hostname === 'itorrents.org') {
      const name = url.pathname.split('/').pop();
      if (!torrents[name]) return { status: 404, body: 'ausente' };
      return { bytes: torrents[name], body: '' };
    }
    if (url.hostname === 'baixarfilmestorrent123.blogspot.com') {
      if (fail) {
        const failed = fail(url);
        if (failed) return failed;
      }
      const q = url.searchParams.get('q');
      if (Object.prototype.hasOwnProperty.call(byQuery, q)) {
        return { body: byQuery[q] };
      }
      throw new Error(`busca inesperada no blog: ${q}`);
    }
    throw new Error(`URL inesperada: ${url.href}`);
  };
}

// 1.1 Validação de entrada
test('1.1: tv sem temporada ou episódio inteiro positivo devolve [] e não chama fetch', async () => {
  const app = runtime(() => { throw new Error('não deveria chamar fetch'); });
  const cases = [
    ['123', 'tv', null, 1],
    ['123', 'tv', 1, null],
    ['123', 'tv', 0, 1],
    ['123', 'tv', 1, -1],
    ['123', 'tv', 1.5, 1],
  ];
  for (const [id, type, s, e] of cases) {
    const streams = await app.getStreams(id, type, s, e);
    assert.deepEqual(streams, []);
  }
  assert.equal(app.calls.length, 0);
  assert.ok(app.logs.error.every((m) => m.startsWith('[Baixar Filmes Via-Torrent]')));
  assert.equal(app.logs.error.length, cases.length);
});

test('1.1: tmdbId inválido devolve [] e não chama fetch', async () => {
  const app = runtime(() => { throw new Error('não deveria chamar fetch'); });
  const streams = await app.getStreams('abc', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(app.calls.length, 0);
  assert.match(app.logs.error[0], /^\[Baixar Filmes Via-Torrent\]/);
});

// 1.2 Leitura do feed e tratamento de ausência/erro
test('1.2: total 0 devolve [] sem erro de rede', async () => {
  const app = runtime(serve({
    movie: moviePayload({ title: 'Matrix', original: 'The Matrix', imdb: 'tt0133093', year: 1999 }),
    byQuery: {
      Matrix: JSON.parse(fixture('matrix.json')),
      'The Matrix': JSON.parse(fixture('matrix.json')),
    },
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(app.logs.error.length, 0);
  assert.equal(app.logs.warn.length, 0);
  const feedCall = app.calls.find((c) => c.url.includes('feeds/posts/default'));
  assert.ok(feedCall);
  assert.ok(feedCall.url.includes('alt=json'));
  assert.ok(feedCall.url.includes('max-results=20'));
  assert.ok(feedCall.url.includes('q=Matrix'));
});

test('1.2: corpo sem feed falha até getStreams, que registra [Baixar Filmes Via-Torrent] e devolve []', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    byQuery: {
      'Nossos Amantes': { erro: 'invalido' },
    },
  }));
  const streams = await app.getStreams('100', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(app.logs.error.length, 1);
  assert.match(app.logs.error[0], /^\[Baixar Filmes Via-Torrent\]/);
});

// 1.3 Identidade do post e matching
test('1.3: Nossos Amantes entra por tt4631532 mesmo com título original diferente', async () => {
  const app = runtime(serve({
    movie: moviePayload({ title: 'The Lovers', original: 'The Lovers', imdb: 'tt4631532', year: 2017 }),
    byQuery: {
      'The Lovers': JSON.parse(fixture('nossos.json')),
    },
  }));
  const streams = await app.getStreams('101', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map((s) => s.infoHash), [HASH_1080, HASH_720]);
});

test('1.3: post de temporada não entra em movie', async () => {
  const app = runtime(serve({
    movie: moviePayload({ title: 'Big Bang', original: 'The Big Bang Theory', year: 2008, imdb: 'tt0898266' }),
    byQuery: {
      'Big Bang': JSON.parse(fixture('bigbang.json')),
      'The Big Bang Theory': JSON.parse(fixture('bigbang.json')),
    },
  }));
  const streams = await app.getStreams('102', 'movie', null, null);
  // No feed de bigbang há: A Era do Gelo: O Big Bang (IMDb tt3416828 não bate, ano 2016 não bate),
  // e as temporadas 2 e 1 de Big Bang (são séries, logo não entram em movie).
  assert.deepEqual(streams, []);
});

test('1.3: a 2ª temporada de Big Bang entra pelo título original mesmo com ano 2008 no post', async () => {
  const app = runtime(serve({
    series: seriesPayload({ name: 'Big Bang: A Teoria', original: 'The Big Bang Theory', year: 2007 }),
    byQuery: {
      'Big Bang: A Teoria': JSON.parse(fixture('bigbang.json')),
    },
    torrents: {
      [`${HASH_BIGBANG.toUpperCase()}.torrent`]: BIGBANG_TORRENT,
    },
  }));
  const streams = await app.getStreams('1418', 'tv', 2, 3);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, `torrent://${HASH_BIGBANG}/9`);
  assert.equal(
    streams[0].name,
    'Baixar Filmes Via-Torrent 720p\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 pacote 4,45 GB 👥 ?/?\n📁 3 - A Sublimação Bárbara.mp4',
  );
  assert.equal(
    streams[0].title,
    '🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 201.31 MB / 4,45 GB 👥 ?/?\n📁 The Big Bang Theory …- The Pirate Filmes/3 - A Sublimação Bárbara.mp4',
  );

  const prismApp = runtime(serve({
    series: seriesPayload({ name: 'Big Bang: A Teoria', original: 'The Big Bang Theory', year: 2007 }),
    byQuery: {
      'Big Bang: A Teoria': JSON.parse(fixture('bigbang.json')),
    },
    torrents: {
      [`${HASH_BIGBANG.toUpperCase()}.torrent`]: BIGBANG_TORRENT,
    },
  }), codes.prism);
  const prismStreams = await prismApp.getStreams('1418', 'tv', 2, 3);
  assert.equal(prismStreams.length, 1);
  assert.equal(prismStreams[0].name, '💿 HD 720p\n🎬 Big Bang: A Teoria (2007) T02E03\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 pacote 4,45 GB 🌱 ?/?');
  assert.equal(
    prismStreams[0].title,
    '🎬 Big Bang: A Teoria (2007) T02E03\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 201.31 MB / 4,45 GB 🌱 ?/?\n🔍Baixar Filmes Via-Torrent',
  );
});

// 2.1 e 2.2 Magnets, metadados e testes do filme
test('2.1 e 2.2: extrai magnets hexadecimais em minúsculas, descarta não-magnet, 1080p e 720p com tamanhos certos', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    byQuery: {
      'Nossos Amantes': JSON.parse(fixture('nossos.json')),
      'Nuestros amantes': JSON.parse(fixture('nossos.json')),
    },
  }));
  const streams = await app.getStreams('103', 'movie', null, null);
  assert.equal(streams.length, 2);

  // Ordenação por qualidade: 1080p primeiro, 720p depois
  const [first, second] = streams;
  assert.equal(first.quality, '1080p');
  assert.equal(first.name, 'Baixar Filmes Via-Torrent 1080p\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/?\n📁 Nossos Amantes 2017 (1080p)');
  assert.equal(first.title, '🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 1.60 GB 👥 ?/?\n📁 Nossos Amantes 2017 (1080p)');
  assert.equal(first.language, 'Dublado (Não PT-BR?)');
  assert.equal(first.size, '1.60 GB');
  assert.equal(first.infoHash, HASH_1080);
  assert.ok(first.url.startsWith(`magnet:?xt=urn:btih:${HASH_1080}`));
  assert.match(first.url, /dn=Nossos%20Amantes/);
  assert.match(first.url, /tr=udp/);
  assert.equal('headers' in first, false);

  assert.equal(second.quality, '720p');
  assert.equal(second.name, 'Baixar Filmes Via-Torrent 720p\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/?\n📁 Nossos Amantes 2017 (720p)');
  assert.equal(second.title, '🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 923 MB 👥 ?/?\n📁 Nossos Amantes 2017 (720p)');
  assert.equal(second.language, 'Dublado (Não PT-BR?)');
  assert.equal(second.size, '923 MB');
  assert.equal(second.infoHash, HASH_720);
  assert.ok(second.url.startsWith(`magnet:?xt=urn:btih:${HASH_720}`));
  assert.match(second.url, /dn=Nossos%20Amantes/);
  assert.match(second.url, /tr=udp/);
  assert.equal('headers' in second, false);

  const prismApp = runtime(serve({
    movie: moviePayload(),
    byQuery: {
      'Nossos Amantes': JSON.parse(fixture('nossos.json')),
      'Nuestros amantes': JSON.parse(fixture('nossos.json')),
    },
  }), codes.prism);
  const [prismFirst, prismSecond] = await prismApp.getStreams('103', 'movie', null, null);
  assert.equal(prismFirst.name, '🚀 FHD 1080p\n🎬 Nossos Amantes (2017)\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 🌱 ?/?');
  assert.equal(
    prismFirst.title,
    '🎬 Nossos Amantes (2017)\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 1.60 GB 🌱 ?/?\n🔍Baixar Filmes Via-Torrent',
  );
  assert.equal(prismSecond.name, '💿 HD 720p\n🎬 Nossos Amantes (2017)\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 🌱 ?/?');
  assert.equal(
    prismSecond.title,
    '🎬 Nossos Amantes (2017)\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 923 MB 🌱 ?/?\n🔍Baixar Filmes Via-Torrent',
  );
});

test('2.1: btih que não tem 40 hexadecimais derruba só essa opção', async () => {
  const modifiedFeed = JSON.parse(fixture('nossos.json'));
  // Injeta um link com btih inválido (32 caracteres ou não-hex) antes dos válidos
  const entryHtml = modifiedFeed.feed.entry[0].content.$t;
  modifiedFeed.feed.entry[0].content.$t = `<p><a href="magnet:?xt=urn:btih:INVALID_BTIH_HASH&amp;dn=Invalido">Invalido</a></p>${entryHtml}`;

  const app = runtime(serve({
    movie: moviePayload(),
    byQuery: {
      'Nossos Amantes': modifiedFeed,
      'Nuestros amantes': modifiedFeed,
    },
  }));
  const streams = await app.getStreams('104', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map((s) => s.infoHash), [HASH_1080, HASH_720]);
});

test('2.2: post em que a quantidade de tamanhos não bate e o size fica de fora', async () => {
  const modifiedFeed = JSON.parse(fixture('nossos.json'));
  // Altera Tamanho para ter 3 tamanhos em vez de 2
  modifiedFeed.feed.entry[0].content.$t = modifiedFeed.feed.entry[0].content.$t.replace(
    /Tamanho:[^<]+/i,
    'Tamanho: 700 MB | 1.4 GB | 2.1 GB'
  );

  const app = runtime(serve({
    movie: moviePayload(),
    byQuery: {
      'Nossos Amantes': modifiedFeed,
      'Nuestros amantes': modifiedFeed,
    },
  }));
  const streams = await app.getStreams('105', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.equal(streams[0].size, undefined);
  assert.equal(streams[1].size, undefined);
  assert.equal(streams[0].name, 'Baixar Filmes Via-Torrent 1080p\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/?\n📁 Nossos Amantes 2017 (1080p)');
  assert.equal(streams[1].name, 'Baixar Filmes Via-Torrent 720p\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/?\n📁 Nossos Amantes 2017 (720p)');
  assert.equal(streams[0].title, '🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/?\n📁 Nossos Amantes 2017 (1080p)');
  assert.equal(streams[1].title, '🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/?\n📁 Nossos Amantes 2017 (720p)');
});

test('2.2: Sandy Wexler (tt5893332), sem magnet, devolve []', async () => {
  const app = runtime(serve({
    movie: moviePayload({ title: 'Sandy Wexler', original: 'Sandy Wexler', imdb: 'tt5893332', year: 2017 }),
    byQuery: {
      'Sandy Wexler': JSON.parse(fixture('sandy.json')),
    },
  }));
  const streams = await app.getStreams('106', 'movie', null, null);
  assert.deepEqual(streams, []);
});

test('2.3: release sem qualidade no texto do botão, no dn e na ficha sai com qualidade Desconhecida e fica no fim da lista', async () => {
  const modifiedFeed = JSON.parse(fixture('nossos.json'));
  const hashUnknown = 'e'.repeat(40);
  modifiedFeed.feed.entry[0].content.$t = modifiedFeed.feed.entry[0].content.$t
    .replace(/Qualidade de Vídeo:[^<]+/i, '')
    .replace(/Qualidade:[^<]+/i, '');
  const entryHtml = modifiedFeed.feed.entry[0].content.$t;
  modifiedFeed.feed.entry[0].content.$t = `${entryHtml}<p><a href="magnet:?xt=urn:btih:${hashUnknown}&amp;dn=Nossos.Amantes.SemQualidade">Download Sem Qualidade</a></p>`;

  const app = runtime(serve({
    movie: moviePayload(),
    byQuery: {
      'Nossos Amantes': modifiedFeed,
      'Nuestros amantes': modifiedFeed,
    },
  }));
  const streams = await app.getStreams('107', 'movie', null, null);
  const unknownStream = streams.find((s) => s.infoHash === hashUnknown);
  assert.ok(unknownStream, 'stream sem qualidade deve ser preservado');
  assert.equal(unknownStream.quality, 'Desconhecida');
  assert.equal(
    unknownStream.name,
    'Baixar Filmes Via-Torrent Desconhecida\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/?\n📁 Nossos.Amantes.SemQualidade',
  );
  assert.equal(streams[streams.length - 1].quality, 'Desconhecida');

  const prismApp = runtime(serve({
    movie: moviePayload(),
    byQuery: {
      'Nossos Amantes': modifiedFeed,
      'Nuestros amantes': modifiedFeed,
    },
  }), codes.prism);
  const prismStreams = await prismApp.getStreams('107', 'movie', null, null);
  const prismUnknown = prismStreams.find((s) => s.infoHash === hashUnknown);
  assert.ok(prismUnknown);
  assert.equal(prismUnknown.name, '❓ Desconhecida\n🎬 Nossos Amantes (2017)\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 🌱 ?/?');
});

// 3.1 Episódio avulso
test('3.1: episódio avulso sai como magnet e não chama fetchTorrentFiles', async () => {
  const singleEpFeed = {
    version: '1.0',
    encoding: 'UTF-8',
    feed: {
      xmlns: 'http://www.w3.org/2005/Atom',
      openSearch$totalResults: { $t: '1' },
      openSearch$startIndex: { $t: '1' },
      openSearch$itemsPerPage: { $t: '20' },
      entry: [{
        title: { $t: 'Big Bang: A Teoria 2ª Temporada - Torrent' },
        category: [{ term: 'Série' }],
        content: {
          $t: `<p>Título original: The Big Bang Theory</p>
               <p>Idioma: Português</p>
               <p><a href="magnet:?xt=urn:btih:3333333333333333333333333333333333333333&amp;dn=The.Big.Bang.Theory.S02E03.720p">The Big Bang Theory S02E03</a></p>`,
        },
      }],
    },
  };

  const app = runtime(serve({
    series: seriesPayload(),
    byQuery: {
      'Big Bang: A Teoria': singleEpFeed,
    },
  }));

  const streams = await app.getStreams('1418', 'tv', 2, 3);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].type, 'magnet');
  assert.equal(streams[0].infoHash, '3333333333333333333333333333333333333333');
  assert.ok(streams[0].url.startsWith('magnet:?xt=urn:btih:3333333333333333333333333333333333333333'));
  // Garante que não chamou itorrents.org
  const torrentCalls = app.calls.filter((c) => c.url.includes('itorrents.org'));
  assert.equal(torrentCalls.length, 0);
});

// 3.2 Pacote de temporada
test('3.2: pacote sem arquivo único do episódio descarta opção com console.log de triagem', async () => {
  // .torrent sem o episódio 3
  const OTHER_TORRENT = torrent(['1 - Pilot.mp4', '2 - Other.mp4'], [1000, 2000]);

  const app = runtime(serve({
    series: seriesPayload(),
    byQuery: {
      'Big Bang: A Teoria': JSON.parse(fixture('bigbang.json')),
    },
    torrents: {
      [`${HASH_BIGBANG.toUpperCase()}.torrent`]: OTHER_TORRENT,
    },
  }));

  const streams = await app.getStreams('1418', 'tv', 2, 3);
  assert.deepEqual(streams, []);
  assert.ok(app.logs.log.some((m) => m.includes('descartada por triagem: arquivo do episódio 2x3 não identificado')));
  assert.equal(app.logs.warn.length, 0);
  assert.equal(app.logs.error.length, 0);
});

test('3.2: falha do cache itorrents.org registra console.warn e descarta só essa opção', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    byQuery: {
      'Big Bang: A Teoria': JSON.parse(fixture('bigbang.json')),
    },
    torrents: {
      // Deixa sem o torrent para responder 404
    },
  }));

  const streams = await app.getStreams('1418', 'tv', 2, 3);
  assert.deepEqual(streams, []);
  assert.equal(app.logs.warn.length, 1);
  assert.match(app.logs.warn[0], /^\[Baixar Filmes Via-Torrent\] Opção pacote 2ee33781 descartada: HTTP 404/);
  assert.equal(app.logs.error.length, 0);
});
