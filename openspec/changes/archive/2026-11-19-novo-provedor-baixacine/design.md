# Design

## Context

Ver [proposal.md](proposal.md). O site Baixa Cine (https://baixacine.com/) publica cartões de
filmes e séries consultáveis pelo formulário `index.php?busca=<termo>`; cada post no detalhe
publica magnets. Verificação ao vivo (fetch real, 2026-11-19):

1. A rota `/?s=<termo>` é ignorada pelo site e devolve os 30 cartões da home. O formulário real
   (`form.nav-search`) envia `GET https://baixacine.com/index.php?busca=<termo>`.
2. A busca por "O Brilho do Mar" em `index.php?busca=` devolve o cartão
   `https://baixacine.com/o-brilho-do-mar-baixar-torrent/` (classe `poster-link`, título "O Brilho
   do Mar", ano 2023). A página lista 30 cartões e tem paginação em
   `/pesquisa/<termo>/pagina/<n>/`.
3. Detalhe do post publica magnet
   `magnet:?xt=urn:btih:ay7q2qu2azkad74c5i3hcb2tq4aydpbm&amp;dn=BAIXARAPIDO.COM-.WEB-DL.1080P.MKV.-DUBLADO-DUAL-AUDIO-.O+Brilho+do+Mar.2023.1080p.WEB-DL.x264.DUAL.2.0`
   (hash 32 caracteres base32) e bloco tech-info: "Formato: MKV",
   "Qualidade: WEB-DL / 1080P / HD (10/10) - Formato: MKV", "Idioma / áudio Português",
   "Tamanho do arquivo 2.48 GB".
4. O `wp-json`, `/wp-json/wp/v2/search`, `/wp-json/wp/v2/posts` e `/feed/` retornam 404 —
   a fonte não tem API pública utilizável.
5. O hash base32 `ay7q2qu2azkad74c5i3hcb2tq4aydpbm` (32 chars) corresponde a hexadecimal de 40
   chars `063f0d429a065401ff82ea36710753870181bc2c`.
6. Buscas por "The Witcher", "The Office" e "Vingadores" devolvem cartões com sufixo de edição ou
   temporada ("The Office - 5ª Temporada", "The Avengers - Os Vingadores - 4K"), e o cartão de
   série traz o ano da temporada (2008 para The Office, série de 2005).

## Goals / Non-Goals

**Goals:**

1. Implementar o provedor `baixacine` conforme a spec do provedor, com streams magnet com hash
   hexadecimal de 40 caracteres, qualidade, idioma, tamanho e metadados da fonte.
2. Manter entradas em `manifest.json` e `providers.md`; testes Node de desenvolvimento verdes em
   `npm test` e `node build.js baixacine`.
3. Registrar a rodada online em `providers.md` com `--record`.

**Non-Goals:**

1. Consumir o WP REST ou o feed (inutilizáveis no site).
2. Localizar episódios do catálogo por `season`/`episode` (o site publica magnets por post; sem
   estrutura de episódios verificada — ver notas de risco).
3. Raspagem de player, player (não há stream direto HTTP).

## Decisions

1. **Busca pelo formulário do site.** `searchUrl` monta
   `https://baixacine.com/index.php?busca=<termo>`, o `action` do formulário real; a rota `/?s=` é
   descartada porque devolve a home. Aceitar apenas cartões dentro do HTML da busca.
2. **Parsing com cheerio.** `a.poster-link` com `attr('href')`, `h3.poster-title` e
   `span.poster-year` lendo `.text()`. Alternativa regex (padrão de `wordpress-torrent`): a
   estrutura do site é regular, mas cheerio (padrão de `dooplay` e `animeq`) é mais robusto. Em
   testes, `cheerio-without-node-native` é mapeado para `test/support/basic-html.js`, como em
   `test/dooplay.test.js`.
3. **Identidade com `getMediaInfo` + `findBestMatch`.** O site não publica ID do TMDB. Para cada
   cartão, variantes do título removem separadores (` - `, ` / `, ` | `) e sufixos de edição ou
   temporada (`4K`, `60 FPS`, `IMAX`, `Legendado`, `5ª Temporada`, `Todas as Temporadas`) antes da
   comparação. Em pedido de filme, cartões com "Temporada" são descartados; em pedido de série,
   só cartões com "Temporada" são aceitos e o ano do cartão é ignorado, porque ele é o ano da
   temporada e não o da série.
4. **Magnet via `readMagnet` de `torrent-release`.** Normaliza base32→hex (`infoHashFromBtih`),
   preserva `dn` decodificado e adiciona `tr` público quando ausente
   (`addFallbackTrackers: true`, como em `magnetbr`/`betor`).
5. **Qualidade: `discoverQuality([magnet.dn, qualidadeDoPost])`.** O `dn` de cada magnet tem
   prioridade; o valor "Qualidade" do post só é usado quando o post tem um único magnet. Sem
   correspondência, `Desconhecida`.
6. **Idioma: `languageFromTexts([magnet.dn, 'Idioma / áudio'])`.** Lê o valor real da linha
   tech-info (ex.: "Português / Inglês"), sem texto fixo; o `dn` de cada magnet tem prioridade.
   Sem conclusão, o campo é omitido e `buildStream` descobre pelo nome do arquivo.
7. **Tamanho: linha "Tamanho do arquivo".** Só é usado quando o post tem um único magnet e o
   valor é um tamanho único. Em posts com vários magnets o site lista tamanhos combinados sem
   relação verificável com cada arquivo; o campo fica ausente em vez de receber valor ambíguo.
8. **`provider`: "Baixa Cine"; `type`: "magnet".** Sem `seeders`/`peers` (o site não fornece) e
   sem `subtitles`.
9. **Ausência:** `findBestMatch` null → `[]`, sem log.
10. **Fixtures reais:** `test/fixtures/baixacine/` com respostas reais verificadas ao vivo,
    cortadas ao mínimo necessário para o parsing: busca de filme, busca com variante de edição,
    busca de série, detalhe do filme com magnet base32 e detalhes com um e três magnets.
11. **Verificação online:** a rodada com `--record` grava o bloco da seção em `providers.md`; o
    runner usa os catálogos genéricos, sem catálogo dedicado ao provedor.

## Risks / Trade-offs

- [Busca textual pode não achar um título novo] → **Mitigação:** busca pelo título do TMDB e
  alternativos, variantes de título e `findBestMatch` com tolerância 1 no ano; ausência total
  devolve `[]`.
- [Paginação da busca não é seguida] → o provedor lê apenas a primeira página (30 cartões); um
  título que caia nas páginas seguintes não é encontrado. Limite documentado.
- [Séries só são aceitas com "Temporada" no título] → o site publica séries como pacotes de
  temporada; um post de série sem o termo não é encontrado. Limite documentado.
- [Ano do cartão de série é o da temporada] → ignorado na confirmação; o título decide. Um remake
  de mesmo título em outra época pode ser escolhido; a linha "Data de lançamento" do detalhe
  (ano da série) fica como confirmação futura.
- [Post com vários magnets e tamanho combinado] → o campo `size` fica ausente para não atribuir
  um valor possivelmente errado.
- [Hash base32 inválido] → `readMagnet` lança; o magnet é descartado com aviso e, se nenhum
  sobrar, o erro sobe e `getStreams` devolve `[]` (padrão).
- [Duas páginas públicas mudarem] → fixtures envelhecem; registrado em `docs/tests.md` 6.2.

## Open Questions

1. O site lista "O Brilho do Mar" como filme (URL `filmes/`). Se em outro catálogo ele aparecer
   como série para o mesmo `MediaInfo`, o provider devolve `[]` por falta de magnet no post —
   critério de ajuste futuro.
2. O provedor valida `season`/`episode`, mas devolve todos os magnets do post confirmado; em
   "Todas as Temporadas" isso pode incluir várias temporadas (a rodada online observou 54
   streams em Grey's Anatomy). Selecionar a temporada pelo título ou pelo `dn` fica como ajuste
   futuro.
