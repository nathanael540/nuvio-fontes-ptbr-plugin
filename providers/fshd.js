/** fshd - gerado a partir de src/fshd/ — não edite manualmente. */
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/_blocks/slugify/index.mjs
var COMBINING_MARKS = /[\u0300-\u036f]/g;
var NON_ALPHANUMERIC = /[^a-z0-9]+/g;
function normalizeText(text) {
  if (typeof text !== "string") {
    throw new Error(`normalizeText espera uma string, recebeu ${typeof text}`);
  }
  return text.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").replace(/&/g, " e ").replace(NON_ALPHANUMERIC, " ").trim();
}

// src/_blocks/quality-discovery/index.mjs
var UNKNOWN_QUALITY = "Desconhecida";
var UHD_HEIGHT = 2160;
var FOUR_K = "4K";
var FULL_HD = "1080p";
var CAM = "CAM";
var QUALITY_TOKEN = /^(\d{3,4})p$/;
var KNOWN_HEIGHTS = ["144", "240", "360", "480", "540", "576", "720", "1080", "1440", "2160", "4320"];
var FULL_HD_SEQUENCE = /\bfull hd\b/g;
var QUALITY_LABEL_RULES = [
  [["4k", "uhd"], FOUR_K],
  [["fhd", "fullhd"], FULL_HD],
  [["cam", "ts", "hdcam", "hdts", "telesync"], CAM],
  [["hd"], "720p"],
  [["sd"], "480p"]
];
var CAM_WORDS = /(?:^| )(?:cam|camrip|hdcam|hdts|ts|telesync)(?: |$)/;
var QUALITY_SEARCH = /(?:(?:\b|(?:mp4|mkv))(?:144|240|360|480|540|576|720|1080|1440|2160|4320)p|\b\d{3,4}p|\b(?:full\s*hd|hdcam|telesync|camrip|hdts|uhd|4k|fhd|cam|hd|sd))\b/gi;
function normalizeQuality(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 9999) {
    return heightToQuality(value);
  }
  if (typeof value === "string") {
    const quality = qualityFromWords(words(normalizeText(value).replace(FULL_HD_SEQUENCE, "fullhd")));
    if (quality) return quality;
  }
  throw new Error(`Qualidade n\xE3o reconhecida: ${describe(value)} (esperado 3\u20134 d\xEDgitos, ex.: "1080p", ou 4K, UHD, FHD, HD, SD, CAM)`);
}
function discoverQuality(texts) {
  if (!Array.isArray(texts)) {
    throw new Error(`texts deve ser lista (recebido: ${describe(texts)})`);
  }
  for (const text of texts) {
    if (text !== null && text !== void 0 && typeof text !== "string") {
      throw new Error(`texts deve conter texto, null ou undefined (recebido: ${describe(text)})`);
    }
  }
  for (const text of texts) {
    if (text === null || text === void 0) continue;
    const quality = qualityFromText(text);
    if (quality) return quality;
  }
  return UNKNOWN_QUALITY;
}
function qualityFromText(text) {
  if (text.trim() === "") return null;
  if (CAM_WORDS.test(normalizeText(text))) return CAM;
  const token = lastQualityToken(text);
  if (token) return normalizeQuality(token);
  try {
    return normalizeQuality(text);
  } catch (e) {
    return null;
  }
}
function lastQualityToken(text) {
  const matches = [...text.matchAll(new RegExp(QUALITY_SEARCH.source, "gi"))];
  if (!matches.length) return null;
  const raw = matches[matches.length - 1][0].replace(/^(?:mp4|mkv)/i, "");
  const glued = /(\d{3,4}p)$/i.exec(raw);
  return glued ? glued[1] : raw;
}
function heightToQuality(height) {
  return height === UHD_HEIGHT ? FOUR_K : `${height}p`;
}
function qualityFromWords(tokens) {
  const withP = tokens.map((token) => token.match(QUALITY_TOKEN)).find(Boolean);
  if (withP) return heightToQuality(Number(withP[1]));
  const height = tokens.find((token) => KNOWN_HEIGHTS.includes(token));
  if (height) return heightToQuality(Number(height));
  return firstRuleMatch(tokens, QUALITY_LABEL_RULES);
}
function firstRuleMatch(tokens, rules) {
  const rule = rules.find(([labels]) => labels.some((label) => tokens.includes(label)));
  return rule ? rule[1] : null;
}
function words(normalized) {
  return normalized === "" ? [] : normalized.split(" ");
}
function describe(value) {
  return typeof value === "string" ? `"${value}"` : String(value);
}

