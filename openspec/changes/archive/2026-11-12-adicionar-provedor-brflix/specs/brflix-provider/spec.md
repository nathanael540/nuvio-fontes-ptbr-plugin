# Spec Delta

## Purpose

Resolver filmes e séries no agregado público BRFlix pelo ID do TMDB, decifrar a resposta no aparelho, selecionar candidatos MP4 e HLS jogáveis e devolver streams compatíveis com o contrato do Nuvio, sem conta e sem chave de serviço.

## ADDED Requirements

### Requirement: Consulta ao agregado pelo ID do TMDB

O provedor SHALL consultar `GET https://brflix.lat/best-stream-resolve` com `mediaType`, `tmdbId`, `dubbed=1` e, para série, `season` e `episode`. A consulta SHALL usar o ID do TMDB diretamente, sem busca textual e sem `getMediaInfo`. Filme SHALL ser consultado sem coordenadas de episódio; série SHALL exigir temporada e episódio inteiros positivos antes da requisição.

#### Scenario: Filme consultado por TMDB

- **WHEN** a entrada é `movie` com um `tmdbId` válido
- **THEN** a requisição contém `mediaType=movie`, `tmdbId`, `dubbed=1` e não contém `season` nem `episode`.

#### Scenario: Série consultada com temporada e episódio

- **WHEN** a entrada é `tv` com temporada 2 e episódio 3
- **THEN** a requisição contém `mediaType=tv`, `tmdbId`, `season=2`, `episode=3` e `dubbed=1`.

#### Scenario: Coordenadas inválidas não consultam a fonte

- **WHEN** a entrada é `tv` com temporada ou episódio ausente, zero ou negativo
- **THEN** o provedor lança erro de entrada antes de qualquer requisição.

### Requirement: Decifragem local do payload

O provedor SHALL aceitar respostas com `enc: true` e `payload` no formato `iv:tag:ciphertext` em Base64, decifrando AES-256-GCM no aparelho com a chave simétrica pública do player do BRFlix, sem depender de `crypto.subtle`. A verificação da tag GCM não é exigida; o JSON decifrado SHALL ser validado estruturalmente. Resposta com `enc: false` SHALL ser lida como JSON comum.

#### Scenario: Payload cifrado é decifrado

- **WHEN** a resposta contém `enc: true`, um `iv` de 12 bytes e um `payload` com ciphertext válido
- **THEN** o provedor obtém o JSON com `ok` e `candidates` sem usar APIs de criptografia do sistema.

#### Scenario: Resposta sem cifra é aceita

- **WHEN** a resposta contém `enc: false` e o objeto de resolução em texto claro
- **THEN** o provedor usa o objeto diretamente, sem tentar decifrar.

#### Scenario: Payload inválido é falha

- **WHEN** o `payload` está ausente, o `iv` não tem 12 bytes, o Base64 é inválido ou o resultado não é JSON válido
- **THEN** o provedor lança erro de estrutura, sem devolver lista vazia como se fosse ausência.

### Requirement: Triagem de candidatos e ausência

O provedor SHALL tratar `ok: false` como ausência reconhecida e devolver lista vazia. Com `ok: true`, SHALL ler a lista `candidates` e aceitar somente candidatos com `type` HLS ou MP4 e URL HTTP(S) ou relativa. Candidatos `iframe` SHALL ser descartados por triagem. URLs relativas SHALL ser resolvidas contra `https://brflix.lat/`; candidatos repetidos SHALL ser deduplicados pela URL final. Se todos os candidatos forem descartados por triagem, a saída SHALL ser lista vazia.

#### Scenario: Candidatos MP4 e HLS são preservados

- **WHEN** a resposta traz um candidato MP4 e um candidato HLS, ambos com URL
- **THEN** o provedor devolve um stream para cada candidato, sem descartar nenhum dos dois formatos.

#### Scenario: Candidato iframe é descartado

- **WHEN** o único candidato tem `type: iframe`
- **THEN** o provedor devolve lista vazia e não monta um stream com a URL de iframe.

