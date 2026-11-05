#!/usr/bin/env bash
# bun run ui-catalog:remote [--sha <sha>] [--only <glob>] [--twice]
#
# Runs the UI state catalog on the catalog runner (the Mac mini, `ssh macmini`) at one commit
# and copies the images back to <repo root>/.evidence/ui-catalog/<short sha>/. Electron never
# starts on this machine (ADR 0044): everything that launches it happens over ssh.
#
# On the mini it uses a worktree of its own, detached at the commit, so the mini's main
# checkout is never touched. The run is submitted as a launchd job, because macOS grants
# Screen Recording to the job's `node` and never to a process started from an SSH session
# (spec, open question 1).
set -euo pipefail

REMOTE_HOST="${UI_CATALOG_HOST:-macmini}"
REMOTE_REPO='~/Documents/Workspace/Agent/kaipu-record'
REMOTE_WORKTREE='~/Documents/Workspace/Agent/kaipu-record-ui-catalog'
REMOTE_PATH='export PATH="$HOME/.local/share/mise/installs/node/24/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"'
# A full run is ~10 minutes; this only bounds a run that hangs outright.
POLL_LIMIT_SECONDS="${UI_CATALOG_POLL_LIMIT:-5400}"

sha=""
catalog_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --sha) sha="${2:?--sha needs a commit}"; shift 2 ;;
    --only) catalog_args+=(--only "${2:?--only needs a glob}"); shift 2 ;;
    --twice) catalog_args+=(--twice); shift ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

repo_root="$(git rev-parse --show-toplevel)"
sha="$(git rev-parse "${sha:-HEAD}^{commit}")"
short="${sha:0:8}"

# The mini fetches from origin, so the commit has to be there. A local-only commit would make
# the mini run something else, or fail halfway through.
git fetch --quiet origin
if [ -z "$(git branch -r --contains "$sha" 2>/dev/null)" ]; then
  echo "Commit $short is not on origin. Push it first (git push), then run this again." >&2
  exit 1
fi

# Quoted for the remote shell.
quoted_args=""
for arg in ${catalog_args[@]+"${catalog_args[@]}"}; do quoted_args+=" $(printf '%q' "$arg")"; done

label="dev.kaipu.ui-catalog.$short.$(date +%s)"
remote_log="/tmp/$label.log"

echo "[ui-catalog:remote] $REMOTE_HOST: worktree at $short, install, build"
# shellcheck disable=SC2087 # expanded locally on purpose: the sha, label and args.
spec="$(ssh "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
$REMOTE_PATH
repo=$REMOTE_REPO
wt=$REMOTE_WORKTREE
if [ ! -e "\$wt/.git" ]; then
  git -C "\$repo" fetch --quiet origin
  git -C "\$repo" worktree add --detach "\$wt" $sha >&2
fi
cd "\$wt"
if [ -n "\$(git status --porcelain)" ]; then
  echo "The catalog worktree \$wt has local changes; refusing to touch it." >&2
  git status --short >&2
  exit 1
fi
git fetch --quiet origin
git checkout --quiet --detach $sha
bun install --frozen-lockfile >&2
cd apps/kaipu-record
MAIN_VITE_SERVER_URL=http://localhost:3000 MAIN_VITE_WEB_URL=http://localhost:3001 \
  ./node_modules/.bin/electron-vite build >&2
bun ui-catalog/cli.ts --prepare-only$quoted_args | sed -n 's/^UI_CATALOG_RUN_SPEC=//p'
EOF
)"
if [ -z "$spec" ]; then
  echo "[ui-catalog:remote] the mini did not prepare a run" >&2
  exit 1
fi
remote_out="$(dirname "$spec")"

echo "[ui-catalog:remote] submitting launchd job $label"
# shellcheck disable=SC2087
ssh "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
node_bin="\$(/usr/bin/plutil -extract node raw -o - "$spec" 2>/dev/null || python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["node"])' "$spec")"
launchctl submit -l "$label" -o "$remote_log" -e "$remote_log" -- \
  "\$node_bin" "$remote_out/../../../apps/kaipu-record/ui-catalog/job.mjs" "$spec"
EOF

cleanup() { ssh "$REMOTE_HOST" "launchctl remove '$label' 2>/dev/null || true"; }
trap cleanup EXIT

# Follow the job's log until it prints the sentinel with the run's exit code.
seen=0
code=""
started=$SECONDS
while [ -z "$code" ]; do
  sleep 5
  chunk="$(ssh "$REMOTE_HOST" "tail -n +$((seen + 1)) '$remote_log' 2>/dev/null || true")"
  if [ -n "$chunk" ]; then
    printf '%s\n' "$chunk"
    seen=$((seen + $(printf '%s\n' "$chunk" | wc -l)))
    code="$(printf '%s\n' "$chunk" | sed -n 's/^UI_CATALOG_EXIT=\([0-9]*\).*/\1/p' | tail -1)"
  fi
  if [ $((SECONDS - started)) -gt "$POLL_LIMIT_SECONDS" ]; then
    echo "[ui-catalog:remote] no result after ${POLL_LIMIT_SECONDS}s; stopping the job" >&2
    code=124
  fi
done

local_out="$repo_root/.evidence/ui-catalog/$short"
rm -rf "$local_out"
mkdir -p "$(dirname "$local_out")"
scp -rq "$REMOTE_HOST:$remote_out" "$local_out"
scp -q "$REMOTE_HOST:$remote_log" "$local_out/job.log" || true
echo "[ui-catalog:remote] exit $code — README: $local_out/README.md"
exit "$code"
