/**
 * Bloco custom-formatter: gera o `name` e o `title` do stream a partir de um template.
 *
 * O provedor informa os dados que tem; o template decide a apresentação. Os templates seguem o
 * layout dos exemplos da change `add-custom-formatter-block`. Os nomes de campo tomam como
 * referência o custom formatter do AIOStreams
 * (https://docs.aiostreams.viren070.me/reference/custom-formatter/); nenhum código nem template
 * foi copiado de lá, porque o AIOStreams é AGPL-3.0 e este repositório é GPL-3.0-only.
 *
 * Com `FORMATTER.AUTO`, a variante de build (`<formato>/providers/<id>.js`) fixa o template pela
 * constante `NUVIO_FORMATTER`, trocada pelo esbuild (`define`). No arquivo base, sem a constante, um
 * template é sorteado na primeira formatação e vale até o provedor ser carregado de novo.
 *
 * O tipo de entrega (`🧲 P2P` ou `🌐 HTTP`) sai da `url` do stream, sem campo informado pelo provedor.
 * Em P2P, seeders e peers são exibidos como `<seeders>/<peers>`, com `👥` no Google Drive e `🌱` no Prism,
 * e `?` para qualquer contagem ausente. Streams HTTP omitem essa parte.
 *
 * Depende do bloco quality-discovery (`UNKNOWN_QUALITY`) e do bloco language-discovery (`LANGUAGE`, `LANGUAGE_MODES`),
 * e recebe o stream já validado por `buildStream` (bloco stream-build).
 */

import { UNKNOWN_QUALITY } from '../quality-discovery/index.mjs';
import { LANGUAGE_MODES } from '../language-discovery/index.mjs';

/** Templates disponíveis. `AUTO` delega a escolha ao build (variante) ou ao sorteio (arquivo base). */
export const FORMATTER = Object.freeze({ AUTO: 'auto', GDRIVE: 'gdrive', PRISM: 'prism' });

const CONCRETE_TEMPLATES = Object.values(FORMATTER).filter((value) => value !== FORMATTER.AUTO);

/**
 * Tabela de limites de caracteres (code points) por parte de texto, excluindo emojis.
 * @readonly
 */
export const LIMITS = Object.freeze({
  FILE: 40,
  FOLDER: 40,
  TITLE: 40,
  MESSAGE: 60,
  CATALOG: 24,
  PROVIDER: 24,
  GROUP: 24,
  RELEASE_GROUP: 24,
  SOURCE: 24,
  ENCODE: 24,
  AGE: 24,
  ITEM: 24,
});

// Tipo de entrega pelo esquema da `url` (o buildStream aceita só estes).
const P2P_URL = /^(?:magnet:|torrent:\/\/)/i;
const HTTP_URL = /^https?:\/\//i;

const QUALITY_HEIGHT = /^(\d{3,4})p$/;
const UHD_HEIGHT = 2160;

// Selo do Prism por altura mínima, da maior para a menor.
const PRISM_BADGES = [
  [UHD_HEIGHT, '🔥4K UHD'],
  [1440, '✨ QHD'],
  [1080, '🚀 FHD'],
  [720, '💿 HD'],
  [0, '💩 Baixa qualidade'],
];

// Leitores dos detalhes de `format` (18 leitores; com template são 19 campos aceitos). Cada um valida e devolve o valor final.
const FORMAT_READERS = {
  addon: readText,
  title: readText,
  year: readCount,
  season: readCount,
  episode: readCount,
  filename: readText,
  folderName: readText,
  folderSize: readText,
  source: readText,
  encode: readText,
  visualTags: readTextList,
  audioTags: readTextList,
  audioChannels: readTextList,
  releaseGroup: readText,
  bitrate: readPositiveNumber,
  duration: readCount,
  age: readText,
  message: readText,
};

const TEMPLATES = {
  [FORMATTER.GDRIVE]: { header: gdriveHeader, lines: gdriveLines },
  [FORMATTER.PRISM]: { header: prismHeader, lines: prismLines },
};

let drawnTemplate = null;
let randomSource = Math.random;

