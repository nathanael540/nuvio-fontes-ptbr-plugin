# Spec Delta

## ADDED Requirements

### Requirement: Título decorado pela fonte

Quando o cartão ou a ficha publica um título decorado no formato `Título original (Título PT-BR)` ou `Título PT-BR (Título original)`, o provedor SHALL pontuar o título completo, cada segmento entre parênteses e o título sem os parênteses. A confirmação SHALL manter o limiar de semelhança, o tipo de caminho e a igualdade de ano já exigidos.

#### Scenario: Título PT-BR entre parênteses

- **WHEN** a busca de `Se Esse Amor Desaparecesse Hoje` (TMDB 1466115, 2025) devolve `Even If This Love Disappears Tonight (Se Esse Amor Desaparecesse Hoje)` em `/br/filmes/` com ano 2025
- **THEN** o provedor confirma a ficha e segue para as opções de player.

#### Scenario: Título PT-BR seguido do original

- **WHEN** a busca de `Round 6` (TMDB 93405, 2021) devolve `Round 6 (Squid Game)` em `/br/series/` com ano 2021
- **THEN** o provedor confirma a ficha e segue para o episódio publicado.

#### Scenario: Parêntese não supera ano divergente

- **WHEN** a fonte publica `Round 6 (Squid Game)` com ano 2023 e o TMDB de 93405 é de 2021
- **THEN** o candidato é descartado pelo ano, mesmo com a variante de título igual.

#### Scenario: Identidade confirmada sem mídia

- **WHEN** a ficha decorada é confirmada, mas todas as opções de player são triagem
- **THEN** a saída é lista vazia sem erro; a ausência é de mídia, não de identidade.
