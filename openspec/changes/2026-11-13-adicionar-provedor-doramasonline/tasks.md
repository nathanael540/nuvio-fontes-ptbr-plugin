# Tasks

## 1. Fixtures e catálogo

- [ ] 1.1 Criar fixtures reais sanitizadas em `test/fixtures/doramasonline/` para: busca de série (`Pousando no Amor`), busca de filme (`Parasita`), busca com homônimo por ano (`The Glory` 2025), busca vazia, ficha de série com 16 episódios, ficha de série com episódio `-final`, página de episódio com opções `DUBLADO`/`LEGENDADO`, JSON Booonceivu dublado sem legendas, JSON Booonceivu legendado com `Português`, embed IncVideo com `Playerjs` de três fontes, `/aviso/` para `png.strp2p.com`, player `/do/v4/` com aviso PHP e JSON inválido; conferir que nenhuma URL assinada, token ou cookie ficou no repositório.
- [ ] 1.2 Implementar em `src/doramasonline/catalog.js` a chamada a `getMediaInfo`, a montagem dos termos (título PT-BR, original, alternativos) e a busca `GET /?s=<termo>` com `fetchPage`, acumulando cartões por URL e lendo `.search-page article`, `.title a` e `.meta span.year`; verificar com testes de busca de série, busca de filme, busca vazia e cartão sem link.
- [ ] 1.3 Implementar o filtro de caminho (`/br/filmes/` para `movie`, `/br/series/` para `tv`), a confirmação por `titleSimilarity` e o filtro de ano exato quando os dois anos existirem, com até três candidatos por termo; verificar com testes de `The Glory` rejeitado, `Pousando` aceito e tipo conflitante.
- [ ] 1.4 Implementar em `src/doramasonline/episode.js` a leitura de `div.se-c`/`span.se-t`/`div.numerando`/`div.episodiotitle a`, a escolha da coordenada exata e o uso do `href` publicado, inclusive `-final`; verificar com testes de episódio comum, episódio final, temporada ausente e ficha sem lista.

## 2. Opções e players

- [ ] 2.1 Implementar em `src/doramasonline/players.js` a leitura de `li.dooplay_player_option` (`data-nume`, `data-post`, `data-type`, rótulo) e a associação ao contêiner `#source-player-<nume>`; descartar trailer do YouTube; verificar com testes de duas opções, opção sem contêiner e só trailer.
- [ ] 2.2 Implementar a resolução Booonceivu com `mode=to-salvando-seu-ip`, `Referer` do episódio, exigência de `status === "success"`, leitura de `midias[]`/`legendas[]` e normalização de `SD`/`LD`/`FD` pelo mapa do player; verificar com testes de três qualidades, legendas PT, `status` diferente de `success` e JSON inválido.
- [ ] 2.3 Implementar o desembrulho de `/aviso/?url=`, o fluxo `csst.online` → `incvideo1.online`, a leitura do campo `file` do `new Playerjs({...})`, o `Set-Cookie` do embed, as requisições `get_file` em `redirect: manual`, o seguimento do `Location` e a aceitação de MP4 200/206; verificar com testes de três fontes, uma fonte 404, embed sem `Playerjs` e host não suportado.
- [ ] 2.4 Implementar o isolamento de cada opção com `console.warn('[Doramas Online] Opção <rótulo> descartada: <causa>')` e o erro agregado quando todas falharem; verificar com testes de uma opção falhando e todas falhando.

## 3. Streams e contrato

- [ ] 3.1 Montar cada stream com `buildStream`, `type` `hls`/`mp4`, `provider` do player, `quality` do rótulo ou `Desconhecida`, `language` pelo rótulo/legendas, `subtitles` quando publicadas e `format` com título, ano, temporada e episódio; verificar nos três templates publicados os campos `name`, `title`, `quality`, `language` e `subtitles`.
- [ ] 3.2 Garantir que o stream não tenha `name`/`title`, `size`, seeders ou peers inventados e que `language` use somente o enum, com `Idioma Desconhecido` quando não houver evidência; verificar com testes de opção sem rótulo e legenda `English`.
- [ ] 3.3 Criar `src/doramasonline/index.js` com validação de entrada, log `[Doramas Online]`, captura única de erros e `sortByQuality`; verificar com `node --test test/doramasonline.test.js` e com o pacote exportando `getStreams`.

## 4. Manifest, verificação online e documentação

- [ ] 4.1 Adicionar a entrada `doramasonline` ao `manifest.json` com nome `Doramas Online`, versão `1.0.0`, autor `nathanael540`, tipos `["movie","tv"]`, formatos `["m3u8","mp4"]`, `contentLanguage` `["pt"]` e logo `https://www.google.com/s2/favicons?domain=doramasonline.net&sz=128`; verificar com `node build.js doramasonline`.
- [ ] 4.2 Adicionar `"doramasonline": { "exclusiveTag": "dorama" }` em `test/online/profiles.json` e atualizar `revision`/`curatedAt`; verificar com `node --test test/online-catalog.test.js`.
- [ ] 4.3 Adicionar a linha e a seção `## Doramas Online` em `providers.md` com status `🟠 Não verificado` e sem bloco de verificação; verificar com `node --test test/providers-catalog.test.js`.
- [ ] 4.4 Atualizar `docs/provider-investigation.md` com “DooPlay com iframes inline, Booonceivu e IncVideo”, citando `src/doramasonline/`, os testes e a spec; registrar o `mode=to-salvando-seu-ip`, o mapa SD/LD/FD, o `Playerjs` e o limite `png.strp2p`.

## 5. Integração e evidência online

- [ ] 5.1 Rodar `npm run lint`, `npm test` e `node build.js doramasonline`; verificar que não há falha e que os arquivos gerados foram atualizados.
- [ ] 5.2 Executar `npm run test:online -- --provider doramasonline` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; verificar a saída do runner e o relatório transitório sanitizado e registrar a rodada em `providers.md`.
- [ ] 5.3 Ajustar o status de `providers.md` conforme os critérios de `docs/tests.md` e registrar no design a limitação do player `/do/v4/` se ela persistir; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/doramasonline-provider/spec.md`.
