# Tasks

## 1. Busca e validação do BeTor

- [ ] 1.1 Extrair a leitura paginada da busca para um helper interno, preservando as validações de `items`, `total`, página vazia, página truncada e limite de páginas; verificar que os testes existentes de paginação em `test/betor.test.js` continuam passando.
- [ ] 1.2 Implementar a ordem de tentativas IMDb + tipo, TMDB + tipo e TMDB sem tipo, com fallback apenas após resultado vazio válido; verificar que erro HTTP/JSON/paginação interrompe sem tentar o identificador seguinte.
- [ ] 1.3 Implementar a compatibilidade de item: descartar `item_type` conflitante e aceitar item sem tipo somente com título/ano comprovados, mantendo a triagem de temporada e episódio; cobrir item compatível, título/ano divergente e tipo conflitante.
- [ ] 1.4 Adicionar os casos de regressão do `tmdb_id=13` (Forrest Gump com `item_type` vazio) e do fallback paginado; executar `node --test test/betor.test.js` e confirmar os novos cenários passando.

## 2. Build e evidência online

- [ ] 2.1 Subir a versão do provedor no `manifest.json`, executar `node build.js betor` e confirmar que `providers/betor.js`, `gdrive/providers/betor.js` e `prism/providers/betor.js` foram gerados e que `test/manifest.test.js` passa.
- [ ] 2.2 Executar `npm run lint`, `npm test` e `openspec validate corrigir-busca-betor --strict`; registrar no design as falhas preexistentes e o resultado dos testes do provedor.
- [ ] 2.3 Com `TMDB_API_KEY` no ambiente, executar `npm run test:online -- --provider betor --record` usando o pacote final e confirmar no relatório e em `providers.md` se o título do caso Forrest Gump deixou de ser `Sem resultado`; registrar o resultado real, inclusive se a fonte continuar sem o item.

## Workflow follow-up

- Arquivar a change depois da revisão e da rodada online do pacote final.
