# Tasks: provedor Donghua No Sekai

## 1. Preparação

1. [x] Ler `README.md`, `AGENTS.md`, `providers.md`, `docs/arch.md`, `docs/tests.md`, `docs/provider-investigation.md`, `src/_blocks/index.md` e as specs existentes.
2. [x] Investigar ao vivo `https://donghuanosekai.com` e `https://donghuanosekai.com/donghuas` somente por HTTP/HTML/scripts públicos.
3. [x] Registrar busca, fichas, temporadas, episódios, players, mídia final, qualidade, idioma e limites no `design.md`.

## 2. Implementação

1. [x] Criar `src/donghuanosekai/site.js` com busca HTML, leitura de cartões, ficha, info, episódios e players.
2. [x] Criar `src/donghuanosekai/catalog.js` com termos, similaridade, identidade, temporada e episódio.
3. [x] Criar `src/donghuanosekai/players.js` com player nativo, player-new, `<source>`, Blogger e triagem.
4. [x] Criar `src/donghuanosekai/extractor.js` e `index.js` com validação, isolamento por player, `buildStream` e `sortByQuality`.
5. [x] Registrar `donghuanosekai` no `manifest.json` com tipos `movie` e `tv`, formatos `m3u8` e `mp4`, versão `1.0.0` e logo do domínio.

## 3. Testes offline

1. [x] Criar fixtures sanitizadas em `test/fixtures/donghuanosekai/` a partir das respostas reais.
2. [x] Criar `test/donghuanosekai.test.js` com filme direto, filme em coleção, temporada única, temporada específica, episódio ausente, busca vazia, ano divergente, player nativo, player-new, `<source>`, Blogger, triagem, falha isolada e deduplicação.
3. [x] Rodar `npm run lint` e corrigir as falhas.
4. [x] Rodar `npm test` e corrigir as falhas.

## 4. Build e catálogo online

1. [x] Rodar `node build.js donghuanosekai` e conferir os arquivos gerados.
2. [x] Adicionar a tag `donghua` e cinco títulos verificados por tipo em `test/online/catalogs/movie.json` e `tv.json`.
3. [x] Adicionar `donghuanosekai` a `test/online/profiles.json` com `exclusiveTag: "donghua"` e atualizar `test/online-catalog.test.js`.
4. [x] Atualizar `docs/tests.md` com o perfil `donghua`.

## 5. Documentação e evidência

1. [x] Adicionar a linha e a seção `Donghua No Sekai` em `providers.md`.
2. [x] Documentar o método em `docs/provider-investigation.md`.
3. [x] Rodar `npm run test:online -- --provider donghuanosekai` e registrar a rodada em `providers.md`: **Estável**, 5/5 filmes e 5/5 séries.
4. [x] Arquivar a mudança com lint, testes offline, build e rodada online aprovados.
5. [x] Commitar com `feat(donghuanosekai): ...` e `OpenSpec: add-donghuanosekai` no corpo.
