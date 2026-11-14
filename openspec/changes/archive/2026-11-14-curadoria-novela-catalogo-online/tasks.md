# Tasks

## 1. Catálogo e perfil

- [x] 1.1 Adicionar as oito novelas com a tag `novela` ao `test/online/catalogs/tv.json`, preservar os títulos existentes e manter `revision` `2026-11-12.1` e `curatedAt` `2026-11-12` para não invalidar a evidência dos demais provedores; verificar com `node --test test/online-catalog.test.js`.
- [x] 1.2 Acrescentar `noveflix` com `exclusiveTag` `novela` em `test/online/profiles.json` e subir a revisão do documento; verificar que o perfil tem oito séries elegíveis com `node -e` e que `node --test test/online-catalog.test.js` passa.
- [x] 1.3 Atualizar o mapa de perfis, o mínimo de `novela` e a tag desconhecida em `test/online-catalog.test.js`; verificar com `node --test test/online-catalog.test.js`.
- [x] 1.4 Atualizar `docs/tests.md` e `test/README.md` para registrar a tag `novela` e o perfil do NoveFlix; verificar com `npm run lint`.

## 2. Verificação online

- [x] 2.1 Executar `npm run test:online -- --provider noveflix --record` com `TMDB_API_KEY` apenas no ambiente e confirmar no bloco de `providers.md` que a amostra tem cinco novelas com a tag.
- [x] 2.2 Confirmar que os blocos e as linhas dos demais provedores permanecem iguais ao estado anterior à mudança; verificar com `git diff -- providers.md` que somente a linha e a seção do NoveFlix mudaram.
- [x] 2.3 Ajustar a prosa do NoveFlix em `providers.md` para o perfil de nicho e o resultado real, sem inventar resolução; verificar com `node --test test/providers-catalog.test.js`.

## 3. Fechamento

- [x] 3.1 Rodar `npm run lint`, `npm test` e `node build.js noveflix` com todos os casos passando e o pacote gerado sem alteração de código do provedor.
- [x] 3.2 Revisar proposta, design, `providers.md` e documentação, mantendo a decisão de perfil de nicho e a exceção de revisão; verificar com `openspec validate --all --strict`.

## Workflow follow-up

- Arquivar a mudança depois da revisão do mantenedor.
- Verificar em `providers.md` que a linha e o bloco do NoveFlix correspondem à revisão final dos catálogos.
