# Design

## Context

1. A rodada `2026-11-20T13:19:48.648Z-starckfilmes-20261120-b3ee`, pacote 1.1.0, `prism/all/all/all`, está em `providers.md` e em `test/artifacts/online/2026-11-20T13-19-48-648Z-starckfilmes-20261120-b3ee/result.json`: filmes 3/5 resolvidos, séries 0/5, com três ausências e duas falhas.
2. Não existe `openspec/specs/starckfilmes-provider/`. O provedor aparece apenas em `docs/provider-investigation.md` (método do `xid`) e em `test/starckfilmes.test.js`; não havia contrato de capacidade para confrontar a rodada.
3. Em `src/starckfilmes/extractor.js`, `extractOptions` lê somente `.post-buttons .btn-down`. A seleção de ficha de série exige uma temporada exata e aceita pacotes de temporada; a classificação e a resolução ficam em `torrent-release`.
4. A suíte `test/starckfilmes.test.js` passa 18/18. Ela cobre filme, pacote de temporada com `.btn-down`, ausência, deduplicação e isolamento, mas nenhum caso de ficha de série com `.epsodios`.

## Goals / Non-Goals

**Goals:**

1. Restaurar a leitura das opções publicadas nas fichas de série atuais, sem perder o caminho de filme nem o de pacote de temporada.
2. Separar, com evidência, ausência real de catálogo, falha do provedor e falha externa do cache de metadados.
3. Criar a spec do provedor e testes que reproduzam a estrutura real sanitizada.

**Non-Goals:**

1. Substituir ou alterar `src/_blocks/torrent-files/`, compartilhado por MagnetBR, BeTor, LimeFilmes, Baixar Filmes Via-Torrent, TheRARBG e Starck Filmes.
2. Inventar índice de arquivo, tratar pacote como magnet ou prometer reprodução de episódio sem a lista ordenada do `.torrent`.
3. Alterar status, domínio fixo, manifest ou pacotes nesta proposta.

## Decisions

1. **Causa de cada caso da rodada.** A separação abaixo usa a rodada, o código e sondagens públicas de 20/11/2026; a rodada não registra a etapa interna de cada ausência.

   1. Filmes resolvidos (`1070514`, `550`, `128`): o caminho atual foi reproduzido. A busca de "Clube da Luta" devolveu 27 cartões, com o título exato em primeiro; a ficha respondeu 200, tinha um `.post-buttons .btn-down` e o `xid` decodificou para magnet com hash hexadecimal. Não há regressão de filme.
   2. Filmes sem resultado (`962489`, `149`): as buscas por "Ditto", "Ditto Conexões do Amor", "Akira" e "Akira 1988" responderam com a mensagem de ausência do site, sem cartões. O controle "Princesa Mononoke" devolveu 20 cartões com o título exato. A ausência atual é do catálogo, não do extrator; não é possível provar a ausência histórica.
   3. Arcane (`94605`): a busca devolveu "Arcane 1ª Temporada" e "Arcane 2ª Temporada"; a ficha da temporada 1 respondeu 200 com dois blocos `.post-buttons .epsodios` e nenhum `.btn-down`. O primeiro bloco, "VERSÃO DUAL ÁUDIO", publica faixas `EPISÓDIOS 01 AO 03`, `04 AO 06` e `07 AO 09` em 720p; o segundo, "VERSÃO LEGENDADO", publica `EPISÓDIOS 01 ao 09` em 720p, 1080p e 1080p HDR, além de um link de legendas sem `xid`. Isso reproduz exatamente a falha registrada: a ficha é aceita e `extractOptions` lança porque não existe `.btn-down`.
   4. Pousando no Amor (`94796`): a ficha da temporada 1 respondeu 200 com um `.btn-down` de 38,28 GB; o `xid` decodificou para magnet `Pousando.no.Amor.S01` com hash `e36f34ef9c5bb104fd13ce02b548e405b10dcd8b`, cujo prefixo coincide com o da rodada. A consulta pública a `https://itorrents.org/torrent/E36F34EF9C5BB104FD13CE02B548E405B10DCD8B.torrent` respondeu HTTP 200 com `text/html` após redirecionar para `https://www.limetorrents.fun/home`, começando por `<` (byte 60). A falha é do cache externo, não do layout nem da ausência da fonte.
   5. Itaewon Class (`96162`), Perfect World (`124003`) e Renegade Immortal (`223911`): "Itaewon Class" e "Itaewon" responderam com a mensagem de ausência; "Perfect World" devolveu 17 filmes sem a série; "Renegade Immortal" devolveu apenas o filme "Renegades" (2022). As buscas em chinês devolveram o catálogo sem filtro, então não servem como prova de presença. A ausência atual é compatível com o catálogo, não com uma falha do extrator; não se afirma ausência histórica.
   6. Lanternas (`tv`, temporada 1): a ficha respondeu 200 com um único `.epsodios`, nenhum `.btn-down` e oito links `EPISÓDIO 01` a `08` em 1080p. O `xid` do primeiro link decodificou para magnet com `dn` `Lanternas.S01E01` e hash hexadecimal. Ou seja, a leitura de `.epsodios` não é só diagnóstica: fichas com episódio avulso passam a resolver série em magnet sem depender do cache. Lanternas não está no catálogo `tv` da rodada oficial, então esse caso é verificação suplementar e não altera sozinho o status.

