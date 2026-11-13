# Proposal

## Why

O EmbedMovies (`https://embedmovies.org/`) publica um catálogo público de filmes, séries e animes em português do Brasil, sem conta e sem chave, e aceita o ID do TMDB na busca. O catálogo devolve o endereço do player da própria fonte; esse player é um invólucro `myembed.biz` que encaminha para o `playerflix.ink`, cujas opções já são resolvidas pelo bloco `fireplayer`. Nenhum provedor do repositório expõe esse catálogo.

A página do EmbedMovies afirma que a reprodução funciona apenas por iframe e não publica links diretos de vídeo. A investigação de 12/11/2026 mostrou que o encaminhamento público até o player permite obter HLS das opções suportadas, sem contornar autenticação, DRM ou desafio. O provedor cobre filme e série; animes e doramas entram como série, conforme o tipo que o app envia.

## What Changes

1. Novo provedor `embedmovies` no `manifest.json`, com `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8"]`, idioma `pt` e versão `1.0.0`.
2. Busca no catálogo por `POST https://embedmovies.org/inc/Ajax.php` com `type=search` e `search=<tmdbId>`, sem busca textual e sem `TMDB_API_KEY`.
3. Confirmação por correspondência exata de `tmdb_id` e `type` (`movie` ou `tv`); resultado ausente é ausência reconhecida, e resposta inválida, HTTP fora de 2xx ou mudança de contrato é erro.
4. Uso do campo `embed` devolvido pelo catálogo: em filme, o endereço já aponta para o player; em série, a temporada e o episódio são acrescentados ao caminho.
5. Resolução da cadeia pública `myembed.biz` → `playerflix.ink` → opções do PlayerFlix com o bloco `fireplayer`, reutilizando `resolveEntries`/`playEntries`, a triagem de `budget danger`, a resolução de `embedplayer2.xyz` e a classificação de idioma já existentes.
6. Opções não suportadas pelo bloco são descartadas por triagem, sem falhar o provedor; falha técnica de uma opção descarta só aquela opção. Se nenhuma opção produzir stream, o erro sobe e `getStreams` devolve lista vazia com `console.error`.
7. Streams montados pelo bloco com `format` (`FORMATTER.AUTO`, `addon` `EmbedMovies`), título e ano do catálogo, temporada e episódio do pedido, `type` `hls`, cabeçalhos e legendas comprovados pela cadeia do player; `provider` é o host da mídia resolvida, e a lista é ordenada por qualidade.
8. Testes Node offline com fixtures sanitizadas cobrindo filme, episódio, ausência, tipo divergente, opção não suportada, falha isolada, falha de todas as opções, contrato do stream e entradas inválidas.
9. Build dos três formatos, entrada e seção em `providers.md` com status inicial `🟠 Não verificado` e rodada online do pacote final.
10. Registro em `docs/provider-investigation.md` da variação “busca AJAX por ID do TMDB que devolve embed de player já coberto por bloco”, com referência ao novo provedor e aos testes.

## Capabilities

### New Capabilities

- `embedmovies-catalog`: busca do título por ID do TMDB no catálogo EmbedMovies, confirmação de tipo e identidade, encaminhamento ao player público e devolução de streams HLS resolvidos pela cadeia existente.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/embedmovies/` (entrada e extrator), reutilizando `http`, `fireplayer`, `custom-formatter`, `language-discovery`, `quality-discovery` e `stream-build`; nenhum bloco novo.
2. Manifest e saída: `manifest.json`, `providers/embedmovies.js`, `gdrive/providers/embedmovies.js`, `prism/providers/embedmovies.js` e os manifests de formato.
3. Testes: `test/embedmovies.test.js` e fixtures em `test/fixtures/embedmovies/`.
4. Documentação: `providers.md` (tabela e seção do provedor) e `docs/provider-investigation.md` (busca por ID que devolve embed de player).
5. Serviços externos: `embedmovies.org` (catálogo e busca), `myembed.biz` (invólucro público do player), `playerflix.ink` (opções do player) e os hosts das opções resolvidas, todos públicos, sem conta e sem chave.
6. Sem mudança de contrato global, de build ou de dependências; `docs/arch.md` não muda.
