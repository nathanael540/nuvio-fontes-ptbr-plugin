import test from 'node:test';
import assert from 'node:assert/strict';

import * as bloggerVideo from '../../../src/_blocks/blogger-video/index.mjs';

const { extractBloggerFormats } = bloggerVideo;

const ESCAPED_HTML = `<script>var player = "{\\"streamingData\\":{\\"formats\\":[{\\"itag\\":22,\\"url\\":\\"https://cdn.example.test/720.mp4\\",\\"qualityLabel\\":\\"720p\\"},{\\"itag\\":18,\\"url\\":\\"https://cdn.example.test/360.mp4\\",\\"qualityLabel\\":\\"360p\\"}]}}";</script>`;

// Mesma forma do fixture do AniTube: aspas externas como entidade HTML.
const ESCAPED_ENTITY_HTML = `<script>var player = &quot;{\\"streamingData\\":{\\"formats\\":[{\\"itag\\":18,\\"url\\":\\"https://cdn.example.test/360.mp4\\",\\"qualityLabel\\":\\"360p\\"}]}}&quot;;</script>`;

const OBJECT_HTML = `<script>var player = {"streamingData":{"formats":[{"itag":137,"url":"https://cdn.example.test/1080.mp4","qualityLabel":"1080p","mimeType":"video/mp4"},{"itag":18,"url":"https://cdn.example.test/360.mp4","qualityLabel":"360p"}]}};</script>`;

const htmlWithFormats = (formats) => `<script>var player = ${JSON.stringify({ streamingData: { formats } })};</script>`;

test('exporta somente extractBloggerFormats', () => {
  assert.deepEqual(Object.keys(bloggerVideo), ['extractBloggerFormats']);
});

// --- Formas de streamingData ---

test('lê streamingData em string JavaScript escapada', () => {
  assert.deepEqual(extractBloggerFormats(ESCAPED_HTML), [
    { url: 'https://cdn.example.test/720.mp4', qualityLabel: '720p' },
    { url: 'https://cdn.example.test/360.mp4', qualityLabel: '360p' },
  ]);
});

test('lê streamingData escapado dentro de aspas em entidade HTML', () => {
  assert.deepEqual(extractBloggerFormats(ESCAPED_ENTITY_HTML), [
    { url: 'https://cdn.example.test/360.mp4', qualityLabel: '360p' },
  ]);
});

test('lê streamingData em objeto JSON embutido, na ordem publicada e sem campos extras', () => {
  assert.deepEqual(extractBloggerFormats(OBJECT_HTML), [
    { url: 'https://cdn.example.test/1080.mp4', qualityLabel: '1080p' },
    { url: 'https://cdn.example.test/360.mp4', qualityLabel: '360p' },
  ]);
});

test('decodifica entidades HTML antes de interpretar o JSON', () => {
  const html = `<script>var player = {&quot;streamingData&quot;:{&quot;formats&quot;:[{&quot;url&quot;:&quot;https://cdn.example.test/720.mp4?token=a&amp;exp=1&quot;,&quot;qualityLabel&quot;:&quot;SD &lt;720p&gt; &#39;ok&#39;&quot;}]}};</script>`;
  assert.deepEqual(extractBloggerFormats(html), [
    { url: 'https://cdn.example.test/720.mp4?token=a&exp=1', qualityLabel: "SD <720p> 'ok'" },
  ]);
});

// --- qualityLabel ---

test('qualityLabel ausente, vazio, não textual ou com espaços vira null ou texto aparado', () => {
  const html = htmlWithFormats([
    { url: 'https://cdn.example.test/a.mp4' },
    { url: 'https://cdn.example.test/b.mp4', qualityLabel: '   ' },
    { url: 'https://cdn.example.test/c.mp4', qualityLabel: 720 },
    { url: 'https://cdn.example.test/d.mp4', qualityLabel: ' 480p ' },
  ]);
  assert.deepEqual(extractBloggerFormats(html), [
    { url: 'https://cdn.example.test/a.mp4', qualityLabel: null },
    { url: 'https://cdn.example.test/b.mp4', qualityLabel: null },
    { url: 'https://cdn.example.test/c.mp4', qualityLabel: null },
    { url: 'https://cdn.example.test/d.mp4', qualityLabel: '480p' },
  ]);
});

