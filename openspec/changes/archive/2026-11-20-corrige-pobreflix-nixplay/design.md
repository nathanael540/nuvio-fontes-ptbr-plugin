# Design

## Context

1. A rodada `2026-11-20T13-19-23-834Z-pobreflix-nixplay-20261120-e0e7`, pacote 1.1.0, `prism/all/all/all`, semente `20261120`, registrou cinco falhas em filmes e cinco em episódios, sem streams. `providers.md` e `test/artifacts/online/2026-11-20T13-19-23-834Z-pobreflix-nixplay-20261120-e0e7/result.json` concordam; o log resumido registra 0/5 por tipo. Os catálogos são revisão `2026-11-12.1`.
2. **Confirmado no relatório:** cada caso registra três rejeições de origem final e uma ausência do marcador de tema. As URLs estão redigidas, inclusive no JSON: não é possível associar destinos ou aliases individuais a esses motivos a partir da rodada.
3. **Confirmado no código atual:** `catalog.js` aceita somente quatro origens explícitas e verifica `pobreflix-v10` depois do `fetchPage`; `index.js` prossegue ao próximo alias quando a validação falha e só chama `resolvePlayer` após sucesso. Assim, os motivos relatados apontam para falha na etapa de origem, anterior à consulta do player. Não comprovam por que os servidores responderam assim nem que o código atual seja idêntico ao pacote avaliado.
4. **Hipóteses:** mudança de domínio ou tema, redirecionamento para serviço não relacionado, página de bloqueio ou resposta transitória. Nenhuma identifica uma nova origem confiável ou uma correção. Não houve consulta externa nesta investigação; o relatório redigido não permite distinguir essas hipóteses.
5. **Cobertura:** os testes em `test/pobreflix-nixplay.test.js` simulam redirects aceitos, origem não aprovada, tema ausente e fallback, além de respostas do player e mídia; mocks não comprovam o comportamento atual da fonte. A amostra online não demonstra o tamanho do acervo, reprodução no app nem disponibilidade futura. O índice GitNexus local estava um commit atrás e não fundamenta este diagnóstico.
6. A spec `pobreflix-domain-redirect` trata exclusivamente de `pobreflixtv`; não deve ser aplicada ao NixPlay por semelhança de nome. A capacidade do NixPlay ainda não possui spec própria.

## Goals / Non-Goals

**Goals:**
1. Identificar uma origem e fluxo realmente verificáveis antes de propor uma alteração concreta.
2. Preservar fronteiras de confiança e evidenciar regressões e resultados online.

**Non-Goals:**
1. Alterar `pobreflixtv`, relaxar validação por suposição ou contornar autenticação, desafios ou outros controles.
2. Afirmar funcionamento, publicar ou alterar status com base apenas em testes offline.

## Diagnóstico

1. **Aliases.** Em 20/11/2026, `https://pobreflix.boutique`, `https://pobreflix.cab` e `https://pobreflix.garden` responderam 200 após redirecionamento para `https://pobreflixtv.camp/`, com título "PobreFlix - Filmes e Séries Online Grátis em HD", tema `pobreflix-v10`, WordPress e sem desafio Turnstile. `https://pobreflix.monster` respondeu 200 em si mesmo, sem título, sem tema, sem marcadores de catálogo e com o texto "Do Not Sell or Share My Personal Information"; é página provisória, não catálogo.
2. **Identidade.** O destino preserva o contrato do NixPlay: HTML do tema `pobreflix-v10-7-0-seo-pro`, configuração `pf12Player` com `fallback` para `/wp-json/api/v1/player` e páginas de conteúdo com `data-tmdb` e `data-post-id`. `https://www.pobreflixtv.golf` redireciona para `https://www.pobreflixtv.codes`, que é o catálogo Invision/VideoBox do Pobreflix HD; não é o destino do NixPlay e fica fora do escopo.
3. **Player antigo.** `POST /wp-json/api/v1/player` com `tmdb` de filme e de episódio respondeu 404 JSON com "O conteúdo importado usa a fonte RedeMuvi". A configuração da página declara `imported: 1`, `api` para `/wp-json/api/v1/redemuvi-player`, `ajax` para `/wp-admin/admin-ajax.php`, `fallback` para `/wp-json/api/v1/player` e `base` para `https://api.redemuviapi.lat/`.
4. **Interface pública de recuperação.** O endpoint REST `redemuvi-player` respondeu 403 "Acesso à API bloqueado" a requisições sem navegador. O próprio JavaScript da página usa, nesse caso, o `admin-ajax.php` público com `action=pf12_public_player` e `provider=redemuvi`. Com `post_id` da página de conteúdo, a resposta foi 200 `{ available: true, option: { provider: "redemuvi", mode: "video", extension: "mp4", url } }` para filme e episódio; sem `post_id`, 404 `invalid_post`; episódio inexistente, 200 `source_not_found`. Não foi usado cookie, conta, token ou contorno de desafio.
5. **Mídia.** A opção aponta para `https://api.redemuviapi.lat` em caminho `/movie|series/<áudio>/<hash>/<n>.mp4`, sem parâmetros. A sonda com `Referer` da página e `Range: bytes=0-63` respondeu 206 com `Content-Range` e assinatura `ftyp`; sem `Referer`, 403 "Acesso Negado". O servidor não envia `Content-Type` na resposta parcial, então a assinatura do contêiner é a validação disponível.
6. **Busca por TMDB.** `/?pf12_search=1&q=<título>&type=movie|tv` respondeu 200 com cartões para `/assistir/...`; a página do conteúdo confirma `data-tmdb` igual ao pedido. Foram confirmados 872585 (Oppenheimer), 680 (Pulp Fiction), 14853 (O Clone) e 87108 (Chernobyl), além do episódio S1E3 de O Clone. A busca vazia responde 200 sem cartões.

