import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyMagnetOption,
  episodeTarget,
  formatBytes,
  humanSize,
  infoHashFromBtih,
  isCollectionTitle,
  magnetParam,
  qualityFromTexts,
  readMagnet,
  resolveTorrentOptions,
  seasonNumbers,
  splitSizes,
} from '../../../src/_blocks/torrent-release/index.mjs';
import { resetAutoTemplate } from '../../../src/_blocks/custom-formatter/index.mjs';

const HEX = '51ca3ba90f04bf50394e9eb7e448ceea214d5ad6';
const PACK = 'f32eb77f755f0d349271a74e930b1cc4bb37bb49';
const MOVIE = { title: 'Matrix', originalTitle: 'The Matrix', alternativeTitles: [], year: 1999, imdbId: 'tt0133093' };
const SERIES = { title: 'Breaking Bad', originalTitle: 'Breaking Bad', alternativeTitles: [], year: 2008, imdbId: 'tt0903747' };
const MOVIE_REQUEST = { mediaType: 'movie', season: null, episode: null };
const SERIES_REQUEST = { mediaType: 'tv', season: 2, episode: 3 };

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

const PACK_TORRENT = encode({
  info: {
    name: 'Pack',
    files: [
      { length: 400, path: ['2 - Grilled.mp4'] },
      { length: 1610612736, path: ['3 - Bit by a Dead Bee.mp4'] },
    ],
  },
});

async function withNetwork(route, run) {
  const original = { fetch: globalThis.fetch, log: console.log, warn: console.warn };
  const logs = { log: [], warn: [] };
  globalThis.fetch = async (url) => {
    const result = route(new URL(url));
    if (result instanceof Error) throw result;
    const status = result.status || 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      url: String(url),
      arrayBuffer: async () => result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength),
    };
  };
  console.log = (message) => logs.log.push(String(message));
  console.warn = (message) => logs.warn.push(String(message));
  try {
    return await run(logs);
  } finally {
    globalThis.fetch = original.fetch;
    console.log = original.log;
    console.warn = original.warn;
  }
}

test('infoHashFromBtih normaliza hex maiúsculo, converte base32 e rejeita alfabeto inválido', () => {
  assert.equal(infoHashFromBtih(HEX.toUpperCase()), HEX);
  assert.equal(infoHashFromBtih('tg4qittt7aulezavga3sya5fglaejhyc'), '99b9044e73f828b2641530372c03a532c0449f02');
  assert.equal(infoHashFromBtih('f6to4nqwsh6qwv2l6jskcspg7imtril6'), '2fa6ee361691fd0b574bf264a149e6fa1938a17e');
  assert.equal(infoHashFromBtih('hiu2she5ozx6zi3xl57ih7lrnogs6aez'), '3a29a91c9d766feca3775f7e83fd716b8d2f0099');
  assert.throws(() => infoHashFromBtih('1'.repeat(32)), /hash base32 inválido/);
  assert.throws(() => infoHashFromBtih('curto'), /hash btih inválido/);
});

test('readMagnet e magnetParam extraem dn, xl e acrescentam trackers padrão quando solicitado', () => {
  const raw = 'magnet:?xt=urn:btih:tg4qittt7aulezavga3sya5fglaejhyc&dn=Matrix+1080p&xl=2179072000';
  const parsed = readMagnet(raw, { addFallbackTrackers: true });
  assert.equal(parsed.hash, '99b9044e73f828b2641530372c03a532c0449f02');
  assert.equal(parsed.dn, 'Matrix 1080p');
  assert.equal(parsed.xl, '2179072000');
  assert.match(parsed.href, /^magnet:\?xt=urn:btih:99b9044e73f828b2641530372c03a532c0449f02&/);
  assert.match(parsed.href, /opentrackr/);
  assert.equal(magnetParam(raw, 'xl'), '2179072000');
  assert.throws(() => readMagnet('https://example.com'), /link magnet inválido/);
  assert.throws(() => readMagnet('magnet:?dn=SemHash'), /magnet sem xt=urn:btih/);
});

