import { getSettings, normalizeApiBaseUrl, normalizeModel, targetLanguage } from "./config.js";
import { errorText } from "./errors.js";
import { applyI18n, displayLocaleTag, initI18n, t } from "./i18n.js";
import { nativeRequest } from "./native-client.js";

const byId = id => document.getElementById(id);
const mode = byId("mode");
const target = byId("target");
const targetCustom = byId("target-custom");
const apiBaseUrl = byId("api-base-url");
const model = byId("model");
const ocrLanguage = byId("ocrLanguage");
const uiLanguage = byId("ui-language");
const save = byId("save");
const result = byId("status");
const keyInput = byId("api-key");
const saveKey = byId("save-key");
const keyStatus = byId("key-status");
const TARGET_PRESETS = [
  "zh-Hans", "zh-Hant", "en", "ja", "ko", "fr", "de", "es",
  "pt", "ru", "it", "ar", "vi", "th", "id", "nl", "pl", "tr", "hi"
];
let settings;
let loadedLanguages;

function syncCustomTarget() {
  const translate = mode.value === "translate";
  const isCustom = target.value === "__custom__";
  targetCustom.hidden = !isCustom;
  targetCustom.disabled = !translate || !isCustom;
  targetCustom.required = translate && isCustom;
}

function refreshMode() {
  const translate = mode.value === "translate";
  target.disabled = !translate;
  apiBaseUrl.disabled = !translate;
  model.disabled = !translate;
  byId("target-fields").hidden = !translate;
  byId("translation-key").hidden = !translate;
  syncCustomTarget();
}

function renderTargetOptions(chosen) {
  const display = new Intl.DisplayNames([displayLocaleTag()], { type: "language" });
  const options = TARGET_PRESETS.map(code => new Option(`${display.of(code)} (${code})`, code));
  options.push(new Option(t("targetCustomOption"), "__custom__"));
  target.replaceChildren(...options);
  if (TARGET_PRESETS.includes(chosen)) {
    target.value = chosen;
  } else {
    target.value = "__custom__";
    targetCustom.value = chosen ?? "";
  }
  syncCustomTarget();
}

function showKeyStatus(message, state) {
  keyStatus.textContent = message;
  keyStatus.dataset.state = state;
}

function renderOcrLanguageOptions(languages, chosen) {
  const display = new Intl.DisplayNames([displayLocaleTag()], { type: "language" });
  const options = [new Option(t("ocrAuto"), "auto")];
  for (const code of languages) {
    options.push(new Option(`${display.of(code)}（${code}）`, code));
  }
  ocrLanguage.replaceChildren(...options);
  ocrLanguage.value = languages.includes(chosen) ? chosen : "auto";
}

async function loadKeyStatus() {
  try {
    const { configured } = await nativeRequest({ command: "key_status" });
    showKeyStatus(configured ? t("keyStatusConfigured") : t("keyStatusMissing"), configured ? "done" : "idle");
  } catch (error) {
    showKeyStatus(error.message === "native_timeout" ? t("keyStatusTimeout") : errorText(error.message), "error");
  } finally {
    saveKey.disabled = false;
  }
}

saveKey.onclick = async () => {
  if (saveKey.disabled) return;
  let apiKey = keyInput.value.trim();
  if (!apiKey) {
    showKeyStatus(t("keyStatusPrompt"), "error");
    keyInput.focus();
    return;
  }
  keyInput.value = "";
  keyInput.disabled = true;
  saveKey.disabled = true;
  showKeyStatus(t("keyStatusSaving"), "busy");
  try {
    const saving = nativeRequest({ command: "set_key", apiKey });
    apiKey = "";
    await saving;
    showKeyStatus(t("keyStatusSaved"), "done");
  } catch (error) {
    showKeyStatus(error.message === "native_timeout" ? t("keyStatusSaveTimeout") : errorText(error.message), "error");
  } finally {
    keyInput.disabled = false;
    saveKey.disabled = false;
  }
};
keyInput.onkeydown = event => {
  if (event.key === "Enter" && !event.isComposing) saveKey.click();
};

