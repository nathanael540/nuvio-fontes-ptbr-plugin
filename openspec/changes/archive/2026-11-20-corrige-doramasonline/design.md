# Design

## Context

1. A rodada de 2026-11-20T13:21:31.454Z, ID `2026-11-20T13-20-58-691Z-doramasonline-20261120-8b7d`, pacote 1.0.0, `prism/all/all/all`, perfil `dorama`, semente `20261120`, está em `providers.md` e em `test/artifacts/online/2026-11-20T13-20-58-691Z-doramasonline-20261120-8b7d/result.json`. Resultado: filmes 0/5, séries 3/5, uma falha e um caso vazio.
2. Casos resolvidos: `Pousando no Amor` (94796) com 6 streams, `Hotel del Luna` (90447) com 6 e `Vincenzo` (117376) com 2. A falha é `Itaewon Class` (96162) S01E01, com a opção `LEGENDADO` respondendo HTML em vez de JSON. O caso vazio é `Round 6` (93405) S01E01. Os cinco filmes ficaram vazios sem erro nem aviso. O padrão 0/5 filmes e 3/5 séries já aparecia na rodada de 2026-11-14 registrada no design arquivado da inclusão do provedor, e a falha de Itaewon no `/do/v4/` também já havia sido observada ali; não é intermitência nova.
3. O replay do pacote publicado `prism/providers/doramasonline.js` reproduziu a rodada: os mesmos 0/5 filmes, os mesmos 3/5 séries, o mesmo erro de Itaewon e os mesmos streams. Como controles, `Parasita` (496243) resolveu 5 MP4 e os três títulos de série positivos resolveram 6, 6 e 2 streams. O relatório não traz rastro por requisição; o replay foi a reprodução controlada que fechou essa lacuna. Não há regressão do provedor.
4. A busca pública (`GET https://doramasonline.net/?s=<termo>`) devolveu, para os títulos vazios, cartões que o provedor não confirmou por semelhança de título: `Wall to Wall (Meus 84 m²)` (2025, escore 0,545), `Even If This Love Disappears Tonight (Se Esse Amor Desaparecesse Hoje)` (2025, 0,627) e `Round 6 (Squid Game)` (2021, 0,526). O limiar do provedor é 0,85.
5. `Ditto: Conexões do Amor` (962489), `The Fable: The Killer Who Doesn't Kill` (734519) e `A Vilã` (437109) não têm cartão correspondente na busca nem entrada no sitemap de 419 filmes da fonte (`https://doramasonline.net/wp-sitemap-posts-movies-1.xml`); a busca por `Ditto`, `The Fable` e `The Villainess` também não devolve cartão correspondente. Os outros três filmes do perfil (`Ataque 13`, `100 Coisas para Fazer Antes de Virar Zumbi` e `Pesadelo na Montanha`) também não devolveram cartão. A ausência é real no acervo. O sexto título de série do perfil, `The Glory`, é o homônimo de 2025 já rejeitado por ano.
6. A ficha de `Even If This Love...` publica duas opções Booonceivu vivas (3 mídias cada, uma com 14 legendas), duas opções IncVideo vivas e opções que falham ou são triagem. Resolvidas as opções, a cadeia entrega 12 streams: 6 HLS Booonceivu e 6 MP4 IncVideo, com 2 avisos isolados das opções `ru-boyceta`.
7. A ficha de `Round 6` S01E01 publica `DUBLADO` e `LEGENDADO` em `q1n.net/off/`, que responde HTML e redireciona por JavaScript para um lander de anúncio, e `LEGENDADO (2)` em `csst.online`, que resolve 2 MP4 no IncVideo. A cadeia entrega 2 streams depois da identidade.
8. A ficha de `Wall to Wall` só publica `png.strp2p.com`. O endpoint `/api/public/resolve` continua respondendo HTTP 404 e a página declara manutenção; mesmo com a identidade corrigida, a cadeia entrega 0 streams, sem erro. A ausência é de mídia, não de identidade.
9. `Itaewon Class` S01E01 e S01E16 publicam uma única opção, `LEGENDADO` em `/do/v4/`. O endpoint responde HTTP 200 `text/html` com avisos PHP (`Undefined array key "leg"`) e não publica `Playerjs`, iframe ou mídia; variações com `leg` também respondem HTML. A falha é da fonte, não do provedor, e o erro agregado atual está correto.
10. O formato decorado não é um caso isolado: em uma amostra de 21 fichas de filme, 7 tinham parênteses no título; em 31 fichas de série, 2 tinham. Exemplos: `A Despedida (The Farewell)`, `Pretendente Surpresa (Business Proposal)` e `Wall to Wall (Meus 84 m²)`.
11. O código atual compara o título do cartão e o da ficha apenas com o título completo do TMDB (`bestTitleScore` em `src/doramasonline/catalog.js`). O limiar, o tipo de caminho e o ano já são verificados; o que falta é ler as duas partes do título decorado.

## Goals / Non-Goals

**Goals:**

