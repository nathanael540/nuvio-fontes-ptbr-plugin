/** megaembed (formato prism) - gerado a partir de src/megaembed/ — não edite manualmente. */
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
function normalizeText(text2) {
  if (typeof text2 !== "string") {
    throw new Error(`normalizeText espera uma string, recebeu ${typeof text2}`);
  }
  return text2.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").replace(/&/g, " e ").replace(NON_ALPHANUMERIC, " ").trim();
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
  for (const text2 of texts) {
    if (text2 !== null && text2 !== void 0 && typeof text2 !== "string") {
      throw new Error(`texts deve conter texto, null ou undefined (recebido: ${describe(text2)})`);
    }
  }
  for (const text2 of texts) {
    if (text2 === null || text2 === void 0) continue;
    const quality = qualityFromText(text2);
    if (quality) return quality;
  }
  return UNKNOWN_QUALITY;
}
function qualityFromText(text2) {
  if (text2.trim() === "") return null;
  if (CAM_WORDS.test(normalizeText(text2))) return CAM;
  const token = lastQualityToken(text2);
  if (token) return normalizeQuality(token);
  try {
    return normalizeQuality(text2);
  } catch (e) {
    return null;
  }
}
function lastQualityToken(text2) {
  const matches = [...text2.matchAll(new RegExp(QUALITY_SEARCH.source, "gi"))];
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
  ["por", LANGUAGE.DUBBED_NON_PT_BR],
  ["portugues dialeto desconhecido", LANGUAGE.DUBBED_NON_PT_BR],
  ["legendado", LANGUAGE.SUBTITLED],
  ["legendado nao pt br", LANGUAGE.SUBTITLED_NON_PT_BR],
  ["legendado dialeto desconhecido", LANGUAGE.SUBTITLED_NON_PT_BR],
  ["nao pt br", LANGUAGE.NON_PT_BR],
  ["idioma desconhecido", LANGUAGE.UNKNOWN]
];
var KNOWN_FOREIGN_REGEX = /\b(?:ingles|english|espanhol|espanol|spanish|latino|castellano|castelhano|japones|japanese|frances|francais|french|alemao|deutsch|german|italiano|italian|coreano|korean|russo|russian|mandarim|chines|chinese|turco|turca|turkce|turkish|arabe|arabic|hindi|tailandes|thai|vietnamita|vietnamese|polones|polaco|polski|polish|holandes|nederlands|dutch|sueco|sueca|svenska|swedish|dinamarques|dansk|danish|noruegues|norsk|norwegian|finlandes|suomi|finnish|grego|grega|greek|hebraico|hebrew|tcheco|checo|czech|hungaro|hungarian|romeno|romanian|ucraniano|ukrainian|persa|persian|indonesio|indonesian|malaio|malay|filipino|bengali|tamil|telugu|urdu|swahili)\b/;
var BRAZIL_REGION_REGEX = /\b(?:ptbr|pt br|pob|brazil|brasil|brazilian|brasileiro|brasileira|br)\b/;
var NON_BR_REGION_REGEX = /\b(?:ptpt|pt pt|portugal|european|europeu|europeia)\b/;
var EXPLICIT_PT_REGEX = /\b(?:portugues|portuguese)\b/;
var DUAL_AUDIO_REGEX = /\b(?:dual|tri)\s+audio\b/;
function inspectText(text2) {
  if (typeof text2 !== "string") return null;
  const trimmed = text2.trim();
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
function resolveInfo(info) {
  if (!info) return null;
  if (info.audio === "pt_br") return LANGUAGE.DUBBED;
  if (info.audio === "non_pt_br") return LANGUAGE.DUBBED_NON_PT_BR;
  if (info.sub === "pt_br") return LANGUAGE.SUBTITLED;
  if (info.sub === "non_pt_br") return LANGUAGE.SUBTITLED_NON_PT_BR;
  if (info.foreign) return LANGUAGE.NON_PT_BR;
  if (info.unknown) return LANGUAGE.UNKNOWN;
  return null;
}
function normalizeLanguage(value) {
  if (typeof value !== "string") {
    throw new Error(`Idioma deve ser texto (recebido: ${String(value)})`);
  }
  const info = inspectText(value);
  return resolveInfo(info);
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
  for (const text2 of texts) {
    if (typeof text2 !== "string") continue;
    const info = inspectText(text2);
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
function clipEnd(text2, max) {
  if (text2 === void 0 || text2 === null || text2 === "") return text2;
  const chars = Array.from(text2);
  if (chars.length <= max) return text2;
  return `${chars.slice(0, max - 1).join("")}\u2026`;
}
function clipMiddle(text2, max) {
  if (text2 === void 0 || text2 === null || text2 === "") return text2;
  const chars = Array.from(text2);
  if (chars.length <= max) return text2;
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
  const text2 = readText(url, "stream.url");
  if (P2P_URL.test(text2)) return "P2P";
  if (HTTP_URL.test(text2)) return "HTTP";
  throw new Error(`stream.url deve ser http(s), magnet ou torrent:// (recebido: ${describe2(text2)})`);
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
  const text2 = formatStream(stream, fields.format);
  stream.name = text2.name;
  stream.title = text2.title;
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
  const text2 = readText2(value, label);
  let protocol;
  try {
    protocol = new URL(text2).protocol;
  } catch (error) {
    throw new Error(`${label} n\xE3o \xE9 URL v\xE1lida: "${text2}" (${error.message})`, { cause: error });
  }
  if (!HTTP_PROTOCOLS.includes(protocol)) {
    throw new Error(`${label} deve ser URL http(s) (recebido: "${text2}")`);
  }
  return text2;
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
  const text2 = readText2(value, label);
  if (HEX_HASH.test(text2)) return text2.toLowerCase();
  if (BASE32_HASH.test(text2)) {
    throw new Error(`${label} est\xE1 em base32 ("${text2}"): o provedor deve convert\xEA-lo para hexadecimal de 40 caracteres; o app falha ao iniciar o P2P com base32`);
  }
  throw new Error(`${label} deve ser hexadecimal de 40 caracteres (recebido: "${text2}")`);
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

// src/_blocks/script-extract/index.mjs
var IDENTIFIER_START = "(?:^|[^\\w$])";
var QUOTED_STRING = String.raw`(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1`;
var OPENERS = "[{";
var CLOSERS = "]}";
function extractScriptJson(html, name) {
  assertHtml(html);
  assertName(name, "name");
  const pattern = new RegExp(`${IDENTIFIER_START}${escapeRegExp(name)}\\s*=\\s*[[{]`);
  const match = pattern.exec(html);
  if (!match) return null;
  const start = match.index + match[0].length - 1;
  const end = findClosingIndex(html, start);
  if (end === -1) throw new Error(`JSON de "${name}" sem fechamento correspondente`);
  const text2 = html.slice(start, end + 1);
  try {
    return JSON.parse(text2);
  } catch (error) {
    throw new Error(`JSON de "${name}" inv\xE1lido: ${error.message}`, { cause: error });
  }
}
function assertHtml(html) {
  if (typeof html !== "string") {
    throw new Error(`html inv\xE1lido: esperado string, recebido ${typeof html}`);
  }
}
function assertName(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} inv\xE1lido: "${value}" (esperado texto n\xE3o vazio)`);
  }
}
function escapeRegExp(text2) {
  return text2.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}
function findClosingIndex(text2, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < text2.length; index++) {
    const char = text2[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (OPENERS.includes(char)) {
      depth++;
    } else if (CLOSERS.includes(char)) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

// src/megaembed/player.js
var RANGE = "bytes=0-65535";
var PROBE_BYTES = 65536;
var DUB_WORDS = /* @__PURE__ */ new Set(["pt", "ptbr", "por", "portuguese", "portugues", "dublado", "dub", "dubbed", "bra", "brasil", "brazil", "brazilian"]);
var ORIGINAL_WORDS = /* @__PURE__ */ new Set(["en", "eng", "english", "original", "legendado"]);
var SUBTITLE_PT = /* @__PURE__ */ new Set(["pt", "ptbr", "por", "portuguese", "portugues", "brasil", "brazil", "brazilian", "legendado", "legenda", "leg"]);
function resolveOption(option, pageUrl) {
  return __async(this, null, function* () {
    const headers = optionHeaders(option, pageUrl);
    if (option.kind === "mp4") {
      const height = yield mp4VideoHeight(option.url, headers);
      const quality = height != null ? height : UNKNOWN_QUALITY;
      return [{ url: option.url, quality, headers }];
    }
    const playlist = yield fetchPlaylist(option.url, headers);
    const variants = hlsVariants(playlist, option.subtitles);
    if (!variants.length) {
      return [{ url: option.url, quality: UNKNOWN_QUALITY, headers }];
    }
    return variants.map((variant) => __spreadProps(__spreadValues({}, variant), { headers }));
  });
}
function optionHeaders(option, pageUrl) {
  const host = new URL(option.url).hostname;
  if (option.noReferrer || /uqload/i.test(host) || option.kind === "mp4") {
    return { "User-Agent": DEFAULT_USER_AGENT };
  }
  return playbackHeaders(pageUrl);
}
function fetchPlaylist(url, headers) {
  return __async(this, null, function* () {
    const page = yield fetchPage(url, { profile: "player", headers });
    if (!/^#EXTM3U(?:\r?\n|$)/.test(page.text.trim())) throw new Error("Resposta n\xE3o \xE9 playlist HLS");
    return page;
  });
}
function mp4VideoHeight(url, headers) {
  return __async(this, null, function* () {
    const response = yield fetch(url, { headers: __spreadProps(__spreadValues({}, headers), { Range: RANGE }) });
    if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
    if (typeof response.arrayBuffer !== "function") {
      throw new Error("response.arrayBuffer indispon\xEDvel neste runtime");
    }
    return readMp4VideoHeight(yield response.arrayBuffer());
  });
}
function readMp4VideoHeight(buffer) {
  if (!buffer || typeof buffer.byteLength !== "number") throw new Error("MP4 sem ArrayBuffer");
  const length = Math.min(buffer.byteLength, PROBE_BYTES);
  const view = new DataView(buffer, 0, length);
  const moov = findBox(view, 0, length, "moov");
  if (!moov) return null;
  let offset = moov.start;
  while (offset + 8 <= moov.end) {
    const box = readBox(view, offset, moov.end);
    if (!box) break;
    if (box.type === "trak") {
      const tkhd = findBox(view, box.start, box.end, "tkhd");
      if (tkhd) {
        const height = tkhdHeight(view, tkhd);
        if (height) return height;
      }
    }
    offset = box.next;
  }
  return null;
}
function readBox(view, offset, limit) {
  if (offset + 8 > limit) return null;
  const size32 = view.getUint32(offset);
  const type = boxType(view, offset + 4);
  let header = 8;
  let size = size32;
  if (size32 === 1) {
    if (offset + 16 > limit) return null;
    if (view.getUint32(offset + 8) !== 0) return null;
    size = view.getUint32(offset + 12);
    header = 16;
  } else if (size32 === 0) {
    size = limit - offset;
  }
  if (size < header) throw new Error("Caixa MP4 inv\xE1lida");
  const end = Math.min(offset + size, limit);
  return { type, start: offset + header, end, next: end };
}
function findBox(view, start, end, type) {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBox(view, offset, end);
    if (!box) return null;
    if (box.type === type) return box;
    if (box.next <= offset) return null;
    offset = box.next;
  }
  return null;
}
function boxType(view, offset) {
  let type = "";
  for (let index = 0; index < 4; index++) type += String.fromCharCode(view.getUint8(offset + index));
  return type;
}
function tkhdHeight(view, box) {
  if (box.start >= view.byteLength) return null;
  const version = view.getUint8(box.start);
  const widthAt = version === 0 ? 76 : version === 1 ? 88 : null;
  if (widthAt == null) throw new Error(`tkhd com vers\xE3o n\xE3o suportada: ${version}`);
  const heightOffset = box.start + widthAt + 4;
  if (heightOffset + 4 > view.byteLength || heightOffset + 4 > box.end) return null;
  const width = view.getUint32(box.start + widthAt) >>> 16;
  const height = view.getUint32(heightOffset) >>> 16;
  if (!width || !height) return null;
  return height;
}
function hlsVariants(playlist, subtitles) {
  const lines = playlist.text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "#EXTM3U") throw new Error("Cabe\xE7alho HLS inv\xE1lido");
  const renditions = lines.filter((line) => line.startsWith("#EXT-X-MEDIA:")).map((line) => attributes(line.slice(line.indexOf(":") + 1))).filter((item) => item.TYPE === "AUDIO");
  const entries = [];
  for (let index = 1; index < lines.length; index++) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
    const info = attributes(lines[index].slice(lines[index].indexOf(":") + 1));
    const uri = lines[index + 1];
    if (!uri || uri.startsWith("#")) throw new Error("Variante HLS sem URI");
    index += 1;
    entries.push({
      resolution: /^(\d+)x([1-9]\d{2,3})$/.exec(info.RESOLUTION || ""),
      url: mediaUrl(uri, playlist.url),
      audio: info.AUDIO
    });
  }
  const valid = entries.filter((entry) => entry.resolution && Number(entry.resolution[1]) >= 1);
  if (!valid.length) return [];
  if (valid.length !== entries.length) throw new Error("Variante HLS sem RESOLUTION v\xE1lida");
  return valid.map((entry) => {
    const related = entry.audio ? renditions.filter((item) => item["GROUP-ID"] === entry.audio) : renditions;
    if (entry.audio && !related.length) throw new Error("Grupo HLS AUDIO ausente");
    const language = classifyLanguage(related, subtitles);
    return __spreadValues({
      url: entry.url,
      quality: Number(entry.resolution[2])
    }, language ? { language } : {});
  });
}
function classifyLanguage(renditions, subtitles) {
  let dub = false;
  let original = false;
  for (const rendition of renditions) {
    const text2 = `${rendition.NAME || ""} ${rendition.LANGUAGE || ""}`;
    const words2 = wordsOf(text2);
    const tag = normalizeLanguage(text2);
    if (words2.some((word) => DUB_WORDS.has(word)) || tag === LANGUAGE.DUBBED || tag === LANGUAGE.DUBBED_NON_PT_BR) {
      dub = true;
    }
    if (words2.some((word) => ORIGINAL_WORDS.has(word)) || tag === LANGUAGE.NON_PT_BR) original = true;
  }
  if (dub) return LANGUAGE.DUBBED;
  if (original) {
    const hasPortugueseSubtitle = (subtitles || []).some(
      (subtitle) => wordsOf(`${subtitle.language} ${subtitle.name || ""}`).some((word) => SUBTITLE_PT.has(word))
    );
    return hasPortugueseSubtitle ? LANGUAGE.SUBTITLED : LANGUAGE.NON_PT_BR;
  }
  return null;
}
function wordsOf(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}
function mediaUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) throw new Error("URL de m\xEDdia ausente");
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL de m\xEDdia n\xE3o \xE9 HTTP(S)");
  return url.href;
}
function attributes(text2) {
  const result = {};
  let position = 0;
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]+)(?:,|$)/g;
  for (const match of text2.matchAll(pattern)) {
    if (match.index !== position || Object.prototype.hasOwnProperty.call(result, match[1])) {
      throw new Error("Atributos HLS inv\xE1lidos");
    }
    position += match[0].length;
    result[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  if (position !== text2.length) throw new Error("Atributos HLS inv\xE1lidos");
  return result;
}

// src/megaembed/extractor.js
var MIRRORS = ["https://megaembed.com", "https://mgeb.lat", "https://mgeb.space"];
function extractStreams(request2) {
  return __async(this, null, function* () {
    if (!/^\d+$/.test(String(request2.tmdbId).trim())) throw new Error("ID do TMDB inv\xE1lido");
    if (!["movie", "tv"].includes(request2.mediaType)) throw new Error("Tipo de m\xEDdia inv\xE1lido");
    if (request2.mediaType === "tv" && ![request2.season, request2.episode].every((number) => Number.isInteger(number) && number > 0)) {
      throw new Error("Temporada e epis\xF3dio devem ser inteiros positivos");
    }
    request2.stage = "P\xE1gina";
    const page = yield loadPage(request2);
    if (!page) return [];
    request2.stage = "Fontes";
    const selected = selectOptions(page.sources, page.url);
    const causes = [];
    for (const failure of selected.failures) {
      causes.push(`${failure.label}: ${failure.message}`);
      console.warn(`[MegaEmbed] Op\xE7\xE3o ${failure.label} descartada: ${failure.message}`);
    }
    if (!selected.accepted.length) {
      if (causes.length) throw new Error(`Todas as op\xE7\xF5es falharam: [${causes.join("; ")}]`);
      return [];
    }
    const title = contentTitle(page.text);
    request2.stage = "M\xEDdia";
    const settled = yield Promise.all(selected.accepted.map((option) => settleOption(option, page.url, title, request2)));
    const streams = /* @__PURE__ */ new Map();
    for (const result of settled) {
      if (result.failure) {
        causes.push(result.failure);
        continue;
      }
      for (const stream of result.streams) {
        streams.set(`${stream.url}|${stream.quality}|${stream.language || ""}`, stream);
      }
    }
    if (!streams.size && causes.length) throw new Error(`Todas as op\xE7\xF5es falharam: [${causes.join("; ")}]`);
    return [...streams.values()];
  });
}
function settleOption(option, pageUrl, title, request2) {
  return resolveOption(option, pageUrl).then((variants) => ({
    streams: variants.map((variant) => buildStream(__spreadValues(__spreadValues({
      url: variant.url,
      format: __spreadValues({
        template: FORMATTER.AUTO,
        addon: "MegaEmbed",
        title
      }, request2.mediaType === "tv" ? { season: request2.season, episode: request2.episode } : {}),
      quality: variant.quality,
      provider: option.provider,
      type: option.kind === "mp4" ? "mp4" : "hls",
      headers: variant.headers
    }, variant.language ? { language: variant.language } : {}), option.subtitles.length ? { subtitles: option.subtitles } : {})))
  })).catch((error) => {
    console.warn(`[MegaEmbed] Op\xE7\xE3o ${option.label} descartada: ${error.message}`);
    return { failure: `${option.label}: ${error.message}` };
  });
}
function loadPage(request2) {
  return __async(this, null, function* () {
    const failures = [];
    for (const origin of MIRRORS) {
      const host = new URL(origin).host;
      try {
        const page = yield fetchPage(embedUrl(origin, request2));
        const parsed = readSources(page.text);
        if (parsed.empty) return null;
        if (parsed.blocked) {
          failures.push(`${host}: resposta sem var sources reconhec\xEDvel`);
          continue;
        }
        return __spreadProps(__spreadValues({}, page), { sources: parsed.sources });
      } catch (error) {
        failures.push(`${host}: ${error.message}`);
      }
    }
    throw new Error(`Todos os espelhos falharam: [${failures.join(", ")}]`);
  });
}
function embedUrl(origin, request2) {
  const id = String(request2.tmdbId).trim();
  if (request2.mediaType === "tv") return `${origin}/embed/${id}/${request2.season}/${request2.episode}`;
  return `${origin}/embed/${id}`;
}
function readSources(html) {
  let sources;
  try {
    sources = extractScriptJson(html, "sources");
  } catch (error) {
    if (/JSON de "sources"|sem fechamento/.test(error.message)) return { blocked: true };
    throw error;
  }
  if (!Array.isArray(sources)) return { blocked: true };
  if (!sources.length) return { empty: true };
  return { sources };
}
function selectOptions(sources, pageUrl) {
  const accepted = [];
  const failures = [];
  sources.forEach((item, index) => {
    const label = optionLabel(item, index);
    try {
      const option = classifyOption(item, pageUrl, label);
      if (option) accepted.push(option);
    } catch (error) {
      failures.push({ label, message: error.message });
    }
  });
  return { accepted, failures };
}
function optionLabel(item, index) {
  if (item && typeof item === "object" && !Array.isArray(item) && typeof item.label === "string" && item.label.trim()) {
    return item.label.trim();
  }
  return String(index + 1);
}
function classifyOption(item, pageUrl, label) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Op\xE7\xE3o de fonte inv\xE1lida");
  if (item.serverBound === true) return null;
  const url = httpUrl(item.file, pageUrl);
  if (isWorkers(url)) return null;
  const kind = mediaKind(item, url);
  const provider = sourceLabel(url);
  return {
    label,
    url,
    kind,
    provider,
    display: ["Uqload", "Streamtape"].includes(provider) ? provider : kind.toUpperCase(),
    noReferrer: item.noReferrer === true,
    subtitles: readTracks(item.tracks, pageUrl)
  };
}
function isWorkers(url) {
  const host = new URL(url).hostname;
  return host === "workers.dev" || host.endsWith(".workers.dev");
}
function mediaKind(item, url) {
  const path = new URL(url).pathname;
  if (item.type === "mp4" || /\.mp4$/i.test(path)) return "mp4";
  if (item.type === "hls" || path.includes("/includes/hls.php") || /\.m3u8$/i.test(path)) return "hls";
  throw new Error(`Tipo de fonte n\xE3o suportado${item.type ? `: ${item.type}` : ""}`);
}
function sourceLabel(url) {
  const host = new URL(url).hostname;
  if (/uqload/i.test(host)) return "Uqload";
  if (/streamtape|tapecontent/i.test(host)) return "Streamtape";
  if (/(^|\.)megaembed\.com$|(^|\.)mgeb\.lat$|(^|\.)mgeb\.space$/i.test(host) || new URL(url).pathname.includes("/includes/hls.php")) {
    return "MegaEmbed";
  }
  return host;
}
function readTracks(tracks, pageUrl) {
  if (tracks == null) return [];
  if (!Array.isArray(tracks)) throw new Error("tracks n\xE3o \xE9 uma lista");
  const subtitles = /* @__PURE__ */ new Map();
  for (const track of tracks) {
    if (!track || typeof track !== "object" || Array.isArray(track)) throw new Error("Faixa inv\xE1lida");
    if (track.kind && track.kind !== "subtitles" && track.kind !== "captions") continue;
    const language = text(track.language) || text(track.label);
    if (!language) throw new Error("Legenda sem idioma identificado");
    const raw = text(track.file) || text(track.url);
    if (!raw) throw new Error("Legenda sem URL");
    const subtitle = __spreadValues({
      url: httpUrl(raw, pageUrl),
      language
    }, text(track.label) ? { name: text(track.label) } : {});
    subtitles.set(`${subtitle.url}|${language}`, subtitle);
  }
  return [...subtitles.values()];
}
function contentTitle(html) {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title = match ? decode(match[1].trim()) : "";
  if (!title) throw new Error("P\xE1gina sem t\xEDtulo");
  return title;
}
function decode(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
function httpUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Endere\xE7o de m\xEDdia ausente");
  let url;
  try {
    url = new URL(value, base);
  } catch (e) {
    throw new Error("Endere\xE7o de m\xEDdia inv\xE1lido");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Endere\xE7o de m\xEDdia n\xE3o \xE9 HTTP(S)");
  return url.href;
}

// src/megaembed/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const request2 = { tmdbId, mediaType, season, episode, stage: "Entrada" };
    try {
      return sortByQuality(yield extractStreams(request2));
    } catch (error) {
      console.error(`[MegaEmbed] ${request2.stage}: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
