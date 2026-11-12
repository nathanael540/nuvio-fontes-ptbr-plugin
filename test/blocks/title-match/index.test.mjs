import test from 'node:test';
import assert from 'node:assert/strict';

import { findBestMatch, titleSimilarity } from '../../../src/_blocks/title-match/index.mjs';

const EXACT_SIMILARITY_CASES = [
  { a: 'Duna: Parte Dois', b: 'duna parte dois', expected: 1 },
  { a: 'Homem-Aranha', b: 'Homem Aranha', expected: 1 },
  { a: 'Pokémon', b: 'POKEMON', expected: 1 },
  { a: '사랑의 불시착', b: '  사랑의 불시착 ', expected: 1 },
  { a: '사랑의 불시착', b: '오징어 게임', expected: 0 },
  { a: '사랑의 불시착', b: 'Pousando no Amor', expected: 0 },
  { a: '', b: '', expected: 0 },
  { a: '!!!', b: '!!!', expected: 1 },
  { a: 'A', b: 'a', expected: 1 },
  { a: 'A', b: 'B', expected: 0 },
  { a: 'A', b: 'Ab', expected: 0 },
];

for (const { a, b, expected } of EXACT_SIMILARITY_CASES) {
  test(`titleSimilarity: "${a}" e "${b}" valem ${expected}`, () => {
    assert.equal(titleSimilarity(a, b), expected);
  });
}

const RANGE_SIMILARITY_CASES = [
  { a: 'Duna Parte Dois', b: 'Duna Parte 2', min: 0.6, max: 0.95 },
  { a: 'Duna', b: 'Titanic', min: 0, max: 0.2 },
];

for (const { a, b, min, max } of RANGE_SIMILARITY_CASES) {
  test(`titleSimilarity: "${a}" e "${b}" ficam entre ${min} e ${max}`, () => {
    const score = titleSimilarity(a, b);
    assert.ok(score >= min && score < max, `score ${score} fora do intervalo`);
  });
}

test('titleSimilarity: é simétrica e conta bigramas repetidos como multiconjunto', () => {
  assert.equal(titleSimilarity('aaaa', 'aa'), titleSimilarity('aa', 'aaaa'));
  // "aaaa" tem 3 bigramas "aa" e "aa" tem 1: 2 * 1 / (3 + 1).
  assert.equal(titleSimilarity('aaaa', 'aa'), 0.5);
});

const NON_STRING_PAIRS = [
  [undefined, 'Duna'],
  ['Duna', null],
  [42, 'Duna'],
  ['Duna', ['Duna']],
];

for (const [a, b] of NON_STRING_PAIRS) {
  test(`titleSimilarity: lança erro com ${typeof a} e ${typeof b}`, () => {
    assert.throws(() => titleSimilarity(a, b), /titleSimilarity espera duas strings/);
  });
}

const DUNE = {
  title: 'Duna: Parte Dois',
  originalTitle: 'Dune: Part Two',
  alternativeTitles: ['Duna 2'],
  year: 2024,
};

