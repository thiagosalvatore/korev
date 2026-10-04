#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../assets"

ICONSET=icon.iconset
ICO_SIZES=(16 32 48 256)
ICNS_SIZES=(16 32 128 256 512)

rsvg-convert --width 1024 --height 1024 icon.svg --output icon.png

rm -rf "$ICONSET"
mkdir "$ICONSET"
for size in "${ICNS_SIZES[@]}"; do
  double=$((size * 2))
  sips --resampleHeightWidth "$size" "$size" icon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips --resampleHeightWidth "$double" "$double" icon.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil --convert icns "$ICONSET" --output icon.icns
rm -rf "$ICONSET"

magick icon.png -define icon:auto-resize="$(IFS=,; echo "${ICO_SIZES[*]}")" icon.ico
