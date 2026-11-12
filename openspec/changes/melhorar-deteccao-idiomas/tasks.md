# Tasks

## 1. Bloco language-discovery

- [x] 1.1 Reconhecer `Dublagem`/`Legendagem`, `Dual Áudio` e `Tri Áudio`; `Dual`/`Tri` sem `PT-BR`/`Brasil` viram `Dublado (Não PT-BR?)`, e `Dublado` explícito vence a convenção. Verificação: testes do bloco cobrem `Dual Áudio`, `Dual ÁudioHDR`, `Tri Áudio`, `Dublado Dual Áudio` e `Dual Áudio PT-BR`.
- [x] 1.2 Corrigir legenda estrangeira (`English sub`, `Legendado Inglês`) para `Não PT-BR` e ampliar os nomes de idiomas estrangeiros. Verificação: testes do bloco cobrem os dois casos e os nomes novos.
- [x] 1.3 Fazer `languageFromTexts` ignorar resultado apenas estrangeiro quando outro candidato comprova áudio/legenda em português. Verificação: teste com `English` antes de `Dublado` devolve `Dublado`.

## 2. Provedores e blocos consumidores

- [x] 2.1 Ler `Idioma`, `Idiomas` e `Áudio` das fichas da Baixa Rápido com `readPageLanguage` e passar o valor a `classifyMagnetOption` em todos os leitores. Verificação: teste do helper e teste de catálogo com rótulo sem idioma.
- [x] 2.2 Aceitar `Idiomas` e `Idioma do Áudio` em `wordpress-torrent`. Verificação: suíte do bloco e provedores WordPress continuam passando.
- [x] 2.3 Usar `languageFromTexts` no LimeFilmes com rótulo e `dn`; reconhecer `Dual Áudio` sem `normalizeLanguage` isolado. Verificação: teste do provedor com `720p | Dual Áudio`.
- [x] 2.4 Passar `audioType` do cartão de busca do Starck Filmes para `classifyMagnetOption`. Verificação: teste do provedor com `Dual Áudio` esperando `Dublado (Não PT-BR?)`.
- [x] 2.5 Classificar áudio estrangeiro comprovado em HLS no MegaEmbed como `Não PT-BR` sem legenda PT, mantendo `Legendado` com legenda PT. Verificação: teste novo com `LANGUAGE="en"`.
- [x] 2.6 Ampliar os idiomas estrangeiros reconhecidos pelo FirePlayer nas faixas HLS. Verificação: suíte do bloco `fireplayer` e do provedor.

## 3. Testes e documentação

- [x] 3.1 Atualizar as expectativas de `Dual Áudio` em Filmestorrent, LimeFilmes, Starck Filmes e Baixa Rápido para `Dublado (Não PT-BR?)`.
- [x] 3.2 Atualizar `docs/arch.md` (contrato de idioma) e `src/_blocks/index.md` (catálogo de blocos).
- [x] 3.3 Rodar `npm run lint`, `npm test` e `npm run build`; comparar eventuais falhas com a linha de base.
- [x] 3.4 Rebuildar os provedores afetados e conferir que `providers/`, `gdrive/providers/` e `prism/providers/` foram gerados pelo build.
- [ ] 3.5 Rodar a verificação online dos provedores alterados quando `TMDB_API_KEY` estiver disponível e atualizar `providers.md` antes de publicar.

## 4. Workflow

- [ ] 4.1 Arquivar a mudança depois da revisão e da evidência online registrada.
