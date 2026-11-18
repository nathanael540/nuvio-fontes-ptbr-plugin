# Proposal

## Why

O MagnetBR é um indexador brasileiro público que reúne torrents de filmes, séries e animes de sete catálogos (Rede Torrents, Starck Filmes, Tfilme, Comando, Bludv, TorrentClaw e outros) em uma única API JSON, consultável por IMDb, temporada e episódio. Nenhum provedor deste repositório cobre esse acervo agregado. A definição pública de Prowlarr/Jackett do MagnetBR, consultada em 2026-11-14 e 2026-11-16, descreve o contrato; as consultas de reconhecimento registradas no `design.md` confirmam a resposta. Adicionar o provedor amplia a cobertura de torrent sem chave, sem conta e sem serviço intermediário.

## What Changes

1. Adicionar o provedor `magnetbr`, com `movie` e `tv`, em `src/magnetbr/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0` e formato `["magnet"]`.
2. Consultar `GET https://magnetbr.flixbr.online/indexers/db` com `q` igual ao IMDb do TMDB quando existir e aos títulos PT-BR/original como fallback, enviando `season` e `ep` em série. Usar somente o catálogo completo (`db`), sem expor a escolha de fonte do Prowlarr.
3. Em série, fazer duas consultas por identidade: a exata (`season` + `ep`) para episódios e a da temporada (`season`, sem `ep`) para localizar pacotes. Unir os resultados sem repetir hash.
4. Triar localmente por IMDb, tipo, título, ano, temporada e episódio; descartar coleções de filmes, temporadas conflitantes e o falso positivo de outra produção com o mesmo IMDb.
5. Resolver pacote de temporada pelo cache público itorrents.org e devolver `torrent://<hash>/<índice>` somente quando houver exatamente um arquivo do episódio; sem essa identificação, descartar o pacote.
6. Montar todo stream com `buildStream` e `format`, com qualidade descoberta nos textos da release, tamanho plausível, `provider` igual ao catálogo de origem (`scraper_source`), seeders e peers. Não inventar tamanho nem contagem quando a fonte devolve metadado corrompido.
7. Classificar o idioma por `audio_tags` e `legend`, usando o enum `LANGUAGE`; não usar o campo `title_processed`/`title` do indexador como prova de região brasileira, porque o marcador `[Brazilian]` é derivado de `audio_tags`.
8. Distinguir ausência de falha: `count: 0` com `queued: true` é ausência no catálogo (a fonte agenda indexação em segundo plano), não erro. Falha de busca, JSON inválido e estrutura fora do contrato sobem para `getStreams`.
9. Cobrir com testes Node e fixtures reais sanitizadas: filme por IMDb e por título, episódio exato, pacote de temporada, hash base32, tamanho corrompido, coleção, temporada conflitante, falso positivo de ano, ausência com `queued`, falha HTTP/JSON, erro agregado e log sanitizado.
10. Registrar a linha e a seção do MagnetBR em `providers.md` com status inicial `🟠 Não verificado` e atualizar `docs/provider-investigation.md` §3.6 com a variação do indexador JSON que aceita IMDb + temporada/episódio e enfileira indexação. Nenhum bloco novo.
11. Fora do escopo: settings de fonte (`scraper_type`), endpoints por catálogo, paginação profunda, upload de `.torrent`, conta Google, Prowlarr/Radarr/Sonarr, legendas externas, sonda de mídia e cache de resultados.

## Capabilities

### New Capabilities

- `magnetbr-provider`: busca no catálogo agregado do MagnetBR por IMDb ou título, triagem de identidade, resolução de episódio avulso e pacote de temporada, classificação de idioma e contrato dos streams.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/magnetbr/` (novo), `test/magnetbr.test.js` e fixtures em `test/fixtures/magnetbr/`.
2. Configuração: `manifest.json` e `providers.md`.
3. Documentação: `docs/provider-investigation.md` §3.6.
4. Saída gerada: `providers/magnetbr.js`, `gdrive/providers/magnetbr.js`, `prism/providers/magnetbr.js` e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; o fluxo usa os blocos `tmdb-info`, `http`, `title-match`, `torrent-release`, `torrent-files`, `stream-build`, `custom-formatter`, `language-discovery`, `quality-discovery` e `slugify`.
6. Sem migração de dados, sem mudança de contrato para os provedores atuais e sem chave ou serviço externo além do `TMDB_API_KEY` fornecido pelo app.
7. Limite conhecido: a fonte só indexa parte do acervo em nível de episódio. Uma busca sem correspondência imediata pode devolver `queued: true`; a próxima chamada pode encontrar o item, mas o provedor não espera nem repete a consulta.
