#!/usr/bin/env bash
# Builds the experimental native capture helper (--experimental-native-recording).
# It is optional: without it the recorder keeps the default Chromium capture, so a
# missing Swift toolchain warns instead of blocking `bun run dev` or `bun run build`.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || exit 0
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$APP_ROOT/native/encoded-capture/main.swift"
OUTPUT="${1:-$APP_ROOT/resources/native/kaipu-encoded-capture}"
if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo "warning: swiftc not found; skipping the experimental native capture helper." >&2
  echo "         Install the Xcode Command Line Tools to build it: xcode-select --install" >&2
  exit 0
fi
# Skip the two-architecture compile when the binary is newer than its source and this script.
if [[ -x "$OUTPUT" && "$OUTPUT" -nt "$SOURCE" && "$OUTPUT" -nt "$0" ]]; then
  exit 0
fi
mkdir -p "$(dirname "$OUTPUT")"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
for ARCH in arm64 x86_64; do
  xcrun swiftc -parse-as-library -swift-version 5 -O -target "$ARCH-apple-macos14.0" "$SOURCE" -o "$BUILD_DIR/$ARCH"
done
xcrun lipo -create "$BUILD_DIR/arm64" "$BUILD_DIR/x86_64" -output "$OUTPUT"
