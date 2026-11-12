# AGENTS.md

Guia para agentes de IA e contribuidores deste repositório.

## Contexto

1. Repositório de provedores do Nuvio para conteúdo em português do Brasil.
2. Leia antes de qualquer tarefa: [README.md](README.md), [providers.md](providers.md), [docs/arch.md](docs/arch.md), [docs/tests.md](docs/tests.md) e as specs em `openspec/specs/`.
3. Referência oficial: [DOCUMENTATION.md do Nuvio](https://github.com/yoruix/nuvio-providers/blob/template/DOCUMENTATION.md). Quando ela diverge do código do app, vale o código (ver `docs/arch.md`).
4. O projeto recebeu um reset em 12/11/2026. O histórico anterior está no Git; não o trate como requisito nem como evidência de teste.

## Fluxo de trabalho (OpenSpec)

1. Toda mudança de comportamento (provedor novo, alteração de contrato, build ou manifest) começa por uma proposta em `openspec/changes/<nome>/` (`/opsx:propose`).
2. Implemente a partir das tarefas da mudança (`/opsx:apply`) e arquive ao concluir (`/opsx:archive`). Só arquive com todos os casos de teste da mudança passando ou com o que ficou fora declarado explicitamente.
3. Specs descrevem o quê e o comportamento esperado; detalhes de implementação ficam no `design.md` da mudança.
4. Artefatos em pt-BR; títulos estruturais do OpenSpec e palavras SHALL/MUST em inglês.

## Commits

1. Use [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/): `tipo(escopo): descrição`, com tipo em inglês e descrição em pt-BR. O escopo é opcional; sem ele, use `tipo: descrição`.
2. Tipos: `feat` para funcionalidades e provedores novos; `fix` para correções; `docs` para documentação e specs; `refactor` para reorganização sem mudança de comportamento; `test` para testes; `build` para empacotamento e dependências; `ci` para integração contínua; `chore` para manutenção que não se encaixa nos anteriores.
3. Quando houver escopo, use o ID do provedor ou a área alterada, como `blocks`, `manifest` ou `openspec`. Não há lista fechada de escopos.
4. Descrição no imperativo, sem ponto final: "adiciona", "corrige", "remove". Prefira títulos de até 72 caracteres; detalhes e motivos ficam no corpo, separado por uma linha em branco.
5. Cada commit tem um propósito. Inclua o código-fonte do provedor e a saída correspondente (`providers/`, `gdrive/providers/` e `prism/providers/`) no mesmo commit, junto com manifest, documentação e testes da mudança.
6. Para quebra de compatibilidade, use `!` antes de `:` no título e um rodapé `BREAKING CHANGE:` com o impacto e a migração.
7. Quando o commit fizer parte de uma mudança OpenSpec, referencie-a no corpo com `OpenSpec: <nome-da-change>`.

## Regras de código

1. JavaScript puro com JSDoc; módulos ES em `src/`, saída CommonJS em `providers/` e nas pastas de formato.
2. Nunca edite os arquivos gerados (`providers/*.js`, `<formato>/providers/*.js`, `<formato>/manifest.json`); altere `src/<id>/` ou `manifest.json` e rode `node build.js <id>`.
3. Respeite as restrições do runtime do app (QuickJS) descritas em `docs/arch.md`: sem APIs do Node e sem rede no carregamento do módulo.
4. Use apenas os módulos que o app fornece: `cheerio-without-node-native` (só a API básica, por causa do NuvioTV) e `crypto-js`. Para HTTP, use o `fetch` global; `axios` não existe no app.
5. Erros internos são lançados; só `getStreams` captura, registra com `console.error('[Nome] ...')` e retorna `[]`. Exceção: a falha de uma opção de mídia independente descarta só essa opção, com `console.warn('[Nome] ...')`, e o erro só sobe se nenhuma opção produzir stream. Não implemente limite de tempo próprio; o app gerencia a espera.
6. Sem defaults silenciosos: ausência de dado esperado é lançada como erro com mensagem clara.
7. Mudanças cirúrgicas, KISS, YAGNI e sem duplicação. Código compartilhado entre provedores fica em `src/_blocks/` e só nasce de um padrão observado em provedores reais.
8. Monte todo stream com `buildStream` e o campo `format`, sem `name` nem `title`. O idioma usa só os seis valores do enum `LANGUAGE`.
9. Nenhum segredo, token ou chave no código; o repositório é público. Bypass, proxy, VPN e qualquer outro serviço são permitidos quando forem abertos, públicos e utilizáveis sem conta e sem chave. É proibido o que exige chave, token, senha ou criação de conta. A única chave externa é `TMDB_API_KEY`, fornecida pelo app. Cálculo local, sem conta e sem chave, é permitido.
10. O repositório é GPL-3.0. Só reaproveite código de fontes com licença compatível e registre a origem (repositório e arquivo) em comentário no topo do trecho.

## Blocos (`src/_blocks/`)

1. Antes de criar ou alterar um provedor, consulte o catálogo `src/_blocks/index.md` e reutilize os blocos existentes.
2. Qualquer alteração em um bloco (criar, renomear, remover, mudar assinatura ou comportamento) exige atualizar `src/_blocks/index.md` na mesma mudança.
3. Os blocos entram no arquivo de cada provedor durante o build. Ao alterar um bloco, reconstrua e revalide os provedores que o usam.
4. Cada bloco fica em `src/_blocks/<bloco>/index.mjs` (inglês, kebab-case), com a suíte em `test/blocks/<bloco>/index.test.mjs`, um para um. Uma responsabilidade por bloco, só exportações nomeadas, sem dependências circulares.
5. Toda função exportada de um bloco tem JSDoc completo: descrição, `@param` para cada parâmetro, `@returns`, `@throws` quando lançar erro e `@example`.
6. Importe blocos com o caminho completo: `import { slugify } from '../_blocks/slugify/index.mjs';`. Sem a extensão `.mjs`, o build falha.
7. Testes de blocos não acessam a internet: substitua `globalThis.fetch` por respostas controladas.

## Testes

1. Rode `npm run lint` e `npm test` após qualquer alteração em `manifest.json`, `build.js`, `src/` ou `test/`. Não desative regras do lint sem justificar no próprio comentário (`-- motivo`).
2. Rode `node build.js <id>` para o provedor alterado e confirme que o build não falha.
3. Testes de desenvolvimento são em Node, sem o app Nuvio instalado e sem acesso à internet. Mudanças em provedores exigem testes Node em `test/<id>.test.js` cobrindo filme, episódio, pacote e ausência quando aplicáveis, com fixtures de respostas reais da fonte (ver `docs/tests.md`). A aprovação offline não comprova funcionamento nem autoriza publicação.
4. Funcionamento e publicação exigem evidência online do pacote final, obtida com `npm run test:online -- --provider <id>` após o build, e registrada em `providers.md`. A rodada usa rede real e `TMDB_API_KEY` apenas do ambiente quando o provedor consulta o TMDB; nenhuma chave entra no repositório.
5. Preencha todos os campos opcionais do stream que a fonte fornecer (contrato em `docs/arch.md`), mesmo os que o app ainda não usa.
6. Toda a infraestrutura de testes fica em `test/`; saídas geradas vão para `test/artifacts/`, ignorada pelo Git.

## Documentação

1. Mantenha `README.md`, `providers.md`, `docs/` e as specs sincronizados com o código na mesma mudança.
2. `providers.md` contém a tabela dos provedores publicados, uma seção por provedor com o status e o bloco da última rodada online. Atualize-o na mesma mudança que cria, altera ou remove um provedor ou muda seu status (critérios em `docs/tests.md`). Registros operacionais e evidência de funcionamento ficam nele; decisões de mudança, questões em aberto e validação ficam no `design.md` da change.
3. `docs/arch.md` descreve só a estrutura, os padrões e as convenções globais. Edite-o só quando um deles mudar, sem justificativas, registros datados ou detalhes de provedores.
4. Decisões que valem para todos os provedores ou para a estrutura e as ferramentas do repositório viram regra em `docs/arch.md` ou neste arquivo, na mesma mudança que as adota; o motivo fica no `design.md` da change.
5. `docs/tests.md` descreve os tipos de teste; `test/README.md` traz os comandos.
6. Decisões de um único provedor ou mudança, questões em aberto e validação da mudança ficam no `design.md` da change; registros operacionais das rodadas online ficam em `providers.md`; o comportamento esperado fica na spec da capacidade.
7. Use listas numeradas; não use fluxogramas nem diagramas.
8. Antes de investigar ou implementar um novo provedor, consulte [docs/provider-investigation.md](docs/provider-investigation.md). Quando a mudança introduzir um método novo ou uma variação relevante reutilizável, atualize o guia na mesma mudança, com referências de código e testes e os limites observados. Distinga método em uso, bloco disponível e hipótese; evidência online e status continuam em `providers.md`.
