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
  #hydration;

  constructor(storageKey, limit = 30) {
    this.#storageKey = storageKey;
    this.#limit = limit;
  }

  #hydrate() {
    return (this.#hydration ??= this.#loadEntries());
  }

  async #loadEntries() {
    const storage = globalThis.chrome?.storage?.session;
    if (!storage) return;
    const map = this.#map;
    try {
      const result = await storage.get(this.#storageKey);
      const entries = result?.[this.#storageKey];
      if (map !== this.#map || !Array.isArray(entries)) return;
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
    // Replacing the map lets pending operations detect that they have been invalidated.
    this.#map = new Map();
    this.#hydration = undefined;
  }

  async clear() {
    this.reset();
    const removal = globalThis.chrome?.storage?.session?.remove?.(this.#storageKey);
    this.#hydration = Promise.resolve(removal).catch(() => {});
    await removal;
  }

  async get(key) {
    const map = this.#map;
    await this.#hydrate();
    if (map !== this.#map || !map.has(key)) return undefined;
    const value = map.get(key);
    this.#touch(key, value);
    this.#persist();
    return value;
  }

  async set(key, value) {
    if (typeof value !== "string") return;
    const map = this.#map;
    await this.#hydrate();
    if (map !== this.#map) return;
    this.#touch(key, value);
    this.#persist();
  }
}
