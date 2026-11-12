# Design

## Context

1. A motivação e o escopo estão em [proposal.md](proposal.md); o contrato observável está em [specs/provider-online-verification/spec.md](specs/provider-online-verification/spec.md).
2. `docs/tests.md` e `AGENTS.md` hoje determinam testes exclusivamente offline. `providers.md` publica contagens Node e relaciona `Estável` à cobertura com fixtures. Essa regra será substituída explicitamente; não há specs principais existentes a modificar.
3. `manifest.json` fornece `supportedTypes`, `enabled`, versão e caminho do pacote. Não tem campo de nicho. `test/providers-catalog.test.js` aceita somente os quatro status atuais e confere a correspondência com o manifest.
4. `build.js` exporta `buildProvider`; as suítes existentes carregam bundles CommonJS em contexto Node e simulam `fetch`. `test/support/basic-html.js` é um substituto mínimo usado nos testes offline, inadequado como evidência de parsing de páginas reais.
5. Os pacotes deixam módulos externos fora do bundle. Há uso real de `cheerio-without-node-native` em vários provedores; o `package.json` atual não fornece essa dependência para uma execução online em Node. O carregador precisa resolver módulos reais, sem substituir os dados da fonte.
6. `getStreams` captura erros e retorna `[]`. Distinguir falha de ausência exige observar o console de cada caso. Provedores que buscam metadados também precisam receber `TMDB_API_KEY`, global fornecida pelo app no uso normal.
7. Existem suítes legadas que referenciam diretórios ausentes, como `test/scenarios/` e `test/maestro/`. Elas não constituem infraestrutura online utilizável nem evidência após o reset; eventuais falhas serão declaradas na validação, sem restaurar a plataforma anterior como parte desta mudança.

## Goals / Non-Goals

### Goals

1. Executar os pacotes com rede real por comando explícito, preservando as rotinas offline de desenvolvimento.
2. Separar preparação, seleção, execução e registro para que regras de amostragem e classificação possam ser testadas sem rede, sem gerar evidência pública fictícia.
3. Manter o resumo público em um único lugar, `providers.md`, e os relatórios transitórios em `test/artifacts/`.
4. Identificar exatamente o código e os dados usados em cada rodada, sem depender apenas da versão semântica do provedor.

### Non-Goals

1. Reproduzir vídeos, abrir o app, validar QuickJS, medir disponibilidade de seeders ou baixar mídia por P2P.
2. Remover suítes offline, dispensar lint/build ou reescrever lógica dos provedores para fazê-los passar na amostra.
3. Criar serviço de monitoramento, agenda automática, infraestrutura de CI ou ranking dinâmico consultado a cada rodada.
4. Inferir o tamanho total do acervo a partir da amostra ou exigir um sucesso por tag.

## Decisions

### 1. Dois arquivos de títulos com tamanho mínimo, sem teto

1. Usar `test/online/catalogs/movie.json` e `test/online/catalogs/tv.json`. Cada documento tem versão de esquema, revisão, data de curadoria, referência pública de popularidade e lista de títulos. O tamanho mínimo é 20 títulos distintos por documento; não impor máximo nem particionar catálogos por nicho.
2. Cada título tem `tmdbId`, `title`, `year` e `tags`; `tv` acrescenta `season` e `episode` positivos de episódio lançado. Filmes não recebem essas coordenadas. A unicidade é por ID dentro do catálogo; o mesmo número de TMDB em `movie` e `tv` não implica duplicidade entre tipos.
3. Selecionar e conferir os títulos na implementação usando referências públicas de popularidade, anotando fonte e data. Tags são curadas explicitamente; `anime` e `dorama` são exemplos iniciais, com vocabulário extensível em kebab-case. O ranking é um recorte datado, sem promessa de atualização automática.
4. Manter pelo menos cinco elegíveis para cada perfil de nicho efetivamente configurado. Os 20 mínimos são por catálogo inteiro, não por tag. Quando novos nichos exigirem mais candidatos, acrescentar títulos ao catálogo existente.
5. Alternativa considerada: quatro ou mais arquivos por categoria e consulta ao ranking durante o teste. Dois arquivos com tags atendem à decisão do usuário, evitam duplicação e preservam comparabilidade.

