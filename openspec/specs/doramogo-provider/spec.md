# doramogo-provider Specification

## Purpose
Localizar filmes e séries no Doramogo a partir do ID do TMDB, confirmar a identidade, selecionar a temporada e o episódio ou o filme e devolver os streams HLS publicados pela fonte.

## Requirements

### Requirement: Busca por variantes de título do TMDB

O provedor SHALL consultar a busca do Doramogo com o título PT-BR, o título original e os títulos alternativos brasileiros do TMDB, deduplicando as variantes sem diferenciar maiúsculas. Cada variante SHALL ser tentada até haver candidato confirmado; se todas terminarem sem confirmação, a saída SHALL ser lista vazia.

#### Scenario: Título PT-BR encontra o conteúdo

- **WHEN** o TMDB informa o título PT-BR de uma série publicada no Doramogo
- **THEN** a busca por esse título devolve o cartão correspondente e o provedor segue para a confirmação.

#### Scenario: Título PT-BR não encontra, mas o original encontra

- **WHEN** a busca pelo título PT-BR termina sem candidato confirmado e o título original do TMDB encontra o conteúdo
- **THEN** o provedor usa o candidato da variante original.

#### Scenario: Nenhuma variante encontra o título

- **WHEN** todas as variantes de busca terminam sem candidato confirmado
- **THEN** o provedor devolve lista vazia, sem tratar a ausência como falha.

#### Scenario: Limite da busca

- **WHEN** a busca devolve mais resultados do que o recorte publicado pela fonte e o título pedido não está entre eles
- **THEN** o provedor não inventa paginação nem considera o conteúdo encontrado.

### Requirement: Confirmação de identidade pelo ID do TMDB

Um candidato SHALL ser confirmado somente quando o tipo do cartão corresponder ao pedido (`Filme` para `movie`, `Dorama` para `tv`) e a imagem do cartão contiver exatamente o ID do TMDB pedido. Quando o cartão não expuser o ID, a ficha SHALL ser consultada antes da confirmação. O ano exibido na ficha SHALL NOT ser usado como ano de lançamento.

#### Scenario: ID e tipo coincidem

- **WHEN** o cartão do tipo pedido traz no nome da imagem o mesmo ID do TMDB da solicitação
- **THEN** o candidato é confirmado, ainda que o ano exibido na ficha divirja do ano do TMDB.

#### Scenario: Título parecido com outro ID

- **WHEN** a busca devolve um título parecido cuja imagem traz outro ID do TMDB
- **THEN** o candidato é descartado.

#### Scenario: Tipo conflitante

- **WHEN** o pedido é de filme e o cartão é do tipo `Dorama`, ou o pedido é de série e o cartão é do tipo `Filme`
- **THEN** o candidato é descartado mesmo que o título seja semelhante.

#### Scenario: Cartão sem ID na imagem

- **WHEN** o cartão confirmado pelo tipo não expõe o ID no nome da imagem
- **THEN** o provedor consulta a ficha e só aceita o candidato se a imagem da ficha trouxer o ID pedido.

### Requirement: Seleção de temporada e episódio em séries

Para série, o provedor SHALL selecionar a temporada e o episódio pela lista de episódios da ficha, exigindo a coordenada exata. Se a coordenada não existir, SHALL devolver lista vazia. A página do episódio SHALL manter a mesma coordenada após redirecionamentos; redirecionamento para outro episódio SHALL ser tratado como ausência.

#### Scenario: Episódio exato

- **WHEN** a ficha da série lista a temporada e o episódio pedidos
- **THEN** o provedor usa o link dessa coordenada e monta o stream correspondente.

#### Scenario: Temporada posterior

- **WHEN** a ficha lista várias temporadas e o pedido é de uma temporada posterior
- **THEN** o provedor escolhe o episódio da temporada pedida, não o da primeira temporada.

#### Scenario: Episódio ausente

- **WHEN** a ficha confirmada não lista a coordenada pedida
- **THEN** o provedor devolve lista vazia, sem escolher outro episódio.

#### Scenario: Redirecionamento para outro episódio

- **WHEN** a página do episódio pedido redireciona para uma coordenada diferente
- **THEN** o provedor trata o pedido como ausência e não devolve o episódio redirecionado.

### Requirement: Seleção de filme

Para filme, o provedor SHALL usar a página pseudoepisódio `temporada-1/episodio-01` da ficha confirmada. Se a ficha não oferecer essa entrada, SHALL devolver lista vazia. A página usada SHALL declarar o tipo de filme.

#### Scenario: Filme com entrada de reprodução

- **WHEN** a ficha confirmada de filme contém a entrada `temporada-1/episodio-01`
- **THEN** o provedor usa essa página e monta o stream do filme.

#### Scenario: Filme sem entrada de reprodução

- **WHEN** a ficha confirmada de filme não contém a entrada pseudoepisódio
- **THEN** o provedor devolve lista vazia.

#### Scenario: Página de série não atende filme

- **WHEN** o pedido é de filme e a página confirmada se declara como série
- **THEN** o provedor não usa a página e devolve lista vazia.

### Requirement: Caminho HLS publicado pela página

O provedor SHALL ler a configuração do player na página do episódio e o host alternativo publicado, montar a URL HLS a partir do host e do caminho informados e validar `tipo`, `slug`, temporada e episódio. O host SHALL NOT ser fixado no código. Configuração ausente ou incompatível SHALL ser erro de estrutura.

