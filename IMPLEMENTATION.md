# Technical Specification & Implementation

## Technical Stack

Targets **macOS 13.0+** and **Google Chrome 123+** using Manifest V3. On-device OCR uses **Apple Vision**, language detection uses **Apple NaturalLanguage**, image decoding uses **ImageIO**, translation supports any **OpenAI-compatible Chat Completions** endpoint (defaulting to DeepSeek), and API key storage uses **macOS Keychain**. The browser extension communicates with the Swift native helper via **Chrome Native Messaging**; production host processes are launched per request.

## Module Responsibilities

| Module | Responsibility |
| --- | --- |
| `extension/background.js` | Registers the image context menu, keeps its title synced with the UI language, opens the Side Panel, and routes `tabId`, `windowId`, `frameId`, and `srcUrl` per window. Pending messages awaiting panel connection are held in memory and `chrome.storage.session`. |
| `extension/image-selection.js`, `extension/image.js` | Content script records `<img>` candidates under trusted `contextmenu` events. When the panel requests `read-image-selection`, it matches the clicked `currentSrc` and draws to Canvas (exporting PNG, falling back to JPEG at 0.92 quality if PNG exceeds 8 MiB). If cross-origin restrictions taint the Canvas, it returns visible viewport bounds so `image.js` crops a `chrome.tabs.captureVisibleTab` capture via `activeTab`. Uploads, drops, and pastes read user-provided files directly. |
| `extension/panel.js`, `extension/cache.js` | Manages active jobs, streaming updates, cancellation, drag-and-drop/clipboard paste, and a SHA-256 session-only LRU cache (`Map` + `chrome.storage.session`, never persisted to disk). Loads settings once per job start. Clicking **Translate Text** manually bypasses the translation cache to request a fresh result. |
| `extension/options.js`, `extension/config.js` | Validates and persists user preferences (`mode`, 19 preset target languages plus custom BCP 47 tag, `ocrLanguage`, `uiLanguage`, service/model presets or custom HTTPS/loopback HTTP `apiBaseUrl` and `model`), and invokes `test_connection` to verify endpoints. Preserves backward compatibility with legacy `provider` (`deepseek` / `ocr`) and falls back to OCR-only if unrecognized. |
| `extension/i18n.js`, `extension/_locales/` | Provides `en` and `zh_CN` locale bundles and runtime UI localization. |
| `extension/native-client.js`, `native/Protocol.swift` | Exchanges versioned (`v: 1`) length-prefixed JSON messages over stdio. OCR, key management, and translation use separate commands; key commands return configuration status only. |
| `native/Host.swift`, `native/VisionOCR.swift` | Validates caller origin, message framing, image format/dimensions, decodes orientation-aware thumbnails via ImageIO, and runs `VNRecognizeTextRequest`. Exits immediately when Chrome closes stdin. |
| `native/Translation.swift` | Checks `NLLanguageRecognizer` before calling the network (skips when ≥ 6 non-whitespace chars match `target` at ≥ 0.90 confidence, keeping `zh-Hans` ↔ `zh-Hant` active). Reads key from Keychain (optional for loopback HTTP), validates endpoint/model, refuses HTTP redirects, handles `test_connection` probes and streaming SSE deltas, and includes DeepSeek's `thinking` toggle only for DeepSeek endpoints/models. |
| `native/Keychain.swift`, `scripts/` | Stores/reads the API key in macOS Keychain under service `com.local_image_translator.deepseek` (`manual-api-key`), and provides build, install, release packaging, Keychain CLI, test, and uninstall scripts. |

The Chrome Native Messaging manifest restricts `allowed_origins` to the extension's fixed ID, and the native binary checks Chrome's origin argument on startup. Production translation requests allow only HTTPS or loopback HTTP (`127.0.0.1`, `localhost`, `::1`) and refuse HTTP redirects. Only test builds (`-D IMAGE_TRANSLATOR_TEST`) accept `IMAGE_TRANSLATOR_TEST_PORT` and isolated test Keychain accounts.

## Permissions

| Permission | Purpose |
| --- | --- |
| `activeTab` | After a context-menu click, allows `chrome.tabs.captureVisibleTab` to crop cross-origin images that cannot be exported from Canvas |
| `contextMenus` | Adds the right-click entry on webpage images |
| `sidePanel` | Opens the Side Panel |
| Content scripts on `http://*/*`, `https://*/*` (`all_frames`, `match_origin_as_fallback`) | Chrome menu click events supply only the image URL and page info; the content script listens for trusted `contextmenu` events to identify the exact displayed `<img>` |
| `nativeMessaging` | Launches and communicates with the Swift native host |
| `storage` | Persists user preferences (`chrome.storage.local`) and temporary session state (`chrome.storage.session`) |

## Boundaries & Limits

- The content script records `WeakRef` image candidates only on trusted `contextmenu` events, draws pixels only on read, releases the canvas immediately afterward, and clears pending selections on `pointerdown`, `keydown`, `pagehide`, or after 30 seconds. Image URLs are never re-fetched.
- Input images are limited to **8 MiB**, **40 million pixels**, and **12,000 px** per side. Before Vision OCR, images are downscaled so the longest edge is at most **4,096 px**. Page snapshots encode as PNG and fall back to JPEG if over 8 MiB; uploads/pastes support PNG, JPEG, WebP, GIF, TIFF, BMP, HEIC, HEIF, and AVIF (first frame).
- Timeouts: page image read ~12 s, OCR ~60 s, HTTP request idle ~35 s, HTTP resource ~120 s (host alarm 150 s). Limits: source text **16 KiB**, translated output **48 KiB**, `max_tokens: 4096`.
- `scripts/install.sh` registers the host manifest in Google Chrome's default user data directory; custom `--user-data-dir` profiles require copying the manifest into that profile's `NativeMessagingHosts/`.

## Verification

| Command | Coverage |
| --- | --- |
| `npm test` | Defaults, legacy migration, language/URL/model validation, extension ID consistency, session LRU cache, `en`/`zh_CN` i18n parity, and native client framing |
| `npm run test:native` | Real `en`, `zh`, `ja`, and blank image OCR; protocol validation; same-language local skip; OpenAI-compatible payload; size limits; missing key; cancellation; and HTTP error handling |
| `npm run test:chrome` | Isolated Chrome E2E: Settings, Keychain test item, upload, paste, mode switching, cancellation, retry, and streaming UI |
| `npm run test:chrome-menu` | Visible Chrome real OS context-menu E2E verifying rendered pixels (not re-fetched URLs) are sent to translation (requires macOS Accessibility permission) |
| `npm run test:deepseek -- --approved-synthetic` | Manual single-shot live check against DeepSeek with a configured key |

[Apple Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images) · [Apple NaturalLanguage](https://developer.apple.com/documentation/naturallanguage) · [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) · [Chrome Context Menus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus#type-OnClickData) · [Chrome Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
