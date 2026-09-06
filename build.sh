#!/usr/bin/env bash
# build.sh — Package Vocabular for Chrome or Firefox
#
# Usage:
#   ./build.sh chrome    → dist/chrome/  with manifest.chrome.json as manifest.json
#   ./build.sh firefox   → dist/firefox/ with manifest.firefox.json as manifest.json
#
# The source code is identical for both browsers. Only the manifest differs.

set -e

BROWSER="${1:-}"

if [[ "$BROWSER" != "chrome" && "$BROWSER" != "firefox" ]]; then
  echo "Usage: $0 chrome|firefox"
  exit 1
fi

SRC="$(cd "$(dirname "$0")" && pwd)"
DIST="$SRC/dist/$BROWSER"

echo "Building for $BROWSER → $DIST"

# Clean and recreate dist dir
rm -rf "$DIST"
mkdir -p "$DIST"

# Copy all source files except alternate manifests, dist, and dev files
rsync -a \
  --exclude="manifest.chrome.json" \
  --exclude="manifest.firefox.json" \
  --exclude="manifest.json" \
  --exclude="dist/" \
  --exclude=".kiro/" \
  --exclude="build.sh" \
  --exclude="*.sh" \
  --exclude=".git/" \
  "$SRC/" "$DIST/"

# Copy the correct manifest as manifest.json
cp "$SRC/manifest.${BROWSER}.json" "$DIST/manifest.json"

echo "Done. Load $DIST as an unpacked extension."
