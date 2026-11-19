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
      else if (typeof reader.result === "string") resolve(reader.result.slice(reader.result.indexOf(",") + 1));
      else reject(new Error("invalid_image"));
    };
    signal.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(file);
  });
}

export async function readPageImage({ tabId, frameId, source, page }, signal) {
  signal.throwIfAborted();
  let timeout;
  let abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    timeout = setTimeout(() => reject(new Error("image_read")), 12_000);
  });
  try {
    const response = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: "read-image-selection", source, page }, { frameId })
        .catch(() => null),
      interrupted
    ]);
    signal.throwIfAborted();
    if (typeof response?.base64 === "string") return response.base64;
    throw new Error(response?.code ?? "image_read");
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
