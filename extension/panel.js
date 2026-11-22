import { SessionCache, sha256 } from "./cache.js";
import { getSettings, translationRequest } from "./config.js";
import { createDiagnosticsStore } from "./diagnostics.js";
import { errorText } from "./errors.js";
import { applyI18n, displayLocaleTag, initI18n, t } from "./i18n.js";
import { readFile, readPageImage } from "./image.js";
import { nativeRequest } from "./native-client.js";

const byId = (id) => document.getElementById(id);
const original = byId("original");
const translation = byId("translation");
const fileInput = byId("file");
const diagnosticsSummary = byId("diagnostics-summary");
const diagnosticsOutput = byId("diagnostics-output");
const copyDiagnostics = byId("copy-diagnostics");
const ocrCache = new SessionCache("cache_ocr", 25);
const translationCache = new SessionCache("cache_translation", 25);
const diagnostics = createDiagnosticsStore();
let active;
let pendingPaste;
let panelPort;
let preferences;

function status(text, state = "idle") {
  byId("status").textContent = text;
  byId("status").dataset.state = state;
}

function renderDiagnostics() {
  const run = diagnostics.latest();
  if (diagnosticsSummary)
    diagnosticsSummary.textContent = run ? diagnostics.formatSummary(run, t) : "";
  if (diagnosticsOutput)
    diagnosticsOutput.textContent = run ? diagnostics.formatReport(run) : t("diagnosticsEmpty");
  if (copyDiagnostics) copyDiagnostics.disabled = !run;
}

function refreshButtons() {
  const translationEnabled = preferences?.mode === "translate";
  const busy = Boolean(active || pendingPaste);
  byId("cancel").hidden = !busy;
  byId("retry").hidden = !translationEnabled;
  byId("retry").disabled = !translationEnabled || busy || !original.value;
  const resultMode = active?.settings?.mode ?? preferences?.mode;
  byId("translation-result").hidden = resultMode !== "translate" && !translation.value;
  byId("copy-original").disabled = !original.value;
  byId("copy-translation").disabled = !translation.value;
}

function stop() {
  const current = active;
  active = undefined;
  pendingPaste = undefined;
  if (current?.run && current.run.outcome === "running") {
    diagnostics.finishRun(current.run, "cancelled");
    renderDiagnostics();
  }
  current?.controller.abort();
  refreshButtons();
}

function start(work, { trigger = "unknown" } = {}) {
  stop();
  const job = {
    controller: new AbortController(),
    settings: undefined,
    trigger,
    stage: "init",
    run: undefined,
    outcome: undefined,
  };
  active = job;
  refreshButtons();
  const { signal } = job.controller;
  void getSettings()
    .then(async (settings) => {
      signal.throwIfAborted();
      await initI18n(settings.uiLanguage);
      signal.throwIfAborted();
      job.settings = settings;
      job.run = diagnostics.startRun({ trigger, settings });
      renderDiagnostics();
      refreshButtons();
      await work(settings, signal, job);
      signal.throwIfAborted();
      if (job.run && job.run.outcome === "running") {
        diagnostics.finishRun(job.run, job.outcome ?? "done");
        renderDiagnostics();
      }
    })
    .catch((error) => {
      if (active === job && !signal.aborted) {
        if (job.run) {
          if (error?.meta) {
            if (job.stage === "ocr")
              diagnostics.recordOcr(job.run, { cacheHit: false, ...error.meta });
            else if (job.stage === "translate")
              diagnostics.recordTranslation(job.run, { cacheHit: false, ...error.meta });
          }
          diagnostics.finishRun(job.run, "error", {
            code: error?.message ?? "native_failed",
            stage: job.stage,
          });
          renderDiagnostics();
        }
        status(errorText(error?.message), "error");
      }
    })
    .finally(() => {
      if (active === job) {
        active = undefined;
        refreshButtons();
      }
    });
}

