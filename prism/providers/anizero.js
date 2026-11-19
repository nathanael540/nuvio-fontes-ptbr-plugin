/** anizero (formato prism) - gerado a partir de src/anizero/ — não edite manualmente. */
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

// src/anizero/support.js
var NAMED_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
});
function decodeEntities(text) {
  return String(text).replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/&#(\d+);/g, (match, decimal) => String.fromCharCode(Number(decimal))).replace(/&([a-z]+);/gi, (match, name) => {
    const value = NAMED_ENTITIES[name.toLowerCase()];
    return value === void 0 ? match : value;
  });
}
function stripTags(text) {
  return String(text).replace(/<[^>]*>/g, " ");
}
function readAttribute(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = String(tag).match(pattern);
  if (match === null) return null;
  return match[1] === void 0 ? match[2] : match[1];
}
function sanitizeMessage(message) {
  return String(message).replace(/https?:\/\/\S+/gi, "[url]").replace(/\b[a-f0-9]{32,}\b/gi, "[hash]");
}

// src/anizero/player.js
var PACKER_MARKER = "function(p,a,c,k,e,d)";
var STANDARD_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/";
var NOT_READY = /O v[ií]deo n[aã]o est[aá] pronto/i;
function resolvePlayerPage(playerUrl, referer) {
  return __async(this, null, function* () {
    const page = yield fetchPage(playerUrl, {
      profile: "page",
      headers: { Referer: referer }
    });
    return { url: page.url, options: readPlayerOptions(page.text) };
  });
}
function readPlayerOptions(html) {
  const scripts = readScripts(html);
  const labels = /* @__PURE__ */ new Map();
  const buttons = html.match(/<button\b[^>]*>/gi) || [];
  for (const tag of buttons) {
    const index = readAttribute(tag, "data-index");
    if (index === null || !/^\d+$/.test(index)) continue;
    const label = readAttribute(tag, "data-label");
    labels.set(Number(index), label === null ? "" : decodeEntities(label).trim());
  }
  return scripts.map((script, index) => ({
    index,
    label: labels.get(index) || `Op\xE7\xE3o ${index + 1}`,
    script
  }));
}
function decodePlayerUrl(script) {
  if (typeof script !== "string" || script.trim() === "") {
    throw new Error("Script do player vazio");
  }
  const unpacked = unpackPacker(script);
  if (unpacked === null) {
    const direct = extractUrl(script);
    if (direct !== null) return direct;
    throw new Error("Script do player fora do esquema");
  }
  const decoded = decodeCustomPayload(unpacked);
  if (decoded === null) {
    const direct = extractUrl(unpacked);
    if (direct !== null) return direct;
    throw new Error("Script do player sem URL do embed");
  }
  const url = extractUrl(decoded);
  if (url === null) throw new Error("Script do player sem URL do embed");
  return url;
}
function resolveEmbed(embedUrl, referer) {
  return __async(this, null, function* () {
    const page = yield fetchPage(embedUrl, {
      profile: "player",
      headers: { Referer: referer }
    });
    if (NOT_READY.test(page.text)) return { url: page.url, sources: [], subtitles: [], notReady: true };
    const config = extractFirePlayerConfig(page.text);
    if (config === null) throw new Error(`Embed sem configura\xE7\xE3o FirePlayer em ${page.url}`);
    return {
      url: page.url,
      sources: readSources(config, page.url),
      subtitles: readSubtitles2(config, page.url)
    };
  });
}
function readScripts(html) {
  const anchor = html.indexOf("var playerScripts = ");
  if (anchor < 0) throw new Error("P\xE1gina do player sem playerScripts");
  const start = html.indexOf("[", anchor);
  if (start < 0) throw new Error("playerScripts sem array");
  const end = scanArrayEnd(html, start);
  let scripts;
  try {
    scripts = JSON.parse(html.slice(start, end));
  } catch (error) {
    throw new Error(`playerScripts n\xE3o \xE9 JSON v\xE1lido: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(scripts) || !scripts.every((item) => typeof item === "string")) {
    throw new Error("playerScripts fora do esquema");
  }
  return scripts;
}
function scanArrayEnd(text, start) {
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
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error("playerScripts sem fechamento");
}
function unpackPacker(source) {
  const marker = source.indexOf(PACKER_MARKER);
  if (marker < 0) return null;
  const callIndex = source.indexOf("}('", marker);
  if (callIndex < 0) throw new Error("Packer sem chamada de argumentos");
  const pRead = readQuoted(source, callIndex + 2, "'");
  let cursor = pRead.end;
  if (source[cursor] !== ",") throw new Error("Packer sem separador ap\xF3s p");
  cursor += 1;
  const aMatch = /^(\d+)/.exec(source.slice(cursor));
  if (aMatch === null) throw new Error("Packer sem base a");
  const base = Number(aMatch[1]);
  cursor += aMatch[0].length;
  if (source[cursor] !== ",") throw new Error("Packer sem separador ap\xF3s a");
  cursor += 1;
  const cMatch = /^(\d+)/.exec(source.slice(cursor));
  if (cMatch === null) throw new Error("Packer sem contagem c");
  const count = Number(cMatch[1]);
  cursor += cMatch[0].length;
  if (source[cursor] !== ",") throw new Error("Packer sem separador ap\xF3s c");
  cursor += 1;
  const kRead = readQuoted(source, cursor, "'");
  cursor = kRead.end;
  if (!source.slice(cursor).startsWith(".split('|'),0,{}))")) {
    throw new Error("Packer com cauda fora do esquema");
  }
  if (!Number.isInteger(base) || base < 2 || base > 62) throw new Error(`Packer com base inv\xE1lida: ${base}`);
  if (!Number.isInteger(count) || count < 0) throw new Error(`Packer com contagem inv\xE1lida: ${count}`);
  const keywords = kRead.value.split("|");
  const dictionary = {};
  for (let index = 0; index < count; index += 1) {
    const key = encodeBase(index, base);
    dictionary[key] = keywords[index] || key;
  }
  return pRead.value.replace(/\b\w+\b/g, (token) => dictionary[token] === void 0 ? token : dictionary[token]);
}
function encodeBase(value, base) {
  const digit = value % base;
  const prefix = value < base ? "" : encodeBase(Math.floor(value / base), base);
  return prefix + (digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36));
}
function decodeCustomPayload(unpacked) {
  const match = unpacked.match(/eval\(function\(h,u,n,t,e,r\)\{[\s\S]*?\}\("([^"]*)",(\d+),"([^"]*)",(\d+),(\d+),(\d+)\)\)/);
  if (match === null) return null;
  const payload = match[1];
  const alphabet = match[3];
  const offset = Number(match[4]);
  const base = Number(match[5]);
  if (!Number.isInteger(base) || base < 2 || base > STANDARD_ALPHABET.length) {
    throw new Error(`Decodificador do player com base inv\xE1lida: ${base}`);
  }
  const separator = alphabet[base];
  if (separator === void 0 || separator === "") throw new Error("Decodificador do player sem separador");
  const digitChars = STANDARD_ALPHABET.slice(0, base);
  let bytes = "";
  let index = 0;
  while (index < payload.length) {
    let segment = "";
    while (index < payload.length && payload[index] !== separator) {
      segment += payload[index];
      index += 1;
    }
    if (payload[index] === separator) index += 1;
    if (segment === "") continue;
    let mapped = "";
    for (const char of segment) {
      const digit = alphabet.indexOf(char);
      if (digit < 0) throw new Error(`S\xEDmbolo fora do alfabeto do player: ${char}`);
      mapped += String(digit);
    }
    let value = 0;
    for (const char of mapped) {
      const digit = digitChars.indexOf(char);
      if (digit >= 0) value = value * base + digit;
    }
    const code = value - offset;
    if (!(code >= 0 && code <= 255)) throw new Error("Byte fora da faixa no script do player");
    bytes += String.fromCharCode(code);
  }
  return decodeUtf8(bytes);
}
function decodeUtf8(bytes) {
  let result = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes.charCodeAt(index);
    if (first < 128) {
      result += String.fromCharCode(first);
      continue;
    }
    let needed;
    let code;
    if (first >= 194 && first <= 223) {
      needed = 1;
      code = first & 31;
    } else if (first >= 224 && first <= 239) {
      needed = 2;
      code = first & 15;
    } else if (first >= 240 && first <= 244) {
      needed = 3;
      code = first & 7;
    } else {
      throw new Error("UTF-8 inv\xE1lido no script do player");
    }
    for (let extra = 0; extra < needed; extra += 1) {
      index += 1;
      if (index >= bytes.length) throw new Error("UTF-8 truncado no script do player");
      const next = bytes.charCodeAt(index);
      if ((next & 192) !== 128) throw new Error("UTF-8 inv\xE1lido no script do player");
      code = code << 6 | next & 63;
    }
    if (code > 1114111) throw new Error("Code point inv\xE1lido no script do player");
    result += String.fromCodePoint(code);
  }
  return result;
}
function extractUrl(text) {
  const match = String(text).match(/https?:\/\/[^\s"'<>\\]+/);
  if (match === null) return null;
  const value = match[0].replace(/[),.;]+$/, "");
  let url;
  try {
    url = new URL(value);
  } catch (e) {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.href;
}
function extractFirePlayerConfig(html) {
  const direct = parseFirePlayerCall(html);
  if (direct !== null) return direct;
  if (html.includes(PACKER_MARKER)) {
    const unpacked = unpackPacker(html);
    if (unpacked !== null) return parseFirePlayerCall(unpacked);
  }
  return null;
}
function parseFirePlayerCall(text) {
  let searchIndex = 0;
  while (searchIndex < text.length) {
    const call = text.indexOf("FirePlayer(", searchIndex);
    if (call < 0) return null;
    const before = text.slice(Math.max(0, call - 20), call);
    if (/function\s*$/.test(before)) {
      searchIndex = call + 1;
      continue;
    }
    const objectStart = findObjectStart(text, call + "FirePlayer(".length);
    if (objectStart < 0) {
      searchIndex = call + 1;
      continue;
    }
    const objectText = readBalancedObject(text, objectStart);
    try {
      return JSON.parse(objectText);
    } catch (error) {
      throw new Error(`Configura\xE7\xE3o do FirePlayer inv\xE1lida: ${error.message}`, { cause: error });
    }
  }
  return null;
}
function findObjectStart(text, start) {
  let quote = null;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "{") return index;
  }
  return -1;
}
function readBalancedObject(text, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error("Objeto do FirePlayer sem fechamento");
}
function readSources(config, embedUrl) {
  const videoData = isPlainObject3(config.videoData) ? config.videoData : {};
  const entries = [];
  let unsupported = 0;
  if (Array.isArray(videoData.videoSources)) {
    for (const source of videoData.videoSources) {
      if (!isPlainObject3(source) || typeof source.file !== "string" || source.file.trim() === "") continue;
      const type = typeof source.type === "string" ? source.type.toLowerCase() : "";
      if (!isHls(source.file, type)) {
        unsupported += 1;
        continue;
      }
      entries.push({ file: source.file, label: typeof source.label === "string" ? source.label.trim() : null });
    }
  }
  if (videoData.hls === true && typeof videoData.videoSource === "string" && videoData.videoSource.trim() !== "") {
    entries.push({ file: videoData.videoSource, label: null });
  }
  if (entries.length === 0 && typeof config.videoUrl === "string" && config.videoUrl.trim() !== "") {
    entries.push({ file: config.videoUrl, label: null });
  }
  const resolved = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    let url;
    try {
      url = new URL(entry.file, embedUrl);
    } catch (e) {
      unsupported += 1;
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      unsupported += 1;
      continue;
    }
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    resolved.push({ url: url.href, label: entry.label === "" ? null : entry.label });
  }
  if (resolved.length === 0) {
    if (unsupported > 0) return [];
    throw new Error("Configura\xE7\xE3o do FirePlayer sem fonte de v\xEDdeo");
  }
  return resolved;
}
function readSubtitles2(config, embedUrl) {
  const tracks = Array.isArray(config.tracks) ? config.tracks : [];
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const track of tracks) {
    if (!isPlainObject3(track) || typeof track.file !== "string" || track.file.trim() === "") continue;
    const kind = typeof track.kind === "string" ? track.kind.toLowerCase() : "";
    if (kind !== "captions" && kind !== "subtitles") continue;
    let url;
    try {
      url = new URL(track.file, embedUrl);
    } catch (e) {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const label = typeof track.label === "string" ? track.label.trim() : "";
    const subtitle = { url: url.href, language: label || "Desconhecido" };
    if (label !== "") subtitle.name = label;
    result.push(subtitle);
  }
  return result;
}
function isHls(file, type) {
  if (type === "hls" || type === "m3u8") return true;
  if (type === "mp4" || type === "mkv" || type === "webm") return false;
  return /\.(m3u8|txt)(?:[?#]|$)/i.test(file) || /\/hls\//i.test(file);
}
function isPlainObject3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readQuoted(source, start, quote) {
  if (source[start] !== quote) throw new Error("String do player sem aspas");
  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      const next = source[index + 1];
      if (next === void 0) throw new Error("Escape incompleto no player");
      if (next === "u") {
        const hex = source.slice(index + 2, index + 6);
        if (!/^[0-9a-f]{4}$/i.test(hex)) throw new Error("Escape unicode inv\xE1lido no player");
        value += String.fromCharCode(parseInt(hex, 16));
        index += 5;
        continue;
      }
      if (next === "x") {
        const hex = source.slice(index + 2, index + 4);
        if (!/^[0-9a-f]{2}$/i.test(hex)) throw new Error("Escape hexadecimal inv\xE1lido no player");
        value += String.fromCharCode(parseInt(hex, 16));
        index += 3;
        continue;
      }
      value += next;
      index += 1;
      continue;
    }
    if (char === quote) return { value, end: index + 1 };
    value += char;
  }
  throw new Error("String do player sem fechamento");
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

// src/anizero/titles.js
var MIN_TITLE_SCORE = 0.85;
var SEASON_SUFFIX = /(?:\s*[-–—:|]\s*|\s+)(?:S(\d{1,2})|Season\s+(\d{1,2})|Temporada\s+(\d{1,2})|(\d{1,2})\s*ª?\s*Temporada)\s*$/i;
var AUDIO_SUFFIX = /(?:\s*[-–—:|]\s*|\s+)(?:Dublado|Legendado|Dublada|Legendada)\s*$/i;
var YEAR_SUFFIX = /(?:\s*[-–—:|]\s*|\s+)(?:19|20)\d{2}\s*$/;
var PARENTHETICAL = /\(([^()]*)\)/g;
var TITLE_SEPARATOR = /\s*[:–—]\s*|\s+-\s+/;
function readSeasonNumber(title) {
  const match = String(title).match(SEASON_SUFFIX);
  if (match === null) return null;
  const value = match[1] || match[2] || match[3] || match[4];
  return Number(value);
}
function stripSeasonMarker(title) {
  return String(title).replace(SEASON_SUFFIX, "").replace(/[\s\-–—:|]+$/, "").trim();
}
function titleVariants(title) {
  const raw = String(title).trim();
  if (raw === "") return [];
  const candidates = [];
  const add = (value) => {
    const text = String(value).trim();
    if (text !== "") candidates.push(text);
  };
  add(raw);
  const withoutSeason = stripSeasonMarker(raw);
  add(withoutSeason);
  const withoutAudio = withoutSeason.replace(AUDIO_SUFFIX, "").trim();
  add(withoutAudio);
  const withoutYear = withoutAudio.replace(YEAR_SUFFIX, "").trim();
  add(withoutYear);
  for (const base of [withoutSeason, withoutAudio, withoutYear]) {
    for (const match of base.matchAll(PARENTHETICAL)) {
      add(base.replace(match[0], " "));
      add(match[1]);
    }
    for (const part2 of base.split(TITLE_SEPARATOR)) add(part2);
  }
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const candidate of candidates) {
    const key = normalizeText(candidate);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}
function mediaTitles(media) {
  const titles = [media.title, media.originalTitle];
  for (const alternative of media.alternativeTitles || []) titles.push(alternative);
  for (const romaji of media.romajiTitles || []) titles.push(romaji.title);
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const title of titles) {
    if (typeof title !== "string" || title.trim() === "") continue;
    for (const variant of titleVariants(title)) {
      const key = normalizeText(variant);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      result.push(variant);
    }
  }
  return result;
}
function titleScore(title, media) {
  const sourceVariants = titleVariants(title);
  const tmdbVariants = mediaTitles(media);
  let best = 0;
  for (const source of sourceVariants) {
    for (const tmdb of tmdbVariants) {
      const score = titleSimilarity(source, tmdb);
      if (score > best) best = score;
    }
  }
  return best;
}
function matchAnimePage(page, media, season) {
  const allowedYears = [];
  if (Number.isInteger(media.year)) allowedYears.push(media.year);
  const seasonInfo = (media.seasons || []).find((item) => item.number === season);
  if (seasonInfo && Number.isInteger(seasonInfo.year)) allowedYears.push(seasonInfo.year);
  if (Number.isInteger(page.year) && allowedYears.length > 0) {
    const compatible = allowedYears.some((year) => Math.abs(page.year - year) <= 1);
    if (!compatible) return null;
  }
  const score = titleScore(page.title, media);
  if (score < MIN_TITLE_SCORE) return null;
  return { score };
}
function scoreCandidate(candidate, media) {
  return titleScore(candidate.title, media);
}

// src/anizero/site.js
var SITE_URL = "https://anizero.org";
var AJAX_URL = `${SITE_URL}/wp-admin/admin-ajax.php`;
var API_URL = `${SITE_URL}/api/`;
var MAX_CANDIDATES = 4;
var MAX_SEASON_CHAIN = 12;
function searchCandidates(media, season) {
  return __async(this, null, function* () {
    const candidates = [];
    const seenUrls = /* @__PURE__ */ new Set();
    for (const query of buildQueries(media, season)) {
      const response = yield fetchJson(AJAX_URL, {
        method: "POST",
        profile: "api",
        headers: { Referer: `${SITE_URL}/` },
        form: { action: "buscar_anime_rt", termo: query }
      });
      const items = readSearchResponse(response, query);
      for (const item of items) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        candidates.push(item);
      }
      if (candidates.some((item) => scoreCandidate(item, media) >= MIN_TITLE_SCORE)) break;
    }
    return candidates;
  });
}
function readAnimePage(url, cache) {
  return __async(this, null, function* () {
    if (cache && cache.has(url)) return cache.get(url);
    const response = yield fetchPage(url, {
      profile: "page",
      headers: { Referer: `${SITE_URL}/` }
    });
    const html = response.text;
    const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i);
    const yearMatch = html.match(/itemprop="copyrightYear"[^>]*>\s*(\d{4})\s*</i);
    const idMatch = html.match(/const\s+anime_id\s*=\s*(\d+)\s*;/);
    const missing = [];
    if (titleMatch === null) missing.push("h1");
    if (yearMatch === null) missing.push("copyrightYear");
    if (idMatch === null) missing.push("anime_id");
    if (missing.length > 0) {
      throw new Error(`Ficha fora do esquema em ${response.url}: ausente ${missing.join(", ")}`);
    }
    const title = decodeEntities(stripTags(titleMatch[1])).replace(/\s+/g, " ").trim();
    if (title === "") throw new Error(`Ficha sem t\xEDtulo em ${response.url}`);
    const page = {
      url: response.url,
      title,
      baseTitle: stripSeasonMarker(title),
      season: readSeasonNumber(title),
      year: Number(yearMatch[1]),
      animeId: Number(idMatch[1]),
      previousUrl: resolveSourceLink(readLinkByClass(html, "tempAnterior"), response.url),
      nextUrl: resolveSourceLink(readLinkByClass(html, "tempProxima"), response.url)
    };
    if (cache) cache.set(url, page);
    return page;
  });
}
function confirmCandidates(candidates, media, season, cache) {
  return __async(this, null, function* () {
    const ordered = candidates.map((candidate) => ({ candidate, score: scoreCandidate(candidate, media) })).sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
    const confirmed = [];
    const structureErrors = [];
    for (const item of ordered) {
      let page;
      try {
        page = yield readAnimePage(item.candidate.url, cache);
      } catch (error) {
        if (/HTTP 404/.test(error.message)) continue;
        structureErrors.push(error);
        continue;
      }
      const match = matchAnimePage(page, media, season);
      if (match !== null) confirmed.push({ page, score: match.score });
    }
    if (confirmed.length === 0 && structureErrors.length > 0) throw structureErrors[0];
    return confirmed;
  });
}
function resolveSeasonPage(confirmed, media, season, cache) {
  return __async(this, null, function* () {
    const direct = confirmed.filter(({ page }) => page.season === season);
    if (direct.length > 0) return direct[0].page;
    if (season === 1) {
      const base2 = confirmed.find(({ page }) => page.season === null || page.season === 1);
      if (base2) return base2.page;
    }
    const base = confirmed.find(({ page }) => page.season === null || page.season === 1);
    const start = base || confirmed.reduce((lowest, item) => {
      if (lowest === null) return item;
      return normalizeSeason(item.page) < normalizeSeason(lowest.page) ? item : lowest;
    }, null);
    if (!start) return null;
    let current = start.page;
    const visited = /* @__PURE__ */ new Set([current.url]);
    let steps = 0;
    while (current.previousUrl && steps < MAX_SEASON_CHAIN) {
      const previous = yield loadChainPage(current.previousUrl, media, season, cache);
      if (!previous) break;
      const currentSeason = normalizeSeason(current);
      const previousSeason = normalizeSeason(previous);
      if (currentSeason === null || previousSeason === null || previousSeason !== currentSeason - 1) break;
      if (visited.has(previous.url)) break;
      visited.add(previous.url);
      current = previous;
      steps += 1;
    }
    if (normalizeSeason(current) === season) return current;
    steps = 0;
    while (current.nextUrl && steps < MAX_SEASON_CHAIN) {
      const next = yield loadChainPage(current.nextUrl, media, season, cache);
      if (!next) break;
      const currentSeason = normalizeSeason(current);
      const nextSeason = normalizeSeason(next);
      if (currentSeason === null || nextSeason === null || nextSeason !== currentSeason + 1) break;
      if (visited.has(next.url)) break;
      visited.add(next.url);
      current = next;
      steps += 1;
      if (normalizeSeason(current) === season) return current;
    }
    return null;
  });
}
function fetchShowVideos(animeId) {
  return __async(this, null, function* () {
    const response = yield fetchJson(API_URL, {
      method: "POST",
      profile: "api",
      headers: { Referer: `${SITE_URL}/` },
      form: { action: "show_videos", anime_id: String(animeId) }
    });
    if (response === null || typeof response !== "object" || Array.isArray(response)) {
      throw new Error(`Lista de epis\xF3dios fora do esquema para anime_id ${animeId}`);
    }
    const { episodios } = response;
    if (episodios === void 0 || episodios === null || typeof episodios !== "object" || Array.isArray(episodios)) {
      throw new Error(`Lista de epis\xF3dios sem "episodios" para anime_id ${animeId}`);
    }
    return {
      episodios,
      ovas: readOptionalList(response.ovas),
      filmes: readOptionalList(response.filmes)
    };
  });
}
function selectEpisode(videos, target) {
  for (const entry of Object.values(videos.episodios)) {
    if (entry === null || typeof entry !== "object") {
      throw new Error(`Epis\xF3dio fora do esquema: item n\xE3o \xE9 objeto em anime_id ${videos.animeId || ""}`);
    }
    if (Number(entry.epi_num) !== target) continue;
    if (typeof entry.epi_url !== "string" || entry.epi_url.trim() === "") {
      throw new Error(`Epis\xF3dio ${target} sem epi_url`);
    }
    let url;
    try {
      url = new URL(entry.epi_url);
    } catch (e) {
      throw new Error(`Epis\xF3dio ${target} com epi_url inv\xE1lida`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Epis\xF3dio ${target} com epi_url fora de HTTP(S)`);
    }
    return entry;
  }
  return null;
}
function absoluteEpisode(media, season, episode, videos) {
  const regular = (media.seasons || []).filter((item) => Number.isInteger(item.number) && item.number > 0 && Number.isInteger(item.episodeCount) && item.episodeCount > 0).sort((a, b) => a.number - b.number);
  if (!regular.some((item) => item.number === season)) return null;
  const total = regular.reduce((sum, item) => sum + item.episodeCount, 0);
  const pageCount = Object.keys(videos.episodios).length;
  if (pageCount < total * 0.9 || pageCount > total * 1.1) return null;
  const before = regular.filter((item) => item.number < season).reduce((sum, item) => sum + item.episodeCount, 0);
  return before + episode;
}
function readVideoPlayerUrl(videoUrl) {
  return __async(this, null, function* () {
    const response = yield fetchPage(videoUrl, {
      profile: "page",
      headers: { Referer: `${SITE_URL}/` }
    });
    const iframes = response.text.match(/<iframe\b[^>]*>/gi) || [];
    for (const tag of iframes) {
      const src = readAttribute(tag, "src");
      if (src === null) continue;
      const decoded = decodeEntities(src);
      if (!decoded.includes("/player")) continue;
      const url = resolveSourceLink(decoded, response.url);
      if (url !== null) return { url, referer: response.url };
    }
    throw new Error(`P\xE1gina do v\xEDdeo sem iframe do player em ${response.url}`);
  });
}
function readLinkByClass(html, className) {
  const tags = html.match(/<a\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const classes = readAttribute(tag, "class");
    if (classes === null || !classes.split(/\s+/).includes(className)) continue;
    const href = readAttribute(tag, "href");
    if (href !== null) return href;
  }
  return null;
}
function resolveSourceLink(link, base) {
  if (link === null || link.trim() === "") return null;
  let url;
  try {
    url = new URL(link, base);
  } catch (e) {
    return null;
  }
  if (url.hostname !== "anizero.org" && url.hostname !== "www.anizero.org") return null;
  return url.href;
}
function normalizeSeason(page) {
  if (page.season === null) return 1;
  return Number.isInteger(page.season) ? page.season : null;
}
function loadChainPage(url, media, season, cache) {
  return __async(this, null, function* () {
    let page;
    try {
      page = yield readAnimePage(url, cache);
    } catch (error) {
      if (/HTTP 404/.test(error.message)) return null;
      throw error;
    }
    return matchAnimePage(page, media, season) === null ? null : page;
  });
}
function buildQueries(media, season) {
  const titles = [media.title, media.originalTitle];
  for (const alternative of media.alternativeTitles || []) titles.push(alternative);
  for (const romaji of media.romajiTitles || []) titles.push(romaji.title);
  const seen = /* @__PURE__ */ new Set();
  const queries = [];
  const add = (value) => {
    if (typeof value !== "string" || value.trim() === "") return;
    const key = normalizeText(value);
    if (key === "" || seen.has(key)) return;
    seen.add(key);
    queries.push(value.trim());
  };
  for (const title of titles) add(title);
  if (season > 1) {
    for (const title of titles.slice(0, 3)) add(`${title} S${season}`);
  }
  return queries.slice(0, 8);
}
function readSearchResponse(response, query) {
  if (Array.isArray(response)) {
    const items = [];
    for (const item of response) {
      if (item === null || typeof item !== "object") {
        throw new Error(`Busca fora do esquema para "${query}": item n\xE3o \xE9 objeto`);
      }
      if (typeof item.title !== "string" || typeof item.url !== "string") {
        throw new Error(`Busca fora do esquema para "${query}": item sem title/url`);
      }
      if (/^filme/i.test(typeof item.tipo === "string" ? item.tipo : "")) continue;
      const url = resolveSourceLink(item.url, SITE_URL);
      if (url === null || !new URL(url).pathname.startsWith("/anime/")) continue;
      items.push({
        title: decodeEntities(item.title).replace(/\s+/g, " ").trim(),
        url,
        tipo: typeof item.tipo === "string" ? item.tipo : null
      });
    }
    return items;
  }
  if (response !== null && typeof response === "object" && typeof response.error === "string") {
    return [];
  }
  throw new Error(`Busca fora do esquema para "${query}"`);
}
function readOptionalList(value) {
  if (value === void 0 || value === null) return {};
  if (Array.isArray(value)) return {};
  if (typeof value !== "object") {
    throw new Error("Lista opcional de v\xEDdeos fora do esquema");
  }
  return value;
}