### 2. Perfil de nicho na infraestrutura de testes

1. Usar `test/online/profiles.json` para mapear IDs de provedores para um `exclusiveTag` opcional. Sem entrada ou com perfil generalista explícito, aplicar somente `supportedTypes` do manifest; não deduzir nicho pelo nome, descrição ou pelos primeiros resultados.
2. Um perfil exclusivo exige correspondência da tag no candidato antes do sorteio. Nesta mudança, um perfil tem no máximo uma tag exclusiva; expressões com múltiplas tags e regras de união/interseção ficam fora do escopo.
3. Validar IDs de provedores e disponibilidade de cinco candidatos após o filtro. Tag desconhecida ou conjunto insuficiente gera impedimento de preparação, sem redução da amostra nem troca silenciosa de nicho.
4. Alternativa considerada: adicionar tags ao manifest publicado. A configuração separada evita alterar o contrato do app por uma necessidade do teste.

### 3. Seleção independente dos resultados online

1. Fixar a amostra em cinco títulos por tipo suportado. Normalizar candidatos por ID antes de usar um embaralhamento com gerador pseudoaleatório determinístico, de algoritmo versionado, e selecionar sem reposição.
2. Gerar uma semente quando omitida e aceitar `--seed` para repetição. Registrar semente, algoritmo, hash dos dois catálogos, hash do perfil efetivo e a seleção completa com título, ano, tags e coordenadas.
3. Preparar toda a seleção antes da primeira consulta. Executar os cinco casos de cada tipo sequencialmente, mesmo depois de sucesso. Falha ou lista vazia não autoriza ressorteio; uma nova tentativa tem outro ID e substitui o resumo anterior.
4. Alternativa considerada: encerrar no primeiro sucesso ou escolher somente títulos que a fonte já demonstrou oferecer. Isso impediria produzir o indicativo padronizado da amostra solicitada.

### 4. Runner Node explícito e pacote identificado por hash

1. Acrescentar `npm run test:online -- --provider <id> [--seed <valor>] [--record]`, com ponto de entrada `test/online/run.mjs`, fora do padrão `*.test.*` descoberto por `npm test`.
2. Ler o pacote base já gerado em `providers/<id>.js`, pelo caminho validado do manifest, e registrar seu SHA-256 e versão do provedor. O fluxo documentado executa o build antes do teste; o runner não altera código publicado nem reconstrói silenciosamente os arquivos que pretende verificar.
3. Carregar o pacote em contexto dedicado por caso, com as globais necessárias, `fetch` real e `require` limitado aos módulos externos permitidos. Instalar `cheerio-without-node-native` como dependência de desenvolvimento e adicionar outros módulos reais permitidos somente se um pacote avaliado exigir; aliases de cheerio apontam para a mesma dependência. Não usar `basic-html`, fixtures, fallback de metadados ou módulos falsos na execução online.
4. O `fetch` do runner encaminha chamadas reais, preservando argumentos, resposta, redirecionamento e leitura binária. Um adaptador pode observar somente a categoria da falha e aplicar cancelamento de execução, sem substituir respostas. Não fazer sondas adicionais de reprodução dos streams retornados.
5. Usar `TMDB_API_KEY` do ambiente local e disponibilizá-la ao pacote como global. Uma consulta TMDB sem essa configuração é impedimento local, não falha atribuída à fonte; provedores que resolvem por ID sem consultar TMDB podem ser avaliados sem chave. Nunca inventar chave nem reaproveitar a chave fictícia dos testes unitários.
6. Isolar cada execução em worker para encerrar casos presos sem mudar o provedor. Adotar limite externo configurável de 120 segundos por caso; expiração resulta em `Inconclusivo`, preserva o restante da rodada e não equivale a fonte quebrada. O limite pertence ao harness Node, não ao runtime publicado, que continua sem timeout próprio.
7. A evidência identifica o pacote base efetivamente executado. As variantes de formatação continuam sendo verificadas no desenvolvimento; não gerar três rodadas de rede nem afirmar validação online de bytes que não foram executados.
8. Alternativa considerada: reutilizar testes com fixtures ou restaurar a automação de dispositivo. A primeira não observa a fonte atual e a segunda adicionaria infraestrutura e validação de reprodução fora do objetivo.

