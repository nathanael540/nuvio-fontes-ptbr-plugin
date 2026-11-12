# provider-online-verification Specification

## Purpose

Padronizar a verificação online de resolução de títulos reais pelos provedores e a evidência publicada, distinguindo funcionamento por tipo de conteúdo e indicativo de acervo na amostra.

## Requirements

### Requirement: Dois catálogos extensíveis por tipo

O sistema SHALL manter exatamente dois catálogos de referência, `movie` e `tv`, cada um com no mínimo 20 títulos distintos e sem limite máximo. A referência de popularidade e a data de seleção SHALL ser identificáveis e versionadas com os catálogos.

#### Scenario: Catálogos acima do mínimo

1. **WHEN** `movie` contém 25 títulos distintos e `tv` contém 30
2. **THEN** ambos são aceitos sem truncamento para 20 títulos.

#### Scenario: Catálogo abaixo do mínimo

1. **WHEN** um catálogo contém somente 19 títulos distintos
2. **THEN** a preparação aponta o catálogo inválido sem atribuir falha de funcionamento ao provedor.

### Requirement: Identificação e coordenadas dos títulos

Cada candidato SHALL identificar título, ano, ID do TMDB e tags de nicho, admitindo lista vazia de tags. Candidatos `tv` SHALL indicar temporada e episódio positivos de conteúdo já lançado; candidatos `movie` SHALL não possuir coordenadas de episódio. Um título SHALL aparecer uma única vez em cada catálogo, independentemente de suas tags.

#### Scenario: Episódio identificado

1. **WHEN** um título `tv` é selecionado
2. **THEN** a solicitação e o registro usam o ID do TMDB, a temporada e o episódio definidos no catálogo.

#### Scenario: Tags não duplicam candidatos

1. **WHEN** um mesmo título tem duas tags de nicho
2. **THEN** ele permanece um único candidato e conta no máximo uma vez na amostra do tipo.

### Requirement: Tipos suportados determinam o escopo

O sistema SHALL avaliar somente os tipos declarados em `supportedTypes` pelo provedor. Tags SHALL não criar tipos adicionais nem substituir os valores `movie` e `tv` na solicitação.

#### Scenario: Provedor exclusivo de séries

1. **WHEN** um provedor declara somente `tv`
2. **THEN** somente o catálogo `tv` é usado e a ausência de resultados `movie` não interfere no funcionamento.

### Requirement: Elegibilidade por nicho exclusivo

Para um provedor restrito a um nicho, o sistema SHALL filtrar cada catálogo aplicável pela tag declarada antes do sorteio. Generalistas SHALL usar todos os candidatos do tipo. O filtro SHALL ser explícito e SHALL não ser ampliado automaticamente para compensar ausência ou falha de resultados.

#### Scenario: Provedor exclusivo de animes

1. **WHEN** um provedor exclusivo de animes suporta `movie` e `tv`
2. **THEN** cada amostra contém somente títulos com a tag `anime` do respectivo catálogo.

#### Scenario: Anime sem resolução

1. **WHEN** os animes sorteados não resolvem
2. **THEN** o sistema preserva esses resultados sem substituí-los por títulos de outro nicho.

### Requirement: Amostragem aleatória reproduzível

O sistema SHALL sortear cinco títulos distintos por tipo aplicável entre os candidatos elegíveis e registrar a semente, a versão dos catálogos e a seleção efetiva. A repetição com os mesmos catálogos, configuração e semente SHALL selecionar os mesmos casos. O sistema SHALL tentar todos os cinco casos mesmo após obter sucesso.

#### Scenario: Reexecução da seleção

1. **WHEN** a mesma semente, os mesmos catálogos e o mesmo perfil são usados novamente
2. **THEN** os títulos e suas coordenadas selecionados são os mesmos, ainda que os resultados online possam mudar.

#### Scenario: Menos de cinco elegíveis

1. **WHEN** o catálogo tem ao menos 20 títulos, mas somente quatro atendem ao filtro do provedor
2. **THEN** a preparação informa amostra insuficiente sem repetir títulos, reduzir a amostra ou avaliar outro nicho.

#### Scenario: Primeiro título já resolve

1. **WHEN** o primeiro título de um tipo retorna streams
2. **THEN** os outros quatro também são tentados para compor o indicativo de acervo.

