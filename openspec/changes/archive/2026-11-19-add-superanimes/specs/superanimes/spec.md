# Spec Delta

## Purpose

Localizar filmes e séries de anime no catálogo público do Super Animes (AnimesTVS), confirmar a obra e a temporada pelos títulos e pelo ano do TMDB, selecionar o episódio pelo rótulo publicado e devolver os MP4 diretos com áudio e qualidade derivados da fonte.

## ADDED Requirements

### Requirement: Transporte das rotas públicas

O provedor SHALL consultar `GET https://api.animestvs.org/animes`, `GET /episodios-dublados` e `GET /episodios-legendados` com `fetchJson` e perfil `api`, sem conta, chave, token ou cookie. Resposta fora de 2xx, corpo não JSON ou envelope que não seja lista SHALL ser erro, nunca ausência.

#### Scenario: Catálogo responde lista

- **WHEN** o catálogo responde HTTP 200 com uma lista JSON
- **THEN** o provedor segue para a seleção local sem outra requisição de busca.

#### Scenario: Catálogo responde HTML

- **WHEN** o catálogo responde um corpo que não é JSON
- **THEN** o erro de leitura sobe até `getStreams`, é registrado com `[Super Animes]` e a saída é lista vazia.

#### Scenario: Envelope fora de lista

- **WHEN** o catálogo ou uma lista de episódios responde um objeto em vez de lista
- **THEN** o provedor lança erro de estrutura, em vez de tratar como catálogo vazio.

### Requirement: Identidade de filme

Para `movie`, o provedor SHALL considerar entradas com exatamente um episódio, título compatível com os títulos do TMDB após remover o sufixo de áudio e ano dentro da tolerância de um. Uma entrada SHALL ser escolhida por áudio, pela maior similaridade e depois pelo ano exato; sem candidato, a saída SHALL ser lista vazia.

#### Scenario: Filme dublado e legendado

- **WHEN** o catálogo publica o mesmo filme em `(Dublado)` e sem sufixo
- **THEN** cada variante é uma opção independente com o áudio correspondente.

#### Scenario: Filme de outro ano

- **WHEN** existe uma entrada parecida, mas o ano diverge mais de um do TMDB
- **THEN** a entrada é descartada e outra compatível pode ser escolhida.

#### Scenario: Filme sem entrada de um episódio

- **WHEN** nenhuma entrada compatível tem exatamente um episódio
- **THEN** o provedor devolve lista vazia, sem erro.

### Requirement: Identidade de série e temporada

Para `tv`, o provedor SHALL confirmar a obra por prefixo ou similaridade dos títulos do TMDB e selecionar a temporada pela entrada de base (temporada 1), pelo marcador `Season N`/`Nth Season`/`Temporada N`/`Nª Temporada`/número final, pelo romaji específico da temporada ou pelo romaji de arco sem número com ano compatível. Marcador que faz parte do título do TMDB SHALL NOT ser lido como temporada da fonte.

#### Scenario: Primeira temporada

- **WHEN** o app pede a temporada 1 e a fonte publica a entrada de base
- **THEN** o provedor usa a entrada de base, nunca uma entrada de arco de outra temporada.

#### Scenario: Temporada nomeada pelo TMDB

- **WHEN** o romaji da temporada 3 é `Kimetsu no Yaiba: Yuukaku-hen` e a fonte publica `Kimetsu no Yaiba 2: Yuukaku-hen`
- **THEN** o provedor seleciona a entrada correta pela similaridade do romaji.

#### Scenario: Título que já contém a temporada

- **WHEN** o próprio título do TMDB é `Koori no Jouheki 2nd Season`
- **THEN** o marcador `2nd Season` é tratado como parte do nome da obra, não como temporada 2 da fonte.

#### Scenario: Temporada não publicada

- **WHEN** nenhuma entrada corresponde à temporada pedida
- **THEN** o provedor devolve lista vazia, sem escolher por posição.

### Requirement: Partes e numeração absoluta

O provedor SHALL ordenar as partes da temporada por `Part N` e ano, descontar a contagem de episódios de cada parte até localizar o episódio pedido e, quando a temporada não for coberta, aplicar a numeração absoluta do TMDB sobre a entrada que publica a série inteira. Sem entrada que cubra o número, a saída SHALL ser lista vazia.

#### Scenario: Temporada em duas partes

- **WHEN** a temporada 3 tem 22 episódios e a fonte publica 12 + 10
- **THEN** o episódio 13 é resolvido como episódio 1 da segunda parte.

#### Scenario: Série inteira em uma entrada

- **WHEN** a fonte publica 210 episódios e o TMDB pede a temporada 2 episódio 1
- **THEN** o provedor calcula o episódio absoluto 53 e o procura na entrada da série.

