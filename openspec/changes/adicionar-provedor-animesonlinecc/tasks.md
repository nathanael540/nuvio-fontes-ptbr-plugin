# Tasks

## 1. Estrutura e manifest

- [x] 1.1 Criar `src/animesonlinecc/index.js`, `site.js`, `catalog.js`, `episode.js`, `hosts.js` e `extractor.js` a partir do contrato de `src/_template/`, com `PROVIDER_NAME = 'AnimesOnlineCC'`; validar `tmdbId` numérico e `mediaType` antes de qualquer requisição, devolvendo lista vazia para `movie`; verificar que `npm run lint` aceita a estrutura inicial.
- [x] 1.2 Adicionar a entrada `animesonlinecc` ao `manifest.json` com `name` `AnimesOnlineCC`, `version` `1.0.0`, `author` `nathanael540`, `supportedTypes` `["tv"]`, `formats` `["mp4", "m3u8"]`, `contentLanguage` `["pt"]`, `logo` `https://www.google.com/s2/favicons?domain=animesonlinecc.to&sz=128`, `filename` `providers/animesonlinecc.js`, `enabled` `true` e descrição "Séries de anime em MP4 e HLS do AnimesOnlineCC, com opções dublada e legendada publicadas na página do episódio"; verificar que `node --test test/manifest.test.js` passa.
- [x] 1.3 Rodar `node build.js animesonlinecc` e confirmar que `providers/animesonlinecc.js`, as variantes `gdrive/` e `prism/` e os `<formato>/manifest.json` são gerados sem erro.

## 2. Busca e identidade

- [x] 2.1 Implementar `getMediaInfo` e a montagem das variantes de busca (título PT-BR, original, alternativos brasileiros e romaji), deduplicadas por `normalizeText`; verificar com teste que a consulta ao TMDB acontece antes da fonte e que as variantes são enviadas na ordem esperada.
- [x] 2.2 Capturar uma fixture real sanitizada da busca `GET /?s=<termo>` e implementar o leitor dos cartões (`div.search-page article`/`div.result-item`, `.title a`/`h2 a`, ano quando existir) com marcador de nenhum resultado; se nenhum seletor estável for confirmado, parar a implementação e registrar o bloqueio no `design.md`, sem inventar caminho.
- [x] 2.3 Implementar a confirmação na ficha `/anime/<slug>/`: limpar o `h1` dos sufixos de catálogo (incluindo "Clássico"/"Classic"), ler `span.date`, aplicar `findBestMatch` com score mínimo 0,85 e tolerância de um ano, abrir no máximo quatro fichas no total, priorizando os candidatos de maior similaridade, pular 404 e lançar erro para ficha 200 sem `h1` ou sem ano; verificar com testes de candidato confirmado, resultado alheio, ano divergente, ficha removida e ficha fora do layout.
- [x] 2.4 Implementar a ausência reconhecida da busca sem resultado e a falha fatal para HTTP 403/5xx na busca ou na ficha; verificar com testes de busca vazia, busca 403 e ficha 503.

## 3. Temporada, episódio e opções

- [x] 3.1 Implementar a leitura de `div.se-c`/`span.se-t` e a seleção do episódio por `div.numerando` ou `div.episodiotitle a`, usando o `href` publicado; devolver lista vazia para temporada ou episódio ausente e lançar erro quando `div.se-c` não existir em ficha confirmada; verificar com testes de par exato, temporada ausente, episódio ausente, temporada agrupada e lista ausente.
- [x] 3.2 Implementar a leitura de `div[id^="option-"]` com `src` no próprio `div` ou no `iframe` interno e o rótulo por `ul.idTabs a[href="#<id>"]`; registrar no topo do trecho `Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)`; verificar com fixtures das duas formas de embed, com e sem rótulo.
- [x] 3.3 Implementar o fallback único para `/anime/<slug>/` quando a página do episódio tiver `h1.epih1`/`#playex` e nenhum `option-*`, a ausência quando as duas páginas não tiverem opções, o erro de estrutura quando faltar `h1`, e o tratamento de 404 do episódio como fallback; verificar com testes de fallback com opções, fallback vazio, página sem estrutura e episódio removido.
- [x] 3.4 Implementar o tratamento de 403/5xx na página do episódio como falha fatal, não ausência; verificar com teste de bloqueio.

## 4. Hosts e streams

- [x] 4.1 Implementar `hosts.js` com classificação por hostname/caminho para Blogger, mídia direta `.mp4`/`.m3u8`, MixDrop, Streamtape, Dood e Byse; registrar no topo `Origem: codeberg.org/prismastream/install, prisma_hosts.py (GPL-3.0)` e identificar os adaptadores aproveitados de `src/pobreflixtv/hosts.js`; verificar que host desconhecido não é classificado por substring solta.
- [x] 4.2 Implementar a resolução do Blogger com `extractBloggerFormats` do bloco `blogger-video`, a aceitação de mídia direta e os adaptadores de MixDrop, Streamtape, Dood e Byse, com `unpackPacker` onde o Prisma desempacota; verificar com fixtures de host que cada resolvedor devolve URL e cabeçalhos esperados.
- [x] 4.3 Implementar a montagem com `buildStream`/`format` (`FORMATTER.AUTO`, `addon: 'AnimesOnlineCC'`, título, ano, temporada e episódio), idioma pelo rótulo, qualidade pelo `qualityLabel` do Blogger ou descoberta local, `type` e `provider` do host, cabeçalhos apenas do adaptador, deduplicação por URL e ordenação com `sortByQuality`; verificar com testes de dublado 360p, legendado sem qualidade, rótulo sem idioma, MP4, HLS, campos ausentes, duplicata e ordenação.
- [x] 4.4 Confirmar que nenhum stream recebe `name`/`title`, que o master HLS sai inteiro e que não há sonda, `Range`, `HEAD`, cache ou timeout próprio; verificar por inspeção do código e pelos testes de contrato.