// src/anizero/extractor.js
function extractStreams(request2, providerName) {
  return __async(this, null, function* () {
    if (request2.mediaType !== "tv") return [];
    const media = yield getMediaInfo(request2);
    const cache = /* @__PURE__ */ new Map();
    const candidates = yield searchCandidates(media, request2.season);
    if (candidates.length === 0) return [];
    const confirmed = yield confirmCandidates(candidates, media, request2.season, cache);
    if (confirmed.length === 0) return [];
    const seasonPage = yield resolveSeasonPage(confirmed, media, request2.season, cache);
    let page;
    let videos;
    let targetEpisode;
    if (seasonPage !== null) {
      page = seasonPage;
      videos = yield fetchShowVideos(page.animeId);
      targetEpisode = request2.episode;
    } else {
      const base = confirmed.find(({ page: item }) => item.season === null || item.season === 1);
      if (!base) return [];
      page = base.page;
      videos = yield fetchShowVideos(page.animeId);
      targetEpisode = absoluteEpisode(media, request2.season, request2.episode, videos);
      if (targetEpisode === null) return [];
    }
    const entry = selectEpisode(videos, targetEpisode);
    if (entry === null) return [];
    const playerReference = yield readVideoPlayerUrl(entry.epi_url);
    const player = yield resolvePlayerPage(playerReference.url, playerReference.referer);
    if (player.options.length === 0) return [];
    const streams = [];
    const failures = [];
    const seenUrls = /* @__PURE__ */ new Set();
    for (const option of player.options) {
      try {
        const embedUrl = decodePlayerUrl(option.script);
        const embed = yield resolveEmbed(embedUrl, player.url);
        if (embed.notReady) continue;
        if (embed.sources.length === 0) continue;
        const headers = playbackHeaders(embed.url);
        for (const source of embed.sources) {
          if (seenUrls.has(source.url)) continue;
          seenUrls.add(source.url);
          const fields = {
            url: source.url,
            headers,
            provider: new URL(source.url).host,
            type: "hls",
            languageHints: [option.label, page.title],
            qualityHints: source.label === null ? [] : [source.label],
            format: formatDetails(providerName, media, request2)
          };
          if (embed.subtitles.length > 0) fields.subtitles = embed.subtitles;
          streams.push(buildStream(fields));
        }
      } catch (error) {
        failures.push({ label: option.label, error });
        console.warn(`[${providerName}] Op\xE7\xE3o ${option.label} descartada: ${sanitizeMessage(error.message)}`);
      }
    }
    if (streams.length > 0) return streams;
    if (failures.length > 0) {
      const details = failures.map(({ label, error }) => `${label}: ${sanitizeMessage(error.message)}`).join("; ");
      throw new Error(`Nenhuma op\xE7\xE3o produziu stream: ${details}`);
    }
    return [];
  });
}
function formatDetails(providerName, media, request2) {
  const format = {
    template: FORMATTER.AUTO,
    addon: providerName,
    title: media.title,
    season: request2.season,
    episode: request2.episode
  };
  if (Number.isInteger(media.year)) format.year = media.year;
  return format;
}

