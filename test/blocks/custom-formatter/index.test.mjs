import test from 'node:test';
import assert from 'node:assert/strict';

import { FORMATTER, LIMITS, clipEnd, clipMiddle, formatStream, resetAutoTemplate } from '../../../src/_blocks/custom-formatter/index.mjs';
import { LANGUAGE, LANGUAGE_MODES } from '../../../src/_blocks/language-discovery/index.mjs';

const MAGNET = 'magnet:?xt=urn:btih:c9e15763f722f23e98a29decdfae341b98d53056';
const TORRENT_FILE = 'torrent://c9e15763f722f23e98a29decdfae341b98d53056/3';
const HTTP = 'https://cdn.exemplo/video.m3u8';

// Stream completo dos exemplos da change standardize-formatter-audio.
const FULL_STREAM = {
  url: MAGNET,
  quality: '4K',
  size: '62.5 GB',
  language: LANGUAGE.DUBBED,
  seeders: 125,
  peers: 40,
  provider: 'RARBG',
};

const FULL_DETAILS = {
  addon: 'Torrentio',
  title: 'Movie Title',
  year: 2023,
  source: 'BluRay',
  encode: 'HEVC',
  releaseGroup: 'GROUP',
  visualTags: ['DV'],
  audioTags: ['Atmos', 'TrueHD'],
  audioChannels: ['7.1'],
  folderSize: '125 GB',
  bitrate: 54800000,
  duration: 9120,
  age: '10d',
  folderName: 'Movie.Title.2023-GROUP',
  filename: 'Movie.Title.2023-GROUP.mkv',
  message: 'Mensagem',
};

// Sem url explícita, o stream é HTTP e Dublado.
function format(template, stream, details) {
  return formatStream({ url: HTTP, language: LANGUAGE.DUBBED, ...stream }, { template, ...details });
}

function withBuildConstant(value, run) {
  globalThis.NUVIO_FORMATTER = value;
  try {
    return run();
  } finally {
    delete globalThis.NUVIO_FORMATTER;
  }
}

function assertClean(text) {
  assert.doesNotMatch(text, /undefined|null|\n\n|^\s|\s$|\s\n|\n\s/, `texto com resto de dado ausente: ${JSON.stringify(text)}`);
}

test.afterEach(() => resetAutoTemplate());

// --- templates ---

test('FORMATTER lista auto, gdrive e prism e é imutável', () => {
  assert.deepEqual({ ...FORMATTER }, { AUTO: 'auto', GDRIVE: 'gdrive', PRISM: 'prism' });
  assert.ok(Object.isFrozen(FORMATTER));
});

test('template desconhecido lança erro citando os aceitos', () => {
  assert.throws(
    () => format('minimalistic', { quality: '720p' }, { addon: 'Fonte' }),
    /desconhecido: "minimalistic" \(aceitos: auto, gdrive, prism\)/,
  );
  assert.throws(() => formatStream({ url: HTTP, quality: '720p', language: LANGUAGE.DUBBED }, { addon: 'Fonte' }), /aceitos: auto, gdrive, prism/);
});

// --- Google Drive ---

test('gdrive: stream completo segue o layout do exemplo com audioPart, swarmPart e limites', () => {
  const { name, title } = format(FORMATTER.GDRIVE, FULL_STREAM, FULL_DETAILS);
  assert.deepEqual(name.split('\n'), [
    'Torrentio 4K',
    '🎥 BluRay 🎞️ HEVC 📺 DV 🏷️ GROUP',
    '🎧 Atmos | TrueHD 🔊 7.1',
    '🗣️ Dublado',
    '🧲 P2P 📦 pacote 125 GB (54.8 Mbps) ⏱️ 2h:32m:0s 👥 125/40 📅 10d 🔍 RARBG',
    '📁 Movie.Title.2023-GROUP.mkv',
    'ℹ️ Mensagem',
  ]);
  assertClean(name);
  assert.deepEqual(title.split('\n'), [
    '🎥 BluRay 🎞️ HEVC 📺 DV 🏷️ GROUP',
    '🎧 Atmos | TrueHD 🔊 7.1',
    '🗣️ Dublado',
    '🧲 P2P 📦 62.5 GB / 125 GB (54.8 Mbps) ⏱️ 2h:32m:0s 👥 125/40 📅 10d 🔍 RARBG',
    '📁 Movie.Title.2023-GROUP/Movie.Title.2023-GROUP.mkv',
    'ℹ️ Mensagem',
  ]);
  assertClean(title);
});