### Requirement: Resolução online do pacote publicado

A verificação SHALL executar o pacote gerado do provedor, identificado por seu conteúdo, com consultas reais às fontes e às dependências de resolução. Fixtures ou respostas simuladas SHALL não servir como evidência pública online. A verificação SHALL não exigir o app instalado nem confirmar reprodução ou disponibilidade P2P.

#### Scenario: Fonte mudou após a gravação de fixtures

1. **WHEN** testes de desenvolvimento passam, mas o pacote não resolve os títulos na fonte real
2. **THEN** a evidência pública registra os resultados online sem aproveitamento da aprovação offline.

#### Scenario: Torrent retornado

1. **WHEN** o provedor retorna um magnet ou uma URL de arquivo de torrent compatível com o contrato
2. **THEN** a resolução é avaliada sem iniciar download P2P nem exigir seeders.

### Requirement: Resultados individuais observáveis

Cada caso SHALL ser registrado como `Resolvido`, `Sem resultado`, `Falha` ou `Inconclusivo`, com quantidade de streams aproveitáveis e motivo quando necessário. `Resolvido` SHALL exigir ao menos um stream compatível com o contrato de saída. Lista vazia com erro do provedor SHALL ser distinguida de lista vazia sem erro.

#### Scenario: Erro capturado pelo provedor

1. **WHEN** o provedor registra erro e devolve uma lista vazia
2. **THEN** o caso é registrado como `Falha`, com motivo sanitizado, em vez de `Sem resultado`.

#### Scenario: Ausência sem erro

1. **WHEN** a resolução conclui com lista vazia e sem erro registrado
2. **THEN** o caso é `Sem resultado`, sem afirmar que a ausência no acervo foi comprovada.

#### Scenario: Falha de uma opção com outra aproveitável

1. **WHEN** uma opção falha, mas o provedor retorna ao menos um stream compatível
2. **THEN** o caso é `Resolvido`, preservando aviso sanitizado quando relevante.

#### Scenario: Estrutura sem opção aproveitável

1. **WHEN** o provedor retorna resultados que não atendem ao contrato mínimo de stream
2. **THEN** o caso é `Falha`, sem contar esses resultados como resolução.

### Requirement: Funcionamento por tipo

O provedor SHALL ser considerado funcionando quando ao menos um título de cada tipo suportado retornar ao menos um stream aproveitável. Resultados de um tipo SHALL não compensar ausência de resolução do outro. A quantidade de títulos adicionais resolvidos SHALL não elevar o requisito mínimo.

#### Scenario: Um sucesso por tipo basta

1. **WHEN** um provedor suporta `movie` e `tv` e resolve um dos cinco títulos de cada tipo
2. **THEN** ele é considerado funcionando, com os indicativos `movie 1/5` e `tv 1/5`.

#### Scenario: Muitos streams de um único filme

1. **WHEN** um provedor de ambos os tipos retorna 30 streams de um filme e nenhum resultado nos cinco títulos `tv` concluídos
2. **THEN** o funcionamento completo não é comprovado, independentemente dos 30 streams do filme.

#### Scenario: Provedor de um único tipo

1. **WHEN** um provedor exclusivo de `tv` resolve um título da amostra
2. **THEN** seu funcionamento é comprovado sem exigir um filme ou sucesso em cada tag.

### Requirement: Indicativo de acervo separado do funcionamento

O sistema SHALL apresentar títulos resolvidos sobre títulos da amostra por tipo, distinguindo a quantidade de streams. Esse indicativo SHALL não ser descrito como tamanho ou percentual do acervo total. Falhas e casos inconclusivos SHALL permanecer visíveis e SHALL não ser excluídos silenciosamente da amostra.

#### Scenario: Amostra com falhas

1. **WHEN** cinco filmes incluem um resolvido, dois sem resultado, uma falha e um inconclusivo
2. **THEN** o indicativo é `movie 1/5`, com os quatro resultados restantes explicitados, sem mudar o sucesso já comprovado para `movie`.

### Requirement: Status público independente de testes unitários

