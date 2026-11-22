const encoder = new TextEncoder();

export const CACHE_KEYS = Object.freeze(["cache_ocr", "cache_translation", "cache_languages"]);

export async function clearAllCaches() {
  const storage = globalThis.chrome?.storage?.session;
  if (!storage?.remove) return;
  await storage.remove([...CACHE_KEYS]);
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class SessionCache {
  #limit;
  #storageKey;
  #map = new Map();
  #hydrated = false;

  constructor(storageKey, limit = 30) {
    this.#storageKey = storageKey;
    this.#limit = limit;
  }

  async #hydrate() {
    if (this.#hydrated) return;
    this.#hydrated = true;
    const storage = globalThis.chrome?.storage?.session;
    if (!storage) return;
    try {
      const result = await storage.get(this.#storageKey);
      const entries = result?.[this.#storageKey];
      if (!Array.isArray(entries)) return;
      for (const entry of entries) {
        if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string") {
          this.#touch(entry[0], entry[1]);
        }
      }
    } catch {
      // Ignore unavailable session storage and keep in-memory cache working.
    }
  }

  #touch(key, value) {
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, value);
    while (this.#map.size > this.#limit) {
      const oldest = this.#map.keys().next().value;
      this.#map.delete(oldest);
    }
  }

  #persist() {
    const storage = globalThis.chrome?.storage?.session;
    if (!storage) return;
    void storage.set({ [this.#storageKey]: [...this.#map.entries()] }).catch(() => {});
  }

  reset() {
    this.#map.clear();
    this.#hydrated = false;
  }

  async clear() {
    this.#map.clear();
    this.#hydrated = true;
    const storage = globalThis.chrome?.storage?.session;
    if (!storage?.remove) return;
    await storage.remove(this.#storageKey);
  }

  async get(key) {
    await this.#hydrate();
    if (!this.#map.has(key)) return undefined;
    const value = this.#map.get(key);
    this.#touch(key, value);
    this.#persist();
    return value;
  }

  async set(key, value) {
    if (typeof value !== "string") return;
    await this.#hydrate();
    this.#touch(key, value);
    this.#persist();
  }
}
