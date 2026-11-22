import { clearAllCaches } from "./cache.js";
import { getSettings, normalizeApiBaseUrl, normalizeModel, targetLanguage } from "./config.js";
import { errorText } from "./errors.js";
import { applyI18n, displayLocaleTag, initI18n, t } from "./i18n.js";
import { nativeRequest } from "./native-client.js";

const byId = (id) => document.getElementById(id);
const mode = byId("mode");
const target = byId("target");
const targetCustom = byId("target-custom");
const providerPreset = byId("provider-preset");
const apiBaseUrlFields = byId("api-base-url-fields");
const apiBaseUrl = byId("api-base-url");
const modelPreset = byId("model-preset");
const model = byId("model");
const ocrLanguage = byId("ocrLanguage");
const uiLanguage = byId("ui-language");
const save = byId("save");
const result = byId("status");
const keyInput = byId("api-key");
const saveKey = byId("save-key");
const keyStatus = byId("key-status");
const testConnectionBtn = byId("test-connection");
const testStatus = byId("test-status");
const clearCacheBtn = byId("clear-cache");
const cacheStatus = byId("cache-status");

const TARGET_PRESETS = [
  "zh-Hans",
  "zh-Hant",
  "en",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "ru",
  "it",
  "ar",
  "vi",
  "th",
  "id",
  "nl",
  "pl",
  "tr",
  "hi",
];

const PROVIDER_PRESETS = [
  {
    id: "deepseek",
    label: () => "DeepSeek",
    url: "https://api.deepseek.com",
    models: ["deepseek-flash", "deepseek-chat"],
  },
  {
    id: "openai",
    label: () => "OpenAI",
    url: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
  },
  {
    id: "openrouter",
    label: () => "OpenRouter",
    url: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-4o-mini", "deepseek/deepseek-chat", "google/gemini-2.5-flash"],
  },
  {
    id: "ollama",
    label: () => t("presetOllama"),
    url: "http://127.0.0.1:11434/v1",
    models: ["qwen2.5:7b", "llama3.2", "gemma3:4b"],
  },
  {
    id: "lmstudio",
    label: () => t("presetLmStudio"),
    url: "http://127.0.0.1:1234/v1",
    models: ["local-model"],
  },
];

let settings;
let loadedLanguages;
let testingController;

function activePreset() {
  return PROVIDER_PRESETS.find((preset) => preset.id === providerPreset.value) ?? null;
}

function syncCustomTarget() {
  const translate = mode.value === "translate";
  const isCustom = target.value === "__custom__";
  targetCustom.hidden = !isCustom;
  targetCustom.disabled = !translate || !isCustom;
  targetCustom.required = translate && isCustom;
}

function syncCustomProviderAndModel() {
  const translate = mode.value === "translate";
  const isCustomProvider = providerPreset.value === "custom";
  apiBaseUrlFields.hidden = !isCustomProvider;
  apiBaseUrl.disabled = !translate || !isCustomProvider;
  apiBaseUrl.required = translate && isCustomProvider;

  const isCustomModel = isCustomProvider || modelPreset.value === "__custom__";
  modelPreset.hidden = isCustomProvider;
  modelPreset.disabled = !translate || isCustomProvider;
  model.hidden = !isCustomModel;
  model.disabled = !translate || !isCustomModel;
  model.required = translate && isCustomModel;
}

function refreshMode() {
  const translate = mode.value === "translate";
  target.disabled = !translate;
  providerPreset.disabled = !translate;
  byId("target-fields").hidden = !translate;
  byId("translation-key").hidden = !translate;
  testConnectionBtn.disabled = !translate || Boolean(testingController);
  syncCustomTarget();
  syncCustomProviderAndModel();
}

