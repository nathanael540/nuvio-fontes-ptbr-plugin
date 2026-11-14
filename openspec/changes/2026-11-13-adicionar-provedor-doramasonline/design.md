# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 2026-11-13 (horário local; UTC de 2026-11-14, entre 02:46 e 03:03) contra `https://doramasonline.net`. URLs assinadas de mídia, tokens e cookies não são registrados aqui.

1. A home respondeu HTTP 200 `text/html; charset=UTF-8` com 206.995 bytes. A busca é `GET /?s=<termo>` (sem `/busca/`) e devolveu 143.491 bytes para `Pousando no Amor`, com um `article` dentro de `.search-page`, `.title a` e `.meta span.year`.
2. A ficha `https://doramasonline.net/br/series/pousando-no-amor/` respondeu HTTP 200 com 176.758 bytes, título `Pousando no Amor` e 16 itens: `div.se-c` com `span.se-t` igual a `1`, `div.numerando` `1 - 1` a `1 - 16` e `div.episodiotitle a` para `/br/episodio/...`.
3. `Itaewon Class` também tem 16 episódios; o último é publicado em `/br/episodio/itaewon-class-temporada-1-episodio-16-final/`, e a URL construída por substituição (`...-episodio-16/`) respondeu HTTP 404. O `href` da listagem é obrigatório.
4. A página de `Pousando no Amor` S01E01 respondeu HTTP 200 com 161.225 bytes, duas opções DooPlay (`DUBLADO` e `LEGENDADO`) e dois contêineres `#source-player-1` e `#source-player-2`, ambos em `sk-boyceta.booonceivu.shop` com query `id` e `img`.
5. A opção Booonceivu respondeu HTTP 200 `application/json; charset=utf-8` (1.196 e 4.521 bytes) ao repetir a URL com `mode=to-salvando-seu-ip`. O corpo tem `status`, `titulo`, `capa`, `midias[]` e `legendas[]`; cada `midia` traz `url` e `qualidade` (`SD`, `LD`, `FD`), e a opção legendada trouxe 15 legendas, incluindo `Português`.
6. As playlists responderam HTTP 200 `application/x-mpegURL` com `#EXTM3U` e `#EXTINF`, em `delivery-limit-c.123pelicula.com` e `akm-cdn-play-web.onfilom.com`; não há `RESOLUTION` nem master. A legenda respondeu HTTP 200 `text/vtt` com `WEBVTT`. Playlist e mídia responderam sem `Referer` e sem cookie; o `User-Agent` não foi necessário.
7. O filme `Parasita` (`/br/filmes/parasita/`) respondeu HTTP 200 com 173.081 bytes. As opções 1 e 2 são `/aviso/?url=<destino>` e levam a `png.strp2p.com`; as opções 3 e 4 são `csst.online/embed/<id>/` e redirecionam para `incvideo1.online`.
8. O `png.strp2p.com` publica um `Playerjs` que resolve `location.hash` por `GET /api/public/resolve?file1=<hash>`; na amostra as duas opções responderam HTTP 404 e ficaram como falha isolada. O `incvideo1.online` publica `new Playerjs({...})` com `file` contendo três URLs `get_file`; cada uma respondeu HTTP 302 para `a92.filevideo1.com`, que respondeu HTTP 206 `video/mp4` e `ftyp` sem exigir `Referer` ou cookie na reprodução.
9. A busca de `The Glory` devolveu `/br/series/the-glory/` com ano 2025 e 30 episódios; o TMDB de 136283 é de 2022 e tem 16. A busca de um termo inexistente devolveu a página de busca sem `article`; a ficha de um episódio final com o player `/do/v4/` respondeu HTML com avisos PHP (`Undefined array key "leg"`) em vez de JSON.
10. `Pousando no Amor` não existe em `cplayapp.com` (busca vazia), e `doramogo`/`dooplay` não têm esse catálogo; não há provedor do repositório que cubra `doramasonline.net`.

