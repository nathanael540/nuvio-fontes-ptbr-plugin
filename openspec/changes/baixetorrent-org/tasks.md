# Tasks

## 1. Estrutura e configuração do provedor

- [ ] 1.1 Copiar `src/_template/` para `src/baixetorrent-org/` e ajustar `index.js` (`PROVIDER_NAME = 'BaixeTorrents'`); verificar que o pacote exporta `getStreams` compilando com `node build.js baixetorrent-org`
- [ ] 1.2 Implementar `src/baixetorrent-org/extractor.js`: validar entrada, chamar `collectWordpressTorrents` com o catálogo do design e devolver streams; os streams formatados do pacote devem ter `addon` "Baixe Torrents" e magnet válido

## 2. Manifest e suíte de desenvolvimento

- [ ] 2.1 Adicionar entrada do novo scraper em `manifest.json` (id `baixetorrent-org`, name "Baixe Torrents", formats `["magnet"]`, contentLanguage `["pt"]`); verificar com `npm test` no grupo Manifest
- [ ] 2.2 Criar `test/baixetorrent-org.test.js` com fixtures em `test/fixtures/baixetorrent-org/` cobrindo filme, episódio avulso, pacote e ausência; suíte verde

## 3. Validação e documentação

- [ ] 3.1 Rodar `node build.js baixetorrent-org`, `npm run lint` e `npm test`; todos verdes
- [ ] 3.2 Registrar linha e seção do novo provedor em `providers.md`; registrar rodada online em `providers.md` com a saída de `npm run test:online -- --provider baixetorrent-org`

## Workflow follow-up

- Arquivar a change `baixetorrent-org` após a revisão dos artifacts e a validação online.
