import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchTorrentFiles, findEpisodeFile } from '../../../src/_blocks/torrent-files/index.mjs';

const HASH = 'f32eb77f755f0d349271a74e930b1cc4bb37bb49';

// Ordem real do pacote de Breaking Bad T2 (experimento de 2026-11-07): índice 0 = episódio 2.
const REAL_PACK = [
  '2 - Grilled.mp4', '13 - ABQ.mp4', '4 - Down.mp4', '12 - Phoenix.mp4', '10 - Over.mp4',
  '5 - Breakage.mp4', '6 - Peekaboo.mp4', '8 - Better Call Saul.mp4', '11 - Mandala.mp4',
  '9 - 4 Days Out.mp4', '7 - Negro y Azul.mp4', '1 - Seven Thirty-Seven.mp4', '3 - Bit by a Dead Bee.mp4',
  'Capa Bluray.jpg', 'pirate.jpg', "LEIA  ' www.ThePirateFilmes.com.txt",
];

/** Codifica bencode; strings viram bytes UTF-8, `Uint8Array` passa como está. */
function encode(value) {
  if (Number.isInteger(value)) return bytes(`i${value}e`);
  if (value instanceof Uint8Array) return concat([bytes(`${value.length}:`), value]);
  if (typeof value === 'string') return encode(new TextEncoder().encode(value));
  if (Array.isArray(value)) return concat([bytes('l'), ...value.map(encode), bytes('e')]);
  const keys = Object.keys(value).sort();
  return concat([bytes('d'), ...keys.flatMap((key) => [encode(key), encode(value[key])]), bytes('e')]);
}

function bytes(text) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function multiFile(paths, name = 'Breaking Bad 2 Temporada') {
  return encode({
    announce: 'udp://tracker.example:80/announce',
    info: { name, 'piece length': 262144, pieces: 'x', files: paths.map((path, i) => ({ length: 1000 + i, path: path.split('/') })) },
  });
}

function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return Promise.resolve(run(calls)).finally(() => {
    globalThis.fetch = original;
  });
}

function torrentResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
}

function files(paths) {
  return paths.map((path, index) => ({ index, path, size: 1000 + index }));
}

// --- fetchTorrentFiles ---

test('fetchTorrentFiles: lê a lista na ordem do .torrent pelo cache itorrents com hash maiúsculo', async () => {
  await withFetch(() => torrentResponse(multiFile(REAL_PACK)), async (calls) => {
    const list = await fetchTorrentFiles(HASH);

    assert.equal(calls[0].url, `https://itorrents.org/torrent/${HASH.toUpperCase()}.torrent`);
    assert.ok(calls[0].init.headers['User-Agent']);
    assert.equal(list.length, 16);
    assert.deepEqual(list[0], { index: 0, path: '2 - Grilled.mp4', size: 1000 });
    assert.deepEqual(list[12], { index: 12, path: '3 - Bit by a Dead Bee.mp4', size: 1012 });
  });
});

test('fetchTorrentFiles: junta as pastas do caminho com "/" e decodifica UTF-8', async () => {
  await withFetch(() => torrentResponse(multiFile(['Temporada 2/Episódio 03.mkv'])), async () => {
    assert.deepEqual(await fetchTorrentFiles(HASH), [{ index: 0, path: 'Temporada 2/Episódio 03.mkv', size: 1000 }]);
  });
});

test('fetchTorrentFiles: caminho em latin1 (UTF-8 inválido) vira texto latin1', async () => {
  const latin1Name = Uint8Array.from([0x45, 0x70, 0x69, 0x73, 0xf3, 0x64, 0x69, 0x6f, 0x2e, 0x6d, 0x6b, 0x76]); // "Episódio.mkv" em latin1
  const body = encode({ info: { name: 'x', files: [{ length: 5, path: [latin1Name] }] } });
  await withFetch(() => torrentResponse(body), async () => {
    assert.equal((await fetchTorrentFiles(HASH))[0].path, 'Episódio.mkv');
  });
});

test('fetchTorrentFiles: torrent de arquivo único devolve um item com o name', async () => {
  const body = encode({ info: { name: 'Filme.2024.1080p.mkv', length: 4096, 'piece length': 1, pieces: 'x' } });
  await withFetch(() => torrentResponse(body), async () => {
    assert.deepEqual(await fetchTorrentFiles(HASH), [{ index: 0, path: 'Filme.2024.1080p.mkv', size: 4096 }]);
  });
});

const FETCH_ERRORS = [
  { label: 'HTTP 404', response: () => torrentResponse(new Uint8Array(), 404), error: /HTTP 404 em https:\/\/itorrents\.org/ },
  { label: 'sem arrayBuffer', response: () => ({ ok: true, status: 200 }), error: /arrayBuffer indisponível/ },
  { label: 'HTML no lugar do .torrent', response: () => torrentResponse(bytes('<html>bloqueado</html>')), error: /\.torrent inválido/ },
  { label: 'bencode truncado', response: () => torrentResponse(bytes('d4:infod5:files')), error: /\.torrent inválido/ },
  { label: 'sem info', response: () => torrentResponse(encode({ announce: 'x' })), error: /sem "info"/ },
  { label: 'arquivo sem path', response: () => torrentResponse(encode({ info: { name: 'x', files: [{ length: 1 }] } })), error: /info\.files\[0\] sem path/ },
];