### 5. Classificação mínima e independente de cobertura

1. Por caso, contar streams retornados e aproveitáveis separadamente; verificar apenas o contrato mínimo de saída, sem comparação com uma lista fixa de URLs ou expectativa de qualidade. Aceitar HTTP(S), magnet e `torrent://` compatíveis com o contrato documentado. Trinta streams de um título contam como um título resolvido.
2. `Resolvido`: pelo menos um stream aproveitável. `Sem resultado`: lista vazia sem erro. `Falha`: erro do provedor, rejeição, saída inválida ou nenhuma opção aproveitável. `Inconclusivo`: preparação local insuficiente, indisponibilidade comprovadamente local ou execução interrompida/expirada. Aviso de opção independente não invalida outro stream aproveitável.
3. Capturar `console.error` e `console.warn` por caso, sanitizando os argumentos antes de gravá-los. Erro capturado seguido de `[]` continua sendo falha; não classificá-lo como ausência normal. Resultados aproveitáveis têm precedência sobre falhas de outras opções.
4. Por tipo, ao menos um sucesso comprova funcionamento, mesmo que existam outros casos falhos ou inconclusivos. Zero sucessos com todos os cinco casos concluídos como ausência/falha comprova falta de resolução na rodada. Zero sucessos com caso inconclusivo mantém o tipo indeterminado.
5. Por provedor, conservar `Estável` como nome público de funcionamento em todos os tipos; `Parcial` indica ao menos um tipo comprovado e outro concluído sem resolução; `Instável` indica todos os tipos concluídos sem resolução. Sem conclusão suficiente, usar `Não verificado`, salvo evidência válida anterior da mesma identidade de avaliação. `Desativado` continua correspondendo a `enabled: false`.
6. Definir identidade de avaliação por versão do pacote, tipos suportados, perfil efetivo e revisões dos catálogos. O resumo público guarda só a última execução; uma tentativa inconclusiva substitui a conclusão anterior e passa a `Não verificado`. Outra versão, perfil ou revisão de catálogo não herda aprovação: a tabela fica `Não verificado` até uma nova rodada. Hashes ficam apenas no relatório transitório, não no resumo público.
7. Apresentar `movie 1/5` e `tv 1/5` como títulos resolvidos na amostra, com quantidades de ausência, falha e inconclusão disponíveis no detalhe. Não calcular percentual de acervo total nem publicar contagens de testes unitários.
8. Alternativa considerada: `Parcial` para qualquer resultado inferior a 5/5. Foi descartada porque o limiar acordado é um sucesso por tipo e a proporção serve apenas como indicativo indireto de acervo.

### 6. Relatório transitório e resumo público no Markdown

