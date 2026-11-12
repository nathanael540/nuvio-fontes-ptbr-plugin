const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const HEX_720 = '51ca3ba90f04bf50394e9eb7e448ceea214d5ad6';
const HEX_1080 = '8cc4fdc2c777d1464d9043397309f45859b9297b';
const BASE32_HEX = '99b9044e73f828b2641530372c03a532c0449f02';
const PACK = 'f32eb77f755f0d349271a74e930b1cc4bb37bb49';
const WANDINHA_PACK = '0b73deaa734d3f9e58abeddcf235b202266e3a69';
const EP7 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RANGE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const EP3 = 'cccccccccccccccccccccccccccccccccccccccc';
const EPISODE_ONLY = 'dddddddddddddddddddddddddddddddddddddddd';
const FILE_BYTES = 1610612736;

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('filmestorrent-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('filmestorrent', { outDir, formatter }), 'utf8');
    }
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/filmestorrent', name), 'utf8');
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
const RANGE_TORRENT = torrent(
  ['S02E01.mkv', 'S02E02.mkv', 'S02E03.mkv'],
  [1000, 1000, FILE_BYTES],
);
const PILOT_TORRENT = torrent(['1 - Pilot.mp4'], [1000]);

function moviePayload(extra = {}) {
  return {
    title: extra.title || 'Matrix',
    original_title: extra.original || extra.title || 'Matrix',
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

function post(id, title, html) {
  return { id, link: `https://comandotorrent.lol/${id}/`, title: { rendered: title }, content: { rendered: html } };
}

function runtime(route, bundle = code) {
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const context = {
    module: { exports: {} },
    TMDB_API_KEY: 'chave-de-teste',
    URL,
    URLSearchParams,
    Uint8Array,
    ArrayBuffer,
    DataView,
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
  vm.runInNewContext(bundle, context, { filename: 'filmestorrent.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function serve({ movie, series, bySearch = {}, torrents = {}, fail, mestre, torrentdosfilmes }) {
  return (url) => {
    if (url.hostname === 'mestredosfilmes.top') {
      if (mestre) return mestre(url.searchParams.get('search'));
      return { body: [] };
    }
    if (url.hostname === 'torrentdosfilmes-v2.xyz') {
      if (torrentdosfilmes) return torrentdosfilmes(url.searchParams.get('search'));
      return { body: [] };
    }
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
    if (url.pathname !== '/wp-json/wp/v2/posts') throw new Error(`URL inesperada: ${url.href}`);
    if (fail) {
      const failed = fail(url.hostname, url.searchParams.get('search'));
      if (failed) return failed;
    }
    const search = url.searchParams.get('search');
    if (!Object.prototype.hasOwnProperty.call(bySearch, search)) {
      throw new Error(`busca inesperada em ${url.hostname}: ${search}`);
    }
    return { body: bySearch[search] };
  };
}

const matrixPost = () => post(12286, 'Matrix 1: Dublado Bluray 720p 1080p Dual Audio Torrent Download (1999)', fixture('movie-hex.html'));
const packPost = () => post(18889, 'Breaking Bad 2ª Temporada BluRay Rip 720p Dublado (2009)', fixture('season-pack.html'));
const episodePost = () => post(42461, 'Breaking Bad 2ª Temporada HDTV 720p Legendado', fixture('episodes.html'));
const torrentsOf = (extra = {}) => ({
  [`${PACK.toUpperCase()}.torrent`]: PACK_TORRENT,
  [`${RANGE.toUpperCase()}.torrent`]: RANGE_TORRENT,
  ...extra,
});

function postsCalled(app, host) {
  return app.calls.filter((call) => call.url.includes('/wp-json/wp/v2/posts') && call.url.includes(host));
}

test('rede: consulta três catálogos em paralelo, na ordem, sem o alias', { timeout: 2000 }, async () => {
  const hosts = [];
  let releaseComando;
  const comando = new Promise((resolve) => { releaseComando = resolve; });
  const route = serve({ movie: moviePayload() });
  const app = runtime((url) => {
    if (url.pathname === '/wp-json/wp/v2/posts') {
      hosts.push(url.hostname);
      if (url.hostname === 'filmestorrent.tv') return comando;
      if (url.hostname === 'torrentdosfilmes-v2.xyz') releaseComando({ body: [matrixPost()] });
    }
    return route(url);
  });
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.deepEqual(hosts.slice(0, 3), ['filmestorrent.tv', 'mestredosfilmes.top', 'torrentdosfilmes-v2.xyz']);
  assert.equal(postsCalled(app, 'torrentdosfilmes.se').length, 0);
  assert.equal(app.logs.warn.length, 0);
  assert.equal(app.logs.error.length, 0);
});

for (const formatter of ['gdrive', 'prism']) {
  test(`torrentdosfilmes: filme REST confere IMDb, magnets e metadados (${formatter})`, async () => {
    const app = runtime(serve({
      movie: moviePayload(),
      bySearch: { tt0133093: [] , matrix: [] },
      torrentdosfilmes: () => ({ body: JSON.parse(fixture('torrentdosfilmes-movie.json')) }),
    }), codes[formatter]);
    const streams = await app.getStreams('603', 'movie', null, null);
    assert.deepEqual(streams.map((stream) => stream.infoHash), [HEX_1080, HEX_720]);
    assert.deepEqual(streams.map((stream) => stream.quality), ['1080p', '720p']);
    assert.deepEqual(streams.map((stream) => stream.language), ['Dublado (Não PT-BR?)', 'Dublado']);
    assert.deepEqual(streams.map((stream) => stream.size), ['2.03 GB', '796 MB']);
    for (const stream of streams) {
      assert.equal(stream.provider, 'Torrent dos Filmes');
      assert.equal(stream.type, 'magnet');
      assert.equal('headers' in stream, false);
      assert.match(stream.name, /🧲 P2P/);
      assert.match(stream.name, /Torrent dos Filmes/);
      assert.match(stream.title, /Torrent dos Filmes/);
      assert.equal(new URL(stream.url).searchParams.get('tr'), 'udp://tracker.example:80');
      assert.match(new URL(stream.url).searchParams.get('dn'), /Matrix \(1999\)/);
    }
    assert.deepEqual(postsCalled(app, 'torrentdosfilmes-v2.xyz').map((call) => new URL(call.url).searchParams.get('search')), ['tt0133093']);
    assert.equal(app.calls.some((call) => call.url.includes('itorrents.org')), false);
    assert.equal(app.logs.warn.length, 0);
    assert.equal(app.logs.error.length, 0);
  });

  test(`torrentdosfilmes: série REST seleciona T2 E1 no índice 4 e preserva metadados (${formatter})`, async () => {
    const app = runtime(serve({
      series: seriesPayload({ name: 'Wandinha', original: 'Wednesday', year: 2022, imdb: 'tt13443470' }),
      bySearch: { tt13443470: [], 'wandinha 2 temporada': [], 'wednesday 2 temporada': [] },
      torrentdosfilmes: () => ({ body: JSON.parse(fixture('torrentdosfilmes-series.json')) }),
      torrents: {
        [`${WANDINHA_PACK.toUpperCase()}.torrent`]: torrent(
          ['leia-me.txt', 'Wandinha.S02E02.mkv', 'Wandinha.S02E03.mkv', 'sample.mkv', 'Wandinha.S02E01.mkv'],
          [100, 2000, 2000, 1000, FILE_BYTES],
        ),
        [`${RANGE.toUpperCase()}.torrent`]: torrent(['Wandinha.S02E02.mkv'], [2000]),
      },
    }), codes[formatter]);
    const streams = await app.getStreams('119051', 'tv', 2, 1);
    assert.equal(streams.length, 1);
    assert.equal(streams[0].url, `torrent://${WANDINHA_PACK}/4`);
    assert.equal(streams[0].infoHash, WANDINHA_PACK);
    assert.equal(streams[0].provider, 'Torrent dos Filmes');
    assert.equal(streams[0].type, 'torrent');
    assert.equal(streams[0].quality, '1080p');
    assert.equal(streams[0].language, 'Dublado (Não PT-BR?)');
    assert.equal(streams[0].size, '1.50 GB');
    assert.equal('headers' in streams[0], false);
    assert.match(streams[0].name, /🧲 P2P 📦 pacote 4\.8 GB/);
    assert.match(streams[0].title, /Torrent dos Filmes/);
    if (formatter === 'gdrive') {
      assert.match(streams[0].name, /📁 Wandinha\.S02E01\.mkv/);
      assert.match(streams[0].title, /Wandinha 2 Temporada 1080p Dual Audio\/Wandinha\.S02E01\.mkv/);
    } else {
      assert.match(streams[0].name, /Wandinha \(2022\) T02E01/);
    }
    assert.deepEqual(postsCalled(app, 'torrentdosfilmes-v2.xyz').map((call) => new URL(call.url).searchParams.get('search')), ['tt13443470']);
    assert.ok(app.logs.log.some((message) => /^\[Filmestorrent\/Torrent dos Filmes\].*arquivo do episódio 2x1 não identificado/.test(message)));
    assert.equal(app.logs.warn.length, 0);
    assert.equal(app.logs.error.length, 0);
  });
}

test('carrega CommonJS sem rede e rejeita entrada inválida antes do fetch', async () => {
  const app = runtime(() => { throw new Error('fetch inesperado'); });
  assert.equal(typeof app.getStreams, 'function');
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(code, /Promise\.allSettled|AbortController|searchParams\.set|searchParams\.append/);
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
  assert.ok(app.logs.error.every((message) => message.startsWith('[Filmestorrent] Entrada:')));
});

test('filme com hash hexadecimal preenche magnet, idioma, tamanho e não troca de domínio', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [matrixPost()] },
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(app.logs.error.length, 0, app.logs.error.join('\n'));
  assert.deepEqual(streams.map((item) => item.quality), ['1080p', '720p']);
  assert.equal(streams[0].name, 'Filmestorrent 1080p\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/? 🔍 Comando\n📁 Matrix (1999) Bluray 1080p Dual Audio');
  assert.equal(streams[0].title, '🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 2.03 GB 👥 ?/? 🔍 Comando\n📁 Matrix (1999) Bluray 1080p Dual Audio');
  assert.equal(streams[0].language, 'Dublado (Não PT-BR?)');
  assert.equal(streams[0].size, '2.03 GB');
  assert.equal(streams[0].infoHash, HEX_1080);
  assert.equal(streams[0].type, 'magnet');
  assert.ok(streams[0].url.startsWith(`magnet:?xt=urn:btih:${HEX_1080}`));
  assert.match(streams[0].url, /dn=/);
  assert.match(streams[0].url, /tr=/);
  assert.equal('headers' in streams[0], false);
  assert.equal(streams[1].name, 'Filmestorrent 720p\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 Comando\n📁 Matrix (1999) BDRip 720p dublado');
  assert.equal(streams[1].title, '🗣️ Dublado\n🧲 P2P 📦 796 MB 👥 ?/? 🔍 Comando\n📁 Matrix (1999) BDRip 720p dublado');
  assert.equal(streams[1].language, 'Dublado');
  assert.equal(streams[1].size, '796 MB');
  assert.equal(streams[1].infoHash, HEX_720);
  assert.equal(postsCalled(app, 'filmestorrent.club').length, 0);
  const posts = postsCalled(app, 'filmestorrent.tv');
  assert.equal(posts.length, 1);
  const url = new URL(posts[0].url);
  assert.equal(url.searchParams.get('search'), 'tt0133093');
  assert.equal(url.searchParams.get('_fields'), 'id,link,title,content');
  assert.equal(url.searchParams.get('per_page'), '20');
  assert.equal(posts[0].init.headers['X-Requested-With'], 'XMLHttpRequest');
  assert.equal(app.calls.some((call) => call.url.includes('itorrents.org')), false);
});

test('converte hash base32 para o hexadecimal de 40 caracteres', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: {
      tt0133093: [post(1, 'Matrix (1999)', fixture('movie-base32.html'))],
    },
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, BASE32_HEX);
  assert.ok(streams[0].url.includes(`xt=urn:btih:${BASE32_HEX}`));
  assert.equal(streams[0].url.includes('tg4qittt'), false);
  assert.equal(streams[0].name, 'Filmestorrent 1080p\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/? 🔍 Comando\n📁 Matrix 1080p Dual Audio');
});

test('hash base32 inválido não vaza para a URL e não derruba o magnet válido', async () => {
  const html = `${fixture('movie-hex.html')}<p><a href="magnet:?xt=urn:btih:11111111111111111111111111111111&amp;dn=Ruim+1080p+Dublado">1080p</a></p>`;
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [post(1, 'Matrix (1999)', html)] },
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.equal(streams.some((item) => item.url.includes('11111111111111111111111111111111')), false);
  assert.equal(app.logs.warn.length, 1);
  assert.match(app.logs.warn[0], /^\[Filmestorrent\] Opção magnet 11111111 descartada:/);
  assert.equal(app.logs.error.length, 0);
});

