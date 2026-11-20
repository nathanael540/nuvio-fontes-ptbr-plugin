# Design

## Context

1. A rodada `2026-11-20T13-20-26-846Z-anitube-20261120-a115`, finalizada em `2026-11-20T13:21:17.799Z`, avaliou o pacote 1.0.0 em `prism/all/all/all`, perfil `anime`, semente `20261120`. O relatório transitório `test/artifacts/online/2026-11-20T13-20-26-846Z-anitube-20261120-a115/result.json` corresponde ao registro em `providers.md`.
2. Resultado confirmado: filmes 0/5 (três falhas e duas ausências); séries 0/5 (cinco falhas). Nos três filmes falhos e nas cinco séries há rejeição de `api.anivideo.net` como host não suportado; nas cinco séries há também HTTP 403 atribuído ao Player 1. Akira e Princesa Mononoke são ausências, não falhas de player demonstradas.
3. `src/anitube/players.js` classificava como FHD somente o host com caminho contendo `videohls.php`; outros caminhos no mesmo host eram classificados como não suportados. Isso explica a mensagem para a opção rejeitada, mas o relatório não conserva o caminho do iframe: não identifica o novo caminho nem demonstra que contém HLS. O 403 é registrado com URL sanitizada; não é possível identificar a etapa exata da cadeia nem a causa do bloqueio.
4. A spec principal pressupunha FHD por `videohls.php` e Player 1 via Blogger. `test/anitube.test.js` cobria os dois, ausência, isolamento de falha e erro agregado com fixtures locais; não demonstrava a estrutura atual nem reproduzia a resposta real do 403. A documentação descrevia a estrutura anterior, que não comprovava a estrutura da rodada.
5. A rodada valida contrato de streams retornados, não reprodução, acesso ao manifesto HLS, funcionamento no app ou cobertura geral do catálogo. Somente S01E01 foi amostrado em séries. A coleta pública de 2026-11-20 (seção Diagnóstico) atualizou a estrutura observada; a rodada online do pacote final continua sendo a evidência de funcionamento.

## Diagnóstico (2026-11-20)

1. **Ficha de filme.** A ficha pública de *A Viagem de Chihiro* (`/video/1030445/`) publica um único iframe `api.anivideo.net/cdn/v1.<segmento opaco>?i=<pôster>`. A rota não contém `videohls.php`; por isso o provedor a classificava como host não suportado.
2. **Página do FHD.** A rota `/cdn/` responde `HTTP 403` com `NOT_IFRAME` quando a requisição não traz `Sec-Fetch-Dest: iframe` e o `Referer` da ficha. Com os dois contextos responde `200` e publica `sources.file` com um HLS em `cdn-sv01.maximaimg.online`, cujo caminho contém o slug da obra e o episódio. A string usa `\/`; sem desfazer o escape a URL fica com barras duplas e o CDN responde `403`. A página observada não publica `sources.label`.
3. **Mídia do FHD.** O manifesto respondeu `200`, `application/vnd.apple.mpegurl`, com `#EXTM3U` e `#EXT-X-PLAYLIST-TYPE:VOD`; o caminho identifica a obra. A evidência confirma o contrato, não a reprodução no aparelho.
4. **Player 1.** O iframe `www.anitube.zip/<segmento opaco>/0/0/bg.mp4?...` responde `302` para `api.anivideo.net/file/...`; o salto final responde `403` sem `Sec-Fetch-Dest: iframe` e `200` com ele. A página publicada traz o iframe `blogger.com/video.g`, cujo HTML contém `streamingData.formats` com 360p e 720p.
5. **Contexto de iframe.** O `403` é um controle de contexto (`NOT_IFRAME`), não autenticação: não há conta, chave, cookie, captcha ou serviço de bypass. A correção reproduz o mesmo contexto público de iframe já adotado no Pomfy, com um único cabeçalho; nenhum outro controle é contornado.
6. **Mídia do Player 1.** Os MP4 do Blogger são assinados e efêmeros; a evidência registra apenas host, qualidade e natureza, sem URL ou parâmetro.

## Goals / Non-Goals

**Goals:**

