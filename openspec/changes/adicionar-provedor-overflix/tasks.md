# Tasks

## 1. Estrutura, manifest e build inicial

- [ ] 1.1 Criar `src/overflix/index.js` com `PROVIDER_NAME = 'OverFlix'`, validação de entrada, `sortByQuality` e a única captura de erro com `console.error('[OverFlix] ...')`; verificar que `npm run lint` aceita o arquivo e que o carregamento do pacote não faz requisição.
- [ ] 1.2 Criar `src/overflix/extractor.js`, `domain.js`, `site.js` e `hosts.js` como esqueletos com JSDoc, sem rede no carregamento; verificar que `node build.js overflix` gera `providers/overflix.js` e as duas variantes sem erro.
- [ ] 1.3 Adicionar a entrada `overflix` ao `manifest.json` com `movie` e `tv`, `formats: ["mp4"]`, `contentLanguage: ["pt"]`, versão `1.0.0`, autor `nathanael540`, descrição em pt-BR e logo HTTPS; verificar que `node --test test/manifest.test.js` passa.
- [ ] 1.4 Confirmar que `node build.js overflix` gera `gdrive/providers/overflix.js`, `prism/providers/overflix.js` e as entradas nos `<formato>/manifest.json`; verificar que os três pacotes exportam `getStreams`.

## 2. Descoberta de domínio

- [ ] 2.1 Implementar `src/overflix/domain.js` com `GET https://www.overflix.win`, uso do host final do redirecionamento, leitura de `window.domainAlertPayload` por `extractScriptString`, decodificação Base64 (normalizando URL-safe e padding), `JSON.parse`, `baseUrl` simples ou duplo e fallback `www.overflix.download`; incluir `Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)` no topo; verificar com testes de redirect, payload duplo, payload simples, payload inválido e falha de rede.
- [ ] 2.2 Garantir que a descoberta nunca lança e que uma falha total usa o fallback; verificar que o teste de semente indisponível continua a busca no host de fallback.
- [ ] 2.3 Garantir que não há cache de módulo, TTL ou descoberta repetida no meio da chamada; verificar que duas chamadas seguidas executam duas descobertas e usam hosts independentes.
- [ ] 2.4 Criar em `test/fixtures/overflix/` a home sem payload e uma home com payload montada a partir do contrato do Prisma, sem cookies ou tokens; verificar que a fixture com payload decodifica no teste e que a origem montada está declarada em comentário ou nome do arquivo.

## 3. Cliente VideoBox: requisições, busca e identidade

- [ ] 3.1 Implementar em `src/overflix/site.js` o auxiliar de AJAX com perfil `api` (`X-Requested-With`, `User-Agent`, `Referer`), um único `redirect` HTTPS, adoção do host de destino e rejeição de cascata ou destino inválido; verificar com testes de redirect de busca, redirect HTTP e dois redirects seguidos.
- [ ] 3.2 Implementar `buscarContent` com `type=filmes`/`type=series`, termos PT-BR, original e alternativos sem repetição, leitura de `a.block` por cheerio básico (`eq`, `find`, `text`, `attr`) e triagem por `/filmes/online/` ou `/series/online/`; verificar com fixture de busca de filme e com busca vazia.
- [ ] 3.3 Implementar a confirmação por `data-tmdb-id`, o filtro de ano (primeiro ano de quatro dígitos em `.info p`/`p`) e a similaridade 0,85 de `titleSimilarity`, abrindo no máximo três fichas por termo; verificar com testes de um cartão confirmado, homônimo de outro ano e ficha com TMDB divergente.
- [ ] 3.4 Tratar duas fichas confirmadas no mesmo termo como ambiguidade e devolver lista vazia; verificar que o teste não escolhe a primeira ficha nem faz nova busca.
- [ ] 3.5 Tratar ficha sem `data-tmdb-id` como erro de estrutura; verificar que o teste recebe `[]` na fronteira e log com `[OverFlix]`, sem confundir com ausência.
- [ ] 3.6 Criar as fixtures de busca e de ficha de filme em `test/fixtures/overflix/`, com domínio real, identificadores sintéticos e sem mídia; verificar que o teste de busca confirmada usa a fixture e que o caminho da ficha é o do tipo pedido.

