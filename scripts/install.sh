#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
source "$root/scripts/paths.sh"

if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' '本扩展仅支持 macOS 13+。' >&2
  exit 1
fi

umask 077
mkdir -p -- "$host_dir" "$manifest_dir"
if [[ -e "$manifest" || -L "$manifest" ]]; then
  if ! registered="$(/usr/bin/plutil -extract path raw -o - "$manifest" 2>/dev/null)" || [[ "$registered" != "$host_binary" ]]; then
    printf '%s\n' '同名 Native Messaging 注册指向其他程序，已停止安装。' >&2
    exit 1
  fi
fi

prebuilt="$root/bin/image-translator-host"
if [[ -x "$prebuilt" && ! -d "$root/native" ]]; then
  temp="$(mktemp "${host_binary}.XXXXXX")"
  trap 'rm -f -- "$temp"' EXIT
  cp -- "$prebuilt" "$temp"
  chmod 700 "$temp"
  xattr -d com.apple.quarantine "$temp" 2>/dev/null || true
  mv -f -- "$temp" "$host_binary"
else
  if ! xcode-select -p >/dev/null 2>&1; then
    printf '%s\n' '需要 macOS 13+ 和 Xcode Command Line Tools。请先运行 xcode-select --install。' >&2
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
trap 'rm -f -- "$temp_manifest"' EXIT
/usr/bin/plutil -create xml1 "$temp_manifest"
/usr/bin/plutil -insert name -string "$host_name" "$temp_manifest"
/usr/bin/plutil -insert description -string 'Local Image Translator' "$temp_manifest"
/usr/bin/plutil -insert path -string "$host_binary" "$temp_manifest"
/usr/bin/plutil -insert type -string stdio "$temp_manifest"
/usr/bin/plutil -insert allowed_origins -array "$temp_manifest"
/usr/bin/plutil -insert allowed_origins.0 -string "$origin" "$temp_manifest"
/usr/bin/plutil -convert json "$temp_manifest"
mv -f -- "$temp_manifest" "$manifest"
printf '已注册本地组件。请在 Chrome 加载目录：%s/extension\n' "$root"
