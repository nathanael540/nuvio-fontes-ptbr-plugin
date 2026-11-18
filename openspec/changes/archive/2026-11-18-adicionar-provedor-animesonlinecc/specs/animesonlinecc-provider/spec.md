# Spec Delta

## Purpose

Localizar e confirmar séries de anime no AnimesOnlineCC a partir do ID do TMDB, selecionar temporada e episódio pela estrutura publicada, ler as opções `option-*` e devolver os streams dos hosts suportados com idioma, qualidade e formato coerentes.

## ADDED Requirements

### Requirement: Escopo seriado e validação de entrada

O provedor SHALL atender somente `mediaType` `tv` e SHALL devolver lista vazia para `movie` sem consultar a fonte. A entrada SHALL ser validada antes de qualquer requisição: `tmdbId` não numérico ou `mediaType` fora de `movie`/`tv` SHALL lançar erro.

#### Scenario: Pedido de filme é recusado

- **WHEN** `getStreams` recebe `mediaType` `movie`
- **THEN** o provedor devolve lista vazia sem requisição ao AnimesOnlineCC.

#### Scenario: Entrada inválida

- **WHEN** `tmdbId` não é numérico ou `mediaType` não é `movie` nem `tv`
- **THEN** o provedor lança erro antes de qualquer requisição e `getStreams` registra a falha com `[AnimesOnlineCC]`.

#### Scenario: Série válida segue para o TMDB

- **WHEN** `getStreams` recebe um `tmdbId` numérico, `mediaType` `tv` e temporada/episódio inteiros a partir de 1
- **THEN** o provedor consulta o TMDB para obter os títulos e o ano antes de acessar a fonte.

### Requirement: Busca por variantes e confirmação de identidade

O provedor SHALL buscar no catálogo com `GET /?s=<termo>` usando as variantes PT-BR, original, alternativos e romaji do TMDB, acumulando candidatos por `/anime/<slug>/`. No máximo quatro candidatos, priorizados por similaridade, SHALL ser confirmados pelo título do `h1` limpo e pelo ano de `span.date`; o primeiro resultado sem confirmação não SHALL ser aceito.

#### Scenario: Título romaji encontra a série

- **WHEN** o TMDB informa o título PT-BR, o romaji e o ano, e a busca pelo romaji devolve a ficha correspondente
- **THEN** o provedor confirma título e ano na ficha e escolhe o candidato.

#### Scenario: Busca devolve resultado alheio

- **WHEN** a busca por "Demon Slayer" devolve apenas o cartão "Berserk"
- **THEN** o provedor rejeita o candidato na ficha por título incompatível e devolve lista vazia.

#### Scenario: Ano divergente

- **WHEN** o `h1` da ficha é compatível, mas o ano de `span.date` difere do ano do TMDB em mais de um
- **THEN** o candidato é rejeitado e a busca continua com os demais.

#### Scenario: Nenhum candidato confirmado

- **WHEN** todas as variantes terminam sem candidato com título e ano compatíveis
- **THEN** o provedor devolve lista vazia, sem tratar a ausência como falha.

#### Scenario: Ficha removida

- **WHEN** um cartão da busca aponta para uma ficha que responde 404
- **THEN** o candidato é pulado e os demais continuam sendo avaliados.

#### Scenario: Ficha sem estrutura esperada

- **WHEN** uma ficha responde 200 sem `h1` ou sem `span.date`
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

#### Scenario: Busca sem resultado

- **WHEN** a página de busca apresenta o marcador de nenhum resultado
- **THEN** o provedor devolve lista vazia sem erro.

### Requirement: Seleção de temporada e episódio

O provedor SHALL selecionar a temporada pelo número de `div.se-c span.se-t` e o episódio pelo número de `div.numerando` ou pelo texto de `div.episodiotitle a`, usando o `href` publicado. Temporada ou episódio ausente SHALL produzir lista vazia, sem mapeamento por posição ou numeração absoluta.

#### Scenario: Par temporada e episódio publicado

- **WHEN** a ficha tem `span.se-t` 1 e um episódio com `div.numerando` "Ep - 1" e `href` publicado, e o pedido é S01E01
- **THEN** o provedor abre o `href` do episódio 1 da temporada 1.

#### Scenario: Temporada não publicada

- **WHEN** a ficha só tem a temporada 1 e o pedido é da temporada 2
- **THEN** o provedor devolve lista vazia, sem escolher a temporada mais próxima.

#### Scenario: Temporada agrupada

- **WHEN** a fonte agrupa várias temporadas do TMDB em uma única `Temporada 1` com numeração contínua e o pedido é de temporada 2
- **THEN** o provedor devolve lista vazia, sem somar episódios ou mapear por posição.

#### Scenario: Episódio não publicado

- **WHEN** a temporada existe, mas não tem o episódio pedido
- **THEN** o provedor devolve lista vazia.

