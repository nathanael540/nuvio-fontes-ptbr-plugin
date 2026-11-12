/**
 * Bloco slugify: transforma títulos em texto normalizado e em slug.
 *
 * Útil quando a fonte não aceita o ID do TMDB e usa endereços com o título
 * (ex.: `/filme/duna-parte-dois-2024`) ou busca por nome.
 */

// Caracteres combinantes (acentos, cedilha, til) que sobram após `normalize('NFD')`.
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

/**
 * Normaliza um texto para comparação: minúsculas, sem acentos, `&` como "e"
 * e apenas letras latinas e números separados por um único espaço.
 *
 * Pode retornar string vazia quando o texto não tem letras latinas nem números
 * (ex.: títulos em coreano); quem chama decide o que fazer.
 *
 * @param {string} text - Texto a normalizar (ex.: um título).
 * @returns {string} Texto normalizado, possivelmente vazio.
 * @throws {Error} Se `text` não for string.
 * @example
 * normalizeText('Duna: Parte Dois'); // 'duna parte dois'
 * normalizeText('Velozes & Furiosos 9'); // 'velozes e furiosos 9'
 * normalizeText('Pokémon: O Filme'); // 'pokemon o filme'
 */
export function normalizeText(text) {
  if (typeof text !== 'string') {
    throw new Error(`normalizeText espera uma string, recebeu ${typeof text}`);
  }
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/&/g, ' e ')
    .replace(NON_ALPHANUMERIC, ' ')
    .trim();
}

/**
 * Gera o slug de um texto: `normalizeText` com os espaços trocados pelo separador.
 *
 * @param {string} text - Texto a converter (ex.: um título).
 * @param {object} [options] - Opções do slug.
 * @param {string} [options.separator] - Separador entre as palavras; padrão "-".
 * @returns {string} Slug não vazio.
 * @throws {Error} Se `text` não for string, se `separator` não for string não vazia
 *   ou se o texto não tiver letras latinas nem números.
 * @example
 * slugify('Duna: Parte Dois'); // 'duna-parte-dois'
 * slugify('Duna: Parte Dois', { separator: '+' }); // 'duna+parte+dois'
 */
export function slugify(text, options = {}) {
  const { separator = '-' } = options;
  if (typeof separator !== 'string' || separator === '') {
    throw new Error(`separator inválido: "${separator}" (esperado string não vazia)`);
  }

  const normalized = normalizeText(text);
  if (normalized === '') {
    throw new Error(`Não foi possível gerar slug de "${text}": o texto não tem letras latinas nem números`);
  }
  // split/join em vez de replace para que separadores como "$&" sejam usados literalmente.
  return normalized.split(' ').join(separator);
}
