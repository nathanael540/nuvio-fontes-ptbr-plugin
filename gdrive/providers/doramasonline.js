/** doramasonline (formato gdrive) - gerado a partir de src/doramasonline/ — não edite manualmente. */
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

// src/doramasonline/episode.js
var SOURCE_URL = "https://doramasonline.net";
var FOUR_DIGIT_YEAR = /^(\d{4})/;
var SEASON_EPISODE = /^(\d+)\s*-\s*(\d+)$/;
function readDetailPage(html, pageUrl) {
  if (typeof html !== "string") throw new Error("Ficha do Doramas Online: HTML inv\xE1lido");
  if (typeof pageUrl !== "string" || pageUrl === "") throw new Error("Ficha do Doramas Online sem URL");
  const $ = loadHtml(html);
  const title = $(".sheader .data h1").eq(0).text().trim();
  if (title === "") throw new Error("Ficha do Doramas Online sem t\xEDtulo");
  const yearText = $(".sheader .extra span.date").eq(0).text().trim();
  const yearMatch = FOUR_DIGIT_YEAR.exec(yearText);
  return {
    url: pageUrl,
    title,
    year: yearMatch ? Number(yearMatch[1]) : null,
    episodes: readEpisodes($)
  };
}
function selectEpisode(detail, mediaType, episode) {
  if (mediaType === "movie") return { url: detail.url, current: true };
  const match = detail.episodes.find((item) => item.season === episode.season && item.episode === episode.episode);
  return match === void 0 ? null : { url: match.url, current: false };
}
function readEpisodes($) {
  const episodes = [];
  const blocks = $("div.se-c");
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks.eq(blockIndex);
    const season = readSeason(block, blockIndex);
    const list2 = block.find("ul.episodios").eq(0);
    if (list2.length === 0) throw new Error(`Temporada ${season} da ficha sem lista de epis\xF3dios`);
    const items = list2.find("li");
    if (items.length === 0) throw new Error(`Temporada ${season} da ficha sem epis\xF3dios`);
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      episodes.push(readEpisode(items.eq(itemIndex), season, blockIndex, itemIndex));
    }
  }
  return episodes;
}
function readSeason(block, blockIndex) {
  const text = block.find("span.se-t").eq(0).text().trim();
  const season = Number(text);
  if (text === "" || !Number.isInteger(season) || season < 0) {
    throw new Error(`Temporada ${blockIndex + 1} da ficha sem span.se-t v\xE1lido (recebido: "${text}")`);
  }
  return season;
}
function readEpisode(item, season, blockIndex, itemIndex) {
  const context = `Temporada ${season}, epis\xF3dio ${itemIndex + 1}`;
  const numerando = item.find("div.numerando").eq(0).text().trim();
  const match = SEASON_EPISODE.exec(numerando);
  if (!match) throw new Error(`${context} sem div.numerando no formato "S - E" (recebido: "${numerando}")`);
  const itemSeason = Number(match[1]);
  const itemEpisode = Number(match[2]);
  if (itemSeason !== season) {
    throw new Error(`${context} com numerando "${numerando}" fora da temporada ${season}`);
  }
  const href = item.find("div.episodiotitle a[href]").eq(0).attr("href");
  if (!href) throw new Error(`${context} sem link em div.episodiotitle a`);
  return {
    season: itemSeason,
    episode: itemEpisode,
    url: new URL(href, SOURCE_URL).href
  };
}
function loadHtml(html) {
  const { load } = require("cheerio-without-node-native");
  return load(html);
}