#### Scenario: Episódio além da cobertura

- **WHEN** a soma das partes ou a entrada da série não alcança o episódio pedido
- **THEN** o provedor devolve lista vazia, sem inventar índice.

### Requirement: Episódio pelo rótulo publicado

O provedor SHALL localizar o episódio pelo número de `Episódio NNN` ou pelo rótulo `Filme`, que equivale ao episódio 1, depois de filtrar as linhas pelo título normalizado da entrada. Linha ausente SHALL ser ausência; `link_video` vazio ou fora de HTTP(S) SHALL ser falha da opção.

#### Scenario: Rótulo com zeros à esquerda

- **WHEN** a linha publica `Episódio 008` e o episódio pedido é 8
- **THEN** a linha é selecionada.

#### Scenario: Filme com rótulo Filme

- **WHEN** a entrada de filme tem a linha `Filme`
- **THEN** o provedor monta o stream dessa linha.

#### Scenario: Buraco na numeração

- **WHEN** a entrada não publica o número pedido
- **THEN** o provedor devolve lista vazia, sem usar a posição como palpite.

### Requirement: Qualidade e áudio

O áudio SHALL ser `Dublado` para entrada `Dublado`/`dublado` e `Legendado` para `Legendado`/`legendado`. A qualidade SHALL ser derivada do diretório do CDN: `fullhd` vira `1080p`, `hd3` e `hd2` viram `720p`, `iphoneb` vira `420p`; `like`, `thunder3` e caminhos sem diretório reconhecido SHALL ficar `Desconhecida`. Nenhuma requisição extra SHALL ser feita para descobrir qualidade.

#### Scenario: Diretório fullhd

- **WHEN** a URL publica `/dublados/fullhd/<id>.mp4`
- **THEN** o stream sai com qualidade `1080p`.

#### Scenario: Diretório hd2

- **WHEN** a URL publica `/legendados/hd2/<id>.mp4`
- **THEN** o stream sai com qualidade `720p`.

#### Scenario: Diretório like

- **WHEN** a URL publica `/legendados/like/<id>.mp4`
- **THEN** o stream sai com qualidade `Desconhecida`.

#### Scenario: Áudio minúsculo

- **WHEN** a entrada publica `audio: "dublado"`
- **THEN** o idioma sai como `Dublado`.

### Requirement: Montagem e deduplicação

O provedor SHALL montar cada stream com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `Super Animes`, título, ano e coordenadas em série), `type` `mp4` e `provider` `AnimesTVS`, sem `name`, `title` ou cabeçalhos inventados. A lista final SHALL remover URLs repetidas e ser ordenada da maior para a menor qualidade.

#### Scenario: Dois áudios do mesmo episódio

- **WHEN** dublado e legendado apontam para URLs diferentes
- **THEN** os dois streams são devolvidos, cada um com seu idioma.

#### Scenario: URL repetida

- **WHEN** duas linhas publicam a mesma URL
- **THEN** o stream aparece uma única vez.

### Requirement: Isolamento e fronteira de erro

Cada áudio SHALL ser resolvido em isolamento; a falha de uma lista de episódios SHALL gerar `console.warn('[Super Animes] Opção <áudio> <título> descartada: <causa>')` e preservar o outro. Se nenhum stream sair e alguma opção falhar, o erro agregado SHALL subir. Somente `getStreams` SHALL capturar a falha final, registrar com `[Super Animes]` e devolver lista vazia, sem timeout, retentativa ou cache.

#### Scenario: Uma lista falha e a outra responde

- **WHEN** `/episodios-legendados` responde HTTP 500 e `/episodios-dublados` responde 200
- **THEN** o stream dublado é devolvido e a falha gera apenas o aviso de descarte.

#### Scenario: As duas listas falham

- **WHEN** os dois endpoints de episódios falham
- **THEN** o provedor lança erro agregado com as duas causas e `getStreams` devolve lista vazia.

#### Scenario: Nenhum candidato

- **WHEN** o catálogo não tem o título ou a temporada, sem falha de rede
- **THEN** o provedor devolve lista vazia, sem aviso nem erro.

### Requirement: Validação de entrada

`getStreams` SHALL rejeitar `mediaType` fora de `movie`/`tv` e série sem `season` e `episode` inteiros a partir de 1 antes de qualquer requisição. Filme SHALL ignorar as coordenadas de episódio.

#### Scenario: Tipo inválido

- **WHEN** `mediaType` é `anime`
- **THEN** o erro sobe até `getStreams`, é registrado com `[Super Animes]` e a saída é lista vazia.

#### Scenario: Série sem episódio

- **WHEN** a série chega com `episode` nulo ou zero
- **THEN** o provedor lança erro antes de consultar o TMDB ou a fonte.
