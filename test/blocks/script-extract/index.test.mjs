import test from 'node:test';
import assert from 'node:assert/strict';

import { extractDataAttribute, extractJsRedirect, extractScriptJson, extractScriptString } from '../../../src/_blocks/script-extract/index.mjs';

const PLAYER_PAGE = `<!DOCTYPE html>
<html lang="pt-BR">
<head><title>Assistir Duna: Parte Dois</title></head>
<body>
  <div id="player" class="player" data-contentid="693134" data-type='filme' data-title="Tom &amp; Jerry &quot;O Filme&quot; &#39;HD&#39; &lt;b&gt;"></div>
  <script type="text/javascript">
    var video_url = "https://errado.example.com/video_url.mp4";
    var urlBackup = "https://errado.example.com/urlBackup.mp4";
    const defaultUrl = "https:\\/\\/cdn.example.com\\/hls\\/693134\\/index.m3u8?token=abc\\u0026exp=99";
    let poster = 'https://img.example.com/poster.jpg';
    playerId = "jw-693134";
    var config = { url: "https://cdn.example.com/config.mp4", "file": 'https://cdn.example.com/file.mp4' };
    var sources = [{"file":"https:\\/\\/cdn.example.com\\/720.mp4","label":"720p","note":"lista ] { \\"aspas\\""},{"file":"https://cdn.example.com/1080.mp4","label":"1080p"}];
    var playerConfig = {"autostart":false,"tracks":[{"file":"https://cdn.example.com/pt.vtt","label":"Português"}]};
  </script>
</body>
</html>`;

const STRING_CASES = [
  { label: 'const com escapes \\/ e \\u0026', name: 'defaultUrl', expected: 'https://cdn.example.com/hls/693134/index.m3u8?token=abc&exp=99' },
  { label: 'let com aspas simples', name: 'poster', expected: 'https://img.example.com/poster.jpg' },
  { label: 'atribuição sem declaração', name: 'playerId', expected: 'jw-693134' },
  { label: 'chave de objeto sem aspas', name: 'url', expected: 'https://cdn.example.com/config.mp4' },
  { label: 'chave de objeto entre aspas com valor em aspas simples', name: 'file', expected: 'https://cdn.example.com/file.mp4' },
  { label: 'identificador inteiro com sufixo', name: 'video_url', expected: 'https://errado.example.com/video_url.mp4' },
  { label: 'chave JSON entre aspas duplas', name: 'label', expected: '720p' },
  { label: 'identificador ausente', name: 'videoUrl', expected: null },
  { label: 'variável com array não é string', name: 'sources', expected: null },
];

for (const { label, name, expected } of STRING_CASES) {
  test(`extractScriptString: ${label}`, () => {
    assert.equal(extractScriptString(PLAYER_PAGE, name), expected);
  });
}

test('extractScriptString: identificador casa inteiro (url não casa video_url nem urlBackup)', () => {
  const html = '<script>var video_url = "https://a.example/1"; var urlBackup = "https://a.example/2"; var url = "https://a.example/3";</script>';
  assert.equal(extractScriptString(html, 'url'), 'https://a.example/3');
  assert.equal(extractScriptString('<script>var videoUrl = "https://a.example/1";</script>', 'url'), null);
});

const UNESCAPE_CASES = [
  { source: String.raw`var s = "https:\/\/a.example\/v";`, expected: 'https://a.example/v' },
  { source: String.raw`var s = "a\u0026b\u00e7";`, expected: 'a&bç' },
  { source: String.raw`var s = "diz \"oi\"";`, expected: 'diz "oi"' },
  { source: String.raw`var s = 'it\'s';`, expected: "it's" },
  { source: String.raw`var s = "C:\\pasta\\/x";`, expected: 'C:\\pasta\\/x' },
];

for (const { source, expected } of UNESCAPE_CASES) {
  test(`extractScriptString: desescapa ${source}`, () => {
    assert.equal(extractScriptString(source, 's'), expected);
  });
}

test('extractScriptJson: array com "]" e aspas escapadas dentro de string', () => {
  assert.deepEqual(extractScriptJson(PLAYER_PAGE, 'sources'), [
    { file: 'https://cdn.example.com/720.mp4', label: '720p', note: 'lista ] { "aspas"' },
    { file: 'https://cdn.example.com/1080.mp4', label: '1080p' },
  ]);
});

test('extractScriptJson: objeto com array aninhado', () => {
  assert.deepEqual(extractScriptJson(PLAYER_PAGE, 'playerConfig'), {
    autostart: false,
    tracks: [{ file: 'https://cdn.example.com/pt.vtt', label: 'Português' }],
  });
});

test('extractScriptJson: atribuição sem declaração', () => {
  assert.deepEqual(extractScriptJson('<script>window.data = {"id":1};</script>', 'data'), { id: 1 });
});

