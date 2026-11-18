# Spec Delta

## MODIFIED Requirements

### Requirement: Busca pelo IMDb e fallback por título

O provedor SHALL consultar a busca de cada catálogo configurado — CineAgora, CineGratis e VisionCine — com o IMDb informado pelo TMDB. Sem candidato confirmado, SHALL consultar o título PT-BR e, se diferente, o título original. Cada consulta SHALL usar no máximo a primeira página de resultados. A busca e as páginas do VisionCine SHALL ser consultadas com `Referer` da própria base, porque respondem 403 sem ele.

#### Scenario: IMDb encontra o título

- **WHEN** o TMDB informa um IMDb presente no catálogo
- **THEN** o provedor confirma o candidato correspondente sem consultar os títulos.

#### Scenario: IMDb sem resultado

- **WHEN** a busca pelo IMDb não devolve candidato confirmado
- **THEN** o provedor consulta o título PT-BR do TMDB.

#### Scenario: Fallback para o título original

- **WHEN** a busca pelo título PT-BR não confirma nenhum candidato e o título original é diferente
- **THEN** o provedor consulta o título original.

#### Scenario: Busca em cada catálogo

- **WHEN** o provedor inicia a busca de um pedido
- **THEN** ele consulta a busca própria de CineAgora, CineGratis e VisionCine, cada uma na primeira página.

#### Scenario: VisionCine com `Referer`

- **WHEN** o provedor consulta a busca ou a página do VisionCine
- **THEN** a requisição leva `Referer` da base do VisionCine e o site responde 200.

#### Scenario: Um catálogo sem o título

- **WHEN** um catálogo não confirma o título e os demais ainda não foram consultados
- **THEN** o provedor continua a busca nos demais catálogos.

#### Scenario: Nenhuma variante encontra o título

- **WHEN** IMDb, título PT-BR e título original terminam sem candidato confirmado em todos os catálogos
- **THEN** o provedor reconhece ausência e não produz streams.

### Requirement: Confirmação de identidade e tipo

Candidatos SHALL pertencer à seção do tipo de cada catálogo: CineAgora `/filmes-hd-online/` e `/series-online-hd-gratis/`; CineGratis `/filmes-hd-gratis/` e `/series-hd-online/`; VisionCine `/ver-filmes-hd-online-gratis/` e `/series-online/`. No máximo três candidatos por catálogo e termo. O candidato SHALL ter título compatível, ano igual quando o catálogo o publica e o mesmo IMDb quando publicado; busca por IMDb com um único resultado do tipo confirma. Ambiguidade no mesmo catálogo é ausência.

#### Scenario: Filme confirmado

- **WHEN** exatamente um resultado da seção de filmes tem o IMDb, o título e o ano do TMDB
- **THEN** ele é aceito e segue para a descoberta de espelhos.

#### Scenario: Série confirmada

- **WHEN** exatamente um resultado da seção de séries tem o IMDb, o título e o ano do TMDB
- **THEN** ele é aceito e segue para a seleção do episódio.

#### Scenario: CineGratis confirmado por IMDb

- **WHEN** a busca por IMDb no CineGratis devolve um único candidato do tipo pedido e a página confirma título e ano
- **THEN** o candidato é aceito, mesmo que a página não publique o IMDb no HTML visível.

#### Scenario: VisionCine sem IMDb na página

- **WHEN** a busca por IMDb no VisionCine devolve um único candidato do tipo pedido e a página confirma título e ano
- **THEN** o candidato é aceito sem exigir um campo de IMDb na página.

#### Scenario: Resultado de outra seção

- **WHEN** um resultado aponta para notícia, coleção ou seção de tipo diferente do pedido
- **THEN** ele é descartado sem interromper a avaliação dos demais.

#### Scenario: IMDb divergente

- **WHEN** a página do candidato publica IMDb diferente do TMDB
- **THEN** o candidato é descartado, mesmo com título parecido.

#### Scenario: Ano divergente

- **WHEN** o resultado ou a página do candidato publica ano diferente do TMDB
- **THEN** o candidato é descartado, mesmo com o mesmo título.

#### Scenario: Ambiguidade

- **WHEN** mais de um candidato passa pela confirmação no mesmo catálogo e termo
- **THEN** o provedor reconhece ausência naquele catálogo em vez de escolher o primeiro.

