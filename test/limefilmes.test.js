const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const esbuild = require('esbuild');
const { createTempDir } = require('./support/temp-dir');

test('carregamento do provedor não faz requisições', async () => {
  const outDir = createTempDir('limefilmes-test-');
  try {
    const file = await buildProvider('limefilmes', { outDir });
    const context = { module: { exports: {} }, fetch: () => { throw new Error('fetch no carregamento'); } };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
    assert.equal(typeof context.module.exports.getStreams, 'function');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('busca continua após lista vazia ou sem post aceito', async () => {
  const outDir = createTempDir('limefilmes-search-');
  const previousFetch = global.fetch;
  try {
    const file = path.join(outDir, 'extractor.cjs');
    await esbuild.build({ entryPoints: ['src/limefilmes/extractor.js'], bundle: true, platform: 'node', format: 'cjs', outfile: file });
    const { findPosts } = require(file);
    const terms = [];
    global.fetch = async (input) => {
      const url = new URL(input);
      let body;
      if (url.pathname.endsWith('/categories')) body = [{ id: { filmes: 68, series: 77, colecao: 7819 }[url.searchParams.get('slug')] }];
      else if (url.pathname.endsWith('/posts')) {
        const term = url.searchParams.get('search');
        terms.push(term);
        body = term === 'Duna: Parte Dois' ? [] : term === 'Duna: Parte 2'
          ? [{ id: 1, link: 'https://www.limefilmes.com/post', title: { rendered: 'Outro (2024)' }, categories: [68] }]
          : [{ id: 2, link: 'https://www.limefilmes.com/post', title: { rendered: 'Duna: Parte 2 (2024)' }, categories: [68] }];
      } else body = '<article></article>';
      return { ok: true, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
    };
    const media = { title: 'Duna: Parte Dois', originalTitle: 'Dune: Part Two', year: 2024, imdbId: null, alternativeTitles: [] };
    const posts = await findPosts(media, { mediaType: 'movie', season: null });
    assert.deepEqual(terms, ['Duna: Parte Dois', 'Duna: Parte 2', 'Dune: Part Two']);
    assert.equal(posts[0].id, 2);
  } finally {
    global.fetch = previousFetch;
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('seleciona temporada e descarta coleção e IMDb divergente', async () => {
  const outDir = createTempDir('limefilmes-match-');
  const previousFetch = global.fetch;
  try {
    const file = path.join(outDir, 'extractor.cjs');
    await esbuild.build({ entryPoints: ['src/limefilmes/extractor.js'], bundle: true, platform: 'node', format: 'cjs', outfile: file });
    const { findPosts } = require(file);
    const post = (id, title, category) => ({ id, link: `https://www.limefilmes.com/${id}`, title: { rendered: title }, categories: [category] });
    let data = [post(1, 'Breaking Bad 1ª Temporada', 77), post(2, 'Breaking Bad: A Química do Mal 2ª Temporada', 77)];
    global.fetch = async (input) => {
      const url = new URL(input);
      const body = url.pathname.endsWith('/categories') ? [{ id: { filmes: 68, series: 77, colecao: 7819 }[url.searchParams.get('slug')] }]
        : url.pathname.endsWith('/posts') ? data : url.pathname === '/2' ? '<article></article>' : '<a href="https://imdb.com/title/tt9999999">IMDb</a>';
      return { ok: true, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
    };
    const media = { title: 'Breaking Bad', originalTitle: 'Breaking Bad', year: 2008, imdbId: 'tt0903747', alternativeTitles: [] };
    const selected = await findPosts(media, { mediaType: 'tv', season: 2 });
    assert.deepEqual(selected.map((item) => item.id), [2]);
    data = [post(1, 'Breaking Bad (2008)', 68), post(3, 'Breaking Bad Coleção (2008)', 68)];
    assert.deepEqual(await findPosts(media, { mediaType: 'movie', season: null }), []);
    data = [post(2, 'Breaking Bad (2024)', 68)];
    assert.deepEqual(await findPosts(media, { mediaType: 'movie', season: null }), []);
    data = [post(2, 'Breaking Bad: Alpha 2ª Temporada', 77), post(3, 'Breaking Bad: Bravo 2ª Temporada', 77)];
    media.imdbId = null;
    assert.deepEqual(await findPosts(media, { mediaType: 'tv', season: 2 }), []);
  } finally {
    global.fetch = previousFetch;
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('extrai magnets do artigo e preserva os metadados do rótulo', async () => {
  const outDir = createTempDir('limefilmes-streams-');
  try {
    const gdriveDir = path.join(outDir, 'gdrive');
    const prismDir = path.join(outDir, 'prism');
    fs.mkdirSync(gdriveDir);
    fs.mkdirSync(prismDir);
    const gdriveFile = await buildProvider('limefilmes', { outDir: gdriveDir, formatter: 'gdrive' });
    const prismFile = await buildProvider('limefilmes', { outDir: prismDir, formatter: 'prism' });
    const hash = '51ca3ba90f04bf50394e9eb7e448ceea214d5ad6';
    const oldHash = '8cc4fdc2c777d1464d9043397309f45859b9297b';
    const html = `<title>Dual Áudio 4K</title><article class="col">Outro conteúdo</article><article class="post-block"><a class="download-btn" href="magnet:?xt=urn%3Abtih%3A${hash}&amp;dn=Duna.1080p">1080p | 3.50 GB | Português-BR</a><h3>CAMRip | Inglês</h3><a href="magnet:?xt=urn:btih:${oldHash}"><img></a><a class="download-btn" href="magnet:?xt=urn:btih:${hash}">1080p | 3.50 GB | Português-BR</a><a class="download-btn" href="magnet:?xt=urn:btih:tg4qittt7aulezavga3sya5fglaejhyc">720p | Dual Áudio</a><a class="download-btn" href="magnet:?xt=urn:btih:00000000000000000000000000000000">720p</a><iframe src="https://youtube.com/embed/x"></iframe><div class="related-section"><a href="magnet:?xt=urn:btih:${'a'.repeat(40)}">720p</a></div></article>`;
    const makeContext = () => ({
      module: { exports: {} }, TMDB_API_KEY: 'teste', URL, URLSearchParams,
      console: { log() {}, warn() {}, error: console.error },
      fetch: async (input) => {
        const url = new URL(input);
        let body;
        if (url.hostname === 'api.themoviedb.org') body = { title: 'Duna', original_title: 'Duna', release_date: '2024-01-01', external_ids: { imdb_id: null }, alternative_titles: { titles: [] }, original_language: 'en', genres: [], origin_country: [] };
        else if (url.pathname.endsWith('/categories')) body = [{ id: { filmes: 68, series: 77, colecao: 7819 }[url.searchParams.get('slug')] }];
        else if (url.pathname.endsWith('/posts')) body = [{ id: 1, link: 'https://www.limefilmes.com/post', title: { rendered: 'Duna (2024)' }, categories: [68] }];
        else body = html;
        return { ok: true, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
      },
    });

    const gdriveContext = makeContext();
    vm.runInNewContext(fs.readFileSync(gdriveFile, 'utf8'), gdriveContext);
    const streams = await gdriveContext.module.exports.getStreams('1', 'movie', null, null);
    assert.equal(streams.length, 3);
    assert.equal(streams[0].quality, '1080p');
    assert.equal(streams[0].language, 'Dublado');
    assert.equal(streams[0].size, '3.50 GB');
    assert.equal(streams[0].name, 'LimeFilmes 1080p\n🗣️ Dublado\n🧲 P2P 👥 ?/?');
    assert.equal(streams[0].title, '🗣️ Dublado\n🧲 P2P 📦 3.50 GB 👥 ?/?');
    assert.equal(streams[1].quality, '720p');
    assert.equal(streams[1].infoHash, '99b9044e73f828b2641530372c03a532c0449f02');
    assert.equal(streams[1].language, 'Dublado (Não PT-BR?)');
    assert.equal(streams[1].name, 'LimeFilmes 720p\n🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/?');
    assert.equal(streams[1].title, '🗣️ Dublado (Não PT-BR?)\n🧲 P2P 👥 ?/?');
    assert.equal(streams[2].quality, 'CAM');
    assert.equal(streams[2].language, 'Gringo');
    assert.equal(streams[2].name, 'LimeFilmes CAM\n🗣️ Gringo\n🧲 P2P 👥 ?/?');
    assert.equal(streams[2].title, '🗣️ Gringo\n🧲 P2P 👥 ?/?');
    assert.equal(streams[0].infoHash, hash);
    assert.equal('headers' in streams[0], false);

    const prismContext = makeContext();
    vm.runInNewContext(fs.readFileSync(prismFile, 'utf8'), prismContext);
    const prismStreams = await prismContext.module.exports.getStreams('1', 'movie', null, null);
    assert.equal(prismStreams[0].name, '🚀 FHD 1080p\n🎬 Duna (2024)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?');
    assert.equal(prismStreams[0].title, '🎬 Duna (2024)\n🗣️ Dublado\n🧲 P2P 📦 3.50 GB 🌱 ?/?\n🔍LimeFilmes');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('episódio avulso usa magnet e pacote resolve arquivo; falha é isolada', async () => {
  const outDir = createTempDir('limefilmes-pack-');
  try {
    const file = await buildProvider('limefilmes', { outDir, formatter: 'gdrive' });
    const single = 'a'.repeat(40);
    const pack = 'b'.repeat(40);
    const broken = 'c'.repeat(40);
    let html = `<article class="post-block"><a class="download-btn" href="magnet:?xt=urn:btih:${single}">1080p | Ep-03</a><a class="download-btn" href="magnet:?xt=urn:btih:${pack}&amp;dn=Serie.S01.720p">720p | S01</a><a class="download-btn" href="magnet:?xt=urn:btih:${broken}">720p | S01</a></article>`;
    let torrent = Buffer.from('d4:infod5:filesld6:lengthi100e4:pathl10:S01E03.mp4eeeee');
    const calls = [];
    const context = {
      module: { exports: {} }, TMDB_API_KEY: 'teste', URL, URLSearchParams, Uint8Array, ArrayBuffer, DataView,
      console: { log() {}, warn() {}, error() {} },
      fetch: async (input) => {
        const url = new URL(input);
        calls.push(String(input));
        if (url.hostname === 'itorrents.org') {
          if (url.pathname.toLowerCase().includes(broken)) throw new Error('cache indisponível');
          return { ok: true, arrayBuffer: async () => torrent.buffer.slice(torrent.byteOffset, torrent.byteOffset + torrent.byteLength) };
        }
        let body;
        if (url.hostname === 'api.themoviedb.org') body = { name: 'Série', original_name: 'Série', first_air_date: '2020-01-01', external_ids: { imdb_id: null }, alternative_titles: { results: [] }, original_language: 'en', genres: [], origin_country: [] };
        else if (url.pathname.endsWith('/categories')) body = [{ id: { filmes: 68, series: 77, colecao: 7819 }[url.searchParams.get('slug')] }];
        else if (url.pathname.endsWith('/posts')) body = [{ id: 1, link: 'https://www.limefilmes.com/post', title: { rendered: 'Série 1ª Temporada' }, categories: [77] }];
        else body = html;
        return { ok: true, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
      },
    };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
    const streams = await context.module.exports.getStreams('1', 'tv', 1, 3);
    assert.equal(streams.length, 2);
    const singleStream = streams.find((stream) => stream.url.startsWith('magnet:') && stream.infoHash === single);
    assert.ok(singleStream);
    assert.equal(singleStream.name, 'LimeFilmes 1080p\n🗣️ Idioma Desconhecido\n🧲 P2P 👥 ?/?');
    const packStream = streams.find((stream) => stream.url === `torrent://${pack}/0`);
    assert.ok(packStream);
    assert.equal(packStream.name, 'LimeFilmes 720p\n🗣️ Idioma Desconhecido\n🧲 P2P 👥 ?/?\n📁 S01E03.mp4');
    assert.equal(packStream.title, '🗣️ Idioma Desconhecido\n🧲 P2P 📦 100 B 👥 ?/?\n📁 Serie.S01.720p/S01E03.mp4');
    assert.ok(!calls.some((url) => url.toLowerCase().includes(single)));
    html = `<article class="post-block"><a class="download-btn" href="magnet:?xt=urn:btih:${pack}">720p | Ep 01/02</a></article>`;
    torrent = Buffer.from('d4:infod5:filesld6:lengthi100e4:pathl10:S01E02.mp4eeeee');
    const range = await context.module.exports.getStreams('1', 'tv', 1, 2);
    assert.equal(range[0].url, `torrent://${pack}/0`);
    const missing = await context.module.exports.getStreams('1', 'tv', 1, 1);
    assert.equal(missing.length, 0);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('release sem qualidade no rótulo descobre qualidade no dn ou sai como Desconhecida', async () => {
  const outDir = createTempDir('limefilmes-unknown-');
  try {
    const gdriveDir = path.join(outDir, 'gdrive');
    const prismDir = path.join(outDir, 'prism');
    fs.mkdirSync(gdriveDir);
    fs.mkdirSync(prismDir);
    const gdriveFile = await buildProvider('limefilmes', { outDir: gdriveDir, formatter: 'gdrive' });
    const prismFile = await buildProvider('limefilmes', { outDir: prismDir, formatter: 'prism' });
    const hashA = 'a'.repeat(40);
    const hashB = 'b'.repeat(40);
    const html = `<article class="post-block">
      <a class="download-btn" href="magnet:?xt=urn:btih:${hashA}&amp;dn=Duna.2024.1080p.WEB-DL">Download | Dublado</a>
      <a class="download-btn" href="magnet:?xt=urn:btih:${hashB}&amp;dn=Duna.2024.WEB-DL">Download | Dublado</a>
    </article>`;
    const makeContext = () => ({
      module: { exports: {} }, TMDB_API_KEY: 'teste', URL, URLSearchParams,
      console: { log() {}, warn() {}, error() {} },
      fetch: async (input) => {
        const url = new URL(input);
        let body;
        if (url.hostname === 'api.themoviedb.org') body = { title: 'Duna', original_title: 'Duna', release_date: '2024-01-01', external_ids: { imdb_id: null }, alternative_titles: { titles: [] }, original_language: 'en', genres: [], origin_country: [] };
        else if (url.pathname.endsWith('/categories')) body = [{ id: { filmes: 68, series: 77, colecao: 7819 }[url.searchParams.get('slug')] }];
        else if (url.pathname.endsWith('/posts')) body = [{ id: 1, link: 'https://www.limefilmes.com/post', title: { rendered: 'Duna (2024)' }, categories: [68] }];
        else body = html;
        return { ok: true, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) };
      },
    });

    const gdriveCtx = makeContext();
    vm.runInNewContext(fs.readFileSync(gdriveFile, 'utf8'), gdriveCtx);
    const gdriveStreams = await gdriveCtx.module.exports.getStreams('1', 'movie', null, null);
    assert.equal(gdriveStreams.length, 2);
    assert.equal(gdriveStreams[0].quality, '1080p');
    assert.equal(gdriveStreams[0].name, 'LimeFilmes 1080p\n🗣️ Dublado\n🧲 P2P 👥 ?/?\n📁 Duna.2024.1080p.WEB-DL');
    assert.equal(gdriveStreams[0].title, '🗣️ Dublado\n🧲 P2P 👥 ?/?\n📁 Duna.2024.1080p.WEB-DL');

    assert.equal(gdriveStreams[1].quality, 'Desconhecida');
    assert.equal(gdriveStreams[1].name, 'LimeFilmes Desconhecida\n🗣️ Dublado\n🧲 P2P 👥 ?/?\n📁 Duna.2024.WEB-DL');
    assert.equal(gdriveStreams[1].title, '🗣️ Dublado\n🧲 P2P 👥 ?/?\n📁 Duna.2024.WEB-DL');

    const prismCtx = makeContext();
    vm.runInNewContext(fs.readFileSync(prismFile, 'utf8'), prismCtx);
    const prismStreams = await prismCtx.module.exports.getStreams('1', 'movie', null, null);
    assert.equal(prismStreams[0].quality, '1080p');
    assert.equal(prismStreams[0].name, '🚀 FHD 1080p\n🎬 Duna (2024)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?');
    assert.equal(prismStreams[0].title, '🎬 Duna (2024)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?\n🔍LimeFilmes');

    assert.equal(prismStreams[1].quality, 'Desconhecida');
    assert.equal(prismStreams[1].name, '❓ Desconhecida\n🎬 Duna (2024)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?');
    assert.equal(prismStreams[1].title, '🎬 Duna (2024)\n🗣️ Dublado\n🧲 P2P 🌱 ?/?\n🔍LimeFilmes');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
