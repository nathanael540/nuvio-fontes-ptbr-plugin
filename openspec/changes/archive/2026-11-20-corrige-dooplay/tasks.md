# Tasks

## 1. Correção da expansão

- [x] 1.1 Em `src/dooplay/players.js`, derivar a origem de expansão da URL final da ficha (`referer` da entrada), exigir HTTPS e usá-la tanto no `POST /wp-admin/admin-ajax.php` quanto no `GET /wp-json/dooplayer/v2/...`; manter o `Referer`, o formulário e o isolamento de falhas.
- [x] 1.2 Remover `hypetvflix.one` de `SOURCES` em `src/dooplay/sources.js` e retirar o campo `origin` das entradas se ele ficar sem uso; registrar a remoção no `design.md` se o comportamento observado mudar.
- [x] 1.3 Revisar `src/dooplay/players.js` e `src/dooplay/sources.js` para não introduzir default silencioso, manter o `https:` obrigatório e preservar a ordem e o contrato de logs.
- [x] 1.4 Reconstruir `providers/dooplay.js` com `node build.js dooplay`; manter a versão atual, porque a identidade online inclui o hash do pacote, e não usar `npm run build` nem `npm run build:min` enquanto outra thread estiver gerando arquivos no checkout compartilhado.

## 2. Testes offline

- [x] 2.1 Acrescentar em `test/dooplay.test.js` um caso de filme em que a busca usa o host configurado, a ficha confirmada tem `url` no host final e o AJAX só responde 200 no host final; o teste deve falhar no código atual e passar depois da correção.
- [x] 2.2 Acrescentar o equivalente para a rota REST, com a ficha confirmada no host final e a rota `/wp-json/dooplayer/v2/...` disponível apenas nesse host.
- [x] 2.3 Acrescentar um caso sem redirect para garantir que a expansão continua na origem configurada, com o mesmo `Referer` e formulário.
- [x] 2.4 Acrescentar um caso de destino não HTTPS e outro de HTTP 400 no host final; verificar que a falha fica isolada e que outra opção ou origem ainda entrega stream.
- [x] 2.5 Atualizar a expectativa da lista de origens para não incluir `hypetvflix.one` e confirmar que o host removido não recebe requisição.
- [x] 2.6 Preservar e executar os casos existentes de filme por `iframe.metaframe`, episódio por `li.mark-*`, `budget danger`, `WatchPlay`, `idS`, `plenoflu`, deduplicação e formatadores `gdrive`/`prism`.
- [x] 2.7 Executar `node --test test/dooplay.test.js` e registrar no `design.md` o resultado do teste novo antes e depois da correção.

## 3. Documentação

- [x] 3.1 Atualizar `docs/provider-investigation.md` com a variação “expansão DooPlay no domínio final da ficha”, referência a `src/dooplay/players.js` e `test/dooplay.test.js`, e o limite de não usar a origem configurada após redirect.
- [x] 3.2 Registrar no `design.md` a execução online dirigida, os casos recuperados, o limite do plenoflu e o que ficou fora da change.
- [x] 3.3 Não editar `providers.md` manualmente; a seção e a tabela só mudam pela rodada oficial com `--record`, depois da implementação.

## 4. Validação integrada

- [x] 4.1 Executar `node build.js dooplay`, `npm run lint` e `npm test`, registrando o código de saída e as falhas; não descartar a saída.
- [x] 4.2 Gerar o pacote de publicação com `npm run build:min` e confirmar que `prism/providers/dooplay.js` e os manifests foram regenerados e que o hash do pacote mudou.
- [x] 4.3 Executar a verificação dirigida `npm run test:online -- --provider dooplay --seed 20261120` sem `--record`, com os catálogos `2026-11-12.1` e o perfil generalista; comparar os dez casos pelo ID e título com o relatório de 20/11 e registrar o novo `run-id` e as diferenças.
- [x] 4.4 Critério de sucesso: Super Mario, Os Vingadores e Matrix continuam resolvidos; Duna, O Senhor dos Anéis e A Guerra dos Tronos passam a resolver; A Favorita, Renegade Immortal e Perfect World continuam sem resolução por ausência de acervo, não por erro de estrutura ou pela correção; nenhuma origem viva passa a falhar por causa da correção.
- [ ] 4.5 Se o critério de 4.4 não se confirmar, não alterar o status; registrar a etapa, a causa observada e o próximo passo verificável.
- [x] 4.6 Se o critério de 4.4 se confirmar, executar a rodada oficial `npm run test:online -- --provider dooplay --record` e deixar o runner atualizar `providers.md`; o status sobe somente se houver ao menos um caso de TV resolvido na rodada registrada.

## 5. Próximos passos fora desta change

- [ ] 5.1 Abrir change própria para a cadeia do plenoflu (`DIRECT_EPISODE_ID`, token da API e `hash ausente`), com fixture real e revalidação de FirePlayer PT-BR e demais consumidores do bloco.
- [ ] 5.2 Investigar `embedplayabyss.top` como família pública de player, com amostra de mídia e decisão explícita de allowlist; manter a triagem até lá.
- [ ] 5.3 Reobservar as páginas de série do `startrekfilms.net` e o 403 do `megafilmehdonline.blog` em outra data; não contornar bloqueio e não afrouxar o parser sem evidência.
