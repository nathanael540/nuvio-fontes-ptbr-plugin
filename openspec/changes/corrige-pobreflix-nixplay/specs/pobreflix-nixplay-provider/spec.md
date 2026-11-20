# Spec Delta

## Purpose

Descrever a resolução segura de filmes e episódios pelo catálogo PobreFlix NixPlay.

## ADDED Requirements

### Requirement: Origem verificada antes da consulta

O provedor SHALL consultar o player somente em uma origem HTTPS explicitamente aprovada e identificada como catálogo NixPlay por evidência verificável. Um redirecionamento para origem não aprovada ou uma página sem identidade reconhecida SHALL ser tratado como falha operacional, não como ausência de título.

#### Scenario: Origem não aprovada

1. **WHEN** um alias termina em origem não aprovada
2. **THEN** o provedor rejeita a origem antes de enviar consulta ao player e tenta os demais aliases elegíveis.

#### Scenario: Identidade não reconhecida

1. **WHEN** uma origem aprovada responde sem os sinais de identidade reconhecidos
2. **THEN** o provedor não consulta seu player e registra falha operacional se nenhum outro alias produzir stream.

#### Scenario: Alias alternativo verificado

1. **WHEN** um alias falha e outro alcança origem aprovada e identificada que oferece mídia válida
2. **THEN** o provedor retorna os streams desse segundo alias.

### Requirement: Conteúdo importado pela interface pública

O provedor SHALL, ao receber da origem aprovada a indicação de conteúdo importado da RedeMuvi, confirmar o TMDB na página pública, obter a coordenada do post e consultar a recuperação pública declarada pela própria origem. A mídia SHALL corresponder ao host e ao caminho da configuração verificada, com os headers exigidos para reprodução.

#### Scenario: Filme ou episódio importado

1. **WHEN** a origem aprovada confirma o TMDB pedido e informa conteúdo importado
2. **THEN** o provedor consulta a recuperação pública com a coordenada da página confirmada e retorna os streams de mídia válidos.

#### Scenario: Recuperação sem fonte

1. **WHEN** a recuperação pública responde que a fonte não foi encontrada
2. **THEN** o provedor trata o caso como ausência, sem erro operacional.

### Requirement: Resolução e ausência de conteúdo

O provedor SHALL consultar filmes e episódios por suas coordenadas e retornar streams válidos conforme o contrato do projeto. Ausência explícita de conteúdo SHALL ser distinguida de falhas de rede, identidade e player.

#### Scenario: Filme e episódio disponíveis

1. **WHEN** uma origem verificada confirma filme ou episódio e fornece mídia válida
2. **THEN** o provedor retorna os streams correspondentes à mídia solicitada.

#### Scenario: Conteúdo ausente

1. **WHEN** todas as origens verificadas consultadas confirmam ausência e nenhuma falha operacional ocorre
2. **THEN** o provedor retorna lista vazia sem classificá-la como erro operacional.

#### Scenario: Busca sem correspondência

1. **WHEN** a busca pública não confirma o TMDB pedido em nenhuma página
2. **THEN** o provedor retorna lista vazia sem classificá-la como falha operacional.

#### Scenario: Falha operacional sem stream

1. **WHEN** não há stream e ao menos uma origem falha operacionalmente
2. **THEN** o provedor registra erro sanitizado e retorna lista vazia, sem declarar ausência de catálogo.