#### Scenario: Candidatos repetidos são unidos

- **WHEN** a lista traz o mesmo candidato mais de uma vez, com a mesma URL final
- **THEN** o provedor devolve apenas um stream para essa URL.

#### Scenario: Ausência reconhecida

- **WHEN** a resposta contém `ok: false`
- **THEN** o provedor devolve lista vazia, sem tratar a ausência como falha.

#### Scenario: Estrutura sem lista de candidatos

- **WHEN** a resposta contém `ok: true` mas não traz `candidates` nem uma URL jogável no nível superior
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.

### Requirement: Falha isolada de candidato

Candidato HLS ou MP4 com URL inválida SHALL ser descartado como opção com falha, registrando `[BRFlix] Opção <provider> descartada: <causa>`, sem interromper os demais candidatos. Se nenhum stream for produzido e ao menos uma opção tiver falhado, o provedor SHALL lançar erro com a causa de cada opção.

#### Scenario: Um candidato inválido e outro válido

- **WHEN** a lista traz um candidato HLS com URL malformada e um candidato MP4 com URL válida
- **THEN** o provedor devolve o stream MP4 e registra o aviso do candidato descartado.

#### Scenario: Todos os candidatos inválidos

- **WHEN** todos os candidatos HLS ou MP4 têm URL malformada
- **THEN** o provedor lança erro com a causa de cada candidato, sem devolver lista vazia como ausência.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, informando a URL absoluta, o `provider` do candidato, o `type` correspondente ao formato, o idioma `Dublado` ou `Legendado` conforme o campo `dubbed`, os cabeçalhos de reprodução do BRFlix e a qualidade somente quando o valor da fonte for uma resolução confiável. `name` e `title` SHALL ser gerados pelo formatador. Campos que a fonte não fornece SHALL ser omitidos, sem valores inventados.

#### Scenario: Stream dublado em HLS

- **WHEN** o candidato tem `type: hls`, `dubbed: true` e a URL é um master HLS do BRFlix
- **THEN** o stream sai com tipo HLS, idioma "Dublado" e cabeçalhos de reprodução do site.

#### Scenario: Stream legendado em MP4

- **WHEN** o candidato tem `type: mp4`, `dubbed: false` e uma URL HTTP(S)
- **THEN** o stream sai com tipo MP4, idioma "Legendado" e a mesma URL absoluta.

#### Scenario: Qualidade não confiável é omitida

- **WHEN** o campo `quality` do candidato não é uma resolução reconhecível
- **THEN** o provedor não usa esse valor e o stream é preservado com a descoberta local do formatador, sem requisição extra.

#### Scenario: Campos ausentes na fonte

- **WHEN** a resposta não oferece tamanho, legendas externas, seeders ou peers
- **THEN** esses campos não aparecem no stream.

### Requirement: Falhas preservadas e ausência não mascarada

O provedor SHALL lançar erro em falha de rede, HTTP fora de 2xx, JSON inválido, decifragem inválida ou estrutura inesperada. Somente `getStreams` SHALL capturar a falha final, registrar `[BRFlix] ...` e devolver lista vazia. O provedor SHALL NOT impor limite de tempo, repetir a consulta ou manter cache das URLs assinadas entre chamadas.

#### Scenario: Falha HTTP sobe para getStreams

- **WHEN** `/best-stream-resolve` responde HTTP 500
- **THEN** o erro sobe até `getStreams`, que registra `[BRFlix] ...` e devolve lista vazia.

#### Scenario: Falha de rede sobe para getStreams

- **WHEN** a requisição falha antes de receber uma resposta
- **THEN** o erro sobe até `getStreams`, sem ser convertido em ausência.

#### Scenario: URLs são renovadas a cada chamada

- **WHEN** o mesmo título é resolvido duas vezes em sequência
- **THEN** cada chamada consulta a fonte de novo e não reutiliza a URL ou o payload anterior.
