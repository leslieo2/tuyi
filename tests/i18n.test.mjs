import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { displayLocaleTag, initI18n, resolveUiLocale, t as translate } from "../extension/i18n.js";
import { root } from "./helpers.mjs";

function loadMessages(locale) {
  return JSON.parse(
    readFileSync(resolve(root, `extension/_locales/${locale}/messages.json`), "utf8"),
  );
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

test("overlapping locale loads cache each dictionary under its requested language", async (t) => {
  globalThis.chrome = { runtime: { getURL: (path) => path } };
  t.after(() => delete globalThis.chrome);
  const response = (locale) => ({ ok: true, json: async () => loadMessages(locale) });
  let finishEnglishLoad;
  const englishResponse = new Promise((complete) => {
    finishEnglishLoad = complete;
  });
  const fetchMessages = t.mock.method(globalThis, "fetch", async (url) =>
    url.includes("/en/") ? englishResponse : response("zh_CN"),
  );

  const englishLoad = initI18n("en");
  await initI18n("zh_CN");
  const chineseTitle = loadMessages("zh_CN").menuTitle.message;
  assert.equal(translate("menuTitle"), chineseTitle);

  finishEnglishLoad(response("en"));
  await englishLoad;
  assert.equal(translate("menuTitle"), chineseTitle);
  await initI18n("en");
  assert.equal(translate("menuTitle"), loadMessages("en").menuTitle.message);
  assert.equal(fetchMessages.mock.callCount(), 2);
});
