# Proposal

## Why

O valor `LANGUAGE.NON_PT_BR` é exibido hoje como `Não PT-BR`. O mantenedor quer que o rótulo visível seja `Gringo`, mantendo o mesmo significado: áudio estrangeiro comprovado, sem português elegível.

## What Changes

1. O valor do membro `LANGUAGE.NON_PT_BR` passa de `"Não PT-BR"` para `"Gringo"`. O enum continua com exatamente seis valores e nenhum valor novo é criado.
2. `normalizeLanguage` continua aceitando o rótulo antigo `"Não PT-BR"` como entrada e passa a aceitar também `"Gringo"`, ambos resolvidos para o membro renomeado.
3. Os sufixos `"Dublado (Não PT-BR?)"` e `"Legendado (Não PT-BR?)"` não mudam, porque descrevem português confirmado sem região brasileira, não idioma estrangeiro.
4. Testes, documentação, catálogo de blocos e propostas ativas que citam o valor isolado `"Não PT-BR"` passam a citar `"Gringo"`.
5. Os provedores são reconstruídos para publicar o novo rótulo.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `stream-language`: renomeia o valor visível do idioma estrangeiro de `Não PT-BR` para `Gringo`, preservando os seis valores do enum e a compatibilidade de entrada com o texto antigo.

## Impact

1. Código: `src/_blocks/language-discovery/index.mjs` e saídas geradas em `providers/`, `gdrive/providers/` e `prism/providers/`.
2. Testes: `test/blocks/language-discovery/index.test.mjs`, `test/blocks/custom-formatter/index.test.mjs`, `test/limefilmes.test.js` e `test/megaembed.test.js`.
3. Documentação: `docs/arch.md`, `docs/provider-investigation.md`, `src/_blocks/index.md` e propostas OpenSpec ativas que citam o rótulo isolado.
4. Sem mudança de manifest, versão de provedor, dependência, serviço externo ou contrato de campos do app.
