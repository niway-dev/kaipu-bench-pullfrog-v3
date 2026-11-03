#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || exit 0
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-$APP_ROOT/resources/native/kaipu-encoded-capture}"
mkdir -p "$(dirname "$OUTPUT")"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
for ARCH in arm64 x86_64; do
  xcrun swiftc -parse-as-library -swift-version 5 -O -target "$ARCH-apple-macos14.0" "$APP_ROOT/native/encoded-capture/main.swift" -o "$BUILD_DIR/$ARCH"
done
xcrun lipo -create "$BUILD_DIR/arm64" "$BUILD_DIR/x86_64" -output "$OUTPUT"
