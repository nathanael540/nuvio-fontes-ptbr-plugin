# Spec Delta

## Purpose

Renomear o valor visível do idioma estrangeiro de `Não PT-BR` para `Gringo`, mantendo o enum fechado, os sufixos de português sem região e a compatibilidade de entrada com o rótulo antigo.

## MODIFIED Requirements

### Requirement: Enum fechado e saída definida

Todo stream SHALL sair com um dos seis valores do enum `LANGUAGE`: `Dublado`, `Dublado (Não PT-BR?)`, `Legendado`, `Legendado (Não PT-BR?)`, `Gringo` ou `Idioma Desconhecido`. A classificação SHALL NOT criar valor novo e SHALL NOT omitir `language` na saída de `buildStream`. `normalizeLanguage` SHALL aceitar tanto `Gringo` quanto o rótulo antigo `Não PT-BR` como entrada para o mesmo membro.

#### Scenario: Evidência conclusiva

- **WHEN** a fonte informa áudio ou legenda em português
- **THEN** o stream sai com um dos quatro valores de português do enum.

#### Scenario: Sem evidência

- **WHEN** nenhum texto, campo de página ou faixa HLS comprova áudio ou legenda
- **THEN** o stream sai com `Idioma Desconhecido`.

#### Scenario: Idioma estrangeiro

- **WHEN** a fonte comprova áudio estrangeiro e não comprova português
- **THEN** o stream sai com `Gringo`.

#### Scenario: Entrada antiga

- **WHEN** uma fonte ou configuração ainda envia o texto `Não PT-BR` como idioma
- **THEN** `normalizeLanguage` resolve para o membro exibido como `Gringo`.

### Requirement: Legenda estrangeira não é Legendado

Quando o texto cita legenda (`sub`, `legenda`, `legendado`) junto de um idioma estrangeiro conhecido, sem português explícito, a classificação SHALL ser `Gringo`. `Legendado` sozinho SHALL continuar `Legendado`, pela convenção PT-BR.

#### Scenario: English sub

- **WHEN** o rótulo diz `English sub` ou `Legendado Inglês`
- **THEN** o stream sai `Gringo`.

#### Scenario: Legendado sem idioma estrangeiro

- **WHEN** o rótulo diz apenas `Legendado`
- **THEN** o stream sai `Legendado`.

### Requirement: Prioridade de evidência em lista de textos

`languageFromTexts` SHALL ignorar um texto apenas estrangeiro quando um candidato posterior comprova áudio ou legenda em português. Áudio português SHALL continuar tendo prioridade sobre legenda.

#### Scenario: Nome de release em inglês e botão dublado

- **WHEN** o `dn` do magnet diz `English` e o rótulo do botão diz `Dublado`
- **THEN** o stream sai `Dublado`.

#### Scenario: Apenas estrangeiro

- **WHEN** todos os textos conhecidos são estrangeiros e nenhum comprova português
- **THEN** o stream sai `Gringo`.

### Requirement: Áudio estrangeiro comprovado em HLS

Quando a playlist HLS declara faixas de áudio estrangeiras conhecidas e não há legenda portuguesa, o stream SHALL sair `Gringo`. Com legenda portuguesa, SHALL sair `Legendado`. Faixa `und` ou ausente SHALL NOT ser tratada como estrangeira.

#### Scenario: Áudio inglês sem legenda PT

- **WHEN** a playlist declara apenas áudio `LANGUAGE="en"` e nenhuma legenda PT
- **THEN** o stream sai `Gringo`.

#### Scenario: Áudio inglês com legenda PT

- **WHEN** a playlist declara áudio inglês e legenda `LANGUAGE="pt"`/`"pt-BR"`
- **THEN** o stream sai `Legendado`.

#### Scenario: Faixa indefinida

- **WHEN** a playlist declara apenas `LANGUAGE="und"` ou não declara faixa
- **THEN** o stream continua `Idioma Desconhecido`.