// --- Triagem de URL ---

test('ignora URL fora de HTTP(S) e entradas que não são objeto, preservando a ordem', () => {
  const html = htmlWithFormats([
    { url: 'https://cdn.example.test/1080.mp4', qualityLabel: '1080p' },
    { url: 'data:video/mp4;base64,AAAA', qualityLabel: 'data' },
    { url: ' /relative.mp4 ', qualityLabel: 'relativa' },
    null,
    'texto',
    18,
    { url: 'not a url', qualityLabel: 'malformada' },
    { url: 'https://cdn.example.test/720.mp4', qualityLabel: '720p' },
    { url: '  https://cdn.example.test/360.mp4  ', qualityLabel: ' 360p ' },
  ]);
  assert.deepEqual(extractBloggerFormats(html), [
    { url: 'https://cdn.example.test/1080.mp4', qualityLabel: '1080p' },
    { url: 'https://cdn.example.test/720.mp4', qualityLabel: '720p' },
    { url: 'https://cdn.example.test/360.mp4', qualityLabel: '360p' },
  ]);
});

test('não deduplica formatos com a mesma URL', () => {
  const html = htmlWithFormats([
    { url: 'https://cdn.example.test/720.mp4', qualityLabel: '720p' },
    { url: 'https://cdn.example.test/720.mp4', qualityLabel: '720p' },
  ]);
  assert.equal(extractBloggerFormats(html).length, 2);
});

test('lança erro quando nenhum formato progressivo com URL HTTP(S) resta', () => {
  const html = htmlWithFormats([
    { url: 'data:video/mp4;base64,AAAA', qualityLabel: 'data' },
    { url: '/relative.mp4', qualityLabel: 'relativa' },
    null,
  ]);
  assert.throws(() => extractBloggerFormats(html), { message: 'Player do Blogger sem MP4 progressivo' });
});

// --- Estrutura ausente ou inválida ---

test('lança erro quando o HTML não tem streamingData', () => {
  assert.throws(() => extractBloggerFormats('<html><body>sem player</body></html>'), {
    message: 'Player do Blogger sem streamingData',
  });
});

test('lança erro quando streamingData não tem formats em lista', () => {
  assert.throws(() => extractBloggerFormats('<script>var p = {"streamingData":{"args":[]}};</script>'), {
    message: 'Player do Blogger sem streamingData.formats',
  });
  assert.throws(() => extractBloggerFormats('<script>var p = {"streamingData":{"formats":"x"}};</script>'), {
    message: 'Player do Blogger sem streamingData.formats',
  });
  assert.throws(() => extractBloggerFormats('<script>var p = {"streamingData":{"formats":[]}};</script>'), {
    message: 'Player do Blogger sem MP4 progressivo',
  });
});

test('lança erro de JSON inválido na string escapada e preserva a causa', () => {
  const html = '<script>var p = "{\\"streamingData\\":{invalid}}";</script>';
  assert.throws(
    () => extractBloggerFormats(html),
    (error) => {
      assert.match(error.message, /^Player do Blogger com streamingData inválido: /);
      assert.ok(error.cause instanceof Error);
      assert.equal(error.cause.name, 'SyntaxError');
      return true;
    },
  );
});

test('lança erro de JSON inválido no objeto embutido e preserva a causa', () => {
  const html = '<script>var p = {"streamingData":{"formats":[}};</script>';
  assert.throws(
    () => extractBloggerFormats(html),
    (error) => {
      assert.match(error.message, /^Player do Blogger com streamingData inválido: /);
      assert.ok(error.cause instanceof Error);
      assert.equal(error.cause.name, 'SyntaxError');
      return true;
    },
  );
});

test('lança erro quando a string ou o objeto de streamingData não termina', () => {
  assert.throws(() => extractBloggerFormats('<script>var p = "{\\"streamingData\\":{\\"formats\\":[]}'), {
    message: 'String de streamingData sem fechamento',
  });
  assert.throws(() => extractBloggerFormats('<script>var p = {"streamingData":{"formats":[];'), {
    message: 'Objeto de streamingData sem fechamento',
  });
});
