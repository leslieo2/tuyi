# Contributing

Thanks for your interest in contributing to **图译 · Image Translator**!

## Environment

- **macOS 13.0+** with **Xcode Command Line Tools** (`xcode-select --install`)
- **Google Chrome 123+**
- **Node.js 20+** (for running the test suite)

## Project Layout

- `extension/` — Chrome MV3 extension (plain ES modules, no bundler step required)
- `native/` — Swift native messaging host compiled with `xcrun swiftc`
- `scripts/` — Build, install, test, and uninstall scripts
- `tests/` — Unit, native integration, and Chrome end-to-end tests
- `SPEC.md` & `IMPLEMENTATION.md` — Product and technical specifications

## Running Tests

Before opening a pull request, please run:

```sh
npm test
npm run test:native
```

If you change extension UI, messaging, or right-click image selection, also run:

```sh
npm run test:chrome
```

## Guidelines

- Keep `extension/` dependency-free (no external npm runtime packages) and preserve restrictive MV3 permissions (`SPEC.md` / `IMPLEMENTATION.md`).
- Never commit API keys, personal Keychain exports, or `.build/` artifacts.
- Keep `SPEC.md`, `IMPLEMENTATION.md`, and `README.md` in sync with behavioral changes.
