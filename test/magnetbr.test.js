const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const HEX_720 = '51ca3ba90f04bf50394e9eb7e448ceea214d5ad6';
const HEX_1080 = '8cc4fdc2c777d1464d9043397309f45859b9297b';
const HEX_4K = '96fdc513d5551feb50b955e542ad3a9acd37f361';
const BASE32_RAW = 'wt5d7ye2yneldaly33xknffywlylphvf';
const BASE32_HEX = 'b4fa3fe09ac348b18178deeea694b8b2f0b79ea5';
const UNKNOWN_HASH = '1111111111111111111111111111111111111111';
const PACK_HASH = 'f32eb77f755f0d349271a74e930b1cc4bb37bb49';
const FILE_BYTES = 1610612736; // 1.50 GB

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('magnetbr-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('magnetbr', { outDir, formatter }), 'utf8');
    }
    code = codes.gdrive;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

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

const PACK_TORRENT_S01E01 = torrent(
  ['Outro.S01E02.mkv', 'Serie.S01E01.1080p.mkv', 'Serie.S01E03.mkv'],
  [1000, FILE_BYTES, 1000],
);

const PACK_TORRENT_NO_EP = torrent(
  ['Serie.S01E02.mkv', 'Serie.S01E03.mkv'],
  [1000, 1000],
);

const PACK_TORRENT_AMBIGUOUS = torrent(
  ['Serie.S01E01.Dublado.mkv', 'Serie.S01E01.Legendado.mkv'],
  [1000, 1000],
);

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
    name: extra.name || 'The Last of Us',
    original_name: extra.original || extra.name || 'The Last of Us',
    first_air_date: `${extra.year || 2023}-01-15`,
    external_ids: { imdb_id: extra.imdb === undefined ? 'tt3581920' : extra.imdb },
    alternative_titles: { results: extra.alts || [] },
    seasons: extra.seasons !== undefined ? extra.seasons : [
      { season_number: 1, episode_count: 9, name: 'Temporada 1', air_date: `${extra.season1Year || 2023}-01-15` },
      { season_number: 2, episode_count: 7, name: 'Temporada 2', air_date: '2025-04-13' },
    ],
    original_language: 'en',
    genres: [],
    origin_country: ['US'],
  };
}

function magnetBrItem(extra = {}) {
  const hash = extra.hash !== undefined ? extra.hash : HEX_1080;
  return {
    id: extra.id !== undefined ? extra.id : 101,
    category: extra.category !== undefined ? extra.category : 'Movies',
    title: extra.title !== undefined ? extra.title : 'Matrix 1999 [1080p] [Brazilian]',
    original_title: extra.original_title !== undefined ? extra.original_title : 'The Matrix',
    title_processed: extra.title_processed !== undefined ? extra.title_processed : 'Matrix (1999) [Brazilian] [1080p]',
    title_translated_processed: extra.title_translated_processed !== undefined ? extra.title_translated_processed : 'Matrix',
    magnet_original: extra.magnet_original !== undefined ? extra.magnet_original : 'The.Matrix.1999.1080p.BluRay.x264',
    magnet_link: extra.magnet_link !== undefined
      ? extra.magnet_link
      : `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(extra.dn || 'The.Matrix.1999.1080p.BluRay.x264.mkv')}`,
    magnet: extra.magnet,
    info_hash: extra.info_hash !== undefined ? extra.info_hash : (hash.length === 40 ? hash : undefined),
    imdb: extra.imdb !== undefined ? extra.imdb : 'tt0133093',
    year: extra.year !== undefined ? extra.year : 1999,
    size: extra.size !== undefined ? extra.size : '2.5 GB',
    size_bytes: extra.size_bytes !== undefined ? extra.size_bytes : 2684354560,
    seed_count: extra.seed_count !== undefined ? extra.seed_count : 42,
    leech_count: extra.leech_count !== undefined ? extra.leech_count : 7,
    audio_tags: extra.audio_tags !== undefined ? extra.audio_tags : 'Português, Inglês',
    has_legenda: extra.has_legenda !== undefined ? extra.has_legenda : true,
    legend: extra.legend !== undefined ? extra.legend : 'Português',
    scraper_source: extra.scraper_source !== undefined ? extra.scraper_source : 'rede',
    moderation_status: 'ok',
  };
}