#### Scenario: Confirmação em mais de um catálogo

- **WHEN** o mesmo título é confirmado em CineAgora, CineGratis e VisionCine
- **THEN** os três catálogos seguem para o player; isso não é ambiguidade.

### Requirement: Ausência reconhecida e falhas preservadas

Busca vazia, nenhum candidato confirmado e candidato de outro tipo SHALL ser ausência. HTTP fora de 2xx, HTML sem os marcadores esperados, JSON inválido e página de candidato ilegível SHALL ser erro isolado do catálogo; os demais continuam. Sem streams e com falha, o erro agregado SHALL subir; todas as ausências devolvem lista vazia.

#### Scenario: Catálogo sem o título

- **WHEN** todas as buscas terminam sem candidato confirmado
- **THEN** a saída é lista vazia, sem erro de falha.

#### Scenario: Falha de rede ou HTTP

- **WHEN** a busca de um catálogo responde fora de 2xx ou a conexão falha
- **THEN** o erro é isolado daquele catálogo e os demais continuam; se nenhum produzir stream, o erro agregado sobe até `getStreams`, que registra com `[CineAgora]` e devolve lista vazia.

#### Scenario: Página de candidato ilegível

- **WHEN** a página do candidato não traz título ou ano no formato esperado
- **THEN** o provedor lança erro de estrutura daquele catálogo, isolado dos demais, em vez de tratar como ausência.

#### Scenario: Um catálogo falha e outro confirma

- **WHEN** um catálogo responde HTTP 503 ou layout inválido e outro confirma o título e produz streams
- **THEN** o provedor devolve os streams do catálogo válido e registra o aviso do catálogo descartado.

#### Scenario: Todos os catálogos falham

- **WHEN** nenhum catálogo produz streams e ao menos um falhou tecnicamente
- **THEN** o erro agregado sobe até `getStreams`, que registra `[CineAgora]` e devolve lista vazia.

#### Scenario: Todos os catálogos sem o título

- **WHEN** todos os catálogos terminam em ausência sem falha técnica
- **THEN** o provedor devolve lista vazia sem erro fatal.

## ADDED Requirements

### Requirement: União e deduplicação dos catálogos

O provedor SHALL resolver o player de cada catálogo confirmado e unir os streams, deduplicando pelo `uid`+`md5`+`id` do BrStream. O mesmo arquivo em mais de um catálogo SHALL aparecer uma vez, com o rótulo do primeiro catálogo na ordem CineAgora, CineGratis e VisionCine.

#### Scenario: Mesmo arquivo em três catálogos

- **WHEN** CineAgora, CineGratis e VisionCine confirmam o mesmo `uid`, `md5` e `id`
- **THEN** o provedor devolve um único stream para esse arquivo.

#### Scenario: Arquivos diferentes

- **WHEN** catálogos diferentes confirmam arquivos BrStream distintos
- **THEN** o provedor devolve todos os streams, sem eliminar os distintos.

#### Scenario: Rótulo do primeiro catálogo

- **WHEN** o mesmo arquivo tem rótulo `Dublado` no CineAgora e outro rótulo nos demais
- **THEN** o stream deduplicado mantém o rótulo do CineAgora.

#### Scenario: Catálogo sem streams

- **WHEN** um catálogo confirma o título, mas não produz nenhum stream, e outro produz
- **THEN** a ausência daquele catálogo não elimina os streams dos demais.

### Requirement: Triagem de resultados e busca vazia

Busca sem cartões em página com o formulário do catálogo SHALL ser ausência, mesmo sem a mensagem DLE. Resultado sem título ou ano SHALL ser descartado; se nenhum resultado do termo tiver título e ano, o catálogo SHALL falhar.

#### Scenario: Busca não latina sem marcador

- **WHEN** a busca responde uma página de busca válida sem cartões e sem a mensagem de ausência
- **THEN** o termo é tratado como ausência e os demais termos continuam.

#### Scenario: Resultado sem ano no meio da lista

- **WHEN** um resultado do CineGratis não tem título ou ano e outros resultados do mesmo termo têm
- **THEN** o resultado incompleto é descartado e os demais seguem para confirmação.

#### Scenario: Todos os resultados sem título ou ano

- **WHEN** todos os resultados do CineGratis no termo estão sem título ou ano
- **THEN** o catálogo falha como erro de estrutura, em vez de tratar como ausência.