#### Scenario: Endereço publicado é usado

- **WHEN** a lista publica um `href` de episódio que não segue o padrão `-temporada-<n>-episodio-<m>`
- **THEN** o provedor usa o `href` publicado e não monta a URL por conta própria.

#### Scenario: Lista de temporadas ausente

- **WHEN** a ficha confirmada responde 200 sem `div.se-c`
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

### Requirement: Leitura das opções `option-*`

O provedor SHALL ler cada `div[id^="option-"]` como opção independente, aceitando o `src` no próprio `div` ou no `iframe` interno, e SHALL associar o rótulo pelo `ul.idTabs a[href="#<id>"]`. Sem opções na página do episódio, SHALL tentar uma vez `/anime/<slug>/`; sem opções nas duas, a saída SHALL ser lista vazia.

#### Scenario: Embed no próprio div

- **WHEN** a página publica `<div id="option-1" src="https://host.example/e/1">`
- **THEN** o provedor lê a URL do `div` e trata a opção como uma opção independente.

#### Scenario: Embed no iframe interno

- **WHEN** a página publica `<div id="option-1"><iframe src="https://host.example/e/1"></iframe></div>`
- **THEN** o provedor lê o `src` do `iframe` interno e resolve a opção.

#### Scenario: Rótulos dublado e legendado

- **WHEN** `ul.idTabs` tem `a[href="#option-1"]` com "Dublado" e `a[href="#option-2"]` com "Legendado"
- **THEN** o provedor associa cada rótulo à opção de mesmo `id`.

#### Scenario: Página de episódio sem opções

- **WHEN** a página do episódio tem `h1.epih1` e `#playex`, mas nenhum `option-*`
- **THEN** o provedor tenta a página `/anime/<slug>/` uma vez.

#### Scenario: Fallback com opções

- **WHEN** a página do episódio não tem opções e a página do anime publica `option-*`
- **THEN** o provedor resolve as opções da página do anime.

#### Scenario: Nenhuma opção nas duas páginas

- **WHEN** a página do episódio e a página do anime não publicam `option-*`
- **THEN** o provedor devolve lista vazia.

#### Scenario: Página de episódio sem estrutura

- **WHEN** a página do episódio responde 200 sem `h1.epih1` e sem `#info h1`
- **THEN** o provedor lança erro de estrutura.

#### Scenario: Episódio removido

- **WHEN** o `href` publicado do episódio responde 404
- **THEN** o provedor usa o fallback da página do anime e, sem opções, devolve lista vazia.

#### Scenario: Bloqueio na página do episódio

- **WHEN** a página do episódio responde 403
- **THEN** o erro sobe até `getStreams`, é registrado com `[AnimesOnlineCC]` e a saída é lista vazia.

### Requirement: Resolução das opções por host

O provedor SHALL classificar cada opção por host: Blogger, mídia direta, MixDrop, Streamtape, Dood ou Byse. Host desconhecido SHALL ser descartado por triagem, sem falha. Cada opção SHALL ser resolvida em isolamento e a falha de uma SHALL preservar as demais.

#### Scenario: Blogger com formatos progressivos

- **WHEN** a opção aponta para `blogger.com/video.g` e o HTML publica dois formatos progressivos
- **THEN** o provedor devolve um stream MP4 por formato, com o rótulo de qualidade de cada um.

#### Scenario: Mídia direta MP4

- **WHEN** o `src` da opção termina em `.mp4`
- **THEN** o provedor devolve um stream com `type` `mp4`.

#### Scenario: Mídia direta HLS

- **WHEN** o `src` da opção termina em `.m3u8`
- **THEN** o provedor devolve um stream com `type` `hls`.

#### Scenario: Host conhecido resolve

- **WHEN** a opção aponta para MixDrop, Streamtape, Dood ou Byse e o adaptador encontra a mídia
- **THEN** o provedor devolve o stream com o `provider` do host e os cabeçalhos que o adaptador exigir.

#### Scenario: Host desconhecido

- **WHEN** a opção aponta para um host fora da lista suportada
- **THEN** a opção é descartada por triagem, sem stream e sem falha.

#### Scenario: Uma opção falha e outra resolve

- **WHEN** a opção dublada falha na resolução e a legendada devolve uma mídia válida
- **THEN** o provedor devolve o stream legendado e registra o aviso da opção dublada.

#### Scenario: Todas as opções falham

- **WHEN** nenhuma opção produz stream e ao menos uma falhou
- **THEN** o provedor lança erro com a causa de cada opção.

#### Scenario: Todas as opções são triagem

- **WHEN** todas as opções apontam para hosts desconhecidos
- **THEN** o provedor devolve lista vazia, porque não houve falha.

### Requirement: Contrato dos streams

