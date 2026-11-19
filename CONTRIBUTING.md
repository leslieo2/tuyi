# Contributing

Thanks for your interest in contributing to **Tuyi**!

## Environment

- **macOS 13.0+** with **Xcode Command Line Tools** (`xcode-select --install`)
- **Google Chrome 123+**
- **Node.js 20+** (for running the test suite)

## Project Structure

- [`extension/`](extension) — Chrome MV3 extension (plain ES modules, no bundler step required)
- [`native/`](native) — Swift native messaging host (`Vision` OCR, `NaturalLanguage` detection, `Security` Keychain, `URLSession` streaming)
- [`scripts/`](scripts) — Build, install, release packaging, Keychain CLI helper, test, and uninstall scripts
- [`tests/`](tests) — Node unit tests, native host integration tests, and isolated Chrome E2E tests
- [`SPEC.md`](SPEC.md) & [`IMPLEMENTATION.md`](IMPLEMENTATION.md) — Product and technical specifications

## Building from Source

```sh
./scripts/install.sh
```

To create a universal (`arm64` + `x86_64`) macOS release archive in `.build/`:

```sh
./scripts/package.sh
```

You can also store an API key from the terminal via `./scripts/set-deepseek-key.sh`.

## Running Tests

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

## Releases & Commit Convention

This repository uses [semantic-release](https://github.com/semantic-release/semantic-release) with [Conventional Commits](https://www.conventionalcommits.org/) on `master` (`.github/workflows/release.yml` and `.releaserc.json`):

- `fix: ...` → patch release (`1.0.x`)
- `feat: ...` → minor release (`1.x.0`)
- `BREAKING CHANGE:` / `feat!: ...` → major release (`x.0.0`)
- `docs:`, `chore:`, `test:`, `refactor:` → no new release

`semantic-release` updates `package.json`, `extension/manifest.json`, and `CHANGELOG.md` automatically, and attaches `tuyi-v*-macos.zip` to the GitHub Release. After a release publishes, update `Casks/tuyi.rb` in [`leslieo2/homebrew-tap`](https://github.com/leslieo2/homebrew-tap) with the new version and SHA-256.

## Guidelines

- Keep `extension/` dependency-free (no external npm runtime packages) and preserve restrictive MV3 permissions (`SPEC.md` / `IMPLEMENTATION.md`).
- Never commit API keys, personal Keychain exports, or `.build/` artifacts.
- Keep `SPEC.md`, `IMPLEMENTATION.md`, and `README.md` in sync with behavioral changes.