1. Salvar um relatório sanitizado em `test/artifacts/online/<run-id>/result.json`, inclusive para falhas de preparação. O relatório contém somente metadados permitidos, casos, contagens, classificação e motivos sanitizados; não persistir objetos de stream, URLs, corpos de resposta ou cabeçalhos.
2. Sem `--record`, produzir relatório e resumo no terminal. Com `--record`, validar a identidade contra os arquivos atuais, substituir a rodada da seção do provedor e atualizar a linha da tabela em `providers.md`. Esse modo registra também resultados negativos e inconclusivos, sem exigir aprovação do teste para guardar a evidência.
3. O Markdown é a fonte versionada do resumo. Usar blocos delimitados por comentários próprios da verificação online, com estrutura estável de listas numeradas, conservando o cabeçalho do provedor e `**Status: <status>.**`. Cada bloco mantém somente a última rodada, com data ISO 8601 com fuso, ID, versão do pacote, perfil, revisões dos catálogos, semente, algoritmo e casos individuais. Hashes não aparecem no resumo público. A tabela exibe `🟢` para `Estável`, `🔵` para `Parcial`, `🔴` para `Instável`, `🟠` para `Não verificado` e `⚫` para `Desativado`, e a data da última verificação em `AAAA-MM-DD`.
4. O registrador só modifica a linha e o bloco do provedor selecionado; verifica a estrutura, rejeita IDs duplicados com conteúdo divergente e não duplica a mesma rodada em uma segunda importação. Uma rodada nova apaga a anterior do bloco. Usar escrita atômica após validar o documento completo. Não criar um segundo resumo versionado em JSON nem mover relatórios para fora de `test/artifacts/`.
5. Atualizar `test/providers-catalog.test.js` para validar status visual, data, escopo da seção, uma única rodada, correspondência com manifest/catálogos/perfil, casos e ausência de hashes. Esses testes conferem consistência documental usando dados controlados; não alteram a lista pública nem atribuem funcionamento real.
6. Saída do comando distingue funcionamento comprovado (código 0), falta de resolução por tipo (código 1), avaliação inconclusiva (código 2) e argumento/preparação inválidos (código 3). Erros nas outras amostras não mudam o código 0 se todos os tipos já tiverem sucesso. Falha em persistir um registro solicitado é erro explícito, nunca sucesso silencioso.
7. Alternativa considerada: manter um histórico completo de todas as rodadas em `providers.md` ou em `test/`. O histórico completo foi descartado a pedido do mantenedor para deixar o catálogo curto e focado na última evidência; o relatório transitório continua disponível em `test/artifacts/` para auditoria local. Atualizar a regra de documentação para que o resumo operacional fique em `providers.md`, mantendo no design somente decisões e validação da mudança.

## Risks / Trade-offs

1. Fonte, acervo e rede mudam após o teste → manter data e versão do pacote visíveis, sem promessa de disponibilidade contínua.
2. Tag com poucos candidatos → bloquear preparação com mensagem clara e ampliar o catálogo existente, sem alterar elegibilidade automaticamente.
3. Node e bibliotecas reais não reproduzem QuickJS → conservar lint e convenções de runtime; a evidência comprova resolução no harness Node, sem afirmar reprodução no app.
4. Dependência TMDB exige chave local → usar a única chave externa já permitida pelo projeto e registrar falta de configuração como inconclusão, sem segredo no Git.
5. Mensagens podem carregar URLs e credenciais → relatórios usam campos permitidos e saneamento antes da primeira persistência; casos unitários exercitam mensagens com tokens fictícios.
6. Execuções completas geram mais consultas que encerrar após um sucesso → executar sequencialmente e sem tentativas automáticas para concluir o indicativo de acervo sem ampliar carga por ressorteio.
7. O resumo público guarda só a última rodada → a data curta e a versão indicam a atualidade; o relatório transitório em `test/artifacts/` preserva a auditoria local. Não manter histórico completo no Markdown, por decisão do mantenedor.
8. Dependências ou suítes antigas podem falhar independentemente da mudança → verificar o estado inicial durante a implementação e declarar falhas preexistentes; não removê-las para obter aprovação artificial.

## Migration Plan

