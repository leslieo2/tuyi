# Tuyi (图译)

A privacy-first Chrome extension for **macOS** that recognizes text inside images locally on your Mac and translates it in Chrome's Side Panel.

> **macOS Only**
> Tuyi requires **macOS 26 (Tahoe) or later** on Apple Silicon or Intel and **Google Chrome 123+**.

## Features

- **Right-click any webpage image**: Select **Translate Text in Image** to extract text locally and stream the translation into the Side Panel.
- **Upload, drag & drop, or paste screenshots**: Drop an image onto the panel, pick a file, click **Paste Image**, or paste a macOS screenshot (`⌃⇧⌘4` + `⌘V`).
- **Layout-aware text recognition** groups wrapped lines into paragraphs and reads columns and vertical Chinese and Japanese in reading order.
- **OCR-only mode**: Extract text completely offline without sending anything off your Mac.
- **Smart same-language detection**: Automatically skips external translation when the recognized text already matches your target language.
- **Flexible translation service**: Works out of the box with DeepSeek, and supports any OpenAI-compatible service (OpenAI, OpenRouter, or local servers like Ollama / LM Studio).
- **19+ target languages & bilingual UI**: Choose from 19 preset languages or enter any language code. Interface available in **English** and **Simplified Chinese**.

## Installation (macOS)

### Option A: Homebrew (Recommended)

1. Install the native helper and extension files via Homebrew:

   ```sh
   brew tap leslieo2/tap
   brew trust leslieo2/tap
   brew install --cask leslieo2/tap/tuyi
   ```

2. Load the extension in Google Chrome _(first time only)_:
   - Open `chrome://extensions` and turn on **Developer mode** (top right).
   - Click **Load unpacked**.
   - In the macOS file dialog, press `⇧⌘G`, paste the fixed path below, and press **Return**:

     ```text
     ~/Library/Application Support/Local Image Translator/extension
     ```

3. _(Optional, for translation)_ Click the extension icon in Chrome's toolbar → **Settings**, choose your translation service/model, and save your API key.

**Updating with Homebrew:**

```sh
brew upgrade --cask tuyi
```

Then click **Reload** on the Tuyi card in `chrome://extensions` and refresh any open tabs (no need to re-select the folder).

### Option B: Manual Release Download

1. Download the latest `tuyi-v*-macos.zip` from [**Releases**](https://github.com/leslieo2/tuyi/releases) and unzip it.
2. Run `./scripts/install.sh` inside the unzipped folder.
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select:

   ```text
   ~/Library/Application Support/Local Image Translator/extension
   ```

> **Note:** If macOS asks for Keychain permission after updating the native helper, enter your login password and choose **Always Allow**.

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
2. If installed via Homebrew:

   ```sh
   brew uninstall --cask tuyi
   ```

   _(To also remove a saved API key from macOS Keychain, run `security delete-generic-password -s com.local_image_translator.deepseek` or `./scripts/uninstall.sh --delete-key` from the source/release folder.)_

## Developers & License

Want to build from source, run the test suite, or inspect the architecture? See [CONTRIBUTING.md](CONTRIBUTING.md), [SPEC.md](SPEC.md), and [IMPLEMENTATION.md](IMPLEMENTATION.md).

Released under the [MIT License](LICENSE).
