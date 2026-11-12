/**
 * `fetch` real do harness online.
 *
 * O adaptador encaminha os argumentos e devolve a mesma resposta, sem fallback, sem nova tentativa e
 * sem ler o corpo. Assim respostas binárias e redirecionamentos continuam intactos para o provedor.
 */

/**
 * Cria o `fetch` do caso usando o `fetch` global ou uma implementação injetada em teste.
 *
 * @param {{ fetchImpl?: Function }} [options] - Implementação usada no encaminhamento.
 * @returns {(input: RequestInfo|URL, init?: RequestInit) => Promise<Response>} Função de fetch.
 * @throws {Error} Se a implementação não for uma função.
 * @example
 * const fetchReal = createRealFetch();
 * const response = await fetchReal('https://example.com/');
 */
export function createRealFetch({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch real indisponível no Node');
  }
  return (input, init) => fetchImpl(input, init);
}

/**
 * Lê a chave TMDB do ambiente local, sem valor padrão e sem inventar credencial.
 *
 * @param {NodeJS.ProcessEnv} [env] - Ambiente a consultar.
 * @returns {string|null} Chave aparada ou null quando ausente/vazia.
 * @example
 * readTmdbApiKey({ TMDB_API_KEY: '  abc  ' }); // 'abc'
 * readTmdbApiKey({}); // null
 */
export function readTmdbApiKey(env = process.env) {
  const value = env.TMDB_API_KEY;
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim();
}

/**
 * Monta as globais fornecidas ao pacote em um caso.
 *
 * `TMDB_API_KEY` só é definida quando existe no ambiente. Provedores que não consultam o TMDB não
 * dependem dela.
 *
 * @param {{ tmdbApiKey?: string|null, providerId: string, fetchImpl?: Function }} options - Chave, ID e fetch.
 * @returns {object} Globais do contexto do caso.
 * @example
 * const globals = createCaseGlobals({ providerId: 'betor', tmdbApiKey: null });
 * // globals.TMDB_API_KEY === undefined
 */
export function createCaseGlobals({ tmdbApiKey, providerId, fetchImpl }) {
  const globals = {
    fetch: createRealFetch({ fetchImpl }),
    SCRAPER_ID: providerId,
    SCRAPER_SETTINGS: {},
  };
  if (typeof tmdbApiKey === 'string' && tmdbApiKey !== '') {
    globals.TMDB_API_KEY = tmdbApiKey;
  }
  return globals;
}
