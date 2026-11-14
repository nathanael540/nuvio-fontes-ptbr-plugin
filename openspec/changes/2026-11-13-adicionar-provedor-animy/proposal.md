# Proposal

## Why

O Animy publica uma API REST pública, sem conta e sem chave, que entrega catálogo de animes em português com fichas por variante de áudio (`dublado` e `legendado`) e mídia MP4 direta. Em 2026-11-13/14 (UTC) a cadeia foi confirmada: `GET https://animy.net/api/v1/animes?search=Kimetsu` respondeu `200 application/json`; a ficha `GET /api/v1/animes/84` trouxe 63 episódios com temporadas 1 a 5; a rota `GET /api/v1/animes/84/episodes/1/1` devolveu um MP4 em `feralstream.animy.net`; e a mídia respondeu `206`, `Content-Type: video/mp4`, assinatura `ftypisom`, com `Range: bytes=0-1023`. O repositório ainda não cobre o catálogo do Animy, e o portal oferece temporadas completas em português que os provedores atuais não entregam para esses títulos.

## What Changes

1. Adicionar o provedor `animy` em `src/animy/`, com busca pela API pública, confirmação de título/tipo/temporada/episódio e resolução da rota de reprodução.
2. Tratar cada variante de áudio publicada pela fonte (`dublado` e `legendado`) como catálogo independente, unindo os streams sem repetir URL.
3. Montar todos os streams com `buildStream` e `format`, `type` `mp4`, `provider` do catálogo e idioma classificado pelo texto `audio` da fonte; a qualidade fica `Desconhecida` porque a fonte não a declara.
4. Não usar sonda de mídia, preferências de áudio/qualidade, `settings`, timeout próprio, AniList/Kitsu ou tabelas fixas de episódios: a fonte já entrega temporada e número compatíveis com o TMDB na amostra.
5. Registrar o método em `docs/provider-investigation.md` como API REST de catálogo com variantes de áudio, com referências de código e teste.

## Capabilities

### New Capabilities

- `animy-provider`: busca, identidade, seleção de episódio e contrato dos streams MP4 do catálogo Animy.

### Modified Capabilities

- Nenhuma.

## Impact

1. Código novo em `src/animy/` (`index.js`, `api.js`, `extractor.js`), reutilizando `http`, `tmdb-info`, `title-match`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`.
2. Entrada nova em `manifest.json` (`id: animy`, `formats: ["mp4"]`) e saídas geradas em `providers/animy.js`, `gdrive/providers/animy.js`, `prism/providers/animy.js` e nos `<formato>/manifest.json`.
3. Testes offline em `test/animy.test.js` e fixtures em `test/fixtures/animy/`; verificação online com `npm run test:online -- --provider animy`.
4. Atualização de `providers.md` (tabela e seção do provedor) e de `docs/provider-investigation.md`.
5. Serviço externo: API e CDN públicos do Animy, sem chave, conta ou DRM; apenas `TMDB_API_KEY` do app para os metadados.
