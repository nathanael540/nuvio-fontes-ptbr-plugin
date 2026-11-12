const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const esbuild = require('esbuild');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const codes = {};
let code;
let extractor;

test.before(async () => {
  const outDir = createTempDir('starckfilmes-test-');
  try {
    for (const formatter of ['gdrive', 'prism']) {
      codes[formatter] = fs.readFileSync(await buildProvider('starckfilmes', { outDir, formatter }), 'utf8');
    }
    code = codes.gdrive;

    const result = await esbuild.build({
      entryPoints: ['src/starckfilmes/extractor.js'],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      external: ['cheerio-without-node-native'],
    });
    const extractorCtx = {
      require: (name) => {
        assert.equal(name, 'cheerio-without-node-native');
        return { load };
      },
      module: { exports: {} },
      atob: (s) => Buffer.from(s, 'base64').toString('binary'),
      btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    };
    vm.runInNewContext(result.outputFiles[0].text, extractorCtx);
    extractor = extractorCtx.module.exports;
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function shuffle(text) {
  const len = text.length;
  const used = new Array(len).fill(false);
  const out = new Array(len);
  let pos = 0;
  for (let r = 0; r < len; r++) {
    while (used[pos]) pos = (pos + 1) % len;
    used[pos] = true;
    out[pos] = text[r];
    pos = (pos + 3) % len;
  }
  return out.join('');
}

function encodeToXid(magnetUrl) {
  return shuffle(btoa(magnetUrl));
}

function mockTmdb(overrides = {}) {
  const isMovie = overrides.mediaType !== 'tv';
  return {
    id: overrides.id || 100,
    title: isMovie ? overrides.title || 'Filme' : undefined,
    name: !isMovie ? overrides.title || 'Série' : undefined,
    original_title: isMovie ? overrides.originalTitle || overrides.title || 'Movie' : undefined,
    original_name: !isMovie ? overrides.originalTitle || overrides.title || 'Series' : undefined,
    release_date: isMovie ? overrides.releaseDate || '2021-01-01' : undefined,
    first_air_date: !isMovie ? overrides.firstAirDate || '2022-01-01' : undefined,
    external_ids: { imdb_id: overrides.imdbId || 'tt1234567' },
    alternative_titles: { titles: overrides.alternativeTitles || [], results: overrides.alternativeTitles || [] },
    genres: [],
    original_language: 'en',
    origin_country: ['US'],
  };
}

function runtime(route = () => { throw new Error('fetch inesperado'); }, bundle = code) {
  const calls = [];
  const logs = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL,
    URLSearchParams,
    TMDB_API_KEY: 'teste-tmdb-key',
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    console: {
      log() {},
      warn: (message) => warnings.push(message),
      error: (message) => logs.push(message),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const result = await route(new URL(url), init);
      if (result instanceof Error) throw result;
      const text = typeof result === 'string' ? result : typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
      return {
        ok: !result.status || result.status < 400,
        status: result.status || 200,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
        arrayBuffer: async () => (result.buffer ? result.buffer : Buffer.from(text)),
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return {
    context,
    calls,
    logs,
    warnings,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

test('1.6 carregamento CommonJS sem rede e validação de coordenadas antes do fetch', async () => {
  const app = runtime();
  assert.equal(typeof app.context.module.exports.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);

  // Entradas inválidas
  for (const [id, type, season, episode] of [
    ['', 'movie', null, null],
    ['abc', 'movie', null, null],
    ['100', 'anime', null, null],
    ['100', 'tv', null, 1],
    ['100', 'tv', 0, 1],
    ['100', 'tv', 1, -1],
    ['100', 'tv', '2', 3],
    ['100', 'tv', 2, 1.5],
  ]) {
    const res = await app.getStreams(id, type, season, episode);
    assert.deepEqual(res, []);
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.logs.length, 8);
  assert.match(app.logs[0], /\[Starck Filmes\]/);
});

test('1.3 recuperação local do xid: comprimentos, hex, Base32, entradas malformadas e não magnet', async () => {
  const { decodeXid } = await import('../src/starckfilmes/xid.js');

  // Vector 1: Hexadecimal 40 chars
  const magnet1 = 'magnet:?xt=urn:btih:22e0e1afc417a041c501193be3944ccdef661dd3&dn=Filme.1080p&xl=1000';
  const xid1 = encodeToXid(magnet1);
  assert.equal(decodeXid(xid1), magnet1);

  // Vector 2: Base32 32 chars
  const magnet2 = 'magnet:?xt=urn:btih:3D62JGJ2GI7SYECF5UFIGMV4DCDTFCXA&dn=Wandinha.S01&tr=udp://tracker';
  const xid2 = encodeToXid(magnet2);
  assert.equal(decodeXid(xid2), magnet2);

  // Vector 3: Live Wandinha vector
  const liveWandinhaXid = 'bj1W11FXZnYHbWAm5lVkM0a0OWEj5l9oM4YkdSYDUl1yM1MkcFZmM04wc6MmYSFnUjRyapM2aDVDEyowLzOmRD9DBwYwZyJWST5kIidwaKVXM0RkV0dCbJL3NUJ1RyNMZZJWRT5UI0NwLGSmNENVRvVSbGJSSTUUIzdwQNRTVFgjVwRBJETTQCJ0UGRyYUMWRD5kUuNubYM3QSVSZuZ0Ykc2bjU';
  const liveMagnet = decodeXid(liveWandinhaXid);
  assert.match(liveMagnet, /^magnet:\?xt=urn:btih:3D62JGJ2GI7SYECF5UFIGMV4DCDTFCXA/);

  // Malformed: not string or empty
  assert.throws(() => decodeXid(''), /xid deve ser texto não vazio/);
  assert.throws(() => decodeXid(null), /xid deve ser texto não vazio/);
  assert.throws(() => decodeXid(123), /xid deve ser texto não vazio/);

  // Malformed Base64
  assert.throws(() => decodeXid('!!!@@@###$$$'), /Falha ao decodificar Base64/);

  // Decoded is not magnet
  const notMagnet = encodeToXid('https://exemplo.com/video.mp4');
  assert.throws(() => decodeXid(notMagnet), /xid decodificado não inicia com magnet:\?/);
});

test('1.1 pesquisa por título, leitura de resultados e distinção de destaques e vazio', () => {
  // Search with empty results
  const emptyHtml = `
    <div class="slide-container"><div class="slides"><div class="slide-item"><a href="https://starckfilmes-v29.com/catalog/destaque/">Destaque</a></div></div></div>
    <div class="home post-catalog"><div class="st-result"><div class="st-info">BUSCA</div><div class="st-msg"><span>Desculpe, não encontramos nenhum filme.</span></div></div></div>
  `;
  const emptyResults = JSON.parse(JSON.stringify(extractor.parseSearchResults(emptyHtml)));
  assert.deepEqual(emptyResults, []);

  // Search with items, ignoring slide-container
  const validHtml = `
    <div class="slide-container"><div class="slides"><div class="slide-item"><a href="https://starckfilmes-v29.com/catalog/destaque/">Destaque</a></div></div></div>
    <div class="home post-catalog">
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/matrix-resurrections-2021/" title="Matrix: Resurrections">
            <div class="sl-p-imdb">5.7</div>
          </a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/matrix-resurrections-2021/">Matrix: Resurrections</a></h3>
          <div><span class="footer-year">2021</span><span class="footer-audio-type">Dual Áudio</span></div>
        </div>
      </div>
    </div>
  `;
  const results = JSON.parse(JSON.stringify(extractor.parseSearchResults(validHtml)));
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Matrix: Resurrections');
  assert.equal(results[0].year, 2021);
  assert.equal(results[0].link, 'https://starckfilmes-v29.com/catalog/matrix-resurrections-2021/');
  assert.equal(results[0].audioType, 'Dual Áudio');
});

test('1.2 seleção de fichas: tipo, ano, temporada exata e metadados .infos divergentes ignorados', async () => {
  const hashHex = '22e0e1afc417a041c501193be3944ccdef661dd3';
  const magnet = `magnet:?xt=urn:btih:${hashHex}&dn=Coracao.Selvagem.2021.1080p`;
  const xid = encodeToXid(magnet);

  const searchResultsHtml = `
    <div class="home post-catalog">
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/coracao-selvagem-2021/" title="Coração Selvagem"></a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/coracao-selvagem-2021/">Coração Selvagem</a></h3>
          <div><span class="footer-year">2021</span></div>
        </div>
      </div>
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/trilogia-coracao-1999-2003/" title="Trilogia Coração"></a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/trilogia-coracao-1999-2003/">Trilogia Coração</a></h3>
          <div><span class="footer-year">1999-2003</span></div>
        </div>
      </div>
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/coracao-1-temporada/" title="Coração 1ª Temporada"></a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/coracao-1-temporada/">Coração 1ª Temporada</a></h3>
          <div><span class="footer-year">2021</span></div>
        </div>
      </div>
    </div>
  `;

  // Ficha com .infos trazendo 2026 estático, mas Lançamento real 2021
  const postHtml = `
    <div class="infos">2026, 1080p, Ação, Crime, Filmes</div>
    <h1>Coração Selvagem Torrent (2021) Dual Áudio Download</h1>
    <h2 class="post-title">Coração Selvagem</h2>
    <p><span>Nome Original:</span><span>Wild Heart</span></p>
    <p><span>Lançamento:</span><span>2021</span></p>
    <div class="post-buttons">
      <div class="buttons-content">
        <span class="btn-down">
          <a href="https://filmedl.com/?xid=${xid}"></a>
          <span class="text">
            <span>Dual Áudio</span>
            <span>Download</span>
            <span>1080p (2.09 GB)</span>
          </span>
        </span>
      </div>
    </div>
  `;

  const app = runtime((url) => {
    if (url.hostname.includes('themoviedb.org')) {
      return { body: mockTmdb({ id: 100, title: 'Coração Selvagem', originalTitle: 'Wild Heart', releaseDate: '2021-05-10' }) };
    }
    if (url.searchParams.get('s') === 'Coração Selvagem') {
      return searchResultsHtml;
    }
    if (url.pathname.includes('coracao-selvagem-2021')) {
      return postHtml;
    }
    throw new Error(`URL não tratada: ${url.href}`);
  });

  const streams = await app.getStreams('100', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].infoHash, hashHex);
  assert.equal(streams[0].language, 'Dublado (Não PT-BR?)');
  assert.equal(streams[0].size, '2.09 GB');
});

test('1.2 séries: rejeita homônimos e aceita títulos PT-BR, original e alternativo com sufixo observado', async (t) => {
  const hash = 'd8fda4993a323f2c1045ed0a8332bc1887328ae0';
  const xid = encodeToXid(`magnet:?xt=urn:btih:${hash}&dn=Serie.S01E01.1080p`);
  for (const { title, originalTitle, alternativeTitles = [], postTitle, accepted } of [
    { title: 'The Office', originalTitle: 'The Office', postTitle: 'The Office Mexico 1ª Temporada', accepted: false },
    { title: 'Lost', originalTitle: 'Lost', postTitle: 'Lost in Space 1ª Temporada', accepted: false },
    { title: 'Wandinha', originalTitle: 'Wednesday', postTitle: 'Wandinha – 1ª Temporada Completa', accepted: true },
    { title: 'Wandinha', originalTitle: 'Wednesday', postTitle: 'Wednesday 1ª Temporada', accepted: true },
    {
      title: 'Wandinha', originalTitle: 'Wednesday',
      alternativeTitles: [{ iso_3166_1: 'BR', title: 'A Família Addams: Wandinha' }],
      postTitle: 'A Família Addams: Wandinha 1ª Temporada', accepted: true,
    },
  ]) {
    await t.test(postTitle, async () => {
      const postUrl = 'https://starckfilmes-v29.com/catalog/serie-1-temporada/';
      const app = runtime((url) => {
        if (url.hostname.includes('themoviedb.org')) {
          return { body: mockTmdb({ mediaType: 'tv', title, originalTitle, alternativeTitles }) };
        }
        if (url.searchParams.has('s')) {
          return `<div class="home post-catalog"><div class="item">
            <h3><a class="title" href="${postUrl}">${postTitle}</a></h3>
          </div></div>`;
        }
        assert.equal(url.href, postUrl);
        return `<h1>${postTitle}</h1><h2 class="post-title">${postTitle}</h2>
          <div class="post-buttons"><span class="btn-down">
            <a href="https://filmedl.com/?xid=${xid}"></a>
            <span class="text"><span>1080p</span></span>
          </span></div>`;
      });
      const streams = await app.getStreams('119051', 'tv', 1, 1);
      assert.equal(streams.length, accepted ? 1 : 0);
      assert.equal(app.calls.filter(({ url }) => url === postUrl).length, accepted ? 1 : 0);
      assert.deepEqual(app.logs, []);
      if (accepted) assert.equal(streams[0].infoHash, hash);
    });
  }
});

test('1.4 ficha sem botões observados registra erro e não usa links de outras seções', async () => {
  const xid = encodeToXid('magnet:?xt=urn:btih:22e0e1afc417a041c501193be3944ccdef661dd3');
  for (const extraHtml of [
    '',
    `<span class="btn-down"><a href="https://filmedl.com/?xid=${xid}">Download</a></span>`,
    `<a href="https://filmedl.com/?xid=${xid}">Destaque</a>`,
  ]) {
    const app = runtime((url) => {
      if (url.hostname.includes('themoviedb.org')) {
        return { body: mockTmdb({ title: 'Filme Teste', originalTitle: 'Filme Teste' }) };
      }
      if (url.searchParams.has('s')) {
        return `<div class="home post-catalog"><div class="item">
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/filme-teste/">Filme Teste</a></h3>
        </div></div>`;
      }
      return `<h1>Filme Teste</h1><div class="post-buttons"></div>${extraHtml}`;
    });
    assert.deepEqual(await app.getStreams('100', 'movie', null, null), []);
    assert.equal(app.warnings.length, 1);
    assert.match(app.warnings[0], /\[Starck Filmes\] Opção Ficha .*filme-teste\/ descartada: Ficha sem botões/);
    assert.equal(app.logs.length, 1);
    assert.match(app.logs[0], /\[Starck Filmes\] Todas as opções falharam:.*Ficha sem botões/);
  }
});

test('1.4 falha de uma ficha preserva streams de outra ficha aceita, em qualquer ordem', async () => {
  const hash = '22e0e1afc417a041c501193be3944ccdef661dd3';
  const xid = encodeToXid(`magnet:?xt=urn:btih:${hash}&dn=Filme.Teste.1080p`);
  for (const paths of [['sem-botoes', 'valida'], ['valida', 'sem-botoes']]) {
    const app = runtime((url) => {
      if (url.hostname.includes('themoviedb.org')) {
        return { body: mockTmdb({ title: 'Filme Teste', originalTitle: 'Filme Teste' }) };
      }
      if (url.searchParams.has('s')) {
        return `<div class="home post-catalog">${paths.map((name) => `<div class="item">
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/${name}/">Filme Teste</a></h3>
        </div>`).join('')}</div>`;
      }
      const button = url.pathname.endsWith('/valida/') ? `<span class="btn-down">
        <a href="https://filmedl.com/?xid=${xid}"></a>
        <span class="text"><span>1080p</span></span></span>` : '';
      return `<h1>Filme Teste</h1><div class="post-buttons">${button}</div>`;
    });
    const streams = await app.getStreams('100', 'movie', null, null);
    assert.equal(streams.length, 1);
    assert.equal(streams[0].infoHash, hash);
    assert.equal(app.warnings.length, 1);
    assert.match(app.warnings[0], /\[Starck Filmes\] Opção Ficha .*sem-botoes\/ descartada: Ficha sem botões/);
    assert.deepEqual(app.logs, []);
  }
});

function encodeBencode(value) {
  if (Number.isInteger(value)) return Buffer.from(`i${value}e`);
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes]);
  }
  if (typeof value === 'string') return encodeBencode(Buffer.from(value));
  if (Array.isArray(value)) return Buffer.concat([Buffer.from('l'), ...value.map(encodeBencode), Buffer.from('e')]);
  const keys = Object.keys(value).sort();
  return Buffer.concat([Buffer.from('d'), ...keys.flatMap((key) => [encodeBencode(key), encodeBencode(value[key])]), Buffer.from('e')]);
}

function buildTestTorrent(paths, lengths) {
  return encodeBencode({
    announce: 'udp://tracker.example:80/announce',
    info: {
      name: 'pacote',
      'piece length': 262144,
      pieces: 'x',
      files: paths.map((file, index) => ({ length: lengths[index], path: [file] })),
    },
  });
}

test('1.2 e 1.5 séries: temporada posterior permitida, seleção exata e resolução de pacote via torrent-files', async () => {
  const hashHex = 'd8fda4993a323f2c1045ed0a8332bc1887328ae0';
  const magnet = `magnet:?xt=urn:btih:${hashHex}&dn=Wandinha.S02.1080p.HDR`;
  const xid = encodeToXid(magnet);

  const searchResultsHtml = `
    <div class="home post-catalog">
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/wandinha-1-temporada/"></a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/wandinha-1-temporada/">Wandinha – 1ª Temporada Completa</a></h3>
          <div><span class="footer-year">2022</span></div>
        </div>
      </div>
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/wandinha-2-temporada/"></a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/wandinha-2-temporada/">Wandinha 2ª Temporada</a></h3>
          <div><span class="footer-year">2025</span></div>
        </div>
      </div>
    </div>
  `;

  const postT2Html = `
    <h1>Wandinha 2ª Temporada Torrent (2025) Dual Áudio Download</h1>
    <h2 class="post-title">Wandinha 2ª Temporada</h2>
    <p><span>Nome Original:</span><span>Wednesday Season 2</span></p>
    <p><span>Lançamento:</span><span>2025</span></p>
    <div class="post-buttons">
      <div class="buttons-content">
        <span class="btn-down">
          <a href="https://filmedl.com/?xid=${xid}"></a>
          <span class="text">
            <span>Dual Áudio</span>
            <span>Download</span>
            <span>1080p (10.94 GB)</span>
          </span>
        </span>
      </div>
    </div>
  `;

  const torrentBuffer = buildTestTorrent(
    ['Wandinha.S02E01.1080p.HDR.mkv', 'Wandinha.S02E02.1080p.HDR.mkv'],
    [1589000000, 1589000000]
  );

  const app = runtime((url) => {
    if (url.hostname.includes('themoviedb.org')) {
      // Estreia em 2022, mas pedimos temporada 2 (2025)
      return { body: mockTmdb({ mediaType: 'tv', id: 119051, title: 'Wandinha', originalTitle: 'Wednesday', firstAirDate: '2022-11-23' }) };
    }
    if (url.searchParams.get('s') === 'Wandinha') {
      return searchResultsHtml;
    }
    if (url.pathname.includes('wandinha-2-temporada')) {
      return postT2Html;
    }
    if (url.hostname.includes('itorrents.org')) {
      return { buffer: torrentBuffer };
    }
    throw new Error(`URL não tratada: ${url.href}`);
  });

  const streams = await app.getStreams('119051', 'tv', 2, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, `torrent://${hashHex}/0`);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].infoHash, hashHex);
  assert.match(streams[0].name, /🧲 P2P/);
  assert.match(streams[0].name, /Starck Filmes 1080p/);
});

test('1.4 deduplicação de opções e preservação de qualidade Desconhecida', async () => {
  const hashHex = '4bcfc3bc911b3979143a763826a64d8b3c1e562b';
  // Magnet sem qualidade no rótulo e sem resolução no dn
  const magnet1 = `magnet:?xt=urn:btih:${hashHex}&dn=Filme.Sem.Qualidade&xl=1000`;
  const xid1 = encodeToXid(magnet1);
  // Repetido (mesmo hash, trackers diferentes)
  const magnet2 = `magnet:?xt=urn:btih:${hashHex}&dn=Filme.Sem.Qualidade&tr=udp://outro.tracker:80`;
  const xid2 = encodeToXid(magnet2);

  const searchResultsHtml = `
    <div class="home post-catalog">
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/filme-teste/"></a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/filme-teste/">Filme Teste</a></h3>
          <div><span class="footer-year">2020</span></div>
        </div>
      </div>
    </div>
  `;

  const postHtml = `
    <h1>Filme Teste Torrent (2020) Dublado Download</h1>
    <h2 class="post-title">Filme Teste</h2>
    <p><span>Nome Original:</span><span>Test Movie</span></p>
    <p><span>Lançamento:</span><span>2020</span></p>
    <div class="post-buttons">
      <div class="buttons-content">
        <span class="btn-down">
          <a href="https://filmedl.com/?xid=${xid1}"></a>
          <span class="text">
            <span>Dublado</span>
            <span>Download</span>
            <span>1.50 GB</span>
          </span>
        </span>
        <span class="btn-down">
          <a href="https://filmedl.com/?xid=${xid2}"></a>
          <span class="text">
            <span>Dublado</span>
            <span>Download</span>
            <span>1.50 GB</span>
          </span>
        </span>
      </div>
    </div>
  `;

  const app = runtime((url) => {
    if (url.hostname.includes('themoviedb.org')) {
      return { body: mockTmdb({ id: 200, title: 'Filme Teste', originalTitle: 'Test Movie', releaseDate: '2020-01-01' }) };
    }
    if (url.searchParams.get('s') === 'Filme Teste') return searchResultsHtml;
    if (url.pathname.includes('filme-teste')) return postHtml;
    throw new Error(`URL não tratada: ${url.href}`);
  });

  const streams = await app.getStreams('200', 'movie', null, null);
  // Deve ter apenas 1 stream (deduplicado pelo infoHash)
  assert.equal(streams.length, 1);
  // Qualidade preservada como Desconhecida
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].infoHash, hashHex);
  assert.match(streams[0].name, /Starck Filmes Desconhecida/);
});