## 4. Séries e playerData

- [ ] 4.1 Implementar a leitura de `vbEpisodes` com `data-video-id`, todos os `data-season` e `data-current-audio`, com preferência por `Dublado` quando `.vbAudioSelect` oferecer essa opção e erro de estrutura quando não houver áudio declarado; verificar com fixture de série e com série sem áudio.
- [ ] 4.2 Implementar `episodesList` com `id`, `season` e `audio`, exigindo `episodes` como lista, comparando `number` como inteiro e removendo o prefixo `serie3=`; verificar com episódio exato, número em texto, episódio ausente e temporada não listada.
- [ ] 4.3 Implementar `playerData` com `players` opcional, bases padrão de MixDrop, Streamtape, DoodStream e Byse, normalização de rótulo e override por URL HTTPS, usando `Referer` da ficha do filme ou da URL do episódio publicada por `episodesList`; registrar no topo de `site.js` a origem `Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)`; verificar com `players` sobrescrevendo a base do MixDrop e com `players` ausente usando a base padrão.
- [ ] 4.4 Implementar a leitura manual de `servers_dub`/`servers_leg` (`&amp;` → `&`, separação por `&` e primeiro `=`), a montagem `base + fileId` e o idioma pelo nome do campo; verificar com as duas listas, com entidades HTML e com identificador contendo caractere especial.
- [ ] 4.5 Tratar host sem resolvedor, incluindo Byse, como triagem silenciosa e as duas listas vazias como ausência; verificar que nenhuma requisição é feita ao Byse e que a saída é `[]` sem aviso.
- [ ] 4.6 Criar as fixtures de série, `episodesList` dublado/legendado e `playerData` em `test/fixtures/overflix/`; verificar que nenhuma contém token, cookie ou URL de mídia e que o teste usa os mesmos identificadores sintéticos.

## 5. Hospedagens, streams e isolamento

- [ ] 5.1 Implementar `src/overflix/hosts.js` com MixDrop, Streamtape e DoodStream no mesmo contrato de `src/pobreflixtv/hosts.js`, incluindo `unpackPacker`, `robotlink`, `pass_md5`, token e `expiry`; registrar `Origem: src/pobreflixtv/hosts.js (GPL-3.0)` e `Origem: codeberg.org/prismastream/install, prisma_hosts.py (GPL-3.0)` no topo; verificar com testes de resolução e de arquivo removido para cada host.
- [ ] 5.2 Implementar a montagem com `buildStream` e `format` (`FORMATTER.AUTO`, `addon: 'OverFlix'`, título, ano, temporada e episódio), `type: 'mp4'`, `provider` do host, `headers` do resolvedor e idioma do campo, sem `name`/`title`; verificar com testes de dublado, legendado e variante Prism.
- [ ] 5.3 Não preencher qualidade com o selo "HD" nem fazer sonda; verificar que a URL sem resolução sai como `Desconhecida` e que nenhuma requisição é feita ao arquivo de mídia.
- [ ] 5.4 Deduplicar por `url|language`, manter dublado e legendado com a mesma URL e ordenar com `sortByQuality`; verificar com teste de duplicata no mesmo idioma e de lista fora de ordem.
- [ ] 5.5 Isolar cada host com `console.warn('[OverFlix] Opção <host> (<idioma>) descartada: <causa>')`, lançar erro agregado quando todas falharem e devolver `[]` quando todas forem triagem; registrar `Origem: src/pobreflixtv/extractor.js (GPL-3.0)` se o trecho de isolamento for portado; verificar com um host falhando entre válidos, todos falhando e todas as opções Byse.
- [ ] 5.6 Sanitizar mensagens de log (chave do TMDB, query de URL, `token`, `expires`, `key`, `sig`, `md5`); verificar que os logs e avisos do teste não contêm nenhum desses valores.
- [ ] 5.7 Criar as fixtures de embed de MixDrop, Streamtape e DoodStream com identificadores sintéticos; verificar que os testes resolvem as três URLs de teste e rejeitam arquivo removido.

