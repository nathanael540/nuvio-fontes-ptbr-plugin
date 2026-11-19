# Proposal

## Why

O site Tokyvideo (https://www.tokyvideo.com/br) funciona como portal de vídeo em português do Brasil, com amplo acervo de filmes e séries, sem necessidade de conta nem chave. Nenhum provedor deste repositório o cobre: o acesso aos conteúdos passa pela busca e fichas do site, e o stream publicado pela fonte é o MP4 direto emitido pela página do vídeo. Adicionar o provedor amplia a cobertura do catálogo publicado sem chave, sem conta e sem serviço intermediário.

## What Changes

1. Adicionar o provedor `tokyvideo` em `src/tokyvideo/` (novo: `index.js` e `extractor.js`), empacotado nos três formatos e registrado no `manifest.json` com `movie` e `tv`, formato `["mp4"]`, versão `1.0.0` e autor `nathanael540`.
2. Buscar a partir do título do TMDB em `GET https://www.tokyvideo.com/br/procurar?q=<título>` e selecionar os candidatos pela semelhança de título (bloco `title-match`): os links das fichas são páginas de vídeo cuja JSON-LD contém o título confirmado.
3. Consultar a ficha do vídeo escolhido: JSON-LD `VideoObject.name`/`duration` e o `<source type="video/mp4">` com o MP4 direto; a confirmação de identidade é pela contenção do título do TMDB em `normalizeText(título)` da ficha ou por `titleSimilarity` ≥ 0,5.
4. Montar o stream com `buildStream` e `format` (`FORMATTER.AUTO`, addon `Tokyvideo`, título/ano do TMDB, temporada/episódio no episódio), `type` `mp4`, qualidade descoberta do rótulo `videoQuality` do JSON-LD, `provider` com o host do CDN e `headers` com `playbackHeaders` da ficha.
5. Ficha do vídeo sem `<source>` SHALL ser ausência (videos bloqueados geograficamente retornam ficha sem stream, como observado para "Game On! (2006)"); falhas técnicas (busca fora de 2xx, HTTP do CDN, contrato) sobem para `getStreams`, que registra `console.error('[Tokyvideo] ...')` e devolve lista vazia.
6. Cobrir com testes Node e fixtures reais sanitizadas: filme, episódio avulso, ausência, triagem, falha fatal e logs sem assinatura do `secure` do CDN.
7. Registrar a linha e a seção do Tokyvideo em `providers.md` com status inicial `🟠 Não verificado`.
8. Atualizar `docs/provider-investigation.md` com o método observado (§3.40: busca/ficha do site, MP4 assinado no `<source>` da ficha, `secure` exigido).
9. Fora do escopo: legendas externas (a fonte não as publica nas fichas observadas), magnet/torrent, sondagem de mídia e cache.

## Capabilities

### New Capabilities

- `tokyvideo-provider`: busca/ficha do site Tokyvideo (perfil `/br`), confirmação de identidade, resolução do MP4 direto publicado na página do vídeo e contrato dos streams MP4.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/tokyvideo/` (novo), `providers/tokyvideo.js`, `gdrive/providers/tokyvideo.js`, `prism/providers/tokyvideo.js` (gerados pelo build).
2. Configuração: `manifest.json` e os `<formato>/manifest.json` (gerados).
3. Documentação: `providers.md` (linha + seção `## Tokyvideo`), `docs/provider-investigation.md` (§3.40).
4. Specs: nova capability `openspec/specs/tokyvideo-provider/spec.md`.
5. Sem migração de dados, sem dependência nova e sem alteração nos demais provedores.
