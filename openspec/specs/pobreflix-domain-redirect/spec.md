# pobreflix-domain-redirect Specification

## Purpose

Permitir que o Pobreflix HD acompanhe trocas oficiais de TLD sem aceitar redirect para qualquer origem.

## Requirements

### Requirement: Redirect por base de domínio

O Pobreflix HD SHALL seguir redirect apenas para HTTPS com host `base.tld` ou `www.base.tld`, onde `base` está na lista configurada e `tld` é um único rótulo alfabético. SHALL rejeitar HTTP, subdomínio arbitrário, lookalike e redirect em cascata.

#### Scenario: Redirect oficial para novo TLD

1. **WHEN** a busca em `www.pobreflixtv.golf` retorna redirect para `www.pobreflixtv.town`
2. **THEN** o redirect é seguido porque a base `pobreflixtv` está configurada.

#### Scenario: Base flixtv

1. **WHEN** o redirect aponta para `flixtv.town` ou `www.flixtv.app`
2. **THEN** o destino é aceito porque `flixtv` está na lista de bases.

#### Scenario: Base pobreflixtv em outro TLD

1. **WHEN** o redirect aponta para `pobreflixtv.town` ou `www.pobreflixtv.app`
2. **THEN** o destino é aceito porque `pobreflixtv` está na lista de bases.

#### Scenario: Base thepobretvflix

1. **WHEN** o redirect aponta para `thepobretvflix.com` ou `www.thepobretvflix.app`
2. **THEN** o destino é aceito porque `thepobretvflix` está na lista de bases.

#### Scenario: Lookalike rejeitado

1. **WHEN** o redirect aponta para `evilpobreflixtv.com` ou `pobreflixtv.evil.com`
2. **THEN** o destino é rejeitado, mesmo contendo a base como substring.

#### Scenario: Subdomínio arbitrário rejeitado

1. **WHEN** o redirect aponta para `sub.pobreflixtv.town`
2. **THEN** o destino é rejeitado; somente `base.tld` e `www.base.tld` são aceitos.

#### Scenario: HTTP rejeitado

1. **WHEN** o redirect aponta para `http://www.pobreflixtv.town/`
2. **THEN** o destino é rejeitado por não ser HTTPS.

#### Scenario: Redirect em cascata rejeitado

1. **WHEN** o primeiro destino permitido responde com outro redirect
2. **THEN** o segundo redirect é rejeitado.

### Requirement: Lista explícita de bases

A lista de bases SHALL ser explícita, inicialmente `pobreflixtv`, `flixtv` e `thepobretvflix`. Uma nova base SHALL exigir alteração de código e teste; o hostname não SHALL ser aceito apenas por conter uma base como substring.

#### Scenario: Base configurada

1. **WHEN** o host usa uma base da lista e um TLD de um rótulo
2. **THEN** o host é elegível para redirect.

#### Scenario: Base desconhecida

1. **WHEN** o host usa `outrabase.town`
2. **THEN** o redirect é rejeitado.

#### Scenario: Substring não basta

1. **WHEN** o host é `meupobreflixtv.com`
2. **THEN** o redirect é rejeitado porque a base não é um rótulo exato.

### Requirement: Continuidade após redirect

Após aceitar o redirect, a busca, a página do conteúdo e o `playerData` SHALL funcionar no host de destino permitido, mantendo a confirmação de TMDB e as opções de players.

#### Scenario: Fluxo completo no destino

1. **WHEN** a busca em `.golf` redireciona para `.town` e retorna um candidato
2. **THEN** a página do candidato confirma o TMDB e o `playerData` do mesmo host retorna os players.
