# Tasks

## 1. Fixture e regressão

- [x] 1.1 Capturar a resposta real sanitizada da consulta por `Divertida Mente`, com os 23 resultados na ordem recebida e a correspondência `Divertida Mente (2015)` depois da 20ª posição; verificar contagem, ordem e ausência de dados pessoais, cookies, tokens e URLs assinadas.
- [x] 1.2 Adicionar teste offline em `test/limefilmes.test.js` cujo `fetch` simulado devolve somente os N primeiros itens conforme `per_page`; verificar que o teste falha com a janela de 20 (zero streams) e passa com a de 100 (streams de 150540).
- [x] 1.3 Preservar os controles existentes de filme na primeira página, episódio avulso, episódio em pacote, IMDb divergente, opção inválida isolada e ausência; verificar com `node --test test/limefilmes.test.js`.

## 2. Correção

- [x] 2.1 Ampliar a leitura da busca de posts para 100 resultados por consulta, sem alterar categoria, ano, temporada, IMDb, extração ou montagem; verificar pela suíte específica do provedor.
- [x] 2.2 Executar `npm run lint`, `node --test test/limefilmes.test.js` e `node build.js limefilmes`; registrar os resultados e a ausência de alteração em blocos compartilhados em `design.md`.
- [x] 2.3 Conferir que a fixture e o teste documentam a data, a consulta e a limitação de 100 resultados; registrar a limitação residual em `design.md`.

## 3. Evidência online e registro

- [x] 3.1 Coordenar o build de publicação com as demais threads e executar `npm run build:min`; confirmar que os pacotes gerados de `limefilmes` correspondem ao código corrigido.
- [x] 3.2 Executar `npm run test:online -- --provider limefilmes --seed 20261120` com `TMDB_API_KEY` somente no ambiente; verificar que 150540 resolve, que os outros quatro filmes seguem ausentes e que as séries preservam os casos resolvidos.
- [x] 3.3 Comparar a nova rodada com `movie 0/5` e `tv 4/5`; se 150540 resolver e as séries continuarem resolvidas, classificar conforme `docs/tests.md` e registrar a rodada efetiva em `providers.md`; se não resolver, manter Parcial e registrar a evidência e o limite.
- [x] 3.4 Reconstruir os pacotes gerados e conferir que `providers/`, `gdrive/providers/` e `prism/providers/` acompanham a mudança no mesmo commit, sem editar arquivos gerados à mão.

## Workflow follow-up

1. Arquivar somente após os casos da change passarem ou o que ficou fora ser declarado explicitamente.
2. Referenciar `OpenSpec: corrige-limefilmes` no corpo do commit da implementação.
