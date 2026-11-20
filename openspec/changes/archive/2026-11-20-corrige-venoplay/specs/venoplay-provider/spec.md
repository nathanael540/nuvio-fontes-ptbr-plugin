# Spec Delta

## ADDED Requirements

### Requirement: Ausência localizada na busca

Quando a busca não trouxer cartões, o provedor SHALL reconhecer a mensagem localizada de ausência da fonte e devolver lista vazia, sem `console.error`. Página sem cartões e sem marcador de ausência SHALL continuar sendo erro de estrutura. Mensagem de categoria vazia em página com cartões SHALL NOT ser tratada como ausência.

#### Scenario: Busca sem resultados em português

- **WHEN** a busca responde 200 sem `div.poster-card` e publica `Nenhum resultado encontrado`
- **THEN** o provedor devolve lista vazia, sem erro fatal e sem `console.error`.

#### Scenario: Busca sem resultados em inglês

- **WHEN** a busca responde 200 sem cartões e publica `site search yielded no results`
- **THEN** o provedor devolve lista vazia, preservando o comportamento anterior.

#### Scenario: Busca sem cartões e sem marcador

- **WHEN** a busca responde 200 sem cartões e sem marcador de ausência em português ou inglês
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

#### Scenario: Mensagem de categoria vazia com cartões

- **WHEN** a página da busca tem cartões e uma seção publica `Nenhum anime encontrado` ou outra mensagem de categoria vazia
- **THEN** o provedor processa os cartões normalmente e não trata a mensagem como ausência.

## MODIFIED Requirements

### Requirement: Resolução do player `mgeb`

Cada item de `players` SHALL ser uma opção independente. O provedor SHALL abrir a URL do player `mgeb.space`/`mgeb.lat`, ler `var sources` e manter somente HLS HTTPS de `mgeb.space` ou `mgeb.lat`, com caminho `.m3u8` ou `.php`, sem `workers.dev`, sem userinfo e sem parâmetro `username`, `token` ou `password`; `novix.x10.mx`, `infrastructuredesign.space` e `fontedecanais` SHALL ser triagem. O host `nhdapi.com` SHALL ser triagem sem requisição. Falha de uma opção SHALL preservar as demais.

#### Scenario: Opção dublada no `mgeb`

- **WHEN** o `get_players` devolve uma opção `Dublado` em `mgeb.space` ou `mgeb.lat`
- **THEN** o provedor abre o player e lê `var sources`.

#### Scenario: Fonte HLS aceita

- **WHEN** `sources` traz uma URL `.m3u8` HTTPS de `mgeb.space` ou `mgeb.lat`
- **THEN** o provedor monta um stream HLS com essa URL.

#### Scenario: Fonte HLS em endpoint `.php`

- **WHEN** `sources` traz `type: hls` com URL HTTPS de `mgeb.space` ou `mgeb.lat` cujo caminho termina em `.php`
- **THEN** o provedor monta um stream HLS com essa URL.

#### Scenario: Fonte HLS em caminho não comprovado

- **WHEN** `sources` traz `type: hls` em `mgeb.space` ou `mgeb.lat` com caminho diferente de `.m3u8` e `.php`
- **THEN** o provedor descarta a fonte por triagem.

#### Scenario: Fonte com credencial

- **WHEN** a URL de uma fonte contém `username`, `token` ou `password`
- **THEN** o provedor a descarta por triagem, mesmo que responda mídia.

#### Scenario: Fonte de worker

- **WHEN** a URL de uma fonte pertence a `workers.dev`
- **THEN** o provedor a descarta por triagem.

#### Scenario: Player sem `sources`

- **WHEN** a página do player responde 2xx sem `var sources`
- **THEN** a opção falha com erro de estrutura.

#### Scenario: `sources` vazio

- **WHEN** `var sources` é uma lista vazia ou sem nenhuma fonte HLS aceitável
- **THEN** a opção termina em ausência.

#### Scenario: Opção legendada indisponível

- **WHEN** o `get_players` devolve `Legendado` em `nhdapi.com`
- **THEN** o provedor descarta a opção por triagem, sem requisição ao host.

#### Scenario: Falha do host `mgeb.space`

- **WHEN** o player em `mgeb.space` responde fora de 2xx
- **THEN** o provedor tenta o mesmo caminho em `mgeb.lat` antes de descartar a opção.

#### Scenario: Uma opção falha e outra resolve

- **WHEN** uma opção falha e a outra produz playlist
- **THEN** o provedor devolve o stream da opção válida e registra o aviso da descartada.