// src/_blocks/language-discovery/index.mjs
var LANGUAGE = Object.freeze({
  DUBBED: "Dublado",
  DUBBED_NON_PT_BR: "Dublado (N\xE3o PT-BR?)",
  SUBTITLED: "Legendado",
  SUBTITLED_NON_PT_BR: "Legendado (N\xE3o PT-BR?)",
  NON_PT_BR: "N\xE3o PT-BR",
  UNKNOWN: "Idioma Desconhecido"
});
var LANGUAGE_MODES = Object.freeze(Object.values(LANGUAGE));
var UNKNOWN_LANGUAGE = LANGUAGE.UNKNOWN;
var EXACT_MAPPINGS = [
  ["dublado", LANGUAGE.DUBBED],
  ["dublado nao pt br", LANGUAGE.DUBBED_NON_PT_BR],
  ["portugues dialeto desconhecido", LANGUAGE.DUBBED_NON_PT_BR],
  ["legendado", LANGUAGE.SUBTITLED],
  ["legendado nao pt br", LANGUAGE.SUBTITLED_NON_PT_BR],
  ["legendado dialeto desconhecido", LANGUAGE.SUBTITLED_NON_PT_BR],
  ["nao pt br", LANGUAGE.NON_PT_BR],
  ["idioma desconhecido", LANGUAGE.UNKNOWN]
];
var KNOWN_FOREIGN_REGEX = /\b(?:ingles|english|espanhol|spanish|japones|japanese|frances|french|alemao|german|italiano|italian|coreano|korean|russo|russian|mandarim|chines|chinese)\b/;
var BRAZIL_REGION_REGEX = /\b(?:ptbr|pt br|pob|brazil|brasil|brazilian|brasileiro|brasileira|br)\b/;
var NON_BR_REGION_REGEX = /\b(?:ptpt|pt pt|portugal|european|europeu|europeia)\b/;
var EXPLICIT_PT_REGEX = /\b(?:portugues|portuguese|por)\b/;
function inspectText(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const normalized = normalizeText(trimmed);
  if (normalized === "") return null;
  const exact = EXACT_MAPPINGS.find(([label]) => normalized === label);
  if (exact) {
    if (exact[1] === LANGUAGE.DUBBED) return { audio: "pt_br" };
    if (exact[1] === LANGUAGE.DUBBED_NON_PT_BR) return { audio: "non_pt_br" };
    if (exact[1] === LANGUAGE.SUBTITLED) return { sub: "pt_br" };
    if (exact[1] === LANGUAGE.SUBTITLED_NON_PT_BR) return { sub: "non_pt_br" };
    if (exact[1] === LANGUAGE.NON_PT_BR) return { foreign: true };
    if (exact[1] === LANGUAGE.UNKNOWN) return { unknown: true };
  }
  const cleaned = normalized.replace(/\b(?:brrip|bdrip|br rip|bd rip)\b/g, " ").replace(/\bdublada\b/g, "dublado").replace(/\blegendada\b/g, "legendado").trim();
  const hasExplicitPt = EXPLICIT_PT_REGEX.test(cleaned);
  const hasBr = BRAZIL_REGION_REGEX.test(cleaned);
  const hasNonBr = NON_BR_REGION_REGEX.test(cleaned);
  const hasForeign = KNOWN_FOREIGN_REGEX.test(cleaned);
  const hasAudio = /\b(?:dub|dublado|dubbed|nacional)\b/.test(cleaned) || /\baudio\b/.test(cleaned) && (hasBr || hasNonBr || hasExplicitPt);
  const hasSub = /\b(?:leg|legendado|legenda|legendas|sub|subbed|subtitled|softsub)\b/.test(cleaned);
  const result = {};
  if (hasAudio) {
    if (hasNonBr) {
      result.audio = "non_pt_br";
    } else if (hasExplicitPt && !hasBr) {
      result.audio = "non_pt_br";
    } else {
      result.audio = "pt_br";
    }
  }
  if (hasSub) {
    if (hasNonBr) {
      result.sub = "non_pt_br";
    } else if (hasExplicitPt && !hasBr) {
      result.sub = "non_pt_br";
    } else {
      result.sub = "pt_br";
    }
  }
  if (!hasAudio && !hasSub) {
    if (hasExplicitPt) {
      if (hasNonBr) {
        result.audio = "non_pt_br";
      } else if (hasBr) {
        result.audio = "pt_br";
      } else {
        result.audio = "non_pt_br";
      }
    } else if (hasForeign) {
      result.foreign = true;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
function discoverLanguage({ codes, texts = [] } = {}) {
  if (codes !== void 0 && !Array.isArray(codes)) {
    throw new Error("codes deve ser lista");
  }
  if (!Array.isArray(texts)) {
    throw new Error("texts deve ser lista");
  }
  const audioObservations = [];
  const subObservations = [];
  let hasForeign = false;
  for (const text of texts) {
    if (typeof text !== "string") continue;
    const info = inspectText(text);
    if (!info) continue;
    if (info.audio) audioObservations.push(info.audio);
    if (info.sub) subObservations.push(info.sub);
    if (info.foreign) hasForeign = true;
  }
  if (audioObservations.length > 0) {
    const hasPtBr = audioObservations.includes("pt_br");
    const hasNonPtBr = audioObservations.includes("non_pt_br");
    if (hasNonPtBr || hasPtBr && hasNonPtBr) {
      return LANGUAGE.DUBBED_NON_PT_BR;
    }
    return LANGUAGE.DUBBED;
  }
  if (subObservations.length > 0) {
    const hasPtBr = subObservations.includes("pt_br");
    const hasNonPtBr = subObservations.includes("non_pt_br");
    if (hasNonPtBr || hasPtBr && hasNonPtBr) {
      return LANGUAGE.SUBTITLED_NON_PT_BR;
    }
    return LANGUAGE.SUBTITLED;
  }
  if (hasForeign) {
    return LANGUAGE.NON_PT_BR;
  }
  return LANGUAGE.UNKNOWN;
}

// src/_blocks/custom-formatter/index.mjs
var FORMATTER = Object.freeze({ AUTO: "auto", GDRIVE: "gdrive", PRISM: "prism" });
var CONCRETE_TEMPLATES = Object.values(FORMATTER).filter((value) => value !== FORMATTER.AUTO);
var LIMITS = Object.freeze({
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
  ITEM: 24
});
var P2P_URL = /^(?:magnet:|torrent:\/\/)/i;
var HTTP_URL = /^https?:\/\//i;
var QUALITY_HEIGHT = /^(\d{3,4})p$/;
var UHD_HEIGHT2 = 2160;
var PRISM_BADGES = [
  [UHD_HEIGHT2, "\u{1F525}4K UHD"],
  [1440, "\u2728 QHD"],
  [1080, "\u{1F680} FHD"],
  [720, "\u{1F4BF} HD"],
  [0, "\u{1F4A9} Baixa qualidade"]
];
var FORMAT_READERS = {
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
  message: readText
};
var TEMPLATES = {
  [FORMATTER.GDRIVE]: { header: gdriveHeader, lines: gdriveLines },
  [FORMATTER.PRISM]: { header: prismHeader, lines: prismLines }
};
var drawnTemplate = null;
var randomSource = Math.random;
function formatStream(stream, format) {
  if (!isPlainObject(stream)) throw new Error(`stream deve ser objeto (recebido: ${describe2(stream)})`);
  if (!isPlainObject(format)) throw new Error(`stream.format deve ser objeto (recebido: ${describe2(format)})`);
  const allowed = ["template"].concat(Object.keys(FORMAT_READERS));
  for (const key of Object.keys(format)) {
    if (!allowed.includes(key)) {
      throw new Error(`stream.format: campo desconhecido "${key}" (aceitos: ${allowed.join(", ")})`);
    }
  }
  const template = resolveTemplate(format.template);
  if (format.addon === void 0) throw new Error("stream.format.addon \xE9 obrigat\xF3rio (nome do provedor exibido)");
  return render(TEMPLATES[template], readData(stream, format));
}
function clipEnd(text, max) {
  if (text === void 0 || text === null || text === "") return text;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 1).join("")}\u2026`;
}
function clipMiddle(text, max) {
  if (text === void 0 || text === null || text === "") return text;
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const headLength = Math.ceil((max - 1) / 2);
  const tailLength = max - 1 - headLength;
  const head = chars.slice(0, headLength).join("");
  const tail = tailLength > 0 ? chars.slice(-tailLength).join("") : "";
  return `${head}\u2026${tail}`;
}
function resolveTemplate(template) {
  checkTemplate(template, "stream.format.template", Object.values(FORMATTER));
  if (template !== FORMATTER.AUTO) return template;
  if (typeof NUVIO_FORMATTER === "string") {
    return checkTemplate(NUVIO_FORMATTER, "NUVIO_FORMATTER (constante de build)", CONCRETE_TEMPLATES);
  }
  if (drawnTemplate === null) {
    const index = Math.floor(randomSource() * CONCRETE_TEMPLATES.length);
    drawnTemplate = CONCRETE_TEMPLATES[Math.min(Math.max(index, 0), CONCRETE_TEMPLATES.length - 1)];
  }
  return drawnTemplate;
}
function checkTemplate(value, label, accepted) {
  if (!accepted.includes(value)) {
    throw new Error(`${label} desconhecido: ${describe2(value)} (aceitos: ${accepted.join(", ")})`);
  }
  return value;
}
function readData(stream, format) {
  const data = {};
  for (const key of Object.keys(FORMAT_READERS)) {
    if (format[key] !== void 0) data[key] = FORMAT_READERS[key](format[key], `stream.format.${key}`);
  }
  data.delivery = readDelivery(stream.url);
  data.quality = readText(stream.quality, "stream.quality");
  if (stream.language === void 0 || !LANGUAGE_MODES.includes(stream.language)) {
    throw new Error(`stream.language inv\xE1lido: ${describe2(stream.language)} (aceitos: ${LANGUAGE_MODES.join(", ")})`);
  }
  data.language = stream.language;
  for (const key of ["size", "provider"]) {
    if (stream[key] !== void 0) data[key] = readText(stream[key], `stream.${key}`);
  }
  if (stream.seeders !== void 0) data.seeders = readCount(stream.seeders, "stream.seeders");
  if (stream.peers !== void 0) data.peers = readCount(stream.peers, "stream.peers");
  return data;
}
function render(template, data) {
  const header = template.header(data);
  const details = joinLines(template.lines(__spreadProps(__spreadValues({}, data), { size: void 0, forName: true })));
  return {
    name: details ? `${header}
${details}` : header,
    title: joinLines(template.lines(data))
  };
}
function gdriveHeader(data) {
  return `${data.addon} ${data.quality}`;
}
function gdriveLines(data) {
  return [
    [
      part("\u{1F3A5}", clipEnd(data.source, LIMITS.SOURCE)),
      part("\u{1F39E}\uFE0F", clipEnd(data.encode, LIMITS.ENCODE)),
      part("\u{1F4FA}", list(data.visualTags, " | ")),
      part("\u{1F3F7}\uFE0F", clipEnd(data.releaseGroup, LIMITS.GROUP))
    ],
    [
      part("\u{1F3A7}", list(data.audioTags, " | ")),
      part("\u{1F50A}", list(data.audioChannels, " | "))
    ],
    [audioPart(data)],
    [
      deliveryPart(data),
      sizePart(data),
      data.bitrate === void 0 ? null : `(${formatBitrate(data.bitrate)})`,
      part("\u23F1\uFE0F", formatDuration(data.duration)),
      swarmPart(data, "\u{1F465}"),
      part("\u{1F4C5}", clipEnd(data.age, LIMITS.AGE)),
      part("\u{1F50D}", clipEnd(data.provider, LIMITS.CATALOG))
    ],
    [filePart(data)],
    [part("\u2139\uFE0F", clipEnd(data.message, LIMITS.MESSAGE))]
  ];
}
function prismLines(data) {
  return [
    data.title === void 0 ? [] : [
      `\u{1F3AC} ${clipEnd(data.title, LIMITS.TITLE)}`,
      data.year === void 0 ? null : `(${data.year})`,
      episodeTag(data)
    ],
    [
      part("\u{1F3A5}", clipEnd(data.source, LIMITS.SOURCE)),
      part("\u{1F4FA}", list(data.visualTags, " | ")),
      part("\u{1F39E}\uFE0F", clipEnd(data.encode, LIMITS.ENCODE)),
      part("\u23F1\uFE0F", formatDuration(data.duration))
    ],
    [
      part("\u{1F3A7}", list(data.audioTags, " | ")),
      part("\u{1F50A}", list(data.audioChannels, " | "))
    ],
    [audioPart(data)],
    [
      deliveryPart(data),
      sizePart(data),
      part("\u{1F4CA}", data.bitrate === void 0 ? void 0 : formatBitrate(data.bitrate)),
      swarmPart(data, "\u{1F331}")
    ],
    [
      part("\u{1F3F7}\uFE0F", clipEnd(data.releaseGroup, LIMITS.GROUP)),
      part("\u{1F4E1}", clipEnd(data.provider, LIMITS.CATALOG))
    ],
    // No name, o provedor fica de fora: os dois apps já mostram o nome do provedor.
    [data.forName ? null : `\u{1F50D}${data.addon}`],
    [part("\u2139\uFE0F", clipEnd(data.message, LIMITS.MESSAGE))]
  ];
}
function audioPart(data) {
  return `\u{1F5E3}\uFE0F ${data.language}`;
}
function swarmPart(data, emoji) {
  if (data.delivery !== "P2P") return null;
  const seeders = data.seeders !== void 0 ? data.seeders : "?";
  const peers = data.peers !== void 0 ? data.peers : "?";
  return `${emoji} ${seeders}/${peers}`;
}
function filePart(data) {
  if (data.filename === void 0) return null;
  const file = clipMiddle(data.filename, LIMITS.FILE);
  if (data.forName || data.folderName === void 0) {
    return `\u{1F4C1} ${file}`;
  }
  const folder = clipMiddle(data.folderName, LIMITS.FOLDER);
  return `\u{1F4C1} ${folder}/${file}`;
}
function prismHeader(data) {
  const { quality } = data;
  if (quality === UNKNOWN_QUALITY) return `\u2753 ${UNKNOWN_QUALITY}`;
  if (quality === "CAM") return "\u{1F4A9} CAM";
  const match = quality === "4K" ? [null, String(UHD_HEIGHT2)] : quality.match(QUALITY_HEIGHT);
  if (!match) {
    throw new Error(`stream.quality fora do formato normalizado (recebido: "${quality}"; esperado "<n>p", "4K", "CAM" ou "${UNKNOWN_QUALITY}")`);
  }
  const badge = PRISM_BADGES.find(([minimum]) => Number(match[1]) >= minimum)[1];
  return badge.includes(quality) ? badge : `${badge} ${quality}`;
}
function deliveryPart(data) {
  return data.delivery === "P2P" ? "\u{1F9F2} P2P" : "\u{1F310} HTTP";
}
function sizePart(data) {
  if (data.size === void 0) {
    return data.forName && data.folderSize !== void 0 ? `\u{1F4E6} pacote ${data.folderSize}` : null;
  }
  return data.folderSize === void 0 ? `\u{1F4E6} ${data.size}` : `\u{1F4E6} ${data.size} / ${data.folderSize}`;
}
function episodeTag(data) {
  if (data.season === void 0) return null;
  const season = `T${pad2(data.season)}`;
  return data.episode === void 0 ? season : `${season}E${pad2(data.episode)}`;
}
function formatBitrate(bitsPerSecond) {
  if (bitsPerSecond >= 1e6) return `${(bitsPerSecond / 1e6).toFixed(1)} Mbps`;
  return `${Math.round(bitsPerSecond / 1e3)} Kbps`;
}
function formatDuration(seconds) {
  if (!seconds) return void 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}h:${minutes}m:${rest}s` : `${minutes}m:${rest}s`;
}
function pad2(value) {
  return value < 10 ? `0${value}` : String(value);
}
function part(emoji, value) {
  return value === void 0 || value === null || value === "" ? null : `${emoji} ${value}`;
}
function list(items, separator) {
  if (!items || items.length === 0) return void 0;
  const maxItems = 3;
  const clipped = items.slice(0, maxItems).map((item) => clipEnd(item, LIMITS.ITEM));
  const base = clipped.join(separator);
  if (items.length > maxItems) {
    return `${base} +${items.length - maxItems}`;
  }
  return base;
}
function joinLines(lines) {
  return lines.map((parts) => parts.filter(Boolean).join(" ").trim()).filter((line) => line !== "").join("\n");
}
function readText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} deve ser texto n\xE3o vazio (recebido: ${describe2(value)})`);
  }
  return value.trim();
}
function readDelivery(url) {
  if (url === void 0) throw new Error("stream.url \xE9 obrigat\xF3rio (dela sai o tipo de entrega P2P ou HTTP)");
  const text = readText(url, "stream.url");
  if (P2P_URL.test(text)) return "P2P";
  if (HTTP_URL.test(text)) return "HTTP";
  throw new Error(`stream.url deve ser http(s), magnet ou torrent:// (recebido: ${describe2(text)})`);
}
function readTextList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser lista de textos (recebido: ${describe2(value)})`);
  return value.map((item, index) => readText(item, `${label}[${index}]`));
}
function readCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} deve ser inteiro maior ou igual a zero (recebido: ${describe2(value)})`);
  }
  return value;
}
function readPositiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} deve ser n\xFAmero maior que zero (recebido: ${describe2(value)})`);
  }
  return value;
}
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function describe2(value) {
  if (typeof value === "string") return `"${value}"`;
  return Array.isArray(value) ? `[${value.map(describe2).join(", ")}]` : String(value);
}

// src/_blocks/stream-build/index.mjs
var UHD_HEIGHT3 = 2160;
var FOUR_K2 = "4K";
var CAM2 = "CAM";
var CAM_RANK = 0;
var UNKNOWN_RANK = -1;
var HTTP_PROTOCOLS = ["http:", "https:"];
var QUALITY_TOKEN2 = /^(\d{3,4})p$/;
var MAGNET_PREFIX = /^magnet:/i;
var MAGNET_BTIH = /^magnet:\?(?:[^&]*&)*?xt=urn:btih:([^&]*)/i;
var HEX_HASH = /^[0-9a-f]{40}$/i;
var TORRENT_FILE_PREFIX = /^torrent:\/\//i;
var TORRENT_FILE = /^torrent:\/\/([^/?#]+)\/([^/?#]+)$/i;
var BASE32_HASH = /^[a-z2-7]{32}$/i;
var REQUIRED_FIELDS = ["url", "format"];
var INPUT_FIELDS = ["quality", "qualityHints", "language", "languageHints"];
var OPTIONAL_READERS = {
  size: readText2,
  headers: readHeaders,
  subtitles: readSubtitles,
  infoHash: readInfoHash,
  provider: readText2,
  type: readText2,
  seeders: readCount2,
  peers: readCount2,
  behaviorHints: readBehaviorHints
};
var SUBTITLE_REQUIRED_FIELDS = ["url", "language"];
var SUBTITLE_OPTIONAL_READERS = { name: readText2, headers: readHeaders };
var BEHAVIOR_HINT_READERS = { audioDelayMs: readFiniteNumber, audioDelayLanguage: readText2 };
function buildStream(fields) {
  if (!isPlainObject2(fields)) {
    throw new Error(`stream deve ser objeto com os campos do stream (recebido: ${describe3(fields)})`);
  }
  if (fields.name !== void 0 || fields.title !== void 0) {
    throw new Error("stream.name e stream.title v\xEAm do formatador quando h\xE1 stream.format: n\xE3o os informe");
  }
  checkKeys(fields, REQUIRED_FIELDS.concat(Object.keys(OPTIONAL_READERS), INPUT_FIELDS), "stream");
  if (fields.format === void 0) throw new Error("stream.format \xE9 obrigat\xF3rio");
  if (!isPlainObject2(fields.format)) {
    throw new Error(`stream.format deve ser objeto (recebido: ${describe3(fields.format)})`);
  }
  const url = readText2(fields.url, "stream.url");
  const isMagnet = MAGNET_PREFIX.test(url);
  const isTorrentFile = TORRENT_FILE_PREFIX.test(url);
  const quality = fields.quality === void 0 ? discoverQuality(qualityTexts(fields, url)) : fields.quality === UNKNOWN_QUALITY ? UNKNOWN_QUALITY : normalizeQuality(fields.quality);
  const languageHints = fields.languageHints === void 0 ? [] : readLanguageHints(fields.languageHints, "stream.languageHints");
  const stream = {
    url: isMagnet || isTorrentFile ? url : readHttpUrl(url, "stream.url"),
    // O formatador preenche name e title depois de validar o resto (ordem das chaves mantida).
    name: "",
    title: "",
    quality
  };
  copyOptional(fields, stream, OPTIONAL_READERS, "stream");
  stream.language = resolveStreamLanguage(fields, languageHints);
  if (isMagnet) applyMagnet(stream);
  if (isTorrentFile) applyTorrentFile(stream);
  const text = formatStream(stream, fields.format);
  stream.name = text.name;
  stream.title = text.title;
  return stream;
}
function sortByQuality(streams) {
  if (!Array.isArray(streams)) {
    throw new Error(`streams deve ser array (recebido: ${describe3(streams)})`);
  }
  return streams.map((stream, index) => ({ stream, index, rank: qualityRank(stream, `streams[${index}]`) })).sort((a, b) => b.rank - a.rank || a.index - b.index).map((entry) => entry.stream);
}
function applyMagnet(stream) {
  if (stream.headers !== void 0) {
    throw new Error("stream.headers n\xE3o se aplica a magnet: n\xE3o h\xE1 requisi\xE7\xE3o HTTP para receb\xEA-los");
  }
  const match = stream.url.match(MAGNET_BTIH);
  if (!match) {
    throw new Error(`stream.url magnet sem o par\xE2metro "xt=urn:btih:<hash>" (recebido: "${stream.url}")`);
  }
  const hash = readInfoHash(match[1], "hash do magnet em stream.url");
  if (stream.infoHash !== void 0 && stream.infoHash !== hash) {
    throw new Error(`stream.infoHash "${stream.infoHash}" diverge do hash do magnet "${hash}"`);
  }
  stream.infoHash = hash;
}
function applyTorrentFile(stream) {
  if (stream.headers !== void 0) {
    throw new Error("stream.headers n\xE3o se aplica a torrent://: n\xE3o h\xE1 requisi\xE7\xE3o HTTP para receb\xEA-los");
  }
  const match = stream.url.match(TORRENT_FILE);
  if (!match || !/^\d+$/.test(match[2])) {
    throw new Error(`stream.url torrent fora do formato "torrent://<hash>/<\xEDndice>" (recebido: "${stream.url}")`);
  }
  const hash = readInfoHash(match[1], "hash de stream.url torrent://");
  if (stream.infoHash !== void 0 && stream.infoHash !== hash) {
    throw new Error(`stream.infoHash "${stream.infoHash}" diverge do hash de stream.url "${hash}"`);
  }
  stream.url = `torrent://${hash}/${Number(match[2])}`;
  stream.infoHash = hash;
}
function qualityRank(stream, label) {
  if (!isPlainObject2(stream)) throw new Error(`${label} deve ser objeto (recebido: ${describe3(stream)})`);
  const { quality } = stream;
  if (quality === FOUR_K2) return UHD_HEIGHT3;
  if (quality === CAM2) return CAM_RANK;
  if (quality === UNKNOWN_QUALITY) return UNKNOWN_RANK;
  const match = typeof quality === "string" && quality.match(QUALITY_TOKEN2);
  if (!match) {
    throw new Error(`${label}.quality fora do formato normalizado (recebido: ${describe3(quality)}; esperado "<n>p", "4K", "CAM" ou "${UNKNOWN_QUALITY}")`);
  }
  return Number(match[1]);
}
function qualityTexts(fields, url) {
  const hints = fields.qualityHints === void 0 ? [] : readQualityHints(fields.qualityHints, "stream.qualityHints");
  const { format } = fields;
  const filename = format.filename === void 0 ? void 0 : readText2(format.filename, "stream.format.filename");
  const folderName = format.folderName === void 0 ? void 0 : readText2(format.folderName, "stream.format.folderName");
  return hints.concat(filename, folderName, url);
}
function readQualityHints(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser array (recebido: ${describe3(value)})`);
  return value.map((item, index) => {
    if (item === null || item === void 0 || typeof item === "string") return item;
    throw new Error(`${label}[${index}] deve ser texto, null ou undefined (recebido: ${describe3(item)})`);
  });
}
function copyOptional(source, target, readers, label) {
  for (const key of Object.keys(readers)) {
    if (source[key] !== void 0) target[key] = readers[key](source[key], `${label}.${key}`);
  }
  return target;
}
function checkKeys(object, allowed, label) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw new Error(`${label}: campo desconhecido "${key}" (aceitos: ${allowed.join(", ")})`);
    }
  }
}
function readText2(value, label) {
  if (value === void 0) throw new Error(`${label} \xE9 obrigat\xF3rio`);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} deve ser texto n\xE3o vazio (recebido: ${describe3(value)})`);
  }
  return value.trim();
}
function readHttpUrl(value, label) {
  const text = readText2(value, label);
  let protocol;
  try {
    protocol = new URL(text).protocol;
  } catch (error) {
    throw new Error(`${label} n\xE3o \xE9 URL v\xE1lida: "${text}" (${error.message})`, { cause: error });
  }
  if (!HTTP_PROTOCOLS.includes(protocol)) {
    throw new Error(`${label} deve ser URL http(s) (recebido: "${text}")`);
  }
  return text;
}
var VALID_LANGUAGES = new Set(Object.values(LANGUAGE));
function readLanguageHints(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser array (recebido: ${describe3(value)})`);
  return value.map((item, index) => readText2(item, `${label}[${index}]`));
}
function resolveStreamLanguage(fields, languageHints) {
  if (fields.language !== void 0) {
    const raw = readText2(fields.language, "stream.language");
    if (VALID_LANGUAGES.has(raw)) {
      if (raw !== LANGUAGE.UNKNOWN) {
        return raw;
      }
    } else {
      console.warn(`[${fields.format.addon}] Idioma n\xE3o reconhecido: "${raw}"; descartado, seguindo a descoberta local`);
    }
  }
  const { format } = fields;
  const filename = format.filename === void 0 ? void 0 : readText2(format.filename, "stream.format.filename");
  const folderName = format.folderName === void 0 ? void 0 : readText2(format.folderName, "stream.format.folderName");
  return discoverLanguage({
    texts: [filename, folderName, ...languageHints]
  });
}
function readInfoHash(value, label) {
  const text = readText2(value, label);
  if (HEX_HASH.test(text)) return text.toLowerCase();
  if (BASE32_HASH.test(text)) {
    throw new Error(`${label} est\xE1 em base32 ("${text}"): o provedor deve convert\xEA-lo para hexadecimal de 40 caracteres; o app falha ao iniciar o P2P com base32`);
  }
  throw new Error(`${label} deve ser hexadecimal de 40 caracteres (recebido: "${text}")`);
}
function readHeaders(value, label) {
  if (!isPlainObject2(value)) throw new Error(`${label} deve ser objeto (recebido: ${describe3(value)})`);
  const headers = {};
  for (const name of Object.keys(value)) headers[name] = readText2(value[name], `${label}.${name}`);
  return headers;
}
function readSubtitles(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser array (recebido: ${describe3(value)})`);
  return value.map((item, index) => readSubtitle(item, `${label}[${index}]`));
}
function readSubtitle(value, label) {
  if (!isPlainObject2(value)) throw new Error(`${label} deve ser objeto (recebido: ${describe3(value)})`);
  checkKeys(value, SUBTITLE_REQUIRED_FIELDS.concat(Object.keys(SUBTITLE_OPTIONAL_READERS)), label);
  const subtitle = {
    url: readHttpUrl(value.url, `${label}.url`),
    language: readText2(value.language, `${label}.language`)
  };
  return copyOptional(value, subtitle, SUBTITLE_OPTIONAL_READERS, label);
}
function readBehaviorHints(value, label) {
  if (!isPlainObject2(value)) throw new Error(`${label} deve ser objeto (recebido: ${describe3(value)})`);
  checkKeys(value, Object.keys(BEHAVIOR_HINT_READERS), label);
  return copyOptional(value, {}, BEHAVIOR_HINT_READERS, label);
}
function readCount2(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} deve ser inteiro maior ou igual a zero (recebido: ${describe3(value)})`);
  }
  return value;
}
function readFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} deve ser n\xFAmero (recebido: ${describe3(value)})`);
  }
  return value;
}
function isPlainObject2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function describe3(value) {
  return typeof value === "string" ? `"${value}"` : String(value);
}