O status público SHALL refletir evidência online aplicável ao código avaliado: `Estável` para todos os tipos comprovados, `Parcial` para parte comprovada e parte concluída sem resolução, `Instável` para todos concluídos sem resolução, `Não verificado` sem evidência suficiente e `Desativado` para `enabled: false`. Aprovação e cobertura offline SHALL não participar dessa classificação.

#### Scenario: Sucesso baixo não significa parcial

1. **WHEN** `movie` e `tv` resolvem somente um título cada
2. **THEN** o status é `Estável`, e não `Parcial`, mesmo com indicativos baixos de acervo.

#### Scenario: Falha de infraestrutura sem evidência

1. **WHEN** uma execução não consegue avaliar um tipo por problema local e não há evidência válida anterior para o mesmo código e perfil
2. **THEN** o status é `Não verificado`, e a tentativa é registrada como inconclusiva, sem atribuir `Instável` ao provedor.

#### Scenario: Mudança do código

1. **WHEN** o pacote publicado muda e só existe verificação online do pacote anterior
2. **THEN** a rodada antiga permanece no bloco, mas a tabela passa a `Não verificado` até uma nova execução.

### Requirement: Publicação com evidência online

Uma versão SHALL ser considerada verificada para publicação somente com evidência online de pelo menos uma resolução por tipo suportado para o pacote e perfil correspondentes. A verificação online SHALL ser acionada explicitamente e separada dos testes unitários de desenvolvimento, que permanecem sem rede e sem resultados no catálogo público.

#### Scenario: Testes offline sem rodada online

1. **WHEN** os testes unitários passam, mas o pacote ainda não tem verificação online suficiente
2. **THEN** esses testes não aprovam sua resolução para publicação nem geram registro de funcionamento em `providers.md`.

### Requirement: Resumo público da última rodada

Cada rodada SHALL substituir a rodada anterior no bloco do provedor em `providers.md`, mantendo somente a última. O registro SHALL conter data e fuso, identificação da execução, versão do pacote, referência dos catálogos, perfil, seleção e resultados por título com temporada e episódio quando aplicáveis. O resumo público SHALL não exibir hashes e SHALL não conter contagens de testes offline.

#### Scenario: Nova atualização

1. **WHEN** uma segunda rodada é registrada para um provedor
2. **THEN** a nova rodada substitui a anterior no bloco e a anterior deixa de ser consultável.

#### Scenario: Tentativa inconclusiva após sucesso

1. **WHEN** uma nova tentativa inconclusiva é registrada para um provedor com evidência anterior
2. **THEN** a tentativa substitui a rodada anterior e o status passa a `Não verificado`, sem preservar a aprovação antiga.

#### Scenario: Migração do catálogo atual

1. **WHEN** os registros atuais contêm apenas aprovação de testes offline
2. **THEN** eles não são convertidos em rodadas online nem usados para preservar `Estável` ou `Parcial` na nova classificação.

### Requirement: Status visual e data curta

A tabela SHALL exibir o status com `🟢` para `Estável`, `🔵` para `Parcial`, `🔴` para `Instável`, `🟠` para `Não verificado` e `⚫` para `Desativado`. A coluna de última verificação SHALL exibir somente a data no formato `AAAA-MM-DD`.

#### Scenario: Status visual na tabela

1. **WHEN** a tabela de provedores é exibida
2. **THEN** o status aparece com o indicador correspondente (`🟢`, `🔵`, `🔴`, `🟠` ou `⚫`) e a última verificação aparece apenas como data.

### Requirement: Evidência sanitizada e credenciais externas

O sistema SHALL receber a chave TMDB necessária apenas em execução, sem incorporá-la a código, catálogos ou registros. O resumo público SHALL conter resultados e motivos sanitizados, sem URLs de streams, cookies, tokens, cabeçalhos sensíveis, respostas brutas ou hashes. Ausência de configuração local necessária SHALL ser informada como impedimento de avaliação.

#### Scenario: Credencial ausente

1. **WHEN** o provedor precisa consultar o TMDB e a chave não foi disponibilizada
2. **THEN** a execução indica configuração insuficiente e não atribui a ausência de resolução à fonte.

#### Scenario: Erro com URL assinada

1. **WHEN** uma mensagem de erro contém URL de stream ou dados sensíveis
2. **THEN** esses dados são removidos antes de qualquer relatório ou registro persistente.
