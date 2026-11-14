/** anitube (formato prism) - gerado a partir de src/anitube/ — não edite manualmente. */
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
    const { mediaType } = request2;
    if (!/^\d+$/.test(tmdbId)) {
      throw new Error(`tmdbId inv\xE1lido: "${request2.tmdbId}" (esperado ID num\xE9rico do TMDB)`);
    }
    if (mediaType !== "movie" && mediaType !== "tv") {
      throw new Error(`mediaType inv\xE1lido: "${mediaType}" (esperado "movie" ou "tv")`);
    }
    const url = `${TMDB_API_URL}/${mediaType}/${tmdbId}?api_key=${encodeURIComponent(readApiKey())}&language=${LANGUAGE2}&append_to_response=external_ids,alternative_titles`;
    const response = yield fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB respondeu HTTP ${response.status} para ${mediaType} ${tmdbId}`);
    }
    return toMediaInfo(yield response.json(), tmdbId, mediaType);
  });
}
function readApiKey() {
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== "string" || key.trim() === "") {
    throw new Error("TMDB_API_KEY indispon\xEDvel: o app n\xE3o forneceu a chave do TMDB ao plugin");
  }
  return key.trim();
}
function toMediaInfo(data, tmdbId, mediaType) {
  const isMovie = mediaType === "movie";
  const title = isMovie ? data.title : data.name;
  const originalTitle = isMovie ? data.original_title : data.original_name;
  const releaseDate = isMovie ? data.release_date : data.first_air_date;
  const alternatives = data.alternative_titles && (isMovie ? data.alternative_titles.titles : data.alternative_titles.results);
  const context = `${mediaType} ${tmdbId}`;
  if (!title || !originalTitle) throw new Error(`TMDB n\xE3o retornou t\xEDtulo para ${context}`);
  if (!data.external_ids) throw new Error(`TMDB n\xE3o retornou external_ids para ${context}`);
  if (!Array.isArray(alternatives)) throw new Error(`TMDB n\xE3o retornou alternative_titles para ${context}`);
  const genreIds = (data.genres || []).map((genre) => genre.id);
  const originalLanguage = data.original_language;
  return {
    tmdbId,
    mediaType,
    kind: classifyKind(mediaType, originalLanguage, genreIds),
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
function classifyKind(mediaType, originalLanguage, genreIds) {
  const isAnimation = genreIds.includes(ANIMATION_GENRE_ID);
  if (isAnimation && originalLanguage === "ja") return "anime";
  if (mediaType === "movie") return "movie";
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

// src/anitube/html.js
function loadHtml(html) {
  const { load } = require("cheerio-without-node-native");
  return load(html);
}
function textOf(node) {
  return node.text().replace(/\s+/g, " ").trim();
}

// src/anitube/search.js
var MIN_TITLE_SCORE = 0.85;
var YEAR_TOLERANCE = 1;
var MAX_NUMERIC_SEASON = 30;
var MAX_ROMAN_SEASON = 9;
var ROMAN_SEASONS = Object.freeze({
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9
});
var EXPLICIT_SEASON_PATTERNS = [
  /\b(\d+)(?:st|nd|rd|th)\s+season\b/i,
  /\bseason\s+(\d+)\b/i,
  /\b(\d+)\s*ª\s*temporada\b/i,
  /\btemporada\s+(\d+)\b/i
];
var EPISODES_DECORATION = /[\s–—-]*todos\s+(?:os\s+)?epis[oó]dios?\s*$/i;
var MOVIE_DECORATION = /[\s–—-]*filme(?:\s+dublado\s+e\s+legendado)?\s*$/i;
var AUDIO_PARENTHESIS = /\((?:dublado|legendado|filme)\)/gi;
var AUDIO_WORD = /\b(?:dublado|legendado)\b/gi;
var PARENTHESIS = /\(([^()]+)\)/g;
var PARENTHESIS_TEXT = /\([^()]*\)/g;
function buildQueries(media, request2) {
  readMedia(media);
  readRequest(request2);
  const season = request2.mediaType === "tv" ? request2.season : null;
  const queries = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (query, querySeason) => {
    const text = typeof query === "string" ? query.trim() : "";
    if (text === "") return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ query: text, season: querySeason });
  };
  if (season !== null && season > 1) {
    for (const item of media.romajiTitles || []) {
      if (item.season === season) add(item.title, season);
    }
  }
  const bases = baseTitles(media, season);
  for (const title of bases) add(title, season === null ? null : 1);
  if (season !== null && season > 1) {
    for (const title of bases) {
      add(`${title} ${season}`, season);
      add(`${title} ${ordinal(season)} Season`, season);
      add(`${title} Season ${season}`, season);
      add(`${title} ${season}\xAA Temporada`, season);
      add(`${title} Temporada ${season}`, season);
      const roman = romanForSeason(season);
      if (roman !== null) add(`${title} ${roman}`, season);
    }
  }
  return queries;
}
function cleanCardTitle(rawTitle) {
  let text = typeof rawTitle === "string" ? rawTitle : "";
  text = text.replace(AUDIO_PARENTHESIS, " ");
  text = text.replace(MOVIE_DECORATION, " ");
  text = text.replace(EPISODES_DECORATION, " ");
  text = text.replace(AUDIO_WORD, " ");
  const aliases = [];
  for (const match of text.matchAll(PARENTHESIS)) {
    const alias = match[1].trim();
    if (alias !== "") aliases.push(alias);
  }
  return {
    title: text.replace(PARENTHESIS_TEXT, " ").replace(/\s+/g, " ").trim(),
    aliases: uniqueTitles(aliases)
  };
}
function readSeason(title, media) {
  const text = typeof title === "string" ? title.trim() : "";
  const explicit = readExplicitSeason(text);
  if (explicit !== null) return { season: explicit, final: false };
  if (/\bfinal\s+season\b/i.test(text)) return { season: null, final: true };
  if (/\bpart(?:e)?\s+\d+\s*$/i.test(text)) return { season: 1, final: false };
  const numeric = /\s+(\d+)\s*$/.exec(text);
  if (numeric !== null) {
    const season = Number(numeric[1]);
    const base = text.slice(0, numeric.index).trim();
    if (season >= 2 && season <= MAX_NUMERIC_SEASON && matchesMediaTitle(base, media)) {
      return { season, final: false };
    }
  }
  const roman = /\s+([IVX]+)\s*$/i.exec(text);
  if (roman !== null) {
    const season = ROMAN_SEASONS[roman[1].toUpperCase()];
    const base = text.slice(0, roman.index).trim();
    if (season !== void 0 && season <= MAX_ROMAN_SEASON && matchesMediaTitle(base, media)) {
      return { season, final: false };
    }
  }
  return { season: 1, final: false };
}
function confirmCandidate(candidate, page, media, request2, query) {
  if (!candidate || !page) return null;
  if (request2.mediaType === "tv" && candidate.type !== "tv") return null;
  if (!titleMatches(candidate, media, request2, query)) return null;
  if (request2.mediaType === "tv" && !seasonMatches(candidate, media, request2, query)) return null;
  if (!yearMatches(page, media, request2)) return null;
  if (!audioMatches(candidate, page)) return null;
  const pageAudio = readAudio(page.audio);
  return { audio: pageAudio === null ? candidate.audio : pageAudio };
}
function isSpecificRomaji(media, title, season) {
  const normalized = normalizeText(title);
  if (normalized === "") return false;
  return (media.romajiTitles || []).some(
    (item) => item.season === season && normalizeText(item.title) === normalized
  );
}
function maxSeason(media) {
  let max = null;
  for (const item of media.seasons || []) {
    if (Number.isInteger(item.number) && (max === null || item.number > max)) max = item.number;
  }
  return max;
}
function parseSearchResults(html, baseUrl) {
  const $ = loadHtml(html);
  if ($(".searchPagContainer").length === 0) {
    throw new Error("Busca do AniTube sem .searchPagContainer");
  }
  const items = $(".aniItem");
  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const anchor = item.find("a").eq(0);
    const href = anchor.attr("href");
    if (!href) throw new Error(`Cart\xE3o de busca ${index} sem endere\xE7o`);
    const rawTitle = anchor.attr("title") || textOf(item.find(".aniItemNome")) || textOf(anchor);
    if (!rawTitle) throw new Error(`Cart\xE3o de busca ${index} sem t\xEDtulo`);
    const label = textOf(item.find(".aniCC"));
    const cleaned = cleanCardTitle(rawTitle);
    results.push({
      url: new URL(href, baseUrl).href,
      rawTitle,
      title: cleaned.title,
      aliases: cleaned.aliases,
      type: label === "Filme" || MOVIE_DECORATION.test(rawTitle) ? "movie" : "tv",
      audio: readAudio(label)
    });
  }
  return results;
}
function baseTitles(media, season) {
  const titles = [media.title, media.originalTitle];
  if (Array.isArray(media.alternativeTitles)) titles.push(...media.alternativeTitles);
  for (const item of media.romajiTitles || []) {
    if (season === null || item.season === null || item.season === 1) titles.push(item.title);
  }
  return uniqueTitles(titles);
}
function allMediaTitles(media) {
  const titles = [media.title, media.originalTitle];
  if (Array.isArray(media.alternativeTitles)) titles.push(...media.alternativeTitles);
  for (const item of media.romajiTitles || []) titles.push(item.title);
  return uniqueTitles(titles);
}
function titleMatches(candidate, media, request2, query) {
  const titles = allMediaTitles(media);
  if (query && query.season === request2.season && typeof query.query === "string") titles.push(query.query);
  const candidates = [candidate.title, ...candidate.aliases].filter((item) => typeof item === "string" && item.trim() !== "");
  for (const item of candidates) {
    for (const title of titles) {
      if (titleSimilarity(item, title) >= MIN_TITLE_SCORE) return true;
    }
  }
  return false;
}
function seasonMatches(candidate, media, request2, query) {
  const declared = readSeason(candidate.title, media);
  if (declared.final) {
    const max = maxSeason(media);
    return max !== null && max === request2.season;
  }
  let season = declared.season;
  if (season === 1 && query && query.season === request2.season && isSpecificRomaji(media, candidate.title, request2.season)) {
    season = request2.season;
  }
  return season === request2.season;
}
function yearMatches(page, media, request2) {
  if (!Number.isInteger(page.year)) return true;
  const expected = expectedYear(media, request2);
  if (!Number.isInteger(expected)) return true;
  return Math.abs(page.year - expected) <= YEAR_TOLERANCE;
}
function expectedYear(media, request2) {
  if (request2.mediaType === "movie") return media.year;
  const season = (media.seasons || []).find((item) => item.number === request2.season);
  if (season && Number.isInteger(season.year)) return season.year;
  return request2.season === 1 ? media.year : null;
}
function audioMatches(candidate, page) {
  const pageAudio = readAudio(page.audio);
  return candidate.audio === null || pageAudio === null || candidate.audio === pageAudio;
}
function readAudio(value) {
  const text = typeof value === "string" ? value : "";
  if (/\bdublado\b/i.test(text)) return "Dublado";
  if (/\blegendado\b/i.test(text)) return "Legendado";
  return null;
}
function readExplicitSeason(text) {
  for (const pattern of EXPLICIT_SEASON_PATTERNS) {
    const match = pattern.exec(text);
    if (match !== null) return Number(match[1]);
  }
  return null;
}
function matchesMediaTitle(base, media) {
  const normalized = normalizeText(base);
  if (normalized === "") return false;
  return allMediaTitles(media).some((title) => normalizeText(title) === normalized);
}
function ordinal(number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const value = number % 100;
  return `${number}${suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]}`;
}
function romanForSeason(season) {
  for (const [roman, value] of Object.entries(ROMAN_SEASONS)) {
    if (value === season) return roman;
  }
  return null;
}
function uniqueTitles(titles) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of titles) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (text === "") continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}
function readMedia(media) {
  if (!media || typeof media !== "object" || typeof media.title !== "string" || media.title.trim() === "") {
    throw new Error("media inv\xE1lido: esperado objeto com title n\xE3o vazio");
  }
}
function readRequest(request2) {
  if (!request2 || request2.mediaType !== "movie" && request2.mediaType !== "tv") {
    throw new Error('request inv\xE1lido: esperado mediaType "movie" ou "tv"');
  }
  if (request2.mediaType === "tv" && (!Number.isInteger(request2.season) || request2.season < 1)) {
    throw new Error(`S\xE9rie sem temporada v\xE1lida: ${request2.season}`);
  }
}

// src/anitube/pages.js
var EPISODE_NUMBER = /epis[oó]dio\s+0*(\d+)/i;
var SERIES_TITLE = /todos\s+(?:os\s+)?epis[oó]dios?/i;
var MOVIE_WORD = /\bfilme\b/i;
var NON_EPISODE = /\b(?:ova|ovas|especial|especiais|filme|filmes)\b/i;
function readPageInfo(html) {
  const $ = loadHtml(html);
  const h1 = textOf($("h1").eq(0));
  let type = "";
  let year = null;
  const lines = $(".boxAnimeSobreLinha");
  for (let index = 0; index < lines.length; index += 1) {
    const text = textOf(lines.eq(index));
    const typeMatch = /tipo\s+de\s+epis[oó]dio:\s*(.+)$/i.exec(text);
    if (typeMatch !== null) type = typeMatch[1].trim();
    const yearMatch = /\bano:\s*(\d{4})\b/i.exec(text);
    if (yearMatch !== null) year = Number(yearMatch[1]);
  }
  return { h1, type, year, audio: readAudio2(type) || readAudio2(h1) };
}
function isSeriesPage(html) {
  const $ = loadHtml(html);
  const h1 = textOf($("h1").eq(0));
  if (SERIES_TITLE.test(h1)) return true;
  return $(".pagAniListaContainer").length > 0 && !MOVIE_WORD.test(h1);
}
function isMoviePage(html) {
  const $ = loadHtml(html);
  const h1 = textOf($("h1").eq(0));
  if (MOVIE_WORD.test(h1) && !SERIES_TITLE.test(h1)) return true;
  const links = $(".pagAniListaContainer a");
  for (let index = 0; index < links.length; index += 1) {
    const link = links.eq(index);
    if (MOVIE_WORD.test(link.attr("title") || textOf(link))) return true;
  }
  return false;
}
function selectEpisode(html, pageUrl, request2) {
  const $ = loadHtml(html);
  const links = $(".pagAniListaContainer a");
  if (links.length === 0) throw new Error("Ficha de s\xE9rie sem lista de epis\xF3dios");
  for (let index = 0; index < links.length; index += 1) {
    const link = links.eq(index);
    const title = link.attr("title") || textOf(link);
    if (NON_EPISODE.test(title)) continue;
    const match = EPISODE_NUMBER.exec(title);
    if (match === null || Number(match[1]) !== request2.episode) continue;
    const href = link.attr("href");
    if (!href) throw new Error(`Epis\xF3dio ${request2.episode} sem endere\xE7o`);
    return { url: new URL(href, pageUrl).href, title };
  }
  return null;
}
function readMovieEntries(html, pageUrl) {
  const $ = loadHtml(html);
  const page = readPageInfo(html);
  const links = $(".pagAniListaContainer a");
  const entries = [];
  for (let index = 0; index < links.length; index += 1) {
    const link = links.eq(index);
    const title = link.attr("title") || textOf(link);
    if (!MOVIE_WORD.test(title)) continue;
    const href = link.attr("href");
    if (!href) throw new Error(`Entrada de filme ${index} sem endere\xE7o`);
    entries.push({ url: new URL(href, pageUrl).href, title, audio: readAudio2(title) });
  }
  if (entries.length > 0) return { kind: "aggregator", entries, page };
  if (MOVIE_WORD.test(page.h1) && !SERIES_TITLE.test(page.h1)) {
    return { kind: "direct", entries: [{ url: pageUrl, title: page.h1, audio: page.audio }], page };
  }
  return { kind: "none", entries: [], page };
}
function readAudio2(value) {
  const text = typeof value === "string" ? value : "";
  if (/\bdublado\b/i.test(text)) return "Dublado";
  if (/\blegendado\b/i.test(text)) return "Legendado";
  return null;
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

// src/anitube/players.js
var FHD_HOST = "api.anivideo.net";
var FHD_PATH = "videohls.php";
var ANITUBE_HOSTS = /* @__PURE__ */ new Set(["anitube.zip", "www.anitube.zip"]);
var BLOGGER_HOSTS = /* @__PURE__ */ new Set(["blogger.com", "www.blogger.com"]);
var HTTP_PROTOCOLS3 = ["http:", "https:"];
function collectPlayers(html, pageUrl) {
  const $ = loadHtml(html);
  const iframes = $("iframe");
  const players = [];
  for (let index = 0; index < iframes.length; index += 1) {
    const src = iframes.eq(index).attr("src");
    if (!src) continue;
    const url = new URL(src, pageUrl).href;
    const parsed = new URL(url);
    if (parsed.hostname === FHD_HOST && parsed.pathname.includes(FHD_PATH)) {
      players.push({ kind: "fhd", url, label: "Player FHD" });
    } else if (ANITUBE_HOSTS.has(parsed.hostname)) {
      players.push({ kind: "player1", url, label: "Player 1" });
    } else {
      players.push({ kind: "unsupported", url, label: parsed.hostname });
    }
  }
  return players;
}
function resolvePlayers(html, pageUrl, providerName) {
  return __async(this, null, function* () {
    const players = collectPlayers(html, pageUrl);
    if (players.length === 0) throw new Error("Ficha sem player");
    const results = yield Promise.all(players.map((player) => resolveOption(player, pageUrl)));
    const streams = [];
    const failures = [];
    for (const result of results) {
      if (result.ok) {
        streams.push(...result.streams);
        continue;
      }
      failures.push(result.error.message);
      console.warn(`[${providerName}] Op\xE7\xE3o ${result.label} descartada: ${sanitizeMessage(result.error.message)}`);
    }
    if (streams.length > 0) return streams;
    throw new Error(`Nenhuma op\xE7\xE3o produziu stream: ${failures.map(sanitizeMessage).join("; ")}`);
  });
}
function resolveOption(player, pageUrl) {
  return __async(this, null, function* () {
    try {
      if (player.kind === "fhd") return { ok: true, label: player.label, streams: yield resolveFhd(player, pageUrl) };
      if (player.kind === "player1") return { ok: true, label: player.label, streams: yield resolvePlayer1(player, pageUrl) };
      return { ok: false, label: player.label, error: new Error(`Host n\xE3o suportado: ${player.label}`) };
    } catch (error) {
      return { ok: false, label: player.label, error };
    }
  });
}
function resolveFhd(player, pageUrl) {
  return __async(this, null, function* () {
    const mediaUrl = readFhdUrl(player.url);
    let quality = null;
    let url = mediaUrl;
    try {
      const page = yield fetchPage(player.url, { profile: "player", headers: { Referer: pageUrl } });
      const source = readFhdSource(page.text);
      if (source.file !== null) url = new URL(source.file, page.url).href;
      if (source.label !== null) quality = source.label;
    } catch (e) {
    }
    return [{ url, quality, provider: "Player FHD", type: "hls" }];
  });
}
function resolvePlayer1(player, pageUrl) {
  return __async(this, null, function* () {
    const page = yield fetchPage(player.url, { profile: "player", headers: { Referer: pageUrl } });
    const bloggerUrl = readBloggerIframe(page.text, page.url);
    const blogger = yield fetchText(bloggerUrl, { profile: "player", headers: { Referer: page.url } });
    return extractBloggerFormats(blogger).map((format) => ({
      url: format.url,
      quality: format.qualityLabel,
      provider: "Player 1",
      type: "mp4"
    }));
  });
}
function readFhdUrl(url) {
  const mediaUrl = new URL(url).searchParams.get("d");
  if (typeof mediaUrl !== "string" || mediaUrl.trim() === "") {
    throw new Error("Player FHD sem par\xE2metro d");
  }
  if (!isHttpUrl2(mediaUrl)) throw new Error("Player FHD com par\xE2metro d fora de http(s)");
  return mediaUrl;
}
function readFhdSource(html) {
  const block = /sources\s*:\s*\[([\s\S]*?)\]/i.exec(html);
  if (block === null) throw new Error("Player FHD sem bloco sources");
  const file = /file\s*:\s*['"]([^'"]+)['"]/i.exec(block[1]);
  const label = /label\s*:\s*['"]([^'"]+)['"]/i.exec(block[1]);
  return { file: file === null ? null : file[1], label: label === null ? null : label[1] };
}
function readBloggerIframe(html, pageUrl) {
  const $ = loadHtml(html);
  const iframes = $("iframe");
  for (let index = 0; index < iframes.length; index += 1) {
    const src = iframes.eq(index).attr("src");
    if (!src) continue;
    const url = new URL(src, pageUrl).href;
    const hostname = new URL(url).hostname.toLowerCase();
    if (BLOGGER_HOSTS.has(hostname) || hostname.endsWith(".blogger.com")) return url;
  }
  throw new Error("P\xE1gina do Player 1 sem iframe do Blogger");
}
function sanitizeMessage(message) {
  return String(message).replace(/https?:\/\/\S+/gi, "[url]").replace(/\b[a-f0-9]{32,}\b/gi, "[hash]");
}
function isHttpUrl2(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    return HTTP_PROTOCOLS3.includes(new URL(value.trim()).protocol);
  } catch (e) {
    return false;
  }
}

// src/anitube/extractor.js
var SOURCE_URL = "https://www.anitube.zip";
function extractStreams(request2, providerName) {
  return __async(this, null, function* () {
    readEpisode(request2);
    const media = yield getMediaInfo(request2);
    const entries = yield findEntries(media, request2);
    if (entries.length === 0) return [];
    return resolveEntries(entries, media, request2, providerName);
  });
}
function readEpisode(request2) {
  if (request2.mediaType !== "tv") return null;
  const { season, episode } = request2;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`S\xE9rie sem temporada/epis\xF3dio v\xE1lidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { season, episode };
}
function findEntries(media, request2) {
  return __async(this, null, function* () {
    const entries = [];
    const targetAudios = /* @__PURE__ */ new Set();
    const confirmedAudios = /* @__PURE__ */ new Set();
    const visited = /* @__PURE__ */ new Set();
    for (const query of buildQueries(media, request2)) {
      const searchUrl = `${SOURCE_URL}/?${new URLSearchParams({ s: query.query })}`;
      const search = yield fetchPage(searchUrl, { profile: "page" });
      const candidates = parseSearchResults(search.text, search.url);
      for (const candidate of candidates) {
        if (visited.has(candidate.url)) continue;
        const triage = confirmCandidate(candidate, triagePage(candidate), media, request2, query);
        if (triage === null) continue;
        visited.add(candidate.url);
        if (request2.mediaType === "tv") {
          targetAudios.add(triage.audio);
          if (confirmedAudios.has(triage.audio)) continue;
        }
        const page = yield fetchPage(candidate.url, { profile: "page", headers: { Referer: search.url } });
        const info = readPageInfo(page.text);
        const confirmed = confirmCandidate(candidate, info, media, request2, query);
        if (confirmed === null) continue;
        if (request2.mediaType === "tv") {
          if (!isSeriesPage(page.text)) continue;
          const episode = selectEpisode(page.text, page.url, request2);
          if (episode === null) continue;
          entries.push({
            pageUrl: page.url,
            entryUrl: episode.url,
            audio: confirmed.audio,
            html: "",
            pageInfo: info
          });
          confirmedAudios.add(confirmed.audio);
          continue;
        }
        if (!isMoviePage(page.text)) continue;
        const movie = readMovieEntries(page.text, page.url);
        if (movie.kind === "none") continue;
        for (const movieEntry of movie.entries) {
          const entry = yield confirmMovieEntry(candidate, movieEntry, movie.page, page.url, page.text, media, request2, query);
          if (entry === null) continue;
          entries.push(entry);
          targetAudios.add(entry.audio);
          confirmedAudios.add(entry.audio);
        }
      }
      if (targetAudios.size > 0 && coversTargets(targetAudios, confirmedAudios)) break;
    }
    return entries;
  });
}
function confirmMovieEntry(candidate, movieEntry, parentInfo, parentUrl, parentHtml, media, request2, query) {
  return __async(this, null, function* () {
    const audio = movieEntry.audio === null ? parentInfo.audio : movieEntry.audio;
    if (movieEntry.url === parentUrl) {
      const confirmed2 = confirmCandidate(
        __spreadProps(__spreadValues({}, candidate), { audio, type: "movie" }),
        __spreadProps(__spreadValues({}, parentInfo), { audio }),
        media,
        request2,
        query
      );
      if (confirmed2 === null) return null;
      return {
        pageUrl: parentUrl,
        entryUrl: parentUrl,
        audio: confirmed2.audio,
        html: parentHtml,
        pageInfo: parentInfo
      };
    }
    const page = yield fetchPage(movieEntry.url, { profile: "page", headers: { Referer: parentUrl } });
    if (!isMoviePage(page.text)) return null;
    const info = readPageInfo(page.text);
    const entryCandidate = __spreadProps(__spreadValues(__spreadValues({}, candidate), cleanCardTitle(movieEntry.title)), {
      type: "movie",
      audio,
      url: page.url
    });
    const entryInfo = __spreadProps(__spreadValues({}, info), { year: info.year === null ? parentInfo.year : info.year, audio });
    const confirmed = confirmCandidate(entryCandidate, entryInfo, media, request2, query);
    if (confirmed === null) return null;
    return {
      pageUrl: parentUrl,
      entryUrl: page.url,
      audio: confirmed.audio,
      html: page.text,
      pageInfo: entryInfo
    };
  });
}
function triagePage(candidate) {
  return { h1: candidate.title, type: "", year: null, audio: candidate.audio };
}
function coversTargets(targetAudios, confirmedAudios) {
  for (const audio of targetAudios) {
    if (!confirmedAudios.has(audio)) return false;
  }
  return true;
}
function resolveEntries(entries, media, request2, providerName) {
  return __async(this, null, function* () {
    const results = yield Promise.all(entries.map((entry) => resolveEntry(entry, media, request2, providerName)));
    const streams = [];
    const seenUrls = /* @__PURE__ */ new Set();
    const failures = [];
    for (const result of results) {
      if (!result.ok) {
        failures.push(result.error.message);
        console.warn(`[${providerName}] Ficha ${result.audio === null ? "sem \xE1udio" : result.audio} descartada: ${sanitizeMessage(result.error.message)}`);
        continue;
      }
      for (const stream of result.streams) {
        if (seenUrls.has(stream.url)) continue;
        seenUrls.add(stream.url);
        streams.push(stream);
      }
    }
    if (streams.length > 0) return streams;
    if (failures.length > 0) throw new Error(`Nenhuma ficha produziu stream: ${failures.map(sanitizeMessage).join("; ")}`);
    return [];
  });
}
function resolveEntry(entry, media, request2, providerName) {
  return __async(this, null, function* () {
    try {
      const page = entry.html === "" ? yield fetchPage(entry.entryUrl, { profile: "page", headers: { Referer: entry.pageUrl } }) : null;
      const html = page === null ? entry.html : page.text;
      const pageUrl = page === null ? entry.entryUrl : page.url;
      const players = yield resolvePlayers(html, pageUrl, providerName);
      const streams = players.map((player) => buildPlayerStream(player, entry.audio, media, request2, providerName));
      return { ok: true, audio: entry.audio, streams };
    } catch (error) {
      return { ok: false, audio: entry.audio, error };
    }
  });
}
function buildPlayerStream(player, audio, media, request2, providerName) {
  const fields = {
    url: player.url,
    format: formatDetails(providerName, media, request2),
    provider: player.provider,
    type: player.type
  };
  if (player.quality !== null) fields.qualityHints = [player.quality];
  const language = languageFromAudio(audio);
  if (language !== null) fields.language = language;
  return buildStream(fields);
}
function formatDetails(providerName, media, request2) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (request2.mediaType === "tv") {
    format.season = request2.season;
    format.episode = request2.episode;
  }
  return format;
}
function languageFromAudio(audio) {
  if (audio === "Dublado") return LANGUAGE.DUBBED;
  if (audio === "Legendado") return LANGUAGE.SUBTITLED;
  return null;
}

// src/anitube/index.js
var PROVIDER_NAME = "AniTube";
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const streams = yield extractStreams({ tmdbId, mediaType, season, episode }, PROVIDER_NAME);
      return sortByQuality(streams);
    } catch (error) {
      console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