// src/_blocks/http/index.mjs
var DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
var ACCEPT_LANGUAGE = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7";
var BASE_HEADERS = Object.freeze({ "User-Agent": DEFAULT_USER_AGENT, "Accept-Language": ACCEPT_LANGUAGE });
var JSON_CONTENT_TYPE = "application/json";
var FORM_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=UTF-8";
var METHODS = ["GET", "POST"];
var HEADER_PROFILES = Object.freeze({
  page: Object.freeze(__spreadProps(__spreadValues({}, BASE_HEADERS), { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" })),
  api: Object.freeze(__spreadProps(__spreadValues({}, BASE_HEADERS), { Accept: "application/json, text/plain, */*", "X-Requested-With": "XMLHttpRequest" })),
  player: Object.freeze(__spreadProps(__spreadValues({}, BASE_HEADERS), { Accept: "*/*" }))
});
function fetchText(url, options) {
  return __async(this, null, function* () {
    const response = yield request(url, options);
    return response.text();
  });
}
function fetchJson(url, options) {
  return __async(this, null, function* () {
    const response = yield request(url, options);
    const text = yield response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Resposta n\xE3o \xE9 JSON v\xE1lido em ${url}: ${error.message}`, { cause: error });
    }
  });
}
function fetchPage(url, options) {
  return __async(this, null, function* () {
    const response = yield request(url, options);
    if (typeof response.url !== "string" || response.url === "") {
      throw new Error(`Resposta sem URL final (response.url) em ${url}`);
    }
    return { url: response.url, text: yield response.text() };
  });
}
function request(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const method = options.method === void 0 ? "GET" : options.method;
    const profile = options.profile === void 0 ? "page" : options.profile;
    const hasJson = options.json !== void 0;
    const hasForm = options.form !== void 0;
    if (!METHODS.includes(method)) {
      throw new Error(`method inv\xE1lido: "${method}" (esperado "GET" ou "POST")`);
    }
    if (!Object.prototype.hasOwnProperty.call(HEADER_PROFILES, profile)) {
      throw new Error(`profile inv\xE1lido: "${profile}" (esperado "page", "api" ou "player")`);
    }
    if (hasJson && hasForm) {
      throw new Error("Use json ou form, n\xE3o os dois na mesma requisi\xE7\xE3o");
    }
    if ((hasJson || hasForm) && method === "GET") {
      throw new Error('json e form exigem method "POST"');
    }
    const headers = __spreadValues(__spreadValues({}, HEADER_PROFILES[profile]), options.headers);
    const init = { method, headers };
    if (hasJson) {
      init.body = JSON.stringify(options.json);
      setDefaultContentType(headers, JSON_CONTENT_TYPE);
    }
    if (hasForm) {
      init.body = new URLSearchParams(options.form).toString();
      setDefaultContentType(headers, FORM_CONTENT_TYPE);
    }
    const response = yield fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} em ${url}`);
    }
    return response;
  });
}
function setDefaultContentType(headers, contentType) {
  const defined = Object.keys(headers).some((name) => name.toLowerCase() === "content-type");
  if (!defined) headers["Content-Type"] = contentType;
}

// src/_blocks/fireplayer/index.mjs
var DUB = /* @__PURE__ */ new Set(["pt", "ptbr", "por", "portuguese", "portugues", "dublado", "dub", "brasil", "brazil", "brazilian"]);
var ORIGINAL = /* @__PURE__ */ new Set(["en", "eng", "english"]);
function loadHtml(html) {
  const { load } = require("cheerio-without-node-native");
  return load(html);
}
function originReferer(url) {
  return new URL(url).origin + "/";
}
function unpackPacker(source) {
  const marker = source.indexOf("function(p,a,c,k,e,d)");
  if (marker < 0) return null;
  const call = source.indexOf("}(", marker);
  if (call < 0) return null;
  let cursor = call + 2;
  const payload = readString(source, cursor);
  cursor = skipComma(source, payload.end);
  const radix = readNumber(source, cursor);
  cursor = skipComma(source, radix.end);
  const count = readNumber(source, cursor);
  cursor = skipComma(source, count.end);
  const dictionary = readString(source, cursor);
  return substitute(payload.value, radix.value, count.value, dictionary.value.split("|"));
}
function interpretPlaylist(text, playlistUrl) {
  const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U") throw new Error("Resposta n\xE3o \xE9 playlist HLS");
  const medias = lines.filter((line) => line.startsWith("#EXT-X-MEDIA:")).map((line) => attributes(line.slice(line.indexOf(":") + 1)));
  const variants = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
    const info = attributes(lines[index].slice(lines[index].indexOf(":") + 1));
    const resolution = /^(\d+)x([1-9]\d{2,3})$/.exec(info.RESOLUTION || "");
    const uri = lines[index + 1];
    if (!uri || uri.startsWith("#")) throw new Error("Variante HLS sem URI");
    if (!resolution) continue;
    index += 1;
    variants.push({ info, quality: Number(resolution[2]), url: mediaUrl(uri, playlistUrl) });
  }
  const audio = audioOf(medias, variants);
  const subtitles = subtitleTracks(medias, playlistUrl);
  const external = variants.length > 0 && variants.some((variant) => hasExternal(medias, variant.info));
  return {
    adaptive: external,
    url: playlistUrl,
    quality: external ? Math.max(...variants.map((variant) => variant.quality)) : null,
    variants: external ? [] : variants.map((variant) => ({ url: variant.url, quality: variant.quality })),
    language: audio.language,
    foreignOnly: audio.foreignOnly,
    subtitles
  };
}
function hasExternal(medias, info) {
  return ["AUDIO", "SUBTITLES"].some((type) => {
    const group = info[type];
    if (!group || group === "NONE") return false;
    return medias.some((media) => media.TYPE === type && media["GROUP-ID"] === group && media.URI);
  });
}
function audioOf(medias, variants) {
  const groups = new Set(variants.map((variant) => variant.info.AUDIO).filter((group) => group && group !== "NONE"));
  const tracks = medias.filter((media) => media.TYPE === "AUDIO" && (!groups.size || groups.has(media["GROUP-ID"])));
  let dub = false;
  let original = false;
  for (const track of tracks) {
    const words2 = wordsOf(`${track.NAME || ""} ${track.LANGUAGE || ""}`);
    if (words2.some((word) => DUB.has(word))) dub = true;
    if (words2.some((word) => ORIGINAL.has(word))) original = true;
  }
  if (dub) return { language: LANGUAGE.DUBBED, foreignOnly: false };
  if (original) return { language: null, foreignOnly: true };
  return { language: null, foreignOnly: false };
}
function subtitleTracks(medias, playlistUrl) {
  const tracks = [];
  for (const media of medias) {
    if (media.TYPE !== "SUBTITLES" || !media.URI) continue;
    const label = `${media.NAME || ""} ${media["GROUP-ID"] || ""} ${media.LANGUAGE || ""}`;
    if (/thumb/i.test(label)) continue;
    const language = media.LANGUAGE || media.NAME;
    if (!language) continue;
    const track = { url: mediaUrl(media.URI, playlistUrl), language };
    if (media.NAME) track.name = media.NAME;
    tracks.push(track);
  }
  return tracks;
}
function wordsOf(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}
function mediaUrl(value, base) {
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL de m\xEDdia n\xE3o \xE9 HTTP(S)");
  return url.href;
}
function attributes(value) {
  const result = {};
  let position = 0;
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]+)(?:,|$)/g;
  for (const match of value.matchAll(pattern)) {
    if (match.index !== position || Object.prototype.hasOwnProperty.call(result, match[1])) {
      throw new Error("Atributos HLS inv\xE1lidos");
    }
    position += match[0].length;
    result[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  if (position !== value.length) throw new Error("Atributos HLS inv\xE1lidos");
  return result;
}
function substitute(payload, radix, count, words2) {
  let value = payload;
  let index = count;
  while (index--) {
    if (!words2[index]) continue;
    const token = encode(index, radix);
    value = value.replace(new RegExp(`\\b${token}\\b`, "g"), words2[index]);
  }
  return value;
}
function encode(value, radix) {
  const digit = value % radix;
  const higher = value < radix ? "" : encode(Math.floor(value / radix), radix);
  const symbol = digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36);
  return higher + symbol;
}
function skipComma(source, index) {
  let cursor = index;
  while (source[cursor] === " " || source[cursor] === "\n") cursor += 1;
  if (source[cursor] !== ",") throw new Error("empacotador ileg\xEDvel");
  return cursor + 1;
}
function readNumber(source, index) {
  const match = /^\s*(\d+)/.exec(source.slice(index));
  if (!match) throw new Error("empacotador ileg\xEDvel");
  return { value: Number(match[1]), end: index + match[0].length };
}
function readString(source, index) {
  let cursor = index;
  while (source[cursor] === " " || source[cursor] === "\n") cursor += 1;
  const quote = source[cursor];
  if (quote !== "'" && quote !== '"') throw new Error("empacotador ileg\xEDvel");
  cursor += 1;
  let value = "";
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\\") {
      value += source[cursor + 1];
      cursor += 2;
      continue;
    }
    if (char === quote) return { value, end: cursor + 1 };
    value += char;
    cursor += 1;
  }
  throw new Error("empacotador ileg\xEDvel");
}

