import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { readPageImage } from "../extension/image.js";

function event() {
  const listeners = new Set();
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    emit: (...args) => listeners.forEach((listener) => listener(...args)),
    listeners,
  };
}

test("screenshot fallback rejects the wrong active tab before and during capture", async (t) => {
  const onActivated = event();
  const windowId = 3;
  const tabId = 1;
  let activeTab = 2;
  let captures = 0;
  let duringCapture = () => {};
  globalThis.chrome = {
    tabs: {
      onActivated,
      async sendMessage() {
        return { code: "capture_visible", rect: { x: 0, y: 0, width: 2, height: 2, dpr: 1 } };
      },
      async query(query) {
        assert.deepEqual(query, { active: true, windowId });
        return [{ id: activeTab }];
      },
      async captureVisibleTab(id) {
        assert.equal(id, windowId);
        captures++;
        duringCapture();
        return "data:image/png;base64,YWJj";
      },
    },
  };
  t.after(() => delete globalThis.chrome);
  const decode = t.mock.method(globalThis, "fetch", async () => {});
  const read = () => readPageImage({ tabId, windowId, frameId: 0 }, new AbortController().signal);
  const activate = (id) => {
    activeTab = id;
    onActivated.emit({ windowId, tabId: id });
  };

  await assert.rejects(read, { message: "image_read" });
  assert.equal(captures, 0);

  activate(tabId);
  duringCapture = () => activate(2);
  await assert.rejects(read, { message: "image_read" });
  assert.equal(captures, 1);

  activate(tabId);
  duringCapture = () => {
    activate(2);
    activate(tabId);
  };
  await assert.rejects(read, { message: "image_read" });
  assert.equal(captures, 2);
  assert.equal(decode.mock.callCount(), 0);
  assert.equal(onActivated.listeners.size, 0);
});

test("the panel receives a stored selection only if live delivery has not superseded it", async (t) => {
  const onConnect = event();
  const onClicked = event();
  const finishReads = new Map();
  const removed = [];
  globalThis.chrome = {
    runtime: {
      onInstalled: event(),
      onConnect,
      getURL: (path) => `chrome-extension://test/${path}`,
    },
    contextMenus: { onClicked },
    windows: { onRemoved: event() },
    sidePanel: { open: async () => {} },
    storage: {
      onChanged: event(),
      session: {
        get(key) {
          return new Promise((resolve) => finishReads.set(key, resolve));
        },
        async remove(key) {
          removed.push(key);
        },
      },
    },
  };
  t.after(() => delete globalThis.chrome);
  await import("../extension/background.js");

  function ready(windowId) {
    const messages = [];
    const onMessage = event();
    onConnect.emit({
      name: "translator-panel",
      sender: { url: globalThis.chrome.runtime.getURL("panel.html") },
      onMessage,
      onDisconnect: event(),
      postMessage: (message) => messages.push(message),
    });
    onMessage.emit({ type: "ready", windowId });
    return messages;
  }

  const oldImage = { type: "image", source: "https://example.test/old.png", tabId: 1 };
  const newSource = "https://example.test/new.png";
  const live = ready(9);
  const queued = ready(10);
  onClicked.emit(
    { menuItemId: "recognize-and-translate", srcUrl: newSource },
    { id: 2, windowId: 9 },
  );
  for (const [key, finish] of finishReads) {
    finish({ [key]: { message: oldImage, expiresAt: Date.now() + 15_000 } });
  }
  await setImmediate();
  assert.deepEqual(
    live.map((message) => message.source),
    [newSource],
  );
  assert.deepEqual(queued, [oldImage]);
  assert.deepEqual(removed, ["pending_9", "pending_10"]);
});
