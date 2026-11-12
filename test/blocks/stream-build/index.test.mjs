import test from 'node:test';
import assert from 'node:assert/strict';

import { FORMATTER } from '../../../src/_blocks/custom-formatter/index.mjs';
import { LANGUAGE } from '../../../src/_blocks/language-discovery/index.mjs';
import { buildStream, buildTorrentFileUrl, normalizeQuality, sortByQuality } from '../../../src/_blocks/stream-build/index.mjs';

const HASH = 'c9e15763f722f23e98a29decdfae341b98d53056';
const BASE32 = 'ZHQVOY7XELZD5GFCTXW574RUDOMNGMCW';
const MAGNET = `magnet:?xt=urn:btih:${HASH}&dn=Duna.Parte.Dois.2024.1080p&xl=2684354560&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce`;

const BASE = {
  url: 'https://cdn.exemplo.com/video.m3u8',
  quality: '1080p',
  format: { template: FORMATTER.GDRIVE, addon: 'Fonte', title: 'Duna: Parte Dois', year: 2024, filename: 'Duna.2024.1080p' },
};

// --- normalizeQuality ---

const QUALITY_CASES = [
  // Número: inteiro de 3–4 dígitos, inclusive alturas reais de HLS.
  [1080, '1080p'],
  [720, '720p'],
  [2160, '4K'],
  [480, '480p'],
  [800, '800p'],
  [1038, '1038p'],
  // 1. Palavra "<n>p".
  ['1080p', '1080p'],
  ['720P', '720p'],
  ['  360p  ', '360p'],
  ['2160p', '4K'],
  ['800p', '800p'],
  ['Full HD 1080p', '1080p'],
  ['WEB-DL 1080p x264', '1080p'],
  ['HD 720p', '720p'],
  ['CAM 720p', '720p'],
  ['Duna 2024 1080p', '1080p'],
  // 2. Palavra só de dígitos, apenas altura conhecida.
  ['1080', '1080p'],
  ['1440', '1440p'],
  ['144', '144p'],
  ['540', '540p'],
  ['576', '576p'],
  ['4320', '4320p'],
  ['2160', '4K'],
  ['Duna 2024 1080', '1080p'],
  // 3. 4K / UHD.
  ['4k', '4K'],
  ['4K', '4K'],
  ['UHD', '4K'],
  ['4K HDR', '4K'],
  ['UHD 4K', '4K'],
  ['4K Full HD', '4K'],
  // 4. FHD / FullHD / "full hd".
  ['fhd', '1080p'],
  ['FullHD', '1080p'],
  ['Full HD', '1080p'],
  ['full   hd', '1080p'],
  ['Full-HD', '1080p'],
  ['FHD HD', '1080p'],
  // 5. CAM.
  ['CAM', 'CAM'],
  ['ts', 'CAM'],
  ['HDCAM', 'CAM'],
  ['Telesync', 'CAM'],
  ['HD CAM', 'CAM'],
  // 6. HD.
  ['HD', '720p'],
  ['SD HD', '720p'],
  // 7. SD.
  ['sd', '480p'],
];

for (const [input, expected] of QUALITY_CASES) {
  test(`normalizeQuality(${JSON.stringify(input)}) === "${expected}"`, () => {
    assert.equal(normalizeQuality(input), expected);
  });
}

const INVALID_QUALITIES = [
  undefined,
  null,
  '',
  'alta',
  '1080i',
  'x264',
  '12',
  '800',
  'HDTV',
  'Duna 2024',
  'Full',
  12345,
  12,
  1080.5,
  NaN,
  {},
  'constructor',
];

for (const input of INVALID_QUALITIES) {
  test(`normalizeQuality lança erro citando o valor: ${String(input)}`, () => {
    assert.throws(() => normalizeQuality(input), (error) => {
      assert.match(error.message, /^Qualidade não reconhecida: /);
      assert.ok(error.message.includes(typeof input === 'string' ? `"${input}"` : String(input)));
      return true;
    });
  });
}

