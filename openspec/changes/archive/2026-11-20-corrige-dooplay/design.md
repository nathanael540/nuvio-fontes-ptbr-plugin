# Design

## Context

1. A rodada oficial de 20/11/2026, ID `2026-11-20T13-19-23-765Z-dooplay-20261120-b238`, registrada em `providers.md`, executou o pacote 1.3.0 em `prism/all/all/all`, perfil generalista, semente e catálogos `movie@2026-11-12.1` e `tv@2026-11-12.1`. O SHA-256 do pacote da rodada, `41b0a16704e9123cca4a8b3db5b435420fa19e1bbd67434f27f2a370345ea1cd`, é idêntico ao de `prism/providers/dooplay.js` no checkout investigado.
2. O resultado público foi `Parcial`, com `movie 3/5` e `tv 0/5`. O relatório transitório está em `test/artifacts/online/2026-11-20T13-19-23-765Z-dooplay-20261120-b238/result.json` e contém os dez casos, os motivos saneados e os avisos; não contém respostas HTTP, corpos, URLs assinadas nem a trilha por etapa.
3. O relatório classifica como `Falha` os casos em que alguma origem lançou erro, mesmo que as demais tenham terminado em ausência. Ele não distingue, sozinho, ausência real de acervo, cobertura de catálogo, falha externa de espelho, defeito do provedor ou limite da cadeia compartilhada. A investigação abaixo usa interfaces públicas e o próprio pacote publicado para separar essas classes.
4. A rodada anterior disponível é a de 12/11/2026, arquivada em `openspec/changes/archive/2026-11-12-padronizar-verificacao-online-provedores/design.md`: DooPlay `Estável`, `movie 2/5`, `tv 3/5`, pacote 1.3.0, semente `20261112`. O repositório recebeu reset em 12/11/2026 e não há histórico de código anterior a `d30a65c` que permita atribuir a queda de TV a uma alteração do provedor. A comparação é de evidência online, não de diff.
5. O código atual percorre seis origens em `src/dooplay/sources.js`, confirma a ficha em `findContent`, escolhe o episódio em `findEpisode`, lê os botões `li.dooplay_player_option` em `readEntries` e expande cada botão em `src/dooplay/players.js`. A expansão usa `entry.origin`, que é a origem configurada, mesmo quando a ficha confirmada está em outro host.
6. As consultas públicas foram feitas em 20/11/2026, com `fetch` real, sem cookies, sem autenticação e sem contornar desafios. O diagnóstico dirigido executou o pacote publicado em Node, com o mesmo SHA-256, e não gerou build, arquivo versionado ou rodada oficial.

## Evidence

### 1. Casos da rodada

| Caso | Tipo | Resultado | Classes das origens no motivo | Observações |
| --- | --- | --- | --- | --- |
| Duna (438631) | movie | Falha | filmesamadores=ausencia; pobreflixnow=falha; pobrexflix=ausencia; hype=falha; megafilme=falha; boraflix=ausencia | Avisos de HTTP 400 em `Canais abaixo` e de busca 404/403 |
| Super Mario Bros. O Filme (502356) | movie | Resolvido | — | 1 stream; avisos de `idS` ausente e HTTP 400 |
| Os Vingadores (24428) | movie | Resolvido | — | 1 stream; aviso de HTTP 400 |
| Matrix (603) | movie | Resolvido | — | 1 stream; aviso de HTTP 400 |
| O Senhor dos Anéis: O Retorno do Rei (122) | movie | Falha | filmesamadores=ausencia; pobreflixnow=falha; pobrexflix=ausencia; hype=falha; megafilme=falha; boraflix=ausencia | Mesmos avisos de HTTP 400 e busca 404/403 |
| A Favorita (7448) | tv | Falha | filmesamadores=ausencia; pobreflixnow=ausencia; pobrexflix=ausencia; hype=falha; megafilme=falha; boraflix=ausencia | Sem aviso de estrutura |
| Renegade Immortal (223911) | tv | Falha | filmesamadores=ausencia; pobreflixnow=ausencia; pobrexflix=ausencia; hype=falha; megafilme=falha; boraflix=ausencia | Sem aviso de estrutura |
| A Guerra dos Tronos (1399) | tv | Falha | filmesamadores=falha; pobreflixnow=falha; pobrexflix=ausencia; hype=falha; megafilme=falha; boraflix=ausencia | `listagem de episódios não reconhecida` em filmesamadores; HTTP 400 em pobreflixnow |
| Perfect World [Wanmei Shijie] (124003) | tv | Falha | filmesamadores=ausencia; pobreflixnow=ausencia; pobrexflix=ausencia; hype=falha; megafilme=falha; boraflix=ausencia | Sem aviso de estrutura |
| Bleach (30984) | tv | Falha | filmesamadores=ausencia; pobreflixnow=falha; pobrexflix=ausencia; hype=falha; megafilme=falha; boraflix=ausencia | HTTP 400 em pobreflixnow |