function runtime(route, options = {}) {
  const bundle = options.bundle || code;
  const apiKey = options.apiKey !== undefined ? options.apiKey : 'chave-secreta-tmdb-123';
  const calls = [];
  const logs = { log: [], warn: [], error: [] };
  const context = {
    module: { exports: {} },
    TMDB_API_KEY: apiKey,
    SCRAPER_ID: options.scraperId,
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
  vm.runInNewContext(bundle, context, { filename: 'magnetbr.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

test('6.1 validação de entrada e TMDB_API_KEY antes de qualquer requisição', async () => {
  const runner = runtime(() => {
    throw new Error('fetch não deve ser chamado');
  });

  assert.deepEqual(await runner.getStreams('', 'movie', null, null), []);
  assert.match(runner.logs.error[0], /\[MagnetBR\] Entrada: ID do TMDB inválido/);
  assert.deepEqual(await runner.getStreams('abc', 'movie', null, null), []);
  assert.deepEqual(await runner.getStreams('603', 'anime', null, null), []);
  assert.deepEqual(await runner.getStreams('100088', 'tv', 0, 1), []);
  assert.deepEqual(await runner.getStreams('100088', 'tv', 1, 0), []);
  assert.deepEqual(await runner.getStreams('100088', 'tv', null, 1), []);
  assert.equal(runner.calls.length, 0);

  const runnerNoKey = runtime(() => {
    throw new Error('fetch não deve ser chamado sem TMDB_API_KEY');
  }, { apiKey: '' });
  assert.deepEqual(await runnerNoKey.getStreams('603', 'movie', null, null), []);
  assert.equal(runnerNoKey.calls.length, 0);
  assert.match(runnerNoKey.logs.error[0], /TMDB_API_KEY indisponível/);
});

test('2.1 e 2.2 busca por IMDb, parada no primeiro candidato aceito e fallback por títulos sem repetição', async () => {
  const queries = [];
  const runnerImdbHit = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return {
        body: moviePayload({
          title: 'Matrix',
          original: 'The Matrix',
          alts: [{ iso_3166_1: 'BR', title: 'Matrix (1999)' }],
        }),
      };
    }
    if (url.hostname === 'magnetbr.flixbr.online') {
      queries.push(url.searchParams.get('q'));
      return {
        body: {
          count: 1,
          results: [magnetBrItem()],
          source: 'db',
        },
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runnerImdbHit.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.deepEqual(queries, ['tt0133093'], 'não deve consultar títulos quando IMDb já devolve candidato aceito');

  // Fallback quando IMDb vem vazio ou todos os itens da tentativa IMDb são triados
  const fallbackQueries = [];
  const runnerFallback = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return {
        body: moviePayload({
          title: 'Duna',
          original: 'Dune',
          imdb: 'tt1160419',
          year: 2021,
          alts: [
            { iso_3166_1: 'BR', title: 'duna' },
            { iso_3166_1: 'BR', title: 'Duna: Parte 1' },
          ],
        }),
      };
    }
    if (url.hostname === 'magnetbr.flixbr.online') {
      const q = url.searchParams.get('q');
      fallbackQueries.push(q);
      if (q === 'tt1160419') {
        // Devolve item com IMDb divergente -> descartado por triagem, deve continuar para o próximo termo!
        return {
          body: {
            count: 1,
            results: [magnetBrItem({ imdb: 'tt9999999', title: 'Duna 2021 1080p', year: 2021 })],
          },
        };
      }
      if (q === 'Duna') {
        return { body: { count: 0, results: [], queued: true } };
      }
      if (q === 'Dune') {
        return {
          body: {
            count: 1,
            results: [magnetBrItem({
              imdb: 'tt1160419',
              title: 'Dune 2021 1080p',
              original_title: 'Dune',
              magnet_original: 'Dune.2021.1080p.WEB-DL',
              dn: 'Dune.2021.1080p.WEB-DL.mkv',
              year: 2021,
            })],
          },
        };
      }
      return { body: { count: 0, results: [] } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const fallbackStreams = await runnerFallback.getStreams('438631', 'movie', null, null);
  assert.equal(fallbackStreams.length, 1);
  assert.deepEqual(fallbackQueries, ['tt1160419', 'Duna', 'Dune'], 'deve parar em Dune e não repetir Duna/duna');
});

test('2.1, 2.2 e 6.2 erro HTTP, JSON inválido ou estrutura inválida interrompe busca sem fallback; queued é ausência', async () => {
  // queued: true com count: 0 -> ausência sem erro
  const runnerQueued = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload({ imdb: null }) };
    if (url.hostname === 'magnetbr.flixbr.online') {
      return { body: { count: 0, results: [], queued: true } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });
  assert.deepEqual(await runnerQueued.getStreams('603', 'movie', null, null), []);
  assert.equal(runnerQueued.logs.error.length, 0);
  assert.equal(runnerQueued.logs.warn.length, 0);

  // HTTP 503 na primeira tentativa não aciona fallback para títulos
  const attempts503 = [];
  const runner503 = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'magnetbr.flixbr.online') {
      attempts503.push(url.searchParams.get('q'));
      return { status: 503, body: 'Service Unavailable' };
    }
    throw new Error(`URL inesperada: ${url}`);
  });
  assert.deepEqual(await runner503.getStreams('603', 'movie', null, null), []);
  assert.equal(attempts503.length, 1);
  assert.equal(runner503.logs.error.length, 1);
  assert.match(runner503.logs.error[0], /^\[MagnetBR\]/);

  // JSON inválido
  const runnerBadJson = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'magnetbr.flixbr.online') {
      return { status: 200, body: '<html>erro gateway</html>' };
    }
    throw new Error(`URL inesperada: ${url}`);
  });
  assert.deepEqual(await runnerBadJson.getStreams('603', 'movie', null, null), []);
  assert.equal(runnerBadJson.logs.error.length, 1);

  // Estrutura sem results como lista ou count inválido
  const runnerBadStruct = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'magnetbr.flixbr.online') {
      return { status: 200, body: { count: -1, results: [] } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });
  assert.deepEqual(await runnerBadStruct.getStreams('603', 'movie', null, null), []);
  assert.match(runnerBadStruct.logs.error[0], /Contagem inválida/);
});