test('extractScriptJson: retorna null quando não há atribuição de array ou objeto', () => {
  assert.equal(extractScriptJson(PLAYER_PAGE, 'tracks'), null);
  assert.equal(extractScriptJson(PLAYER_PAGE, 'defaultUrl'), null);
  assert.equal(extractScriptJson('<script>var mysources = [1];</script>', 'sources'), null);
});

test('extractScriptJson: lança erro citando o nome quando não é JSON válido', () => {
  assert.throws(() => extractScriptJson(PLAYER_PAGE, 'config'), /JSON de "config" inválido/);
});

test('extractScriptJson: lança erro citando o nome quando não há fechamento', () => {
  const html = '<script>var sources = [{"file":"https://a.example/v.mp4"</script>';
  assert.throws(() => extractScriptJson(html, 'sources'), /JSON de "sources" sem fechamento/);
});

const DATA_CASES = [
  { label: 'sem prefixo', attribute: 'contentid', expected: '693134' },
  { label: 'com prefixo', attribute: 'data-contentid', expected: '693134' },
  { label: 'maiúsculas no nome', attribute: 'ContentId', expected: '693134' },
  { label: 'aspas simples', attribute: 'type', expected: 'filme' },
  { label: 'entidades HTML', attribute: 'title', expected: 'Tom & Jerry "O Filme" \'HD\' <b>' },
  { label: 'atributo ausente', attribute: 'episode', expected: null },
  { label: 'nome parcial não casa', attribute: 'content', expected: null },
];

for (const { label, attribute, expected } of DATA_CASES) {
  test(`extractDataAttribute: ${label}`, () => {
    assert.equal(extractDataAttribute(PLAYER_PAGE, attribute), expected);
  });
}

test('extractDataAttribute: decodifica &amp; uma única vez', () => {
  assert.equal(extractDataAttribute('<a data-url="https://a.example/?a=1&amp;lt;b"></a>', 'url'), 'https://a.example/?a=1&lt;b');
});

const REDIRECT_CASES = [
  { source: '<script>window.location.href = "https:\\/\\/player.example.com\\/e\\/1";</script>', expected: 'https://player.example.com/e/1' },
  { source: "<script>window.location='https://player.example.com/e/2';</script>", expected: 'https://player.example.com/e/2' },
  { source: '<script>location.href = "https://player.example.com/e/3";</script>', expected: 'https://player.example.com/e/3' },
  { source: '<script>location = "https://player.example.com/e/4";</script>', expected: 'https://player.example.com/e/4' },
  { source: "<script>location.replace( 'https://player.example.com/e/5' );</script>", expected: 'https://player.example.com/e/5' },
  { source: '<script>window.location.replace("https://player.example.com/e/6?a=1\\u0026b=2");</script>', expected: 'https://player.example.com/e/6?a=1&b=2' },
];

for (const { source, expected } of REDIRECT_CASES) {
  test(`extractJsRedirect: ${source}`, () => {
    assert.equal(extractJsRedirect(source), expected);
  });
}

test('extractJsRedirect: retorna null sem redirecionamento por script', () => {
  assert.equal(extractJsRedirect(PLAYER_PAGE), null);
  assert.equal(extractJsRedirect('<script>if (location.href == "https://a.example") {}</script>'), null);
  assert.equal(extractJsRedirect('<script>var mylocation = "https://a.example";</script>'), null);
});

const INVALID_CASES = [
  { label: 'extractScriptString com html não string', call: () => extractScriptString(null, 'url'), error: /html inválido/ },
  { label: 'extractScriptString com nome vazio', call: () => extractScriptString(PLAYER_PAGE, ' '), error: /name inválido/ },
  { label: 'extractScriptString com nome não string', call: () => extractScriptString(PLAYER_PAGE, 1), error: /name inválido/ },
  { label: 'extractScriptJson com html não string', call: () => extractScriptJson(undefined, 'sources'), error: /html inválido/ },
  { label: 'extractScriptJson com nome vazio', call: () => extractScriptJson(PLAYER_PAGE, ''), error: /name inválido/ },
  { label: 'extractDataAttribute com html não string', call: () => extractDataAttribute({}, 'id'), error: /html inválido/ },
  { label: 'extractDataAttribute com atributo vazio', call: () => extractDataAttribute(PLAYER_PAGE, ''), error: /attribute inválido/ },
  { label: 'extractDataAttribute só com prefixo', call: () => extractDataAttribute(PLAYER_PAGE, 'data-'), error: /attribute inválido/ },
  { label: 'extractJsRedirect com html não string', call: () => extractJsRedirect(42), error: /html inválido/ },
];

for (const { label, call, error } of INVALID_CASES) {
  test(`lança erro: ${label}`, () => {
    assert.throws(call, error);
  });
}