// --- buildStream: URL direta ---

test('buildStream: URL direta com todos os opcionais', () => {
  const stream = buildStream({
    url: '  https://cdn.exemplo.com/video.m3u8  ',
    quality: 1080,
    size: '2.5 GB',
    language: LANGUAGE.DUBBED,
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://exemplo.com/' },
    subtitles: [
      { url: 'https://cdn.exemplo.com/pt.vtt', language: 'Português', name: 'PT-BR', headers: { Referer: 'https://exemplo.com/' } },
      { url: 'http://cdn.exemplo.com/en.srt', language: 'English' },
    ],
    infoHash: HASH.toUpperCase(),
    provider: 'Filemoon',
    type: 'hls',
    seeders: 0,
    peers: 12,
    behaviorHints: { audioDelayMs: -150, audioDelayLanguage: 'pt' },
    format: BASE.format,
  });

  assert.deepEqual(stream, {
    url: 'https://cdn.exemplo.com/video.m3u8',
    name: 'Fonte 1080p\n🗣️ Dublado\n🌐 HTTP 🔍 Filemoon\n📁 Duna.2024.1080p',
    title: '🗣️ Dublado\n🌐 HTTP 📦 2.5 GB 🔍 Filemoon\n📁 Duna.2024.1080p',
    quality: '1080p',
    size: '2.5 GB',
    language: 'Dublado',
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://exemplo.com/' },
    subtitles: [
      { url: 'https://cdn.exemplo.com/pt.vtt', language: 'Português', name: 'PT-BR', headers: { Referer: 'https://exemplo.com/' } },
      { url: 'http://cdn.exemplo.com/en.srt', language: 'English' },
    ],
    infoHash: HASH,
    provider: 'Filemoon',
    type: 'hls',
    seeders: 0,
    peers: 12,
    behaviorHints: { audioDelayMs: -150, audioDelayLanguage: 'pt' },
  });
});

test('buildStream: só os obrigatórios, sem chaves undefined, sempre inclui language', () => {
  const stream = buildStream({ ...BASE, size: undefined, format: { ...BASE.format, filename: undefined } });
  assert.deepEqual(Object.keys(stream), ['url', 'name', 'title', 'quality', 'language']);
  assert.equal(stream.language, LANGUAGE.UNKNOWN);
});

test('buildStream: idioma não reconhecido gera aviso e segue para descoberta local', (context) => {
  const warning = context.mock.method(console, 'warn', () => {});
  const stream = buildStream({
    ...BASE,
    format: { ...BASE.format, addon: 'Fonte', filename: undefined },
    language: '  Japonês  ',
  });
  assert.equal(stream.language, LANGUAGE.UNKNOWN);
  assert.equal(warning.mock.calls.length, 1);
  assert.match(warning.mock.calls[0].arguments[0], /\[Fonte\].*Japonês/);
});

test('buildStream: membro confiável diferente de UNKNOWN encerra resolução sem chamar descoberta nem emitir aviso', (context) => {
  const warning = context.mock.method(console, 'warn', () => {});
  for (const lang of [
    LANGUAGE.DUBBED,
    LANGUAGE.DUBBED_NON_PT_BR,
    LANGUAGE.SUBTITLED,
    LANGUAGE.SUBTITLED_NON_PT_BR,
    LANGUAGE.NON_PT_BR,
  ]) {
    // Mesmo com nome contraditório (ex.: filename com LEGENDADO), membro confiável prevalece
    const stream = buildStream({
      ...BASE,
      language: lang,
      format: { ...BASE.format, filename: 'Filme.2024.DUBLADO.LEGENDADO.mkv' },
    });
    assert.equal(stream.language, lang);
  }
  assert.equal(warning.mock.calls.length, 0);
});

test('buildStream: entrada UNKNOWN permite descoberta por nomes', () => {
  const stream = buildStream({
    ...BASE,
    language: LANGUAGE.UNKNOWN,
    format: { ...BASE.format, filename: 'Filme.2024.1080p.DUBLADO.mkv' },
  });
  assert.equal(stream.language, LANGUAGE.DUBBED);
});

