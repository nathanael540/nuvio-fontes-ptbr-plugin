import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGE } from '../../../src/_blocks/language-discovery/index.mjs';
import { filterStreams, readStreamFilters } from '../../../src/_blocks/stream-filter/index.mjs';

const all = { type: 'all', quality: 'all', language: 'all' };
const stream = (overrides) => ({ url: 'https://example.org/video.mp4', quality: '1080p', language: LANGUAGE.DUBBED, ...overrides });

test('níveis de idioma incluem os níveis anteriores', () => {
  const streams = [LANGUAGE.DUBBED, LANGUAGE.SUBTITLED, LANGUAGE.DUBBED_NON_PT_BR, LANGUAGE.SUBTITLED_NON_PT_BR,
    LANGUAGE.NON_PT_BR, LANGUAGE.UNKNOWN].map((language) => stream({ language }));
  for (const [language, count] of [['pt-br', 2], ['pt', 4], ['gringo', 5], ['all', 6]]) {
    assert.deepEqual(filterStreams(streams, { ...all, language }), streams.slice(0, count));
  }
});

test('tipo é exato pelo esquema e qualidade é um piso', () => {
  const streams = ['magnet:?example', 'torrent://example/0', 'http://example.org/video', 'https://example.org/video']
    .map((url) => stream({ url }));
  assert.deepEqual(filterStreams(streams, { ...all, type: 'P2P' }), streams.slice(0, 2));
  assert.deepEqual(filterStreams(streams, { ...all, type: 'HTTP' }), streams.slice(2));
  const qualities = ['CAM', '540p', '720p', 'Desconhecida', '800p', '1080p', '4K', '4320p'];
  const releases = qualities.map((quality) => stream({ quality }));
  assert.strictEqual(filterStreams(releases, all), releases);
  assert.deepEqual(filterStreams(releases, { ...all, quality: '720p' }), [2, 4, 5, 6, 7].map((i) => releases[i]));
  assert.deepEqual(filterStreams(releases, { ...all, quality: '2160p' }), releases.slice(-2));
});

test('combina os eixos, mantém ordem e objetos e pode retornar lista vazia', () => {
  const streams = [stream({ quality: '720p' }), stream({ language: LANGUAGE.NON_PT_BR }), stream({ url: 'magnet:?example' }), stream({ quality: '480p' }), stream({ quality: '4K' })];
  const filters = { type: 'HTTP', quality: '720p', language: 'pt-br' };
  const result = filterStreams(streams, filters);
  assert.equal(result.length, 2);
  assert.strictEqual(result[0], streams[0]);
  assert.strictEqual(result[1], streams[4]);
  assert.deepEqual(filterStreams(streams.slice(1, 4), filters), []);
  assert.deepEqual(filterStreams([], filters), []);
});

test('valida o ID inteiro e aceita prefixos e ID legado', () => {
  const expected = { type: 'HTTP', quality: '720p', language: 'pt-br' };
  assert.deepEqual(readStreamFilters('repo:seekee--http-720p-pt-br', 'seekee'), expected);
  assert.deepEqual(readStreamFilters('hash:repo:seekee--http-720p-pt-br', 'seekee'), expected);
  assert.deepEqual(readStreamFilters('repo:seekee', 'seekee'), all);
  for (const id of ['seekee--x-720p-pt-br', 'seekee--http-721p-pt-br', 'seekee--http-720p-pt-pt', 'seekee--http-720p-pt-br-extra', 'other--all-all-all']) {
    assert.throws(() => readStreamFilters(id, 'seekee'), /ID de manifest inválido/);
  }
});
