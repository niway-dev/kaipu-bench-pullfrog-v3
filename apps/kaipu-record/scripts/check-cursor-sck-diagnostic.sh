#!/usr/bin/env bash
set -euo pipefail
# These refusal checks must exit before any OS permission/capture operation.
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROBE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kaipu-sck-check.XXXXXX")"
trap 'rm -rf "$PROBE_DIR"' EXIT
bash "$APP_ROOT/scripts/build-cursor-sck-diagnostic.sh" "$PROBE_DIR/probe"
expect_refusal() {
  local expected="$1"
  shift
  if "$PROBE_DIR/probe" "$@" > "$PROBE_DIR/result" 2>&1; then
    echo 'Expected refusal, got success' >&2
    exit 1
  fi
  if ! grep -q "$expected" "$PROBE_DIR/result"; then
    cat "$PROBE_DIR/result" >&2
    exit 1
  fi
  if [[ -e "$PROBE_DIR/capture" ]]; then
    echo 'Invalid input created capture artifacts' >&2
    exit 1
  fi
}
expect_refusal 'Usage:'
expect_refusal 'Usage:' --other-mode 2 "$PROBE_DIR/capture"
expect_refusal 'Usage:' --cursor-sck-diagnostic invalid "$PROBE_DIR/capture"
expect_refusal 'Unknown option:' --cursor-sck-diagnostic 2 "$PROBE_DIR/capture" --unknown
expect_refusal 'Missing rect' --cursor-sck-diagnostic 2 "$PROBE_DIR/capture" --rect
expect_refusal 'Rect must be finite' --cursor-sck-diagnostic 2 "$PROBE_DIR/capture" --rect 0,0,nan,20
expect_refusal 'Rect must be finite' --cursor-sck-diagnostic 2 "$PROBE_DIR/capture" --rect 0,0,0,20
expect_refusal 'Rect must be finite' --cursor-sck-diagnostic 2 "$PROBE_DIR/capture" --rect -1,0,20,20
expect_refusal 'Rect must be finite' --cursor-sck-diagnostic 2 "$PROBE_DIR/capture" --rect 0,0,abc,100,100
expect_refusal 'Rect must be finite' --cursor-sck-diagnostic 2 "$PROBE_DIR/capture" --rect 0,0,,100,100
echo '10 CLI refusal checks passed; no capture requested'
