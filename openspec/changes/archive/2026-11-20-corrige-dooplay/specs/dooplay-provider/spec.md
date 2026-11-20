# Spec Delta

## Purpose

Localizar filmes e séries nas origens DooPlay a partir do ID do TMDB, confirmar a identidade, selecionar o episódio, expandir as opções no domínio final da ficha e devolver os streams HLS sob o contrato do Nuvio, distinguindo ausência de falha externa.

## ADDED Requirements

### Requirement: Busca e confirmação de identidade

Para cada origem ativa, o provedor SHALL consultar a busca com o ID IMDb, o título do TMDB, o título original e os alternativos brasileiros, e SHALL aceitar apenas cartões do tipo pedido (`/filme(s)/` ou `/serie(s)/`). A página do candidato SHALL confirmar o IMDb ou o TMDB do pedido quando publicar identidade; para filme em origem de iframe, a identidade IMDb SHALL estar presente. Busca sem cartão é ausência, e HTML de busca não reconhecido é erro.

#### Scenario: Título encontrado pelo original

- **WHEN** a busca do título original devolve um cartão do tipo pedido e a ficha confirma o mesmo IMDb
- **THEN** o provedor segue com essa página, mesmo que o título em português não tenha retornado cartão.

#### Scenario: Busca sem cartão é ausência

- **WHEN** todas as variantes de busca respondem 200 sem cartão do tipo pedido
- **THEN** a origem termina em ausência, sem erro fatal.

#### Scenario: Identidade divergente

- **WHEN** a ficha publica um IMDb ou TMDB diferente do pedido
- **THEN** o candidato é descartado e nenhuma opção daquela página é aberta.

#### Scenario: Filme iframe sem identidade

- **WHEN** a página de filme em uma origem de iframe não publica IMDb
- **THEN** o candidato é descartado; se todos os candidatos da origem faltarem identidade, a origem falha com erro de identidade ausente.

#### Scenario: HTML de busca não reconhecido

- **WHEN** a resposta não tem os marcadores de busca nem mensagem explícita de ausência
- **THEN** o provedor lança erro de estrutura da origem, sem confundir com ausência.

### Requirement: Seleção de episódio pela listagem

Para série, o provedor SHALL ler os itens `li.mark-<n>`, extrair temporada e episódio de `.numerando` nos formatos `Tx Ey`, `n - m` ou `n x m` e escolher o par exato do pedido, sem usar a posição visual. Episódio ausente SHALL ser ausência; listagem não reconhecida ou coordenadas contraditórias SHALL lançar erro.

#### Scenario: Par exato escolhido

- **WHEN** a listagem publica `T2 E3` e o pedido é S02E03
- **THEN** o provedor abre o episódio correspondente ao par, não outro episódio de mesmo número em outra temporada.

#### Scenario: Episódio ausente

- **WHEN** a listagem só tem a temporada 1 e o pedido é S02E03
- **THEN** a origem termina em ausência de episódio, sem abrir a página errada.

#### Scenario: Listagem não reconhecida

- **WHEN** a página de série não publica itens `li.mark-*` nem uma listagem equivalente
- **THEN** o provedor lança erro de estrutura da origem.

### Requirement: Expansão no domínio final da ficha

Após confirmar a página do conteúdo, o provedor SHALL enviar a expansão da opção DooPlay para a origem da URL final dessa página, tanto no `POST /wp-admin/admin-ajax.php` quanto no `GET /wp-json/dooplayer/v2/...`, mantendo o `Referer` e o formulário. A origem configurada SHALL NOT ser usada quando a página tiver redirecionado para outro host HTTPS.

#### Scenario: Redirect da ficha para outro domínio

- **WHEN** a ficha é confirmada em `www.pobreflixfull.com` depois de a busca usar `www.pobreflixnow.rest`
- **THEN** o AJAX é enviado a `www.pobreflixfull.com`, que devolve `embed_url`, e o host antigo não recebe o `POST`.

#### Scenario: Redirect da origem REST

- **WHEN** a ficha confirmada está em `startrekfilms.net` e a opção usa a rota REST
- **THEN** a rota `/wp-json/dooplayer/v2/...` é consultada em `startrekfilms.net`.

#### Scenario: Sem redirect

- **WHEN** a ficha confirmada está na mesma origem configurada
- **THEN** a expansão continua na mesma origem, com o mesmo `Referer` e formulário.

#### Scenario: Destino não HTTPS

- **WHEN** a URL final da ficha não usa HTTPS
- **THEN** a expansão daquela origem falha, sem enviar o formulário para um destino inseguro.

### Requirement: Origens ativas e falhas externas

O provedor SHALL manter na lista apenas origens públicas que respondam com conteúdo ou redirect HTTPS. HTTP 404 permanente SHALL remover a origem da lista. HTTP 403 de desafio Cloudflare, 404, 5xx e páginas de bloqueio SHALL ser registrados como falha da origem, não como ausência, e SHALL NOT ser contornados.

#### Scenario: Origem morta

- **WHEN** a home e a busca de uma origem respondem HTTP 404
- **THEN** a origem sai da lista ativa e deixa de ser chamada.

#### Scenario: Desafio Cloudflare

- **WHEN** a origem responde HTTP 403 com `Just a moment...`
- **THEN** a origem é registrada como falha externa, sem tentativa de bypass.

#### Scenario: Redirect público aceito

- **WHEN** uma origem ativa redireciona a busca para outro host HTTPS público
- **THEN** o provedor segue o redirect e usa a origem final da ficha para expandir as opções.

### Requirement: Preservação dos streams existentes

Todo stream SHALL ser montado com `buildStream` e `format`, com `url` HTTP(S), qualidade descoberta localmente, idioma do enum, headers de reprodução e legendas quando a fonte os fornecer. Streams iguais SHALL ser deduplicados e a lista SHALL ser ordenada por qualidade.

#### Scenario: Filme resolvido pela cadeia myembed

- **WHEN** a ficha de um filme com IMDb confirmado publica `iframe.metaframe` e a cadeia chega a um HLS de uma família suportada
- **THEN** o provedor devolve o stream com o host do player final, sem depender da expansão AJAX.

#### Scenario: Episódio resolvido pela expansão corrigida

- **WHEN** o episódio é selecionado em `www.pobreflixfull.com` e o AJAX no domínio final devolve um embed do plenoflu suportado
- **THEN** o provedor devolve o stream com temporada e episódio no `format` e o idioma comprovado.

#### Scenario: Opção não suportada

- **WHEN** uma opção aponta para host fora das famílias suportadas ou para playlist sem resolução
- **THEN** a opção é descartada por triagem e as demais continuam.

### Requirement: Distinção entre ausência e falha

Quando todas as origens ativas terminarem em ausência e nenhuma falhar, o provedor SHALL devolver `[]` e registrar a ausência sem `console.error`. Quando alguma origem falhar e nenhuma entregar stream, SHALL registrar `console.error` com a classe de cada origem e devolver `[]`.

#### Scenario: Todas as origens ausentes

- **WHEN** as buscas e as fichas das origens ativas não têm o título ou o episódio
- **THEN** o resumo registra `ausencia` para cada origem, sem `console.error`.

#### Scenario: Falha externa sem stream

- **WHEN** uma origem responde 403 ou 404 e as demais terminam em ausência
- **THEN** o resumo registra a falha daquela origem, devolve `[]` e não a descreve como ausência de acervo.

#### Scenario: Sucesso depois de falha

- **WHEN** uma origem falha e outra entrega streams
- **THEN** o provedor devolve os streams e mantém a falha apenas no aviso da origem, sem resumo de erro final.
