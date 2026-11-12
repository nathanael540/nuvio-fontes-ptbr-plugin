import test from 'node:test';
import assert from 'node:assert/strict';

import { collectWordpressTorrents } from '../../../src/_blocks/wordpress-torrent/index.mjs';
import { resetAutoTemplate } from '../../../src/_blocks/custom-formatter/index.mjs';

const HEX = '51ca3ba90f04bf50394e9eb7e448ceea214d5ad6';
const PACK = 'f32eb77f755f0d349271a74e930b1cc4bb37bb49';
const CATALOG = { name: 'Exemplo', origins: ['https://a.example', 'https://b.example'], logPrefix: 'Exemplo', streamLabel: 'Exemplo' };
const MOVIE = { title: 'Matrix', originalTitle: 'The Matrix', alternativeTitles: [], year: 1999, imdbId: 'tt0133093' };
const SERIES = { title: 'Breaking Bad', originalTitle: 'Breaking Bad', alternativeTitles: [], year: 2008, imdbId: 'tt0903747' };
const MOVIE_REQUEST = { mediaType: 'movie', season: null, episode: null };

test.beforeEach(() => resetAutoTemplate(() => 0));

function post(id, title, html) {
  return { id, link: `https://a.example/${id}/`, title: { rendered: title }, content: { rendered: html } };
}

const imdb = (id) => `<p><strong>IMDb</strong>: <a href="https://www.imdb.com/title/${id}/">8,7</a></p>`;
const magnet = (hash, dn, label) => `<p><a href="magnet:?xt=urn:btih:${hash}&amp;dn=${dn}">${label}</a></p>`;

/** Codifica bencode mínimo para um .torrent sintético. */
function encode(value) {
  const bytes = (text) => Uint8Array.from(Buffer.from(text, 'utf8'));
  const join = (parts) => Uint8Array.from(Buffer.concat(parts.map((part) => Buffer.from(part))));
  if (Number.isInteger(value)) return bytes(`i${value}e`);
  if (typeof value === 'string') {
    const raw = bytes(value);
    return join([bytes(`${raw.length}:`), raw]);
  }
  if (Array.isArray(value)) return join([bytes('l'), ...value.map(encode), bytes('e')]);
  const keys = Object.keys(value).sort();
  return join([bytes('d'), ...keys.flatMap((key) => [encode(key), encode(value[key])]), bytes('e')]);
}

const PACK_TORRENT = encode({ info: { name: 'Pack', files: [
  { length: 400, path: ['2 - Grilled.mp4'] },
  { length: 300, path: ['3 - Bit by a Dead Bee.mp4'] },
] } });

/** Troca o fetch global por respostas controladas; devolve as URLs chamadas e os logs. */
async function withNetwork(route, run) {
  const original = { fetch: globalThis.fetch, log: console.log, warn: console.warn };
  const calls = [];
  const logs = { log: [], warn: [] };
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const result = route(new URL(url));
    if (result instanceof Error) throw result;
    const status = result.status || 200;
    const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    return {
      ok: status >= 200 && status < 300, status, url: String(url),
      text: async () => text, json: async () => JSON.parse(text),
      arrayBuffer: async () => result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength),
    };
  };
  console.log = (message) => logs.log.push(String(message));
  console.warn = (message) => logs.warn.push(String(message));
  try {
    return await run(calls, logs);
  } finally {
    Object.assign(globalThis, { fetch: original.fetch });
    console.log = original.log;
    console.warn = original.warn;
  }
}

test('catálogo inválido lança erro antes da rede', async () => {
  await withNetwork(() => assert.fail('fetch inesperado'), async () => {
    for (const catalog of [null, { ...CATALOG, name: '' }, { ...CATALOG, origins: [] }, { ...CATALOG, origins: ['https://a.example/'] }]) {
      await assert.rejects(collectWordpressTorrents(catalog, MOVIE, MOVIE_REQUEST), /catálogo/);
    }
  });
});

test('filme: rótulo e provider do catálogo; troca de domínio só por resposta que não é a lista JSON', async () => {
  await withNetwork((url) => {
    if (url.hostname === 'a.example') return { body: '<html>lander</html>' };
    return { body: [post(1, 'Matrix Dublado 720p (1999)', imdb('tt0133093') + magnet(HEX, 'Matrix+720p+Dublado', '720p'))] };
  }, async (calls) => {
    const streams = await collectWordpressTorrents(CATALOG, MOVIE, MOVIE_REQUEST);
    assert.equal(streams.length, 1);
    assert.equal(streams[0].name, 'Exemplo 720p\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 Exemplo\n📁 Matrix 720p Dublado');
    assert.equal(streams[0].title, '🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 Exemplo\n📁 Matrix 720p Dublado');
    assert.equal(streams[0].provider, 'Exemplo');
    assert.equal(streams[0].infoHash, HEX);
    assert.deepEqual(calls.map((call) => new URL(call).hostname), ['a.example', 'b.example']);
  });
});