2. **Correção local escolhida.** `extractOptions` passa a unir duas fontes: `.post-buttons .btn-down` (filme e pacote de temporada) e `.post-buttons .epsodios` (série). Em `.epsodios`, cada bloco tem um `h3` de versão (`Dual Áudio`, `Legendado`); cada parágrafo tem um `strong` de faixa (`EPISÓDIOS 01 AO 03:`) e um ou mais links `xid`, cada um com a qualidade no texto (`720p`, `1080p HDR`). O rótulo da opção combina faixa e qualidade; a versão entra como dica de áudio; o título da postagem continua como contexto. Links sem `xid` são ignorados. A ficha só falha quando não há nenhum dos dois contêineres.
3. **Cache de metadados fora desta change.** A resolução de faixa e pacote continua em `torrent-files`. O bloco é compartilhado por seis provedores e o itorrents.org deixou de entregar `.torrent`; trocar a fonte no mesmo change misturaria um risco amplo com uma correção local. A substituição exige change própria, com verificação da ordem original de `info.files` e revalidação de todos os consumidores.
4. **Alternativas rejeitadas para o cache.** A API pública do Bitsearch devolve o torrent e uma lista de arquivos, mas sem índice; na faixa `S01E01-02-03`, a ordem observada foi E01, E03, E02, e não a ordem dos episódios. Sem comparar com o `.torrent` original, usar essa ordem em `torrent://` pode tocar o arquivo errado. Magnet para pacote também foi rejeitado: o app tocaria o maior arquivo, que não é necessariamente o episódio. Índice presumido pelo número do episódio foi rejeitado pelo mesmo motivo.
5. **Domínio.** `https://starckfilmes-v29.com` responde 200 com redirecionamento para `https://starckfilmes-v31.com`; a sondagem de filme atravessou esse redirecionamento. Não há evidência de que trocar a constante resolva algo, e o domínio muda com frequência. A constante fica como está nesta change; se o redirecionamento deixar de existir, isso vira uma change própria.
6. **Cobertura de teste.** A suíte atual testa série apenas com `.btn-down`, o que explica por que ela não detectou a lacuna. Os novos casos usam a estrutura real sanitizada de `.epsodios`, com `xid` sintético, e cobrem: versão dupla, faixa, múltiplas qualidades, link de legendas, faixa com arquivo identificado, metadados indisponíveis, episódio avulso, ficha sem contêineres e regressão de filme.
7. **Ausência e falha.** Busca vazia continua sendo lista vazia sem erro. Ficha aceita sem opções aplicáveis continua sendo lista vazia. Ficha sem `.btn-down` e sem `.epsodios` com `xid` é falha de layout. Falha de uma opção descarta só a opção; se nenhuma produzir stream e alguma falhar, o erro agregado sobe para `getStreams`, como hoje.

