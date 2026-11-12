# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 12/11/2026 contra `https://www.kairou.space/`, sem registrar URLs assinadas, cookies ou credenciais.

1. O site é uma SPA com rotas em hash (`#/movies`, `#/series`, `#/animes`). O HTML inicial não contém catálogo. Os scripts relevantes são `js/api.js` (proxy do TMDB), `js/player.js` (reprodução) e `vendor/pocketbase.umd.js` (conta e perfis).
2. O catálogo em si usa o TMDB; a reprodução é resolvida pelo backend do Kairou em `GET https://www.kairou.space/api/extract`.
3. Parâmetros observados: `tmdbId`, `type` (`movie` ou `series`), `season`, `episode`, `title`, `isAnime=1` e `fast=1`. Sem `type`, a API assume um dos tipos; por isso o provedor sempre envia o tipo correto.
4. A resposta tem `ok`, `fast`, `count`, `streams[]` e `subtitles[]`. Cada stream traz `id`, `source`, `providerName`, `url`, `type` (`mp4` ou `hls`), `quality`, `rank`, `is4k`, `isHls`, `isDub`, `isDual`, `subtitles`, `dead`, `alive`, `status`, `server` e `isFastest`.
5. `streams[].url` é uma URL relativa `/api/proxy?url=<mídia>&referer=<origem>` na maioria dos casos, ou uma URL absoluta de player, como o bridge HLS do pstream. O site reproduz exatamente essa URL; não há outra etapa de resolução no navegador.
6. O proxy `/api/proxy` é público, sem chave e sem conta. Para MP4 respondeu `206 video/mp4` com Range; para HLS respondeu `200 application/vnd.apple.mpegurl` e reescreveu as URLs filhas para o próprio proxy; para legendas, `/api/proxy?format=vtt&url=...` respondeu `200 text/vtt`.
7. O acesso direto aos MP4 dos hosts `veyra` e `fenix` terminou em `bloqueado.mp4`; `zeusoficial` e `popplay` responderam direto. O proxy do Kairou foi o caminho que funcionou para todos os casos testados.
8. `fast=1` em cache frio devolveu `count: 0` em três títulos; sem `fast`, os mesmos títulos devolveram de 15 a 22 streams. O provedor não usa `fast=1`.
9. A primeira consulta de um título em cache frio levou de cerca de 8 a 22 segundos; consultas repetidas responderam em menos de 1 segundo. O runtime não permite timeout próprio; o app gerencia a espera e a verificação online usa limite externo de 120 segundos por caso.
10. `tmdbId` não numérico devolveu `ok: true` e `count: 0`; o provedor valida a entrada antes de consultar. Série sem temporada/episódio também devolveu streams (17), então o provedor exige o par em pedidos de série.
11. `is4k: true` e `quality: "4K"` aparecem em títulos recentes. O site mostra esses servidores como bloqueados para quem não é VIP (`isVip`), embora a API os inclua na resposta.
12. `alive` e `status` não são confiáveis como triagem: um stream 4K veio com `alive: null` e `status: 504`, mas ainda era listado e escolhido como o mais rápido. `dead` veio `false` em todos os exemplos.
13. `subtitles[]` tem `id`, `lang`, `flag`, `label` e `url`. O `label` é texto em português com o sufixo `· Opção N`; a lista do topo da resposta é a mesma anexada a cada stream nos exemplos.
14. O site também consulta o addon Stremio `pleiadesstream.duckdns.org` para animes e mistura os resultados no navegador. Esse addon é externo ao Kairou e fica fora do escopo.

## Goals / Non-Goals

**Goals:**

1. Resolver filme e episódio diretamente pelo ID do TMDB, sem busca textual nem raspagem da SPA.
2. Preservar a URL de reprodução publicada, inclusive o proxy público, para não depender de cabeçalhos ou de desbloqueio local.
3. Montar streams com qualidade, idioma, origem, tipo e legendas comprovados pela resposta.
4. Distinguir ausência reconhecida de falha de rede, JSON ou estrutura, com testes offline determinísticos.

