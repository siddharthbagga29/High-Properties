#!/usr/bin/env bash
# Clone God's Eye View at the commit this skill was written against, install
# dependencies and run the project's own setup doctor.
#
# Usage: bootstrap.sh <target-dir> [ref]
#   ref defaults to the pinned commit below; pass "main" to track upstream.
set -euo pipefail

PINNED_REF="e685449a52550775a5279cef1b9090ef24d507a2"
REPO_URL="https://github.com/bilawalsidhu/gods-eye-view.git"

target="${1:?usage: bootstrap.sh <target-dir> [ref]}"
ref="${2:-$PINNED_REF}"

# package.json engines: ">=24.14.0 <25 || >=26 <27"
node_version="$(node --version 2>/dev/null | sed 's/^v//')" || {
  echo "error: node is not installed (need 24.14+ or 26.x)" >&2
  exit 1
}
major="${node_version%%.*}"
minor="$(echo "$node_version" | cut -d. -f2)"
if ! { [ "$major" -eq 24 ] && [ "$minor" -ge 14 ]; } && [ "$major" -ne 26 ]; then
  echo "error: node $node_version found; God's Eye View needs 24.14+ (<25) or 26.x" >&2
  exit 1
fi

if [ -e "$target" ]; then
  echo "error: $target already exists; pick a new directory" >&2
  exit 1
fi

git clone "$REPO_URL" "$target"
git -C "$target" checkout --quiet "$ref"
echo "checked out $(git -C "$target" rev-parse --short HEAD)"

cd "$target"
npm ci
[ -f .env ] || cp .env.example .env
npm run doctor || echo "warning: setup doctor reported problems; see output above" >&2

cat <<MSG

Done. Next steps:
  1. Put keys in $target/.env (GOOGLE_MAPS_API_KEY, CESIUM_ION_TOKEN, ...;
     see references/architecture.md for which are required).
  2. cd $target && npm run dev
  3. Optional MCP: see references/tools-and-voice.md ("Registering the MCP server").
MSG
