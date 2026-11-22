import assert from "node:assert/strict";
import { test } from "node:test";
import { createDiagnosticsStore } from "../extension/diagnostics.js";

function fakeLogger() {
  const entries = [];
  return {
    entries,
    info(message, details) {
      entries.push({ level: "info", message, details });
    },
    warn(message, details) {
      entries.push({ level: "warn", message, details });
    },
    error(message, details) {
      entries.push({ level: "error", message, details });
    },
  };
}

test("diagnostics store records session metadata and strips sensitive fields", () => {
  const logger = fakeLogger();
  const store = createDiagnosticsStore({ maxHistory: 2, logger });
  const run = store.startRun({
    trigger: "context-menu",
    settings: {
      mode: "translate",
      ocrLanguage: "auto",
      target: "zh-Hans",
      apiBaseUrl: "https://api.deepseek.com",
      model: "deepseek-flash",
      apiKey: "sk-secret-must-not-appear",
    },
  });
  store.recordImage(run, {
    source: "context-menu",
    bytes: 12345,
    image: "base64-secret",
    durationMs: 12,
  });
  store.recordOcr(run, {
    cacheHit: false,
    language: "auto",
    lineCount: 2,
    charCount: 40,
    text: "Xin chào",
    durationMs: 80,
  });
  store.recordTranslation(run, {
    cacheHit: false,
    route: "api",
    target: "zh-Hans",
    detectedLanguage: "vi",
    detectedConfidence: 1,
    httpStatus: 200,
    finishReason: "stop",
    sameAsOriginal: false,
    authorization: "Bearer secret",
    translation: "你好",
  });
  store.finishRun(run, "done");

  const report = store.formatReport();
  assert.doesNotMatch(report, /sk-secret|base64-secret|Xin chào|Bearer secret|你好/);
  const parsed = JSON.parse(report);
  assert.equal(parsed.outcome, "done");
  assert.equal(parsed.ocr.charCount, 40);
  assert.equal(parsed.translation.detectedLanguage, "vi");
  assert.equal(parsed.translation.httpStatus, 200);
  assert.equal(typeof parsed.totalDurationMs, "number");

  const summary = store.formatSummary(
    store.latest(),
    (key) =>
      ({
        diagRouteApi: "API",
        diagRouteLocalSkip: "Local skip",
        diagRouteCache: "Cache",
        diagRouteOcrOnly: "OCR",
        diagUnchanged: "Unchanged",
      })[key] ?? key,
  );
  assert.match(summary, /^API · vi → zh-Hans · \d+ms$/);
});

test("diagnostics warns when API output matches original verbatim and respects ring buffer & clear", () => {
  const logger = fakeLogger();
  const store = createDiagnosticsStore({ maxHistory: 2, logger });

  const r1 = store.startRun({ trigger: "upload" });
  store.recordTranslation(r1, {
    route: "api",
    target: "zh-Hans",
    detectedLanguage: "vi",
    sameAsOriginal: true,
  });
  store.finishRun(r1, "done");
  assert.ok(
    logger.entries.some((entry) => entry.level === "warn" && /verbatim/.test(entry.message)),
  );
  assert.match(
    store.formatSummary(r1, (key) => key),
    /diagUnchanged/,
  );

  const r2 = store.startRun({ trigger: "retry" });
  store.finishRun(r2, "error", { code: "http_auth", stage: "translate" });
  assert.ok(logger.entries.some((entry) => entry.level === "error"));
  assert.match(
    store.formatSummary(r2, (key) => key),
    /error: http_auth/,
  );

  const r3 = store.startRun({ trigger: "paste" });
  store.recordOcr(r3, { cacheHit: true, language: "auto", charCount: 10 });
  store.finishRun(r3, "done");
  assert.equal(store.history().length, 2);
  assert.equal(store.latest().id, 3);

  store.clear();
  assert.equal(store.latest(), null);
  assert.equal(store.formatReport(), "");
});