test('hash inválido sozinho esvazia a lista e registra o erro agregado', async () => {
  const html = '<p><strong>IMDb</strong>: <a href="https://www.imdb.com/title/tt0133093/">8.7</a></p><p><a href="magnet:?xt=urn:btih:11111111111111111111111111111111&amp;dn=Ruim+720p+Dublado">720p</a></p>';
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [post(1, 'Matrix (1999)', html)] },
  }));
  assert.deepEqual(await app.getStreams('603', 'movie', null, null), []);
  assert.equal(app.logs.warn.length, 1);
  assert.match(app.logs.error[0], /^\[Filmestorrent\] Comando: Todas as opções falharam:/);
});

test('pacote da temporada 2 episódio 3 aponta para o arquivo 12 e ignora selo distante', async () => {
  const html = `<p><strong>EPISÓDIO 10 (NOVO)</strong></p><p>${'sinopse '.repeat(40)}</p>${fixture('season-pack.html')}`;
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [post(18889, 'Breaking Bad 2ª Temporada BluRay Rip 720p Dublado (2009)', html)] },
    torrents: torrentsOf(),
  }));
  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.equal(app.logs.error.length, 0, app.logs.error.join('\n'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, `torrent://${PACK}/12`);
  assert.equal(streams[0].infoHash, PACK);
  assert.equal(streams[0].name, 'Filmestorrent 720p\n🗣️ Dublado\n🧲 P2P 📦 pacote 4.8 GB 👥 ?/? 🔍 Comando\n📁 3 - Bit by a Dead Bee.mp4');
  assert.equal(streams[0].title, '🗣️ Dublado\n🧲 P2P 📦 1.50 GB / 4.8 GB 👥 ?/? 🔍 Comando\n📁 Breaking Bad 2 Tempo… BDRip 720p dublado/3 - Bit by a Dead Bee.mp4');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].size, '1.50 GB');
  assert.equal(streams[0].type, 'torrent');
  assert.equal(streams[0].url.includes('magnet:'), false);
  assert.equal('headers' in streams[0], false);
  const torrentCalls = app.calls.filter((call) => call.url.includes('itorrents.org'));
  assert.deepEqual(torrentCalls.map((call) => call.url), [`https://itorrents.org/torrent/${PACK.toUpperCase()}.torrent`]);
});