**Non-Goals:**

1. Implementar login, perfis, favoritos, histórico ou qualquer recurso de conta do site.
2. Liberar o 4K reservado a assinantes; a opção é descartada por triagem.
3. Consumir o addon Stremio de animes ou outros agregadores externos.
4. Sondar cada mídia, baixar playlists ou validar reprodução; a rodada online confirma o contrato, não o vídeo.
5. Contornar bloqueio, Cloudflare, captcha ou restrição de acesso.
6. Criar bloco compartilhado antes de existir um segundo consumidor real da mesma API.

## Decisions

### D1. Consumir a API de extração em vez de raspar a SPA

1. Usar `GET https://www.kairou.space/api/extract` com `fetchJson` do bloco `http`, perfil `api`, porque a resposta já contém os streams resolvidos e o site não expõe outra interface pública com os mesmos dados.
2. Alternativas descartadas:
   1. Raspar o HTML: a página é montada por JavaScript e não traz o catálogo nem os players no carregamento inicial.
   2. Usar o Jina Reader: adicionaria intermediário e cota para uma API JSON que responde direto.
   3. Reutilizar o proxy do TMDB (`/api/tmdb`): ele só resolve metadados, não mídia.
3. A API não é versionada; mudanças de esquema sobem como erro de estrutura, nunca como ausência.

### D2. Identidade pelo TMDB e parâmetros da consulta

1. Chamar `getMediaInfo` antes da extração para obter título PT-BR, ano e classificação (`kind`). O título vai no parâmetro `title`, como o site faz; o ano e a classificação alimentam o formatador e a decisão de `isAnime`.
2. Enviar `type=movie` para filme e `type=series` para série. Em série, exigir `season` e `episode` inteiros a partir de 1 antes da requisição e enviá-los sempre; a API devolve streams mesmo sem eles, o que poderia selecionar a mídia errada.
3. Enviar `isAnime=1` somente quando `media.kind === 'anime'`. O site usa a mesma marcação; ela não substitui a confirmação de tipo do TMDB.
4. Alternativas descartadas:
   1. Dispensar o TMDB e usar só o ID: perderia título, ano e a marcação de anime no formatador.
   2. Buscar por título no site: a API já aceita o ID exato; busca textual adicionaria ambiguidade e requisições.
   3. Usar `isAnime=1` em toda série: misturaria a triagem de anime com séries comuns sem evidência.

### D3. Consulta única, sem `fast=1` e sem timeout próprio

1. Fazer uma única consulta por `getStreams`, sem paginação e sem chamadas por opção.
2. Não usar `fast=1`: em cache frio ele devolveu zero streams; o modo completo devolveu a lista utilizável. A latência de até ~20 segundos é aceita porque o app gerencia a espera.
3. Não impor `AbortController`, `setTimeout` ou limite de tempo; o contrato proíbe timeout próprio.
4. Alternativa descartada: chamar `fast=1` e depois o modo completo em paralelo. Dobraria a carga e a complexidade sem melhorar o resultado final, já que o plugin não entrega resultados parciais.

### D4. Preservar a URL de reprodução publicada

1. Resolver URL relativa contra `https://www.kairou.space` e manter URL absoluta como veio. Não desmontar o proxy nem trocar por URL direta.
2. O motivo é observável: os MP4 de `veyra` e `fenix` redirecionaram para `bloqueado.mp4` quando acessados direto, enquanto o proxy respondeu `206` com Range; o proxy também reescreve as URLs filhas do HLS e converte legendas em VTT.
3. O proxy do Kairou é público, sem conta e sem chave, e faz parte da própria fonte. Não é um serviço de bypass externo.
4. Não enviar `headers` de reprodução: a URL publicada é autossuficiente nos testes com e sem `Referer`, e um `Referer` inventado poderia quebrar o bridge absoluto do pstream.
5. Alternativas descartadas:
   1. Desmontar todos os proxies: perde os MP4 bloqueados e as legendas convertidas.
   2. Usar URL direta quando ela responde: exigiria sondagem por stream, com requisição extra e resultado variável por IP.
   3. Reproduzir com `Referer` do site: não é necessário para o proxy e não foi comprovado para os hosts diretos.

