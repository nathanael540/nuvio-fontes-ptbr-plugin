# animesonlineblue-provider Specification

## Purpose
Localizar e confirmar séries de anime no Animes Online Blue a partir do ID do TMDB, ler a grade de temporadas e episódios pelo protocolo RSC, selecionar o áudio dublado ou legendado e devolver os MP4 progressivos publicados pelo player do Blogger.

## Requirements

### Requirement: Escopo seriado e identidade pelo TMDB

O provedor SHALL atender somente `mediaType` `tv` e SHALL devolver lista vazia para `movie` sem consultar a fonte. A entrada SHALL ser validada: `tmdbId` não numérico ou `mediaType` fora de `movie`/`tv` SHALL lançar erro. A busca SHALL acumular resultados das variantes PT-BR, original, alternativos brasileiros e romaji/romanizados do TMDB, escolhendo o candidato por título e ano com `findBestMatch`.

#### Scenario: Pedido de filme é recusado

- **WHEN** `getStreams` recebe `mediaType` `movie`
- **THEN** o provedor devolve lista vazia sem requisição ao Animes Online Blue.

#### Scenario: Entrada inválida

- **WHEN** `tmdbId` não é numérico ou `mediaType` não é `movie` nem `tv`
- **THEN** o provedor lança erro antes de qualquer requisição.

#### Scenario: Título romaji encontra a série

- **WHEN** o TMDB informa o título PT-BR "Demon Slayer: Kimetsu no Yaiba", o romaji "Kimetsu no Yaiba" e o ano 2019, e a busca pelo título PT-BR devolve a página do filme de 2025
- **THEN** o provedor acumula as variantes e escolhe a série de 2019 pelo título romaji e pelo ano.

#### Scenario: Nenhuma variante confirma o título

- **WHEN** todas as variantes de busca terminam sem candidato com título e ano compatíveis
- **THEN** o provedor devolve lista vazia, sem tratar a ausência como falha.

### Requirement: Grade de temporadas e episódios por RSC

O provedor SHALL ler `GET /anime/<slug>?_rsc=1` com o cabeçalho `RSC: 1` e extrair o bloco `temporadas` da resposta `text/x-component`. A temporada SHALL ser escolhida por `numero` e o episódio por `eps[].num`, nunca pela posição visual. Temporada ou episódio ausente SHALL produzir lista vazia.

#### Scenario: Episódio escolhido pelo par temporada e número

- **WHEN** a grade da série contém temporada 1 com episódio 1 e o pedido é S01E01
- **THEN** o provedor escolhe a entrada `numero: 1`, `num: 1` e segue para os áudios do episódio.

#### Scenario: Temporada não publicada

- **WHEN** a grade não contém a temporada pedida
- **THEN** o provedor devolve lista vazia, sem mapear temporada por posição.

#### Scenario: Bloco de temporadas inválido

- **WHEN** a resposta RSC não contém o bloco `temporadas` ou o JSON extraído é inválido
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

### Requirement: Áudios dublado e legendado independentes

O provedor SHALL resolver `GET /api/episodio/<id>` para cada identificador de áudio publicado no episódio (`dub` e `leg`) e SHALL tratar cada áudio como opção independente. O `tipo` ou `title` da resposta SHALL confirmar "Dublado" ou "Legendado"; a falha de um áudio SHALL preservar o outro, com aviso.

#### Scenario: Episódio com dublado e legendado

- **WHEN** o episódio publica `dub` e `leg` com identificadores e as duas consultas respondem 200
- **THEN** o provedor devolve um stream para cada áudio, com o idioma correspondente.

#### Scenario: Uma opção falha e a outra resolve

- **WHEN** a consulta do áudio dublado responde fora de 2xx e a legendada devolve `playerUrl` do Blogger
- **THEN** o provedor devolve o stream legendado e registra o aviso da opção dublada descartada.

#### Scenario: Todas as opções falham

- **WHEN** nenhuma consulta de áudio produz player e ao menos uma falhou
- **THEN** o provedor lança erro com a causa de cada opção.

#### Scenario: Episódio sem áudio publicado

- **WHEN** o episódio existe, mas `leg` e `dub` são nulos
- **THEN** o provedor devolve lista vazia, porque a ausência foi reconhecida.

### Requirement: Extração do player do Blogger

O provedor SHALL extrair os formatos progressivos de `streamingData.formats` no HTML de `blogger.com/video.g?token=...`, sem executar script remoto e sem chamada `batchexecute`. Cada formato com URL HTTP(S) e `mimeType` de vídeo SHALL virar um stream; formato sem URL válida SHALL ser descartado.

#### Scenario: Player do Blogger com um MP4 progressivo

- **WHEN** o HTML do Blogger publica um formato `itag: 18` com `qualityLabel: "360p"` e URL `googlevideo.com`
- **THEN** o provedor devolve um stream MP4 com qualidade "360p".

#### Scenario: Player do Blogger sem formatos

- **WHEN** o HTML não contém `streamingData.formats` ou a lista não tem MP4 válido
- **THEN** a opção daquele áudio é descartada com aviso e as demais são preservadas.

#### Scenario: Player de host não suportado

- **WHEN** `playerUrl` aponta para host que não é o Blogger nem arquivo de mídia direto
- **THEN** a opção é descartada por triagem, sem erro fatal.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, informando `type` `mp4`, `provider` do catálogo, `language` confirmado pelo áudio e a qualidade do rótulo do Blogger. Campos que a fonte não fornece SHALL ser omitidos, sem valores inventados.

#### Scenario: Stream legendado com qualidade declarada

- **WHEN** o áudio legendado resolve um formato com `qualityLabel` "360p"
- **THEN** o stream sai com `language` "Legendado", `quality` "360p", `type` "mp4" e `format` com título, ano, temporada e episódio.

#### Scenario: Qualidade não declarada

- **WHEN** o formato não traz `qualityLabel` reconhecível
- **THEN** o stream é preservado com "Desconhecida", sem requisição extra.

#### Scenario: Campos ausentes na fonte

- **WHEN** a fonte não oferece tamanho, legendas externas, seeders ou peers
- **THEN** esses campos não aparecem no stream.

### Requirement: Ausência reconhecida e ausência de sonda

O provedor SHALL devolver lista vazia somente para ausência reconhecida de título, temporada, episódio ou de todos os áudios. Falha de rede, HTTP fora de 2xx ou estrutura inesperada SHALL subir até `getStreams`, que registra com `[Animes Online Blue]` e devolve lista vazia. O provedor SHALL NOT instalar timeout, sonda de mídia, cache com validade ou settings de áudio/qualidade.

#### Scenario: Título ausente

- **WHEN** a busca não confirma nenhum candidato
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Falha de rede na busca

- **WHEN** a busca responde fora de 2xx ou o corpo não é JSON válido
- **THEN** o erro sobe até `getStreams`, é registrado com `[Animes Online Blue]` e a saída é lista vazia.

#### Scenario: Sem sonda de mídia

- **WHEN** o player do Blogger publica uma URL de `googlevideo.com`
- **THEN** o provedor devolve a URL publicada sem requisição `Range` e sem timeout próprio.