test('filme: formato usa título e ano do TMDB e streamLabel como addon', async () => {
  await withNetwork(() => ({ body: [post(1, 'Matrix Dublado 720p (1999)', imdb('tt0133093') + magnet(HEX, 'Matrix+720p+Dublado', '720p'))] }), async () => {
    resetAutoTemplate(() => 0.99);
    const [stream] = await collectWordpressTorrents(CATALOG, MOVIE, MOVIE_REQUEST);
    assert.equal(stream.name, '💿 HD 720p\n🎬 Matrix (1999)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?\n📡 Exemplo');
    assert.equal(stream.title, '🎬 Matrix (1999)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?\n📡 Exemplo\n🔍Exemplo');
  });
});

test('lista vazia é busca válida e não troca de domínio', async () => {
  await withNetwork(() => ({ body: [] }), async (calls) => {
    assert.deepEqual(await collectWordpressTorrents(CATALOG, MOVIE, MOVIE_REQUEST), []);
    assert.ok(calls.every((call) => new URL(call).hostname === 'a.example'));
  });
});

test('todos os domínios falhando lança erro com a causa de cada um', async () => {
  await withNetwork(() => ({ status: 503, body: 'x' }), async () => {
    await assert.rejects(collectWordpressTorrents(CATALOG, MOVIE, MOVIE_REQUEST), /Todos os domínios falharam.*a\.example: HTTP 503.*b\.example: HTTP 503/);
  });
});

test('filme: coleção sai por triagem', async () => {
  await withNetwork(() => ({ body: [post(2, 'Matrix Trilogia 1080p Dual Áudio', imdb('tt0133093') + magnet(HEX, 'Trilogia+1080p', '1080p'))] }), async (_, logs) => {
    assert.deepEqual(await collectWordpressTorrents(CATALOG, MOVIE, MOVIE_REQUEST), []);
    assert.ok(logs.log.some((message) => /^\[Exemplo\] Post 2 descartado por triagem: coleção de filmes/.test(message)));
  });
});

test('hash base32 inválido descarta só a opção', async () => {
  const html = imdb('tt0133093') + magnet(HEX, 'Matrix+720p+Dublado', '720p') + magnet('1'.repeat(32), 'Matrix+1080p+Dual', '1080p');
  await withNetwork(() => ({ body: [post(3, 'Matrix 720p 1080p (1999)', html)] }), async (_, logs) => {
    const streams = await collectWordpressTorrents(CATALOG, MOVIE, MOVIE_REQUEST);
    assert.deepEqual(streams.map((stream) => stream.infoHash), [HEX]);
    assert.equal(logs.warn.length, 1);
    assert.match(logs.warn[0], /^\[Exemplo\] Opção magnet 11111111 descartada: hash btih inválido/);
  });
});

test('série: pacote da temporada vira torrent:// do arquivo do episódio', async () => {
  const html = imdb('tt0903747') + magnet(PACK, 'Breaking+Bad+2+Temporada+720p+Dublado', 'Download');
  await withNetwork((url) => {
    if (url.hostname === 'itorrents.org') return { bytes: PACK_TORRENT, body: '' };
    return { body: [post(4, 'Breaking Bad 2ª Temporada 720p Dublado (2009)', html)] };
  }, async () => {
    const streams = await collectWordpressTorrents(CATALOG, SERIES, { mediaType: 'tv', season: 2, episode: 3 });
    assert.deepEqual(streams.map((stream) => stream.url), [`torrent://${PACK}/1`]);
    assert.equal(streams[0].name, 'Exemplo 720p\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 Exemplo\n📁 3 - Bit by a Dead Bee.mp4');
  });
});

test('release sem qualidade continua na lista com Desconhecida', async () => {
  const html = imdb('tt0133093') + magnet(HEX, 'Matrix+Dublado', 'Download');
  await withNetwork(() => ({ body: [post(5, 'Matrix Dublado (1999)', html)] }), async () => {
    const streams = await collectWordpressTorrents(CATALOG, MOVIE, MOVIE_REQUEST);
    assert.equal(streams.length, 1);
    assert.equal(streams[0].quality, 'Desconhecida');
    assert.equal(streams[0].name, 'Exemplo Desconhecida\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 Exemplo\n📁 Matrix Dublado');
  });
});
