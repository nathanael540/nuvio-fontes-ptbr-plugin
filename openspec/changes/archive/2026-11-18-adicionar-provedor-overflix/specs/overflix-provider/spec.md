# Spec Delta

## Purpose

Localizar filmes e séries no catálogo OverFlix pelo ID do TMDB, acompanhar a troca de domínio da fonte e devolver os streams MP4 dublados e legendados anunciados pelo VideoBox.

## ADDED Requirements

### Requirement: Descoberta do domínio vigente

O provedor SHALL resolver o domínio a cada chamada, antes da busca, com `GET https://www.overflix.win`. O host final do redirecionamento SHALL prevalecer quando for diferente da semente. Sem redirecionamento, o provedor SHALL ler `window.domainAlertPayload`, decodificar Base64, interpretar o JSON, ler `baseUrl` e decodificar Base64 outra vez quando `baseUrl` não for uma URL HTTP(S). Se a descoberta falhar, SHALL usar `www.overflix.download`.

#### Scenario: Redirecionamento da semente para o domínio atual

- **WHEN** a semente responde com URL final em outro host HTTPS
- **THEN** o provedor usa o host final em todas as requisições da chamada.

#### Scenario: Payload com `baseUrl` codificado em Base64

- **WHEN** a semente responde sem redirecionamento e publica `window.domainAlertPayload`
- **THEN** o provedor decodifica o payload, interpreta o JSON, decodifica `baseUrl` e usa o host obtido.

#### Scenario: Payload com `baseUrl` já em HTTP(S)

- **WHEN** o JSON do payload traz `baseUrl` começando por `https://`
- **THEN** o provedor usa a URL como veio, sem segunda decodificação.

#### Scenario: Falha da descoberta

- **WHEN** a semente não responde, o payload está ausente ou a decodificação falha
- **THEN** o provedor usa `www.overflix.download` e continua a chamada.

#### Scenario: Descoberta sem cache entre chamadas

- **WHEN** o app faz duas chamadas seguidas
- **THEN** cada chamada executa a descoberta novamente, sem host guardado de chamada anterior.

### Requirement: Redirecionamento JSON das requisições

Cada requisição ao VideoBox SHALL levar `X-Requested-With: XMLHttpRequest`, `User-Agent` e o `Referer` da página correspondente. Quando a resposta trouxer `redirect` em texto, o provedor SHALL seguir no máximo um destino HTTPS, adotar o host de destino para as requisições seguintes e rejeitar cascata, destino não HTTPS ou endereço inválido.

#### Scenario: Busca redirecionada para o domínio atual

- **WHEN** `buscarContent` responde `{ redirect: "https://<host-atual>/index.php?..." }`
- **THEN** o provedor repete a mesma busca no destino e usa o novo host nas etapas seguintes.

#### Scenario: Redirect de destino não HTTPS

- **WHEN** o `redirect` aponta para `http://` ou para um valor que não é URL
- **THEN** o provedor lança erro em vez de seguir.

#### Scenario: Redirect em cascata

- **WHEN** a resposta do destino também traz `redirect`
- **THEN** o provedor lança erro e não segue um terceiro endereço.

### Requirement: Busca e confirmação por TMDB

O provedor SHALL buscar com `buscarContent` pelos títulos PT-BR, original e alternativos, com `type=filmes` para filme e `type=series` para série, e aceitar somente cartões cujo caminho pertença à seção do tipo. A confirmação SHALL exigir `data-tmdb-id` igual ao ID pedido; título e ano apenas ordenam os candidatos. Mais de uma ficha confirmada no mesmo termo SHALL ser ausência por ambiguidade.

#### Scenario: Um cartão confirmado

- **WHEN** a busca devolve um cartão do tipo pedido, com ano compatível, e a ficha declara o TMDB pedido
- **THEN** o provedor usa essa ficha para resolver a mídia.

#### Scenario: Homônimo de outro ano

- **WHEN** a busca devolve duas fichas com o mesmo título e anos diferentes
- **THEN** o provedor descarta a de ano diferente do TMDB e confirma somente a compatível.

#### Scenario: Duas fichas confirmam o mesmo TMDB

