export const HOST = "com.local_image_translator.host";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_BASE64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
export const MAX_TRANSLATION_BYTES = 48 * 1024;

export const DEFAULTS = Object.freeze({
  mode: "translate",
  target: "zh-Hans",
  ocrLanguage: "auto"
});

const languageTag = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

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
    ocrLanguage: typeof input.ocrLanguage === "string" &&
      input.ocrLanguage.length <= 63 && input.ocrLanguage === input.ocrLanguage.trim() &&
      languageTag.test(input.ocrLanguage) ? input.ocrLanguage : DEFAULTS.ocrLanguage
  };
}

export function translationRequest(settings, text) {
  // The menu or panel click authorizes this request only.
  if (settings.mode !== "translate") throw new Error("cloud_consent");
  return { command: "translate", target: settings.target, cloudConsent: 1, text };
}

export function getSettings() {
  return chrome.storage.local.get([...Object.keys(DEFAULTS), "provider"]).then(normalizeSettings);
}