## Goals / Non-Goals

**Goals:**

1. Confirmar a obra por título e ano do TMDB e pela seção de caminho (`/filmes/` ou `/series/`).
2. Selecionar a temporada e o episódio pelo `href` publicado na ficha, inclusive sufixos como `-final`.
3. Resolver as opções DooPlay em isolamento: Booonceivu por JSON e IncVideo por `Playerjs` e HTTP 302.
4. Entregar streams com `buildStream` e `format`, idioma e legendas quando a fonte confirmar, sem `name`/`title`.
5. Manter testes offline com fixtures reais sanitizadas e verificação online no perfil `dorama`.

**Non-Goals:**

1. Implementar o motor de criptografia da proposta (Voe, PoW, AES-CBC/GCM, DoodStream, Streamtape): não foi observado nesta fonte e não é necessário para a cadeia atual.
2. Resolver `png.strp2p.com` ou o player `/do/v4/` quando eles respondem 404/HTML; ficam como hosts não suportados e falha isolada.
3. Descobrir resolução por sonda de playlist ou baixar segmentos; a qualidade fica com o rótulo da fonte ou `Desconhecida`.
4. Implementar timeout, retentativa, cache ou settings de áudio/qualidade.
5. Garantir todos os episódios: o player de um episódio específico pode estar quebrado na fonte.

## Decisions

### D1. Identidade por busca textual e ano

1. Chamar `getMediaInfo({ tmdbId, mediaType })` uma vez e montar os termos com `title`, `originalTitle` e `alternativeTitles`, deduplicados por `normalizeText`.
2. Para cada termo, consultar `GET https://doramasonline.net/?s=<termo>` com `fetchPage` e o perfil `page`; acumular por URL. A busca observada é HTML; não foi necessário testar a REST do WordPress.
3. Ler `.search-page article`; o cartão sem `.title a` ou `href` é erro de layout. O ano vem de `.meta span.year`; ausência de ano é `null`, não zero.
4. Aceitar `/br/filmes/` para `movie` e `/br/series/` para `tv`; qualquer outro caminho é descarte. Para `tv`, o caminho `/br/episodio/` também é descarte, porque a ficha da série é que lista os episódios.
5. Confirmar por `titleSimilarity` contra os títulos do TMDB. Quando os dois anos existem, exigir igualdade exata; a divergência de `The Glory` (2025 na fonte, 2022 no TMDB) rejeita o candidato em vez de aceitar um homônimo. Quando o cartão não publica ano, aceitar somente título com similaridade alta (limiar 0,85) e confirmar o ano na ficha antes de usar.
6. Abrir até três candidatos por termo; o primeiro confirmado encerra aquele termo. Se nenhum confirmar, devolver lista vazia.
7. Alternativas descartadas:
   1. A chave TMDB embutida da proposta: viola a regra de segredo e duplica `tmdb-info`.
   2. Limiar 0,75 com penalidade de ano da proposta: aceitaria um homônimo de 2025 para um título de 2022. Ano exato é mais seguro.
   3. Usar o primeiro resultado: a busca de `Parasita` devolve quatro cartões, incluindo duas partes de Parasyte.
   4. Adicionar `doramasonline.net` como mais uma fonte do provedor `dooplay`: o `dooplay` agrega modos `rest`, `ajax` e `iframe` com players próprios; esta fonte publica iframes inline e dois players novos (Booonceivu e IncVideo), e mexer no provedor estável seria maior que um provedor próprio.

### D2. Temporada e episódio pelo endereço publicado

1. Na ficha de série, percorrer `div.se-c`; ler `span.se-t` como temporada e cada `li` com `div.numerando` no formato `S - E`.
2. Usar `div.episodiotitle a[href]` como endereço do episódio. O `href` é a única fonte de verdade: `-final` e outros sufixos não entram na composição.
3. Exigir correspondência exata de temporada e episódio; episódio ausente é ausência reconhecida, não erro. Temporada presente sem lista é erro de estrutura.
4. Em filme, a ficha não tem `div.se-c`; a própria página do filme é a página de players.
5. Alternativa descartada: montar `...-temporada-<s>-episodio-<e>/` por substituição. O caso `-final` já provou que a regra falha.