function renderTargetOptions(chosen) {
  const display = new Intl.DisplayNames([displayLocaleTag()], { type: "language" });
  const options = TARGET_PRESETS.map((code) => new Option(`${display.of(code)} (${code})`, code));
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

function renderModelOptions(chosenModel) {
  const preset = activePreset();
  if (!preset) {
    modelPreset.replaceChildren();
    model.value = chosenModel ?? "";
    syncCustomProviderAndModel();
    return;
  }
  const options = preset.models.map((id) => new Option(id, id));
  options.push(new Option(t("modelCustomOption"), "__custom__"));
  modelPreset.replaceChildren(...options);
  if (preset.models.includes(chosenModel)) {
    modelPreset.value = chosenModel;
  } else {
    modelPreset.value = "__custom__";
    model.value = chosenModel ?? preset.models[0];
  }
  syncCustomProviderAndModel();
}

function renderProviderOptions(chosenUrl, chosenModel) {
  const options = PROVIDER_PRESETS.map((preset) => new Option(preset.label(), preset.id));
  options.push(new Option(t("presetCustom"), "custom"));
  providerPreset.replaceChildren(...options);

  const normalizedUrl = normalizeApiBaseUrl(chosenUrl) ?? chosenUrl;
  const matched = PROVIDER_PRESETS.find((preset) => preset.url === normalizedUrl);
  if (matched) {
    providerPreset.value = matched.id;
    apiBaseUrl.value = matched.url;
  } else {
    providerPreset.value = "custom";
    apiBaseUrl.value = chosenUrl ?? "";
  }
  renderModelOptions(chosenModel);
}

function resolvedServiceInputs() {
  const preset = activePreset();
  const rawUrl = preset ? preset.url : apiBaseUrl.value;
  const rawModel = !preset || modelPreset.value === "__custom__" ? model.value : modelPreset.value;
  return { rawUrl, rawModel };
}

function validateServiceInputs() {
  const { rawUrl, rawModel } = resolvedServiceInputs();
  const normalizedUrl = normalizeApiBaseUrl(rawUrl);
  if (!normalizedUrl) {
    if (providerPreset.value !== "custom") {
      providerPreset.value = "custom";
      syncCustomProviderAndModel();
    }
    apiBaseUrl.setCustomValidity(t("apiBaseUrlInvalid"));
    apiBaseUrl.reportValidity();
    return null;
  }
  const normalizedModel = normalizeModel(rawModel);
  if (!normalizedModel) {
    if (modelPreset.value !== "__custom__") {
      modelPreset.value = "__custom__";
      syncCustomProviderAndModel();
    }
    model.setCustomValidity(t("modelInvalid"));
    model.reportValidity();
    return null;
  }
  return { normalizedUrl, normalizedModel };
}

function showStatus(element, message, state) {
  element.textContent = message;
  element.dataset.state = state;
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
    showStatus(
      keyStatus,
      configured ? t("keyStatusConfigured") : t("keyStatusMissing"),
      configured ? "done" : "idle",
    );
  } catch (error) {
    showStatus(
      keyStatus,
      error.message === "native_timeout" ? t("keyStatusTimeout") : errorText(error.message),
      "error",
    );
  } finally {
    saveKey.disabled = false;
  }
}

saveKey.onclick = async () => {
  if (saveKey.disabled) return;
  let apiKey = keyInput.value.trim();
  if (!apiKey) {
    showStatus(keyStatus, t("keyStatusPrompt"), "error");
    keyInput.focus();
    return;
  }
  keyInput.value = "";
  keyInput.disabled = true;
  saveKey.disabled = true;
  showStatus(keyStatus, t("keyStatusSaving"), "busy");
  try {
    const saving = nativeRequest({ command: "set_key", apiKey });
    apiKey = "";
    await saving;
    showStatus(keyStatus, t("keyStatusSaved"), "done");
  } catch (error) {
    showStatus(
      keyStatus,
      error.message === "native_timeout" ? t("keyStatusSaveTimeout") : errorText(error.message),
      "error",
    );
  } finally {
    keyInput.disabled = false;
    saveKey.disabled = false;
  }
};
keyInput.onkeydown = (event) => {
  if (event.key === "Enter" && !event.isComposing) saveKey.click();
};

