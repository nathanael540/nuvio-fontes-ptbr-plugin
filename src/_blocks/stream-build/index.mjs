/**
 * Bloco stream-build: monta os objetos de stream que o provedor devolve ao app.
 *
 * Aplica o contrato do provedor (docs/arch.md, seção 5): campos obrigatórios, qualidade em texto
 * (o NuvioTV lê via Gson e pode exibir "1080.0" para números), idioma padronizado, magnet com hash
 * hexadecimal, arquivo de torrent em `torrent://<hash>/<índice>` e nenhum campo que o app ignore.
 *
 * Depende dos blocos language-discovery, custom-formatter e quality-discovery.
 */

import { formatStream } from '../custom-formatter/index.mjs';
import { discoverQuality, normalizeQuality, UNKNOWN_QUALITY } from '../quality-discovery/index.mjs';
import { discoverLanguage, LANGUAGE } from '../language-discovery/index.mjs';

export { normalizeQuality };

const UHD_HEIGHT = 2160;
const FOUR_K = '4K';
const CAM = 'CAM';
const CAM_RANK = 0;
const UNKNOWN_RANK = -1;
const HTTP_PROTOCOLS = ['http:', 'https:'];

const QUALITY_TOKEN = /^(\d{3,4})p$/;

const MAGNET_PREFIX = /^magnet:/i;
// Parâmetro xt com btih em qualquer posição da query (o primeiro encontrado).
const MAGNET_BTIH = /^magnet:\?(?:[^&]*&)*?xt=urn:btih:([^&]*)/i;
const HEX_HASH = /^[0-9a-f]{40}$/i;
const TORRENT_FILE_PREFIX = /^torrent:\/\//i;
// Arquivo dentro de um torrent: o app lê o índice do segmento após o hash.
const TORRENT_FILE = /^torrent:\/\/([^/?#]+)\/([^/?#]+)$/i;
const BASE32_HASH = /^[a-z2-7]{32}$/i;

const REQUIRED_FIELDS = ['url', 'format'];
// Campos de entrada de qualidade e idioma que não são copiados diretamente para o stream.
const INPUT_FIELDS = ['quality', 'qualityHints', 'language', 'languageHints'];

// Leitores dos campos opcionais, na ordem do contrato. Cada um valida e devolve o valor final.
const OPTIONAL_READERS = {
  size: readText,
  headers: readHeaders,
  subtitles: readSubtitles,
  infoHash: readInfoHash,
  provider: readText,
  type: readText,
  seeders: readCount,
  peers: readCount,
  behaviorHints: readBehaviorHints,
};

const SUBTITLE_REQUIRED_FIELDS = ['url', 'language'];
const SUBTITLE_OPTIONAL_READERS = { name: readText, headers: readHeaders };

const BEHAVIOR_HINT_READERS = { audioDelayMs: readFiniteNumber, audioDelayLanguage: readText };

/**
 * @typedef {object} Subtitle
 * @property {string} url - URL http(s) da legenda.
 * @property {string} language - Idioma da legenda; sem ele o app exibe "Unknown".
 * @property {string} [name] - Nome exibido.
 * @property {Object<string, string>} [headers] - Cabeçalhos HTTP para baixar a legenda.
 */

/**
 * @typedef {object} BehaviorHints
 * @property {number} [audioDelayMs] - Atraso do áudio em milissegundos (lido apenas pelo NuvioTV).
 * @property {string} [audioDelayLanguage] - Idioma do áudio a que o atraso se aplica.
 */

/**
 * @typedef {object} Stream
 * @property {string} url - URL http(s) direta de vídeo ou link magnet.
 * @property {string} name - Rótulo do stream na lista, gerado pelo formatador.
 * @property {string} title - Título do stream, gerado pelo formatador.
 * @property {string} quality - Qualidade normalizada: "<n>p", "4K", "CAM" ou "Desconhecida".
 * @property {string} [size] - Tamanho em texto, ex.: "2.5 GB".
 * @property {string} language - Um dos seis membros do enum fechado LANGUAGE; sempre presente na saída.
 * @property {Object<string, string>} [headers] - Cabeçalhos HTTP da reprodução (nunca em magnet).
 * @property {Subtitle[]} [subtitles] - Legendas externas.
 * @property {string} [infoHash] - Hash hexadecimal (40 caracteres, minúsculo) do torrent.
 * @property {string} [provider] - Servidor ou hospedagem de origem dentro da fonte.
 * @property {string} [type] - Tipo do stream.
 * @property {number} [seeders] - Seeders do torrent.
 * @property {number} [peers] - Peers do torrent.
 * @property {BehaviorHints} [behaviorHints] - Dicas de reprodução.
 */

/**
 * Monta um stream validado no formato do contrato do provedor, pronto para retornar ao app.
 *
 * `format` é obrigatório e gera `name` e `title` por `formatStream` (bloco custom-formatter); o
 * provedor não informa `name` nem `title`. `format` não vai para o stream.
 *
 * `quality` é opcional: sem ela, a qualidade é descoberta localmente, sem rede, nos textos já
 * obtidos, nesta ordem: `qualityHints`, `format.filename`, `format.folderName` e `url`. Sem
 * correspondência, o stream sai com `UNKNOWN_QUALITY` ("Desconhecida") em vez de ser descartado;
 * qualidade explícita inválida continua lançando erro.
 *
 * `language` é opcional: um membro confiável de `LANGUAGE` encerra a resolução. Se ausente ou
 * `LANGUAGE.UNKNOWN`, a resolução descobre o idioma nos nomes `format.filename`, `format.folderName`
 * e `languageHints` opcional. Texto fora do enum gera aviso `[addon]` e segue para descoberta.
 *
 * Textos saem sem espaços nas pontas; opcionais só entram no resultado quando definidos. Em magnet,
 * a URL é mantida intacta (com `dn`, `xl` e `tr`) e `infoHash` é preenchido com o hash do `xt`.
 * Em `torrent://<hash>/<índice>`, a URL sai com o hash em minúsculas e `infoHash` recebe o hash.
 * Não altera `fields`.
 *
 * @param {object} fields - Campos do stream. Qualquer outro campo (ex.: `group`, `lang`) lança erro.
 * @param {string} fields.url - URL http(s), magnet (`magnet:?...`) com o parâmetro `xt=urn:btih:<hash hexadecimal de 40 caracteres>` em qualquer posição, ou arquivo de torrent `torrent://<hash hexadecimal de 40 caracteres>/<índice inteiro ≥ 0>` (use `buildTorrentFileUrl`).
 * @param {import('../custom-formatter/index.mjs').FormatDetails} fields.format - Template (`FORMATTER.AUTO`
 *   nos provedores) e detalhes da release para gerar `name` e `title` (bloco custom-formatter).
 * @param {number|string} [fields.quality] - Qualidade aceita por `normalizeQuality`, ou `UNKNOWN_QUALITY` ("Desconhecida"); sem ela, a descoberta local preenche.
 * @param {(string|null|undefined)[]} [fields.qualityHints] - Textos já obtidos (rótulos, `dn`, nome de arquivo) em ordem de prioridade, consultados antes de `format` e da URL; `null`, `undefined` e vazio são ignorados.
 * @param {string} [fields.size] - Tamanho em texto, ex.: "2.5 GB".
 * @param {string} [fields.language] - Membro confiável do enum LANGUAGE; se ausente ou UNKNOWN, aciona descoberta local por nomes. Texto fora do enum gera aviso.
 * @param {string[]} [fields.languageHints] - Textos opcionais, fiéis e confiáveis da opção/mídia consultados na descoberta por nomes; não vai para o stream.
 * @param {Object<string, string>} [fields.headers] - Cabeçalhos HTTP da reprodução; não se aplica a magnet nem a `torrent://`.
 * @param {Subtitle[]} [fields.subtitles] - Legendas com `url` http(s) e `language` obrigatórios.
 * @param {string} [fields.infoHash] - Hash hexadecimal de 40 caracteres; em magnet ou `torrent://`, deve ser igual ao da URL.
 * @param {string} [fields.provider] - Servidor ou hospedagem de origem, ex.: "Filemoon".
 * @param {string} [fields.type] - Tipo do stream.
 * @param {number} [fields.seeders] - Inteiro maior ou igual a zero.
 * @param {number} [fields.peers] - Inteiro maior ou igual a zero.
 * @param {BehaviorHints} [fields.behaviorHints] - Apenas `audioDelayMs` e `audioDelayLanguage`.
 * @returns {Stream} Novo objeto de stream.
 * @throws {Error} Se faltar campo obrigatório (incluindo `format`), se algum campo for inválido ou
 *   desconhecido, se o magnet ou o `torrent://` tiver hash fora do formato hexadecimal ou índice
 *   inválido, se `infoHash` divergir da URL, se houver `headers` em magnet ou `torrent://`, ou se
 *   `formatStream` rejeitar o template ou os detalhes.
 * @example
 * buildStream({
 *   url: 'https://cdn.exemplo.com/video.m3u8',
 *   format: { template: FORMATTER.AUTO, addon: 'CineAgora', title: 'Duna: Parte Dois', year: 2024 },
 *   quality: 1080,
 *   language: 'Dublado',
 *   headers: { Referer: 'https://exemplo.com/' },
 * });
 * // { url: '...', name: 'CineAgora 1080p', title: '...', quality: '1080p',
 * //   language: 'Dublado', headers: { Referer: 'https://exemplo.com/' } }
 *
 * buildStream({
 *   url: 'magnet:?xt=urn:btih:c9e15763f722f23e98a29decdfae341b98d53056&dn=Duna.2024.1080p',
 *   format: { template: FORMATTER.AUTO, addon: 'Fonte', filename: 'Duna.2024.1080p' },
 *   size: '2.5 GB',
 * });
 * // quality '1080p' descoberta em format.filename; name e title gerados pelo template da variante
 *
 * buildStream({
 *   url: 'https://cdn.exemplo.com/video.m3u8',
 *   format: { template: FORMATTER.AUTO, addon: 'CineAgora' },
 * });
 * // quality 'Desconhecida' e cabeçalho do template com a qualidade desconhecida
 */
export function buildStream(fields) {
  if (!isPlainObject(fields)) {
    throw new Error(`stream deve ser objeto com os campos do stream (recebido: ${describe(fields)})`);
  }
  if (fields.name !== undefined || fields.title !== undefined) {
    throw new Error('stream.name e stream.title vêm do formatador quando há stream.format: não os informe');
  }
  checkKeys(fields, REQUIRED_FIELDS.concat(Object.keys(OPTIONAL_READERS), INPUT_FIELDS), 'stream');
  if (fields.format === undefined) throw new Error('stream.format é obrigatório');
  if (!isPlainObject(fields.format)) {
    throw new Error(`stream.format deve ser objeto (recebido: ${describe(fields.format)})`);
  }

  const url = readText(fields.url, 'stream.url');
  const isMagnet = MAGNET_PREFIX.test(url);
  const isTorrentFile = TORRENT_FILE_PREFIX.test(url);
  const quality = fields.quality === undefined
    ? discoverQuality(qualityTexts(fields, url))
    : fields.quality === UNKNOWN_QUALITY ? UNKNOWN_QUALITY : normalizeQuality(fields.quality);
  const languageHints = fields.languageHints === undefined
    ? []
    : readLanguageHints(fields.languageHints, 'stream.languageHints');
  const stream = {
    url: isMagnet || isTorrentFile ? url : readHttpUrl(url, 'stream.url'),
    // O formatador preenche name e title depois de validar o resto (ordem das chaves mantida).
    name: '',
    title: '',
    quality,
  };
  copyOptional(fields, stream, OPTIONAL_READERS, 'stream');
  stream.language = resolveStreamLanguage(fields, languageHints);
  if (isMagnet) applyMagnet(stream);
  if (isTorrentFile) applyTorrentFile(stream);
  const text = formatStream(stream, fields.format);
  stream.name = text.name;
  stream.title = text.title;
  return stream;
}

/**
 * Monta a URL de um arquivo dentro de um torrent, que o app reproduz pelo índice.
 *
 * Use quando um pedido de episódio é atendido por um pacote: o índice vem da lista de arquivos do
 * torrent (bloco torrent-files). Magnet sem índice faz o app tocar o maior arquivo do pacote.
 *
 * @param {string} infoHash - Hash hexadecimal de 40 caracteres (maiúsculas viram minúsculas).
 * @param {number} index - Posição do arquivo na lista do torrent, a partir de zero.
 * @returns {string} URL `torrent://<hash>/<índice>`.
 * @throws {Error} Se o hash não for hexadecimal de 40 caracteres ou se o índice não for inteiro ≥ 0.
 * @example
 * buildTorrentFileUrl('F32EB77F755F0D349271A74E930B1CC4BB37BB49', 12);
 * // 'torrent://f32eb77f755f0d349271a74e930b1cc4bb37bb49/12'
 */
export function buildTorrentFileUrl(infoHash, index) {
  const hash = readInfoHash(infoHash, 'infoHash');
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`índice do arquivo deve ser inteiro maior ou igual a zero (recebido: ${describe(index)})`);
  }
  return `torrent://${hash}/${index}`;
}