### 2. Origens em 20/11/2026

| Origem configurada | URL final observada | HTTP | Observação | Classe |
| --- | --- | --- | --- | --- |
| `filmesamadoresgratis.com` | `startrekfilms.net` | 200 | REST `dcfilter` responde; a busca encontra Matrix por `The Matrix` e Game of Thrones pelo título original, mas é ruidosa para Duna e não encontra o título completo de O Senhor dos Anéis; a página de série de Game of Thrones não publica `li.mark-*` nem `ul.episodios` | Redirect público; cobertura parcial |
| `www.pobreflixnow.rest` | `www.pobreflixfull.com` | 200 | Busca HTML e fichas respondem; AJAX no host antigo responde 400; AJAX no host final responde 200 com `embed_url` | Redirect público; defeito de expansão no host antigo |
| `pobrexflix.art` | `pobreflixoficial.mom` | 200 | Catálogo de filmes com Duna e Matrix; séries como Game of Thrones têm página e episódio, mas as opções observadas foram triagem | Redirect público; cobertura de TV parcial |
| `hypetvflix.one` | — | 404 | Home e busca respondem 404 | Origem morta |
| `megafilmehdonline.blog` | — | 403 | `Just a moment...` da Cloudflare; nenhum bypass tentado | Falha externa |
| `boraflix.mom` | — | 200 | Catálogo de filmes; série de Game of Thrones com episódio, opções triadas | Cobertura de TV parcial |

### 3. Expansão da opção: host antigo e host final

1. As fichas de Duna, O Senhor dos Anéis e Game of Thrones são confirmadas em `www.pobreflixfull.com` depois de a busca usar `www.pobreflixnow.rest`. O `POST` para `www.pobreflixnow.rest/wp-admin/admin-ajax.php` é redirecionado e termina em `www.pobreflixfull.com/wp-admin/admin-ajax.php` com HTTP 400 e corpo `0`.
2. O mesmo `POST`, com o mesmo formulário e o mesmo `Referer` da ficha, enviado diretamente a `www.pobreflixfull.com/wp-admin/admin-ajax.php`, responde 200 e devolve o `embed_url`:

| Ficha final | Opção | POST no host antigo | POST no host final | `embed_url` devolvido |
| --- | --- | --- | --- | --- |
| `/filmes/duna/` | `Canais abaixo`, post 484121 | HTTP 400 | HTTP 200 | `plenoflu.com/movie/tt1160419` |
| `/filmes/o-senhor-dos-aneis-o-retorno-do-rei/` | `Canais abaixo`, post 365326 | HTTP 400 | HTTP 200 | `plenoflu.com/movie/tt0167260` |
| `/episodios/game-of-thrones-1x1/` | `Canais abaixo`, post 218780 | HTTP 400 | HTTP 200 | `plenoflu.com/tvshow/1399/1/1` |
| `/episodios/bleach-temporada-1-episodio-1/` | `Canais abaixo`, post 463641 | HTTP 400 | HTTP 200 | `plenoflu.com/tvshow/30984/1/1` |

3. A causa é o uso de `entry.origin` (origem configurada) em `fetchEmbed`, em vez da origem da URL final da ficha. O `Referer` já é a URL final; o formulário não muda. O `POST` no host antigo é redirecionado com semântica que o servidor final rejeita com 400, e o provedor perde uma opção que existe.

