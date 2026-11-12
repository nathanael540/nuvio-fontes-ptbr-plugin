const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { buildProvider, formatManifest, formatOutDir, loadFormats, writeFormatManifests } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

function tempDir(t, prefix) {
  const dir = createTempDir(prefix);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Fonte fictícia descrita no topo de src/_template/extractor.js, com o TMDB interceptado.
const TEMPLATE_ROUTES = {
  'https://fonte.exemplo/?s=duna+parte+dois': '<a class="item" href="/filme/duna-parte-dois/" data-year="2024">Duna: Parte Dois</a>',
  'https://fonte.exemplo/filme/duna-parte-dois/':
    '<div id="player" data-player="https://player.fonte.exemplo/e/abc" data-server="Filemoon" data-audio="Dublado"></div>',
  'https://player.fonte.exemplo/e/abc':
    String.raw`<script>var file = "https:\/\/cdn.fonte.exemplo\/v\/master.m3u8"; var label = "1080p"; var size = "2.1 GB";</script>`,
};

const TMDB_MOVIE = {
  title: 'Duna: Parte Dois',
  original_title: 'Dune: Part Two',
  release_date: '2024-02-27',
  external_ids: { imdb_id: 'tt15239678' },
  alternative_titles: { titles: [] },
  original_language: 'en',
  genres: [],
  origin_country: ['US'],
};

async function templateStreams(code) {
  const context = {
    module: { exports: {} },
    TMDB_API_KEY: 'chave-de-teste',
    URL,
    URLSearchParams,
    console: { log() {}, warn() {}, error: (message) => assert.fail(String(message)) },
    fetch: async (url) => {
      const href = String(url);
      const body = href.startsWith('https://api.themoviedb.org/') ? JSON.stringify(TMDB_MOVIE) : TEMPLATE_ROUTES[href];
      if (body === undefined) throw new Error(`requisição inesperada: ${href}`);
      return { ok: true, status: 200, url: href, text: async () => body, json: async () => JSON.parse(body) };
    },
  };
  vm.runInNewContext(code, context);
  return context.module.exports.getStreams('693134', 'movie', null, null);
}

test('template empacota em CommonJS sem async/await e retorna lista vazia', async (t) => {
  const outDir = tempDir(t, 'nuvio-build-');

  const outfile = await buildProvider('_template', { outDir });
  const code = fs.readFileSync(outfile, 'utf-8');
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/, 'saída deve ser es2016, sem async/await');

  const { getStreams } = require(outfile);
  assert.deepEqual(await getStreams('550', 'movie', null, null), []);
});

test('build falha de forma explícita para provedor inexistente', async () => {
  await assert.rejects(buildProvider('nao-existe'), /src\/nao-existe\/index\.js não encontrado/);
});

test('formatos vêm do bloco custom-formatter, sem auto', async () => {
  assert.deepEqual(await loadFormats(), ['gdrive', 'prism']);
});

test('variante de formato grava <formato>/providers/<id>.js em es2016 com o template fixado', async (t) => {
  const rootDir = tempDir(t, 'nuvio-build-variant-');
  const base = fs.readFileSync(await buildProvider('_template', { outDir: rootDir }), 'utf-8');
  assert.match(base, /typeof NUVIO_FORMATTER/, 'o arquivo base lê a constante por typeof');

  const codes = {};
  for (const formatter of await loadFormats()) {
    const outfile = await buildProvider('_template', { outDir: formatOutDir(formatter, rootDir), formatter });
    assert.equal(path.relative(rootDir, outfile).split(path.sep).join('/'), `${formatter}/providers/_template.js`);
    const code = fs.readFileSync(outfile, 'utf-8');
    assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
    assert.doesNotMatch(code, /typeof NUVIO_FORMATTER/, 'a constante deve ser trocada pelo define');
    assert.match(code, new RegExp(`formato ${formatter}`), 'banner cita o formato');
    codes[formatter] = code;
  }

  const [gdrive] = await templateStreams(codes.gdrive);
  assert.equal(gdrive.name, 'Template 1080p\n🗣️ Dublado\n🌐 HTTP 🔍 Filemoon');
  assert.equal(gdrive.title, '🗣️ Dublado\n🌐 HTTP 📦 2.1 GB 🔍 Filemoon');

  const [prism] = await templateStreams(codes.prism);
  assert.equal(prism.name, '🚀 FHD 1080p\n🎬 Duna: Parte Dois (2024)\n🗣️ Dublado\n🌐 HTTP\n📡 Filemoon');
  assert.equal(prism.title, '🎬 Duna: Parte Dois (2024)\n🗣️ Dublado\n🌐 HTTP 📦 2.1 GB\n📡 Filemoon\n🔍Template');
});

test('build falha de forma explícita para formato inexistente', async () => {
  await assert.rejects(buildProvider('_template', { formatter: 'auto' }), /formato desconhecido: "auto" \(aceitos: gdrive, prism\)/);
});

test('formatManifest troca só o name do repositório; o filename continua relativo à pasta do manifest', () => {
  const manifest = {
    name: 'Repo',
    version: '1.0.0',
    scrapers: [{ id: 'a', name: 'A', filename: 'providers/a.js', enabled: true }],
  };
  assert.deepEqual(formatManifest(manifest, 'prism'), { ...manifest, name: 'Repo (prism)' });
  assert.equal(manifest.name, 'Repo', 'não altera a entrada');
});

test('writeFormatManifests gera <formato>/manifest.json para cada formato', async (t) => {
  const rootDir = tempDir(t, 'nuvio-manifests-');
  fs.writeFileSync(path.join(rootDir, 'manifest.json'), JSON.stringify({ name: 'Repo', version: '1.0.0', scrapers: [] }));

  const written = await writeFormatManifests(rootDir);

  assert.deepEqual(
    written.map((file) => path.relative(rootDir, file).split(path.sep).join('/')),
    ['gdrive/manifest.json', 'prism/manifest.json'],
  );
  assert.equal(JSON.parse(fs.readFileSync(written[1], 'utf8')).name, 'Repo (prism)');
});