test('episódio avulso permanece magnet e a faixa vira o arquivo do episódio', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [episodePost()] },
    torrents: torrentsOf(),
  }));
  const episode7 = await app.getStreams('1396', 'tv', 2, 7);
  assert.equal(episode7.length, 1);
  assert.ok(episode7[0].url.startsWith(`magnet:?xt=urn:btih:${EP7}`));
  assert.equal(episode7[0].name, 'Filmestorrent 1080p\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 Comando\n📁 Show S02E07 1080p Dublado');
  assert.equal(episode7[0].title, '🗣️ Dublado\n🧲 P2P 📦 400 MB 👥 ?/? 🔍 Comando\n📁 Show S02E07 1080p Dublado');
  assert.equal(episode7[0].size, '400 MB');
  assert.equal(app.calls.some((call) => call.url.includes('itorrents.org')), false);

  const third = await app.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(third.map((item) => item.url), [
    `torrent://${RANGE}/2`,
    `magnet:?xt=urn:btih:${EP3}&dn=Show+S02E03+720p+Legendado&tr=udp%3A%2F%2Ftracker.example%3A80`,
  ]);
  assert.equal(third[0].name, 'Filmestorrent 720p\n🗣️ Dublado\n🧲 P2P 📦 pacote 1.20 GB 👥 ?/? 🔍 Comando\n📁 S02E03.mkv');
  assert.equal(third[0].title, '🗣️ Dublado\n🧲 P2P 📦 1.50 GB / 1.20 GB 👥 ?/? 🔍 Comando\n📁 Show S02E01-06 720p Dublado/S02E03.mkv');
  assert.equal(third[0].language, 'Dublado');
  assert.equal(third[0].size, '1.50 GB');
  assert.equal(third[1].name, 'Filmestorrent 720p\n🗣️ Legendado\n🧲 P2P 👥 ?/? 🔍 Comando\n📁 Show S02E03 720p Legendado');
  assert.equal(third[1].title, '🗣️ Legendado\n🧲 P2P 📦 350 MB 👥 ?/? 🔍 Comando\n📁 Show S02E03 720p Legendado');
  assert.equal(third[1].language, 'Legendado');
  assert.equal(third[1].size, '350 MB');
  assert.equal(third.some((item) => item.url.includes(EP7)), false);

  const second = await app.getStreams('1396', 'tv', 2, 2);
  assert.deepEqual(second.map((item) => item.url), [`torrent://${RANGE}/1`]);
});

