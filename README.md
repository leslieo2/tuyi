# 图译 · Image Translator (`v1.0.6`)

A privacy-first Chrome extension for **macOS** that performs **on-device OCR** using Apple's `Vision` framework and optional streaming translation via **any OpenAI-compatible API** (DeepSeek, OpenAI, OpenRouter, or local Ollama / LM Studio), showing the recognized text and translation in Chrome's Side Panel. Available in **English** and **Simplified Chinese** (`_locales`).

> **macOS Only**
> This project **only supports macOS** (it does **not** work on Windows or Linux). Its native helper binary relies on Apple system frameworks—`Vision` (OCR), `ImageIO` (image decoding), `NaturalLanguage` (language detection), and `Security` (macOS Keychain).

## Requirements

| Requirement | Minimum Version | Notes |
| --- | --- | --- |
| **OS** | **macOS 13.0 (Ventura)** or newer | Required for `MACOSX_DEPLOYMENT_TARGET=13.0` and Apple Vision APIs |
| **Browser** | **Google Chrome 123** or newer | Required for MV3 Side Panel and Native Messaging |
| **Build Tools** | **Xcode Command Line Tools** | Run `xcode-select --install` if `swiftc` is missing |
| **Node.js** *(tests only)* | **Node.js 20+** | Only needed if you want to run the test suite |

## Current Features

- **Right-click web images**: Select **「翻译图片中的内容」** / **Translate Text in Image** to capture the displayed pixels, run local OCR, and stream the translation into the Side Panel. Handles stacked/lazy `<img>` elements and falls back to an `activeTab` visible-tab crop for cross-origin images without re-fetching the image URL.
- **Upload, drag-and-drop, or paste screenshots**: Drop an image onto the Side Panel, pick a file, click **Paste Image**, or paste a macOS region screenshot (`⌃⇧⌘4` + `⌘V`).
- **On-device OCR & OCR-only mode**: Text recognition runs locally on your Mac via Apple `Vision`. Switch to **OCR Only (「仅识别」)** at any time so nothing leaves your device.
- **Smart same-language skip**: Uses Apple's `NaturalLanguage` (`NLLanguageRecognizer`) locally to return recognized text directly without an API call when it already matches your target language (while keeping `zh-Hans` ↔ `zh-Hant` translation active).
- **19+ target languages**: Built-in dropdown for 19 common target languages plus custom BCP 47 language code entry (e.g., `en-US`, `pt-BR`).
- **OpenAI-compatible providers & local LLMs**: Defaults to DeepSeek (`deepseek-flash`), and supports any OpenAI-compatible HTTPS endpoint (OpenAI, OpenRouter, etc.) or local loopback server (`http://127.0.0.1:11434/v1` for Ollama, `http://127.0.0.1:1234/v1` for LM Studio) with configurable model names.
- **Bilingual UI (i18n)**: Follows Chrome's UI language (`en` / `zh_CN`) via `_locales` and lets you switch the interface language in Settings.
- **Session-only LRU cache**: Caches OCR results, translations, and supported Vision languages in memory / `chrome.storage.session` only—never persisted to disk.
- **System Keychain storage**: Your API key is stored in macOS Keychain (`Local Image Translator — DeepSeek (manual)`), never in Chrome extension storage. (Optional for unauthenticated local loopback endpoints.)

## Installation

1. **Clone the repository and install the native host:**

   ```sh
   git clone https://github.com/leslieo2/local-image-translator.git
   cd local-image-translator
   ./scripts/install.sh
   ```

   This compiles `native/*.swift` into `~/Library/Application Support/Local Image Translator/image-translator-host` and registers the Chrome Native Messaging manifest under `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`.

2. **Load the unpacked extension in Chrome:**
   - Open `chrome://extensions` and enable **Developer mode**.
   - Click **Load unpacked** and select the [`extension/`](extension) directory from this repository.
   - Whenever you update the extension, click **Reload** on the extension card and **refresh any open tabs**.

3. **Configure your translation service & API key:**
   - Click the extension icon to open the Side Panel, then open **Settings / 设置** to pick your target language, service URL, model, and API key.
   - Or store the API key from the terminal:

     ```sh
     ./scripts/set-deepseek-key.sh
     ```

   > **Note on rebuilding:** Recompiling `image-translator-host` changes its ad-hoc code signature, so macOS may prompt once for Keychain permission (**Always Allow**) after a native rebuild.

## Site Access & Privacy

- **Local OCR & language detection**: Images are decoded and recognized locally on macOS and are never uploaded.
- **Translation**: When translation is enabled, only the recognized text, target language tag, and translation instructions are sent to your configured translation endpoint.
- **No URL re-fetching**: Right-click reads only the already-rendered pixels from the active tab. You can restrict site access anytime in Chrome's extension details page and still use upload, drag-and-drop, or screenshot paste (`⌃⇧⌘4`).

## Project Structure

- [`extension/`](extension) — Chrome MV3 extension (service worker, content script, Side Panel, Options UI, i18n `_locales`, session cache)
- [`native/`](native) — Swift Native Messaging host (`Vision` OCR, `NaturalLanguage` detection, `Security` Keychain, `URLSession` streaming)
- [`scripts/`](scripts) — Build, install, Keychain CLI helper, test, and uninstall scripts
- [`tests/`](tests) — Node unit tests, native host integration tests, and isolated Chrome E2E tests
- [`SPEC.md`](SPEC.md) — Product specification (Chinese)
- [`IMPLEMENTATION.md`](IMPLEMENTATION.md) — Technical architecture and constraints (Chinese)

## Development & Testing

```sh
# Fast JS unit tests (config, protocol, session cache, i18n, extension ID check)
npm test

# Swift native host + Vision OCR + Keychain + loopback translation tests
npm run test:native

# Isolated headless Chrome E2E tests
npm run test:chrome

# Visible Chrome real context-menu E2E test (requires macOS Accessibility permission)
npm run test:chrome-menu
```

## Uninstall

1. Remove the extension from `chrome://extensions`.
2. Run the uninstall script:

   ```sh
   ./scripts/uninstall.sh
   # Or also remove the saved API key from macOS Keychain:
   ./scripts/uninstall.sh --delete-key
   ```

## License

[MIT](LICENSE)
