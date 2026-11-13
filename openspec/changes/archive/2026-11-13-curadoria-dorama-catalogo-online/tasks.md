# Tasks

## 1. Catálogo e perfil

- [x] 1.1 Adicionar os oito filmes com a tag `dorama` ao `test/online/catalogs/movie.json`, preservar os títulos existentes e manter `revision` `2026-11-12.1` e `curatedAt` `2026-11-12` para não invalidar a evidência dos demais provedores; verificar com `node --test test/online-catalog.test.js`.
- [x] 1.2 Acrescentar `doramogo` com `exclusiveTag` `dorama` em `test/online/profiles.json` e subir a revisão do documento; verificar que o perfil tem oito filmes e seis séries elegíveis com `node -e` e que `node --test test/online-catalog.test.js` passa.
- [x] 1.3 Atualizar `docs/tests.md` e `test/README.md` para registrar o perfil `doramogo` e a curadoria de filmes com a tag `dorama`; verificar com `npm run lint` e `node --test test/online-catalog.test.js`.

## 2. Verificação online

- [x] 2.1 Executar `npm run test:online -- --provider doramogo --seed <valor> --record` com `TMDB_API_KEY` apenas no ambiente e confirmar no bloco de `providers.md` que a amostra de nicho tem cinco filmes e cinco séries com a tag `dorama`.
- [x] 2.2 Confirmar que os blocos e as linhas dos demais provedores permanecem iguais ao estado anterior à mudança; verificar com `git diff -- providers.md` que somente a linha e a seção do Doramogo mudaram.
- [x] 2.3 Verificar a consistência final com `node --test test/providers-catalog.test.js` e `npm test`, corrigindo qualquer divergência de tabela, status ou bloco antes de prosseguir.

## 3. Fechamento

- [x] 3.1 Rodar `npm run lint`, `npm test` e `node build.js doramogo` com todos os casos passando e o pacote gerado sem alteração de código do provedor.
- [x] 3.2 Revisar proposta, design, `providers.md` e documentação, mantendo a decisão de perfil de nicho e as limitações de reexecução; verificar com `openspec validate curadoria-dorama-catalogo-online`.

## Workflow follow-up

- Arquivar a mudança depois da revisão do mantenedor.
- Verificar em `providers.md` que as linhas e os blocos arquivados correspondem à revisão final dos catálogos.
