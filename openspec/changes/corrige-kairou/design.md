# Design

## Context

1. Em `providers.md` e no `result.json` da rodada `2026-11-20T13-20-04-597Z-kairou-20261120-9e32`, pacote 1.0.0 e combinação `prism/all/all/all`, cinco filmes e cinco episódios falharam com `HTTP 404 em <url>`, sem streams. O relatório mascara a URL e não documenta o corpo ou o destino exato da resposta.
2. Em `src/kairou/extractor.js`, a consulta ao TMDB precede `fetchJson` em `https://www.kairou.space/api/extract`. O bloco TMDB emite `TMDB respondeu HTTP ...`, enquanto o bloco HTTP emite `HTTP ... em ...`. Logo, no código atual, o texto da rodada identifica a falha da consulta de extração, não uma resposta 404 do TMDB. O relatório não comprova o conteúdo da resposta ou a causa remota.
3. Em 20/11/2026, uma consulta pública direta à página inicial retornou HTTP 200; `GET /api/extract?type=movie&tmdbId=680&title=Pulp%20Fiction` retornou HTTP 404, título HTML `Error`, sem redirecionamento. Isso reproduz a indisponibilidade da rota, mas não prova que ela tenha sido removida permanentemente nem que a mesma causa remota explique todos os casos históricos.
4. A spec atual exige explicitamente essa rota; os testes em `test/kairou.test.js` simulam o TMDB e a rota antiga, com sucesso por fixtures e falha HTTP 503. Assim, não detectam por si sós mudança real da interface. O pacote da rodada não foi reexecutado nesta investigação.
5. Em 20/11/2026, a página inicial respondeu HTTP 200 e o bundle público `/assets/index-CMG70RBp.js` (Last-Modified 19/11/2026) passou a chamar `POST /api/extract/start` (job com EventSource em `/api/extract/stream/<jobId>`) e, como alternativa, `POST /api/extract` com corpo JSON. A rota GET antiga continua 404.
6. A chamada síncrona `POST /api/extract` respondeu 200 para filme `680` (8 streams), filme `438631` (6 streams, 4 deles em 4K), série `1396/1/1`, série `71912/1/1` e anime `37854/1/1` com `isAnime: true`. O corpo traz `elapsedMs`, `cached`, `resolvedTitle` (quando em cache), `streams[]` e `subtitles[]`; cada stream traz `id`, `label`, `audio`, `quality`, `codec`, `format`, `isPtBr`, `is4k` e `streamUrl`.
7. A reprodução pública foi confirmada sem conta: `GET /api/stream/<id>/media.mp4` com `Range: bytes=0-0` respondeu 206 `video/mp4`; `GET /api/stream/<id>/master.m3u8` respondeu 200 `application/vnd.apple.mpegurl` com `#EXTM3U`; nenhum dos dois exigiu `Referer` ou `Origin`, e o proxy responde CORS `*`.
8. `target` inválido respondeu HTTP 400 com JSON `{ "error": ... }`; título fora do catálogo respondeu 200 com `streams: []`. Nenhuma legenda externa foi observada na amostra; o cliente da fonte lê `trackUrl`, `label` e `lang` nas legendas do topo. O 4K aparece como `is4k: true` e `quality: "4K UHD"`.
9. `POST /api/extract` não exige `Origin` nem `Referer`; o corpo mínimo observado foi `{ target, title }`, e o site envia `{ target, imdbId, title, originalTitle, isAnime, refresh }`. A chamada `/api/extract/start` não é usada porque o QuickJS não oferece `EventSource`.

## Goals / Non-Goals

1. Objetivo: substituir a rota GET removida pela interface pública comprovada, cobrir regressões e exigir validação do pacote final.
2. Fora do escopo: contornar controles de acesso, usar credenciais, serviços que exijam conta, presumir endpoints, alterar outros provedores ou declarar o provedor funcional com base apenas em testes simulados.

## Decisions

