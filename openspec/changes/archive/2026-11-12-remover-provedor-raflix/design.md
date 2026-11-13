# Design

## Context

Ver `proposal.md` para a motivação. O `manifest.json` registra o provedor `raflix` com versão `1.0.0`, tipos `movie` e `tv`, formato `m3u8` e logo próprio. A implementação fica em `src/raflix/` e é empacotada por `build.js` em `providers/raflix.js`, `gdrive/providers/raflix.js` e `prism/providers/raflix.js`. A suíte `test/raflix.test.js` usa fixtures em `test/fixtures/raflix/`, `providers.md` tem uma seção com a última rodada online e `docs/provider-investigation.md` descreve a cadeia no método 3.17. A spec `openspec/specs/raflix-provider/spec.md` tem seis requisitos.

O `build.js` não remove pacotes de provedores que deixaram de existir em `src/`; ele apenas reconstrói os provedores descobertos e regrava os manifests de formato. Por isso, os três pacotes gerados precisam ser apagados antes da reconstrução.

## Goals / Non-Goals

### Goals

1. Retirar o Raflix de todos os artefatos versionados: manifesto, código-fonte, testes, fixtures, pacotes gerados, status e documentação.
2. Aposentar a capability `raflix-provider` sem deixar spec vazia ou requisitos órfãos.
3. Manter `npm run lint`, `npm test` e o build verdes após a remoção.

### Non-Goals

1. Desativar o provedor com `enabled: false`; a remoção elimina código e testes, não apenas a publicação.
2. Remover ou alterar blocos compartilhados usados pelo provedor (`http`, `stream-build`, `custom-formatter` e `language-discovery`).
3. Alterar o comportamento, a versão ou o status dos demais provedores.
4. Preservar o método de investigação do Raflix como hipótese: sem implementação no repositório, os links e as referências deixariam de existir.

## Decisions

### D1. Remover o provedor em vez de desativá-lo

1. O pedido é de remoção, e um provedor desativado continuaria ocupando manifest, código, testes, fixtures e spec.
2. A alternativa de manter `enabled: false` foi descartada porque a suíte continuaria testando uma cadeia que não é publicada e o catálogo de provedores continuaria exibindo uma linha desativada sem consumidor.

### D2. Aposentar a capability com `retire_capabilities`

1. Os seis requisitos da capability serão removidos por delta e a spec principal será apagada no arquivo. O marcador `retire_capabilities: true` no `.openspec.yaml` autoriza o arquivamento a remover o arquivo, em vez de falhar por deixar uma spec sem requisitos.
2. A alternativa de manter a spec com um requisito fictício foi descartada: ela descreveria um comportamento que não existe mais.

### D3. Apagar os pacotes gerados manualmente antes do build

1. O build não faz limpeza de arquivos órfãos. Os três arquivos `raflix.js` serão apagados e o build será executado para regravar os manifests de formato sem a entrada.
2. A verificação compara a lista de provedores em `providers/`, `gdrive/providers/` e `prism/providers/` com o manifest, como já faz `test/manifest.test.js`.

### D4. Remover o método 3.17 do guia de investigação

1. O método descreve apenas a cadeia Raflix/VidRift, com links para arquivos que serão apagados.
2. O método seguinte será renumerado para 3.17 para manter a sequência do guia. O histórico completo permanece no Git.

### D5. Não alterar blocos, outros provedores ou a versão do repositório

1. O Raflix usa blocos existentes e compartilhados; nenhum bloco fica sem consumidor.
2. O `version` de topo do `manifest.json` (`0.1.0`) não identifica a versão de um provedor e não precisa mudar por uma remoção. As versões dos demais provedores permanecem intactas.

## Risks / Trade-offs

1. **Pacote gerado órfão** → apagar os três arquivos antes do build e conferir a sincronia com `test/manifest.test.js`.
2. **Documentação com links quebrados** → remover a seção 3.17, renumerar a seguinte e verificar que não restam referências a `raflix` em `src/`, `test/`, `providers.md`, `docs/` ou nos manifests.
3. **Spec vazia ou requisito órfão** → validar com `openspec validate` e conferir que o arquivamento removeu `openspec/specs/raflix-provider/spec.md`.
4. **Perda do histórico do método** → o conteúdo anterior continua acessível no Git; o guia não deve apontar para código removido.

## Migration Plan

1. Remover a entrada `raflix` do `manifest.json` e apagar `src/raflix/`, `test/raflix.test.js` e `test/fixtures/raflix/`.
2. Apagar os pacotes gerados e executar `node build.js` para regravar os manifests de formato.
3. Remover a linha e a seção do provedor em `providers.md` e o método 3.17 do guia, renumerando o método seguinte.
4. Validar a mudança, rodar lint e a suíte completa e arquivar com o marcador de aposentadoria.
5. Rollback: restaurar os arquivos pelo Git ou reverter o commit; não há dado persistente nem migração.

## Open Questions

Nenhuma.
