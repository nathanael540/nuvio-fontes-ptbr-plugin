# Proposal

## Why

O catálogo `movie` da verificação online não tem nenhum título do acervo de filmes asiáticos do Doramogo. Por isso a rodada do provedor usa o perfil generalista, o tipo `movie` termina sem resolução e o status fica `Parcial`, mesmo com o provedor resolvendo séries. Adicionar filmes reais do Doramogo com a tag `dorama` permite um perfil de nicho e uma avaliação representativa dos dois tipos.

## What Changes

1. Adicionar oito filmes publicados pelo Doramogo ao catálogo `movie`, todos com a tag `dorama`: `1269208` Meus 84 m² (2025), `1419027` Ataque 13 (2025), `1466115` Se Esse Amor Desaparecesse Hoje (2025), `1070514` 100 Coisas para Fazer Antes de Virar Zumbi (2023), `1127546` Pesadelo na Montanha (2023), `962489` Ditto: Conexões do Amor (2022), `734519` The Fable: The Killer Who Doesn't Kill (2021) e `437109` A Vilã (2017).
2. Manter a revisão pública `2026-11-12.1` e o `curatedAt` `2026-11-12` do catálogo `movie`, apesar da extensão aditiva, para não invalidar a evidência dos demais provedores; o catálogo `tv` não muda porque já tem seis títulos com a tag `dorama`.
3. Acrescentar o perfil `doramogo` com `exclusiveTag` `dorama` em `test/online/profiles.json` e subir a revisão do documento de perfis.
4. Reexecutar somente o Doramogo com `--record`; os blocos e status dos demais provedores não são alterados.
5. Atualizar `providers.md`, `docs/tests.md` e `test/README.md` com o novo perfil, a curadoria e a rodada do Doramogo.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma. O filtro por nicho exclusivo, a amostragem e o registro já estão especificados em `provider-online-verification`; esta mudança fornece dados de catálogo e perfil, sem novo comportamento de sistema.

## Impact

1. Catálogo: `test/online/catalogs/movie.json` e `test/online/profiles.json`.
2. Evidência: somente a linha e o bloco do Doramogo mudam em `providers.md`; os demais provedores mantêm os blocos e status atuais. A extensão do catálogo sem nova revisão é uma exceção deliberada, registrada no `design.md`, para preservar essa evidência.
3. Documentação: `docs/tests.md` e `test/README.md` deixam de afirmar que nenhum provedor tem perfil exclusivo.
4. Código do Doramogo: nenhum arquivo em `src/doramogo/` muda.