test('3.1, 3.2 e 3.5 triagem de filme: IMDb divergente, sem IMDb, categoria incompatível, ano e coleção', async () => {
  const items = [
    // 1. IMDb divergente (mesmo com título igual) -> descartado
    magnetBrItem({ id: 1, imdb: 'tt0234215', hash: HEX_720 }),
    // 2. Categoria TV em pedido de filme -> descartado
    magnetBrItem({ id: 2, category: 'TV', hash: HEX_4K }),
    // 3. Coleção (Trilogia) -> descartado
    magnetBrItem({
      id: 3,
      title: 'Matrix Trilogia Completa 1080p',
      magnet_original: 'Matrix.Trilogia.1999.1080p',
      dn: 'Matrix.Trilogia.1999.1080p',
      hash: UNKNOWN_HASH,
    }),
    // 4. Ano incompatível (1999 vs 2021) -> descartado
    magnetBrItem({ id: 4, year: 2021, hash: PACK_HASH }),
    // 5. Item sem IMDb mas com título e ano compatíveis -> aceito
    magnetBrItem({
      id: 5,
      imdb: '',
      title: 'The Matrix 1999 1080p',
      original_title: 'The Matrix',
      magnet_original: 'The.Matrix.1999.1080p.BluRay',
      dn: 'The.Matrix.1999.1080p.BluRay.mkv',
      year: 1999,
      hash: HEX_1080,
    }),
  ];

  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'magnetbr.flixbr.online') {
      return { body: { count: items.length, results: items } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, HEX_1080);
  assert.equal(runner.logs.warn.length, 0, 'descarte por triagem não deve usar console.warn');
  assert.equal(runner.logs.log.length, 4);

  // Todos os itens triados -> lista vazia sem console.warn nem console.error
  const runnerAllTriaged = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'magnetbr.flixbr.online') {
      return { body: { count: 4, results: items.slice(0, 4) } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });
  assert.deepEqual(await runnerAllTriaged.getStreams('603', 'movie', null, null), []);
  assert.equal(runnerAllTriaged.logs.warn.length, 0);
  assert.equal(runnerAllTriaged.logs.error.length, 0);
});

