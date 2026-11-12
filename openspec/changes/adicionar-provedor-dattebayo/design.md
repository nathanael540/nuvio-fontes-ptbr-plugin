# Design

## Context

Ver `proposal.md` — Why. A fonte é um catálogo PHP próprio (não WordPress) em `https://www.dattebayo-br.com/`, com seções `animes` (legendado), `anime-dublado`, `tokusatsus`, `doramas` e `donghua`. A investigação de 12/11/2026 observou:

1. **Busca.** `GET /busca?busca=<termo>` devolve cartões `.ultimosAnimesHomeItem` com link absoluto, título e contagem de episódios; a paginação é `&page=<n>` com cerca de 17 cartões por página e contêiner `.aniContainer` vazio quando não há resultado.
2. **Ficha.** `/animes/<slug-ou-hash>`, `/anime-dublado/<slug-ou-hash>` e equivalentes nas demais seções. A ficha traz `Tipo` (`Filme` ou `TV`), `Ano`, `Episódios` no formato `disponíveis/total`, `Título Alternativo`, a estação do ano em `Temporada` e os links `tempAnterior`/`tempProxima`. A lista de episódios fica em `/page/<n>`, com cerca de 24 itens por página, e cada item tem `/videos/<id>` e o texto `Episódio NN`.
3. **Player.** `/videos/<id>` tem abas `.Aba` com rótulos `SD`, `HD` e `FULLHD` e `data-target`, além de contêineres `.playerContainer` com `id` equivalente. Cada contêiner publica `var vid = '<url>.mp4'` em um host Cloudflare R2. Em amostras, a página sempre trouxe três `vid`, mas as abas refletem o que está disponível: episódios antigos mostram só `SD` e `HD`, e o terceiro `vid` sem aba pode responder 404.
4. **Assinatura.** A URL do R2 sem query responde 400. O player da fonte chama `GET https://ads.animeyabu.net?token=<token>&url=<url-do-vid>` com cabeçalhos de navegador e recebe um JSON de lista com `publicidade`, uma query AWS4 pré-assinada válida por 3600 segundos. A chamada funciona sem conta, chave ou cookie, e a URL assinada responde 206 `video/mp4` mesmo sem cabeçalhos de reprodução.
5. **Descartes.** O `contentURL` `arft.casa2.online` está quebrado (HTTPS falha, HTTP responde 404) e o vídeo `anitube.vip` do caminho de fallback é um clipe de aproximadamente 200 KB, não o episódio. Nenhum dos dois serve como mídia.

O runtime do app e o contrato de streams estão em `docs/arch.md`; a fonte não aceita TMDB nem IMDb, então a identidade depende do TMDB e de busca textual.

## Goals / Non-Goals

**Goals:**

1. Resolver filme e série do TMDB para a ficha correta, com tipo, ano e temporada confirmados.
2. Entregar MP4 nas opções de qualidade que a própria página oferece, com o idioma da seção.
3. Isolar falha de opção de player e não devolver stream parcial de etapa anterior.
4. Cobrir o fluxo com testes Node offline e com uma rodada online do pacote final.
5. Manter o custo de rede proporcional ao pedido, sem varrer o catálogo inteiro nem reproduzir anúncios.

**Non-Goals:**

1. Baixar mídia, remover anúncios do site, contornar DRM ou manter assinatura viva além da requisição.
2. Garantir cobertura de todas as entradas do catálogo ou de temporadas que o mapeamento não consiga provar.
3. Corrigir a paginação ou a numeração irregular da fonte.
4. Criar bloco de player específico do Dattebayo; o player é local ao provedor.
5. Alterar `docs/arch.md`: nenhuma regra global muda.

## Decisions

### 1. Identidade e manifest