## Risks / Trade-offs

1. [Faixas e pacotes continuam sem resolução enquanto o cache estiver quebrado] → fichas com episódio avulso, como Lanternas, podem resolver série em magnet; faixas e pacotes continuam limitados. A change não promete que a amostra oficial terá série resolvida e mantém o status real. A cobertura de pacote só melhora após a change do bloco.
2. [Estrutura do site muda outra vez] → o teste usa a estrutura observada, não uma suposição; a falha de layout continua explícita e a sondagem online revalida o pacote final.
3. [Amostra pequena] → não generalizar cobertura do acervo a partir de dez títulos; registrar contagens e ausências como recorte datado.
4. [Domínio em redirect] → monitorar a resposta de `starckfilmes-v29.com`; se o redirect desaparecer, tratar como change própria, sem trocar a constante por palpite.
5. [Índice errado em pacote] → proibir índice presumido e exigir exatamente um arquivo do episódio na lista ordenada, como já faz o bloco; a ausência de lista descarta a opção.

## Migration Plan

1. Implementar a leitura de `.epsodios` em `src/starckfilmes/extractor.js`, sem alterar `torrent-release`, `torrent-files` ou o manifest.
2. Criar fixtures sanitizadas e os casos de teste da decisão 6; rodar `npm run lint`, `npm test` e `node build.js starckfilmes`.
3. Executar `npm run build:min` e `npm run test:online -- --provider starckfilmes` com `TMDB_API_KEY` apenas no ambiente, sem sobrescrever relatórios de outras rodadas.
4. Registrar a rodada final `prism/all/all/all` em `providers.md` com as contagens reais. O status só muda se os critérios de `docs/tests.md` forem atendidos; extrair opções não conta como resolver série. A verificação suplementar de Lanternas S01E01 pode comprovar o caminho de episódio avulso, mas o status continua baseado na rodada oficial.
5. Em caso de regressão, reverter extrator, testes, fixtures e pacotes gerados juntos; manter a rodada anterior como histórico, sem declarar estabilidade.

## Open Questions

1. Qual fonte pública entrega o `.torrent` original, ou a lista de arquivos na ordem de `info.files`, para substituir o itorrents.org no bloco compartilhado? Essa resposta é pré-requisito da change do cache e não bloqueia a leitura de `.epsodios`.
2. Além de Lanternas, outras séries publicam links de episódio avulso? Verificar por ficha antes de tratar como cobertura; a implementação não deve presumir esse formato.

## Validation

1. **Local.** `npm run lint` passou sem erros. `npm test` passou 1921/1921. `node build.js starckfilmes` e `npm run build:min` regeneraram apenas os três pacotes do Starck Filmes; nenhum outro provedor, manifest ou status foi alterado.
2. **Online oficial.** A rodada `2026-11-20T14:26:49.823Z`, ID `2026-11-20T14-26-13-843Z-starckfilmes-20261120-b9ef`, pacote 1.1.0, `prism/all/all/all`, semente `20261120`, repetiu os mesmos dez títulos da rodada anterior. Filmes ficaram 3/5, com os mesmos três resolvidos e as mesmas duas ausências. Séries ficaram 1/5: Arcane S01E01 passou de **Falha** "ficha sem botões" para **Resolvido** com 4/4 streams; Itaewon Class, Perfect World e Renegade Immortal continuaram sem resultado; Pousando no Amor continuou em **Falha**, agora apenas pelo `.torrent` inválido devolvido pelo itorrents.org. O status calculado por `docs/tests.md` passou de Parcial para Estável e foi registrado em `providers.md`.
3. **Verificação suplementar.** Lanternas (`tv` `95350`) S01E01 devolveu um stream magnet em 1080p, `Dublado (Não PT-BR?)`, 1,76 GB, sem consultar o cache de metadados; os demais links `EPISÓDIO` foram triados por não conterem o episódio 1. Isso confirma o caminho de episódio avulso em `.epsodios`, mas não substitui a rodada oficial.
