# embedmovies-catalog Specification

## Purpose

Localizar filmes e séries no catálogo público do EmbedMovies pelo ID do TMDB, confirmar o tipo e a identidade, seguir o player público da fonte e devolver os streams HLS que a cadeia de opções conseguir resolver.

## Requirements

### Requirement: Entrada e escopo

O provedor SHALL aceitar `mediaType` `movie` e `tv`. O `tmdbId` SHALL ser numérico e positivo; em `tv`, temporada e episódio SHALL ser inteiros a partir de 1. Entrada inválida SHALL devolver lista vazia sem consultar a rede.

#### Scenario: Pedido de filme

- **WHEN** o app chama o provedor com `mediaType` `movie` e um `tmdbId` numérico positivo
- **THEN** o provedor segue para a busca no catálogo.

#### Scenario: Pedido de série

- **WHEN** o app chama o provedor com `mediaType` `tv`, temporada e episódio inteiros positivos
- **THEN** o provedor segue para a busca no catálogo e preserva as coordenadas do episódio.

#### Scenario: Entrada inválida

- **WHEN** o `tmdbId` não é numérico ou é zero, o tipo não é `movie` nem `tv`, ou uma série vem sem temporada ou episódio válidos
- **THEN** o provedor devolve lista vazia, registra o erro de entrada e não faz requisição externa.

### Requirement: Busca e identidade no catálogo

O provedor SHALL consultar `POST https://embedmovies.org/inc/Ajax.php` com `type=search` e `search=<tmdbId>`, sem busca textual e sem `TMDB_API_KEY`. O resultado SHALL ser aceito somente quando `tmdb_id` e `type` corresponderem exatamente ao pedido. Ausência de correspondência exata SHALL ser ausência reconhecida; HTTP fora de 2xx, JSON inválido ou resposta sem a estrutura esperada SHALL ser erro.

#### Scenario: Filme encontrado

- **WHEN** a busca devolve um item com o mesmo `tmdb_id` do pedido e `type` `movie`
- **THEN** o provedor usa esse item, inclusive o campo `embed`, e não procura outro título.

#### Scenario: Série encontrada

- **WHEN** a busca devolve um item com o mesmo `tmdb_id` do pedido e `type` `tv`
- **THEN** o provedor usa esse item como a série pedida, inclusive quando o item é marcado como anime.

#### Scenario: Tipo divergente

- **WHEN** a busca devolve o mesmo `tmdb_id`, mas de `type` diferente do pedido
- **THEN** o item é ignorado e o provedor conclui pela ausência, sem tentar a cadeia de player.

#### Scenario: Título ausente no catálogo

- **WHEN** a busca termina sem item com `tmdb_id` e `type` exatos
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Resposta inválida

- **WHEN** a busca responde fora de 2xx, não é JSON ou não traz `success` e `results` no formato esperado
- **THEN** o provedor lança erro e não trata a falha como ausência.

### Requirement: Endereço do player e coordenadas do episódio

O provedor SHALL usar o campo `embed` do item confirmado como endereço do player. Em série, a temporada e o episódio SHALL ser acrescentados ao caminho do player. `embed` ausente, não HTTP(S) ou fora dos domínios públicos de player da fonte SHALL ser erro de contrato.

#### Scenario: Player de filme

- **WHEN** o item confirmado é de filme e traz `embed`
- **THEN** o provedor usa o endereço como está.

#### Scenario: Player de série

- **WHEN** o item confirmado é de série e traz `embed` sem temporada e episódio
- **THEN** o provedor acrescenta `/<temporada>/<episódio>` ao caminho antes de resolver o player.

#### Scenario: Embed inválido

- **WHEN** o item confirmado não traz `embed`, traz um endereço não HTTP(S) ou aponta para um domínio que não é o player público da fonte
- **THEN** o provedor lança erro de contrato e não devolve stream.

### Requirement: Resolução e triagem das opções

O provedor SHALL seguir a cadeia pública do player até as opções e SHALL resolver cada opção suportada isoladamente. Opção descartada por triagem SHALL NOT falhar o provedor; falha técnica de uma opção SHALL descartar somente aquela opção. Se nenhuma opção produzir stream e houver falha técnica, o erro SHALL subir; se todas as opções forem apenas triagem, o resultado SHALL ser ausência.

#### Scenario: Opção suportada resolve

- **WHEN** a cadeia do player publica uma opção suportada com HLS válido
- **THEN** o provedor devolve os streams dessa opção.

#### Scenario: Opção WatchPlay é suportada

- **WHEN** a cadeia do player publica `WatchPlay` com uma playlist HLS válida
- **THEN** o provedor resolve essa opção em vez de descartá-la por triagem.

#### Scenario: Opção não suportada

- **WHEN** a cadeia publica uma opção de host ou formato fora do conjunto suportado, como `embedplayabyss.top`, Blogger, `ok.ru` ou `superflixapi.boats`
- **THEN** o provedor a descarta por triagem e continua com as demais.

#### Scenario: Falha isolada

- **WHEN** uma opção falha por rede, HTTP ou resposta inválida e outra opção produz stream
- **THEN** o provedor registra o aviso da opção descartada e devolve os streams da opção que funcionou.

#### Scenario: Todas as opções são triagem

- **WHEN** nenhuma opção produz stream, mas todas foram descartadas por critério de triagem
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Todas as opções falham

