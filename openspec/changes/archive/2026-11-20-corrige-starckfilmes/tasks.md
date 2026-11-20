# Tasks

## 1. Fixture e leitura de `.epsodios`

- [x] 1.1 Capturar uma fixture sanitizada da ficha de série com `.post-buttons .epsodios` (duas versões, faixas, múltiplas qualidades e um link de legendas sem `xid`) em `test/fixtures/starckfilmes/`; conferir que não há cookie, token, URL assinada ou mídia e que os `xid` são sintéticos.
- [x] 1.2 Estender `extractOptions` para ler `.btn-down` e `.epsodios`, associando versão de áudio, faixa de episódios e qualidade; verificar com teste que a fixture produz as seis opções esperadas, com rótulos e áudio corretos.
- [x] 1.3 Manter a falha explícita quando não houver `.btn-down` nem `.epsodios` com `xid` e devolver lista vazia quando houver contêiner sem opção aplicável; verificar os dois casos em teste.
- [x] 1.4 Preservar o caminho de filme e de pacote com `.btn-down`; verificar que os testes existentes de filme, deduplicação e isolamento continuam passando.

## 2. Classificação, pacotes e regressões

- [x] 2.1 Cobrir a faixa `S01E01-02-03` com lista de torrent controlada e exatamente um vídeo do episódio; verificar que o stream sai em `torrent://<hash>/<índice>` com o índice correto.
- [x] 2.2 Cobrir uma opção de episódio avulso ao lado de uma faixa cuja lista falha, usando o formato de Lanternas `EPISÓDIO 01`; verificar que o magnet do episódio é devolvido e que a faixa gera apenas aviso de descarte.
- [x] 2.3 Cobrir a ficha em que todas as faixas dependem de metadados indisponíveis; verificar lista vazia em `getStreams` e erro agregado registrado, sem índice presumido.
- [x] 2.4 Cobrir hash base32, deduplicação entre `.btn-down` e `.epsodios` e qualidade desconhecida; verificar hash hexadecimal de 40 caracteres, um único stream por hash/URL e `quality` "Desconhecida".
- [x] 2.5 Atualizar `docs/provider-investigation.md` com o método `.epsodios` (versão, faixa, qualidade e limite de pacote) e verificar que o texto distingue método em uso de hipótese.

## 3. Validação local e pacote

- [x] 3.1 Executar `npm run lint`, `npm test` e `node build.js starckfilmes`; verificar código de saída zero e registrar eventuais falhas.
- [x] 3.2 Executar `npm run build:min` e conferir que o pacote publicado do Starck Filmes contém a leitura de `.epsodios`; verificar que nenhum outro provedor, manifest ou status foi alterado.

## 4. Revalidação online

- [x] 4.1 Executar `npm run test:online -- --provider starckfilmes` com `TMDB_API_KEY` apenas no ambiente e `prism/all/all/all`; verificar a identidade do pacote e o relatório transitório.
- [x] 4.2 Comparar a nova rodada com a de 20/11/2026: filmes devem manter pelo menos um título resolvido; Arcane não pode falhar por "ficha sem botões"; Pousando no Amor pode continuar falhando apenas por metadados indisponíveis. Registrar contagens e motivos reais e, como verificação suplementar, confirmar Lanternas S01E01 em magnet sem cache.
- [x] 4.3 Atualizar `providers.md` com a rodada final e o status calculado por `docs/tests.md`; verificar com `npm test` que o catálogo de provedores e a última rodada continuam consistentes. Extrair opções não conta como série resolvida, e a verificação suplementar não substitui a rodada oficial.

## Workflow follow-up

- Se as faixas e os pacotes continuarem sem resolução, abrir change própria para substituir o cache de metadados em `src/_blocks/torrent-files/`, com fonte que preserve a ordem de `info.files` e revalidação de todos os provedores que usam o bloco; não alterar o bloco nesta change.
- Arquivar a change após a revisão e a revalidação online, com o que ficou fora declarado explicitamente.
