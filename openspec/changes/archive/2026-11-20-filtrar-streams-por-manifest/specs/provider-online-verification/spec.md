# Verificação online dos provedores

## ADDED Requirements

### Requirement: Variante sem filtros como referência pública

A verificação que atualiza o status público SHALL executar o pacote publicado de `prism/all/all/all` e registrar sua identidade. A evidência de uma combinação filtrada SHALL ficar no relatório da execução correspondente.

#### Scenario: Perfil filtrado esvazia a lista

1. **WHEN** uma execução online valida uma variante que aplica filtros e recebe lista vazia
2. **THEN** o resultado fica no relatório da variante e o status público continua baseado no pacote de referência.

### Requirement: Identidade com a combinação executada

A verificação online SHALL usar o ID da entrada do manifest selecionado e incluir a combinação executada na identidade e no relatório da verificação.

#### Scenario: Mesmo pacote com dois pisos de qualidade

1. **WHEN** dois manifests apontam para os mesmos bytes de um pacote e configuram pisos diferentes
2. **THEN** cada execução aplica seu próprio piso e registra uma identidade distinta.
