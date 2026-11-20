# Filtrar streams por manifest

## Why

Quem instala o repositório precisa escolher idioma, resolução mínima e tipo de stream uma única vez para dezenas de provedores. Uma URL de instalação por combinação aplica essa escolha a todos os provedores em Prism ou Google Drive.

## What Changes

1. Gerar um manifest para cada combinação de formato, tipo, qualidade mínima e idioma. Cada eixo de filtragem tem um segmento `all` explícito. Os manifests da matriz apontam para um pacote compartilhado por provedor e formato. O ID da entrada identifica a combinação.
2. Aplicar o filtro à lista final de cada provedor. O tipo é exato, a qualidade é um piso e o idioma é cumulativo na ordem `pt-br`, `pt`, `gringo`, `all`. Um filtro que remove todos os resultados devolve uma lista vazia.
3. Centralizar as equivalências SD/480p, HD/720p, FHD/1080p, QHD/1440p, 4K/2160p e 8K/4320p usadas pelo filtro e pelo build.
4. Adotar `/prism/all/all/all/manifest.json` e `/gdrive/all/all/all/manifest.json` como caminhos padrão para instalações sem filtros. Durante a transição, gerar também `/manifest.json`, `/prism/manifest.json` e `/gdrive/manifest.json` com seus pacotes sem filtros e com a formatação esperada em cada URL.
5. Publicar os pacotes JavaScript minificados.
6. Usar o pacote publicado com a configuração `prism/all/all/all` como referência da verificação online de cada provedor.

## Capabilities

### New Capabilities

1. `stream-manifest-filters` cobre os manifests de instalação, as opções de filtro e o comportamento da lista de streams entregue ao app.

### Modified Capabilities

1. `provider-online-verification` define qual variante publicada serve de referência para o status do provedor.

## Impact

1. `build.js`, cadastro fonte de provedores em `src/manifest.json`, bloco de filtro, bloco de qualidade, matriz gerada sob `prism/` e `gdrive/` e saídas temporárias nos caminhos atuais.
2. Testes offline do bloco, do build, dos manifests e do servidor local. O verificador online passa a localizar o pacote na nova estrutura.
3. README, guia de arquitetura, catálogo de blocos, regras de contribuição e documentação de testes passam a descrever os caminhos gerados. O catálogo de provedores registra a evidência aplicável aos pacotes finais.
