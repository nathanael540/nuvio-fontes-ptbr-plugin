/** raflix - gerado a partir de src/raflix/ — não edite manualmente. */
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
  NON_PT_BR: "Gringo",
  UNKNOWN: "Idioma Desconhecido"
});
var LANGUAGE_MODES = Object.freeze(Object.values(LANGUAGE));
var UNKNOWN_LANGUAGE = LANGUAGE.UNKNOWN;
var EXACT_MAPPINGS = [
  ["dublado", LANGUAGE.DUBBED],
  ["dublado nao pt br", LANGUAGE.DUBBED_NON_PT_BR],
  ["por", LANGUAGE.DUBBED_NON_PT_BR],
  ["portugues dialeto desconhecido", LANGUAGE.DUBBED_NON_PT_BR],
  ["legendado", LANGUAGE.SUBTITLED],
  ["legendado nao pt br", LANGUAGE.SUBTITLED_NON_PT_BR],
  ["legendado dialeto desconhecido", LANGUAGE.SUBTITLED_NON_PT_BR],
  ["nao pt br", LANGUAGE.NON_PT_BR],
  ["gringo", LANGUAGE.NON_PT_BR],
  ["idioma desconhecido", LANGUAGE.UNKNOWN]
];
var KNOWN_FOREIGN_REGEX = /\b(?:ingles|english|espanhol|espanol|spanish|latino|castellano|castelhano|japones|japanese|frances|francais|french|alemao|deutsch|german|italiano|italian|coreano|korean|russo|russian|mandarim|chines|chinese|turco|turca|turkce|turkish|arabe|arabic|hindi|tailandes|thai|vietnamita|vietnamese|polones|polaco|polski|polish|holandes|nederlands|dutch|sueco|sueca|svenska|swedish|dinamarques|dansk|danish|noruegues|norsk|norwegian|finlandes|suomi|finnish|grego|grega|greek|hebraico|hebrew|tcheco|checo|czech|hungaro|hungarian|romeno|romanian|ucraniano|ukrainian|persa|persian|indonesio|indonesian|malaio|malay|filipino|bengali|tamil|telugu|urdu|swahili)\b/;
var BRAZIL_REGION_REGEX = /\b(?:ptbr|pt br|pob|brazil|brasil|brazilian|brasileiro|brasileira|br)\b/;
var NON_BR_REGION_REGEX = /\b(?:ptpt|pt pt|portugal|european|europeu|europeia)\b/;
var EXPLICIT_PT_REGEX = /\b(?:portugues|portuguese)\b/;
var DUAL_AUDIO_REGEX = /\b(?:dual|tri)\s+audio\b/;
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
  const cleaned = normalized.replace(/\b(?:brrip|bdrip|br rip|bd rip)\b/g, " ").replace(/\b(dual|tri)\s+audio(?=(?:hdr|mkv|mp4|web|bluray|dublado|legendado)\b)/g, "$1 audio ").replace(/\bdublada\b/g, "dublado").replace(/\blegendada\b/g, "legendado").trim();
  const hasExplicitPt = EXPLICIT_PT_REGEX.test(cleaned);
  const hasBr = BRAZIL_REGION_REGEX.test(cleaned);
  const hasNonBr = NON_BR_REGION_REGEX.test(cleaned);
  const hasForeign = KNOWN_FOREIGN_REGEX.test(cleaned);
  const hasDualAudio = DUAL_AUDIO_REGEX.test(cleaned);
  const hasDublado = /\b(?:dublado|dublados|dubladas|dubbed|nacional)\b/.test(cleaned);
  const hasAudio = hasDublado || /\b(?:dub|dublagem|dublagens)\b/.test(cleaned) || hasDualAudio || /\baudio\b/.test(cleaned) && (hasBr || hasNonBr || hasExplicitPt);
  const hasSub = /\b(?:leg|legendado|legendados|legendadas|legendagem|legendagens|legenda|legendas|sub|subbed|subtitled|subtitles?|softsub)\b/.test(cleaned);
  const result = {};
  if (hasAudio) {
    if (hasNonBr) {
      result.audio = "non_pt_br";
    } else if (hasExplicitPt && !hasBr) {
      result.audio = "non_pt_br";
    } else if (hasDualAudio && !hasBr && !hasDublado) {
      result.audio = "non_pt_br";
    } else {
      result.audio = "pt_br";
    }
  }
  if (hasSub) {
    if (hasForeign && !hasExplicitPt && !hasBr && !hasNonBr) {
      result.foreign = true;
    } else if (hasNonBr) {
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
function playbackHeaders(pageUrl, options = {}) {
  const userAgent = options.userAgent === void 0 ? DEFAULT_USER_AGENT : options.userAgent;
  if (typeof userAgent !== "string" || userAgent.trim() === "") {
    throw new Error(`userAgent inv\xE1lido: "${options.userAgent}" (esperado texto n\xE3o vazio)`);
  }
  return { "User-Agent": userAgent, Referer: pageUrl, Origin: httpOrigin(pageUrl) };
}
function httpOrigin(pageUrl) {
  const invalid = new Error(`pageUrl inv\xE1lida: "${pageUrl}" (esperada URL http ou https)`);
  if (typeof pageUrl !== "string") throw invalid;
  let parsed;
  try {
    parsed = new URL(pageUrl);
  } catch (e) {
    throw invalid;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw invalid;
  return parsed.origin;
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

// src/raflix/shared.js
var HTTP_PROTOCOLS2 = ["http:", "https:"];
function isPlainObject3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readText3(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} deve ser texto n\xE3o vazio (recebido: ${String(value)})`);
  }
  return value.trim();
}
function optionalText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}
function readHttpUrl2(value, base, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} deve ser texto n\xE3o vazio (recebido: ${String(value)})`);
  }
  let url;
  try {
    url = new URL(value.trim(), base);
  } catch (cause) {
    throw new Error(`${label} n\xE3o \xE9 URL v\xE1lida: ${value}`, { cause });
  }
  if (!HTTP_PROTOCOLS2.includes(url.protocol)) {
    throw new Error(`${label} deve ser URL http(s) (recebido: ${value})`);
  }
  return url.href;
}
function sanitizeMessage(message) {
  return String(message).replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/g, "$1").replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]");
}
function displayProvider(value) {
  const text = String(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function readYear(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  const match = /\b(\d{4})\b/.exec(value);
  return match === null ? null : Number(match[1]);
}

// src/raflix/boot.js
var PT_BR_TRACK = "brazilian portuguese";
var ORIGINAL_TRACK = "original";
var PT_LANG = "pt";
var SUBTITLE_LANGUAGE = "Portugu\xEAs";
function loadBoot(origin, path) {
  return __async(this, null, function* () {
    const url = `${origin}/api/boot/${path}`;
    const body = yield fetchJson(url, { profile: "api", headers: { Referer: `${origin}/` } });
    if (!isPlainObject3(body) || !isPlainObject3(body.meta)) {
      throw new Error(`Boot do VidRift sem "meta" em ${url}`);
    }
    const meta = body.meta;
    if (meta.unreleased || meta.inCinemas || meta.airsSoon) return { absent: true };
    if (meta.orionStreams !== null && !Array.isArray(meta.orionStreams)) {
      throw new Error('Boot do VidRift com "meta.orionStreams" inv\xE1lido');
    }
    const playbackToken = readText3(meta.playbackToken, "meta.playbackToken");
    return {
      absent: false,
      playbackToken,
      tracks: (meta.orionStreams || []).map((item, index) => readTrack(item, index, origin))
    };
  });
}
function selectDubladoTrack(tracks) {
  return tracks.find((track) => track.type === "hls" && track.name.toLowerCase().includes(PT_BR_TRACK)) || null;
}
function selectOriginalTrack(tracks) {
  return tracks.find((track) => track.name.toLowerCase().includes(ORIGINAL_TRACK)) || null;
}
function readPtSubtitle(_0) {
  return __async(this, arguments, function* ({ track, origin, path }) {
    const failures = [];
    if (track && track.subtitleListUrl) {
      try {
        const body = yield fetchJson(track.subtitleListUrl, {
          profile: "api",
          headers: { Referer: `${origin}/` }
        });
        if (!isPlainObject3(body) || !Array.isArray(body.tracks)) {
          throw new Error('Lista de legendas do VidRift sem "tracks"');
        }
        const pt = body.tracks.find((item) => {
          var _a;
          return isPlainObject3(item) && ((_a = optionalText(item.lang)) == null ? void 0 : _a.toLowerCase()) === PT_LANG;
        });
        if (pt) {
          const url = readHttpUrl2(pt.url, `${origin}/`, "legenda PT do VidRift");
          const label = optionalText(pt.label);
          return {
            subtitle: __spreadProps(__spreadValues({
              url,
              language: SUBTITLE_LANGUAGE
            }, label === null ? {} : { name: label }), {
              headers: playbackHeaders(`${origin}/`)
            }),
            failures
          };
        }
      } catch (error) {
        failures.push(`Orion: ${error.message}`);
      }
    }
    const genericUrl = `${origin}/api/subtitles/${path}/Portuguese`;
    try {
      const body = yield fetchText(genericUrl, { profile: "player" });
      if (/^WEBVTT(?:\r?\n|$)/.test(body.trim())) {
        return { subtitle: { url: genericUrl, language: SUBTITLE_LANGUAGE }, failures };
      }
      failures.push("Legenda gen\xE9rica: resposta n\xE3o \xE9 VTT");
    } catch (error) {
      if (!error.message.startsWith("HTTP 404")) failures.push(`Legenda gen\xE9rica: ${error.message}`);
    }
    return { subtitle: null, failures };
  });
}
function readTrack(item, index, origin) {
  if (!isPlainObject3(item)) throw new Error(`Boot do VidRift com faixa ${index} inv\xE1lida`);
  const label = `meta.orionStreams[${index}]`;
  return {
    name: readText3(item.name, `${label}.name`),
    type: readText3(item.type, `${label}.type`).toLowerCase(),
    url: readHttpUrl2(item.url, `${origin}/`, `${label}.url`),
    provider: optionalText(item.provider) || "Orion",
    rungs: readRungs(item.rungs, index),
    subtitleListUrl: item.subtitleListUrl === void 0 || item.subtitleListUrl === null ? null : readHttpUrl2(item.subtitleListUrl, `${origin}/`, `${label}.subtitleListUrl`)
  };
}
function readRungs(value, index) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`meta.orionStreams[${index}].rungs deve ser lista`);
  const heights = [];
  for (const rung of value) {
    if (isPlainObject3(rung) && Number.isInteger(rung.height) && rung.height > 0) heights.push(rung.height);
  }
  return heights;
}