test('isCollectionTitle detecta trilogia e todos os filmes, mas ignora Tri Áudio', () => {
  assert.equal(isCollectionTitle('Matrix - Trilogia 1080p'), true);
  assert.equal(isCollectionTitle('Matrix - Todos os Filmes (1999)'), true);
  assert.equal(isCollectionTitle('Matrix (Tri Áudio) (1999)'), false);
});

test('seasonNumbers e episodeTarget cobrem temporada, avulso, lista e faixa', () => {
  assert.deepEqual(seasonNumbers('Breaking Bad 2ª Temporada (2009)'), [2]);
  assert.deepEqual(seasonNumbers('Breaking Bad 1ª até 3ª Temporada'), [1, 2, 3]);
  assert.deepEqual(seasonNumbers('Temporada 720p'), []);
  assert.deepEqual(episodeTarget('03º EPISÓDIO DUBLADO 1080P'), { kind: 'single', episodes: [3] });
  assert.deepEqual(episodeTarget('01º E 02º EPISÓDIO'), { kind: 'range', episodes: [1, 2] });
  assert.deepEqual(episodeTarget('01º AO 04º EPISÓDIO'), { kind: 'range', episodes: [1, 2, 3, 4] });
  assert.deepEqual(episodeTarget('Show.S02E03-E04.1080p'), { kind: 'range', season: 2, episodes: [3, 4] });
  assert.equal(episodeTarget('2ª TEMPORADA COMPLETA'), null);
});

test('qualityFromTexts, languageFromTexts e tamanhos normalizam variações da rede', () => {
  assert.equal(qualityFromTexts(['DOWNLOAD TORRENT DUBLADO MP4720P']), '720p');
  assert.equal(qualityFromTexts(['CAM CINEMA 1080P']), 'CAM');
  assert.equal(qualityFromTexts(['2160P ULTRA HD 4K']), '4K');
  assert.throws(() => qualityFromTexts(['SEM QUALIDADE']), /qualidade não reconhecida/);


  assert.equal(humanSize('DUBLADO 720P / 796 MB'), '796 MB');
  assert.deepEqual(splitSizes('796 MB | 2,03 GB'), ['796 MB', '2.03 GB']);
  assert.equal(formatBytes(1610612736), '1.50 GB');
});

test('classifyMagnetOption e resolveTorrentOptions resolvem filme, pacote e erro isolado', async () => {
  const validMovie = classifyMagnetOption({
    href: `magnet:?xt=urn:btih:${HEX}&dn=Matrix+720p+Dublado`,
    labelText: 'DUBLADO 720P / 796 MB',
  }, MOVIE, MOVIE_REQUEST);
  const badHash = classifyMagnetOption({
    href: 'magnet:?xt=urn:btih:11111111111111111111111111111111&dn=Ruim+1080p',
    labelText: 'DUBLADO 1080P',
  }, MOVIE, MOVIE_REQUEST);

  await withNetwork(() => assert.fail('fetch inesperado'), async (logs) => {
    const streams = await resolveTorrentOptions([validMovie, badHash], {
      logPrefix: 'Teste',
      streamLabel: 'Teste',
      provider: 'origem',
    });
    assert.equal(streams.length, 1);
    assert.equal(streams[0].infoHash, HEX);
    assert.equal(streams[0].provider, 'origem');
    assert.equal(streams[0].size, '796 MB');
    assert.equal(logs.warn.length, 1);
  });

  const packOption = classifyMagnetOption({
    href: `magnet:?xt=urn:btih:${PACK}&dn=Breaking+Bad+S02+720p+Dublado`,
    labelText: '2ª TEMPORADA COMPLETA 720P DUBLADO',
  }, SERIES, SERIES_REQUEST);

  await withNetwork(() => ({ bytes: PACK_TORRENT }), async () => {
    const streams = await resolveTorrentOptions([packOption], {
      logPrefix: 'Teste',
      streamLabel: 'Teste',
      provider: 'origem',
    });
    assert.equal(streams.length, 1);
    assert.equal(streams[0].url, `torrent://${PACK}/1`);
    assert.equal(streams[0].size, '1.50 GB');
  });
});