test('buildStream: descobre por filename, folderName e languageHints sem usar URL nem qualityHints', () => {
  // Descoberta por filename
  assert.equal(
    buildStream({ ...BASE, format: { ...BASE.format, filename: 'Filme.2024.1080p.DUBLADO.mkv' } }).language,
    LANGUAGE.DUBBED,
  );
  // Descoberta por folderName
  assert.equal(
    buildStream({ ...BASE, format: { ...BASE.format, filename: undefined, folderName: 'Filme.LEGENDADO' } }).language,
    LANGUAGE.SUBTITLED,
  );
  // Descoberta por languageHints opcional
  assert.equal(
    buildStream({
      ...BASE,
      format: { ...BASE.format, filename: undefined },
      languageHints: ['Áudio Dublado'],
    }).language,
    LANGUAGE.DUBBED,
  );
  // languageHints não vai para o stream
  const hintStream = buildStream({
    ...BASE,
    format: { ...BASE.format, filename: undefined },
    languageHints: ['Dublado'],
  });
  assert.equal('languageHints' in hintStream, false);
  // languageHints vazio é aceito
  assert.equal(
    buildStream({
      ...BASE,
      format: { ...BASE.format, filename: undefined },
      languageHints: [],
    }).language,
    LANGUAGE.UNKNOWN,
  );
  // Exclusão de URL e qualityHints da descoberta
  assert.equal(
    buildStream({
      ...BASE,
      url: 'https://cdn.exemplo.com.br/dublado/video.m3u8',
      qualityHints: ['DUBLADO'],
      format: { ...BASE.format, filename: undefined },
    }).language,
    LANGUAGE.UNKNOWN,
  );
  // format.languages e format.languageHints são rejeitados
  assert.throws(
    () => buildStream({ ...BASE, format: { ...BASE.format, languages: ['pt'] } }),
    /campo desconhecido "languages"/,
  );
  assert.throws(
    () => buildStream({ ...BASE, format: { ...BASE.format, languageHints: ['dublado'] } }),
    /campo desconhecido "languageHints"/,
  );
});

test('buildStream: não altera a entrada', () => {
  const fields = {
    ...BASE,
    url: ` ${BASE.url} `,
    quality: 720,
    language: 'Legendado',
    headers: { Referer: 'https://exemplo.com/' },
    subtitles: [{ url: 'https://cdn.exemplo.com/pt.vtt', language: 'pt' }],
    behaviorHints: { audioDelayMs: 100 },
  };
  const snapshot = structuredClone(fields);

  const stream = buildStream(fields);

  assert.deepEqual(fields, snapshot);
  assert.notEqual(stream.headers, fields.headers);
  assert.notEqual(stream.subtitles, fields.subtitles);
  assert.notEqual(stream.subtitles[0], fields.subtitles[0]);
  assert.notEqual(stream.behaviorHints, fields.behaviorHints);
});

const REQUIRED_CASES = [
  { field: 'url', error: /stream\.url é obrigatório/ },
  { field: 'format', error: /stream\.format é obrigatório/ },
];

for (const { field, error } of REQUIRED_CASES) {
  test(`buildStream: lança erro sem ${field}`, () => {
    const fields = { ...BASE };
    delete fields[field];
    assert.throws(() => buildStream(fields), error);
  });
}

