# Proposal

## Why

O catálogo da VaqueiroFilmes (tema VacaTorrent, WordPress) publica filmes recentes em PT-BR e oferece players externos que chegam a HLS, mas nenhum provedor deste repositório consulta esse catálogo nem resolve essa cadeia. Adicionar a fonte amplia a cobertura de filmes dublados sem depender de busca manual no site.

## What Changes

- Novo provedor `vaqueirofilmes`, com `supportedTypes: ["movie"]` e formato `m3u8`.
- Busca no catálogo WordPress por `wp-json/wp/v2/search`, restrita a `subtype=movie`, com confirmação de título e ano na página do filme antes de aceitar o candidato.
- Descoberta das opções de player na página do filme (`?video=N`) e resolução da opção EmbedPlay.
- Cadeia EmbedPlay: `embedplayapi.top` (ID interno e servidor) → `embedplay.vip` (opções de áudio) → `embedplaybyse.top` (playback cifrado) → HLS assinado.
- Decifragem local do `playback` do Byse com AES-256-GCM a partir de `key_parts`, sem serviço externo, chave ou conta; a verificação de integridade da tag não é necessária para montar o stream, mas o JSON resultante é validado.
- Metadados de apresentação e idioma conforme o que a fonte comprova; legendas quando o Byse devolver faixas.
- Fora do escopo: séries (a fonte só expõe downloads em `enc/go.php`), downloads, torrents e as opções Abyss, Loadvid, VidSrc e Superflixapi, que não entregam HLS de forma compatível com o runtime ou respondem com bloqueio.
- Manifest, documentação de provedores, guia de investigação (novo método de catálogo WordPress + player EmbedPlay/Byse), fixtures e testes.

## Capabilities

### New Capabilities

- `vaqueirofilmes-catalog`: busca no WordPress, triagem de tipo e confirmação de identidade (título e ano) para filmes.
- `vaqueirofilmes-player-chain`: descoberta das opções de player, resolução da cadeia EmbedPlay/Byse, decifragem do playback e montagem dos streams HLS.

### Modified Capabilities

Nenhuma.

## Impact

- `manifest.json`: novo scraper `vaqueirofilmes`.
- `src/vaqueirofilmes/`: identidade, busca, leitor da página do filme, cadeia EmbedPlay e decifragem do Byse.
- `providers/vaqueirofilmes.js`: saída gerada pelo build.
- `test/vaqueirofilmes.test.js` e `test/fixtures/vaqueirofilmes/`: testes offline com respostas reais sanitizadas.
- `package.json`: `crypto-js` como dependência de desenvolvimento para os testes da decifragem; o app já fornece o módulo em produção.
- `providers.md`: nova seção e status inicial não verificado até a rodada online.
- `docs/provider-investigation.md`: novo método reutilizável de catálogo WordPress com player externo EmbedPlay/Byse.
- `README.md`: lista de provedores, se houver tabela de IDs.
- Nenhuma mudança de contrato, formato existente ou provedor atual.
