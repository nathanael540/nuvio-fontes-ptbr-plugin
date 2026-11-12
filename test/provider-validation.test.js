const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir } = require('./support/temp-dir');

let mod;
test.before(async () => {
  mod = await import('./maestro/run-provider-validation.mjs');
});

const line = (time, message, pid = 123) => `${time}.000 ${pid} 1 I ${message}`;

function encodeBencode(value) {
  if (Number.isInteger(value)) return Buffer.from(`i${value}e`);
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes]);
  }
  if (typeof value === 'string') return encodeBencode(Buffer.from(value));
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.from('l'), ...value.map(encodeBencode), Buffer.from('e')]);
  }
  const keys = Object.keys(value).sort();
  return Buffer.concat([
    Buffer.from('d'),
    ...keys.flatMap((key) => [encodeBencode(key), encodeBencode(value[key])]),
    Buffer.from('e'),
  ]);
}

function buildTorrentBuffer(files, folderName = 'Release.Folder') {
  const info = {
    name: folderName,
    'piece length': 262144,
    pieces: '12345678901234567890',
    files: files.map((file) => ({
      length: file.size,
      path: file.path.split('/'),
    })),
  };
  const infoBytes = encodeBencode(info);
  const hash = createHash('sha1').update(infoBytes).digest('hex');
  const torrentBytes = Buffer.concat([
    Buffer.from('d'),
    encodeBencode('announce'),
    encodeBencode('udp://tracker.opentrackr.org'),
    encodeBencode('info'),
    infoBytes,
    Buffer.from('e'),
  ]);
  return { torrentBytes, hash, infoBytes };
}

test('2.1 e 2.2: classifica quadro renderizado, estado de reprodução, avanço real >= 3s, rebuffer e tentativas recuperadas', () => {
  const baseStart = [
    line(10, 'NuvioP2PDiag: start request=1 phase=accepted hash=abcdef123456'),
    line(11, 'NuvioP2PDiag: start request=1 phase=prepare_stream complete selectedFile=0 fileBytes=1000'),
    line(11, 'NuvioP2PDiag: start request=1 phase=route_ready'),
    line(12, 'NuvioPlayerDiag: prepare begin attempt=1'),
  ];
  const validPlayback = [
    line(13, 'NuvioPlayerDiag: firstFrame attempt=1 positionMs=0'),
    line(13, 'NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=0'),
    line(18, 'NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=5200'),
  ];

  // Confirmação positiva com pausa explícita sem seek registrada
  const positive = mod.analyze([...baseStart, ...validPlayback].join('\n'), {
    pid: '123',
    pauseIntervention: { applied: true, keyevent: 127, withoutSeek: true },
  });
  assert.equal(positive.playback, 'confirmed');
  assert.equal(positive.evidence.pauseIntervention.applied, true);
  assert.equal(positive.evidence.pauseIntervention.keyevent, 127);
  assert.equal(positive.evidence.pauseIntervention.withoutSeek, true);

  // Quadro isolado sem avanço
  const isolatedFrame = mod.analyze([...baseStart, validPlayback[0], validPlayback[1]].join('\n'), { pid: '123' });
  assert.equal(isolatedFrame.playback, 'inconclusive');

  // Áudio / isPlaying sem primeiro quadro de vídeo
  const audioOnly = mod.analyze(
    [
      ...baseStart,
      line(13, 'NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=0'),
      line(18, 'NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=5000'),
    ].join('\n'),
    { pid: '123' },
  );
  assert.equal(audioOnly.playback, 'inconclusive');

  // Posição parada (tempo passa, posição não avança 3s)
  const stuckPosition = mod.analyze(
    [
      ...baseStart,
      line(13, 'NuvioPlayerDiag: firstFrame attempt=1 positionMs=0'),
      line(13, 'NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=0'),
      line(20, 'NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=1200'),
    ].join('\n'),
    { pid: '123' },
  );
  assert.equal(stuckPosition.playback, 'inconclusive');

  // Salto incompatível com o tempo decorrido
  const jumpPosition = mod.analyze(
    [
      ...baseStart,
      line(13, 'NuvioPlayerDiag: firstFrame attempt=1 positionMs=0'),
      line(13, 'NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=0'),
      line(17, 'NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=600000'),
    ].join('\n'),
    { pid: '123' },
  );
  assert.equal(jumpPosition.playback, 'inconclusive');
  assert.equal(jumpPosition.evidence.hasJump, true);

  // Seek invalida confirmação
  const seeked = mod.analyze(
    [...baseStart, ...validPlayback, line(15, 'NuvioPlayerDiag: seek attempt=1 positionMs=5000')].join('\n'),
    { pid: '123' },
  );
  assert.equal(seeked.playback, 'inconclusive');
  assert.equal(seeked.evidence.seek, true);

  // Rebuffer intermediário e retomada sem seek confirmam reprodução
  const rebuffered = mod.analyze(
    [
      ...baseStart,
      line(13, 'NuvioPlayerDiag: firstFrame attempt=1 positionMs=0'),
      line(13, 'NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=0'),
      line(15, 'NuvioPlayerDiag: state=BUFFERING attempt=1 positionMs=1800'),
      line(15, 'NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=1800'),
      line(18, 'NuvioPlayerDiag: state=READY attempt=1 positionMs=1900'),
      line(18, 'NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=1900'),
      line(24, 'NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=7800'),
    ].join('\n'),
    { pid: '123' },
  );
  assert.equal(rebuffered.playback, 'confirmed');
  assert.equal(rebuffered.evidence.rebuffered, true);

  // Tentativa 1 falha com erro, tentativa 2 recupera e reproduz
  const recovered = mod.analyze(
    [
      ...baseStart,
      line(13, 'NuvioPlayerDiag: error attempt=1 code=SOURCE_ERROR'),
      line(14, 'NuvioPlayerDiag: prepare begin attempt=2'),
      line(15, 'NuvioPlayerDiag: firstFrame attempt=2 positionMs=0'),
      line(15, 'NuvioPlayerDiag: isPlaying=true attempt=2 positionMs=0'),
      line(20, 'NuvioPlayerDiag: isPlaying=false attempt=2 positionMs=5100'),
    ].join('\n'),
    { pid: '123' },
  );
  assert.equal(recovered.playback, 'confirmed');
  assert.equal(recovered.evidence.attemptCount, 2);
  assert.equal(recovered.evidence.recoveredAttempts, 1);

  // Posição extrapolada da sessão de mídia não aprova sem avanço real no NuvioPlayerDiag
  const mediaSessionOnly = mod.analyze(
    [...baseStart, validPlayback[0], validPlayback[1]].join('\n'),
    {
      pid: '123',
      mediaSessions: [
        { at: '2026-11-10T13:00:00Z', text: 'state=PlaybackState {state=3, position=45000, speed=1.0}' },
      ],
    },
  );
  assert.equal(mediaSessionOnly.playback, 'inconclusive');
  assert.ok(mediaSessionOnly.evidence.limitations.some((item) => item.includes('media_session')));
});

