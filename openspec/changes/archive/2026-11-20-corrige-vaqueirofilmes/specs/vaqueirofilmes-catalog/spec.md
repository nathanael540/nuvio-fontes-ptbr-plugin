## ADDED Requirements

### Requirement: Diagnóstico sanitizado de ausência

Ao não produzir streams por ausência reconhecida, o provedor SHALL registrar diagnóstico que distinga falta de candidato confirmado, ambiguidade de identidade, ausência de EmbedPlay e ausência de opção Byse suportada. O diagnóstico SHALL omitir URLs, credenciais, respostas brutas e identificadores efêmeros e não SHALL alterar o formato nem o conteúdo de retorno de `getStreams`. Falhas de rede ou parsing SHALL continuar sendo relatadas como falhas, não como ausência.

#### Scenario: Nenhum candidato confirmado

1. **WHEN** as buscas terminam sem candidato confirmado
2. **THEN** o diagnóstico identifica ausência de candidato confirmado e o retorno é vazio.

#### Scenario: Identidade ambígua

1. **WHEN** mais de um candidato é confirmado para uma consulta
2. **THEN** o diagnóstico identifica ambiguidade e o retorno é vazio.

#### Scenario: Player não disponível

1. **WHEN** o filme confirmado não oferece EmbedPlay ou não oferece opção Byse suportada
2. **THEN** o diagnóstico distingue essas situações e o retorno é vazio.

#### Scenario: Erro interno

1. **WHEN** ocorre falha HTTP ou resposta inválida na cadeia
2. **THEN** o erro continua sendo registrado como falha e não como ausência reconhecida.

#### Scenario: Dados sensíveis

1. **WHEN** um diagnóstico é registrado
2. **THEN** ele não inclui URLs, credenciais, respostas brutas ou identificadores efêmeros.
