# Tasks

## 1. Fixtures e identidade

- [x] 1.1 Criar fixtures reais sanitizadas em `test/fixtures/noveflix/` para: busca de `Avenida Brasil`, busca de `Vale Tudo` com original e remake, busca vazia, ficha 2012, ficha 1988, ficha 2025, ficha sem `data-post`, AJAX com `embed_url`, embed com 179 capítulos e prefixo `AVBR-`, gate com `#player-iframe`, página de vídeo com `stream.php`, gate sem iframe, capítulo acima do total e JSON inválido; conferir que nenhum token de `stream.php`, cookie ou URL assinada ficou no repositório.
- [x] 1.2 Implementar em `src/noveflix/catalog.js` a validação de `tv`, o `getMediaInfo`, a montagem dos termos e a busca `GET /?s=<termo>` com `fetchPage`, lendo `.search-page article`, `.title a` e aceitando `/assistir/<slug>/`; verificar com testes de busca de novela, remake e busca vazia.
- [x] 1.3 Implementar a confirmação por `span.date` e ano exato, com até três candidatos, e o descarte de título sem similaridade; verificar com testes de `Avenida Brasil` 2012, `Vale Tudo` 1988 contra 2025, ficha sem ano e ficha sem `href`.
- [x] 1.4 Rejeitar `movie` antes de qualquer requisição; verificar com teste de entrada `movie` sem `fetch`.

## 2. DooPlay e gate

- [x] 2.1 Implementar em `src/noveflix/dooplay.js` a leitura do botão (`data-post`, `data-type`, `data-nume`) e o POST em `/wp-admin/admin-ajax.php` com `action=doo_player_ajax`, `post`, `nume` e `type=movie`, `Referer` da ficha e formulário urlencoded; verificar com testes de `embed_url`, JSON sem `embed_url`, resposta 500 e JSON inválido.
- [x] 2.2 Implementar em `src/noveflix/gate.js` a leitura de `totalChapters`, do prefixo `/video/<PREFIX>-` e da base do redirecionador; validar `episode <= totalChapters` e montar o capítulo com três dígitos em Base64; verificar com testes de capítulo 1, 179, 180 e `totalChapters` inválido.
- [x] 2.3 Implementar a travessia do gate com `fetchPage`, a leitura de `#player-iframe[data-src]`/`data-src` com `safelink_redirect`, o desescape de `&amp;` e a requisição em `redirect: manual`; verificar com testes de 302, 200 direto, gate sem iframe e `Location` ausente.
- [x] 2.4 Implementar a página de vídeo, a extração de `stream.php?slug&e&t` e a resolução relativa; verificar com testes de URL absoluta, relativa, página sem `stream.php` e `stream.php` com entidades HTML.

## 3. Streams e contrato

- [x] 3.1 Montar o stream com `buildStream`, `type: 'mp4'`, `provider: 'NoveFlix'`, `quality: 'Desconhecida'`, `language: LANGUAGE.UNKNOWN` e `format` com título, ano, temporada 1 e episódio; verificar nos três templates os campos `name`, `title`, `quality` e `language`.
- [x] 3.2 Garantir que o stream não tenha `headers`, `name`, `title`, `size`, seeders ou peers; verificar que o MP4 simulado responde 206 sem `Referer` e que o `fetch` de reprodução não é feito no provedor.
- [x] 3.3 Criar `src/noveflix/index.js` com validação de entrada, log `[NoveFlix]`, captura única de erros e `sortByQuality`; verificar com `node --test test/noveflix.test.js` e com o pacote exportando `getStreams`.

## 4. Manifest, verificação online e documentação

- [x] 4.1 Adicionar a entrada `noveflix` ao `manifest.json` com nome `NoveFlix`, versão `1.0.0`, autor `nathanael540`, tipos `["tv"]`, formatos `["mp4"]`, `contentLanguage` `["pt"]` e logo `https://www.google.com/s2/favicons?domain=noveflix.lol&sz=128`; verificar com `node build.js noveflix`.
- [x] 4.2 Confirmar que o provedor usa o perfil `generalista` (sem entrada em `test/online/profiles.json`) e registrar que o catálogo de referência não tem tag `novela`, então a amostra pode não conter novelas; verificar com `node --test test/online-catalog.test.js`.
- [x] 4.3 Adicionar a linha e a seção `## NoveFlix` em `providers.md` com status `🟠 Não verificado` e sem bloco de verificação; verificar com `node --test test/providers-catalog.test.js`.
- [x] 4.4 Atualizar `docs/provider-investigation.md` com “DooPlay de novela com gate novefx e safelink”, citando `src/noveflix/`, os testes e a spec; registrar `totalChapters`, prefixo, Base64, gate e `stream.php`, além da ausência de `dateCreated` e de resolução.

## 5. Integração e evidência online

- [x] 5.1 Rodar `npm run lint`, `npm test` e `node build.js noveflix`; verificar que não há falha e que os arquivos gerados foram atualizados.
- [x] 5.2 Executar `npm run test:online -- --provider noveflix` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; verificar a saída do runner e o relatório transitório sanitizado e registrar a rodada em `providers.md`.
- [x] 5.3 Ajustar o status de `providers.md` conforme os critérios de `docs/tests.md` e registrar no design a limitação de correspondência capítulo/episódio e a amostra generalista sem novelas. Se a amostra não contiver novelas, registrar o caso como `Não verificado` por configuração de catálogo, não como `Instável`; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/noveflix-provider/spec.md`.
