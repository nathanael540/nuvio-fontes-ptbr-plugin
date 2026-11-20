# Proposal

## Why

A rodada de 20/11/2026 classificou o LimeFilmes como Parcial porque os cinco filmes sorteados ficaram sem resultado, enquanto quatro de cinco séries resolveram. Quatro filmes e a novela não existem no catálogo público consultado, mas `Divertida Mente (2015)` existe e ficou fora da leitura: a consulta REST devolve 23 correspondências e o provedor lê somente as 20 primeiras, ordenadas por data. Com a janela completa, o mesmo caminho de extração devolve quatro streams. Sem a correção, um título real do acervo continua invisível e o tipo filme permanece sem resolução na amostra.

## What Changes

1. Ampliar a leitura de cada consulta de busca até o limite máximo de resultados da API pública, sem recorte fixo que descarte uma correspondência exata.
2. Preservar a confirmação de identidade já existente: categoria de filme ou série, ano com tolerância de um ano, temporada exata, exclusão de coleções e divergência de IMDb.
3. Preservar a extração atual de magnets e pacotes, a classificação de qualidade, idioma e tamanho, o isolamento de opções inválidas e o retorno vazio em ausência.
4. Cobrir a regressão com fixture sanitizada e teste offline em que a correspondência exata aparece depois da 20ª posição.
5. Revalidar o pacote final online com a mesma semente e registrar a rodada e o status aplicável conforme `docs/tests.md`.

## Capabilities

### New Capabilities

- `limefilmes-provider`: busca de filmes e séries no catálogo WordPress, confirmação de identidade e extração de magnets e arquivos de episódio em pacotes.

### Modified Capabilities

Nenhuma.

## Impact

1. Alteração concentrada em `src/limefilmes/extractor.js`, com fixture e regressões em `test/`; nenhum bloco compartilhado precisa mudar.
2. O volume de resultados por consulta cresce, mas os candidatos só visitam a página do post depois da triagem de categoria, ano, temporada e título.
3. A publicação depende de build final e nova rodada `prism/all/all/all`; status e data em `providers.md` só mudam na mudança de implementação, conforme a evidência online.