### 4. Simulação dirigida da correção

1. O pacote publicado foi executado com rede real, sem alterar o repositório, com um `fetch` de teste que reescreveu somente o host do `POST /wp-admin/admin-ajax.php` de `www.pobreflixnow.rest` para `www.pobreflixfull.com`. Nenhum outro comportamento foi alterado.
2. Resultado da simulação:

| Caso | Rodada 20/11 | Diagnóstico dirigido | Stream |
| --- | --- | --- | --- |
| Duna | 0 | 1 | 480p, Dublado, `vaiquecol.com` |
| O Senhor dos Anéis | 0 | 1 | 480p, Dublado, `vaiquecol.com` |
| A Guerra dos Tronos S01E01 | 0 | 1 | 480p, Dublado, `vaiquecol.com` |
| Bleach S01E01 | 0 | 0 | Falha da cadeia compartilhada: `plenoflu 1: hash ausente` |
| Matrix (controle) | 1 | 1 | 796p, Dublado, `embedplayer2.xyz` |
| Super Mario (controle) | 1 | 1 | 720p, Dublado, `embedplayer2.xyz`; reexecutado sem a reescrita |
| Os Vingadores (controle) | 1 | 1 | 720p, Dublado, `embedplayer2.xyz`; reexecutado sem a reescrita |

3. A simulação comprova que a correção mínima recupera os três casos negativos com conteúdo disponível e não altera a resolução dos positivos. Ela não é a rodada oficial: não registra `providers.md`, não prova reprodução no app nem QuickJS e não substitui a revalidação após a implementação.
4. O caso Bleach continua sem stream depois da correção do AJAX porque a cadeia compartilhada do plenoflu devolve uma opção sem `hash`. A página do plenoflu publica `DIRECT_EPISODE_ID` e a API responde `Token inválido` quando consultada sem token; essa é uma mudança da cadeia compartilhada, não da expansão DooPlay.

### 5. Classificação dos casos negativos

1. **Defeito do provedor:** Duna, O Senhor dos Anéis e Game of Thrones estão disponíveis em `www.pobreflixfull.com` e falham pela expansão no host antigo. A correção é sustentada pela resposta 200 no host final e pela simulação.
2. **Ausência real de acervo na amostra:** A Favorita (2008), Renegade Immortal e Perfect World não aparecem nas buscas das origens vivas. A busca por IMDb, título PT-BR, título original (inclusive `仙逆` e `完美世界`) e alternativos não devolve cartão compatível. O filme homônimo `A Favorita (2018)` é de outro tipo e é descartado por `accepts`.
3. **Cobertura de catálogo ou layout:** `filmesamadoresgratis.com`/`startrekfilms.net` não publica a listagem de episódios de Game of Thrones no formato esperado; a página não tem `li.mark-*` nem `ul.episodios`. As origens `pobrexflix.art`/`pobreflixoficial.mom` e `boraflix.mom` têm catálogo de TV reduzido e, quando têm o título, as opções observadas foram triagem (`Premium` com `budget danger`, `WatchPlay` sem `RESOLUTION`, `Embed Play` com host `embedplayabyss.top` fora do conjunto).
4. **Falha externa:** `hypetvflix.one` responde 404; `megafilmehdonline.blog` responde 403 com desafio Cloudflare. Nenhum dos dois foi contornado. A presença deles no motivo transforma casos de ausência em `Falha`; isso não prova regressão do provedor. O 404 do `hypetvflix.one` foi reproduzido na home e na busca; o 403 do `megafilmehdonline.blog` pode ser intermitente por IP ou sessão e foi observado nos sete casos sem resolução, que chegaram a essa origem.
5. **Limite da cadeia compartilhada:** Bleach chega ao plenoflu e falha por `hash ausente`; a página usa `DIRECT_EPISODE_ID` e a API rejeita a consulta sem token. A correção exige mudança no bloco `fireplayer`, compartilhado com outros provedores, e fica fora desta change.
6. **Regressão:** não há evidência de regressão de código. A queda de `tv 3/5` em 12/11 para `tv 0/5` em 20/11 é compatível com migração de domínio, mudança de acervo e mudança da cadeia compartilhada; o defeito de expansão é latente e passou a ser decisivo quando a ficha deixou de estar na origem configurada. A rodada de 12/11 não tem casos por título disponíveis no repositório, então a comparação é limitada ao resumo.

