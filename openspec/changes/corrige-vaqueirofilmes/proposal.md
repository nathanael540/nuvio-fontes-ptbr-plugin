# Proposal

## Why

A rodada de referência de 20/11/2026 não resolveu nenhum dos cinco filmes selecionados. O relatório não identifica a etapa responsável; não há correção comprovada nem justificativa para atribuir a falha a um player específico.

## What Changes

1. Identificar, com observações públicas e sanitizadas, a etapa de ausência ou falha em cada caso.
2. Tornar identificável no diagnóstico do provedor a etapa de ausência reconhecida, sem alterar a resposta pública `getStreams` ou registrar dados sensíveis.
3. Condicionar correções a evidência reproduzível, testes offline e revalidação online; sem evidência, registrar o bloqueio sem alegar solução.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

1. `vaqueirofilmes-catalog`: identificar a etapa de ausência entre catálogo e players, preservando o contrato de retorno.

## Impact

1. Possíveis alterações em `src/vaqueirofilmes/`, testes, fixtures e documentação, condicionadas à investigação.
2. Publicação exige build e verificação online de `prism/all/all/all`; tipos, idioma e hosts aceitos não mudam sem evidência e atualização da spec correspondente.
