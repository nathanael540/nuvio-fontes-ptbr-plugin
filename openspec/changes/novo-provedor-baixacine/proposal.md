# Proposta: novo provedor Baixa Cine

## Why

O site [Baixa Cine](https://baixacine.com/) publica filmes e séries no catálogo consultável por
busca HTML (`https://baixacine.com/?s=<termo>`), com cada post detalhe trazendo link(s) magnet.
Não há provedor que consulte esse catálogo: buscas pelos títulos que ele cobre não retornam
streams.

## What Changes

- Novo provedor `baixacine` (nome "Baixa Cine"): busca por título na página de busca do site,
  confirmação da identidade entre os resultados (título e ano) e o `MediaInfo` do TMDB,
  extração do magnet do post confirmado (hash base32 convertido para hexadecimal de 40
  caracteres), qualidade e idioma descobertos localmente, montagem de streams magnet com
  `buildStream`.
- Entrada em `manifest.json` (`baixacine`, filmes e séries, magnet, conteúdo em português).
- Atualização de `providers.md`: linha e seção iniciais `🟠 Não verificado`.
- Testes Node de desenvolvimento em `test/baixacine.test.js` com fixtures reais da fonte
  (`test/fixtures/baixacine/`): filme, ausência e entrance inválida.

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
