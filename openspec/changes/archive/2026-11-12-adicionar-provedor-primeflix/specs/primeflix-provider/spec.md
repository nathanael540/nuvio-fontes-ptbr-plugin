# Spec Delta

## Purpose

Localizar, confirmar e reproduzir filmes e séries do Primeflix a partir do ID do TMDB, preservando tipo, temporada e episódio, com idioma e qualidade provados pela fonte e com ausência separada de falha.

## ADDED Requirements

### Requirement: Busca pública por título

O provedor SHALL consultar a busca JSON pública com o título PT-BR, o título original e os títulos alternativos do TMDB, nessa ordem, e SHALL parar no primeiro termo que devolver candidato confirmável. Quando a busca JSON não devolver candidato confirmável, SHALL tentar a página HTML de busca. A ausência de candidatos em todos os termos é ausência reconhecida.

#### Scenario: Título PT-BR encontra candidato

- **WHEN** a busca pelo título PT-BR devolve resultados e um deles confirma identidade e tipo
- **THEN** o provedor usa esse candidato e não consulta os termos seguintes.

#### Scenario: Título original encontra candidato

- **WHEN** o título PT-BR não devolve candidato confirmável
- **THEN** o provedor tenta o título original e os alternativos antes de concluir pela ausência.

#### Scenario: Busca JSON sem candidato com busca HTML preenchida

- **WHEN** a busca JSON devolve lista vazia ou resultados que não confirmam e a página HTML devolve resultados
- **THEN** o provedor usa os resultados da página HTML.

#### Scenario: Nenhum termo encontra candidato

- **WHEN** todos os termos terminam sem candidato confirmável
- **THEN** o provedor devolve lista vazia, sem erro fatal.

### Requirement: Confirmação de identidade e tipo na ficha

Cada candidato SHALL ser confirmado na ficha pelo título (PT-BR, original ou alternativo), pelo ano com tolerância de um ano e pelo tipo. A ficha de série SHALL conter pares `season`/`episode` ou marcador de série (`playlist`/`Temporada`); a de filme SHALL conter `v_id` e nenhum marcador de série. Candidato com título, ano ou tipo incompatível SHALL ser descartado sem gerar stream.

#### Scenario: Filme confirmado

- **WHEN** a ficha de um pedido de filme tem título compatível, ano dentro da tolerância e player sem temporada
- **THEN** o candidato segue para a resolução do filme.

#### Scenario: Série confirmada

- **WHEN** a ficha de um pedido de série tem título compatível, ano dentro da tolerância e pares `season`/`episode` ou marcador de série no player
- **THEN** o candidato segue para a resolução do episódio.

#### Scenario: Tipo incompatível

- **WHEN** um pedido de filme encontra ficha com marcador de série, ou um pedido de série encontra ficha sem marcador
- **THEN** o candidato é descartado e o provedor tenta o próximo.

#### Scenario: Ano incompatível

- **WHEN** a ficha informa ano mais de um ano distante do ano do TMDB
- **THEN** o candidato é descartado, mesmo com título semelhante.

### Requirement: Resolução de filme sem baixar a mídia

Para filme confirmado, o provedor SHALL resolver o redirecionamento público do player até a URL final de mídia e SHALL obter essa URL sem baixar o arquivo inteiro. A URL final SHALL ser HTTP(S) de vídeo (MKV, MP4 ou HLS). URL final ausente, fora de HTTP(S) ou sem extensão de mídia reconhecida SHALL lançar erro.

#### Scenario: Arquivo direto resolvido

- **WHEN** o player redireciona para um arquivo MKV ou MP4 e a URL final é obtida
- **THEN** o provedor monta um stream HTTP com a URL final.

#### Scenario: Playlist HLS no filme

- **WHEN** o player de um filme redireciona para uma playlist HLS
- **THEN** o provedor monta um stream HLS com a URL final.

#### Scenario: URL final inválida

- **WHEN** o redirecionamento termina em URL vazia, não HTTP(S) ou sem extensão de mídia
- **THEN** o provedor lança erro com a causa, sem montar stream.

### Requirement: Resolução de episódio

Para série confirmada, o provedor SHALL exigir que a ficha liste o par exato de temporada e episódio pedido e SHALL resolver o player desse par até a URL final de mídia. Par não listado na ficha é ausência. Par listado cujo player responde 404 SHALL ser tratado como falha da fonte, não como ausência.

#### Scenario: Episódio listado e resolvido

- **WHEN** a ficha lista `season` e `episode` iguais ao pedido e o player devolve uma URL de mídia
- **THEN** o provedor monta o stream do episódio.

#### Scenario: Temporada não listada

- **WHEN** a ficha não tem nenhum par da temporada pedida
- **THEN** o provedor devolve lista vazia.

#### Scenario: Episódio não listado

- **WHEN** a temporada existe na ficha, mas o episódio pedido não está listado
- **THEN** o provedor devolve lista vazia.

