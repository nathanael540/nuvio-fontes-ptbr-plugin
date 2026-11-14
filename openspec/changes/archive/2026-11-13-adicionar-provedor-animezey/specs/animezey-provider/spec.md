# Spec Delta

## Purpose

Localizar filmes e episódios de anime no índice público do AnimeZeY a partir do ID do TMDB, validar a identidade e as coordenadas no nome do arquivo e devolver o MKV ou MP4 pelo host dedicado, no contrato do Nuvio.

## ADDED Requirements

### Requirement: Busca no índice por título e coordenadas

O provedor SHALL consultar `POST https://1.animezey23112022.workers.dev/1:search` com corpo JSON `{ q, page_token: null, page_index: 0 }` e validar a resposta `{ nextPageToken, curPageIndex, data: { files[] } }`. O worker secundário `1.animezeydl.workers.dev` SHALL NOT ser usado para streams enquanto o link dele no host dedicado não for reproduzível; `429`, `5xx` e falha de transporte do primário são falhas, não ausência.

#### Scenario: Busca de filme pelo título e ano

- **WHEN** o TMDB informa "A Viagem de Chihiro" (2001) e a busca devolve o arquivo `A Viagem de Chihiro (2001) [1080p][Dual Áudio].mkv`
- **THEN** o provedor aceita o arquivo como candidato do filme.

#### Scenario: Busca de episódio pelas coordenadas

- **WHEN** o pedido é S02E01 de uma série e a busca devolve `[Anitsu] Jujutsu Kaisen - S02E01 [BD 1080p x265 FLAC] [DUAL].mkv`
- **THEN** o provedor aceita o arquivo como candidato do episódio.

#### Scenario: Falha do primário não usa o secundário

- **WHEN** o worker primário responde `429` ou `5xx`
- **THEN** o provedor trata como falha e não monta stream com o link do worker secundário, cujo download respondeu `500`.

#### Scenario: Lista vazia é ausência

- **WHEN** o worker responde `200` com `data.files: []`
- **THEN** o provedor trata o termo como ausência e não troca de worker.

### Requirement: Validação de identidade, tipo e coordenadas

O provedor SHALL aceitar o arquivo somente quando o nome, depois de remover grupos e tags de release, corresponder ao título do TMDB e às coordenadas pedidas: `SxxExx`, `xxExx` ou o número do episódio para série; título e ano (quando o nome trouxer ano) para filme. Arquivo com temporada, episódio ou título divergente SHALL ser descartado.

#### Scenario: Resultado fuzzy de outra obra é descartado

- **WHEN** a busca por "Naruto S01E01" devolve episódios de "Boruto: Naruto Next Generations"
- **THEN** o provedor descarta os arquivos e devolve lista vazia.

#### Scenario: Temporada divergente é descartada

- **WHEN** o pedido é S01E01 e a busca devolve apenas `Demon.Slayer...S05E01...mkv`
- **THEN** o provedor descarta o arquivo e não o entrega como S01E01.

#### Scenario: Ano do filme divergente é descartado

- **WHEN** o pedido é o filme de 1988 e o nome do arquivo traz um ano diferente em mais de um ano
- **THEN** o provedor descarta o arquivo, mesmo com título parecido.

#### Scenario: Arquivo sem coordenadas em pedido de série

- **WHEN** o pedido é de série e o nome do arquivo não contém temporada nem episódio reconhecíveis
- **THEN** o provedor descarta o arquivo e não usa a posição na lista como coordenada.

### Requirement: Contrato dos streams MKV e MP4

O provedor SHALL montar cada stream com `buildStream` e `format`, com `url` no host dedicado `animezey16082023.animezey16082023.workers.dev` preservando o caminho e a query de `link`, `provider: 'AnimeZeY'`, `type` pela extensão e `size` formatado a partir de `size` em bytes. Qualidade e idioma SHALL ser descobertos localmente no nome do arquivo; sem evidência, a qualidade fica `Desconhecida` e o idioma `Idioma Desconhecido`.

#### Scenario: MKV dublado com qualidade no nome

- **WHEN** o arquivo aceito é `A Viagem de Chihiro (2001) [1080p][Dual Áudio].mkv`
- **THEN** o stream sai com `type` "mkv", qualidade "1080p", idioma "Dublado (Não PT-BR?)" e tamanho legível.

#### Scenario: Qualidade desconhecida

- **WHEN** o nome do arquivo não contém resolução reconhecível
- **THEN** o stream é preservado com "Desconhecida", sem requisição extra.

#### Scenario: Idioma não comprovado

- **WHEN** o nome do arquivo não contém `Dublado`, `Legendado`, `Dual` nem idioma reconhecível
- **THEN** o stream sai com "Idioma Desconhecido", sem promover português por suposição.

#### Scenario: URL assinada preservada

- **WHEN** o campo `link` traz `/download.aspx` com `file`, `expiry` e `mac`
- **THEN** o provedor usa o caminho e a query como recebidos no host dedicado, sem decodificar, recodificar ou registrar os parâmetros.

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia para busca sem arquivo compatível. Falha de rede, JSON inválido, `data.files` ausente ou um arquivo sem `link` SHALL ser isolada por arquivo/termo; se nenhum stream sair e alguma opção tiver falhado, o erro agregado SHALL subir até `getStreams`, que registra com `[AnimeZeY]` e devolve lista vazia.

#### Scenario: Nenhum arquivo compatível

- **WHEN** todos os termos terminam com lista vazia ou arquivos descartados por identidade
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Um arquivo falha e outro resolve

- **WHEN** um arquivo aceito não tem `link` e outro tem link válido
- **THEN** o provedor devolve o stream do arquivo válido e registra o aviso do arquivo descartado.

#### Scenario: Todos os arquivos falham

- **WHEN** todos os arquivos aceitos falham na montagem e nenhum stream é produzido
- **THEN** o provedor lança erro com a causa de cada arquivo.

#### Scenario: Estrutura inválida

- **WHEN** o worker responde `200` sem `data.files` ou com JSON inválido
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.