- **WHEN** duas fichas do mesmo termo declaram o TMDB pedido
- **THEN** o provedor devolve lista vazia por ambiguidade, sem escolher a primeira.

#### Scenario: Ficha sem o marcador de TMDB

- **WHEN** a ficha do candidato não publica `data-tmdb-id`
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

#### Scenario: Busca sem cartões

- **WHEN** todos os termos devolvem `html` vazio ou nenhum cartão do tipo pedido
- **THEN** o provedor devolve lista vazia.

### Requirement: Seleção de filme e episódio

Em filme, o provedor SHALL usar o `data-video-id` da ficha ou o número final do endereço. Em série, SHALL ler `vbEpisodes` com `data-video-id`, `data-season` e `data-current-audio`, listar com `episodesList` na temporada e no áudio declarados e escolher o episódio pelo número inteiro. O prefixo `serie3=` do endereço SHALL ser removido. Temporada não listada ou episódio ausente SHALL ser ausência.

#### Scenario: Filme com identificador na ficha

- **WHEN** a ficha confirmada declara `data-video-id`
- **THEN** o provedor consulta `playerData` com esse identificador.

#### Scenario: Filme sem identificador na ficha

- **WHEN** a ficha confirmada não declara `data-video-id` e o endereço não termina em número
- **THEN** o provedor lança erro de estrutura.

#### Scenario: Episódio exato em série

- **WHEN** a série declara a temporada pedida e `episodesList` traz o número do episódio como texto
- **THEN** o provedor compara o número como inteiro e resolve o episódio correspondente.

#### Scenario: Endereço de episódio com prefixo

- **WHEN** o item de `episodesList` traz `url` iniciado por `serie3=`
- **THEN** o provedor remove o prefixo antes de resolver o endereço e extrair o identificador.

#### Scenario: Temporada não anunciada

- **WHEN** a lista de `data-season` não contém a temporada pedida
- **THEN** o provedor devolve lista vazia sem consultar `episodesList`.

#### Scenario: Episódio ausente na temporada

- **WHEN** `episodesList` não traz o número pedido
- **THEN** o provedor devolve lista vazia.

#### Scenario: Série sem áudio declarado

- **WHEN** a ficha de série não publica `data-current-audio` nem uma opção de áudio
- **THEN** o provedor lança erro de estrutura, sem presumir `Dublado`.

### Requirement: Opções do playerData

O provedor SHALL consultar `playerData` com o identificador do vídeo e ler `players`, `servers_dub` e `servers_leg`. As bases de MixDrop, Streamtape, DoodStream e Byse SHALL ter padrões, e cada item de `players` com rótulo e URL HTTPS SHALL substituir o padrão do mesmo rótulo normalizado. Cada par `host=fileId` SHALL virar uma opção com o idioma do campo. Host sem resolvedor SHALL ser triagem, sem falha.

#### Scenario: `players` substitui a base padrão

- **WHEN** `players` traz `MixDrop` com uma URL de host diferente da base fixa
- **THEN** as opções de MixDrop usam a URL publicada em `players`.

#### Scenario: Base padrão sem item em `players`

- **WHEN** `players` não traz um dos quatro rótulos conhecidos
- **THEN** o provedor usa a base padrão daquele rótulo.

#### Scenario: Servidores com entidades HTML

- **WHEN** `servers_dub` traz pares separados por `&amp;`
- **THEN** o provedor decodifica as entidades, separa os pares e preserva o identificador de cada servidor.

#### Scenario: Opções dublada e legendada

- **WHEN** `servers_dub` e `servers_leg` anunciam o mesmo host com identificadores diferentes
- **THEN** o provedor cria uma opção `Dublado` e uma `Legendado`, cada uma com o seu identificador.

#### Scenario: Host sem resolvedor

- **WHEN** um servidor anunciado é Byse ou um rótulo desconhecido
- **THEN** o provedor ignora a opção por triagem, sem aviso de falha.

#### Scenario: Ficha sem servidor anunciado

- **WHEN** `playerData` responde um objeto válido com `players` vazio e as duas listas de servidores vazias
- **THEN** o provedor devolve lista vazia.

#### Scenario: `playerData` fora do contrato

