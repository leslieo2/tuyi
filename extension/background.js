import { getSettings, MAX_IMAGE_BASE64 } from "./config.js";
import { initI18n, t } from "./i18n.js";

const menuId = "recognize-and-translate";
const panels = new Map();
const pending = new Map();
const pendingKey = (windowId) => `pending_${windowId}`;

function savePending(windowId, entry) {
  pending.set(windowId, entry);
  void chrome.storage.session?.set({ [pendingKey(windowId)]: entry }).catch(() => {});
}

function clearPending(windowId) {
  pending.delete(windowId);
  void chrome.storage.session?.remove(pendingKey(windowId)).catch(() => {});
}

async function deliverPending(windowId, panel) {
  let entry = pending.get(windowId);
  if (!entry) {
    const key = pendingKey(windowId);
    const stored = await chrome.storage.session?.get(key).catch(() => null);
    entry = stored?.[key];
  }
  if (!entry || panels.get(windowId) !== panel || panel.receivedSelection) return;
  if (entry.expiresAt > Date.now() && !deliver(windowId, entry.message)) return;
  clearPending(windowId);
}

async function syncMenuTitle() {
  const { uiLanguage } = await getSettings().catch(() => ({ uiLanguage: "auto" }));
  await initI18n(uiLanguage);
  await chrome.contextMenus.update(menuId, { title: t("menuTitle") }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  void getSettings()
    .catch(() => ({ uiLanguage: "auto" }))
    .then(async ({ uiLanguage }) => {
      await initI18n(uiLanguage);
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: menuId, title: t("menuTitle"), contexts: ["image"] });
      });
    });
  void chrome.storage.local.remove("cloudConsent").catch(() => {});
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.uiLanguage) {
    void syncMenuTitle();
  }
});

function deliver(windowId, message) {
  const panel = panels.get(windowId);
  if (!panel) return false;
  try {
    panel.port.postMessage(message);
    panel.receivedSelection = true;
    return true;
  } catch {
    panels.delete(windowId);
    return false;
  }
}

export function openFromImage(info, tab) {
  if (info.menuItemId !== menuId || !Number.isInteger(tab?.id) || !Number.isInteger(tab.windowId))
    return;

  // Call in the context-menu gesture, before any asynchronous work.
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  const source = info.srcUrl;
  const message =
    typeof source !== "string" || !source || source.length > MAX_IMAGE_BASE64 + 128
      ? {
          type: "image-error",
          code: source?.length > MAX_IMAGE_BASE64 ? "image_size" : "image_read",
        }
      : {
          type: "image",
          source,
          page: info.frameUrl || info.pageUrl,
          tabId: tab.id,
          windowId: tab.windowId,
          frameId: info.frameId ?? 0,
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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "translator-panel" || port.sender?.url !== chrome.runtime.getURL("panel.html"))
    return;
  let windowId;
  const panel = { port, receivedSelection: false };
  port.onMessage.addListener((message) => {
    if (
      windowId !== undefined ||
      message?.type !== "ready" ||
      !Number.isInteger(message.windowId) ||
      message.windowId < 0
    )
      return;
    windowId = message.windowId;
    panels.set(windowId, panel);
    void deliverPending(windowId, panel);
  });
  port.onDisconnect.addListener(() => {
    if (panels.get(windowId) === panel) panels.delete(windowId);
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  panels.delete(windowId);
  clearPending(windowId);
});
