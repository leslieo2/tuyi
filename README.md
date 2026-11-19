# Image Translator

A privacy-first Chrome extension for **macOS** that recognizes text inside images locally on your Mac and translates it in Chrome's Side Panel.

> **macOS Only**
> This extension **only works on macOS 13.0 (Ventura) or newer** (Apple Silicon and Intel) with **Google Chrome 123+**. It does **not** support Windows or Linux because text recognition, language detection, and API key storage run natively via macOS system frameworks.

## Features

- **Right-click any webpage image**: Select **Translate Text in Image** to extract text locally and stream the translation into the Side Panel.
- **Upload, drag & drop, or paste screenshots**: Drop an image onto the panel, pick a file, click **Paste Image**, or paste a macOS screenshot (`⌃⇧⌘4` + `⌘V`).
- **OCR-only mode**: Extract text completely offline without sending anything off your Mac.
- **Smart same-language detection**: Automatically skips external translation when the recognized text already matches your target language.
- **Flexible translation service**: Works out of the box with DeepSeek, and supports any OpenAI-compatible service (OpenAI, OpenRouter, or local servers like Ollama / LM Studio).
- **19+ target languages & bilingual UI**: Choose from 19 preset languages or enter any language code. Interface available in **English** and **Simplified Chinese**.

## Installation (macOS)

1. Download the latest `image-translator-v*-macos.zip` from the [**Releases**](https://github.com/leslieo2/local-image-translator/releases) page and unzip it.
2. Open **Terminal** in the unzipped folder and register the macOS helper:

   ```sh
   ./scripts/install.sh
   ```

3. Load the extension in Chrome:
   - Open `chrome://extensions` and turn on **Developer mode** (top right).
   - Click **Load unpacked** and select the **`extension`** folder inside the unzipped directory.

4. *(Optional, for translation)* Click the extension icon in Chrome's toolbar → **Settings**, choose your translation service/model, and save your API key.

> **Tip:** When updating to a new release, re-run `./scripts/install.sh`, click **Reload** on the extension card in `chrome://extensions`, and refresh any open tabs. If macOS asks for Keychain permission after updating the native helper, enter your login password and choose **Always Allow**.

## How to Use

- **Webpage images**: Right-click an image and choose **Translate Text in Image**.
- **Local images or screenshots**: Open the Side Panel from Chrome's toolbar, then drag & drop an image, click **Upload Image**, or press `⌃⇧⌘4` to capture a screen region and paste (`⌘V`) into the panel. Click **Translate Text** when ready.
- **OCR only**: Open **Settings** and switch **Mode** to **OCR Only**.

## Privacy

- **Images stay on your Mac**: Image decoding and OCR happen locally; images are never uploaded.
- **Minimal data sent**: Only when you trigger translation is the recognized text sent to your configured translation endpoint.
- **No disk history**: Images, recognized text, and translations stay in memory only for your current browser session; your API key is stored in macOS Keychain.

## Uninstall

1. Remove the extension from `chrome://extensions`.
2. In the unzipped folder, run:

   ```sh
   ./scripts/uninstall.sh
   # To also delete the saved API key from macOS Keychain:
   ./scripts/uninstall.sh --delete-key
   ```

## Developers & License

Want to build from source, run the test suite, or inspect the architecture? See [CONTRIBUTING.md](CONTRIBUTING.md), [SPEC.md](SPEC.md), and [IMPLEMENTATION.md](IMPLEMENTATION.md).

Released under the [MIT License](LICENSE).
