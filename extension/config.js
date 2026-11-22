export const HOST = "com.local_image_translator.host";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_BASE64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
export const MAX_TRANSLATION_BYTES = 48 * 1024;

export const DEFAULTS = Object.freeze({
  mode: "translate",
  target: "zh-Hans",
  ocrLanguage: "auto",
  apiBaseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
  uiLanguage: "auto",
});

const languageTag = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
// eslint-disable-next-line no-control-regex -- intentionally reject ASCII control characters in model IDs
const modelPattern = /^[^\s\x00-\x1f\x7f]{1,128}$/u;
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function targetLanguage(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > 63 || !languageTag.test(trimmed)) return null;
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? null;
  } catch {
    return null;
  }
}

export function normalizeApiBaseUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password || parsed.hash) return null;
    if (parsed.protocol === "https:") {
      return parsed.href.replace(/\/+$/, "");
    }
    if (parsed.protocol === "http:" && loopbackHosts.has(parsed.hostname.toLowerCase())) {
      return parsed.href.replace(/\/+$/, "");
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeModel(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return modelPattern.test(trimmed) ? trimmed : null;
}

export function isLoopbackApiUrl(value) {
  const normalized = normalizeApiBaseUrl(value);
  if (!normalized) return false;
  try {
    return loopbackHosts.has(new URL(normalized).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function savedMode(input) {
  if (Object.hasOwn(input, "mode")) {
    return ["translate", "ocr"].includes(input.mode) ? input.mode : null;
  }
  if (!Object.hasOwn(input, "provider")) return DEFAULTS.mode;
  if (input.provider === "deepseek") return "translate";
  return input.provider === "ocr" ? "ocr" : null;
}

export function normalizeSettings(input = {}) {
  const mode = savedMode(input);
  return {
    mode: mode ?? "ocr",
    needsModeSelection: mode === null,
    target: targetLanguage(input.target) ?? DEFAULTS.target,
    ocrLanguage:
      typeof input.ocrLanguage === "string" &&
      input.ocrLanguage.length <= 63 &&
      input.ocrLanguage === input.ocrLanguage.trim() &&
      languageTag.test(input.ocrLanguage)
        ? input.ocrLanguage
        : DEFAULTS.ocrLanguage,
    apiBaseUrl: normalizeApiBaseUrl(input.apiBaseUrl) ?? DEFAULTS.apiBaseUrl,
    model: normalizeModel(input.model) ?? DEFAULTS.model,
    uiLanguage: ["auto", "zh_CN", "en"].includes(input.uiLanguage)
      ? input.uiLanguage
      : DEFAULTS.uiLanguage,
  };
}

export function translationRequest(settings, text) {
  // The menu or panel click authorizes this request only.
  if (settings.mode !== "translate") throw new Error("cloud_consent");
  return {
    command: "translate",
    target: settings.target,
    apiBaseUrl: settings.apiBaseUrl,
    model: settings.model,
    cloudConsent: 1,
    text,
  };
}

export function getSettings() {
  return chrome.storage.local.get([...Object.keys(DEFAULTS), "provider"]).then(normalizeSettings);
}