O provedor SHALL montar cada stream com `buildStream` e `format`, com `type` e `provider` do host, idioma confirmado pelo rótulo e qualidade do rótulo do Blogger ou descoberta local, com `Desconhecida` quando não houver correspondência. Campos que a fonte não fornece SHALL ser omitidos, e `name`/`title` não SHALL ser informados.

#### Scenario: Stream dublado em 360p

- **WHEN** a opção "Dublado" resolve um formato do Blogger com `qualityLabel` "360p"
- **THEN** o stream sai com `language` "Dublado", `quality` "360p", `type` "mp4", `provider` "Blogger" e `format` com título, ano, temporada e episódio.

#### Scenario: Stream legendado sem qualidade declarada

- **WHEN** a opção "Legendado" resolve uma mídia direta sem rótulo nem dica local de resolução
- **THEN** o stream sai com `language` "Legendado", `quality` "Desconhecida" e `type` conforme a extensão.

#### Scenario: Rótulo sem idioma

- **WHEN** a opção tem um rótulo técnico como "HD" ou "Player 2"
- **THEN** o stream é preservado com o idioma descoberto localmente ou "Idioma Desconhecido".

#### Scenario: Campos não fornecidos

- **WHEN** a fonte não publica tamanho, legendas, seeders ou peers
- **THEN** esses campos não aparecem no stream.

#### Scenario: Mesma URL em duas opções

- **WHEN** duas opções resolvem para a mesma URL
- **THEN** o provedor devolve um único stream, o primeiro resolvido.

#### Scenario: Ordenação por qualidade

- **WHEN** a lista final contém 1080p, 720p e "Desconhecida"
- **THEN** a saída começa pelas qualidades conhecidas, da maior para a menor, e deixa a desconhecida no fim.

### Requirement: Isolamento por opção e erro agregado

O provedor SHALL descartar a opção que falhar com aviso `[AnimesOnlineCC] Opção <rótulo> descartada: <causa>` e SHALL preservar as demais. Se nenhuma opção produzir stream e ao menos uma tiver falhado, o erro agregado com as causas SHALL subir para `getStreams`.

#### Scenario: Falha isolada com aviso

- **WHEN** uma opção falha e outra produz stream
- **THEN** o provedor devolve o stream válido e registra somente o aviso da opção descartada.

#### Scenario: Falha de todas as opções

- **WHEN** todas as opções conhecidas falham
- **THEN** o erro agregado cita cada causa e sobe para `getStreams`.

#### Scenario: Opção inválida na montagem

- **WHEN** uma opção resolve uma URL fora de HTTP(S) e as demais são válidas
- **THEN** apenas a opção inválida é descartada, com aviso, e as demais são devolvidas.

### Requirement: Ausência reconhecida e falha fatal

O provedor SHALL devolver lista vazia para busca sem resultado, nenhum candidato confirmado, temporada ou episódio não publicado, episódio 404 com fallback sem opções e página sem `option-*`. HTTP 403/5xx nas etapas de busca, ficha ou página do episódio, estrutura inesperada e erro de rede SHALL subir até `getStreams`, que registra `[AnimesOnlineCC]` e devolve lista vazia.

#### Scenario: Ausência na busca

- **WHEN** a busca não devolve cartões ou nenhum candidato confirma título e ano
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Bloqueio na busca

- **WHEN** a busca responde 403
- **THEN** o erro sobe até `getStreams`, é registrado com `[AnimesOnlineCC]` e a saída é lista vazia.

#### Scenario: Falha de rede na ficha

- **WHEN** a ficha do anime responde 503
- **THEN** o erro sobe até `getStreams` e a saída é lista vazia, sem converter a falha em ausência.

#### Scenario: Falha do TMDB

- **WHEN** a consulta ao TMDB falha por chave ausente ou resposta inválida
- **THEN** o erro sobe antes de qualquer requisição à fonte.

### Requirement: Sem timeout, sonda ou cache

O provedor SHALL NOT instalar timeout próprio, `AbortController`, retentativa, sonda de mídia, cache ou settings. A qualidade SHALL ser descoberta apenas nos textos já obtidos, e o master HLS SHALL ser devolvido inteiro.

#### Scenario: Sem limite de tempo próprio

- **WHEN** a fonte demora a responder
- **THEN** o provedor aguarda o app e não cancela nem repete a requisição por conta própria.

#### Scenario: Sem sonda de mídia

- **WHEN** a opção devolve uma URL de mídia
- **THEN** o provedor devolve a URL publicada sem requisição `Range`, sem `HEAD` e sem abrir a playlist.

#### Scenario: Master HLS inteiro

- **WHEN** o host devolve um master HLS com várias variantes
- **THEN** o provedor devolve um único stream com a URL do master, sem fragmentar por qualidade.

#### Scenario: Sem cache

- **WHEN** duas execuções resolvem a mesma opção
- **THEN** o provedor resolve a URL novamente, sem reutilizar token ou URL de execução anterior.
