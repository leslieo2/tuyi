import { MAX_IMAGE_BASE64 } from "./config.js";

const menuId = "recognize-and-translate";
const panels = new Map();
const pending = new Map();
const pendingKey = windowId => `pending_${windowId}`;

function savePending(windowId, entry) {
  pending.set(windowId, entry);
  void chrome.storage.session?.set({ [pendingKey(windowId)]: entry }).catch(() => {});
}

function clearPending(windowId) {
  pending.delete(windowId);
  void chrome.storage.session?.remove(pendingKey(windowId)).catch(() => {});
}

async function takePending(windowId) {
  const cached = pending.get(windowId);
  if (cached) {
    clearPending(windowId);
    return cached.expiresAt > Date.now() ? cached.message : null;
  }
  const key = pendingKey(windowId);
  const stored = await chrome.storage.session?.get(key).catch(() => null);
  const entry = stored?.[key];
  if (!entry) return null;
  void chrome.storage.session?.remove(key).catch(() => {});
  return entry.expiresAt > Date.now() ? entry.message : null;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: menuId, title: "翻译图片中的内容", contexts: ["image"] });
  });
  void chrome.storage.local.remove("cloudConsent").catch(() => {});
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

function deliver(windowId, message) {
  const port = panels.get(windowId);
  if (!port) return false;
  try {
    port.postMessage(message);
    return true;
  } catch {
    panels.delete(windowId);
    return false;
  }
}

export function openFromImage(info, tab) {
  if (info.menuItemId !== menuId || !Number.isInteger(tab?.id) || !Number.isInteger(tab.windowId)) return;

  // Call in the context-menu gesture, before any asynchronous work.
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  const source = info.srcUrl;
  const message = typeof source !== "string" || !source || source.length > MAX_IMAGE_BASE64 + 128
    ? { type: "image-error", code: source?.length > MAX_IMAGE_BASE64 ? "image_size" : "image_read" }
    : {
        type: "image",
        source,
        page: info.frameUrl || info.pageUrl,
        tabId: tab.id,
        windowId: tab.windowId,
        frameId: info.frameId ?? 0
      };
  if (deliver(tab.windowId, message)) {
    clearPending(tab.windowId);
    return;
  }

  const id = crypto.randomUUID();
  const entry = { id, message, expiresAt: Date.now() + 15_000 };
  savePending(tab.windowId, entry);
  setTimeout(() => {
    if (pending.get(tab.windowId)?.id === id) clearPending(tab.windowId);
  }, 15_000);
}

chrome.contextMenus.onClicked.addListener(openFromImage);

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "translator-panel" || port.sender?.url !== chrome.runtime.getURL("panel.html")) return;
  let windowId;
  port.onMessage.addListener(message => {
    if (windowId !== undefined || message?.type !== "ready" ||
        !Number.isInteger(message.windowId) || message.windowId < 0) return;
    windowId = message.windowId;
    panels.set(windowId, port);
    void takePending(windowId).then(queued => {
      if (queued && panels.get(windowId) === port) deliver(windowId, queued);
    });
  });
  port.onDisconnect.addListener(() => {
    if (panels.get(windowId) === port) panels.delete(windowId);
  });
});

chrome.windows.onRemoved.addListener(windowId => {
  panels.delete(windowId);
  clearPending(windowId);
});
