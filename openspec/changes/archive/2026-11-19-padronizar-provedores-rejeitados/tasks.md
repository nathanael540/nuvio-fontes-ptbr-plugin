# Tasks

## 1. Documentação de regras e padronização

- [x] 1.1 Documentar em `AGENTS.md` a obrigatoriedade e o padrão de registro de provedores rejeitados/removidos em `rejected-providers.md`, incluindo as cinco categorias fechadas, os seis campos obrigatórios e a separação frente a `providers.md`.
- [x] 1.2 Atualizar `docs/provider-investigation.md` para integrar o registro de fontes descartadas ao roteiro de investigação e à conclusão do guia.
- [x] 1.3 Atualizar `README.md` (seção Documentação) e `docs/tests.md` (suíte `test/rejected-providers.test.js`) para referenciar o catálogo de provedores rejeitados e sua validação offline.

## 2. Criação do catálogo de itens descartados

- [x] 2.1 Criar `rejected-providers.md` na raiz do repositório com introdução, tabela resumo padronizada e seções detalhadas para os itens descartados já evidenciados no repositório (`TorrentFilmesX` e `Raflix`).

## 3. Validação automatizada e verificação

- [x] 3.1 Criar `test/rejected-providers.test.js` validando o `rejected-providers.md` real contra `manifest.json` e testando cenários sintéticos de data inválida, categoria inválida, seção divergente, conflito com manifest e conteúdo não sanitizado.
- [x] 3.2 Executar `openspec validate padronizar-provedores-rejeitados --strict`, `npm run lint` e `npm test`, confirmando aprovação completa.
- [x] 3.3 Atualizar a seção `Validation` do `design.md` com os resultados reais e arquivar a mudança com `openspec archive padronizar-provedores-rejeitados --yes`.