// src/doramasonline/catalog.js
var MIN_TITLE_SIMILARITY = 0.85;
var MAX_CANDIDATES_PER_TERM = 3;
var MOVIE_PATH = "/br/filmes/";
var TV_PATH = "/br/series/";
var FOUR_DIGIT_YEAR2 = /^(\d{4})/;
function findMedia(media) {
  return __async(this, null, function* () {
    const seen = /* @__PURE__ */ new Set();
    for (const term of searchTerms(media)) {
      const page = yield fetchPage(`${SOURCE_URL}/?s=${encodeURIComponent(term)}`);
      const cards = readSearchCards(page.text);
      const ranked = cards.filter((card) => pathType(card.url) === media.mediaType).map((card) => ({ card, score: bestTitleScore(card.title, media) })).filter((entry) => entry.score >= MIN_TITLE_SIMILARITY).sort((a, b) => b.score - a.score);
      let opened = 0;
      for (const { card } of ranked) {
        if (opened >= MAX_CANDIDATES_PER_TERM) break;
        if (seen.has(card.url)) continue;
        seen.add(card.url);
        if (!yearMatches(card.year, media.year)) continue;
        opened += 1;
        const confirmed = yield confirmCard(card, media);
        if (confirmed !== null) return confirmed;
      }
    }
    return null;
  });
}
function readSearchCards(html) {
  if (typeof html !== "string") throw new Error("Busca do Doramas Online: HTML inv\xE1lido");
  const $ = loadHtml2(html);
  if ($(".search-page").length === 0) {
    throw new Error("Busca do Doramas Online sem .search-page; layout inesperado ou bloqueio");
  }
  const cards = [];
  const articles = $(".search-page article");
  for (let index = 0; index < articles.length; index += 1) {
    const article = articles.eq(index);
    const link = article.find(".title a").eq(0);
    const title = link.text().trim();
    const href = link.attr("href");
    if (title === "") throw new Error(`Cart\xE3o ${index + 1} da busca sem t\xEDtulo em .title a`);
    if (!href) throw new Error(`Cart\xE3o ${index + 1} da busca sem link em .title a`);
    const yearText = article.find(".meta span.year").eq(0).text().trim();
    const yearMatch = FOUR_DIGIT_YEAR2.exec(yearText);
    cards.push({
      title,
      year: yearMatch ? Number(yearMatch[1]) : null,
      url: new URL(href, SOURCE_URL).href
    });
  }
  return cards;
}
function confirmCard(card, media) {
  return __async(this, null, function* () {
    const page = yield fetchPage(card.url);
    const detail = readDetailPage(page.text, page.url);
    if (bestTitleScore(detail.title, media) < MIN_TITLE_SIMILARITY) return null;
    if (!yearMatches(card.year, media.year)) return null;
    if (!yearMatches(detail.year, media.year)) return null;
    if (media.year !== null && card.year === null && detail.year === null) return null;
    return { url: page.url, html: page.text, detail };
  });
}
function searchTerms(media) {
  const seen = /* @__PURE__ */ new Set();
  const terms = [];
  for (const value of [media.title, media.originalTitle, ...media.alternativeTitles]) {
    if (typeof value !== "string") continue;
    const term = value.trim();
    if (term === "") continue;
    const key = normalizeText(term) || term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}
function bestTitleScore(title, media) {
  const titles = [media.title, media.originalTitle, ...media.alternativeTitles].filter((value) => typeof value === "string");
  return Math.max(...titles.map((value) => titleSimilarity(title, value)));
}
function pathType(url) {
  const path = new URL(url).pathname;
  if (path.startsWith(MOVIE_PATH)) return "movie";
  if (path.startsWith(TV_PATH)) return "tv";
  return null;
}
function yearMatches(sourceYear, mediaYear) {
  if (sourceYear === null || mediaYear === null) return true;
  return sourceYear === mediaYear;
}
function loadHtml2(html) {
  const { load } = require("cheerio-without-node-native");
  return load(html);
}

// src/_blocks/script-extract/index.mjs
var IDENTIFIER_START = "(?:^|[^\\w$])";
var QUOTED_STRING = String.raw`(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1`;
function extractScriptString(html, name) {
  assertHtml(html);
  assertName(name, "name");
  const key = escapeRegExp(name);
  const pattern = new RegExp(`${IDENTIFIER_START}(?:"${key}"|'${key}'|${key})\\s*[:=]\\s*${QUOTED_STRING}`);
  const match = pattern.exec(html);
  return match ? unescapeJs(match[2]) : null;
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
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}
function unescapeJs(value) {
  return value.replace(
    /\\(u[0-9a-fA-F]{4}|[\\/"'])/g,
    (whole, sequence) => sequence.length === 5 ? String.fromCharCode(parseInt(sequence.slice(1), 16)) : sequence
  );
}

// src/doramasonline/streams.js
var BOOONCEIVU_QUALITIES = Object.freeze({ SD: "1080p", LD: "720p", FD: "360p" });
function buildOptionStreams(context, sources, subtitles) {
  if (!Array.isArray(sources)) throw new Error("M\xEDdias do player devem ser lista");
  if (!Array.isArray(subtitles)) throw new Error("Legendas do player devem ser lista");
  const subtitleItems = subtitles.map(readSubtitle2);
  const language = resolveOptionLanguage(context.label, context.embedTitle, subtitles.map((item) => item.label));
  return sources.map((source) => {
    const fields = {
      url: source.url,
      type: context.type,
      provider: context.provider,
      quality: normalizeSourceQuality(source.quality, context.qualityMap || {}),
      language,
      format: formatDetails(context.providerName, context.media, context.episode)
    };
    if (subtitleItems.length > 0) fields.subtitles = subtitleItems;
    return buildStream(fields);
  });
}
function resolveOptionLanguage(label, embedTitle, subtitleLabels) {
  const optionLanguage = normalizeLanguage(label);
  if (optionLanguage !== null && optionLanguage !== LANGUAGE.UNKNOWN) return optionLanguage;
  if (typeof embedTitle === "string" && embedTitle.trim() !== "") {
    const embedLanguage = normalizeLanguage(embedTitle);
    if (embedLanguage !== null && embedLanguage !== LANGUAGE.UNKNOWN) return embedLanguage;
  }
  if (subtitleLabels.some(isPortugueseSubtitle)) return LANGUAGE.SUBTITLED;
  return LANGUAGE.UNKNOWN;
}
function normalizeSourceQuality(label, qualityMap) {
  if (typeof label !== "string" || label.trim() === "") return UNKNOWN_QUALITY;
  const key = normalizeText(label).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(qualityMap, key)) return qualityMap[key];
  try {
    return normalizeQuality(label);
  } catch (e) {
    return UNKNOWN_QUALITY;
  }
}
function readSubtitle2(subtitle) {
  if (typeof subtitle !== "object" || subtitle === null) throw new Error("Legenda do player deve ser objeto");
  const { url, label } = subtitle;
  assertHttpUrl(url, "Legenda do player");
  if (typeof label !== "string" || label.trim() === "") throw new Error("Legenda do player sem r\xF3tulo");
  const name = label.trim();
  return { url, language: isPortugueseSubtitle(name) ? "pt-BR" : name, name };
}
function isPortugueseSubtitle(label) {
  const normalized = normalizeText(label);
  return normalized === "portugues" || normalized.startsWith("portugues ") || normalized === "pt" || normalized.startsWith("pt ");
}
function assertHttpUrl(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error(`${label} com URL inv\xE1lida`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} deve usar http ou https`);
  }
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

// src/doramasonline/players.js
var SITE_HOST = "doramasonline.net";
var BOOONCEIVU_HOST = /booonceivu/i;
var INCVIDEO_HOST = /(?:^|\.)(?:csst\.online|incvideo1\.online)$/i;
var JSON_TYPE = /application\/json/i;
var MP4_TYPE = /video\/mp4/i;
var REDIRECT_STATUSES = [301, 302, 303, 307, 308];
var HTTP_PROTOCOLS2 = ["http:", "https:"];
function resolveOptions(html, context) {
  return __async(this, null, function* () {
    const options = readOptions(html, context.pageUrl);
    const streams = [];
    const failures = [];
    for (const option of options) {
      try {
        if (option.error !== void 0) throw new Error(option.error);
        const resolved = yield resolveOption(option, context);
        if (resolved !== null) streams.push(...resolved);
      } catch (error) {
        failures.push({ label: option.label, error });
        console.warn(`[${context.providerName}] Op\xE7\xE3o ${option.label} descartada: ${error.message}`);
      }
    }
    if (streams.length === 0 && failures.length > 0) {
      const causes = failures.map(({ label, error }) => `${label}=${error.message}`).join("; ");
      throw new Error(`Nenhuma op\xE7\xE3o de player produziu stream: ${causes}`);
    }
    return streams;
  });
}
function readOptions(html, pageUrl) {
  if (typeof html !== "string") throw new Error("P\xE1gina do Doramas Online: HTML inv\xE1lido");
  const $ = loadHtml3(html);
  if ($("#playeroptionsul").length === 0) {
    throw new Error("P\xE1gina do Doramas Online sem #playeroptionsul");
  }
  const options = [];
  const items = $("li.dooplay_player_option");
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const nume = item.attr("data-nume");
    const post = item.attr("data-post");
    const type = item.attr("data-type");
    const label = item.find(".title").eq(0).text().trim();
    if (nume === void 0 || post === void 0 || type === void 0) {
      throw new Error(`Op\xE7\xE3o ${index + 1} do Doramas Online sem data-nume, data-post ou data-type`);
    }
    if (isTrailer(nume, label)) continue;
    if (label === "") throw new Error(`Op\xE7\xE3o ${nume} do Doramas Online sem r\xF3tulo em .title`);
    const container = $(`#source-player-${nume}`);
    if (container.length === 0) {
      options.push({ nume, post, type, label, iframeUrl: pageUrl, error: `Op\xE7\xE3o ${label} do Doramas Online sem cont\xEAiner #source-player-${nume}` });
      continue;
    }
    const iframe = container.find("iframe").eq(0);
    const src = iframe.attr("src") || iframe.attr("data-src");
    if (!src) {
      options.push({ nume, post, type, label, iframeUrl: pageUrl, error: `Op\xE7\xE3o ${label} do Doramas Online sem iframe` });
      continue;
    }
    options.push({ nume, post, type, label, iframeUrl: new URL(src, pageUrl).href });
  }
  return options;
}
function resolveOption(option, context) {
  return __async(this, null, function* () {
    const target = new URL(option.iframeUrl);
    const host = target.hostname.toLowerCase();
    if (BOOONCEIVU_HOST.test(host)) {
      return resolveJsonPlayer(option, context, { provider: "Booonceivu", useMode: true, requireHls: true, qualityMap: BOOONCEIVU_QUALITIES });
    }
    if (INCVIDEO_HOST.test(host)) return resolveIncVideo(option, context, option.iframeUrl);
    if (isSiteHost(host) && isAvisoPath(target.pathname)) return resolveAviso(option, context);
    if (isSiteHost(host) && target.pathname.startsWith("/do/")) {
      return resolveJsonPlayer(option, context, { provider: "Doramas Online", useMode: false, requireHls: false, qualityMap: {} });
    }
    return null;
  });
}
function resolveJsonPlayer(option, context, settings) {
  return __async(this, null, function* () {
    const requestUrl = settings.useMode ? withQuery(option.iframeUrl, "mode", "to-salvando-seu-ip") : option.iframeUrl;
    const response = yield fetch(requestUrl, {
      headers: __spreadProps(__spreadValues({}, HEADER_PROFILES.player), { Referer: context.pageUrl })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} do player ${settings.provider}`);
    const contentType = response.headers.get("content-type") || "";
    if (!JSON_TYPE.test(contentType)) {
      throw new Error(`Player ${settings.provider} respondeu ${contentType || "sem Content-Type"} em vez de JSON`);
    }
    const text = yield response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`JSON inv\xE1lido do player ${settings.provider}: ${error.message}`, { cause: error });
    }
    if (typeof data !== "object" || data === null || data.status !== "success") return null;
    if (data.midias === void 0 || data.midias === null) return null;
    if (!Array.isArray(data.midias)) throw new Error(`Player ${settings.provider} com midias fora de lista`);
    if (data.midias.length === 0) return null;
    const sources = data.midias.map((midia, index) => readJsonSource(midia, settings, index));
    const subtitles = readJsonSubtitles(data.legendas, settings.provider);
    return buildOptionStreams(
      {
        media: context.media,
        episode: context.episode,
        providerName: context.providerName,
        label: option.label,
        embedTitle: null,
        provider: settings.provider,
        type: "hls",
        qualityMap: settings.qualityMap
      },
      sources,
      subtitles
    );
  });
}
function readJsonSource(midia, settings, index) {
  if (typeof midia !== "object" || midia === null) {
    throw new Error(`M\xEDdia ${index + 1} do player ${settings.provider} deve ser objeto`);
  }
  const url = midia.url;
  assertHttpUrl2(url, `M\xEDdia ${index + 1} do player ${settings.provider}`);
  if (settings.requireHls && !new URL(url).pathname.toLowerCase().endsWith(".m3u8")) {
    throw new Error(`M\xEDdia ${index + 1} do player ${settings.provider} sem caminho .m3u8`);
  }
  const quality = typeof midia.qualidade === "string" ? midia.qualidade : null;
  return { url, quality };
}
function readJsonSubtitles(raw, provider) {
  if (raw === void 0 || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`Player ${provider} com legendas fora de lista`);
  return raw.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Legenda ${index + 1} do player ${provider} deve ser objeto`);
    }
    assertHttpUrl2(item.url, `Legenda ${index + 1} do player ${provider}`);
    if (typeof item.label !== "string" || item.label.trim() === "") {
      throw new Error(`Legenda ${index + 1} do player ${provider} sem label`);
    }
    return { url: item.url, label: item.label.trim() };
  });
}
function resolveAviso(option, context) {
  return __async(this, null, function* () {
    const raw = new URL(option.iframeUrl).searchParams.get("url");
    if (!raw) throw new Error("Aviso do Doramas Online sem par\xE2metro url");
    const target = decodeAvisoTarget(raw);
    if (!INCVIDEO_HOST.test(target.hostname.toLowerCase())) return null;
    return resolveIncVideo(option, context, target.href);
  });
}
function decodeAvisoTarget(raw) {
  let value = raw;
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch (e) {
      break;
    }
  }
  try {
    return new URL(value);
  } catch (e) {
    throw new Error("Aviso do Doramas Online com URL de destino inv\xE1lida");
  }
}
function resolveIncVideo(option, context, embedUrl) {
  return __async(this, null, function* () {
    const embed = yield openEmbed(embedUrl, context.pageUrl);
    if (embed === null) return null;
    const file = extractScriptString(embed.html, "file");
    if (file === null) throw new Error("Embed IncVideo sem Playerjs/file");
    const sources = parsePlayerjsSources(file);
    if (sources.length === 0) throw new Error("Embed IncVideo sem URLs /get_file/");
    const streams = [];
    const failures = [];
    for (const source of sources) {
      try {
        const resolved = yield resolveIncVideoSource(source, embed);
        if (resolved !== null) {
          streams.push(...buildOptionStreams(
            {
              media: context.media,
              episode: context.episode,
              providerName: context.providerName,
              label: option.label,
              embedTitle: embed.title,
              provider: "IncVideo",
              type: "mp4",
              qualityMap: {}
            },
            [resolved],
            []
          ));
        }
      } catch (error) {
        failures.push(error);
      }
    }
    if (streams.length > 0) return streams;
    if (failures.length > 0) {
      const causes = failures.map((error) => error.message).join("; ");
      throw new Error(`Nenhuma fonte do IncVideo produziu MP4: ${causes}`);
    }
    return null;
  });
}
function openEmbed(embedUrl, pageUrl) {
  return __async(this, null, function* () {
    const response = yield fetch(embedUrl, {
      redirect: "follow",
      headers: __spreadProps(__spreadValues({}, HEADER_PROFILES.page), { Referer: pageUrl })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} no embed IncVideo`);
    if (typeof response.url !== "string" || response.url === "") {
      throw new Error("Embed IncVideo sem URL final");
    }
    const finalUrl = new URL(response.url);
    if (!INCVIDEO_HOST.test(finalUrl.hostname.toLowerCase())) return null;
    const html = yield response.text();
    const title = /<title>([^<]*)<\/title>/i.exec(html);
    return {
      url: response.url,
      html,
      title: title ? title[1].trim() : null,
      cookie: readCookie(response)
    };
  });
}
function readCookie(response) {
  const headers = response.headers;
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().map((cookie) => cookie.split(";")[0].trim()).filter((cookie) => cookie !== "").join("; ");
  }
  const raw = headers.get("set-cookie");
  return typeof raw === "string" && raw !== "" ? raw.split(";")[0].trim() : "";
}
function parsePlayerjsSources(file) {
  if (typeof file !== "string") throw new Error("Campo file do Playerjs inv\xE1lido");
  const sources = [];
  const seen = /* @__PURE__ */ new Set();
  const pattern = /(?:\[([^\]]+)\])?\s*(https?:\/\/[^,\s"']+)/g;
  let match;
  while ((match = pattern.exec(file)) !== null) {
    const url = match[2];
    if (!url.includes("/get_file/") || seen.has(url)) continue;
    seen.add(url);
    sources.push({ url, quality: match[1] === void 0 ? null : match[1].trim() });
  }
  return sources;
}
function resolveIncVideoSource(source, embed) {
  return __async(this, null, function* () {
    const headers = __spreadProps(__spreadValues({}, HEADER_PROFILES.player), { Referer: embed.url });
    if (embed.cookie !== "") headers.Cookie = embed.cookie;
    const response = yield fetch(source.url, { redirect: "manual", headers });
    if (!REDIRECT_STATUSES.includes(response.status)) {
      throw new Error(`Fonte ${source.quality || "sem r\xF3tulo"} do IncVideo respondeu HTTP ${response.status} sem redirecionamento`);
    }
    const location = response.headers.get("location");
    if (!location) throw new Error(`Fonte ${source.quality || "sem r\xF3tulo"} do IncVideo sem Location`);
    const finalUrl = new URL(location, source.url).href;
    const media = yield fetch(finalUrl, {
      redirect: "follow",
      headers: __spreadProps(__spreadValues({}, HEADER_PROFILES.player), { Range: "bytes=0-0" })
    });
    if (media.status !== 200 && media.status !== 206) {
      throw new Error(`MP4 da fonte ${source.quality || "sem r\xF3tulo"} respondeu HTTP ${media.status}`);
    }
    if (typeof media.url !== "string" || media.url === "") {
      throw new Error(`MP4 da fonte ${source.quality || "sem r\xF3tulo"} sem URL final`);
    }
    const contentType = media.headers.get("content-type") || "";
    const isMp4Path = new URL(media.url).pathname.toLowerCase().endsWith(".mp4");
    if (!MP4_TYPE.test(contentType) && !isMp4Path) {
      throw new Error(`Destino da fonte ${source.quality || "sem r\xF3tulo"} n\xE3o \xE9 MP4 (${contentType || "sem Content-Type"})`);
    }
    return { url: media.url, quality: source.quality };
  });
}
function isTrailer(nume, label) {
  return /trailer/i.test(nume) || /trailer/i.test(label);
}
function isSiteHost(host) {
  return host === SITE_HOST || host.endsWith(`.${SITE_HOST}`);
}
function isAvisoPath(pathname) {
  return pathname.replace(/\/+$/, "") === "/aviso";
}
function withQuery(url, name, value) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  params.set(name, value);
  return `${parsed.origin}${parsed.pathname}?${params.toString()}`;
}
function assertHttpUrl2(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error(`${label} com URL inv\xE1lida`);
  }
  if (!HTTP_PROTOCOLS2.includes(parsed.protocol)) {
    throw new Error(`${label} deve usar http ou https`);
  }
}
function loadHtml3(html) {
  const { load } = require("cheerio-without-node-native");
  return load(html);
}

// src/doramasonline/index.js
var PROVIDER_NAME = "Doramas Online";
var TMDB_ID = /^\d+$/;
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const streams = yield extractStreams({ tmdbId, mediaType, season, episode });
      return sortByQuality(streams);
    } catch (error) {
      console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
      return [];
    }
  });
}
function extractStreams(request2) {
  return __async(this, null, function* () {
    const normalized = readRequest(request2);
    const media = yield getMediaInfo({ tmdbId: normalized.tmdbId, mediaType: normalized.mediaType });
    const confirmed = yield findMedia(media);
    if (confirmed === null) return [];
    const selected = selectEpisode(confirmed.detail, media.mediaType, normalized.episode);
    if (selected === null) return [];
    const page = selected.current ? { url: confirmed.url, text: confirmed.html } : yield fetchPage(selected.url);
    return resolveOptions(page.text, {
      pageUrl: page.url,
      media,
      episode: normalized.episode,
      providerName: PROVIDER_NAME
    });
  });
}
function readRequest(request2) {
  const tmdbId = String(request2.tmdbId).trim();
  if (!TMDB_ID.test(tmdbId)) {
    throw new Error(`tmdbId inv\xE1lido: "${request2.tmdbId}" (esperado ID num\xE9rico do TMDB)`);
  }
  if (request2.mediaType !== "movie" && request2.mediaType !== "tv") {
    throw new Error(`mediaType inv\xE1lido: "${request2.mediaType}" (esperado "movie" ou "tv")`);
  }
  if (request2.mediaType === "movie") {
    return { tmdbId, mediaType: "movie", episode: null };
  }
  const { season, episode } = request2;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`S\xE9rie sem temporada/epis\xF3dio v\xE1lidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { tmdbId, mediaType: "tv", episode: { season, episode } };
}
module.exports = { getStreams };