test('episódio ausente é triagem e não erro', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [episodePost()] },
    torrents: torrentsOf(),
  }));
  assert.deepEqual(await app.getStreams('1396', 'tv', 2, 8), []);
  assert.equal(app.logs.error.length, 0);
  assert.equal(app.logs.warn.length, 0);
  assert.ok(app.logs.log.some((message) => /descartada por triagem: não contém o episódio 8/.test(message)));
  assert.equal(app.calls.some((call) => call.url.includes('itorrents.org')), false);
});

test('pacote sem arquivo único é triagem e o episódio avulso permanece', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [episodePost()] },
    torrents: { [`${RANGE.toUpperCase()}.torrent`]: PILOT_TORRENT },
  }));
  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(streams.map((item) => item.infoHash), [EP3]);
  assert.equal(app.logs.warn.length, 0);
  assert.ok(app.logs.log.some((message) => /Opção pacote bbbbbbbb descartada por triagem: arquivo do episódio 2x3 não identificado/.test(message)));
});

test('falha do torrent descarta só a faixa', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [episodePost()] },
  }));
  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(streams.map((item) => item.infoHash), [EP3]);
  assert.equal(app.logs.warn.length, 1);
  assert.match(app.logs.warn[0], /^\[Filmestorrent\] Opção pacote bbbbbbbb descartada: HTTP 404/);
  assert.equal(app.logs.error.length, 0);
});