test('1.4 e 1.5 opção malformada ou cache inválido descartados sem perda da opção válida', async () => {
  const validHash = '22e0e1afc417a041c501193be3944ccdef661dd3';
  const validMagnet = `magnet:?xt=urn:btih:${validHash}&dn=Filme.Bom.1080p&xl=2000`;
  const validXid = encodeToXid(validMagnet);
  const malformedXid = 'INVALIDO_BASE64_!!!';

  const searchResultsHtml = `
    <div class="home post-catalog">
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/filme-parcial/"></a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/filme-parcial/">Filme Parcial</a></h3>
          <div><span class="footer-year">2023</span></div>
        </div>
      </div>
    </div>
  `;

  const postHtml = `
    <h1>Filme Parcial Torrent (2023) Dual Áudio Download</h1>
    <h2 class="post-title">Filme Parcial</h2>
    <p><span>Nome Original:</span><span>Partial Movie</span></p>
    <p><span>Lançamento:</span><span>2023</span></p>
    <div class="post-buttons">
      <div class="buttons-content">
        <span class="btn-down">
          <a href="https://filmedl.com/?xid=${malformedXid}"></a>
          <span class="text">
            <span>Dual Áudio</span>
            <span>Download</span>
            <span>720p (1.0 GB)</span>
          </span>
        </span>
        <span class="btn-down">
          <a href="https://filmedl.com/?xid=${validXid}"></a>
          <span class="text">
            <span>Dual Áudio</span>
            <span>Download</span>
            <span>1080p (2.0 GB)</span>
          </span>
        </span>
      </div>
    </div>
  `;

  const app = runtime((url) => {
    if (url.hostname.includes('themoviedb.org')) {
      return { body: mockTmdb({ id: 300, title: 'Filme Parcial', originalTitle: 'Partial Movie', releaseDate: '2023-01-01' }) };
    }
    if (url.searchParams.get('s') === 'Filme Parcial') return searchResultsHtml;
    if (url.pathname.includes('filme-parcial')) return postHtml;
    throw new Error(`URL não tratada: ${url.href}`);
  });

  const streams = await app.getStreams('300', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, validHash);
  assert.equal(app.warnings.length, 1);
  assert.match(app.warnings[0], /\[Starck Filmes\] Opção/);
});

