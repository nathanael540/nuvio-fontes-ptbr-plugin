# Design

## Context

1. A rodada de 20/11/2026 (`2026-11-20T13-19-23-789Z-limefilmes-20261120-78a9`) avaliou o pacote 1.3.0 em `prism/all/all/all`, semente `20261120`, e terminou Parcial: `movie 0/5` e `tv 4/5`, sem casos de falha ou inconclusivos. Cinco filmes e a novela Avenida Brasil ficaram como `Sem resultado`, com `reason` nulo.
2. O provedor consulta as categorias `filmes` (68), `series` (77) e `colecao` (7819) e busca posts por título PT-BR e original. A leitura atual pede `per_page=20` e avalia somente essa primeira página; cada candidato aprovado na triagem visita a página do post para confirmar IMDb e extrair magnets. O teste offline cobre busca, confirmação, filme, episódio avulso, pacote e ausência, com respostas montadas no próprio teste.
3. Em consulta pública pontual em 20/11/2026, as categorias responderam `count` 4793, 1084 e 32. `Duna: Parte 2` devolveu uma correspondência e o código atual, empacotado em diretório temporário, entregou dois streams de filme, confirmando que o caminho de filme e a extração de magnets continuam funcionando. `Rick and Morty S01E01` entregou um stream de pacote, preservando o caso positivo da rodada.
4. `Divertida Mente` devolveu 23 resultados, com `X-WP-Total: 23`, e o post `Divertida Mente (2015)` é o primeiro da segunda página. O mesmo pacote temporário devolveu zero streams; a mesma execução, com a consulta ampliada para 100 resultados e sem qualquer outra alteração, devolveu quatro streams do filme. A API aceita `per_page=100` e rejeita 101 com HTTP 400.
5. `Oppenheimer`, `Homem-Aranha: Através do Aranhaverso` e `Avenida Brasil` devolveram zero resultados; `The King's Avatar` não teve correspondência e `Pela Glória` devolveu apenas outras obras. `Barbie` devolveu três resultados de outras obras e anos, nenhum de 2023. Esses casos são ausência no catálogo público consultado, não falha do provedor.
6. Comparação caso a caso: `Divertida Mente` é defeito de cobertura; `The King's Avatar`, `Oppenheimer`, `Barbie`, `Homem-Aranha: Através do Aranhaverso` e `Avenida Brasil` são ausência real no catálogo consultado; `Rick and Morty` (1 stream), `Breaking Bad` (3), `The Last of Us` (4) e `Wednesday` (2) são os positivos preservados. Não houve erro HTTP, aviso de opção descartada, caso inconclusivo nem sinal de intermitência nos dez casos: todos terminaram com `warnings` vazio e sem `reason`.
7. A investigação não reproduz o instante exato da rodada nem o QuickJS, e a consulta pública é um recorte datado. Ela não baixa mídia, não mede seeders e não comprova reprodução no app.

## Goals / Non-Goals

**Goals:**

1. Remover a ausência falsa causada pelo recorte fixo da busca, sem alterar a confirmação de identidade nem a extração.
2. Provar a correção com regressão offline que falha no código atual e passa com a janela ampliada.
3. Definir critérios verificáveis de revalidação online e de status, preservando os casos que já funcionam.

**Non-Goals:**

1. Criar mídia ou resolver títulos que não existem no catálogo público.
2. Buscar por títulos alternativos do TMDB, paginar além do limite da API ou trocar a fonte.
3. Contornar controles de acesso, usar serviço com conta ou chave, ou alterar status nesta proposta.

## Decisions

1. **Ampliar a leitura para o limite da API.** A busca passa a pedir 100 resultados por consulta, o máximo aceito pela fonte. A alternativa de ordenar por relevância colocou a correspondência exata na segunda posição no teste pontual, mas continua limitada a 20 e depende da ordenação do mecanismo. Paginar exigiria ler cabeçalhos ou repetir requisições e aumentar a complexidade. A janela de 100 é determinística, usa o mesmo contrato REST já consumido e resolve o caso observado com uma alteração mínima.
2. **Manter a triagem e a extração atuais.** Só a janela de leitura muda. `Duna: Parte 2` já resolvia com a janela atual, e `Divertida Mente` passou a resolver com a mesma extração e apenas a janela maior. Isso reduz o risco de regressão em idioma, qualidade, tamanho, pacote e IMDb.
3. **Regressão com servidor simulado que respeita `per_page`.** A fixture deve conter a resposta real sanitizada com 23 resultados, com a correspondência exata depois da 20ª posição. O `fetch` simulado devolve somente os primeiros N itens conforme o parâmetro recebido; assim o teste falha com a janela antiga e passa com a nova, em vez de mascarar a regressão devolvendo todos os itens.
4. **Cobrir o que funciona.** A suíte mantém filme na primeira página, episódio avulso, episódio em pacote, ausência, IMDb divergente e opção inválida isolada. A correção não pode ganhar filme perdendo série ou fabricando stream.
5. **Revalidar com a mesma semente.** A seleção depende dos catálogos, do perfil e da semente, não do pacote. Repetir `prism/all/all/all` com `20261120` deve reavaliar os mesmos dez casos. O critério de sucesso é `Divertida Mente` (150540) resolvido, os outros quatro filmes ainda ausentes e as séries preservadas; com ao menos um filme e uma série resolvidos, a classificação aplicável passa a Estável, conforme `docs/tests.md`.
6. **Não registrar diagnóstico inventado para ausência.** Consulta sem post compatível continua sendo lista vazia. Quando um caso vazio precisar de triagem, a verificação é refeita pelas interfaces públicas, incluindo a segunda página da busca, e registrada no design da mudança correspondente.

