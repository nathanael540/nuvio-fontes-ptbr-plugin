# Proposal

## Why

O Doramas Online é um portal WordPress com tema DooPlay que publica doramas asiáticos e filmes em `https://doramasonline.net`. O repositório não cobre esse acervo: o provedor `dooplay` agrega outros seis domínios DooPlay e o `doramogo` lê outro catálogo. A verificação de 2026-11-13 (horário local; UTC de 2026-11-14, entre 02:46 e 03:03) confirmou a cadeia pública:

1. Home HTTP 200 `text/html` com 206.995 bytes e busca `GET /?s=<termo>` HTTP 200 `text/html`; `Pousando no Amor` devolveu um cartão `/br/series/pousando-no-amor/` com ano 2019 e `Itaewon Class` devolveu `/br/series/itaewon-class/` com ano 2020.
2. A ficha da série respondeu HTTP 200 com 16 episódios em `div.se-c`, numerados `1 - 1` a `1 - 16`; o último episódio de Itaewon Class usa o caminho real `...-episodio-16-final/`, que não pode ser construído por substituição.
3. A página do episódio publicou duas opções DooPlay (`DUBLADO` e `LEGENDADO`) e os contêineres `#source-player-1` e `#source-player-2`.
4. O player Booonceivu (`sk-boyceta.booonceivu.shop`) respondeu HTTP 200 `application/json` a `?mode=to-salvando-seu-ip` com `status: "success"`, três `midias[]` HLS e, na opção legendada, 15 `legendas[]`, incluindo `Português`. A playlist respondeu HTTP 200 `application/x-mpegURL` com `#EXTM3U`; a legenda respondeu HTTP 200 `text/vtt` com `WEBVTT`.
5. O filme `Parasita` respondeu HTTP 200 com quatro opções de mídia, além do trailer. As opções `csst.online` levam ao embed `incvideo1.online`, cujo `Playerjs` publica três URLs `get_file`; cada uma respondeu HTTP 302 para um MP4 em `a92.filevideo1.com`, que respondeu HTTP 206 `video/mp4` com assinatura `ftyp` e sem exigir `Referer` ou cookie na reprodução.
6. A busca de um título ausente devolveu a página de busca sem cartões, e a ficha de `The Glory` publicado em 2025 (30 episódios) divergiu do TMDB de 2022 (16 episódios), mostrando que o ano é um filtro de identidade necessário.

A proposta original continha uma chave TMDB embutida, um orçamento de tempo de 42 segundos, um motor de criptografia não observado e campos `name`/`title` fixos. Nada disso entra na implementação: a chave vem do app, o tempo é do app e a cadeia observada é somente DooPlay, Booonceivu e IncVideo.

## What Changes

1. Adicionar o provedor `doramasonline`, com `movie` e `tv`, em `src/doramasonline/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`.
2. Obter título, título original, alternativos, ano e tipo com `getMediaInfo` (`tmdb-info`), sem chave embutida e sem consulta própria ao TMDB.
3. Buscar com `GET https://doramasonline.net/?s=<termo>` via `fetchPage`, acumulando cartões `.search-page article` por URL, lendo `.title a` e `.year`, e aceitando somente `/br/filmes/` para filme e `/br/series/` para série.
4. Confirmar a ficha por título e ano: exigir igualdade de ano quando os dois lados o publicarem; `The Glory` (2025) é rejeitado para o TMDB de 2022. Reutilizar `titleSimilarity`/`findBestMatch` e limitar a três candidatos por termo.
5. Na série, mapear `div.se-c` por `span.se-t`, o par `temporada - episódio` de `div.numerando` e o `href` de `div.episodiotitle a`; usar o endereço publicado, inclusive o sufixo `-final`, e nunca a posição visual.
6. Ler as opções `li.dooplay_player_option` (`data-nume`, `data-post`, `data-type`, rótulo `.title`) e o iframe do contêiner `#source-player-<nume>`. Descartar o trailer do YouTube por triagem.
7. Resolver cada opção em isolamento:
   1. Booonceivu: repetir a URL do iframe com `mode=to-salvando-seu-ip`, exigir `status === "success"`, ler `midias[]` (`url`, `qualidade`) e `legendas[]` (`url`, `label`).
   2. IncVideo: abrir o embed `csst.online`/`incvideo1.online`, ler o campo `file` do `new Playerjs({...})`, capturar o `Set-Cookie` do embed, pedir cada URL `get_file` com `Referer` e o cookie e seguir o HTTP 302 até o MP4.
   3. `/aviso/?url=`: decodificar o parâmetro `url` antes de classificar o host; host de player não suportado é triagem, não falha.
8. Montar todo stream com `buildStream` e `format`: `type` `hls` ou `mp4`, `provider` do player, `language` pelo rótulo da opção e pelas legendas PT, `subtitles` quando publicadas, `quality` pelo rótulo da fonte e `format` com título, ano, temporada e episódio. Sem `name`, `title`, timeout, sonda de mídia ou settings.
9. Tratar a busca, a ficha e a página do episódio como etapas fatais; cada opção é independente, com `console.warn('[Doramas Online] Opção <rótulo> descartada: <causa>')` e erro agregado quando todas falharem. Ausência de título ou de episódio devolve lista vazia.
10. Cobrir com testes Node e fixtures reais sanitizadas: busca de série e de filme, ano divergente, série com `-final`, episódio com as duas opções, JSON do Booonceivu com e sem legendas, `Playerjs` do IncVideo, opção quebrada, todas as opções falhando e ausência.
11. Registrar a rodada online no perfil `dorama` e a linha/seção em `providers.md` com status inicial `🟠 Não verificado`.
12. Atualizar `docs/provider-investigation.md` com o método “DooPlay com iframes inline, Booonceivu e IncVideo”.

## Capabilities

### New Capabilities

- `doramasonline-provider`: localização e confirmação de filmes e séries no Doramas Online a partir do TMDB, seleção de temporada/episódio pelo endereço publicado e resolução isolada das opções DooPlay (Booonceivu e IncVideo).

### Modified Capabilities

Nenhuma. A verificação online usa a capability `provider-online-verification` com o perfil `dorama` já existente.

## Impact

1. Código: `src/doramasonline/` (novo), `test/doramasonline.test.js` e fixtures em `test/fixtures/doramasonline/`.
2. Configuração: `manifest.json`, `test/online/profiles.json`, `providers.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/doramasonline.js`, `gdrive/providers/doramasonline.js`, `prism/providers/doramasonline.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados e sem quebra de contrato para provedores existentes.
5. Limites conhecidos: o player Booonceivu não publica resolução no HLS e o IncVideo depende do `Set-Cookie` do embed; o player `/do/v4/` do episódio final de Itaewon Class respondeu HTML com avisos PHP em vez de JSON e é falha isolada daquela opção.
