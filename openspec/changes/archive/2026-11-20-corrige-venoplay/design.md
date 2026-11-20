# Design

## Context

1. A rodada `2026-11-20T13-21-31-526Z-venoplay-20261120-cc44`, registrada em `providers.md` e em `test/artifacts/online/2026-11-20T13-21-31-526Z-venoplay-20261120-cc44/result.json`, avaliou o pacote 1.0.0 no manifest `prism/all/all/all`, perfil `generalista`, semente `20261120`, catálogos `movie@2026-11-12.1` e `tv@2026-11-12.1`. Resultado: `Parcial`, movie 0/5 e tv 2/5, com duas falhas e seis casos sem resolução.
2. O SHA-256 calculado localmente para `prism/providers/venoplay.js` é `cf61f727…a8126`, igual ao `packageHash` do `result.json`. A rodada usou o código publicado atual, não um pacote antigo. As rodadas de 18/11/2026 usaram outro hash: a primeira registrou dez falhas por JSON-LD ausente e a seguinte já não teve essa falha, após o fallback por `h1`/`datePublished`. As falhas de 20/11 não são regressão desse fallback.
3. As duas falhas (`movie` 1398725, Swallowed Star, e `tv` 76572, Douluo Dalu) têm a mesma mensagem: `Busca sem cartões nem mensagem explícita de ausência`. A reexecução do mesmo pacote contra a fonte, em 20/11/2026, recebeu 200 nas buscas dos dois títulos, sem `div.poster-card` e com a mensagem `Nenhum resultado encontrado`; o provedor só reconhece `site search yielded no results`. A falha é ausência localizada não reconhecida, não ausência de acervo.
4. Em uma sondagem separada de 20/11/2026, Douluo Dalu recebeu HTTP 522 do edge da Cloudflare; uma nova sondagem retornou 200 com a mesma página de `Nenhum resultado encontrado`. O 522 é uma falha externa e intermitente que pode voltar a ocorrer, mas não é a causa reproduzível da falha da rodada: a mensagem registrada foi de busca sem cartões, não de HTTP.
5. Os seis `Sem resultado` não são ausência de catálogo. A execução do mesmo pacote encontrou a página exata de cada título, confirmou tipo e ano, consultou o `get_players` e abriu o player `mgeb`; o que faltou foi fonte HLS aceita pelo filtro atual. O detalhe por título:
   1. Pantera Negra (284054): página com `Movie` 2018 e `mediaId` 2397; `players` com `Dublado` e `Legendado`; o `Dublado` publicou 2 MP4 com `username`/`token`, 1 HLS `.php` em `mgeb.space` e 1 HLS `.php` em `workers.dev`. A regra atual aceita 0; a regra com `.php` no host aprovado aceita 1. O HLS `.php` de `mgeb.space` respondeu 200 `application/vnd.apple.mpegurl`, com playlist mestra, uma variante e 4 segmentos `#EXTINF`, todos no mesmo host. A URL de mídia não é registrada neste documento.
   2. O Senhor dos Anéis: A Sociedade do Anel (120): página com `Movie` 2001 e `mediaId` 1419; o `Dublado` publicou MP4 com credencial, HLS `.m3u8` em `strm15.uqload.vc` com parâmetros `t,s,e,v,i,sp` e HLS `.php` em `workers.dev`. A regra atual aceita 0. A playlist de `uqload.vc` respondeu 200 `#EXTM3U`, mas a variante repetiu a mestra e não trouxe segmentos; não há cadeia utilizável comprovada. O host não está na lista aprovada.
   3. Avatar: O Caminho da Água (76600): página com `Movie` 2022 e `mediaId` 2641; o `Dublado` publicou MP4 com credencial e HLS `.php` em `workers.dev`; 0 fontes aceitas.
   4. A Lenda da Serpente (573699): página com `Movie` 2019 e `mediaId` 7337; o `Dublado` publicou MP4 com credencial e HLS `.php` em `workers.dev`; 0 fontes aceitas.
   5. The Mandalorian (82856): página com `TVSeries` 2019 e `mediaId` 9397; o `Dublado` publicou MP4 com credencial e HLS `.php` em `workers.dev`; 0 fontes aceitas.
   6. Round 6 (93405): página com `TVSeries` 2021 e `mediaId` 1856; o `Dublado` publicou HLS `.php` em `workers.dev` e MP4 com credencial; 0 fontes aceitas.
