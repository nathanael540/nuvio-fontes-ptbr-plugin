# Proposal

## Why

O Raflix publica uma lista pública de players por ID do TMDB e não tem provedor neste repositório. A fonte VidRift, uma das opções do catálogo, expõe HLS com faixa de áudio "Brazilian Portuguese" e legendas em português, o que permite ampliar a cobertura de filmes e séries em PT-BR com uma cadeia pública, sem conta, chave ou cookie.

## What Changes

1. Adicionar o provedor `raflix` em `src/raflix/`, com `movie` e `tv`, formato `m3u8`, versão `1.0.0`, registrado no `manifest.json` e empacotado nos três formatos.
2. Consultar `GET https://raflix.web.id/api/media/<mediaType>/<tmdbId>` para obter título e ano e distinguir título inexistente (HTTP 404) de falha. Consultar `GET https://raflix.web.id/api/media/sources?type=<mediaType>&tmdbId=<id>` com `season` e `episode` em série para localizar a fonte `vidrift` na lista pública do Raflix.
3. Derivar o caminho de mídia da URL do VidRift (`/embed/movie/<id>` ou `/embed/tv/<id>/<temporada>/<episódio>`) e consultar `GET <origem da URL da fonte>/api/boot/<caminho>`.
4. Selecionar a faixa de áudio `Orion · Brazilian Portuguese` quando o boot a anunciar e devolvê-la como `Dublado`, em HLS, com a qualidade máxima de `rungs` e os cabeçalhos de reprodução do VidRift.
5. Quando houver legenda PT disponível, resolver também a opção H.264 de `GET <origem da URL da fonte>/api/source/<caminho>?token=<playbackToken>&provider=<vela|titan|atlas>&parent=raflix.web.id&hevc=0`, tentando os provedores em ordem até um devolver streams. Usar `url` ou `proxyUrl` resolvido, qualidade tirada da URL (`1080p`, `720p`, `480p`) ou de `maxRes` quando houver um único stream, e devolver como `Legendado` ao lado da faixa `Dublado` quando ela existir.
6. Obter a legenda PT do `subtitleListUrl` da faixa Original da Orion, com `Referer` do VidRift, ou, na falta dela, de `GET <origem da URL da fonte>/api/subtitles/<caminho>/Portuguese`. Se a opção H.264 não produzir stream e não houver áudio PT-BR, usar a faixa Original da Orion como `Legendado`; sem áudio PT-BR nem legenda PT, devolver lista vazia.
7. Montar cada stream com `buildStream` e `format`, informando `provider` do player (Orion, Vela, Titan ou Atlas), `type: "hls"`, `language` do enum `LANGUAGE`, `quality` só quando a fonte a informar e `headers` de reprodução apenas onde a fonte os exigir. `name` e `title` vêm do formatador.
8. Reconhecer `meta.unreleased`, `meta.inCinemas` e `meta.airsSoon` como ausência, além do HTTP 404 de metadados. Erro de rede, HTTP fora de 2xx, JSON inválido ou estrutura inesperada sobem como erro; a falha de uma opção de mídia independente descarta só aquela opção, com `console.warn`.
9. Cobrir com testes Node e fixtures reais sanitizadas: filme com áudio PT-BR, filme só com legenda PT, série com áudio PT-BR, série só com legenda PT, série resolvida por `/api/source`, ausência por 404, ausência por `unreleased`/`airsSoon`, falha de um provedor de `/api/source` preservando o seguinte, resposta inválida e falha HTTP. Nenhuma fixture guarda URL assinada, token de mídia ou cookie.
10. Registrar a linha e a seção em `providers.md` com status inicial `🟠 Não verificado`, sem inventar evidência online, e atualizar `docs/provider-investigation.md` com o método de catálogo de players + boot JSON + resolução H.264 de contingência.
11. Não criar bloco novo: a leitura do catálogo, a seleção de faixa e a resolução do VidRift são específicas desta fonte e ficam em `src/raflix/`, conforme a regra de extrair blocos apenas de padrões observados em provedores reais.

## Capabilities

### New Capabilities

- `raflix-provider`: resolução de filmes e séries no catálogo Raflix pelo ID do TMDB, incluindo a consulta à lista de players, a leitura do boot do VidRift, a seleção de áudio PT-BR ou legenda PT, a resolução H.264 de contingência, a qualidade e o contrato dos streams HLS devolvidos.

### Modified Capabilities

Nenhuma. A verificação online continua regida pela capability `provider-online-verification`; o novo provedor apenas entra na amostra existente.

## Impact

1. Código: `src/raflix/` (novo), `test/raflix.test.js` e fixtures em `test/fixtures/raflix/`.
2. Configuração: `manifest.json`, `providers.md` e `docs/provider-investigation.md`. Nenhum bloco novo em `src/_blocks/`.
3. Saída gerada: `providers/raflix.js`, `gdrive/providers/raflix.js`, `prism/providers/raflix.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados, sem chave externa e sem quebra de contrato para os provedores existentes.
5. Riscos conhecidos da fonte: a lista de players e o boot do VidRift não são versionados; a faixa PT-BR pode ser HEVC, dependendo do aparelho; o `/api/source` pode mudar de provedores ou exigir `Referer`; as URLs de HLS expiram; e o título pode existir no Raflix sem áudio PT-BR nem legenda PT. A rodada online confirmará a cobertura real; a aprovação offline não autoriza publicação.
