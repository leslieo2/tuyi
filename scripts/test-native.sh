#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$root"
./scripts/build.sh "$root/.build/image-translator-test-host" --test
MACOSX_DEPLOYMENT_TARGET=26.0 xcrun swiftc -o .build/test-ocr-layout native/Protocol.swift native/OCRLayout.swift tests/ocr-layout.swift
.build/test-ocr-layout
swift tests/fixtures.swift .build/fixtures
node --test tests/native.test.mjs