#### Scenario: Caminho de série

- **WHEN** a página declara uma série com temporada e episódio
- **THEN** a URL HLS é montada com o slug, a temporada com dois dígitos e o episódio com dois dígitos, no host alternativo publicado.

#### Scenario: Caminho de filme

- **WHEN** a página declara um filme
- **THEN** a URL HLS é montada com o slug e o caminho de filme publicado, sem temporada nem episódio.

#### Scenario: Configuração ausente

- **WHEN** a página do episódio não publica a configuração do player ou o host alternativo
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.

#### Scenario: Configuração incompatível com o pedido

- **WHEN** a configuração publicada declara outro tipo, outro slug ou outra coordenada que não a pedida
- **THEN** o provedor não monta o stream e trata a divergência conforme a etapa: ausência para coordenada redirecionada, erro para estrutura inesperada.

### Requirement: Cabeçalhos de reprodução

O stream SHALL incluir `Referer` da página do episódio, `Origin` da origem do Doramogo e `User-Agent` de navegador. A URL de mídia SHALL ser devolvida com esses cabeçalhos; a fonte não SHALL ser tratada como ausência por exigir contexto HTTP.

#### Scenario: Stream com contexto de reprodução

- **WHEN** o provedor monta o stream de um episódio ou filme
- **THEN** o campo `headers` traz `Referer`, `Origin` e `User-Agent` compatíveis com a página que publicou a mídia.

### Requirement: Idioma pelo rótulo da fonte

O provedor SHALL classificar o idioma pelo rótulo `Áudio:` da ficha, usando `Dublado` para o rótulo dublado e `Legendado` para o legendado. Sem rótulo reconhecível, o stream SHALL sair com `Idioma Desconhecido`, sem promoção de português sem evidência.

#### Scenario: Ficha dublada

- **WHEN** a ficha declara `Áudio: Dublado`
- **THEN** o stream sai com `language` "Dublado".

#### Scenario: Ficha legendada

- **WHEN** a ficha declara `Áudio: Legendado`
- **THEN** o stream sai com `language` "Legendado".

#### Scenario: Rótulo ausente ou desconhecido

- **WHEN** a ficha não declara um rótulo de áudio reconhecível
- **THEN** o stream sai com `language` "Idioma Desconhecido".

### Requirement: Variantes de áudio independentes

Cada variante de áudio confirmada, ainda que compartilhe o mesmo ID do TMDB em páginas distintas, SHALL ser resolvida como opção independente. O provedor SHALL devolver os streams de todas as variantes que resolverem; a falha de uma SHALL descartar somente essa variante, com aviso; se nenhuma produzir stream e alguma falhar, SHALL lançar erro com as causas.

#### Scenario: Duas variantes resolvem

- **WHEN** a busca confirma uma página dublada e uma legendada do mesmo título
- **THEN** o provedor devolve os streams das duas, com os idiomas correspondentes.

#### Scenario: Uma variante falha

- **WHEN** uma variante falha na ficha, no episódio ou na configuração e a outra produz stream
- **THEN** o stream válido é devolvido e a falha é registrada como aviso.

#### Scenario: Todas as variantes falham

- **WHEN** todas as variantes confirmadas falham e nenhuma produz stream
- **THEN** o provedor lança erro com a causa de cada variante.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, com `type` HLS, `provider` Doramogo, qualidade descoberta localmente ou `Desconhecida`, e título e ano do TMDB. `name` e `title` SHALL ser gerados pelo formatador. Tamanho e legendas externas SHALL ser omitidos quando a fonte não os fornece.

#### Scenario: Stream HLS completo

- **WHEN** um episódio dublado é resolvido
- **THEN** o stream traz a URL HLS, `type` HLS, `provider` Doramogo, `language` "Dublado" e `name`/`title` gerados pelo formatador.

#### Scenario: Qualidade desconhecida

- **WHEN** a fonte não informa uma qualidade reconhecível
- **THEN** o stream é preservado com "Desconhecida" e fica depois dos streams com qualidade.

#### Scenario: Campos não fornecidos

- **WHEN** a fonte não oferece tamanho nem legendas externas
- **THEN** esses campos não aparecem no stream, sem valores inventados.

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia somente para ausência reconhecida de título, episódio ou entrada de filme. Falha de rede, resposta inválida, página de série sem a lista de episódios ou configuração de player ausente SHALL ser lançada até `getStreams`, que registra com `[Doramogo]` e devolve lista vazia. Entrada inválida SHALL ser rejeitada antes de qualquer requisição.

#### Scenario: Título ausente

- **WHEN** a busca não confirma nenhum candidato para o título pedido
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Falha de rede na busca

- **WHEN** a busca responde fora de 2xx ou o corpo não é a página esperada
- **THEN** o erro sobe até `getStreams`, é registrado com `[Doramogo]` e a saída é lista vazia.

#### Scenario: Entrada inválida

- **WHEN** o ID do TMDB não é numérico, o tipo de mídia é inválido ou uma série vem sem temporada e episódio positivos
- **THEN** a saída é lista vazia, sem requisição de rede.

#### Scenario: Configuração de player ausente

- **WHEN** a página do episódio não publica a configuração ou o host alternativo
- **THEN** o erro de estrutura sobe até `getStreams` e a saída é lista vazia.
