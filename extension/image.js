import { MAX_IMAGE_BYTES } from "./config.js";

export function readFile(file, signal) {
  if (!file?.size) return Promise.reject(new Error("invalid_image"));
  if (file.size > MAX_IMAGE_BYTES) return Promise.reject(new Error("image_size"));
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const reader = new FileReader();
    const abort = () => reader.abort();
    reader.onloadend = () => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new DOMException("Aborted", "AbortError"));
      else if (typeof reader.result === "string")
        resolve(reader.result.slice(reader.result.indexOf(",") + 1));
      else reject(new Error("invalid_image"));
    };
    signal.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(file);
  });
}

function canvasToBase64(canvas, signal) {
  const toBlob = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  return (async () => {
    try {
      let blob = await toBlob("image/png");
      if (!blob?.size || blob.size > MAX_IMAGE_BYTES) {
        blob = await toBlob("image/jpeg", 0.92);
      }
      signal.throwIfAborted();
      if (!blob?.size) throw new Error("image_read");
      if (blob.size > MAX_IMAGE_BYTES) throw new Error("image_size");
      return await readFile(blob, signal);
    } finally {
      canvas.width = 0;
    }
  })();
}

async function captureSelectedTab(tabId, windowId, signal) {
  let switchedTabs = false;
  const onActivated = (tab) => {
    if (tab.windowId === windowId && tab.tabId !== tabId) switchedTabs = true;
  };
  async function checkActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    signal.throwIfAborted();
    if (switchedTabs || tab?.id !== tabId) throw new Error("image_read");
  }

  chrome.tabs.onActivated.addListener(onActivated);
  try {
    await checkActiveTab();
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    await checkActiveTab();
    return dataUrl;
  } catch (error) {
    signal.throwIfAborted();
    throw new Error("image_read", { cause: error });
  } finally {
    chrome.tabs.onActivated.removeListener(onActivated);
  }
}

async function captureCroppedRegion(tabId, windowId, rect, signal) {
  const dataUrl = await captureSelectedTab(tabId, windowId, signal);
  signal.throwIfAborted();

  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
    signal.throwIfAborted();
    const sx = Math.max(0, Math.round(rect.x * rect.dpr));
    const sy = Math.max(0, Math.round(rect.y * rect.dpr));
    const sw = Math.min(bitmap.width - sx, Math.round(rect.width * rect.dpr));
    const sh = Math.min(bitmap.height - sy, Math.round(rect.height * rect.dpr));
    if (sw <= 0 || sh <= 0) throw new Error("image_read");

    const scale = Math.min(1, 4096 / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return await canvasToBase64(canvas, signal);
  } finally {
    bitmap.close();
  }
}

export async function readPageImage({ tabId, windowId, frameId, source, page }, signal) {
  signal.throwIfAborted();
  let timeout;
  let abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    timeout = setTimeout(() => reject(new Error("image_read")), 12_000);
  });
  try {
    let missingReceiver = false;
    const response = await Promise.race([
      chrome.tabs
        .sendMessage(tabId, { type: "read-image-selection", source, page }, { frameId })
        .catch(() => {
          missingReceiver = true;
          return null;
        }),
      interrupted,
    ]);
    signal.throwIfAborted();
    if (typeof response?.base64 === "string") return response.base64;
    if (response?.code === "capture_visible" && response.rect && Number.isInteger(windowId)) {
      return await captureCroppedRegion(tabId, windowId, response.rect, signal);
    }
    throw new Error(response?.code ?? (missingReceiver ? "image_read_reload" : "image_read"));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
