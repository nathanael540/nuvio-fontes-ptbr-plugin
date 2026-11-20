# Proposal

## Why

1. A rodada `prism/all/all/all` de 20/11/2026 marcou a VenoPlay como `Parcial` (movie 0/5, tv 2/5), com duas falhas de busca e seis casos sem resultado. A execução do mesmo pacote contra a fonte mostrou que as falhas não são ausência de acervo: as duas são a página de "nenhum resultado" em português, que o provedor não reconhece, e os seis "Sem resultado" são títulos confirmados cujo player não publicou fonte HLS aceita pelo filtro atual.
2. Há correção sustentada para os dois problemas, com preservação dos casos positivos: Grey's Anatomy e Breaking Bad continuam resolvendo pelo player `mgeb`, e Os Vingadores e Friends também resolveram na revalidação pontual.
3. O caso Pantera Negra tem HLS `.php` no host já aprovado `mgeb.space`; a única barreira é a exigência de extensão `.m3u8`. O endpoint devolveu playlist mestra e de mídia com segmentos, o que permite corrigir sem ampliar a confiança para novos hosts.

## What Changes

1. Reconhecer a mensagem localizada de ausência da busca (`Nenhum resultado encontrado`) quando não houver cartões, mantendo erro de estrutura para página desconhecida.
2. Aceitar fonte declarada `type: hls` em `mgeb.space`/`mgeb.lat` com caminho `.m3u8` ou `.php`, preservando as rejeições de credencial, `workers.dev`, hosts não comprovados e player sem `var sources`.
3. Cobrir os dois formatos com fixtures reais sanitizadas e testes offline, incluindo a regressão dos casos positivos e a resposta HTTP 5xx da busca.
4. Registrar os limites que continuam fora do contrato: `workers.dev`, MP4 com `username`/`token`, HLS em `strm15.uqload.vc` sem cadeia utilizável e a resposta 522 intermitente.
5. Definir a revalidação online com a mesma semente `20261120`, exigindo Pantera Negra resolvido, Swallowed Star e Douluo Dalu como ausência sem falha, e os dois positivos preservados.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

1. `venoplay-provider`: reconhecimento da ausência localizada e aceitação de HLS `.php` no host `mgeb` já aprovado.

## Impact

1. A implementação futura toca `src/venoplay/site.js`, `src/venoplay/player.js`, `test/venoplay.test.js` e `test/fixtures/venoplay/`; os pacotes gerados e `providers.md` só mudam na implementação e após a rodada online.
2. Sem dependência, chave ou serviço novo; a única chave externa continua sendo `TMDB_API_KEY`, fornecida pelo app.
3. Esta proposta não altera código, status, build, commit, branch ou worktree.