// src/_blocks/script-extract/index.mjs
var QUOTED_STRING = String.raw`(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1`;
function extractJsRedirect(html) {
  assertHtml(html);
  const pattern = new RegExp(
    `(?:^|[^\\w$.])(?:window\\.)?location(?:(?:\\.href)?\\s*=\\s*|\\.replace\\(\\s*)${QUOTED_STRING}`
  );
  const match = pattern.exec(html);
  return match ? unescapeJs(match[2]) : null;
}
function assertHtml(html) {
  if (typeof html !== "string") {
    throw new Error(`html inv\xE1lido: esperado string, recebido ${typeof html}`);
  }
}
function unescapeJs(value) {
  return value.replace(
    /\\(u[0-9a-fA-F]{4}|[\\/"'])/g,
    (whole, sequence) => sequence.length === 5 ? String.fromCharCode(parseInt(sequence.slice(1), 16)) : sequence
  );
}

// src/fshd/api.js
var FALLBACK_DOMAINS = Object.freeze([
  "https://fshd.link"
]);
function fetchCatalogPage(url, json, referer) {
  return __async(this, null, function* () {
    const init = json === void 0 ? { method: "GET", headers: __spreadValues({}, HEADER_PROFILES.page) } : {
      method: "POST",
      headers: __spreadProps(__spreadValues({}, HEADER_PROFILES.api), { Accept: "application/json", Referer: referer, "Content-Type": "application/json" }),
      body: JSON.stringify(json)
    };
    let response;
    try {
      response = yield fetch(url, init);
    } catch (cause) {
      const error = new Error(`Falha de rede em ${url}: ${cause.message}`, { cause });
      error.networkFailure = true;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} em ${url}`);
      error.status = response.status;
      throw error;
    }
    if (typeof response.url !== "string" || !response.url.trim()) {
      throw new Error(`Resposta sem URL final (response.url) em ${url}`);
    }
    return { url: response.url, text: yield response.text() };
  });
}
function buildContentPath(tmdbId, mediaType, season, episode) {
  if (mediaType === "movie") {
    return `/filme/${tmdbId}`;
  }
  return `/serie/${tmdbId}/${season}/${episode}`;
}
function isTransportError(error) {
  return error.networkFailure === true || [429, 403, 451].includes(error.status) || error.status >= 500 && error.status <= 599;
}
function extractSubtitlesFromQuery(playerUrl) {
  const subtitles = [];
  const url = new URL(playerUrl);
  for (let index = 1; index <= 10; index += 1) {
    const sub = url.searchParams.get(`sub${index}`);
    if (!sub) break;
    const language = url.searchParams.get(`lang${index}`);
    subtitles.push(__spreadValues({ url: sub }, language ? { language, name: language } : {}));
  }
  return subtitles;
}
function fetchContentDetails(domain, request2) {
  return __async(this, null, function* () {
    const path = buildContentPath(request2.tmdbId, request2.mediaType, request2.season, request2.episode);
    const targetUrl = `${domain}${path}`;
    let page;
    try {
      page = yield fetchCatalogPage(targetUrl);
    } catch (error) {
      if (error.status === 404) {
        return { absent: true };
      }
      throw error;
    }
    const html = page.text;
    if (!html || !html.trim()) {
      throw new Error(`P\xE1gina vazia recebida de ${targetUrl}`);
    }
    const titleTagMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const rawTitle = titleTagMatch ? decodeHtmlEntities(titleTagMatch[1]).replace(/\s+/g, " ").trim() : "";
    const titleMatch = /^FSHD\s+[—–-]\s+(Filme|Série)\s+(.+)$/i.exec(rawTitle);
    if (!titleMatch) {
      throw new Error(`Formato de t\xEDtulo inesperado em ${targetUrl}`);
    }
    const title = titleMatch[2].trim();
    const year = null;
    if (request2.mediaType === "movie") {
      const match = /CONTENT_INFO\s*=\s*['"]?(\d+)['"]?/i.exec(html);
      if (!match) {
        if (/filme\s+n[aã]o\s+encontrado/i.test(html) || /conte[uú]do\s+indispon[ií]vel/i.test(html)) {
          return { absent: true };
        }
        throw new Error(`Identificador CONTENT_INFO n\xE3o encontrado no HTML de ${targetUrl}`);
      }
      return {
        absent: false,
        contentId: match[1],
        contentType: "1",
        pageUrl: page.url,
        title,
        year,
        servers: extractMovieServers(html)
      };
    }
    const $ = loadHtml(html);
    const activeEpisode = $(".episodeOption.active");
    let contentId = activeEpisode.attr("data-contentid");
    if (!contentId) {
      const activeRegex = /class="[^"]*\bepisodeOption\b[^"]*\bactive\b[^"]*"[^>]*data-contentid="(\d+)"/i.exec(html) || /data-contentid="(\d+)"[^>]*class="[^"]*\bepisodeOption\b[^"]*\bactive\b[^"]*"/i.exec(html);
      if (activeRegex) {
        contentId = activeRegex[1];
      }
    }
    if (!contentId) {
      const hasEpisodes = $(".episodeOption").length > 0 || /class="[^"]*episodeOption/i.test(html);
      if (hasEpisodes || /s[eé]rie\s+n[aã]o\s+encontrada/i.test(html)) {
        return { absent: true };
      }
      throw new Error(`Epis\xF3dio ativo com data-contentid n\xE3o encontrado no HTML de ${targetUrl}`);
    }
    return {
      absent: false,
      contentId,
      contentType: "2",
      pageUrl: page.url,
      title,
      year
    };
  });
}
function extractMovieServers(html) {
  const $ = loadHtml(html);
  const nodes = $(".server-selector[data-id]");
  const servers = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const id = nodes.eq(index).attr("data-id");
    if (!id) continue;
    const name = nodes.eq(index).text().replace(/\s+/g, " ").trim();
    if (!name) continue;
    servers.push({ id: String(id), name });
  }
  return servers;
}
function decodeHtmlEntities(value) {
  return value.replace(/&(amp|quot|#39|lt|gt);/g, (whole, entity) => ({
    amp: "&",
    quot: '"',
    "#39": "'",
    lt: "<",
    gt: ">"
  })[entity]);
}
function fetchOptions(domain, contentId, contentType, referer) {
  return __async(this, null, function* () {
    const url = `${domain}/api/options`;
    const body = {
      content_id: Number(contentId) || contentId,
      content_type: contentType
    };
    const page = yield fetchCatalogPage(url, body, referer);
    let response;
    try {
      response = JSON.parse(page.text);
    } catch (cause) {
      throw new Error(`Resposta de /api/options n\xE3o \xE9 JSON v\xE1lido em ${url}`, { cause });
    }
    if (!response || !Array.isArray(response.options)) {
      throw new Error(`Resposta de /api/options inv\xE1lida: campo "options" ausente ou n\xE3o \xE9 array`);
    }
    return response.options.map((opt) => {
      var _a;
      const id = (_a = opt.ID) != null ? _a : opt.id;
      const typeNum = Number(opt.type);
      let language = null;
      if (typeNum === 1) language = "Dublado";
      else if (typeNum === 2) language = "Legendado";
      return {
        id,
        type: typeNum,
        language
      };
    });
  });
}
function fetchPlayerVideoUrl(domain, contentId, contentType, videoId, referer) {
  return __async(this, null, function* () {
    const url = `${domain}/api/players`;
    const body = {
      content_info: Number(contentId) || contentId,
      content_type: contentType,
      video_id: videoId
    };
    const response = yield fetchJson(url, {
      method: "POST",
      profile: "api",
      json: body,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": referer,
        "Accept": "application/json"
      }
    });
    if (!response || typeof response.video_url !== "string" || !response.video_url.trim()) {
      throw new Error(`Resposta de /api/players sem video_url v\xE1lida`);
    }
    return response.video_url.trim();
  });
}
function resolvePlayerEmbed(videoUrl, referer) {
  return __async(this, null, function* () {
    let page = yield fetchPage(videoUrl, {
      profile: "player",
      headers: { Referer: referer }
    });
    const jsRedirect = extractJsRedirect(page.text);
    const redirectUrl = jsRedirect ? new URL(jsRedirect, page.url).href : page.url;
    if (jsRedirect) {
      page = yield fetchPlayerPage(redirectUrl, page.url);
    }
    return {
      playerUrl: page.url,
      html: page.text,
      redirectUrl
    };
  });
}
function fetchPlayerPage(url, referer) {
  return __async(this, null, function* () {
    let response;
    try {
      response = yield fetch(url, {
        method: "GET",
        headers: __spreadProps(__spreadValues({}, HEADER_PROFILES.player), { Referer: referer })
      });
    } catch (cause) {
      const error = new Error(`Falha de rede em ${url}: ${cause.message}`, { cause });
      error.networkFailure = true;
      throw error;
    }
    const host = new URL(url).host;
    if (response.status === 404) {
      const text = yield response.text();
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
      const pageTitle = title ? title[1].replace(/\s+/g, " ").trim() : "";
      if (/^404\s*[-–—]\s*Vídeo Offline$/i.test(pageTitle)) {
        throw new Error(`V\xEDdeo offline na fonte (${host})`);
      }
      throw new Error(`HTTP 404 em ${url}`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} em ${url}`);
    }
    if (typeof response.url !== "string" || !response.url.trim()) {
      throw new Error(`Resposta sem URL final (response.url) em ${url}`);
    }
    return { url: response.url, text: yield response.text() };
  });
}
function fetchHlsMaster(masterUrl, referer) {
  return __async(this, null, function* () {
    return fetchText(masterUrl, {
      profile: "player",
      headers: { Referer: referer }
    });
  });
}