6. Os positivos continuam funcionando. Grey's Anatomy (1416, `mediaId` 458) publicou duas fontes HLS `.m3u8` em `mgeb.space` e devolveu 2 streams; Breaking Bad (1396, `mediaId` 650) publicou uma fonte HLS `.m3u8` em `mgeb.space` e devolveu 1 stream. Na revalidação pontual, Os Vingadores (24428) e Friends (1668) também resolveram por `mgeb.space`. Isso mostra que busca, confirmação, `get_players` e o caminho `.m3u8` estão intactos.
7. O classificador online chama de `Sem resultado` qualquer `getStreams` que devolva lista vazia sem erro. Ele não distingue "título fora do catálogo" de "título encontrado sem fonte aceita". A execução direta do pacote é o que separa os dois casos; o provedor não comunica o motivo porque ausência reconhecida é silenciosa por contrato.
8. O `Legendado` de todos os títulos é `nhdapi.com`, host de triagem sem requisição. O MP4 com `username`/`token` de `fontedecanais` é rejeitado por credencial. O HLS de `workers.dev` é rejeitado pela spec. Essas três classes não entram nesta correção.
9. **Classificação.** As duas falhas são lacuna determinística do reconhecimento de ausência, não regressão dos positivos. Pantera Negra é lacuna de parser para o endpoint `.php` no host já aprovado, não regressão do caminho `.m3u8`. Os outros cinco são ausência de fonte aceita sob o contrato, ou seja, cobertura, não falha do provedor. O 522 é falha externa e intermitente. Os dois positivos da rodada e Os Vingadores/Friends são a linha de base preservada.
10. **Código, testes e spec.** `src/venoplay/site.js` usa `NO_RESULTS = /site search yielded no results/i` e lança quando não há cartões; `src/venoplay/player.js` usa `HLS_PATH = /\.m3u8$/i`. Os 30 testes offline passam, mas não têm fixture para a mensagem localizada nem para `.php`. A spec `venoplay-provider` exige `.m3u8` e não descreve a ausência localizada. As duas lacunas estão no código e na cobertura, não no acervo.

## Goals / Non-Goals

**Goals:**

1. Reconhecer a ausência localizada da busca sem transformar página desconhecida em ausência.
2. Aceitar o HLS `.php` comprovado no host `mgeb` já aprovado, preservando todas as rejeições atuais.
3. Manter os positivos e o contrato dos streams; cobrir a mudança com testes offline e fixtures sanitizadas.
4. Deixar critérios de revalidação online repetíveis com a mesma semente e os mesmos catálogos.

**Non-Goals:**

1. Aceitar `workers.dev`, MP4 com `username`/`token`, `uqload.vc` ou qualquer host novo.
2. Adicionar retry, timeout próprio ou tratamento especial para 522; o app gerencia a espera.
3. Alterar o classificador online, o status em `providers.md` ou o contrato do app nesta change.
4. Provar reprodução no aparelho, qualidade ou disponibilidade de mídia; a rodada online valida o contrato, não o vídeo.
5. Implementar agora: esta change é só proposta, design e tarefas.

## Decisions

### D1. Ausência localizada com marcador explícito

Quando a busca não tiver cartões, o provedor SHALL reconhecer a mensagem `Nenhum resultado encontrado` da aba "Todos" e devolver lista vazia. A mensagem em inglês continua aceita. Página sem cartões e sem marcador continua erro de estrutura. Mensagem de categoria vazia (`Nenhum anime encontrado`, por exemplo) só é avaliada quando não há cartões; com cartões, os cartões são processados normalmente.

Alternativas consideradas:

1. **Tratar qualquer 200 sem cartões como ausência.** Descartada: mascararia mudança de layout, página de desafio ou HTML parcial.
2. **Normalizar o corpo inteiro e procurar "nenhum resultado".** Descartada: a página tem CSS e scripts; o marcador está em um `h3` da aba de resultados. Uma expressão pequena e específica é suficiente e não depende de normalização do corpo inteiro.
3. **Aceitar apenas a mensagem em português.** Descartada: a mensagem em inglês já existia e pode voltar; as duas são marcadores explícitos.

### D2. HLS `.php` somente no host `mgeb` aprovado

A verificação de caminho passa a aceitar `.m3u8` ou `.php` para fonte `type: hls` em `mgeb.space`/`mgeb.lat`. O host, o tipo declarado, o HTTPS, a ausência de userinfo e a ausência de `username`/`token`/`password` continuam obrigatórios. `workers.dev`, hosts fora da lista e caminhos diferentes de `.m3u8`/`.php` continuam triagem. O endpoint `.php` observado foi validado como playlist mestra e de mídia no mesmo host; a URL não é registrada.

