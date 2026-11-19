# Spec Delta

## Purpose

Localizar séries de anime no AniZero pelo título do TMDB, confirmar identidade e temporada, selecionar o episódio publicado e decodificar o player por opção de áudio para devolver streams HLS compatíveis com o contrato do Nuvio.

## ADDED Requirements

### Requirement: Entrada e tipo suportado

O provedor SHALL aceitar somente `tv`, com `tmdbId` numérico e temporada/episódio inteiros a partir de 1. Pedido `movie` SHALL devolver lista vazia antes de qualquer requisição. Entrada inválida SHALL subir como erro até `getStreams`, que registra `[AniZero] ...` e devolve lista vazia.

#### Scenario: Pedido de série válido

- **WHEN** o app pede `tv` com `tmdbId`, temporada e episódio válidos
- **THEN** o provedor segue para a busca pelo título do TMDB.

#### Scenario: Pedido de filme

- **WHEN** o app pede `movie`
- **THEN** o provedor devolve lista vazia sem acessar a rede.

#### Scenario: Entrada inválida

- **WHEN** o `tmdbId` não é numérico ou a série não traz temporada/episódio válidos
- **THEN** o erro sobe até `getStreams`, que registra `[AniZero] ...` e devolve lista vazia.

### Requirement: Busca e confirmação de identidade

O provedor SHALL buscar com `POST /wp-admin/admin-ajax.php`, `action=buscar_anime_rt` e `termo=<consulta>`, usando título PT-BR, original, alternativas e romaji do TMDB. A ficha SHALL ser confirmada por título compatível, ano da série ou da temporada com tolerância de um ano e `const anime_id`. Busca sem resultado é ausência; ficha 200 sem título, ano ou `anime_id` é erro de estrutura.

#### Scenario: Título encontrado

- **WHEN** a busca devolve uma ficha com título compatível, ano esperado e `anime_id`
- **THEN** o provedor usa essa ficha e segue para a temporada.

#### Scenario: Variante de título

- **WHEN** o título PT-BR não encontra ficha e o original, uma alternativa ou o romaji encontra
- **THEN** o provedor confirma a ficha pela variante que corresponde ao TMDB.

#### Scenario: Título ausente

- **WHEN** todas as variantes terminam sem ficha confirmada
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Ficha fora do formato

- **WHEN** a ficha responde 2xx sem título, sem ano ou sem `const anime_id`
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

### Requirement: Mapeamento de temporada

O provedor SHALL usar a página com marcador de temporada igual ao pedido ou percorrer a cadeia `tempProxima` a partir da página base, exigindo que o título sem marcador continue compatível. Uma página de outra série SHALL NOT ser aceita como temporada. Sem página compatível, o provedor SHALL usar numeração absoluta somente se a fonte tiver uma única página com contagem entre 0,9 e 1,1 do total do TMDB.

#### Scenario: Temporada com marcador

- **WHEN** a busca devolve a página `S2` e o pedido é da temporada 2
- **THEN** o provedor confirma essa página e usa os episódios locais.

#### Scenario: Temporada sem marcador na busca

- **WHEN** a busca não devolve a página da temporada pedida, mas a página base publica `tempProxima` para ela
- **THEN** o provedor percorre a cadeia até o marcador esperado.

#### Scenario: Sequência de outra série

- **WHEN** a próxima página da cadeia tem título incompatível ou não tem marcador de temporada
- **THEN** o provedor não a usa como temporada e segue para a ausência ou para a numeração absoluta.

#### Scenario: Temporada não publicada

- **WHEN** a cadeia termina antes da temporada pedida e a fonte não atende à condição de numeração absoluta
- **THEN** o provedor devolve lista vazia.

### Requirement: Seleção do episódio

O provedor SHALL consultar `POST /api/` com `action=show_videos&anime_id=<id>`, validar `episodios` como objeto e escolher a entrada cujo `epi_num` numérico seja exatamente o episódio local ou absoluto. Episódio ausente SHALL produzir lista vazia; `episodios` ausente ou `epi_url` inválida SHALL ser erro de estrutura.

#### Scenario: Episódio publicado

- **WHEN** `episodios` contém o número pedido com `epi_url` HTTPS
- **THEN** o provedor abre a página do vídeo desse episódio.

#### Scenario: Episódio ausente

- **WHEN** `episodios` não contém o número pedido
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Resposta fora do formato

