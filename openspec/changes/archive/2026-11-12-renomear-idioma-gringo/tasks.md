# Tasks

## 1. Enum e compatibilidade

- [x] 1.1 Trocar o valor de `LANGUAGE.NON_PT_BR` para `Gringo` e manter a entrada antiga `Não PT-BR` como alias de `normalizeLanguage`. Verificação: `normalizeLanguage('Não PT-BR')` e `normalizeLanguage('Gringo')` devolvem `Gringo`.
- [x] 1.2 Confirmar que `LANGUAGE_MODES` continua com exatamente seis valores e que nenhum outro membro mudou. Verificação: teste do enum confere a lista completa.

## 2. Testes e documentação

- [x] 2.1 Atualizar expectativas de `Não PT-BR` isolado em `test/blocks/language-discovery/index.test.mjs`, `test/blocks/custom-formatter/index.test.mjs`, `test/limefilmes.test.js` e `test/megaembed.test.js`. Verificação: as suítes passam com `Gringo`.
- [x] 2.2 Atualizar `docs/arch.md`, `docs/provider-investigation.md` e `src/_blocks/index.md`. Verificação: o rótulo isolado documentado é `Gringo`; os sufixos `(Não PT-BR?)` permanecem.
- [x] 2.3 Atualizar as propostas OpenSpec ativas que citam o valor isolado, sem alterar as mudanças arquivadas. Verificação: `openspec validate --changes --strict` passa.

## 3. Build e validação

- [x] 3.1 Rodar `npm run lint`, `npm test` e `npm run build`. Verificação: lint e testes passam; os provedores publicam `Gringo`.
- [x] 3.2 Conferir que os arquivos gerados em `providers/`, `gdrive/providers/` e `prism/providers/` foram atualizados pelo build. Verificação: `git diff` não mostra edição manual nas saídas.

## 4. Workflow

- [ ] 4.1 Arquivar a mudança e sincronizar a spec `stream-language`.
