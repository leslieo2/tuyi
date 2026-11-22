const SENSITIVE_KEYS = new Set([
  "apiKey",
  "authorization",
  "key",
  "token",
  "text",
  "original",
  "rawImage",
  "base64",
]);

function sanitize(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitize).filter((item) => item !== undefined);
  const clean = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key) || entry === undefined || entry === null) continue;
    if ((key === "image" || key === "translation") && typeof entry === "string") continue;
    const sanitized = sanitize(entry);
    if (sanitized !== undefined) clean[key] = sanitized;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function createDiagnosticsStore({ maxHistory = 10, logger = console } = {}) {
  let nextId = 0;
  let runs = [];

  function log(level, event, details) {
    const fn = logger?.[level] ?? logger?.log;
    if (typeof fn === "function") fn.call(logger, `[Tuyi] ${event}`, details);
  }

  function startRun({ trigger = "unknown", settings } = {}) {
    nextId += 1;
    const run = {
      id: nextId,
      startedAt: new Date().toISOString(),
      _startedMs: nowMs(),
      trigger,
      outcome: "running",
      settings: settings
        ? sanitize({
            mode: settings.mode,
            ocrLanguage: settings.ocrLanguage,
            target: settings.target,
            apiBaseUrl: settings.apiBaseUrl,
            model: settings.model,
          })
        : undefined,
      image: undefined,
      ocr: undefined,
      translation: undefined,
      error: undefined,
      totalDurationMs: undefined,
    };
    runs = [run, ...runs].slice(0, maxHistory);
    log("info", `run #${run.id} started (${trigger})`, sanitize({ settings: run.settings }));
    return run;
  }

  function recordImage(run, info) {
    if (!run) return;
    run.image = sanitize(info);
    log("info", `run #${run.id} image`, run.image);
  }

  function recordOcr(run, info) {
    if (!run) return;
    run.ocr = sanitize(info);
    log("info", `run #${run.id} ocr`, run.ocr);
  }

  function recordTranslation(run, info) {
    if (!run) return;
    run.translation = sanitize(info);
    if (run.translation?.route === "api" && run.translation?.sameAsOriginal === true) {
      log("warn", `run #${run.id} translation matched original text verbatim`, run.translation);
    } else {
      log("info", `run #${run.id} translation`, run.translation);
    }
  }

  function finishRun(run, outcome, errorInfo) {
    if (!run) return;
    run.outcome = outcome;
    run.totalDurationMs = Math.max(0, Math.round(nowMs() - run._startedMs));
    if (errorInfo) run.error = sanitize(errorInfo);
    const summary = sanitize({
      outcome: run.outcome,
      totalDurationMs: run.totalDurationMs,
      error: run.error,
    });
    if (outcome === "error") {
      log("error", `run #${run.id} failed`, summary);
    } else if (outcome === "cancelled") {
      log("info", `run #${run.id} cancelled`, summary);
    } else {
      log("info", `run #${run.id} ${outcome}`, summary);
    }
  }

  function toPublicRun(run) {
    if (!run) return null;
    return sanitize({
      id: run.id,
      startedAt: run.startedAt,
      trigger: run.trigger,
      outcome: run.outcome,
      totalDurationMs: run.totalDurationMs,
      settings: run.settings,
      image: run.image,
      ocr: run.ocr,
      translation: run.translation,
      error: run.error,
    });
  }

  function latest() {
    return runs[0] ?? null;
  }

  function history() {
    return runs.map(toPublicRun);
  }

  function clear() {
    runs = [];
  }

  function formatSummary(run, translateLabel = (key) => key) {
    if (!run) return "";
    const parts = [];
    if (run.outcome === "error") {
      parts.push(run.error?.code ? `error: ${run.error.code}` : "error");
    } else if (run.translation) {
      if (run.translation.cacheHit) {
        parts.push(translateLabel("diagRouteCache"));
      } else if (run.translation.route === "local_skip") {
        parts.push(translateLabel("diagRouteLocalSkip"));
      } else if (run.translation.route === "api") {
        parts.push(translateLabel("diagRouteApi"));
      }
      const detected = run.translation.nonTargetLineLanguage || run.translation.detectedLanguage;
      const target = run.translation.target || run.settings?.target;
      if (detected && target) parts.push(`${detected} → ${target}`);
      else if (target) parts.push(target);
      if (run.translation.httpStatus && run.translation.httpStatus !== 200) {
        parts.push(`HTTP ${run.translation.httpStatus}`);
      }
      if (run.translation.sameAsOriginal && run.translation.route === "api") {
        parts.push(translateLabel("diagUnchanged"));
      }
    } else if (run.ocr) {
      parts.push(translateLabel("diagRouteOcrOnly"));
      if (run.ocr.language) parts.push(run.ocr.language);
    }
    if (typeof run.totalDurationMs === "number") {
      parts.push(`${run.totalDurationMs}ms`);
    }
    return parts.join(" · ");
  }

  function formatReport(run = latest()) {
    const publicRun = toPublicRun(run);
    if (!publicRun) return "";
    return JSON.stringify(publicRun, null, 2);
  }

  return {
    startRun,
    recordImage,
    recordOcr,
    recordTranslation,
    finishRun,
    latest,
    history,
    clear,
    formatSummary,
    formatReport,
  };
}
