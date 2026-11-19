import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionCache, sha256 } from "../extension/cache.js";

test("sha256 produces deterministic hex digests", async () => {
  const first = await sha256("sample-image-data");
  const second = await sha256("sample-image-data");
  const other = await sha256("different-image-data");
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("SessionCache enforces LRU eviction and hydrates from session storage", async () => {
  const store = new Map();
  globalThis.chrome = {
    storage: {
      session: {
        async get(key) { return { [key]: store.get(key) }; },
        async set(values) {
          for (const [k, v] of Object.entries(values)) store.set(k, v);
        }
      }
    }
  };

  const cache = new SessionCache("test_cache", 2);
  await cache.set("a", "one");
  await cache.set("b", "two");
  assert.equal(await cache.get("a"), "one"); // refreshes "a", so "b" is oldest
  await cache.set("c", "three");
  assert.equal(await cache.get("b"), undefined);
  assert.equal(await cache.get("a"), "one");
  assert.equal(await cache.get("c"), "three");

  const rehydrated = new SessionCache("test_cache", 2);
  assert.equal(await rehydrated.get("a"), "one");
  assert.equal(await rehydrated.get("c"), "three");
  delete globalThis.chrome;
});
