# Proposal

## Why

O Pobreflix HD rejeita redirecionamentos oficiais para novos TLDs porque compara a origem completa da URL. Hoje `www.pobreflixtv.golf` redireciona para `www.pobreflixtv.town`, que responde com busca, página, `playerData`, lista de episódios e players válidos; o provedor falha antes de aproveitar esse conteúdo. Manter uma lista de URLs completas é frágil porque cada troca de TLD quebra o provedor.

## What Changes

1. Substituir a allowlist de origens completas por uma lista explícita de bases de domínio.
2. Seguir redirect somente para HTTPS cujo host seja `base.tld` ou `www.base.tld`, com `base` na lista e `tld` de um rótulo.
3. Usar como bases iniciais `pobreflixtv` (marca atual), `flixtv` e `thepobretvflix`.
4. Rejeitar subdomínios arbitrários, lookalikes, HTTP e redirect em cascata.
5. Cobrir com testes os exemplos de bases, os rejeitados, o fluxo `.golf` → `.town` e a resolução posterior do player.
6. Subir a versão do provedor, reconstruir os pacotes e registrar uma rodada online.

## Capabilities

### New Capabilities

1. `pobreflix-domain-redirect`: regra de redirect entre domínios da mesma base, com allowlist explícita de bases.

### Modified Capabilities

Nenhuma.

## Impact

1. `src/pobreflixtv/site.js` e `test/pobreflixtv.test.js`.
2. `manifest.json` (versão do provedor) e arquivos gerados `providers/pobreflixtv.js`, `gdrive/providers/pobreflixtv.js` e `prism/providers/pobreflixtv.js`.
3. `providers.md` após a rodada online do pacote final.
4. Nenhuma mudança no contrato do app ou no formato dos streams.
