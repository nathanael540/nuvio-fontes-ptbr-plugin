# Spec Delta

## Purpose

Localizar animes dublados e legendados no AniTube a partir do ID do TMDB, confirmando título, temporada, episódio ou filme antes de resolver os players e devolver streams compatíveis com o contrato do Nuvio.

## ADDED Requirements

### Requirement: Busca por variantes de título do TMDB

O provedor SHALL consultar a busca do AniTube com o título PT-BR, o título original, os títulos alternativos brasileiros e os títulos em romaji do TMDB. Para série, SHALL usar primeiro o título romaji anotado para a temporada pedida e, quando não houver, variantes com marcador numérico ou ordinal. Cada variante SHALL ser tentada até haver confirmação ou esgotarem-se as variantes.

#### Scenario: Título brasileiro não encontra a série

- **WHEN** o TMDB informa "Attack on Titan" e o AniTube publica a série como "Shingeki no Kyojin"
- **THEN** o provedor encontra a página pelo título romaji alternativo do TMDB.

#### Scenario: Título romaji específico da temporada

- **WHEN** o pedido é a 2ª temporada de "Kimetsu no Yaiba" e o TMDB registra "Kimetsu no Yaiba: Mugen Ressha-hen" para essa temporada
- **THEN** o provedor usa esse título na busca e não a página da 1ª temporada.

#### Scenario: Variante com número da temporada

- **WHEN** o TMDB não tem título romaji específico e o pedido é a 2ª temporada de "Jujutsu Kaisen"
- **THEN** o provedor consulta variantes como "Jujutsu Kaisen 2" e aceita somente a página que corresponde à temporada pedida.

#### Scenario: Nenhuma variante encontra o título

- **WHEN** todas as variantes de busca terminam sem candidato confirmado
- **THEN** o provedor devolve lista vazia, sem tratar a ausência como falha.

### Requirement: Confirmação de identidade na ficha

Um candidato SHALL ser confirmado somente quando o título da ficha coincidir com o título pedido ou com um alias entre parênteses, o tipo da página corresponder a filme ou série, o ano da ficha estiver a no máximo um ano do ano da série ou da temporada e o rótulo de áudio for consistente. Candidatos com temporada conflitante, outro tipo ou outra obra SHALL ser descartados.

#### Scenario: Ano da temporada confirma a ficha

- **WHEN** a ficha de "Jujutsu Kaisen 2" declara 2023 e o TMDB informa 2023 para a 2ª temporada
- **THEN** a ficha é aceita.

#### Scenario: Página de série longa não serve para temporada posterior

- **WHEN** o pedido é a 5ª temporada de uma série cuja única ficha declara o ano da 1ª temporada
- **THEN** a ficha é descartada em vez de usar um episódio de numeração contínua.

#### Scenario: Spin-off é descartado

- **WHEN** a busca por "One Piece" devolve "One Piece: Heroines" e a obra pedida é "One Piece"
- **THEN** o spin-off é descartado por não coincidir com o título completo nem com um alias.

#### Scenario: Temporada conflitante é descartada

- **WHEN** o pedido é a 2ª temporada e a busca devolve também "Jujutsu Kaisen 3"
- **THEN** a página da 3ª temporada é descartada mesmo com título-base semelhante.

#### Scenario: Tipo conflitante é descartado

- **WHEN** o pedido é de série e o candidato é uma ficha de filme, ou o pedido é de filme e a página não contém entrada de filme
- **THEN** o candidato é descartado.

### Requirement: Seleção de episódio e filme

Para série, o provedor SHALL escolher o episódio pelo número declarado no título do link da lista, e não pela posição visual. Para filme, SHALL usar a ficha direta do filme ou as entradas de filme de uma página agregadora, preservando as opções dublada e legendada disponíveis. Entradas de episódio SHALL ser ignoradas em pedido de filme.

#### Scenario: Episódio escolhido pelo número

- **WHEN** a lista da série contém "Episódio 07" fora de ordem e o pedido é o episódio 7
- **THEN** o link do episódio 7 é escolhido pelo número, não pela posição.

#### Scenario: Episódio ausente

