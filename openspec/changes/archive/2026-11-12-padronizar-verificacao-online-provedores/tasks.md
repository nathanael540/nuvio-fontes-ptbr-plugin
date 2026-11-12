# Tasks

## 1. Catálogos de referência e perfis de nicho

- [x] 1.1 Criar `test/online/catalogs/movie.json` e `tv.json` com no mínimo 20 títulos reais distintos cada, fonte pública de popularidade, data e revisão; verificar IDs, anos e episódios lançados nas referências consultadas e registrar a conferência no design da mudança.
- [x] 1.2 Implementar validação dos catálogos e `test/online/profiles.json`, mantendo o manifest como fonte de tipos suportados; cobrir em testes offline o mínimo de 20, aceitação acima do mínimo, duplicação de ID, coordenadas inválidas, tags e IDs de provedores desconhecidos.
- [x] 1.3 Configurar somente os nichos exclusivos confirmados das fontes atuais e garantir cinco candidatos elegíveis por tipo para cada perfil; verificar que um generalista permanece sem filtro e que um exclusivo não recebe títulos de outro nicho.
- [x] 1.4 Documentar a curadoria, o mínimo de 20 sem máximo e a configuração de nichos em `test/README.md` e `docs/tests.md`; conferir os exemplos contra os arquivos e validadores entregues neste grupo.

## 2. Amostragem e critérios de classificação

- [x] 2.1 Implementar seleção determinística de cinco candidatos distintos por tipo após o filtro, com semente e algoritmo versionado; testar reprodução, ausência de reposição, catálogo com menos de cinco elegíveis e provedor somente `tv`.
- [x] 2.2 Implementar classificação por título e contagem de streams aproveitáveis conforme o contrato; testar lista vazia sem erro, erro capturado com lista vazia, saída inválida e aviso de uma opção acompanhado de outro stream válido.
- [x] 2.3 Implementar agregação por tipo e por provedor; testar `movie 1/5` e `tv 1/5` como `Estável`, sucesso em apenas um tipo como `Parcial` quando o outro terminou sem resolução, zero resoluções concluídas como `Instável` e indeterminação sem evidência como `Não verificado`.
- [x] 2.4 Implementar indicativo de títulos resolvidos separado da quantidade de streams e do funcionamento; testar que 30 streams de um único filme contam como um título e não compensam zero resultados `tv`, e que um inconclusivo não diminui o denominador de cinco.
- [x] 2.5 Atualizar os critérios em `docs/tests.md`, distinguindo testes de desenvolvimento, funcionamento online, indicativo da amostra e prioridade de `Desativado`; verificar os exemplos documentados com os casos automatizados deste grupo.

## 3. Execução online isolada e relatório sanitizado

- [x] 3.1 Acrescentar a dependência de desenvolvimento real `cheerio-without-node-native` e o script `test:online` em `package.json`, atualizando o lockfile; verificar instalação, resolução do módulo e ausência de execução online por `npm test`.
- [x] 3.2 Implementar o carregador do pacote base indicado pelo manifest, com SHA-256, contexto por caso e módulos externos permitidos; testar carregamento CommonJS, módulo não permitido, pacote ausente e identificação dos bytes efetivamente executados, sem usar `basic-html` no caminho online.
- [x] 3.3 Conectar `fetch` real e injeção local de `TMDB_API_KEY`, sem fallback de respostas; testar no limite do harness a preservação de respostas binárias/redirecionamentos e a distinção entre chave ausente e erro da fonte, sem exigir chave para um provedor que não consulta TMDB.
- [x] 3.4 Implementar worker por caso e limite externo configurável de execução, sem editar timeout dos provedores; testar encerramento como `Inconclusivo`, continuidade dos demais casos e conclusão dos cinco títulos mesmo após o primeiro sucesso.
- [x] 3.5 Implementar captura e saneamento de console e relatório permitido em `test/artifacts/online/<run-id>/result.json`; testar mensagens com URLs assinadas, credenciais fictícias e falhas de preparação, verificando ausência de streams, respostas brutas e segredos persistidos.
- [x] 3.6 Implementar argumentos, resumo e códigos de saída do runner; testar sucesso com um título por tipo apesar de falhas nos outros, falta de resolução, inconclusão e argumentos inválidos.
- [x] 3.7 Documentar build prévio, comando online, semente, chave por ambiente, limite do harness e limitações Node em `test/README.md` e `docs/arch.md`; executar o comando de ajuda e conferir que exemplos não exigem segredo em arquivo versionado.

## 4. Histórico e consistência de providers.md