async function translate(settings, signal, job, { useCache = false } = {}) {
  signal.throwIfAborted();
  if (settings.mode === "ocr") {
    status(t("statusOcrDone"), "done");
    return;
  }
  job.stage = "translate";
  const startedMs = performance.now();
  const source = original.value;
  const cacheKey = `tr:${settings.apiBaseUrl}:${settings.model}:${settings.target}:${await sha256(source)}`;
  signal.throwIfAborted();
  if (useCache) {
    const cached = await translationCache.get(cacheKey);
    signal.throwIfAborted();
    if (typeof cached === "string") {
      translation.value = cached;
      diagnostics.recordTranslation(job.run, {
        cacheHit: true,
        route: "cache",
        target: settings.target,
        model: settings.model,
        outputChars: cached.length,
        sameAsOriginal: cached.trim() === source.trim(),
        durationMs: Math.round(performance.now() - startedMs),
      });
      renderDiagnostics();
      refreshButtons();
      status(t("statusTranslateDone"), "done");
      return;
    }
  }
  status(t("statusTranslating"), "busy");
  const reply = await nativeRequest(
    { ...translationRequest(settings, source), diagnostics: true },
    {
      signal,
      onDelta: (text) => {
        translation.value += text;
        refreshButtons();
      },
    },
  );
  signal.throwIfAborted();
  diagnostics.recordTranslation(job.run, {
    cacheHit: false,
    ...(reply?.meta ?? {}),
    sameAsOriginal: translation.value.trim() === source.trim(),
  });
  renderDiagnostics();
  if (translation.value) await translationCache.set(cacheKey, translation.value);
  status(t("statusTranslateDone"), "done");
}

async function recognizeImage(acquire, language, signal, job) {
  job.stage = "image";
  const imageStart = performance.now();
  status(t("statusReadingImage"), "busy");
  const image = await acquire(signal);
  signal.throwIfAborted();
  diagnostics.recordImage(job.run, {
    source: job.trigger,
    bytes: Math.floor((image.length * 3) / 4),
    durationMs: Math.round(performance.now() - imageStart),
  });
  renderDiagnostics();

  job.stage = "ocr";
  const ocrStart = performance.now();
  const cacheKey = `ocr:${language}:${await sha256(image)}`;
  signal.throwIfAborted();
  const cached = await ocrCache.get(cacheKey);
  signal.throwIfAborted();
  if (typeof cached === "string") {
    diagnostics.recordOcr(job.run, {
      cacheHit: true,
      language,
      charCount: cached.length,
      durationMs: Math.round(performance.now() - ocrStart),
    });
    renderDiagnostics();
    return { text: cached };
  }
  status(t("statusRecognizing"), "busy");
  const result = await nativeRequest(
    { command: "ocr", image, language, diagnostics: true },
    { signal },
  );
  signal.throwIfAborted();
  diagnostics.recordOcr(job.run, {
    cacheHit: false,
    language,
    ...(result?.meta ?? {}),
  });
  renderDiagnostics();
  await ocrCache.set(cacheKey, result.text);
  return result;
}

function processImage(acquire, { translateAfterRecognition = false, trigger = "upload" } = {}) {
  original.value = "";
  translation.value = "";
  start(
    async (settings, signal, job) => {
      const result = recognizeImage(acquire, settings.ocrLanguage, signal, job);
      acquire = undefined;
      const { text } = await result;
      signal.throwIfAborted();
      original.value = text;
      refreshButtons();
      if (!text) {
        job.outcome = "empty";
        status(t("statusNoText"), "empty");
        return;
      }
      if (translateAfterRecognition && settings.mode === "translate") {
        await translate(settings, signal, job, { useCache: true });
      } else {
        status(t("statusOcrDone"), "done");
      }
    },
    { trigger },
  );
}

function retry() {
  if (preferences?.mode !== "translate" || active || pendingPaste || !original.value) return;
  translation.value = "";
  start((settings, signal, job) => translate(settings, signal, job), { trigger: "retry" });
}

