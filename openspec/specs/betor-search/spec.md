# betor-search Specification

## Purpose

Garantir que o BeTor encontre itens indexados por IMDb ou TMDB sem aceitar conteúdo de outro tipo ou de outro título.

## Requirements

### Requirement: Busca com fallback de identificador

O BeTor SHALL consultar primeiro `imdb_id` com `item_type`; se a consulta concluir sem itens, SHALL tentar `tmdb_id` com `item_type`; se ainda não houver itens, SHALL tentar `tmdb_id` sem `item_type`. O fallback SHALL ocorrer somente após resposta válida com zero itens; erro HTTP, JSON inválido ou paginação inconsistente SHALL interromper a busca sem fallback.

#### Scenario: IMDb encontra o item

1. **WHEN** a consulta por `imdb_id` + `item_type` retorna ao menos um item
2. **THEN** as consultas de fallback não são executadas.

#### Scenario: Fallback para TMDB com tipo

1. **WHEN** a consulta por `imdb_id` retorna zero itens
2. **THEN** o BeTor tenta `tmdb_id` + `item_type` antes de qualquer consulta sem tipo.

#### Scenario: Fallback para TMDB sem tipo

1. **WHEN** as consultas com tipo retornam zero itens
2. **THEN** o BeTor consulta `tmdb_id` sem `item_type` e aplica a validação local de tipo e título.

#### Scenario: Erro não aciona fallback

1. **WHEN** a primeira consulta falha por HTTP, JSON inválido ou paginação inconsistente
2. **THEN** a busca é encerrada com erro, sem tentar o identificador seguinte.

### Requirement: Validação de tipo e título

Itens com `item_type` preenchido e diferente do tipo pedido SHALL ser descartados. Itens sem `item_type` SHALL ser aceitos somente quando o texto da release contiver o título esperado, considerando título, título original e alternativos; para `movie`, o ano SHALL ser exigido quando conhecido. Para `tv`, a triagem de temporada e episódio SHALL continuar valendo.

#### Scenario: Item sem tipo compatível

1. **WHEN** a consulta sem tipo retorna um item com `item_type` vazio cujo texto contém o título e o ano pedidos
2. **THEN** o item é aceito e segue para a resolução normal.

#### Scenario: Item sem tipo incompatível

1. **WHEN** a consulta sem tipo retorna um item com `item_type` vazio, mas o texto não contém o título ou o ano pedidos
2. **THEN** o item é descartado por triagem e não gera stream.

#### Scenario: Tipo conflitante

1. **WHEN** a consulta sem tipo retorna um item com `item_type` preenchido diferente de `movie` ou `tv` pedido
2. **THEN** o item é descartado, mesmo que o identificador numérico coincida.

#### Scenario: Série sem tipo mantém a triagem de episódio

1. **WHEN** um item `tv` sem `item_type` passa pela validação de título e ano, mas não contém a temporada ou o episódio pedidos
2. **THEN** ele continua sendo descartado pela triagem de episódio existente.

### Requirement: Paginação e falhas preservadas

Cada tentativa de busca SHALL manter a paginação com `size=100`, conferir `total`, detectar página vazia ou truncada e lançar erro explícito. Uma tentativa vazia SHALL liberar a próxima; uma tentativa com erro SHALL interromper a busca e não produzir lista parcial.

#### Scenario: Fallback paginado

1. **WHEN** a consulta sem tipo encontra mais de 100 itens em duas páginas
2. **THEN** todas as páginas são lidas e os itens são avaliados juntos.

#### Scenario: Fallback truncado

1. **WHEN** uma página do fallback retorna menos itens que o esperado antes de atingir o total
2. **THEN** a busca falha explicitamente, sem devolver apenas os itens já lidos.
