const cache = new Map();
let activeLocale = "zh_CN";

export function resolveUiLocale(preference = "auto") {
  if (preference === "zh_CN" || preference === "en") return preference;
  const browserLang =
    globalThis.chrome?.i18n?.getUILanguage?.() ?? globalThis.navigator?.language ?? "zh-CN";
  return /^zh\b/i.test(browserLang) ? "zh_CN" : "en";
}

export function displayLocaleTag(uiLocale = activeLocale) {
  return uiLocale === "zh_CN" ? "zh-CN" : "en";
}

export async function initI18n(preference = "auto") {
  const locale = resolveUiLocale(preference);
  activeLocale = locale;
  if (!cache.has(locale) && globalThis.chrome?.runtime?.getURL && typeof fetch === "function") {
    try {
      const response = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));
      if (response.ok) cache.set(locale, await response.json());
    } catch {
      // Fall back to chrome.i18n or key fallback.
    }
  }
  return activeLocale;
}

export function t(key, ...args) {
  let template = cache.get(activeLocale)?.[key]?.message;
  if (typeof template !== "string" && globalThis.chrome?.i18n?.getMessage) {
    template = chrome.i18n.getMessage(key);
  }
  if (typeof template !== "string" || !template) return key;
  return template.replace(/\$(\d+)/g, (_, index) => args[Number(index) - 1] ?? "");
}

export function applyI18n(root = document) {
  if (!root) return;
  document.documentElement.lang = displayLocaleTag();
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  }
  for (const el of root.querySelectorAll("[data-i18n-label]")) {
    el.label = t(el.dataset.i18nLabel);
  }
}
