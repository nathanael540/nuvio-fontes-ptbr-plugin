# Proposta: provedor Donghua No Sekai

## Why

O Donghua No Sekai é um catálogo brasileiro dedicado a donghuas (animações chinesas), com séries e filmes legendados em português. O site publica busca HTML, fichas com temporada, ano e títulos alternativos, e páginas de player que entregam HLS ou MP4 do Blogger. A fonte ainda não está representada neste repositório e amplia a cobertura de animação asiática além do recorte japonês já atendido pelos provedores de anime.

A investigação de 19/11/2026 foi feita apenas nas URLs públicas `https://donghuanosekai.com` e `https://donghuanosekai.com/donghuas`, sem consultar código de terceiros. O HTML, os scripts públicos e as respostas do site foram a única evidência de contrato; a rodada online do pacote final continua sendo a prova de funcionamento.

## What Changes

1. Adicionar `src/donghuanosekai/` com `index.js` (contrato do app e captura única), `catalog.js` (termos de busca, identidade, temporada e episódio), `site.js` (HTTP e leitura do HTML), `players.js` (players DNSK, player-new, Blogger e triagem) e `extractor.js` (orquestração), em JavaScript puro com JSDoc.
2. Buscar com `GET https://donghuanosekai.com/?s=<termo>` e ler os cartões `div.itemE.capa`, com o tipo em `div.selos[data-ona]` (`Movie`, `ONA`, `TV` ou `Special`), o título em `h3` e a URL da ficha.
3. Montar até quatro termos com o título limpo do TMDB, o original chinês (forma curta antes de pontuação ou de `之` e forma completa) e o primeiro alternativo/romaji; acumular os cartões sem repetir URL.
4. Confirmar a identidade na ficha por `h1`, `Titulo Alternativo`, `Ano` e `Tipo`, com tolerância de um ano e comparação exata para títulos não latinos; descartar `Special` e tipo divergente.
5. Selecionar a temporada pelo marcador do `h1` (`Nª Temporada`, `Temporada N`, `Season N`, `Nth Season`), nunca pela posição; sem marcador, aceitar apenas a temporada 1 quando o TMDB tiver uma única temporada regular ou quando o episódio pedido couber na temporada 1; temporada ausente é ausência.
6. Selecionar o episódio pela lista `div.episode_list div.item`, usando `span.episode` (`Episódio 19 (184)` vale 19) e a URL publicada; ignorar links `__trashed` e faixas `Episódios N-M`.
7. Em filme, usar os players da própria ficha; se a ficha for uma coleção `Movie` com um único episódio e nenhum player, seguir esse único link; coleção com mais de um item é ausência.
8. Resolver cada `div.slideItem[data-video-url]` em isolamento: player nativo `player-nativov2.php` (parâmetros `v` e `720`), `player-new/?url=`, `<source>` direto e Blogger (`blogger.com/video.g`) pelo bloco `blogger-video`; Dailymotion, StreamSB, Fembed, Wolfstream, Short.ink e hosts não comprovados são triagem.
9. Montar cada stream com `buildStream` e `format`, `type` `hls` ou `mp4`, `quality` do rótulo `size`/`qualityLabel` ou descoberta local na URL, idioma `Legendado` (catálogo declaradamente legendado em PT-BR) e sem cabeçalhos, porque o HLS respondeu sem `Referer`.
10. Isolar a falha de cada player com `console.warn('[Donghua No Sekai] Opção <rótulo> descartada: <causa>')`; se nenhum produzir stream e algum tiver falhado, subir erro agregado. Somente `getStreams` captura a falha final.
11. Cobrir com testes Node e fixtures reais sanitizadas: filme direto, filme em coleção, série de temporada única, temporada específica, episódio ausente, busca vazia, ano divergente, player nativo com duas qualidades, player-new, Blogger, `<source>` direto, host de triagem, falha isolada e deduplicação.
12. Registrar `donghuanosekai` no `manifest.json`, em `providers.md` e nos catálogos online com um perfil `donghua` (tag nova) e cinco títulos verificados por tipo, porque o perfil generalista mediria títulos fora do acervo.
13. Documentar o método em `docs/provider-investigation.md` como catálogo WordPress com players DNSK e Blogger.
14. Fora do escopo: conta, login, downloads, anúncios, sondagem de mídia, cache, timeout próprio, contorno de bloqueio e qualquer código de scraper externo.

## Capabilities

### New Capabilities

- `donghuanosekai`: catálogo de donghuas do Donghua No Sekai, confirmação de identidade e temporada, seleção de episódio, resolução dos players DNSK/Blogger e contrato dos streams HLS/MP4.

### Modified Capabilities

Nenhuma. O perfil `donghua` usa o mecanismo genérico de nicho exclusivo já especificado em `provider-online-verification`.

## Impact

1. Código: `src/donghuanosekai/` (novo), `test/donghuanosekai.test.js` e fixtures em `test/fixtures/donghuanosekai/`.
2. Configuração: `manifest.json`, `providers.md`, `test/online/profiles.json`, `test/online/catalogs/movie.json`, `test/online/catalogs/tv.json` e `test/online-catalog.test.js`.
3. Documentação: `README.md` (contagem de provedores, se necessário), `docs/tests.md`, `docs/provider-investigation.md` e a spec da capability.
4. Saída gerada: `providers/donghuanosekai.js`, `gdrive/providers/donghuanosekai.js`, `prism/providers/donghuanosekai.js` e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; o fluxo usa `http`, `tmdb-info`, `title-match`, `slugify`, `blogger-video`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`, sem bloco novo.
6. Sem migração de dados, sem mudança de contrato para os provedores atuais e sem nova chave ou serviço externo.