- **WHEN** a API não traz `episodios` como objeto ou a entrada escolhida não traz `epi_url`
- **THEN** o provedor lança erro de estrutura.

### Requirement: Decodificação do player por opção

O provedor SHALL abrir a página `/player` do iframe do vídeo e decodificar cada script de `playerScripts` sem `eval`/`new Function`, obtendo a URL do embed. Cada opção SHALL ser independente; página “O vídeo não está pronto” é ausência reconhecida. Falha de uma opção SHALL preservar as demais com aviso; se nenhuma produzir stream e alguma falhar, o erro agregado SHALL subir.

#### Scenario: Duas opções de áudio

- **WHEN** a página do player publica as opções `Dublado` e `Legendado`
- **THEN** o provedor decodifica as duas e devolve um stream para cada uma que resolver.

#### Scenario: Opção não pronta

- **WHEN** o embed da opção responde a página “O vídeo não está pronto”
- **THEN** a opção é tratada como ausência, sem aviso de falha.

#### Scenario: Uma opção falha

- **WHEN** uma opção falha no decode ou no HTTP e a outra resolve
- **THEN** o provedor devolve a opção válida e registra `[AniZero] Opção <rótulo> descartada: <causa>`.

#### Scenario: Todas as opções falham

- **WHEN** todas as opções falham e nenhuma produz stream
- **THEN** o provedor lança erro agregado com a causa de cada opção.

### Requirement: Resolução do embed e do HLS

O provedor SHALL ler a configuração `FirePlayer(...)` do embed por leitura balanceada, aceitar `videoData.videoSources[]` ou `videoUrl` do tipo HLS, resolver caminhos relativos contra a URL final do embed e devolver a playlist master com `Referer` do embed. Fontes repetidas SHALL ser deduplicadas pela URL; a mídia SHALL NOT ser sondada.

#### Scenario: Fonte HLS relativa

- **WHEN** o embed publica `file` relativo `/hls/<hash>/master.txt`
- **THEN** o stream usa a URL resolvida no host do embed.

#### Scenario: Segmento protegido

- **WHEN** a playlist master é reproduzida
- **THEN** o stream leva `headers` com `Referer` do embed, necessário aos segmentos.

#### Scenario: Fonte repetida

- **WHEN** duas entradas apontam para a mesma URL resolvida
- **THEN** o provedor devolve um único stream.

#### Scenario: Embed sem configuração

- **WHEN** o embed responde 2xx sem `FirePlayer` e sem o aviso de vídeo não pronto
- **THEN** a opção falha com erro de estrutura.

### Requirement: Contrato dos streams

Cada stream SHALL ser montado com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `AniZero`, `provider` do host do embed, `type` `hls`, título e ano do TMDB, temporada e episódio do pedido). O idioma SHALL vir do rótulo do player e a qualidade da dica da fonte. `name` e `title` SHALL NOT ser informados.

#### Scenario: Stream dublado

- **WHEN** a opção se chama `Dublado`
- **THEN** o stream sai com `language` `Dublado`, `type` `hls` e o `provider` do host do embed.

#### Scenario: Stream legendado

- **WHEN** a opção se chama `Legendado`
- **THEN** o stream sai com `language` `Legendado`.

#### Scenario: Qualidade da fonte

- **WHEN** a fonte publica o rótulo `HD`
- **THEN** a qualidade é resolvida pela regra local do bloco, sem requisição extra à mídia.

#### Scenario: Campos gerados

- **WHEN** o stream é devolvido
- **THEN** `name` e `title` vêm do formatador e o provedor não os informa.

### Requirement: Fronteira de erro e ausência

Ausência reconhecida SHALL devolver lista vazia sem `console.error`. Falha de rede, HTTP, contrato ou de todas as opções SHALL subir até `getStreams`, que registra `[AniZero] ...` e devolve lista vazia. Logs SHALL NOT conter URL de mídia, hash de 32+ caracteres, token ou cookie.

#### Scenario: Ausência reconhecida

- **WHEN** o título, a temporada, o episódio ou todas as opções não estão disponíveis
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Falha fatal

- **WHEN** a busca, a ficha, `show_videos`, a página do vídeo ou a página do player falham tecnicamente
- **THEN** `getStreams` registra `[AniZero] ...` e devolve lista vazia.

#### Scenario: Logs saneados

- **WHEN** o provedor registra um aviso ou erro
- **THEN** a mensagem não contém URL de mídia, hash longo, token ou cookie.
