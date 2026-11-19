# Tasks

## 1. Registro no catálogo de rejeitados

- [x] 1.1 Adicionar a linha `| [AnimeTR](#animetr) | \`animetr\` | Escopo ou duplicidade | ... | 2026-11-19 |` à tabela resumo de `rejected-providers.md` e a seção `## AnimeTR` com os seis campos obrigatórios; conferir que a seção repete data e categoria da tabela.
- [x] 1.2 Preencher `Domínios investigados` com `animetr.co` e `asyaanimeleri.pw`, `Motivo` com o idioma turco e a ausência de PT-BR, `Evidência e referência` com a data e os pontos observados (incluindo o `HTTP 404` do iframe principal, sem URL efêmera) e `Critério de reavaliação` com a exigência de áudio ou legenda PT-BR e nova proposta OpenSpec; conferir que não há token, cookie, URL assinada, link `magnet:?` ou hash SHA-256.
- [x] 1.3 Executar `node --test test/rejected-providers.test.js` e confirmar que a entrada real passa nas validações de formato, categoria, campos obrigatórios, conflito com `manifest.json` e sanitização.

## 2. Validação da mudança

- [x] 2.1 Executar `openspec validate rejeitar-provedor-animetr --strict` e confirmar aprovação do delta da capability.
- [x] 2.2 Executar `npm run lint` e `npm test`, confirmando que nenhuma alteração de provedor, build ou manifest foi introduzida.
- [x] 2.3 Atualizar a seção `Validation` do `design.md` com os resultados reais dos comandos executados.

## Workflow follow-up

- Confirmar que `animetr` não aparece em `manifest.json` nem em `providers.md`.
- Arquivar a mudança com `openspec archive rejeitar-provedor-animetr --yes` após a aprovação dos testes.