mode.onchange = refreshMode;
target.onchange = () => {
  targetCustom.setCustomValidity("");
  syncCustomTarget();
  if (!targetCustom.hidden) targetCustom.focus();
};
targetCustom.oninput = () => targetCustom.setCustomValidity("");
apiBaseUrl.oninput = () => apiBaseUrl.setCustomValidity("");
model.oninput = () => model.setCustomValidity("");

byId("settings-form").onsubmit = async event => {
  event.preventDefault();
  let canonical = settings.target;
  let normalizedUrl = settings.apiBaseUrl;
  let normalizedModel = settings.model;
  if (!target.disabled) {
    const rawTarget = target.value === "__custom__" ? targetCustom.value : target.value;
    canonical = targetLanguage(rawTarget);
    if (!canonical) {
      targetCustom.setCustomValidity(t("targetInvalid"));
      targetCustom.reportValidity();
      return;
    }
    normalizedUrl = normalizeApiBaseUrl(apiBaseUrl.value);
    if (!normalizedUrl) {
      apiBaseUrl.setCustomValidity(t("apiBaseUrlInvalid"));
      apiBaseUrl.reportValidity();
      return;
    }
    normalizedModel = normalizeModel(model.value);
    if (!normalizedModel) {
      model.setCustomValidity(t("modelInvalid"));
      model.reportValidity();
      return;
    }
  }
  const changes = {
    mode: mode.value,
    target: canonical,
    ocrLanguage: ocrLanguage.value,
    apiBaseUrl: normalizedUrl,
    model: normalizedModel,
    uiLanguage: uiLanguage.value
  };
  save.disabled = true;
  try {
    await chrome.storage.local.set(changes);
    const uiChanged = settings.uiLanguage !== changes.uiLanguage;
    Object.assign(settings, changes);
    renderTargetOptions(canonical);
    apiBaseUrl.value = normalizedUrl;
    model.value = normalizedModel;
    void chrome.storage.local.remove("provider").catch(() => {});
    if (uiChanged) {
      await initI18n(settings.uiLanguage);
      applyI18n();
      renderTargetOptions(settings.target);
      if (loadedLanguages) renderOcrLanguageOptions(loadedLanguages, ocrLanguage.value);
      void loadKeyStatus();
    }
    result.textContent = t("statusSettingsSaved");
    result.dataset.state = "done";
  } catch {
    result.textContent = t("statusSettingsSaveFailed");
    result.dataset.state = "error";
  } finally {
    save.disabled = false;
  }
};

async function load() {
  save.disabled = true;
  settings = await getSettings();
  await initI18n(settings.uiLanguage);
  applyI18n();
  mode.value = settings.mode;
  renderTargetOptions(settings.target);
  apiBaseUrl.value = settings.apiBaseUrl;
  model.value = settings.model;
  uiLanguage.value = settings.uiLanguage;
  refreshMode();
  if (settings.needsModeSelection) {
    result.textContent = t("statusReselectMode");
    result.dataset.state = "error";
  }
  if (settings.ocrLanguage !== "auto") {
    ocrLanguage.add(new Option(settings.ocrLanguage, settings.ocrLanguage, true, true));
  }
  save.disabled = false;

  try {
    const cached = await chrome.storage.session?.get("cache_languages").catch(() => null);
    let languages = Array.isArray(cached?.cache_languages) ? cached.cache_languages : null;
    if (!languages) {
      ({ languages } = await nativeRequest({ command: "languages" }));
      void chrome.storage.session?.set({ cache_languages: languages }).catch(() => {});
    }
    loadedLanguages = languages;
    const chosen = ocrLanguage.value;
    renderOcrLanguageOptions(languages, chosen);
    if (chosen !== ocrLanguage.value) byId("recognition-status").textContent = t("statusOcrLangUnavailable");
  } catch (error) {
    byId("recognition-status").textContent = error.message === "native_timeout"
      ? t("statusOcrLangTimeout")
      : errorText(error.message);
  }
}

void load().catch(() => { result.textContent = t("statusSettingsLoadFailed"); });
void loadKeyStatus();