1. Corrigir somente a leitura da identidade quando o título da fonte é decorado com parênteses.
2. Preservar os casos positivos, a rejeição por ano, o tipo de caminho, o limiar e o contrato dos streams.
3. Deixar regressões offline e critérios de revalidação online explícitos, incluindo o que deve continuar vazio ou falhando.

**Non-Goals:**

1. Adicionar resolvedores para `png.strp2p.com`, `q1n.net` ou `abyssplayer.com`; a evidência atual não sustenta nenhum deles.
2. Corrigir o player interno `/do/v4/` da fonte ou tratar a falha de Itaewon como ausência.
3. Alterar players, blocos compartilhados, contrato, manifest, status, `providers.md` ou catálogo de testes.
4. Implementar, construir ou publicar nesta change.

## Decisions

### D1. Variantes locais do título, sem afrouxar o limiar

1. Em `src/doramasonline/catalog.js`, criar uma função privada que devolve as variantes de um título: o título completo, cada segmento entre parênteses (sem os parênteses) e o título sem os parênteses, sem repetir valores vazios ou iguais.
2. Aplicar as variantes em `bestTitleScore`, que já é usado tanto na triagem dos cartões (`findMedia`) quanto na confirmação da ficha (`confirmCard`). Assim, o cartão e a ficha passam a ser lidos pela mesma regra.
3. Manter `MIN_TITLE_SIMILARITY` em 0,85, a exigência de caminho `/br/filmes/` ou `/br/series/` e a igualdade de ano. As variantes mudam apenas o texto comparado, não os critérios de aceitação.
4. Alternativa descartada: remover todos os parênteses antes de comparar. Corrigiria `Wall to Wall (Meus 84 m²)` e `Round 6 (Squid Game)`, mas não `Even If This Love Disappears Tonight (Se Esse Amor Desaparecesse Hoje)`, cujo título PT-BR está dentro dos parênteses.
5. Alternativa descartada: tabela de aliases por título. Seria frágil e não cobriria o padrão observado em outras fichas da amostra.
6. Alternativa descartada: alterar o bloco compartilhado `title-match`. O formato decorado foi observado só nesta fonte; mexer no bloco obrigaria a revalidar todos os provedores consumidores sem necessidade.

### D2. Casos que a correção cobre e casos que ela não cobre

1. `Even If This Love Disappears Tonight (Se Esse Amor Desaparecesse Hoje)` passa de 0,627 para 1,0 e a cadeia entrega 12 streams. É o caso mais forte: além da identidade, há duas famílias de players vivas.
2. `Round 6 (Squid Game)` passa de 0,526 para 1,0; o S01E01 entrega 2 MP4 pelo IncVideo. As opções `q1n.net/off/` continuam triagem porque o destino é um lander de anúncio. O cartão vizinho `Round 6: O Desafio` (2023) não é escolhido: o escore fica abaixo do limiar e o ano diverge.
3. `Wall to Wall (Meus 84 m²)` passa de 0,545 para 1,0, mas continua sem streams porque só publica `png.strp2p.com`, cujo resolvedor está em manutenção/404. A identidade passa a ser confirmada e a saída continua vazia sem erro; o caso não deve ser descrito como título ausente.
4. `Ditto`, `The Fable` e `A Vilã` não têm cartão nem entrada no sitemap; nenhuma variante de título cria mídia onde a fonte não publica a obra.
5. `Itaewon Class` continua falhando no `/do/v4/` da fonte. O provedor já isola a opção, registra o aviso e sobe o erro agregado quando nada resolve; esconder essa falha como ausência reduziria a evidência e contrariaria a spec.

### D3. Termos de busca inalterados

1. A busca pelo título PT-BR já devolve os três cartões decorados; não é necessário acrescentar o segmento entre parênteses como termo.
2. Para `Ditto`, `The Fable` e `A Vilã`, a busca já foi feita com o título PT-BR, o original e variantes curtas; nenhuma devolveu cartão correspondente. Acrescentar termos não mudaria a ausência e só aumentaria requisições.

### D4. Testes offline

1. Adicionar fixtures reais sanitizadas em `test/fixtures/doramasonline/`, no estilo das existentes, sem URLs assinadas, cookies, tokens ou hashes:
   1. busca e ficha de `Even If This Love Disappears Tonight (Se Esse Amor Desaparecesse Hoje)`, com as opções Booonceivu e IncVideo vivas;
   2. busca, ficha e episódio S01E01 de `Round 6 (Squid Game)`, com `q1n.net/off/` e `csst.online`;
   3. busca e ficha de `Wall to Wall (Meus 84 m²)`, com apenas opções `png.strp2p.com`;
   4. busca de `Round 6 (Squid Game)` com ano 2023 para o negativo de ano.