## Decisions

1. **Aprovar somente a origem comprovada.** Incluir `https://pobreflixtv.camp` como origem aprovada, mantendo a exigência de tema, HTTPS e validação da origem final antes do player. Remover `pobreflix.monster` dos aliases: a página provisória só produziria falha operacional e impediria classificar ausência. Não alterar `pobreflixtv` nem aprovar `pobreflixtv.codes`.
2. **Confirmar o TMDB antes de usar a coordenada.** A busca por título/original/alternativos é pública e limitada a candidatos; cada página é lida e só entra no fluxo quando `data-tmdb` é igual ao pedido e o tipo confere. O `post_id` sai da página confirmada. Sem candidato confirmado, o resultado é ausência, não erro.
3. **Usar a interface pública declarada pela própria origem.** Quando o player antigo informar conteúdo importado da RedeMuvi, consultar `admin-ajax.php` com `action=pf12_public_player` e `provider=redemuvi`, usando os endpoints e a base lidos da configuração `pf12Player` da página confirmada. Não contornar o 403 do endpoint REST; ele não é necessário. O 404 `Título não cadastrado` do player antigo e o `source_not_found` da recuperação são ausência; `invalid_post`, HTTP inválido e estrutura desconhecida são falhas operacionais.
4. **Validar a mídia e a reprodução.** Aceitar somente URL HTTPS cuja origem seja exatamente a `base` declarada pela origem e cujo caminho siga `/movie|series/<áudio>/<hash>/<n>.(mp4|webm)`; sondar com `Referer` da página, `Range: 0-63`, status 206, `Content-Range` numérico e assinatura `ftyp`. Montar o stream com `headers` de reprodução. Qualidade e idioma não são informados pela opção; a saída usa a descoberta local e `Idioma Desconhecido` quando não houver pista confiável.
5. **Fixtures e testes.** Capturar respostas reais sanitizadas da busca, da página de filme, da página de série, da opção de filme/episódio e da ausência; preservar os testes de rejeição de origem, tema, identidade e fallback. Testar filme, episódio, ausência, `source_not_found`, `invalid_post`, origem de mídia divergente e falha de sonda. A opção `superflix` (iframe) fica fora desta correção.
6. **Rodada final.** Usar pacote minificado e `npm run test:online -- --provider pobreflix-nixplay`, com identidade e `prism/all/all/all` registradas em `providers.md`. Coordenar a escrita com outras threads; a classificação segue `docs/tests.md`, inclusive amostras inconclusivas; não prometer estabilidade.

## Risks / Trade-offs

1. A interface pública de recuperação e o host de mídia podem mudar; a configuração `pf12Player` é lida da página confirmada a cada pedido, mas uma mudança de contrato exige nova investigação.
2. O endpoint REST de recuperação responde 403 a requisições sem navegador; a correção depende do fallback público `admin-ajax.php` que o próprio site usa. Se ele for removido, o provedor falha operacionalmente, sem relaxar a origem ou inventar ausência.
3. A mídia exige `Referer`; a rodada online valida o contrato e a sonda, não a reprodução no app, o comportamento completo em QuickJS nem a disponibilidade futura do CDN.
4. Apenas a opção RedeMuvi é suportada; a opção SuperFlix em iframe fica fora do contrato atual. Qualidade e idioma não vêm da opção e podem sair como `Desconhecida`/`Idioma Desconhecido`.
5. A busca pública pode não expor todo o acervo; ausência é classificada apenas quando a busca e as páginas confirmadas não trazem o TMDB pedido, nunca a partir de uma falha de rede ou de estrutura.

## Validation

1. **Offline.** `node --test test/pobreflix-nixplay.test.js` passou com 41/41 casos, incluindo filme importado, episódio, ausência, `source_not_found`, `source_not_found` fora de 200, mídia 404 `Episode not found`, `invalid_post`, origem de mídia divergente, sonda sem `ftyp`, busca sem correspondência, página com TMDB divergente e redirect de busca para origem não aprovada. `npm run lint` passou sem avisos; `npm test` passou com 1952/1952 casos; `node build.js pobreflix-nixplay` e `npm run build:min` concluíram.
2. **Online final.** Rodada `2026-11-20T15-35-24-739Z-pobreflix-nixplay-08ed9121-edc7`, pacote 1.1.1, `prism/all/all/all`, perfil generalista, catálogos `movie@2026-11-12.1` e `tv@2026-11-12.1`, semente `08ed912110133cfa72c600707cc74085`, status **Estável**: `movie 5/5` e `tv 4/5` resolvidos, com 1 `Sem resultado` (The Flash S01E01, mídia 404 `Episode not found`) e nenhuma falha operacional ou inconclusão. Registro em `providers.md`.
3. **Iterações da mesma investigação.** Antes de classificar o 404 `Título não cadastrado` como ausência, a rodada `2026-11-20T15-27-15-366Z-pobreflix-nixplay-1e4a5843-806b` registrou `movie 3/5` e `tv 5/5` com dois casos de filme como `Falha`; antes de classificar o 404 `Episode not found` da sonda de mídia, a rodada `2026-11-20T15-33-09-314Z-pobreflix-nixplay-178f0557-3811` registrou `movie 4/5`, `tv 3/5` e uma falha em The Flash. Os dois eram ausência explícita da fonte, não falha de rede, identidade ou player; cada ajuste foi seguido de novo pacote minificado e nova rodada, e a rodada final substituiu as anteriores.
4. **Limites.** A evidência online cobre o contrato dos streams e a sonda de mídia, não a reprodução no app, o QuickJS, a disponibilidade futura do CDN ou a opção SuperFlix. `providers.md` é o registro operacional; este design mantém a decisão e as limitações.
