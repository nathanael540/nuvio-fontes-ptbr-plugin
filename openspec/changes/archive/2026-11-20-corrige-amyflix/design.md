# Design

## Context

1. `providers.md` e `test/artifacts/online/2026-11-20T13-21-12-316Z-amyflix-20261120-050c/result.json` concordam: pacote 1.0.0, `prism/all/all/all`, perfil generalista, semente `20261120`, cinco filmes e cinco episódios, todos `Sem resultado`, nenhum stream e nenhuma falha ou aviso registrado. A classificação `Instável` decorre da regra vigente para ambos os tipos sem resolução, não de um erro detectado.
2. O relatório contém resultados finais, não respostas HTTP nem trilhas por etapa. Ele não prova individualmente que cada busca retornou `div.no-result`: candidato incompatível, ambiguidade, episódio ausente e hosts fora do contrato também podem terminar em lista vazia sem erro. A hipótese de amostra fora do nicho é coerente com os títulos sorteados e com a limitação registrada em `providers.md`, mas o relatório, sozinho, não demonstra a ausência dos dez títulos na fonte.
3. `test/online/profiles.json` não define perfil exclusivo para AmyFlix; a amostra generalista não comprova cobertura do catálogo GL. A change arquivada `2026-11-13-adicionar-provedor-amyflix/design.md` registra observações anteriores de filme Ammonite e de episódio com opções jwplayer e Rumble; são evidências históricas, não comprovação da disponibilidade atual ou do pacote final de 20/11.
4. `src/amyflix/catalog.js` valida a estrutura da busca; `extractor.js` filtra tipo, confirma título, escolhe o episódio e resolve opções; `index.js` registra falha final e devolve lista vazia. A spec `amyflix-catalog` já exige distinção entre ausência reconhecida e estrutura inválida e prevê triagem de hosts não suportados.
5. `test/amyflix.test.js` cobre filme Rumble, episódio HLS/MP4, busca vazia e malformada, duplicidade, divergência de ficha, temporada ausente e falhas isoladas. Fixtures e testes offline não demonstram que a fonte atual nem o pacote final continuam funcionando. Esta change executou rede em 20/11/2026 para o diagnóstico direcionado registrado abaixo e refez a rodada oficial após a correção.
6. GitNexus para o checkout local estava um commit atrás e a consulta encontrou índice bloqueado por outro processo; não foi usado para afirmar causalidade nem atualizado durante esta investigação compartilhada. A leitura direta dos arquivos fundamenta as conclusões.

## Goals / Non-Goals

**Goals:**

1. Identificar a etapa de eventual divergência com entradas de nicho verificáveis, distinguindo fonte indisponível, ausência, incompatibilidade e defeito reproduzível.
2. Estabelecer regressões e critérios de validação sem modificar a regra de classificação existente.
3. Documentar o acervo GL observado para selecionar amostras verificáveis e registrar lacunas de cobertura.

**Non-Goals:**

1. Supor um bug, alterar status, ampliar hosts, modificar perfil geral ou contornar autenticação e controles de acesso sem evidência e mudança específica.
2. Tratar uma consulta direta à fonte ou uma fixture como validação do pacote final, nem confundir resolução com reprodução no aplicativo.
3. Expor um catálogo de navegação no Nuvio ou presumir que o levantamento cobre todo o acervo da fonte.

## Decisions

1. **Bloqueio inicial até evidência:** só corrigir depois de selecionar do catálogo GL um filme e uma série com ID TMDB confirmado e, para a série, temporada e episódio publicados. Confrontar títulos e identidade antes de atribuir falha ao código. A investigação de 20/11/2026 confirmou as amostras e um defeito reproduzível no Rumble, então a correção condicional foi liberada; se não fosse possível identificar ambos, o diagnóstico ficaria bloqueado, preservando o levantamento.
2. **Rastreio pontual:** executar o pacote em ambiente isolado e preservar observações sanitizadas de busca, ficha, episódio e famílias de player, sem gravar URLs assinadas, tokens, cookies ou dados pessoais. Usar apenas interfaces públicas, sem bypass; recusa ou bloqueio é limitação, não ausência. Alternativa rejeitada: modificar parser ou incluir hosts a partir da rodada generalista, que não identifica etapa defeituosa.
3. **Correção condicional:** se houver divergência reproduzível com a spec, registrar entrada, resposta sanitizada, resultado esperado e observado; acrescentar fixture real mínima e teste offline que falha antes e passa depois. Se a mudança exigir novo requisito, revisar esta proposta e remover `skip_specs` antes de implementar. Se não houver divergência, não alterar código e registrar o resultado.
4. **Regressões esperadas:** em testes controlados, filme e episódio de nicho com identidade confirmada devem chegar ao player compatível; busca vazia deve permanecer ausência; busca malformada ou HTTP não 2xx deve ser erro registrado; duplicidade não pode selecionar arbitrariamente; uma opção defeituosa não pode eliminar outra válida; todos os hosts não suportados permanecem ausência, conforme spec. Novos testes concretos dependem da causa confirmada.
5. **Revalidação online:** após eventual correção e somente com autorização para alterar código e gerar arquivos, executar `node build.js amyflix`, `npm run lint`, `npm test`, `npm run build:min` e `npm run test:online -- --provider amyflix`, com `TMDB_API_KEY` exclusivamente no ambiente. Coordenar a execução compartilhada para evitar sobrescrever artefatos ou relatório de outra thread. Registrar no `design.md` diagnóstico direcionado separado, com data, entradas e limitações; a rodada oficial só atualiza `providers.md` quando produzida pelo fluxo e identidade oficiais. Não elevar status com sucesso em amostra dirigida nem exigir que títulos fora do acervo resolvam.