testConnectionBtn.onclick = async () => {
  if (testConnectionBtn.disabled || mode.value !== "translate") return;
  if (keyInput.value.trim()) {
    showStatus(testStatus, t("testStatusSaveKeyFirst"), "error");
    saveKey.focus();
    return;
  }
  const validated = validateServiceInputs();
  if (!validated) return;

  testingController?.abort();
  const controller = new AbortController();
  testingController = controller;
  testConnectionBtn.disabled = true;
  showStatus(testStatus, t("testStatusTesting"), "busy");
  try {
    await nativeRequest(
      {
        command: "test_connection",
        apiBaseUrl: validated.normalizedUrl,
        model: validated.normalizedModel,
      },
      { signal: controller.signal },
    );
    if (testingController === controller) {
      showStatus(testStatus, t("testStatusSuccess"), "done");
    }
  } catch (error) {
    if (testingController === controller && error?.name !== "AbortError") {
      const msg =
        error.message === "native_timeout" ? t("testStatusTimeout") : errorText(error.message);
      showStatus(testStatus, msg, "error");
    }
  } finally {
    if (testingController === controller) {
      testingController = undefined;
      testConnectionBtn.disabled = mode.value !== "translate";
    }
  }
};

clearCacheBtn.onclick = async () => {
  if (clearCacheBtn.disabled) return;
  clearCacheBtn.disabled = true;
  try {
    await clearAllCaches();
    showStatus(cacheStatus, t("statusCacheCleared"), "done");
  } catch {
    showStatus(cacheStatus, t("statusCacheClearFailed"), "error");
  } finally {
    clearCacheBtn.disabled = false;
  }
};

mode.onchange = refreshMode;
target.onchange = () => {
  targetCustom.setCustomValidity("");
  syncCustomTarget();
  if (!targetCustom.hidden) targetCustom.focus();
};
providerPreset.onchange = () => {
  apiBaseUrl.setCustomValidity("");
  model.setCustomValidity("");
  showStatus(testStatus, "", "idle");
  const preset = activePreset();
  if (preset) {
    apiBaseUrl.value = preset.url;
    renderModelOptions(preset.models[0]);
  } else {
    renderModelOptions(model.value || settings?.model || "");
    apiBaseUrl.focus();
  }
};
modelPreset.onchange = () => {
  model.setCustomValidity("");
  showStatus(testStatus, "", "idle");
  syncCustomProviderAndModel();
  if (!model.hidden) model.focus();
};
targetCustom.oninput = () => targetCustom.setCustomValidity("");
apiBaseUrl.oninput = () => {
  apiBaseUrl.setCustomValidity("");
  showStatus(testStatus, "", "idle");
};
model.oninput = () => {
  model.setCustomValidity("");
  showStatus(testStatus, "", "idle");
};

byId("settings-form").onsubmit = async (event) => {
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
    const validated = validateServiceInputs();
    if (!validated) return;
    ({ normalizedUrl, normalizedModel } = validated);
  }
  const changes = {
    mode: mode.value,
    target: canonical,
    ocrLanguage: ocrLanguage.value,
    apiBaseUrl: normalizedUrl,
    model: normalizedModel,
    uiLanguage: uiLanguage.value,
  };
  save.disabled = true;
  try {
    await chrome.storage.local.set(changes);
    const uiChanged = settings.uiLanguage !== changes.uiLanguage;
    Object.assign(settings, changes);
    renderTargetOptions(canonical);
    renderProviderOptions(normalizedUrl, normalizedModel);
    void chrome.storage.local.remove("provider").catch(() => {});
    if (uiChanged) {
      await initI18n(settings.uiLanguage);
      applyI18n();
      renderTargetOptions(settings.target);
      renderProviderOptions(settings.apiBaseUrl, settings.model);
      if (loadedLanguages) renderOcrLanguageOptions(loadedLanguages, ocrLanguage.value);
      void loadKeyStatus();
    }
    showStatus(result, t("statusSettingsSaved"), "done");
  } catch {
    showStatus(result, t("statusSettingsSaveFailed"), "error");
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
  renderProviderOptions(settings.apiBaseUrl, settings.model);
  uiLanguage.value = settings.uiLanguage;
  refreshMode();
  if (settings.needsModeSelection) {
    showStatus(result, t("statusReselectMode"), "error");
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
    if (chosen !== ocrLanguage.value)
      byId("recognition-status").textContent = t("statusOcrLangUnavailable");
  } catch (error) {
    byId("recognition-status").textContent =
      error.message === "native_timeout" ? t("statusOcrLangTimeout") : errorText(error.message);
  }
}

window.addEventListener("pagehide", () => testingController?.abort());
void load().catch(() => {
  result.textContent = t("statusSettingsLoadFailed");
});
void loadKeyStatus();
