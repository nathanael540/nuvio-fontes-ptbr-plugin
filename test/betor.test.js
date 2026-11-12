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
const FILE_BYTES = 1610612736;

const codes = {};
let code;
test.before(async () => {
  const outDir = createTempDir('betor-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('betor', { outDir, formatter }), 'utf8');
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

const PACK_TORRENT = torrent(
  Array.from({ length: 13 }, (_, index) => (index === 12 ? '3 - Bit by a Dead Bee.mp4' : `other-${index}.mp4`)),
  Array.from({ length: 13 }, (_, index) => (index === 12 ? FILE_BYTES : 1000)),
);

const AMBIGUOUS_PACK_TORRENT = torrent(
  ['S02E03 - Audio 1.mkv', 'S02E03 - Audio 2.mkv'],
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

function betorItem(extra = {}) {
  return {
    id: extra.id || 'item-1',
    item_type: extra.item_type !== undefined ? extra.item_type : 'movie',
    torrent_name: extra.name !== undefined ? extra.name : 'Matrix.1999.1080p.WEB-DL.DUAL',
    magnet_uri: extra.magnet !== undefined ? extra.magnet : `magnet:?xt=urn:btih:${HEX_1080}&dn=Matrix.1080p`,
    magnet_dn: extra.dn !== undefined ? extra.dn : 'Matrix.1080p',
    magnet_xt: extra.xt || (extra.magnet ? undefined : `urn:btih:${HEX_1080}`),
    provider_slug: extra.provider !== undefined ? extra.provider : 'bludv',
    provider_url: extra.url || 'https://bludv.example/matrix',
    torrent_size: extra.size !== undefined ? extra.size : 2500000000,
    torrent_num_seeds: extra.seeds !== undefined ? extra.seeds : 25,
    torrent_num_peers: extra.peers !== undefined ? extra.peers : 12,
    languages: extra.languages !== undefined ? extra.languages : ['pt', 'en'],
    seasons: extra.seasons,
    episodes: extra.episodes,
    torrent_files: extra.files,
  };
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
  vm.runInNewContext(bundle, context, { filename: 'betor.js' });
  return {
    calls,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function forrestGumpPayload() {
  return moviePayload({
    title: 'Forrest Gump: O Contador de Histórias',
    original: 'Forrest Gump',
    year: 1994,
    imdb: 'tt0109830',
  });
}

function fallbackMovieRunner(item) {
  const searchUrls = [];
  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: forrestGumpPayload() };
    if (url.hostname === 'search.betor.top') {
      searchUrls.push(url);
      if (url.searchParams.get('item_type') === null) {
        return { body: { items: [item], total: 1, page: 1, size: 100 } };
      }
      return { body: { items: [], total: 0, page: 1, size: 100 } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });
  return { runner, searchUrls };
}

test('1.1 carregamento do provedor não faz requisições e rejeita entrada inválida antes do fetch', async () => {
  const runner = runtime(() => {
    throw new Error('fetch não deve ser chamado');
  });

  assert.deepEqual(await runner.getStreams('', 'movie', null, null), []);
  assert.match(runner.logs.error[0], /Entrada: ID do TMDB inválido/);

  assert.deepEqual(await runner.getStreams('abc', 'movie', null, null), []);
  assert.deepEqual(await runner.getStreams('603', 'invalid', null, null), []);
  assert.deepEqual(await runner.getStreams('1396', 'tv', 0, 1), []);
  assert.deepEqual(await runner.getStreams('1396', 'tv', 1, 0), []);
  assert.deepEqual(await runner.getStreams('1396', 'tv', 1, null), []);
  assert.deepEqual(await runner.getStreams('1396', 'tv', -1, 1), []);
  assert.equal(runner.calls.length, 0, 'nenhum fetch deve ser executado para parâmetros inválidos');
});

test('1.1 e 1.2 identificação por IMDb e fallback para TMDB com tipo e sem tipo', async () => {
  const searchUrls = [];
  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return { body: moviePayload({ imdb: 'tt0133093' }) };
    }
    if (url.hostname === 'search.betor.top') {
      searchUrls.push(url);
      return { body: { items: [], total: 0, page: 1, size: 100 } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('603', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(searchUrls.length, 3, 'IMDb, TMDB com tipo e TMDB sem tipo');
  assert.equal(searchUrls[0].searchParams.get('item_type'), 'movie');
  assert.equal(searchUrls[0].searchParams.get('imdb_id'), 'tt0133093');
  assert.equal(searchUrls[0].searchParams.get('tmdb_id'), null);
  assert.equal(searchUrls[1].searchParams.get('tmdb_id'), '603');
  assert.equal(searchUrls[1].searchParams.get('imdb_id'), null);
  assert.equal(searchUrls[1].searchParams.get('item_type'), 'movie');
  assert.equal(searchUrls[2].searchParams.get('tmdb_id'), '603');
  assert.equal(searchUrls[2].searchParams.get('item_type'), null);
  for (const url of searchUrls) {
    assert.equal(url.searchParams.get('size'), '100');
    assert.equal(url.searchParams.get('page'), '1');
  }
  assert.equal(runner.calls.length, 4, 'TMDB + três tentativas de busca, sem busca por título');

  // Sem IMDb, o primeiro fallback já é o TMDB com tipo.
  const searchUrlsNoImdb = [];
  const runnerNoImdb = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return { body: moviePayload({ imdb: null }) };
    }
    if (url.hostname === 'search.betor.top') {
      searchUrlsNoImdb.push(url);
      return { body: { items: [], total: 0, page: 1, size: 100 } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  await runnerNoImdb.getStreams('603', 'movie', null, null);
  assert.equal(searchUrlsNoImdb.length, 2);
  assert.equal(searchUrlsNoImdb[0].searchParams.get('item_type'), 'movie');
  assert.equal(searchUrlsNoImdb[0].searchParams.get('tmdb_id'), '603');
  assert.equal(searchUrlsNoImdb[0].searchParams.get('imdb_id'), null);
  assert.equal(searchUrlsNoImdb[1].searchParams.get('item_type'), null);
  assert.equal(runnerNoImdb.calls.length, 3, 'TMDB + duas tentativas de busca');
});

test('1.2 fallback sem tipo aceita item sem item_type com título e ano compatíveis', async () => {
  const item = betorItem({
    id: 'forrest',
    item_type: '',
    name: 'Forrest.Gump.O.Contador.de.Historias.1994.BluRay.1080p.DUAL',
    dn: 'Forrest.Gump.O.Contador.de.Historias.1994.BluRay.1080p.DUAL',
    magnet: `magnet:?xt=urn:btih:${HEX_1080}`,
  });
  const { runner, searchUrls } = fallbackMovieRunner(item);

  const streams = await runner.getStreams('13', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(searchUrls.length, 3);
  assert.equal(searchUrls[2].searchParams.get('item_type'), null);
  assert.equal(searchUrls[2].searchParams.get('tmdb_id'), '13');
});

test('1.3 item sem tipo incompatível ou de outro tipo é descartado', async () => {
  const wrongTitle = betorItem({
    id: 'outro-titulo',
    item_type: '',
    name: 'Another.Movie.1994.1080p.DUAL',
    dn: 'Another.Movie.1994.1080p.DUAL',
    magnet: `magnet:?xt=urn:btih:${HEX_720}`,
  });
  const wrongYear = betorItem({
    id: 'outro-ano',
    item_type: '',
    name: 'Forrest.Gump.O.Contador.de.Historias.1995.1080p.DUAL',
    dn: 'Forrest.Gump.O.Contador.de.Historias.1995.1080p.DUAL',
    magnet: `magnet:?xt=urn:btih:${HEX_4K}`,
  });
  const wrongType = betorItem({
    id: 'tipo-errado',
    item_type: 'tv',
    name: 'Forrest.Gump.O.Contador.de.Historias.1994.1080p.DUAL',
    dn: 'Forrest.Gump.O.Contador.de.Historias.1994.1080p.DUAL',
    magnet: `magnet:?xt=urn:btih:${UNKNOWN_HASH}`,
  });

  for (const [item, pattern] of [
    [wrongTitle, /sem título\/ano compatíveis/],
    [wrongYear, /sem título\/ano compatíveis/],
    [wrongType, /tipo "tv" diferente de "movie"/],
  ]) {
    const { runner } = fallbackMovieRunner(item);
    const streams = await runner.getStreams('13', 'movie', null, null);
    assert.deepEqual(streams, []);
    assert.match(runner.logs.log.join('\n'), pattern);
  }
});

test('1.2 erro na primeira tentativa não aciona fallback', async () => {
  const searchUrls = [];
  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: forrestGumpPayload() };
    if (url.hostname === 'search.betor.top') {
      searchUrls.push(url);
      return { status: 500, body: 'Erro interno' };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('13', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(searchUrls.length, 1, 'não deve tentar TMDB depois de falha HTTP');
  assert.equal(searchUrls[0].searchParams.get('imdb_id'), 'tt0109830');
  assert.ok(runner.logs.error.length > 0);
});

test('1.2 fallback sem tipo percorre todas as páginas', async () => {
  const searchUrls = [];
  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') {
      searchUrls.push(url);
      if (url.searchParams.get('item_type') !== null) {
        return { body: { items: [], total: 0, page: 1, size: 100 } };
      }
      const page = url.searchParams.get('page');
      if (page === '1') {
        const items = Array.from({ length: 100 }, (_, index) => betorItem({
          id: `fallback-${index}`,
          magnet: `magnet:?xt=urn:btih:${String(index + 1).padStart(40, 'a')}`,
        }));
        return { body: { items, total: 101, page: 1, size: 100 } };
      }
      if (page === '2') {
        return {
          body: {
            items: [betorItem({ id: 'fallback-last', magnet: `magnet:?xt=urn:btih:${'f'.repeat(40)}` })],
            total: 101,
            page: 2,
            size: 100,
          },
        };
      }
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 101);
  assert.equal(searchUrls.filter((url) => url.searchParams.get('item_type') === null).length, 2);
});

test('1.3 série sem item_type mantém a triagem de episódio', async () => {
  const item = betorItem({
    id: 'serie-sem-tipo',
    item_type: '',
    name: 'Breaking.Bad.S01E02.1080p.DUAL',
    dn: 'Breaking.Bad.S01E02.1080p.DUAL',
    magnet: `magnet:?xt=urn:btih:${HEX_720}`,
  });
  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: seriesPayload({ imdb: 'tt0903747' }) };
    if (url.hostname === 'search.betor.top') {
      if (url.searchParams.get('item_type') === null) {
        return { body: { items: [item], total: 1, page: 1, size: 100 } };
      }
      return { body: { items: [], total: 0, page: 1, size: 100 } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('1396', 'tv', 1, 1);
  assert.deepEqual(streams, []);
  assert.match(runner.logs.log.join('\n'), /não contém o episódio 1/);
});

test('1.2 paginação com size=100 percorre múltiplas páginas; falha posterior não produz lista parcial', async () => {
  const itemP1 = betorItem({ id: 'p1', name: 'Matrix 720p Dublado', magnet: `magnet:?xt=urn:btih:${HEX_720}` });
  const itemP2 = betorItem({ id: 'p2', name: 'Matrix 1080p Dublado', magnet: `magnet:?xt=urn:btih:${HEX_1080}` });

  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') {
      const page = url.searchParams.get('page');
      const hexFromIndex = (i) => String(i).padStart(40, 'a');
      if (page === '1') {
        const items = Array.from({ length: 100 }, (_, i) => (i === 0 ? itemP1 : betorItem({ id: `item-${i}`, magnet: `magnet:?xt=urn:btih:${hexFromIndex(i)}` })));
        return { body: { items, total: 101, page: 1, size: 100 } };
      }
      if (page === '2') {
        return { body: { items: [itemP2], total: 101, page: 2, size: 100 } };
      }
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 101);
  assert.ok(streams.some((s) => s.infoHash === HEX_720));
  assert.ok(streams.some((s) => s.infoHash === HEX_1080));

  // Segunda página falha: lista vazia e log de erro (sem lista parcial)
  const runnerFailP2 = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') {
      const page = url.searchParams.get('page');
      if (page === '1') {
        const items = Array.from({ length: 100 }, (_, i) => betorItem({ id: `item-${i}` }));
        return { body: { items, total: 105, page: 1, size: 100 } };
      }
      return { status: 500, body: 'Erro interno' };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const failStreams = await runnerFailP2.getStreams('603', 'movie', null, null);
  assert.deepEqual(failStreams, [], 'segunda página com erro deve retornar lista vazia');
  assert.ok(runnerFailP2.logs.error.length > 0);

  // Paginação truncada: recebe menos de 100 antes de atingir o total
  const runnerTruncated = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') {
      return { body: { items: [itemP1], total: 150, page: 1, size: 100 } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  assert.deepEqual(await runnerTruncated.getStreams('603', 'movie', null, null), []);
  assert.match(runnerTruncated.logs.error[0], /Paginação truncada/);

  // Paginação sem progresso: página seguinte retorna vazia
  const runnerNoProgress = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') {
      const page = url.searchParams.get('page');
      if (page === '1') {
        const items = Array.from({ length: 100 }, (_, i) => betorItem({ id: `item-${i}` }));
        return { body: { items, total: 150, page: 1, size: 100 } };
      }
      return { body: { items: [], total: 150, page: 2, size: 100 } };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  assert.deepEqual(await runnerNoProgress.getStreams('603', 'movie', null, null), []);
  assert.match(runnerNoProgress.logs.error[0], /Paginação sem progresso/);

  // JSON inválido
  const runnerBadJson = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') {
      return { status: 200, body: '<html>não é json</html>' };
    }
    throw new Error(`URL inesperada: ${url}`);
  });
  assert.deepEqual(await runnerBadJson.getStreams('603', 'movie', null, null), []);
  assert.ok(runnerBadJson.logs.error.length > 0);
});

test('1.3 e 2.1 normalização de magnet, ordenação e isolamento de falhas', async () => {
  const itemValidHex = betorItem({ id: '1', name: 'Matrix 720p Dublado', magnet: `magnet:?xt=urn:btih:${HEX_720}` });
  const itemBase32 = betorItem({ id: '2', name: 'Matrix 1080p Dublado', magnet: `magnet:?xt=urn:btih:${BASE32_RAW}` });
  const item4K = betorItem({ id: '3', name: 'Matrix 4K Dual Áudio', magnet: `magnet:?xt=urn:btih:${HEX_4K}` });
  const itemUnknown = betorItem({ id: '4', name: 'Matrix Release Sem Qualidade', dn: 'Matrix.Custom', magnet: `magnet:?xt=urn:btih:${UNKNOWN_HASH}&dn=Matrix.Custom` });
  const itemInvalidHash = betorItem({ id: '5', name: 'Matrix 1080p', magnet: 'magnet:?xt=urn:btih:hash_invalido_demais' });

  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') {
      return {
        body: {
          items: [itemValidHex, itemBase32, item4K, itemUnknown, itemInvalidHash],
          total: 5,
          page: 1,
          size: 100,
        },
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('603', 'movie', null, null);
  // O item com hash inválido deve ter sido descartado com warning
  assert.equal(streams.length, 4);
  assert.equal(runner.logs.warn.length, 1);
  assert.match(runner.logs.warn[0], /Opção .* descartada: hash btih inválido/);

  // Ordenação por qualidade: 4K primeiro, depois 1080p, 720p e Desconhecida por último
  assert.equal(streams[0].quality, '4K');
  assert.equal(streams[1].quality, '1080p');
  assert.equal(streams[1].infoHash, BASE32_HEX, 'base32 deve ser convertido para 40 hexadecimais minúsculos');
  assert.equal(streams[2].quality, '720p');
  assert.equal(streams[3].quality, 'Desconhecida');

  // Todas as opções falhando
  const runnerAllFail = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') {
      return {
        body: {
          items: [itemInvalidHash],
          total: 1,
          page: 1,
          size: 100,
        },
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const allFailStreams = await runnerAllFail.getStreams('603', 'movie', null, null);
  assert.deepEqual(allFailStreams, []);
  assert.ok(runnerAllFail.logs.warn.length > 0);
  assert.match(runnerAllFail.logs.error[0], /Todas as opções falharam/);
});

test('2.2 triagem de séries e episódios por evidências consistentes sem filtros de episódio da API', async () => {
  // Pedido: S02E03
  // Item 1: episódio pedido apenas em outra temporada (S01E03)
  const itemDiffSeason = betorItem({
    id: 'diff-season',
    item_type: 'tv',
    name: 'Breaking Bad S01E03',
    episodes: [{ season: 1, episode: 3 }],
    seasons: [1],
  });
  // Item 2: outro episódio da mesma temporada (S02E05)
  const itemDiffEpisode = betorItem({
    id: 'diff-ep',
    item_type: 'tv',
    name: 'Breaking Bad S02E05',
    episodes: [{ season: 2, episode: 5 }],
    seasons: [2],
  });
  // Item 3: conflito entre temporadas da API e do texto (API diz T1, texto diz 2ª Temporada)
  const itemConflictSeason = betorItem({
    id: 'conflict-season',
    item_type: 'tv',
    name: 'Breaking Bad 2ª Temporada S02E03',
    seasons: [1],
  });
  // Item 4: conflito entre episódio da API e do texto
  const itemConflictEp = betorItem({
    id: 'conflict-ep',
    item_type: 'tv',
    name: 'Breaking Bad S02E05',
    episodes: [{ season: 2, episode: 3 }],
    seasons: [2],
  });
  // Item 5: episódio avulso comprovado (deve virar magnet)
  const itemSingle = betorItem({
    id: 'single-ep',
    item_type: 'tv',
    name: 'Breaking Bad S02E03 1080p Dublado',
    episodes: [{ season: 2, episode: 3 }],
    seasons: [2],
  });
  // Item 6: ambíguo sem temporada nem episódio
  const itemAmbiguous = betorItem({
    id: 'ambiguous',
    item_type: 'tv',
    name: 'Breaking Bad Release Indefinida',
  });

  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: seriesPayload() };
    if (url.hostname === 'search.betor.top') {
      return {
        body: {
          items: [itemDiffSeason, itemDiffEpisode, itemConflictSeason, itemConflictEp, itemSingle, itemAmbiguous]
            .map((item, index) => ({ ...item, magnet_uri: `magnet:?xt=urn:btih:${String(index + 1).padStart(40, 'a')}` })),
          total: 6,
          page: 1,
          size: 100,
        },
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('1396', 'tv', 2, 3);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].type, 'magnet', 'episódio avulso comprovado deve usar magnet');
  assert.ok(streams[0].url.startsWith('magnet:'));
});

test('2.3 resolução de pacotes e faixas com índice seguro', async () => {
  // Pedido: S02E03
  // Pacote da temporada 2
  const itemPack = betorItem({
    id: 'pack-s2',
    item_type: 'tv',
    name: 'Breaking Bad 2ª Temporada Completa 720p',
    magnet: `magnet:?xt=urn:btih:${PACK_HASH}&dn=Breaking.Bad.S02`,
    seasons: [2],
  });

  // Pacote ambíguo no torrent (múltiplos arquivos do mesmo episódio)
  const itemAmbiguousPack = betorItem({
    id: 'pack-ambiguous',
    item_type: 'tv',
    name: 'Breaking Bad S02 Complete',
    magnet: `magnet:?xt=urn:btih:${HEX_1080}&dn=Breaking.Bad.S02.Multi`,
    seasons: [2],
  });

  // Pacote com falha no serviço itorrents.org
  const itemFailedPack = betorItem({
    id: 'pack-fail',
    item_type: 'tv',
    name: 'Breaking Bad Temporada 2 1080p',
    magnet: `magnet:?xt=urn:btih:${HEX_4K}&dn=Breaking.Bad.S02.Fail`,
    seasons: [2],
  });

  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: seriesPayload() };
    if (url.hostname === 'search.betor.top') {
      return {
        body: {
          items: [itemPack, itemAmbiguousPack, itemFailedPack],
          total: 3,
          page: 1,
          size: 100,
        },
      };
    }
    if (url.hostname === 'itorrents.org') {
      if (url.pathname.includes(PACK_HASH.toUpperCase())) {
        return { bytes: PACK_TORRENT };
      }
      if (url.pathname.includes(HEX_1080.toUpperCase())) {
        return { bytes: AMBIGUOUS_PACK_TORRENT };
      }
      if (url.pathname.includes(HEX_4K.toUpperCase())) {
        return { status: 404, body: 'Not found' };
      }
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('1396', 'tv', 2, 3);
  // O itemPack deve ter resolvido para o arquivo de índice 12 (Bit by a Dead Bee)
  assert.equal(streams.length, 1);
  assert.equal(streams[0].type, 'torrent');
  assert.equal(streams[0].url, `torrent://${PACK_HASH}/12`);
  assert.equal(streams[0].size, '1.50 GB');

  // Falha do itorrents para o itemFailedPack foi capturada como aviso sem derrubar o itemPack
  assert.equal(runner.logs.warn.length, 1);
  assert.match(runner.logs.warn[0], /Opção .* descartada: HTTP 404/);
});

test('2.3 pacotes deduplicados são baixados em sequência após os episódios avulsos', async () => {
  const hashes = [PACK_HASH, HEX_720, HEX_1080, HEX_4K, BASE32_HEX];
  const items = hashes.map((hash) => betorItem({
    item_type: 'tv',
    name: 'Breaking Bad S02 Completa 720p',
    magnet: `magnet:?xt=urn:btih:${hash}&dn=Breaking.Bad.S02`,
    seasons: [2],
    seeds: 10,
  }));
  items.push(betorItem({
    item_type: 'tv',
    provider: 'outro-indexador',
    name: 'Breaking Bad S02 Completa 720p',
    magnet: `magnet:?xt=urn:btih:${BASE32_RAW}&dn=Outro.Nome`,
    seasons: [2],
    seeds: 40,
  }));
  items.push(betorItem({
    item_type: 'tv',
    name: 'Breaking Bad S02E03 720p Dublado',
    magnet: `magnet:?xt=urn:btih:${UNKNOWN_HASH}`,
    seasons: [2],
    episodes: [{ season: 2, episode: 3 }],
  }));
  let active = 0;
  let maxActive = 0;
  const downloads = [];
  const runner = runtime(async (url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: seriesPayload() };
    if (url.hostname === 'search.betor.top') return { body: { items, total: items.length } };
    if (url.hostname === 'itorrents.org') {
      downloads.push(url.pathname);
      active += 1;
      maxActive = Math.max(maxActive, active);
      // Mantém o fetch pendente para detectar downloads concorrentes sem usar rede.
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return { bytes: PACK_TORRENT };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('1396', 'tv', 2, 3);
  assert.equal(maxActive, 1, 'somente um fetchTorrentFiles pode ficar em andamento');
  assert.equal(downloads.length, hashes.length, 'hash repetido não pode baixar o torrent duas vezes');
  assert.equal(new Set(downloads).size, hashes.length);
  assert.equal(streams.length, hashes.length + 1);
  assert.equal(streams[0].infoHash, UNKNOWN_HASH, 'magnet local é montado antes dos pacotes');
  assert.equal(streams[0].type, 'magnet');
  for (const hash of hashes) {
    assert.equal(streams.filter((stream) => stream.url === `torrent://${hash}/12`).length, 1);
  }
  const selected = streams.find((stream) => stream.infoHash === BASE32_HEX);
  assert.equal(selected.provider, 'outro-indexador');
  assert.equal(selected.seeders, 40);
});

test('2.4 deduplicação por hash preserva a fonte com mais seeders e seus metadados', async () => {
  // Duas fontes com o mesmo hash para um filme
  const itemBludv = betorItem({
    id: 'b1',
    provider: 'bludv',
    name: 'Um Bom Advogado 2026 1080p Dual Áudio',
    magnet: `magnet:?xt=urn:btih:${HEX_1080}&dn=Um.Bom.Advogado`,
    seeds: 25,
    peers: 20,
    size: 3000000000,
    languages: ['pt', 'fr'],
  });

  const itemComando = betorItem({
    id: 'b2',
    provider: 'comando-torrents',
    name: 'Um Bom Advogado 2026 1080p', // Sem indicação de áudio no texto, só languages: [pt]
    magnet: `magnet:?xt=urn:btih:${HEX_1080.toUpperCase()}&dn=Outro.Nome&tr=udp%3A%2F%2Foutro.example`,
    seeds: 30,
    peers: 12,
    size: 3000000000,
    languages: ['pt'],
  });

  const itemMinimal = betorItem({
    id: 'b3',
    provider: null,
    name: 'Um Bom Advogado 720p',
    magnet: `magnet:?xt=urn:btih:${HEX_720}`,
    seeds: null,
    peers: null,
    size: null,
    languages: null,
  });

  const runner = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload({ title: 'Um Bom Advogado' }) };
    if (url.hostname === 'search.betor.top') {
      return {
        body: {
          items: [itemBludv, itemComando, itemBludv, itemMinimal],
          total: 4,
          page: 1,
          size: 100,
        },
      };
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  const streams = await runner.getStreams('1616419', 'movie', null, null);
  assert.equal(streams.length, 2, 'mesmo hash com fonte, dn e trackers diferentes deve gerar um stream');

  assert.ok(!streams.some((stream) => stream.provider === 'bludv'));

  const comandoStream = streams.find((s) => s.provider === 'comando-torrents');
  assert.ok(comandoStream);
  assert.equal(comandoStream.seeders, 30);
  assert.equal(comandoStream.size, '2.79 GB');
  assert.equal(comandoStream.peers, 12);
  assert.equal(comandoStream.language, 'Idioma Desconhecido', 'languages: [pt] sem menção no texto não deve virar Dublado');

  const minimalStream = streams.find((s) => s.infoHash === HEX_720);
  assert.ok(minimalStream);
  assert.equal(minimalStream.provider, undefined);
  assert.equal(minimalStream.seeders, undefined);
  assert.equal(minimalStream.peers, undefined);
});

test('formatação nos templates gdrive e prism gera cabeçalhos, P2P e metadados', async () => {
  const item = betorItem({
    id: 'f1',
    provider: 'bludv',
    name: 'Matrix 1080p Dual Áudio',
    magnet: `magnet:?xt=urn:btih:${HEX_1080}`,
    seeds: 50,
  });

  // Template Google Drive
  const runnerGdrive = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') return { body: { items: [item], total: 1, page: 1, size: 100 } };
    throw new Error(`URL inesperada: ${url}`);
  }, codes.gdrive);

  const [streamGdrive] = await runnerGdrive.getStreams('603', 'movie', null, null);
  assert.ok(streamGdrive.name.includes('BeTor 1080p'));
  assert.ok(streamGdrive.name.includes('🧲 P2P'));
  assert.ok(streamGdrive.name.includes('🔍 bludv'));

  // Template Prism
  const runnerPrism = runtime((url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: moviePayload() };
    if (url.hostname === 'search.betor.top') return { body: { items: [item], total: 1, page: 1, size: 100 } };
    throw new Error(`URL inesperada: ${url}`);
  }, codes.prism);

  const [streamPrism] = await runnerPrism.getStreams('603', 'movie', null, null);
  assert.ok(streamPrism.name.includes('🚀 FHD'));
  assert.ok(streamPrism.name.includes('🧲 P2P'));
  assert.ok(streamPrism.name.includes('📡 bludv'));
});
