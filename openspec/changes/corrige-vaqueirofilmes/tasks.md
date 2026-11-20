# Tasks

## 1. Diagnóstico reproduzível

- [x] 1.1 Investigar os cinco IDs da rodada em interfaces públicas, registrando no design data, etapa, resultado sanitizado e limites por caso, sem substituir relatórios existentes.
- [x] 1.2 Identificar uma causa técnica reproduzível e obter fixtures reais sanitizadas para ela; se não for possível, documentar o bloqueio e manter pendentes as tarefas de correção funcional e publicação.

## 2. Diagnóstico e regressão

- [x] 2.1 Implementar os diagnósticos de ausência previstos na delta spec, preservando o retorno e a distinção de falhas; verificar com testes offline para ausência de candidato, ambiguidade, falta de EmbedPlay, falta de Byse e sanitização.
- [x] 2.2 Cobrir com testes offline falha HTTP ou parsing, falha de opção independente com outra válida e nenhum stream com falha, garantindo que erro não seja classificado como ausência.
- [ ] 2.3 Caso a investigação comprove defeito corrigível, atualizar primeiro a proposta e specs se o contrato mudar; implementar correção mínima e teste de regressão com fixture real sanitizada, incluindo identidade e idioma.
  - Não acionada: a investigação de 20/11/2026 não comprovou defeito de identidade, idioma ou parsing; a causa dos retornos vazios é cobertura (sem Byse em quatro títulos e sem candidato em um). Ver `design.md`, seção «Investigação de 20/11/2026».
- [x] 2.4 Atualizar `providers.md` e documentação pertinente conforme o comportamento efetivamente alterado, sem alegar funcionamento sem rodada válida; conferir consistência com a implementação.

## 3. Integração e evidência

- [x] 3.1 Executar `npm run lint`, `npm test` e `node build.js vaqueirofilmes`; registrar resultados e limitações no design.
- [x] 3.2 Executar `npm run build:min` e a verificação oficial `npm run test:online -- --provider vaqueirofilmes` em ambiente sem conflito de artefatos; confirmar pacote final `prism/all/all/all`, pelo menos uma resolução válida de filme e registrar a rodada em `providers.md` conforme `docs/tests.md`.
- [x] 3.3 Reavaliar os cinco IDs anteriores separadamente, sem alterar a amostragem oficial; registrar resultados sanitizados e eventuais lacunas no design.

## Workflow follow-up

1. Arquivar somente após os casos da mudança passarem ou as exclusões serem declaradas explicitamente, sem apresentar uma correção funcional não comprovada como concluída.
