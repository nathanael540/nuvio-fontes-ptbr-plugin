# seekee-provider Specification

## Purpose

Permitir que o Nuvio consulte filmes, séries, animes e doramas no ecossistema Seekee por TMDB e devolva streams HLS diretos em português com legendas externas a partir da rede de espelhos compatíveis.

## ADDED Requirements

### Requirement: Entrada e coordenadas do pedido

O provedor SHALL validar `tmdbId` e `mediaType` (`movie` ou `tv`) antes de qualquer requisição. Pedidos `movie` SHALL ignorar temporada e episódio, enquanto pedidos `tv` SHALL exigir `season` e `episode` inteiros maiores ou iguais a 1 e lançar erro claro quando ausentes ou inválidos.

#### Scenario: Filme com coordenadas omitidas

- **WHEN** `getStreams` recebe `mediaType: "movie"`, `tmdbId` válido e `season`/`episode` nulos
- **THEN** o provedor prossegue normalmente para a consulta ao TMDB e ao índice de busca.

#### Scenario: Série com coordenadas inválidas

- **WHEN** `getStreams` recebe `mediaType: "tv"` com `season` ou `episode` ausente, zero ou não inteiro
- **THEN** o erro é capturado na fronteira de `getStreams`, registrado com `[Seekee]` e retorna `[]`.

### Requirement: Busca assinada no índice público do Seekee

O provedor SHALL obter título PT-BR, título original, alternativas e ano no TMDB e consultar `https://h5-api.otv.cc/quan/h5/search/search` com `enterType=user`, `lang=pt` e cabeçalhos assinados localmente (`aeskey`, `sign`, `currentTime`), tentando título PT-BR, original e alternativos até confirmar o título.

#### Scenario: Título localizado na primeira consulta

- **WHEN** a busca pelo título PT-BR devolve candidato confirmado para o pedido
- **THEN** o provedor segue para a extração de mídia sem disparar consultas de fallback desnecessárias.

#### Scenario: Fallback para título original ou alternativo

- **WHEN** a busca pelo título PT-BR retorna lista vazia ou apenas obras incompatíveis
- **THEN** o provedor consulta o título original e os títulos alternativos diferentes antes de concluir ausência.

#### Scenario: Erro de assinatura ou HTTP fora de 2xx

- **WHEN** a API de busca retorna HTTP fora de 2xx ou código de protocolo diferente de `"00000"`
- **THEN** o provedor lança erro técnico em vez de tratar a falha como ausência do título.

### Requirement: Confirmação de identidade, tipo e ano

O provedor SHALL aceitar apenas resultados cujo `typeCode` corresponda ao pedido (`movie` para filmes; `drama` para séries), removendo o prefixo `[...]` e o sufixo de temporada ao comparar título normalizado e slug contra o TMDB. Em filmes, ano publicado divergente SHALL descartar o candidato; em séries, o ano da temporada SHALL ser compatível com a série.

#### Scenario: Filme confirmado com ano compatível

- **WHEN** o resultado tem `typeCode: "movie"`, título ou slug compatível e `endYear` igual ao ano do TMDB
- **THEN** o candidato é aceito para extração do detalhe.

#### Scenario: Derivado ou homônimo com ano divergente descartado

- **WHEN** a busca devolve sequência, derivado ou filme homônimo com ano ou título incompatível
- **THEN** o candidato é descartado em favor da entrada exata ou reconhecido como ausência.

### Requirement: Troca de temporada e validação do episódio

Em pedidos `tv`, se a temporada pedida não estiver no topo da busca, o provedor SHALL consultar um resultado confirmado da mesma série para localizar `seriesNo` na lista `seasons` e seguir ao respectivo `websiteParam`. Ao buscar `/pt/detail/drama/<slug>/<episode>`, SHALL exigir que `currentEpisodeNumber` corresponda ao episódio pedido.

#### Scenario: Temporada localizada via lista de temporadas

- **WHEN** a busca retorna a Temporada 1 de uma série e o app pede a Temporada 4
- **THEN** o provedor lê `seasons` no detalhe da Temporada 1, obtém o `websiteParam` da `seriesNo: 4` e abre `/pt/detail/drama/<slug>/<episode>`.

#### Scenario: Episódio inexistente com fallback silencioso para episódio 1