for (const { label, response, error } of FETCH_ERRORS) {
  test(`fetchTorrentFiles: lança erro (${label})`, async () => {
    await withFetch(response, async () => {
      await assert.rejects(fetchTorrentFiles(HASH), error);
    });
  });
}

for (const hash of ['abc', 'ZHQVOY7XELZD5GFCTXW574RUDOMNGMCW', undefined]) {
  test(`fetchTorrentFiles: hash inválido lança antes da rede (${String(hash)})`, async () => {
    await withFetch(() => assert.fail('fetch inesperado'), async () => {
      await assert.rejects(fetchTorrentFiles(hash), /hexadecimal de 40 caracteres/);
    });
  });
}

// --- findEpisodeFile ---

test('findEpisodeFile: pacote real acha o episódio pelo número no início do nome', () => {
  const list = files(REAL_PACK);
  assert.equal(findEpisodeFile(list, { season: 2, episode: 3, seasonPack: true }), 12);
  assert.equal(findEpisodeFile(list, { season: 2, episode: 1, seasonPack: true }), 11);
  assert.equal(findEpisodeFile(list, { season: 2, episode: 13, seasonPack: true }), 1);
});

test('findEpisodeFile: número sozinho não vale fora de pacote da temporada', () => {
  assert.equal(findEpisodeFile(files(REAL_PACK), { season: 2, episode: 3, seasonPack: false }), null);
});

const PATTERN_CASES = [
  ['S02E03', 'Show.S02E03.1080p.WEB-DL.mkv', false],
  ['S2E3', 'Show S2E3 720p.mp4', false],
  ['T02E03', 'Serie.T02E03.Dublado.mkv', false],
  ['2x03', 'Serie 2x03 - Titulo.avi', false],
  ['pasta com SxxEyy', 'Show S02E03 1080p/video.mkv', false],
  ['E03', 'Serie.E03.mkv', true],
  ['Ep 03', 'Serie - Ep 03.mkv', true],
  ['Episódio 03', 'Episódio 03.mkv', true],
  ['Episode 3', 'Episode 3.mp4', true],
  ['03 - Título', '03 - Titulo.mkv', true],
  ['3. Título', '3. Titulo.mp4', true],
  ['03_Título', '03_Titulo.m4v', true],
];

for (const [label, path, seasonPack] of PATTERN_CASES) {
  test(`findEpisodeFile: reconhece ${label}`, () => {
    const list = files(['Outro.S02E04.mkv', path, 'Capa.jpg']);
    assert.equal(findEpisodeFile(list, { season: 2, episode: 3, seasonPack }), 1);
  });
}

test('findEpisodeFile: temporada explícita diferente não serve, mesmo em pacote', () => {
  assert.equal(findEpisodeFile(files(['Show.S01E03.mkv']), { season: 2, episode: 3, seasonPack: true }), null);
});

test('findEpisodeFile: faixa de episódios conta só se contiver o pedido', () => {
  const list = files(['Show.S02E01-E04.mkv']);
  assert.equal(findEpisodeFile(list, { season: 2, episode: 3, seasonPack: false }), 0);
  assert.equal(findEpisodeFile(list, { season: 2, episode: 5, seasonPack: false }), null);
});

test('findEpisodeFile: ignora amostra, não vídeo, resolução e ano', () => {
  const list = files(['Sample/Show.S02E03.sample.mkv', 'Show.S02E03.nfo', '1080p.mkv', '2009 - Making of.mkv', 'Show.S02E03.mkv']);
  assert.equal(findEpisodeFile(list, { season: 2, episode: 3, seasonPack: true }), 4);
});

test('findEpisodeFile: dois candidatos ou nenhum devolvem null', () => {
  const twice = files(['Show.S02E03.720p.mkv', 'Show.S02E03.1080p.mkv']);
  assert.equal(findEpisodeFile(twice, { season: 2, episode: 3, seasonPack: true }), null);
  assert.equal(findEpisodeFile(files(['Capa.jpg', 'Leia.txt']), { season: 2, episode: 3, seasonPack: true }), null);
});

for (const [label, list, target, error] of [
  ['files não é lista', null, { season: 2, episode: 3, seasonPack: true }, /files deve ser lista/],
  ['season zero', [], { season: 0, episode: 3, seasonPack: true }, /season deve ser inteiro positivo/],
  ['episode em texto', [], { season: 2, episode: '3', seasonPack: true }, /episode deve ser inteiro positivo/],
  ['seasonPack ausente', [], { season: 2, episode: 3 }, /seasonPack deve ser booleano/],
  ['arquivo sem index', [{ path: 'a.mkv' }], { season: 2, episode: 3, seasonPack: true }, /files\[0\] deve ter path/],
]) {
  test(`findEpisodeFile: lança erro (${label})`, () => {
    assert.throws(() => findEpisodeFile(list, target), error);
  });
}