### 6. Implementação e revalidação

1. **Código.** `src/dooplay/players.js` passou a derivar a origem de expansão da URL final da ficha (`expansionOrigin`), exigir HTTPS e usar essa origem nas rotas AJAX e REST, mantendo o `Referer` e o formulário. `src/dooplay/sources.js` removeu `hypetvflix.one` e deixou de gravar `origin` nas opções, porque a expansão não usa mais a origem configurada. Os pacotes `providers/dooplay.js`, `gdrive/providers/dooplay.js` e `prism/providers/dooplay.js` foram reconstruídos; o SHA-256 de `prism/providers/dooplay.js` mudou de `41b0a167...` para `7a16d892...` e a versão permaneceu 1.3.0.
2. **Testes antes e depois.** O caso novo de AJAX foi executado em uma cópia limpa do commit `0394674`, com o teste novo e o código anterior, e falhou com `0 !== 2` porque o `POST` ia para a origem configurada, que não respondia. Depois da correção, `node --test test/dooplay.test.js` passou com 20/20 testes, incluindo AJAX no host final, REST no host final, ficha sem redirect, destino não HTTPS e HTTP 400 isolado. `npm run lint` passou sem saída e `npm test` passou com 1918 testes.
3. **Rodada dirigida.** `npm run test:online -- --provider dooplay --seed 20261120`, sem `--record`, gerou o run-id `2026-11-20T14-24-36-396Z-dooplay-20261120-3e28`: `movie 5/5` e `tv 1/5`. Duna, O Senhor dos Anéis e A Guerra dos Tronos passaram a resolver; Super Mario, Os Vingadores e Matrix continuaram resolvidos. A Favorita, Renegade Immortal e Perfect World continuaram sem resolução por ausência de acervo, com `megafilmehdonline.blog` em 403 externo; Bleach continuou dependendo da cadeia do plenoflu, com `hash ausente`. O critério da tarefa 4.4 foi confirmado.
4. **Rodada oficial.** `npm run test:online -- --provider dooplay --record` gerou o run-id `2026-11-20T14-28-47-307Z-dooplay-92423415-a687`, com `movie 3/5` e `tv 2/5`: Vingadores: Guerra Infinita, O Senhor dos Anéis e Ataque 13 resolveram em filme; Hotel del Luna e Peaky Blinders resolveram em série. O runner atualizou `providers.md` para **🟢 Estável**, com a rodada registrada. A mudança cumpriu o critério de subir o status com ao menos um caso de TV resolvido.
5. **Fora desta change.** A cadeia compartilhada do plenoflu (`DIRECT_EPISODE_ID`, token e `hash ausente`), o player `embedplayabyss.top` e a listagem de série do `startrekfilms.net` continuam fora do escopo. O 403 do `megafilmehdonline.blog` foi observado de novo e não foi contornado. A rodada online prova resolução e contrato, não reprodução no aparelho nem QuickJS.

## Goals / Non-Goals

**Goals:**

1. Corrigir a expansão das opções no domínio final da ficha, recuperando os títulos disponíveis sem alterar os positivos.
2. Remover a origem morta e manter a classificação explícita de falha externa, ausência e cobertura.
3. Acrescentar testes offline que reproduzam o redirect e preservem os fluxos que já funcionam.
4. Deixar critérios verificáveis para a revalidação online e para os limites que ficam fora desta change.

**Non-Goals:**

1. Contornar Cloudflare, autenticação, token, proxy ou qualquer controle de acesso.
2. Corrigir a cadeia compartilhada do plenoflu, adicionar `embedplayabyss.top` ou ampliar hosts sem investigação própria.
3. Alterar o status em `providers.md` ou registrar uma rodada oficial sem execução do fluxo.
4. Garantir `tv 5/5` ou resolver títulos ausentes do acervo.
5. Trocar todas as origens configuradas pelas marcas finais; a correção usa a URL final da ficha e não depende de fixar a nova marca.

