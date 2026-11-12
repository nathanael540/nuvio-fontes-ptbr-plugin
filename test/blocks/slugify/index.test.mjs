import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeText, slugify } from '../../../src/_blocks/slugify/index.mjs';

const NORMALIZE_CASES = [
  { input: 'Duna: Parte Dois', expected: 'duna parte dois' },
  { input: 'Velozes & Furiosos 9', expected: 'velozes e furiosos 9' },
  { input: 'Pokémon: O Filme', expected: 'pokemon o filme' },
  { input: '  Ação!!! ', expected: 'acao' },
  { input: "Ocean's Eleven - Façam suas Apostas", expected: 'ocean s eleven facam suas apostas' },
  { input: '사랑의 불시착', expected: '' },
  { input: '', expected: '' },
];

for (const { input, expected } of NORMALIZE_CASES) {
  test(`normalizeText: "${input}" vira "${expected}"`, () => {
    assert.equal(normalizeText(input), expected);
  });
}

const SLUG_CASES = [
  { input: 'Duna: Parte Dois', options: undefined, expected: 'duna-parte-dois' },
  { input: 'Duna: Parte Dois', options: {}, expected: 'duna-parte-dois' },
  { input: 'Duna: Parte Dois', options: { separator: '_' }, expected: 'duna_parte_dois' },
  { input: 'Duna: Parte Dois', options: { separator: '+' }, expected: 'duna+parte+dois' },
  { input: 'Duna: Parte Dois', options: { separator: '$&' }, expected: 'duna$&parte$&dois' },
  { input: 'Velozes & Furiosos 9', options: undefined, expected: 'velozes-e-furiosos-9' },
  { input: '  Ação!!! ', options: undefined, expected: 'acao' },
];

for (const { input, options, expected } of SLUG_CASES) {
  test(`slugify: "${input}" com ${JSON.stringify(options)} vira "${expected}"`, () => {
    assert.equal(slugify(input, options), expected);
  });
}

const NON_STRING_INPUTS = [undefined, null, 42, {}, ['Duna']];

for (const input of NON_STRING_INPUTS) {
  test(`lança erro para entrada não string: ${JSON.stringify(input)}`, () => {
    assert.throws(() => normalizeText(input), /normalizeText espera uma string/);
    assert.throws(() => slugify(input), /normalizeText espera uma string/);
  });
}

test('slugify lança erro quando o texto não tem letras latinas nem números', () => {
  assert.throws(
    () => slugify('사랑의 불시착'),
    /Não foi possível gerar slug de "사랑의 불시착": o texto não tem letras latinas nem números/,
  );
});

const INVALID_SEPARATORS = ['', null, 1, ['-']];

for (const separator of INVALID_SEPARATORS) {
  test(`slugify lança erro para separator inválido: ${JSON.stringify(separator)}`, () => {
    assert.throws(() => slugify('Duna', { separator }), /separator inválido/);
  });
}
