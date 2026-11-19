# Design

## Context

Fonte: baixetorrent.org. Observações públicas 19/11/2026: site WordPress; REST devolve `GET /wp-json/wp/v2/posts` com `id`, `link`, `title.rendered`, `content.rendered` (verificada resposta real); posts de detalhe publicam magnets como âncoras `magnet:?xt=urn:btih:<hash40>` com rótulos como `🧲 CAMRip | 3.13 GB | Inglês` e campos `dn`/`xl`/`tr`; a busca por título em `?s=<termo>` funciona também. `rejected-providers.md` inexistente e sem entrada para `baixetorrent` (verificado 19/11/2026).

## Goals / Non-Goals

**Goals:** filmes e séries confirmados pelo TMDB; streams por magnet; sem conta e sem chave externa.

**Non-Goals:** resolução de player, subtitles, reprodução; cache entre chamadas; títulos sem post no catálogo.

## Decisions

1. **Reaproveitamento de blocos.** Reusa `collectWordpressTorrents` (bloco `wordpress-torrent`, já usado por Filmestorrent): `locatePosts` busca `/wp-json/wp/v2/posts?search=...`; `optionsFrom` lê os magnets do HTML do post; `classifyMagnetOption` (`torrent-release`, `language-discovery`) classifica rótulo, qualidade, idioma e tamanho; `resolveTorrentOptions` monta os streams formatados. Alternativa descartada: usar a busca HTML de `?s=` como fonte principal — depende de estrutura observada menos sólida que a REST, que é pública, estruturada e já cobre filmes e séries.
2. **Configuração do catálogo.** `origins: ['https://www.baixetorrent.org']`, `name`/`streamLabel`: "Baixe Torrents", `logo`: URL do ícone do site.
3. **Manifesto.** `supportedTypes: ["movie", "tv"]`, `formats: ["magnet"]`, `contentLanguage: ["pt"]`, `version`: "1.0.0".
4. **Formato do magnet.** Saída é o magnet observado: `buildStream` preserva `dn`, `xl`, `tr` e preenche `infoHash`; `addon`: "Baixe Torrents" via `streamLabel`; ordenação por qualidade pelo `sortByQuality` no `index.js`.
5. **Logo.** `https://www.baixetorrent.org/favicon.ico` — URL de ícone padrão do WP; o URL exato pode ser confirmado na implementação se responder 404.

## Risks / Trade-offs

1. Ausência reconhecida: filmes sem post no catálogo ficam sem streams (`[]`), semelhante aos demais catálogos.
2. A REST pública pode mudar ou desaparecer: erro sobe para `getStreams` e devolve `[]`.
3. Magnets sem hash válido são descartados por triagem do bloco; sem opção restante o provedor devolve `[]`.
