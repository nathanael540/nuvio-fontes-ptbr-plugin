# Proposal

## Why

O VenoPlay é um catálogo generalista em PT-BR de filmes e séries que nenhum provedor deste repositório cobre. A fonte publica a busca por título, o `get_players` com os rótulos `Dublado`/`Legendado` e o player `mgeb` por ID do TMDB; a checagem de 2026-11-18 confirmou o fluxo completo em filme e série.

CineGratis e VisionCine são catálogos DLE em PT-BR servidos pelo mesmo player BrStream do CineAgora. A checagem de 2026-11-18 encontrou o mesmo `video_slug`, o mesmo `id`, o mesmo `uid` e o mesmo `md5` do CineAgora em Clube da Luta e em Breaking Bad S01E01, então os três sites são a mesma rede e devem entrar como catálogos de um único provedor, não como provedores separados.

## What Changes

1. Adicionar o provedor `venoplay`, com `movie` e `tv`, em `src/venoplay/`, registrado no `manifest.json` como versão `1.0.0` e formatos `["m3u8"]`.
2. Resolver a semente `https://www2.venoplay.com` a cada chamada, usar o host final (`w2.venoplay.site`) para busca, página e API, e não guardar cache do domínio.
3. Buscar pelo título PT-BR e pelo original do TMDB em `/busca?q=<termo>`, confirmar o cartão pelo título exato e pelo tipo (`Filme`/`Série`), abrir a página do título e confirmar o ano pelo JSON-LD ou pelo `datePublished` embutido quando o JSON-LD vier vazio; o prefixo `filme-`/`serie-` da URL não é prova de tipo.
4. Extrair o `mediaId` da página e consultar `GET /api/get_players?id=<id>&season_number=<s>&episode_number=<e>&site_id=4`; cada item `players` traz o rótulo de idioma e a URL do player.
5. Resolver o player `Dublado` em `mgeb.space`/`mgeb.lat`: ler `var sources`, manter somente HLS `.m3u8` de `mgeb.space` ou `mgeb.lat`, rejeitar `workers.dev`, URL com userinfo ou parâmetro `username`, `token` ou `password`, e descartar o `Legendado` `nhdapi.com` por triagem enquanto o host não responder.
6. Montar os streams com `buildStream` e `format` (`addon` `VenoPlay`, `provider` do host, `type` `hls`, idioma pelo rótulo do player, qualidade `Desconhecida` sem sonda), sem `name`/`title`.
7. Ampliar o CineAgora com os catálogos `cinegratis` e `visioncine`: configuração por catálogo (base, hosts, seções, busca, cabeçalhos de página, seletores de resultado e de espelho), busca por IMDb e fallback por título, confirmação de título/ano/IMDb quando publicado, CineGratis em `cinegratis.co` com o `.tv` aceito como host, triagem de resultado sem ano e de busca vazia sem marcador DLE, `Referer` obrigatório nas páginas do VisionCine e isolamento de falha por catálogo.
8. Unir os resultados dos três catálogos e deduplicar pelo `uid`+`md5`+`id` do BrStream; o mesmo arquivo encontrado em mais de um catálogo aparece uma vez e mantém o rótulo do primeiro catálogo confirmado.
9. Cobrir com testes Node e fixtures reais sanitizadas: VenoPlay com filme e série, título ausente, tipo divergente, `get_players` vazio, player sem `sources`, fonte HLS válida, fonte com credencial e fonte de worker; CineAgora com os três catálogos, candidato confirmado, ambiguidade por catálogo, catálogo fora do ar, espelho com rótulo e deduplicação.
10. Atualizar `providers.md` (nova linha e seção do VenoPlay; seção e versão do CineAgora), `docs/provider-investigation.md` (busca com `get_players` e catálogo DLE multi-site com player compartilhado) e o `manifest.json` somente com a entrada nova do VenoPlay e a versão/descrição atualizada do CineAgora.
11. Fora do escopo: `nhdapi.com`, o fluxo direto `mgeb.lat/embed/<tmdb>` sem a busca da VenoPlay, os demais catálogos do levantamento de concorrentes (Peachify, AniStream, Donghua no Sekai, PiFansubs), o resolvedor Byse API v2, o Blogger `batchexecute`, settings, captcha, timeout próprio, sonda de mídia e qualquer alteração no contrato do player BrStream.

## Capabilities

### New Capabilities

- `venoplay-provider`: busca e confirmação do título na VenoPlay, leitura do `get_players` por ID interno e resolução do player `mgeb` em streams HLS dublados.

### Modified Capabilities

- `cineagora-catalog`: o provedor passa a pesquisar três catálogos DLE, confirmar identidade com as regras de cada site e unir os resultados sem duplicar o mesmo arquivo BrStream.
- `cineagora-player`: a descoberta dos espelhos passa a aceitar as três marcações publicadas pelos catálogos e a ignorar elementos sem `data-link` ou fora do BrStream, sem mudar o contrato de resolução do player.

## Impact

1. Código: `src/venoplay/` (novo), `src/cineagora/catalogs.js` (novo registro dos três catálogos), `src/cineagora/catalog.js` (busca e identidade), `src/cineagora/player.js` (seletores de espelho), `src/cineagora/index.js` (união e deduplicação), `test/venoplay.test.js`, `test/cineagora.test.js` e fixtures em `test/fixtures/venoplay/` e `test/fixtures/cineagora/`.
2. Configuração: `manifest.json` (nova entrada `venoplay`; versão e descrição do `cineagora`) e `providers.md`.
3. Documentação: `docs/provider-investigation.md`; sem mudança em `docs/arch.md` nem em `src/_blocks/index.md`, porque nenhum bloco novo é criado.
4. Saída gerada: `providers/venoplay.js`, `providers/cineagora.js`, os dois formatos e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; o fluxo usa `tmdb-info`, `title-match`, `http`, `script-extract`, `stream-build`, `custom-formatter`, `language-discovery`, `quality-discovery` e `slugify` no empacotamento.
6. Referência de implementação: repositório Ivadz (GPL-3.0) para o fluxo VenoPlay e para os catálogos DLE; o código é uma reimplementação com os blocos locais, sem copiar chave, token, cookie ou URL de mídia. O player BrStream já é local e GPL-3.0.
7. Limite conhecido: o `Legendado` da VenoPlay aponta para `nhdapi.com`, que recusou conexão em 2026-11-18; o provedor entrega somente o `Dublado` até nova evidência. A cobertura de títulos da VenoPlay depende do acervo do site e do player `mgeb`; o filme observado não publicou HLS em `mgeb.space`/`mgeb.lat`. O CineGratis também pode responder com gateway anti-bot, que o provedor não contorna e isola por catálogo.