#### Scenario: Episódio listado sem mídia

- **WHEN** o par está na ficha e o player responde 404
- **THEN** o provedor lança erro, porque a fonte anunciou aquele episódio.

### Requirement: Idioma pela evidência da mídia

O idioma SHALL ser `Dublado` somente quando o caminho ou o nome do arquivo contiver `dub` ou `dublado`; `Legendado` somente com `leg` ou `legendado`; idioma estrangeiro conhecido sem português resulta em `Gringo`; sem evidência, `Idioma Desconhecido`. O provedor SHALL NOT inferir idioma pelo título, pela descrição do site ou pelo país de origem.

#### Scenario: Série dublada

- **WHEN** a URL final do episódio contém `_dub_`
- **THEN** o stream sai com `language` `Dublado`.

#### Scenario: Mídia legendada

- **WHEN** o caminho ou o nome do arquivo contém `leg` ou `legendado`
- **THEN** o stream sai com `language` `Legendado`.

#### Scenario: Sem evidência de idioma

- **WHEN** o caminho e o nome do arquivo não trazem marca de áudio ou legenda em português
- **THEN** o stream sai com `language` `Idioma Desconhecido`.

### Requirement: Qualidade pelos textos já obtidos

A qualidade SHALL ser descoberta somente nos textos já obtidos (nome do arquivo, caminho e rótulos), sem requisição extra. `CAM`, `CAMRIP`, `HDCAM`, `HD-TS` e `TELESYNC` SHALL prevalecer sobre a resolução; sem correspondência, a qualidade SHALL ser `Desconhecida`. O provedor SHALL NOT inventar qualidade a partir do título ou do ano.

#### Scenario: Resolução no nome do arquivo

- **WHEN** o nome do arquivo contém `1080p`
- **THEN** o stream sai com `quality` `1080p`.

#### Scenario: Gravação de cinema

- **WHEN** o nome do arquivo contém `camrip`
- **THEN** o stream sai com `quality` `CAM`, mesmo que o nome também traga uma resolução.

#### Scenario: Sem pista de qualidade

- **WHEN** nenhum texto obtido traz resolução ou rótulo de qualidade
- **THEN** o stream sai com `quality` `Desconhecida`.

### Requirement: Contrato do stream

Todo stream SHALL ser montado com `buildStream` e o campo `format` (`FORMATTER.AUTO`, `addon` `Primeflix`, título, ano, temporada/episódio quando houver e nome do arquivo), sem `name` nem `title`. O `provider` SHALL ser `Primeflix`, o `type` SHALL refletir a mídia (`hls` ou `mkv`/`mp4`) e campos opcionais SHALL entrar somente quando a fonte os fornecer.

#### Scenario: Stream de filme

- **WHEN** um filme é resolvido
- **THEN** o stream tem URL HTTP(S), `format` com título, ano e arquivo, e sem temporada ou episódio.

#### Scenario: Stream de episódio

- **WHEN** um episódio é resolvido
- **THEN** o stream tem URL HLS, `format` com título, ano, temporada, episódio e arquivo.

#### Scenario: Sem campos inventados

- **WHEN** a fonte não informa tamanho, legenda externa, seeders ou peers
- **THEN** esses campos não aparecem no stream.

### Requirement: Ausência reconhecida

Busca sem candidato, tipo ou ano incompatível, par de temporada/episódio não listado e candidato cuja ficha responde 404 SHALL resultar em lista vazia, sem erro fatal e sem stream parcial.

#### Scenario: Busca vazia

- **WHEN** todos os termos de busca terminam sem resultado
- **THEN** `getStreams` devolve lista vazia sem registrar erro.

#### Scenario: Episódio fora da ficha

- **WHEN** o par pedido não está listado na ficha da série
- **THEN** o provedor devolve lista vazia.

#### Scenario: Candidato removido

- **WHEN** a ficha de um resultado de busca responde 404
- **THEN** o candidato é descartado e, sem outro confirmável, a saída é lista vazia.

### Requirement: Falhas fatais e fronteira de erro

Layout sem `v_id`, busca com resposta inválida, player com 403 ou 5xx, player 404 para mídia anunciada e URL final que não é mídia SHALL lançar erro. Somente `getStreams` SHALL capturar a falha final, registrar `console.error('[Primeflix] ...')` e devolver lista vazia, sem lista parcial de etapa anterior.

#### Scenario: Layout alterado

- **WHEN** a ficha responde 200 sem `v_id` no player
- **THEN** o provedor lança erro e `getStreams` registra a falha e devolve lista vazia.

#### Scenario: Player bloqueado

- **WHEN** o player responde 403 ou 5xx
- **THEN** o provedor lança erro e `getStreams` registra a falha e devolve lista vazia.

#### Scenario: Mídia anunciada sem resposta

- **WHEN** o par de episódio está na ficha e o player responde 404
- **THEN** o provedor lança erro e `getStreams` registra a falha e devolve lista vazia.
