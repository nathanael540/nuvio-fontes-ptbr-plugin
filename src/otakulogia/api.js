/**
 * Cliente GraphQL do Otakulogia: transporte, query de busca e query de detalhe.
 *
 * Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0).
 * As duas queries e a leitura de `searchAnimes`/`animeCatalogDetail` foram portadas desse arquivo;
 * nenhuma URL de mídia, token, cookie ou segredo foi copiado.
 */

import { fetchJson } from '../_blocks/http/index.mjs';

const GRAPHQL_URL = 'https://api.otakulogia.com/graphql';
const THEME_ORIGIN = 'https://otakulogia.com';
const THEME_REFERER = 'https://otakulogia.com/';
const SEARCH_LIMIT = 12;

const SEARCH_QUERY = 'query SearchAnimes($input: SearchAnimesInput) { searchAnimes(input: $input) { total items { id upstreamCid name slug nameEn year audioMix } } }';
const DETAIL_QUERY = 'query AnimeCatalogDetail($upstreamCid: Int!, $upstreamTid: Int) { animeCatalogDetail(upstreamCid: $upstreamCid, upstreamTid: $upstreamTid) { anime { name year } seasons { upstreamTid name audioType } episodes { episodeNumber upstreamTempId videoUrl videoUrlFhd videoUrlSd videoType audioType } } }';

/**
 * @typedef {object} SearchItem
 * @property {string} [id] - Identificador interno do catálogo.
 * @property {*} upstreamCid - Identificador inteiro da obra no catálogo de origem.
 * @property {string|null} [name] - Título publicado.
 * @property {string|null} [nameEn] - Título em inglês, quando publicado.
 * @property {number|null} [year] - Ano de estreia, quando publicado.
 */

/**
 * Executa uma busca textual e devolve os itens publicados.
 * @param {string} title - Termo de busca.
 * @returns {Promise<SearchItem[]>} Itens na ordem da fonte; lista vazia quando não há resultado.
 * @throws {Error} Em HTTP fora de 2xx, corpo não JSON, `errors` não vazio, `data` ausente,
 *   `searchAnimes` fora de objeto/nulo ou `items` fora de lista.
 * @example
 * const items = await searchAnimes('Demon Slayer');
 * // items[0].upstreamCid === 201
 */
export async function searchAnimes(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error(`termo de busca inválido: ${describe(title)} (esperado texto não vazio)`);
  }
  const data = await requestGraphQL(SEARCH_QUERY, { input: { query: title.trim(), limit: SEARCH_LIMIT } });
  const search = data.searchAnimes;
  if (search === null) return [];
  if (!isPlainObject(search)) {
    throw new Error(`searchAnimes fora do esquema: esperado objeto ou null (recebido: ${describe(search)})`);
  }
  if (!Array.isArray(search.items)) {
    throw new Error(`searchAnimes.items fora do esquema: esperado lista (recebido: ${describe(search.items)})`);
  }
  return search.items;
}

/**
 * Consulta o detalhe de uma obra pelo identificador de origem.
 * @param {number} upstreamCid - Identificador inteiro da obra.
 * @returns {Promise<object|null>} Detalhe com `seasons` e `episodes`, ou null quando a obra não
 *   existe mais no catálogo.
 * @throws {Error} Se `upstreamCid` não for inteiro, em HTTP fora de 2xx, corpo não JSON,
 *   `errors` não vazio, `data` ausente, `animeCatalogDetail` fora de objeto/nulo, ou `seasons` e
 *   `episodes` fora de lista.
 * @example
 * const detail = await fetchDetail(201);
 * // detail.seasons[0].name === 'Temporada 01 | Dublado'
 */
export async function fetchDetail(upstreamCid) {
  if (!Number.isInteger(upstreamCid)) {
    throw new Error(`upstreamCid inválido: ${describe(upstreamCid)} (esperado inteiro)`);
  }
  const data = await requestGraphQL(DETAIL_QUERY, { upstreamCid, upstreamTid: null });
  const detail = data.animeCatalogDetail;
  if (detail === null) return null;
  if (!isPlainObject(detail)) {
    throw new Error(`animeCatalogDetail fora do esquema: esperado objeto ou null (recebido: ${describe(detail)})`);
  }
  if (!Array.isArray(detail.seasons)) {
    throw new Error(`animeCatalogDetail.seasons fora do esquema: esperado lista (recebido: ${describe(detail.seasons)})`);
  }
  if (!Array.isArray(detail.episodes)) {
    throw new Error(`animeCatalogDetail.episodes fora do esquema: esperado lista (recebido: ${describe(detail.episodes)})`);
  }
  return detail;
}

/**
 * Envia uma query ao endpoint GraphQL e valida o envelope da resposta.
 * @param {string} query - Documento GraphQL.
 * @param {object} variables - Variáveis da query.
 * @returns {Promise<object>} Objeto `data` da resposta.
 * @throws {Error} Em HTTP fora de 2xx, corpo não JSON, `errors` não vazio ou `data` ausente.
 */
async function requestGraphQL(query, variables) {
  const body = await fetchJson(GRAPHQL_URL, {
    method: 'POST',
    profile: 'api',
    headers: { Origin: THEME_ORIGIN, Referer: THEME_REFERER },
    json: { query, variables },
  });
  if (!isPlainObject(body)) {
    throw new Error(`resposta GraphQL fora do esquema: esperado objeto (recebido: ${describe(body)})`);
  }
  if (body.errors !== undefined && body.errors !== null) {
    if (!Array.isArray(body.errors)) {
      throw new Error(`resposta GraphQL fora do esquema: errors deve ser lista (recebido: ${describe(body.errors)})`);
    }
    if (body.errors.length > 0) {
      throw new Error(`GraphQL retornou erros: ${describeErrors(body.errors)}`);
    }
  }
  if (!isPlainObject(body.data)) {
    throw new Error(`resposta GraphQL sem data: ${describe(body.data)}`);
  }
  return body.data;
}

/**
 * Mensagens dos erros GraphQL, em texto único.
 * @param {Array<*>} errors - Lista de erros da resposta.
 * @returns {string} Mensagens separadas por ponto e vírgula.
 */
function describeErrors(errors) {
  return errors
    .map((error) => (isPlainObject(error) && typeof error.message === 'string' ? error.message : 'erro sem mensagem'))
    .join('; ');
}

/**
 * Indica se o valor é um objeto simples (não nulo e não lista).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Representação curta de um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
