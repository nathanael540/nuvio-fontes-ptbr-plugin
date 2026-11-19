# Design

## Context

Ver [proposal.md](proposal.md). O site Baixa Cine (https://baixacine.com/) publica cartões de
filmes e séries consultáveis por busca HTML (`https://baixacine.com/?s=<termo>`); cada post no
detalhe publica magnets. Verificação ao vivo (fetch real, 2026-11-19):

1. Busca por "O Brilho do Mar" devolve 30 cartões; o cartão para
   `https://baixacine.com/o-brilho-do-mar-baixar-torrent/` (classe `poster-link`, título "O Brilho
   do Mar", ano 2023). Página 2 não traz o título (não há paginação relevante para este resultado).
2. Detalhe do post publica magnet
   `magnet:?xt=urn:btih:ay7q2qu2azkad74c5i3hcb2tq4aydpbm&amp;dn=BAIXARAPIDO.COM-.WEB-DL.1080P.MKV.-DUBLADO-DUAL-AUDIO-.O+Brilho+do+Mar.2023.1080p.WEB-DL.x264.DUAL.2.0`
   (hash 32 caracteres base32) e bloco tech-info: "Formato: MKV",
   "Qualidade: WEB-DL / 1080P / HD (10/10) - Formato: MKV", "Idioma / áudio Português",
   "Tamanho do arquivo 2.48 GB".
3. O `wp-json`, `/wp-json/wp/v2/search`, `/wp-json/wp/v2/posts` e `/feed/` retornam 404 —
   a fonte não tem API pública utilizável.
4. O hash base32 `ay7q2qu2azkad74c5i3hcb2tq4aydpbm` (32 chars) corresponde a hexadecimal de 40
   chars `063f0d429a065401ff82ea36710753870181bc2c`.

## Goals / Non-Goals

**Goals:**

1. Implementar o provedor `baixacine` conforme a spec do provedor, com streams magnet com hash
   hexadecimal de 40 caracteres, qualidade, idioma, tamanho e metadados da fonte.
2. Cointar entradas em `manifest.json` e `providers.md`; testes Node de desenvolvimento verde em
   `npm test` e `node build.js baixacine`.

**Non-Goals:**

1. Consumir o WP REST ou o feed (inutilizáveis no site).
2. Localizar episódios do catálogo por `season`/`episode` (o site publica magnets por post; sem
   estrutura de episódios verificada — ver notas de risco).
3. Raspagem de player, player (não há stream direto HTTP).
4. Inclusão nos catálogos online (`test/online/catalogs/`) — quando adicionada, atualizar em
   outra mudança.

## Decisions

1. **Busca e parsing com cheerio.** `a.poster-link` com `attr('href')`, `h3.poster-title` e
   `span.poster-year` lendo `.text()`. Alternativa regex (padrão de `wordpress-torrent`): a
   estrutura do site é regular, mas cheerio (padrão de `dooplay` e `animeq`) é mais robusto. Em
   testes, `cheerio-without-node-native` é mapeado para `test/support/basic-html.js`, como em
   `test/dooplay.test.js`.
2. **Identidade com `getMediaInfo` + `findBestMatch`.** O site não publica ID do TMDB. Sem
   confirmação de título/ano, módulo poderia aceitar título errado (verificado ao vivo: resultado
   para "O Brilho do Mar" com score 1 contra `MediaInfo`).
3. **Magnet via `readMagnet` de `torrent-release`.** Normaliza base32→hex (`infoHashFromBtih`),
   preserva `dn` decodificado e adiciona `tr` público quando ausente
   (`addFallbackTrackers: true`, como em `magnetbr`/`betor`).
4. **Qualidade: `discoverQuality([magnet.dn, detalheHtml])`.** No fluxo verificado: `dn` contém
   "1080P" → `1080p`.
5. **Idioma: `languageFromTexts([magnet.dn, 'Idioma / áudio Português', ...])`.** Fluxo verificado:
   `Dublado`.
6. **Tamanho: extração textual** de `Tamanho do arquivo` com regex de unidade (`GB|MB|KB`).
7. **`provider`: "Baixa Cine"; `type`: "magnet".** Sem `seeders`/`peers` (o site não fornece) e
   sem `subtitles`.
8. **Ausência:** `findBestMatch` null → `[]`, sem log.
9. **Fixtures reais:** `test/fixtures/baixacine/search.html` e `detail.html` — respostas reais da
   fonte verificadas ao vivo, cortadas ao mínimo necessário para o parsing (cartão do O Brilho do
   Mar; post inteiro com os tech-infos e o magnet).
10. **F extras e estados:** verificação online do funcionamento exige alteração separada (catálogo +
    `test:online`), registrada em `providers.md` — fora do escopo desta proposta.

## Risks / Trade-offs

- [Busca textual pode não achar um título novo] → **Mitigação:** busca pelo título do TMDB e
  `findBestMatch` com tolerância 1 no ano; ausência total devolve `[]`.
- [F hashing base32 inválido] → `readMagnet` lança; agregado como erro do provedor; `getStreams`
  devolve `[]` (padrão).
- [Página 2 ou paginação futura desvia do resultado] → O resultado verificado está na página 1;
  paginação de busca não verificada — limite documentado em design.
- [Duas páginas públicas mudarem] → fixtures envelhecem; registrado em `docs/tests.md` 6.2.

## Open Questions

1. O site lista "O Brilho do Mar" como filme (URL `filmes/`). Se em outro catálogo ele aparecer
   como série para o mesmo `MediaInfo`, o provider devolve `[]` por falta de magnet no post —
   critério de ajuste futuro.
