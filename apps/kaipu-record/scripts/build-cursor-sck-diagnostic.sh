#!/usr/bin/env bash
set -euo pipefail
# Explicit opt-in only; does not install, sign, package, or enable production capture.
if [[ $# != 1 ]]; then
  echo 'usage: build-cursor-sck-diagnostic.sh OUTPUT_BINARY' >&2
  exit 2
fi
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec xcrun swiftc -parse-as-library -swift-version 5 -O \
  -target "$(uname -m)-apple-macos14.0" \
  "$APP_ROOT/native/cursor-capture/main.swift" -o "$1"