1. Implementar e testar catálogos, seleção, carregador e registrador em arquivos de teste e diretórios temporários, sem alterar status públicos a partir de resultados simulados.
2. Acrescentar dependência real de HTML e scripts online; confirmar `npm test` sem rede, lint, builds aplicáveis e auditoria de dependências.
3. Atualizar conjuntamente `AGENTS.md`, `README.md`, `docs/arch.md`, `docs/tests.md` e `test/README.md`: testes unitários continuam exigidos no desenvolvimento, enquanto a verificação de funcionamento para publicação usa exclusivamente evidência online.
4. Migrar `providers.md` removendo contagens Node, observações de cobertura e hashes. Provedores habilitados sem evidência online válida ficam `Não verificado`; desabilitados permanecem `Desativado`. Não inventar rodadas para preencher o resumo nem utilizar evidência anterior ao reset.
5. Rodar a verificação real para os provedores habilitados com os pacotes atuais, registrando sucessos, ausências, falhas e impedimentos. Se a chave ou a rede não estiver disponível, declarar o que não foi verificado e manter o status coerente; dados offline não substituem essa etapa.
6. Antes de publicar uma atualização de provedor, executar build, a amostra online e o registro correspondentes ao pacote final. Apenas o critério de um sucesso por tipo comprova sua resolução para publicação; lint, build e testes de desenvolvimento continuam verificações técnicas independentes.
7. Reversão: reverter a implementação e os documentos em conjunto. Não reinterpretar evidência online como aprovação unitária nem manter automaticamente um status de funcionamento para outro pacote.

## Conferência dos catálogos

1. Em 12/11/2026, os catálogos foram montados a partir das listas públicas de popularidade do TMDB (`movie` e `tv`) e os IDs, títulos e anos foram conferidos em consultas públicas ao Wikidata: `P4947` (filme TMDB), `P4983` (série TMDB), `P577`/`P580` (data) e rótulos em português/inglês.
2. `movie.json` ficou com 35 títulos, sendo 5 com a tag `anime`; `tv.json` ficou com 35 títulos, sendo 6 com a tag `anime`, 6 com a tag `dorama` e 23 generalistas. Todos os títulos de série usam a primeira temporada e o primeiro episódio, ambos já lançados.
3. Nenhum provedor atual foi confirmado como exclusivo de anime ou dorama. O filtro de `baixarapido` só exclui esses conteúdos de um catálogo geral; por isso `profiles.json` permanece sem entradas e todos os provedores são avaliados como generalistas.
4. A revisão `2026-11-12.1` dos dois catálogos e dos perfis acompanha os arquivos versionados; o teste `test/online-catalog.test.js` confere o mínimo de 20, a unicidade, as coordenadas e a configuração de nichos.

## Migração dos critérios públicos

1. `providers.md` foi migrado sem converter os registros de cobertura offline em rodadas online: todos os provedores habilitados ficaram `Não verificado` e nenhum bloco de resumo foi inventado. Não há provedor com `enabled: false` no manifest atual.
2. As suítes unitárias e fixtures existentes foram preservadas como recursos de desenvolvimento. `npm test` não escreve em `providers.md`; `test/providers-catalog.test.js` apenas lê o documento e confere a consistência documental com manifest, catálogos, perfis e resumo.
3. `README.md`, `AGENTS.md`, `docs/arch.md`, `docs/tests.md` e `test/README.md` separam a obrigação de testes offline de desenvolvimento da evidência online exigida para funcionamento e publicação.

## Validação da implementação

### Comandos e falhas preexistentes (task 6.1)

