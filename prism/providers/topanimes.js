/** topanimes (formato prism) - gerado a partir de src/topanimes/ — não edite manualmente. */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
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
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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
  if (true) {
    return checkTemplate("prism", "NUVIO_FORMATTER (constante de build)", CONCRETE_TEMPLATES);
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

// src/_blocks/tmdb-info/index.mjs
var TMDB_API_URL = "https://api.themoviedb.org/3";
var LANGUAGE2 = "pt-BR";
var BRAZIL = "BR";
var ANIMATION_GENRE_ID = 16;
var DORAMA_LANGUAGES = ["ko", "zh", "cn", "ja", "th"];
function getMediaInfo(request2) {
  return __async(this, null, function* () {
    const tmdbId = String(request2.tmdbId).trim();
    const { mediaType: mediaType2 } = request2;
    if (!/^\d+$/.test(tmdbId)) {
      throw new Error(`tmdbId inv\xE1lido: "${request2.tmdbId}" (esperado ID num\xE9rico do TMDB)`);
    }
    if (mediaType2 !== "movie" && mediaType2 !== "tv") {
      throw new Error(`mediaType inv\xE1lido: "${mediaType2}" (esperado "movie" ou "tv")`);
    }
    const url = `${TMDB_API_URL}/${mediaType2}/${tmdbId}?api_key=${encodeURIComponent(readApiKey())}&language=${LANGUAGE2}&append_to_response=external_ids,alternative_titles`;
    const response = yield fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB respondeu HTTP ${response.status} para ${mediaType2} ${tmdbId}`);
    }
    return toMediaInfo(yield response.json(), tmdbId, mediaType2);
  });
}
function readApiKey() {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== "string" || key.trim() === "") {
    throw new Error("TMDB_API_KEY indispon\xEDvel: o app n\xE3o forneceu a chave do TMDB ao plugin");
  }
  return key.trim();
}
function toMediaInfo(data, tmdbId, mediaType2) {
  const isMovie = mediaType2 === "movie";
  const title = isMovie ? data.title : data.name;
  const originalTitle = isMovie ? data.original_title : data.original_name;
  const releaseDate = isMovie ? data.release_date : data.first_air_date;
  const alternatives = data.alternative_titles && (isMovie ? data.alternative_titles.titles : data.alternative_titles.results);
  const context = `${mediaType2} ${tmdbId}`;
  if (!title || !originalTitle) throw new Error(`TMDB n\xE3o retornou t\xEDtulo para ${context}`);
  if (!data.external_ids) throw new Error(`TMDB n\xE3o retornou external_ids para ${context}`);
  if (!Array.isArray(alternatives)) throw new Error(`TMDB n\xE3o retornou alternative_titles para ${context}`);
  const genreIds = (data.genres || []).map((genre) => genre.id);
  const originalLanguage = data.original_language;
  return {
    tmdbId,
    mediaType: mediaType2,
    kind: classifyKind(mediaType2, originalLanguage, genreIds),
    title,
    originalTitle,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    imdbId: data.external_ids.imdb_id || null,
    alternativeTitles: brazilianAlternativeTitles(alternatives, title),
    romajiTitles: romajiAlternativeTitles(alternatives),
    seasons: isMovie ? [] : readSeasons(data.seasons),
    originalLanguage,
    originCountries: data.origin_country || [],
    genreIds
  };
}
function romajiAlternativeTitles(alternatives) {
  const titles = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of alternatives) {
    if (!item || typeof item !== "object") continue;
    const type = typeof item.type === "string" ? item.type : "";
    if (!/romaji|romanized/i.test(type)) continue;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (title === "") continue;
    const match = /season\s+(\d+)/i.exec(type);
    const season = match ? Number(match[1]) : null;
    const key = `${title.toLowerCase()}\0${season === null ? "" : season}`;
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push({ title, season });
  }
  return titles;
}
function readSeasons(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((season) => {
    const { season_number: number, episode_count: episodeCount, name, air_date: airDate } = season;
    if (!Number.isInteger(number) || !Number.isInteger(episodeCount)) {
      throw new Error("TMDB retornou temporada sem n\xFAmero ou contagem de epis\xF3dios");
    }
    return {
      number,
      episodeCount,
      name: typeof name === "string" ? name : "",
      airDate: typeof airDate === "string" && airDate !== "" ? airDate : null,
      year: readYear(airDate)
    };
  });
}
function readYear(value) {
  if (typeof value !== "string" || !/^\d{4}/.test(value)) return null;
  return Number(value.slice(0, 4));
}
function brazilianAlternativeTitles(alternatives, title) {
  const titles = alternatives.filter((item) => item.iso_3166_1 === BRAZIL).map((item) => item.title);
  return [...new Set(titles)].filter((item) => item !== title);
}
function classifyKind(mediaType2, originalLanguage, genreIds) {
  const isAnimation = genreIds.includes(ANIMATION_GENRE_ID);
  if (isAnimation && originalLanguage === "ja") return "anime";
  if (mediaType2 === "movie") return "movie";
  if (!isAnimation && DORAMA_LANGUAGES.includes(originalLanguage)) return "dorama";
  return "series";
}

// src/_blocks/title-match/index.mjs
function titleSimilarity(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    throw new Error(`titleSimilarity espera duas strings, recebeu ${typeof a} e ${typeof b}`);
  }
  const plainA = a.trim().toLowerCase();
  if (plainA !== "" && plainA === b.trim().toLowerCase()) return 1;
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);
  if (normalizedA === "" || normalizedB === "") return 0;
  if (normalizedA === normalizedB) return 1;
  return diceCoefficient(normalizedA.split(" ").join(""), normalizedB.split(" ").join(""));
}
function diceCoefficient(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const counts = /* @__PURE__ */ new Map();
  for (const bigram of bigrams(a)) counts.set(bigram, (counts.get(bigram) || 0) + 1);
  let common = 0;
  const bigramsB = bigrams(b);
  for (const bigram of bigramsB) {
    const count = counts.get(bigram) || 0;
    if (count > 0) {
      counts.set(bigram, count - 1);
      common += 1;
    }
  }
  return 2 * common / (a.length - 1 + bigramsB.length);
}
function bigrams(text) {
  const result = [];
  for (let i = 0; i < text.length - 1; i += 1) result.push(text.slice(i, i + 2));
  return result;
}

// src/topanimes/catalog.js
var SOURCE_URL = "https://topanimes.net";
var SOURCE_HOST = "topanimes.net";
var MAX_SEARCH_TERMS = 8;
var MIN_TITLE_SCORE = 0.88;
var YEAR_TOLERANCE = 1;
var NUMERANDO = /^(\d+)\s*-\s*(\d+)$/;
var TRAILING_YEAR = /(\d{4})\s*$/;
function buildSearchTerms(media, season) {
  if (media === null || typeof media !== "object" || typeof media.title !== "string") {
    throw new Error("media inv\xE1lida: esperado objeto com title string");
  }
  const terms = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    const key = normalizeText(text);
    if (text === "" || key === "" || seen.has(key)) return;
    seen.add(key);
    terms.push(text);
  };
  if (Number.isInteger(season)) {
    for (const item of media.romajiTitles || []) {
      if (item && item.season === season) add(item.title);
    }
  }
  add(media.title);
  add(media.originalTitle);
  for (const item of media.romajiTitles || []) add(item && item.title);
  for (const title of media.alternativeTitles || []) add(title);
  return terms.slice(0, MAX_SEARCH_TERMS);
}
function searchUrl(term) {
  return `${SOURCE_URL}/?s=${encodeURIComponent(term)}`;
}
function parseSearchResults(html) {
  const $ = loadHtml(html);
  if (!$(".search-page").length) throw new Error("Busca sem o cont\xEAiner .search-page");
  if ($(".no-result").length) return [];
  const cards = $("article");
  const results = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const link = card.find(".title a").eq(0);
    const href = link.attr("href");
    const title = link.text().trim();
    if (typeof href !== "string" || href.trim() === "") {
      throw new Error(`Cart\xE3o ${index + 1} da busca sem link`);
    }
    if (title === "") throw new Error(`Cart\xE3o ${index + 1} da busca sem t\xEDtulo`);
    const url = resolveUrl(href, SOURCE_URL);
    results.push({
      title,
      year: readCardYear(card.find(".year").text(), card.find(".meta").text()),
      url: url.href,
      kind: readKind(url)
    });
  }
  return results;
}
function cleanTitle(title, kind) {
  let text = title.replace(/\s+/g, " ").trim();
  text = text.replace(/\s*\((?:tv|camrip|cam-rip|dublado|legendado)\)\s*$/i, "");
  text = text.replace(/[\s\-–—]*(?:dublado|legendado)\s*$/i, "");
  text = text.replace(/[\s\-–—]*(?:online|filme)\s*$/i, "");
  if (kind === "tv") {
    text = text.replace(/[\s\-–—]*(?:season|temporada)\s*\d+\s*$/i, "");
    text = text.replace(/[\s\-–—]*\d+\s*ª\s*temporada\s*$/i, "");
    text = text.replace(/[\s\-–—]*(?:part|parte)\s*\d+\s*$/i, "");
    text = text.replace(/\s+\d{1,2}\s*$/, "");
  }
  return text.trim();
}
function declaredSeason(title) {
  const text = title.replace(/\s*\((?:tv|camrip|cam-rip|dublado|legendado)\)\s*$/i, "").replace(/[\s\-–—]*(?:dublado|legendado)\s*$/i, "").replace(/\s+/g, " ").trim();
  const named = /(?:season|temporada)\s*(\d+)/i.exec(text) || /(\d+)\s*ª\s*temporada/i.exec(text);
  if (named) return Number(named[1]);
  if (/(?:part|parte)\s*\d+/i.test(text)) return null;
  const trailing = /\s(\d{1,2})\s*$/.exec(text);
  return trailing ? Number(trailing[1]) : null;
}
function matchCandidate(result, media, season) {
  if (result.kind !== media.mediaType) return null;
  const expected = expectedYear(media, season);
  if (result.year !== null && expected !== null && Math.abs(result.year - expected) > YEAR_TOLERANCE) {
    return null;
  }
  const clean = cleanTitle(result.title, media.mediaType);
  const keys = titleKeys(media, season);
  const score = Math.max(...keys.map((key) => titleSimilarity(clean, key)));
  const prefix = media.mediaType === "tv" && keys.some((key) => startsWithTitle(clean, key));
  if (score < MIN_TITLE_SCORE && !prefix) return null;
  return {
    result,
    cleanTitle: clean,
    score,
    seasonScore: Number.isInteger(season) && declaredSeason(result.title) === season ? 1 : 0
  };
}
function readDetail(html) {
  const $ = loadHtml(html);
  const title = $("h1").eq(0).text().trim();
  if (title === "") throw new Error("Ficha sem h1");
  return { title };
}
function selectEpisode(html, media, season, episode, pageTitle) {
  const $ = loadHtml(html);
  const list2 = $("ul.episodios");
  if (!list2.length) return null;
  const hasNumerando = $(".numerando").length > 0;
  const declared = declaredSeason(pageTitle);
  const target = !hasNumerando && declared === season ? episode : absoluteEpisode(media, season, episode);
  const items = list2.find("li");
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const href = item.find("a[href]").eq(0).attr("href");
    if (typeof href !== "string" || href.trim() === "") {
      throw new Error(`Epis\xF3dio ${index + 1} da lista sem link`);
    }
    if (hasNumerando) {
      const match = NUMERANDO.exec(item.find(".numerando").eq(0).text().trim());
      if (match && Number(match[1]) === season && Number(match[2]) === episode) {
        return resolveUrl(href, SOURCE_URL).href;
      }
      continue;
    }
    const number = readEpisodeNumber(item);
    if (number === target) return resolveUrl(href, SOURCE_URL).href;
  }
  return null;
}
function absoluteEpisode(media, season, episode) {
  let total = episode;
  for (const item of media.seasons || []) {
    if (item.number > 0 && item.number < season) total += item.episodeCount;
  }
  return total;
}
function readOptions(html, baseUrl) {
  const $ = loadHtml(html);
  const options = [];
  const items = $("li.dooplay_player_option");
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const nume = item.attr("data-nume");
    if (typeof nume !== "string" || !/^\d+$/.test(nume.trim())) continue;
    const number = Number(nume.trim());
    const label = item.find(".title").eq(0).text().trim() || `Op\xE7\xE3o ${number}`;
    const iframe = $(`#source-player-${number} iframe`).eq(0).attr("src");
    if (typeof iframe !== "string" || iframe.trim() === "") continue;
    options.push({ number, label, url: resolveUrl(iframe, baseUrl).href });
  }
  return options;
}
function titleKeys(media, season) {
  const keys = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    const key = normalizeText(text);
    if (text === "" || key === "" || seen.has(key)) return;
    seen.add(key);
    keys.push(text);
  };
  if (Number.isInteger(season)) {
    for (const item of media.romajiTitles || []) {
      if (item && item.season === season) add(item.title);
    }
  }
  add(media.title);
  add(media.originalTitle);
  for (const item of media.romajiTitles || []) add(item && item.title);
  for (const title of media.alternativeTitles || []) add(title);
  return keys;
}
function expectedYear(media, season) {
  if (media.mediaType !== "tv" || !Number.isInteger(season)) return media.year;
  const found = (media.seasons || []).find((item) => item.number === season);
  return found && found.year !== null ? found.year : media.year;
}
function confirmDetail(detail, candidate, media, season) {
  const checked = matchCandidate(
    __spreadProps(__spreadValues({}, candidate.result), { title: detail.title }),
    media,
    season
  );
  return checked !== null;
}
function audioFromText(text) {
  const dublado = /\bdublado\b/i.test(text);
  const legendado = /\blegendado\b/i.test(text);
  if (dublado && !legendado) return "Dublado";
  if (legendado && !dublado) return "Legendado";
  return null;
}
function readCardYear(yearText, metaText) {
  const direct = /^\s*(\d{4})\s*$/.exec(yearText);
  if (direct) return Number(direct[1]);
  const match = TRAILING_YEAR.exec(metaText.trim());
  return match ? Number(match[1]) : null;
}
function readKind(url) {
  if (url.hostname !== SOURCE_HOST) return null;
  if (url.pathname.startsWith("/filmes/")) return "movie";
  if (url.pathname.startsWith("/animes/")) return "tv";
  return null;
}
function readEpisodeNumber(item) {
  const hidden = Number(item.find(".epnumber").eq(0).text().trim());
  if (Number.isInteger(hidden) && hidden > 0) return hidden;
  const text = Number(item.find("a").eq(0).text().trim());
  return Number.isInteger(text) && text > 0 ? text : null;
}
function startsWithTitle(clean, key) {
  const a = normalizeText(clean);
  const b = normalizeText(key);
  return a !== "" && b !== "" && (a === b || a.startsWith(`${b} `));
}
function resolveUrl(value, base) {
  try {
    return new URL(value, base);
  } catch (error) {
    throw new Error(`Endere\xE7o inv\xE1lido: "${value}"`, { cause: error });
  }
}
function loadHtml(html) {
  const { load } = require("cheerio-without-node-native");
  return load(html);
}

// src/_blocks/blogger-video/index.mjs
var HTTP_PROTOCOLS2 = ["http:", "https:"];
function extractBloggerFormats(html) {
  const data = readStreamingData(decodeHtmlEntities(html));
  if (!data || !Array.isArray(data.formats)) throw new Error("Player do Blogger sem streamingData.formats");
  const formats = [];
  for (const item of data.formats) {
    if (!item || typeof item !== "object") continue;
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!isHttpUrl(url)) continue;
    const qualityLabel = typeof item.qualityLabel === "string" ? item.qualityLabel.trim() : "";
    formats.push({ url, qualityLabel: qualityLabel === "" ? null : qualityLabel });
  }
  if (formats.length === 0) throw new Error("Player do Blogger sem MP4 progressivo");
  return formats;
}
function readStreamingData(text) {
  const marker = '"{\\"streamingData\\"';
  const start = text.indexOf(marker);
  if (start !== -1) {
    const end2 = findStringEnd(text, start);
    try {
      const parsed = JSON.parse(JSON.parse(text.slice(start, end2 + 1)));
      return parsed.streamingData;
    } catch (error) {
      throw new Error(`Player do Blogger com streamingData inv\xE1lido: ${error.message}`, { cause: error });
    }
  }
  const index = text.indexOf('"streamingData"');
  if (index === -1) throw new Error("Player do Blogger sem streamingData");
  const open = text.lastIndexOf("{", index);
  const end = findObjectEnd(text, open);
  try {
    const parsed = JSON.parse(text.slice(open, end + 1));
    return parsed.streamingData;
  } catch (error) {
    throw new Error(`Player do Blogger com streamingData inv\xE1lido: ${error.message}`, { cause: error });
  }
}
function findStringEnd(text, start) {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === '"') return index;
  }
  throw new Error("String de streamingData sem fechamento");
}
function findObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Objeto de streamingData sem fechamento");
}
function decodeHtmlEntities(text) {
  return text.replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#x0*27;/gi, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function isHttpUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    return HTTP_PROTOCOLS2.includes(new URL(value.trim()).protocol);
  } catch (e) {
    return false;
  }
}