### D3. Opções DooPlay e isolamento

1. Ler `li.dooplay_player_option` com `data-nume`, `data-post`, `data-type` e o texto de `.title`; o trailer (`data-nume="trailer"` ou rótulo `Watch trailer`) é descarte por triagem.
2. Mapear `data-nume` para o contêiner `#source-player-<nume>` e ler o primeiro `iframe` (`src` ou `data-src`). Contêiner ausente é erro de estrutura da opção, não da lista inteira.
3. Cada opção é independente: a falha de uma gera `console.warn('[Doramas Online] Opção <rótulo> descartada: <causa>')` e preserva as demais. Se todas falharem, o erro agregado sobe com a causa de cada uma; se todas forem triagem, devolver lista vazia.
4. O rótulo da opção é a primeira evidência de idioma: `DUBLADO`/`DUBLADO (2)` → `LANGUAGE.DUBBED`; `LEGENDADO`/`LEGENDADO (2)` → `LANGUAGE.SUBTITLED`. Rótulo desconhecido fica `LANGUAGE.UNKNOWN`.
5. Alternativa descartada: usar a posição do iframe na página. Os contêineres têm IDs explícitos e a ordem do DOM inclui o trailer.

### D4. Booonceivu

1. Repetir a URL do iframe com `mode=to-salvando-seu-ip` (o player faz isso no navegador); usar o perfil `player` e `Referer` da página do episódio.
2. Exigir HTTP 2xx, `Content-Type` JSON e `status === "success"`. `status` diferente de `success` é ausência da opção; JSON inválido é falha da opção.
3. Para cada `midias[]`:
   1. `url` deve ser HTTP(S) e o caminho termina em `.m3u8` ou o `Content-Type` é `application/x-mpegURL`; não abrir a playlist.
   2. `qualidade` é o rótulo da fonte. Normalizar resoluções declaradas (`1080p`, `720p`, `360p`); `SD`, `LD` e `FD` são convertidos pelo mapa que o próprio player publica (`SD` → `1080p`, `LD` → `720p`, `FD` → `360p`). Rótulo fora do mapa fica `Desconhecida`.
   3. A conversão `SD`/`LD`/`FD` é a apresentação do player, não uma medição; a playlist observada não tem `RESOLUTION`. O design registra a limitação.
4. Para `legendas[]`, montar `{ url, language, name }`: `label` `Português`/`Português (BR)` → `pt-BR`; `English`/`Español` e demais rótulos ficam com o próprio label em `name` e `language` só quando reconhecido. A presença de legenda PT confirma `LANGUAGE.SUBTITLED` naquela opção.
5. Não enviar `headers` de reprodução: a playlist e os segmentos responderam sem `Referer` e sem cookie. O `User-Agent` de navegador pode ser usado na descoberta, mas não é necessário no stream.
6. Alternativa descartada: sondar a playlist para achar `RESOLUTION`. A playlist é de mídia, não master, e a regra do repositório proíbe requisição extra só para qualidade.

### D5. IncVideo e `/aviso/`

