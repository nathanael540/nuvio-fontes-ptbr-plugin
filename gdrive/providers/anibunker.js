/** anibunker (formato gdrive) - gerado a partir de src/anibunker/ — não edite manualmente. */
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
    return checkTemplate("gdrive", "NUVIO_FORMATTER (constante de build)", CONCRETE_TEMPLATES);
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
function playbackHeaders(pageUrl2, options = {}) {
  const userAgent = options.userAgent === void 0 ? DEFAULT_USER_AGENT : options.userAgent;
  if (typeof userAgent !== "string" || userAgent.trim() === "") {
    throw new Error(`userAgent inv\xE1lido: "${options.userAgent}" (esperado texto n\xE3o vazio)`);
  }
  return { "User-Agent": userAgent, Referer: pageUrl2, Origin: httpOrigin(pageUrl2) };
}
function httpOrigin(pageUrl2) {
  const invalid = new Error(`pageUrl inv\xE1lida: "${pageUrl2}" (esperada URL http ou https)`);
  if (typeof pageUrl2 !== "string") throw invalid;
  let parsed;
  try {
    parsed = new URL(pageUrl2);
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

// src/anibunker/html.js
function loadHtml(html) {
  const { load } = require("cheerio-without-node-native");
  return load(html);
}
function textOf(node) {
  return node.text().replace(/\s+/g, " ").trim();
}

// src/_blocks/title-match/index.mjs
var DEFAULT_MIN_SCORE = 0.85;
var DEFAULT_YEAR_TOLERANCE = 1;
var FOUR_DIGIT_YEAR = /^\d{4}$/;
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
function findBestMatch(candidates, media, options = {}) {
  const { minScore = DEFAULT_MIN_SCORE, yearTolerance = DEFAULT_YEAR_TOLERANCE } = options;
  if (typeof minScore !== "number" || !(minScore >= 0 && minScore <= 1)) {
    throw new Error(`minScore inv\xE1lido: "${minScore}" (esperado n\xFAmero entre 0 e 1)`);
  }
  if (!Number.isInteger(yearTolerance) || yearTolerance < 0) {
    throw new Error(`yearTolerance inv\xE1lido: "${yearTolerance}" (esperado inteiro maior ou igual a 0)`);
  }
  if (!Array.isArray(candidates)) {
    throw new Error(`candidates inv\xE1lido: esperado array, recebeu ${typeof candidates}`);
  }
  const mediaTitles2 = readMediaTitles(media);
  const mediaYear = readMediaYear(media.year);
  let best = null;
  candidates.forEach((candidate, index) => {
    const candidateYear = readCandidate(candidate, index);
    if (candidateYear !== null && mediaYear !== null && Math.abs(candidateYear - mediaYear) > yearTolerance) return;
    const score = Math.max(...mediaTitles2.map((title) => titleSimilarity(candidate.title, title)));
    if (score < minScore) return;
    const exactYear = candidateYear !== null && candidateYear === mediaYear;
    if (best === null || score > best.score || score === best.score && exactYear && !best.exactYear) {
      best = { candidate, score, exactYear };
    }
  });
  return best === null ? null : { candidate: best.candidate, score: best.score };
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
function readMediaTitles(media) {
  if (typeof media !== "object" || media === null || typeof media.title !== "string") {
    throw new Error("media inv\xE1lido: esperado objeto com title string");
  }
  const { title, originalTitle, alternativeTitles } = media;
  if (originalTitle !== void 0 && typeof originalTitle !== "string") {
    throw new Error(`media.originalTitle inv\xE1lido: esperado string, recebeu ${typeof originalTitle}`);
  }
  if (alternativeTitles !== void 0 && !(Array.isArray(alternativeTitles) && alternativeTitles.every((item) => typeof item === "string"))) {
    throw new Error("media.alternativeTitles inv\xE1lido: esperado array de strings");
  }
  return [title].concat(originalTitle === void 0 ? [] : [originalTitle], alternativeTitles || []);
}
function readMediaYear(year) {
  if (year === void 0 || year === null) return null;
  if (!Number.isInteger(year)) throw new Error(`media.year inv\xE1lido: "${year}" (esperado inteiro ou null)`);
  return year;
}
function readCandidate(candidate, index) {
  if (typeof candidate !== "object" || candidate === null || typeof candidate.title !== "string") {
    throw new Error(`candidates[${index}] inv\xE1lido: esperado objeto com title string`);
  }
  const { year } = candidate;
  if (year === void 0 || year === null) return null;
  if (Number.isInteger(year)) return year;
  if (typeof year === "string" && FOUR_DIGIT_YEAR.test(year)) return Number(year);
  throw new Error(`candidates[${index}].year inv\xE1lido: "${year}" (esperado inteiro, string de 4 d\xEDgitos ou null)`);
}

// src/anibunker/titles.js
var MIN_TITLE_SCORE = 0.85;
var MIN_BASE_SCORE = 0.9;
var YEAR_TOLERANCE = 1;
var MAX_NUMERIC_SEASON = 20;
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
  /\b(\d+)\s*ª?\s*temporada\b/i,
  /\btemporada\s+(\d+)\b/i
];
function mediaTitles(media) {
  if (!media || typeof media !== "object" || typeof media.title !== "string" || media.title.trim() === "") {
    throw new Error("media inv\xE1lido: esperado objeto com title n\xE3o vazio");
  }
  const titles = [media.title];
  if (media.originalTitle !== void 0) titles.push(media.originalTitle);
  if (media.alternativeTitles !== void 0) {
    if (!Array.isArray(media.alternativeTitles)) throw new Error("media.alternativeTitles deve ser lista");
    titles.push(...media.alternativeTitles);
  }
  if (media.romajiTitles !== void 0) {
    if (!Array.isArray(media.romajiTitles)) throw new Error("media.romajiTitles deve ser lista");
    for (const item of media.romajiTitles) {
      if (!item || typeof item.title !== "string") throw new Error("media.romajiTitles com item inv\xE1lido");
      titles.push(item.title);
    }
  }
  return uniqueTitles(titles);
}
function baseTitles(media, season) {
  const titles = [media.title];
  if (media.originalTitle !== void 0) titles.push(media.originalTitle);
  if (media.alternativeTitles !== void 0) {
    if (!Array.isArray(media.alternativeTitles)) throw new Error("media.alternativeTitles deve ser lista");
    titles.push(...media.alternativeTitles);
  }
  if (media.romajiTitles !== void 0) {
    if (!Array.isArray(media.romajiTitles)) throw new Error("media.romajiTitles deve ser lista");
    for (const item of media.romajiTitles) {
      if (!item || typeof item.title !== "string") throw new Error("media.romajiTitles com item inv\xE1lido");
      if (season === null || item.season === null || item.season === 1) titles.push(item.title);
    }
  }
  return uniqueTitles(titles);
}
function readExplicitSeason(title) {
  const text = typeof title === "string" ? title.trim() : "";
  for (const pattern of EXPLICIT_SEASON_PATTERNS) {
    const match = pattern.exec(text);
    if (match !== null) return Number(match[1]);
  }
  return null;
}
function readSeasonNumber(title, media) {
  const text = typeof title === "string" ? title.trim() : "";
  const explicit = readExplicitSeason(text);
  if (explicit !== null) return explicit;
  const numeric = /^(.+?)\s+(\d{1,2})$/.exec(text);
  if (numeric !== null) {
    const season = Number(numeric[2]);
    if (season >= 2 && season <= MAX_NUMERIC_SEASON && isMediaBase(numeric[1], media)) return season;
  }
  const roman = /^(.+?)\s+([IVX]+)$/i.exec(text);
  if (roman !== null) {
    const season = ROMAN_SEASONS[roman[2].toUpperCase()];
    if (season !== void 0 && season <= MAX_ROMAN_SEASON && isMediaBase(roman[1], media)) return season;
  }
  return 1;
}
function isSeasonCandidate(title, media, mediaType, season) {
  if (mediaType !== "tv" || !Number.isInteger(season)) return true;
  if (readSeasonNumber(title, media) === season) return true;
  return matchesSpecificRomaji(title, media, season);
}
function expectedSeasonYear(media, mediaType, season) {
  if (mediaType === "movie") return Number.isInteger(media.year) ? media.year : null;
  if (Array.isArray(media.seasons)) {
    const found = media.seasons.find((item) => item.number === season);
    if (found && Number.isInteger(found.year)) return found.year;
  }
  return season === 1 && Number.isInteger(media.year) ? media.year : null;
}
function yearMatches(pageYear, expectedYear) {
  if (!Number.isInteger(pageYear) || !Number.isInteger(expectedYear)) return true;
  return Math.abs(pageYear - expectedYear) <= YEAR_TOLERANCE;
}
function titleMatches(pageTitle, media, query = null) {
  if (typeof pageTitle !== "string" || pageTitle.trim() === "") {
    throw new Error("pageTitle inv\xE1lido: esperado texto n\xE3o vazio");
  }
  const titles = mediaTitles(media);
  if (typeof query === "string" && query.trim() !== "") titles.push(query.trim());
  return titles.some((title) => titleSimilarity(pageTitle, title) >= MIN_TITLE_SCORE);
}
function seasonMatches(pageTitle, media, season) {
  if (!Number.isInteger(season) || season < 1) throw new Error(`season inv\xE1lida: ${season}`);
  if (matchesSpecificRomaji(pageTitle, media, season)) return true;
  return readSeasonNumber(pageTitle, media) === season;
}
function matchesSpecificRomaji(title, media, season) {
  if (!Array.isArray(media.romajiTitles)) return false;
  return media.romajiTitles.some(
    (item) => item && item.season === season && typeof item.title === "string" && titleSimilarity(title, item.title) >= MIN_BASE_SCORE
  );
}
function isMediaBase(base, media) {
  const normalized = normalizeText(base);
  if (normalized === "") return false;
  return mediaTitles(media).some(
    (title) => normalizeText(title) === normalized || titleSimilarity(title, base) >= MIN_BASE_SCORE
  );
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

// src/anibunker/pages.js
var TRACKS = Object.freeze([
  Object.freeze({ suffix: "legendado", label: "Legendado" }),
  Object.freeze({ suffix: "dublado", label: "Dublado" })
]);
var PLAYER_LABELS = Object.freeze({
  token: "YTube",
  url_drive: "Gdrive",
  url_hd: "HD+",
  url_hd_2: "HD 2",
  url_hd_3: "HD 3",
  sendvid: "Sendvid",
  url_mega: "Mega"
});
function readAnimePage(html, pageUrl2) {
  const $ = loadHtml(html);
  if ($(".field-info").length === 0) {
    throw new Error(`Ficha do AniBunker em ${pageUrl2} sem .field-info`);
  }
  const title = textOf($("h1").eq(0));
  if (title === "") throw new Error(`Ficha do AniBunker em ${pageUrl2} sem h1`);
  const fields = {};
  const items = $(".field-info");
  for (let index = 0; index < items.length; index += 1) {
    const text = textOf(items.eq(index));
    const match = /^([^:]+):\s*(.+)$/.exec(text);
    if (match === null) continue;
    fields[match[1].trim().toLowerCase()] = match[2].trim();
  }
  const format = fields.formato;
  if (!format) throw new Error(`Ficha do AniBunker em ${pageUrl2} sem Formato`);
  const yearText = fields.ano;
  if (!yearText || !/^\d{4}$/.test(yearText)) {
    throw new Error(`Ficha do AniBunker em ${pageUrl2} sem Ano`);
  }
  const added = fields.adicionados;
  if (!added) throw new Error(`Ficha do AniBunker em ${pageUrl2} sem Adicionados`);
  return {
    title,
    format,
    year: Number(yearText),
    audioCounts: readAudioCounts(added, pageUrl2),
    url: pageUrl2
  };
}
function confirmAnimePage(page, media, mediaType, season, query) {
  if (mediaType === "movie") {
    if (!/^filme$/i.test(page.format)) return false;
  } else if (!/^anime$/i.test(page.format)) {
    return false;
  }
  if (!titleMatches(page.title, media, query)) return false;
  if (!yearMatches(page.year, expectedSeasonYear(media, mediaType, season))) return false;
  if (mediaType === "tv" && !seasonMatches(page.title, media, season)) return false;
  return true;
}
function buildEpisodeOptions(page, mediaType, episode) {
  const number = mediaType === "movie" ? 1 : episode;
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Epis\xF3dio inv\xE1lido para o AniBunker: ${episode}`);
  }
  const base = page.url.replace(/\/+$/, "");
  const options = [];
  for (const track of TRACKS) {
    const count = page.audioCounts[track.suffix];
    const viable = mediaType === "movie" ? count > 0 : count >= number;
    if (!viable) continue;
    options.push({
      label: track.label,
      language: track.label,
      url: `${base}-episodio-${number}-${track.suffix}`
    });
  }
  return options;
}
function readEpisodePage(html, pageUrl2) {
  const $ = loadHtml(html);
  const container = $("[data-video-id]").eq(0);
  const videoId = container.length === 0 ? "" : String(container.attr("data-video-id") || "").trim();
  if (videoId === "") throw new Error(`Epis\xF3dio do AniBunker em ${pageUrl2} sem data-video-id`);
  const buttons = $("[data-player-id]");
  const players = [];
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons.eq(index);
    const id = String(button.attr("data-player-id") || "").trim();
    if (id === "") continue;
    players.push({ id, label: playerLabel(id, textOf(button)) });
  }
  if (players.length === 0) throw new Error(`Epis\xF3dio do AniBunker em ${pageUrl2} sem player`);
  return { videoId, players, url: pageUrl2 };
}
function readAudioCounts(text, pageUrl2) {
  const legendado = /(\d+)\s+legendad[oa]s?/i.exec(text);
  const dublado = /(\d+)\s+dublad[oa]s?/i.exec(text);
  if (legendado === null || dublado === null) {
    throw new Error(`Ficha do AniBunker em ${pageUrl2} sem contagem de \xE1udios`);
  }
  return { legendado: Number(legendado[1]), dublado: Number(dublado[1]) };
}
function playerLabel(id, text) {
  if (PLAYER_LABELS[id]) return PLAYER_LABELS[id];
  if (text !== "") return text;
  return id;
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

// src/anibunker/site.js
var SOURCE_URL = "https://anibunker.com";
var SEARCH_URL = `${SOURCE_URL}/php/search.php`;
var LOADER_URL = `${SOURCE_URL}/php/loader.php`;
var BLOGGER_TOKEN_PREFIX = "AD6v5d";
var PROVIDER_NAME = "AniBunker";

// src/anibunker/players.js
var BLOGGER_REFERER = "https://www.blogger.com/";
var SENDVID_HOSTS = /* @__PURE__ */ new Set(["sendvid.com", "www.sendvid.com"]);
var DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;
var DIRECT_MEDIA = /\.(?:mp4|m3u8|mkv|webm)$/i;
var ITAG_QUALITY = Object.freeze({ 18: "360p", 22: "720p", 37: "1080p", 59: "480p" });
function resolvePlayers(episode, pageUrl2, providerName) {
  return __async(this, null, function* () {
    const options = episode.players.filter((player) => player.id !== "url_mega");
    if (options.length === 0) return [];
    const results = yield Promise.all(options.map((player) => __async(null, null, function* () {
      try {
        return { ok: true, label: player.label, streams: yield resolvePlayer(player, episode.videoId, pageUrl2) };
      } catch (error) {
        return { ok: false, label: player.label, error };
      }
    })));
    const streams = [];
    const failures = [];
    for (const result of results) {
      if (result.ok) {
        streams.push(...result.streams);
        continue;
      }
      failures.push({ label: result.label, message: result.error.message });
      console.warn(`[${providerName}] Op\xE7\xE3o ${result.label} descartada: ${sanitizeMessage(result.error.message)}`);
    }
    if (streams.length > 0) return streams;
    if (failures.length === 0) return [];
    const causes = failures.map((failure) => `${failure.label}: ${sanitizeMessage(failure.message)}`).join("; ");
    throw new Error(`Nenhum player produziu stream: ${causes}`);
  });
}
function sanitizeMessage(message) {
  return String(message).replace(/https?:\/\/\S+/gi, "[url]").replace(/\b[A-Za-z0-9_-]{28,}\b/g, "[token]");
}
function resolvePlayer(player, videoId, pageUrl2) {
  return __async(this, null, function* () {
    const target = yield loadTarget(player.id, videoId);
    if (player.id === "token") return resolveBlogger(target, player.label, pageUrl2);
    if (player.id === "url_drive") return resolveDrive(target, player.label);
    if (player.id === "sendvid") return resolveSendvid(target, player.label, pageUrl2);
    if (player.id === "url_hd" || player.id === "url_hd_2" || player.id === "url_hd_3") {
      return resolveHd(target, player.label, pageUrl2);
    }
    return resolveGeneric(target, player.label, pageUrl2);
  });
}
function loadTarget(playerId, videoId) {
  return __async(this, null, function* () {
    const data = yield fetchJson(LOADER_URL, {
      method: "POST",
      profile: "api",
      form: { player_id: playerId, video_id: videoId },
      headers: { Origin: SOURCE_URL }
    });
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`Carregador do AniBunker fora do esquema para ${playerId}`);
    }
    if (data.success !== true) {
      const reason = typeof data.message === "string" && data.message.trim() !== "" ? data.message.trim() : "sem mensagem";
      throw new Error(`Carregador recusou ${playerId}: ${reason}`);
    }
    const url = typeof data.url === "string" ? data.url.trim() : "";
    if (url === "") throw new Error(`Carregador do AniBunker sem URL para ${playerId}`);
    return url;
  });
}
function resolveBlogger(token, label, pageUrl2) {
  return __async(this, null, function* () {
    const url = bloggerTokenUrl(token);
    const html = yield fetchText(url, { profile: "player", headers: { Referer: pageUrl2 } });
    const formats = extractBloggerFormats(html);
    const headers = playbackHeaders(BLOGGER_REFERER);
    return formats.map((format) => {
      const quality = format.qualityLabel || itagQuality(format.url);
      const option = { url: format.url, type: "mp4", provider: label, headers };
      if (quality !== null) option.qualityHints = [quality];
      return option;
    });
  });
}
function bloggerTokenUrl(token) {
  const text = typeof token === "string" ? token.trim() : "";
  if (text === "") throw new Error("Player YTube sem token");
  const value = text.startsWith(BLOGGER_TOKEN_PREFIX) ? text : `${BLOGGER_TOKEN_PREFIX}${text}`;
  return `https://www.blogger.com/video.g?token=${value}`;
}
function itagQuality(url) {
  const match = /[?&]itag=(\d+)/.exec(url);
  if (match === null) return null;
  return ITAG_QUALITY[match[1]] || null;
}
function resolveDrive(target, label) {
  const id = driveId(target);
  return [{
    url: `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
    type: "mp4",
    provider: label
  }];
}
function driveId(target) {
  const text = typeof target === "string" ? target.trim() : "";
  if (DRIVE_ID.test(text)) return text;
  if (isHttpUrl2(text)) {
    const parsed = new URL(text);
    const fromQuery = parsed.searchParams.get("id");
    if (fromQuery && DRIVE_ID.test(fromQuery)) return fromQuery;
    const fromPath = /\/d\/([A-Za-z0-9_-]{10,})/.exec(parsed.pathname);
    if (fromPath !== null) return fromPath[1];
  }
  throw new Error("Player Gdrive sem identificador");
}
function resolveSendvid(target, label, pageUrl2) {
  return __async(this, null, function* () {
    if (!isHttpUrl2(target)) throw new Error("Player Sendvid sem URL http(s)");
    if (isDirectMedia(target)) {
      return [{ url: target, type: mediaTypeFromUrl(target), provider: label }];
    }
    const media = yield readEmbedMedia(target, pageUrl2);
    return [{ url: media.url, type: media.type, provider: label }];
  });
}
function resolveHd(target, label, pageUrl2) {
  return __async(this, null, function* () {
    if (!isHttpUrl2(target)) throw new Error(`Player ${label} sem URL http(s)`);
    if (isSendvidEmbed(target)) {
      const media = yield readEmbedMedia(target, pageUrl2);
      return [{ url: media.url, type: media.type, provider: label, qualityHints: [label] }];
    }
    return [{ url: target, type: mediaTypeFromUrl(target), provider: label, qualityHints: [label] }];
  });
}
function resolveGeneric(target, label, pageUrl2) {
  return __async(this, null, function* () {
    if (!isHttpUrl2(target)) throw new Error(`Player ${label} sem URL http(s)`);
    if (isDirectMedia(target)) {
      return [{ url: target, type: mediaTypeFromUrl(target), provider: label }];
    }
    const media = yield readEmbedMedia(target, pageUrl2);
    return [{ url: media.url, type: media.type, provider: label }];
  });
}
function readEmbedMedia(url, pageUrl2) {
  return __async(this, null, function* () {
    const html = yield fetchText(url, { profile: "player", headers: { Referer: pageUrl2 } });
    const $ = loadHtml(html);
    const sources = $("source");
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources.eq(index);
      const src = String(source.attr("src") || "").trim();
      if (!isHttpUrl2(src)) continue;
      const type = String(source.attr("type") || "").toLowerCase();
      if (type.includes("mpegurl")) return { url: src, type: "hls" };
      if (type.includes("mp4")) return { url: src, type: "mp4" };
      if (type === "") return { url: src, type: mediaTypeFromUrl(src) };
    }
    let videoUrl = "";
    let videoType = "";
    const metas = $("meta");
    for (let index = 0; index < metas.length; index += 1) {
      const meta = metas.eq(index);
      const property = String(meta.attr("property") || "").toLowerCase();
      const content = String(meta.attr("content") || "").trim();
      if ((property === "og:video" || property === "og:video:secure_url") && videoUrl === "" && isHttpUrl2(content)) {
        videoUrl = content;
      }
      if (property === "og:video:type") videoType = content.toLowerCase();
    }
    if (videoUrl === "") throw new Error("Embed sem source MP4 ou og:video");
    if (videoType.includes("mpegurl")) return { url: videoUrl, type: "hls" };
    if (videoType.includes("mp4")) return { url: videoUrl, type: "mp4" };
    if (videoType !== "") throw new Error(`Embed com tipo de m\xEDdia n\xE3o suportado: ${videoType}`);
    return { url: videoUrl, type: mediaTypeFromUrl(videoUrl) };
  });
}
function isDirectMedia(url) {
  if (!isHttpUrl2(url)) return false;
  return DIRECT_MEDIA.test(new URL(url).pathname);
}
function mediaTypeFromUrl(url) {
  return /\.m3u8$/i.test(new URL(url).pathname) ? "hls" : "mp4";
}
function isSendvidEmbed(url) {
  if (!isHttpUrl2(url)) return false;
  const parsed = new URL(url);
  return SENDVID_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.pathname.startsWith("/embed/");
}
function isHttpUrl2(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const protocol = new URL(value.trim()).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch (e) {
    return false;
  }
}

// src/anibunker/search.js
var MIN_SEARCH_SCORE = 0.6;
var MAX_QUERIES = 10;
var ANIBUNKER_HOSTS = /* @__PURE__ */ new Set(["anibunker.com", "www.anibunker.com"]);
function buildQueries(media, mediaType, season) {
  if (mediaType !== "movie" && mediaType !== "tv") {
    throw new Error(`mediaType inv\xE1lido: "${mediaType}" (esperado "movie" ou "tv")`);
  }
  if (mediaType === "tv" && (!Number.isInteger(season) || season < 1)) {
    throw new Error(`S\xE9rie sem temporada v\xE1lida: ${season}`);
  }
  const queries = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (query, querySeason) => {
    if (queries.length >= MAX_QUERIES) return;
    const text = typeof query === "string" ? query.trim() : "";
    if (text === "") return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ query: text, season: querySeason });
  };
  const requestedSeason = mediaType === "tv" ? season : null;
  if (requestedSeason !== null && requestedSeason > 1) {
    for (const item of media.romajiTitles || []) {
      if (item && item.season === requestedSeason) add(item.title, requestedSeason);
    }
  }
  const bases = baseTitles(media, requestedSeason);
  if (requestedSeason !== null && requestedSeason > 1) {
    const seasonName = readSeasonName(media, requestedSeason);
    for (const base of bases) {
      add(`${base} ${requestedSeason}`, requestedSeason);
      if (seasonName !== null) add(`${base} ${seasonName}`, requestedSeason);
      add(`${base} Temporada ${requestedSeason}`, requestedSeason);
      add(`${base} ${requestedSeason}\xAA Temporada`, requestedSeason);
    }
  }
  for (const base of bases) add(base, requestedSeason === null ? null : 1);
  return queries;
}
function parseSearchResults(data) {
  if (!Array.isArray(data)) {
    throw new Error(`Busca do AniBunker fora do esquema: esperada lista (recebido: ${typeof data})`);
  }
  return data.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Busca do AniBunker fora do esquema: item ${index} n\xE3o \xE9 objeto`);
    }
    const title = typeof item.name === "string" ? item.name.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (title === "" || url === "") {
      throw new Error(`Busca do AniBunker fora do esquema: item ${index} sem name/url`);
    }
    return { title, url: pageUrl(url) };
  });
}
function searchCandidates(query) {
  return __async(this, null, function* () {
    const text = typeof query === "string" ? query.trim() : "";
    if (text === "") throw new Error("Termo de busca vazio");
    const data = yield fetchJson(SEARCH_URL, { method: "POST", profile: "api", form: { query: text } });
    return parseSearchResults(data);
  });
}
function selectCandidate(candidates, media) {
  if (!Array.isArray(candidates)) throw new Error("candidates deve ser lista");
  if (!media || typeof media !== "object" || typeof media.title !== "string") {
    throw new Error("media inv\xE1lido: esperado objeto com title");
  }
  const alternativeTitles = [];
  if (Array.isArray(media.alternativeTitles)) alternativeTitles.push(...media.alternativeTitles);
  for (const item of media.romajiTitles || []) {
    if (item && typeof item.title === "string") alternativeTitles.push(item.title);
  }
  const match = findBestMatch(
    candidates.map((candidate) => ({ title: candidate.title, url: candidate.url })),
    { title: media.title, originalTitle: media.originalTitle, alternativeTitles },
    { minScore: MIN_SEARCH_SCORE }
  );
  return match === null ? null : match.candidate;
}
function readSeasonName(media, season) {
  if (!Array.isArray(media.seasons)) return null;
  const found = media.seasons.find((item) => item && item.number === season);
  const name = found && typeof found.name === "string" ? found.name.trim() : "";
  return name === "" ? null : name;
}
function pageUrl(value) {
  if (/^https?:\/\//i.test(value)) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      throw new Error(`Resultado de busca com URL inv\xE1lida: "${value}"`, { cause: error });
    }
    if (!ANIBUNKER_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error(`Resultado de busca fora do AniBunker: "${parsed.hostname}"`);
    }
    if (!parsed.pathname.startsWith("/anime/")) {
      throw new Error(`Resultado de busca fora de /anime/: "${parsed.pathname}"`);
    }
    return `${SOURCE_URL}${parsed.pathname}`;
  }
  const slug = value.replace(/^\/+|\/+$/g, "");
  if (slug === "") throw new Error("Resultado de busca com url vazia");
  return `${SOURCE_URL}/anime/${slug}`;
}

