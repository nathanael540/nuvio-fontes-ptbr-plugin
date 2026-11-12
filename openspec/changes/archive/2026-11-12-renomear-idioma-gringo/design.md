# Design

## Context

O enum `LANGUAGE` é fechado e tem seis valores. O membro `NON_PT_BR` representa áudio estrangeiro comprovado e hoje exibe `Não PT-BR`; os sufixos `Dublado (Não PT-BR?)` e `Legendado (Não PT-BR?)` representam outra situação: português confirmado sem região brasileira comprovada.

A mudança é de apresentação do valor, não de classificação. O app, o formatador e os provedores continuam lendo o mesmo membro do enum; muda apenas o texto que aparece na linha de idioma e nos testes de contrato.

## Goals / Non-Goals

**Goals:**

1. Exibir `Gringo` no lugar de `Não PT-BR` no valor isolado do enum.
2. Manter exatamente seis valores em `LANGUAGE`.
3. Aceitar o rótulo antigo como entrada para não quebrar fontes ou configurações que ainda o enviem.
4. Rebuildar os provedores e manter testes e documentação sincronizados.

**Non-Goals:**

1. Renomear os sufixos `Dublado (Não PT-BR?)`/`Legendado (Não PT-BR?)`.
2. Alterar a lógica de descoberta, a prioridade de áudio sobre legenda ou o significado de idioma estrangeiro.
3. Criar valor novo no enum ou mudar o contrato de campos do app.

## Decisions

### 1. Apenas o valor isolado muda

`LANGUAGE.NON_PT_BR` passa a ser `'Gringo'`. Os sufixos com `(Não PT-BR?)` permanecem porque têm outro significado; trocá-los por `(Gringo?)` misturaria idioma estrangeiro com português sem região comprovada.

### 2. Compatibilidade de entrada

`EXACT_MAPPINGS` mantém `['nao pt br', LANGUAGE.NON_PT_BR]` e ganha `['gringo', LANGUAGE.NON_PT_BR]`. Assim, entradas antigas e novas normalizam para o mesmo membro, e `buildStream` aceita apenas o valor final `Gringo`.

### 3. Documentação e propostas ativas

O contrato em `docs/arch.md`, o catálogo de blocos, os testes e as propostas OpenSpec ativas que citam o valor isolado são atualizados. As mudanças arquivadas são históricas e não são reescritas.

## Risks / Trade-offs

1. **Filtros externos por texto.** Quem compara a linha inteira com `^🗣️ Não PT-BR$` deixa de encontrar o valor; deve passar a usar `^🗣️ Gringo$`. A mudança é intencional e o novo texto fica registrado na documentação.
2. **Compatibilidade de saída.** Apenas o valor de saída muda; a compatibilidade é garantida na entrada, não na saída, porque o app recebe o rótulo novo.

## Migration Plan

1. Alterar o enum e os testes.
2. Atualizar documentação e propostas ativas.
3. Rodar lint, testes e build.
4. Arquivar a mudança para sincronizar `openspec/specs/stream-language`.

## Open Questions

Nenhuma.
