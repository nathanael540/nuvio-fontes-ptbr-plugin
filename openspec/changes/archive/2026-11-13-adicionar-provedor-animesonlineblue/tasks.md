# Tasks

## 0. Dependência

- [x] 0.1 Aplicar previamente a change `2026-11-13-extrair-bloco-blogger-video`, que cria `src/_blocks/blogger-video/index.mjs`, sua suíte e o refactor do AniTube. Esta change não repete a criação do bloco. Verificação: `node --test test/blocks/blogger-video/index.test.mjs` e `node --test test/anitube.test.js` passam antes de iniciar o Animes Online Blue.

## 2. Catálogo, identidade e grade RSC

- [x] 2.1 Criar fixtures reais sanitizadas em `test/fixtures/animesonlineblue/` para busca com série e filme, busca vazia, RSC de duas temporadas, RSC sem `temporadas`, episódio com um áudio, episódio com dois áudios, episódio sem player, HTML do Blogger e HTML sem formatos; conferir que nenhum token, cookie ou URL assinada ficou no repositório.
- [x] 2.2 Implementar em `src/animesonlineblue/catalog.js` a busca por variantes (`title`, `originalTitle`, `alternativeTitles`, `romajiTitles`) com acúmulo por slug e `findBestMatch` sobre título e ano; verificar com testes de Demon Slayer S01 (romaji vence o filme de 2025), Jujutsu Kaisen S01, busca vazia e ano conflitante.
- [x] 2.3 Implementar em `src/animesonlineblue/grid.js` a leitura de `/anime/<slug>?_rsc=1` com `RSC: 1`, o balanceamento do bloco `temporadas` e a seleção por `numero`/`num`; verificar com testes de temporada existente, temporada ausente, episódio ausente e bloco inválido.
- [x] 2.4 Criar `src/animesonlineblue/index.js` com validação de `mediaType` `tv`, recusa de `movie` sem rede, log `[Animes Online Blue]`, captura única de erros e `sortByQuality`; verificar com `node --test test/animesonlineblue.test.js` e com o pacote exportando `getStreams`.

## 3. Áudios, streams e contrato

- [x] 3.1 Implementar a consulta de `leg` e `dub` a `/api/episodio/<id>` com `Referer`, a confirmação do idioma por `tipo`/`title`, a triagem de host desconhecido e o isolamento de falha por áudio com `console.warn`; verificar com testes de dois áudios, um áudio falhando, ambos falhando e episódio sem `leg`/`dub`.
- [x] 3.2 Integrar o bloco `blogger-video` (entregue pela change de dependência) ao extrator da fonte, aceitando `playerUrl` do Blogger e mídia direta; verificar com testes de um formato 360p, vários formatos, HTML sem formatos, host não suportado e URL fora de HTTP(S).
- [x] 3.3 Montar os streams com `buildStream`, `type: 'mp4'`, `provider: 'Animes Online Blue'`, `language` confirmado, `quality` do `qualityLabel` e `format` com título, ano, temporada e episódio; verificar nos três templates publicados os campos `name`, `title`, `quality`, `language` e `format`.
- [x] 3.4 Cobrir ausência reconhecida e erros de estrutura em `test/animesonlineblue.test.js`: título ausente, temporada/episódio ausente, busca não-2xx, JSON inválido, RSC inválido e falha de rede no episódio; verificar que `getStreams` registra `[Animes Online Blue]` e devolve `[]` nos casos fatais.

## 4. Manifest, verificação online e documentação

- [x] 4.1 Adicionar a entrada `animesonlineblue` ao `manifest.json` com nome, versão `1.0.0`, autor, tipos `["tv"]`, formato `["mp4"]`, idioma `pt` e logo HTTPS; verificar com `node -e` que os campos obrigatórios estão corretos e com `node build.js animesonlineblue`.
- [x] 4.2 Adicionar `animesonlineblue: { "exclusiveTag": "anime" }` em `test/online/profiles.json` e atualizar `revision`/`curatedAt`; verificar com `node --test test/online-catalog.test.js`.
- [x] 4.3 Adicionar a linha e a seção `## Animes Online Blue` em `providers.md` com status `🟠 Não verificado` e sem bloco de verificação; verificar com `node --test test/providers-catalog.test.js`.
- [x] 4.4 Atualizar `docs/provider-investigation.md` com “Next.js RSC e player do Blogger”, citando `src/animesonlineblue/`, o bloco entregue pela change de dependência, os testes e a spec; verificar que a seção distingue o método em uso da hipótese de mídia 403.

## 5. Integração e evidência online

- [x] 5.1 Rodar `npm run lint`, `npm test` e `node build.js animesonlineblue`; verificar que não há falha e que os arquivos gerados do provedor foram atualizados.
- [x] 5.2 Executar `npm run test:online -- --provider animesonlineblue` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; verificar a saída do runner e o relatório transitório sanitizado e registrar a rodada em `providers.md` conforme `docs/tests.md`.
- [x] 5.3 Ajustar o status de `providers.md` conforme os critérios de `docs/tests.md` e registrar no design a limitação de mídia 403 se ela persistir; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/animesonlineblue-provider/spec.md`.