- **WHEN** o pedido solicita o episódio 99 e a página devolve `currentEpisodeNumber: "1"` ou lista de episódios sem o episódio 99
- **THEN** o provedor descarta a opção como ausência do episódio, sem entregar mídia do episódio 1.

### Requirement: Rede de espelhos e extração de mídia

O provedor SHALL substituir o domínio bloqueado `h5.onfilom.com` pela lista ordenada de espelhos compatíveis (`es.cuevana4br.com`, `play.cuevana19.com`, `flixlat.com`, `latino.solo-latino.com`, `video.playspelis.com`, `www3.dramasfree.com`, `ww20.321moviesfree.com`) ao buscar `/pt/detail/<tipo>/<slug>`, trocando de espelho apenas em HTTP fora de 2xx, erro de rede ou ausência de `__NEXT_DATA__`.

#### Scenario: Espelho primário acessível

- **WHEN** `es.cuevana4br.com` responde HTTP 200 com `__NEXT_DATA__` válido
- **THEN** o provedor extrai os streams desse espelho sem consultar os demais espelhos da lista.

#### Scenario: Fallback após bloqueio ou falha de espelho

- **WHEN** o espelho primário responde HTTP 403 ou erro de rede
- **THEN** o provedor tenta o espelho seguinte até obter HTTP 200 válido ou esgotar a lista com erro.

### Requirement: Expansão de opções de áudio e classificação de idioma

O provedor SHALL inspecionar a variante principal e as entradas relevantes de `dubbingList` para reunir opções em português e em áudio original, descartando dublagens de terceiros idiomas. Áudio português confirmado com bandeira/marca brasileira SHALL sair como `Dublado`; áudio estrangeiro com legenda `pt` em `subtitlingList` SHALL sair como `Legendado`; sem legenda `pt` SHALL sair como `Gringo`.

#### Scenario: Filme ou episódio com opções Dublado e Legendado

- **WHEN** a página principal traz áudio português (`🇧🇷`) e `dubbingList` vincula a versão em áudio original com legenda `pt`
- **THEN** o provedor resolve ambas as páginas em isolamento e retorna os streams `Dublado` e `Legendado`.

#### Scenario: Áudio estrangeiro sem legenda em português

- **WHEN** uma opção tem áudio inglês (`dubMode: "0"`) e `subtitlingList` não contém faixa `pt`
- **THEN** o provedor classifica os streams dessa opção como `Gringo`, nunca como `Legendado`.

#### Scenario: Dublagens em idiomas de terceiros descartadas

- **WHEN** `dubbingList` inclui dublagens como espanhol (`es`) ou turco (`tr`)
- **THEN** o provedor descarta essas variantes por triagem sem falhar a extração.

### Requirement: Montagem de streams HLS e legendas externas

Para cada playlist `.m3u8` publicada em `mediaInfoList`, o provedor SHALL mapear a qualidade declarada em `definitionList` ou `x-meta` (`GROOT_HD` 1080p, `GROOT_SD` 720p, `GROOT_LD` 540p, `GROOT_FD` 360p), converter todas as legendas de `subtitlingList` para `{ url, language }` e montar o stream via `buildStream` com `FORMATTER.AUTO`, deduplicando URLs repetidas e ordenando por qualidade.

#### Scenario: Múltiplas resoluções HLS com legendas externas

- **WHEN** `mediaInfoList` entrega resoluções 720p, 540p e 360p e `subtitlingList` entrega arquivos `.srt`
- **THEN** o provedor emite três streams formatados e ordenados da maior para a menor resolução, cada um com `subtitles` preenchido e sem cabeçalhos supérfluos.

### Requirement: Isolamento de falhas e ausência reconhecida

Ausência de resultados na busca, candidato incompatível ou episódio inexistente SHALL retornar lista vazia sem erro. A falha de uma variante de `dubbingList` SHALL registrar aviso com `[Seekee]` e preservar as demais opções válidas; se nenhuma variante produzir stream e alguma falhar tecnicamente, o erro agregado SHALL subir até `getStreams`.

#### Scenario: Uma variante de áudio falha e outra funciona

- **WHEN** a consulta à variante legendada falha com HTTP 502, mas a variante dublada produz streams válidos
- **THEN** o provedor registra aviso `[Seekee]` para a opção descartada e devolve os streams dublados.

#### Scenario: Título ausente no catálogo

- **WHEN** a busca retorna `data: []` para todas as variantes de título do TMDB
- **THEN** o provedor devolve `[]` sem registrar erro técnico.
