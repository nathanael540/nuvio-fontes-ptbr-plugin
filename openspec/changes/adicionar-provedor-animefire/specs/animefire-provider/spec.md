# Spec Delta

## Purpose

Localizar filmes e séries de anime no AnimeFire a partir do ID do TMDB, confirmando título, tipo, temporada e episódio antes de resolver a API de episódio e devolver streams HLS compatíveis com o contrato do Nuvio.

## ADDED Requirements

### Requirement: Busca por títulos do TMDB

O provedor SHALL consultar a busca pública do AnimeFire com o título PT-BR, o título original e os títulos alternativos brasileiros do TMDB, em ordem, e SHALL percorrer as páginas de resultados até encontrar um candidato confirmado ou esgotar as variantes. A busca SHALL parar na primeira variante que produzir candidato confirmado.

#### Scenario: Título PT-BR encontra a série

- **WHEN** o TMDB informa o título PT-BR de uma série publicada com o mesmo título no AnimeFire
- **THEN** o provedor confirma o candidato pelo título e pelo ano, sem tentar as variantes seguintes.

#### Scenario: Título original encontra a obra

- **WHEN** a busca pelo título PT-BR não confirma nenhum candidato e o título original do TMDB aparece na fonte
- **THEN** o provedor consulta o título original e confirma o candidato correspondente.

#### Scenario: Resultado exato em página posterior

- **WHEN** a busca devolve vários resultados e o candidato exato está em uma página posterior à primeira
- **THEN** o provedor percorre as páginas seguintes até confirmar o candidato ou esgotar a busca.

#### Scenario: Nenhuma variante encontra o título

- **WHEN** todas as variantes de busca terminam sem candidato confirmado
- **THEN** o provedor devolve lista vazia, sem tratar a ausência como falha.

### Requirement: Confirmação de identidade e tipo na ficha

O provedor SHALL aceitar o candidato somente quando o título e o ano forem compatíveis com o TMDB e o campo `format` da ficha (`GET /anime/<id>`) corresponder ao tipo pedido: `movie` para filme e `tv` para série. Candidato de tipo conflitante SHALL ser descartado sem interromper a busca.

#### Scenario: Ficha de série para pedido de série

- **WHEN** o candidato confirmado tem `format: tv` e o pedido é de série
- **THEN** o provedor prossegue para a seleção do episódio.

#### Scenario: Ficha de filme para pedido de filme

- **WHEN** o candidato confirmado tem `format: movie` e o pedido é de filme
- **THEN** o provedor usa a entrada de episódio da própria ficha de filme.

#### Scenario: Tipo conflitante é descartado

- **WHEN** o candidato com título compatível tem `format: movie` e o pedido é de série, ou o contrário
- **THEN** o candidato é descartado e o provedor continua a busca pelas demais variantes.

### Requirement: Seleção de episódio e filme

Para série, o provedor SHALL escolher o episódio pelo par `season`/`number` da lista de episódios da ficha, e não pela posição visual. Para filme, SHALL usar a única entrada de episódio da ficha confirmada como filme. A ausência do par pedido ou da entrada de filme SHALL produzir lista vazia.

#### Scenario: Episódio escolhido pelo par temporada e número

- **WHEN** a lista da série contém temporada 2, episódio 3 fora de ordem e o pedido é S02E03
- **THEN** o provedor escolhe a entrada com `season: 2` e `number: 3`.

#### Scenario: Episódio ausente na temporada

- **WHEN** a temporada existe na ficha, mas não contém o número do episódio pedido
- **THEN** o provedor devolve lista vazia e não escolhe outro episódio.

#### Scenario: Temporada não publicada

- **WHEN** a ficha da série não tem nenhuma entrada com a temporada pedida
- **THEN** o provedor devolve lista vazia, sem tentar mapear a temporada por posição.

#### Scenario: Filme com entrada única

- **WHEN** a ficha confirmada é de filme e contém uma única entrada de episódio
- **THEN** o provedor usa essa entrada como a mídia do filme.

### Requirement: Resolução da mídia por áudio

O provedor SHALL resolver `GET /episode/<id>` e tratar cada opção de áudio publicada (`dublado` ou `legendado`) como uma opção independente. Opção marcada como `is_offline` SHALL ser descartada por triagem; falha de uma opção SHALL preservar as demais, com aviso. Se nenhuma opção produzir stream e alguma tiver falhado, o provedor SHALL lançar erro com as causas.

#### Scenario: Episódio com dublado e legendado

- **WHEN** a resposta do episódio publica as duas opções de áudio e nenhuma está offline
- **THEN** o provedor devolve um stream para cada opção, com o idioma correspondente.

#### Scenario: Opção offline é descartada

- **WHEN** a opção legendada está marcada como `is_offline` e a dublada está disponível
- **THEN** somente a dublada produz stream, sem erro fatal.

#### Scenario: Uma opção falha e a outra resolve

- **WHEN** a opção dublada não tem URL e a legendada tem URL válida
- **THEN** o provedor devolve o stream legendado e registra o aviso da opção descartada.

#### Scenario: Todas as opções falham

- **WHEN** todas as opções de áudio falham e nenhum stream é produzido
- **THEN** o provedor lança erro com a causa de cada opção.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, informando `type` HLS, `provider` do catálogo, `language` conforme o áudio da fonte, `quality` pela maior resolução declarada em `qualities` e cabeçalhos de reprodução do CDN. Campos que a fonte não fornece SHALL ser omitidos, sem valores inventados.

#### Scenario: Stream dublado com qualidade declarada

- **WHEN** a opção dublada declara as qualidades `480p`, `720p` e `1080p`
- **THEN** o stream sai com `language` "Dublado", `quality` "1080p" e `type` de HLS.

#### Scenario: Qualidade não declarada

- **WHEN** a opção de áudio não traz nenhuma qualidade reconhecível
- **THEN** o stream é preservado com "Desconhecida", sem descarte e sem requisição extra.

#### Scenario: Campos ausentes na fonte

- **WHEN** a fonte não oferece tamanho, legendas externas, seeders ou peers
- **THEN** esses campos não aparecem no stream.

#### Scenario: Áudio fora do vocabulário esperado

- **WHEN** a opção de áudio não é `dublado` nem `legendado`
- **THEN** o provedor usa o texto como dica de idioma e preserva o stream, sem inventar uma classificação.

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia somente para ausência reconhecida de título, episódio, entrada de filme ou de toda opção de áudio. Falha de rede, JSON inválido ou estrutura inesperada SHALL ser lançada até `getStreams`, que registra com `[AnimeFire]` e devolve lista vazia.

#### Scenario: Título ausente

- **WHEN** a busca não confirma nenhuma ficha para o título pedido
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Falha de rede na busca

- **WHEN** a busca responde fora de 2xx ou o corpo não é JSON válido
- **THEN** o erro sobe até `getStreams`, é registrado com `[AnimeFire]` e a saída é lista vazia.

#### Scenario: Estrutura de episódio inválida

- **WHEN** a ficha confirmada é de série, mas a lista de episódios não existe ou não é uma lista
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.

#### Scenario: Todas as opções offline

- **WHEN** todas as opções de áudio do episódio estão marcadas como offline
- **THEN** a saída é lista vazia, porque a indisponibilidade foi reconhecida pela própria fonte.
