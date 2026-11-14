# Proposal

## Why

O catálogo `tv` da verificação online não tem títulos com a tag `novela`, então o NoveFlix é avaliado no perfil generalista, que não contém o acervo de novelas da fonte. A rodada de 14/11/2026 terminou `Instável` com `tv 0/5`, todos em ausência reconhecida, sem medir a cadeia que já foi observada ao vivo. Adicionar novelas reais do NoveFlix com a tag `novela` permite um perfil de nicho e uma avaliação representativa da fonte.

## What Changes

1. Adicionar oito novelas publicadas pelo NoveFlix ao catálogo `tv`, todas com a tag `novela`: `46161` Vale Tudo (1988), `4184` A Usurpadora (1998), `34957` Laços de Família (2000), `14853` O Clone (2001), `46101` Senhora do Destino (2004), `7448` A Favorita (2008), `7979` Caminho das Índias (2009) e `45815` Avenida Brasil (2012).
2. Manter a revisão pública `2026-11-12.1` e o `curatedAt` `2026-11-12` do catálogo `tv`, apesar da extensão aditiva, para não invalidar a evidência dos demais provedores; o catálogo `movie` não muda.
3. Acrescentar o perfil `noveflix` com `exclusiveTag` `novela` em `test/online/profiles.json` e subir a revisão do documento de perfis.
4. Ajustar `test/online-catalog.test.js` para o novo perfil, para o mínimo de cinco títulos `novela` e para usar outra tag no caso de tag desconhecida.
5. Reexecutar somente o NoveFlix com `--record`; os blocos e status dos demais provedores não são alterados.
6. Atualizar `docs/tests.md`, `test/README.md` e `providers.md` com o perfil de nicho, a curadoria e a rodada do NoveFlix.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma. O filtro por nicho exclusivo, a amostragem e o registro já estão especificados em `provider-online-verification`; esta mudança fornece dados de catálogo e perfil, sem novo comportamento de sistema.

## Impact

1. Catálogo: `test/online/catalogs/tv.json` e `test/online/profiles.json`.
2. Testes: `test/online-catalog.test.js`.
3. Evidência: somente a linha e o bloco do NoveFlix mudam em `providers.md`; os demais provedores mantêm os blocos e status atuais. A extensão do catálogo sem nova revisão é uma exceção deliberada, registrada no `design.md`, para preservar essa evidência.
4. Documentação: `docs/tests.md` e `test/README.md` passam a citar a tag `novela` e o perfil do NoveFlix.
5. Código do NoveFlix: nenhum arquivo em `src/noveflix/` muda.