## 6. Fronteira, ausência e suíte offline

- [ ] 6.1 Implementar a validação de `tmdbId`, `mediaType`, temporada/episódio em série e `TMDB_API_KEY` antes de qualquer requisição, com `getMediaInfo` antes da fonte; verificar com testes de ID inválido, tipo inválido, série sem coordenadas e chave ausente, todos com zero requisições.
- [ ] 6.2 Tratar busca, ficha, `episodesList` e `playerData` como etapas fatais e a descoberta como etapa com fallback que nunca lança; verificar com HTTP 503, JSON inválido, `playerData` sem objeto e resposta de busca sem `html`.
- [ ] 6.3 Garantir que ausência de título, ambiguidade, temporada inexistente, episódio ausente e ficha sem servidor devolvem `[]` sem `console.error`; verificar cada caso em teste separado.
- [ ] 6.4 Completar `test/overflix.test.js` com todos os casos das seções 2 a 6 e executar `node --test test/overflix.test.js`; verificar que a suíte passa sem internet e sem `TMDB_API_KEY` real (a chave do teste é fictícia).
- [ ] 6.5 Revisar as fixtures e os logs de teste para garantir ausência de cookies, tokens, chaves e URLs de mídia; verificar que `test/fixtures/overflix/` só contém HTML/JSON sanitizado e nenhum arquivo binário.

## 7. Catálogo, documentação e build

- [ ] 7.1 Adicionar a linha e a seção `OverFlix` em `providers.md` com status `🟠 Não verificado` e data `—`; verificar que `node --test test/providers-catalog.test.js` passa.
- [ ] 7.2 Atualizar `docs/provider-investigation.md` §3.10 com a variação de descoberta por `domainAlertPayload` (semente, redirect, Base64 simples/duplo, fallback, redirect de busca, sem cache) e a referência ao cliente VideoBox em `src/overflix/`; registrar os limites (nome do payload, semente só na home, Byse fora, série não observada); verificar que as referências apontam para arquivos existentes.
- [ ] 7.3 Revisar `README.md`, `docs/arch.md` e `src/_blocks/index.md`; não alterar se nenhuma regra global, convenção ou bloco mudou, e registrar a conferência no `design.md` apenas se houver alteração.
- [ ] 7.4 Conferir no `manifest.json` o `id`, o nome, a versão `1.0.0`, os tipos, os formatos `["mp4"]`, o idioma, a logo HTTPS e o `filename`; verificar que `node --test test/manifest.test.js` passa.
- [ ] 7.5 Rodar `node build.js overflix` e conferir que os arquivos gerados foram atualizados e que `providers/overflix.js` não contém `async`/`await`; verificar com `node --test test/build.test.js`.

## 8. Integração e verificação online

- [ ] 8.1 Rodar `npm run lint` e `npm test`; verificar que a suíte completa passa e que nenhum teste existente foi alterado por causa do novo provedor.
- [ ] 8.2 Rodar `node build.js overflix` e depois `npm run test:online -- --provider overflix --record` com `TMDB_API_KEY` apenas no ambiente; verificar o resultado por tipo e a seção atualizada em `providers.md`.
- [ ] 8.3 Se a rodada for inconclusiva ou falhar, registrar o motivo saneado em `providers.md` e manter o status `🟠 Não verificado`, sem declarar funcionamento.
- [ ] 8.4 Atualizar a seção `Validation` do `design.md` com os resultados reais de lint, testes, build e rodada online, incluindo o que ficou fora (Byse, reprodução no aparelho, série não observada); verificar que os números e status batem com `providers.md`.

## Workflow follow-up

- Arquivar a mudança após a revisão e a rodada online, ou declarar explicitamente as exclusões e o motivo de não arquivar.
- Conferir o resultado arquivado em `openspec/changes/archive/` e a spec principal `overflix-provider`.
- Se a rodada online revelar um host novo ou HLS no Byse, abrir uma mudança própria com fixture e evidência, sem ampliar esta.
