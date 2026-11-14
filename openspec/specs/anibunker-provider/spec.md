# anibunker-provider Specification

## Purpose
Localizar filmes e séries no catálogo AniBunker a partir do ID do TMDB, confirmar a obra e o áudio, resolver os players públicos do site e devolver streams MP4 ou HLS compatíveis com o contrato do Nuvio.

## Requirements

### Requirement: Busca e confirmação de identidade

O provedor SHALL consultar a busca pública `POST https://anibunker.com/php/search.php` com o formulário `query=<termo>` e SHALL confirmar o candidato na página `/anime/<slug>` pelo título, ano e formato antes de resolver a mídia. A busca SHALL usar o título PT-BR, o título original, os alternativos brasileiros e os títulos romaji do TMDB.

#### Scenario: Título romaji encontra o filme

- **WHEN** o TMDB informa o título PT-BR "Your Name." e o título romaji "Kimi no Na wa." para um filme, e a busca do AniBunker devolve a página desse título romaji
- **THEN** o provedor confirma o candidato pelo título e ano e prossegue para a entrada de filme.

#### Scenario: Título comum devolve vários animes

- **WHEN** a busca por um título comum devolve resultados de obras diferentes, inclusive temporadas e arcos
- **THEN** o provedor descarta candidatos sem correspondência de título ou ano e só aceita a página cujo `h1`, ano e formato confirmam a obra pedida.

#### Scenario: Nenhum candidato confirmado

- **WHEN** todas as variantes de busca terminam sem página compatível com título, ano e formato
- **THEN** o provedor devolve lista vazia, sem tratar a ausência como falha estrutural.

### Requirement: Seleção de episódio, temporada e áudio

Para série, o provedor SHALL selecionar o episódio pelo número pedido e pelas opções de áudio anunciadas na página, usando o título romaji/arco para confirmar a temporada. Para filme, SHALL usar a entrada única `/anime/<slug>-episodio-1-<audio>`.

#### Scenario: Episódio dublado e legendado disponíveis

- **WHEN** a página da série anuncia "24 legendado e 24 dublado" e o pedido é o episódio 1 de uma temporada confirmada
- **THEN** o provedor resolve as páginas `-episodio-1-legendado` e `-episodio-1-dublado` como opções independentes.

#### Scenario: Áudio não anunciado

- **WHEN** a página anuncia somente uma faixa de áudio e o pedido pode ser atendido por ela
- **THEN** o provedor resolve somente a faixa anunciada e não inventa a outra.

#### Scenario: Episódio inexistente na temporada

- **WHEN** a temporada confirmada não possui o número de episódio pedido
- **THEN** o provedor devolve lista vazia, sem escolher outro episódio.

#### Scenario: Filme com entrada única

- **WHEN** a página confirmada é de filme e publica uma única entrada de episódio
- **THEN** o provedor usa essa entrada como a mídia do filme.

### Requirement: Resolução dos players públicos

O provedor SHALL invocar `POST /php/loader.php` com `player_id` e `video_id` para cada player e SHALL resolver cada opção em isolamento: token do Blogger com prefixo `AD6v5d`, Google Drive como MP4 direto, `url_hd*` como MP4 ou HLS, Sendvid pelo MP4 do embed e `url_mega` descartado por triagem.

#### Scenario: Token do Blogger entrega formatos progressivos

- **WHEN** o carregador devolve um token para o player `token` e a página do Blogger publica `streamingData.formats` com itags 18 e 22
- **THEN** o provedor devolve os dois MP4 progressivos, com qualidade 360p e 720p, e usa `Referer` do Blogger na reprodução.

#### Scenario: Google Drive entrega arquivo direto

- **WHEN** o carregador devolve um identificador para o player `url_drive`
- **THEN** o provedor monta o download direto do Google Drive e devolve o MP4 sem inventar qualidade.

#### Scenario: Player Mega é descartado

- **WHEN** a página do episódio lista o player `url_mega`
- **THEN** o provedor descarta essa opção por triagem, sem tratá-la como falha fatal.

#### Scenario: Um player falha e outro resolve

- **WHEN** um player devolve URL inválida e outro entrega mídia válida
- **THEN** o provedor mantém os streams do player válido e registra o aviso do player descartado.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, informando `type` MP4 ou HLS, `provider` do player, `language` pelo áudio da página e `quality` somente quando a fonte declarar rótulo ou itag reconhecível. Campos não fornecidos SHALL ser omitidos.

#### Scenario: Stream dublado do Blogger

- **WHEN** a opção dublada do Blogger entrega o itag 22
- **THEN** o stream sai com `language` "Dublado", `quality` "720p" e `type` MP4.

#### Scenario: Stream sem qualidade declarada

- **WHEN** o player do Google Drive não informa resolução
- **THEN** o stream é preservado com "Desconhecida", sem sonda de mídia.

#### Scenario: Campos ausentes na fonte

- **WHEN** a fonte não fornece tamanho, legendas externas, seeders ou peers
- **THEN** esses campos não aparecem no stream.

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia para ausência reconhecida de obra, temporada, episódio ou áudio. Falha de rede, JSON inválido ou estrutura inesperada SHALL subir até `getStreams`, que registra com `[AniBunker]` e devolve lista vazia.

#### Scenario: Busca sem resultado

- **WHEN** a busca não devolve nenhum candidato compatível
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Falha de rede na busca

- **WHEN** a busca responde fora de 2xx ou o corpo não é JSON válido
- **THEN** o erro sobe até `getStreams`, é registrado com `[AniBunker]` e a saída é lista vazia.

#### Scenario: Todos os players falham

- **WHEN** todos os players do episódio falham e nenhum stream é produzido
- **THEN** o provedor lança erro com a causa de cada player, em vez de devolver sucesso vazio.
