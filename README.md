# 图译 · Image Translator

A privacy-first Chrome extension for **macOS** that performs **on-device OCR** using Apple's `Vision` framework and optional streaming translation via **DeepSeek**, showing the recognized text and translation in Chrome's Side Panel.

> **macOS Only**
> This project **only supports macOS** (it does **not** work on Windows or Linux). Its native helper binary relies on Apple system frameworks—`Vision` (OCR), `ImageIO` (image decoding), `NaturalLanguage` (language detection), and `Security` (macOS Keychain).

## Requirements

| Requirement | Minimum Version | Notes |
| --- | --- | --- |
| **OS** | **macOS 13.0 (Ventura)** or newer | Required for `MACOSX_DEPLOYMENT_TARGET=13.0` and Apple Vision APIs |
| **Browser** | **Google Chrome 123** or newer | Required for MV3 Side Panel and Native Messaging |
| **Build Tools** | **Xcode Command Line Tools** | Run `xcode-select --install` if `swiftc` is missing |
| **Node.js** *(tests only)* | **Node.js 20+** | Only needed if you want to run the test suite |

## Features

- **Right-click web images**: Select **「翻译图片中的内容」** to capture the displayed pixels, run local OCR, and stream the translation into the Side Panel. Includes an `activeTab` visible-tab crop fallback for cross-origin images without re-fetching the image URL.
- **Upload, drag-and-drop, or paste screenshots**: Drop an image, pick a file, or paste a macOS region screenshot (`⌃⇧⌘4`) directly into the Side Panel.
- **On-device OCR & OCR-only mode**: Text recognition runs locally on your Mac via Apple `Vision`. You can switch to **OCR-only (「仅识别」)** mode at any time so nothing leaves your device.
- **Smart same-language skip**: Uses Apple's `NaturalLanguage` (`NLLanguageRecognizer`) locally to avoid unnecessary API calls when the recognized text already matches your target language (while keeping `zh-Hans` ↔ `zh-Hant` active).
- **Session-only LRU cache**: Caches OCR results, translations, and supported Vision languages in memory / `chrome.storage.session` only—never persisted to disk.
- **System Keychain storage**: Your DeepSeek API key is stored in macOS Keychain (`Local Image Translator — DeepSeek (manual)`), never in Chrome extension storage.

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

3. **Configure your DeepSeek API key (for translation mode):**
   - Click the extension icon to open the Side Panel, then open **设置** (Options) and enter your DeepSeek API key.
   - Or store it from the terminal:

     ```sh
     ./scripts/set-deepseek-key.sh
     ```

   > **Note on rebuilding:** Recompiling `image-translator-host` changes its ad-hoc code signature, so macOS may prompt once for Keychain permission (**Always Allow**) after a native rebuild.

## Site Access & Privacy

- **Local OCR**: Images are decoded and recognized locally on macOS and are never uploaded.
- **Translation**: When translation is enabled, only the recognized text, target language tag, and translation instructions are sent to `https://api.deepseek.com/chat/completions`.
- **No URL re-fetching**: Right-click reads only the already-rendered pixels from the active tab. You can restrict site access anytime in Chrome's extension details page and still use upload, drag-and-drop, or screenshot paste (`⌃⇧⌘4`).

## Project Structure

- [`extension/`](extension) — Chrome MV3 extension (service worker, content script, Side Panel, Options UI, session cache)
- [`native/`](native) — Swift Native Messaging host (`Vision` OCR, `NaturalLanguage` detection, `Security` Keychain, `URLSession` streaming)
- [`scripts/`](scripts) — Build, install, Keychain CLI helper, test, and uninstall scripts
- [`tests/`](tests) — Node unit tests, native host integration tests, and isolated Chrome E2E tests
- [`SPEC.md`](SPEC.md) — Product specification (Chinese)
- [`IMPLEMENTATION.md`](IMPLEMENTATION.md) — Technical architecture and constraints (Chinese)

## Development & Testing

```sh
# Fast JS unit tests (config, protocol, session cache, extension ID check)
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
   # Or also remove the saved DeepSeek API key from macOS Keychain:
   ./scripts/uninstall.sh --delete-key
   ```

## License

[MIT](LICENSE)