test('3.3 e 3.4 triagem de série: episódio exato, temporadas conflitantes, sem coordenadas e falso positivo de ano (One Piece)', async () => {
  const tvItems = [
    // 1. Episódio divergente (S01E02 em pedido de S01E01) -> triagem
    magnetBrItem({
      id: 10,
      category: 'TV',
      imdb: 'tt3581920',
      title: 'The Last of Us S01E02 1080p',
      original_title: 'The Last of Us',
      magnet_original: 'The.Last.of.Us.S01E02.1080p',
      dn: 'The.Last.of.Us.S01E02.1080p.mkv',
      year: 2023,
      hash: HEX_720,
    }),
    // 2. Temporada divergente (S02E01) -> triagem
    magnetBrItem({
      id: 11,
      category: 'TV',
      imdb: 'tt3581920',
      title: 'The Last of Us S02E01 1080p',
      original_title: 'The Last of Us',
      magnet_original: 'The.Last.of.Us.S02E01.1080p',
      dn: 'The.Last.of.Us.S02E01.1080p.mkv',
      year: 2023,
      hash: HEX_4K,
    }),
    // 3. Temporadas conflitantes (Season.1.S05) -> triagem
    magnetBrItem({
      id: 12,
      category: 'TV',
      imdb: 'tt3581920',
      title: 'The Last of Us Temporada 1 S05 1080p',
      original_title: 'The Last of Us',
      magnet_original: 'The.Last.of.Us.Temporada.1.S05.1080p',
      dn: 'The.Last.of.Us.Temporada.1.S05.1080p',
      year: 2023,
      hash: PACK_HASH,
    }),
    // 4. Item sem coordenadas explícitas na consulta exata, com IMDb confirmado, título e ano compatíveis -> aceito como magnet!
    magnetBrItem({
      id: 13,
      category: 'Anime',
      imdb: 'tt3581920',
      title: 'The Last of Us 2023 1080p',
      original_title: 'The Last of Us',
      magnet_original: 'The.Last.of.Us.2023.1080p.WEB-DL',
      dn: 'The.Last.of.Us.2023.1080p.WEB-DL.mkv',
      year: 2023,
      hash: HEX_1080,
    }),
    // 5. Item sem coordenadas e sem IMDb -> triagem
    magnetBrItem({
      id: 14,
      category: 'TV',
      imdb: null,
      title: 'The Last of Us 2023 720p',
      original_title: 'The Last of Us',
      magnet_original: 'The.Last.of.Us.2023.720p',
      dn: 'The.Last.of.Us.2023.720p.mkv',
      year: 2023,
      hash: UNKNOWN_HASH,
    }),
  ];

  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: seriesPayload() };
    if (url.hostname === 'magnetbr.flixbr.online') {
      if (url.searchParams.get('ep') === '1') {
        return { body: { count: tvItems.length, results: tvItems } };
      }
      return { body: { count: 0, results: [] } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('100088', 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, HEX_1080);
  assert.equal(streams[0].type, 'magnet');

  // Caso One Piece: IMDb tt0388629, temporada 1 de 1999 no TMDB, item com ano 2023 (live action) -> descartado!
  const onePieceLiveAction = magnetBrItem({
    id: 99,
    category: 'Anime',
    imdb: 'tt0388629',
    title: 'One Piece S01E01 2023 1080p',
    original_title: 'One Piece',
    magnet_original: 'One.Piece.S01E01.2023.1080p.WEB-DL',
    dn: 'One.Piece.S01E01.2023.1080p.WEB-DL.mkv',
    year: 2023,
    hash: HEX_1080,
  });

  const runnerOnePiece = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return {
        body: seriesPayload({
          name: 'One Piece',
          original: 'One Piece',
          imdb: 'tt0388629',
          year: 1999,
          season1Year: 1999,
        }),
      };
    }
    if (url.hostname === 'magnetbr.flixbr.online') {
      return { body: { count: 1, results: [onePieceLiveAction] } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  assert.deepEqual(await runnerOnePiece.getStreams('37854', 'tv', 1, 1), []);
  assert.match(runnerOnePiece.logs.log.join('\n'), /ano 2023 incompatível com o ano 1999 da temporada 1/);
});

test('4.1, 4.2, 4.3, 4.4, 4.5 e 4.6 base32, tamanhos, idiomas, contagens, formatos e isolamento de falhas', async () => {
  const items = [
    // 1. Base32 no magnet_link, tamanho com vírgula "2,8 GB", audio_tags "Português" (sem região), título com "[Brazilian]", 1080p, seed_count 0
    magnetBrItem({
      id: 1,
      title: 'Matrix 1999 1080p [Brazilian]',
      title_processed: 'Matrix (1999) [Brazilian] [1080p]',
      magnet_original: 'The.Matrix.1999.1080p.BluRay.x264',
      magnet_link: `magnet:?xt=urn:btih:${BASE32_RAW}&dn=The.Matrix.1999.1080p.BluRay.x264.mkv`,
      info_hash: BASE32_HEX,
      size: '2,8 GB',
      size_bytes: 30,
      audio_tags: 'Português',
      has_legenda: false,
      legend: '',
      seed_count: 0,
      leech_count: 5,
      scraper_source: 'starck',
    }),
    // 2. Tamanho corrompido "30 B" e size_bytes 30 (< 1 MiB) -> sem size; Inglês com legenda Português -> Legendado (Não PT-BR?); 4K
    magnetBrItem({
      id: 2,
      hash: HEX_4K,
      title: 'Matrix 1999 4K [Brazilian]',
      magnet_original: 'The.Matrix.1999.2160p.UHD',
      dn: 'The.Matrix.1999.2160p.UHD.mkv',
      size: '30 B',
      size_bytes: 30,
      audio_tags: 'Inglês',
      has_legenda: true,
      legend: 'Português',
      seed_count: 15,
      leech_count: 0,
      scraper_source: 'comand',
    }),
    // 3. Inglês sem legenda portuguesa, mesmo com "[Brazilian]" no title_processed -> Gringo; size_bytes válido como fallback
    magnetBrItem({
      id: 3,
      hash: HEX_720,
      title: 'Matrix 1999 720p [Brazilian]',
      title_processed: 'Matrix [Brazilian]',
      magnet_original: 'The.Matrix.1999.720p.BluRay',
      dn: 'The.Matrix.1999.720p.BluRay.mkv',
      size: '175 B',
      size_bytes: 1572864000, // 1.46 GB
      audio_tags: 'Inglês',
      has_legenda: false,
      legend: '',
      scraper_source: 'tfilme',
    }),
    // 4. Sem evidência de idioma nos campos nem no dn -> Idioma Desconhecido
    magnetBrItem({
      id: 4,
      hash: UNKNOWN_HASH,
      title: 'Matrix 1999 [Brazilian]',
      magnet_original: 'The.Matrix.1999.PROPER',
      dn: 'The.Matrix.1999.PROPER.mkv',
      size: '1.2 GB',
      audio_tags: '',
      has_legenda: false,
      legend: '',
      scraper_source: 'torrentclaw',
    }),
    // 5. Duplicata da mesma URL do item 2 -> deve ser deduplicada
    magnetBrItem({
      id: 5,
      hash: HEX_4K,
      title: 'Matrix 1999 4K Duplicado',
      magnet_original: 'The.Matrix.1999.2160p.UHD',
      dn: 'The.Matrix.1999.2160p.UHD.mkv',
    }),
    // 6. Magnet inválido -> falha isolada com console.warn
    magnetBrItem({
      id: 6,
      magnet_link: 'magnet:?xt=urn:btih:HASH_INVALIDO_123',
      info_hash: 'invalido',
    }),
  ];

  const runnerGdrive = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'magnetbr.flixbr.online') return { body: { count: items.length, results: items } };
    throw new Error(`URL inesperada: ${url}`);
  }, { bundle: codes.gdrive });

  const streams = await runnerGdrive.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 4);
  assert.equal(runnerGdrive.logs.warn.length, 1);
  assert.match(runnerGdrive.logs.warn[0], /\[MagnetBR\] Opção .* descartada/);

  // Ordenados por qualidade: 4K, 1080p, 720p, Desconhecida
  assert.deepEqual(streams.map((s) => s.quality), ['4K', '1080p', '720p', 'Desconhecida']);

  const s4k = streams[0];
  assert.equal(s4k.size, undefined, '30 B e size_bytes 30 devem ser omitidos');
  assert.equal(s4k.language, 'Legendado (Não PT-BR?)');
  assert.equal(s4k.provider, 'comand');
  assert.equal(s4k.seeders, 15);
  assert.equal(s4k.peers, 0);

  const s1080 = streams[1];
  assert.equal(s1080.infoHash, BASE32_HEX);
  assert.match(s1080.url, new RegExp(`xt=urn:btih:${BASE32_HEX}`));
  assert.match(s1080.url, /[?&]tr=/, 'deve incluir trackers públicos quando ausentes');
  assert.equal(s1080.size, '2.8 GB');
  assert.equal(s1080.language, 'Dublado (Não PT-BR?)', '[Brazilian] do título não deve promover Português sem região');
  assert.equal(s1080.seeders, 0, 'seed_count: 0 deve ser preservado');
  assert.equal(s1080.peers, 5);
  assert.equal(s1080.provider, 'starck');
  assert.match(s1080.name, /^MagnetBR 1080p/);

  const s720 = streams[2];
  assert.equal(s720.language, 'Gringo');
  assert.equal(s720.size, '1.46 GB');
  assert.equal(s720.provider, 'tfilme');

  const sUnknown = streams[3];
  assert.equal(sUnknown.language, 'Idioma Desconhecido');
  assert.equal(sUnknown.provider, 'torrentclaw');

  // Variante Prism
  const runnerPrism = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'magnetbr.flixbr.online') return { body: { count: 1, results: [items[0]] } };
    throw new Error(`URL inesperada: ${url}`);
  }, { bundle: codes.prism });
  const prismStreams = await runnerPrism.getStreams('603', 'movie', null, null);
  assert.equal(prismStreams.length, 1);
  assert.match(prismStreams[0].name, /FHD 1080p/);

  const route = (url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'magnetbr.flixbr.online') return { body: { count: items.length, results: items } };
    throw new Error(`URL inesperada: ${url}`);
  };
  const p2p = runtime(route, { bundle: codes.gdrive, scraperId: 'repo:magnetbr--p2p-1080p-pt' });
  assert.deepEqual(await p2p.getStreams('603', 'movie', null, null), streams.slice(0, 2));
  const http = runtime(route, { bundle: codes.gdrive, scraperId: 'repo:magnetbr--http-all-all' });
  assert.deepEqual(await http.getStreams('603', 'movie', null, null), []);
});

