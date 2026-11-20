# Tasks

## 1. Diagnóstico

- [x] 1.1 Comparar a identidade do pacote com a rodada registrada e reproduzir a seleção de 20/11 quando houver chave e rede; documentar resultados sanitizados e impedimentos no design sem sobrescrever relatórios.
- [x] 1.2 Rastrear TMDB, busca, confirmação, seleção e player em pelo menos um filme e uma série; registrar a primeira divergência comprovada ou declarar explicitamente que a causa continua inconclusiva.
- [x] 1.3 Se a solução exigir mudança de requisito, atualizar a proposta e criar delta de `animesdigital-provider`, validando a change antes de implementar.

## 2. Correção condicionada

- [x] 2.1 Somente com causa reproduzida, adicionar fixture real sanitizada e teste que reproduza a falha; confirmar que falha antes da correção e cobre a causa identificada.
- [x] 2.2 Aplicar a correção mínima preservando o contrato e executar `node --test test/animesdigital.test.js`, incluindo os cenários pertinentes descritos no design; sem causa comprovada, manter esta tarefa bloqueada.
- [x] 2.3 Sincronizar documentação e, se aplicável, guia de investigação com o comportamento efetivamente comprovado; conferir ausência de dados sensíveis.

## 3. Validação integrada

- [x] 3.1 Executar `node build.js animesdigital`, `npm run lint` e `npm test` após mudanças de código ou testes; registrar resultados e quaisquer impedimentos.
- [x] 3.2 Coordenar o build compartilhado, executar `npm run build:min` e a verificação online do pacote final Prism para os dois tipos; registrar identidade, seleção, resultados e limitações sem expor segredos.
- [x] 3.3 Atualizar `providers.md` conforme a rodada válida e critérios vigentes; se a revalidação falhar ou for inconclusiva, registrar o bloqueio e não declarar publicação aprovada.

## Workflow follow-up

1. Arquivar somente depois dos testes da change passarem ou das exclusões serem explicitamente declaradas.