1. `npm run lint` passou sem erros.
2. `npm test` executou 1008 testes: 984 passaram e 24 falharam. Todas as 24 falhas são preexistentes e vêm de suítes legadas que importam módulos ausentes desde o reset: `provider-session.test.js` (5), `provider-validation.test.js` (10), `scenario-inventory.test.js` (2), `scenarios.test.js` (5) e `server.test.js` (2). Os caminhos ausentes são `test/maestro/prepare-session.mjs`, `test/maestro/run-provider-validation.mjs` e `test/scenarios/index.mjs`. Nenhuma falha nova foi introduzida pelas suítes da verificação online.
3. `npm run build` gerou os 14 provedores no arquivo base, em `gdrive/` e em `prism/`, além dos manifests de formato, sem alterar nenhum arquivo gerado versionado.
4. `npm audit` reportou 3 vulnerabilidades altas, todas na cadeia de desenvolvimento `cheerio-without-node-native` → `css-select` → `nth-check` (`GHSA-rp65-9cf3-cjxr`), sem correção disponível. Forçar `nth-check@2` quebra seletores `:nth-child` usados pelo cheerio 1.2 e foi descartado. A dependência não entra no pacote publicado; a exceção ficou registrada em `docs/arch.md`.

### Rodadas online reais (task 6.2)

1. Em 12/11/2026, após `npm run build`, todos os 14 provedores habilitados foram executados com `--seed 20261112 --timeout 30000 --record`. A semente fixa foi usada para comparabilidade; o limite menor foi adotado apenas no harness para evitar espera longa, sem alterar o padrão documentado de 120 segundos.
2. Provedores que funcionaram já na primeira execução, sem `TMDB_API_KEY`:
   1. `megaembed` 1.3.0 — `movie 5/5`, `tv 5/5`; rodada `2026-11-12T16-04-55-231Z-megaembed-20261112-0822`.
   2. `fireplayer` 1.3.0 — `movie 4/5`, `tv 3/5`; as três falhas foram `hash ausente` na fonte, sem impedir o funcionamento por tipo; rodada `2026-11-12T16-05-50-171Z-fireplayer-20261112-d4da`.
   3. `redeflix` 1.3.0 — `movie 5/5`, `tv 3/5`; os dois casos restantes foram `Sem resultado`; rodada `2026-11-12T16-06-29-960Z-redeflix-20261112-a22f`.
   4. `fshd` 1.2.0 — `tv 3/5`; os dois casos restantes foram `Sem resultado`; rodada `2026-11-12T16-07-12-442Z-fshd-20261112-cef3`.
3. Na primeira execução, sem `TMDB_API_KEY`, 10 provedores ficaram `Inconclusivo` e foram registrados como `Não verificado`: `dooplay`, `filmestorrent`, `limefilmes`, `baixarapido`, `baixarfilmestorrent123`, `pobreflix-nixplay`, `pobreflixtv`, `betor`, `starckfilmes` e `therarbg`.
4. Depois de recuperar a chave do escopo `User` do Windows e confirmar HTTP 200 no TMDB, os 10 provedores foram reexecutados com a mesma semente e limite, com a chave disponível apenas nos processos filhos, e registrados:
   1. `dooplay` — `Estável`, `movie 2/5`, `tv 3/5`; rodada `2026-11-12T16-20-12-031Z-dooplay-20261112-0bb6`.
   2. `filmestorrent` — `Estável`, `movie 5/5`, `tv 4/5`; rodada `2026-11-12T16-22-53-149Z-filmestorrent-20261112-91d7`.
   3. `limefilmes` — `Estável`, `movie 4/5`, `tv 1/5`; rodada `2026-11-12T16-24-41-718Z-limefilmes-20261112-c036`.
   4. `baixarapido` — `Estável`, `movie 5/5`, `tv 3/5`; rodada `2026-11-12T16-25-43-255Z-baixarapido-20261112-7a46`.
   5. `baixarfilmestorrent123` — `Instável`, `movie 0/5`, `tv 0/5`, todos `Sem resultado`; rodada `2026-11-12T16-27-44-408Z-baixarfilmestorrent123-20261112-b622`.
   6. `pobreflix-nixplay` — `Estável`, `movie 5/5`, `tv 3/5`; rodada `2026-11-12T16-28-02-958Z-pobreflix-nixplay-20261112-3010`.
   7. `pobreflixtv` — `Instável`, `movie 0/5`, `tv 0/5`, todos `Falha`; rodada `2026-11-12T16-28-46-905Z-pobreflixtv-20261112-11dd`.
   8. `betor` — `Parcial`, `movie 0/5`, `tv 1/5`; rodada `2026-11-12T16-29-59-251Z-betor-20261112-8ff9`.
   9. `starckfilmes` — `Estável`, `movie 5/5`, `tv 2/5`; rodada `2026-11-12T16-30-11-591Z-starckfilmes-20261112-1c95`.
   10. `therarbg` — `Instável`, `movie 0/5`, `tv 0/5`, todos `Sem resultado`; rodada `2026-11-12T16-30-32-362Z-therarbg-20261112-3685`.
