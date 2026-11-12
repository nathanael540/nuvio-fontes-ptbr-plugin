# Tasks

## 1. Paginação da busca do Redes Torrents

- [x] 1.1 Em `src/baixarapido/download-row.js`, fazer `locateCustomCardPages` percorrer as páginas da variante `custom-card` em ordem, começando na página 1 e avançando enquanto a página tiver 20 cartões e nenhuma ficha confirmada. Verificação: `node --test test/baixarapido.test.js` passa com o caso de ficha na página 2.
- [x] 1.2 Acrescentar as fixtures `test/fixtures/baixarapido/redes-search-page1-unrelated.html` e `test/fixtures/baixarapido/redes-search-page2-target.html` e um caso em `test/baixarapido.test.js` que confirma a requisição `pagina=2` e o stream esperado. Verificação: o caso novo passa e a lista de streams contém o torrent da página 2.
- [x] 1.3 Manter `prefilterCard` e `selectConfirmedPages` em cada página e garantir que cartões de outro tipo ou de outra temporada não consultem a ficha. Verificação: o teste da página 2 registra as URLs de ficha consultadas e não inclui os cartões triados.

## 2. Critérios de parada e limite de páginas

- [x] 2.1 Implementar a parada por última página (menos de 20 cartões), estado vazio, página repetida e limite de 12 páginas. Verificação: `node --test test/baixarapido.test.js` passa com os casos de última página, repetição e limite.
- [x] 2.2 Acrescentar as fixtures `test/fixtures/baixarapido/redes-search-last-page.html`, `test/fixtures/baixarapido/redes-search-repeated.html` e `test/fixtures/baixarapido/redes-search-full.html` e os casos correspondentes em `test/baixarapido.test.js`. Verificação: os testes confirmam a quantidade de requisições de busca (1, 2 ou 12) e que a página 13 não é pedida.
- [x] 2.3 Registrar no console a página lida e o motivo da parada (`ficha confirmada`, `última página`, `estado vazio`, `página repetida` ou `limite de 12 páginas`). Verificação: o teste confere as mensagens em `app.logs.log` e que nenhum magnet ou URL sensível aparece no log.

## 3. Manifest, versão e build

- [x] 3.1 Subir o `version` de `baixarapido` para `1.5.0` em `manifest.json`. Verificação: `npm test` passa na suíte de manifest e a versão nova aparece em `providers.md` depois da rodada online.
- [x] 3.2 Rodar `node build.js baixarapido` e conferir `providers/baixarapido.js`, `gdrive/providers/baixarapido.js`, `prism/providers/baixarapido.js` e os três `manifest.json` de formato. Verificação: o build termina com código 0 e os arquivos gerados ficam sincronizados com o manifest.
- [x] 3.3 Conferir que nenhum arquivo de `providers/`, `gdrive/` ou `prism/` foi editado à mão. Verificação: `git diff --stat` mostra as saídas geradas apenas depois do build.

## 4. Documentação do método

- [x] 4.1 Atualizar `docs/provider-investigation.md` com a variação de busca paginada por palavras do Redes Torrents: `index.php?busca=<termo>&pagina=<n>`, 20 cartões por página, parada em menos de 20 cartões ou página repetida, teto de 12 páginas e referência a `src/baixarapido/download-row.js` e `test/baixarapido.test.js`. Verificação: a seção nova existe e o texto distingue método em uso, limite observado e hipótese.
- [x] 4.2 Atualizar o comentário de cabeçalho de `src/baixarapido/download-row.js` para descrever a busca paginada do `redestorrents.com` e o teto de páginas. Verificação: o comentário menciona `pagina=<n>` e o limite de 12 páginas.

## 5. Verificação online e status

- [x] 5.1 Com o pacote final já construído, rodar `npm run test:online -- --provider baixarapido` usando `TMDB_API_KEY` apenas do ambiente local. Verificação: o runner conclui a rodada e grava o relatório em `test/artifacts/online/<run-id>/result.json`.
- [x] 5.2 Atualizar a seção do Baixa Rápido em `providers.md` com a rodada nova: data, ID, status, versão do pacote, perfil, catálogos, semente e os dez casos. Verificação: `npm test` passa na suíte `providers-catalog` e a tabela fica coerente com a seção.
- [x] 5.3 Se a rodada for inconclusiva ou falhar, registrar o resultado real e não marcar `Estável` sem evidência. Verificação: o status segue os critérios de `docs/tests.md`, seção 7.

## 6. Integração

- [x] 6.1 Rodar `npm run lint`, `npm test` e `node build.js baixarapido` no estado final. Verificação: os três comandos terminam com código 0.
- [x] 6.2 Conferir que o manifest não publica um provedor `redestorrents` e que a entrada `baixarapido` continua listando o catálogo Redes Torrents. Verificação: `npm test` passa nas suítes de manifest e de catálogo de provedores.
- [x] 6.3 Conferir que as suítes dos outros catálogos do Baixa Rápido continuam passando sem alteração. Verificação: `node --test test/baixarapido.test.js` passa por inteiro.

## Workflow follow-up

- Arquivar a mudança depois da revisão e da evidência online registrada.
- Verificar o resultado arquivado em `openspec/changes/archive/`.