O provedor entra como `dattebayo`, nome `Dattebayo BR`, versão `1.0.0`, `supportedTypes` `["movie", "tv"]`, `formats` `["mp4"]`, `contentLanguage` `["pt"]` e logo de favicon do domínio. Todas as seções do catálogo são aceitas, não só `animes`: o mesmo acervo publica tokusatsu, dorama e donghua em PT-BR, e separar provedores por seção duplicaria streams do mesmo título. O idioma é `Dublado` quando a entrada está em `/anime-dublado/` ou o título termina em `- Dublado`; sem essas evidências, é `Legendado`. O sufixo cobre eventual entrada dublada publicada fora da seção de dublados.

Alternativa descartada: um provedor só de animes. Perderia tokusatsu e dorama que a fonte publica com o mesmo contrato e não reduziria risco de parsing.

### 2. Busca e confirmação de identidade

O fluxo usa `getMediaInfo` e tenta, nesta ordem, `title`, `originalTitle` e no máximo dois `alternativeTitles`, com `fetchText` e perfil `page`. A busca é montada com `URLSearchParams` e codificação de texto, sem `searchParams.set` no `URL` (o polyfill do app não atualiza `href`). O parsing usa a API básica do cheerio: `.aniContainer` como contêiner obrigatório, `.ultimosAnimesHomeItem` para os cartões, `a` para link e título, e a contagem de episódios para triagem.

Cada candidato guarda `{ title, url, section, language }`, com `url` resolvida contra a origem (os cartões misturam link absoluto e relativo). O sufixo `- Dublado` é removido do título apenas para comparação. `findBestMatch` recebe `year: null`, porque o cartão de busca não traz ano; o ano do TMDB é aplicado na confirmação da ficha. A ficha confirma `Tipo` (`Filme` para filme, `TV` para série) e o ano: em filme, o ano do lançamento; em série, o ano da ficha base, com tolerância de um ano. Se a ficha não confirmar, o candidato é removido da lista e a escolha é refeita com o restante.

A busca lê a página 1 e, quando necessário, até três páginas por termo. O limite existe porque a busca do site é por palavras e o título exato pode ficar atrás de variantes, mas não se justifica varrer o catálogo inteiro. Página sem `.aniContainer` é erro de layout, não ausência; contêiner vazio é ausência.

Alternativas descartadas: busca por IMDb (a fonte não aceita identificador) e montagem de slug (a fonte mistura slug e hash e devolve a home com HTTP 200 para caminho desconhecido).

### 3. Família de TV, temporada e episódio

A família de um título é o conjunto de fichas `TV` cujo título normalizado, limpo do sufixo `- Dublado`, é o título do TMDB que melhor corresponde ao candidato (título, original ou alternativo) ou tem, depois dele, apenas um marcador de temporada reconhecido (`Season N`, `Nth Season`, sufixo numérico, `Part N` ou `Final Season`). Sequências com outro texto (`Z`, `Super`, `Shippuden`, `Movie`) ficam fora. A ficha base é a que não tem marcador de temporada. Cada ficha da família é lida para obter o título canônico (`h1`), ano, `Episódios`, links de temporada anterior/próxima e a primeira página de episódios; o conjunto é limitado a 12 fichas por execução e o título canônico substitui o título do cartão no mapeamento.

O marcador de temporada é lido do título, nesta ordem:

1. sem marcador → temporada 1;
2. `Season N`, `Nth Season` ou sufixo numérico logo após o título base → temporada N;
3. `Part N` com temporada explícita → a mesma temporada; sem temporada explícita → a temporada da ficha anterior na cadeia;
4. `Final Season` → a última temporada de `media.seasons` do TMDB; sem esse dado, a temporada anterior na cadeia mais um.

`OVA`, `ONA`, `Especial` e `Filme` não entram no mapeamento de temporada. A ordem das partes vem de `tempAnterior`/`tempProxima`, seguidos somente dentro da mesma seção de idioma; link para outra seção é ignorado e a ordem cai para o ano da ficha.

Para a temporada S:

1. se a ficha base for a única entrada e a quantidade disponível cobrir o total de episódios do TMDB, usa-se numeração absoluta: `episódio absoluto = soma dos episódios das temporadas 1..S-1 + episódio`;
2. se houver fichas mapeadas para S, elas são ordenadas pela cadeia e os episódios são distribuídos em faixas contínuas pela quantidade disponível de cada parte;
3. se nenhuma ficha confirmar S, ou se duas fichas independentes disputarem S sem relação de parte, o pedido termina em lista vazia.

A temporada 0 de especiais não entra na soma absoluta. A quantidade usada é a parte disponível de `Episódios` (`disponíveis/total`), não a quantidade de itens da página, porque a listagem pode incluir `Episódio 00` e itens fora de ordem. O episódio 0 nunca atende pedido positivo.

Essa escolha cobre três formatos observados: temporada 1 na ficha base (`Naruto`), temporada explícita (`Boku no Hero Academia 2`, `Shingeki no Kyojin Season 2`) e parte final (`Shingeki no Kyojin: The Final Season` + `Part 2`). A cadeia de Shingeki tem seis fichas para quatro temporadas do TMDB; seguir a cadeia S-1 vezes escolheria `Season 3 Part 2` para a temporada 4, por isso o mapeamento é por marcador e por partes, não por posição.

Alternativas descartadas:

1. Seguir `tempProxima` S-1 vezes: erra em cadeias com partes e em séries com temporadas extras.
2. Usar o nome da temporada do TMDB: o nome em pt-BR é genérico (`Temporada 2`) e não corresponde ao título da fonte.
3. Aceitar a primeira ficha parecida: pode entregar a temporada errada, o que é pior que a ausência.

### 4. Dados de temporada do TMDB

O bloco `tmdb-info` passa a expor `seasons`, lido da mesma resposta de `/tv/{id}`: `number`, `episodeCount`, `name` e `airDate`, com a temporada 0 preservada na lista para quem quiser distingui-la. Nenhuma requisição nova é feita; o campo já vem na resposta padrão do TMDB. O provedor ignora a temporada 0 na soma e usa `seasons` para reconhecer `Final Season` e validar a numeração absoluta.

Alternativas descartadas: chamar o TMDB diretamente no provedor (duplicaria leitura de `TMDB_API_KEY` e URL, já centralizadas no bloco) e limitar o provedor à temporada 1 (perderia a maior parte do acervo de anime).

O bloco continua sem dependências novas. O teste de `tmdb-info` passa a conferir `seasons` e a ausência do campo quando o TMDB não a devolver.

### 5. Seleção do episódio e paginação da ficha

O número vem de `Episódio NN` dentro do cartão, não do título (`Ep 1`, `ep 1`, `Episódio 1` variam). A comparação é exata. A paginação da ficha usa `/page/<n>`; a primeira página é sempre lida. Para reduzir requisições em séries longas, a página estimada é `max(1, ceil(episódio / 24))`; a estimativa e as páginas vizinhas são conferidas e, se o episódio não estiver nelas, a leitura continua em ordem a partir da página 1 até o fim. A estimativa não substitui a verificação: a página 1 de `Naruto` tinha um `Episódio 200` fora de ordem, então uma faixa fixa de páginas não é prova.

Episódio não encontrado depois da última página é ausência. Ficha sem `Tipo` ou sem lista de episódios é erro de layout; em filme, `Ano` ausente também é erro.

Alternativa descartada: montar a URL do episódio por fórmula. A fonte não expõe rota por número; só a listagem da ficha.

### 6. Player, assinatura e montagem dos streams

As abas são a lista de opções: cada `.Aba` tem `data-target` e rótulo; o contêiner `.playerContainer` de mesmo `id` contém o `var vid`. Só entra opção com aba correspondente. Se não houver nenhuma aba, a página é tratada como layout inesperado, não como ausência.

Para cada opção:

1. `GET https://ads.animeyabu.net?token=&url=<vid codificado>` com perfil `page` e `Referer` da página do vídeo;
2. ler o JSON de lista e exigir `publicidade` como texto que começa com `?`;
3. anexar a query ao `vid`;
4. montar o stream com `buildStream`, `format` (`FORMATTER.AUTO`, `addon` `Dattebayo BR`, título, ano e, em série, temporada e episódio), `quality` pelo rótulo (`SD`→480p, `HD`→720p, `FULLHD`→1080p), `language` da seção, `type` `mp4` e a URL assinada.

Não há sonda de mídia na primeira versão: a aba é o sinal de disponibilidade da própria fonte e o serviço de assinatura valida a URL. Uma aba quebrada vira stream morto; se isso for observado, uma mudança posterior pode acrescentar sonda com `Range` mínima. Não se usa `HEAD` nem `GET` sem `Range`. Cabeçalhos de reprodução não são necessários: a URL assinada respondeu 206 sem eles; tamanho e legendas externas não aparecem na página e não são inventados.

Cada opção é resolvida isoladamente. Falha de assinatura, JSON inválido ou `publicidade` ausente gera `console.warn('[Dattebayo BR] Opção <rótulo> descartada: <causa>')` e só descarta aquela opção. Se todas falharem, o erro sobe com a causa de cada uma. A URL assinada nunca entra em log, fixture ou relatório; mensagens usam o rótulo e a página do vídeo. O provedor não executa scripts de anúncio nem altera a página: usa somente a assinatura pública do mesmo arquivo que a página anuncia.

Alternativas descartadas:

1. Usar o `contentURL` `arft.casa2.online`: HTTPS não completa e HTTP responde 404.
2. Usar o vídeo `anitube.vip` do fallback: é um clipe de propaganda, não o episódio.
3. Tentar o `POST` de anúncio antes da assinatura: sem o script de anúncio ele responde `BLOQUEADO` e o player cairia no clipe de fallback; a assinatura pública é a parte que entrega o arquivo pedido.
4. Guardar a assinatura em cache: expira em 3600 segundos e é específica da URL; cachear criaria stream inválido sem aviso.

### 7. Erros, ausência e logs

`getStreams` é a única fronteira de captura: registra `console.error('[Dattebayo BR] Falha em <tipo> <id>: <causa>')` e devolve `[]`. Dentro do provedor, busca, ficha, temporada e player lançam erro. Ausência reconhecida — busca vazia, nenhum candidato confirmado, temporada não mapeada, episódio ausente — devolve `[]` sem erro. Uma etapa fatal nunca devolve os streams parciais das etapas anteriores.

O provedor não implementa timeout próprio, conforme `docs/arch.md`. A fonte fica atrás de Cloudflare; o perfil `page` com User-Agent de navegador é o mesmo já usado nos outros provedores. HTML de desafio não é confundido com ausência: a falta do contêiner esperado lança erro.

### 8. Testes e fixtures

O teste do provedor empacota `src/dattebayo/` com `buildProvider`, nos formatos publicados, e simula `fetch` por URL. As fixtures ficam em `test/fixtures/dattebayo/` e são sanitizadas: host de mídia trocado por `media.exemplo.test`, IDs de vídeo fictícios e query de assinatura substituída por `?assinatura=...`; nenhuma URL assinada real é guardada.

Casos previstos:

1. filme legendado;
2. filme dublado, com idioma `Dublado`;
3. série, temporada 1, episódio 1, com opções SD/HD/FULLHD;
4. episódio em página posterior da ficha;
5. temporada 2 explícita;
6. parte final, episódio 17 caindo na segunda parte;
7. série longa em entrada única, temporada 2 episódio 1 convertido para absoluto;
8. ausência por busca vazia;
9. ausência por temporada não mapeada;
10. descarte de candidato com tipo ou ano incompatível;
11. falha de assinatura em uma opção, preservando as demais;
12. falha de todas as opções, com erro;
13. layout de busca, ficha ou player alterado, com erro;
14. episódio 0 não atendendo ao pedido de episódio 1.

O teste de bloco de `tmdb-info` cobre `seasons` presente, ausente e com temporada 0. O teste de catálogo de blocos continua exigindo uma suíte por bloco.

