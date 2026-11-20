# Proposal

## Why

A rodada de 20/11/2026 do Starck Filmes terminou **Parcial**: filmes resolveram 3/5, mas séries ficaram 0/5, com duas falhas e três ausências. A investigação separou causas distintas: as fichas de série usam `.post-buttons .epsodios`, que o extrator não lê, e os pacotes de temporada dependem do cache público itorrents.org, que hoje redireciona para uma página HTML. O caminho de filme continua funcionando. O provedor também não tem spec própria em `openspec/specs/`.

## What Changes

1. Ler as opções de série em `.post-buttons .epsodios`, agrupadas por versão de áudio, faixa ou episódio avulso e qualidade, preservando a leitura atual de `.post-buttons .btn-down` para filmes e pacotes.
2. Manter a resolução de pacotes e faixas pelo bloco compartilhado `torrent-files`, sem inventar índice de arquivo quando a lista ordenada do `.torrent` não estiver disponível.
3. Documentar o bloqueio externo do cache de metadados e os próximos passos verificáveis, sem alterar o bloco compartilhado nesta change.
4. Criar a spec `starckfilmes-provider` e cobrir a nova extração com testes offline, além de preservar os casos de filme, ausência, deduplicação e isolamento de falhas.
5. Revalidar o pacote final por `prism/all/all/all`; nenhum status muda nesta proposta.

## Capabilities

### New Capabilities

- `starckfilmes-provider`: busca e confirmação de fichas, leitura de opções de filme e série, resolução de magnet e pacote, ausência, falhas e contrato dos streams do Starck Filmes.

### Modified Capabilities

Nenhuma. Não há spec existente do Starck Filmes; a capacidade é criada com o comportamento atual preservado e a leitura de `.epsodios` acrescentada.

## Impact

1. Código: `src/starckfilmes/extractor.js` e os pacotes gerados do provedor.
2. Testes: `test/starckfilmes.test.js` e fixtures sanitizadas da ficha de série.
3. Documentação: `docs/provider-investigation.md` e `providers.md` somente após a rodada final, com o resultado real.
4. Dependência externa: `src/_blocks/torrent-files/index.mjs` continua sendo o único caminho para `torrent://`; sua substituição exige change própria e revalidação dos demais provedores que o usam.
