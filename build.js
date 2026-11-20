#!/usr/bin/env node
/** Empacota provedores em CommonJS ES2016 e gera os manifests de instalação. */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'src');
const OUT_DIR = path.join(ROOT_DIR, 'providers');
const REFERENCE_COMBINATION = 'prism/all/all/all';
const PUBLIC_ORIGIN = 'https://raw.githubusercontent.com/nathanael540/nuvio-fontes-ptbr-plugin/main';
const FILTER_MODULE = path.join(SRC_DIR, '_blocks', 'stream-filter', 'index.mjs');
const FORMATTER_MODULE = path.join(SRC_DIR, '_blocks', 'custom-formatter', 'index.mjs');

// Módulos que o app entrega via require() (NuvioMobile e NuvioTV): não devem ser empacotados.
const EXTERNAL_MODULES = ['cheerio-without-node-native', 'react-native-cheerio', 'cheerio', 'crypto-js'];

function discoverProviders() {
  return fs
    .readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name);
}

/**
 * Templates concretos do bloco custom-formatter (todos os valores de FORMATTER, exceto "auto").
 * O bloco é a fonte única da lista: build, manifests, servidor local e testes a leem daqui.
 */
async function loadFormats() {
  const { FORMATTER } = await import(pathToFileURL(FORMATTER_MODULE).href);
  return Object.values(FORMATTER).filter((value) => value !== FORMATTER.AUTO);
}

/** Pasta dos provedores de um formato: <rootDir>/<formato>/providers. */
function formatOutDir(formatter, rootDir = ROOT_DIR) {
  return path.join(rootDir, formatter, 'providers');
}

/**
 * Empacota src/<id>/index.js em <outDir>/<id>.js e retorna o caminho gerado. Com `formatter`, fixa a
 * constante NUVIO_FORMATTER no template (define do esbuild) e o `outDir` padrão passa a ser
 * <formato>/providers. Lança erro se a entrada não existir, se o formato for desconhecido ou se o
 * esbuild falhar.
 */
async function buildProvider(id, { minify = false, outDir, formatter = null } = {}) {
  const entryPoint = path.join(SRC_DIR, id, 'index.js');
  if (!fs.existsSync(entryPoint)) {
    throw new Error(`src/${id}/index.js não encontrado`);
  }
  if (formatter !== null) {
    const formats = await loadFormats();
    if (!formats.includes(formatter)) {
      throw new Error(`formato desconhecido: "${formatter}" (aceitos: ${formats.join(', ')})`);
    }
  }

  const outfile = path.join(outDir || (formatter === null ? OUT_DIR : formatOutDir(formatter)), `${id}.js`);
  const label = formatter === null ? id : `${id} (formato ${formatter})`;
  await esbuild.build({
    ...(formatter === null ? { entryPoints: [entryPoint] } : {
      stdin: {
        contents: `
          import { filterStreams, readStreamFilters } from './_blocks/stream-filter/index.mjs';
          const provider = require(${JSON.stringify(`./${id}/index.js`)});
          const baseId = ${JSON.stringify(id)};
          module.exports = { ...provider, async getStreams(tmdbId, type, season, episode) {
            let filters;
            try {
              filters = readStreamFilters(typeof SCRAPER_ID === 'undefined' ? baseId : SCRAPER_ID, baseId);
            } catch (error) {
              console.error('[' + baseId + '] ' + error.message);
              return [];
            }
            return filterStreams(await provider.getStreams(tmdbId, type, season, episode), filters);
          } };
        `,
        sourcefile: `${id}-manifest.js`,
        resolveDir: SRC_DIR,
      },
    }),
    outfile,
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    target: 'es2016', // Sem async/await, como o build oficial: compatível com versões anteriores do app.
    minify,
    external: EXTERNAL_MODULES,
    define: formatter === null ? {} : { NUVIO_FORMATTER: JSON.stringify(formatter) },
    banner: { js: `/** ${label} - gerado a partir de src/${id}/ — não edite manualmente. */` },
    logLevel: 'warning',
  });

  return outfile;
}

/**
 * Manifest de um formato: cópia do manifest.json com o formato no `name` do repositório. O
 * `filename` (providers/<id>.js) não muda: o app o resolve a partir da pasta do manifest.
 */
