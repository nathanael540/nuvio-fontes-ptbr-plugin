# Proposal

## Why

A rodada de 20/11/2026 falhou antes de alcançar o player. O diagnóstico público comprovou que os aliases vivos redirecionam para o catálogo NixPlay em `https://pobreflixtv.camp`; o player antigo informa conteúdo importado da RedeMuvi, e a interface pública de recuperação da própria origem exige a coordenada do post e entrega mídia com `Referer`. O alias `pobreflix.monster` virou página provisória.

## What Changes

1. Aprovar a origem comprovada e remover o alias provisório, sem alterar o Pobreflix HD.
2. Confirmar o TMDB na busca pública e usar a interface pública de recuperação da própria origem para conteúdo importado, sem contornar o endpoint REST bloqueado.
3. Preservar a validação de origem, tema e identidade; distinguir ausência de falha; validar a mídia e montar os headers de reprodução.
4. Cobrir regressões com fixtures sanitizadas e revalidar online o pacote final.

## Capabilities

### New Capabilities

1. `pobreflix-nixplay-provider`: resolução segura do catálogo e streams do PobreFlix NixPlay.

### Modified Capabilities

Nenhuma.

## Impact

1. Mudanças no provedor `pobreflix-nixplay`, testes, fixtures, saídas geradas, `providers.md` e documentação de investigação.
2. Pobreflix HD (`pobreflixtv`) fica fora do escopo; `pobreflixtv.codes` é o catálogo Invision do HD e não é aprovado para o NixPlay.
