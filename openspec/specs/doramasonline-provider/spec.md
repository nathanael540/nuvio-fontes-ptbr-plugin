# doramasonline-provider Specification

## Purpose
Localizar e confirmar filmes e séries no Doramas Online a partir do ID do TMDB, selecionar a temporada e o episódio pelo endereço publicado na ficha e resolver as opções DooPlay (Booonceivu e IncVideo) em isolamento.

## Requirements

### Requirement: Entrada e identidade pelo TMDB

O provedor SHALL validar `tmdbId` numérico e `mediaType` em `movie`/`tv` antes de qualquer requisição. A identidade SHALL ser obtida com `getMediaInfo` e a busca SHALL consultar `GET https://doramasonline.net/?s=<termo>` com título PT-BR, título original e alternativos brasileiros, acumulando cartões por URL. O provedor SHALL aceitar somente caminhos `/br/filmes/` para filme e `/br/series/` para série e SHALL exigir igualdade de ano quando a fonte e o TMDB publicarem ano.

#### Scenario: Série confirmada por título e ano

- **WHEN** a busca de `Pousando no Amor` devolve `/br/series/pousando-no-amor/` com ano 2019 e o TMDB de 94796 é de 2019
- **THEN** o provedor confirma a ficha e segue para a seleção do episódio.

#### Scenario: Homônimo rejeitado pelo ano

- **WHEN** a busca de `The Glory` devolve `/br/series/the-glory/` com ano 2025 e o TMDB de 136283 é de 2022
- **THEN** o candidato é descartado e nenhum stream é montado a partir dele.

#### Scenario: Tipo conflitante

- **WHEN** o pedido é `movie` e o único cartão confirmado aponta para `/br/series/...`
- **THEN** o cartão é descartado por triagem de tipo.

#### Scenario: Título ausente

- **WHEN** a busca não devolve cartões ou nenhum candidato confirma título e ano
- **THEN** o provedor devolve lista vazia, sem erro.

### Requirement: Seleção de temporada e episódio

Na ficha de série, o provedor SHALL percorrer `div.se-c`, ler a temporada em `span.se-t` e o par publicado em `div.numerando` (`S - E`), e SHALL usar o `href` de `div.episodiotitle a` como endereço do episódio. O provedor SHALL NOT construir o endereço por substituição de número e SHALL exigir a coordenada exata.

#### Scenario: Episódio comum

- **WHEN** a ficha lista `1 - 1` a `1 - 16` e o pedido é S01E16
- **THEN** o provedor abre o `href` publicado para o episódio 16.

#### Scenario: Episódio com sufixo final

- **WHEN** o episódio 16 de `Itaewon Class` é publicado em `...-episodio-16-final/`
- **THEN** o provedor usa exatamente esse endereço e não monta `...-episodio-16/`.

#### Scenario: Temporada ausente

- **WHEN** a ficha não tem `div.se-c` com `span.se-t` igual à temporada pedida
- **THEN** o provedor devolve lista vazia para o pedido.

#### Scenario: Ficha de série sem lista

- **WHEN** a ficha tem a temporada pedida, mas nenhum `div.episodiotitle a` legível
- **THEN** o provedor lança erro de estrutura.

### Requirement: Opções DooPlay e isolamento

O provedor SHALL ler `li.dooplay_player_option` com `data-nume`, `data-post`, `data-type` e o rótulo de `.title`, e SHALL associar cada opção ao contêiner `#source-player-<nume>`. O trailer SHALL ser descartado por triagem. Cada opção SHALL ser resolvida em isolamento: a falha de uma SHALL gerar aviso e preservar as demais, e o erro agregado SHALL subir somente quando nenhuma opção produzir stream e alguma tiver falhado.

#### Scenario: Opções dublada e legendada

- **WHEN** a página do episódio tem `DUBLADO` em `#source-player-1` e `LEGENDADO` em `#source-player-2`
- **THEN** o provedor resolve as duas opções de forma independente.

#### Scenario: Uma opção quebrada

- **WHEN** o player de uma opção responde HTML com aviso PHP em vez de JSON
- **THEN** a opção é descartada com `console.warn('[Doramas Online] Opção <rótulo> descartada: <causa>')` e a outra opção continua.

#### Scenario: Todas as opções falham

- **WHEN** todas as opções da página falham na resolução
- **THEN** o erro agregado sobe com a causa de cada opção até `getStreams`.

#### Scenario: Só trailer

- **WHEN** a página só oferece o trailer do YouTube
- **THEN** a saída é lista vazia, porque o trailer é triagem e não falha.

### Requirement: Resolução Booonceivu