/**
 * Ordena streams da maior para a menor qualidade: "4K", depois "<n>p", "CAM" e "Desconhecida" por
 * último.
 *
 * Empates mantêm a ordem original. Não altera o array recebido.
 *
 * @param {Stream[]} streams - Streams com `quality` já normalizada (ex.: saída de `buildStream`).
 * @returns {Stream[]} Novo array ordenado.
 * @throws {Error} Se `streams` não for array, se algum item não for objeto ou se alguma qualidade
 *   estiver fora do formato normalizado.
 * @example
 * sortByQuality([{ quality: '720p' }, { quality: 'Desconhecida' }, { quality: 'CAM' }, { quality: '4K' }])
 *   .map((s) => s.quality);
 * // ['4K', '720p', 'CAM', 'Desconhecida']
 */
export function sortByQuality(streams) {
  if (!Array.isArray(streams)) {
    throw new Error(`streams deve ser array (recebido: ${describe(streams)})`);
  }
  // Ordenação decorada com o índice: estável em qualquer motor JavaScript.
  return streams
    .map((stream, index) => ({ stream, index, rank: qualityRank(stream, `streams[${index}]`) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map((entry) => entry.stream);
}

/**
 * Valida o magnet do stream e preenche `infoHash` com o hash do `xt`.
 * @param {Stream} stream - Stream em montagem, alterado no lugar.
 * @returns {void}
 * @throws {Error} Se houver `headers`, se o magnet estiver fora do formato ou se `infoHash` divergir.
 */
function applyMagnet(stream) {
  if (stream.headers !== undefined) {
    throw new Error('stream.headers não se aplica a magnet: não há requisição HTTP para recebê-los');
  }
  const match = stream.url.match(MAGNET_BTIH);
  if (!match) {
    throw new Error(`stream.url magnet sem o parâmetro "xt=urn:btih:<hash>" (recebido: "${stream.url}")`);
  }
  const hash = readInfoHash(match[1], 'hash do magnet em stream.url');
  if (stream.infoHash !== undefined && stream.infoHash !== hash) {
    throw new Error(`stream.infoHash "${stream.infoHash}" diverge do hash do magnet "${hash}"`);
  }
  stream.infoHash = hash;
}

/**
 * Valida a URL `torrent://<hash>/<índice>`, normaliza o hash e preenche `infoHash`.
 * @param {Stream} stream - Stream em montagem, alterado no lugar.
 * @returns {void}
 * @throws {Error} Se houver `headers`, se a URL estiver fora do formato ou se `infoHash` divergir.
 */
function applyTorrentFile(stream) {
  if (stream.headers !== undefined) {
    throw new Error('stream.headers não se aplica a torrent://: não há requisição HTTP para recebê-los');
  }
  const match = stream.url.match(TORRENT_FILE);
  if (!match || !/^\d+$/.test(match[2])) {
    throw new Error(`stream.url torrent fora do formato "torrent://<hash>/<índice>" (recebido: "${stream.url}")`);
  }
  const hash = readInfoHash(match[1], 'hash de stream.url torrent://');
  if (stream.infoHash !== undefined && stream.infoHash !== hash) {
    throw new Error(`stream.infoHash "${stream.infoHash}" diverge do hash de stream.url "${hash}"`);
  }
  stream.url = `torrent://${hash}/${Number(match[2])}`;
  stream.infoHash = hash;
}

/**
 * Posição de um stream na ordenação por qualidade.
 * @param {Stream} stream - Stream a classificar.
 * @param {string} label - Nome do item nas mensagens de erro.
 * @returns {number} Altura em pixels ("4K" vale 2160; "CAM" vale 0).
 * @throws {Error} Se o item não for objeto ou a qualidade estiver fora do formato normalizado.
 */
function qualityRank(stream, label) {
  if (!isPlainObject(stream)) throw new Error(`${label} deve ser objeto (recebido: ${describe(stream)})`);
  const { quality } = stream;
  if (quality === FOUR_K) return UHD_HEIGHT;
  if (quality === CAM) return CAM_RANK;
  if (quality === UNKNOWN_QUALITY) return UNKNOWN_RANK;
  const match = typeof quality === 'string' && quality.match(QUALITY_TOKEN);
  if (!match) {
    throw new Error(`${label}.quality fora do formato normalizado (recebido: ${describe(quality)}; esperado "<n>p", "4K", "CAM" ou "${UNKNOWN_QUALITY}")`);
  }
  return Number(match[1]);
}

/**
 * Textos já obtidos de onde a qualidade pode ser descoberta, em ordem de prioridade.
 * @param {object} fields - Campos do stream.
 * @param {string} url - URL já validada como texto.
 * @returns {(string|null|undefined)[]} Dicas, arquivo, pasta e URL.
 * @throws {Error} Se `qualityHints` não for lista de textos ou se `format.filename`/`format.folderName` forem inválidos.
 */
function qualityTexts(fields, url) {
  const hints = fields.qualityHints === undefined
    ? []
    : readQualityHints(fields.qualityHints, 'stream.qualityHints');
  const { format } = fields;
  const filename = format.filename === undefined ? undefined : readText(format.filename, 'stream.format.filename');
  const folderName = format.folderName === undefined ? undefined : readText(format.folderName, 'stream.format.folderName');
  return hints.concat(filename, folderName, url);
}

/**
 * Lê as dicas de qualidade: textos já obtidos, na ordem de prioridade.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {(string|null|undefined)[]} Cópia da lista.
 * @throws {Error} Se não for lista ou se algum item não for texto, `null` ou `undefined`.
 */
function readQualityHints(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser array (recebido: ${describe(value)})`);
  return value.map((item, index) => {
    if (item === null || item === undefined || typeof item === 'string') return item;
    throw new Error(`${label}[${index}] deve ser texto, null ou undefined (recebido: ${describe(item)})`);
  });
}

/**
 * Copia para `target` os campos de `readers` definidos em `source`, validados pelo leitor de cada um.
 * @param {object} source - Objeto de entrada.
 * @param {object} target - Objeto de saída, alterado no lugar.
 * @param {Object<string, Function>} readers - Leitor `(valor, rótulo) => valor final` por campo.
 * @param {string} label - Prefixo dos campos nas mensagens de erro.
 * @returns {object} O próprio `target`.
 */
function copyOptional(source, target, readers, label) {
  for (const key of Object.keys(readers)) {
    if (source[key] !== undefined) target[key] = readers[key](source[key], `${label}.${key}`);
  }
  return target;
}

/**
 * Garante que o objeto só tenha campos aceitos.
 * @param {object} object - Objeto a verificar.
 * @param {string[]} allowed - Campos aceitos.
 * @param {string} label - Nome do objeto nas mensagens de erro.
 * @returns {void}
 * @throws {Error} No primeiro campo desconhecido.
 */
function checkKeys(object, allowed, label) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw new Error(`${label}: campo desconhecido "${key}" (aceitos: ${allowed.join(', ')})`);
    }
  }
}

/**
 * Lê um texto obrigatório e não vazio.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string} Texto sem espaços nas pontas.
 * @throws {Error} Se o valor faltar, não for string ou for vazio.
 */
function readText(value, label) {
  if (value === undefined) throw new Error(`${label} é obrigatório`);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} deve ser texto não vazio (recebido: ${describe(value)})`);
  }
  return value.trim();
}

/**
 * Lê uma URL http(s).
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string} URL sem espaços nas pontas.
 * @throws {Error} Se não for URL válida com protocolo http ou https.
 */
function readHttpUrl(value, label) {
  const text = readText(value, label);
  let protocol;
  try {
    protocol = new URL(text).protocol;
  } catch (error) {
    throw new Error(`${label} não é URL válida: "${text}" (${error.message})`, { cause: error });
  }
  if (!HTTP_PROTOCOLS.includes(protocol)) {
    throw new Error(`${label} deve ser URL http(s) (recebido: "${text}")`);
  }
  return text;
}

const VALID_LANGUAGES = new Set(Object.values(LANGUAGE));

/**
 * Lê as pistas de idioma opcionais: lista de strings não vazias.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string[]} Cópia da lista validada.
 * @throws {Error} Se não for array ou algum item não for texto não vazio.
 */
function readLanguageHints(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser array (recebido: ${describe(value)})`);
  return value.map((item, index) => readText(item, `${label}[${index}]`));
}

/**
 * Resolve o idioma do stream: membro confiável diferente de UNKNOWN encerra a resolução;
 * ausência ou UNKNOWN aciona descoberta por nomes com languageHints opcional.
 * Texto fora do enum gera aviso [addon] e segue para descoberta.
 * @param {object} fields - Campos do stream.
 * @param {string[]} languageHints - Dicas validadas de idioma.
 * @returns {string} Membro do enum LANGUAGE.
 */
function resolveStreamLanguage(fields, languageHints) {
  if (fields.language !== undefined) {
    const raw = readText(fields.language, 'stream.language');
    if (VALID_LANGUAGES.has(raw)) {
      if (raw !== LANGUAGE.UNKNOWN) {
        return raw;
      }
    } else {
      console.warn(`[${fields.format.addon}] Idioma não reconhecido: "${raw}"; descartado, seguindo a descoberta local`);
    }
  }

  const { format } = fields;
  const filename = format.filename === undefined ? undefined : readText(format.filename, 'stream.format.filename');
  const folderName = format.folderName === undefined ? undefined : readText(format.folderName, 'stream.format.folderName');
  return discoverLanguage({
    texts: [filename, folderName, ...languageHints],
  });
}

/**
 * Lê um hash de torrent em hexadecimal de 40 caracteres.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string} Hash em minúsculas.
 * @throws {Error} Se o hash estiver em base32 ou em qualquer outro formato.
 */
function readInfoHash(value, label) {
  const text = readText(value, label);
  if (HEX_HASH.test(text)) return text.toLowerCase();
  if (BASE32_HASH.test(text)) {
    throw new Error(`${label} está em base32 ("${text}"): o provedor deve convertê-lo para hexadecimal de 40 caracteres; o app falha ao iniciar o P2P com base32`);
  }
  throw new Error(`${label} deve ser hexadecimal de 40 caracteres (recebido: "${text}")`);
}

/**
 * Lê um objeto de cabeçalhos HTTP com valores em texto.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {Object<string, string>} Cópia dos cabeçalhos.
 * @throws {Error} Se não for objeto ou algum valor não for texto não vazio.
 */
function readHeaders(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} deve ser objeto (recebido: ${describe(value)})`);
  const headers = {};
  for (const name of Object.keys(value)) headers[name] = readText(value[name], `${label}.${name}`);
  return headers;
}

