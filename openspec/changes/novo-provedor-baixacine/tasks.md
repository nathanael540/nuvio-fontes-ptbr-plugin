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
- [x] 3.2 Atualizar `providers.md` com a linha do provedor e a seção inicial
  (`🟠 Não verificado`); verificar: suíte providers-catalog verde.

## 4. Lint e build

- [x] 4.1 Rodar `npm run lint` e `npm test` completos; verificar: tudo verde.
  Nota: `npm test` falha em `test/baixetorrent-org.test.js` (mudança outra em voo) e na divergência
  de `providers-catalog` (entrada `baixetorrent-org` no manifest sem linha ainda, mudança outra em
  voo) — estado pré-existente/in-flight, sem relação com `baixacine`; a suíte `baixacine` e o
  restante do repositório estão verdes.

## Workflow follow-up

- Adicionar `baixacine` aos catálogos online (`test/online/catalogs/movie.json` e
  `test/online/catalogs/tv.json`) com títulos curados reais e rodar
  `npm run test:online -- --provider baixacine --record` após o build; registrar a rodada em
  `providers.md` (ver `docs/tests.md` §2 e §8).
- Arquivar a mudança após os testes e a rodada online aprovados.
