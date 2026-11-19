import { SessionCache, sha256 } from "./cache.js";
import { getSettings, translationRequest } from "./config.js";
import { errorText } from "./errors.js";
import { applyI18n, displayLocaleTag, initI18n, t } from "./i18n.js";
import { readFile, readPageImage } from "./image.js";
import { nativeRequest } from "./native-client.js";

const byId = id => document.getElementById(id);
const original = byId("original");
const translation = byId("translation");
const fileInput = byId("file");
const ocrCache = new SessionCache("cache_ocr", 25);
const translationCache = new SessionCache("cache_translation", 25);
let active;
let panelPort;
let preferences;

function status(text, state = "idle") {
  byId("status").textContent = text;
  byId("status").dataset.state = state;
}

function refreshButtons() {
  const translationEnabled = preferences?.mode === "translate";
  byId("cancel").hidden = !active;
  byId("retry").hidden = !translationEnabled;
  byId("retry").disabled = !translationEnabled || Boolean(active) || !original.value;
  const resultMode = active?.settings?.mode ?? preferences?.mode;
  byId("translation-result").hidden = resultMode !== "translate" && !translation.value;
  byId("copy-original").disabled = !original.value;
  byId("copy-translation").disabled = !translation.value;
}

function stop() {
  const current = active;
  active = undefined;
  current?.controller.abort();
  refreshButtons();
}

function start(work) {
  stop();
  const job = { controller: new AbortController(), settings: undefined };
  active = job;
  refreshButtons();
  const { signal } = job.controller;
  void getSettings().then(async settings => {
    signal.throwIfAborted();
    await initI18n(settings.uiLanguage);
    signal.throwIfAborted();
    job.settings = settings;
    refreshButtons();
    return work(settings, signal);
  }).catch(error => {
    if (active === job && !signal.aborted) {
      status(errorText(error?.message), "error");
    }
  }).finally(() => {
    if (active === job) {
      active = undefined;
      refreshButtons();
    }
  });
}

async function translate(settings, signal, { useCache = false } = {}) {
  signal.throwIfAborted();
  if (settings.mode === "ocr") {
    status(t("statusOcrDone"), "done");
    return;
  }
  const source = original.value;
  const cacheKey = `tr:${settings.apiBaseUrl}:${settings.model}:${settings.target}:${await sha256(source)}`;
  signal.throwIfAborted();
  if (useCache) {
    const cached = await translationCache.get(cacheKey);
    signal.throwIfAborted();
    if (typeof cached === "string") {
      translation.value = cached;
      refreshButtons();
      status(t("statusTranslateDone"), "done");
      return;
    }
  }
  status(t("statusTranslating"), "busy");
  await nativeRequest(translationRequest(settings, source), {
    signal,
    onDelta: text => {
      translation.value += text;
      refreshButtons();
    }
  });
  signal.throwIfAborted();
  if (translation.value) await translationCache.set(cacheKey, translation.value);
  status(t("statusTranslateDone"), "done");
}

async function recognizeImage(acquire, language, signal) {
  status(t("statusReadingImage"), "busy");
  const acquisition = acquire(signal);
  acquire = undefined;
  const image = await acquisition;
  signal.throwIfAborted();
  const cacheKey = `ocr:${language}:${await sha256(image)}`;
  signal.throwIfAborted();
  const cached = await ocrCache.get(cacheKey);
  signal.throwIfAborted();
  if (typeof cached === "string") return { text: cached };
  status(t("statusRecognizing"), "busy");
  const result = await nativeRequest({ command: "ocr", image, language }, { signal });
  signal.throwIfAborted();
  await ocrCache.set(cacheKey, result.text);
  return result;
}

function processImage(acquire, translateAfterRecognition = false) {
  original.value = "";
  translation.value = "";
  start(async (settings, signal) => {
    const result = recognizeImage(acquire, settings.ocrLanguage, signal);
    acquire = undefined;
    const { text } = await result;
    signal.throwIfAborted();
    original.value = text;
    refreshButtons();
    if (!text) {
      status(t("statusNoText"), "empty");
      return;
    }
    if (translateAfterRecognition && settings.mode === "translate") {
      await translate(settings, signal, { useCache: true });
    } else {
      status(t("statusOcrDone"), "done");
    }
  });
}