Alternativas consideradas:

1. **Baixar a URL e conferir `#EXTM3U` antes de montar o stream.** Descartada: adiciona requisição e latência por stream, e o app já busca a playlist. O host e o tipo declarado são as provas disponíveis.
2. **Remover a exigência de extensão.** Descartada: aceitaria caminho arbitrário no host aprovado, inclusive HTML ou JSON.
3. **Incluir `uqload.vc`.** Descartada por ora: é host novo, a playlist mestra não levou a uma cadeia com segmentos e a lista aprovada não deve crescer sem prova de mídia.
4. **Aceitar `workers.dev`.** Descartada: a spec rejeita o host e ele é o único HLS de quatro títulos; mudar isso é uma decisão de confiança separada, não uma correção de parser.

### D3. Preservar os positivos e as rejeições

Os cenários existentes de `.m3u8`, credencial, worker, `nhdapi.com`, player sem `sources`, `sources` vazio, falha de host e isolamento de opções permanecem. A mudança de `.php` não pode alterar a saída de Grey's Anatomy e Breaking Bad, nem duplicar streams. O teste do `.php` de `workers.dev` garante que a rejeição continua sendo por host, não por extensão.

### D4. Revalidação online comparável

A implementação futura deve rodar `npm run build:min` e `npm run test:online -- --provider venoplay --seed 20261120` com `TMDB_API_KEY` apenas no ambiente, sem `--record` na primeira execução. A mesma semente e os mesmos catálogos repetem os dez títulos da rodada de 20/11. Critérios:

1. Swallowed Star (1398725) e Douluo Dalu (76572) devem sair como `Sem resultado`, sem `console.error`; não podem repetir `Falha` por "Busca sem cartões".
2. Pantera Negra (284054) deve sair como `Resolvido`, com pelo menos um HLS em `mgeb.space`.
3. Grey's Anatomy (1416) e Breaking Bad (1396) devem continuar `Resolvido`.
4. Os outros cinco títulos podem continuar `Sem resultado` por falta de fonte aceita; isso é limite de cobertura, não regressão.
5. Se a rodada falhar por 522, timeout ou preparação, ela é externa/inconclusiva; repetir sem sobrescrever o relatório anterior e registrar o motivo saneado.
6. Com pelo menos um filme e uma série resolvidos, o status passa a `Estável` segundo `docs/tests.md`; sem Pantera, o status real continua `Parcial`. A atualização de `providers.md` só ocorre depois da rodada do pacote novo, na change de implementação.

O relatório novo recebe ID próprio; o artefato de 20/11 não é sobrescrito. O hash do pacote novo invalida a evidência antiga para fins de status.

### D5. Higiene da evidência

O design registra host, tipo, status HTTP e marcadores estruturais, não URLs de mídia, URLs assinadas, tokens, cookies ou a chave do TMDB. As URLs do endpoint `.php` e do `uqload.vc` são omitidas. A chave usada nas sondagens veio do ambiente e não é registrada.

## Risks / Trade-offs

1. O endpoint `.php` pode mudar ou deixar de devolver playlist → a fonte vira ausência, não stream inventado; o teste com fixture `.php` preserva o formato e uma change futura pode removê-lo se a fonte mudar.
2. A mensagem localizada pode aparecer em página com resultados carregados por JavaScript → a fonte é server-rendered; o teste exige zero cartões e o marcador da aba "Todos". Se a fonte migrar para renderização no cliente, o método precisa ser revisto.
3. O 522 da Cloudflare pode voltar → não há retry próprio; a rodada registra `Falha`/`Inconclusivo` e o motivo HTTP, sem converter em ausência.
4. O classificador online continua chamando de `Sem resultado` o título encontrado sem fonte aceita → a execução direta documenta a diferença; um aviso de diagnóstico no provedor poderia ajudar no futuro, mas mudaria o contrato de ausência e fica fora desta change.
5. O `.php` pode aceitar um endpoint que não seja HLS → o host já é aprovado e o tipo declarado é `hls`; se a reprodução falhar, o app não toca o stream. A alternativa de validar a playlist no provedor adiciona requisição e latência.
6. O status pode subir de `Parcial` para `Estável` após a correção → não atualizar antes da rodada online do pacote novo; a evidência antiga não vale para o pacote novo.

## Migration Plan