- **WHEN** nenhuma opção produz stream e ao menos uma falhou tecnicamente
- **THEN** o erro sobe com a causa das opções e `getStreams` devolve lista vazia com `console.error`.

### Requirement: Contrato do stream

Todo stream SHALL ser montado com `buildStream` e o campo `format`, com `FORMATTER.AUTO`, `addon` `EmbedMovies`, título e ano do catálogo e temporada e episódio do pedido. O `type` SHALL ser `hls`; `provider` SHALL identificar o host da mídia resolvida; cabeçalhos, legendas e idioma SHALL vir somente da cadeia do player. Campos não fornecidos SHALL NOT ser inventados. A lista SHALL ser ordenada por qualidade.

#### Scenario: Formatação de filme

- **WHEN** um filme é resolvido
- **THEN** cada stream leva `addon` `EmbedMovies`, título e ano do catálogo, `type` `hls` e `provider` do host da mídia.

#### Scenario: Formatação de série

- **WHEN** um episódio é resolvido
- **THEN** cada stream leva temporada e episódio do pedido no `format`, além do título e do ano.

#### Scenario: Metadados da cadeia

- **WHEN** a cadeia do player fornece cabeçalhos de reprodução, legendas ou classificação de idioma
- **THEN** esses campos entram no stream; quando não fornece, não são inventados.

#### Scenario: Ordenação

- **WHEN** o provedor devolve streams de qualidades diferentes
- **THEN** a lista sai ordenada da maior para a menor qualidade.

### Requirement: Ausência, falhas e efemeridade

Ausência reconhecida SHALL devolver lista vazia sem erro fatal. Falha de busca, de contrato ou de todas as opções SHALL subir até `getStreams`, que SHALL ser o único ponto de captura, registrar `console.error('[EmbedMovies] ...')` e devolver lista vazia sem streams parciais. A URL de mídia SHALL ser obtida a cada execução, não cacheada e não registrada em log, fixture ou documentação.

#### Scenario: Ausência reconhecida

- **WHEN** o título não tem correspondência exata no catálogo ou todas as opções são apenas triagem
- **THEN** o provedor devolve lista vazia sem `console.error`.

#### Scenario: Falha fatal

- **WHEN** a busca falha, o contrato do catálogo muda ou todas as opções falham tecnicamente
- **THEN** `getStreams` registra `[EmbedMovies] ...` e devolve lista vazia, sem streams parciais.

#### Scenario: Resolução a cada execução

- **WHEN** o provedor resolve o mesmo título em duas execuções
- **THEN** cada execução consulta o catálogo e o player de novo, sem reutilizar URL de mídia.

#### Scenario: Logs sanitizados

- **WHEN** o provedor registra aviso ou erro
- **THEN** a URL de mídia, tokens, hashes e parâmetros assinados não aparecem na mensagem.

### Requirement: Resolução da opção WatchPlay

O provedor SHALL resolver a opção `WatchPlay` do PlayerFlix quando a página publicar uma playlist HLS. A página SHALL ser seguida até a URL final e a playlist SHALL iniciar com `#EXTM3U`, sendo interpretada como master ou playlist de mídia. O stream SHALL usar o host final do player como `provider` e o `format` SHALL levar título, ano e coordenadas do pedido.

#### Scenario: Filme cuja única opção jogável é WatchPlay

- **WHEN** as opções do PlayerFlix de um filme trazem `WatchPlay` com `lang: pt-br` e a página publica uma playlist VOD `#EXTM3U` sem `#EXT-X-STREAM-INF`
- **THEN** o provedor devolve um stream HLS com qualidade `Desconhecida`, idioma `Dublado`, `provider` do host final do player, título e ano do catálogo no `format`.

#### Scenario: Master com variantes é interpretado

- **WHEN** a playlist WatchPlay é master com `#EXT-X-STREAM-INF` e `RESOLUTION`
- **THEN** o provedor devolve as variantes com as qualidades declaradas e preserva a master quando houver faixa externa de áudio ou legenda.

#### Scenario: Página WatchPlay sem playlist

- **WHEN** a página WatchPlay responde 200 mas não publica uma URL `playlist.m3u8` válida
- **THEN** somente essa opção falha, com `console.warn`, e as demais opções continuam; se nenhuma produzir stream e houver falha, o erro agregado sobe para `getStreams`.

#### Scenario: Série com WatchPlay

- **WHEN** a opção WatchPlay pertence a uma série com temporada e episódio válidos
- **THEN** o stream leva a temporada e o episódio pedidos no `format` e mantém a mesma regra de qualidade e idioma.

### Requirement: Qualidade e idioma do WatchPlay

Quando a playlist WatchPlay não declarar `RESOLUTION`, o stream SHALL sair com qualidade `Desconhecida`, sem sonda adicional. O rótulo `lang` da opção SHALL ser usado como dica de idioma e o provedor SHALL NOT inventar `Dublado` sem prova.

#### Scenario: Playlist sem RESOLUTION não vira 720p

- **WHEN** a playlist WatchPlay não declara `RESOLUTION` em nenhuma variante
- **THEN** o stream é preservado com qualidade `Desconhecida` e o provedor não atribui `720p`, `1080p` ou outra resolução sem declaração da fonte.

#### Scenario: Idioma não comprovado

- **WHEN** a opção WatchPlay não traz `lang` classificável e a playlist não declara faixa de áudio
- **THEN** o provedor não inventa `Dublado`; aplica a descoberta local do bloco e mantém o idioma desconhecido quando não houver prova.
