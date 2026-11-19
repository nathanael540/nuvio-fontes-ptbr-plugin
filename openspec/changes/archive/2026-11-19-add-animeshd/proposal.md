# Proposal

## Why

O AnimesHD (`https://animeshd.to`) é um catálogo PT-BR somente de séries de anime que nenhum provedor deste repositório cobre. A fonte roda WordPress com o tema DooPlay, publica a busca em `/?s=<termo>`, a ficha em `/animes/<slug>/`, o episódio em `/episodios/<slug>/` e o player do Blogger com MP4 progressivos. A checagem de 2026-11-19 confirmou o fluxo completo em Demon Slayer, One Piece, Jujutsu Kaisen, Bleach, Attack on Titan e My Hero Academia.

A numeração de temporadas da fonte não segue sempre o TMDB: Demon Slayer tem quatro temporadas na fonte e cinco no TMDB, porque o arco Mugen Train não é publicado; a temporada 2 da fonte é a temporada 3 do TMDB. A seleção por número cru escolheria o arco errado. A data de estreia do primeiro episódio da temporada na fonte coincide com `airDate` da temporada do TMDB e resolve esse desalinhamento.

## What Changes

1. Adicionar o provedor `animeshd` em `src/animeshd/`, somente `tv`, registrado no `manifest.json` como versão `1.0.0` e formato `["mp4"]`.
2. Buscar em `GET /?s=<termo>` com as variantes romaji, PT-BR, original e alternativas do TMDB, acumular cartões `div.result-item` por URL e confirmar título e ano em `.sheader h1` e `.sheader span.date`.
3. Selecionar a temporada pela data de estreia: comparar `airDate` da temporada do TMDB com a data do primeiro episódio de cada `div.se-c`; quando não houver data, aceitar o número exato com a mesma contagem de episódios e aceitar a temporada 1 única como temporada agrupada.
4. Selecionar o episódio pelo segundo número de `div.numerando` dentro da temporada escolhida e usar o `href` publicado em `div.episodiotitle a`.
5. Ler cada `li.dooplay_player_option` como opção independente, expandir por `POST /wp-admin/admin-ajax.php` com `action=doo_player_ajax`, `post`, `nume` e `type`, e resolver o `embed_url` do Blogger com o bloco `blogger-video`.
6. Montar cada stream com `buildStream` e `format` (`addon` `AnimesHD`, `provider` `Blogger`, `type` `mp4`, qualidade por `qualityLabel`, idioma pelo rótulo da opção, `User-Agent` de reprodução), sem `name`/`title`.
7. Isolar a falha de cada opção com aviso, subir o erro agregado quando nenhuma produzir stream e devolver lista vazia na ausência reconhecida.
8. Cobrir com testes Node e fixtures reais sanitizadas: série confirmada, temporada desalinhada, temporada agrupada, episódio ausente, opção com e sem `streamingData`, host não suportado, falha agregada e ausência de busca.
9. Atualizar `providers.md`, `test/online/profiles.json` (perfil `anime`) e `docs/provider-investigation.md` com o método de temporada por data e a cadeia DooPlay/Blogger.
10. Fora do escopo: filmes, downloads, legendas externas, tamanho, conta, login, timeout próprio, sonda de mídia, cache e qualquer contorno de bloqueio.

## Capabilities

### New Capabilities

- `animeshd-provider`: busca e confirmação de séries de anime no AnimesHD, seleção de temporada pelo calendário do TMDB, leitura das opções DooPlay e resolução dos MP4 do Blogger.

### Modified Capabilities

- Nenhuma.

## Impact

1. Código: `src/animeshd/` (novo), `test/animeshd.test.js`, `test/fixtures/animeshd/`, `test/online/profiles.json`, `manifest.json` e `providers.md`.
2. Documentação: `docs/provider-investigation.md`; sem mudança em `docs/arch.md`, `README.md` ou `src/_blocks/index.md`, porque nenhuma regra global ou bloco muda.
3. Saída gerada: `providers/animeshd.js`, `gdrive/providers/animeshd.js`, `prism/providers/animeshd.js` e os `<formato>/manifest.json`, todos pelo build.
4. Dependências: nenhuma nova; o pacote usa `tmdb-info`, `title-match`, `http`, `blogger-video`, `stream-build`, `custom-formatter`, `language-discovery`, `quality-discovery` e `slugify`.
5. Limites conhecidos: a fonte não publica filmes; temporadas agrupadas em uma única `Temporada 1` (One Piece, Dragon Ball Z) só atendem a temporada 1; o arco Mugen Train de Demon Slayer não existe; a URL do Blogger é vinculada ao `User-Agent` e ao IP e expira; a opção `Legendado` de alguns episódios publica página sem `streamingData` e é descartada isoladamente.