1. Implementar o reconhecimento da ausência localizada e a aceitação de `.php` no host aprovado; adicionar fixtures e testes.
2. Executar `npm run lint`, `node --test test/venoplay.test.js`, `node build.js venoplay` e `npm test`.
3. Executar `npm run build:min` e a rodada online com a semente `20261120`, sem `--record`; revisar os dez casos.
4. Se os critérios passarem, repetir com `--record` e atualizar `providers.md` na change de implementação. Se não passarem, manter o status real e registrar o motivo.
5. Rollback: reverter as duas mudanças de parser e os testes; os pacotes são reconstruídos. Não há estado persistido, cache ou migração de dados.

## Validation

1. **Offline.** Busca em português sem cartões devolve `[]` sem erro; busca em inglês continua devolvendo `[]`; busca sem cartões e sem marcador continua erro de estrutura; página com cartões e mensagem de categoria vazia processa os cartões. Fonte `.php` em `mgeb.space` gera stream; `.m3u8` continua gerando; `.php` em `workers.dev`, URL com `token`/`username`, host fora da lista e caminho não comprovado são descartados. Grey's Anatomy e Breaking Bad mantêm a saída; deduplicação e isolamento de opções continuam cobertos; logs não contêm URL, token, `username` ou hash.
2. **Online.** A rodada com `--seed 20261120` deve reproduzir os dez títulos e atender aos critérios de D4. O resultado real é registrado com o novo hash; a rodada de 20/11 permanece intacta como histórico.
3. **Limites declarados.** `workers.dev`, MP4 com credencial, `uqload.vc`, `nhdapi.com`, 522 e reprodução no aparelho ficam fora do que esta change comprova. A mudança não promete cobertura além da amostra.

## Próximos passos

1. Implementar as duas correções e rodar a suíte offline; só depois gerar o pacote e a rodada online.
2. Revalidar com a semente `20261120`; se Pantera Negra resolver e os positivos permanecerem, registrar a rodada e atualizar o status. Se não, manter o status real e documentar o motivo.
3. Se o endpoint `.php` deixar de devolver playlist, remover a aceitação em uma change própria e manter apenas `.m3u8`.
4. Para os cinco títulos com apenas `workers.dev` ou MP4 com credencial, abrir uma decisão separada sobre ampliar a confiança; ela exige prova de reprodução e não deve ser agrupada nesta correção.
5. Para `uqload.vc`, só reavaliar com uma cadeia de mídia completa e uma decisão explícita de host; a playlist mestra sozinha não basta.
6. Se a confusão entre ausência de catálogo e falta de fonte aceita atrapalhar a triagem, propor um aviso ou campo de diagnóstico no relatório em uma change separada, sem alterar o contrato de ausência agora.

## Implementação e validação

1. **Offline.** `npm run lint` saiu com 0; `node --test test/venoplay.test.js` passou 37/37; `node build.js venoplay` saiu com 0; `npm test` passou 1921/1921; `node --test test/build.test.js test/manifest.test.js` passou 66/66 e `node --test test/blocks-catalog.test.js` passou 19/19. Os três pacotes e os manifests foram regenerados; nenhum bloco de `src/_blocks/` mudou.
2. **Online.** `npm run build:min` saiu com 0 e `npm run test:online -- --provider venoplay --seed 20261120` saiu com 0, marcando `Estável`: movie 1/5 e tv 2/5, com 0 falhas e 0 inconclusivos. A rodada registrada é `2026-11-20T14-28-20-628Z-venoplay-20261120-8679`, com pacote novo, sem sobrescrever o relatório de 20/11.
3. **Casos comparados.** Swallowed Star (1398725) e Douluo Dalu (76572) passaram de `Falha` para `Sem resultado`, sem `console.error`; Pantera Negra (284054) passou de `Sem resultado` para `Resolvido` com um HLS `.php` em `mgeb.space`; Grey's Anatomy (1416) e Breaking Bad (1396) continuaram `Resolvido`, com 2 e 1 streams, sem avisos. Os outros cinco títulos continuam `Sem resultado` por falta de fonte aceita.
4. **Limites remanescentes.** `workers.dev`, MP4 com `username`/`token`, `strm15.uqload.vc`, `nhdapi.com` e o 522 intermitente continuam fora do contrato. O 522 segue falha externa, não ausência. A rodada comprova o contrato dos streams, não a reprodução no aparelho.
5. **Higiene.** Os relatórios e o resumo não contêm segredos, URLs de mídia, URLs assinadas, hashes ou a chave do TMDB. A verificação pontual de Pantera Negra registrou apenas tipo, provider, qualidade, idioma, host e extensão do caminho.