test('1.2, 2.3 e 2.4: filtra PID/sessão/tempo, aplica matriz de sinais do TV e preserva dimensões independentes', () => {
  // Matriz de sinais declarada
  assert.equal(mod.getSignalSupport('com.nuvio.app').supportsAutomaticConfirmation, true);
  assert.equal(mod.getSignalSupport('com.nuvio.tv').supportsAutomaticConfirmation, false);
  assert.equal(mod.getSignalSupport('com.nuvio.app', 'vlc_unknown').supportsAutomaticConfirmation, false);

  // Rejeita primeiro quadro sintético do TV (first_frame_ready) e conclui inconclusivo no TV
  const tvSynthetic = mod.analyze(
    [
      line(20, 'NuvioP2PDiag: start request=1 phase=accepted hash=abcdef123456', 7652),
      line(21, 'PlayerPlaybackAnalyticsDiagnostics: event=first_frame_ready attempt=1 positionMs=0', 7652),
      line(21, 'NuvioPlayerDiag: firstFrame first_frame_ready attempt=1 positionMs=0', 7652),
      line(22, 'NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=0', 7652),
      line(28, 'NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=6000', 7652),
    ].join('\n'),
    { pid: '7652', app: 'com.nuvio.tv' },
  );
  assert.equal(tvSynthetic.playback, 'inconclusive');
  assert.equal(tvSynthetic.evidence.syntheticFirstFrameRejected, true);
  assert.ok(tvSynthetic.evidence.limitations.length >= 1);

  // Eventos antigos anteriores a startedAtEpoch ou de outro PID são ignorados
  const oldAndOtherPid = mod.analyze(
    [
      line(5, 'NuvioP2PDiag: start request=1 phase=accepted hash=111111111111', 123),
      line(6, 'NuvioPlayerDiag: prepare begin attempt=1', 123),
      line(7, 'NuvioPlayerDiag: firstFrame attempt=1 positionMs=0', 123),
      line(7, 'NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=0', 123),
      line(12, 'NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=5000', 123),
      line(25, 'NuvioPlayerDiag: firstFrame attempt=1 positionMs=0', 999),
      line(30, 'NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=5000', 999),
      line(20, 'NuvioP2PDiag: start request=2 phase=accepted hash=abcdef123456', 123),
    ].join('\n'),
    { pid: '123', startedAtEpoch: 15 },
  );
  assert.equal(oldAndOtherPid.playback, 'inconclusive');
  assert.equal(oldAndOtherPid.evidence.hashPrefix, 'abcdef123456');

  // Zero peers com metadados aceitos e erro operacional após preparo mantêm dimensões independentes
  const zeroPeers = mod.analyze(
    [
      line(10, 'NuvioP2PDiag: start request=1 phase=accepted hash=abcdef123456'),
      line(11, 'NuvioP2PDiag: start request=1 phase=prepare_stream complete selectedFile=0 fileBytes=2048'),
      line(11, 'NuvioP2PDiag: start request=1 phase=route_ready'),
      line(12, 'NuvioP2PDiag: startupSample request=1 peers=0 seeds=0 payloadDown=0'),
    ].join('\n'),
    { pid: '123' },
  );
  assert.equal(zeroPeers.torrent, 'metadata_accepted_by_app');
  assert.equal(zeroPeers.playback, 'inconclusive');
  assert.equal(zeroPeers.evidence.zeroPeersObserved, true);

  const errorAfterPrep = mod.analyze(
    [
      line(10, 'NuvioP2PDiag: start request=1 phase=accepted hash=abcdef123456'),
      line(11, 'NuvioP2PDiag: start request=1 phase=prepare_stream complete selectedFile=0 fileBytes=2048'),
      line(11, 'NuvioP2PDiag: start request=1 phase=route_ready'),
      line(12, 'NuvioP2PDiag: event type=TorrentError torrent=abcdef123456 message=No such file or directory'),
    ].join('\n'),
    { pid: '123' },
  );
  assert.equal(errorAfterPrep.torrent, 'metadata_accepted_by_app');
  assert.equal(errorAfterPrep.playback, 'error');
});

