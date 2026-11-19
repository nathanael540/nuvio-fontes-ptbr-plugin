# Proposal

## Why

O Super Animes (AnimesTVS) é um catálogo brasileiro de animes com filmes e séries publicados por uma API JSON pública em `https://api.animestvs.org`, sem conta, chave, token ou cookie. A fonte entrega MP4 direto no CDN `cdn.animestvs.org`, com variantes dublada e legendada, e ainda não está representada neste repositório.

A investigação de 2026-11-19 confirmou o catálogo completo em `GET /animes`, as listas completas de episódios em `GET /episodios-dublados` e `GET /episodios-legendados`, os campos de identidade (`titulo`, `audio`, `episodios`, `ano`), o rótulo do episódio (`Episódio NNN` ou `Filme`) e a resolução dos arquivos publicados. A fonte não publica HTML de catálogo nem endpoint por título: a seleção é local, sobre o catálogo e as listas completas.

## What Changes

1. Adicionar `src/superanimes/` com `index.js` (contrato do app e captura única), `api.js` (transporte das três rotas), `text.js` (título, áudio, contagem, ano e marcadores), `catalog.js` (identidade de filme e série, temporada, partes e numeração absoluta) e `episodes.js` (rótulo do episódio e qualidade pelo diretório do CDN), em JavaScript puro com JSDoc.
2. Consumir `GET https://api.animestvs.org/animes`, `GET /episodios-dublados` e `GET /episodios-legendados` com `fetchJson` e perfil `api`; HTTP fora de 2xx, corpo não JSON ou envelope fora de lista é erro, nunca ausência.
3. Remover o sufixo `(Dublado)`/`(Legendado)` do título antes da comparação e confirmar a obra pelos títulos PT-BR, original, alternativos e romaji do TMDB, com tolerância de um ano; cada áudio é uma opção independente.
4. Confirmar filme por entrada de exatamente um episódio, título compatível e ano dentro da tolerância; escolher a melhor entrada por áudio.
5. Confirmar série pela entrada de base da temporada 1, pelo marcador explícito (`Season N`, `Nth Season`, `Temporada N`, `Nª Temporada` ou número final), pelo romaji específico da temporada do TMDB ou pelo romaji de arco sem número; quando o título do TMDB já nomeia a temporada (`Koori no Jouheki 2nd Season`), o marcador faz parte do nome da obra.
6. Somar as partes da temporada pela contagem publicada (`Part N`) e, quando a fonte publica a série inteira em uma entrada, aplicar a numeração absoluta do TMDB; o episódio local é o rótulo `Episódio NNN` e `Filme` equivale ao episódio 1.
7. Derivar a qualidade do diretório do CDN: `fullhd` vira `1080p`, `hd3` e `hd2` viram `720p` e `iphoneb` vira `420p`; `like` e `thunder3` não identificam resolução e ficam `Desconhecida`. Sem sonda de mídia.
8. Montar cada stream com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `Super Animes`, título, ano e coordenadas), `type` `mp4`, `provider` `AnimesTVS`, idioma `Dublado` ou `Legendado` pelo áudio da entrada, sem `name`, `title` nem cabeçalhos inventados; deduplicar por URL e ordenar por qualidade.
9. Isolar a falha de cada áudio com `console.warn('[Super Animes] Opção <áudio> <título> descartada: <causa>')` e preservar o outro; se nenhum produzir stream e algum falhar, lançar erro agregado. Somente `getStreams` captura a falha final, registra com `console.error('[Super Animes] ...')` e devolve lista vazia.
10. Cobrir com testes Node e fixtures sanitizadas: filme dublado e legendado, ausência de filme, série na temporada 1, temporada por romaji específico, por marcador explícito, por parte acumulada e por numeração absoluta, áudio com sufixo minúsculo, episódio ausente, um áudio ausente, falha isolada e falha total das listas, catálogo fora do esquema, corpo não JSON e `link_video` inválido.
11. Registrar `superanimes` no `manifest.json` como versão `1.0.0`, tipos `movie` e `tv`, formato `mp4`, idioma `pt` e o favicon do domínio como logo.
12. Adicionar a linha e a seção `Super Animes` em `providers.md`, com status inicial `🟠 Não verificado` e data `—`, substituídas pela rodada online.
13. Incluir `superanimes` em `test/online/profiles.json` com `exclusiveTag: "anime"`, porque a fonte é exclusiva de anime e o perfil generalista mediria títulos fora do acervo.
14. Documentar o método em `docs/provider-investigation.md` como “catálogo JSON completo e listas de episódios por áudio”, com as três rotas, a seleção local, a qualidade pelo diretório e os limites, referenciando `src/superanimes/` e `test/superanimes.test.js`.
15. Fora do escopo: conta, login, downloads, player do site, sondagem de mídia, cache de URLs, contorno de bloqueio, legendas externas (os arquivos legendados são hardsub) e novos blocos compartilhados.

## Capabilities

### New Capabilities

- `superanimes`: catálogo JSON do Super Animes (AnimesTVS), identidade de filmes e séries, temporada por marcador/romaji/numeração, episódios por rótulo e streams MP4 com áudio e qualidade derivados da fonte.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/superanimes/` (novo), `test/superanimes.test.js` e fixtures em `test/fixtures/superanimes/`.
2. Configuração: `manifest.json`, `providers.md` e `test/online/profiles.json`.
3. Documentação: `docs/provider-investigation.md`.
4. Saída gerada: `providers/superanimes.js`, `gdrive/providers/superanimes.js`, `prism/providers/superanimes.js` e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; o fluxo usa os blocos existentes `http`, `tmdb-info`, `slugify`, `title-match`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`, sem bloco novo porque o catálogo JSON completo é específico desta fonte.
6. Sem migração de dados, sem mudança de contrato para os provedores atuais e sem nova chave ou serviço externo.
7. Limites conhecidos da fonte: a lista legendada tem cerca de 26 MB; o catálogo tem títulos em romaji e temporadas publicadas como arcos/partes; algumas temporadas são agrupadas em uma única entrada; o catálogo pode anunciar entradas sem todas as linhas de episódio; a API não é versionada; os arquivos são MP4 estáticos sem legenda externa.