1. Para um iframe `csst.online`, seguir o redirecionamento até `incvideo1.online/embed/<id>/` com `fetchPage` e guardar o `Set-Cookie` da resposta do embed.
2. Ler o bloco `new Playerjs({...})` do HTML; o campo `file` pode conter uma ou várias URLs separadas por vírgula/colchetes. Extrair somente URLs HTTP(S) absolutas contendo `/get_file/`.
3. Pedir cada URL com `Referer` do embed, o `Cookie` capturado e `redirect: manual`; aceitar 301/302/303/307/308 e ler `Location`. Sem `Location`, a opção é falha.
4. Seguir o `Location` e aceitar 200/206 com `Content-Type` `video/mp4` ou caminho `.mp4`. Não é necessário `Referer`/cookie na URL final; não incluir `headers` de reprodução.
5. Para um iframe `/aviso/?url=`, decodificar `url` uma ou duas vezes (o parâmetro pode vir percent-encoded) e classificar o host de destino:
   1. `png.strp2p.com`: o player lê `location.hash` e chama `/api/public/resolve?file1=<hash>`; na amostra respondeu 404. Fica como host não suportado (triagem) até nova evidência.
   2. `csst.online`: aplicar o fluxo IncVideo.
   3. Outro host: triagem.
6. Alternativa descartada: implementar o resolvedor `png.strp2p` com o hash. O endpoint respondeu 404 nas duas opções de `Parasita`; incluir um caminho não confirmado só aumentaria a superfície. A opção fica registrada como hipótese para outra mudança.

### D6. Streams e idioma

1. Montar cada stream com `buildStream`:
   1. `url` absoluta da mídia.
   2. `type`: `hls` para Booonceivu; `mp4` para IncVideo.
   3. `provider`: `Booonceivu` ou `IncVideo`.
   4. `quality`: rótulo normalizado ou `Desconhecida`.
   5. `language`: rótulo da opção e legendas PT; `LANGUAGE.UNKNOWN` quando não houver evidência.
   6. `subtitles`: somente as publicadas, com `url`, `language` e `name`; sem `headers` sem evidência.
   7. `format`: `{ template: FORMATTER.AUTO, addon: 'Doramas Online', title, year, season, episode }`; filme sem temporada/episódio.
2. Ordenar com `sortByQuality`; a ordem do app não é garantida.
3. Não preencher `size`, `infoHash`, `seeders` ou `peers`: a fonte não os fornece.
4. Não usar `name` nem `title` no stream; o formatador os gera.

### D7. Erros, ausência e tempo

1. Entrada, TMDB, busca e ficha são fatais: erro sobe até `getStreams`, que registra `[Doramas Online] <etapa>: <mensagem>` e devolve `[]`.
2. Página de episódio ausente ou player sem `midias` é ausência da opção; página de episódio que responde 404 a partir de um `href` listado é falha de estrutura.
3. Não há timeout, `AbortController`, retentativa, cache com validade ou `setTimeout`; o app controla a espera.
4. `console.warn` somente para opção descartada; `console.error` somente em `getStreams`.

### D8. Testes, manifest e documentação

1. Fixtures reais sanitizadas em `test/fixtures/doramasonline/`: busca de série, busca de filme, busca de homônimo por ano, ficha de série com 16 episódios, ficha com `-final`, página de episódio com duas opções, JSON Booonceivu dublado (sem legendas), JSON Booonceivu legendado (com PT), embed IncVideo com `Playerjs` de três fontes, resposta `/aviso/` para host não suportado, player `/do/v4/` com aviso PHP, busca vazia e JSON inválido.
2. Casos: série S01E01 resolve as duas opções; S01E16 de Itaewon usa o `href` `-final`; filme `Parasita` resolve as opções IncVideo; `The Glory` é rejeitado por ano; opção Booonceivu falha e IncVideo resolve; todas falham e o erro agregado sobe; título ausente devolve `[]`; `fetch` simulado só recebe busca, ficha, episódio, player e mídia, sem sonda.
3. Manifest: `id` `doramasonline`, nome `Doramas Online`, versão `1.0.0`, autor `nathanael540`, tipos `["movie","tv"]`, formatos `["m3u8","mp4"]`, `contentLanguage` `["pt"]`, logo `https://www.google.com/s2/favicons?domain=doramasonline.net&sz=128`.
4. Verificação online: `"doramasonline": { "exclusiveTag": "dorama" }` em `test/online/profiles.json`; a linha e a seção em `providers.md` começam em `🟠 Não verificado`.
5. `docs/provider-investigation.md`: nova seção “DooPlay com iframes inline, Booonceivu e IncVideo”, com o `mode=to-salvando-seu-ip`, o mapa SD/LD/FD, o `Playerjs` e o limite `png.strp2p`.

