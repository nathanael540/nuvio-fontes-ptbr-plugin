/**
 * Bloco script-extract: valores embutidos no HTML/JS de uma página, sem cheerio.
 *
 * Provedores reais encontram o link do vídeo em constantes de script, JSON embutido, atributos
 * `data-*` ou redirecionamentos por script. Usa expressões regulares (e não cheerio) porque o
 * cheerio do NuvioTV tem API reduzida e não expõe o conteúdo de `<script>` de forma confiável.
 *
 * Regra geral: valor ausente retorna `null` (quem chama decide); entrada inválida ou conteúdo
 * malformado lança Error.
 */

// Início de identificador: início do texto ou caractere que não faz parte de um identificador JS.
const IDENTIFIER_START = '(?:^|[^\\w$])';
// String JS/JSON entre aspas simples ou duplas: grupo 1 = aspa, grupo 2 = conteúdo ainda escapado.
const QUOTED_STRING = String.raw`(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1`;
const HTML_ENTITIES = { amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' };
const OPENERS = '[{';
const CLOSERS = ']}';

/**
 * Obtém o primeiro valor string atribuído a um identificador em scripts ou JSON da página.
 *
 * Aceita `const|let|var name = "..."`, `name = "..."`, `name: "..."` e `"name": "..."`, com aspas
 * simples ou duplas no valor. O identificador casa inteiro (buscar `url` não casa `video_url`).
 * Desfaz os escapes `\/`, `\"`, `\'`, `\\` e `\uXXXX` do valor.
 *
 * @param {string} html - HTML ou JavaScript da página.
 * @param {string} name - Identificador ou chave procurada (ex.: "defaultUrl").
 * @returns {string|null} Valor desescapado; `null` quando não há atribuição de string a `name`.
 * @throws {Error} Se `html` não for string ou se `name` for vazio ou não for string.
 * @example
 * extractScriptString('<script>const defaultUrl = "https:\\/\\/cdn.example.com\\/v.m3u8";</script>', 'defaultUrl');
 * // 'https://cdn.example.com/v.m3u8'
 */
export function extractScriptString(html, name) {
  assertHtml(html);
  assertName(name, 'name');

  const key = escapeRegExp(name);
  const pattern = new RegExp(`${IDENTIFIER_START}(?:"${key}"|'${key}'|${key})\\s*[:=]\\s*${QUOTED_STRING}`);
  const match = pattern.exec(html);
  return match ? unescapeJs(match[2]) : null;
}

/**
 * Obtém e interpreta o JSON (array ou objeto) atribuído a uma variável em um script da página.
 *
 * Procura `const|let|var name = [` ou `name = {` (também sem declaração), localiza o colchete ou a
 * chave de fechamento correspondente, ignorando os que estão dentro de strings, e faz `JSON.parse`.
 *
 * @param {string} html - HTML ou JavaScript da página.
 * @param {string} name - Nome da variável (ex.: "sources").
 * @returns {*} Valor interpretado; `null` quando não há atribuição de array ou objeto a `name`.
 * @throws {Error} Se `html` não for string, se `name` for vazio ou não for string, se o trecho
 *   não tiver fechamento ou se não for JSON válido (ex.: objeto JS com chaves sem aspas).
 * @example
 * extractScriptJson('var sources = [{"file":"https://cdn.example.com/v.mp4","label":"720p"}];', 'sources');
 * // [{ file: 'https://cdn.example.com/v.mp4', label: '720p' }]
 */
export function extractScriptJson(html, name) {
  assertHtml(html);
  assertName(name, 'name');

  const pattern = new RegExp(`${IDENTIFIER_START}${escapeRegExp(name)}\\s*=\\s*[[{]`);
  const match = pattern.exec(html);
  if (!match) return null;

  const start = match.index + match[0].length - 1;
  const end = findClosingIndex(html, start);
  if (end === -1) throw new Error(`JSON de "${name}" sem fechamento correspondente`);

  const text = html.slice(start, end + 1);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON de "${name}" inválido: ${error.message}`, { cause: error });
  }
}

/**
 * Obtém o valor do primeiro atributo `data-<attribute>` encontrado no HTML.
 *
 * Aceita o nome com ou sem o prefixo `data-` e valores entre aspas duplas ou simples. O nome do
 * atributo não diferencia maiúsculas de minúsculas, como no HTML. Decodifica as entidades
 * `&amp;`, `&quot;`, `&#39;`, `&lt;` e `&gt;` do valor.
 *
 * @param {string} html - HTML da página.
 * @param {string} attribute - Nome do atributo, com ou sem `data-` (ex.: "contentid" ou "data-contentid").
 * @returns {string|null} Valor decodificado; `null` quando o atributo não existe.
 * @throws {Error} Se `html` não for string ou se `attribute` for vazio, só `data-` ou não for string.
 * @example
 * extractDataAttribute('<div class="player" data-contentid="123"></div>', 'contentid');
 * // '123'
 */
export function extractDataAttribute(html, attribute) {
  assertHtml(html);
  assertName(attribute, 'attribute');

  const suffix = attribute.replace(/^data-/i, '');
  if (suffix === '') throw new Error(`attribute inválido: "${attribute}" (falta o nome após "data-")`);

  const pattern = new RegExp(`\\sdata-${escapeRegExp(suffix)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = pattern.exec(html);
  if (!match) return null;
  return decodeHtmlEntities(match[1] !== undefined ? match[1] : match[2]);
}

/**
 * Obtém a URL do primeiro redirecionamento feito por script na página.
 *
 * Aceita `window.location.href = "..."`, `window.location = "..."`, `location.href = "..."`,
 * `location = "..."`, `location.replace("...")` e `window.location.replace("...")`, com aspas
 * simples ou duplas. Desfaz os mesmos escapes de `extractScriptString`.
 *
 * @param {string} html - HTML ou JavaScript da página.
 * @returns {string|null} URL desescapada; `null` quando a página não redireciona por script.
 * @throws {Error} Se `html` não for string.
 * @example
 * extractJsRedirect('<script>window.location.href = "https:\\/\\/player.example.com\\/e\\/abc";</script>');
 * // 'https://player.example.com/e/abc'
 */
export function extractJsRedirect(html) {
  assertHtml(html);

  const pattern = new RegExp(
    `(?:^|[^\\w$.])(?:window\\.)?location(?:(?:\\.href)?\\s*=\\s*|\\.replace\\(\\s*)${QUOTED_STRING}`,
  );
  const match = pattern.exec(html);
  return match ? unescapeJs(match[2]) : null;
}

/**
 * Valida que o conteúdo da página é string.
 * @param {*} html
 * @returns {void}
 * @throws {Error} Se não for string.
 */
function assertHtml(html) {
  if (typeof html !== 'string') {
    throw new Error(`html inválido: esperado string, recebido ${typeof html}`);
  }
}

/**
 * Valida que o nome procurado é string não vazia.
 * @param {*} value
 * @param {string} label - Nome do parâmetro, usado na mensagem.
 * @returns {void}
 * @throws {Error} Se não for string ou estiver vazio.
 */
function assertName(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} inválido: "${value}" (esperado texto não vazio)`);
  }
}

/**
 * Escapa caracteres especiais para uso literal em RegExp.
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

/**
 * Desfaz escapes comuns de JS/JSON em uma passada: `\/`, `\"`, `\'`, `\\` e `\uXXXX`.
 * @param {string} value - Conteúdo de string ainda escapado.
 * @returns {string}
 */
function unescapeJs(value) {
  return value.replace(/\\(u[0-9a-fA-F]{4}|[\\/"'])/g, (whole, sequence) =>
    sequence.length === 5 ? String.fromCharCode(parseInt(sequence.slice(1), 16)) : sequence,
  );
}

/**
 * Decodifica as entidades HTML básicas em uma passada.
 * @param {string} value
 * @returns {string}
 */
function decodeHtmlEntities(value) {
  return value.replace(/&(amp|quot|#39|lt|gt);/g, (whole, entity) => HTML_ENTITIES[entity]);
}

/**
 * Índice do colchete ou chave que fecha o aberto em `start`, ignorando os que estão em strings.
 * @param {string} text
 * @param {number} start - Índice de `[` ou `{`.
 * @returns {number} Índice do fechamento ou -1 se não houver.
 */
function findClosingIndex(text, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (OPENERS.includes(char)) {
      depth++;
    } else if (CLOSERS.includes(char)) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}
