#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
source "$root/scripts/paths.sh"

os_version=0
if [[ "$(uname -s)" == Darwin ]]; then
  os_version="$(/usr/bin/sw_vers -productVersion)"
fi
if [[ "${os_version%%.*}" -lt 26 ]]; then
  printf '%s\n' 'Tuyi requires macOS 26 or later.' >&2
  exit 1
fi

umask 077
mkdir -p -- "$host_dir" "$manifest_dir"
if [[ -e "$manifest" || -L "$manifest" ]]; then
  if ! registered="$(/usr/bin/plutil -extract path raw -o - "$manifest" 2>/dev/null)" || [[ "$registered" != "$host_binary" ]]; then
    printf '%s\n' 'Another program is registered under the same Native Messaging host name. Aborting.' >&2
    exit 1
  fi
fi

temp_bin=""
temp_ext=""
temp_manifest=""
cleanup() {
  rm -f -- "$temp_bin" "$temp_manifest"
  rm -rf -- "$temp_ext"
}
trap cleanup EXIT

prebuilt="$root/bin/image-translator-host"
extension_dir="$root/extension"
if [[ -x "$prebuilt" && ! -d "$root/native" ]]; then
  temp_bin="$(mktemp "${host_binary}.XXXXXX")"
  cp -- "$prebuilt" "$temp_bin"
  chmod 700 "$temp_bin"
  xattr -d com.apple.quarantine "$temp_bin" 2>/dev/null || true
  mv -f -- "$temp_bin" "$host_binary"

  temp_ext="$(mktemp -d "${host_dir}/.extension.XXXXXX")"
  cp -R -- "$root/extension/." "$temp_ext/"
  chmod -R u+rwX,go+rX,go-w "$temp_ext"
  xattr -dr com.apple.quarantine "$temp_ext" 2>/dev/null || true
  rm -rf -- "$host_dir/extension"
  mv -f -- "$temp_ext" "$host_dir/extension"
  extension_dir="$host_dir/extension"
else
  if ! xcode-select -p >/dev/null 2>&1; then
    printf '%s\n' 'Xcode 26 or compatible Command Line Tools are required. Run: xcode-select --install' >&2
    exit 1
  fi
  host_source=("$root"/native/*.swift)
  needs_build=false
  [[ -x "$host_binary" ]] || needs_build=true
  for file in "${host_source[@]}" "$root/scripts/build.sh"; do
    if [[ "$file" -nt "$host_binary" ]]; then needs_build=true; fi
  done
  if "$needs_build"; then "$root/scripts/build.sh" "$host_binary"; fi
fi

origin="$("$host_binary" --origin)"
temp_manifest="$(mktemp "$manifest_dir/.$host_name.XXXXXX")"
/usr/bin/plutil -create xml1 "$temp_manifest"
/usr/bin/plutil -insert name -string "$host_name" "$temp_manifest"
/usr/bin/plutil -insert description -string 'Local Image Translator' "$temp_manifest"
/usr/bin/plutil -insert path -string "$host_binary" "$temp_manifest"
/usr/bin/plutil -insert type -string stdio "$temp_manifest"
/usr/bin/plutil -insert allowed_origins -array "$temp_manifest"
/usr/bin/plutil -insert allowed_origins.0 -string "$origin" "$temp_manifest"
/usr/bin/plutil -convert json "$temp_manifest"
mv -f -- "$temp_manifest" "$manifest"
printf 'Installed native host. Load unpacked extension in Chrome from:\n  %s\n' "$extension_dir"