## Risks / Trade-offs

1. **Ano da fonte** → `The Glory` é um homônimo de 2025 com 30 episódios; o filtro exato evita entregar a obra errada, mas pode rejeitar uma ficha cujo ano seja data de publicação. A ficha de `Pousando` e `Itaewon` publicou o ano correto, e o filtro é o mesmo do `dooplay`.
2. **Qualidade do Booonceivu** → o mapa SD→1080p/LD→720p/FD→360p é o do player, não uma medição; a playlist não tem `RESOLUTION`. O stream pode sair com uma qualidade nominal diferente da real.
3. **Player quebrado** → o episódio final de Itaewon Class só tem o wrapper `/do/v4/`, que respondeu HTML com avisos PHP; a opção é descartada e o episódio sai vazio. Não é ausência do acervo.
4. **CDNs rotativos** → as playlists apareceram em `123pelicula.com`, `onfilom.com` e `solo-latino.com` em execuções próximas. O host não pode ser fixado.
5. **IncVideo** → o `Set-Cookie` e o `Playerjs` podem mudar; a fixture protege o contrato observado, e a opção falha isolada.
6. **`/aviso/` com host não suportado** → `png.strp2p.com` respondeu 404; a opção é triagem. Se o host voltar a funcionar, precisa de uma mudança própria com evidência.
7. **Idioma do IncVideo** → o rótulo `DUB`/`LEG` está no título do embed; se o título não o trouxer, o idioma fica desconhecido, sem inventar PT-BR.

## Migration Plan

1. Criar `src/doramasonline/` com `catalog.js`, `episode.js`, `players.js`, `streams.js` e `index.js`; rodar `node --test test/doramasonline.test.js`.
2. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e o perfil em `test/online/profiles.json`.
3. Atualizar `docs/provider-investigation.md` com o método.
4. Rodar `npm run lint`, `npm test` e `node build.js doramasonline`; confirmar os arquivos gerados.
5. Executar `npm run test:online -- --provider doramasonline` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada.
6. Arquivar a mudança somente com os testes previstos passando ou com as exclusões declaradas.
7. Rollback: remover o provedor, a entrada do manifest, o perfil e a seção de `providers.md`.

## Validation

1. Confirmado online: home 200, busca de série 200 com ano, ficha de 16 episódios, episódio com duas opções, JSON Booonceivu 200 com três HLS e legendas PT, playlist `#EXTM3U` e legenda `WEBVTT`, filme `Parasita` com IncVideo 302 → MP4 206 `video/mp4` e `ftyp`, busca vazia e ficha de `The Glory` divergente por ano.
2. Confirmado que o MP4 do IncVideo responde 206 sem `Referer`/cookie de reprodução e que a playlist Booonceivu responde 200 sem cabeçalhos.
3. Não confirmado: reprodução no aparelho, todos os episódios do acervo, o player `png.strp2p.com` (404 na amostra) e a resolução real por trás dos rótulos SD/LD/FD.
4. A rodada online e o teste no aparelho são as evidências que faltam; nenhuma delas altera o contrato descrito aqui.

## Open Questions

1. O `png.strp2p.com` responde 404 por URL expirada ou por retirada das opções? O hash e o endpoint precisam de nova evidência.
2. O mapa SD/LD/FD do Booonceivu corresponde à resolução real? A playlist não publica `RESOLUTION`.
3. O player `/do/v4/` volta a responder JSON para o episódio final de Itaewon Class? Hoje ele retorna HTML com avisos PHP.
4. O ano da ficha é sempre o de produção ou pode ser a data de publicação em títulos novos? `Pousando` e `Itaewon` publicaram o ano correto; `The Glory` publicou 2025 para uma obra de 2022.
