# Proposal

## Why

Os provedores devolvem muitos streams com `Idioma Desconhecido` mesmo quando a fonte publica evidência de áudio ou legenda. A investigação de 12/11/2026 encontrou quatro causas recorrentes:

1. `Dual Áudio`/`Tri Áudio` é o rótulo dominante em LimeFilmes, Starck Filmes, Baixa Rápido, Filmestorrent e BeTor, mas o bloco `language-discovery` o tratava como inconclusivo.
2. As páginas da rede Baixa Rápido publicam `Idioma`, `Idiomas` ou `Áudio` em tabelas, `#informacoes` e `.info_p`; só o leitor `download-row` lia `Idiomas`, e os demais ignoravam o campo.
3. Um texto estrangeiro antes do rótulo em português (`English` no nome do release, `Dublado` no botão) vencia a primeira correspondência de `languageFromTexts` e podia anular a evidência correta.
4. `English sub`/`Legendado Inglês` era classificado como `Legendado`, promovendo legenda estrangeira a PT-BR; áudio estrangeiro comprovado em HLS sem legenda PT saía como `Idioma Desconhecido`, não como `Não PT-BR`.

A decisão do mantenedor foi classificar `Dual Áudio`/`Tri Áudio` de fonte PT-BR como `Dublado (Não PT-BR?)`: reduz o desconhecido sem afirmar região brasileira que a fonte não comprova.

## What Changes

1. `language-discovery` SHALL reconhecer `Dublagem`, `Legendagem`, `Dual Áudio` e `Tri Áudio`; `Dual`/`Tri` viram `Dublado (Não PT-BR?)` e `PT-BR` explícito continua virando `Dublado`.
2. `languageFromTexts` SHALL ignorar um resultado apenas estrangeiro quando outro candidato comprova áudio ou legenda em português, sem mudar a prioridade de áudio sobre legenda.
3. `inspectText` SHALL classificar legenda estrangeira (`English sub`, `Legendado Inglês`) como `Não PT-BR`, e não como `Legendado`.
4. `inspectText` SHALL reconhecer mais nomes de idiomas estrangeiros (latino, castelhano, turco, árabe, hindi, tailandês, vietnamita, polonês, holandês, sueco, dinamarquês, norueguês, finlandês, grego, hebraico, tcheco, húngaro, romeno, ucraniano, persa, indonésio, malaio, filipino, bengali, tamil, telugu, urdu e swahili).
5. A rede Baixa Rápido SHALL ler `Idioma`, `Idiomas` e `Áudio` da ficha e passar o valor a `classifyMagnetOption`, sem requisição extra.
6. O bloco `wordpress-torrent` SHALL aceitar também `Idiomas` e `Idioma do Áudio`.
7. `megaembed` SHALL classificar áudio estrangeiro comprovado em HLS como `Não PT-BR` quando não houver legenda portuguesa; com legenda PT, continua `Legendado`.
8. `fireplayer` SHALL reconhecer idiomas estrangeiros além do inglês nas faixas HLS.
9. Testes Node SHALL cobrir a convenção Dual/Tri, a legenda estrangeira, a leitura das fichas da Baixa Rápido, o áudio estrangeiro em HLS e os provedores afetados.

## Capabilities

### New Capabilities

- `stream-language`: classificação local do idioma dos streams a partir de textos, campos de página e faixas HLS, com o enum fechado `LANGUAGE`.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/_blocks/language-discovery/`, `src/_blocks/torrent-release/`, `src/_blocks/wordpress-torrent/`, `src/_blocks/fireplayer/`, `src/baixarapido/`, `src/limefilmes/`, `src/starckfilmes/` e `src/megaembed/`.
2. Saída: rebuild de todos os provedores que importam os blocos alterados (`providers/`, `gdrive/providers/` e `prism/providers/`).
3. Testes: `test/blocks/language-discovery/index.test.mjs`, `test/blocks/torrent-release/index.test.mjs`, `test/baixarapido.test.js`, `test/limefilmes.test.js`, `test/starckfilmes.test.js`, `test/filmestorrent.test.js` e `test/megaembed.test.js`.
4. Documentação: `docs/arch.md` (contrato de idioma), `src/_blocks/index.md` (catálogo de blocos), `docs/provider-investigation.md` (leitura de idioma na ficha e áudio estrangeiro em HLS) e esta mudança.
5. Sem mudança de manifest, versão de provedor, dependência, serviço externo ou contrato do app. A evidência online existente fica pendente de nova rodada para o pacote final; não há `TMDB_API_KEY` no ambiente desta execução.
