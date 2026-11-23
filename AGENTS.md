# AGENTS.md

Guidance for AI coding agents working in this repository.

## Overview

**Tuyi** (`tuyi`) is a macOS-only (`26.0+`) Chrome Manifest V3 extension paired with a Swift Native Messaging host:

- `extension/` — Plain ES modules (no bundler, no runtime npm dependencies), Side Panel & Options UI, `_locales` (`en`, `zh_CN`), content script (`image-selection.js`), and session-only cache (`cache.js`).
- `native/` — Swift native host (`Host.swift`, `Protocol.swift`, `VisionOCR.swift`, `OCRLayout.swift`, `Translation.swift`, `Keychain.swift`, `Identity.swift`) compiled with `xcrun swiftc`.
- `scripts/` — Build, install, Keychain helper, universal release packaging, test, and uninstall scripts.
- `tests/` — Node test runner suites (`config`, `native-client`, `cache`, `i18n`, `native`, `chrome`, `chrome-menu`).

Read [SPEC.md](SPEC.md) for product behavior and [IMPLEMENTATION.md](IMPLEMENTATION.md) for technical limits and module contracts before making behavioral changes.

## Key Invariants

- **Keep internal details out of the UI**: Never expose implementation terms (`Apple Vision`, `macOS Keychain`, `BCP 47`, `NLLanguageRecognizer`, `activeTab`) in user-facing UI strings. (`tests/chrome.test.mjs` explicitly checks that `"Apple Vision"` does not appear in Options.)
- **Restrictive permissions**: Do not add `"scripting"` or `host_permissions` to `extension/manifest.json` (`tests/config.test.mjs` enforces this).
- **Privacy & storage**: Never write images, OCR text, or translations to persistent storage (`chrome.storage.local` is preferences only; `chrome.storage.session` is session-only; API keys belong only in macOS Keychain). Never re-fetch webpage image URLs.
- **Extension ID parity**: `extension/manifest.json`'s `key` and `native/Identity.swift`'s `extensionOrigin` must match (`tests/config.test.mjs` verifies this).
- **Translation endpoint safety**: `Translation.swift` must only allow HTTPS or loopback HTTP (`127.0.0.1`, `localhost`, `::1`), refuse HTTP redirects, and omit DeepSeek's `thinking` field for non-DeepSeek models/endpoints.
- **i18n parity**: `extension/_locales/en/messages.json` and `extension/_locales/zh_CN/messages.json` must define the exact same keys (`tests/i18n.test.mjs` enforces this). Keep `default_locale: "zh_CN"` unless updating the E2E suite accordingly.
- **Test-critical selectors & copy**: Preserve element IDs in `panel.html` and `options.html` (`#mode`, `#target-fields`, `#ocrLanguage`, `#api-key`, `#save-key`, `#key-status`, `#status`, `#original`, `#translation`, `#retry`, `#cancel`, `#clear`, `#route`) and status text (`识别完成。`, `翻译完成。`).

## Commands

```sh
# Lint & format checks (ESLint, Prettier, swift-format, ShellCheck)
npm run lint
npm run format

# Fast JS unit tests (must pass before every commit)
npm test

# Swift native host + Vision OCR + Keychain + loopback translation tests
npm run test:native

# Isolated Chrome E2E tests (requires ./scripts/install.sh first)
npm run test:chrome
npm run test:chrome-menu   # requires macOS Accessibility permission

# Build & register the native host locally
./scripts/install.sh

# Build universal (arm64 + x86_64) macOS release zip in .build/
./scripts/package.sh
```

> Note: Rebuilding `native/*.swift` changes the binary's ad-hoc code signature, which triggers a one-time macOS Keychain authorization prompt on the next run.

## Commits & Releases

This repo uses **Conventional Commits** with `semantic-release` on `master` (`.releaserc.json`, `.github/workflows/release.yml`):

- `fix:` → patch release (`1.0.x`)
- `feat:` → minor release (`1.x.0`)
- `BREAKING CHANGE:` / `feat!:` → major release (`x.0.0`)
- `docs:`, `chore:`, `ci:`, `test:`, `refactor:` → no release

`semantic-release` updates `package.json`, `extension/manifest.json`, and `CHANGELOG.md` automatically, attaches the universal macOS zip built by `scripts/package.sh` to the GitHub Release, and updates `Casks/tuyi.rb` in `leslieo2/homebrew-tap` via `scripts/update-homebrew-tap.mjs` when `HOMEBREW_TAP_TOKEN` is configured. Keep `SPEC.md`, `IMPLEMENTATION.md`, `README.md`, and `CONTRIBUTING.md` in English and in sync with changes.
