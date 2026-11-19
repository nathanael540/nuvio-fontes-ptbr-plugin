# Proposta: novo provedor Baixa Cine

## Why

O site [Baixa Cine](https://baixacine.com/) publica filmes e séries no catálogo consultável pelo
formulário de busca (`https://baixacine.com/index.php?busca=<termo>`), com cada post de detalhe
trazendo link(s) magnet. A rota `/?s=` é ignorada pelo site e devolve a home. Não há provedor que
consulte esse catálogo: buscas pelos títulos que ele cobre não retornam streams.

## What Changes

- Novo provedor `baixacine` (nome "Baixa Cine"): busca pelo formulário do site, confirmação da
  identidade entre os resultados (título e ano) e o `MediaInfo` do TMDB, com variantes de título
  para sufixos de edição/temporada e filtro de tipo (filme descarta temporada; série exige
  temporada e ignora o ano do cartão), extração do magnet do post confirmado (hash base32
  convertido para hexadecimal de 40 caracteres), qualidade, idioma e tamanho descobertos
  localmente, montagem de streams magnet com `buildStream`.
- Entrada em `manifest.json` (`baixacine`, filmes e séries, magnet, conteúdo em português).
- Atualização de `providers.md`: linha e seção com a rodada online.
- Testes Node de desenvolvimento em `test/baixacine.test.js` com fixtures reais da fonte
  (`test/fixtures/baixacine/`): filme, variante de título, série, ausência e entrada inválida.

## Capabilities

### New Capabilities

- `baixacine-provider`: carregar filmes e séries do catálogo Baixa Cine por busca HTML e TMDB,
  devolver streams de magnet com qualidade, idioma e metadados da fonte.

### Modified Capabilities

(nenhum)

## Impact

- `src/baixacine/`: ponto de entrada `index.js` (contrato do app) e `extractor.js` (busca,
  confirmação, extração do magnet e montagem dos streams).
- `manifest.json`, `providers.md`, `test/baixacine.test.js`, `test/fixtures/baixacine/`.
- Blocos reutilizados: `tmdb-info`, `title-match`, `http`, `torrent-release`,
  `quality-discovery`, `language-discovery`, `stream-build`, `custom-formatter` e `slugify`;
  nenhum bloco novo.
