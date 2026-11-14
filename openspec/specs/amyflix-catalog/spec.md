# amyflix-catalog Specification

## Purpose
Localizar filmes e séries GL no catálogo AmyFlix a partir do ID do TMDB, confirmar o título, escolher o episódio pela listagem DooPlay, expandir as opções de player e devolver os streams HLS/MP4 das famílias públicas comprovadas.

## Requirements

### Requirement: Busca e confirmação de título

O provedor SHALL consultar `GET https://amyflix.net/?s=<termo>` com o título PT-BR, o título original e os alternativos brasileiros do TMDB, em ordem, e SHALL aceitar como candidatos apenas cartões `div.result-item article` com link `/filme/` para filme ou `/serie/` para série. SHALL limpar do título as decorações `Dublado`, `Legendado`, `Dublado e Legendado` e travessões, e SHALL confirmar o título na página de detalhe.

#### Scenario: Série encontrada pelo título PT-BR

- **WHEN** a busca devolve um cartão `/serie/` cujo título, limpo das decorações de áudio, coincide com o título do TMDB
- **THEN** o provedor abre a página da série e segue para a seleção do episódio.

#### Scenario: Busca vazia é ausência

- **WHEN** a busca responde 200 com `div.no-result` e nenhum cartão
- **THEN** o provedor trata a variante como ausência e tenta a próxima.

#### Scenario: Dois candidatos compatíveis

- **WHEN** dois cartões do tipo pedido têm o mesmo título limpo e os cartões observados não publicam ano para desempatar
- **THEN** o provedor devolve lista vazia por ambiguidade, sem escolher o primeiro.

#### Scenario: HTML de busca não reconhecido

- **WHEN** a resposta não tem `div.search-page` nem `div.no-result`, ou o HTTP não é 2xx
- **THEN** o provedor lança erro, sem confundir com ausência.

### Requirement: Seleção de episódio na listagem DooPlay

Para série, o provedor SHALL ler `ul.episodios li.mark-<n>`, SHALL extrair o par de `div.numerando` (`<temporada> - <episódio>`) e SHALL escolher o item cujo par for igual ao pedido. O provedor SHALL NOT usar a posição visual. Quando a temporada não existir na listagem, SHALL devolver lista vazia.

#### Scenario: Episódio escolhido pelo par temporada e episódio

- **WHEN** a listagem tem `1 - 1`, `1 - 2` e `1 - 3` e o pedido é S01E02
- **THEN** o provedor escolhe o segundo item pelo `numerando`, não pela posição na tela.

#### Scenario: Temporada ausente

- **WHEN** a listagem só tem a temporada 1 e o pedido é da temporada 2
- **THEN** o provedor devolve lista vazia.

#### Scenario: Listagem não reconhecida

- **WHEN** a página de série não tem `ul.episodios` nem itens `li.mark-*`
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.

### Requirement: Expansão das opções de player

O provedor SHALL ler `li.dooplay_player_option` com `data-post`, `data-nume` e `data-type`, SHALL ignorar opções com `data-nume` não numérico e SHALL expandir cada opção com `POST https://amyflix.net/wp-admin/admin-ajax.php` no formulário `action=doo_player_ajax&post=<post>&nume=<nume>&type=<type>`. A resposta SHALL conter `embed_url`; a falha de uma opção SHALL preservar as demais.

#### Scenario: Opção expandida com embed

- **WHEN** o AJAX devolve `{ "embed_url": "https://amyflix.net/jwplayer/?source=..." }`
- **THEN** o provedor trata a URL como uma opção independente.

#### Scenario: Opção sem embed

- **WHEN** o AJAX devolve `embed_url` vazio ou a resposta não é JSON
- **THEN** a opção é descartada com aviso e as demais continuam.

#### Scenario: Botão de trailer

- **WHEN** o `data-nume` não é um inteiro positivo
- **THEN** a opção é ignorada por triagem, sem aviso de falha.

### Requirement: Resolução das famílias comprovadas

O provedor SHALL resolver `jwplayer/?source=<valor>` decodificando o parâmetro `source` e aceitando somente `http(s)`, com tipo `hls` quando o caminho contiver `.m3u8` e `mp4` nos demais casos. Para `rumble.com/embed/<id>`, SHALL ler o objeto `p.f["<id>"]` da página, usar `u.hls.url` como mídia e a maior chave numérica de `u.ua.tar` como qualidade. Hosts fora dessas famílias SHALL ser descartados por triagem.

#### Scenario: Fonte `jwplayer` com HLS assinado

- **WHEN** o `source` decodificado é um `https://...m3u8?key=...`
- **THEN** o provedor devolve essa URL como stream HLS, sem baixar a playlist.

#### Scenario: Rumble embed com HLS

- **WHEN** o embed é `https://rumble.com/embed/<id>/?pub=...` e a página publica `p.f["<id>"].u.hls.url`
- **THEN** o provedor devolve o master HLS e a qualidade da maior chave de `u.ua.tar`.

#### Scenario: Host não suportado

- **WHEN** o embed aponta para Google Drive, Ok.ru, Vidmoly, VK, Dailymotion, Secvideo1 ou Presto
- **THEN** a opção é descartada por triagem, sem falha fatal.

#### Scenario: Nenhuma opção produz stream

- **WHEN** todas as opções são de hosts não suportados
- **THEN** a saída é lista vazia, porque a fonte reconheceu as opções e nenhuma entrou no contrato.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, com `type` conforme a mídia, `provider` do player, idioma `Dublado` ou `Legendado` somente quando o rótulo da opção declarar, e sem cabeçalhos de reprodução. A qualidade SHALL vir do texto já obtido; sem evidência, o stream SHALL ser preservado como `Desconhecida`.

#### Scenario: Opção legendada

- **WHEN** o rótulo da opção contém `Legendado`
- **THEN** o stream sai com `language` "Legendado".

#### Scenario: Idioma não declarado

- **WHEN** o rótulo não declara áudio
- **THEN** o campo de idioma é omitido e a descoberta local decide.

#### Scenario: Qualidade não declarada

- **WHEN** o `source` do `jwplayer` não traz resolução e não há outra evidência
- **THEN** o stream sai com "Desconhecida".

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia para ausência de título, ambiguidade, temporada ou episódio ausente e para todas as opções em triagem. Falha de rede, HTTP fora de 2xx ou estrutura inesperada SHALL subir até `getStreams`, que registra com `[AmyFlix]` e devolve lista vazia.

#### Scenario: Título ausente

- **WHEN** todas as variantes terminam sem candidato confirmado
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Falha de rede na busca

- **WHEN** a busca responde fora de 2xx
- **THEN** o erro sobe até `getStreams`, é registrado com `[AmyFlix]` e a saída é lista vazia.
