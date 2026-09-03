#!/bin/sh
# Regenerate all Spark app icon PNGs from icon.svg. ALWAYS use this — never hand-export.
# Renders at 1024 full-bleed, flattens onto the icon's own bg (no alpha), then scales down
# for macOS/watchOS sizes. Mirrors nulljosh.github.io/scripts/make-appicon.sh.
set -e
cd "$(dirname "$0")/.."
BG="#271614"
MASTER="/tmp/spark-icon-1024.png"
rsvg-convert -w 1024 -h 1024 icon.svg | magick - -background "$BG" -alpha remove -alpha off "$MASTER"
sips -g pixelWidth -g pixelHeight -g hasAlpha "$MASTER" | grep -q 'hasAlpha: no'
sips -g pixelWidth "$MASTER" | grep -q 'pixelWidth: 1024'

# iOS: single-size asset, same 1024 for all three variants
IOS=ios/Assets.xcassets/AppIcon.appiconset
cp "$MASTER" "$IOS/AppIcon.png"
cp "$MASTER" "$IOS/AppIcon-dark.png"
cp "$MASTER" "$IOS/AppIcon-tinted.png"

# macOS: scaled set
MAC=macos/Assets.xcassets/AppIcon.appiconset
for sz in 16 32 64 128 256 512 1024; do
  sips -z "$sz" "$sz" "$MASTER" --out "$MAC/icon-$sz.png" >/dev/null
done

# watchOS: scaled set
WATCH=watchos/Assets.xcassets/AppIcon.appiconset
for sz in 48 55 58 80 87 88 100 172 196 216 1024; do
  sips -z "$sz" "$sz" "$MASTER" --out "$WATCH/icon-$sz.png" >/dev/null
done

echo "OK: regenerated iOS/macOS/watchOS icons from icon.svg"