test('3.1: correlaciona hash no catálogo com paginação e trata HTTP indisponível, timeout, redirect e ambiguidade como inconclusivos', async () => {
  const { torrentBytes, hash } = buildTorrentBuffer([{ path: 'Filme.2026.1080p.mkv', size: 50000 }]);
  const prefix = hash.slice(0, 12);

  // Paginação (2 páginas) + download permitido do BeTor
  const paginatedResult = await mod.validateTorrentMetadata({
    evidence: { hashPrefix: prefix, fileIndex: 0, fileBytes: 50000 },
    imdbId: 'tt1234567',
    mediaType: 'movie',
    fetchImpl: async (url) => {
      if (url.includes('page=1')) {
        return new Response(
          JSON.stringify({
            total: 2,
            items: [{ magnet_uri: `magnet:?xt=urn:btih:${'0'.repeat(40)}` }],
          }),
          { status: 200 },
        );
      }
      if (url.includes('page=2')) {
        return new Response(
          JSON.stringify({
            total: 2,
            items: [
              {
                magnet_uri: `magnet:?xt=urn:btih:${hash}`,
                download_url: `https://download.betor.top/${hash}.torrent`,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url === `https://download.betor.top/${hash}.torrent`) {
        return new Response(torrentBytes, { status: 200 });
      }
      throw new Error(`URL inesperada: ${url}`);
    },
  });
  assert.equal(paginatedResult.status, 'valid');
  assert.equal(paginatedResult.hash, hash);

  // Correspondência não única (ambígua) no catálogo -> inconclusive
  const secondHashWithSamePrefix = `${prefix}${'f'.repeat(28)}`;
  const ambiguousHash = await mod.validateTorrentMetadata({
    evidence: { hashPrefix: prefix },
    catalogItems: [
      { magnet_uri: `magnet:?xt=urn:btih:${hash}` },
      { magnet_uri: `magnet:?xt=urn:btih:${secondHashWithSamePrefix}` },
    ],
  });
  assert.equal(ambiguousHash.status, 'inconclusive');
  assert.match(ambiguousHash.reason, /ambíguo/i);

  // HTTP indisponível (503) -> inconclusive
  const httpUnavailable = await mod.validateTorrentMetadata({
    evidence: { hashPrefix: prefix },
    catalogItems: [{ magnet_uri: `magnet:?xt=urn:btih:${hash}` }],
    fetchImpl: async () => new Response('Unavailable', { status: 503 }),
  });
  assert.equal(httpUnavailable.status, 'inconclusive');
  assert.match(httpUnavailable.reason, /HTTP 503/);

  // Timeout do teste -> inconclusive
  const timedOut = await mod.validateTorrentMetadata({
    evidence: { hashPrefix: prefix },
    catalogItems: [{ magnet_uri: `magnet:?xt=urn:btih:${hash}` }],
    fetchImpl: async () => {
      throw new Error('The operation was aborted due to timeout');
    },
  });
  assert.equal(timedOut.status, 'inconclusive');
  assert.match(timedOut.reason, /timeout/i);

  // Redirecionamento (302) -> inconclusive
  const redirected = await mod.validateTorrentMetadata({
    evidence: { hashPrefix: prefix },
    catalogItems: [{ magnet_uri: `magnet:?xt=urn:btih:${hash}` }],
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x.torrent' } }),
  });
  assert.equal(redirected.status, 'inconclusive');
  assert.match(redirected.reason, /Redirecionamento/i);

  // Origem fora da lista permitida -> inconclusive
  const disallowedOrigin = await mod.validateTorrentMetadata({
    evidence: { hashPrefix: prefix },
    catalogItems: [
      {
        magnet_uri: `magnet:?xt=urn:btih:${hash}`,
        download_url: 'https://untrusted.example/file.torrent',
      },
    ],
  });
  assert.equal(disallowedOrigin.status, 'inconclusive');
  assert.match(disallowedOrigin.reason, /não permitida/i);
});

test('3.2 e 3.3: valida bencode, hash, limites, arquivos auxiliares e episódios em pacote (correto, errado e ambíguo)', () => {
  const pack = buildTorrentBuffer(
    [
      { path: 'Subs/legendas.srt', size: 1200 },
      { path: 'Sample/sample-s01e01.mkv', size: 9000 },
      { path: 'Season 1/Show.S01E01.1080p.mkv', size: 500000 },
      { path: 'Season 1/Show.S01E02.1080p.mkv', size: 510000 },
    ],
    'Show.S01.Pack',
  );

  // Episódio correto (S01E01 -> índice 2)
  const validEp = mod.inspectTorrent(pack.torrentBytes, pack.hash, 2, {
    observedFileBytes: 500000,
    season: 1,
    episode: 1,
    seasonPack: true,
  });
  assert.equal(validEp.status, 'valid');
  assert.equal(validEp.episodeMatches, true);

  // Outro episódio selecionado (índice 3 é S01E02 quando S01E01 foi pedido) -> invalid
  assert.throws(
    () =>
      mod.inspectTorrent(pack.torrentBytes, pack.hash, 3, {
        season: 1,
        episode: 1,
        seasonPack: true,
      }),
    /não é o episódio pedido/,
  );

  // Múltiplos candidatos para o mesmo episódio -> inconclusive (não atribui arbitrariamente nem reprova como outro episódio)
  const ambiguousPack = buildTorrentBuffer(
    [
      { path: 'Show.S01E01.Dublado.mkv', size: 400000 },
      { path: 'Show.S01E01.Legendado.mkv', size: 400000 },
    ],
    'Show.S01.DualPack',
  );
  const ambiguousResult = mod.inspectTorrent(ambiguousPack.torrentBytes, ambiguousPack.hash, 0, {
    season: 1,
    episode: 1,
    seasonPack: true,
  });
  assert.equal(ambiguousResult.status, 'inconclusive');
  assert.equal(ambiguousResult.episodeMatches, null);
  assert.match(ambiguousResult.reason, /ambíguos/i);

  // Seleção de arquivo auxiliar (.srt no índice 0 ou sample no índice 1) -> invalid
  assert.throws(() => mod.inspectTorrent(pack.torrentBytes, pack.hash, 0), /não corresponde a vídeo/);
  assert.throws(() => mod.inspectTorrent(pack.torrentBytes, pack.hash, 1), /não corresponde a vídeo/);

  // Índice inexistente -> invalid
  assert.throws(() => mod.inspectTorrent(pack.torrentBytes, pack.hash, 99), /índice inexistente/i);

  // Divergência de tamanho entre o observado no app e o .torrent -> invalid
  assert.throws(
    () => mod.inspectTorrent(pack.torrentBytes, pack.hash, 2, { observedFileBytes: 999999 }),
    /Tamanho observado no app/,
  );

  // Hash divergente, HTML, truncado, inteiro inválido (i03e, i-0e) e limites de tamanho/profundidade -> invalid
  assert.throws(() => mod.inspectTorrent(pack.torrentBytes, '0'.repeat(40), 2), /infoHash diverge/);
  assert.throws(() => mod.inspectTorrent(Buffer.from('<!DOCTYPE html><html></html>'), pack.hash), /HTML/);
  assert.throws(() => mod.inspectTorrent(pack.torrentBytes.subarray(0, 20), pack.hash), /truncad[ao]/i);
  assert.throws(() => mod.inspectTorrent(Buffer.from('d4:infod6:lengthi03e4:name5:a.mkvee'), pack.hash), /Inteiro bencode inválido/);
  assert.throws(() => mod.inspectTorrent(Buffer.from('d4:infod6:lengthi-0e4:name5:a.mkvee'), pack.hash), /Inteiro bencode inválido/);
  assert.throws(
    () => mod.inspectTorrent(pack.torrentBytes, pack.hash, 2, { maxBytes: 10 }),
    /excede o limite/,
  );
  const deepBencode = Buffer.from(`${'l'.repeat(35)}${'e'.repeat(35)}`);
  assert.throws(() => mod.inspectTorrent(deepBencode, pack.hash), /profundo demais/i);
});

test('1.1, 1.3 e 1.4: valida argumentos, caminhos com espaços, janelas/processos, sanitização e códigos de saída', async () => {
  // Argumentos inválidos
  assert.throws(() => mod.parseCliArgs(['positional']), /Argumento posicional/);
  assert.throws(() => mod.parseCliArgs(['--unknown-flag']), /Flag desconhecida/);
  assert.throws(() => mod.parseCliArgs(['--device']), /exige um valor/);
  assert.throws(
    () => mod.resolveAndValidateOptions({ device: '', provider: 'betor', app: 'mobile', scenario: '1-filme' }),
    /Aparelho inválido/,
  );
  assert.throws(
    () =>
      mod.resolveAndValidateOptions({
        device: 'SERIAL1',
        provider: 'betor',
        app: 'mobile',
        scenario: '1-filme',
        season: 1,
        episode: 1,
      }),
    /filme não aceita/,
  );

  // Saídas ficam sob test/artifacts/ e destinos externos são rejeitados
  const artifactsRoot = path.join(__dirname, 'artifacts');
  const defaults = mod.resolveAndValidateOptions({
    device: 'SERIAL1',
    provider: 'betor',
    app: 'mobile',
    scenario: '1-filme',
  });
  assert.ok(defaults.outBaseDir.startsWith(artifactsRoot + path.sep));
  assert.throws(
    () =>
      mod.resolveAndValidateOptions({
        device: 'SERIAL1',
        provider: 'betor',
        app: 'mobile',
        scenario: '1-filme',
        outDir: path.join(__dirname, '..', 'scratch', 'fora'),
      }),
    /dentro de test\/artifacts/,
  );

  // Sanitização de URLs assinadas e tokens
  const dirtyText =
    'Erro ao abrir https://cdn.example.com/video.mp4?token=secret123&sig=abc com Authorization: Bearer my-jwt-token e api_key=xyz987';
  const cleanText = mod.sanitizeText(dirtyText);
  assert.ok(!cleanText.includes('secret123'));
  assert.ok(!cleanText.includes('my-jwt-token'));
  assert.ok(!cleanText.includes('xyz987'));
  assert.ok(!cleanText.includes('https://cdn.example.com'));

  // Códigos de saída por dimensão
  assert.equal(
    mod.computeExitCode({
      navigation: 'passed',
      resultValidity: 'valid',
      infrastructure: { status: 'ok', errors: [] },
    }),
    mod.EXIT_CODES.OK,
  );
  assert.equal(
    mod.computeExitCode({
      navigation: 'passed',
      resultValidity: 'inconclusive',
      infrastructure: { status: 'ok', errors: [] },
    }),
    mod.EXIT_CODES.OK,
  );
  assert.equal(
    mod.computeExitCode({
      navigation: 'failed',
      resultValidity: 'inconclusive',
      infrastructure: { status: 'ok', errors: [] },
    }),
    mod.EXIT_CODES.NAVIGATION_FAILED,
  );
  assert.equal(
    mod.computeExitCode({
      navigation: 'passed',
      resultValidity: 'invalid',
      infrastructure: { status: 'ok', errors: [] },
    }),
    mod.EXIT_CODES.INVALID_RESULT,
  );
  assert.equal(
    mod.computeExitCode({
      navigation: 'passed',
      resultValidity: 'valid',
      infrastructure: { status: 'error', errors: ['falha'] },
    }),
    mod.EXIT_CODES.INFRASTRUCTURE_ERROR,
  );

  // Execução de processo controlado com caminhos contendo espaços
  const baseTemp = createTempDir('nuvio val space ');
  try {
    const dirWithSpaces = path.join(baseTemp, 'pasta com espacos');
    fs.mkdirSync(dirWithSpaces, { recursive: true });

    const adbLogFile = path.join(dirWithSpaces, 'adb-calls.txt');
    const logcatPidFile = path.join(dirWithSpaces, 'logcat-pid.txt');
    const fakeAdbPath = path.join(dirWithSpaces, 'fake adb.mjs');
    const fakeMaestroPath = path.join(dirWithSpaces, 'fake maestro.mjs');
    const outDir = path.join(dirWithSpaces, 'saida com espaco');

    fs.writeFileSync(
      fakeAdbPath,
      `
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(adbLogFile)}, args.join(' ') + '\\n');
if (args.includes('package')) {
  process.stdout.write('versionName=0.6.11-beta\\nversionCode=154\\n');
} else if (args.includes('date')) {
  process.stdout.write('100.000\\n');
} else if (args.includes('pidof')) {
  process.stdout.write('4321\\n');
} else if (args.includes('media_session')) {
  process.stdout.write('media_session ok\\n');
} else if (args.includes('logcat')) {
  writeFileSync(${JSON.stringify(logcatPidFile)}, String(process.pid));
  process.stdout.write('101.000 4321 1 I Plugin:gdrive:pobreflixtv getStreams returned: 2 streams\\n');
  process.stdout.write('102.000 4321 1 I NuvioPlayerDiag: prepare begin attempt=1 source=https://signed.example/video.mp4?token=supersecret\\n');
  process.stdout.write('103.000 4321 1 I NuvioPlayerDiag: firstFrame attempt=1 positionMs=0\\n');
  process.stdout.write('103.100 4321 1 I NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=0\\n');
  process.stdout.write('108.500 4321 1 I NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=5400\\n');
  setInterval(() => {}, 1000);
}
`,
    );

    fs.writeFileSync(
      fakeMaestroPath,
      `
process.stdout.write('Maestro passed\\n');
process.exit(0);
`,
    );

    const runnerPath = path.resolve(__dirname, 'maestro/run-provider-validation.mjs');
    const cliRun = spawnSync(
      process.execPath,
      [
        runnerPath,
        '--device',
        'SERIAL_TEST',
        '--provider',
        'pobreflixtv',
        '--app',
        'mobile',
        '--scenario',
        '1-filme',
        '--skip-update',
        '--observe-seconds',
        '1',
        '--pause-settle-ms',
        '10',
        '--port',
        '0',
        '--out-dir',
        outDir,
        '--adb',
        fakeAdbPath,
        '--maestro',
        fakeMaestroPath,
      ],
      { encoding: 'utf8', windowsHide: true },
    );

    assert.equal(cliRun.status, mod.EXIT_CODES.OK, `stderr: ${cliRun.stderr}`);
    const summary = JSON.parse(cliRun.stdout);
    assert.equal(summary.dimensions.navigation, 'passed');
    assert.equal(summary.dimensions.playback, 'confirmed');
    assert.equal(summary.dimensions.resultValidity, 'valid');
    assert.equal(summary.run.appVersion, '0.6.11-beta (154)');
    assert.equal(summary.run.pauseIntervention.applied, true);
    assert.equal(summary.preparation.status, 'ok');
    assert.equal(summary.preparation.formatter, 'prism');
    assert.match(summary.preparation.manifestHash, /^[a-f0-9]{64}$/);
    assert.match(summary.preparation.packageHash, /^[a-f0-9]{64}$/);
    assert.match(summary.preparation.manifestUrl, /^http:\/\/.+\/manifest\.json$/);
    assert.equal(summary.approval.approved, true);
    assert.equal(summary.correlation.currentProcess, true);
    await assert.rejects(fetch(summary.preparation.manifestUrl));
    assert.ok(!JSON.stringify(summary).includes('supersecret'));

    const runFolder = path.join(outDir, summary.run.runId);
    for (const artifact of ['result.json', 'summary.json', 'logcat.txt', 'maestro.txt', 'media-sessions.json']) {
      assert.ok(fs.existsSync(path.join(runFolder, artifact)), `Artefato esperado ausente: ${artifact}`);
    }

    // Confirma que o processo de captura criado pelo executor foi encerrado
    const spawnedLogcatPid = Number(fs.readFileSync(logcatPidFile, 'utf8').trim());
    assert.throws(() => process.kill(spawnedLogcatPid, 0));

    const adbCalls = fs.readFileSync(adbLogFile, 'utf8');
    assert.match(adbCalls, /shell input keyevent 127/);
    assert.match(adbCalls, /shell am force-stop com\.nuvio\.app/);
    assert.ok(!adbCalls.includes('pm clear'));

    // Verifica falha de navegação do Maestro -> NAVIGATION_FAILED (2)
    const failMaestroPath = path.join(dirWithSpaces, 'fail maestro.mjs');
    fs.writeFileSync(failMaestroPath, 'process.exit(1);\n');
    const navFailRun = await mod.runProviderValidation({
      device: 'SERIAL_TEST',
      provider: 'pobreflixtv',
      app: 'mobile',
      scenario: '1-filme',
      skipUpdate: true,
      observeSeconds: 0,
      port: 0,
      outDir,
      adb: fakeAdbPath,
      maestro: failMaestroPath,
    });
    assert.equal(navFailRun.exitCode, mod.EXIT_CODES.NAVIGATION_FAILED);
    assert.equal(navFailRun.summary.dimensions.navigation, 'failed');

    // Verifica saída inválida -> INVALID_RESULT (4)
    const p2pAdbPath = path.join(dirWithSpaces, 'p2p adb.mjs');
    fs.writeFileSync(
      p2pAdbPath,
      `
const args = process.argv.slice(2);
if (args.includes('package')) process.stdout.write('versionName=0.6.11-beta\\nversionCode=154\\n');
else if (args.includes('date')) process.stdout.write('100.000\\n');
else if (args.includes('pidof')) process.stdout.write('4321\\n');
else if (args.includes('logcat')) {
  process.stdout.write('101.000 4321 1 I NuvioP2PDiag: start request=1 phase=accepted hash=abcdef123456 fileIndex=0\\n');
  setInterval(() => {}, 1000);
}
`,
    );
    const invalidResultRun = await mod.runProviderValidation(
      {
        device: 'SERIAL_TEST',
        provider: 'betor',
        app: 'mobile',
        scenario: '1-filme',
        skipUpdate: true,
        observeSeconds: 0,
        fullHash: 'abcdef1234567890abcdef1234567890abcdef12',
        port: 0,
        outDir,
        adb: p2pAdbPath,
        maestro: fakeMaestroPath,
      },
      {
        fetchImpl: async () => new Response('<html>not a torrent</html>', { status: 200 }),
      },
    );
    assert.equal(invalidResultRun.exitCode, mod.EXIT_CODES.INVALID_RESULT);
    assert.equal(invalidResultRun.summary.dimensions.resultValidity, 'invalid');

    // Verifica código de saída para argumentos inválidos no CLI
    const badCli = spawnSync(process.execPath, [runnerPath, '--flag-inexistente'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(badCli.status, mod.EXIT_CODES.INVALID_ARGS);

    // Verifica captura interrompida prematuramente -> INFRASTRUCTURE_ERROR (3) e não confirma reprodução
    const brokenAdbPath = path.join(dirWithSpaces, 'broken adb.mjs');
    fs.writeFileSync(
      brokenAdbPath,
      `
const args = process.argv.slice(2);
if (args.includes('package')) process.stdout.write('versionName=0.6.11-beta\\nversionCode=154\\n');
else if (args.includes('date')) process.stdout.write('100.000\\n');
else if (args.includes('pidof')) process.stdout.write('4321\\n');
else if (args.includes('logcat')) {
  process.stdout.write('103.000 4321 1 I NuvioPlayerDiag: firstFrame attempt=1 positionMs=0\\n');
  process.stdout.write('103.100 4321 1 I NuvioPlayerDiag: isPlaying=true attempt=1 positionMs=0\\n');
  process.stdout.write('108.500 4321 1 I NuvioPlayerDiag: isPlaying=false attempt=1 positionMs=5400\\n');
  process.exit(1);
}
`,
    );

    const interruptedRun = await mod.runProviderValidation({
      device: 'SERIAL_TEST',
      provider: 'pobreflixtv',
      app: 'mobile',
      scenario: '1-filme',
      skipUpdate: true,
      observeSeconds: 0,
      port: 0,
      outDir,
      adb: brokenAdbPath,
      maestro: fakeMaestroPath,
    });
    assert.equal(interruptedRun.exitCode, mod.EXIT_CODES.INFRASTRUCTURE_ERROR);
    assert.equal(interruptedRun.summary.infrastructure.status, 'error');
    assert.equal(interruptedRun.summary.dimensions.playback, 'inconclusive');

    // Verifica timeout do Maestro -> INFRASTRUCTURE_ERROR (3) e processo encerrado
    const slowMaestroPath = path.join(dirWithSpaces, 'slow maestro.mjs');
    fs.writeFileSync(slowMaestroPath, 'setInterval(() => {}, 1000);\n');
    const timeoutRun = await mod.runProviderValidation({
      device: 'SERIAL_TEST',
      provider: 'pobreflixtv',
      app: 'mobile',
      scenario: '1-filme',
      skipUpdate: true,
      observeSeconds: 0,
      maestroTimeoutMs: 150,
      port: 0,
      outDir,
      adb: fakeAdbPath,
      maestro: slowMaestroPath,
    });
    assert.equal(timeoutRun.exitCode, mod.EXIT_CODES.INFRASTRUCTURE_ERROR);
    assert.equal(timeoutRun.summary.dimensions.navigation, 'failed');
    assert.ok(timeoutRun.summary.infrastructure.errors.some((e) => e.includes('Maestro excedeu')));
  } finally {
    fs.rmSync(baseTemp, { recursive: true, force: true });
  }
});

test('falha de preparação bloqueia navegação e grava relatório de infraestrutura', async (t) => {
  const dir = createTempDir('preparation-failure-');
  const failureOut = path.join(dir, 'runs');
  const adbMarker = path.join(dir, 'adb-called.txt');
  const maestroMarker = path.join(dir, 'maestro-called.txt');
  const fakeAdbPath = path.join(dir, 'fake adb.mjs');
  const fakeMaestroPath = path.join(dir, 'fake maestro.mjs');
  fs.writeFileSync(fakeAdbPath, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(adbMarker)}, 'x');\n`);
  fs.writeFileSync(fakeMaestroPath, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(maestroMarker)}, 'x');\n`);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const runnerPath = path.resolve(__dirname, 'maestro/run-provider-validation.mjs');
  const cliRun = spawnSync(
    process.execPath,
    [
      runnerPath,
      '--device',
      'SERIAL_TEST',
      '--provider',
      'betor',
      '--app',
      'mobile',
      '--scenario',
      '1-filme',
      '--format',
      'auto',
      '--port',
      '0',
      '--out-dir',
      failureOut,
      '--adb',
      fakeAdbPath,
      '--maestro',
      fakeMaestroPath,
    ],
    { encoding: 'utf8', windowsHide: true },
  );

  assert.equal(cliRun.status, mod.EXIT_CODES.INFRASTRUCTURE_ERROR, `stderr: ${cliRun.stderr}`);
  const summary = JSON.parse(cliRun.stdout);
  assert.equal(summary.preparation.status, 'error');
  assert.ok(summary.preparation.errors.some((error) => error.includes('formato desconhecido')));
  assert.equal(summary.dimensions.navigation, 'failed');
  assert.equal(fs.existsSync(adbMarker), false);
  assert.equal(fs.existsSync(maestroMarker), false);

  const runFolder = fs.readdirSync(failureOut).map((name) => path.join(failureOut, name))[0];
  const report = JSON.parse(fs.readFileSync(path.join(runFolder, 'result.json'), 'utf8'));
  assert.equal(report.exitCode, mod.EXIT_CODES.INFRASTRUCTURE_ERROR);
  assert.equal(report.preparation.status, 'error');
});

test('3.4: ausência exige getStreams concluído com zero streams e sem erro fatal', () => {
  const line = (time, message, pid = 123) => `${time}.000 ${pid} 1 I ${message}`;
  const zero = [
    line(100, 'Plugin:prism:betor getStreams returned: 0 streams'),
  ].join('\n');
  assert.deepEqual(mod.analyzeProviderAbsence(zero, { pid: 123, providerId: 'betor', providerName: 'BeTor' }), {
    status: 'valid',
    reason: 'empty',
    streamCount: 0,
    errors: [],
    emptyStateConfirmed: false,
  });

  assert.deepEqual(
    mod.analyzeProviderAbsence('', { pid: 123, providerId: 'betor', emptyStateConfirmed: true }),
    {
      status: 'valid',
      reason: 'empty_ui_confirmed',
      streamCount: 0,
      errors: [],
      emptyStateConfirmed: true,
    },
  );

  const returned = line(100, 'Plugin:prism:betor getStreams returned: 2 streams');
  assert.equal(mod.analyzeProviderAbsence(returned, { pid: 123, providerId: 'betor' }).status, 'invalid');
  assert.equal(mod.analyzeProviderAbsence(returned, { pid: 123, providerId: 'betor' }).reason, 'streams_returned');

  const incomplete = line(100, 'Plugin:prism:betor search start');
  assert.deepEqual(mod.analyzeProviderAbsence(incomplete, { pid: 123, providerId: 'betor' }), {
    status: 'inconclusive',
    reason: 'incomplete_search',
    streamCount: null,
    errors: [],
    emptyStateConfirmed: false,
  });

  const fatal = [
    line(100, 'Plugin:prism:betor getStreams failed: HTTP 500'),
    line(101, 'Plugin:prism:betor getStreams returned: 0 streams'),
  ].join('\n');
  const fatalResult = mod.analyzeProviderAbsence(fatal, { pid: 123, providerId: 'betor' });
  assert.equal(fatalResult.status, 'invalid');
  assert.equal(fatalResult.reason, 'fatal_error');
  assert.equal(fatalResult.errors.length, 1);

  const otherPid = line(100, 'Plugin:prism:betor getStreams returned: 0 streams', 999);
  assert.equal(mod.analyzeProviderAbsence(otherPid, { pid: 123, providerId: 'betor' }).reason, 'incomplete_search');
});

test('4.1: aprovação explícita distingue positivo, negativo e inconclusivo', () => {
  const preparation = { status: 'ok' };
  const infrastructure = { status: 'ok', errors: [] };
  assert.deepEqual(
    mod.approveScenario({
      expectedResult: 'streams',
      dimensions: { navigation: 'passed', resultValidity: 'valid', playback: 'confirmed' },
      infrastructure,
      preparation,
      correlation: { currentProcess: true },
    }),
    { approved: true, reasons: [] },
  );
  assert.equal(
    mod.approveScenario({
      expectedResult: 'streams',
      dimensions: { navigation: 'passed', resultValidity: 'valid', playback: 'inconclusive' },
      infrastructure,
      preparation,
      correlation: { currentProcess: true },
    }).approved,
    false,
  );
  assert.equal(
    mod.approveScenario({
      expectedResult: 'empty',
      dimensions: { navigation: 'passed', resultValidity: 'valid', playback: 'not_applicable' },
      infrastructure,
      preparation,
      correlation: { currentProcess: true },
    }).approved,
    true,
  );
  assert.equal(
    mod.approveScenario({
      expectedResult: 'empty',
      dimensions: { navigation: 'passed', resultValidity: 'inconclusive', playback: 'not_applicable' },
      infrastructure,
      preparation,
      correlation: { currentProcess: true },
    }).approved,
    false,
  );
  assert.equal(
    mod.approveScenario({
      expectedResult: 'streams',
      dimensions: { navigation: 'passed', resultValidity: 'valid', playback: 'confirmed' },
      infrastructure,
      preparation,
      correlation: { currentProcess: false, evidencePid: '999' },
    }).approved,
    false,
  );

  const negative = { approved: true, reasons: [] };
  assert.equal(
    mod.computeScenarioExitCode({
      approval: negative,
      dimensions: { navigation: 'passed', resultValidity: 'valid', playback: 'not_applicable' },
      infrastructure,
    }),
    mod.EXIT_CODES.OK,
  );
  assert.equal(
    mod.computeScenarioExitCode({
      approval: { approved: false, reasons: ['reprodução não confirmada'] },
      dimensions: { navigation: 'passed', resultValidity: 'valid', playback: 'inconclusive' },
      infrastructure,
    }),
    mod.EXIT_CODES.INCONCLUSIVE,
  );
  assert.equal(
    mod.computeScenarioExitCode({
      approval: { approved: false, reasons: [] },
      dimensions: { navigation: 'passed', resultValidity: 'invalid', playback: 'inconclusive' },
      infrastructure,
    }),
    mod.EXIT_CODES.INVALID_RESULT,
  );
});

test('3.4: execução negativa comprova zero, erro, busca incompleta e streams inesperados', async (t) => {
  const base = createTempDir('negative-runs-');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  async function runNegative(label, logLines) {
    const dir = path.join(base, label);
    fs.mkdirSync(dir, { recursive: true });
    const fakeAdb = path.join(dir, 'adb.mjs');
    const fakeMaestro = path.join(dir, 'maestro.mjs');
    const outDir = path.join(dir, 'runs');
    fs.writeFileSync(fakeMaestro, 'process.exit(0);\n');
    fs.writeFileSync(
      fakeAdb,
      `
const args = process.argv.slice(2);
if (args.includes('package')) process.stdout.write('versionName=0.6.11-beta\\nversionCode=154\\n');
else if (args.includes('date')) process.stdout.write('100.000\\n');
else if (args.includes('pidof')) process.stdout.write('4321\\n');
else if (args.includes('media_session')) process.stdout.write('media_session ok\\n');
else if (args.includes('logcat')) {
  for (const line of ${JSON.stringify(logLines)}) process.stdout.write(line + '\\n');
  setInterval(() => {}, 1000);
}
`,
    );
    const result = await mod.runProviderValidation({
      device: 'SERIAL_TEST',
      provider: 'betor',
      app: 'mobile',
      scenario: '4-ausencia',
      skipUpdate: true,
      observeSeconds: 0,
      port: 0,
      outDir,
      adb: fakeAdb,
      maestro: fakeMaestro,
    });
    return result;
  }

  const zero = await runNegative('zero', ['101.000 4321 1 I Plugin:prism:betor getStreams returned: 0 streams']);
  assert.equal(zero.exitCode, mod.EXIT_CODES.OK);
  assert.equal(zero.summary.dimensions.playback, 'not_applicable');
  assert.equal(zero.summary.dimensions.resultValidity, 'valid');
  assert.equal(zero.summary.approval.approved, true);

  const streams = await runNegative('streams', ['101.000 4321 1 I Plugin:prism:betor getStreams returned: 2 streams']);
  assert.equal(streams.exitCode, mod.EXIT_CODES.INVALID_RESULT);
  assert.equal(streams.summary.absence.reason, 'streams_returned');

  const incomplete = await runNegative('incomplete', ['101.000 4321 1 I Plugin:prism:betor search start']);
  assert.equal(incomplete.exitCode, mod.EXIT_CODES.INCONCLUSIVE);
  assert.equal(incomplete.summary.absence.reason, 'incomplete_search');

  const fatal = await runNegative('fatal', [
    '101.000 4321 1 I Plugin:prism:betor getStreams failed: HTTP 500',
    '102.000 4321 1 I Plugin:prism:betor getStreams returned: 0 streams',
  ]);
  assert.equal(fatal.exitCode, mod.EXIT_CODES.INVALID_RESULT);
  assert.equal(fatal.summary.absence.reason, 'fatal_error');
});

test('Replays das execuções reais da POC (evidence.json)', () => {
  const activeEvidencePath = path.resolve(
    __dirname,
    '../openspec/changes/add-provider-playback-validation/poc/evidence.json',
  );
  const archivedEvidencePath = path.resolve(
    __dirname,
    '../openspec/changes/archive/2026-11-10-add-provider-playback-validation/poc/evidence.json',
  );
  const evidencePath = fs.existsSync(activeEvidencePath) ? activeEvidencePath : archivedEvidencePath;
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  for (const item of evidence.cases) {
    const replay = mod.analyze(item.log, {
      pid: item.pid,
      maestroExit: 0,
      app: item.app,
    });
    assert.equal(replay.playback, item.expectedPlayback, `caso ${item.id}`);
    assert.equal(item.metadata.status, 'valid', `metadados do caso ${item.id}`);
    if (item.id === 'pack-no-seeds') {
      assert.equal(item.peerSamples.maxSeeds, 0);
      assert.equal(item.peerSamples.maxPayloadBytes, 0);
      assert.equal(item.metadata.episodeMatches, true);
      assert.equal(replay.evidence.requestedIndex, 0);
      assert.equal(replay.evidence.fileIndex, null);
    }
  }
});
