# Spec Delta

## MODIFIED Requirements

### Requirement: Resolução das famílias comprovadas

O provedor SHALL resolver `jwplayer/?source=<valor>` decodificando `source`, aceitando somente `http(s)`, com `hls` quando o caminho contiver `.m3u8` e `mp4` nos demais casos. Para `rumble.com/embed/<id>`, SHALL ler `p.f["<id>"]` mesmo com a propriedade JavaScript `loaded:<função>()`, usar `u.hls.url` como mídia e a maior chave numérica de `ua.tar` como qualidade. Hosts fora dessas famílias SHALL ser descartados por triagem.

#### Scenario: Fonte `jwplayer` com HLS assinado

- **WHEN** o `source` decodificado é um `https://...m3u8?key=...`
- **THEN** o provedor devolve essa URL como stream HLS, sem baixar a playlist.

#### Scenario: Rumble embed com HLS

- **WHEN** o embed é `https://rumble.com/embed/<id>/?pub=...` e a página publica `p.f["<id>"]` com `loaded:v()` e `ua.tar`
- **THEN** o provedor devolve `u.hls.url` como master HLS e a qualidade da maior chave numérica de `ua.tar`.

#### Scenario: Host não suportado

- **WHEN** o embed aponta para Google Drive, Ok.ru, Vidmoly, VK, Dailymotion, Secvideo1 ou Presto
- **THEN** a opção é descartada por triagem, sem falha fatal.

#### Scenario: Nenhuma opção produz stream

- **WHEN** todas as opções são de hosts não suportados
- **THEN** a saída é lista vazia, porque a fonte reconheceu as opções e nenhuma entrou no contrato.