## 5. Fronteira de erro e suíte offline

- [x] 5.1 Implementar o isolamento por opção com `console.warn('[AnimesOnlineCC] Opção <rótulo> descartada: <causa>')`, a triagem de host desconhecido sem falha, o erro agregado quando todas as opções conhecidas falham e a captura final em `getStreams` com `console.error('[AnimesOnlineCC] ...')`; verificar com testes de uma falha entre válidas, todas falhando, todas triadas e entrada inválida.
- [x] 5.2 Criar `test/fixtures/animesonlinecc/` com respostas reais sanitizadas: busca com resultado, busca vazia, ficha do anime, ficha com duas temporadas, episódio com duas opções, episódio sem opções, ficha sem opções, host desconhecido, respostas de host (incluindo Blogger com dois formatos) e respostas de erro; substituir tokens do Blogger por `token=EXAMPLE` e URLs de mídia por `cdn.example`, sem cookie, token real ou mídia.
- [x] 5.3 Completar `test/animesonlinecc.test.js` com os casos do design: filme, entrada inválida, busca confirmada, busca vazia, resultado alheio, ano divergente, ficha 404, ficha sem estrutura, temporada ausente, episódio ausente, temporada agrupada, duas opções, fallback, página sem `option-*`, host desconhecido, uma opção falhando e outra funcionando, todas falhando, 403 na busca, 403 no episódio, 404 do episódio com fallback e deduplicação.
- [x] 5.4 Executar `node --test test/animesonlinecc.test.js` e confirmar que a suíte passa sem internet e sem fixture com dado efêmero.

## 6. Documentação e integração

- [x] 6.1 Adicionar a linha e a seção `AnimesOnlineCC` em `providers.md` com status inicial `🟠 Não verificado` e data `—`; verificar que `node --test test/providers-catalog.test.js` passa.
- [x] 6.2 Adicionar `animesonlinecc` a `test/online/profiles.json` com `exclusiveTag: "anime"` e incrementar a `revision` do arquivo (atualmente `2026-11-14.11`); confirmar que `node --test test/online-catalog.test.js` passa com a amostra elegível.
- [x] 6.3 Atualizar `docs/provider-investigation.md` com a seção "Página de episódio com embeds em <div id="option-X" src>", cobrindo busca `/?s=`, confirmação `h1`/`span.date`, temporada `se-t`, opções, hosts e limites (WAF, resultado alheio, temporadas agrupadas, forma do embed, hosts não observados), referenciando `src/animesonlinecc/` e `test/animesonlinecc.test.js`.
- [x] 6.4 Revisar `README.md` e `docs/arch.md`; alterar apenas se a lista de provedores ou uma convenção global mudar, registrando a decisão no `design.md`. Nenhum bloco novo deve ser criado.
- [x] 6.5 Rodar `npm run lint`, `npm test` e `node build.js animesonlinecc`; verificar que a suíte completa e o build passam e que os arquivos gerados foram atualizados.

## 7. Verificação online

- [x] 7.1 Rodar `npm run test:online -- --provider animesonlinecc --record` com `TMDB_API_KEY` apenas no ambiente e conferir a seção gerada em `providers.md`; a amostra usa cinco títulos com a tag `anime`.
- [x] 7.2 Classificar a rodada: `Estável` com ao menos um título resolvido, `Instável` sem resolução ou `Inconclusivo` por WAF, timeout externo ou chave ausente; `Parcial` não se aplica a provedor de um único tipo. Registrar o motivo saneado em `providers.md` e, se inconclusiva, manter a mudança sem arquivar.
- [x] 7.3 Procurar no relatório e nas fixtures por token real do Blogger (`token=` seguido de valor longo), `googlevideo.com`, `blogger.com/video.g` com token, cookie e URL de mídia; aceitar apenas o placeholder `token=EXAMPLE` e remover qualquer resíduo antes de registrar a rodada.

## 8. Workflow follow-up

- [x] 8.1 Arquivar a mudança após a revisão e a rodada online, ou declarar explicitamente as exclusões e o motivo de não arquivar. Se o seletor dos cartões de busca não for confirmado na fixture, bloquear a implementação e não arquivar.
- [x] 8.2 Preparar o commit `feat(animesonlinecc): adiciona provedor AnimesOnlineCC` com o corpo `OpenSpec: adicionar-provedor-animesonlinecc` e incluir código, manifest, testes, fixtures, documentação e arquivos gerados no mesmo commit.
