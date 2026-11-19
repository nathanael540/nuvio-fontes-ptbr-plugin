# Design

## Context

O repositório já mantém `providers.md` na raiz como catálogo versionado dos provedores publicados e validados por `test/providers-catalog.test.js`, além do guia `docs/provider-investigation.md` para investigar novas fontes. Entretanto, quando uma fonte é investigada e rejeitada (ou um provedor publicado é removido), não havia um registro central padronizado com data e motivo da rejeição.

No histórico do repositório existem dois casos documentados de descarte/remoção:

1. **TorrentFilmesX** (`2026-11-09`, pré-reset, commit `641809e`, change arquivada `2026-11-09-evaluate-torrentfilmesx-provider`): bloqueado por desafio gerenciado do Cloudflare (`HTTP 403`, `cf-mitigated: challenge`) em `2026-11-07` e `2026-11-09`, sem serviço aberto, público, sem conta e sem chave.
2. **Raflix** (`2026-11-12`, pós-reset, commit `4cf5ad2`, change arquivada `2026-11-12-remover-provedor-raflix`): publicado em `2026-11-12` e removido no mesmo dia por decisão do mantenedor de não mantê-lo no catálogo publicado.

## Goals / Non-Goals

### Goals

1. Padronizar em documentação normativa (`AGENTS.md` e `docs/provider-investigation.md`) quando e como registrar provedores investigados e rejeitados.
2. Criar `rejected-providers.md` com tabela resumo, categorias fechadas, data ISO (`AAAA-MM-DD`), motivo objetivo, referência e critério de reavaliação.
3. Garantir validação automática offline em `test/rejected-providers.test.js` contra desvios de formato, duplicidade, conflito com `manifest.json` e vazamento de credenciais ou links proibidos.
4. Povoar a versão inicial exclusivamente com descartes comprovados no histórico do repositório (`TorrentFilmesX` e `Raflix`), sem inventar causas nem resgatar evidências de funcionamento pré-reset.

### Non-Goals

1. Alterar `manifest.json`, `providers.md`, `build.js` ou qualquer arquivo em `src/`.
2. Registrar como provedores rejeitados players ou hosts isolados descartados apenas como opções internas dentro de provedores ativos (como `Byse` no Pomfy ou `nhdapi.com` no VenoPlay), que continuam documentados em `docs/provider-investigation.md`.
3. Exigir verificação online para itens rejeitados.

## Decisions

### D1. Localização e nome do documento (`rejected-providers.md` na raiz)

1. O arquivo fica em `rejected-providers.md`, na raiz do repositório, espelhando `providers.md`.
2. Alternativa descartada: colocar em `docs/rejected-providers.md`. Como `providers.md` já fica na raiz como inventário consultado diretamente por mantenedores, contribuidores e agentes, manter o par `providers.md` / `rejected-providers.md` na raiz torna imediata a distinção entre publicados e rejeitados.

### D2. Categorias fechadas e estrutura obrigatória

1. A tabela usa `| Provedor | ID | Categoria | Motivo resumido | Data |` com `ID` em kebab-case, `Data` em `AAAA-MM-DD` e `Categoria` pertencente a cinco valores fechados: `Bloqueio anti-bot`, `Autenticação ou chave`, `Execução incompatível`, `Sem mídia utilizável` e `Escopo ou duplicidade`.
2. Cada linha da tabela tem exatamente uma seção `## <Provedor>` correspondente, usando lista numerada (conforme `AGENTS.md`) com seis campos: `Data da rejeição`, `Categoria`, `Domínios investigados`, `Motivo`, `Evidência e referência` e `Critério de reavaliação`.
3. Alternativa descartada: texto livre por tópico ou tabela única sem seções. A tabela facilita consulta rápida e evita repetição de trabalho, enquanto a seção preserva detalhes técnicos e o critério objetivo para eventual retomada.

### D3. Separação estrita entre `manifest.json` e `rejected-providers.md`

1. Um `id` publicado em `manifest.json` não pode constar em `rejected-providers.md`. Caso um provedor rejeitado seja implementado no futuro, sua entrada sai de `rejected-providers.md` na mesma mudança que o adiciona ao `manifest.json`. Caso um provedor publicado seja removido, sua entrada sai de `manifest.json`/`providers.md` e entra em `rejected-providers.md`.
2. Provedores apenas desabilitados temporariamente (`enabled: false`) permanecem em `providers.md` com `⚫ Desativado`, não em `rejected-providers.md`.

### D4. Inclusão dos itens históricos iniciais

1. Incluir `TorrentFilmesX` (`2026-11-09`, pré-reset) como `Bloqueio anti-bot`, deixando explícita sua origem pré-reset e os dados factuais da change arquivada `2026-11-09-evaluate-torrentfilmesx-provider`. Isso respeita `AGENTS.md` (não o trata como requisito ou evidência de teste atual, apenas como histórico de bloqueio documentado).
2. Incluir `Raflix` (`2026-11-12`, pós-reset) como `Escopo ou duplicidade`, refletindo fielmente a justificativa registrada na change `2026-11-12-remover-provedor-raflix`.

### D5. Sanitização e validação offline

1. `rejected-providers.md` não pode conter tokens, credenciais, URLs com query de autenticação, links `magnet:?` ou hashes SHA-256 de 64 caracteres.
2. `test/rejected-providers.test.js` valida estrutura, categorias, datas, correspondência 1-para-1 tabela/seção, ausência no `manifest.json` e regras de sanitização em `npm test`.

## Risks / Trade-offs

1. **Lista ficar desatualizada após investigações futuras** → Mitigação: tornar o registro regra explícita em `AGENTS.md` e no roteiro de `docs/provider-investigation.md`.
2. **Conflito de nomes entre redes/domínios antigos e novos** → Mitigação: exigir o campo `Domínios investigados` e `Critério de reavaliação` em cada seção.
3. **Confusão entre provedor desativado e rejeitado** → Mitigação: regra explícita separando `enabled: false` (`providers.md`) de rejeição/remoção (`rejected-providers.md`) e validação cruzada contra `manifest.json`.

## Validation

1. `openspec validate padronizar-provedores-rejeitados --strict`: aprovado.
2. `npm run lint`: aprovado sem erros em `src`, `test` e scripts da raiz.
3. `node --test test/rejected-providers.test.js`: 4/4 testes aprovados.
4. `npm test`: 1722/1722 testes aprovados, sem falhas.
