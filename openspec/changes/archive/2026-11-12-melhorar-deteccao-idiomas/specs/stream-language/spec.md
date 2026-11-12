# Spec Delta

## Purpose

Classificar o idioma dos streams a partir da evidência local que a fonte já publica, mantendo o enum fechado e sem afirmar região brasileira sem prova.

## ADDED Requirements

### Requirement: Enum fechado e saída definida

Todo stream SHALL sair com um dos seis valores do enum `LANGUAGE`: `Dublado`, `Dublado (Não PT-BR?)`, `Legendado`, `Legendado (Não PT-BR?)`, `Não PT-BR` ou `Idioma Desconhecido`. A classificação SHALL NOT criar valor novo e SHALL NOT omitir `language` na saída de `buildStream`.

#### Scenario: Evidência conclusiva

- **WHEN** a fonte informa áudio ou legenda em português
- **THEN** o stream sai com um dos quatro valores de português do enum.

#### Scenario: Sem evidência

- **WHEN** nenhum texto, campo de página ou faixa HLS comprova áudio ou legenda
- **THEN** o stream sai com `Idioma Desconhecido`.

### Requirement: Convenção Dual/Tri Áudio

Em fonte PT-BR, `Dual Áudio` e `Tri Áudio` SHALL ser interpretados como áudio português sem região brasileira comprovada, resultando em `Dublado (Não PT-BR?)`. Quando o mesmo texto ou candidato trouxer `PT-BR`, `Brasil`, `POB` ou `Dublado` explícito, o resultado SHALL ser `Dublado`; `Portugal`/`PT-PT` SHALL manter `Dublado (Não PT-BR?)`.

#### Scenario: Dual Áudio isolado

- **WHEN** o rótulo diz `Dual Áudio` sem região
- **THEN** o stream sai `Dublado (Não PT-BR?)`.

#### Scenario: Dual Áudio com região brasileira

- **WHEN** o rótulo diz `Dual Áudio PT-BR`
- **THEN** o stream sai `Dublado`.

#### Scenario: Dublado explícito com Dual

- **WHEN** o texto diz `Dublado Dual Áudio`
- **THEN** o stream sai `Dublado`.

### Requirement: Campos de página da Baixa Rápido

Os leitores da rede Baixa Rápido SHALL ler `Idioma`, `Idiomas` ou `Áudio` da ficha do conteúdo e usar o valor como evidência local de idioma. A leitura SHALL ignorar `Qualidade de Áudio`/`Qualidade do Áudio` e SHALL NOT fazer requisição adicional.

#### Scenario: Ficha com Idioma

- **WHEN** a ficha publica `Idioma: Português / Inglês` e o rótulo do magnet não informa idioma
- **THEN** o stream sai `Dublado (Não PT-BR?)`.

#### Scenario: Ficha sem Idioma

- **WHEN** a ficha não publica campo de idioma e o restante não comprova áudio ou legenda
- **THEN** o stream sai `Idioma Desconhecido`.

### Requirement: Legenda estrangeira não é Legendado

Quando o texto cita legenda (`sub`, `legenda`, `legendado`) junto de um idioma estrangeiro conhecido, sem português explícito, a classificação SHALL ser `Não PT-BR`. `Legendado` sozinho SHALL continuar `Legendado`, pela convenção PT-BR.

#### Scenario: English sub

- **WHEN** o rótulo diz `English sub` ou `Legendado Inglês`
- **THEN** o stream sai `Não PT-BR`.

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
- **THEN** o stream sai `Não PT-BR`.

### Requirement: Áudio estrangeiro comprovado em HLS

Quando a playlist HLS declara faixas de áudio estrangeiras conhecidas e não há legenda portuguesa, o stream SHALL sair `Não PT-BR`. Com legenda portuguesa, SHALL sair `Legendado`. Faixa `und` ou ausente SHALL NOT ser tratada como estrangeira.

#### Scenario: Áudio inglês sem legenda PT

- **WHEN** a playlist declara apenas áudio `LANGUAGE="en"` e nenhuma legenda PT
- **THEN** o stream sai `Não PT-BR`.

#### Scenario: Áudio inglês com legenda PT

- **WHEN** a playlist declara áudio inglês e legenda `LANGUAGE="pt"`/`"pt-BR"`
- **THEN** o stream sai `Legendado`.

#### Scenario: Faixa indefinida

- **WHEN** a playlist declara apenas `LANGUAGE="und"` ou não declara faixa
- **THEN** o stream continua `Idioma Desconhecido`.

### Requirement: BeTor não usa languages como áudio

O provedor BeTor SHALL NOT usar o campo `languages` da API como prova de áudio, porque ele mistura áudio e legenda embutida. A classificação SHALL usar os nomes do torrent e o `dn`, agora com a convenção Dual/Tri.

#### Scenario: Release com legenda embutida

- **WHEN** a API devolve `languages: ["pt","en"]`, mas o release é `WEBRip` com arquivos `.srt` e sem indicação de áudio português
- **THEN** o provedor não promove o stream a `Dublado` por causa de `languages`.
