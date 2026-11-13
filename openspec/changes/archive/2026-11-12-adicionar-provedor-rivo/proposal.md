# Proposal

## Why

O RIVO (`https://rivo.st/`) é um catálogo público baseado no TMDB que aceita o ID do TMDB diretamente e expõe um player público em `https://f.rivo.st/` com fontes HLS e MP4 para filmes e séries. A investigação de 12/11/2026 confirmou que a API do player entrega fontes com áudio em português do Brasil, português sem região confirmada e outros idiomas, além de legendas externas, sem conta, sem chave e sem depender de `TMDB_API_KEY`. Nenhum provedor do repositório usa essa fonte.

A página pública de detalhe respondeu HTTP 403 ao acesso direto, mas a API pública do player respondeu normalmente e é a interface usada pelo próprio player do RIVO. O provedor seguirá somente essa API, sem raspar a página bloqueada nem contornar desafio.

## What Changes

1. Novo provedor `rivo` no `manifest.json`, nome `RIVO`, versão `1.0.0`, `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8", "mp4"]`, idioma `pt` e logo `https` do domínio.
2. Consulta direta ao player público por ID do TMDB, sem busca textual e sem `TMDB_API_KEY`: lista de servidores em `GET https://f.rivo.st/api/servers?v=7` e fontes em `GET https://f.rivo.st/api/source/<movie|tv>/<tmdbId>?server=<id>`, com `s` e `e` em séries.
3. Consulta isolada aos servidores de mídia publicados pela fonte, com descarte de falha por servidor e preservação das fontes dos demais. O servidor 4, que respondeu HTTP 401 nas URLs de mídia durante a investigação, fica fora da consulta; servidores sem fontes são ausência, não erro.
4. Seleção de fontes `hls` e `mp4` com URL HTTP(S). Fontes `dash`, formatos desconhecidos e respostas malformadas são descartados como opção inválida, sem interromper as demais.
5. Qualidade descoberta no rótulo da fonte pelo bloco `quality-discovery`; `Auto` e rótulos sem resolução saem como `Desconhecida`.
6. Idioma classificado a partir do rótulo da fonte: `Brazilian Portuguese` vira `Dublado`; `Portuguese` vira `Dublado (Não PT-BR?)`; `Portuguese sub` vira `Legendado (Não PT-BR?)`; idioma estrangeiro vira `Gringo`; rótulo sem idioma vira `Idioma Desconhecido`. Nenhum idioma é promovido sem indício no rótulo.
7. Legendas externas da mesma resposta do servidor, incluindo `pt` e `pb` quando anunciadas, com URL direta ou pelo proxy público de legendas do RIVO. Legendas de servidores diferentes não são misturadas com fontes de outro servidor.
8. Título e ano obtidos de `GET https://f.rivo.st/api/meta/<movie|tv>/<tmdbId>`, quando disponíveis, apenas para o `format`; falha do metadado não impede devolver as fontes já obtidas. O nome do episódio não é usado porque o formatador não expõe esse campo; temporada e episódio vêm do pedido do app.
9. Streams montados com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `RIVO`), tipo da fonte (`hls` ou `mp4`), servidor de origem em `provider`, lista ordenada por qualidade e sem `name`/`title` informados pelo provedor.
10. Tratamento de ausência e falha conforme o contrato: lista vazia para ausência reconhecida; falha de todas as opções sobe até `getStreams`, que registra `[RIVO] ...` e devolve `[]`; falha de um servidor ou de uma fonte descarta só aquela opção com `console.warn`.
11. Testes Node offline com fixtures sanitizadas cobrindo filme, episódio, ausência, falha isolada de servidor, falha de todas as opções, fonte inválida, deduplicação, idioma, legendas, qualidade desconhecida e entradas inválidas.
12. Build dos três formatos, entrada e seção em `providers.md` com status inicial `🟠 Não verificado` e rodada online do pacote final.
13. Registro em `docs/provider-investigation.md` do método “API de player que aceita o ID do TMDB e distribui a consulta por servidores”, com referência ao novo provedor e aos testes.

## Capabilities

### New Capabilities

- `rivo-catalog`: consulta do player público RIVO pelo ID do TMDB, descoberta dos servidores de mídia, seleção de fontes HLS/MP4 e montagem de streams com a qualidade, o idioma e as legendas anunciados pela fonte.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/rivo/` (entrada e extrator), reutilizando os blocos `http`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`; nenhum bloco novo.
2. Manifest e saída: `manifest.json`, `providers/rivo.js`, `gdrive/providers/rivo.js`, `prism/providers/rivo.js` e os manifests de formato gerados pelo build.
3. Testes: `test/rivo.test.js` e fixtures em `test/fixtures/rivo/`.
4. Documentação: `providers.md` (tabela e seção do provedor) e `docs/provider-investigation.md` (método de consulta por servidores do player).
5. Serviços externos: `f.rivo.st` (API do catálogo e do player), `1.rivo.st` (proxy HLS), `proxy.vidbolt.xyz` (proxy MP4), `dash-hls-bridge.johndoesdmc.workers.dev` (ponte HLS) e `subs.bright67.online` (legendas), todos públicos, sem conta e sem chave. As URLs de mídia são assinadas e efêmeras e não entram em fixture, documentação ou log.
6. Sem mudança de contrato global, de build ou de dependências; `docs/arch.md` e `src/_blocks/index.md` não mudam.
7. Estado atual da validação: `npm test` já apresenta 24 falhas por diretórios `test/maestro/` e `test/scenarios/` ausentes no repositório; a mudança não deve introduzir novas falhas e a implementação deve comparar o resultado com essa linha de base.