test('1.6 falha agregada: quando todas as opções falham retorna [] e registra logs', async () => {
  const malformedXid = 'INVALIDO_BASE64_!!!';

  const searchResultsHtml = `
    <div class="home post-catalog">
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/filme-falha/"></a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/filme-falha/">Filme Falha</a></h3>
          <div><span class="footer-year">2023</span></div>
        </div>
      </div>
    </div>
  `;

  const postHtml = `
    <h1>Filme Falha Torrent (2023) Dual Áudio Download</h1>
    <h2 class="post-title">Filme Falha</h2>
    <p><span>Nome Original:</span><span>Fail Movie</span></p>
    <p><span>Lançamento:</span><span>2023</span></p>
    <div class="post-buttons">
      <div class="buttons-content">
        <span class="btn-down">
          <a href="https://filmedl.com/?xid=${malformedXid}"></a>
          <span class="text"><span>Dual Áudio</span><span>Download</span></span>
        </span>
      </div>
    </div>
  `;

  const app = runtime((url) => {
    if (url.hostname.includes('themoviedb.org')) {
      return { body: mockTmdb({ id: 400, title: 'Filme Falha', originalTitle: 'Fail Movie', releaseDate: '2023-01-01' }) };
    }
    if (url.searchParams.get('s') === 'Filme Falha') return searchResultsHtml;
    if (url.pathname.includes('filme-falha')) return postHtml;
    throw new Error(`URL não tratada: ${url.href}`);
  });

  const streams = await app.getStreams('400', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(app.logs.length, 1);
  assert.match(app.logs[0], /\[Starck Filmes\] Todas as opções falharam/);
});

test('1.6 fonte indisponível registra erro e devolve []', async () => {
  const app = runtime((url) => {
    if (url.hostname.includes('themoviedb.org')) {
      return { body: mockTmdb({ id: 500, title: 'Filme Rede', originalTitle: 'Network Movie', releaseDate: '2020-01-01' }) };
    }
    throw new Error('Falha de conexão com starckfilmes');
  });

  const streams = await app.getStreams('500', 'movie', null, null);
  assert.deepEqual(streams, []);
  assert.equal(app.logs.length, 1);
  assert.match(app.logs[0], /\[Starck Filmes\] Falha de conexão com starckfilmes/);
});

test('formatador: template Prism exibe selo e 🧲 P2P', async () => {
  const hashHex = '22e0e1afc417a041c501193be3944ccdef661dd3';
  const magnet = `magnet:?xt=urn:btih:${hashHex}&dn=Filme.Prism.1080p&xl=2248761068`;
  const xid = encodeToXid(magnet);

  const searchResultsHtml = `
    <div class="home post-catalog">
      <div class="item">
        <div class="sub-item">
          <a href="https://starckfilmes-v29.com/catalog/filme-prism/"></a>
          <h3><a class="title" href="https://starckfilmes-v29.com/catalog/filme-prism/">Filme Prism</a></h3>
          <div><span class="footer-year">2024</span></div>
        </div>
      </div>
    </div>
  `;

  const postHtml = `
    <h1>Filme Prism Torrent (2024) Dual Áudio Download</h1>
    <h2 class="post-title">Filme Prism</h2>
    <p><span>Nome Original:</span><span>Prism Movie</span></p>
    <p><span>Lançamento:</span><span>2024</span></p>
    <div class="post-buttons">
      <div class="buttons-content">
        <span class="btn-down">
          <a href="https://filmedl.com/?xid=${xid}"></a>
          <span class="text"><span>Dual Áudio</span><span>Download</span><span>1080p (2.09 GB)</span></span>
        </span>
      </div>
    </div>
  `;

  const app = runtime((url) => {
    if (url.hostname.includes('themoviedb.org')) {
      return { body: mockTmdb({ id: 600, title: 'Filme Prism', originalTitle: 'Prism Movie', releaseDate: '2024-01-01' }) };
    }
    if (url.searchParams.get('s') === 'Filme Prism') return searchResultsHtml;
    if (url.pathname.includes('filme-prism')) return postHtml;
    throw new Error(`URL não tratada: ${url.href}`);
  }, codes.prism);

  const streams = await app.getStreams('600', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.match(streams[0].name, /🧲 P2P/);
  assert.match(streams[0].name, /Filme Prism/);
});
