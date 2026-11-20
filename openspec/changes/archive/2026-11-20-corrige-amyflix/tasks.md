# Tasks

## 1. Catálogo GL e diagnóstico direcionado

- [x] 1.1 Elaborar e registrar nesta change o catálogo de filmes e séries GL observados nas interfaces públicas da AmyFlix, com os campos e critérios do design; indicar lacunas e preservar o levantamento mesmo sem defeito confirmado. Registrado em `catalog.md`: 197 títulos observados, 25 confirmados e 12 localizáveis pela busca.
- [x] 1.2 Selecionar do catálogo um filme e uma série com ID TMDB confirmado e, para a série, temporada/episódio publicado. Sem amostra verificável de algum tipo, registrar o bloqueio; caso contrário, confrontar pacote, busca, ficha, episódio e opções em ambiente isolado, registrando etapa, resultado esperado e observado. Amostras: Ammonite (568467), Love Bound (303533) S01E01 e Amor em Construção (307831) S01E01; diagnóstico no design.
- [x] 1.3 Se não houver defeito comprovado, registrar o bloqueio e os próximos passos no design, sem alterar código ou status; se houver mudança de requisito, revisar proposta e specs antes de implementar. Defeito reproduzido no Rumble; proposta e spec revisadas antes da implementação.

## 2. Correção condicionada

- [x] 2.1 Apenas se reproduzido defeito: acrescentar fixture real sanitizada e teste específico que falhe antes da correção e passe depois; registrar a causa confirmada no design. Caso contrário, declarar a tarefa não aplicável com justificativa. Fixture `rumble-embed.html` com `loaded:v()` e `ua.tar`; os testes de filme e série falharam antes e passaram depois.
- [x] 2.2 Apenas se reproduzido defeito: corrigi-lo de forma mínima e verificar regressões de filme, episódio, busca vazia/malformada, ambiguidade e isolamento de opções; caso contrário, registrar não aplicável. `parseRumbleObject` e `bestRumbleQuality` corrigidos; regressões de filme, série, ausência e isolamento verificadas.

## 3. Validação integrada

- [x] 3.1 Após alteração de código ou testes, executar `node build.js amyflix`, `npm run lint` e `npm test`, registrando resultados ou exclusões explícitas; sem alteração, registrar não aplicável. Executados: build OK, lint OK e 1914/1914 testes.
- [x] 3.2 Após correção e coordenação do ambiente compartilhado, executar `npm run build:min` e `npm run test:online -- --provider amyflix` com chave somente no ambiente; registrar a rodada oficial e o diagnóstico de nicho separadamente, sem promover status com amostra dirigida. Sem correção, registrar não aplicável e manter a rodada vigente. Rodada oficial registrada em `providers.md`: Instável, movie 0/5 e tv 0/5; diagnóstico de nicho separado no design.