// src/raflix/streams.js
var ADDON = "Raflix";
var PARENT = "raflix.web.id";
var PROVIDERS = ["vela", "titan", "atlas"];
var QUALITY_P = /(\d{3,4})p/i;
var QUALITY_SEGMENT = /(?:^|\/)(\d{3,4})(?=\/|$)/;
var KNOWN_HEIGHTS2 = [144, 240, 360, 480, 540, 576, 720, 1080, 1440, 2160, 4320];
function buildOrionStream({ track, language, subtitle, media, request: request2, origin }) {
  const fields = {
    url: track.url,
    format: formatDetails(media, request2),
    provider: track.provider,
    type: "hls",
    language,
    headers: playbackHeaders(`${origin}/`)
  };
  if (subtitle !== null) fields.subtitles = [subtitle];
  const quality = maxRung(track.rungs);
  if (quality !== null) fields.quality = `${quality}p`;
  return buildStream(fields);
}
function resolveContingency(_0) {
  return __async(this, arguments, function* ({ origin, path, token, subtitle, media, request: request2 }) {
    const failures = [];
    for (const provider of PROVIDERS) {
      try {
        const streams = yield fetchSourceStreams({ origin, path, token, provider, subtitle, media, request: request2 });
        if (streams.length > 0) return { streams, failures };
      } catch (error) {
        const cause = sanitizeMessage(error.message);
        failures.push(`${provider}: ${cause}`);
        console.warn(`[${ADDON}] Op\xE7\xE3o ${displayProvider(provider)} descartada: ${cause}`);
      }
    }
    return { streams: [], failures };
  });
}
function fetchSourceStreams(_0) {
  return __async(this, arguments, function* ({ origin, path, token, provider, subtitle, media, request: request2 }) {
    var _a;
    const params = { token, provider, parent: PARENT, hevc: "0" };
    const url = `${origin}/api/source/${path}?${new URLSearchParams(params).toString()}`;
    const body = yield fetchJson(url, { profile: "api", headers: { Referer: `${origin}/` } });
    if (!isPlainObject3(body)) throw new Error("Resposta de /api/source n\xE3o \xE9 objeto");
    if (body.success !== true) throw new Error(`Resposta de /api/source com success=${String(body.success)}`);
    if (!Array.isArray(body.streams)) throw new Error('Resposta de /api/source sem "streams"');
    const maxRes = Number.isInteger(body.maxRes) ? body.maxRes : null;
    const streams = [];
    for (const item of body.streams) {
      if (!isPlainObject3(item)) throw new Error("Item de stream do /api/source inv\xE1lido");
      const type = (_a = optionalText(item.type)) == null ? void 0 : _a.toLowerCase();
      if (type !== "hls") continue;
      const chosen = optionalText(item.url) || optionalText(item.proxyUrl);
      if (chosen === null) throw new Error("Stream do /api/source sem url nem proxyUrl");
      const finalUrl = readHttpUrl2(chosen, `${origin}/`, "stream do /api/source");
      const direct = item.direct === true;
      const quality = qualityFromUrl(finalUrl) || (body.streams.length === 1 ? maxResQuality(maxRes) : null);
      const headers = direct && !sameOrigin(finalUrl, origin) ? void 0 : playbackHeaders(`${origin}/`);
      const fields = {
        url: finalUrl,
        format: formatDetails(media, request2),
        provider: optionalText(item.provider) || displayProvider(provider),
        type: "hls",
        language: LANGUAGE.SUBTITLED,
        subtitles: [subtitle]
      };
      if (quality !== null) fields.quality = quality;
      if (headers !== void 0) fields.headers = headers;
      streams.push(buildStream(fields));
    }
    return streams;
  });
}
function formatDetails(media, request2) {
  const format = { template: FORMATTER.AUTO, addon: ADDON, title: media.title };
  if (media.year !== void 0) format.year = media.year;
  if (request2.mediaType === "tv") {
    format.season = request2.season;
    format.episode = request2.episode;
  }
  return format;
}
function maxRung(rungs) {
  if (!Array.isArray(rungs) || rungs.length === 0) return null;
  let max = 0;
  for (const height of rungs) {
    if (Number.isInteger(height) && height > max) max = height;
  }
  return max > 0 ? max : null;
}
function qualityFromUrl(url) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch (e) {
    return null;
  }
  try {
    path = decodeURIComponent(path);
  } catch (e) {
  }
  const compact = QUALITY_P.exec(path);
  if (compact) return `${compact[1]}p`;
  const segment = QUALITY_SEGMENT.exec(path);
  if (segment && KNOWN_HEIGHTS2.includes(Number(segment[1]))) return `${segment[1]}p`;
  return null;
}
function maxResQuality(maxRes) {
  if (!Number.isInteger(maxRes) || maxRes < 360 || maxRes > 2160) return null;
  return `${maxRes}p`;
}
function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch (e) {
    return false;
  }
}

