#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 ]] || { echo 'usage: build-encoded-capture.sh OUTPUT_BINARY' >&2; exit 2; }
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec xcrun swiftc -parse-as-library -swift-version 5 -O -target "$(uname -m)-apple-macos14.0" "$APP_ROOT/native/encoded-capture/main.swift" -o "$1"
