# Tasks

## 1. Estrutura, manifest e build

- [x] 1.1 Criar `src/anizero/index.js` com `PROVIDER_NAME = 'AniZero'`, validação de `tmdbId`/`mediaType`/temporada/episódio, retorno vazio para `movie`, `sortByQuality` e a única captura de erro com `console.error('[AniZero] ...')`.
- [x] 1.2 Criar `src/anizero/site.js`, `src/anizero/player.js` e `src/anizero/extractor.js` como esqueletos com JSDoc, sem rede no carregamento.
- [x] 1.3 Adicionar a entrada `anizero` ao `manifest.json` com `supportedTypes: ["tv"]`, `formats: ["m3u8"]`, `contentLanguage: ["pt"]`, versão `1.0.0`, autor `nathanael540`, descrição em pt-BR e logo HTTPS.
- [x] 1.4 Rodar `node build.js anizero` e conferir `providers/anizero.js`, `gdrive/providers/anizero.js`, `prism/providers/anizero.js` e os `<formato>/manifest.json`.

## 2. Busca, identidade e temporada

- [x] 2.1 Implementar a busca JSON em `admin-ajax.php` (`action=buscar_anime_rt`, `termo`) com as variantes de título do TMDB e validação da resposta (lista ou erro de ausência).
- [x] 2.2 Implementar a confirmação da ficha por `h1`, `copyrightYear`, `const anime_id`, `tempAnterior`/`tempProxima` e similaridade de título; ficha 404 é candidato removido, ficha 200 sem estrutura é erro.
- [x] 2.3 Implementar o mapeamento de temporada por marcador explícito e cadeia `tempProxima`/`tempAnterior`, sem aceitar outra série como temporada.
- [x] 2.4 Implementar a numeração absoluta restrita para página única com contagem entre 0,9 e 1,1 do total do TMDB.
- [x] 2.5 Implementar a consulta `POST /api/` (`action=show_videos`) e a seleção do episódio por `epi_num` exato, com ausência e erro de estrutura separados.

## 3. Player, embed e streams

- [x] 3.1 Implementar em `src/anizero/player.js` o unpacker `p,a,c,k,e,d` e o decodificador de base própria, sem `eval`/`new Function`, com validação de forma e extração da URL do embed.
- [x] 3.2 Implementar a leitura de `playerScripts` e dos botões `data-index`/`data-label`, tratando cada opção em isolamento.
- [x] 3.3 Implementar a abertura do embed, a extração balanceada de `FirePlayer(vhash,{...})`, a resolução de `videoSources`/`videoUrl` relativos e a geração de `headers` de reprodução.
- [x] 3.4 Implementar a página de aviso “O vídeo não está pronto” como ausência e o embed sem configuração como falha isolada.
- [x] 3.5 Montar os streams com `buildStream` e `format`, idioma pelo rótulo, qualidade pela dica, `provider` do host, `type` `hls`, sem `name`/`title`; deduplicar por URL.
- [x] 3.6 Sanitizar avisos e erros para não conter URL de mídia, hash de 32+ caracteres, token ou cookie.

## 4. Suíte offline

- [x] 4.1 Criar fixtures reais sanitizadas em `test/fixtures/anizero/` para busca, busca vazia, ficha base, ficha S2, `show_videos` S1/S2, página de vídeo, player com uma e duas opções, embed HLS, página “não pronto” e embed sem configuração.
- [x] 4.2 Criar `test/anizero.test.js` cobrindo S1E1, S2E1, episódio ausente, título ausente, duas opções de áudio, opção não pronta, uma opção falhando, todas falhando, estrutura inválida e contrato dos streams.
- [x] 4.3 Rodar `node --test test/anizero.test.js` e garantir que a suíte não acessa a internet e não exige `TMDB_API_KEY` real.

## 5. Documentação e catálogo

- [x] 5.1 Adicionar a linha e a seção do `AniZero` em `providers.md` com status `🟠 Não verificado` e data `—`; após a rodada online, registrar `🟢 Estável` e a data `2026-11-19`.
- [x] 5.2 Adicionar a seção do método em `docs/provider-investigation.md` com referências de código, testes e limites observados.
- [x] 5.3 Conferir `README.md`, `docs/arch.md` e `src/_blocks/index.md`: não alterar se nenhuma regra global ou bloco mudou.

## 6. Verificação final

- [x] 6.1 Rodar `npm run lint` e `npm test`.
- [x] 6.2 Rodar `node build.js anizero` e conferir que os pacotes não usam `async`/`await`, `eval`, `new Function` ou APIs proibidas.
- [x] 6.3 Rodar `npm run test:online -- --provider anizero --record` com `TMDB_API_KEY` apenas no ambiente e registrar o resultado em `providers.md`.
- [x] 6.4 Preencher a seção `Validation` do `design.md` com os resultados reais e arquivar a mudança se todos os testes, incluindo a rodada online, passarem; caso contrário, declarar o que ficou pendente.

## Workflow follow-up

- Arquivar a mudança em `openspec/changes/archive/` somente após lint, testes, build e rodada online aprovados.
- Se a rodada online revelar ausência de temporada, episódio não pronto ou mudança de template do player, registrar o limite em `providers.md` e no guia, sem ampliar o escopo nesta mudança.