/**
 * Lê a lista de legendas.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {Subtitle[]} Cópia validada.
 * @throws {Error} Se não for array ou algum item for inválido (a mensagem traz o índice).
 */
function readSubtitles(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser array (recebido: ${describe(value)})`);
  return value.map((item, index) => readSubtitle(item, `${label}[${index}]`));
}

/**
 * Lê uma legenda.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do item nas mensagens de erro, com o índice.
 * @returns {Subtitle}
 * @throws {Error} Se não for objeto, se faltar `url` http(s) ou `language`, ou se houver campo desconhecido.
 */
function readSubtitle(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} deve ser objeto (recebido: ${describe(value)})`);
  checkKeys(value, SUBTITLE_REQUIRED_FIELDS.concat(Object.keys(SUBTITLE_OPTIONAL_READERS)), label);
  const subtitle = {
    url: readHttpUrl(value.url, `${label}.url`),
    language: readText(value.language, `${label}.language`),
  };
  return copyOptional(value, subtitle, SUBTITLE_OPTIONAL_READERS, label);
}

/**
 * Lê as dicas de reprodução.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {BehaviorHints} Cópia validada.
 * @throws {Error} Se não for objeto, se tiver campo desconhecido ou valor inválido.
 */
function readBehaviorHints(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} deve ser objeto (recebido: ${describe(value)})`);
  checkKeys(value, Object.keys(BEHAVIOR_HINT_READERS), label);
  return copyOptional(value, {}, BEHAVIOR_HINT_READERS, label);
}

/**
 * Lê uma contagem inteira maior ou igual a zero.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {number}
 * @throws {Error} Se não for inteiro maior ou igual a zero.
 */
function readCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} deve ser inteiro maior ou igual a zero (recebido: ${describe(value)})`);
  }
  return value;
}

/**
 * Lê um número finito.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {number}
 * @throws {Error} Se não for número finito.
 */
function readFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} deve ser número (recebido: ${describe(value)})`);
  }
  return value;
}

/**
 * Indica se o valor é um objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Representação curta de um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