## Decisions

1. **Base da expansão:** a expansão REST e AJAX SHALL usar a origem da URL final da ficha confirmada. Como `readEntries` já recebe a página final e grava `referer: page.url`, a implementação deriva a origem de `referer` em `fetchEmbed`, exige HTTPS e usa essa origem nas duas rotas. A origem configurada continua sendo a semente da busca; não é usada para expandir uma ficha que redirecionou.
2. **Por que não atualizar só a lista de origens:** trocar `www.pobreflixnow.rest` por `www.pobreflixfull.com`, `filmesamadoresgratis.com` por `startrekfilms.net` e `pobrexflix.art` por `pobreflixoficial.mom` resolveria o estado atual, mas repetiria o problema na próxima migração e misturaria a correção com uma decisão de marca. A base final da ficha é observável em tempo de execução e mantém a lista configurada como ponto de partida. Alternativa rejeitada: mapa fixo de domínios antigos para novos, que envelhece e exige manutenção a cada troca.
3. **Segurança do redirect:** a origem final só é usada se for HTTPS; a página já foi buscada e confirmada por IMDb/TMDB antes da expansão. O formulário enviado contém apenas `action`, `post`, `nume` e `type`, sem chave, cookie ou token. O `Referer` continua sendo a URL final da ficha. HTTP, host inválido ou URL não HTTP(S) falham a origem, em vez de enviar o formulário.
4. **Origem morta:** `hypetvflix.one` sai de `SOURCES` porque home e busca responderam 404 em 20/11/2026. A remoção é operacional, não uma rejeição de provedor: `hypetvflix.one` é um espelho de um provedor ativo, e a regra de `rejected-providers.md` não se aplica a hosts descartados isoladamente. Se um sucessor público for confirmado, a origem pode voltar com teste.
5. **Origem bloqueada:** `megafilmehdonline.blog` permanece na lista como falha externa. O desafio Cloudflare não é contornado; se o 403 persistir em rodadas futuras, a remoção pode ser avaliada em uma decisão operacional separada, com evidência de mais de uma rodada. Não se converte o 403 em ausência.
6. **Testes offline:** o teste de regressão usa a rota simulada com a resposta da busca apontando para a ficha no host final e o AJAX disponível apenas nesse host. O teste deve falhar no código atual, que envia o `POST` ao host configurado, e passar depois da correção. Um segundo teste cobre a rota REST no host final; um terceiro cobre a ficha sem redirect, para garantir que o comportamento existente não muda. A lista de origens também é conferida sem `hypetvflix.one`.
7. **Preservação:** os testes existentes de filme por `iframe.metaframe`, episódio por `li.mark-*`, triagem de hosts, `budget danger`, `watchplay`, `idS`, `plenoflu`, deduplicação e formatadores continuam obrigatórios. A correção não altera `buildStream`, idioma, qualidade, headers, legendas ou ordenação.
8. **Cadeia compartilhada:** o `hash ausente` do plenoflu e o `DIRECT_EPISODE_ID`/token não são corrigidos aqui. A mudança afeta `src/_blocks/fireplayer/`, usada por FirePlayer PT-BR e outros provedores, e exige change própria com fixture e revalidação dos consumidores. O `design.md` registra a evidência e o próximo passo, sem alterar o bloco nesta change.
9. **Cobertura de player:** `embedplayabyss.top` não entra no conjunto de hosts sem investigação da família, teste de mídia e decisão de allowlist. A triagem atual é mantida; o título Duna continua ausente nas origens `pobrexflix`/`boraflix` por essa cobertura, mas resolve pela origem `pobreflixfull` com a correção.
10. **Revalidação online:** depois da implementação autorizada, executar `node build.js dooplay`, `npm run lint`, `node --test test/dooplay.test.js` e `npm test`; gerar o pacote com `npm run build:min`; executar a verificação dirigida com a mesma semente da rodada de 20/11 (`--seed 20261120`, sem `--record`), com os catálogos `movie@2026-11-12.1` e `tv@2026-11-12.1` e o perfil generalista, e comparar os dez casos pelo ID e pelo título. A rodada oficial só é registrada com `--record` quando o fluxo oficial for autorizado; `providers.md` não é editado à mão.
11. **Critério de sucesso da revalidação:** os três positivos de filme da rodada anterior continuam resolvidos; Duna, O Senhor dos Anéis e Game of Thrones passam a resolver; A Favorita, Renegade Immortal e Perfect World continuam sem resolução por ausência de acervo, e não por erro de estrutura ou pela correção; Bleach pode continuar sem stream enquanto a cadeia compartilhada não for corrigida; nenhuma origem viva passa a falhar por causa da correção. O status só sobe se a rodada oficial registrar ao menos um caso de TV resolvido; caso contrário, permanece `Parcial` e o limite é registrado.
12. **Limite de interpretação:** a rodada online prova resolução e contrato dos streams, não reprodução no app, QuickJS, disponibilidade futura do acervo ou funcionamento de hosts bloqueados. A semente repetida reproduz a seleção, não os resultados da fonte.