5. As rodadas inconclusivas iniciais foram substituídas pelas rodadas com chave no resumo; os relatórios transitórios permanecem em `test/artifacts/`. Nenhuma falha de rede genérica foi observada; as falhas e ausências acima são resultados reais das fontes. A varredura de todos os relatórios em `test/artifacts/online`, incluindo as reexecuções posteriores, não encontrou a chave, URLs, magnets, tokens ou listas completas de streams.

### Reexecução e sanitização (task 6.3)

1. O MegaEmbed foi reexecutado com a mesma semente `20261112` em `2026-11-12T16-07-34-832Z-megaembed-20261112-b457`. A seleção foi idêntica à rodada `2026-11-12T16-04-55-231Z-megaembed-20261112-0822`: filmes `149`, `13`, `120`, `24428` e `150540`; séries `82856`, `94997`, `60574`, `1418` e `1396`.
2. O ID mudou, a segunda rodada substituiu a primeira no bloco do provedor e a tabela passou a exibir a data da mais recente. As contagens de streams variaram entre as execuções (por exemplo, House of the Dragon passou de 5/5 para 6/6), como esperado para resultados online; a seleção não mudou.
3. Os relatórios gerados durante a validação e nas reexecuções posteriores foram varridos sem ocorrência de URL, magnet, `torrent://`, token, segredo, chave TMDB ou lista completa de streams. A tentativa descartada teve um defeito de montagem do hash do pacote no relatório, foi removida antes de produzir evidência e a correção foi coberta por teste; ela não aparece no resumo público.

### Cenários da spec (task 6.5)

1. Verificados por teste automatizado:
   1. Catálogos acima do mínimo e abaixo do mínimo; duplicação de ID; coordenadas de episódio; tags; provedor desconhecido; perfil exclusivo com cinco elegíveis.
   2. Reprodução da seleção, ausência de reposição, menos de cinco elegíveis e provedor somente `tv`.
   3. Lista vazia sem erro, erro capturado com lista vazia, saída inválida, aviso com stream válido, falha de opção com outro stream e todos os estados de agregação.
   4. 30 streams de um filme valendo um título, denominador cinco e ausência de compensação entre tipos.
   5. Identidade por versão/tipos/perfil/revisão de catálogo, substituição da rodada anterior, ausência de herança de aprovação e não duplicação da mesma rodada.
   6. Sanitização de URL assinada, credencial fictícia e relatório de falha de preparação.
2. Verificados em rodada online real:
   1. Pacote publicado executado com rede real, cinco títulos por tipo, em todos os 14 provedores. `MegaEmbed`, `FirePlayer`, `RedeFlix`, `FSHD`, `DooPlay`, `Filmestorrent`, `LimeFilmes`, `Baixa Rápido`, `PobreFlix NixPlay` e `Starck Filmes` comprovaram funcionamento; `BeTor` ficou `Parcial`; `Baixar Filmes Via-Torrent`, `Pobreflix HD` e `TheRARBG` ficaram `Instável`.
   2. Um sucesso por tipo comprovando funcionamento mesmo com proporções baixas (FirePlayer `4/5` e `3/5`; RedeFlix `5/5` e `3/5`; LimeFilmes `4/5` e `1/5`; BeTor `0/5` e `1/5` com status `Parcial`).
   3. Ausência sem erro e falha de opção real, sem compensação entre tipos.
   4. Reexecução com a mesma semente, novo ID, substituição da rodada anterior e relatório sanitizado.
   5. Credencial ausente nas primeiras rodadas de 10 provedores, registrada como `Inconclusivo` e `Não verificado`, seguida de reexecução com a chave recuperada do ambiente do Windows e validação HTTP 200 no TMDB.
   6. Torrent retornado nos provedores de torrent que resolveram títulos (por exemplo, Starck Filmes e BeTor), sem iniciar download P2P nem exigir seeders.