### D5. Mapeamento da resposta

1. Validar `ok === true` e `streams` como array. `ok: false`, corpo inválido ou `streams` ausente são erros de estrutura; `ok: true` com `streams: []` é ausência reconhecida.
2. Cada item de `streams` é uma opção independente:
   1. Descartar `is4k === true` ou qualidade normalizada `4K`, porque o site reserva o 4K a assinantes. O descarte é triagem, com registro local, e não conta como falha.
   2. Exigir URL HTTP(S) depois da resolução; item sem URL válida é descartado com `console.warn('[Kairou] Opção <id> descartada: <causa>')`.
   3. Montar o stream com `buildStream`; se a montagem falhar, descartar só a opção.
   4. Se nenhuma opção produzir stream e alguma tiver falhado, lançar erro agregado com as causas; se todas forem 4K, devolver lista vazia.
3. Qualidade: usar o texto de `quality`; sem ele, omitir e deixar `buildStream` descobrir localmente. Não usar `rank` como substituto, porque o significado não está documentado e o texto já existe.
4. Idioma: `isDub: true` vira `LANGUAGE.DUBBED`. Com `isDub: false`, usar `LANGUAGE.SUBTITLED` quando o stream ou a resposta oferecer legenda `pt` ou `pt-BR`; sem legenda portuguesa, usar `LANGUAGE.NON_PT_BR`. `isDual` não promove a dublado, porque a própria fonte marca a opção como não dublada.
5. `provider` recebe `source` (ex.: `veyra`); `type` recebe `type` da fonte (`hls` ou `mp4`). Se `type` faltar, inferir de `isHls`; se ambos faltarem, omitir.
6. Legendas: usar `stream.subtitles` quando for lista não vazia; senão `response.subtitles`. Resolver a URL contra a origem, exigir HTTP(S), mapear `lang` para um nome legível (`pt-BR` → `Português (Brasil)`, `pt` → `Português`, `en` → `English`, `es` → `Español`, e assim por diante), manter `label` como `name` e deduplicar por URL. Legenda inválida é omitida sem descartar o vídeo; sem legendas válidas, o campo não aparece.
7. Deduplicar streams pela URL resolvida, mantendo a primeira ocorrência. A API costuma listar a opção dublada antes da legendada com a mesma URL; a primeira é a que o site escolhe.
8. Ordenar com `sortByQuality` no ponto de entrada.
9. `format`: `FORMATTER.AUTO`, `addon: 'Kairou'`, `title`, `year` e, em série, `season` e `episode`. Não acrescentar detalhes que a fonte não fornece.

### D6. Fronteira de erro

1. `getStreams` valida a entrada, captura a falha final, registra `console.error('[Kairou] Falha em <tipo> <id>: <causa>')` e devolve `[]`.
2. Funções internas lançam erro com mensagem clara; não devolvem `null` para falha de rede, JSON ou estrutura.
3. A falha de uma opção de mídia é isolada com `console.warn`, preservando as demais. A falha da consulta à API é fatal, porque não há lista parcial.
4. O prefixo de log é `[Kairou]` e o nome do addon é `Kairou`.

### D7. Testes, manifest e documentação

