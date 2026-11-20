# therarbg-provider Specification

## Purpose
Definir a resolução segura de torrents do TheRARBG para filmes e episódios, distinguindo ausência de falha técnica.

## Requirements

### Requirement: Identidade e ausência

O provedor SHALL consultar a obra associada ao IMDb do pedido e verificar sua identidade e tipo antes de retornar streams. Uma ausência SHALL ser reconhecida somente quando comprovada pelo contrato da fonte; uma falha HTTP ou resposta inválida SHALL NOT ser silenciosamente convertida em ausência sem evidência de que aquela resposta representa ausência.

#### Scenario: Obra com lista vazia válida

- **WHEN** a fonte confirma a identidade da obra e retorna lista de torrents vazia
- **THEN** o provedor retorna lista vazia sem erro fatal.

#### Scenario: Obra não indexada na fonte

- **WHEN** a consulta da obra responder HTTP 404 com o corpo JSON documentado `{"error":"not found"}`
- **THEN** o provedor reconhece a ausência da obra, registra a ausência e retorna lista vazia sem erro fatal.

#### Scenario: Resposta HTTP sem semântica de ausência comprovada

- **WHEN** uma consulta necessária retorna HTTP 404 sem contrato comprovado de ausência para aquela operação
- **THEN** o provedor registra falha na fronteira e retorna lista vazia, sem classificá-la como ausência reconhecida.

#### Scenario: Identidade divergente

- **WHEN** a resposta contradiz a identidade ou o tipo da obra solicitada
- **THEN** o provedor não retorna streams daquela obra e registra a falha.

### Requirement: Confirmação das opções

O provedor SHALL retornar somente opções com metadados de idioma verificados e identidade consistente; episódios em pacotes SHALL apontar para o arquivo correspondente. Uma falha de opção independente SHALL preservar opções válidas e SHALL ser registrada, e falhas de todas as opções SHALL chegar à fronteira de erro.

#### Scenario: Filme com faixa comprovada

- **WHEN** um torrent de filme corresponde à obra e sua verificação confirma uma faixa portuguesa elegível
- **THEN** o provedor retorna o stream formatado com idioma correspondente à evidência.

#### Scenario: Episódio em pacote

- **WHEN** uma opção verificada contém o episódio solicitado e a lista ordenada do torrent identifica um único arquivo correspondente
- **THEN** o stream aponta para o índice desse arquivo.

#### Scenario: Opção falha e outra resolve

- **WHEN** uma opção independente falha tecnicamente e outra produz stream válido
- **THEN** o provedor retorna o stream válido e registra aviso da opção descartada.

#### Scenario: Nenhuma opção elegível

- **WHEN** todas as opções são descartadas por critérios de elegibilidade comprovados, sem falha técnica
- **THEN** o provedor retorna lista vazia sem erro fatal.
