# Spec Delta

## Purpose

Localizar filmes e séries no catálogo Starck Filmes, ler as opções de download de cada ficha e devolver magnets ou o arquivo do episódio em pacotes de temporada, distinguindo ausência de falha.

## ADDED Requirements

### Requirement: Busca e confirmação de ficha

O provedor SHALL buscar cada título do TMDB em `/?s=<termo>` e ignorar destaques e páginas sem resultado. Só SHALL aceitar ficha cujo tipo, título e ano (filme, tolerância de um) ou temporada exata (série) correspondam ao pedido. Coleções de filmes e temporadas divergentes SHALL ser descartadas.

#### Scenario: Filme confirmado na busca

- **WHEN** o TMDB pede o filme `550` e a busca devolve uma ficha de "Clube da Luta" (1999)
- **THEN** o provedor abre a ficha e a aceita para extrair opções.

#### Scenario: Coleção em pedido de filme

- **WHEN** a busca devolve "Trilogia Matrix" ou uma ficha com faixa de anos
- **THEN** o resultado é descartado sem ser tratado como o filme pedido.

#### Scenario: Temporada divergente

- **WHEN** o pedido é da temporada `1` e o único resultado é "Série 2ª Temporada"
- **THEN** o resultado é descartado e a busca continua com os demais títulos do TMDB.

#### Scenario: Busca sem resultado

- **WHEN** a página de busca exibe a mensagem de ausência do site
- **THEN** o provedor devolve lista vazia, sem erro.

### Requirement: Opções de filme na ficha

Em ficha de filme, o provedor SHALL ler cada `.post-buttons .btn-down` com `xid`, decodificar o magnet localmente e usar o rótulo do botão como texto de qualidade, tamanho e áudio. Botão sem `xid` SHALL ser ignorado.

#### Scenario: Magnet de filme

- **WHEN** a ficha traz um `.btn-down` com `xid` que decodifica para magnet válido
- **THEN** a opção é classificada e o stream sai em magnet com o rótulo do botão.

#### Scenario: `xid` malformado

- **WHEN** um botão tem `xid` que não decodifica para `magnet:?`
- **THEN** somente essa opção é descartada com aviso, preservando as demais.

### Requirement: Opções de série em `.epsodios`

Em ficha de série, o provedor SHALL ler `.post-buttons .epsodios` e associar cada link com `xid` à versão de áudio do bloco e aos rótulos de faixa e de qualidade. Links sem `xid`, como legendas, SHALL ser ignorados. A ausência simultânea de `.btn-down` e `.epsodios` SHALL ser falha de layout; sem opção aplicável, a saída SHALL ser lista vazia.

#### Scenario: Ficha com faixas e versões

- **WHEN** a ficha traz "VERSÃO DUAL ÁUDIO" com `EPISÓDIOS 01 AO 03` em 720p e "VERSÃO LEGENDADO" com `EPISÓDIOS 01 ao 09` em 720p, 1080p e 1080p HDR
- **THEN** as seis opções são extraídas, cada uma com a versão, a faixa e a qualidade do seu bloco.

#### Scenario: Série sem `.btn-down`

- **WHEN** a ficha de série só tem `.epsodios` com links `xid`
- **THEN** o provedor não lança "ficha sem botões" e segue com as opções encontradas.

#### Scenario: Link de legendas

- **WHEN** um parágrafo de `.epsodios` traz apenas um link externo de legendas, sem `xid`
- **THEN** o link é ignorado e não vira opção de mídia.

#### Scenario: Ficha sem os contêineres observados

- **WHEN** a ficha não tem `.btn-down` nem `.epsodios` com `xid`
- **THEN** o provedor lança erro de layout e `getStreams` devolve lista vazia com o registro habitual.

### Requirement: Classificação de episódio, faixa e pacote

O provedor SHALL classificar cada magnet pelo rótulo e pelo `dn`. Episódio avulso SHALL sair em magnet. Faixa ou pacote só SHALL sair em `torrent://<hash>/<índice>` quando a lista ordenada do `.torrent` tiver exatamente um vídeo do episódio. Sem lista ordenada, a opção SHALL ser descartada com aviso, sem índice presumido.

#### Scenario: Episódio avulso

- **WHEN** o `dn` identifica `S01E07` e a temporada é `1`
- **THEN** o stream sai em magnet, sem consultar a lista do torrent.

#### Scenario: Faixa com arquivo identificado

- **WHEN** uma faixa `S01E01-02-03` tem lista ordenada com exatamente um vídeo `S01E01`
- **THEN** o stream sai em `torrent://<hash>/<índice>` do arquivo do episódio.

#### Scenario: Metadados indisponíveis

- **WHEN** a lista ordenada do `.torrent` não pode ser obtida para uma faixa ou pacote
- **THEN** somente essa opção é descartada com aviso, sem índice inventado e sem perder as demais.

#### Scenario: Mais de um arquivo candidato

- **WHEN** a lista do torrent traz dois vídeos que correspondem ao episódio pedido
- **THEN** a opção é descartada por triagem, sem escolher o primeiro.

### Requirement: Ausência, falha e isolamento

Busca sem resultado SHALL ser ausência, sem erro. Falha de rede, HTTP fora de 2xx, ficha sem os contêineres observados e estrutura inválida SHALL lançar. A falha de uma opção SHALL descartar só essa opção; se nenhuma produzir stream e alguma falhar, o erro agregado SHALL subir para `getStreams`.

#### Scenario: Uma ficha falha e outra resolve

- **WHEN** duas fichas são aceitas e só uma tem opções válidas
- **THEN** os streams da ficha válida são devolvidos e a falha da outra gera apenas aviso.

#### Scenario: Todas as opções falham

- **WHEN** todas as opções aceitas falham na decodificação ou na resolução
- **THEN** o provedor lança erro agregado com as causas e `getStreams` devolve lista vazia.

#### Scenario: Fonte indisponível

- **WHEN** a busca ou a ficha responde erro de rede ou HTTP fora de 2xx
- **THEN** o erro sobe até `getStreams`, é registrado com `[Starck Filmes]` e a saída é lista vazia.

### Requirement: Contrato dos streams

Todo stream SHALL usar `buildStream` e `format`, sem `name` ou `title` informados pelo provedor. Magnet SHALL usar BTIH hexadecimal de 40 caracteres, inclusive quando a fonte publicar base32, com o mesmo valor em `infoHash`. Qualidade e idioma SHALL vir dos textos já obtidos; tamanho SHALL vir do rótulo ou de `xl` quando presentes. Duplicatas por hash ou URL SHALL ser removidas e a lista final SHALL ser ordenada por qualidade.

#### Scenario: Hash base32

- **WHEN** a ficha publica `xt=urn:btih:` com 32 caracteres base32
- **THEN** o stream usa o hash convertido para 40 hexadecimais no magnet e em `infoHash`.

#### Scenario: Áudio dual

- **WHEN** o bloco da opção declara `Dual Áudio`
- **THEN** o stream sai com `language` "Dublado (Não PT-BR?)".

#### Scenario: Qualidade desconhecida

- **WHEN** nenhum texto da opção declara resolução reconhecível
- **THEN** o stream é preservado com `quality` "Desconhecida", sem requisição extra.

#### Scenario: Duplicata

- **WHEN** duas opções resolvem para o mesmo hash ou a mesma URL
- **THEN** o provedor devolve um único stream.
