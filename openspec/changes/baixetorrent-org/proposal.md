# Proposal

## Why

Aumenta o catálogo de filmes e séries disponíveis ao app: baixetorrent.org é um catálogo público ativo (acessado 19/11/2026), com categorias Filmes/Séries, lançamentos em 4k e 1080p, dublados e legendados, e sem nenhum provedor neste repositório capturando essa fonte.

## What Changes

- Novo provedor `baixetorrent-org` que localiza magnets em filmes e séries no catálogo público baixetorrent.org, com identificação via TMDB; fica à disposição magnets, e `torrent://` quando o episódio de um pacote de temporada for extraído (pacote para série, magnet para filme).

## Capabilities

### New Capabilities
- `baixetorrent-org`: streams de filmes e séries do catálogo público baixetorrent.org.

### Modified Capabilities
<!-- Entries de capacidades existentes cujas REQUISITOS mudam; vazio quando não há mudança de comportamento de spec. -->

## Impact

- `src/baixetorrent-org/`: código-fonte do provedor.
- `manifest.json`: entrada do novo scraper.
- `providers.md`: linha e seção do novo provedor no catálogo.
- `test/baixetorrent-org.test.js`: suíte de desenvolvimento.
- Blocos existentes a reutilizar: `wordpress-torrent`, `tmdb-info`, `title-match`, `slugify` e afins; possíveis novos se a fonte nova necessitar.
