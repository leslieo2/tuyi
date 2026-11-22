# Product Specification

## Intent

In Google Chrome on macOS, when a user sees an image containing foreign-language text, they can right-click it once to translate its content and read both the recognized source text and the translation in the Side Panel. When a webpage image's pixels cannot be exported directly, the extension captures the visible area or lets the user upload, drag and drop, or paste an image or screenshot for the same result.

## User Flows & Acceptance Criteria

| Scenario | Expected Behavior |
| --- | --- |
| Right-click webpage image | The context menu displays **Translate Text in Image** (or **翻译图片中的内容** in Simplified Chinese). Selecting it opens the Side Panel and starts a job using the image pixels displayed at the time of the right-click—subsequent responses from the same URL must not replace that selection. By default, it recognizes text and translates it, displaying both Original and Translation in the Side Panel. |
| Upload, drag & drop, or paste image | Displays the recognized source text first. When translation is enabled, the user can click **Translate Text** to start translation. Images pasted via the Paste button, `⌘V`, or dragged onto the panel follow the same flow. |
| Source text already matches target language | When the recognized text is already confidently and uniformly in the selected target language (with no foreign-language lines or inline segments), the result is returned locally without sending an external translation request. |
| Session diagnostics | The Side Panel includes a collapsible **Diagnostics** section (plus structured DevTools console logs) showing in-memory metadata for the current session (recognition language, detected language and confidence, route such as cache/local skip/API, endpoint, model, HTTP status, finish reason, and timings). Diagnostics can be copied for bug reports and never include images, recognized text, translations, or API keys, nor are they written to disk. |
| Select **OCR Only** | Subsequent tasks extract text locally on-device only. Settings hides target language, translation service, and API key fields; the Side Panel hides the Translate button and empty translation box. |
| Unrecognized persisted mode | Tasks fall back to OCR-only locally, and both Settings and the Side Panel prompt the user to re-select and save a valid mode. |
| Language & UI settings | Defaults to auto-detecting recognition language, Simplified Chinese (`zh-Hans`) as the target language, and following the browser's interface language. Users can pick from preset target languages or enter a custom language code, choose device-supported OCR languages, and switch the UI language (`en` / `zh_CN`). Mode and languages are read at the start of each job. |
| Service & API key setup | Users can select a service/model preset or custom endpoint, run **Test Connection**, and save a masked API key in Settings. The key input clears after saving and only configuration status is shown; unauthenticated local services do not require a key. When a key is required but missing, OCR still works and the Side Panel directs the user to Settings; once saved, existing recognized text can be translated directly. |
| Read failure or blank image | When page pixels cannot be read, error copy guides the user to upload, drop, paste, or refresh the tab if the extension was just reloaded. Blank images or images with no text show an empty status. Both cases stop after the recognition stage. |
| Translation streaming or failure | Progress is shown and translated chunks appear in arrival order. Errors explain the appropriate next step. Both original text and partial/complete translations can be copied. Users can cancel, retry, or clear. |
| Sequential actions | A new task replaces any active task in the Side Panel. After cancelling, clearing, or closing the Side Panel, responses from prior tasks can no longer update the UI. Retrying after an error reuses the existing recognized text. Repeating the same image or right-click translation in a browser session hits the session cache; clicking **Translate Text** manually always fetches a fresh translation, and users can clear the session cache anytime in Settings. |

## Data Constraints

- Image recognition and same-language detection run locally on macOS. When translation runs, only the recognized text, target language, and translation instruction are sent to the configured translation service. Settings explains this behavior.
- When translation is enabled, text is sent only when the user selects the image context menu item or clicks the Side Panel's **Translate Text** button, scoped strictly to that image or the current text in the panel.
- Images, recognized text, translations, and session cache entries live only in memory or browser session storage (`chrome.storage.session`) and are never written to disk. Persistent storage is limited to user preferences and the API key in system secure storage.
- Image reading respects Chrome's site-access and cross-origin rules and never re-fetches image URLs. Cancelling aborts the local task and closes any in-flight HTTP request (text already received by a remote server cannot be recalled).

## Scope

The product output is plain-text Original and Translation in the Side Panel. OCR quality depends on font size, image clarity, language, and layout; reading order for complex layouts follows Apple Vision's output. Input formats and resource limits are documented in [IMPLEMENTATION.md](IMPLEMENTATION.md).
