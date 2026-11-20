## MODIFIED Requirements

### Requirement: Consulta pela API de extração

O provedor SHALL consultar a interface pública do Kairou por `POST /api/extract`, com corpo JSON contendo `target` (`<tmdbId>` em filme e `<tmdbId>/<season>/<episode>` em série), `title`, `originalTitle` e `isAnime`, enviando `imdbId` quando o TMDB o fornecer. A consulta SHALL respeitar os controles de acesso da fonte e não exigir conta, chave ou credencial externa.

#### Scenario: Filme consultado pelo ID do TMDB

- **WHEN** o app pede o filme TMDB `550`
- **THEN** o provedor envia `target` `550` por POST, sem temporada ou episódio.

#### Scenario: Episódio consultado com temporada e número

- **WHEN** o app pede a série TMDB `1396`, temporada `1`, episódio `1`
- **THEN** o provedor envia `target` `1396/1/1` por POST.

#### Scenario: Anime recebe a marcação da fonte

- **WHEN** o TMDB classifica o título como anime
- **THEN** o corpo da consulta inclui `isAnime: true`.

#### Scenario: Série sem temporada ou episódio válidos

- **WHEN** o pedido é de série e `season` ou `episode` não é inteiro a partir de 1
- **THEN** o provedor lança erro antes de qualquer requisição.

#### Scenario: Ausência reconhecida

- **WHEN** a extração responde HTTP 200 com `streams` como lista vazia
- **THEN** o provedor devolve lista vazia sem registrar falha.

#### Scenario: Interface indisponível

- **WHEN** a extração responde HTTP 404
- **THEN** o provedor registra a falha na fronteira e devolve lista vazia, sem classificá-la como ausência de título.

#### Scenario: Resposta inválida

- **WHEN** a extração responde com JSON inválido ou sem `streams` como lista
- **THEN** o provedor lança erro até a fronteira e devolve lista vazia, sem tratar como ausência.

#### Scenario: Opção 4K descartada

- **WHEN** uma opção traz `is4k: true` ou qualidade normalizada `4K`
- **THEN** somente essa opção é descartada por triagem, sem contar como falha.

#### Scenario: Áudio e legendas classificam o idioma

- **WHEN** a opção traz `isPtBr: true`
- **THEN** o idioma é `Dublado`; com `isPtBr: false` e legenda em português, é `Legendado`; sem legenda em português, é `Gringo`.

#### Scenario: Legendas externas do topo

- **WHEN** a resposta traz `subtitles` com `trackUrl` e `lang`
- **THEN** cada legenda válida é anexada com a URL resolvida e o idioma correspondente; legenda inválida é omitida sem descartar o vídeo.

#### Scenario: Falha isolada de uma opção

- **WHEN** uma opção tem `streamUrl` ausente ou fora de HTTP(S)
- **THEN** somente essa opção é descartada com aviso; se nenhuma opção produzir stream, o erro agregado sobe até a fronteira.