- **WHEN** a lista da série confirmada não contém o número do episódio pedido
- **THEN** o provedor devolve lista vazia, sem escolher outro episódio.

#### Scenario: Filme agregado com duas opções

- **WHEN** a página do filme lista uma entrada legendada e uma dublada
- **THEN** o provedor resolve as duas entradas e devolve streams com os idiomas correspondentes.

#### Scenario: Ficha direta de filme

- **WHEN** a busca devolve diretamente a ficha de um filme, com players e sem lista de episódios
- **THEN** o provedor usa essa ficha como a entrada do filme.

#### Scenario: Página de episódios não atende filme

- **WHEN** a página confirmada contém somente episódios e nenhuma entrada de filme
- **THEN** o pedido de filme termina sem resultado, sem usar um episódio como filme.

### Requirement: Resolução independente dos players

Cada player publicado na ficha SHALL ser resolvido como opção independente. O player FHD SHALL ser lido como HLS, e o Player 1 SHALL ser seguido por `api.anivideo.net` até o player do Blogger, que fornece MP4 progressivo. A falha de uma opção SHALL descartar somente essa opção, com aviso; se nenhuma opção produzir stream, o provedor SHALL lançar erro com as causas.

#### Scenario: Player FHD entrega HLS

- **WHEN** a ficha contém o iframe do player FHD com o parâmetro do HLS
- **THEN** o provedor devolve o HLS com a qualidade informada pelo player.

#### Scenario: Player 1 entrega MP4 do Blogger

- **WHEN** a ficha contém o iframe do Player 1 e a cadeia chega ao player do Blogger
- **THEN** o provedor devolve os MP4 progressivos anunciados, com as qualidades correspondentes.

#### Scenario: Um player falha e o outro resolve

- **WHEN** o player FHD está indisponível, mas o Player 1 entrega um MP4 válido
- **THEN** o stream do Player 1 é devolvido e a falha do FHD é registrada como aviso.

#### Scenario: Todos os players falham

- **WHEN** todos os players da ficha falham e nenhum stream é produzido
- **THEN** o provedor lança erro com a causa de cada opção.

#### Scenario: Ficha sem player

- **WHEN** a ficha confirmada não contém nenhum iframe de player
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência do título.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, informando qualidade pelo rótulo do player ou do formato, idioma pelo rótulo de áudio da fonte, `provider` pelo player e `type` pelo formato entregue. A saída SHALL ser ordenada por qualidade. Legendas externas e tamanho SHALL ser omitidos quando a fonte não os fornece.

#### Scenario: Stream dublado em HLS

- **WHEN** a página é dublada e o player FHD informa 720p
- **THEN** o stream sai com `quality` 720p, `language` "Dublado" e `type` de HLS.

#### Scenario: Stream legendado em MP4

- **WHEN** a página é legendada e o Blogger anuncia 360p e 720p
- **THEN** os dois MP4 saem com `language` "Legendado" e as qualidades correspondentes.

#### Scenario: Qualidade desconhecida

- **WHEN** o player não informa qualidade reconhecível
- **THEN** o stream é preservado com "Desconhecida" e fica depois dos streams com qualidade.

#### Scenario: Campos não fornecidos

- **WHEN** a fonte não oferece legendas externas nem tamanho
- **THEN** esses campos não aparecem no stream, sem valores inventados.

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia somente para ausência reconhecida de título, episódio ou entrada de filme. Falha de rede, resposta inválida ou estrutura de página inesperada SHALL ser lançada até `getStreams`, que registra com `[AniTube]` e devolve lista vazia.

#### Scenario: Título ausente

- **WHEN** a busca não confirma nenhuma ficha para o título pedido
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Falha de rede na busca

- **WHEN** a busca responde fora de 2xx ou o corpo não é a página esperada
- **THEN** o erro sobe até `getStreams`, é registrado com `[AniTube]` e a saída é lista vazia.

#### Scenario: Lista de episódios ausente em página de série

- **WHEN** a ficha confirmada é de série, mas não contém a estrutura da lista de episódios
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.

#### Scenario: Opção isolada com stream preservado

- **WHEN** uma opção de player falha e outra produz stream
- **THEN** a execução termina com o stream válido, sem erro fatal.