test('pacote com torrent indisponível esvazia a lista quando é a única opção', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [packPost()] },
  }));
  assert.deepEqual(await app.getStreams('1396', 'tv', 2, 3), []);
  assert.equal(app.logs.warn.length, 1);
  assert.match(app.logs.error[0], /^\[Filmestorrent\] Comando: Todas as opções falharam:/);
});

test('busca vazia não consulta o domínio seguinte', async () => {
  const app = runtime(serve({
    movie: moviePayload({ title: 'Ausente Total', original: 'Ausente Total', year: 2025, imdb: 'tt12300742' }),
    bySearch: { tt12300742: [], 'ausente total': [] },
    fail: (host) => (host === 'filmestorrent.club' ? new Error('club não deveria ser chamado') : null),
  }));
  assert.deepEqual(await app.getStreams('701387', 'movie', null, null), []);
  assert.equal(postsCalled(app, 'filmestorrent.club').length, 0);
  assert.equal(postsCalled(app, 'filmestorrent.tv').length, 2);
  assert.equal(app.logs.error.length, 0);
  assert.ok(app.logs.log.some((message) => message.includes('Nenhum post corresponde')));
});

test('HTML de lander e JSON que não é lista trocam para o domínio seguinte', async () => {
  const searches = { tt0133093: [matrixPost()] };
  const lander = runtime(serve({
    movie: moviePayload(),
    bySearch: searches,
    fail: (host) => (host === 'filmestorrent.tv' ? { status: 200, body: '<html>lander</html>' } : null),
  }));
  const fromLander = await lander.getStreams('603', 'movie', null, null);
  assert.equal(fromLander.length, 2);
  assert.equal(postsCalled(lander, 'filmestorrent.club').length, 1);
  assert.equal(lander.logs.error.length, 0);

  const objectBody = runtime(serve({
    movie: moviePayload(),
    bySearch: searches,
    fail: (host) => (host === 'filmestorrent.tv' ? { body: { code: 'rest_forbidden' } } : null),
  }));
  const fromObject = await objectBody.getStreams('603', 'movie', null, null);
  assert.equal(fromObject.length, 2);
  assert.equal(postsCalled(objectBody, 'filmestorrent.club').length, 1);
});

test('post de filme sai do pedido de série e post de temporada sai do pedido de filme', async () => {
  const season = post(
    50,
    'Matrix 2ª Temporada',
    '<p><strong>IMDb</strong>: <a href="https://www.imdb.com/title/tt0133093/">x</a></p><p><strong>Episódio 03: </strong><a href="magnet:?xt=urn:btih:dddddddddddddddddddddddddddddddddddddddd&amp;dn=Matrix+S02E03+720p+Dublado&amp;tr=udp%3A%2F%2Ftracker.example%3A80">720p</a></p>',
  );
  const route = serve({
    movie: moviePayload(),
    series: seriesPayload({ name: 'Matrix', original: 'Matrix', year: 1999, imdb: 'tt0133093' }),
    bySearch: { tt0133093: [matrixPost(), season] },
  });
  const movie = runtime(route);
  const movies = await movie.getStreams('603', 'movie', null, null);
  assert.deepEqual(movies.map((item) => item.infoHash).sort(), [HEX_1080, HEX_720].sort());
  assert.equal(movie.calls.some((call) => call.url.includes('itorrents.org')), false);

  const series = runtime(route);
  const episodes = await series.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(episodes.map((item) => item.infoHash), [EPISODE_ONLY]);
  assert.equal(episodes[0].url.startsWith('magnet:'), true);
});

test('temporada ausente na busca por IMDb é recuperada pelo título', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: {
      tt0903747: [post(9, 'Breaking Bad: O Filme (2017)', '<p><strong>IMDb</strong>: <a href="https://www.imdb.com/title/tt0903747/">x</a></p><p><a href="magnet:?xt=urn:btih:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&amp;dn=El+Camino+1080p+Dublado">1080p</a></p>')],
      'breaking bad 2 temporada': [packPost()],
    },
    torrents: torrentsOf(),
  }));
  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(streams.map((item) => item.url), [`torrent://${PACK}/12`]);
  assert.equal(postsCalled(app, 'filmestorrent.tv').length, 2);
});