async function connectPanel() {
  const current = await chrome.windows.getCurrent();
  const port = chrome.runtime.connect({ name: "translator-panel" });
  panelPort = port;
  port.onMessage.addListener((message) => {
    if (message.type === "image") {
      processImage((signal) => readPageImage(message, signal), {
        translateAfterRecognition: true,
        trigger: "context-menu",
      });
    } else if (message.type === "image-error") {
      stop();
      original.value = "";
      translation.value = "";
      const run = diagnostics.startRun({ trigger: "context-menu", settings: preferences });
      diagnostics.finishRun(run, "error", { code: message.code, stage: "image" });
      renderDiagnostics();
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
  renderDiagnostics();
  const { mode, target, needsModeSelection } = preferences;
  refreshButtons();
  if (needsModeSelection) {
    byId("route").textContent = t("routeOnlyOcrReselect");
    return;
  }
  const language = new Intl.DisplayNames([displayLocaleTag()], { type: "language" });
  byId("route").textContent =
    mode === "translate" ? t("routeTranslateTo", language.of(target)) : t("routeOnlyOcr");
}

byId("settings").onclick = () => void chrome.runtime.openOptionsPage();
byId("choose").onclick = () => fileInput.click();
fileInput.onchange = () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (file) processImage((signal) => readFile(file, signal), { trigger: "upload" });
};
byId("paste").onclick = async () => {
  stop();
  const read = {};
  pendingPaste = read;
  refreshButtons();
  status(t("statusReadingImage"), "busy");
  try {
    const items = await navigator.clipboard.read();
    if (pendingPaste !== read) return;
    for (const item of items) {
      const type = item.types.find((entry) => entry.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      if (pendingPaste !== read) return;
      processImage((signal) => readFile(blob, signal), { trigger: "paste" });
      return;
    }
    status(t("statusNoClipboardImage"), "empty");
  } catch {
    if (pendingPaste === read) status(t("statusPasteHint"));
  } finally {
    if (pendingPaste === read) {
      pendingPaste = undefined;
      refreshButtons();
    }
  }
};
document.addEventListener("paste", (event) => {
  const file = Array.from(event.clipboardData?.items ?? [])
    .find((item) => item.kind === "file" && item.type.startsWith("image/"))
    ?.getAsFile();
  if (!file) return;
  event.preventDefault();
  processImage((signal) => readFile(file, signal), { trigger: "paste" });
});
const dropzone = byId("dropzone");
document.addEventListener("dragover", (event) => {
  if (Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === "file")) {
    event.preventDefault();
    if (dropzone) dropzone.dataset.drag = "over";
  }
});
document.addEventListener("dragleave", (event) => {
  if (event.relatedTarget === null && dropzone) delete dropzone.dataset.drag;
});
document.addEventListener("drop", (event) => {
  if (dropzone) delete dropzone.dataset.drag;
  const file = Array.from(event.dataTransfer?.files ?? []).find((entry) =>
    entry.type.startsWith("image/"),
  );
  if (!file) return;
  event.preventDefault();
  processImage((signal) => readFile(file, signal), { trigger: "drop" });
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
  diagnostics.clear();
  renderDiagnostics();
  status(t("statusCleared"));
  refreshButtons();
};

for (const [id, input] of [
  ["copy-original", original],
  ["copy-translation", translation],
]) {
  const button = byId(id);
  let copiedTimer;
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      button.textContent = t("btnCopied");
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        button.textContent = t("btnCopy");
      }, 1500);
    } catch {
      status(t("statusCopyFailed"), "error");
    }
  };
}

if (copyDiagnostics) {
  let diagCopiedTimer;
  copyDiagnostics.onclick = async () => {
    const report = diagnostics.formatReport();
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      copyDiagnostics.textContent = t("btnCopied");
      clearTimeout(diagCopiedTimer);
      diagCopiedTimer = setTimeout(() => {
        copyDiagnostics.textContent = t("btnCopyDiagnostics");
      }, 1500);
    } catch {
      status(t("statusCopyFailed"), "error");
    }
  };
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session") {
    if (changes.cache_ocr && changes.cache_ocr.newValue === undefined) ocrCache.reset();
    if (changes.cache_translation && changes.cache_translation.newValue === undefined)
      translationCache.reset();
    return;
  }
  if (
    area === "local" &&
    (changes.mode ||
      changes.provider ||
      changes.target ||
      changes.apiBaseUrl ||
      changes.model ||
      changes.uiLanguage)
  ) {
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
