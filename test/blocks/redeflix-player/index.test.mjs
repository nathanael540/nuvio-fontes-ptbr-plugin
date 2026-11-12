import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestedPath, probeMedia } from '../../../src/_blocks/redeflix-player/index.mjs';

test('caminho canônico preserva TMDB e coordenadas', () => {
  assert.equal(buildRequestedPath('550', 'movie', null, null), '/filme/550');
  assert.equal(buildRequestedPath('1396', 'tv', 2, 3), '/serie/1396/2/3');
});

test('sonda compartilhada preserva tamanho, faixa e cancelamento sem ler corpo', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const samples = [[924002405, '0.9 GB'], [245684822, '234.3 MB'], [512000, '500.0 KB'], [512, '512 B']];
  for (const [bytes, size] of samples) {
    let signal;
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://storage.example/video.mp4');
      assert.equal(init.headers.Range, 'bytes=0-0');
      signal = init.signal;
      return {
        status: 206,
        headers: new Headers({ 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-0/${bytes}` }),
        text: () => assert.fail('não deve ler corpo'),
        arrayBuffer: () => assert.fail('não deve ler corpo'),
      };
    };
    assert.deepEqual(await probeMedia('https://storage.example/video.mp4'), { totalBytes: bytes, size });
    assert.equal(signal.aborted, true);
  }
});

test('sonda propaga rede e rejeita respostas sem prova de vídeo parcial', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error('rede indisponível'); };
  await assert.rejects(probeMedia('https://storage.example/video.mp4'), /rede indisponível/);
  for (const [status, type, range, error] of [
    [200, 'video/mp4', 'bytes 0-0/100', /esperado 206/],
    [206, 'text/html', 'bytes 0-0/100', /não é vídeo/],
    [206, 'video/mp4', 'bytes 0-0/*', /Content-Range inválido/],
  ]) {
    globalThis.fetch = async () => ({ status, headers: new Headers({ 'Content-Type': type, 'Content-Range': range }) });
    await assert.rejects(probeMedia('https://storage.example/video.mp4'), error);
  }
});

test('sonda opcional confere assinatura MP4 sem alterar a sonda padrão', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const bytes = new Uint8Array(64);
  bytes.set([0, 0, 0, 32, 102, 116, 121, 112]);
  let signature = bytes.buffer;
  let signal;
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers.Range, 'bytes=0-63');
    signal = init.signal;
    return {
      status: 206,
      headers: new Headers({ 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-63/924002405' }),
      arrayBuffer: async () => { assert.equal(signal.aborted, false); return signature; },
    };
  };
  assert.equal((await probeMedia('https://storage.example/video.mp4', { verifySignature: true })).size, '0.9 GB');
  assert.equal(signal.aborted, true);
  signature = new ArrayBuffer(64);
  await assert.rejects(probeMedia('https://storage.example/video.mp4', { verifySignature: true }), /Assinatura ftyp/);
  assert.equal(signal.aborted, true);
});
