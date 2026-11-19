#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
source "$root/scripts/paths.sh"
if [[ ! -x "$host_binary" || "$root/native/Keychain.swift" -nt "$host_binary" ]]; then
  printf '%s\n' '请先运行 ./scripts/install.sh。' >&2
  exit 1
fi
exec "$host_binary" --set-key-manually
