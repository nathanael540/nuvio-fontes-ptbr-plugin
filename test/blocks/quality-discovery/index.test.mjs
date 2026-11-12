import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverQuality, normalizeQuality, UNKNOWN_QUALITY } from '../../../src/_blocks/quality-discovery/index.mjs';

test('UNKNOWN_QUALITY é o sentinela de qualidade desconhecida', () => {
  assert.equal(UNKNOWN_QUALITY, 'Desconhecida');
});

// --- normalizeQuality ---

const QUALITY_CASES = [
  [1080, '1080p'],
  [720, '720p'],
  [2160, '4K'],
  [480, '480p'],
  [800, '800p'],
  [1038, '1038p'],
  ['1080p', '1080p'],
  ['720P', '720p'],
  ['  Full HD 1080p  ', '1080p'],
  ['WEB-DL 1080p x264', '1080p'],
  ['Duna 2024 1080p', '1080p'],
  ['1080', '1080p'],
  ['1440', '1440p'],
  ['144', '144p'],
  ['2160', '4K'],
  ['Duna 2024 1080', '1080p'],
  ['4k', '4K'],
  ['UHD', '4K'],
  ['fhd', '1080p'],
  ['FullHD', '1080p'],
  ['Full HD', '1080p'],
  ['CAM', 'CAM'],
  ['ts', 'CAM'],
  ['HDCAM', 'CAM'],
  ['HDTS', 'CAM'],
  ['Telesync', 'CAM'],
  ['HD', '720p'],
  ['sd', '480p'],
];

for (const [input, expected] of QUALITY_CASES) {
  test(`normalizeQuality(${JSON.stringify(input)}) === "${expected}"`, () => {
    assert.equal(normalizeQuality(input), expected);
  });
}

for (const input of [undefined, null, '', 'alta', '1080i', 'x264', '12', '800', 'HDTV', 'Duna 2024', 12345, 12, 1080.5, NaN, {}]) {
  test(`normalizeQuality lança erro citando o valor: ${String(input)}`, () => {
    assert.throws(() => normalizeQuality(input), (error) => {
      assert.match(error.message, /^Qualidade não reconhecida: /);
      assert.ok(error.message.includes(typeof input === 'string' ? `"${input}"` : String(input)));
      return true;
    });
  });
}

// --- discoverQuality ---

const DISCOVERY_CASES = [
  [['1080p'], '1080p'],
  [['WEB-DL 720p x264'], '720p'],
  [['4K HDR'], '4K'],
  [['CAM'], 'CAM'],
  [['CAMRIP'], 'CAM'],
  [['HDCAM'], 'CAM'],
  [['HDTS'], 'CAM'],
  [['HD-TS'], 'CAM'],
  [['TS'], 'CAM'],
  [['TELESYNC'], 'CAM'],
  [['DOWNLOAD DUBLADO MP4720P'], '720p'],
  [['MKV1080P'], '1080p'],
  [['Duna 2024 1080'], '1080p'],
  [['1080p CAM'], 'CAM'],
  [['CAM CINEMA 1080P'], 'CAM'],
  [[null, undefined, '', '720p'], '720p'],
];

for (const [texts, expected] of DISCOVERY_CASES) {
  test(`discoverQuality(${JSON.stringify(texts)}) === "${expected}"`, () => {
    assert.equal(discoverQuality(texts), expected);
  });
}

test('discoverQuality percorre os textos na ordem recebida', () => {
  assert.equal(discoverQuality(['Matrix.1999.720p', 'Matrix.1999.1080p']), '720p');
  assert.equal(discoverQuality(['sem qualidade', 'Matrix.1999.1080p']), '1080p');
});

test('discoverQuality devolve Desconhecida quando nenhum texto informa qualidade', () => {
  assert.equal(discoverQuality(['Matrix.1999', 'Duna 2024']), UNKNOWN_QUALITY);
  assert.equal(discoverQuality([]), UNKNOWN_QUALITY);
  assert.equal(discoverQuality([null, undefined, '  ']), UNKNOWN_QUALITY);
});

test('discoverQuality lança erro fora do formato de lista', () => {
  for (const value of [undefined, null, '1080p', {}, 1080]) {
    assert.throws(() => discoverQuality(value), /texts deve ser lista/);
  }
});

test('discoverQuality lança erro com item que não é texto, null ou undefined', () => {
  for (const value of [1080, {}, [], true]) {
    assert.throws(() => discoverQuality(['1080p', value]), /texts deve conter texto, null ou undefined/);
  }
});
