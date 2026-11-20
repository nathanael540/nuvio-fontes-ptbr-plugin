const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const { loadFormats, manifestVariants, PUBLIC_ORIGIN } = require('../build.js');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function radioValues(name) {
  const pattern = new RegExp(`<input\\s+type="radio"\\s+name="${name}"\\s+value="([^"]+)"`, 'g');
  return [...HTML.matchAll(pattern)].map((match) => match[1]);
}

test('index.html é autocontido e usa apenas fontes do Google como recurso externo', () => {
  assert.doesNotMatch(HTML, /<script[^>]+src=/i, 'não deve carregar scripts externos');

  const externalStyles = [...HTML.matchAll(/<link[^>]+href="(https?:\/\/[^"]+)"/gi)].map((match) => match[1]);
  assert.ok(externalStyles.length > 0, 'deve carregar a folha de estilos do Google Fonts');
  for (const href of externalStyles) {
    const { hostname } = new URL(href);
    assert.ok(
      hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com',
      `recurso externo não permitido: ${href}`,
    );
  }
});

test('index.html cobre exatamente todas as opções de filtro e formato da matriz', async () => {
  const { STREAM_TYPES, QUALITY_FLOORS, LANGUAGE_LEVELS } = await import(
    pathToFileURL(path.join(ROOT, 'src', '_blocks', 'stream-filter', 'index.mjs')).href
  );
  const formats = await loadFormats();

  assert.deepEqual(radioValues('format').sort(), [...formats].sort());
  assert.deepEqual(radioValues('type').sort(), [...STREAM_TYPES].sort());
  assert.deepEqual(radioValues('quality').sort(), [...QUALITY_FLOORS].sort());
  assert.deepEqual(radioValues('language').sort(), [...LANGUAGE_LEVELS].sort());
});

test('index.html monta URLs válidas para todas as combinações publicadas na matriz', async () => {
  assert.ok(HTML.includes(`PUBLIC_ORIGIN = '${PUBLIC_ORIGIN}'`), 'origem pública deve coincidir com build.js');
  assert.match(HTML, /prefers-color-scheme:\s*dark/, 'deve respeitar o tema escuro automático do navegador');

  const variants = await manifestVariants();
  const buildPathMatch = HTML.match(/function buildManifestPath\(config\)\s*\{([\s\S]*?)\}/);
  assert.ok(buildPathMatch, 'função buildManifestPath deve existir');
  const buildManifestPath = new Function('config', buildPathMatch[1]);

  const generated = new Set();
  for (const format of radioValues('format')) {
    for (const type of radioValues('type')) {
      for (const quality of radioValues('quality')) {
        for (const language of radioValues('language')) {
          const manifestPath = buildManifestPath({ format, type, quality, language });
          assert.match(manifestPath, /^\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/manifest\.json$/);
          const relative = manifestPath.slice(1);
          assert.ok(fs.existsSync(path.join(ROOT, relative)), `manifest inexistente: ${relative}`);
          generated.add(relative.replace(/\/manifest\.json$/, ''));
        }
      }
    }
  }

  assert.deepEqual([...generated].sort(), [...variants].sort());
});