const PICK_CASES = [
  {
    name: 'escolhe pelo título PT-BR',
    candidates: [{ title: 'Duna', year: 2021 }, { title: 'Duna - Parte Dois', year: 2024 }],
    media: DUNE,
    options: undefined,
    expectedIndex: 1,
  },
  {
    name: 'escolhe pelo título original',
    candidates: [{ title: 'Dune', year: 2021 }, { title: 'Dune Part Two', year: 2024 }],
    media: DUNE,
    options: undefined,
    expectedIndex: 1,
  },
  {
    name: 'escolhe pelo título alternativo',
    candidates: [{ title: 'Duna 1', year: 2024 }, { title: 'DUNA 2', year: 2024 }],
    media: DUNE,
    options: undefined,
    expectedIndex: 1,
  },
  {
    name: 'descarta ano fora da tolerância',
    candidates: [{ title: 'Duna: Parte Dois', year: 2019 }, { title: 'Duna Parte Dois', year: 2025 }],
    media: DUNE,
    options: undefined,
    expectedIndex: 1,
  },
  {
    name: 'não descarta candidato sem ano',
    candidates: [{ title: 'Duna: Parte Dois', year: 2010 }, { title: 'Duna: Parte Dois' }],
    media: DUNE,
    options: undefined,
    expectedIndex: 1,
  },
  {
    name: 'não descarta por ano quando media não tem ano',
    candidates: [{ title: 'Duna: Parte Dois', year: 1990 }],
    media: { title: 'Duna: Parte Dois', year: null },
    options: undefined,
    expectedIndex: 0,
  },
  {
    name: 'aceita ano em string de 4 dígitos',
    candidates: [{ title: 'Duna: Parte Dois', year: '2010' }, { title: 'Duna: Parte Dois', year: '2024' }],
    media: DUNE,
    options: undefined,
    expectedIndex: 1,
  },
  {
    name: 'no empate de score, prefere o ano exato',
    candidates: [
      { title: 'Duna: Parte Dois', year: 2023 },
      { title: 'Duna: Parte Dois', year: null },
      { title: 'Duna: Parte Dois', year: 2024 },
    ],
    media: DUNE,
    options: undefined,
    expectedIndex: 2,
  },
  {
    name: 'persistindo o empate, prefere o primeiro do array',
    candidates: [
      { title: 'Duna: Parte Dois', year: 2024, id: 'a' },
      { title: 'Duna: Parte Dois', year: 2024, id: 'b' },
    ],
    media: DUNE,
    options: undefined,
    expectedIndex: 0,
  },
  {
    name: 'score maior vence ano exato',
    candidates: [{ title: 'Duna Parte Dois Estendido', year: 2024 }, { title: 'Duna: Parte Dois', year: 2025 }],
    media: DUNE,
    options: { minScore: 0.5 },
    expectedIndex: 1,
  },
  {
    name: 'minScore customizado aceita título parecido',
    candidates: [{ title: 'Duna Parte 2', year: 2024 }],
    media: { title: 'Duna Parte Dois', year: 2024 },
    options: { minScore: 0.6 },
    expectedIndex: 0,
  },
  {
    name: 'yearTolerance customizado aceita ano mais distante',
    candidates: [{ title: 'Duna: Parte Dois', year: 2027 }],
    media: DUNE,
    options: { yearTolerance: 3 },
    expectedIndex: 0,
  },
];

for (const { name, candidates, media, options, expectedIndex } of PICK_CASES) {
  test(`findBestMatch: ${name}`, () => {
    const result = findBestMatch(candidates, media, options);
    assert.ok(result !== null, 'esperado um candidato');
    assert.equal(result.candidate, candidates[expectedIndex]);
    assert.ok(result.score >= 0 && result.score <= 1);
  });
}

const NO_MATCH_CASES = [
  { name: 'array vazio', candidates: [], media: DUNE, options: undefined },
  { name: 'títulos diferentes', candidates: [{ title: 'Titanic', year: 2024 }], media: DUNE, options: undefined },
  {
    name: 'título parecido abaixo do minScore padrão',
    candidates: [{ title: 'Duna Parte 2', year: 2024 }],
    media: { title: 'Duna Parte Dois', year: 2024 },
    options: undefined,
  },
  {
    name: 'minScore customizado mais rígido',
    candidates: [{ title: 'Duna Parte 2', year: 2024 }],
    media: { title: 'Duna Parte Dois', year: 2024 },
    options: { minScore: 0.95 },
  },
  {
    name: 'yearTolerance 0 descarta ano vizinho',
    candidates: [{ title: 'Duna: Parte Dois', year: 2025 }],
    media: DUNE,
    options: { yearTolerance: 0 },
  },
  {
    name: 'todos fora da tolerância de ano',
    candidates: [{ title: 'Duna: Parte Dois', year: 2021 }, { title: 'Duna: Parte Dois', year: '2027' }],
    media: DUNE,
    options: undefined,
  },
];