test('5.1 a 5.6 resolução de pacotes de temporada, deduplicação por seeders, prevalência do episódio avulso e falha do cache', async () => {
  // Hash PACK_HASH aparece duas vezes na consulta da temporada (com 10 e 50 seeders) -> mantém 50 seeders e baixa 1 vez
  const packLowSeeds = magnetBrItem({
    id: 201,
    category: 'TV',
    imdb: 'tt3581920',
    hash: PACK_HASH,
    title: 'The Last of Us S01 Completa 1080p',
    original_title: 'The Last of Us',
    magnet_original: 'The.Last.of.Us.S01.1080p.WEB-DL',
    dn: 'The.Last.of.Us.S01.1080p.WEB-DL',
    year: 2023,
    size: '15.0 GB',
    seed_count: 10,
    scraper_source: 'bludv',
  });
  const packHighSeeds = magnetBrItem({
    id: 202,
    category: 'TV',
    imdb: 'tt3581920',
    hash: PACK_HASH,
    title: 'The Last of Us S01 Completa 1080p',
    original_title: 'The Last of Us',
    magnet_original: 'The.Last.of.Us.S01.1080p.WEB-DL',
    dn: 'The.Last.of.Us.S01.1080p.WEB-DL',
    year: 2023,
    size: '15.0 GB',
    seed_count: 50,
    scraper_source: 'rede',
  });
  // Pacote sem o episódio pedido -> triagem
  const packNoEp = magnetBrItem({
    id: 203,
    category: 'TV',
    imdb: 'tt3581920',
    hash: HEX_720,
    title: 'The Last of Us S01 Pack Parcial',
    original_title: 'The Last of Us',
    magnet_original: 'The.Last.of.Us.S01.720p',
    dn: 'The.Last.of.Us.S01.720p',
    year: 2023,
  });
  // Pacote ambíguo (2 arquivos S01E01) -> triagem
  const packAmbiguous = magnetBrItem({
    id: 204,
    category: 'TV',
    imdb: 'tt3581920',
    hash: HEX_4K,
    title: 'The Last of Us S01 Dual Pack',
    original_title: 'The Last of Us',
    magnet_original: 'The.Last.of.Us.S01.2160p',
    dn: 'The.Last.of.Us.S01.2160p',
    year: 2023,
  });
  // Pacote cujo cache itorrents responde HTTP 500 -> aviso isolado
  const packCacheFail = magnetBrItem({
    id: 205,
    category: 'TV',
    imdb: 'tt3581920',
    hash: UNKNOWN_HASH,
    title: 'The Last of Us S01 720p Web',
    original_title: 'The Last of Us',
    magnet_original: 'The.Last.of.Us.S01.WEB',
    dn: 'The.Last.of.Us.S01.WEB',
    year: 2023,
  });
  // Episódio avulso com hash HEX_1080 que também aparece na consulta de temporada como pacote -> avulso prevalece e não baixa cache!
  const singleEp = magnetBrItem({
    id: 206,
    category: 'TV',
    imdb: 'tt3581920',
    hash: HEX_1080,
    title: 'The Last of Us S01E01 1080p',
    original_title: 'The Last of Us',
    magnet_original: 'The.Last.of.Us.S01E01.1080p',
    dn: 'The.Last.of.Us.S01E01.1080p.mkv',
    year: 2023,
    size: '1.8 GB',
  });
  const duplicatePackSameHashAsSingle = magnetBrItem({
    id: 207,
    category: 'TV',
    imdb: 'tt3581920',
    hash: HEX_1080,
    title: 'The Last of Us S01 1080p',
    original_title: 'The Last of Us',
    magnet_original: 'The.Last.of.Us.S01.1080p',
    dn: 'The.Last.of.Us.S01.1080p',
    year: 2023,
  });

  const itorrentsCalls = [];
  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: seriesPayload() };
    if (url.hostname === 'magnetbr.flixbr.online') {
      if (url.searchParams.get('ep') === '1') {
        return { body: { count: 1, results: [singleEp] } };
      }
      return {
        body: {
          count: 6,
          results: [packLowSeeds, packHighSeeds, packNoEp, packAmbiguous, packCacheFail, duplicatePackSameHashAsSingle],
        },
      };
    }
    if (url.hostname === 'itorrents.org') {
      itorrentsCalls.push(url.pathname);
      if (url.pathname.includes(PACK_HASH.toUpperCase())) return { bytes: PACK_TORRENT_S01E01 };
      if (url.pathname.includes(HEX_720.toUpperCase())) return { bytes: PACK_TORRENT_NO_EP };
      if (url.pathname.includes(HEX_4K.toUpperCase())) return { bytes: PACK_TORRENT_AMBIGUOUS };
      if (url.pathname.includes(UNKNOWN_HASH.toUpperCase())) return { status: 500, body: 'Error' };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('100088', 'tv', 1, 1);
  assert.equal(streams.length, 2, '1 episódio avulso + 1 pacote resolvido');
  assert.ok(!itorrentsCalls.some((p) => p.includes(HEX_1080.toUpperCase())), 'hash já resolvido como avulso não deve consultar itorrents');
  assert.equal(itorrentsCalls.filter((p) => p.includes(PACK_HASH.toUpperCase())).length, 1, 'pacote duplicado é baixado uma única vez');

  const packStream = streams.find((s) => s.type === 'torrent');
  assert.ok(packStream);
  assert.equal(packStream.url, `torrent://${PACK_HASH}/1`);
  assert.equal(packStream.infoHash, PACK_HASH);
  assert.equal(packStream.size, '1.50 GB', 'size do stream vem do arquivo do episódio');
  assert.equal(packStream.seeders, 50, 'deve manter a duplicata com mais seeders');
  assert.equal(packStream.provider, 'rede');
  assert.match(packStream.title, /15\.0 GB/, 'folderSize do pacote aparece no title formatado');
  assert.match(packStream.title, /Serie\.S01E01\.1080p\.mkv/, 'filename do arquivo aparece no title formatado');
  assert.match(packStream.title, /The\.Last\.of\.Us\.S01\.1080p\.WEB-DL/, 'folderName do pacote aparece no title formatado');
  assert.equal(runner.logs.warn.length, 1, 'apenas a falha HTTP 500 do cache gera warn');
});

