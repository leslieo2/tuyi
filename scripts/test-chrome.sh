#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$root"
mkdir -p .build
./scripts/build.sh "$root/.build/image-translator-test-host" --test
swift tests/fixtures.swift .build/fixtures
node --test tests/chrome.test.mjs
