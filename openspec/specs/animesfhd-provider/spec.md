# animesfhd-provider Specification

## Purpose
Localizar séries de anime no catálogo AnimesFHD a partir do ID do TMDB, mapear temporada e episódio pelas versões sazonais da fonte e devolver streams HLS compatíveis com o contrato do Nuvio.

## Requirements

### Requirement: Busca no catálogo público

O provedor SHALL recusar `mediaType` diferente de `tv` e SHALL procurar o título nos carrosséis de `GET https://animesfhd.net/api/home` e nas páginas `GET https://animesfhd.net/animes?page=<n>`, com teto documentado de 12 páginas. A rota privada `/api/animes/pesquisar` SHALL NOT ser chamada.

#### Scenario: Título encontrado nos carrosséis

- **WHEN** o título pedido aparece em um carrossel da home com título e ano compatíveis
- **THEN** o provedor confirma o candidato e interrompe a varredura do catálogo.

#### Scenario: Título encontrado em página posterior

- **WHEN** o título não aparece nos carrosséis e está na oitava página do catálogo
- **THEN** o provedor percorre as páginas até encontrá-lo e confirma o candidato.

#### Scenario: Filme é recusado

- **WHEN** `mediaType` é `movie`
- **THEN** o provedor devolve lista vazia sem requisição externa.

#### Scenario: Título fora do teto de páginas

- **WHEN** o título não aparece em nenhuma das 12 páginas nem nos carrosséis
- **THEN** o provedor devolve lista vazia e registra no design que o recorte não é cobertura integral do catálogo.

### Requirement: Mapeamento de temporada e episódio global

O provedor SHALL calcular o episódio global do TMDB somando a contagem das temporadas regulares anteriores e SHALL selecionar a versão da fonte cuja faixa global contenha esse número. A temporada 0 do TMDB SHALL NOT entrar na soma.

#### Scenario: Temporada alinhada

- **WHEN** o pedido é S01E01 e a versão 1 da fonte cobre os episódios globais 1 a 26
- **THEN** o provedor seleciona o episódio local 1 da versão 1.

#### Scenario: Temporadas agrupadas pela fonte

- **WHEN** o pedido é S03E01, o TMDB soma 26 + 7 episódios anteriores e a versão 2 da fonte cobre os episódios globais 27 a 44
- **THEN** o provedor seleciona o episódio local 8 da versão 2.

#### Scenario: Episódio fora da faixa

- **WHEN** o episódio global calculado não está em nenhuma versão da fonte para o áudio pedido
- **THEN** o provedor devolve lista vazia, sem escolher outro episódio.

### Requirement: Seleção do episódio na versão sazonal

O provedor SHALL usar o `series_id` da versão selecionada para abrir `GET /serie/<series_id>` e SHALL escolher o cartão cujo rótulo `EP.<n>` corresponde ao episódio local calculado. O identificador do primeiro episódio SHALL NOT ser usado como base aritmética.

#### Scenario: Episódio local encontrado pelo rótulo

- **WHEN** a página da versão sazonal lista `EP.8 - Hashira Tengen Uzui, o Pilar do Som`
- **THEN** o provedor usa o link desse cartão e não o oitavo link por posição.

#### Scenario: Identificador seguinte não existe

- **WHEN** o identificador do primeiro episódio mais um responde HTTP 404
- **THEN** o provedor não usa essa aritmética e continua pela lista de cartões da versão sazonal.

#### Scenario: Versão sazonal sem o episódio

- **WHEN** a página da versão existe, mas não publica o rótulo do episódio local
- **THEN** o provedor devolve lista vazia para aquela opção.

### Requirement: Resolução da mídia e áudio

O provedor SHALL consultar `GET /api/episodes/<episode_id>` e SHALL tratar cada item de `sources[]` como uma opção independente, devolvendo HLS com o áudio e o rótulo da fonte. A URL relativa SHALL ser resolvida contra `https://animesfhd.net`.

#### Scenario: Fonte dublada

- **WHEN** o episódio resolvido publica uma fonte com `audio: dublado` e `url` relativa `/api/v/s6?...`
- **THEN** o provedor devolve um stream HLS com `language` "Dublado".

#### Scenario: Fonte legendada

- **WHEN** o episódio resolvido publica uma fonte com `audio: legendado`
- **THEN** o provedor devolve um stream HLS com `language` "Legendado".

#### Scenario: Uma fonte falha e outra resolve

- **WHEN** uma fonte tem URL inválida e outra tem URL válida
- **THEN** o provedor mantém a fonte válida e registra o aviso da fonte descartada.

#### Scenario: Todas as fontes falham

- **WHEN** todas as fontes do episódio falham e nenhum stream é produzido
- **THEN** o provedor lança erro com a causa de cada fonte.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, informando `type` HLS, `provider` do rótulo, `language` pelo áudio da fonte e `quality` somente quando a fonte declarar resolução reconhecível. Sem resolução, o stream SHALL ser preservado como "Desconhecida", sem sonda de mídia.

#### Scenario: Qualidade não declarada

- **WHEN** `source_resolution` é "catalog" e a URL não traz resolução
- **THEN** o stream sai com "Desconhecida" e continua na lista.

#### Scenario: Campos ausentes na fonte

- **WHEN** a fonte não oferece tamanho, legendas externas, seeders ou peers
- **THEN** esses campos não aparecem no stream.

#### Scenario: Idioma fora do vocabulário esperado

- **WHEN** o áudio da fonte não é `dublado` nem `legendado`
- **THEN** o texto é usado como dica local e o stream é preservado, sem inventar classificação.

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia somente para ausência reconhecida de título, temporada, episódio ou fonte. Falha de rede, HTML sem a estrutura esperada ou JSON inválido SHALL subir até `getStreams`, que registra com `[AnimesFHD]` e devolve lista vazia.

#### Scenario: Título ausente

- **WHEN** a busca não confirma nenhum candidato compatível
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Falha de rede na API de episódio

- **WHEN** `GET /api/episodes/<id>` responde fora de 2xx ou devolve JSON inválido
- **THEN** o erro sobe até `getStreams`, é registrado com `[AnimesFHD]` e a saída é lista vazia.

#### Scenario: Página sazonal sem estrutura

- **WHEN** a página da versão sazonal responde 2xx, mas não publica os cartões `EP.N`
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.
