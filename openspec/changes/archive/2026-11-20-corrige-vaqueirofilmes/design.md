# Design

## Context

1. A rodada `2026-11-20T13-19-53-192Z-vaqueirofilmes-20261120-5b7e`, registrada em `providers.md` e em `test/artifacts/online/`, usou `prism/all/all/all`, semente `20261120` e cinco filmes. O relatório registra cinco retornos vazios, zero falhas classificadas e nenhum motivo ou aviso por caso; não identifica qual etapa foi percorrida. O pacote atual `prism/providers/vaqueirofilmes.js` coincide com a identidade de pacote registrada na rodada. O artefato é local e ignorado pelo Git.
2. Em 20/11/2026, consultas públicas pontuais da primeira página da busca WordPress pelo título listado retornaram HTTP 200 e um resultado nominal para Django Livre, Top Gun: Maverick, Super Mario Bros. O Filme e Se Esse Amor Desaparecesse Hoje; retornaram zero para 100 Coisas para Fazer Antes de Virar Zumbi. As páginas `?video=0` dos quatro resultados responderam 200 e mostraram botões Myembed, EmbedplayApi, VidSrc e Superflixapi. Naquele momento, não foram confirmados JSON-LD, ano, título original, seleção real, opções dubladas, Byse ou reprodução. As consultas são posteriores à rodada e não comprovam o estado histórico.
3. A causa da classificação é confirmada: a amostra de filmes teve 0/5 resolvidos. Na abertura desta mudança, a causa técnica dos retornos vazios permanecia desconhecida. Ausência da opção Byse, rejeição por identidade ou divergência do catálogo eram hipóteses, não fatos demonstrados; erros capturados por `getStreams` também retornam `[]`, e o relatório não permitia excluí-los.
4. `catalog.js` consulta títulos PT-BR e original, limita candidatos e exige identidade; `players.js` escolhe EmbedPlay e só integra Byse do grupo Dublado; `index.js` captura falhas e retorna `[]`. `test/vaqueirofilmes.test.js` e suas fixtures cobrem o fluxo controlado e ramificações, mas não reproduzem comprovadamente os cinco casos da rodada nem o estado real de hoje. Offline não comprova reprodução nem publicação.
5. O índice GitNexus da checkout principal estava defasado; por restrição de escrita desta investigação ele não foi atualizado nem usado como evidência. A análise usou os arquivos locais.

## Investigação de 20/11/2026

1. **Método.** Por volta de 15:10 UTC de 20/11/2026, foram repetidas consultas públicas às interfaces de busca, ficha, variante `?video=0`, embed da EmbedPlay, `get_stream_link`, página de opções e `getPlayer` para os cinco IDs da rodada e para o controle TMDB `9320`. Nenhum serviço de bypass, conta ou chave foi usado; URLs de mídia e corpos brutos não foram persistidos. Os resultados descrevem o estado público observado nesse intervalo, não o estado histórico da rodada.
2. **`68718` Django Livre (2012).** A busca PT-BR devolveu um resultado `movie`; a ficha publicou JSON-LD `Movie` com nome e ano compatíveis; `?video=0` publicou Myembed, EmbedplayApi, VidSrc e Superflixapi; a cadeia EmbedPlay respondeu `success` e abriu as opções. O grupo Dublado tinha `Opção 1 (ABYS)` e `Opção 2 (UPNS)`; `getPlayer` devolveu os hosts `embedplayabyss.top` e `embedplayapiupn.upns.xyz`. Não havia opção Byse. O retorno vazio é ausência da opção suportada, não falha.
3. **`361743` Top Gun: Maverick (2022).** Identidade confirmada, EmbedPlay presente, grupo Dublado com ABYS e UPNS e nenhuma opção Byse, como no caso 2.
4. **`502356` Super Mario Bros. O Filme (2023).** Identidade confirmada, EmbedPlay presente, grupo Dublado com ABYS e UPNS e nenhuma opção Byse, como no caso 2.
5. **`1466115` Se Esse Amor Desaparecesse Hoje (2025).** Identidade confirmada, EmbedPlay presente, grupo Dublado com ABYS e UPNS e nenhuma opção Byse, como no caso 2.
6. **`1070514` 100 Coisas para Fazer Antes de Virar Zumbi (2023).** A busca pelo título PT-BR e pelo título original japonês devolveu zero resultados `movie`. Buscas amplas por “Zom” e “Zumbi” não trouxeram o título. A ausência é de candidato no catálogo para os títulos consultados; não houve falha HTTP.
7. **Controle `9320` Os Vingadores (1998).** A mesma cadeia abriu o grupo Dublado com ABYS, BYSE e LOAD; `getPlayer` devolveu `embedplaybyse.top` para a opção Byse. Isso confirma que a cadeia EmbedPlay/Byse continua existindo e que o retorno vazio dos casos 2 a 5 vem da oferta do grupo, não de uma quebra geral do player.
8. **Limites.** As consultas comprovam o estado das páginas nesse intervalo, não a reprodução do vídeo, a assinatura HLS, a estabilidade do catálogo nem a existência de Byse em outros títulos. A opção Byse do controle não foi decifrada nesta investigação; a decifragem offline continua coberta pelas fixtures. O título `1070514` pode existir com outro nome no catálogo, mas não foi encontrado pelos títulos que o provedor consulta.
9. **Causa reproduzível e fixture.** A causa dos cinco retornos vazios é de cobertura: quatro títulos não oferecem a opção Byse no grupo Dublado e um não aparece na busca do catálogo. A fixture `test/fixtures/vaqueirofilmes/embedplay-vip-without-byse.html` é um excerto sanitizado da página de opções real de `68718`, com identificadores fixos e sem URLs de mídia; ela cobre a ausência de Byse nos testes offline. Não há defeito de identidade, idioma ou parsing comprovado, então a correção funcional condicional (task 2.3) não foi acionada.

