/**
 * ESLint com três perfis (docs/arch.md, seção Build, lint e dependências):
 * 1. Runtime do app (src/): só as globais que o NuvioMobile e o NuvioTV oferecem ao plugin.
 * 2. Blocos (src/_blocks/): perfil do app + JSDoc completo nas funções exportadas.
 * 3. Node: scripts da raiz e ferramentas/testes em test/, em CommonJS ou ESM.
 */

import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

// Módulos que o app entrega via require()/import; todo o resto é empacotado pelo build ou não existe no app.
const APP_MODULES = ['cheerio-without-node-native', 'react-native-cheerio', 'cheerio', 'crypto-js'];
const APP_MODULES_PATTERN = APP_MODULES.join('|');

// Globais definidas pelos dois apps (NuvioMobile 0.6.9-beta e NuvioTV 1.1.0-beta.12).
const APP_GLOBALS = {
  fetch: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  require: 'readonly',
  module: 'readonly',
  TMDB_API_KEY: 'readonly',
  SCRAPER_ID: 'readonly',
  SCRAPER_SETTINGS: 'readonly',
};

// Funções exportadas dos blocos: o JSDoc delas é obrigatório e completo.
const EXPORTED_FUNCTIONS = ['ExportNamedDeclaration > FunctionDeclaration'];

export default [
  { ignores: ['node_modules/', 'providers/', 'test/artifacts/'] },

  js.configs.recommended,

  {
    name: 'runtime-do-app',
    files: ['src/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: APP_GLOBALS,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(?!\\.{1,2}/|(${APP_MODULES_PATTERN})$)`,
              message: `O app só fornece ${APP_MODULES.join(', ')}. Use imports relativos (blocos) ou o fetch global.`,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `CallExpression[callee.name='require'][arguments.0.value!=/^(${APP_MODULES_PATTERN})$/]`,
          message: `require() só aceita ${APP_MODULES.join(', ')}.`,
        },
      ],
    },
  },

  {
    name: 'blocos',
    files: ['src/_blocks/**/index.mjs'],
    plugins: { jsdoc },
    languageOptions: {
      // Não é global do app: o build troca NUVIO_FORMATTER pelo formato da variante (define do esbuild,
      // bloco custom-formatter). No arquivo base ele não existe e é lido só por `typeof`.
      globals: { NUVIO_FORMATTER: 'readonly' },
    },
    rules: {
      'no-restricted-globals': ['error', { name: 'module', message: 'Blocos usam apenas export nomeado.' }],
      'jsdoc/require-jsdoc': ['error', { publicOnly: true, require: { FunctionDeclaration: true } }],
      'jsdoc/require-description': ['error', { contexts: EXPORTED_FUNCTIONS }],
      'jsdoc/require-param': ['error', { contexts: EXPORTED_FUNCTIONS }],
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-returns': ['error', { contexts: EXPORTED_FUNCTIONS }],
      'jsdoc/require-returns-type': 'error',
      'jsdoc/require-throws': ['error', { contexts: EXPORTED_FUNCTIONS }],
      'jsdoc/require-example': ['error', { contexts: EXPORTED_FUNCTIONS }],
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/valid-types': 'error',
    },
  },

  {
    name: 'node-commonjs',
    files: ['*.js', 'test/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },

  {
    name: 'node-esm',
    files: ['*.mjs', 'test/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
];
