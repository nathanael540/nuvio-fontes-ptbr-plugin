# Proposal

## Why

O CineAgora (cineagora.club) publica filmes e séries em PT-BR com opções dubladas e legendadas e entrega HLS pelo player BrStream, mas nenhum provedor deste repositório consulta esse catálogo. Adicionar a fonte amplia a cobertura de HLS sem conta, chave ou serviço externo.

## What Changes

- Novo provedor `cineagora`, com `supportedTypes: ["movie", "tv"]` e formato `m3u8`.
- Busca no catálogo DLE pelo ID do IMDb informado pelo TMDB, com fallback pelo título PT-BR e pelo título original.
- Confirmação de identidade pela seção do catálogo, pelo link do IMDb, pelo título e pelo ano da página, sem aceitar o primeiro resultado parecido.
- Leitura dos espelhos de player da página (`Dublado` e `Legendado`) e resolução individual de cada opção.
- Resolução do player `watch.brstream.cc` a partir do objeto `video` publicado na página e da playlist master HLS construída com `uid`, `md5`, `id` e `status`.
- Séries: leitura de `watch.brstream.cc/tv/<slug>`, consulta de `fetch_series_data.php` e seleção do episódio pelo par temporada/número antes de abrir a página de vídeo.
- Qualidade pela lista `quality` declarada pelo player; idioma pelo rótulo do espelho e pelo nome da release; `filename` decodificado no formatador.
- Sem cabeçalhos de reprodução: a playlist e os segmentos observados respondem publicamente sem `Referer` ou `Origin`.
- Fora do escopo: downloads, torrent, players de anúncio, trailer do YouTube, legendas externas não confirmadas e títulos que só oferecem trailer.
- Manifest, documentação de provedores, guia de investigação, fixtures e testes offline; a evidência online fica para a rodada do pacote final.

## Capabilities

### New Capabilities

- `cineagora-catalog`: busca pelo IMDb ou título do TMDB e confirmação de identidade e tipo na página do catálogo.
- `cineagora-player`: descoberta dos espelhos de áudio, resolução do player BrStream, seleção de episódio e montagem dos streams HLS.

### Modified Capabilities

Nenhuma.

## Impact

- `manifest.json`: novo scraper `cineagora`.
- `src/cineagora/`: catálogo, identidade, leitura dos espelhos, player BrStream e montagem dos streams.
- `providers/cineagora.js` e variantes de formato: saída gerada pelo build.
- `test/cineagora.test.js` e `test/fixtures/cineagora/`: testes offline com respostas reais sanitizadas.
- `providers.md`: linha e seção do provedor, com status inicial não verificado até a rodada online.
- `docs/provider-investigation.md`: novo método de catálogo DLE com espelhos e player BrStream.
- Nenhuma mudança de contrato, formato existente ou provedor atual.