/**
 * @typedef {object} FormatDetails
 *
 * Descreve só os dados da release: a qualidade e o idioma vêm do stream, e não são informados aqui.
 *
 * @property {string} template - Valor de `FORMATTER`; os provedores usam `FORMATTER.AUTO`.
 * @property {string} addon - Nome do provedor exibido, ex.: "Baixa Rápido".
 * @property {string} [title] - Título da mídia (TMDB ou release).
 * @property {number} [year] - Ano da mídia.
 * @property {number} [season] - Temporada pedida.
 * @property {number} [episode] - Episódio pedido.
 * @property {string} [filename] - Nome do arquivo ou da release.
 * @property {string} [folderName] - Pasta ou release do pacote que contém o arquivo.
 * @property {string} [folderSize] - Tamanho do pacote em texto, ex.: "125 GB".
 * @property {string} [source] - Origem do vídeo, ex.: "BluRay", "WEB-DL".
 * @property {string} [encode] - Codec, ex.: "HEVC".
 * @property {string[]} [visualTags] - Tags de vídeo, ex.: ["DV", "HDR10"].
 * @property {string[]} [audioTags] - Tags de áudio, ex.: ["Atmos", "TrueHD"].
 * @property {string[]} [audioChannels] - Canais de áudio, ex.: ["7.1"].
 * @property {string} [releaseGroup] - Grupo da release.
 * @property {number} [bitrate] - Bitrate em bits por segundo.
 * @property {number} [duration] - Duração em segundos.
 * @property {string} [age] - Idade da release em texto, ex.: "10d".
 * @property {string} [message] - Mensagem extra.
 */

/**
 * Gera o `name` e o `title` de um stream conforme o template.
 *
 * Do stream, lê `url` (obrigatória; dela sai o tipo de entrega, "P2P" para `magnet:` e `torrent://` e "HTTP"
 * para http(s)), `quality` (obrigatório, já normalizada: "<n>p", "4K", "CAM" ou "Desconhecida"),
 * `language` (obrigatório, pertencente a `LANGUAGE_MODES`), `size`, `seeders`, `peers` e
 * `provider` (catálogo ou servidor de origem).
 * Cada informação ausente some com o seu emoji e separador; linha sem nenhuma informação some
 * inteira. O `name` traz o cabeçalho do template e, nas linhas seguintes, os detalhes que o app
 * não mostra sozinho (sem o tamanho do arquivo e o nome do provedor, que o app já mostra). O `title`
 * traz todas as linhas. `buildStream` (bloco stream-build) chama esta função quando recebe `format`.
 *
 * @param {object} stream - Stream validado por `buildStream`.
 * @param {FormatDetails} format - Template e detalhes informados pelo provedor.
 * @returns {{ name: string, title: string }} Textos gerados, com uma linha por grupo de dados.
 * @throws {Error} Se o template for desconhecido, se faltar `addon`, `stream.url`, `stream.quality` ou `stream.language`,
 *   se `stream.language` não for um dos seis valores aceitos, se `stream.url` não for http(s), magnet nem torrent://,
 *   se houver campo desconhecido ou valor inválido em `format`, ou se a qualidade não for "<n>p", "4K", "CAM" nem "Desconhecida".
 * @example
 * formatStream(
 *   { url: 'magnet:?xt=urn:btih:c9e15763f722f23e98a29decdfae341b98d53056', quality: '1080p', size: '2.5 GB', language: 'Dublado', provider: 'limpotorrents' },
 *   { template: FORMATTER.GDRIVE, addon: 'Baixa Rápido', filename: 'Matrix.1999.1080p' },
 * );
 * // { name: 'Baixa Rápido 1080p\n🗣️ Dublado\n🧲 P2P 👥 ?/? 🔍 limpotorrents\n📁 Matrix.1999.1080p',
 * //   title: '🗣️ Dublado\n🧲 P2P 📦 2.5 GB 👥 ?/? 🔍 limpotorrents\n📁 Matrix.1999.1080p' }
 */
export function formatStream(stream, format) {
  if (!isPlainObject(stream)) throw new Error(`stream deve ser objeto (recebido: ${describe(stream)})`);
  if (!isPlainObject(format)) throw new Error(`stream.format deve ser objeto (recebido: ${describe(format)})`);
  const allowed = ['template'].concat(Object.keys(FORMAT_READERS));
  for (const key of Object.keys(format)) {
    if (!allowed.includes(key)) {
      throw new Error(`stream.format: campo desconhecido "${key}" (aceitos: ${allowed.join(', ')})`);
    }
  }
  const template = resolveTemplate(format.template);
  if (format.addon === undefined) throw new Error('stream.format.addon é obrigatório (nome do provedor exibido)');
  return render(TEMPLATES[template], readData(stream, format));
}

