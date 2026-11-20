# Proposal

## Why

O RedeCanais é um catálogo PT-BR de filmes, séries, animes, novelas e desenhos, com acervo amplo e atualização diária. A fonte usa o CMS PhpMelody com tema Echo: busca HTML, fichas de filme e série, episódios publicados por temporada e um player próprio `player3/server.php` que entrega MP4 assinado. Nenhum provedor atual cobre essa cadeia.

A investigação de 20/11/2026 confirmou que a fonte responde ao `fetch` direto, sem conta, cookie, chave ou desafio anti-bot, e que o player exige apenas o `Referer` da própria página. O MP4 respondeu `206` com `video/mp4` sem cabeçalhos de reprodução. A cobertura atual não tem um catálogo generalista com essa combinação de busca por título, série com episódios por temporada e mídia direta.

## What Changes

1. Adicionar o provedor `redecanais`, para `movie` e `tv`, em `src/redecanais/`, com versão `1.0.0` e registro em `src/manifest.json`.
2. Obter título PT-BR, original, alternativos, romaji e ano com `getMediaInfo`; consultar `GET https://redecanais.lt/search.php?keywords=<termo>` com até oito termos deduplicados.
3. Ler os cartões `div.thumbnail .caption h3 a`, com título no formato `Título (Dublado|Legendado) - AAAA - Qualidade`, e paginar com `&page=<n>` até cinco páginas de oito cartões.
4. Separar filme de série pela rota: série publica `-lista-de-episodios_<hash>.html`; filme publica `<slug>_<hash>.html`.
5. Confirmar identidade por similaridade de título (0,85) e ano com tolerância de um, validando o `h1` da ficha e o JSON-LD quando presentes.
6. Em série, ler os episódios dentro de `div[itemprop="description"]` e selecionar o par `Nª Temporada - Episódio N` publicado no próprio `href`; usar sempre o `href` da fonte, nunca montar URL de episódio.
7. Resolver o player em `iframe[name="Player"]` com `Referer` da ficha e ler `var SRC`, `SOURCE_FORMAT` e `SOURCE_MIME`; aceitar `file`/`video/mp4` como MP4 e `hls`/`.m3u8` como HLS quando a fonte declarar.
8. Classificar o idioma pelo rótulo da ficha/cartão em filme e, em episódio, pelo marcador do próprio episódio (`-dublado`, `-leg`, `[LEG]`); o rótulo da série é apenas fallback e o texto genérico "Dublado e Legendado" não classifica áudio.
9. Montar todo stream com `buildStream` e `format`, com `provider` do parâmetro `server` do player (`R2`), `type` do formato declarado e qualidade do cartão/ficha; sem `headers`, tamanho ou legendas quando a fonte não os fornece.
10. Isolar cada candidato (áudio/qualidade) e cada player: falha gera `console.warn('[RedeCanais] Opção <rótulo> descartada: <causa>')`; se nenhum produzir stream e algum falhar, subir erro agregado. Busca, TMDB e estrutura de página são fatais; ausência de cartão, par de episódio ou player é ausência.
11. Cobrir com testes Node e fixtures reais sanitizadas: filme dublado, filme legendado, série com episódio, série com episódio `[LEG]`, ausência, busca sem resultado, estrutura inválida, 404 de candidato, uma opção falhando e outra funcionando, e todas falhando.
12. Registrar o provedor em `providers.md` com status inicial `🟠 Não verificado` e atualizar `docs/provider-investigation.md` com o método do catálogo PhpMelody e do player `player3`.
13. Fora do escopo: downloads de `DL`, canais de TV, espelhos de domínio, bypass de anúncio/anti-bot, resolução de hosts não usados pela fonte, sonda de mídia, cache, timeout próprio, settings e bloco compartilhado novo. A checagem de 20/11/2026 mostrou que `redecanais.phd` é alias do `.lt` e que `redecanais.by`, `redecanais.deals` e `www18.redecanais.in` são sites separados, com catálogo/player próprios; nenhum entra como fallback nesta versão.

## Capabilities

### New Capabilities

- `redecanais-catalog`: busca e confirmação de filmes e séries no catálogo RedeCanais, seleção de episódio pelo par publicado, leitura do player `player3` e devolução de MP4/HLS dublados ou legendados.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/redecanais/` (novo), `test/redecanais.test.js` e fixtures em `test/fixtures/redecanais/`.
2. Configuração: `src/manifest.json` e `providers.md`.
3. Documentação: `docs/provider-investigation.md`, na seção de métodos observados.
4. Saída gerada: `providers/redecanais.js`, `gdrive/providers/redecanais.js`, `prism/providers/redecanais.js` e os manifests de instalação, todos pelo build.
5. Dependências: nenhuma nova; blocos existentes `tmdb-info`, `title-match`, `slugify`, `http`, `script-extract`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`.
6. Sem migração de dados e sem mudança de contrato para os provedores atuais. A única chave externa continua sendo `TMDB_API_KEY`, fornecida pelo app.
7. Limites conhecidos: a fonte não publica o ID do TMDB, então a identidade é textual; o player exige `Referer`; a URL de mídia é assinada e efêmera; o rótulo da série pode divergir do áudio dos episódios; a amostra só encontrou MP4 (`SOURCE_FORMAT: file`); os domínios `.by`, `.deals` e `.in` têm catálogo/player próprios e não servem como fallback, e `.phd` apenas canonicaliza para o `.lt`.
