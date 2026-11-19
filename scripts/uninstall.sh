#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
source "$root/scripts/paths.sh"
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --delete-key ) ]]; then
  printf '%s\n' 'Usage: ./scripts/uninstall.sh [--delete-key]' >&2
  exit 1
fi
if [[ -e "$manifest" || -L "$manifest" ]]; then
  if ! registered="$(/usr/bin/plutil -extract path raw -o - "$manifest" 2>/dev/null)" || [[ "$registered" != "$host_binary" ]]; then
    printf '%s\n' 'Another program is registered under the same Native Messaging host name. Aborting.' >&2
    exit 1
  fi
fi
if [[ "${1:-}" == --delete-key ]]; then
  if [[ -x "$host_binary" ]]; then
    "$host_binary" --delete-key
  else
    for account in manual-api-key api-key; do
      status=0
      /usr/bin/security delete-generic-password -s com.local_image_translator.deepseek -a "$account" >/dev/null 2>&1 || status=$?
      if [[ "$status" -ne 0 && "$status" -ne 44 ]]; then
        printf '%s\n' 'Failed to delete Keychain API key.' >&2
        exit 1
      fi
    done
  fi
fi
rm -f -- "$manifest" "$host_binary"
rm -rf -- "$host_dir/extension"
rmdir -- "$host_dir" 2>/dev/null || true
printf '%s\n' 'Uninstalled native host. Please also remove the extension from chrome://extensions.'