test('5.5 e 6.3 erro agregado quando todas as opções falham e sanitização de logs', async () => {
  const secretKey = 'TMDB_SECRET_KEY_999';
  const fullMagnet = `magnet:?xt=urn:btih:INVALID_HASH_SECRET&dn=Secret.Movie.Name&tr=udp://tracker.secret`;
  const badItem = magnetBrItem({
    id: 777,
    magnet_link: fullMagnet,
    info_hash: 'invalid',
  });

  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'magnetbr.flixbr.online') {
      return { body: { count: 1, results: [badItem] } };
    }
    throw new Error(`URL inesperada: ${url}`);
  }, { apiKey: secretKey });

  const streams = await runner.getStreams('603', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(runner.logs.warn.length, 1);
  assert.equal(runner.logs.error.length, 1);
  assert.match(runner.logs.error[0], /Todas as opções falharam/);

  const allLogs = [...runner.logs.log, ...runner.logs.warn, ...runner.logs.error].join('\n');
  assert.ok(!allLogs.includes(secretKey), 'logs não podem conter TMDB_API_KEY');
  assert.ok(!allLogs.includes('Secret.Movie.Name'), 'logs não podem conter o magnet completo');
  assert.ok(!allLogs.includes('?q='), 'logs não podem conter query de URL');
});