## Risks / Trade-offs

1. **Mais resultados por consulta** → o payload cresce, mas os campos pedidos continuam restritos a `id`, `link`, `title` e `categories`; a visita à página do post continua limitada aos candidatos aprovados pela triagem.
2. **Limite de 100 resultados** → títulos com mais de 100 correspondências ainda podem esconder a exata. Não há evidência desse volume na amostra; medir `X-WP-Total` ao investigar futuras ausências.
3. **Conteúdo e ordenação da fonte mudam** → a evidência é datada. A revalidação online é a única prova de funcionamento; testes offline não alteram status.
4. **Fixture envelhece** → a fixture deve vir da resposta real, sanitizada e comentada com data e consulta, para que a regressão represente a fonte observada.
5. **Rodada online compartilhada** → outra thread pode regenerar os pacotes. A implementação deve coordenar o build final e usar um relatório próprio, sem sobrescrever evidência alheia.
6. **Recorte de cinco títulos** → a proporção da amostra não mede o acervo. A conclusão de ausência vale para os títulos avaliados, não para o catálogo inteiro.

## Migration Plan

1. Capturar a fixture sanitizada da consulta com 23 resultados e escrever a regressão que simula o limite de `per_page`.
2. Aplicar a menor alteração na janela de busca e confirmar que a suíte específica falha antes e passa depois.
3. Executar `npm run lint`, `npm test` e `node build.js limefilmes`; depois, com o build de publicação coordenado, `npm run test:online -- --provider limefilmes` usando `TMDB_API_KEY` somente no ambiente.
4. Registrar a rodada efetiva e o status em `providers.md` na mudança de implementação, conforme a evidência.
5. Reversão: desfazer a alteração da janela e a regressão, reconstruir o pacote e repetir a rodada; não há migração de dados.

## Validation

1. Fixture capturada em 20/11/2026 pela consulta pública `search=Divertida Mente&per_page=100&_fields=id,link,title,categories`, com `X-WP-Total: 23`; o arquivo `test/fixtures/limefilmes/search-divertida-mente-2026-11-20.json` preserva os 23 itens na ordem recebida e contém somente `id`, `link`, `title` e `categories`, sem dados pessoais, cookies, tokens ou URLs assinadas. `Divertida Mente (2015)` (id 1212) está na 21ª posição.
2. A regressão de `test/limefilmes.test.js` simula o servidor devolvendo apenas os N primeiros itens conforme `per_page`. Com a janela anterior de 20 o teste falhou com zero streams; com a janela de 100 passou com um stream de 150540, quality `1080p`. A asserção da janela confirma que nenhuma consulta pede mais de 100 resultados.
3. `npm run lint` terminou limpo; `node --test test/limefilmes.test.js` passou 7/7, preservando filme na primeira página, episódio avulso, episódio em pacote, IMDb divergente, opção inválida isolada e ausência; `npm test` passou 1915/1915; `node build.js limefilmes` gerou `providers/limefilmes.js`, `gdrive/providers/limefilmes.js` e `prism/providers/limefilmes.js`. Nenhum bloco compartilhado foi alterado.
4. Limitação residual: a API aceita no máximo 100 resultados por consulta e rejeita 101 com HTTP 400. Títulos com mais de 100 correspondências ainda podem deixar a exata fora da janela; não há evidência desse volume na amostra, e a posição deve ser medida por `X-WP-Total` nas próximas triagens de ausência.
5. Rodada online `2026-11-20T14-22-47-860Z-limefilmes-20261120-97ad` com `prism/all/all/all`, semente `20261120`: `movie 1/5` e `tv 4/5`, sem falhas ou inconclusivos. `Divertida Mente` (150540) passou a **Resolvido** com 4/4 streams; os outros quatro filmes continuaram ausentes e as séries resolveram como antes. Classificação **Estável** registrada em `providers.md`.

## Open Questions

1. Existem títulos reais com mais de 100 correspondências em que a exata ainda fica fora da janela? Medir `X-WP-Total` e a posição nas próximas triagens de ausência.
2. A busca por títulos alternativos do TMDB aumentaria a cobertura? A amostra atual não demonstrou caso em que a obra exista apenas sob título alternativo; manter fora até haver evidência.