2. Reutilizar os fixtures de player já existentes (`booonceivu-dubbed.json`, `booonceivu-subtitled.json`, `incvideo-embed.html`) sempre que possível, para não duplicar respostas.
3. Casos novos em `test/doramasonline.test.js`:
   1. `Se Esse Amor...` confirma a ficha decorada e resolve 6 HLS + 6 MP4, com os avisos isolados esperados;
   2. `Round 6` S01E01 confirma a ficha decorada, tria `q1n.net` e resolve o IncVideo;
   3. `Wall to Wall` confirma a ficha decorada, abre a ficha uma vez e devolve `[]` sem erro nem aviso;
   4. `Round 6 (Squid Game)` com ano 2023 é descartado pelo ano antes de abrir a ficha;
   5. os casos existentes de `Pousando`, `Hotel del Luna`, `Vincenzo`, `Parasita`, `The Glory`, busca vazia, tipo conflitante, opção quebrada e ausência continuam passando sem alteração.
4. Não criar teste que dependa de rede; a validação online é etapa separada.

### D5. Revalidação online

1. Depois da implementação, rodar `npm run lint`, `npm test`, `node build.js doramasonline` e `npm run build:min`; em seguida `npm run test:online -- --provider doramasonline --seed 20261120` com `TMDB_API_KEY` somente no ambiente e `prism/all/all/all`.
2. Critérios gerais: nenhum caso positivo atual pode regredir; todo título decorado sorteado que publique player suportado deve ser confirmado e resolver; nenhum caso novo pode falhar por identidade.
3. Com a semente `20261120` e os catálogos atuais, a expectativa é: filme 1/5 (`Se Esse Amor...` resolvido; `Meus 84 m²`, `Ditto`, `The Fable` e `A Vilã` vazios) e série 4/5 (`Pousando`, `Hotel del Luna`, `Vincenzo` e `Round 6` resolvidos; `Itaewon` falha externa).
4. A classificação pública pode passar a `🟢 Estável` pela regra de ao menos um título resolvido em cada tipo, mas só depois de a rodada nova ser registrada em `providers.md`. Esta change não altera status.
5. Uma sonda dirigida pelos três IDs pode ser usada como evidência complementar, registrando apenas contagem de streams, hosts e categorias de erro, nunca URLs de mídia. Ela não substitui a rodada oficial.
6. Se a rodada não reproduzir a expectativa, comparar os casos com este design antes de atribuir regressão: `Meus 84 m²` pode seguir vazio por `png.strp2p`, `Itaewon` pode seguir falhando por `/do/v4/` e títulos ausentes podem mudar de amostra.

## Risks / Trade-offs

1. **Falso positivo por parêntese** → o limiar de 0,85, o tipo de caminho e o ano exato continuam obrigatórios; a ficha é confirmada pela mesma regra e há teste negativo com `Round 6 (Squid Game)` de 2023.
2. **Parêntese que não é título** (por exemplo, `Live Action`) → o segmento isolado tende a ficar abaixo do limiar e não promove o candidato; o prefixo ou o título completo continuam sendo avaliados.
3. **Formato decorado pode mudar** → a regra cobre parênteses, o formato observado; colchetes, travessões ou outros separadores exigem nova evidência.
4. **Fixtures envelhecem** → os testes protegem o contrato observado; a rodada online é a autoridade de funcionamento.
5. **`Meus 84 m²` continua vazio** → é ausência de mídia suportada, não falha da correção; registrar no design e no próximo resumo para não confundir com regressão.
6. **Itaewon continua falhando** → é falha da fonte; manter o erro visível em vez de convertê-lo em ausência.

## Migration Plan

1. Implementar as variantes de título em `src/doramasonline/catalog.js`.
2. Adicionar as fixtures sanitizadas e os casos de teste.
3. Rodar lint, testes offline e build do provedor.
4. Gerar os pacotes de publicação com `npm run build:min`.
5. Executar a rodada online oficial e atualizar `providers.md` e o status apenas com a nova evidência.
6. Rollback: reverter `catalog.js`, as fixtures e os testes; reconstruir os pacotes a partir da fonte.

## Validation

1. Replay do pacote 1.0.0 confirmou a rodada e os controles: `Parasita` 5 MP4, `Pousando` 6 HLS, `Hotel del Luna` 6 HLS e `Vincenzo` 2 MP4.
2. Sondas públicas confirmaram os cartões decorados, os escores abaixo do limiar e a presença de players vivos em `Se Esse Amor...` e `Round 6`.
3. A simulação da variante de título, sem alterar o repositório, confirmou 12 streams em `Se Esse Amor...`, 2 em `Round 6` e 0 em `Wall to Wall` (sem erro).
4. A ausência de `Ditto`, `The Fable` e `A Vilã` foi confirmada por busca e sitemap; a falha de Itaewon foi confirmada no endpoint `/do/v4/`.
5. A correção proposta é a menor que explica os casos com mídia disponível; os demais casos ficam documentados como ausência real ou falha externa.

## Open Questions

1. A fonte publica outros formatos de título decorado (colchetes, travessões) que a regra de parênteses não cobre? Uma amostra nova pode responder sem mudar esta decisão.
2. O `png.strp2p.com` sai da manutenção? Se sair, uma change própria com evidência pode adicionar o resolvedor; não é necessário para esta correção.
3. O `/do/v4/` de Itaewon volta a publicar mídia ou outra opção? Reobservar na próxima rodada; nenhuma mudança de provedor é sustentada agora.