- **WHEN** a resposta não é um objeto, `players` não é lista ou as listas de servidores têm número, objeto ou lista
- **THEN** o provedor lança erro de contrato.

### Requirement: Contrato dos streams

Cada opção resolvida SHALL virar um stream MP4 com `buildStream` e `format`, com o idioma do campo, o nome do host como `provider`, os cabeçalhos exigidos pelo host e título, ano, temporada e episódio no formatador. Sem resolução em nenhum texto local, a qualidade SHALL ser `Desconhecida`, sem requisição extra. Duplicatas pela URL e idioma SHALL ser removidas e a lista SHALL ser ordenada por qualidade.

#### Scenario: Stream dublado e legendado

- **WHEN** as duas listas de servidores anunciam o mesmo host
- **THEN** cada stream sai com o idioma do seu campo e o host como `provider`.

#### Scenario: Qualidade não declarada

- **WHEN** a fonte não informa resolução e a URL não contém resolução
- **THEN** o stream é preservado com `Desconhecida`, sem sonda.

#### Scenario: Mesma URL e mesmo idioma

- **WHEN** duas opções resolvem para a mesma URL no mesmo idioma
- **THEN** o provedor devolve um único stream.

#### Scenario: Mesma URL em idiomas diferentes

- **WHEN** dublado e legendado resolvem para a mesma URL
- **THEN** o provedor devolve os dois streams, um por idioma.

#### Scenario: Campos proibidos

- **WHEN** um stream é montado
- **THEN** ele não leva `name` nem `title` informados pelo provedor.

### Requirement: Isolamento por opção e erro agregado

Cada servidor SHALL ser resolvido isoladamente. A falha SHALL descartar só aquela opção, com `console.warn('[OverFlix] Opção <rótulo> descartada: <causa>')`, preservando as demais. Se nenhuma opção produzir stream e alguma tiver falhado, o provedor SHALL lançar um erro com a causa de cada uma. Se todas forem triagem, a saída SHALL ser lista vazia.

#### Scenario: Um host falha e outro funciona

- **WHEN** MixDrop responde erro e Streamtape resolve
- **THEN** os streams de Streamtape são devolvidos e só MixDrop gera aviso de descarte.

#### Scenario: Todos os hosts falham

- **WHEN** todas as opções anunciadas falham na resolução
- **THEN** o provedor lança erro agregado com as causas e `getStreams` devolve lista vazia.

#### Scenario: Todas as opções são triagem

- **WHEN** todos os servidores anunciados são Byse ou hosts desconhecidos
- **THEN** o provedor devolve lista vazia sem aviso de falha.

### Requirement: Fronteira de erro, ausência e tempo

O provedor SHALL validar entrada e `TMDB_API_KEY` antes de qualquer requisição, lançar erros internos com mensagem clara e deixar somente `getStreams` capturar a falha final, registrar com `[OverFlix]` e devolver lista vazia. Busca, ficha, lista de episódios e `playerData` SHALL ser etapas fatais. A descoberta SHALL usar fallback e não SHALL lançar. O provedor SHALL NOT impor limite de tempo, cache de host ou nova tentativa por lentidão.

#### Scenario: Tipo de mídia inválido

- **WHEN** `mediaType` não é `movie` nem `tv`
- **THEN** o erro sobe até `getStreams`, é registrado com `[OverFlix]` e a saída é lista vazia.

#### Scenario: Chave do TMDB ausente

- **WHEN** `TMDB_API_KEY` não está disponível no ambiente do app
- **THEN** o provedor lança erro antes de qualquer requisição à fonte.

#### Scenario: Falha HTTP na busca

- **WHEN** a busca responde HTTP 503
- **THEN** o erro sobe até `getStreams` e a saída é lista vazia, sem ser tratada como ausência.

#### Scenario: Falha da descoberta com fallback

- **WHEN** a descoberta falha, mas o host de fallback responde à busca
- **THEN** a chamada continua e pode devolver streams.

#### Scenario: Ausência sem erro

- **WHEN** nenhum candidato confirma o TMDB, a temporada não existe ou não há servidor anunciado
- **THEN** a saída é lista vazia sem `console.error`.
