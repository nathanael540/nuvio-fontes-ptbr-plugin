# Proposal

## Why

O TopAnimes.net é um catálogo PT-BR de animes, com filmes e séries publicados em WordPress/DooPlay. A busca HTML, a ficha, a lista de episódios e as opções de player foram verificadas ao vivo em 19/11/2026. O site publica o par temporada/episódio em `.numerando`, entrega HLS pelo player Booonceivu e pelo wrapper `/antivirus`, MP4 pelo Booonceivu Zuplay e MP4 progressivo pelo Blogger. Nenhum provedor atual cobre essa combinação de hosts e de numeração, e o acervo inclui títulos de anime que os demais catálogos não têm.

A investigação também mostrou limites que precisam ficar explícitos: o player KojimaCDN está desativado pelo próprio site, os hosts Filemoon/Byse, VidGuard, Ruplay/IncVideo, StreamWarp, AON e Tera não entregam mídia utilizável, e o wrapper `/antivirus2` publica um master cujos segmentos respondem com uma página de site encerrado. Esses caminhos não viram stream.

## What Changes

1. Adicionar o provedor `topanimes`, para `movie` e `tv`, em `src/topanimes/`, com versão `1.0.0` e registro no `manifest.json`.
2. Obter título PT-BR, original, alternativos, romaji e temporadas com `getMediaInfo`; buscar em `GET https://topanimes.net/?s=<termo>` com as variantes do TMDB.
3. Confirmar identidade pelo tipo da rota (`/filmes/` ou `/animes/`), pelo título limpo e pelo ano; aceitar prefixo de título em série quando o par temporada/episódio existe e o ano da temporada confere.
4. Selecionar o episódio pelo par `temporada - episódio` de `.numerando` e usar `.epnumber` como numeração absoluta quando a página não publica `.numerando`. Nunca escolher pela posição visual.
5. Ler `li.dooplay_player_option` e o `iframe` de `#source-player-N`, descartando o trailer. Cada opção é independente.
6. Resolver: Booonceivu JSON (HLS, qualidades SD/LD/FD e legendas VTT), Booonceivu Zuplay (MP4 via jwplayer com `Referer` na descoberta), Blogger (MP4 progressivo com `User-Agent` na reprodução) e o wrapper próprio `/antivirusN` (HLS com `Referer` na reprodução).
7. Triar sem falha os hosts conhecidos sem mídia (KojimaCDN com `file` vazio, Filemoon/Byse, VidGuard, Ruplay, StreamWarp, AON, Tera, Abyss, UP) e tratar host desconhecido como triagem.
8. Montar todo stream com `buildStream` e `format`, sem `name`/`title`, com `type`, `provider`, qualidade do rótulo, legendas da fonte, idioma `Dublado` pelo título ou `Legendado` quando há legenda PT em página não dublada. Sem timeout, sonda, cache ou settings.
9. Cobrir com testes Node e fixtures reais sanitizadas: filme, série, episódio por `numerando`, episódio por numeração absoluta, ausência, busca sem resultado, estrutura inválida, opção de triagem, uma opção falhando e outra funcionando, e todas falhando.
10. Registrar o provedor em `manifest.json`, `providers.md` (status inicial `🟠 Não verificado`), `test/online/profiles.json` (nicho `anime`) e atualizar `docs/provider-investigation.md` com o método de DooPlay com `.numerando` e hosts mistos.
11. Fora do escopo: filmes sem player utilizável, bypass de hosts desativados, resolução de Filemoon/Byse, MixDrop/Streamtape/StreamWish, sonda de mídia, cache, timeout próprio, settings e bloco compartilhado novo.

## Capabilities

### New Capabilities

- `topanimes-provider`: busca e confirmação de filmes e séries no TopAnimes, seleção de episódio pela numeração publicada, leitura das opções DooPlay e resolução dos players Booonceivu, Blogger e `/antivirus`.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/topanimes/` (novo), `test/topanimes.test.js` e fixtures em `test/fixtures/topanimes/`.
2. Configuração: `manifest.json`, `providers.md` e `test/online/profiles.json`.
3. Documentação: `docs/provider-investigation.md`.
4. Saída gerada: `providers/topanimes.js`, `gdrive/providers/topanimes.js`, `prism/providers/topanimes.js` e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; blocos existentes `tmdb-info`, `title-match`, `slugify`, `http`, `script-extract` (não usado nesta versão), `blogger-video`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`.
6. Sem migração de dados, sem mudança de contrato para os provedores atuais e sem nova chave ou serviço externo. A única chave continua sendo `TMDB_API_KEY`, fornecida pelo app.
7. Limite conhecido: o player KojimaCDN foi desativado pelo site, o `/antivirus2` publica segmentos de um domínio encerrado e os hosts Filemoon/Byse, VidGuard, Ruplay e AON não entregam mídia. O provedor devolve o que a fonte publica nesses casos, mas a reprodução depende da fonte.