// src/topanimes/byse.js
var import_crypto_js = __toESM(require("crypto-js"));
var KEY_BYTES = 32;
var IV_BYTES = 12;
var GCM_TAG_BYTES = 16;
var MAX_VERSION = 20;
function decryptPlayback(playback) {
  if (!playback || typeof playback !== "object") throw new Error("Playback ausente");
  const parts = selectKeyParts(playback);
  const key = concatBytes(parts.map((part2, index) => decodeBase64Url(part2, `key_parts[${index}]`)), "chave");
  if (key.length !== KEY_BYTES) throw new Error(`Chave do playback com ${key.length} bytes (esperados ${KEY_BYTES})`);
  const iv = decodeBase64Url(playback.iv, "iv");
  if (iv.length !== IV_BYTES) throw new Error(`IV do playback com ${iv.length} bytes (esperados ${IV_BYTES})`);
  const payload = decodeBase64Url(playback.payload, "payload");
  if (payload.length <= GCM_TAG_BYTES) throw new Error("Payload do playback menor que a tag GCM");
  const plain = decryptGcm(key, iv, payload.subarray(0, payload.length - GCM_TAG_BYTES));
  let json;
  try {
    json = import_crypto_js.default.enc.Utf8.stringify(toWordArray(plain));
  } catch (error) {
    throw new Error("Playback decifrado n\xE3o \xE9 UTF-8 v\xE1lido", { cause: error });
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error("Playback decifrado n\xE3o \xE9 JSON v\xE1lido", { cause: error });
  }
}
function selectKeyParts(playback) {
  const parts = playback.key_parts;
  if (!Array.isArray(parts) || parts.length === 0) throw new Error("key_parts ausente no playback");
  if (!parts.every((part2) => typeof part2 === "string" && part2.trim() !== "")) {
    throw new Error("key_parts cont\xE9m parte vazia ou inv\xE1lida");
  }
  const version = readVersion(playback.version);
  if (version === null) return parts;
  const first = version - 1;
  const second = 30 - version;
  if (first < 0 || first >= parts.length || second < 0 || second >= parts.length) return parts;
  return [parts[first], parts[second]];
}
function readVersion(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const version = Number(text);
  return version >= 1 && version <= MAX_VERSION ? version : null;
}
function decryptGcm(key, iv, ciphertext) {
  const keyWords = toWordArray(key);
  const counter = new Uint8Array(16);
  counter.set(iv, 0);
  counter[15] = 2;
  const plain = new Uint8Array(ciphertext.length);
  for (let offset = 0; offset < ciphertext.length; offset += 16) {
    const block = aesBlock(counter, keyWords);
    const length = Math.min(16, ciphertext.length - offset);
    for (let index = 0; index < length; index += 1) {
      plain[offset + index] = ciphertext[offset + index] ^ block[index];
    }
    incrementCounter(counter);
  }
  return plain;
}
function aesBlock(block, keyWords) {
  const encrypted = import_crypto_js.default.AES.encrypt(toWordArray(block), keyWords, {
    mode: import_crypto_js.default.mode.ECB,
    padding: import_crypto_js.default.pad.NoPadding
  });
  const bytes = fromWordArray(encrypted.ciphertext);
  if (bytes.length !== 16) throw new Error("Bloco de contador do playback com tamanho inv\xE1lido");
  return bytes;
}
function incrementCounter(counter) {
  for (let index = 15; index >= 12; index -= 1) {
    counter[index] = counter[index] + 1 & 255;
    if (counter[index] !== 0) break;
  }
}
function decodeBase64Url(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} ausente no playback`);
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch (error) {
    throw new Error(`${label} n\xE3o \xE9 base64url v\xE1lido`, { cause: error });
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function concatBytes(parts, label) {
  const length = parts.reduce((total, part2) => total + part2.length, 0);
  if (length === 0) throw new Error(`${label} vazia no playback`);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part2 of parts) {
    result.set(part2, offset);
    offset += part2.length;
  }
  return result;
}
function toWordArray(bytes) {
  const words2 = [];
  for (let index = 0; index < bytes.length; index += 1) {
    const position = index >>> 2;
    words2[position] = (words2[position] || 0) | bytes[index] << 24 - index % 4 * 8;
  }
  return import_crypto_js.default.lib.WordArray.create(words2, bytes.length);
}
function fromWordArray(wordArray) {
  const bytes = new Uint8Array(wordArray.sigBytes);
  for (let index = 0; index < wordArray.sigBytes; index += 1) {
    bytes[index] = wordArray.words[index >>> 2] >>> 24 - index % 4 * 8 & 255;
  }
  return bytes;
}

// src/topanimes/players.js
var SOURCE_URL2 = "https://topanimes.net";
var SOURCE_HOST2 = "topanimes.net";
var BOOONCEIVU_SUFFIX = ".booonceivu.shop";
var ANTIVIRUS_PATH = /^\/antivirus\d+\//;
var RUPLAY_HOST = /^(?:csst\.online|fsst\.online|incvideo\d+\.online)$/;
var FILEMOON_HOST = /^filemoon\.[a-z]{2,}$/;
var MODE = "to-salvando-seu-ip";
var PLAYBACK_HEADERS = Object.freeze({ "User-Agent": DEFAULT_USER_AGENT, Referer: `${SOURCE_URL2}/` });
var BOOONCEIVU_QUALITY = Object.freeze({ SD: "1080p", LD: "720p", FD: "360p" });
function resolveOption(option, pageUrl) {
  return __async(this, null, function* () {
    const url = new URL(option.url);
    const host = url.hostname.toLowerCase();
    if (host === SOURCE_HOST2) {
      if (url.pathname.startsWith("/off/")) return [];
      if (url.pathname.startsWith("/aviso/")) {
        const nested = url.searchParams.get("url");
        if (typeof nested !== "string" || nested.trim() === "") {
          throw new Error("Aviso sem o par\xE2metro url");
        }
        return resolveNested(nested, option.label);
      }
      if (ANTIVIRUS_PATH.test(url.pathname)) return resolveJwplayer(url.href, option.label, PLAYBACK_HEADERS);
      return [];
    }
    if (isBooonceivu(host)) return resolveBooonceivu(url.href, option.label, pageUrl);
    if (isBlogger(host)) return resolveBlogger(url.href, option.label);
    if (isRuplay(host)) return resolveRuplay(url.href, option.label);
    if (isFilemoon(host)) return resolveFilemoon(url.href, option.label);
    if (host === "litch.alibabacdn.net") return resolveJwplayer(url.href, option.label, void 0);
    return [];
  });
}
function resolveNested(raw, label) {
  return __async(this, null, function* () {
    const url = new URL(stripPosterSuffix(raw));
    if (url.protocol !== "http:" && url.protocol !== "https:") return [];
    const host = url.hostname.toLowerCase();
    if (isBooonceivu(host)) return resolveBooonceivu(url.href, label, `${SOURCE_URL2}/`);
    if (isBlogger(host)) return resolveBlogger(url.href, label);
    if (isRuplay(host)) return resolveRuplay(url.href, label);
    if (isFilemoon(host)) return resolveFilemoon(url.href, label);
    if (host === "litch.alibabacdn.net") return resolveJwplayer(url.href, label, void 0);
    return [];
  });
}
function resolveBooonceivu(url, label, pageUrl) {
  return __async(this, null, function* () {
    const requestUrl = addMode(url);
    const text = yield fetchText(requestUrl, {
      profile: "page",
      headers: { Referer: pageUrl || `${SOURCE_URL2}/` }
    });
    const data = tryJson(text);
    if (data !== null && typeof data === "object" && !Array.isArray(data) && typeof data.status === "string") {
      if (data.status !== "success") return [];
      if (!Array.isArray(data.midias)) throw new Error("Booonceivu sem a lista midias");
      const subtitles = readSubtitles2(data.legendas);
      return data.midias.map((item) => {
        if (item === null || typeof item !== "object" || typeof item.url !== "string") {
          throw new Error("Booonceivu com m\xEDdia sem url");
        }
        const mediaUrl = httpUrl(item.url, "Booonceivu midia");
        return {
          url: mediaUrl,
          type: mediaType(mediaUrl, "hls"),
          quality: booonceivuQuality(item.qualidade),
          provider: label,
          subtitles
        };
      });
    }
    const sources = readJwplayerSources(text);
    return sources.map((source) => __spreadProps(__spreadValues({}, source), { provider: label }));
  });
}
function resolveJwplayer(url, label, headers) {
  return __async(this, null, function* () {
    const text = yield fetchText(url, { profile: "page" });
    return readJwplayerSources(text).map((source) => __spreadProps(__spreadValues({}, source), { provider: label, headers }));
  });
}
function resolveBlogger(url, label) {
  return __async(this, null, function* () {
    const text = yield fetchText(url, { profile: "page" });
    return extractBloggerFormats(text).map((format) => ({
      url: format.url,
      type: "mp4",
      quality: qualityFromLabel(format.qualityLabel),
      provider: label,
      headers: { "User-Agent": DEFAULT_USER_AGENT }
    }));
  });
}
function resolveRuplay(url, label) {
  return __async(this, null, function* () {
    const embed = yield fetchPage(url, { profile: "page" });
    const file = readPlayerjsFile(embed.text);
    if (file === null) throw new Error("Embed Ruplay sem Playerjs/file");
    const sources = parsePlayerjsSources(file);
    if (sources.length === 0) throw new Error("Playerjs sem URL /get_file/");
    const headers = {
      "User-Agent": DEFAULT_USER_AGENT,
      Referer: `${new URL(embed.url).origin}/`
    };
    return sources.map((source) => ({
      url: source.url,
      type: "mp4",
      quality: source.quality,
      provider: label,
      headers
    }));
  });
}
function resolveFilemoon(url, label) {
  return __async(this, null, function* () {
    const parsed = new URL(url);
    const code = readFilemoonCode(parsed);
    const data = yield fetchJson(`${parsed.origin}/api/videos/${encodeURIComponent(code)}/`, {
      profile: "api",
      headers: { Referer: url, Accept: "application/json" }
    });
    if (data === null || typeof data !== "object" || data.playback === void 0) {
      throw new Error("Filemoon sem playback na resposta");
    }
    const playback = decryptPlayback(data.playback);
    if (!Array.isArray(playback.sources) || playback.sources.length === 0) {
      throw new Error("Playback do Filemoon sem fontes");
    }
    const subtitles = readPlaybackSubtitles(playback.tracks);
    const medias = [];
    for (const source of playback.sources) {
      if (source === null || typeof source !== "object" || typeof source.url !== "string") {
        throw new Error("Fonte do Filemoon sem url");
      }
      const mediaUrl = httpUrl(source.url, "Fonte do Filemoon");
      const type = mediaType(mediaUrl, source.mime_type);
      if (type === void 0) continue;
      const media = { url: mediaUrl, type, provider: label };
      const quality = Number.isInteger(source.height) && source.height > 0 ? source.height : qualityFromLabel(source.label);
      if (quality !== void 0) media.quality = quality;
      if (subtitles !== void 0) media.subtitles = subtitles;
      medias.push(media);
    }
    return medias;
  });
}
function readPlayerjsFile(html) {
  const match = /new\s+Playerjs\s*\(\s*\{[\s\S]*?\bfile\s*:\s*(["'])([\s\S]*?)\1/.exec(html);
  return match === null ? null : match[2];
}
function parsePlayerjsSources(file) {
  const sources = [];
  const seen = /* @__PURE__ */ new Set();
  const pattern = /(?:\[([^\]]+)\])?\s*(https?:\/\/[^,\s"']+)/g;
  let match;
  while ((match = pattern.exec(file)) !== null) {
    if (!match[2].includes("/get_file/") || seen.has(match[2])) continue;
    const url = httpUrl(match[2], "Playerjs file");
    seen.add(match[2]);
    sources.push({ url, quality: qualityFromLabel(match[1]) });
  }
  return sources;
}
function readFilemoonCode(url) {
  const segments = url.pathname.split("/").filter(Boolean);
  const code = segments[0] === "e" ? segments[1] : null;
  if (typeof code !== "string" || !/^[a-z0-9]+$/i.test(code)) {
    throw new Error("Filemoon sem c\xF3digo na URL");
  }
  return code;
}
function readPlaybackSubtitles(raw) {
  if (raw === void 0 || raw === null) return void 0;
  if (!Array.isArray(raw)) throw new Error("tracks do Filemoon fora de lista");
  const subtitles = [];
  for (const track of raw) {
    if (track === null || typeof track !== "object") continue;
    if (typeof track.language !== "string" || track.language.trim() === "") continue;
    let url;
    try {
      url = httpUrl(track.url, "Legenda do Filemoon");
    } catch (e) {
      continue;
    }
    const subtitle = { url, language: track.language.trim() };
    if (typeof track.title === "string" && track.title.trim() !== "") subtitle.name = track.title.trim();
    subtitles.push(subtitle);
  }
  return subtitles.length > 0 ? subtitles : void 0;
}
function stripPosterSuffix(raw) {
  const marker = raw.indexOf("&poster=");
  if (marker === -1) return raw;
  const query = raw.indexOf("?");
  if (query !== -1 && query < marker) return raw;
  return raw.slice(0, marker);
}
function readJwplayerSources(html) {
  const match = /(?:^|[^\w$])sources\s*[:=]\s*\[/.exec(html);
  if (!match) return [];
  const start = match.index + match[0].length - 1;
  const end = findClosingBracket(html, start);
  if (end === -1) throw new Error("jwplayer sources sem fechamento");
  let raw;
  try {
    raw = JSON.parse(html.slice(start, end + 1));
  } catch (error) {
    throw new Error(`jwplayer sources inv\xE1lido: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(raw)) throw new Error("jwplayer sources n\xE3o \xE9 lista");
  const sources = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const file = typeof item.file === "string" ? item.file.trim() : "";
    if (file === "") continue;
    const url = httpUrl(file, "jwplayer file");
    sources.push({
      url,
      type: mediaType(url, item.type),
      quality: qualityFromLabel(item.label)
    });
  }
  return sources;
}
function readSubtitles2(raw) {
  if (raw === void 0 || raw === null) return void 0;
  if (!Array.isArray(raw)) throw new Error("Booonceivu com legendas fora de lista");
  const subtitles = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (label === "" || typeof item.url !== "string") continue;
    let url;
    try {
      url = httpUrl(item.url, "Booonceivu legenda");
    } catch (e) {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    subtitles.push({ url, language: label });
  }
  return subtitles;
}
function booonceivuQuality(value) {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (BOOONCEIVU_QUALITY[text] !== void 0) return BOOONCEIVU_QUALITY[text];
  return qualityFromLabel(value);
}
function qualityFromLabel(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") return void 0;
  try {
    return normalizeQuality(text);
  } catch (e) {
    return void 0;
  }
}
function mediaType(url, declared) {
  const type = typeof declared === "string" ? declared.toLowerCase() : "";
  if (type.includes("mpegurl") || type.includes("hls") || /\.m3u8(?:$|[?#])/i.test(url)) return "hls";
  if (type.includes("mp4") || /\.mp4(?:$|[?#])/i.test(url)) return "mp4";
  return void 0;
}
function addMode(url) {
  if (/[?&]mode=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}mode=${MODE}`;
}
function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}
function httpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(`${label} inv\xE1lida: "${value}"`, { cause: error });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} n\xE3o \xE9 HTTP(S): "${value}"`);
  }
  return url.href;
}
function findClosingBracket(text, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
function isBooonceivu(host) {
  return host === "booonceivu.shop" || host.endsWith(BOOONCEIVU_SUFFIX);
}
function isBlogger(host) {
  return host === "blogger.com" || host.endsWith(".blogger.com");
}
function isRuplay(host) {
  return RUPLAY_HOST.test(bareHost(host));
}
function isFilemoon(host) {
  return FILEMOON_HOST.test(bareHost(host));
}
function bareHost(host) {
  return host.startsWith("www.") ? host.slice(4) : host;
}

// src/topanimes/extractor.js
var MAX_CANDIDATES = 5;
var PORTUGUESE_SUBTITLE = /portugu[eê]s|portuguese|pt[-_ ]?br|^pt$/i;
function extractStreams(request2, providerName) {
  return __async(this, null, function* () {
    const episode = readEpisode(request2);
    const media = yield getMediaInfo(request2);
    const season = episode === null ? null : episode.season;
    const candidates = yield collectCandidates(media, season);
    const streams = [];
    const failures = [];
    const seen = /* @__PURE__ */ new Map();
    for (const candidate of candidates) {
      const resolution = yield resolveCandidate(candidate, media, episode, providerName);
      for (const stream of resolution.streams) mergeStream(streams, seen, stream);
      failures.push(...resolution.failures);
      if (streams.length > 0 && hasBothLanguages(streams)) break;
    }
    if (streams.length === 0 && failures.length > 0) {
      throw new Error(`Nenhuma op\xE7\xE3o produziu stream: ${failures.join("; ")}`);
    }
    return streams;
  });
}
function collectCandidates(media, season) {
  return __async(this, null, function* () {
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    for (const term of buildSearchTerms(media, season)) {
      const html = yield fetchText(searchUrl(term), { profile: "page" });
      const results = parseSearchResults(html);
      for (const result of results) {
        if (seen.has(result.url)) continue;
        seen.add(result.url);
        const match = matchCandidate(result, media, season);
        if (match !== null) found.push(match);
      }
    }
    found.sort((a, b) => b.seasonScore - a.seasonScore || b.score - a.score);
    return found.slice(0, MAX_CANDIDATES);
  });
}
function resolveCandidate(candidate, media, episode, providerName) {
  return __async(this, null, function* () {
    const page = yield fetchPageOrSkip(candidate.result.url);
    if (page === null) return { streams: [], failures: [] };
    const detail = readDetail(page.text);
    if (!confirmDetail(detail, candidate, media, episode === null ? null : episode.season)) {
      return { streams: [], failures: [] };
    }
    const audio = audioFromText(detail.title) || audioFromText(candidate.result.title);
    let optionsPage = page;
    if (episode !== null) {
      const episodeUrl = selectEpisode(page.text, media, episode.season, episode.episode, detail.title);
      if (episodeUrl === null) return { streams: [], failures: [] };
      const loaded = yield fetchPageOrSkip(episodeUrl);
      if (loaded === null) return { streams: [], failures: [] };
      optionsPage = loaded;
    }
    const options = readOptions(optionsPage.text, optionsPage.url);
    const streams = [];
    const failures = [];
    for (const option of options) {
      const label = option.label || `Op\xE7\xE3o ${option.number}`;
      try {
        const medias = yield resolveOption(option, optionsPage.url);
        for (const item of medias) {
          const fields = streamFields(item, media, episode, providerName, audio);
          streams.push(buildStream(fields));
        }
      } catch (error) {
        failures.push(`${label}: ${error.message}`);
        console.warn(`[${providerName}] Op\xE7\xE3o ${label} descartada: ${error.message}`);
      }
    }
    return { streams, failures };
  });
}
function mergeStream(streams, seen, stream) {
  const key = `${stream.url}
${stream.quality}`;
  if (!seen.has(key)) {
    seen.set(key, streams.length);
    streams.push(stream);
    return;
  }
  const index = seen.get(key);
  if (isBetterStream(stream, streams[index])) streams[index] = stream;
}
function isBetterStream(next, current) {
  const nextKnown = next.language !== LANGUAGE.UNKNOWN;
  const currentKnown = current.language !== LANGUAGE.UNKNOWN;
  if (nextKnown && !currentKnown) return true;
  if (!nextKnown && currentKnown) return false;
  return (next.subtitles === void 0 ? 0 : next.subtitles.length) > (current.subtitles === void 0 ? 0 : current.subtitles.length);
}
function streamFields(item, media, episode, providerName, audio) {
  const fields = {
    url: item.url,
    format: formatDetails(providerName, media, episode),
    provider: item.provider
  };
  if (item.type !== void 0) fields.type = item.type;
  if (item.quality !== void 0) fields.quality = item.quality;
  if (item.headers !== void 0) fields.headers = item.headers;
  if (item.subtitles !== void 0 && item.subtitles.length > 0) fields.subtitles = item.subtitles;
  const language = streamLanguage(audio, item.subtitles);
  if (language !== null) fields.language = language;
  return fields;
}
function streamLanguage(audio, subtitles) {
  if (audio === "Dublado") return LANGUAGE.DUBBED;
  if (audio === "Legendado") return LANGUAGE.SUBTITLED;
  if (Array.isArray(subtitles) && subtitles.some((item) => PORTUGUESE_SUBTITLE.test(item.language))) {
    return LANGUAGE.SUBTITLED;
  }
  return null;
}
function hasBothLanguages(streams) {
  let dublado = false;
  let legendado = false;
  for (const stream of streams) {
    if (stream.language === LANGUAGE.DUBBED) dublado = true;
    if (stream.language === LANGUAGE.SUBTITLED) legendado = true;
  }
  return dublado && legendado;
}
function fetchPageOrSkip(url) {
  return __async(this, null, function* () {
    try {
      return yield fetchPage(url, { profile: "page" });
    } catch (error) {
      if (/^HTTP 404\b/.test(error.message)) return null;
      throw error;
    }
  });
}
function formatDetails(providerName, media, episode) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (episode !== null) {
    format.season = episode.season;
    format.episode = episode.episode;
  }
  return format;
}
function readEpisode(request2) {
  if (request2.mediaType !== "tv") return null;
  const { season, episode } = request2;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`S\xE9rie sem temporada/epis\xF3dio v\xE1lidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { season, episode };
}

// src/topanimes/index.js
var PROVIDER_NAME = "TopAnimes";
function getStreams(tmdbId, mediaType2, season, episode) {
  return __async(this, null, function* () {
    try {
      const streams = yield extractStreams({
        tmdbId,
        mediaType: mediaType2,
        season,
        episode
      }, PROVIDER_NAME);
      return sortByQuality(streams);
    } catch (error) {
      console.error(`[${PROVIDER_NAME}] Falha em ${mediaType2} ${tmdbId}: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