1. **Interface comprovada:** adotar `POST /api/extract` com corpo JSON, que é a alternativa síncrona usada pelo próprio site e respondeu com streams e mídia reproduzível sem conta. Alternativa rejeitada: `/api/extract/start` com EventSource, porque o QuickJS não oferece `EventSource` nem leitura incremental de resposta; trocar o caminho por um palpite também foi rejeitado.
2. **Contrato observado:** o corpo envia `target` (`<tmdbId>` ou `<tmdbId>/<season>/<episode>`), `imdbId` quando disponível, `title`, `originalTitle` e `isAnime`. A resposta 200 traz `streams[]` e `subtitles[]`, sem `ok` nem `count`; lista vazia é ausência reconhecida e HTTP fora de 2xx é falha. Cada opção traz `streamUrl`, `format`, `quality`, `audio`, `isPtBr` e `is4k`.
3. **Campos fornecidos:** `streamUrl` é preservado como URL relativa resolvida contra a origem; `format` vira o tipo do stream; `quality` passa por `normalizeQuality`; `audio` e `isPtBr` classificam o idioma; `is4k` ou qualidade 4K são descartados por triagem. A fonte não informa `source`, tamanho ou cabeçalhos, então esses campos não são inventados.
4. **Legendas:** o cliente da fonte lê `trackUrl`, `label` e `lang` nas legendas do topo; o provedor preserva esse formato. Nenhuma legenda externa foi observada na amostra pública, então esse caminho fica coberto por teste construído e registrado como limitação, sem declarar evidência online.
5. **Evidência segura:** registrar status, caminhos públicos e respostas sanitizadas sem chaves, cookies, URLs assinadas ou mídia; não compartilhar nem sobrescrever relatórios de outras rodadas. Criar fixtures reais sanitizadas somente após confirmar origem e contrato.
6. **Diagnóstico diferencial:** confirmar filme e episódio, inclusive anime quando aplicável; testar resposta vazia distinta de HTTP 404, corpo inválido e opções parciais. Não inferir cobertura do acervo inteiro a partir de dez títulos.

## Risks / Trade-offs

1. Interface removida, restrita ou transitória → a rota síncrona pode sumir de novo; nesse caso, registrar o bloqueio e repetir a investigação, sem migrar para um fluxo que o QuickJS não executa.
2. Conteúdo e playback variam por título, região e momento → verificar mais de um título por tipo e testar a mídia conforme `docs/tests.md`; não generalizar a partir de um único POST.
3. Os testes de Node usam respostas controladas e não provam compatibilidade com QuickJS ou reprodução online → validar o pacote minificado final pelo procedimento online do projeto.
4. A rota síncrona pode demorar alguns segundos em cache frio → o provedor não impõe timeout próprio, conforme `docs/arch.md`; o app gerencia a espera.

## Migration Plan

1. Implementar a troca para `POST /api/extract`, criar fixtures sanitizadas e testes; executar `node build.js kairou`, `npm run lint` e `npm test`; depois executar `npm run build:min` e `npm run test:online -- --provider kairou` com chave TMDB apenas no ambiente.
2. A rodada final SHALL usar `prism/all/all/all`, verificar filme e episódio conforme o protocolo de `docs/tests.md`, registrar data, identidade, amostra, resultados e limitações em `providers.md` e atualizar status somente pelos critérios locais.
3. Se a solução regredir, reverter fonte, testes, spec e pacotes correspondentes juntos; registrar o resultado real, sem atribuir estabilidade à versão anterior.

## Validation

1. `node build.js kairou` e `npm run build:min` concluíram sem erro; os pacotes `providers/kairou.js`, `gdrive/providers/kairou.js` e `prism/providers/kairou.js` e os manifests de instalação foram regenerados com a versão 1.1.0.
2. `npm run lint` passou sem avisos.
3. `npm test` terminou com 1942 testes e 1942 aprovados após a rodada online. A execução anterior, feita antes da nova evidência, teve uma única falha esperada: `providers.md` ainda mostrava a rodada 1.0.0 enquanto o manifest já estava em 1.1.0.
4. `npm run test:online -- --provider kairou --record` registrou a rodada `2026-11-20T15-23-08-856Z-kairou-986ab692-c4e9`, pacote 1.1.0, `prism/all/all/all`, status **Estável**, filme 4/5 e série 3/5. Oppenheimer e Hotel del Luna falharam com `fetch failed`; Doupo Cangqiong ficou sem resultado.
5. Cobertura offline: filme, episódio, anime, ausência, HTTP 400/404/503, JSON inválido, resposta sem `streams`, 4K, URL inválida isolada, duplicata, idioma por `isPtBr`/`audio`/legenda PT e legendas do topo com `trackUrl` e reserva `url`.
6. Casos não cobertos pela evidência: legenda externa preenchida não apareceu na amostra pública (o caminho tem teste construído apenas), a rodada online não abre o app nem reproduz vídeo e o 4K não é entregue por triagem.
7. `openspec validate corrige-kairou --strict` retornou válido; o requisito modificado tem 368 caracteres. `test/providers-catalog.test.js` passou após o registro da rodada.

## Open Questions

1. Resolvida em 20/11/2026: `POST /api/extract` é a interface pública síncrona que devolve extração e mídia reproduzível sem conta, chave ou contorno.
2. Legendas externas não foram observadas na amostra; se a fonte voltar a publicá-las, confirmar o formato real antes de tratar o caminho como evidência online.
