# Proposal

## Why

O Doramogo é um catálogo em português do Brasil de doramas e filmes asiáticos, com reprodução HLS dublada ou legendada. Nenhum provedor atual cobre essa fonte: ela usa títulos em PT-BR, confirma o TMDB pelo nome do arquivo da imagem e publica o caminho da mídia no JavaScript da página de episódio. Sem um provedor dedicado, esse acervo fica fora do Nuvio.

## What Changes

1. Adicionar o provedor `doramogo`, com `movie` e `tv`, em `src/doramogo/`, versão `1.0.0`, formato HLS, empacotado nos três formatos e registrado no `manifest.json`.
2. Buscar em `/search/?q=<título>` com o título PT-BR, o título original e os alternativos do TMDB. Confirmar a identidade pelo ID do TMDB presente no nome do arquivo da imagem do cartão e pelo tipo declarado (`Filme` ou `Dorama`), sem usar o ano da ficha, que reflete a data de publicação no site e não o lançamento.
3. Em séries, selecionar a temporada e o episódio pela lista da ficha, exigindo a coordenada exata. Em filmes, usar a página pseudoepisódio `temporada-1/episodio-01`. Título, temporada ou episódio ausente devolve lista vazia.
4. Ler na página do episódio o `urlConfig` (`slug`, `tipo`, temporada e episódio) e o `FALLBACK_URL` publicado; montar a URL HLS a partir do host e do caminho informados pela própria página, sem fixar o CDN no código. Validar tipo e coordenadas e tratar redirecionamento para outro episódio como ausência.
5. Usar o host alternativo de mídia publicado pela página, porque o host primário respondeu HTTP 403 nas sondagens; enviar `Referer`, `Origin` e `User-Agent` de reprodução. Não há conta, chave ou serviço novo: o TMDB continua usando apenas `TMDB_API_KEY` entregue pelo app.
6. Classificar o idioma pelo rótulo `Áudio:` da ficha (`Dublado` ou `Legendado`). A fonte não informa qualidade, tamanho nem legendas externas; esses campos não serão inventados.
7. Tratar cada variante de áudio confirmada (mesmo ID do TMDB em páginas diferentes) como uma opção independente: devolver todas as que resolverem e descartar apenas a que falhar. Se nenhuma produzir stream e alguma tiver falhado, o erro sobe para o ponto de entrada.
8. Cobrir filme, episódio avulso, temporada posterior, variante legendada, duas variantes de áudio, ausência de título, ausência de episódio, tipo ou ID conflitantes, redirecionamento de episódio, configuração ausente e falha isolada de variante com testes Node e fixtures reais sanitizadas.
9. Adicionar a linha e a seção do provedor em `providers.md`, começar como `🟠 Não verificado` e registrar a rodada online depois do build. Sem perfil de nicho nesta mudança: o catálogo `movie` não tem cinco títulos com a tag `dorama`; a verificação online usa o perfil generalista.
10. Atualizar `docs/provider-investigation.md` com os métodos reaproveitáveis observados: confirmação pelo ID do TMDB no nome da imagem, caminho de mídia publicado pela página e host de mídia com hotlink protection por `Referer`. Nenhum bloco novo é necessário.

## Capabilities

### New Capabilities

- `doramogo-provider`: localização e confirmação de filmes e séries no Doramogo, seleção de temporada e episódio, leitura do caminho HLS publicado, cabeçalhos de reprodução, idioma e contrato dos streams, incluindo ausência e falhas isoladas.

### Modified Capabilities

Nenhuma. A verificação online segue a capability `provider-online-verification` existente, sem perfil de nicho nesta mudança.

## Impact

1. Código: `src/doramogo/` (novo), `test/doramogo.test.js` (novo) e fixtures em `test/fixtures/doramogo/`.
2. Configuração e documentação: `manifest.json`, `providers.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/doramogo.js`, `gdrive/providers/doramogo.js`, `prism/providers/doramogo.js` e os `<formato>/manifest.json`, todos pelo build.
4. Dependências externas: apenas `TMDB_API_KEY`, fornecida pelo app; a fonte e o host de mídia são públicos e não exigem conta nem chave.
5. Limites conhecidos: a busca devolve no máximo 18 cartões e não pagina; o host primário de mídia respondeu 403 nas sondagens; o ano da ficha não é o de lançamento; a rodada online generalista pode não sortear títulos de dorama, o que fica registrado no design e na evidência.
