#!/bin/bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$root"

version="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("extension/manifest.json", "utf8")).version)')"
stage_name="tuyi-v${version}-macos"
stage_dir="$root/.build/$stage_name"
zip_path="$root/.build/${stage_name}.zip"

rm -rf -- "$stage_dir" "$zip_path"
mkdir -p -- "$stage_dir/bin" "$stage_dir/scripts"

arm64_bin="$root/.build/image-translator-host-arm64"
x86_bin="$root/.build/image-translator-host-x86_64"
trap 'rm -f -- "$arm64_bin" "$x86_bin"' EXIT

xcrun swiftc -O -target arm64-apple-macos13.0 -o "$arm64_bin" "$root"/native/*.swift
xcrun swiftc -O -target x86_64-apple-macos13.0 -o "$x86_bin" "$root"/native/*.swift
lipo -create -output "$stage_dir/bin/image-translator-host" "$arm64_bin" "$x86_bin"
chmod 755 "$stage_dir/bin/image-translator-host"
codesign --force --sign - "$stage_dir/bin/image-translator-host" >/dev/null 2>&1 || true

cp -R "$root/extension" "$stage_dir/extension"
cp "$root/scripts/install.sh" "$root/scripts/uninstall.sh" "$root/scripts/paths.sh" "$root/scripts/set-deepseek-key.sh" "$stage_dir/scripts/"
chmod 755 "$stage_dir/scripts/"*.sh
cp "$root/README.md" "$root/LICENSE" "$stage_dir/"

(cd "$root/.build" && /usr/bin/zip -rq "$zip_path" "$stage_name")
shasum -a 256 "$zip_path"
printf 'Packaged: %s\n' "$zip_path"
