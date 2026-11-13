# Design

## Context

Ver `proposal.md` para a motivação. O catálogo `movie` tem 43 títulos e nenhum com a tag `dorama`; o `tv` tem seis. O perfil de nicho do Doramogo, portanto, falharia na preparação. A rodada do provedor já registrada em `providers.md` é `Parcial`: o `tv` resolveu `Pousando no Amor` S01E01 e o `movie` não teve resolução porque a amostra generalista não contém filmes asiáticos.

A restrição desta mudança é não alterar os blocos e status dos demais provedores em `providers.md`. Por isso a revisão pública do catálogo `movie` é mantida, mesmo com a extensão aditiva, e somente o Doramogo é reexecutado.

Os oito candidatos foram observados em `https://www.doramogo.net/filmes` em 13/11/2026. O ID do TMDB foi lido do nome do pôster da ficha e conferido na API do TMDB; o tipo de cada página é `filmes` e o player publica `tipo: "filmes"`. A tabela abaixo registra o que foi verificado:

| ID do TMDB | Título | Ano | Idioma original | Áudio da ficha |
| --- | --- | --- | --- | --- |
| `1269208` | Meus 84 m² | 2025 | coreano | Dublado |
| `1419027` | Ataque 13 | 2025 | tailandês | Dublado |
| `1466115` | Se Esse Amor Desaparecesse Hoje | 2025 | coreano | Dublado |
| `1070514` | 100 Coisas para Fazer Antes de Virar Zumbi | 2023 | japonês | Dublado |
| `1127546` | Pesadelo na Montanha | 2023 | coreano | Dublado |
| `962489` | Ditto: Conexões do Amor | 2022 | coreano | Dublado |
| `734519` | The Fable: The Killer Who Doesn't Kill | 2021 | japonês | Legendado |
| `437109` | A Vilã | 2017 | coreano | Dublado |

## Goals / Non-Goals

**Goals:**

1. Ter ao menos cinco filmes elegíveis com a tag `dorama` para o perfil de nicho do Doramogo.
2. Manter a seleção reproduzível e a evidência online do Doramogo coerente com o catálogo estendido.
3. Reexecutar somente o Doramogo e manter os blocos e status dos demais provedores exatamente como estavam.

**Non-Goals:**

1. Criar um catálogo separado por nicho ou mudar o schema dos catálogos.
2. Alterar o código do provedor Doramogo.
3. Adicionar títulos de séries ao `tv`; os seis existentes já atendem ao mínimo de cinco.
4. Garantir que os oito filmes resolvam na fonte; a rodada registra o resultado real.

## Decisions

### D1. Usar a tag `dorama` nos filmes

1. O documento de perfis aceita uma única `exclusiveTag` por provedor e a aplica aos dois catálogos. O `tv` já usa `dorama` para o nicho de séries asiáticas.
2. Alternativa descartada: criar a tag `asiatico` e retaggar os seis títulos de `tv`. Isso amplia o vocabulário e muda a identidade de títulos que já têm evidência, sem ganho para o Doramogo.
3. O Doramogo é um catálogo de doramas e filmes asiáticos; a mesma tag identifica o acervo nos dois tipos.

### D2. Curadoria dos oito filmes

1. Os títulos vêm da página pública de filmes do Doramogo, não de uma lista arbitrária.
2. O ID do TMDB foi lido do pôster (`1269208_movie_size.webp`, etc.) e conferido na API do TMDB em 13/11/2026; título em PT-BR e ano vêm dessa conferência.
3. Todos os oito têm ficha com o caminho pseudoepisódio `temporada-1/episodio-01`, que é o contrato usado pelo provedor para filme.
4. Não foi feita sondagem de playlist; a evidência de resolução continua sendo a rodada online.

### D3. Revisão do catálogo e do perfil