// --- formatador obrigatório (bloco custom-formatter) ---

const CONFIG = { logPrefix: 'Teste', streamLabel: 'Teste', provider: 'origem' };

test('resolveTorrentOptions: magnet com dn vira o arquivo exibido e streamLabel é o addon', async () => {
  const option = classifyMagnetOption({
    href: `magnet:?xt=urn:btih:${HEX}&dn=Matrix.1999.720p.Dublado`,
    labelText: 'DUBLADO 720P / 796 MB',
  }, MOVIE, MOVIE_REQUEST);

  await withNetwork(() => assert.fail('fetch inesperado'), async () => {
    resetAutoTemplate(() => 0);
    const [stream] = await resolveTorrentOptions([option], CONFIG);
    assert.equal(stream.name, 'Teste 720p\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 origem\n📁 Matrix.1999.720p.Dublado');
    assert.equal(stream.title, '🗣️ Dublado\n🧲 P2P 📦 796 MB 👥 ?/? 🔍 origem\n📁 Matrix.1999.720p.Dublado');
    assert.equal(stream.provider, 'origem');
    assert.equal(stream.infoHash, HEX);
    assert.equal('format' in stream, false);
  });
});

test('resolveTorrentOptions: pacote gera arquivo, pasta e tamanho do pacote', async () => {
  const option = classifyMagnetOption({
    href: `magnet:?xt=urn:btih:${PACK}&dn=Breaking.Bad.S02.720p.Dublado`,
    labelText: '2ª TEMPORADA COMPLETA 720P DUBLADO 4.2 GB',
  }, SERIES, SERIES_REQUEST);

  await withNetwork(() => ({ bytes: PACK_TORRENT }), async () => {
    resetAutoTemplate(() => 0);
    const [gdrive] = await resolveTorrentOptions([option], CONFIG);
    assert.equal(gdrive.url, `torrent://${PACK}/1`);
    assert.equal(gdrive.title, '🗣️ Dublado\n🧲 P2P 📦 1.50 GB / 4.2 GB 👥 ?/? 🔍 origem\n📁 Breaking.Bad.S02.720p.Dublado/3 - Bit by a Dead Bee.mp4');

    resetAutoTemplate(() => 0.99);
    const [prism] = await resolveTorrentOptions([option], CONFIG);
    assert.equal(prism.name, '💿 HD 720p\n🎬 Breaking Bad (2008) T02E03\n🗣️ Dublado\n🧲 P2P 📦 pacote 4.2 GB 🌱 ?/?\n📡 origem');
    assert.equal(prism.title.split('\n')[0], '🎬 Breaking Bad (2008) T02E03');
    assert.equal(prism.title.split('\n')[1], '🗣️ Dublado');
    assert.equal(prism.title.split('\n')[2], '🧲 P2P 📦 1.50 GB / 4.2 GB 🌱 ?/?');
  });
});

test('resolveTorrentOptions: release sem qualidade continua na lista com Desconhecida', async () => {
  const option = classifyMagnetOption({
    href: `magnet:?xt=urn:btih:${HEX}&dn=Matrix.1999.Dublado`,
    labelText: 'DUBLADO / 796 MB',
  }, MOVIE, MOVIE_REQUEST);

  await withNetwork(() => assert.fail('fetch inesperado'), async () => {
    resetAutoTemplate(() => 0);
    const [stream] = await resolveTorrentOptions([option], CONFIG);
    assert.equal(stream.quality, 'Desconhecida');
    assert.equal(stream.name, 'Teste Desconhecida\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 origem\n📁 Matrix.1999.Dublado');
  });
});

test('resolveTorrentOptions: streamLabel ausente falha', async () => {
  const option = classifyMagnetOption({ href: `magnet:?xt=urn:btih:${HEX}&dn=Matrix.720p`, labelText: '720P' }, MOVIE, MOVIE_REQUEST);
  await withNetwork(() => assert.fail('fetch inesperado'), async () => {
    await assert.rejects(resolveTorrentOptions([option], { logPrefix: 'Teste' }), /config deve informar logPrefix e streamLabel/);
  });
});