Para um iframe Booonceivu, o provedor SHALL repetir a URL com `mode=to-salvando-seu-ip` e `Referer` da página do episódio, SHALL exigir HTTP 2xx, JSON válido e `status === "success"`, e SHALL ler `midias[]` e `legendas[]`. Cada `midia` SHALL virar um stream HLS com a qualidade do rótulo da fonte; a playlist SHALL NOT ser aberta.

#### Scenario: JSON com três qualidades

- **WHEN** a resposta traz `midias` com `qualidade` `SD`, `LD` e `FD` e URLs `.m3u8`
- **THEN** o provedor monta três streams HLS com as qualidades normalizadas pelo mapa do player.

#### Scenario: Legendas em português

- **WHEN** a opção legendada traz `legendas[]` com `label: "Português"` e URL `.vtt`
- **THEN** o stream sai com a legenda e o idioma `Legendado`.

#### Scenario: Resposta sem sucesso

- **WHEN** o JSON do player traz `status` diferente de `success`
- **THEN** a opção é tratada como ausência, não como erro fatal.

#### Scenario: Playlist não é sondada

- **WHEN** a opção publica a URL `.m3u8`
- **THEN** o provedor devolve a URL sem baixar a playlist e sem descobrir resolução por sonda.

### Requirement: Resolução IncVideo e desembrulho de aviso

Para um iframe `csst.online`, o provedor SHALL seguir até o embed `incvideo1.online`, SHALL ler o campo `file` do `new Playerjs({...})`, SHALL capturar o `Set-Cookie` do embed e SHALL pedir cada URL `get_file` com `Referer` e cookie em modo de redirecionamento manual. O `Location` SHALL ser seguido até um MP4 200/206. Para `/aviso/?url=`, o parâmetro SHALL ser decodificado antes da classificação; host não suportado SHALL ser triagem.

#### Scenario: Três fontes IncVideo

- **WHEN** o `Playerjs` publica três URLs `get_file`
- **THEN** o provedor tenta cada uma, segue o 302 e aceita os MP4 resultantes.

#### Scenario: MP4 sem cabeçalhos de reprodução

- **WHEN** a URL final responde 206 `video/mp4`
- **THEN** o stream é montado sem `headers`, porque a reprodução não exigiu `Referer` nem cookie.

#### Scenario: Aviso para host não suportado

- **WHEN** `/aviso/?url=` aponta para `png.strp2p.com`
- **THEN** a opção é descartada por triagem, sem tentar um resolvedor não confirmado.

#### Scenario: Embed sem Playerjs

- **WHEN** o embed IncVideo não publica `new Playerjs` ou o campo `file`
- **THEN** a opção falha e as demais são preservadas.

### Requirement: Contrato dos streams

O provedor SHALL montar cada stream com `buildStream` e `format`, informando `type` `hls` ou `mp4`, `provider` do player, `quality` do rótulo ou `Desconhecida`, `language` confirmado pela opção/legenda, `subtitles` quando publicadas e `format` com título, ano, temporada e episódio. O provedor SHALL NOT informar `name` ou `title`, SHALL NOT inventar tamanho, seeders ou peers e SHALL NOT declarar português sem evidência.

#### Scenario: Stream de série

- **WHEN** a opção dublada de S01E01 resolve
- **THEN** o stream sai com `language: "Dublado"`, `type: "hls"`, `format.season: 1` e `format.episode: 1`.

#### Scenario: Idioma sem evidência

- **WHEN** o rótulo da opção é desconhecido e não há legenda reconhecida
- **THEN** o stream sai com `Idioma Desconhecido`, sem promoção a PT-BR.

#### Scenario: Legenda estrangeira

- **WHEN** a única legenda é `English`
- **THEN** ela é preservada com o rótulo original e não altera o idioma do áudio para `Legendado`.

### Requirement: Ausência, erros e limites de runtime

O provedor SHALL devolver lista vazia somente para ausência reconhecida de título, temporada, episódio ou de todas as opções por triagem. Falha de rede, HTTP fora de 2xx, layout inesperado ou JSON inválido em etapa estrutural SHALL subir até `getStreams`, que registra `[Doramas Online]` e devolve lista vazia. O provedor SHALL NOT instalar timeout, retentativa, cache com validade, sonda de mídia ou settings.

#### Scenario: Busca fora do ar

- **WHEN** a busca responde HTTP 503
- **THEN** o erro sobe até `getStreams`, é registrado com `[Doramas Online]` e a saída é `[]`.

#### Scenario: Episódio não publicado

- **WHEN** a temporada existe, mas o episódio pedido não está na lista
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Sem tempo próprio

- **WHEN** qualquer requisição demora
- **THEN** o provedor não cancela nem repete por conta própria; a espera é do app.
