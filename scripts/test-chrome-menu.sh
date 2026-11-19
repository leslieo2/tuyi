#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$root"
mkdir -p .build
./scripts/build.sh "$root/.build/image-translator-test-host" --test
swift tests/fixtures.swift .build/fixtures
xcrun swiftc -O -o .build/select-menu tests/select-menu.swift
node --test tests/chrome-menu.test.mjs