test('gdrive: name sem o tamanho do arquivo mas COM idioma e sem pasta', () => {
  const { name, title } = format(
    FORMATTER.GDRIVE,
    { url: MAGNET, quality: '1080p', size: '2.5 GB', language: LANGUAGE.DUBBED, provider: 'cat' },
    { addon: 'Fonte', filename: 'a.mkv', folderName: 'pasta' },
  );
  assert.equal(name, 'Fonte 1080p\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 cat\n📁 a.mkv');
  assert.equal(title, '🗣️ Dublado\n🧲 P2P 📦 2.5 GB 👥 ?/? 🔍 cat\n📁 pasta/a.mkv');
});

test('gdrive: sem detalhes, o name leva o cabeçalho, idioma e tipo; title leva idioma e tipo', () => {
  assert.deepEqual(format(FORMATTER.GDRIVE, { quality: '720p', language: LANGUAGE.UNKNOWN }, { addon: 'Fonte' }), {
    name: 'Fonte 720p\n🗣️ Idioma Desconhecido\n🌐 HTTP',
    title: '🗣️ Idioma Desconhecido\n🌐 HTTP',
  });
});

test('gdrive: linha técnica sem dados some e parte ausente não deixa separador', () => {
  const { title } = format(FORMATTER.GDRIVE, { quality: '1080p', size: '2.5 GB' }, { addon: 'Fonte', source: 'WEB-DL' });
  assert.equal(title, '🎥 WEB-DL\n🗣️ Dublado\n🌐 HTTP 📦 2.5 GB');
  assert.doesNotMatch(title, /📺|🎧|🔊|\/|\(/);
});

test('gdrive: qualidade desconhecida no cabeçalho e demais linhas preservadas', () => {
  const { name, title } = format(
    FORMATTER.GDRIVE,
    { quality: 'Desconhecida', size: '2.5 GB', language: LANGUAGE.DUBBED },
    { addon: 'CineAgora', filename: 'Matrix.1999' },
  );
  assert.deepEqual(name.split('\n'), ['CineAgora Desconhecida', '🗣️ Dublado', '🌐 HTTP', '📁 Matrix.1999']);
  assert.deepEqual(title.split('\n'), ['🗣️ Dublado', '🌐 HTTP 📦 2.5 GB', '📁 Matrix.1999']);
});

test('gdrive: pacote só aparece junto do tamanho; arquivo sem pasta no name', () => {
  const { name, title } = format(
    FORMATTER.GDRIVE,
    { quality: '720p' },
    { addon: 'Fonte', folderSize: '10 GB', folderName: 'Pasta', filename: 'a.mkv' },
  );
  assert.equal(name, 'Fonte 720p\n🗣️ Dublado\n🌐 HTTP 📦 pacote 10 GB\n📁 a.mkv');
  assert.equal(title, '🗣️ Dublado\n🌐 HTTP\n📁 Pasta/a.mkv');
});

test('gdrive: legendas externas de reprodução não viram listagens linguísticas na apresentação', () => {
  const stream = {
    quality: '1080p',
    language: LANGUAGE.DUBBED,
    subtitles: [
      { url: 'https://x/1.srt', language: 'Português' },
      { url: 'https://x/2.srt', language: 'Inglês' },
    ],
  };
  const { title } = format(FORMATTER.GDRIVE, stream, { addon: 'Fonte' });
  assert.equal(title, '🗣️ Dublado\n🌐 HTTP');
  assert.doesNotMatch(title, /📝|Português|Inglês/);
});

// --- Prism ---

test('prism: stream completo segue o layout do exemplo', () => {
  const { name, title } = format(FORMATTER.PRISM, FULL_STREAM, FULL_DETAILS);
  assert.deepEqual(name.split('\n'), [
    '🔥4K UHD',
    '🎬 Movie Title (2023)',
    '🎥 BluRay 📺 DV 🎞️ HEVC ⏱️ 2h:32m:0s',
    '🎧 Atmos | TrueHD 🔊 7.1',
    '🗣️ Dublado',
    '🧲 P2P 📦 pacote 125 GB 📊 54.8 Mbps 🌱 125/40',
    '🏷️ GROUP 📡 RARBG',
    'ℹ️ Mensagem',
  ]);
  assertClean(name);
  assert.deepEqual(title.split('\n'), [
    '🎬 Movie Title (2023)',
    '🎥 BluRay 📺 DV 🎞️ HEVC ⏱️ 2h:32m:0s',
    '🎧 Atmos | TrueHD 🔊 7.1',
    '🗣️ Dublado',
    '🧲 P2P 📦 62.5 GB / 125 GB 📊 54.8 Mbps 🌱 125/40',
    '🏷️ GROUP 📡 RARBG',
    '🔍Torrentio',
    'ℹ️ Mensagem',
  ]);
  assertClean(title);
});

test('prism: episódio com seeders e sem peers exibe 🌱 <seeders>/?', () => {
  const { name, title } = format(
    FORMATTER.PRISM,
    { url: MAGNET, quality: '1080p', size: '1.50 GB', seeders: 40, language: LANGUAGE.UNKNOWN },
    { addon: 'Fonte', title: 'Breaking Bad', year: 2008, season: 2, episode: 3 },
  );
  assert.deepEqual(name.split('\n'), [
    '🚀 FHD 1080p',
    '🎬 Breaking Bad (2008) T02E03',
    '🗣️ Idioma Desconhecido',
    '🧲 P2P 🌱 40/?',
  ]);
  assert.deepEqual(title.split('\n'), [
    '🎬 Breaking Bad (2008) T02E03',
    '🗣️ Idioma Desconhecido',
    '🧲 P2P 📦 1.50 GB 🌱 40/?',
    '🔍Fonte',
  ]);
});

test('prism: sem detalhes, o selo, idioma e o tipo no name; idioma, tipo e o provedor no title', () => {
  assert.deepEqual(format(FORMATTER.PRISM, { quality: '720p', language: LANGUAGE.UNKNOWN }, { addon: 'Fonte' }), {
    name: '💿 HD 720p\n🗣️ Idioma Desconhecido\n🌐 HTTP',
    title: '🗣️ Idioma Desconhecido\n🌐 HTTP\n🔍Fonte',
  });
});

test('prism: qualidade desconhecida usa ❓ e não aplica selo de resolução', () => {
  const { name } = format(FORMATTER.PRISM, { quality: 'Desconhecida', size: '2.5 GB' }, { addon: 'CineAgora', title: 'Matrix', year: 1999 });
  assert.equal(name.split('\n')[0], '❓ Desconhecida');
  assert.doesNotMatch(name, /🔥|✨|🚀|💿|💩/);
  assert.match(name, /🎬 Matrix \(1999\)/);
});

const BADGES = [
  ['4K', '🔥4K UHD'],
  ['4320p', '🔥4K UHD 4320p'],
  ['2160p', '🔥4K UHD 2160p'],
  ['1440p', '✨ QHD 1440p'],
  ['1080p', '🚀 FHD 1080p'],
  ['1038p', '💿 HD 1038p'],
  ['720p', '💿 HD 720p'],
  ['576p', '💩 Baixa qualidade 576p'],
  ['480p', '💩 Baixa qualidade 480p'],
  ['CAM', '💩 CAM'],
];

for (const [quality, badge] of BADGES) {
  test(`prism: selo de ${quality} é "${badge}"`, () => {
    assert.equal(format(FORMATTER.PRISM, { quality }, { addon: 'F' }).name.split('\n')[0], badge);
  });
}

test('prism: qualidade fora do formato normalizado lança erro', () => {
  assert.throws(() => format(FORMATTER.PRISM, { quality: 'HD' }, { addon: 'F' }), /fora do formato normalizado/);
});

// --- seis valores do enum de idioma ---

for (const lang of LANGUAGE_MODES) {
  test(`formatador exibe exatamente "🗣️ ${lang}" nos dois templates em name e title`, () => {
    for (const template of [FORMATTER.GDRIVE, FORMATTER.PRISM]) {
      const { name, title } = format(template, { quality: '1080p', language: lang }, { addon: 'Fonte' });
      assert.ok(name.includes(`🗣️ ${lang}`), `name deve conter "🗣️ ${lang}" no template ${template}`);
      assert.ok(title.includes(`🗣️ ${lang}`), `title deve conter "🗣️ ${lang}" no template ${template}`);
      assertClean(name);
      assertClean(title);
    }
  });
}

test('regex exata de Dublado ^🗣️ Dublado$ exclui os demais cinco valores', () => {
  const exactDublado = /^🗣️ Dublado$/m;
  const prefixDublado = /🗣️ Dublado/;

  for (const template of [FORMATTER.GDRIVE, FORMATTER.PRISM]) {
    const dublado = format(template, { quality: '1080p', language: LANGUAGE.DUBBED }, { addon: 'F' });
    const dubladoNonPtBr = format(template, { quality: '1080p', language: LANGUAGE.DUBBED_NON_PT_BR }, { addon: 'F' });
    const subtitled = format(template, { quality: '1080p', language: LANGUAGE.SUBTITLED }, { addon: 'F' });
    const subtitledNonPtBr = format(template, { quality: '1080p', language: LANGUAGE.SUBTITLED_NON_PT_BR }, { addon: 'F' });
    const nonPtBr = format(template, { quality: '1080p', language: LANGUAGE.NON_PT_BR }, { addon: 'F' });
    const unknown = format(template, { quality: '1080p', language: LANGUAGE.UNKNOWN }, { addon: 'F' });

    assert.match(dublado.name, exactDublado);
    assert.match(dublado.title, exactDublado);

    assert.doesNotMatch(dubladoNonPtBr.name, exactDublado);
    assert.doesNotMatch(dubladoNonPtBr.title, exactDublado);
    assert.match(dubladoNonPtBr.name, prefixDublado); // prefixo seleciona ambos
    assert.match(dubladoNonPtBr.title, prefixDublado);

    assert.doesNotMatch(subtitled.name, exactDublado);
    assert.doesNotMatch(subtitledNonPtBr.name, exactDublado);
    assert.doesNotMatch(nonPtBr.name, exactDublado);
    assert.doesNotMatch(unknown.name, exactDublado);
  }
});

test('sufixos com ressalva preservam parênteses e ? literal; Gringo não tem ?', () => {
  for (const template of [FORMATTER.GDRIVE, FORMATTER.PRISM]) {
    const dRes = format(template, { quality: '1080p', language: LANGUAGE.DUBBED_NON_PT_BR }, { addon: 'F' });
    assert.match(dRes.name, /^🗣️ Dublado \(Não PT-BR\?\)$/m);
    assert.match(dRes.title, /^🗣️ Dublado \(Não PT-BR\?\)$/m);

    const lRes = format(template, { quality: '1080p', language: LANGUAGE.SUBTITLED_NON_PT_BR }, { addon: 'F' });
    assert.match(lRes.name, /^🗣️ Legendado \(Não PT-BR\?\)$/m);
    assert.match(lRes.title, /^🗣️ Legendado \(Não PT-BR\?\)$/m);

    const nonPtBr = format(template, { quality: '1080p', language: LANGUAGE.NON_PT_BR }, { addon: 'F' });
    assert.match(nonPtBr.name, /^🗣️ Gringo$/m);
    assert.match(nonPtBr.title, /^🗣️ Gringo$/m);
    assert.doesNotMatch(nonPtBr.name + nonPtBr.title, /\?/);
  }
});

// --- seeders e peers (swarmPart) ---

test('swarmPart: P2P magnet sem números da fonte exibe ?/?', () => {
  const gdrive = format(FORMATTER.GDRIVE, { url: MAGNET, quality: '1080p' }, { addon: 'F' });
  assert.ok(gdrive.name.includes('👥 ?/?'));
  assert.ok(gdrive.title.includes('👥 ?/?'));

  const prism = format(FORMATTER.PRISM, { url: MAGNET, quality: '1080p' }, { addon: 'F' });
  assert.ok(prism.name.includes('🌱 ?/?'));
  assert.ok(prism.title.includes('🌱 ?/?'));
});

test('swarmPart: só seeders exibe <seeders>/?', () => {
  const gdrive = format(FORMATTER.GDRIVE, { url: TORRENT_FILE, quality: '1080p', seeders: 125 }, { addon: 'F' });
  assert.ok(gdrive.name.includes('👥 125/?'));
  assert.ok(gdrive.title.includes('👥 125/?'));

  const prism = format(FORMATTER.PRISM, { url: TORRENT_FILE, quality: '1080p', seeders: 125 }, { addon: 'F' });
  assert.ok(prism.name.includes('🌱 125/?'));
  assert.ok(prism.title.includes('🌱 125/?'));
});

test('swarmPart: seeders e peers exibem <seeders>/<peers>, inclusive zero', () => {
  const gdrive = format(FORMATTER.GDRIVE, { url: MAGNET, quality: '1080p', seeders: 125, peers: 40 }, { addon: 'F' });
  assert.ok(gdrive.name.includes('👥 125/40'));
  assert.ok(gdrive.title.includes('👥 125/40'));

  const gdriveZero = format(FORMATTER.GDRIVE, { url: MAGNET, quality: '1080p', seeders: 0, peers: 0 }, { addon: 'F' });
  assert.ok(gdriveZero.name.includes('👥 0/0'));
  assert.ok(gdriveZero.title.includes('👥 0/0'));

  const prism = format(FORMATTER.PRISM, { url: MAGNET, quality: '1080p', seeders: 125, peers: 40 }, { addon: 'F' });
  assert.ok(prism.name.includes('🌱 125/40'));
  assert.ok(prism.title.includes('🌱 125/40'));
});

test('swarmPart: stream HTTP omite completamente a parte de seeders e peers', () => {
  const gdrive = format(FORMATTER.GDRIVE, { url: HTTP, quality: '1080p', seeders: 125, peers: 40 }, { addon: 'F' });
  assert.doesNotMatch(gdrive.name + gdrive.title, /👥|🌱/);

  const prism = format(FORMATTER.PRISM, { url: HTTP, quality: '1080p', seeders: 125, peers: 40 }, { addon: 'F' });
  assert.doesNotMatch(prism.name + prism.title, /👥|🌱/);
});

// --- LIMITS e cortes ---

test('LIMITS define os limites exatos e imutáveis', () => {
  assert.equal(LIMITS.FILE, 40);
  assert.equal(LIMITS.FOLDER, 40);
  assert.equal(LIMITS.TITLE, 40);
  assert.equal(LIMITS.MESSAGE, 60);
  assert.equal(LIMITS.CATALOG, 24);
  assert.equal(LIMITS.GROUP, 24);
  assert.equal(LIMITS.SOURCE, 24);
  assert.equal(LIMITS.ENCODE, 24);
  assert.equal(LIMITS.AGE, 24);
  assert.equal(LIMITS.ITEM, 24);
  assert.ok(Object.isFrozen(LIMITS));
});

test('clipEnd e clipMiddle cortam exatamente no limite e tratam valores curtos', () => {
  assert.equal(clipEnd('curto', 24), 'curto');
  assert.equal(clipMiddle('curto', 40), 'curto');
  assert.equal(clipEnd(undefined, 24), undefined);
  assert.equal(clipMiddle(undefined, 40), undefined);

  // Exato 24 caracteres: sem elipse
  const exact24 = '123456789012345678901234';
  assert.equal(clipEnd(exact24, 24), exact24);

  // 25 caracteres: 23 + elipse = 24
  const long25 = '1234567890123456789012345';
  assert.equal(clipEnd(long25, 24), '12345678901234567890123…');
  assert.equal(Array.from(clipEnd(long25, 24)).length, 24);
});

test('arquivo longo The.Rookie é cortado no meio preservando a extensão', () => {
  const filename = 'The.Rookie.S04E01.1080p.WEBRip.x265-RARBG.mp4';
  const clipped = clipMiddle(filename, LIMITS.FILE);
  assert.equal(clipped, 'The.Rookie.S04E01.10…BRip.x265-RARBG.mp4');
  assert.equal(Array.from(clipped).length, 40);

  const { name, title } = format(
    FORMATTER.GDRIVE,
    { quality: '1080p' },
    {
      addon: 'F',
      filename,
      folderName: 'The.Rookie.S04.1080p.WEBRip.x265-RARBG',
    },
  );
  assert.ok(name.includes('📁 The.Rookie.S04E01.10…BRip.x265-RARBG.mp4'));
  assert.doesNotMatch(name, /The\.Rookie\.S04\.1080p\.WEBRip\.x265-RARBG\//);
  assert.ok(title.includes('📁 The.Rookie.S04.1080p.WEBRip.x265-RARBG/The.Rookie.S04E01.10…BRip.x265-RARBG.mp4'));
});

test('catálogo longo é cortado no fim com 24 caracteres', () => {
  const longCatalog = 'www-fontedecanais-bz.76iqsc65sxxn71.com';
  const { title } = format(FORMATTER.GDRIVE, { quality: '720p', provider: longCatalog }, { addon: 'F' });
  assert.ok(title.includes('🔍 www-fontedecanais-bz.76…'));
  assert.equal(Array.from('www-fontedecanais-bz.76…').length, 24);
});

test('lista técnica com mais de 3 itens exibe até 3 itens e +N', () => {
  const { name, title } = format(
    FORMATTER.GDRIVE,
    { quality: '1080p' },
    { addon: 'F', visualTags: ['HDR', 'DV', 'HDR10', 'HLG', 'HDR10+'] },
  );
  assert.ok(name.includes('📺 HDR | DV | HDR10 +2'));
  assert.ok(title.includes('📺 HDR | DV | HDR10 +2'));
});

test('título com mais de 40 caracteres e acentos não corrompe code points', () => {
  const longTitle = 'História Extraordinária de Famílias em Ação Épica';
  const clipped = clipEnd(longTitle, LIMITS.TITLE);
  assert.equal(Array.from(clipped).length, 40);
  assert.ok(clipped.endsWith('…'));

  const { name } = format(FORMATTER.PRISM, { quality: '1080p' }, { addon: 'F', title: longTitle, year: 2024 });
  assert.ok(name.includes(`🎬 ${clipped} (2024)`));
});

test('partes sem limite não são cortadas', () => {
  const { name, title } = format(
    FORMATTER.GDRIVE,
    {
      quality: '1080p',
      size: '123.456 GB',
      seeders: 123456,
      peers: 654321,
      url: MAGNET,
    },
    {
      addon: 'AddonBemLongoQueNaoSofreCorte',
      bitrate: 123456789,
      duration: 36610,
    },
  );
  assert.ok(name.startsWith('AddonBemLongoQueNaoSofreCorte 1080p'));
  assert.ok(title.includes('📦 123.456 GB'));
  assert.ok(title.includes('(123.5 Mbps)'));
  assert.ok(title.includes('⏱️ 10h:10m:10s'));
  assert.ok(title.includes('👥 123456/654321'));
});

// --- validação ---

test('addon ausente lança erro', () => {
  assert.throws(() => format(FORMATTER.GDRIVE, { quality: '720p' }, {}), /stream\.format\.addon é obrigatório/);
});

test('stream.language ausente ou fora do enum lança erro citando os seis aceitos', () => {
  assert.throws(
    () => formatStream({ url: HTTP, quality: '720p' }, { template: FORMATTER.GDRIVE, addon: 'F' }),
    /stream\.language inválido: undefined \(aceitos: Dublado, Dublado \(Não PT-BR\?\), Legendado, Legendado \(Não PT-BR\?\), Gringo, Idioma Desconhecido\)/,
  );
  assert.throws(
    () => formatStream({ url: HTTP, quality: '720p', language: 'Dual Áudio' }, { template: FORMATTER.GDRIVE, addon: 'F' }),
    /stream\.language inválido: "Dual Áudio" \(aceitos: Dublado, Dublado \(Não PT-BR\?\), Legendado, Legendado \(Não PT-BR\?\), Gringo, Idioma Desconhecido\)/,
  );
  assert.throws(
    () => formatStream({ url: HTTP, quality: '720p', language: 'Inglês' }, { template: FORMATTER.GDRIVE, addon: 'F' }),
    /stream\.language inválido: "Inglês"/,
  );
});

test('format.languages e format.languageHints são rejeitados como campos desconhecidos', () => {
  assert.throws(
    () => format(FORMATTER.GDRIVE, { quality: '720p' }, { addon: 'F', languages: ['pt', 'en'] }),
    /campo desconhecido "languages"/,
  );
  assert.throws(
    () => format(FORMATTER.GDRIVE, { quality: '720p' }, { addon: 'F', languageHints: ['dublado'] }),
    /campo desconhecido "languageHints"/,
  );
});

test('campo desconhecido lança erro com os 19 campos aceitos', () => {
  assert.throws(
    () => format(FORMATTER.GDRIVE, { quality: '720p' }, { addon: 'F', group: 'X' }),
    /campo desconhecido "group" \(aceitos: template, addon, title, year, season, episode, filename, folderName, folderSize, source, encode, visualTags, audioTags, audioChannels, releaseGroup, bitrate, duration, age, message\)/,
  );
});

const INVALID = [
  ['duration', -1, /stream\.format\.duration deve ser inteiro/],
  ['duration', 1.5, /stream\.format\.duration deve ser inteiro/],
  ['bitrate', '54 Mbps', /stream\.format\.bitrate deve ser número maior que zero \(recebido: "54 Mbps"\)/],
  ['bitrate', 0, /stream\.format\.bitrate deve ser número maior que zero/],
  ['visualTags', 'DV', /stream\.format\.visualTags deve ser lista/],
  ['audioTags', ['Atmos', ''], /stream\.format\.audioTags\[1\] deve ser texto não vazio/],
  ['year', '1999', /stream\.format\.year deve ser inteiro/],
  ['title', '  ', /stream\.format\.title deve ser texto não vazio/],
  ['addon', 42, /stream\.format\.addon deve ser texto não vazio/],
];

for (const [field, value, message] of INVALID) {
  test(`valor inválido em ${field} (${JSON.stringify(value)}) lança erro`, () => {
    assert.throws(() => format(FORMATTER.GDRIVE, { quality: '720p' }, { addon: 'F', [field]: value }), message);
  });
}

test('peers inválido lança erro', () => {
  assert.throws(() => format(FORMATTER.GDRIVE, { url: MAGNET, quality: '720p', peers: -1 }, { addon: 'F' }), /stream\.peers deve ser inteiro maior ou igual a zero/);
});

test('seeders inválido lança erro', () => {
  assert.throws(() => format(FORMATTER.GDRIVE, { url: MAGNET, quality: '720p', seeders: -1 }, { addon: 'F' }), /stream\.seeders deve ser inteiro maior ou igual a zero/);
});

test('stream ou format que não são objeto lançam erro', () => {
  assert.throws(() => formatStream(null, { template: 'gdrive', addon: 'F' }), /stream deve ser objeto/);
  assert.throws(() => formatStream({ quality: '720p' }, 'gdrive'), /stream\.format deve ser objeto/);
  assert.throws(() => formatStream({ url: HTTP, language: LANGUAGE.DUBBED }, { template: 'gdrive', addon: 'F' }), /stream\.quality deve ser texto/);
});

// --- tipo de entrega ---

const DELIVERIES = [
  ['magnet', MAGNET, '🧲 P2P'],
  ['torrent://', TORRENT_FILE, '🧲 P2P'],
  ['magnet em maiúsculas', 'MAGNET:?xt=urn:btih:c9e15763f722f23e98a29decdfae341b98d53056', '🧲 P2P'],
  ['http', 'http://cdn.exemplo/video.mp4', '🌐 HTTP'],
  ['https', HTTP, '🌐 HTTP'],
];

for (const [label, url, expected] of DELIVERIES) {
  for (const template of [FORMATTER.GDRIVE, FORMATTER.PRISM]) {
    test(`tipo de entrega: ${label} sai como ${expected} no ${template}, no name e no title`, () => {
      const { name, title } = format(template, { url, quality: '720p', size: '1.5 GB', seeders: 7 }, { addon: 'F' });
      for (const text of [name, title]) {
        assert.ok(text.split('\n').some((line) => line.startsWith(`${expected} `) || line === expected), text);
        assertClean(text);
      }
    });
  }
}

test('tipo de entrega: linha só com o tipo quando não há tamanho, pacote, bitrate nem seeders', () => {
  assert.equal(format(FORMATTER.GDRIVE, { url: TORRENT_FILE, quality: '720p' }, { addon: 'F' }).title, '🗣️ Dublado\n🧲 P2P 👥 ?/?');
  assert.equal(format(FORMATTER.PRISM, { url: TORRENT_FILE, quality: '720p' }, { addon: 'F' }).name, '💿 HD 720p\n🗣️ Dublado\n🧲 P2P 🌱 ?/?');
});

test('tipo de entrega: esquema desconhecido lança erro citando stream.url e o valor', () => {
  assert.throws(
    () => format(FORMATTER.GDRIVE, { url: 'ftp://exemplo/video.mp4', quality: '720p' }, { addon: 'F' }),
    /stream\.url deve ser http\(s\), magnet ou torrent:\/\/ \(recebido: "ftp:\/\/exemplo\/video\.mp4"\)/,
  );
});

test('tipo de entrega: url ausente ou vazia lança erro', () => {
  assert.throws(() => formatStream({ quality: '720p', language: LANGUAGE.DUBBED }, { template: 'gdrive', addon: 'F' }), /stream\.url é obrigatório/);
  assert.throws(() => format(FORMATTER.PRISM, { url: ' ', quality: '720p' }, { addon: 'F' }), /stream\.url deve ser texto não vazio/);
});

// --- auto ---

test('auto com constante de build aplica o template da variante', () => {
  withBuildConstant('prism', () => {
    assert.equal(format(FORMATTER.AUTO, { quality: '720p' }, { addon: 'F' }).name, '💿 HD 720p\n🗣️ Dublado\n🌐 HTTP');
  });
  withBuildConstant('gdrive', () => {
    assert.equal(format(FORMATTER.AUTO, { quality: '720p' }, { addon: 'F' }).name, 'F 720p\n🗣️ Dublado\n🌐 HTTP');
  });
});

test('template concreto prevalece sobre a constante de build', () => {
  withBuildConstant('prism', () => {
    assert.equal(format(FORMATTER.GDRIVE, { quality: '720p' }, { addon: 'F' }).name, 'F 720p\n🗣️ Dublado\n🌐 HTTP');
  });
});

test('constante de build inválida lança erro', () => {
  withBuildConstant('auto', () => {
    assert.throws(() => format(FORMATTER.AUTO, { quality: '720p' }, { addon: 'F' }), /NUVIO_FORMATTER \(constante de build\) desconhecido: "auto" \(aceitos: gdrive, prism\)/);
  });
});

test('auto no arquivo base sorteia uma vez e mantém o template', () => {
  let calls = 0;
  resetAutoTemplate(() => {
    calls += 1;
    return 0.99;
  });
  const names = [1, 2, 3].map(() => format(FORMATTER.AUTO, { quality: '1080p' }, { addon: 'F' }).name);
  assert.deepEqual(names, Array(3).fill('🚀 FHD 1080p\n🗣️ Dublado\n🌐 HTTP'));
  assert.equal(calls, 1);

  resetAutoTemplate(() => 0);
  assert.equal(format(FORMATTER.AUTO, { quality: '1080p' }, { addon: 'F' }).name, 'F 1080p\n🗣️ Dublado\n🌐 HTTP');
});

test('resetAutoTemplate rejeita fonte que não é função', () => {
  assert.throws(() => resetAutoTemplate(0.5), /source deve ser função/);
});