/**
 * Zera o template sorteado por `FORMATTER.AUTO` e troca a fonte aleatória. Apenas para testes.
 *
 * @param {Function} [source] - Função sem argumentos que devolve um número em [0, 1), como `Math.random`.
 * @returns {void}
 * @throws {Error} Se `source` não for função.
 * @example
 * resetAutoTemplate(() => 0.9); // o próximo sorteio escolhe o último template
 */
export function resetAutoTemplate(source = Math.random) {
  if (typeof source !== 'function') throw new Error(`source deve ser função (recebido: ${describe(source)})`);
  drawnTemplate = null;
  randomSource = source;
}

/**
 * Corta um texto no fim, garantindo que o total de code points com a elipse seja no máximo `max`.
 * @param {string|undefined} text - Texto a cortar.
 * @param {number} max - Limite de caracteres.
 * @returns {string|undefined}
 * @example
 * clipEnd('www-fontedecanais-bz.76iqsc65sxxn71.com', 24);
 * // 'www-fontedecanais-bz.76…'
 */
export function clipEnd(text, max) {
  if (text === undefined || text === null || text === '') return text;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join('')}…`;
}

/**
 * Corta um texto no meio, preservando ceil((max - 1) / 2) caracteres no início e o restante no fim.
 * @param {string|undefined} text - Texto a cortar.
 * @param {number} max - Limite de caracteres.
 * @returns {string|undefined}
 * @example
 * clipMiddle('The.Rookie.S04E01.1080p.WEBRip.x265-RARBG.mp4', 40);
 * // 'The.Rookie.S04E01.10…BRip.x265-RARBG.mp4'
 */
export function clipMiddle(text, max) {
  if (text === undefined || text === null || text === '') return text;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const headLength = Math.ceil((max - 1) / 2);
  const tailLength = max - 1 - headLength;
  const head = chars.slice(0, headLength).join('');
  const tail = tailLength > 0 ? chars.slice(-tailLength).join('') : '';
  return `${head}…${tail}`;
}

/**
 * Template concreto a aplicar.
 * @param {*} template - Valor recebido em `format.template`.
 * @returns {string} Valor concreto de `FORMATTER`.
 * @throws {Error} Se o valor (ou a constante de build) não for um template conhecido.
 */
function resolveTemplate(template) {
  checkTemplate(template, 'stream.format.template', Object.values(FORMATTER));
  if (template !== FORMATTER.AUTO) return template;
  // Constante de build (define do esbuild): presente só nas variantes; no arquivo base o typeof dá "undefined".
  if (typeof NUVIO_FORMATTER === 'string') {
    return checkTemplate(NUVIO_FORMATTER, 'NUVIO_FORMATTER (constante de build)', CONCRETE_TEMPLATES);
  }
  if (drawnTemplate === null) {
    const index = Math.floor(randomSource() * CONCRETE_TEMPLATES.length);
    drawnTemplate = CONCRETE_TEMPLATES[Math.min(Math.max(index, 0), CONCRETE_TEMPLATES.length - 1)];
  }
  return drawnTemplate;
}

/**
 * Confere se o template está entre os aceitos.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do valor nas mensagens de erro.
 * @param {string[]} accepted - Valores aceitos.
 * @returns {string} O próprio valor.
 * @throws {Error} Se o valor não estiver entre os aceitos.
 */
function checkTemplate(value, label, accepted) {
  if (!accepted.includes(value)) {
    throw new Error(`${label} desconhecido: ${describe(value)} (aceitos: ${accepted.join(', ')})`);
  }
  return value;
}

/**
 * Junta os campos do stream e os detalhes validados num só objeto de dados.
 * @param {object} stream - Stream validado.
 * @param {object} format - Detalhes do provedor.
 * @returns {object} Dados prontos para os templates; campos ausentes ficam `undefined`.
 * @throws {Error} Se algum campo for inválido.
 */
function readData(stream, format) {
  const data = {};
  for (const key of Object.keys(FORMAT_READERS)) {
    if (format[key] !== undefined) data[key] = FORMAT_READERS[key](format[key], `stream.format.${key}`);
  }
  data.delivery = readDelivery(stream.url);
  data.quality = readText(stream.quality, 'stream.quality');

  if (stream.language === undefined || !LANGUAGE_MODES.includes(stream.language)) {
    throw new Error(`stream.language inválido: ${describe(stream.language)} (aceitos: ${LANGUAGE_MODES.join(', ')})`);
  }
  data.language = stream.language;

  for (const key of ['size', 'provider']) {
    if (stream[key] !== undefined) data[key] = readText(stream[key], `stream.${key}`);
  }
  if (stream.seeders !== undefined) data.seeders = readCount(stream.seeders, 'stream.seeders');
  if (stream.peers !== undefined) data.peers = readCount(stream.peers, 'stream.peers');
  return data;
}

/**
 * Monta o `name` e o `title` de um template.
 *
 * Os apps só exibem o `name` do plugin e uma linha própria com qualidade, tamanho e idioma; o `title`
 * não aparece na lista (NuvioMobile 0.6.9-beta e NuvioTV 1.1.0-beta.12). Por isso o `name` leva o
 * cabeçalho e, nas linhas seguintes, os detalhes sem o que o app já mostra: tamanho do arquivo
 * e nome do provedor (o tamanho do pacote, sem o do arquivo, sai como "📦 pacote <tamanho>").
 * O idioma permanece em `name` e `title`. O `title` traz todas as linhas.
 *
 * @param {{ header: Function, lines: Function }} template - Cabeçalho e linhas do template.
 * @param {object} data - Dados de `readData`.
 * @returns {{ name: string, title: string }}
 */
function render(template, data) {
  const header = template.header(data);
  const details = joinLines(template.lines({ ...data, size: undefined, forName: true }));
  return {
    name: details ? `${header}\n${details}` : header,
    title: joinLines(template.lines(data)),
  };
}

/**
 * Cabeçalho do Google Drive: "<provedor> <qualidade>".
 * @param {object} data - Dados de `readData`.
 * @returns {string}
 */
function gdriveHeader(data) {
  return `${data.addon} ${data.quality}`;
}

/**
 * Linhas do Google Drive.
 * @param {object} data - Dados de `readData`.
 * @returns {Array<Array<string|null>>}
 */
function gdriveLines(data) {
  return [
    [
      part('🎥', clipEnd(data.source, LIMITS.SOURCE)),
      part('🎞️', clipEnd(data.encode, LIMITS.ENCODE)),
      part('📺', list(data.visualTags, ' | ')),
      part('🏷️', clipEnd(data.releaseGroup, LIMITS.GROUP)),
    ],
    [
      part('🎧', list(data.audioTags, ' | ')),
      part('🔊', list(data.audioChannels, ' | ')),
    ],
    [audioPart(data)],
    [
      deliveryPart(data),
      sizePart(data),
      data.bitrate === undefined ? null : `(${formatBitrate(data.bitrate)})`,
      part('⏱️', formatDuration(data.duration)),
      swarmPart(data, '👥'),
      part('📅', clipEnd(data.age, LIMITS.AGE)),
      part('🔍', clipEnd(data.provider, LIMITS.CATALOG)),
    ],
    [filePart(data)],
    [part('ℹ️', clipEnd(data.message, LIMITS.MESSAGE))],
  ];
}

/**
 * Linhas do Prism.
 * @param {object} data - Dados de `readData`.
 * @returns {Array<Array<string|null>>}
 */
function prismLines(data) {
  return [
    data.title === undefined ? [] : [
      `🎬 ${clipEnd(data.title, LIMITS.TITLE)}`,
      data.year === undefined ? null : `(${data.year})`,
      episodeTag(data),
    ],
    [
      part('🎥', clipEnd(data.source, LIMITS.SOURCE)),
      part('📺', list(data.visualTags, ' | ')),
      part('🎞️', clipEnd(data.encode, LIMITS.ENCODE)),
      part('⏱️', formatDuration(data.duration)),
    ],
    [
      part('🎧', list(data.audioTags, ' | ')),
      part('🔊', list(data.audioChannels, ' | ')),
    ],
    [audioPart(data)],
    [
      deliveryPart(data),
      sizePart(data),
      part('📊', data.bitrate === undefined ? undefined : formatBitrate(data.bitrate)),
      swarmPart(data, '🌱'),
    ],
    [
      part('🏷️', clipEnd(data.releaseGroup, LIMITS.GROUP)),
      part('📡', clipEnd(data.provider, LIMITS.CATALOG)),
    ],
    // No name, o provedor fica de fora: os dois apps já mostram o nome do provedor.
    [data.forName ? null : `🔍${data.addon}`],
    [part('ℹ️', clipEnd(data.message, LIMITS.MESSAGE))],
  ];
}

/**
 * Linha linguística padronizada: exatamente `🗣️ <valor do enum>`.
 * @param {object} data - Dados de `readData`.
 * @returns {string}
 */
function audioPart(data) {
  return `🗣️ ${data.language}`;
}

/**
 * Parte de seeders e peers: `<seeders>/<peers>`, com emoji no P2P e omissão em HTTP.
 * @param {object} data - Dados de `readData`.
 * @param {string} emoji - Emoji do template (`👥` no Google Drive e `🌱` no Prism).
 * @returns {string|null}
 */
function swarmPart(data, emoji) {
  if (data.delivery !== 'P2P') return null;
  const seeders = data.seeders !== undefined ? data.seeders : '?';
  const peers = data.peers !== undefined ? data.peers : '?';
  return `${emoji} ${seeders}/${peers}`;
}

/**
 * Parte de arquivo e pasta: no `name`, somente o arquivo; no `title`, pasta e arquivo cortados individualmente.
 * @param {object} data - Dados de `readData`.
 * @returns {string|null}
 */
function filePart(data) {
  if (data.filename === undefined) return null;
  const file = clipMiddle(data.filename, LIMITS.FILE);
  if (data.forName || data.folderName === undefined) {
    return `📁 ${file}`;
  }
  const folder = clipMiddle(data.folderName, LIMITS.FOLDER);
  return `📁 ${folder}/${file}`;
}

/**
 * Cabeçalho do Prism: o selo da qualidade, seguido da qualidade quando o selo não a contém, ou
 * "❓ Desconhecida" quando a fonte não informou. O NuvioTV acrescenta " - <qualidade>" ao fim do
 * `name` que não a contém, o que, num `name` de várias linhas, cairia na última linha.
 * @param {object} data - Dados de `readData`.
 * @returns {string}
 * @throws {Error} Se a qualidade não for "4K", "CAM", "<n>p" nem "Desconhecida".
 */
function prismHeader(data) {
  const { quality } = data;
  if (quality === UNKNOWN_QUALITY) return `❓ ${UNKNOWN_QUALITY}`;
  if (quality === 'CAM') return '💩 CAM';
  const match = quality === '4K' ? [null, String(UHD_HEIGHT)] : quality.match(QUALITY_HEIGHT);
  if (!match) {
    throw new Error(`stream.quality fora do formato normalizado (recebido: "${quality}"; esperado "<n>p", "4K", "CAM" ou "${UNKNOWN_QUALITY}")`);
  }
  const badge = PRISM_BADGES.find(([minimum]) => Number(match[1]) >= minimum)[1];
  return badge.includes(quality) ? badge : `${badge} ${quality}`;
}

/**
 * Parte do tipo de entrega: "🧲 P2P" ou "🌐 HTTP".
 * @param {object} data - Dados de `readData`.
 * @returns {string}
 */
function deliveryPart(data) {
  return data.delivery === 'P2P' ? '🧲 P2P' : '🌐 HTTP';
}

/**
 * Parte "📦 <tamanho>[ / <pacote>]"; sem o tamanho do arquivo, o pacote só aparece no `name`, como
 * "📦 pacote <tamanho>".
 * @param {object} data - Dados de `readData`.
 * @returns {string|null}
 */
function sizePart(data) {
  if (data.size === undefined) {
    return data.forName && data.folderSize !== undefined ? `📦 pacote ${data.folderSize}` : null;
  }
  return data.folderSize === undefined ? `📦 ${data.size}` : `📦 ${data.size} / ${data.folderSize}`;
}

/**
 * Temporada e episódio como "T<tt>E<ee>" (ou "T<tt>" sem episódio).
 * @param {object} data - Dados de `readData`.
 * @returns {string|null}
 */
function episodeTag(data) {
  if (data.season === undefined) return null;
  const season = `T${pad2(data.season)}`;
  return data.episode === undefined ? season : `${season}E${pad2(data.episode)}`;
}

/**
 * Bitrate em "Mbps" (uma casa) a partir de 1.000.000, senão em "Kbps" inteiro.
 * @param {number} bitsPerSecond - Bitrate em bits por segundo.
 * @returns {string}
 */
function formatBitrate(bitsPerSecond) {
  if (bitsPerSecond >= 1e6) return `${(bitsPerSecond / 1e6).toFixed(1)} Mbps`;
  return `${Math.round(bitsPerSecond / 1e3)} Kbps`;
}

/**
 * Duração como "<h>h:<m>m:<s>s", sem as horas quando zero; zero ou ausente não é exibido.
 * @param {number|undefined} seconds - Duração em segundos.
 * @returns {string|undefined}
 */
function formatDuration(seconds) {
  if (!seconds) return undefined;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}h:${minutes}m:${rest}s` : `${minutes}m:${rest}s`;
}

