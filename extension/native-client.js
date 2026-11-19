import { HOST, MAX_TRANSLATION_BYTES } from "./config.js";

const terminals = {
  languages: "languages", ocr: "ocr", translate: "done",
  key_status: "key_status", set_key: "key_status"
};

export function nativeRequest(request, { signal, onDelta = () => {} } = {}) {
  const { command } = request;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    let port;
    try {
      port = chrome.runtime.connectNative(HOST);
    } catch {
      reject(new Error("native_missing"));
      return;
    }

    let settled = false;
    let outputBytes = 0;
    const encoder = new TextEncoder();
    const onAbort = () => finish(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(
      () => finish(new Error("native_timeout")),
      command === "translate" ? 145_000 : command === "ocr" ? 60_000 : 15_000
    );

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      port.disconnect();
      if (error) reject(error);
      else resolve(value);
    }

    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message ?? "";
      const missing = /not found|forbidden|access.*denied|failed to start/i.test(error);
      finish(new Error(missing ? "native_missing" : "native_failed"));
    });
    port.onMessage.addListener(message => {
      if (settled) return;
      if (!message || message.v !== 1) {
        finish(new Error("native_failed"));
        return;
      }
      if (message.type === "error" && typeof message.code === "string") {
        finish(new Error(message.code));
      } else if (message.type === "delta" && command === "translate" && typeof message.text === "string") {
        outputBytes += encoder.encode(message.text).byteLength;
        if (outputBytes > MAX_TRANSLATION_BYTES) finish(new Error("output_limit"));
        else onDelta(message.text);
      } else if (message.type === terminals[command]) {
        const valid = message.type === "done" ||
          (message.type === "key_status" && typeof message.configured === "boolean") ||
          (message.type === "ocr" && typeof message.text === "string") ||
          (message.type === "languages" && Array.isArray(message.languages) &&
            message.languages.every(language => typeof language === "string"));
        if (valid) finish(null, message);
        else finish(new Error("native_failed"));
      } else {
        finish(new Error("native_failed"));
      }
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      port.postMessage({ ...request, v: 1 });
    } catch {
      finish(new Error("native_failed"));
    }
  });
}