6. **Catálogo GL para diagnóstico:** levantar filmes e séries nas interfaces públicas da AmyFlix e registrar o catálogo nesta change, mesmo sem defeito reproduzido. Para cada entrada, registrar título, tipo, ID TMDB quando confirmado, referência pública sanitizada, data da verificação e, para séries, temporada e episódio de referência quando verificados. Separar correspondências confirmadas das pendentes e registrar limitações de cobertura; presença no catálogo não comprova reprodução.

7. **Correção do Rumble:** aceitar a propriedade JavaScript final (`loaded:<função>()`) ao ler `p.f["<id>"]` e ler a qualidade em `ua.tar`. Não ampliar hosts nem alterar a busca por título nesta change; a cobertura de títulos com nome PT divergente fica registrada como limitação e candidata a change futura, com evidência própria.

## Diagnóstico direcionado (2026-11-20)

1. **Catálogo:** 197 títulos observados nas páginas públicas de filmes sáficos, GL completos e GL em lançamento (69 filmes e 128 séries). Desses, 25 têm ID do TMDB confirmado e 12 são localizáveis pela busca do provedor. O levantamento completo, as referências públicas e as lacunas estão em `catalog.md`.
2. **Filme Ammonite (TMDB 568467):** busca, ficha e opções OK. A única opção suportada era `Rum - Legendado`; antes da correção, a opção foi descartada com `Rumble embed sem o objeto p.f["v6xafmq"]`. A causa é o objeto publicado terminar em `,loaded:v()}`, que não é JSON válido, e a qualidade estar em `ua.tar`, não em `u.ua.tar`. Depois da correção, o pacote devolve 1 HLS Rumble 720p. Esse filme não tem opção jwplayer.
3. **Série Love Bound / “Unidas pelo Amor” (TMDB 303533):** a busca por “Love Bound” e pelo título tailandês retorna `no-result`; a fonte só responde a “Unidas pelo Amor”, e o TMDB não publica título alternativo BR. O bloqueio é de identificação por título, não de código. A ficha tem S01E01 com opções jwplayer MP4/HLS e Rumble, mas o pacote não chega a abri-la. Não foi implementado mapeamento de títulos nem busca por ID porque a fonte não publica o TMDB e não há evidência para generalizar.
4. **Série Amor em Construção (TMDB 307831):** busca, ficha, episódio e opções OK. Antes da correção, 2 streams jwplayer (MP4 e HLS) e a opção Rumble descartada de forma isolada. Depois da correção, 3 streams: Rumble HLS 720p, jwplayer MP4 e jwplayer HLS, todos Legendado. O caminho de série funciona e a falha de uma opção não elimina as válidas.
5. **Correção mínima:** `parseRumbleObject` tenta `JSON.parse` e, se falhar, remove apenas a propriedade final com valor de chamada antes de reinterpretar; `bestRumbleQuality` lê `payload.ua.tar`. A fixture foi substituída por uma resposta real sanitizada, com `loaded:v()` e `ua.tar`; os testes de filme e série falhavam antes e passaram depois. Nenhum host novo, contrato ou requisição extra.
6. **Limitações:** a diferença entre “confirmado” e “localizável” é a lacuna principal do nicho; o TMDB não publica o título PT usado pela fonte para várias séries e a busca HTML do AmyFlix não encontra o termo original. O catálogo tem 172 títulos pendentes de confirmação. A amostra dirigida não reproduz QuickJS nem reprodução de vídeo, e as URLs de mídia são assinadas/efêmeras.

## Validação

1. `node build.js amyflix`, `npm run lint` e `npm test` executados após a correção.
2. `npm run build:min` e `npm run test:online -- --provider amyflix --record` executados com `TMDB_API_KEY` somente no ambiente.
3. A rodada oficial de 2026-11-20T14:36Z permaneceu Instável (movie 0/5, tv 0/5, todos sem resultado), porque o perfil generalista não usa o acervo GL. Ela está registrada em `providers.md` e não promove status a partir do diagnóstico direcionado.
4. O diagnóstico dirigido resolveu Ammonite e Amor em Construção no pacote final; Love Bound ficou bloqueada na busca por título. Esses resultados não substituem a rodada oficial nem comprovam reprodução no aparelho.

## Risks / Trade-offs

1. [Perfis não representativos] → A rodada oficial pode permanecer Instável mesmo com sucesso em títulos GL; tratar a representatividade como limitação, não alterar critérios unilateralmente.
2. [Fonte ou mídia muda] → Repetir consultas públicas no momento da validação e manter apenas evidências sanitizadas, sem garantir reprodução ou QuickJS.
3. [Diagnóstico não reproduz defeito] → Manter tarefas de correção condicionais e declarar investigação bloqueada ou sem defeito, conforme resultado. Não ocorreu: o Rumble foi reproduzido em Ammonite e em Amor em Construção.
