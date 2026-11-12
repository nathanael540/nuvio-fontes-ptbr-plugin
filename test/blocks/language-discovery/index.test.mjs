import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGE,
  LANGUAGE_MODES,
  UNKNOWN_LANGUAGE,
  discoverLanguage,
  languageFromTexts,
  normalizeLanguage,
} from '../../../src/_blocks/language-discovery/index.mjs';

test('LANGUAGE possui exatamente os seis valores do design e é imutável', () => {
  assert.equal(Object.isFrozen(LANGUAGE), true);
  assert.equal(Object.isFrozen(LANGUAGE_MODES), true);
  assert.deepEqual(Object.keys(LANGUAGE).sort(), [
    'DUBBED',
    'DUBBED_NON_PT_BR',
    'NON_PT_BR',
    'SUBTITLED',
    'SUBTITLED_NON_PT_BR',
    'UNKNOWN',
  ]);
  assert.deepEqual(LANGUAGE_MODES, [
    'Dublado',
    'Dublado (Não PT-BR?)',
    'Legendado',
    'Legendado (Não PT-BR?)',
    'Não PT-BR',
    'Idioma Desconhecido',
  ]);
  assert.equal(UNKNOWN_LANGUAGE, LANGUAGE.UNKNOWN);
});

const EXACT_ENUM_CASES = {
  [LANGUAGE.DUBBED]: ['Dublado', 'dublado', 'DUBLADO', '  Dublado  '],
  [LANGUAGE.DUBBED_NON_PT_BR]: [
    'Dublado (Não PT-BR?)',
    'DUBLADO (NÃO PT-BR?)',
    'dublado (nao pt-br?)',
    '  Dublado   (Não   PT-BR?)  ',
  ],
  [LANGUAGE.SUBTITLED]: ['Legendado', 'legendado', 'LEGENDADO', '  Legendado  '],
  [LANGUAGE.SUBTITLED_NON_PT_BR]: [
    'Legendado (Não PT-BR?)',
    'LEGENDADO (NÃO PT-BR?)',
    'legendado (nao pt-br?)',
    '  Legendado   (Não   PT-BR?)  ',
  ],
  [LANGUAGE.NON_PT_BR]: ['Não PT-BR', 'NÃO PT-BR', 'nao pt br', '  Não   PT-BR  '],
  [LANGUAGE.UNKNOWN]: ['Idioma Desconhecido', 'IDIOMA DESCONHECIDO', 'idioma desconhecido'],
};

for (const [expected, inputs] of Object.entries(EXACT_ENUM_CASES)) {
  for (const input of inputs) {
    test(`normalizeLanguage("${input}") === "${expected}"`, () => {
      assert.equal(normalizeLanguage(input), expected);
    });
  }
}