function formatManifest(manifest, formatter) {
  return { ...manifest, name: `${manifest.name} (${formatter})` };
}

function readManifestSource(rootDir = ROOT_DIR) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'src', 'manifest.json'), 'utf8'));
}

async function manifestVariants() {
  const formats = await loadFormats();
  const { STREAM_TYPES, QUALITY_FLOORS, LANGUAGE_LEVELS } = await import(pathToFileURL(FILTER_MODULE).href);
  return formats.flatMap((formatter) => STREAM_TYPES.flatMap((type) => QUALITY_FLOORS.flatMap((quality) => (
    LANGUAGE_LEVELS.map((language) => `${formatter}/${type}/${quality}/${language}`)
  ))));
}

function variantScraperId(id, combination) {
  const [, type, quality, language] = combination.split('/');
  return `${id}--${type.toLowerCase()}-${quality}-${language}`;
}

function variantManifest(manifest, combination, origin = PUBLIC_ORIGIN) {
  const [formatter, type, quality, language] = combination.split('/');
  const label = type === 'all' && quality === 'all' && language === 'all'
    ? `${formatter} · lista completa`
    : `${formatter} · ${type}/${quality}/${language}`;
  return {
    ...manifest,
    name: `${manifest.name} (${label})`,
    scrapers: manifest.scrapers.map((scraper) => ({
      ...scraper,
      id: variantScraperId(scraper.id, combination),
      filename: `${origin}/${formatter}/${scraper.filename}`,
    })),
  };
}

async function writeFormatManifests(rootDir = ROOT_DIR) {
  const formats = await loadFormats();
  const manifest = readManifestSource(rootDir);
  const missing = ['', ...formats].flatMap((formatter) => (
    manifest.scrapers.map(({ filename }) => path.join(formatter, filename))
  )).filter((file) => !fs.existsSync(path.join(rootDir, file)));
  if (missing.length) throw new Error(`pacotes ausentes: ${missing.join(', ')}. Rode npm run build para gerar todos.`);

  const variants = await manifestVariants();
  const entries = [
    ['', manifest],
    ...formats.map((formatter) => [formatter, formatManifest(manifest, formatter)]),
    ...variants.map((combination) => [combination, variantManifest(manifest, combination)]),
  ];
  return entries.map(([folder, data]) => {
    const file = path.join(rootDir, folder, 'manifest.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const indent = variants.includes(folder) ? undefined : 2;
    fs.writeFileSync(file, `${JSON.stringify(data, null, indent)}\n`);
    return file;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const minify = args.includes('--minify');
  const requested = args.filter((arg) => !arg.startsWith('-'));
  const ids = requested.length > 0 ? requested : discoverProviders();
  const formats = [null].concat(await loadFormats());

  for (const formatter of formats) {
    fs.mkdirSync(formatter === null ? OUT_DIR : formatOutDir(formatter), { recursive: true });
  }

  const failures = [];
  for (const id of ids) {
    for (const formatter of formats) {
      const file = formatter === null ? `providers/${id}.js` : `${formatter}/providers/${id}.js`;
      try {
        const outfile = await buildProvider(id, { minify, formatter });
        const sizeKb = (fs.statSync(outfile).size / 1024).toFixed(1);
        console.log(`✅ ${file} (${sizeKb} KB)`);
      } catch (error) {
        failures.push(file);
        console.error(`❌ ${file}: ${error.message}`);
      }
    }
  }

  try {
    for (const file of await writeFormatManifests()) {
      console.log(`✅ ${path.relative(ROOT_DIR, file).split(path.sep).join('/')}`);
    }
  } catch (error) {
    failures.push('manifests de formato');
    console.error(`❌ manifests de formato: ${error.message}`);
  }

  if (ids.length === 0) {
    console.log('Nenhum provedor em src/. Copie src/_template para src/<id> para começar.');
  }
  if (failures.length > 0) {
    console.error(`\nFalha em ${failures.length} arquivo(s): ${failures.join(', ')}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildProvider, formatManifest, formatOutDir, loadFormats, manifestVariants,
  PUBLIC_ORIGIN, REFERENCE_COMBINATION, readManifestSource, variantManifest, variantScraperId, writeFormatManifests,
};
