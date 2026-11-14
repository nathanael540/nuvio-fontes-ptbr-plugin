/**
 * Constantes do catálogo AniBunker.
 *
 * O domínio canônico observado em 13/11/2026 é `anibunker.com`; `anibunker.net` não resolve.
 * Nenhuma constante aqui é segredo: a busca e o carregador são públicos e não exigem conta.
 */

/** Base do catálogo, sem barra no final. */
export const SOURCE_URL = 'https://anibunker.com';

/** Busca pública do catálogo, `POST` com formulário `query`. */
export const SEARCH_URL = `${SOURCE_URL}/php/search.php`;

/** Carregador público dos players, `POST` com `player_id` e `video_id`. */
export const LOADER_URL = `${SOURCE_URL}/php/loader.php`;

/** Prefixo do token do Blogger que o player `token` entrega. */
export const BLOGGER_TOKEN_PREFIX = 'AD6v5d';

/** Nome do provedor usado nos logs e no formatador. */
export const PROVIDER_NAME = 'AniBunker';