## Risks / Trade-offs

1. [Redirect para host inesperado] → A origem final é derivada da URL que o próprio `fetch` seguiu depois de a ficha ser confirmada; só HTTPS é aceito e nenhum segredo vai no formulário. O risco residual é o mesmo de já buscar a ficha em um host escolhido pela origem.
2. [Remoção de `hypetvflix.one`] → Perde-se uma possível cobertura se o domínio voltar; a origem pode ser readicionada com evidência e teste. A remoção não muda o status nem o contrato.
3. [Fonte muda entre a investigação e a implementação] → A simulação é datada; a revalidação dirigida com a mesma semente e a oficial são obrigatórias. Se o plenoflu mudar, Duna/LOTR/GoT podem não resolver mesmo com a correção.
4. [Cloudflare e IP] → O 403 do `megafilmehdonline.blog` pode variar por IP ou sessão; uma única observação não justifica remoção. Não há bypass.
5. [Cadeia compartilhada] → Bleach e outros títulos do plenoflu podem continuar falhando; a correção do DooPlay não deve ser apresentada como solução de toda a cadeia.
6. [Versão e arquivos gerados] → O build altera os pacotes e manifests; a versão pode permanecer, porque a identidade online inclui o hash do pacote. A implementação deve coordenar com outras threads no checkout compartilhado para não sobrescrever trabalho alheio.
7. [Amostra] → A rodada de 20/11 usou cinco títulos por tipo; ausência em três séries não prova ausência de todo o acervo, e um sucesso de TV não prova cobertura ampla.

## Open Questions / Next Steps

1. Abrir change própria para a cadeia do plenoflu: entender `DIRECT_EPISODE_ID`, token da API e `hash ausente`, com fixture real e revalidação de FirePlayer PT-BR e demais consumidores do bloco.
2. Investigar `embedplayabyss.top` como família pública de player, com amostra de mídia e decisão explícita de allowlist; sem isso, manter a triagem.
3. Reobservar as páginas de série do `startrekfilms.net` em outra data; se continuarem sem listagem de episódios, registrar como limite de cobertura e não afrouxar o parser.
4. Avaliar se as origens configuradas devem passar a apontar para as marcas finais depois de observar a estabilidade dos redirects; a correção atual não depende disso.
5. Se o 403 do `megafilmehdonline.blog` persistir em rodadas futuras, avaliar a remoção operacional com evidência de mais de uma data, sem bypass.
6. Confirmar em nova rodada se o filtro de idioma/qualidade do manifest não descarta os streams recuperados; a simulação usou o pacote `prism` com os campos já preenchidos.

## Evidence Hygiene

1. Nenhuma chave do TMDB, cookie, token, URL assinada, playlist completa ou corpo bruto é reproduzido neste documento. As URLs citadas são páginas públicas de catálogo ou embeds sem assinatura.
2. O diagnóstico dirigido usou um harness temporário fora do repositório e o pacote publicado; nenhum arquivo versionado, artefato de outra thread ou entrada de `providers.md` foi alterado.
3. O relatório oficial permanece a fonte dos resultados de 20/11; as sondas explicam a causa e não substituem a rodada.
