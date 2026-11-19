# Proposal

## Why

O AniZero é um catálogo de animes em PT-BR que nenhum provedor deste repositório cobre. A investigação ao vivo de 2026-11-19 em `https://anizero.org` confirmou a busca pública, a ficha do anime, a API de episódios, a página do player com as opções `Dublado`/`Legendado` e o HLS final servido pelo host do player.

O site é WordPress com tema próprio, não DooPlay nem DLE. A busca em tempo real é JSON, a lista de episódios vem de `POST /api/`, o vídeo é anunciado por ID de episódio e a página `/player` publica scripts empacotados por opção de áudio. O HLS não aparece no HTML: ele é decodificado localmente do script da opção e resolvido no player FirePlayer do embed.

## What Changes

1. Adicionar o provedor `anizero`, somente `tv`, em `src/anizero/`, registrado no `manifest.json` como versão `1.0.0` e formato `["m3u8"]`.
2. Buscar por título com `POST /wp-admin/admin-ajax.php` e `action=buscar_anime_rt`, usando título PT-BR, original, alternativas e romaji do TMDB; confirmar a ficha por título, ano e `const anime_id`.
3. Mapear a temporada do pedido para a página sazonal da fonte pelo marcador explícito (`S2`, `Season 2`, `Temporada 2`, `2ª Temporada`) e pela cadeia `tempProxima`/`tempAnterior`; usar numeração absoluta somente quando a fonte publica uma única página com numeração global próxima do total do TMDB.
4. Listar episódios com `POST /api/` e `action=show_videos&anime_id=<id>`, validando o objeto `episodios` e escolhendo pelo `epi_num` exato.
5. Abrir a página `/video/<episodio>/`, ler o iframe `/player?id=<id>&season=<s>&num=<e>` e a página do player.
6. Decodificar localmente o array `playerScripts` (packer `p,a,c,k,e,d` e decodificador de base própria, sem `eval`/`new Function`) para obter a URL do embed de cada opção de áudio.
7. Abrir o embed, ler a configuração `FirePlayer(...)`, resolver o caminho HLS relativo contra a URL final do embed e devolver a playlist master com `Referer` do embed.
8. Tratar cada opção de áudio como independente; a página de aviso “O vídeo não está pronto” é ausência reconhecida, a falha de uma opção preserva as demais e o erro agregado sobe quando nenhuma produz stream.
9. Montar cada stream com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `AniZero`, `provider` do host do embed, `type` `hls`, título/ano, temporada/episódio do pedido), idioma pelo rótulo do player, qualidade pela dica da fonte e `headers` de reprodução.
10. Cobrir com testes Node e fixtures reais sanitizadas: busca, ficha, temporada 1, temporada 2, episódio ausente, título ausente, duas opções de áudio, opção não pronta, falha de uma opção, todas falhando e estrutura inválida.
11. Atualizar `providers.md`, `docs/provider-investigation.md` (novo método de player empacotado por opção) e o `manifest.json`.

## Capabilities

### New Capabilities

- `anizero`: busca e confirmação de animes no AniZero, mapeamento de temporada e episódio, decodificação do player por opção de áudio e entrega de HLS compatível com o contrato do Nuvio.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/anizero/` (novo), `test/anizero.test.js` (novo) e fixtures em `test/fixtures/anizero/`.
2. Configuração: `manifest.json` (nova entrada `anizero`) e `providers.md` (linha e seção).
3. Documentação: `docs/provider-investigation.md`; sem mudança em `docs/arch.md`, no `README.md` ou em `src/_blocks/index.md`, porque nenhuma regra global ou bloco novo é criado.
4. Saída gerada: `providers/anizero.js`, `gdrive/providers/anizero.js`, `prism/providers/anizero.js` e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; o pacote usa `tmdb-info`, `title-match`, `slugify`, `http`, `stream-build`, `custom-formatter` e `language-discovery`/`quality-discovery` de forma transitiva.
6. Fora do escopo: `movie` (o filtro de formato `Filme` da fonte não tem posts e o acervo observado é de séries), temporada 1 do TMDB que abrange várias páginas sazonais da fonte (por exemplo, Jujutsu Kaisen), downloads, MP4, legendas externas não publicadas, sonda de mídia, timeout próprio, cache de URL e qualquer alteração de bloco compartilhado.
7. Limite conhecido: o HLS é entregue pelo host do embed com caminho relativo; os segmentos exigem `Referer` do embed. A playlist é devolvida como master adaptativo e a qualidade declarada pela fonte é apenas o rótulo `HD`.