const INVALID_FIELD_CASES = [
  { label: 'name junto com format', fields: { name: 'x' }, error: /stream\.name e stream\.title vêm do formatador/ },
  { label: 'title junto com format', fields: { title: 'x' }, error: /stream\.name e stream\.title vêm do formatador/ },
  { label: 'quality inválida', fields: { quality: 'alta' }, error: /Qualidade não reconhecida: "alta"/ },
  { label: 'qualityHints que não é lista', fields: { quality: undefined, qualityHints: '1080p' }, error: /stream\.qualityHints deve ser array/ },
  { label: 'qualityHints com item inválido', fields: { quality: undefined, qualityHints: ['720p', 1080] }, error: /stream\.qualityHints\[1\] deve ser texto, null ou undefined/ },
  { label: 'url sem protocolo', fields: { url: 'cdn.exemplo.com/video.mp4' }, error: /stream\.url não é URL válida/ },
  { label: 'url ftp', fields: { url: 'ftp://exemplo.com/video.mp4' }, error: /stream\.url deve ser URL http\(s\)/ },
  { label: 'size vazio', fields: { size: '' }, error: /stream\.size deve ser texto não vazio/ },
  { label: 'language numérico', fields: { language: 1 }, error: /stream\.language deve ser texto não vazio/ },
  { label: 'languageHints que não é lista', fields: { languageHints: 'Dublado' }, error: /stream\.languageHints deve ser array/ },
  { label: 'languageHints com item não string', fields: { languageHints: ['Dublado', 10] }, error: /stream\.languageHints\[1\] deve ser texto não vazio/ },
  { label: 'languageHints com item vazio', fields: { languageHints: ['Dublado', '   '] }, error: /stream\.languageHints\[1\] deve ser texto não vazio/ },
  { label: 'headers array', fields: { headers: ['Referer'] }, error: /stream\.headers deve ser objeto/ },
  { label: 'header numérico', fields: { headers: { 'X-Id': 1 } }, error: /stream\.headers\.X-Id deve ser texto não vazio/ },
  { label: 'subtitles objeto', fields: { subtitles: {} }, error: /stream\.subtitles deve ser array/ },
  { label: 'legenda sem url', fields: { subtitles: [{ language: 'pt' }] }, error: /stream\.subtitles\[0\]\.url é obrigatório/ },
  {
    label: 'legenda com url não http',
    fields: { subtitles: [{ url: 'https://ok/pt.vtt', language: 'pt' }, { url: 'file:///pt.vtt', language: 'pt' }] },
    error: /stream\.subtitles\[1\]\.url deve ser URL http\(s\)/,
  },
  { label: 'legenda sem language', fields: { subtitles: [{ url: 'https://ok/pt.vtt' }] }, error: /stream\.subtitles\[0\]\.language é obrigatório/ },
  { label: 'legenda com language vazio', fields: { subtitles: [{ url: 'https://ok/pt.vtt', language: ' ' }] }, error: /stream\.subtitles\[0\]\.language deve ser texto não vazio/ },
  { label: 'legenda com campo extra', fields: { subtitles: [{ url: 'https://ok/pt.vtt', language: 'pt', lang: 'pt' }] }, error: /stream\.subtitles\[0\]: campo desconhecido "lang"/ },
  { label: 'legenda nula', fields: { subtitles: [null] }, error: /stream\.subtitles\[0\] deve ser objeto/ },
  { label: 'seeders negativo', fields: { seeders: -1 }, error: /stream\.seeders deve ser inteiro maior ou igual a zero \(recebido: -1\)/ },
  { label: 'peers fracionário', fields: { peers: 1.5 }, error: /stream\.peers deve ser inteiro/ },
  { label: 'seeders em texto', fields: { seeders: '10' }, error: /stream\.seeders deve ser inteiro/ },
  { label: 'behaviorHints com chave extra', fields: { behaviorHints: { audioDelayMs: 0, notWebReady: true } }, error: /stream\.behaviorHints: campo desconhecido "notWebReady"/ },
  { label: 'audioDelayMs em texto', fields: { behaviorHints: { audioDelayMs: '100' } }, error: /stream\.behaviorHints\.audioDelayMs deve ser número/ },
  { label: 'infoHash fora do formato', fields: { infoHash: 'abc' }, error: /stream\.infoHash deve ser hexadecimal de 40 caracteres/ },
  { label: 'campo desconhecido group', fields: { group: 'Dublado' }, error: /stream: campo desconhecido "group"/ },
  { label: 'campo desconhecido lang', fields: { lang: 'pt' }, error: /stream: campo desconhecido "lang"/ },
  { label: 'valor null em opcional', fields: { provider: null }, error: /stream\.provider deve ser texto não vazio \(recebido: null\)/ },
];