/**
 * Número com dois dígitos.
 * @param {number} value - Inteiro maior ou igual a zero.
 * @returns {string}
 */
function pad2(value) {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Parte "<emoji> <valor>", ou null sem valor.
 * @param {string} emoji - Emoji da parte.
 * @param {*} value - Valor; ausente ou texto vazio omite a parte.
 * @returns {string|null}
 */
function part(emoji, value) {
  return value === undefined || value === null || value === '' ? null : `${emoji} ${value}`;
}

/**
 * Lista unida pelo separador, ou undefined sem itens. Trunca em até 3 itens e limita cada item pelo limite.
 * @param {string[]|undefined} items - Itens.
 * @param {string} separator - Separador.
 * @returns {string|undefined}
 */
function list(items, separator) {
  if (!items || items.length === 0) return undefined;
  const maxItems = 3;
  const clipped = items.slice(0, maxItems).map((item) => clipEnd(item, LIMITS.ITEM));
  const base = clipped.join(separator);
  if (items.length > maxItems) {
    return `${base} +${items.length - maxItems}`;
  }
  return base;
}

/**
 * Junta as linhas, cada uma com as partes presentes separadas por espaço; linha vazia some.
 * @param {Array<Array<string|null>>} lines - Partes de cada linha.
 * @returns {string} Linhas unidas por "\n"; vazio sem nenhuma linha.
 */
function joinLines(lines) {
  return lines
    .map((parts) => parts.filter(Boolean).join(' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Lê um texto não vazio.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string} Texto sem espaços nas pontas.
 * @throws {Error} Se não for texto não vazio.
 */
function readText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} deve ser texto não vazio (recebido: ${describe(value)})`);
  }
  return value.trim();
}

/**
 * Deriva o tipo de entrega da `url` do stream.
 * @param {*} url - `stream.url` já validada por `buildStream`.
 * @returns {string} "P2P" para `magnet:` e `torrent://`; "HTTP" para http(s).
 * @throws {Error} Se `url` não for texto não vazio ou tiver outro esquema.
 */
function readDelivery(url) {
  if (url === undefined) throw new Error('stream.url é obrigatório (dela sai o tipo de entrega P2P ou HTTP)');
  const text = readText(url, 'stream.url');
  if (P2P_URL.test(text)) return 'P2P';
  if (HTTP_URL.test(text)) return 'HTTP';
  throw new Error(`stream.url deve ser http(s), magnet ou torrent:// (recebido: ${describe(text)})`);
}

/**
 * Lê uma lista de textos não vazios.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string[]}
 * @throws {Error} Se não for lista ou algum item não for texto não vazio.
 */
function readTextList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser lista de textos (recebido: ${describe(value)})`);
  return value.map((item, index) => readText(item, `${label}[${index}]`));
}

/**
 * Lê um inteiro maior ou igual a zero.
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
 * Lê um número finito maior que zero.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {number}
 * @throws {Error} Se não for número finito maior que zero.
 */
function readPositiveNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} deve ser número maior que zero (recebido: ${describe(value)})`);
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
  if (typeof value === 'string') return `"${value}"`;
  return Array.isArray(value) ? `[${value.map(describe).join(', ')}]` : String(value);
}
