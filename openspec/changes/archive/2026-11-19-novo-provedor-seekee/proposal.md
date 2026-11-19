# Proposal

## Why

O ecossistema Seekee publica filmes, séries, animes e doramas em português brasileiro através de uma API pública de busca (`https://h5-api.otv.cc/quan/h5/search/search`) integrada a espelhos Web compatíveis com o mesmo caminho `/pt/detail/<tipo>/<slug>` (`es.cuevana4br.com`, `play.cuevana19.com`, `flixlat.com`, `latino.solo-latino.com`, `video.playspelis.com`, `www3.dramasfree.com` e `ww20.321moviesfree.com`), entregando playlists HLS diretas e legendas `.srt` sem exigir conta ou chave de usuário. Como todos os espelhos compartilham exatamente o mesmo catálogo e conteúdo, a arquitetura do repositório exige consolidá-los em um único provedor com fallback automático entre espelhos, evitando streams duplicados.

## What Changes

- Novo provedor unificado `seekee` (nome `Seekee`) para `movie` e `tv`, com descoberta via `h5-api.otv.cc/quan/h5/search/search` assinada localmente em JavaScript compatível com ES2016/QuickJS (RSA-1024 PKCS#1 v1.5 sobre `crypto-js` AES-128-ECB e MD5).
- Extração de páginas `/pt/detail/<movie|drama>/<slug>[/<episódio>]` a partir do payload `__NEXT_DATA__` (`props.pageProps`) usando a lista ordenada de espelhos acessíveis sem bloqueio anti-bot (`es.cuevana4br.com`, `play.cuevana19.com`, `flixlat.com`, `latino.solo-latino.com`, `video.playspelis.com`, `www3.dramasfree.com`, `ww20.321moviesfree.com`), substituindo `h5.onfilom.com` (bloqueado por Cloudflare 403).
- Suporte a troca automática de temporada via `seasons` (`seriesNo` e `websiteParam`), expansão das opções de áudio em português/original via `dubbingList`, validação estrita de `currentEpisodeNumber` para evitar retorno silencioso do episódio 1 e coleta de legendas externas `.srt` de `subtitlingList`.
- Registro no `manifest.json`, documentação inicial em `providers.md` (`🟠 Não verificado`) e atualização de `docs/provider-investigation.md` com o método de busca assinada e rede de espelhos `/pt/detail/`.
- Suíte offline `test/seekee.test.js` com fixtures sanitizadas em `test/fixtures/seekee/` cobrindo filme, série em outra temporada, opção dublada e legendada, episódio inexistente e ausência.

## Capabilities

### New Capabilities

- `seekee-provider`: consultar títulos no índice público do Seekee por TMDB, navegar entre temporadas e variantes de áudio na rede de espelhos compatíveis e emitir streams HLS formatados com qualidade, idioma e legendas externas.

### Modified Capabilities

(nenhum)

## Impact

- Novos arquivos em `src/seekee/` (`index.js`, `api.js`, `extractor.js`), saídas geradas pelo `build.js` (`providers/seekee.js`, `gdrive/providers/seekee.js`, `prism/providers/seekee.js`) e entradas correspondentes nos manifests.
- Testes e fixtures em `test/seekee.test.js` e `test/fixtures/seekee/`.
- Documentação em `providers.md` e `docs/provider-investigation.md`.
- Blocos reutilizados: `tmdb-info`, `title-match`, `http`, `slugify`, `quality-discovery`, `language-discovery`, `stream-build` e `custom-formatter`; nenhum bloco novo e nenhuma dependência externa além de `crypto-js`.
