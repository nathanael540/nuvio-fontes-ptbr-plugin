# Proposal

## Why

O AnimesFHD publica um catálogo de séries de anime com temporadas dubladas e legendadas e entrega HLS pelo próprio backend, sem conta para navegar no catálogo. O repositório ainda não cobre esse acervo. Em 13/11/2026 (BRT), a cadeia foi confirmada de ponta a ponta: catálogo HTML, ficha sazonal, API de episódio e playlist `#EXTM3U` de Demon Slayer S01E01 dublado; a busca JSON do site é privada (`401`) e não deve ser usada.

## What Changes

1. Adicionar o provedor `animesfhd`, com `tv`, em `src/animesfhd/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`.
2. Resolver o título pelo TMDB com `getMediaInfo`, usando `title`, `originalTitle`, `alternativeTitles` e `romajiTitles`; o catálogo usa nomes romanizados como "Kimetsu no Yaiba".
3. Buscar no catálogo público sem login: carrosséis de `GET https://animesfhd.net/api/home` e páginas `GET https://animesfhd.net/animes?page=<n>`, com teto documentado de 12 páginas. A rota privada `/api/animes/pesquisar` não é chamada.
4. Confirmar a obra pelo título e ano do cartão e abrir `GET /serie/<series_id>`; a ficha confirma o título e a temporada exibida.
5. Corrigir o mapeamento de temporada da proposta original: `first_episode_id + (episódio - 1)` não é válido (o ID seguinte respondeu HTTP 404). O provedor SHALL ler `versions` em `GET /api/episodes/<primeiro_episodio>` e usar o `series_id` sazonal da versão, cuja página publica os cartões `EP.N` reais.
6. Calcular o episódio global do TMDB para lidar com temporadas que a fonte agrupa (Demon Slayer: TMDB S02 com 7 episódios e S03 com 11 aparecem juntos na "2ª temporada" da fonte, com 18 episódios). A temporada 0 do TMDB não entra na soma.
7. Resolver `GET /api/episodes/<episode_id>` e devolver um stream HLS por `sources[]`, com `audio` da fonte, `provider` do rótulo e `headers` somente se comprovados. A qualidade fica `Desconhecida` quando o backend não declara resolução; não há sonda de mídia nem leitura de playlist para inventar qualidade.
8. Cobrir busca por carrossel, busca por catálogo em página posterior, série dublada, série legendada, temporada agrupada, episódio ausente, ausência de título e falha de estrutura com testes Node e fixtures reais sanitizadas.
9. Configurar a verificação online com o perfil exclusivo `anime` e registrar a rodada em `providers.md`. O status inicial é `🟠 Não verificado` até a execução explícita do pacote.
10. Não introduzir timeout próprio, retentativa com pausa, sonda obrigatória, `name`, `title`, `source_resolution` como qualidade ou defaults como 720p; esses itens da proposta original contrariam o contrato do repositório.

## Capabilities

### New Capabilities

- `animesfhd-provider`: localização de séries de anime no catálogo AnimesFHD a partir do TMDB, mapeamento de temporada e episódio pelas versões sazonais da fonte, resolução da API de episódio e contrato dos streams HLS devolvidos.

### Modified Capabilities

Nenhuma. A verificação online segue a capability `provider-online-verification` existente, apenas com um novo perfil de nicho.

## Impact

1. Código: `src/animesfhd/` (novo), `test/animesfhd.test.js` e fixtures em `test/fixtures/animesfhd/`.
2. Configuração: `manifest.json`, `test/online/profiles.json` (perfil `anime`), `providers.md` e `docs/provider-investigation.md` para registrar o método de catálogo HTML com versões sazonais e episódio global.
3. Saída gerada: `providers/animesfhd.js`, `gdrive/providers/animesfhd.js`, `prism/providers/animesfhd.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados e sem quebra de contrato para os provedores existentes.
5. Limites conhecidos: a busca anônima é a varredura de catálogo, limitada a 12 páginas de 30 cartões (cerca de 360 títulos) mais os carrosséis da home; títulos fora desse recorte ficam sem resultado. A fonte não publica resolução nos `sources`, então a qualidade fica desconhecida sem sonda. Apenas séries entram no escopo; filmes do catálogo ficam fora desta mudança.
