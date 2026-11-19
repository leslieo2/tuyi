import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  DEFAULTS, normalizeApiBaseUrl, normalizeModel, normalizeSettings, targetLanguage, translationRequest
} from "../extension/config.js";
import { manifest, root } from "./helpers.mjs";

test("safe defaults and restrictive manifest", () => {
  assert.deepEqual(normalizeSettings(), { ...DEFAULTS, needsModeSelection: false });
  assert.equal(DEFAULTS.ocrLanguage, "auto");
  assert.equal(DEFAULTS.target, "zh-Hans");
  assert.equal(DEFAULTS.mode, "translate");
  assert.equal(Object.hasOwn(DEFAULTS, "cloudConsent"), false);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts, [{
    matches: ["http://*/*", "https://*/*"],
    js: ["image-selection.js"],
    run_at: "document_start",
    all_frames: true,
    match_origin_as_fallback: true
  }]);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.permissions.includes("scripting"), false);
});

test("native Identity.swift extensionOrigin matches manifest key", () => {
  const digest = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex");
  const expectedId = [...digest.slice(0, 32)]
    .map(ch => String.fromCharCode(97 + Number.parseInt(ch, 16)))
    .join("");
  const identity = readFileSync(resolve(root, "native/Identity.swift"), "utf8");
  assert.equal(identity.trim(), `let extensionOrigin = "chrome-extension://${expectedId}/"`);
});

test("canonical language tags reject injected instructions and malformed values", () => {
  for (const [input, expected] of [[" ZH-hans ", "zh-Hans"], ["en-us", "en-US"], ["ja", "ja"]]) {
    assert.equal(targetLanguage(input), expected);
  }
  for (const input of ["", "English (US)", "中文", "en_US", "en\nignore", "en-123456789", 9, null]) {
    assert.equal(targetLanguage(input), null);
  }
});

test("invalid persisted settings are sanitized and previous consent is ignored", () => {
  const settings = normalizeSettings({
    provider: "unknown", cloudConsent: true, target: "en-G",
    ocrLanguage: "auto\n", image: "discarded"
  });
  assert.deepEqual(settings, { ...DEFAULTS, mode: "ocr", needsModeSelection: true });
  assert.equal(Object.hasOwn(normalizeSettings({ cloudConsent: 1 }), "cloudConsent"), false);
  assert.equal(normalizeSettings({ ocrLanguage: "ja-JP" }).ocrLanguage, "ja-JP");
});

test("older recognition-only settings survive the mode change", () => {
  assert.equal(normalizeSettings({ provider: "ocr" }).mode, "ocr");
  assert.equal(normalizeSettings({ provider: "deepseek" }).mode, "translate");
  assert.equal(normalizeSettings({ provider: "ocr", mode: "translate" }).mode, "translate");
});

test("unrecognized modes cannot authorize cloud translation", () => {
  for (const input of [
    { provider: "ollama" }, { provider: "lmstudio" }, { mode: "local" },
    { mode: null, provider: "deepseek" }
  ]) {
    const settings = normalizeSettings(input);
    assert.equal(settings.mode, "ocr");
    assert.equal(settings.needsModeSelection, true);
    assert.throws(() => translationRequest(settings, "sample"), /cloud_consent/);
  }
});

test("each translation request carries target, endpoint, model, source text and per-request approval", () => {
  const settings = normalizeSettings({
    cloudConsent: 1, target: "en-us", apiBaseUrl: "https://api.openai.com/v1/", model: "gpt-4o-mini", image: "discarded"
  });
  assert.deepEqual(translationRequest(settings, "sample"), {
    command: "translate",
    target: "en-US",
    apiBaseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    text: "sample",
    cloudConsent: 1
  });
});

test("API base URL and model validation reject unsafe or malformed values", () => {
  assert.equal(normalizeApiBaseUrl("https://api.openai.com/v1/"), "https://api.openai.com/v1");
  assert.equal(normalizeApiBaseUrl("http://127.0.0.1:11434/v1/"), "http://127.0.0.1:11434/v1");
  assert.equal(normalizeApiBaseUrl("http://localhost:1234/v1"), "http://localhost:1234/v1");
  for (const bad of ["", "http://api.openai.com/v1", "https://user:pass@api.openai.com", "https://api.openai.com/#frag", "ftp://host"]) {
    assert.equal(normalizeApiBaseUrl(bad), null);
  }
  assert.equal(normalizeModel(" gpt-4o-mini "), "gpt-4o-mini");
  assert.equal(normalizeModel("qwen2.5:7b"), "qwen2.5:7b");
  for (const bad of ["", "   ", "gpt 4o", "gpt\n4o", "x".repeat(129)]) {
    assert.equal(normalizeModel(bad), null);
  }
});
