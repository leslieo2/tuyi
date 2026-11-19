#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
source "$root/scripts/paths.sh"

if [[ "$(uname -s)" != Darwin ]] || ! xcode-select -p >/dev/null 2>&1; then
  printf '%s\n' '需要 macOS 13+ 和 Xcode Command Line Tools。请先运行 xcode-select --install。' >&2
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

host_source=("$root"/native/*.swift)
needs_build=false
[[ -x "$host_binary" ]] || needs_build=true
for file in "${host_source[@]}" "$root/scripts/build.sh"; do
  if [[ "$file" -nt "$host_binary" ]]; then needs_build=true; fi
done
if "$needs_build"; then "$root/scripts/build.sh" "$host_binary"; fi

origin="$("$host_binary" --origin)"
temp="$(mktemp "$manifest_dir/.$host_name.XXXXXX")"
trap 'rm -f -- "$temp"' EXIT
/usr/bin/plutil -create xml1 "$temp"
/usr/bin/plutil -insert name -string "$host_name" "$temp"
/usr/bin/plutil -insert description -string 'Local Image Translator' "$temp"
/usr/bin/plutil -insert path -string "$host_binary" "$temp"
/usr/bin/plutil -insert type -string stdio "$temp"
/usr/bin/plutil -insert allowed_origins -array "$temp"
/usr/bin/plutil -insert allowed_origins.0 -string "$origin" "$temp"
/usr/bin/plutil -convert json "$temp"
mv -f -- "$temp" "$manifest"
printf '已注册本地组件。请在 Chrome 加载目录：%s/extension\n' "$root"