test('fallback de filme descarta ano incompatível e IMDb de outro título', async () => {
  const reloaded = post(2, 'Matrix Reloaded (2003)', '<p><strong>Ano de Lançamento</strong>: 2003</p><p><a href="magnet:?xt=urn:btih:ffffffffffffffffffffffffffffffffffffffff&amp;dn=Reloaded+1080p+Dublado">1080p</a></p>');
  const byYear = runtime(serve({
    movie: moviePayload({ imdb: null, original: 'The Matrix' }),
    bySearch: { matrix: [matrixPost(), reloaded] },
  }));
  const movies = await byYear.getStreams('603', 'movie', null, null);
  assert.deepEqual(movies.map((item) => item.infoHash).sort(), [HEX_1080, HEX_720].sort());
  assert.equal(byYear.calls.some((call) => new URL(call.url).hostname === 'filmestorrent.tv' && new URL(call.url).searchParams.get('search') === 'the matrix'), false);

  const wrong = post(3, 'Breaking Bad 2ª Temporada (2009)', '<p><strong>IMDb</strong>: <a href="https://www.imdb.com/title/tt0000001/">x</a></p><p><a href="magnet:?xt=urn:btih:abababababababababababababababababababab&amp;dn=Outro+720p+Dublado">720p</a></p>');
  const bareHtml = fixture('season-pack.html').replace(/<a href="http:\/\/www\.imdb\.com\/title\/tt0903747\/">9,5<\/a>/, '9,5');
  const byImdb = runtime(serve({
    series: seriesPayload(),
    bySearch: {
      tt0903747: [],
      'breaking bad 2 temporada': [wrong, post(4, 'Breaking Bad 2ª Temporada (2009)', bareHtml)],
    },
    torrents: torrentsOf(),
  }));
  const episodes = await byImdb.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(episodes.map((item) => item.infoHash), [PACK]);
  assert.equal(/imdb\.com\/title\//.test(bareHtml), false);
});

// --- Rede Comando: catálogos Comando, Mestre dos Filmes e Torrent dos Filmes ---

const trilogyPost = () => post(185464, 'Matrix Trilogia Dual Áudio 1080p Torrent (1999)',
  '<p><strong>IMDb</strong>: <a href="https://www.imdb.com/title/tt0133093/">8,7</a></p>' +
  '<p><a href="magnet:?xt=urn:btih:498ddeca847fba8ea6bf2bf2279b89c4771742a7&amp;dn=Matrix+Trilogia+1080p+Dual">1080p</a></p>');
const exclusivePost = () => post(90001, 'Matrix 4K Dual Áudio Torrent (1999)',
  '<p><strong>IMDb</strong>: <a href="https://www.imdb.com/title/tt0133093/">8,7</a></p>' +
  '<p><a href="magnet:?xt=urn:btih:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&amp;dn=Matrix+2160p+4K+Dual+Audio">4K</a></p>');

test('rede: mesmo torrent nos dois catálogos aparece uma vez e o exclusivo do Mestre entra', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [matrixPost()] },
    mestre: (search) => ({ body: search === 'tt0133093' ? [matrixPost(), exclusivePost(), trilogyPost()] : [] }),
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.deepEqual(streams.map((item) => item.infoHash).sort(), [HEX_1080, HEX_720, 'e'.repeat(40)].sort());
  const exclusive = streams.find((item) => item.infoHash === 'e'.repeat(40));
  assert.equal(exclusive.provider, 'Mestre dos Filmes');
  assert.equal(exclusive.name, 'Filmestorrent 4K\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/? 🔍 Mestre dos Filmes\n📁 Matrix 2160p 4K Dual Audio');
  assert.equal(streams.find((item) => item.infoHash === HEX_720).provider, 'Comando', 'repetido fica com o catálogo Comando');
  assert.ok(app.logs.log.some((message) => /^\[Filmestorrent\/Mestre dos Filmes\] Post 185464 descartado por triagem: coleção de filmes/.test(message)));
  assert.equal(app.logs.warn.length, 0);
  assert.equal(app.logs.error.length, 0);
});

test('rede: mesmo pacote nos dois catálogos vira um único torrent://', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [packPost()] },
    mestre: (search) => ({ body: search === 'tt0903747' ? [packPost()] : [] }),
    torrents: torrentsOf(),
  }));
  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(streams.map((item) => item.url), [`torrent://${PACK}/12`]);
});

test('rede: falha total de um catálogo não derruba o outro', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [matrixPost()] },
    mestre: () => ({ status: 503, body: 'indisponível' }),
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.deepEqual(streams.map((item) => item.infoHash).sort(), [HEX_1080, HEX_720].sort());
  assert.equal(app.logs.warn.length, 1);
  assert.match(app.logs.warn[0], /^\[Filmestorrent\] Catálogo descartado: Mestre dos Filmes: Todos os domínios falharam/);
  assert.equal(app.logs.error.length, 0);
});

test('rede: falha dos três catálogos devolve vazio com erro de cada um', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    fail: () => ({ status: 500, body: 'erro' }),
    mestre: () => ({ status: 500, body: 'erro' }),
    torrentdosfilmes: () => ({ status: 500, body: 'erro' }),
  }));
  assert.deepEqual(await app.getStreams('603', 'movie', null, null), []);
  assert.equal(app.logs.error.length, 1);
  assert.match(app.logs.error[0], /^\[Filmestorrent\] Comando: Todos os domínios falharam/);
  assert.match(app.logs.error[0], /; Mestre dos Filmes: Todos os domínios falharam/);
  assert.match(app.logs.error[0], /; Torrent dos Filmes: Todos os domínios falharam/);
  assert.equal(app.logs.warn.length, 0);
});

