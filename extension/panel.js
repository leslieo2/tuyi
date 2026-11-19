import { getSettings, translationRequest } from "./config.js";
import { errorText } from "./errors.js";
import { readFile, readPageImage } from "./image.js";
import { nativeRequest } from "./native-client.js";

const byId = id => document.getElementById(id);
const original = byId("original");
const translation = byId("translation");
const fileInput = byId("file");
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
  byId("translation-help").hidden = !translationEnabled;
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
  void getSettings().then(settings => {
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

async function translate(settings, signal) {
  signal.throwIfAborted();
  if (settings.mode === "ocr") {
    status("识别完成。", "done");
    return;
  }
  status("正在翻译…", "busy");
  await nativeRequest(translationRequest(settings, original.value), {
    signal,
    onDelta: text => {
      translation.value += text;
      refreshButtons();
    }
  });
  signal.throwIfAborted();
  status("翻译完成。", "done");
}

async function recognizeImage(acquire, language, signal) {
  status("正在读取图片…", "busy");
  const acquisition = acquire(signal);
  acquire = undefined;
  const image = await acquisition;
  signal.throwIfAborted();
  status("正在识别图片中的文字…", "busy");
  return nativeRequest({ command: "ocr", image, language }, { signal });
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
      status("没有识别到文字。", "empty");
      return;
    }
    if (translateAfterRecognition && settings.mode === "translate") await translate(settings, signal);
    else status("识别完成。", "done");
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
  const { mode, target, needsModeSelection } = preferences;
  refreshButtons();
  if (needsModeSelection) {
    byId("route").textContent = "仅识别 · 请在设置中重新选择处理方式";
    return;
  }
  const language = new Intl.DisplayNames(["zh-CN"], { type: "language" });
  byId("route").textContent = mode === "translate" ? `默认译为${language.of(target)}` : "仅识别";
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
    status("剪贴板中没有图片。请先截图或复制图片。", "empty");
  } catch {
    status("请按 ⌘V 粘贴剪贴板中的图片。");
  }
};
document.addEventListener("paste", event => {
  const file = Array.from(event.clipboardData?.items ?? [])
    .find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
  if (!file) return;
  event.preventDefault();
  processImage(signal => readFile(file, signal));
});
document.addEventListener("dragover", event => {
  if (Array.from(event.dataTransfer?.items ?? []).some(item => item.kind === "file")) {
    event.preventDefault();
  }
});
document.addEventListener("drop", event => {
  const file = Array.from(event.dataTransfer?.files ?? [])
    .find(entry => entry.type.startsWith("image/"));
  if (!file) return;
  event.preventDefault();
  processImage(signal => readFile(file, signal));
});
byId("retry").onclick = () => retry();
byId("cancel").onclick = () => {
  stop();
  status("已取消。");
};
byId("clear").onclick = () => {
  stop();
  original.value = "";
  translation.value = "";
  fileInput.value = "";
  status("已清除。");
  refreshButtons();
};

for (const [id, input] of [["copy-original", original], ["copy-translation", translation]]) {
  const button = byId(id);
  let copiedTimer;
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      button.textContent = "已复制";
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { button.textContent = "复制"; }, 1500);
    } catch {
      status("未能写入剪贴板，请选中文字手动复制。", "error");
    }
  };
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.mode || changes.provider || changes.target)) {
    void refreshRoute().catch(() => {});
  }
});
window.addEventListener("pagehide", () => {
  stop();
  const port = panelPort;
  panelPort = undefined;
  port?.disconnect();
});
void connectPanel().catch(() => status("无法连接扩展后台。可上传或粘贴图片。", "error"));
void refreshRoute().catch(() => {});