1. `movie.json` preserva a `revision` `2026-11-12.1` e o `curatedAt` `2026-11-12`; os títulos existentes são preservados e os oito novos entram no fim, com `tags: ["dorama"]`.
2. `profiles.json` passa a `revision` `2026-11-13.1`, `curatedAt` `2026-11-13` e `providers.doramogo.exclusiveTag` `dorama`.
3. O `tv.json` não muda: já tem seis títulos com a tag e o perfil exige cinco.
4. A revisão do catálogo não sobe porque o documento validado pelos demais provedores usa a revisão pública como referência. Subir a revisão invalidaria todos os blocos e exigiria reexecutar todos, o que a restrição desta mudança proíbe.
5. Limitação registrada: a identidade interna do catálogo muda com os novos títulos, mas a revisão pública permanece a mesma. O `design` e a proposta registram a exceção; uma mudança futura pode subir a revisão e reexecutar todos os provedores quando isso for aceitável.
6. Alternativa descartada: criar um catálogo de nicho separado. Exigiria mudar o schema, o carregador, a identidade, o validador de `providers.md` e a regra de dois catálogos, com escopo muito maior do que a curadoria pedida.

### D4. Reexecução somente do Doramogo

1. O runner lê o perfil `dorama` e sorteia cinco filmes e cinco séries com a tag. A semente registrada é `20261113`.
2. Os demais provedores não são executados nesta mudança. Seus blocos e linhas em `providers.md` são restaurados ao estado anterior e verificados por `git diff`.
3. O resultado do Doramogo é o que o runner gravar. Status negativo ou inconclusivo não será corrigido à mão.
4. A verificação final compara a tabela e os blocos com o manifest e os catálogos atuais; a rodada do Doramogo precisa citar `movie@2026-11-12.1`, `tv@2026-11-12.1` e o perfil `dorama`.

### D5. Documentação

1. `docs/tests.md` e `test/README.md` passam a citar o perfil `doramogo` e a curadoria de filmes com a tag `dorama`.
2. `providers.md` é atualizado exclusivamente pelas rodadas com `--record`; a prosa do Doramogo passa a descrever o perfil de nicho e a rodada nova.
3. Nenhum bloco novo em `src/_blocks/`; o catálogo de blocos não muda.

## Risks / Trade-offs

1. **Extensão do catálogo sem nova revisão pública** → exceção deliberada para não invalidar os demais provedores; a proposta, o design e o diff registram os oito títulos. Uma mudança futura pode subir a revisão e reexecutar todos quando isso for aceitável.
2. **Rodada do Doramogo pode ficar inconclusiva por tempo ou rede** → repetir individualmente uma vez quando a causa for local; se continuar inconclusivo, registrar como `Não verificado`, sem inventar aprovação.
3. **Os oito filmes são de nicho e podem não resolver todos** → o perfil exige cinco elegíveis, não cinco resoluções; a evidência mínima continua sendo uma resolução por tipo.
4. **A tag `dorama` em filmes pode parecer imprecisa** → o projeto já usa a tag para o nicho asiático e o provedor cobre filmes e séries; o `design` registra a decisão e a alternativa descartada.
5. **O catálogo `movie` cresce para 51 títulos** → não há limite máximo; a validação exige apenas o mínimo de 20 e a unicidade dos IDs.

## Migration Plan

1. Atualizar `movie.json` e `profiles.json`; rodar as suítes de catálogo e perfil.
2. Rodar o Doramogo com o perfil novo e `--record`; conferir a seleção, as revisões `movie@2026-11-12.1` e `tv@2026-11-12.1` e o status.
3. Restaurar e conferir os blocos dos demais provedores; `git diff -- providers.md` deve mostrar somente a linha e a seção do Doramogo.
4. Rodar `npm test`, `npm run lint`, `node build.js doramogo` e `node --test test/providers-catalog.test.js`.
5. Revisar `providers.md` e a documentação; arquivar depois da revisão do mantenedor.
6. Rollback: remover os oito títulos de `movie.json`, remover o perfil de `profiles.json`, restaurar a linha e a seção do Doramogo em `providers.md` e reverter a documentação. Nenhum código de provedor ou bloco é alterado.

## Open Questions

Nenhuma. A curadoria, o perfil e a estratégia de reexecução estão fechados; os resultados online serão registrados como vierem.
