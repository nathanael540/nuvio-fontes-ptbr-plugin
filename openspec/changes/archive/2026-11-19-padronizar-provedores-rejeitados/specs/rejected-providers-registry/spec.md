# rejected-providers-registry Specification

## ADDED Requirements

### Requirement: Estrutura e colunas da tabela resumo

O arquivo `rejected-providers.md` SHALL iniciar com a tabela resumo contendo exatamente as colunas `Provedor`, `ID`, `Categoria`, `Motivo resumido` e `Data`. Cada linha SHALL identificar um `ID` único em kebab-case, um link para sua seção e a data no formato `AAAA-MM-DD`.

#### Scenario: Tabela válida e formatada

- **WHEN** `rejected-providers.md` lista entradas na tabela resumo
- **THEN** todas as colunas obrigatórias estão presentes, sem IDs repetidos e com data `AAAA-MM-DD`.

#### Scenario: Data fora do padrão

- **WHEN** uma linha da tabela informa data diferente de `AAAA-MM-DD`
- **THEN** a validação do catálogo rejeita o documento.

### Requirement: Categorias fechadas e seções correspondentes

Cada entrada na tabela SHALL usar uma das categorias `Bloqueio anti-bot`, `Autenticação ou chave`, `Execução incompatível`, `Sem mídia utilizável` ou `Escopo ou duplicidade` e SHALL ter uma seção `## <Provedor>` correspondente com lista numerada contendo os seis campos obrigatórios.

#### Scenario: Seção completa em sincronia com a tabela

- **WHEN** uma linha aponta para `## TorrentFilmesX`
- **THEN** a seção existe na mesma ordem ou correspondência única, repete data e categoria da tabela e traz todos os seis campos obrigatórios.

#### Scenario: Categoria desconhecida ou seção ausente

- **WHEN** uma entrada usa categoria fora da lista ou não possui seção correspondente
- **THEN** a validação falha explicitando a divergência.

### Requirement: Separação do manifest publicado

Nenhum `ID` listado em `rejected-providers.md` SHALL estar presente em `manifest.json`. Provedores desativados (`enabled: false`) SHALL permanecer em `providers.md`, e não na lista de rejeitados.

#### Scenario: Conflito com o manifest

- **WHEN** um `ID` ativo ou desativado em `manifest.json` também aparece em `rejected-providers.md`
- **THEN** a validação aponta o conflito de estado.

### Requirement: Sanitização do registro público

O documento `rejected-providers.md` SHALL NOT conter credenciais, tokens, cookies, URLs com parâmetros de autenticação, links `magnet:?` nem hashes SHA-256 de 64 caracteres.

#### Scenario: Informação sensível bloqueada

- **WHEN** uma seção ou resumo contém `token=` ou link `magnet:?`
- **THEN** a validação rejeita o documento antes de publicar.
