# Filtros de streams por manifest

## Purpose

A URL de instalação permite escolher uma combinação de filtros para todos os provedores de um manifest do Nuvio.

## ADDED Requirements

### Requirement: Matriz de manifests de instalação

O repositório SHALL publicar um manifest em `/<formato>/<tipo>/<qualidade>/<idioma>/manifest.json` para cada combinação de `prism` ou `gdrive`, `P2P`, `HTTP` ou `all`, os seis pisos de resolução ou `all`, e `pt-br`, `pt`, `gringo` ou `all`.

#### Scenario: Instalação com três filtros

1. **WHEN** o usuário instala `/prism/P2P/720p/pt-br/manifest.json`
2. **THEN** o Nuvio carrega a combinação Prism, P2P, piso 720p e idioma PT-BR.

### Requirement: Todos os filtros são opcionais por eixo

Cada segmento `all` SHALL desativar somente o filtro daquele eixo. Os caminhos padrão de instalação da matriz SHALL explicitar os três segmentos de filtro.

#### Scenario: Instalação sem filtros

1. **WHEN** o usuário quer receber todos os streams
2. **THEN** a URL de instalação termina em `/prism/all/all/all/manifest.json` ou `/gdrive/all/all/all/manifest.json`.

### Requirement: Compatibilidade temporária das URLs de instalação

Durante a transição, `/prism/manifest.json` e `/gdrive/manifest.json` SHALL entregar os mesmos resultados e formatação da respectiva variante `all/all/all`. `/manifest.json` SHALL entregar resultados sem filtros e manter o sorteio de formato por carregamento do provedor. Os três manifests SHALL manter os IDs originais e resolver `providers/<id>.js` na própria pasta.

#### Scenario: Instalação existente com formato fixo

1. **WHEN** o app atualiza `/prism/manifest.json` ou `/gdrive/manifest.json`
2. **THEN** carrega o pacote no caminho atual e obtém a mesma lista formatada da variante `all/all/all` correspondente.

#### Scenario: Instalação existente no caminho da raiz

1. **WHEN** o app atualiza `/manifest.json`
2. **THEN** carrega os pacotes da raiz e recebe todos os streams do provedor com o formato sorteado no carregamento.

### Requirement: Pacotes compartilhados por formato

Cada manifest da matriz SHALL identificar sua combinação no nome e listar os provedores do cadastro fonte. Para um mesmo formato e provedor, todas as entradas SHALL usar a mesma URL absoluta em `filename`, apontando para o pacote compartilhado em `/<formato>/providers/<id-base>.js`.

#### Scenario: Mesmo provedor em dois pisos de qualidade

1. **WHEN** os manifests de `/prism/HTTP/720p/pt-br/` e `/prism/HTTP/1080p/pt-br/` listam `seekee`
2. **THEN** ambos apontam para o mesmo pacote em `/prism/providers/seekee.js`.

### Requirement: Filtros identificados no manifest

Cada entrada da matriz SHALL codificar os filtros no ID com o padrão `<id-base>--<tipo>-<qualidade>-<idioma>`, em minúsculas. O pacote SHALL aplicar a combinação informada pelo identificador recebido do app.

#### Scenario: Mesmo pacote com resultados diferentes

1. **WHEN** o pacote recebe `seekee--http-720p-pt-br` e `seekee--http-1080p-pt-br` em duas execuções com os mesmos streams de 720p e 1080p, ambos HTTP e PT-BR
2. **THEN** a primeira execução devolve os dois streams e a segunda devolve somente 1080p.

### Requirement: Minificação dos pacotes publicados

Os pacotes JavaScript publicados SHALL sair minificados, preservando o contrato do provedor e a aplicação dos filtros da combinação.

#### Scenario: Execução do pacote minificado

1. **WHEN** uma entrada usa o pacote final de publicação para sua combinação
2. **THEN** o pacote minificado devolve a mesma lista que o pacote de desenvolvimento para a mesma entrada e fonte.

### Requirement: Tipo de stream exato

O filtro `P2P` SHALL aceitar `magnet:` e `torrent://`. O filtro `HTTP` SHALL aceitar `http:` e `https:`. O tipo SHALL ser determinado pelo protocolo da URL.

#### Scenario: Filme ou episódio via torrent

1. **WHEN** a lista contém magnet, arquivo de torrent e URL HTTPS e o tipo é `P2P`
2. **THEN** o magnet e o arquivo de torrent passam no filtro de tipo.

### Requirement: Equivalências de qualidade

As equivalências de qualidade SHALL ser SD/480p, HD/720p, FHD/1080p, QHD/1440p, 4K/2160p e 8K/4320p. Os caminhos SHALL representar cada piso pela resolução em pixels.

#### Scenario: Piso Ultra HD

1. **WHEN** a qualidade escolhida é 4K
2. **THEN** o segmento de qualidade do manifest é `2160p`.

### Requirement: Qualidade por resolução mínima

Um piso de qualidade SHALL aceitar todo stream com resolução normalizada igual ou superior ao piso. `CAM` e `Desconhecida` SHALL passar no filtro de qualidade apenas com `all`.

#### Scenario: Piso HD com resoluções intermediárias

1. **WHEN** o piso é `720p` e chegam 540p, 720p, 800p, 1080p, 4K, CAM e Desconhecida
2. **THEN** passam 720p, 800p, 1080p e 4K.

### Requirement: Níveis cumulativos de idioma

O nível `pt-br` SHALL aceitar `Dublado` e `Legendado`. O nível `pt` SHALL acrescentar `Dublado (Não PT-BR?)` e `Legendado (Não PT-BR?)`. O nível `gringo` SHALL acrescentar `Gringo`. O nível `all` SHALL acrescentar `Idioma Desconhecido`.

#### Scenario: Idiomas misturados em uma mesma lista

1. **WHEN** a lista contém um stream de cada valor do enum de idioma
2. **THEN** `pt-br`, `pt`, `gringo` e `all` aceitam respectivamente dois, quatro, cinco e seis streams.

### Requirement: Combinação dos filtros na lista final

O provedor SHALL devolver os streams da lista final que passam em todos os filtros ativos da combinação. A lista SHALL preservar a ordem relativa e os dados dos streams aceitos.

#### Scenario: Todos os streams são filtrados

1. **WHEN** a fonte tem streams, mas nenhum atende à combinação
2. **THEN** o provedor devolve exclusivamente uma lista vazia.

#### Scenario: Fonte sem resultados

1. **WHEN** o provedor conclui a busca com lista vazia
2. **THEN** devolve a lista vazia em qualquer combinação.