for (const { label, fields, error } of INVALID_FIELD_CASES) {
  test(`buildStream: lança erro com ${label}`, () => {
    assert.throws(() => buildStream({ ...BASE, ...fields }), error);
  });
}

for (const input of [undefined, null, 'https://cdn.exemplo.com/video.mp4', [BASE]]) {
  test(`buildStream: lança erro quando não recebe objeto: ${String(input)}`, () => {
    assert.throws(() => buildStream(input), /stream deve ser objeto/);
  });
}

// --- buildStream: arquivo de torrent (torrent://) ---

test('buildStream: torrent:// preenche infoHash e normaliza o hash da URL', () => {
  const stream = buildStream({ ...BASE, url: `TORRENT://${HASH.toUpperCase()}/12`, size: '389 MB' });

  assert.equal(stream.url, `torrent://${HASH}/12`);
  assert.equal(stream.infoHash, HASH);
  assert.equal(stream.headers, undefined);
});

test('buildStream: torrent:// aceita infoHash igual ao da URL e índice zero', () => {
  const stream = buildStream({ ...BASE, url: `torrent://${HASH}/0`, infoHash: HASH.toUpperCase() });
  assert.equal(stream.url, `torrent://${HASH}/0`);
  assert.equal(stream.infoHash, HASH);
});

const INVALID_TORRENT_FILE_CASES = [
  { label: 'sem índice', url: `torrent://${HASH}`, error: /fora do formato "torrent:\/\/<hash>\/<índice>"/ },
  { label: 'índice negativo', url: `torrent://${HASH}/-1`, error: /fora do formato/ },
  { label: 'índice não inteiro', url: `torrent://${HASH}/1.5`, error: /fora do formato/ },
  { label: 'query após o índice', url: `torrent://${HASH}/3?x=1`, error: /fora do formato/ },
  { label: 'hash em base32', url: `torrent://${BASE32}/3`, error: /está em base32/ },
  { label: 'hash curto', url: 'torrent://abc123/3', error: /hexadecimal de 40 caracteres/ },
];

for (const { label, url, error } of INVALID_TORRENT_FILE_CASES) {
  test(`buildStream: torrent:// inválido lança erro (${label})`, () => {
    assert.throws(() => buildStream({ ...BASE, url }), error);
  });
}