- [x] 4.1 Implementar a opção `--record` para acrescentar rodada em bloco delimitado do provedor e atualizar somente sua linha da tabela; testar em Markdown temporário a preservação de outras seções, resultados negativos, ausência de modificação sem a opção e escrita atômica.
- [x] 4.2 Registrar data com fuso, ID, versão/hash do pacote, catálogos, perfil, semente e resultados por título com coordenadas; verificar por teste de leitura e escrita que uma segunda rodada mantém todos os dados da primeira e que repetir o mesmo ID não duplica a rodada.
- [x] 4.3 Implementar correspondência da identidade da avaliação e preservação explícita de evidência anterior diante de tentativa inconclusiva equivalente; testar troca de pacote, tipos, perfil ou catálogo sem herança de aprovação, e preservação da data original quando aplicável.
- [x] 4.4 Atualizar `test/providers-catalog.test.js` com o novo status, correspondência de cada seção e consistência entre tabela e última rodada; testar documentos temporários divergentes sem produzir evidência pública a partir de dados simulados.
- [x] 4.5 Documentar a estrutura do registro em `test/README.md` e seu significado em `docs/tests.md`; alterar em `AGENTS.md` a regra de localização dos registros operacionais para `providers.md`, mantendo decisões e validação da mudança no design, e conferir a coerência das referências.

## 5. Migração dos critérios públicos

- [x] 5.1 Atualizar `README.md` e `AGENTS.md` para separar a obrigação de testes offline de desenvolvimento da evidência online exigida para funcionamento/publicação; revisar `docs/arch.md`, `docs/tests.md` e `test/README.md` para eliminar afirmações globais de que toda verificação ocorre sem internet.
- [x] 5.2 Migrar `providers.md` removendo contagens Node e justificativas de cobertura offline; verificar que habilitados sem rodada online ficam `Não verificado`, desabilitados ficam `Desativado` e nenhum registro online foi inventado ou recuperado como evidência anterior ao reset.
- [x] 5.3 Preservar as suítes unitárias e fixtures existentes como recursos de desenvolvimento; verificar que seus resultados não alteram `providers.md` nem fornecem entrada à classificação pública, mantendo apenas as conferências de consistência documental.

## 6. Verificação integrada da mudança

- [x] 6.1 Executar `npm run lint`, `npm test`, builds dos provedores avaliados e `npm audit`; registrar resultados e falhas preexistentes individualmente no design, sem desativar suítes ou restaurar infraestrutura legada fora do escopo para produzir aprovação artificial.
- [x] 6.2 Executar uma rodada online real para cada provedor habilitado após o build, com `--record`, conferindo os cinco títulos por tipo aplicável; registrar os resultados reais e declarar explicitamente qualquer avaliação impedida por configuração ou rede, sem substituí-la por fixture.
- [x] 6.3 Reexecutar uma rodada com a mesma semente para um provedor avaliado e conferir seleção idêntica, novo ID, substituição da rodada anterior e sanitização dos relatórios; registrar diferenças de resolução como novas observações, sem exigir resultados online idênticos.
- [x] 6.4 Revisar tabela e seções públicas para confirmar o limiar de um título por tipo, indicativos com denominador cinco, ausência de resultados offline e ausência de URLs/segredos; executar novamente a suíte de consistência do catálogo após os registros reais.
- [x] 6.5 Executar `openspec validate padronizar-verificacao-online-provedores --strict` e registrar no design os cenários da spec verificados, os que não puderam ser executados e os respectivos motivos; confirmar que a implementação não mudou o contrato do app nem introduziu reprodução/P2P no teste.

## 7. Ajustes de apresentação do catálogo

- [x] 7.1 Exibir `🟢` para `Estável`, `🔵` para `Parcial`, `🔴` para `Instável`, `🟠` para `Não verificado` e `⚫` para `Desativado` na coluna de status e na seção do provedor, com validação nos testes.
- [x] 7.2 Exibir apenas a data (`AAAA-MM-DD`) na coluna `Última verificação`.
- [x] 7.3 Substituir o bloco do provedor a cada rodada registrada, mantendo somente a última execução e sem preservar a anterior.
- [x] 7.4 Remover hashes do resumo público em `providers.md`, mantendo-os apenas no relatório transitório e na identidade interna.
- [x] 7.5 Migrar `providers.md` para o novo formato e atualizar testes, `test/README.md`, `docs/tests.md`, `docs/arch.md`, `AGENTS.md` e spec/design.
- [x] 7.6 Executar lint, suíte de catálogo/registro, suíte completa e `openspec validate --strict`; registrar os resultados.

## Workflow follow-up

1. Revisar os artefatos e iniciar a implementação somente mediante solicitação de apply.
2. Após implementar, arquivar a mudança apenas com os casos passando ou com os cenários não executados explicitamente declarados, conforme as regras do repositório.