## Goals / Non-Goals

**Goals:**

1. Distinguir as etapas de ausência reconhecida e investigar os cinco casos com evidência sanitizada e reproduzível.
2. Preservar as regras de identidade, idioma, seleção e tratamento de erros até existir evidência para mudá-las.

**Non-Goals:**

1. Afirmar que Byse é a causa, integrar hosts por hipótese, ampliar para séries ou contornar bloqueios.
2. Tratar a consulta pública pontual ou testes offline como validação de reprodução.

## Decisions

1. **Diagnóstico explícito:** registrar categorias fixas para candidato não confirmado, ambiguidade, EmbedPlay ausente e Byse suportado ausente, sem dados dinâmicos sensíveis. Alternativa: inferir a partir de `[]`; rejeitada porque ausência e erro convergem no retorno público. Preservar falhas em `console.error` na fronteira e isolamento por opção; evitar classificar como ausência quando houve falha.
2. **Investigar antes de corrigir:** reproduzir os cinco casos com instrumentação temporária local e acesso público permitido; verificar títulos TMDB, identidade, botões e opções dubladas, até o ponto acessível. Não persistir links de mídia, respostas brutas sensíveis ou credenciais. Se surgir uma causa reproduzível que exija outro contrato, revisar a change e sua spec antes de implementá-la. Alternativa: adicionar hosts não comprovados; rejeitada por falta de evidência e risco de idioma ou reprodução incorretos.
3. **Teste com fixtures reais sanitizadas:** capturar apenas respostas necessárias e estáveis, sem links assinados ou segredos; incluir ao menos um caso reproduzido, ausência e falhas independentes. Alternativa: inventar fixtures de casos supostamente reais; rejeitada.
4. **Canal do diagnóstico de ausência:** `console.warn` com mensagens fixas para candidato não confirmado, identidade ambígua, EmbedPlay ausente e Byse ausente. O `console.error` continua reservado a falhas na fronteira e a mensagem de ausência é capturada em `warnings` pelo relatório online, sem classificar o caso como falha. Alternativa: `console.error`; rejeitada porque o classificador transforma erro em falha e a spec exige distinguir ausência de falha.

## Risks / Trade-offs

1. A fonte pode mudar entre etapas ou indisponibilizar acesso público → anotar horário e resultado por etapa; não concluir sobre a rodada histórica sem evidência.
2. Ausência nominal na primeira busca não prova ausência no título original ou em outra página → executar o fluxo integral de busca antes de classificá-la.
3. Diagnósticos podem expor dados sensíveis → mensagens fixas, teste de sanitização e nenhuma URL ou resposta bruta nos registros.
4. Se não houver causa reproduzível ou fixture adequada, a correção funcional fica bloqueada; não declarar êxito, manter a evidência e as tarefas pendentes.

## Migration Plan

1. Após aprovação e evidência, implementar somente o necessário e executar testes Node, lint e build do provedor; reconstruir o pacote de publicação conforme as regras do repositório.
2. Em ambiente isolado de relatórios concorrentes, executar a verificação oficial do pacote final `prism/all/all/all` com TMDB apenas no ambiente, registrando versão, identidade, amostra e resultados. Reproduzir também os cinco IDs da rodada anterior como diagnóstico complementar, sem substituir a amostra oficial nem manipular sua seleção.
3. Aprovar funcionamento/publicação somente com pelo menos uma resolução válida para `movie`, conforme `docs/tests.md`, e registrar a rodada oficial em `providers.md`. Uma rodada inconclusiva não comprova correção. Em caso de regressão, reverter a implementação e reconstruir os pacotes, preservando as regras de status e evidência.

## Validation

1. `npm run lint` passou sem erros.
2. `npm test` passou com 1941 testes, incluindo os novos casos de ausência e a distinção entre ausência e falha.
3. `node build.js vaqueirofilmes` e `npm run build:min` passaram; o pacote final `prism/all/all/all` foi reconstruído.
4. A primeira rodada oficial de 20/11/2026 (semente aleatória `f975b9cc…`, 53 candidatos) ficou 0/5 e foi registrada como `Instável`: três casos sem opção Byse, um sem candidato confirmado e um com falha de estrutura (`Identificador do filme ausente no embed da EmbedPlay`). As mensagens de ausência apareceram em `warnings`, sem erro de fronteira.
5. A segunda rodada oficial, com semente aleatória independente `d7d3eb04…` e o mesmo pacote final, resolveu 3/5 (`299534` Vingadores: Ultimato, `372058` Your Name e `346698` Barbie), com uma falha de estrutura (`1398725`) e uma ausência de candidato (`734519`); o status registrado em `providers.md` é `Estável`. A rodada anterior foi substituída no resumo público conforme a regra de manter somente a última rodada.
6. A reavaliação complementar dos cinco IDs da rodada anterior com o pacote final devolveu lista vazia sem erro para todos: `68718`, `361743`, `502356` e `1466115` com `Ausência: nenhuma opção Byse suportada entre as opções dubladas`; `1070514` com `Ausência: nenhum candidato confirmado no catálogo`. Isso confirma que o diagnóstico identifica a etapa e que os retornos vazios não são falhas de rede ou parsing.
7. Limitações: a rodada online comprova o contrato dos streams, não a reprodução no app; a oferta de Byse varia por título e entre execuções; a primeira amostra sem resolução mostra a variância da cobertura. A opção Byse do controle não foi decifrada pela investigação pública, e a assinatura HLS continua sem verificação de reprodução.

