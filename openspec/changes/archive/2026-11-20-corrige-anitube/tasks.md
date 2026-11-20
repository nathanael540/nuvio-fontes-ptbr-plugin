# Tasks

## 1. Investigação e bloqueio

- [x] 1.1 Inspecionar publicamente uma ficha de filme e um episódio afetados, registrar no design caminho sanitizado, status, natureza da opção rejeitada e evidência da mídia, sem expor parâmetros sensíveis.
- [x] 1.2 Identificar o salto do HTTP 403 no Player 1 e registrar a observação e eventual alternativa pública autorizada, sem contornar controle de acesso.
- [x] 1.3 Comprovar mídia da obra e compatibilidade com QuickJS; se não for possível, registrar bloqueio e critério objetivo de reavaliação no design e não iniciar as tarefas seguintes.
- [x] 1.4 Revisar a proposta e a spec se a estrutura observada exigir comportamento diferente do previsto; confirmar que a solução não depende de credenciais nem bypass.

## 2. Correção condicionada

- [x] 2.1 Criar fixtures de respostas reais sanitizadas e testes Node para filme e episódio com a opção comprovada, preservando identidade e metadados; verificar os novos cenários na suíte do AniTube.
- [x] 2.2 Adaptar somente a resolução comprovada e verificar regressões de players anteriores, áudio, ausência, isolamento de falha, 403 e erro agregado na suíte do AniTube.
- [x] 2.3 Atualizar documentação pertinente ao método observado e ao provedor, conforme `docs/provider-investigation.md` e `providers.md`, sem declarar funcionamento antes de evidência online.

## 3. Validação integrada

- [x] 3.1 Executar `node build.js anitube`, `npm run lint` e `npm test`; registrar resultados e qualquer falha não resolvida no design.
- [x] 3.2 Coordenar o build compartilhado, executar `npm run build:min` e `npm run test:online -- --provider anitube` com `TMDB_API_KEY` apenas no ambiente; preservar relatórios de outras threads e confirmar pacote, perfil e `prism/all/all/all`.
- [x] 3.3 Registrar a rodada e status em `providers.md` segundo `docs/tests.md`; comparar casos afetados de filme e série, distinguir ausências, falhas e inconclusões e registrar limitações no design.

## Workflow follow-up

1. Arquivar somente quando os casos da mudança passarem ou o que ficou fora estiver declarado explicitamente, conforme as regras do repositório.