test('normalizeLanguage migra rótulos históricos de dialeto desconhecido para os novos sufixos', () => {
  assert.equal(normalizeLanguage('Português (Dialeto Desconhecido)'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('PORTUGUÊS (DIALETO DESCONHECIDO)'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('portugues dialeto desconhecido'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('Legendado (Dialeto Desconhecido)'), LANGUAGE.SUBTITLED_NON_PT_BR);
  assert.equal(normalizeLanguage('LEGENDADO (DIALETO DESCONHECIDO)'), LANGUAGE.SUBTITLED_NON_PT_BR);
  assert.equal(normalizeLanguage('legendado dialeto desconhecido'), LANGUAGE.SUBTITLED_NON_PT_BR);
});

test('normalizeLanguage reconhece convenções comuns de áudio, legenda e idiomas estrangeiros', () => {
  // Dublado (PT-BR por convenção ou explícito)
  assert.equal(normalizeLanguage('dub'), LANGUAGE.DUBBED);
  assert.equal(normalizeLanguage('Dublado PT-BR'), LANGUAGE.DUBBED);
  assert.equal(normalizeLanguage('dubbed'), LANGUAGE.DUBBED);
  assert.equal(normalizeLanguage('Nacional'), LANGUAGE.DUBBED);
  // Áudio brasileiro antes Dual Áudio passa a Dublado
  assert.equal(normalizeLanguage('DUAL ÁUDIO PT-BR'), LANGUAGE.DUBBED);
  assert.equal(normalizeLanguage('DUBLADO DUAL AUDIO'), LANGUAGE.DUBBED);
  // Dual/Tri Áudio em fonte PT-BR: português confirmado sem região comprovada
  assert.equal(normalizeLanguage('Dual Áudio'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('DUAL ÁUDIO 5.1'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('Dual ÁudioHDR'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('Tri Áudio'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('Dublagem'), LANGUAGE.DUBBED);
  assert.equal(normalizeLanguage('Legendagem'), LANGUAGE.SUBTITLED);
  // Prioridade de áudio sobre legenda
  assert.equal(normalizeLanguage('Dublado e Legendado'), LANGUAGE.DUBBED);
  // Legenda estrangeira não vira Legendado
  assert.equal(normalizeLanguage('English sub'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Legendado Inglês'), LANGUAGE.NON_PT_BR);

  // Dublado sem confirmação brasileira (com sufixo)
  assert.equal(normalizeLanguage('Dublado Portugal'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('Dublado PT-PT'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('Dublado Europeu'), LANGUAGE.DUBBED_NON_PT_BR);

  // Legendado (PT-BR por convenção ou explícito)
  assert.equal(normalizeLanguage('leg'), LANGUAGE.SUBTITLED);
  assert.equal(normalizeLanguage('LEG'), LANGUAGE.SUBTITLED);
  assert.equal(normalizeLanguage('sub'), LANGUAGE.SUBTITLED);
  assert.equal(normalizeLanguage('subbed'), LANGUAGE.SUBTITLED);
  assert.equal(normalizeLanguage('Subtitled'), LANGUAGE.SUBTITLED);
  assert.equal(normalizeLanguage('legenda'), LANGUAGE.SUBTITLED);
  assert.equal(normalizeLanguage('Legendado PT-BR'), LANGUAGE.SUBTITLED);
  assert.equal(normalizeLanguage('PT-BR SUB'), LANGUAGE.SUBTITLED);

  // Legendado sem confirmação brasileira (com sufixo)
  assert.equal(normalizeLanguage('Legendado Portugal'), LANGUAGE.SUBTITLED_NON_PT_BR);
  assert.equal(normalizeLanguage('Legendado PT-PT'), LANGUAGE.SUBTITLED_NON_PT_BR);
  assert.equal(normalizeLanguage('Legendado Europeu'), LANGUAGE.SUBTITLED_NON_PT_BR);

  // Idiomas estrangeiros conhecidos viram Não PT-BR
  assert.equal(normalizeLanguage('Inglês'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('English'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Japonês'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Japanese'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Espanhol'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Spanish'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Latino'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Castellano'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Español'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Deutsch'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Français'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Turco'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Tailandês'), LANGUAGE.NON_PT_BR);
  assert.equal(normalizeLanguage('Hindi'), LANGUAGE.NON_PT_BR);
  // Código ISO 639-2 isolado continua sendo idioma, mas "por" dentro de frase não conta.
  assert.equal(normalizeLanguage('por'), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(normalizeLanguage('Filme por Acaso'), null);
});

const INCONCLUSIVE_INPUTS = [
  '',
  '   ',
  'en',
  'und',
  'unk',
  'Áudio Original',
  'constructor',
  // Marcadores regionais sem modalidade não decidem áudio ou legenda
  'PT-BR',
  'pt',
  'br',
  'Brasil',
  // Multiplicidade isolada não prova português nem região
  'dual',
  'DUAL',
  'multi',
  'Multi Audio',
  // Tags técnicas de vídeo/encode não são idioma
  'BR-Rip',
  'BRRip',
  'BDRip',
];

for (const input of INCONCLUSIVE_INPUTS) {
  test(`normalizeLanguage("${input}") retorna null sem bloquear pista seguinte`, () => {
    assert.equal(normalizeLanguage(input), null);
  });
}

for (const input of [undefined, null, 1, ['dub'], {}]) {
  test(`normalizeLanguage lança erro quando não recebe string: ${String(input)}`, () => {
    assert.throws(() => normalizeLanguage(input), /Idioma deve ser texto/);
  });
}

test('languageFromTexts percorre lista na ordem e retorna membro ou null', () => {
  assert.equal(languageFromTexts(['DUBLADA 1080P']), LANGUAGE.DUBBED);
  assert.equal(languageFromTexts(['LEGENDADA 720P']), LANGUAGE.SUBTITLED);
  assert.equal(languageFromTexts(['DUBLADO DUAL AUDIO 1080P']), LANGUAGE.DUBBED);
  assert.equal(languageFromTexts([null, '', 'BR-Rip', 'Dublado PT-BR']), LANGUAGE.DUBBED);
  assert.equal(languageFromTexts([null, '', 'BR-Rip']), null);
  assert.equal(languageFromTexts(['DUAL']), null);
  assert.equal(languageFromTexts(['PT-BR']), null);
  // Texto estrangeiro não anula áudio/legenda em português de outro candidato
  assert.equal(languageFromTexts(['Filme.English.1080p', 'Dublado']), LANGUAGE.DUBBED);
  assert.equal(languageFromTexts(['English sub', 'Legendado']), LANGUAGE.SUBTITLED);
  assert.equal(languageFromTexts(['English']), LANGUAGE.NON_PT_BR);
  assert.equal(languageFromTexts(['Dual Áudio']), LANGUAGE.DUBBED_NON_PT_BR);
  assert.throws(() => languageFromTexts('dub'), /parts deve ser lista/);
});

test('discoverLanguage valida tipos de argumentos', () => {
  assert.throws(() => discoverLanguage({ texts: 'dub' }), /texts deve ser lista/);
  assert.throws(() => discoverLanguage({ codes: 'pt' }), /codes deve ser lista/);
});

test('discoverLanguage não descobre por listas genéricas de códigos', () => {
  assert.equal(discoverLanguage({ codes: ['pt'] }), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({ codes: ['pt', 'en'] }), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({ codes: ['en'] }), LANGUAGE.UNKNOWN);
});

test('discoverLanguage descobre modalidade e aplica convenção PT-BR nos nomes', () => {
  assert.equal(discoverLanguage({ texts: ['Filme.DUBLADO.mkv'] }), LANGUAGE.DUBBED);
  assert.equal(discoverLanguage({ texts: ['Filme.LEGENDADO.mkv'] }), LANGUAGE.SUBTITLED);
  assert.equal(discoverLanguage({ texts: ['DUBLADA'] }), LANGUAGE.DUBBED);
  assert.equal(discoverLanguage({ texts: ['LEGENDADA'] }), LANGUAGE.SUBTITLED);
  assert.equal(discoverLanguage({ texts: ['Filme.PT-BR.DUBLADO.mkv'] }), LANGUAGE.DUBBED);
  assert.equal(discoverLanguage({ texts: ['Filme.Dual.Audio.mkv'] }), LANGUAGE.DUBBED_NON_PT_BR);
  assert.equal(discoverLanguage({ texts: ['Filme.Dual.Audio.PT-BR.mkv'] }), LANGUAGE.DUBBED);
  assert.equal(discoverLanguage({ texts: ['Filme.English.sub.mkv'] }), LANGUAGE.NON_PT_BR);
});

test('discoverLanguage trata casos inconclusivos como Idioma Desconhecido', () => {
  assert.equal(discoverLanguage(), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({}), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({ texts: [] }), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({ texts: [null, undefined, '', '   '] }), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({ texts: ['Filme.2024.PT-BR.mkv'] }), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({ texts: ['Filme.DUAL.mkv'] }), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({ texts: ['Filme.MULTI.mkv'] }), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({ texts: ['Filme.BR-Rip.1080p.mkv'] }), LANGUAGE.UNKNOWN);
  assert.equal(discoverLanguage({ texts: [null, '', 'BR-Rip'] }), LANGUAGE.UNKNOWN);
});

test('discoverLanguage resolve conflitos regionais preservando certeza de português com ressalva em ambas as ordens', () => {
  // Áudio: PT-BR vs PT-PT
  assert.equal(
    discoverLanguage({ texts: ['Filme.DUBLADO.PT-BR.mkv', 'Filme.DUBLADO.PT-PT'] }),
    LANGUAGE.DUBBED_NON_PT_BR,
  );
  assert.equal(
    discoverLanguage({ texts: ['Filme.DUBLADO.PT-PT', 'Filme.DUBLADO.PT-BR.mkv'] }),
    LANGUAGE.DUBBED_NON_PT_BR,
  );

  // Legenda: PT-BR vs PT-PT
  assert.equal(
    discoverLanguage({ texts: ['Filme.LEGENDADO.PT-BR.mkv', 'Filme.LEGENDADO.PT-PT'] }),
    LANGUAGE.SUBTITLED_NON_PT_BR,
  );
  assert.equal(
    discoverLanguage({ texts: ['Filme.LEGENDADO.PT-PT', 'Filme.LEGENDADO.PT-BR.mkv'] }),
    LANGUAGE.SUBTITLED_NON_PT_BR,
  );
});

test('discoverLanguage prioriza áudio português sobre legenda brasileira em ordens invertidas', () => {
  // Áudio português sem região + Legenda brasileira -> Dublado (Não PT-BR?)
  assert.equal(
    discoverLanguage({ texts: ['Filme.DUBLADO.PT-PT.mkv', 'Filme.LEGENDADO.PT-BR'] }),
    LANGUAGE.DUBBED_NON_PT_BR,
  );
  assert.equal(
    discoverLanguage({ texts: ['Filme.LEGENDADO.PT-BR', 'Filme.DUBLADO.PT-PT.mkv'] }),
    LANGUAGE.DUBBED_NON_PT_BR,
  );

  // Áudio brasileiro + Legenda brasileira -> Dublado
  assert.equal(
    discoverLanguage({ texts: ['Filme.DUBLADO.mkv', 'Filme.LEGENDADO.PT-BR'] }),
    LANGUAGE.DUBBED,
  );
  assert.equal(
    discoverLanguage({ texts: ['Filme.LEGENDADO.PT-BR', 'Filme.DUBLADO.mkv'] }),
    LANGUAGE.DUBBED,
  );
});

test('discoverLanguage aceita legenda apenas sem áudio português elegível', () => {
  assert.equal(
    discoverLanguage({ texts: ['Filme.1080p.Ingles.mkv', 'Filme.LEGENDADO.PT-BR'] }),
    LANGUAGE.SUBTITLED,
  );
  assert.equal(
    discoverLanguage({ texts: ['Filme.LEGENDADO.PT-BR', 'Filme.1080p.Ingles.mkv'] }),
    LANGUAGE.SUBTITLED,
  );
  assert.equal(
    discoverLanguage({ texts: ['Filme.1080p.Ingles.mkv', 'Filme.LEGENDADO.PT-PT'] }),
    LANGUAGE.SUBTITLED_NON_PT_BR,
  );
});

test('discoverLanguage classifica idioma estrangeiro conhecido como Não PT-BR', () => {
  assert.equal(discoverLanguage({ texts: ['Filme.1080p.Ingles.mkv'] }), LANGUAGE.NON_PT_BR);
  assert.equal(discoverLanguage({ texts: ['Filme.1080p.Japones.mkv'] }), LANGUAGE.NON_PT_BR);
  assert.equal(discoverLanguage({ texts: ['Filme.1080p.Spanish.mkv'] }), LANGUAGE.NON_PT_BR);
});
