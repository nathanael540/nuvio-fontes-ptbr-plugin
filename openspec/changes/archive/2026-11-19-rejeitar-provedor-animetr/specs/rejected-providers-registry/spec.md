# Spec Delta

## ADDED Requirements

### Requirement: Registro do AnimeTR por escopo

O catálogo `rejected-providers.md` SHALL conter a entrada `animetr` na categoria `Escopo ou duplicidade`, registrando que `animetr.co` publica anime e donghua apenas com legendas e dublagem em turco, fora do escopo PT-BR do repositório.

#### Scenario: Entrada completa na tabela e na seção

- **WHEN** `rejected-providers.md` é lido
- **THEN** a tabela resumo tem a linha do `animetr` com data `2026-11-19` e a seção `## AnimeTR` traz os seis campos obrigatórios, com `Domínios investigados` citando `animetr.co` e `asyaanimeleri.pw`.

#### Scenario: Fonte fora do manifest

- **WHEN** a entrada `animetr` é comparada com `manifest.json` e `providers.md`
- **THEN** o ID não aparece em nenhum dos dois e nenhum provedor é publicado.

#### Scenario: Critério de reavaliação documentado

- **WHEN** a seção `## AnimeTR` é lida
- **THEN** o critério exige áudio ou legenda em português do Brasil na fonte e uma nova proposta OpenSpec para reabrir a avaliação.

#### Scenario: Registro sanitizado

- **WHEN** a seção é validada
- **THEN** ela não contém token, cookie, credencial, URL assinada de mídia, link `magnet:?` nem hash SHA-256.
