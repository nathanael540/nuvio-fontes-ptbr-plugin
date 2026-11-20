# Tasks

## 1. Filtro compartilhado

- [x] 1.1 Adicionar `QUALITY` e compartilhar a conversão de qualidade em altura. Cobrir as seis equivalências, resoluções intermediárias, `4K`, `CAM`, `Desconhecida` e a ordenação nas suítes existentes.
- [x] 1.2 Criar o bloco de filtro com os níveis cumulativos de idioma, tipo exato por protocolo e piso de resolução. Testar todos os valores de `LANGUAGE`, magnet, `torrent://`, HTTP(S), filtros combinados, ordem preservada e lista vazia quando tudo é filtrado.
- [x] 1.3 Atualizar `src/_blocks/index.md` com os blocos e suas dependências. Conferir que `test/blocks-catalog.test.js` reconhece a suíte do novo bloco.

## 2. Build e instalação

- [x] 2.1 Mover o cadastro para `src/manifest.json` e atualizar seus leitores. Verificar o cadastro, os catálogos de provedores publicados e rejeitados e os testes de provedores que usam os metadados do manifest.
- [x] 2.2 Integrar o adaptador aos pacotes compartilhados. Testar o contrato e as exportações, provedores HTTP e P2P, IDs com prefixo de Mobile e TV, ID legado e combinação inválida. Com o mesmo pacote e os mesmos streams, os manifests de 720p e 1080p devem produzir listas diferentes.
- [x] 2.3 Gerar os 168 manifests da matriz e um pacote por provedor para cada formato. Testar nomes e IDs, os metadados do cadastro, o `filename` absoluto compartilhado, o número de scripts por provedor e o build direcionado com pacotes presentes e faltantes.
- [x] 2.4 Gerar os três manifests de compatibilidade com os IDs e caminhos relativos atuais. Testar que Prism e Google Drive usam os pacotes compartilhados e entregam a mesma lista de `all/all/all`. Testar que a raiz entrega a lista sem filtros com sorteio de formato.
- [x] 2.5 Ajustar o servidor local para que os manifests da matriz carreguem os pacotes do servidor de testes. Conferir a origem de `filename`, HTTP 200 para manifests e pacotes válidos e 404 para rotas fora do permitido.
- [x] 2.6 Atualizar README, arquitetura, regras de contribuição e guia de testes. Conferir exemplos de instalação em `all/all/all`, URLs temporárias, convenção de ID e publicação com `npm run build:min`.
- [x] 2.7 Testar um pacote minificado com os mesmos fixtures e o mesmo ID do pacote de desenvolvimento. Conferir resultado, exportações e logs equivalentes, e o alvo ES2016.

## 3. Verificação online

- [x] 3.1 Atualizar o runner para usar `prism/all/all/all` por padrão e aceitar combinação explícita. Testar a resolução local do pacote referenciado, o ID entregue a `SCRAPER_ID`, identidades distintas para dois manifests com o mesmo arquivo, a rejeição de combinações inválidas e o registro público restrito à referência.
- [x] 3.2 Atualizar a documentação do runner e conferir seus exemplos com a ajuda do comando e os testes do runner.

## 4. Integração

- [x] 4.1 Executar `npm run lint`, `npm test`, `node build.js <id>` para cada provedor alterado e `npm run build:min` para a saída final. Registrar no design a duração, as contagens e os bytes de JavaScript e JSON gerados. Conferir que cada `filename` resolve e que os scripts são gerados uma vez por provedor e formato, mais o pacote da raiz durante a transição.
- [x] 4.2 Executar a verificação online dos provedores afetados nos pacotes finais de referência. Registrar em `providers.md` a evidência aplicável ou a ausência dela pelos critérios vigentes.
- [x] 4.3 Exercitar online uma combinação filtrada de cada tipo de stream com provedores compatíveis e registrar os resultados no relatório transitório. Conferir que rodadas filtradas preservam o status público do provedor.

## Workflow follow-up

1. Arquivar a mudança quando as verificações exigidas passarem ou quando as pendências estiverem declaradas conforme as regras do repositório.
