# Design

## Context

Ver `proposal.md` para a motivação. O catálogo `tv` tem 35 títulos e nenhum com a tag `novela`; por isso o NoveFlix usa o perfil generalista. A rodada de 14/11/2026 registrou `tv 0/5`, com cinco séries gerais e ausência em todas, sem exercitar a cadeia de novela.

Os títulos foram levantados em `https://noveflix.lol/categoria/novelas/` e na página 2 em 14/11/2026. Cada ficha `/assistir/<slug>/` foi aberta para ler o `h1` e o ano de `span.date`; o ID e o ano do TMDB foram conferidos na API pública com `language=pt-BR`. A tabela registra o que foi verificado:

| ID do TMDB | Título | Ano | Origem | Slug no NoveFlix | Ano da ficha |
| --- | --- | --- | --- | --- | --- |
| `46161` | Vale Tudo | 1988 | BR | `vale-tudo` | 1988 |
| `4184` | A Usurpadora | 1998 | MX | `a-usurpadora` | 1998 |
| `34957` | Laços de Família | 2000 | BR | `lacos-de-familia` | 2000 |
| `14853` | O Clone | 2001 | BR | `o-clone` | 2001 |
| `46101` | Senhora do Destino | 2004 | BR | `senhora-do-destino` | 2004 |
| `7448` | A Favorita | 2008 | BR | `a-favorita` | 2008 |
| `7979` | Caminho das Índias | 2009 | BR | `caminho-das-indias` | 2009 |
| `45815` | Avenida Brasil | 2012 | BR | `avenida-brasil` | 2012 |

## Goals / Non-Goals

**Goals:**

1. Ter ao menos cinco séries elegíveis com a tag `novela` para o perfil de nicho do NoveFlix.
2. Manter a seleção reproduzível e a evidência online dos demais provedores coerente com o catálogo estendido.
3. Reexecutar somente o NoveFlix e manter os blocos e status dos demais provedores exatamente como estavam.

**Non-Goals:**

1. Criar um catálogo separado por nicho ou mudar o schema dos catálogos.
2. Alterar o código do NoveFlix.
3. Adicionar novelas ao catálogo `movie`; o NoveFlix é somente `tv` e o perfil exige cinco candidatos apenas para o tipo suportado.
4. Garantir que as oito novelas resolvam na fonte; a rodada registra o resultado real.

## Decisions

### D1. Usar a tag `novela`

1. A tag identifica o nicho de telenovelas, brasileiras ou internacionais, sem criar um tipo de mídia.
2. Alternativa descartada: usar `dorama` para as novelas. O catálogo já separa dorama asiático de novela latino-americana e brasileira, e o NoveFlix é um catálogo de novelas, não de doramas.
3. Alternativa descartada: criar um catálogo `novela` separado. Exigiria mudar o schema, o carregador, a identidade e o validador de `providers.md`, com escopo muito maior do que a curadoria pedida.

### D2. Curadoria das oito novelas

1. Os títulos vêm das páginas públicas de categoria do NoveFlix, não de uma lista arbitrária.
2. O ano do catálogo é o ano da ficha (`span.date`), que também é o ano do TMDB nas oito escolhas. `Vale Tudo` de 1988 não se confunde com o remake de 2025: o provedor também exige igualdade de ano.
3. A amostra inclui uma novela mexicana (`A Usurpadora`) e sete brasileiras, refletindo o acervo observado.
4. Nenhuma sonda de mídia foi feita; a evidência de resolução continua sendo a rodada online.

### D3. Revisão do catálogo e do perfil

1. `tv.json` preserva `revision` `2026-11-12.1` e `curatedAt` `2026-11-12`; os títulos existentes são preservados e os oito novos entram no fim, com `tags: ["novela"]`.
2. `profiles.json` passa a `revision` `2026-11-14.11`, `curatedAt` `2026-11-14` e `providers.noveflix.exclusiveTag` `novela`.
3. A revisão do catálogo não sobe porque o documento validado pelos demais provedores usa a revisão pública como referência. Subir a revisão invalidaria todos os blocos e exigiria reexecutar todos, o que esta mudança não faz.
4. Limitação registrada: a identidade interna do catálogo muda com os novos títulos, mas a revisão pública permanece a mesma. O `design` e a proposta registram a exceção; uma mudança futura pode subir a revisão e reexecutar todos os provedores quando isso for aceitável.

### D4. Reexecução somente do NoveFlix

1. O runner lê o perfil `novela` e sorteia cinco séries com a tag. A semente é a gerada pela rodada e fica registrada no bloco.
2. Os demais provedores não são executados nesta mudança. Seus blocos e linhas em `providers.md` são restaurados ao estado anterior e verificados por `git diff`.
3. O resultado do NoveFlix é o que o runner gravar. Status negativo ou inconclusivo não é corrigido à mão.
4. A verificação final compara a tabela e os blocos com o manifest e os catálogos atuais; a rodada do NoveFlix precisa citar `tv@2026-11-12.1` e o perfil `novela`.

### D5. Documentação

1. `docs/tests.md` e `test/README.md` passam a citar a tag `novela` e o perfil do NoveFlix.
2. `providers.md` é atualizado exclusivamente pela rodada com `--record`; a prosa do NoveFlix deixa de falar em perfil generalista e passa a descrever o perfil de nicho e o resultado real.
3. Nenhum bloco novo em `src/_blocks/`; o catálogo de blocos não muda.

## Risks / Trade-offs

1. **Extensão do catálogo sem nova revisão pública** — exceção deliberada para não invalidar os demais provedores; a proposta, o design e o diff registram os oito títulos. Uma mudança futura pode subir a revisão e reexecutar todos quando isso for aceitável.
2. **Rodada do NoveFlix pode ficar inconclusiva por tempo ou rede** — repetir individualmente uma vez quando a causa for local; se continuar inconclusivo, registrar como `Inconclusivo`, sem inventar aprovação.
3. **As oito novelas são de nicho e podem não resolver todas** — o perfil exige cinco elegíveis, não cinco resoluções; a evidência mínima continua sendo uma resolução.
4. **Correspondência capítulo/episódio** — a amostra usa S01E01, que existe em qualquer novela com ao menos um capítulo; a correspondência 1:1 em capítulos altos continua limitada a `Avenida Brasil` (179 nos dois lados).
5. **O catálogo `tv` cresce para 43 títulos** — não há limite máximo; a validação exige apenas o mínimo de 20 e a unicidade dos IDs.

## Validation

1. Observado em 14/11/2026: as oito fichas publicam `span.date` igual ao ano do TMDB e o `h1` igual ao título do catálogo; o `data-post` e o embed existem em todas as fichas.
2. Rodada online de 14/11/2026 com `--record`: perfil `novela`, `tv 5/5`, cinco resolvidos, nenhuma ausência, falha ou inconclusão. A amostra foi A Favorita (2008), Avenida Brasil (2012), Caminho das Índias (2009), O Clone (2001) e Vale Tudo (1988), com 1/1 stream aproveitável em cada caso. O bloco está em `providers.md` e a semente é `50423de6daffad122234bc117f22acfd`.
3. Não confirmado: reprodução no aparelho, os capítulos altos das demais novelas e a correspondência capítulo/episódio fora de `Avenida Brasil`.