// src/fshd/packer.js
function extractFirePlayerConfig(html, playerUrl) {
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("HTML do FirePlayer ausente ou vazio");
  }
  const unpacked = unpackPacker(html);
  if (!unpacked) {
    throw new Error(`Player n\xE3o suportado (${new URL(playerUrl).host})`);
  }
  const configSource = firePlayerConfigSource(unpacked);
  if (!configSource) {
    throw new Error("Configura\xE7\xE3o FirePlayer ausente no script desempacotado");
  }
  let config;
  try {
    config = JSON.parse(configSource);
  } catch (cause) {
    throw new Error(`Configura\xE7\xE3o FirePlayer n\xE3o \xE9 JSON v\xE1lido: ${cause.message}`, { cause });
  }
  if (!config || typeof config.videoUrl !== "string" || !config.videoUrl.trim()) {
    throw new Error("Configura\xE7\xE3o FirePlayer sem videoUrl");
  }
  const videoUrl = new URL(config.videoUrl.trim(), playerUrl).href;
  const tracks = [];
  const trackRegex = /<track[^>]+>/gi;
  let match;
  while ((match = trackRegex.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = /src\s*=\s*['"]([^'"]+)['"]/i.exec(tag);
    if (!srcMatch) continue;
    const langMatch = /srclang\s*=\s*['"]([^'"]+)['"]/i.exec(tag);
    const labelMatch = /label\s*=\s*['"]([^'"]+)['"]/i.exec(tag);
    const language = (langMatch == null ? void 0 : langMatch[1]) || (labelMatch == null ? void 0 : labelMatch[1]);
    tracks.push(__spreadValues(__spreadValues({
      url: new URL(srcMatch[1], playerUrl).href
    }, language ? { language } : {}), labelMatch ? { name: labelMatch[1] } : {}));
  }
  return { videoUrl, tracks };
}
function firePlayerConfigSource(source) {
  const calls = /FirePlayer\s*\(/g;
  let match;
  while ((match = calls.exec(source)) !== null) {
    const start = secondArgumentObjectStart(source, match.index + match[0].length);
    if (start < 0) continue;
    const end = closingBraceIndex(source, start);
    if (end < 0) return null;
    return source.slice(start, end + 1);
  }
  return null;
}
function secondArgumentObjectStart(source, index) {
  let depth = 0;
  let quote = null;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (quote) {
      if (char === "\\") cursor += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      if (depth === 0) return -1;
      depth -= 1;
      continue;
    }
    if (char === "," && depth === 0) {
      let start = cursor + 1;
      while (start < source.length && /\s/.test(source[start])) start += 1;
      return source[start] === "{" ? start : -1;
    }
  }
  return -1;
}
function closingBraceIndex(source, start) {
  let depth = 0;
  let quote = null;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (quote) {
      if (char === "\\") cursor += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

// src/fshd/extractor.js
var UNSUPPORTED_SERVERS = /* @__PURE__ */ new Set(["abyss", "streamplay", "dood li"]);
function isRateLimit(error) {
  return error.status === 429 || /^HTTP 429 /.test(error.message);
}
function isUnsupportedServer(name) {
  return UNSUPPORTED_SERVERS.has(normalizeText(name));
}
function extractStreams(_0) {
  return __async(this, arguments, function* (request2, providerName = "FSHD", domains = FALLBACK_DOMAINS) {
    const domainFailures = [];
    for (const domain of domains) {
      let contentDetails;
      try {
        contentDetails = yield fetchContentDetails(domain, request2);
      } catch (error) {
        if (isTransportError(error)) {
          domainFailures.push({ domain, stage: "Navega\xE7\xE3o", error });
          continue;
        }
        throw error;
      }
      if (contentDetails.absent) {
        return [];
      }
      const { contentId, contentType, pageUrl, title, year, servers } = contentDetails;
      if (!title) throw new Error(`T\xEDtulo ausente na p\xE1gina de conte\xFAdo ${pageUrl}`);
      const serverNames = new Map((servers || []).map((server) => [server.id, server.name]));
      let options;
      try {
        options = yield fetchOptions(domain, contentId, contentType, pageUrl);
      } catch (error) {
        if (isTransportError(error)) {
          domainFailures.push({ domain, stage: "Options", error });
          continue;
        }
        throw error;
      }
      if (!options || options.length === 0) {
        return [];
      }
      const streams = [];
      const optionFailures = [];
      const servedLanguages = /* @__PURE__ */ new Set();
      let rateLimited = false;
      for (const option of options) {
        const optionLabel = option.language || `Player ${option.id}`;
        if (option.language && servedLanguages.has(option.language)) continue;
        const serverName = serverNames.get(String(option.id));
        if (serverName && isUnsupportedServer(serverName)) {
          console.warn(`[${providerName}] Servidor ${serverName} ignorado: sem caminho aberto at\xE9 a m\xEDdia`);
          continue;
        }
        if (rateLimited) {
          console.warn(`[${providerName}] Op\xE7\xE3o ${optionLabel} n\xE3o consultada: limite de requisi\xE7\xF5es da fonte atingido`);
          continue;
        }
        try {
          const videoUrl = yield fetchPlayerVideoUrl(domain, contentId, contentType, option.id, pageUrl);
          const { playerUrl, html, redirectUrl } = yield resolvePlayerEmbed(videoUrl, pageUrl);
          const querySubtitles = extractSubtitlesFromQuery(redirectUrl);
          const config = extractFirePlayerConfig(html, playerUrl);
          const playerReferer = originReferer(playerUrl);
          const masterText = yield fetchHlsMaster(config.videoUrl, playerReferer);
          const playlist = interpretPlaylist(masterText, config.videoUrl);
          const combinedSubtitles = [];
          for (const track of [...querySubtitles, ...config.tracks, ...playlist.subtitles]) {
            if (!track.language) {
              console.warn(`[${providerName}] Legenda descartada: idioma ausente em ${track.url}`);
              continue;
            }
            if (!combinedSubtitles.some((sub) => sub.url === track.url)) {
              combinedSubtitles.push(track);
            }
          }
          const variants = playlist.adaptive ? [{ url: playlist.url, quality: playlist.quality }] : playlist.variants.length ? playlist.variants : [{ url: playlist.url, quality: UNKNOWN_QUALITY }];
          for (const variant of variants) {
            const stream = buildStream({
              url: variant.url,
              quality: variant.quality,
              language: playlist.language || option.language || void 0,
              type: "hls",
              provider: "fshd",
              headers: {
                Referer: playerReferer
              },
              subtitles: combinedSubtitles.length > 0 ? combinedSubtitles : void 0,
              format: {
                template: FORMATTER.AUTO,
                addon: providerName,
                title,
                message: playlist.adaptive ? "Reprodu\xE7\xE3o adaptativa" : void 0,
                year: year || void 0,
                season: request2.season || void 0,
                episode: request2.episode || void 0
              }
            });
            streams.push(stream);
          }
          if (option.language) servedLanguages.add(option.language);
        } catch (optionError) {
          console.warn(`[${providerName}] Op\xE7\xE3o ${optionLabel} descartada: ${optionError.message}`);
          optionFailures.push({ label: optionLabel, error: optionError });
          if (isRateLimit(optionError)) rateLimited = true;
        }
      }
      if (rateLimited && streams.length === 0) {
        throw new Error(`Limite de requisi\xE7\xF5es da fonte atingido (HTTP 429) em ${domain}/api/players`);
      }
      if (streams.length > 0) {
        return streams;
      }
      if (optionFailures.length > 0) {
        const reasons = optionFailures.map((f) => `${f.label}: ${f.error.message}`).join("; ");
        throw new Error(`Todas as op\xE7\xF5es falharam: ${reasons}`);
      }
      return [];
    }
    const domainReasons = domainFailures.map((f) => `${f.domain} (${f.stage}): ${f.error.message}`).join("; ");
    throw new Error(`Todos os dom\xEDnios falharam: ${domainReasons || "Origens indispon\xEDveis"}`);
  });
}

// src/fshd/index.js
var PROVIDER_NAME = "FSHD";
function validateInput(tmdbId, mediaType, season, episode) {
  if (typeof tmdbId !== "string" && typeof tmdbId !== "number") {
    throw new Error(`ID do TMDB inv\xE1lido: ${tmdbId}`);
  }
  const idStr = String(tmdbId).trim();
  if (!/^[1-9]\d*$/.test(idStr)) {
    throw new Error(`ID do TMDB inv\xE1lido: ${tmdbId}`);
  }
  if (mediaType !== "movie" && mediaType !== "tv") {
    throw new Error(`Tipo de m\xEDdia inv\xE1lido: "${mediaType}" (esperado "movie" ou "tv")`);
  }
  if (mediaType === "tv") {
    if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
      throw new Error(`Coordenadas de s\xE9rie inv\xE1lidas: temporada=${season}, epis\xF3dio=${episode} (esperados inteiros positivos)`);
    }
  }
  return {
    tmdbId: idStr,
    mediaType,
    season: mediaType === "tv" ? season : null,
    episode: mediaType === "tv" ? episode : null
  };
}
function sanitizeMessage(rawMessage) {
  let message = String(rawMessage || "");
  const key = globalThis.TMDB_API_KEY;
  if (typeof key === "string" && key.trim()) {
    for (const secret of [key, key.trim(), encodeURIComponent(key.trim())]) {
      message = message.split(secret).join("[redigido]");
    }
  }
  message = message.replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/g, "$1");
  return message;
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    let request2;
    try {
      request2 = validateInput(tmdbId, mediaType, season, episode);
    } catch (validationError) {
      console.error(`[${PROVIDER_NAME}] Valida\xE7\xE3o: ${sanitizeMessage(validationError.message)}`);
      return [];
    }
    try {
      const streams = yield extractStreams(request2, PROVIDER_NAME);
      return sortByQuality(streams);
    } catch (error) {
      const coordStr = request2.mediaType === "tv" ? ` S${request2.season}E${request2.episode}` : "";
      console.error(`[${PROVIDER_NAME}] Falha em ${request2.mediaType} ${request2.tmdbId}${coordStr}: ${sanitizeMessage(error.message)}`);
      return [];
    }
  });
}
module.exports = {
  getStreams,
  validateInput,
  sanitizeMessage,
  PROVIDER_NAME
};