test('buildStream: torrent:// rejeita headers e infoHash divergente', () => {
  const url = `torrent://${HASH}/3`;
  assert.throws(() => buildStream({ ...BASE, url, headers: { Referer: 'https://x.example/' } }), /headers não se aplica a torrent:\/\//);
  assert.throws(() => buildStream({ ...BASE, url, infoHash: 'a'.repeat(40) }), /diverge do hash de stream\.url/);
});

test('buildTorrentFileUrl: monta a URL com hash em minúsculas', () => {
  assert.equal(buildTorrentFileUrl(HASH.toUpperCase(), 12), `torrent://${HASH}/12`);
  assert.equal(buildTorrentFileUrl(HASH, 0), `torrent://${HASH}/0`);
});

for (const [label, hash, index, error] of [
  ['índice negativo', HASH, -1, /inteiro maior ou igual a zero/],
  ['índice fracionário', HASH, 1.5, /inteiro maior ou igual a zero/],
  ['índice em texto', HASH, '3', /inteiro maior ou igual a zero/],
  ['hash em base32', BASE32, 3, /está em base32/],
  ['hash ausente', undefined, 3, /infoHash/],
]) {
  test(`buildTorrentFileUrl: lança erro (${label})`, () => {
    assert.throws(() => buildTorrentFileUrl(hash, index), error);
  });
}

// --- buildStream: magnet ---

test('buildStream: magnet preenche infoHash e mantém a URL intacta', () => {
  const stream = buildStream({ ...BASE, url: MAGNET, seeders: 120, peers: 30, size: '2.5 GB' });

  assert.equal(stream.url, MAGNET);
  assert.equal(stream.infoHash, HASH);
  assert.equal(stream.seeders, 120);
  assert.equal(stream.headers, undefined);
});

test('buildStream: magnet com hash maiúsculo mantém a URL e normaliza infoHash', () => {
  const url = MAGNET.replace(HASH, HASH.toUpperCase()).replace('magnet:?xt=urn:btih:', 'MAGNET:?xt=urn:btih:');
  const stream = buildStream({ ...BASE, url, infoHash: HASH.toUpperCase() });

  assert.equal(stream.url, url);
  assert.equal(stream.infoHash, HASH);
});

test('buildStream: magnet aceita infoHash igual ao do xt', () => {
  assert.equal(buildStream({ ...BASE, url: MAGNET, infoHash: HASH }).infoHash, HASH);
});

const MAGNET_XT_POSITIONS = [
  `magnet:?dn=Duna&xt=urn:btih:${HASH}&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce`,
  `magnet:?dn=Duna&xl=2684354560&tr=udp%3A%2F%2Ftracker&xt=urn:btih:${HASH}`,
  `magnet:?xt=urn:btih:${HASH}`,
];

for (const url of MAGNET_XT_POSITIONS) {
  test(`buildStream: magnet com xt em qualquer posição mantém a URL: ${url.slice(0, 40)}...`, () => {
    const stream = buildStream({ ...BASE, url });
    assert.equal(stream.url, url);
    assert.equal(stream.infoHash, HASH);
  });
}

const INVALID_MAGNET_CASES = [
  {
    label: 'hash em base32',
    fields: { url: `magnet:?xt=urn:btih:${BASE32}&dn=Duna` },
    error: /hash do magnet em stream\.url está em base32 .*convertê-lo para hexadecimal/,
  },
  { label: 'hash curto', fields: { url: 'magnet:?xt=urn:btih:abc123' }, error: /hash do magnet em stream\.url deve ser hexadecimal de 40 caracteres/ },
  { label: 'hash vazio', fields: { url: 'magnet:?xt=urn:btih:&dn=Duna' }, error: /hash do magnet em stream\.url deve ser texto não vazio/ },
  { label: 'sem xt', fields: { url: 'magnet:?dn=Duna&tr=udp%3A%2F%2Ftracker' }, error: /stream\.url magnet sem o parâmetro "xt=urn:btih:<hash>"/ },
  { label: 'xt que não é btih', fields: { url: `magnet:?xt=urn:sha1:${HASH}&dn=Duna` }, error: /stream\.url magnet sem o parâmetro "xt=urn:btih:<hash>"/ },
  { label: 'btih fora do parâmetro xt', fields: { url: `magnet:?dn=xt=urn:btih:${HASH}` }, error: /stream\.url magnet sem o parâmetro "xt=urn:btih:<hash>"/ },
  { label: 'sem query', fields: { url: `magnet:xt=urn:btih:${HASH}` }, error: /stream\.url magnet sem o parâmetro "xt=urn:btih:<hash>"/ },
  { label: 'infoHash divergente', fields: { url: MAGNET, infoHash: 'f'.repeat(40) }, error: /stream\.infoHash "f{40}" diverge do hash do magnet "c9e15763/ },
  { label: 'infoHash em base32', fields: { url: MAGNET, infoHash: BASE32 }, error: /stream\.infoHash está em base32/ },
  { label: 'headers', fields: { url: MAGNET, headers: { Referer: 'https://exemplo.com/' } }, error: /stream\.headers não se aplica a magnet/ },
];

for (const { label, fields, error } of INVALID_MAGNET_CASES) {
  test(`buildStream: magnet lança erro com ${label}`, () => {
    assert.throws(() => buildStream({ ...BASE, ...fields }), error);
  });
}

// --- sortByQuality ---

test('sortByQuality: ordena da maior para a menor qualidade', () => {
  const qualities = ['480p', 'CAM', 'Desconhecida', '1080p', '360p', '4K', '720p', '240p', '1440p'];
  const sorted = sortByQuality(qualities.map((quality) => ({ quality })));
  assert.deepEqual(
    sorted.map((stream) => stream.quality),
    ['4K', '1440p', '1080p', '720p', '480p', '360p', '240p', 'CAM', 'Desconhecida'],
  );
});

test('sortByQuality: Desconhecida fica depois de CAM e mantém a ordem nos empates', () => {
  const streams = [
    { quality: 'Desconhecida', name: 'a' },
    { quality: '720p', name: 'b' },
    { quality: 'CAM', name: 'c' },
    { quality: 'Desconhecida', name: 'd' },
  ];
  assert.deepEqual(
    sortByQuality(streams).map((stream) => stream.name),
    ['b', 'c', 'a', 'd'],
  );
});

test('sortByQuality: mantém a ordem original nos empates', () => {
  const streams = [
    { quality: '720p', name: 'a' },
    { quality: '1080p', name: 'b' },
    { quality: '720p', name: 'c' },
    { quality: 'CAM', name: 'd' },
    { quality: '1080p', name: 'e' },
    { quality: 'CAM', name: 'f' },
  ];
  assert.deepEqual(
    sortByQuality(streams).map((stream) => stream.name),
    ['b', 'e', 'a', 'c', 'd', 'f'],
  );
});

test('sortByQuality: não altera o array recebido e aceita a saída de buildStream', () => {
  const streams = [buildStream({ ...BASE, quality: 'sd' }), buildStream({ ...BASE, quality: 'UHD' })];
  const original = [...streams];

  const sorted = sortByQuality(streams);

  assert.notEqual(sorted, streams);
  assert.deepEqual(streams, original);
  assert.equal(streams[0], original[0]);
  assert.deepEqual(sorted.map((stream) => stream.quality), ['4K', '480p']);
  assert.deepEqual(sortByQuality([]), []);
});

const INVALID_SORT_CASES = [
  { label: 'qualidade numérica', streams: [{ quality: '720p' }, { quality: 1080 }], error: /streams\[1\]\.quality fora do formato normalizado \(recebido: 1080/ },
  { label: 'qualidade não normalizada', streams: [{ quality: 'Full HD' }], error: /streams\[0\]\.quality fora do formato normalizado \(recebido: "Full HD"/ },
  { label: 'qualidade minúscula', streams: [{ quality: '4k' }], error: /streams\[0\]\.quality fora do formato/ },
  { label: 'sem qualidade', streams: [{}], error: /streams\[0\]\.quality fora do formato/ },
  { label: 'item nulo', streams: [null], error: /streams\[0\] deve ser objeto/ },
];

for (const { label, streams, error } of INVALID_SORT_CASES) {
  test(`sortByQuality: lança erro com ${label}`, () => {
    assert.throws(() => sortByQuality(streams), error);
  });
}

test('sortByQuality: lança erro quando não recebe array', () => {
  assert.throws(() => sortByQuality({ quality: '720p' }), /streams deve ser array/);
});

// --- buildStream: format (bloco custom-formatter) ---

test('buildStream: format gera name e title com a qualidade e o idioma já normalizados', () => {
  const stream = buildStream({
    url: MAGNET,
    quality: 'WEB-DL 1080p',
    size: '2.5 GB',
    language: LANGUAGE.DUBBED,
    provider: 'catalogo',
    format: { template: FORMATTER.GDRIVE, addon: 'Fonte', filename: 'Duna.Parte.Dois.2024.1080p' },
  });
  assert.deepEqual(stream, {
    url: MAGNET,
    name: 'Fonte 1080p\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 catalogo\n📁 Duna.Parte.Dois.2024.1080p',
    title: '🗣️ Dublado\n🧲 P2P 📦 2.5 GB 👥 ?/? 🔍 catalogo\n📁 Duna.Parte.Dois.2024.1080p',
    quality: '1080p',
    size: '2.5 GB',
    language: LANGUAGE.DUBBED,
    infoHash: HASH,
    provider: 'catalogo',
  });
  assert.equal('format' in stream, false);
});

test('buildStream: format preserva legendas e seeders no stream sem listas linguísticas na apresentação', () => {
  const stream = buildStream({
    url: BASE.url,
    quality: 720,
    seeders: 7,
    subtitles: [{ url: 'https://cdn.exemplo.com/pt.vtt', language: 'Português' }],
    format: { template: FORMATTER.PRISM, addon: 'Fonte', title: 'Duna', year: 2024 },
  });
  assert.equal(stream.name, '💿 HD 720p\n🎬 Duna (2024)\n🗣️ Idioma Desconhecido\n🌐 HTTP');
  assert.equal(stream.title, '🎬 Duna (2024)\n🗣️ Idioma Desconhecido\n🌐 HTTP\n🔍Fonte');
  assert.deepEqual(stream.subtitles, [{ url: 'https://cdn.exemplo.com/pt.vtt', language: 'Português' }]);
});

test('buildStream: format inválido propaga o erro do formatador', () => {
  assert.throws(
    () => buildStream({ url: BASE.url, quality: '720p', format: { template: 'outro', addon: 'Fonte' } }),
    /stream\.format\.template desconhecido/,
  );
  assert.throws(() => buildStream({ url: BASE.url, quality: '720p', format: 'gdrive' }), /stream\.format deve ser objeto/);
});

// --- buildStream: descoberta local de qualidade ---

const DISCOVERY_BASE = {
  url: 'https://cdn.exemplo.com/video.m3u8',
  format: { template: FORMATTER.GDRIVE, addon: 'Fonte' },
};

test('buildStream: qualidade descoberta em qualityHints', () => {
  const stream = buildStream({ ...DISCOVERY_BASE, qualityHints: ['Duna.2024.720p'] });
  assert.equal(stream.quality, '720p');
  assert.equal(stream.name, 'Fonte 720p\n🗣️ Idioma Desconhecido\n🌐 HTTP');
});

test('buildStream: ordem de descoberta é qualityHints, filename, folderName e url', () => {
  assert.equal(
    buildStream({
      ...DISCOVERY_BASE,
      qualityHints: ['720p'],
      format: { ...DISCOVERY_BASE.format, filename: 'Duna.1080p' },
    }).quality,
    '720p',
  );
  assert.equal(
    buildStream({ ...DISCOVERY_BASE, format: { ...DISCOVERY_BASE.format, filename: 'Duna.720p', folderName: 'Duna.1080p' } }).quality,
    '720p',
  );
  assert.equal(
    buildStream({
      ...DISCOVERY_BASE,
      url: 'https://cdn.exemplo.com/Duna.1080p/video.m3u8',
      format: { ...DISCOVERY_BASE.format, folderName: 'Duna.720p' },
    }).quality,
    '720p',
  );
  assert.equal(
    buildStream({ ...DISCOVERY_BASE, url: 'https://cdn.exemplo.com/Duna.1080p/video.m3u8' }).quality,
    '1080p',
  );
});

test('buildStream: qualidade desconhecida quando nada informa', () => {
  const stream = buildStream(DISCOVERY_BASE);
  assert.equal(stream.quality, 'Desconhecida');
  assert.equal(stream.name, 'Fonte Desconhecida\n🗣️ Idioma Desconhecido\n🌐 HTTP');
});

test('buildStream: sentinela Desconhecida explícita é aceita', () => {
  const stream = buildStream({ ...DISCOVERY_BASE, quality: 'Desconhecida' });
  assert.equal(stream.quality, 'Desconhecida');
});

test('buildStream: qualityHints ignora null, undefined e vazio', () => {
  assert.equal(buildStream({ ...DISCOVERY_BASE, qualityHints: [null, undefined, '', '720p'] }).quality, '720p');
  assert.equal(buildStream({ ...DISCOVERY_BASE, qualityHints: [] }).quality, 'Desconhecida');
});
