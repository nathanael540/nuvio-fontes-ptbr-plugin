# Proposal

## Why

O AnimeZeY publica um índice público de arquivos de vídeo em Google Drive por meio de dois workers Cloudflare, sem conta e sem chave, e entrega o arquivo por um host dedicado de download. Em 2026-11-14 (UTC) a busca `POST https://1.animezey23112022.workers.dev/1:search` respondeu `200 text/plain` com JSON `{ nextPageToken, curPageIndex, data: { files[] } }`; a busca "A Viagem de Chihiro" devolveu o arquivo `A Viagem de Chihiro (2001) [1080p][Dual Áudio].mkv` (2.441.830.780 bytes); o link `/download.aspx` reconstruído no host dedicado respondeu `206 video/x-matroska` com `Range: bytes=0-1023` e assinatura EBML `1a45dfa3`, sem `Referer`. O repositório não tem provedor desse índice, e ele acrescenta filmes e episódios em MKV com áudio português que os catálogos atuais não cobrem.

## What Changes

1. Adicionar o provedor `animezey` em `src/animezey/`, com busca nos workers, validação estrita de título/ano/temporada/episódio e montagem do link de download no host dedicado.
2. Usar o TMDB apenas para título, ano e coordenadas; a chave vem de `TMDB_API_KEY` do app, nunca do código.
3. Tratar cada arquivo como opção independente; a falha de um arquivo não descarta os demais, e o erro agregado só sobe quando nenhum stream sai.
4. Usar o worker primário `1.animezey23112022.workers.dev` para busca e download; o worker secundário respondeu `200` na busca, mas o link dele no host dedicado respondeu `500` no teste, então não entra como rotação até que a reprodução seja comprovada. `429`/`5xx` do primário são falha, não ausência.
5. Não usar a página `?a=view` (respondeu `401`), sonda de mídia, settings, timeout próprio ou cache; qualidade, idioma e tamanho saem dos textos já obtidos no nome e no campo `size`.
6. Registrar o método em `docs/provider-investigation.md` como índice de arquivos por API de busca e host de download dedicado.

## Capabilities

### New Capabilities

- `animezey-provider`: busca no índice AnimeZeY, identidade por título/ano/coordenadas e contrato dos streams MKV/MP4 pelo host dedicado.

### Modified Capabilities

- Nenhuma.

## Impact

1. Código novo em `src/animezey/` (`index.js`, `search.js`, `extractor.js`), reutilizando `http`, `tmdb-info`, `title-match`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`.
2. Entrada nova em `manifest.json` (`id: animezey`, `formats: ["mkv", "mp4"]`) e saídas geradas em `providers/animezey.js`, `gdrive/providers/animezey.js`, `prism/providers/animezey.js` e nos `<formato>/manifest.json`.
3. Testes offline em `test/animezey.test.js` e fixtures em `test/fixtures/animezey/`; verificação online com `npm run test:online -- --provider animezey`.
4. Atualização de `providers.md` e de `docs/provider-investigation.md`.
5. Serviço externo: workers Cloudflare e host de download públicos, sem chave, conta ou DRM; as URLs de download são assinadas e efêmeras e não entram em fixture, log ou documentação.
