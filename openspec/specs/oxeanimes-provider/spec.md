# oxeanimes-provider Specification

## Purpose
Localizar e confirmar filmes e séries de anime no OxeAnimes a partir do ID do TMDB, escolher as entradas dublada e legendada, selecionar o episódio na página da obra e devolver o HLS do proxy de streaming da plataforma.

## Requirements

### Requirement: Identidade por títulos do TMDB

O provedor SHALL validar a entrada e SHALL lançar erro para `tmdbId` não numérico ou `mediaType` fora de `movie`/`tv`. A busca SHALL consultar `GET /api/chat-search?q=<termo>` com título PT-BR, original, alternativos brasileiros e romaji/romanizados do TMDB, acumulando os itens de `/anime/` por `href`.

#### Scenario: Entrada inválida

- **WHEN** `tmdbId` não é numérico ou `mediaType` não é `movie` nem `tv`
- **THEN** o provedor lança erro antes de qualquer requisição.

#### Scenario: Variantes acumuladas

- **WHEN** a busca pelo título PT-BR devolve um arco e a busca pelo romaji devolve a série
- **THEN** o provedor acumula os dois itens e não descarta o segundo por já ter resultado.

### Requirement: Opções de áudio e escolha de candidato

Cada item acumulado SHALL ser classificado como dublado quando o título ou o slug contiver `dublado`, e como legendado nos demais casos. O melhor candidato de cada áudio SHALL ser escolhido por `titleSimilarity` contra os títulos do TMDB, com limiar de 0,60.

#### Scenario: Entradas dublada e legendada separadas

- **WHEN** a busca de "Kimetsu no Yaiba" devolve `/anime/kimetsu-no-yaiba` e `/anime/kimetsu-no-yaiba-dublado`
- **THEN** o provedor resolve uma opção legendada e uma dublada de forma independente.

#### Scenario: Título exato vence página de arco

- **WHEN** a busca devolve a série "Kimetsu no Yaiba" e o filme "Demon Slayer - Kimetsu no Yaiba Castelo Infinito"
- **THEN** a pontuação do título exato escolhe a série, e não a página do arco.

#### Scenario: Nenhum candidato atinge o limiar

- **WHEN** todos os itens ficam abaixo de 0,60 em todos os termos
- **THEN** o provedor devolve lista vazia, sem erro.

### Requirement: Seleção do episódio na página da obra

O provedor SHALL abrir `/anime/<slug>` e mapear cada link `/watch/<id>?anime=...&slug=...` ao número lido do texto ou do `alt` do cartão (`Episódio N`). Para série, SHALL escolher o número pedido; para filme, SHALL usar a entrada única de episódio. Link sem número legível SHALL ser erro de estrutura, não posição presumida.

#### Scenario: Episódio encontrado pelo número

- **WHEN** a página lista `Episódio 1` a `Episódio 26` e o pedido é S01E01
- **THEN** o provedor escolhe o link do episódio 1.

#### Scenario: Episódio ausente na página

- **WHEN** a página da temporada não lista o número pedido
- **THEN** o provedor devolve lista vazia para aquele áudio, sem escolher outro episódio.

#### Scenario: Filme com uma entrada

- **WHEN** a página do filme tem um único link de reprodução
- **THEN** o provedor usa esse link como a mídia do filme.

### Requirement: Resolução pelo proxy de streaming

O provedor SHALL consultar `GET /api/episode/<id>?slug=<slug>` com `Referer` e SHALL usar `streamUrl` ou a primeira fonte `type: "hls"`. A URL relativa SHALL ser resolvida contra `https://oxeanimes.com.br`. O `tipo` ou `title` do episódio SHALL confirmar o idioma; fonte `embed` SHALL ser descartada por triagem.

#### Scenario: Episódio com streamUrl de proxy

- **WHEN** a API do episódio devolve `streamUrl: "/api/stream?url=..."` e `tipo` "Legendado"
- **THEN** o provedor devolve a URL absoluta do proxy com idioma "Legendado" e `Referer` do site.

#### Scenario: Fonte HLS em sources

- **WHEN** `streamUrl` está ausente e `sources` traz uma fonte `type: "hls"`
- **THEN** o provedor usa a URL dessa fonte.

#### Scenario: API sem fonte HLS

- **WHEN** a resposta só tem fonte `embed` ou não tem fonte reconhecível
- **THEN** a opção daquele áudio é descartada por triagem e as demais são preservadas.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, informando `type` `hls`, `provider` do catálogo, `language` confirmado pela fonte, `headers` de reprodução com `Referer` e `quality` somente quando o rótulo declarar resolução. A qualidade não declarada SHALL permanecer "Desconhecida".

#### Scenario: Stream legendado com Referer

- **WHEN** a opção legendada resolve o proxy HLS
- **THEN** o stream sai com `language` "Legendado", `type` "hls", `headers.Referer` do site e `format` com título e ano.

#### Scenario: Rótulo sem resolução

- **WHEN** a fonte rotula a opção como "FHD" sem resolução numérica
- **THEN** o stream é preservado com "Desconhecida", sem sonda da playlist.

#### Scenario: Campos ausentes na fonte

- **WHEN** a fonte não oferece tamanho, legendas externas, seeders ou peers
- **THEN** esses campos não aparecem no stream.

### Requirement: Ausência reconhecida e ausência de sonda

O provedor SHALL devolver lista vazia somente para ausência reconhecida de obra, episódio ou de todas as opções de áudio. Falha de rede, HTTP fora de 2xx ou estrutura inesperada SHALL subir até `getStreams`, que registra com `[OxeAnimes]` e devolve lista vazia. O provedor SHALL NOT instalar timeout, sonda de mídia, cache com validade ou settings de áudio/qualidade.

#### Scenario: Título ausente

- **WHEN** nenhuma variante de busca atinge o limiar
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Falha de rede na API do episódio

- **WHEN** `/api/episode` responde fora de 2xx ou o corpo não é JSON válido
- **THEN** o erro sobe até `getStreams`, é registrado com `[OxeAnimes]` e a saída é lista vazia.

#### Scenario: Sem sonda da master

- **WHEN** a API publica a URL do proxy
- **THEN** o provedor devolve a URL sem baixar a playlist e sem timeout próprio.