// src/raflix/api.js
var CATALOG_BASE = "https://raflix.web.id";
var TMDB_ID = /^[1-9]\d*$/;
var SOURCE_ID = "vidrift";
var EMBED_PATH = /^\/embed\/((?:movie\/[1-9]\d*)|(?:tv\/[1-9]\d*\/[1-9]\d*\/[1-9]\d*))\/?$/;
function validateRequest(request2) {
  const rawId = request2.tmdbId === void 0 || request2.tmdbId === null ? "" : request2.tmdbId;
  const tmdbId = String(rawId).trim();
  if (!TMDB_ID.test(tmdbId)) throw new Error(`ID do TMDB inv\xE1lido: ${request2.tmdbId}`);
  if (request2.mediaType !== "movie" && request2.mediaType !== "tv") {
    throw new Error(`Tipo de m\xEDdia inv\xE1lido: "${request2.mediaType}" (esperado "movie" ou "tv")`);
  }
  if (request2.mediaType === "tv" && (!Number.isInteger(request2.season) || request2.season < 1 || !Number.isInteger(request2.episode) || request2.episode < 1)) {
    throw new Error(`S\xE9rie sem temporada/epis\xF3dio v\xE1lidos: temporada=${request2.season}, epis\xF3dio=${request2.episode}`);
  }
  request2.tmdbId = tmdbId;
  request2.season = request2.mediaType === "tv" ? request2.season : null;
  request2.episode = request2.mediaType === "tv" ? request2.episode : null;
  return request2;
}
function extractStreams(request2) {
  return __async(this, null, function* () {
    validateRequest(request2);
    request2.stage = "Metadados";
    const media = yield fetchMedia(request2);
    if (media === null) return [];
    request2.stage = "Fontes";
    const sourceUrl = yield fetchSourceUrl(request2);
    if (sourceUrl === null) return [];
    const { origin, path } = readEmbed(sourceUrl, request2);
    request2.stage = "Boot";
    const boot = yield loadBoot(origin, path);
    if (boot.absent) return [];
    request2.stage = "Faixas";
    const dubladoTrack = selectDubladoTrack(boot.tracks);
    const originalTrack = selectOriginalTrack(boot.tracks);
    request2.stage = "Legenda";
    const subtitleResult = yield readPtSubtitle({ track: originalTrack, origin, path });
    for (const failure of subtitleResult.failures) {
      console.warn(`[Raflix] Legenda PT descartada: ${sanitizeMessage(failure)}`);
    }
    const subtitle = subtitleResult.subtitle;
    if (dubladoTrack === null && subtitle === null && subtitleResult.failures.length > 0) {
      throw new Error(`Nenhuma legenda PT dispon\xEDvel: [${subtitleResult.failures.join("; ")}]`);
    }
    request2.stage = "M\xEDdia";
    const streams = [];
    if (dubladoTrack !== null) {
      streams.push(buildOrionStream({
        track: dubladoTrack,
        language: LANGUAGE.DUBBED,
        subtitle: null,
        media,
        request: request2,
        origin
      }));
    }
    const contingency = subtitle === null ? { streams: [], failures: [] } : yield resolveContingency({
      origin,
      path,
      token: boot.playbackToken,
      subtitle,
      media,
      request: request2
    });
    streams.push(...contingency.streams);
    if (dubladoTrack === null && contingency.streams.length === 0) {
      if (subtitle !== null && originalTrack !== null && originalTrack.type === "hls") {
        streams.push(buildOrionStream({
          track: originalTrack,
          language: LANGUAGE.SUBTITLED,
          subtitle,
          media,
          request: request2,
          origin
        }));
      } else if (subtitle !== null && contingency.failures.length > 0) {
        throw new Error(`Nenhuma op\xE7\xE3o de conting\xEAncia produziu stream: [${contingency.failures.join("; ")}]`);
      }
    }
    return dedupe(streams);
  });
}
function fetchMedia(request2) {
  return __async(this, null, function* () {
    const url = `${CATALOG_BASE}/api/media/${request2.mediaType}/${request2.tmdbId}`;
    let body;
    try {
      body = yield fetchJson(url, { profile: "api" });
    } catch (error) {
      if (error.message.startsWith("HTTP 404")) return null;
      throw error;
    }
    if (!isPlainObject3(body) || !isPlainObject3(body.media)) {
      throw new Error(`Metadados do Raflix sem "media" em ${url}`);
    }
    const title = readText3(body.media.title, "media.title");
    const year = readYear(body.media.year);
    return __spreadValues({ title }, year === null ? {} : { year });
  });
}
function fetchSourceUrl(request2) {
  return __async(this, null, function* () {
    const params = { type: request2.mediaType, tmdbId: request2.tmdbId };
    if (request2.mediaType === "tv") {
      params.season = String(request2.season);
      params.episode = String(request2.episode);
    }
    const url = `${CATALOG_BASE}/api/media/sources?${new URLSearchParams(params).toString()}`;
    const body = yield fetchJson(url, { profile: "api" });
    if (!isPlainObject3(body) || !Array.isArray(body.sources)) {
      throw new Error(`Lista de fontes do Raflix sem "sources" em ${url}`);
    }
    if (body.ok === false) throw new Error("Lista de fontes do Raflix respondeu ok=false");
    const source = body.sources.find((item) => isPlainObject3(item) && item.id === SOURCE_ID);
    if (source === void 0) return null;
    return readText3(source.url, `sources[${SOURCE_ID}].url`);
  });
}
function readEmbed(sourceUrl, request2) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch (cause) {
    throw new Error(`URL da fonte VidRift inv\xE1lida: ${sourceUrl}`, { cause });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`URL da fonte VidRift deve ser http(s): ${sourceUrl}`);
  }
  const match = EMBED_PATH.exec(url.pathname);
  if (match === null) {
    throw new Error(`URL da fonte VidRift fora do formato esperado: ${sourceUrl}`);
  }
  const path = match[1];
  const expected = request2.mediaType === "tv" ? `tv/${request2.tmdbId}/${request2.season}/${request2.episode}` : `movie/${request2.tmdbId}`;
  if (path !== expected) {
    throw new Error(`URL da fonte VidRift n\xE3o corresponde ao pedido: ${path} (esperado ${expected})`);
  }
  return { origin: url.origin, path };
}
function dedupe(streams) {
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const stream of streams) {
    if (seen.has(stream.url)) continue;
    seen.add(stream.url);
    unique.push(stream);
  }
  return unique;
}

// src/raflix/index.js
var PROVIDER_NAME = "Raflix";
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const request2 = { tmdbId, mediaType, season, episode, stage: "Entrada" };
    try {
      return sortByQuality(yield extractStreams(request2));
    } catch (error) {
      console.error(`[${PROVIDER_NAME}] ${request2.stage}: ${sanitizeMessage(error.message)}`);
      return [];
    }
  });
}
module.exports = { getStreams };