test('rede: três catálogos repetem o mesmo torrent uma vez, com prioridade Comando, Mestre e Torrent dos Filmes', async () => {
  const onlyMestreAndTdf = exclusivePost(); // hash eeee…: Mestre e Torrent dos Filmes
  const onlyTdf = post(90002, 'Matrix 480p Dublado Torrent (1999)',
    '<p><strong>IMDb</strong>: <a href="https://www.imdb.com/title/tt0133093/">8,7</a></p>' +
    '<p><a href="magnet:?xt=urn:btih:dddddddddddddddddddddddddddddddddddddddd&amp;dn=Matrix+480p+Dublado">480p</a></p>');
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [matrixPost()] },
    mestre: (search) => ({ body: search === 'tt0133093' ? [onlyMestreAndTdf] : [] }),
    torrentdosfilmes: (search) => ({ body: search === 'tt0133093' ? [matrixPost(), onlyMestreAndTdf, onlyTdf] : [] }),
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.deepEqual(
    streams.map((item) => item.infoHash).sort(),
    [HEX_1080, HEX_720, 'd'.repeat(40), 'e'.repeat(40)].sort(),
  );
  assert.equal(streams.find((item) => item.infoHash === HEX_1080).provider, 'Comando');
  assert.equal(streams.find((item) => item.infoHash === HEX_720).provider, 'Comando');
  assert.equal(streams.find((item) => item.infoHash === 'e'.repeat(40)).provider, 'Mestre dos Filmes');
  const novo = streams.find((item) => item.infoHash === 'd'.repeat(40));
  assert.equal(novo.provider, 'Torrent dos Filmes');
  assert.match(novo.name, /🔍 Torrent dos Filmes/);
  assert.equal(app.logs.warn.length, 0);
  assert.equal(app.logs.error.length, 0);
});

test('rede: mesmo pacote nos três catálogos vira um único torrent://', async () => {
  const app = runtime(serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [packPost()] },
    mestre: (search) => ({ body: search === 'tt0903747' ? [packPost()] : [] }),
    torrentdosfilmes: (search) => ({ body: search === 'tt0903747' ? [packPost()] : [] }),
    torrents: torrentsOf(),
  }));
  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(streams.map((item) => item.url), [`torrent://${PACK}/12`]);
  assert.equal(streams[0].provider, 'Comando');
});

test('rede: mesmo hash com índices diferentes entre catálogos permanece como opções distintas', async () => {
  const otherIndex = torrent(['S02E03.mkv', 'S02E01.mkv'], [FILE_BYTES, 1000]);
  let packFetches = 0;
  const route = serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [packPost()] },
    torrentdosfilmes: (search) => ({ body: search === 'tt0903747' ? [packPost()] : [] }),
    torrents: torrentsOf(),
  });
  const app = runtime((url, init) => {
    if (url.hostname === 'itorrents.org' && url.pathname.endsWith(`${PACK.toUpperCase()}.torrent`)) {
      packFetches += 1;
      return { bytes: packFetches === 1 ? PACK_TORRENT : otherIndex, body: '' };
    }
    return route(url, init);
  });
  const streams = await app.getStreams('1396', 'tv', 2, 3);
  assert.deepEqual(streams.map((item) => item.url).sort(), [`torrent://${PACK}/0`, `torrent://${PACK}/12`].sort());
  assert.equal(new Set(streams.map((item) => item.infoHash)).size, 1);
  assert.deepEqual(streams.map((item) => item.provider).sort(), ['Comando', 'Torrent dos Filmes']);
});

test('rede: lista vazia válida nos três catálogos devolve vazio sem aviso nem erro', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [], matrix: [] },
  }));
  assert.deepEqual(await app.getStreams('603', 'movie', null, null), []);
  assert.equal(postsCalled(app, 'torrentdosfilmes-v2.xyz').length >= 1, true);
  assert.equal(app.logs.warn.length, 0);
  assert.equal(app.logs.error.length, 0);
});

for (const [rotulo, resposta] of [
  ['HTTP 503', { status: 503, body: 'indisponível' }],
  ['HTML que não é lista JSON', { status: 200, body: '<html>lander</html>' }],
  ['JSON que não é lista', { status: 200, body: { code: 'rest_no_route' } }],
]) {
  test(`rede: Torrent dos Filmes com ${rotulo} preserva os demais streams e registra o aviso`, async () => {
    const app = runtime(serve({
      movie: moviePayload(),
      bySearch: { tt0133093: [matrixPost()] },
      torrentdosfilmes: () => resposta,
    }));
    const streams = await app.getStreams('603', 'movie', null, null);
    assert.deepEqual(streams.map((item) => item.infoHash).sort(), [HEX_1080, HEX_720].sort());
    assert.equal(app.logs.warn.length, 1);
    assert.match(app.logs.warn[0], /^\[Filmestorrent\] Catálogo descartado: Torrent dos Filmes: Todos os domínios falharam/);
    assert.equal(app.logs.error.length, 0);
  });
}

