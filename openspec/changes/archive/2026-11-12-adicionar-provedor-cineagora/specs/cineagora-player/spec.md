# Spec Delta

## Purpose

Resolver os espelhos de áudio do CineAgora no player BrStream e devolver streams HLS para filmes e episódios de série.

## ADDED Requirements

### Requirement: Descoberta dos espelhos de áudio

O provedor SHALL ler os botões `.mirrors .button` com `data-link`, manter somente links de `watch.brstream.cc` e associar o texto do botão à opção. Trailer do YouTube e hosts desconhecidos SHALL ser descartados por triagem.

#### Scenario: Filme com dublado e legendado

- **WHEN** a página publica um botão `Dublado` e outro `Legendado` para o player BrStream
- **THEN** o provedor trata cada botão como uma opção independente.

#### Scenario: Somente trailer

- **WHEN** a página só oferece trailer do YouTube
- **THEN** o provedor reconhece ausência e não produz streams.

#### Scenario: Host desconhecido

- **WHEN** um botão aponta para host diferente de `watch.brstream.cc`
- **THEN** ele é descartado sem interromper as demais opções.

#### Scenario: Rótulo de áudio desconhecido

- **WHEN** o botão BrStream não traz `Dublado` nem `Legendado`
- **THEN** o provedor preserva a opção e usa o nome da release como dica de idioma.

### Requirement: Resolução de filme no BrStream

Para espelho `watch.brstream.cc/watch`, o provedor SHALL abrir a página, extrair o objeto `video` e exigir `type` HLS, `status` ativo, `uid`, `md5` e `id`. A URL do stream SHALL ser `https://watch.brstream.cc/m3u8/<uid>/<md5>/master.txt?s=1&id=<id>&cache=<status>`.

#### Scenario: Objeto de vídeo válido

- **WHEN** a página traz `video` com `type: "hls"`, `status: "1"`, `uid`, `md5` e `id` válidos
- **THEN** o provedor monta a URL da playlist master e devolve um stream.

#### Scenario: Página sem objeto de vídeo

- **WHEN** a página do player não traz o objeto `video`
- **THEN** a opção falha e não é tratada como ausência do título.

#### Scenario: Campos inválidos

- **WHEN** `uid`, `md5`, `id` ou `status` estão ausentes ou fora do formato esperado
- **THEN** a opção falha com erro de estrutura.

### Requirement: Seleção de episódio

Para espelho `watch.brstream.cc/tv/<slug>`, o provedor SHALL extrair o `seriesSlug`, consultar `fetch_series_data.php` e selecionar o episódio pelo par temporada/número. Temporada ou episódio ausente é ausência da opção; estrutura inválida é falha.

#### Scenario: Episódio encontrado

- **WHEN** a temporada e o número pedidos existem na resposta da série
- **THEN** o provedor usa o `video_slug` dessa entrada, sem escolher por posição.

#### Scenario: Temporada ausente

- **WHEN** a resposta não tem a temporada pedida
- **THEN** a opção termina em ausência, sem erro fatal.

#### Scenario: Episódio ausente

- **WHEN** a temporada existe, mas não contém o número pedido
- **THEN** a opção termina em ausência e não usa outro episódio.

#### Scenario: Resposta de série inválida

- **WHEN** a página não traz `seriesSlug` ou a consulta não devolve `seasons` utilizável
- **THEN** a opção falha com erro de estrutura.

### Requirement: Resolução do episódio no BrStream

Episódio encontrado SHALL ser aberto em `https://watch.brstream.cc/watch/<video_slug>` e seguir o mesmo contrato de `video` e playlist master usado para filmes.

#### Scenario: Episódio com playlist válida

- **WHEN** a página do episódio traz `video` com `uid`, `md5`, `id` e `status` válidos
- **THEN** o provedor monta a playlist master do episódio e devolve o stream.

#### Scenario: Slug de episódio inválido

- **WHEN** o `video_slug` da entrada não é alfanumérico ou a página não traz `video`
- **THEN** a opção falha e as demais são preservadas.

### Requirement: Contrato dos streams

Cada stream SHALL ser montado com `buildStream` e `format`, com `addon` CineAgora, `provider` BrStream, `type` HLS, `filename` da release, `quality` pela maior entrada de `video.quality` e `language` pelo rótulo do espelho ou pela release. Campos não fornecidos SHALL ser omitidos.

#### Scenario: Qualidade declarada

- **WHEN** `video.quality` declara `720p`, `480p` e `240p`
- **THEN** o stream sai com `quality` `720p`.

#### Scenario: Dublado

- **WHEN** o espelho é rotulado `Dublado`
- **THEN** o stream sai com `language` `Dublado`.

#### Scenario: Legendado

- **WHEN** o espelho é rotulado `Legendado`
- **THEN** o stream sai com `language` `Legendado`.

#### Scenario: Dual áudio sem rótulo

- **WHEN** o rótulo é desconhecido e a release informa `DUAL`
- **THEN** o stream sai com `Dublado (Não PT-BR?)`.

#### Scenario: Qualidade não declarada

- **WHEN** `video.quality` está ausente ou não pode ser interpretado
- **THEN** a descoberta local decide a qualidade e, sem correspondência, o stream sai com `Desconhecida`.

#### Scenario: Campos ausentes

- **WHEN** a fonte não oferece tamanho, legendas externas, seeders ou peers
- **THEN** esses campos não aparecem e o stream não recebe cabeçalhos de reprodução.

### Requirement: Opções independentes e fronteira de erro

Cada espelho SHALL ser uma opção independente. Falha de uma SHALL ser registrada com `console.warn` e preservar as demais. Sem nenhum stream, erro agregado SHALL subir quando alguma opção falhou; ausência em todas SHALL devolver lista vazia.

#### Scenario: Uma opção falha e a outra resolve

- **WHEN** o espelho dublado falha e o legendado produz playlist válida
- **THEN** o provedor devolve o stream legendado e avisa sobre a opção descartada.

#### Scenario: Todas as opções falham

- **WHEN** todos os espelhos BrStream falham e nenhum stream é produzido
- **THEN** o provedor lança erro com a causa de cada opção.

#### Scenario: Todas as opções são ausência

- **WHEN** os espelhos existem, mas nenhum episódio ou mídia corresponde ao pedido
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Falha final no app

- **WHEN** a resolução termina em erro não tratado
- **THEN** `getStreams` registra `[CineAgora]` e devolve lista vazia.