function retry() {
  if (preferences?.mode !== "translate" || active || !original.value) return;
  translation.value = "";
  start(translate);
}

async function connectPanel() {
  const current = await chrome.windows.getCurrent();
  const port = chrome.runtime.connect({ name: "translator-panel" });
  panelPort = port;
  port.onMessage.addListener(message => {
    if (message.type === "image") {
      processImage(signal => readPageImage(message, signal), true);
    } else if (message.type === "image-error") {
      stop();
      original.value = "";
      translation.value = "";
      refreshButtons();
      status(errorText(message.code), "error");
    }
  });
  port.onDisconnect.addListener(() => {
    // An idle extension worker may restart while the side panel remains open.
    void chrome.runtime.lastError;
    if (panelPort === port) setTimeout(() => void connectPanel().catch(() => {}), 300);
  });
  port.postMessage({ type: "ready", windowId: current.id });
}

async function refreshRoute() {
  preferences = await getSettings();
  await initI18n(preferences.uiLanguage);
  applyI18n();
  const { mode, target, needsModeSelection } = preferences;
  refreshButtons();
  if (needsModeSelection) {
    byId("route").textContent = t("routeOnlyOcrReselect");
    return;
  }
  const language = new Intl.DisplayNames([displayLocaleTag()], { type: "language" });
  byId("route").textContent = mode === "translate" ? t("routeTranslateTo", language.of(target)) : t("routeOnlyOcr");
}

byId("settings").onclick = () => void chrome.runtime.openOptionsPage();
byId("choose").onclick = () => fileInput.click();
fileInput.onchange = () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (file) processImage(signal => readFile(file, signal));
};
byId("paste").onclick = async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(entry => entry.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      processImage(signal => readFile(blob, signal));
      return;
    }
    status(t("statusNoClipboardImage"), "empty");
  } catch {
    status(t("statusPasteHint"));
  }
};
document.addEventListener("paste", event => {
  const file = Array.from(event.clipboardData?.items ?? [])
    .find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
  if (!file) return;
  event.preventDefault();
  processImage(signal => readFile(file, signal));
});
const dropzone = byId("dropzone");
document.addEventListener("dragover", event => {
  if (Array.from(event.dataTransfer?.items ?? []).some(item => item.kind === "file")) {
    event.preventDefault();
    if (dropzone) dropzone.dataset.drag = "over";
  }
});
document.addEventListener("dragleave", event => {
  if (event.relatedTarget === null && dropzone) delete dropzone.dataset.drag;
});
document.addEventListener("drop", event => {
  if (dropzone) delete dropzone.dataset.drag;
  const file = Array.from(event.dataTransfer?.files ?? [])
    .find(entry => entry.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  processImage(signal => readFile(file, signal));
});
byId("retry").onclick = () => retry();
byId("cancel").onclick = () => {
  stop();
  status(t("statusCancelled"));
};
byId("clear").onclick = () => {
  stop();
  original.value = "";
  translation.value = "";
  fileInput.value = "";
  status(t("statusCleared"));
  refreshButtons();
};

for (const [id, input] of [["copy-original", original], ["copy-translation", translation]]) {
  const button = byId(id);
  let copiedTimer;
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      button.textContent = t("btnCopied");
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { button.textContent = t("btnCopy"); }, 1500);
    } catch {
      status(t("statusCopyFailed"), "error");
    }
  };
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.mode || changes.provider || changes.target ||
      changes.apiBaseUrl || changes.model || changes.uiLanguage)) {
    void refreshRoute().catch(() => {});
  }
});
window.addEventListener("pagehide", () => {
  stop();
  const port = panelPort;
  panelPort = undefined;
  port?.disconnect();
});
void connectPanel().catch(() => status(t("statusBgUnavailable"), "error"));
void refreshRoute().catch(() => {});
