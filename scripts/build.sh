#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
out="${1:-$root/.build/image-translator-host}"
flags=()
if [[ "${2:-}" == --test ]]; then flags=(-D IMAGE_TRANSLATOR_TEST); fi
mkdir -p -- "$(dirname -- "$out")"
temp="$(mktemp "${out}.XXXXXX")"
trap 'rm -f -- "$temp"' EXIT
MACOSX_DEPLOYMENT_TARGET=13.0 xcrun swiftc -O ${flags[@]+"${flags[@]}"} -o "$temp" "$root"/native/*.swift
chmod 700 "$temp"
mv -f -- "$temp" "$out"
