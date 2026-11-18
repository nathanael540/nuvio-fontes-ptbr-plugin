# Proposal

## Why

O Otakulogia é um catálogo brasileiro de animes com filmes e séries em MP4 direto, servido por um endpoint GraphQL público que o próprio site consome. A fonte não exige conta, chave, token ou cookie e ainda não está representada neste repositório. Além de ampliar a cobertura de anime, ela é a primeira fonte GraphQL do projeto: a leitura estruturada de `searchAnimes` e `animeCatalogDetail` substitui a busca HTML e reduz a dependência de seletores de layout.

A evidência de contrato é o código publicado do Prisma Stream Addon (GPL-3.0), não uma prova de funcionamento online. Uma observação pontual do endpoint em 2026-11-14 confirmou o envelope e a forma dos campos, mas não comprova o pacote deste repositório; a rodada online do pacote final fica como tarefa de implementação.

## What Changes

1. Adicionar `src/otakulogia/` com `index.js` (contrato do app e captura única), `api.js` (transporte GraphQL e queries), `catalog.js` (busca, identidade, temporada e episódio) e `extractor.js` (montagem dos streams), em JavaScript puro com JSDoc; o trecho portado do Prisma leva o comentário `Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)`.
2. Consultar `POST https://api.otakulogia.com/graphql` com corpo JSON `{query, variables}`, `User-Agent` de navegador, `Origin: https://otakulogia.com` e `Referer: https://otakulogia.com/`, usando a query de busca com `{"input": {"query": "<título>", "limit": 12}}` e a query de detalhe com `{"upstreamCid": <inteiro>, "upstreamTid": null}`. Resposta com `errors` não vazio, `data` ausente, corpo não JSON ou estrutura inesperada é erro, nunca ausência.
3. Confirmar a identidade comparando `name` e `nameEn` normalizados com o título PT-BR, o original, os alternativos brasileiros e os romaji do TMDB; quando os dois lados tiverem ano, aceitar diferença de até um ano. As buscas rodam em paralelo e param no primeiro termo com correspondência, com até três itens confirmados para o detalhe.
4. Selecionar a temporada pela linha `seasons[]` cujo `name` seja `Temporada N` (com zero à esquerda e sufixo após `|`) ou `Filme`, nunca pela posição no array; filtrar os episódios pelo `upstreamTempId` igual ao `upstreamTid` da temporada escolhida.
5. Selecionar o episódio pelo número extraído da URL de `videoUrl` (último token numérico antes de `.mp4`, aceitando `1.mp4` e `ep01.mp4`), após ordenar a temporada por esse número e exigir sequência contígua começando em 1. `episodeNumber` não entra na seleção: a sondagem de 2026-11-16 mostrou o mesmo valor repetido em todos os episódios da temporada, compatível com o total de episódios.
6. Montar cada stream com `buildStream` e `format`, usando o primeiro endereço HTTP(S) válido entre `videoUrl`, `videoUrlFhd` e `videoUrlSd`, qualidade `FHD` ou `SD` quando a URL usada for a do campo correspondente (sem correspondência, deixar a descoberta local), idioma `Dublado` para `audioType` com `DUB` e `Legendado` para `LEG` (sem marcação, omitir), `type` `mp4` e somente `User-Agent` nos cabeçalhos de reprodução.
7. Isolar a falha de cada candidato de detalhe com `console.warn('[Otakulogia] Opção <upstreamCid> descartada: <causa>')`, preservando os demais; se nenhum produzir stream e algum tiver falhado, lançar erro agregado. Somente `getStreams` captura a falha final, registra com `console.error('[Otakulogia] ...')` e devolve lista vazia. Sem timeout, retentativa, cache ou requisição extra de qualidade.
8. Cobrir com testes Node e fixtures reais sanitizadas: correspondência exata e por `nameEn`, ano fora da tolerância, ausência de correspondência, série com duas temporadas, filme em `Filme` e em temporada de episódio único, episódios fora de ordem, URL sem número, sequência com buraco, `episodeNumber` repetido, `videoUrl` vazio com FHD/SD, `audioType` DUB/LEG/desconhecido, `errors` GraphQL, corpo não JSON, lista vazia e URLs duplicadas.
9. Registrar `otakulogia` no `manifest.json` como versão `1.0.0`, tipos `movie` e `tv`, formatos `mp4`, idioma `pt` e o favicon do domínio como logo.
10. Adicionar a linha e a seção `Otakulogia` em `providers.md` com status inicial `🟠 Não verificado` e data `—`, substituídas após a rodada online.
11. Incluir `otakulogia` em `test/online/profiles.json` com `exclusiveTag: "anime"` e revisão nova, porque o catálogo é exclusivo de anime e o perfil generalista mediria títulos fora do acervo.
12. Documentar o método em `docs/provider-investigation.md` como “GraphQL público de catálogo de animes”, com queries, variáveis, leitura de `items`/`seasons`/`episodes`, confirmação por título/ano e limites, referenciando `src/otakulogia/` e `test/otakulogia.test.js`.
13. Fora do escopo: conta, login, downloads, player do site, sondagem de mídia, cache de URLs, contorno de bloqueio, novos blocos compartilhados e qualquer fonte que não seja o GraphQL público. O provedor não trata HLS porque a fonte publica somente MP4.

## Capabilities

### New Capabilities

- `otakulogia-provider`: consulta do GraphQL público do Otakulogia, confirmação de identidade por título e ano, seleção de temporada e episódio (incluindo filmes na temporada `Filme`) e contrato dos streams MP4 com qualidade e áudio declarados.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/otakulogia/` (novo), `test/otakulogia.test.js` e fixtures em `test/fixtures/otakulogia/`.
2. Configuração: `manifest.json`, `providers.md` e `test/online/profiles.json`.
3. Documentação: `docs/provider-investigation.md`.
4. Saída gerada: `providers/otakulogia.js`, `gdrive/providers/otakulogia.js`, `prism/providers/otakulogia.js` e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; o fluxo usa os blocos existentes `tmdb-info`, `slugify`, `http`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`, sem bloco novo porque há um único consumidor GraphQL.
6. Sem migração de dados, sem mudança de contrato para os provedores atuais e sem nova chave ou serviço externo.
7. Limites conhecidos da fonte: a busca é textual, sem paginação, e devolve no máximo 12 itens por termo; o schema GraphQL não é versionado; `episodeNumber` não representa o número do episódio (a sondagem de 2026-11-16 o viu repetido em toda a temporada), então a seleção usa a URL; `videoUrlFhd` e `videoUrlSd` estavam vazios na amostra; o MP4 respondeu 206 com `User-Agent` e com `User-Agent` + `Referer`, mas um título expirou só com `User-Agent`, então o `Referer` será confirmado na implementação.
