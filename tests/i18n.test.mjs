import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { displayLocaleTag, resolveUiLocale } from "../extension/i18n.js";
import { root } from "./helpers.mjs";

function loadMessages(locale) {
  return JSON.parse(readFileSync(resolve(root, `extension/_locales/${locale}/messages.json`), "utf8"));
}

test("zh_CN and en locale message files define identical keys", () => {
  const zh = loadMessages("zh_CN");
  const en = loadMessages("en");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const [key, entry] of Object.entries(zh)) {
    assert.equal(typeof entry.message, "string", `zh_CN.${key} must be a string`);
    assert.ok(entry.message.length > 0, `zh_CN.${key} must be non-empty`);
    assert.equal(typeof en[key].message, "string", `en.${key} must be a string`);
    assert.ok(en[key].message.length > 0, `en.${key} must be non-empty`);
  }
});

test("resolveUiLocale and displayLocaleTag map browser locales and explicit overrides", () => {
  assert.equal(resolveUiLocale("zh_CN"), "zh_CN");
  assert.equal(resolveUiLocale("en"), "en");
  assert.equal(displayLocaleTag("zh_CN"), "zh-CN");
  assert.equal(displayLocaleTag("en"), "en");
  globalThis.chrome = { i18n: { getUILanguage: () => "en-US" } };
  assert.equal(resolveUiLocale("auto"), "en");
  globalThis.chrome = { i18n: { getUILanguage: () => "zh-CN" } };
  assert.equal(resolveUiLocale("auto"), "zh_CN");
  delete globalThis.chrome;
});