3. Não executados nesta validação, com motivo:
   1. `Fonte mudou após a gravação de fixtures`: exigiria alterar a fonte; as rodadas online já observaram o estado atual e as fixtures não foram usadas como evidência.
   2. `Provedor exclusivo de animes` e `Anime sem resolução`: nenhum provedor atual foi confirmado como exclusivo; o comportamento foi coberto com perfil sintético nos testes.
   3. `Menos de cinco elegíveis` e `Catálogo abaixo do mínimo`: os catálogos reais estão válidos e completos; a recusa foi coberta com dados temporários.
   4. `Tentativa inconclusiva após sucesso`: não ocorreu naturalmente nas fontes; o comportamento foi coberto com Markdown temporário.
   5. `Estrutura sem opção aproveitável` e `Erro com URL assinada`: cobertos por testes, sem forçar uma fonte real a produzir esses estados.
4. A implementação não alterou `src/`, `manifest.json` nem `build.js`, e o contrato do app permanece o mesmo. O harness online não reproduz vídeo, não baixa mídia por P2P e não mede seeders; ele apenas executa `getStreams` e valida os campos devolvidos.

### Ajustes de apresentação (task 7)

1. A tabela e a seção usam `🟢` para `Estável`, `🔵` para `Parcial`, `🔴` para `Instável`, `🟠` para `Não verificado` e `⚫` para `Desativado`. A coluna `Última verificação` mostra somente `AAAA-MM-DD`.
2. `recordRun` substitui o bloco inteiro do provedor a cada rodada; apenas a última execução permanece. O resumo público não exibe hashes de pacote, catálogo ou identidade; eles continuam no relatório transitório.
3. O `providers.md` existente foi migrado para o novo formato a partir dos relatórios reais, preservando os casos e as coordenadas de episódio e removendo as rodadas antigas.
4. A suíte documental passou a rejeitar mais de uma rodada no bloco, hash de 64 caracteres, URL/credencial e divergência de status/data. `npm run lint` passou; `npm test` executou 1008 testes, com 984 acertos e as mesmas 24 falhas legadas; `openspec validate --strict` passou.
5. Em 12/11/2026, os quatro provedores não estáveis foram reexecutados com a mesma semente `20261112`: `betor` continuou `Parcial` (`movie 0/5`, `tv 1/5`), `baixarfilmestorrent123` continuou `Instável` (`0/5`, `0/5`), `pobreflixtv` continuou `Instável` (todas as opções em `Falha`) e `therarbg` continuou `Instável` (`0/5`, `0/5`). As novas rodadas substituíram as anteriores no resumo; a varredura dos 38 relatórios não encontrou chave, URL, magnet, token ou lista de streams.
6. Com uma nova semente (`20261113`), a amostra mudou e os status passaram a: `betor` `Instável` (`0/5`, `0/5`), `baixarfilmestorrent123` `Parcial` (`movie 1/5`, `tv 0/5`), `pobreflixtv` `Instável` (todas as opções em `Falha`) e `therarbg` `Instável` (`0/5`, `0/5`). A tabela passou a refletir essas últimas rodadas; a varredura dos 42 relatórios não encontrou chave, URL, magnet, token ou lista de streams.





