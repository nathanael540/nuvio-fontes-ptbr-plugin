# Tasks

## 1. Implementação do provedor

- [x] 1.1 Implementar `src/baixacine/extractor.js` (busca na página de busca, parsing dos cartões
  com cheerio, confirmação da identidade por `getMediaInfo` + `findBestMatch`, extração do magnet
  com `readMagnet` e montagem dos streams por `buildStream`); verificar: `node build.js baixacine`
  e a suíte de testes verde.
- [x] 1.2 Implementar `src/baixacine/index.js` (ponto de entrada, validação de entrada antes de
  requisições, captura de erros em `getStreams`); verificar: suíte `baixacine` verde em `npm test`.

## 2. Testes e fixtures

- [x] 2.1 Gerar fixtures reais de resposta da fonte em `test/fixtures/baixacine/search.html` e
  `test/fixtures/baixacine/detail.html` (verificados ao vivo em 2026-11-19); verificar:
  `test/baixacine.test.js` cobre filme confirmado com magnet hex de 40 caracteres, qualidade
  `1080p`, idioma `Dublado`, tamanho `2.48 GB` e ausência sem resultado correspondente.

## 3. Manifest e documentação

- [x] 3.1 Adicionar entrada `baixacine` ao `manifest.json`; verificar: `node build.js baixacine`,
  suítes de manifest e providers-catalog verdes.
- [x] 3.2 Atualizar `providers.md` com a linha do provedor e a seção (status inicial
  `🟠 Não verificado`, atualizado pela rodada online na tarefa 5.6); verificar: suíte
  providers-catalog verde.

## 4. Lint e build

- [x] 4.1 Rodar `npm run lint` e `npm test` completos; verificar: tudo verde (1875 testes, 0
  falhas).

## 5. Correção após a verificação online

- [x] 5.1 Corrigir a busca para o formulário real `index.php?busca=<termo>` (a rota `/?s=` devolve
  a home); verificar: suíte `baixacine` verde.
- [x] 5.2 Confirmar a identidade com variantes do título do cartão (separadores e sufixos de
  edição/temporada), descartar temporada em pedido de filme, exigir temporada em pedido de série
  e ignorar o ano do cartão de série; verificar: testes de filme com sufixo e de série.
- [x] 5.3 Atualizar as fixtures reais (busca de filme, busca com variante, busca de série e
  detalhes com um e três magnets) e cobrir filme, variante, série, ausência e entrada inválida.
- [x] 5.4 Ler o idioma e o tamanho reais do post; omitir `size` em post com vários magnets e
  tamanhos combinados.
- [x] 5.5 Rodar `npm run lint`, `node build.js baixacine` e a suíte de testes; verificar: tudo
  verde.
- [x] 5.6 Rodar `npm run test:online -- --provider baixacine --seed
  40ce3b8043c213bca3ae6b0cd5cff87c --record`; verificar: `🟢 Estável` (`movie 4/5`, `tv 3/5`)
  registrado em `providers.md`.

## Workflow follow-up

- Arquivar a mudança após a revisão final dos artefatos e dos testes.