// src/anizero/index.js
var PROVIDER_NAME = "AniZero";
var TMDB_ID = /^[1-9]\d*$/;
function validateInput(tmdbId, mediaType, season, episode) {
  const id = String(tmdbId).trim();
  if (!TMDB_ID.test(id)) throw new Error(`Entrada: ID do TMDB inv\xE1lido: ${tmdbId}`);
  if (mediaType !== "movie" && mediaType !== "tv") {
    throw new Error(`Entrada: tipo de m\xEDdia inv\xE1lido: "${mediaType}" (esperado "movie" ou "tv")`);
  }
  if (mediaType === "tv" && (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1)) {
    throw new Error(`Entrada: s\xE9rie sem temporada/epis\xF3dio v\xE1lidos: temporada=${season}, epis\xF3dio=${episode}`);
  }
  return {
    tmdbId: id,
    mediaType,
    season: mediaType === "tv" ? season : null,
    episode: mediaType === "tv" ? episode : null
  };
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const request2 = validateInput(tmdbId, mediaType, season, episode);
      if (request2.mediaType !== "tv") return [];
      const streams = yield extractStreams(request2, PROVIDER_NAME);
      return sortByQuality(streams);
    } catch (error) {
      console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${sanitizeMessage(error.message)}`);
      return [];
    }
  });
}
module.exports = { getStreams };