// src/anibunker/extractor.js
var MAX_PAGES = 4;
function extractStreams(request2, providerName) {
  return __async(this, null, function* () {
    readRequest(request2);
    const media = yield getMediaInfo(request2);
    const page = yield findAnimePage(media, request2);
    if (page === null) return [];
    const tracks = buildEpisodeOptions(page, request2.mediaType, request2.episode);
    if (tracks.length === 0) return [];
    const streams = [];
    const failures = [];
    for (const track of tracks) {
      try {
        const html = yield fetchText(track.url, { profile: "page" });
        const episode = readEpisodePage(html, track.url);
        const options = yield resolvePlayers(episode, track.url, providerName);
        for (const option of options) {
          streams.push(buildStream(streamFields(option, track.language, media, request2, providerName)));
        }
      } catch (error) {
        if (isMissingPage(error)) continue;
        failures.push({ label: track.label, message: error.message });
        if (!String(error.message).startsWith("Nenhum player produziu stream")) {
          console.warn(`[${providerName}] Op\xE7\xE3o ${track.label} descartada: ${sanitizeMessage(error.message)}`);
        }
      }
    }
    if (streams.length === 0) {
      if (failures.length === 0) return [];
      const causes = failures.map((failure) => `${failure.label}: ${sanitizeMessage(failure.message)}`).join("; ");
      throw new Error(`Nenhuma faixa produziu stream: ${causes}`);
    }
    return dedupeByUrl(streams);
  });
}
function readRequest(request2) {
  if (!request2 || request2.mediaType !== "movie" && request2.mediaType !== "tv") {
    throw new Error(`mediaType inv\xE1lido: "${request2 && request2.mediaType}" (esperado "movie" ou "tv")`);
  }
  if (request2.mediaType !== "tv") return;
  const { season, episode } = request2;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`S\xE9rie sem temporada/epis\xF3dio v\xE1lidos: season=${season} episode=${episode}`);
  }
}
function findAnimePage(media, request2) {
  return __async(this, null, function* () {
    const queries = buildQueries(media, request2.mediaType, request2.season);
    const seen = /* @__PURE__ */ new Set();
    let opened = 0;
    for (const query of queries) {
      const candidates = yield searchCandidates(query.query);
      let pool = candidates.filter(
        (candidate) => !seen.has(candidate.url) && isSeasonCandidate(candidate.title, media, request2.mediaType, request2.season)
      );
      while (pool.length > 0 && opened < MAX_PAGES) {
        const candidate = selectCandidate(pool, media);
        if (candidate === null) break;
        pool = pool.filter((item) => item.url !== candidate.url);
        if (seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        opened += 1;
        let html;
        try {
          html = yield fetchText(candidate.url, { profile: "page" });
        } catch (error) {
          if (isMissingPage(error)) continue;
          throw error;
        }
        const page = readAnimePage(html, candidate.url);
        if (confirmAnimePage(page, media, request2.mediaType, request2.season, query.query)) return page;
      }
      if (opened >= MAX_PAGES) break;
    }
    return null;
  });
}
function streamFields(option, language, media, request2, providerName) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (Number.isInteger(media.year)) format.year = media.year;
  if (request2.mediaType === "tv") {
    format.season = request2.season;
    format.episode = request2.episode;
  }
  const fields = {
    url: option.url,
    format,
    provider: option.provider,
    type: option.type,
    language
  };
  if (Array.isArray(option.qualityHints) && option.qualityHints.length > 0) {
    fields.qualityHints = option.qualityHints;
  }
  if (option.headers !== void 0) fields.headers = option.headers;
  return fields;
}
function dedupeByUrl(streams) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const stream of streams) {
    if (seen.has(stream.url)) continue;
    seen.add(stream.url);
    result.push(stream);
  }
  return result;
}
function isMissingPage(error) {
  return /^HTTP 404\b/.test(String(error && error.message));
}

// src/anibunker/index.js
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
