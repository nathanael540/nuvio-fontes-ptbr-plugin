# Proposal

## Why

O provedor Raflix não faz mais parte do catálogo publicado deste repositório. Manter código, testes, spec e status de um provedor que não será distribuído cria divergência entre `manifest.json`, `providers.md`, a documentação e a suíte de testes.

## What Changes

- **BREAKING**: remover o provedor `raflix` do `manifest.json` e dos manifests de formato.
- Remover `src/raflix/`, os pacotes gerados `providers/raflix.js`, `gdrive/providers/raflix.js` e `prism/providers/raflix.js`, `test/raflix.test.js` e `test/fixtures/raflix/`.
- Remover a linha da tabela e a seção `## Raflix` de `providers.md`.
- Remover o método 3.17 de `docs/provider-investigation.md`, que só descrevia a cadeia do Raflix, e renumerar o método seguinte.
- Aposentar a capability `raflix-provider` e retirar seus seis requisitos da spec principal.
- Nenhum bloco compartilhado é removido; o provedor usava apenas blocos existentes.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `raflix-provider`: remoção da capability, com a retirada dos seis requisitos que descreviam a consulta ao catálogo Raflix, a resolução no VidRift, a seleção de áudio e legenda, a contingência H.264, o contrato dos streams HLS e o tratamento de ausência e falhas.

## Impact

1. Código: remoção de `src/raflix/`, `test/raflix.test.js` e `test/fixtures/raflix/`.
2. Configuração: remoção da entrada em `manifest.json`, com regeneração de `gdrive/manifest.json`, `prism/manifest.json` e dos três pacotes do provedor.
3. Documentação: remoção da linha e da seção em `providers.md` e do método correspondente em `docs/provider-investigation.md`.
4. Specs: aposentadoria de `openspec/specs/raflix-provider/spec.md`.
5. Sem migração de dados, sem dependência nova e sem alteração nos demais provedores.