1. `test/fixtures/kairou/` guarda respostas reais sanitizadas: extração de filme, de episódio, ausência, resposta inválida e um caso com 4K/duplicata. As URLs de mídia são substituídas por `cdn.example` e o proxy é mantido como caminho relativo, sem URLs assinadas reais.
2. `test/kairou.test.js` empacota o provedor com `buildProvider` e executa o pacote com `fetch` simulado, cobrindo: filme, episódio, anime, ausência, HTTP 503, JSON inválido, `ok: false`, URL relativa e absoluta, 4K descartado, deduplicação, opção inválida isolada, todas inválidas, legenda PT, ausência de legenda PT, legenda inválida e série sem temporada/episódio.
3. Manifest: `id` `kairou`, nome `Kairou`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `m3u8` e `mp4`, `contentLanguage` `["pt"]` e logo `https://www.kairou.space/assets/kairou-spiral.png`.
4. `providers.md` ganha a linha e a seção `Kairou` com status `🟠 Não verificado` e `—` na data até a rodada online. O perfil é generalista; nenhum `test/online/profiles.json` é alterado.
5. `docs/provider-investigation.md` ganha o método “API de extração de uma SPA de streaming”: como localizar o endpoint no bundle do player, os parâmetros, o contrato da resposta, o proxy de mídia, a ausência e os limites (4K VIP, `fast=1` frio, `alive`/`status` não confiáveis, extensão ausente em HLS proxy).
6. Nenhum bloco novo: `tmdb-info`, `http`, `custom-formatter`, `quality-discovery`, `language-discovery` e `stream-build` cobrem o fluxo.

## Risks / Trade-offs

1. **API não documentada e sem versão** → o parsing valida cada campo e falha com mensagem explícita; fixtures registram o contrato observado.
2. **Primeira consulta lenta (até cerca de 22 s)** → o provedor não impõe timeout; o app gerencia a espera e a rodada online usa 120 s por caso. A latência pode reduzir a taxa de resolução em aparelhos com espera curta.
3. **Dependência do proxy do Kairou para reprodução** → é o caminho que funciona para MP4 bloqueados e para HLS; se o proxy cair, os streams falham. Não há fallback direto confiável.
4. **HLS com URL sem `.m3u8` no caminho** → o provedor informa `type: 'hls'`; versões antigas do NuvioMobile podem não usar o campo e falhar. A limitação é do app, não do contrato.
5. **4K reservado a assinantes** → a opção é descartada; títulos só com 4K devolvem lista vazia. A alternativa de devolver 4K usaria a resposta pública, mas contrariaria a restrição apresentada pelo site.
6. **Deduplicação por URL** → duas opções com a mesma URL e idiomas diferentes viram uma só. A primeira é a dublada na ordem observada; se a fonte inverter a ordem, a classificação pode mudar.
7. **`alive`/`status` não confiáveis** → não são usados para descartar. Um stream marcado como 504 pelo servidor ainda pode reproduzir; um marcado como vivo pode falhar.
8. **Animes sem o addon Pleiades** → o Kairou usa um addon externo para parte dos animes; o provedor entrega somente o que a API do Kairou devolve. A cobertura de anime pode ser menor que a do site.
9. **Idioma sem legenda PT** → a classificação usa `Gringo` quando não há áudio dublado nem legenda portuguesa. É uma decisão conservadora, sem promover o stream a Legendado.

## Migration Plan

1. Criar `src/kairou/index.js` e `src/kairou/extractor.js`, seguindo o contrato de `src/_template/` e os padrões de `src/megaembed/`.
2. Adicionar a entrada no `manifest.json` e rodar `node build.js kairou`.
3. Criar as fixtures sanitizadas e a suíte `test/kairou.test.js`.
4. Adicionar a linha e a seção em `providers.md`.
5. Atualizar `docs/provider-investigation.md` com o método reaproveitável.
6. Rodar `npm run lint`, `npm test` e `node build.js kairou`.
7. Executar `npm run test:online -- --provider kairou` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada; o status inicial é `🟠 Não verificado`.
8. Rollback: remover a entrada do manifest, `src/kairou/`, o teste, as fixtures, os arquivos gerados e a seção de `providers.md`; nenhum dado persistente é migrado.

## Open Questions

1. A primeira rodada online confirmará a taxa de resolução e a latência real do pacote; se muitos casos expirarem, a limitação será registrada em `providers.md` sem mudar o contrato.
2. O conjunto de hosts e a disponibilidade do proxy podem mudar; a triagem de 4K e a deduplicação serão reavaliadas com evidência online.
