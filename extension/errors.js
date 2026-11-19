import { t } from "./i18n.js";

const knownCodes = new Set([
  "native_missing", "native_failed", "native_timeout", "invalid_request",
  "image_read", "image_read_reload", "image_size", "image_dimensions", "invalid_image",
  "ocr_language", "ocr_failed", "source_limit", "cloud_consent",
  "missing_key", "invalid_key", "keychain", "network", "request_timeout",
  "http_auth", "http_balance", "http_not_found", "http_rate", "http_server",
  "provider_error", "empty_translation", "incomplete_stream",
  "translation_truncated", "bad_response", "output_limit"
]);

export function errorText(code) {
  if (typeof code !== "string") return t("err_native_failed");
  if (knownCodes.has(code)) return t(`err_${code}`);
  if (/^http_[1-5][0-9]{2}$/.test(code)) return t("err_http_status", code.slice(5));
  return t("err_native_failed");
}