test('rede: falhas simultâneas de Mestre e Torrent dos Filmes preservam o Comando e avisam cada uma', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [matrixPost()] },
    mestre: () => ({ status: 500, body: 'erro' }),
    torrentdosfilmes: () => ({ status: 500, body: 'erro' }),
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.deepEqual(streams.map((item) => item.infoHash).sort(), [HEX_1080, HEX_720].sort());
  assert.equal(app.logs.warn.length, 2);
  assert.match(app.logs.warn.join('\n'), /Catálogo descartado: Mestre dos Filmes:/);
  assert.match(app.logs.warn.join('\n'), /Catálogo descartado: Torrent dos Filmes:/);
  assert.equal(app.logs.error.length, 0);
});

test('rede: só o Torrent dos Filmes responde e entrega os streams, com os outros dois avisados', async () => {
  const app = runtime(serve({
    movie: moviePayload(),
    fail: () => ({ status: 500, body: 'erro' }),
    mestre: () => ({ status: 500, body: 'erro' }),
    torrentdosfilmes: (search) => ({ body: search === 'tt0133093' ? [matrixPost()] : [] }),
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.deepEqual(streams.map((item) => item.infoHash).sort(), [HEX_1080, HEX_720].sort());
  assert.ok(streams.every((item) => item.provider === 'Torrent dos Filmes'));
  assert.equal(app.logs.warn.length, 2);
  assert.equal(app.logs.error.length, 0);
});

test('rede: catálogo Comando usa os cinco domínios na ordem, só por falha', async () => {
  const down = new Set(['filmestorrent.tv', 'filmestorrent.club', 'comando1.com']);
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [matrixPost()] },
    fail: (host) => (down.has(host) ? { status: 200, body: '<html>lander</html>' } : null),
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 2);
  const hosts = app.calls.map((call) => new URL(call.url).hostname).filter((host) => !['mestredosfilmes.top', 'torrentdosfilmes-v2.xyz', 'api.themoviedb.org'].includes(host));
  assert.deepEqual(hosts, ['filmestorrent.tv', 'filmestorrent.club', 'comando1.com', 'comandotorrents.co']);
});

test('release sem qualidade reconhecida permanece na lista com Desconhecida', async () => {
  const html = '<p><strong>IMDb</strong>: <a href="https://www.imdb.com/title/tt0133093/">8.7</a></p><p><a href="magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&amp;dn=Matrix+Sem+Qualidade+Dublado">Download</a></p>';
  const app = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [post(1, 'Matrix (1999)', html)] },
  }));
  const streams = await app.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].name, 'Filmestorrent Desconhecida\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 Comando\n📁 Matrix Sem Qualidade Dublado');
  assert.equal(streams[0].title, '🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 Comando\n📁 Matrix Sem Qualidade Dublado');

  const prismApp = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [post(1, 'Matrix (1999)', html)] },
  }), codes.prism);
  const prismStreams = await prismApp.getStreams('603', 'movie', null, null);
  assert.equal(prismStreams[0].quality, 'Desconhecida');
  assert.equal(prismStreams[0].name, '❓ Desconhecida\n🎬 Matrix (1999)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?\n📡 Comando');
  assert.equal(prismStreams[0].title, '🎬 Matrix (1999)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?\n📡 Comando\n🔍Filmestorrent');
});

test('formatação no template Prism gera cabeçalho e linhas específicas de filme e série', async () => {
  const movieApp = runtime(serve({
    movie: moviePayload(),
    bySearch: { tt0133093: [matrixPost()] },
  }), codes.prism);
  const movieStreams = await movieApp.getStreams('603', 'movie', null, null);
  assert.equal(movieStreams[0].name, '🚀 FHD 1080p\n🎬 Matrix (1999)\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 🌱 ?/?\n📡 Comando');
  assert.equal(movieStreams[0].title, '🎬 Matrix (1999)\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 📦 2.03 GB 🌱 ?/?\n📡 Comando\n🔍Filmestorrent');

  const seriesApp = runtime(serve({
    series: seriesPayload(),
    bySearch: { tt0903747: [packPost()] },
    torrents: torrentsOf(),
  }), codes.prism);
  const seriesStreams = await seriesApp.getStreams('1396', 'tv', 2, 3);
  assert.equal(seriesStreams[0].name, '💿 HD 720p\n🎬 Breaking Bad (2008) T02E03\n🗣️ Dublado\n🧲 P2P 📦 pacote 4.8 GB 🌱 ?/?\n📡 Comando');
  assert.equal(seriesStreams[0].title, '🎬 Breaking Bad (2008) T02E03\n🗣️ Dublado\n🧲 P2P 📦 1.50 GB / 4.8 GB 🌱 ?/?\n📡 Comando\n🔍Filmestorrent');
});