### 9. Documentação e status

`providers.md` ganha a linha e a seção do `dattebayo` com `🟠 Não verificado` até a rodada online do pacote final; depois da rodada, o status segue `docs/tests.md`, seção 7. `docs/provider-investigation.md` ganha a variação de assinatura pública de mídia, com contrato observado, limites de validade e distinção entre método em uso e hipótese. `src/_blocks/index.md` atualiza a linha de `tmdb-info` com as temporadas. `docs/arch.md` não muda.

## Risks / Trade-offs

1. **Serviço de assinatura de terceiro** → o endpoint pode mudar, limitar por IP ou ficar indisponível; a opção falha e o erro sobe se todas falharem. Mitigação: teste com falha por opção, mensagem clara e nenhum fallback para clipe de propaganda.
2. **Assinatura de uma hora** → quem iniciar a reprodução depois de uma hora recebe 403; o provedor não pode renovar uma URL já entregue. Mitigação: documentar o limite; o app inicia a reprodução logo após a resolução.
3. **Mapeamento de temporada heurístico** → séries com partes, especiais ou numeração divergente do TMDB podem cair em ausência. Mitigação: contagens disponíveis, cadeia de temporadas, episódio exato e ausência em vez de temporada errada; casos offline cobrem os formatos observados.
4. **Paginação irregular da ficha** → itens fora de ordem e páginas com quantidade variável. Mitigação: estimativa com vizinhança e leitura sequencial de fallback; o número exibido é a fonte de verdade.
5. **Layout PHP próprio** → qualquer mudança derruba os seletores. Mitigação: parsers estritos que lançam erro em vez de devolver lista vazia, fixtures reais e rodada online após o build.
6. **Cloudflare** → desafio ou bloqueio pode interromper a busca. Mitigação: perfil `page`, erro explícito e nenhuma conclusão de ausência a partir de HTML de desafio.
7. **Duplicidade dublado/legendado** → a mesma obra aparece duas vezes no catálogo. Mitigação: idiomas distintos por seção e deduplicação por URL de vídeo antes de montar os streams.
8. **Séries longas** → a estimativa de página pode exigir várias requisições. Mitigação: estimativa, vizinhança e parada na primeira correspondência; o app controla a espera.
9. **Mudança em `tmdb-info`** → o `deepEqual` existente precisa ser atualizado e o bloco entra no pacote dos provedores que o importam. Mitigação: campo adicional, sem remover nem renomear os atuais; build completo, suíte do bloco e suítes de todos os provedores afetados.
10. **Direitos autorais** → o provedor só localiza URLs públicas da fonte; não hospeda mídia. Nenhum código externo é reaproveitado; os parsers são locais.

## Migration Plan

1. Estender `src/_blocks/tmdb-info/index.mjs` com `seasons`, atualizar JSDoc, `src/_blocks/index.md` e a suíte do bloco.
2. Criar `src/dattebayo/` com entrada, catálogo/temporadas e player, usando apenas blocos existentes e a API básica do cheerio.
3. Acrescentar a entrada `dattebayo` em `manifest.json` na versão `1.0.0`.
4. Criar fixtures sanitizadas e `test/dattebayo.test.js` com os casos da seção 8.
5. Rodar `npm run lint`, `npm test` e `npm run build`; o build completo reconstrói o `dattebayo` e os provedores que importam `tmdb-info`, além dos manifests de formato. Conferir os três formatos do provedor novo e a ausência de edição manual em `providers/`, `gdrive/` e `prism/`.
6. Rodar `npm run test:online -- --provider dattebayo` com `TMDB_API_KEY` somente do ambiente e atualizar `providers.md` com a rodada real.
7. Atualizar `docs/provider-investigation.md` e `providers.md` na mesma mudança.
8. Rollback: remover a entrada do manifest e a pasta `src/dattebayo/`, reconstruir os formatos e reverter a documentação; não há dados persistidos, migração nem estado de servidor.