for (const { name, candidates, media, options } of NO_MATCH_CASES) {
  test(`findBestMatch: retorna null com ${name}`, () => {
    assert.equal(findBestMatch(candidates, media, options), null);
  });
}

test('findBestMatch: devolve o candidato original por referência, com seus campos, e o score', () => {
  const candidate = { title: 'Duna: Parte Dois', year: 2024, url: '/filme/duna-parte-dois', quality: '1080p' };
  const result = findBestMatch([{ title: 'Duna', year: 2021 }, candidate], DUNE);
  assert.deepEqual(result, { candidate, score: 1 });
  assert.equal(result.candidate, candidate);
});

const ERROR_CASES = [
  { name: 'candidates não array', candidates: { title: 'Duna' }, media: DUNE, options: undefined, error: /candidates inválido/ },
  { name: 'item não objeto', candidates: [{ title: 'Duna' }, 'Duna'], media: DUNE, options: undefined, error: /candidates\[1\] inválido/ },
  { name: 'item null', candidates: [null], media: DUNE, options: undefined, error: /candidates\[0\] inválido/ },
  { name: 'item sem title', candidates: [{ year: 2024 }], media: DUNE, options: undefined, error: /candidates\[0\] inválido/ },
  { name: 'item com title não string', candidates: [{ title: 42 }], media: DUNE, options: undefined, error: /candidates\[0\] inválido/ },
  { name: 'year "abc"', candidates: [{ title: 'Duna', year: 'abc' }], media: DUNE, options: undefined, error: /candidates\[0\]\.year inválido/ },
  { name: 'year 2024.5', candidates: [{ title: 'Duna', year: 2024.5 }], media: DUNE, options: undefined, error: /candidates\[0\]\.year inválido/ },
  { name: 'year "24"', candidates: [{ title: 'Duna', year: '24' }], media: DUNE, options: undefined, error: /candidates\[0\]\.year inválido/ },
  { name: 'media null', candidates: [], media: null, options: undefined, error: /media inválido/ },
  { name: 'media sem title', candidates: [], media: { year: 2024 }, options: undefined, error: /media inválido/ },
  { name: 'originalTitle não string', candidates: [], media: { title: 'Duna', originalTitle: 42 }, options: undefined, error: /media\.originalTitle inválido/ },
  { name: 'alternativeTitles não array', candidates: [], media: { title: 'Duna', alternativeTitles: 'Duna 2' }, options: undefined, error: /media\.alternativeTitles inválido/ },
  { name: 'alternativeTitles com item não string', candidates: [], media: { title: 'Duna', alternativeTitles: ['Duna 2', 2] }, options: undefined, error: /media\.alternativeTitles inválido/ },
  { name: 'media.year inválido', candidates: [], media: { title: 'Duna', year: '2024' }, options: undefined, error: /media\.year inválido/ },
  { name: 'minScore negativo', candidates: [], media: DUNE, options: { minScore: -0.1 }, error: /minScore inválido/ },
  { name: 'minScore acima de 1', candidates: [], media: DUNE, options: { minScore: 1.5 }, error: /minScore inválido/ },
  { name: 'minScore NaN', candidates: [], media: DUNE, options: { minScore: NaN }, error: /minScore inválido/ },
  { name: 'minScore string', candidates: [], media: DUNE, options: { minScore: '0.9' }, error: /minScore inválido/ },
  { name: 'yearTolerance negativo', candidates: [], media: DUNE, options: { yearTolerance: -1 }, error: /yearTolerance inválido/ },
  { name: 'yearTolerance fracionário', candidates: [], media: DUNE, options: { yearTolerance: 1.5 }, error: /yearTolerance inválido/ },
  { name: 'yearTolerance string', candidates: [], media: DUNE, options: { yearTolerance: '1' }, error: /yearTolerance inválido/ },
];

for (const { name, candidates, media, options, error } of ERROR_CASES) {
  test(`findBestMatch: lança erro com ${name}`, () => {
    assert.throws(() => findBestMatch(candidates, media, options), error);
  });
}