1. Identificar publicamente o caminho e a natureza da opção rejeitada e a etapa do 403 antes de selecionar qualquer adaptação.
2. Permitir uma correção limitada a mídia comprovada e verificável, preservando a seleção da obra e o tratamento independente das opções.

**Non-Goals:**

1. Contornar autenticação, desafios anti-bot, restrições de acesso ou usar credenciais, proxy privado ou serviços com chave.
2. Tratar o retorno de uma URL como prova de reprodução ou atribuir as duas ausências a falhas de extração.

## Decisions

1. **FHD em `/cdn/`:** classificar o host `api.anivideo.net` como FHD quando o caminho tiver `videohls.php` ou começar por `/cdn/`. Na primeira forma, o parâmetro `d` continua sendo a fonte direta e a página só melhora o rótulo; na segunda, a página é obrigatória e `sources.file` é a mídia. A página é buscada com `Referer` da ficha e `Sec-Fetch-Dest: iframe`. Alternativa de aceitar qualquer caminho do host foi descartada por ampliar falsos positivos.
2. **HTTP 403 do Player 1:** ocorre no salto final `api.anivideo.net/file/...`, não no caminho de token da fonte, e é o mesmo controle de contexto do FHD. Com `Sec-Fetch-Dest: iframe`, a cadeia segue para o Blogger. Não há alternativa pública que dispense o contexto; se ele deixar de ser aceito, a opção fica indisponível e isolada, sem bypass.
3. **Fixture antes do código:** a resposta observada foi reduzida a fixtures sanitizadas, sem tokens, URLs assinadas, credenciais ou dados efêmeros. Os testes cobrem a página `/cdn/`, o contexto de iframe, o 403 isolado e as duas formas antigas do FHD, além de filme e episódio.
4. **Isolamento:** preservar as rotas existentes comprovadamente válidas, avisos por opção e erro agregado somente se nenhuma retornar stream. Não aceitar como mídia publicidade ou URL apenas por pertencer ao host.

## Risks / Trade-offs

1. [Contexto de iframe endurecido] → a fonte pode deixar de aceitar `Sec-Fetch-Dest: iframe`; a opção falha isolada e a rodada online fica como critério de reavaliação, sem bypass.
2. [Rota `/cdn/` ou HTML do player mudam] → `sources.file` pode deixar de existir; os testes offline cobrem a resposta observada, mas não substituem a rodada online do pacote final.
3. [Fixtures e fontes mudam] → testes offline cobrem respostas observadas, mas não substituem rodada online do pacote final.
4. [Execução compartilhada] → futura rodada deve usar artefatos isolados e não sobrescrever resultados de outras threads; o build deste worktree é isolado.

## Migration Plan

1. Implementação e testes concluídos; executar `node build.js anitube`, `npm run lint` e `npm test`, depois `npm run build:min` e `npm run test:online -- --provider anitube` com `TMDB_API_KEY` apenas no ambiente.
2. Na rodada final, confirmar identidade do pacote, `prism/all/all/all`, perfil e amostra; registrar resultados e status conforme `docs/tests.md` em `providers.md`, inclusive falhas ou inconclusões. A meta é recuperar streams válidos nos casos afetados de filme e série, sem transformar ausência em falha; não declarar estabilidade sem os critérios oficiais.
3. Se a validação falhar, não publicar nem arquivar como corrigida; reverter a alteração de código e pacotes caso necessário, preservando a evidência adequada e sem restaurar relatórios de outra execução.

## Validation

1. `node build.js anitube`, `npm run lint` e `npm test` passaram no worktree; `npm test` executou 1944 testes, sem falhas.
2. `npm run build:min` e `npm run test:online -- --provider anitube --seed 20261120 --record` usaram o pacote final em `prism/all/all/all`, perfil `anime` e a mesma semente da rodada anterior; a rodada gerou o ID `2026-11-20T15-22-50-177Z-anitube-20261120-2e51`.
3. A rodada de 2026-11-20 resolveu `movie` 3/5 (duas ausências reconhecidas) e `tv` 5/5, sem falhas nem inconclusivos; o status público ficou `Estável` em `providers.md`.

## Open Questions

1. A rota `/cdn/` e o contexto de iframe podem mudar; a próxima rodada online é o critério objetivo de reavaliação. Não há questão aberta que bloqueie a implementação.
