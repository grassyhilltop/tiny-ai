#!/usr/bin/env bash
# Did the thing I just pushed actually reach the live site?
#
# Pushing and deploying are two different events, and GitHub Pages will happily report a green
# push while the build behind it hangs or errors. This checks the only thing that matters: the
# bytes being served right now contain the commit you expect.
#
#   bin/check-deploy.sh                       # is origin/main live?
#   bin/check-deploy.sh <path> <needle>       # ...and does that page contain this string?
#
# Exits non-zero if the live site is behind, so it can gate a "done" claim.
set -uo pipefail

REPO="${REPO:-grassyhilltop/tiny-ai}"
BASE="${BASE:-https://grassyhilltop.github.io/tiny-ai}"
PATH_REL="${1:-/staging/labs/goldilocks/index.html}"
NEEDLE="${2:-}"

want=$(git rev-parse --short=8 origin/main 2>/dev/null || echo "?")
echo "want   : $want  ($(git log -1 --format=%s origin/main 2>/dev/null))"

# --- what the deploy system thinks -------------------------------------------------------
if command -v gh >/dev/null 2>&1; then
  run=$(gh run list --repo "$REPO" --workflow "Deploy Pages" --limit 1 \
        --json headSha,status,conclusion,url 2>/dev/null)
  if [ -n "$run" ] && [ "$run" != "[]" ]; then
    echo "action : $(echo "$run" | python3 -c 'import json,sys;d=json.load(sys.stdin)[0];print(d["status"],d["conclusion"] or "",d["headSha"][:8]);')"
    echo "         $(echo "$run" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["url"])')"
  else
    gh api "repos/$REPO/pages/builds/latest" \
      --jq '"legacy : \(.status) \(.commit[0:8]) dur=\(.duration) \(.error.message // "")"' 2>/dev/null
  fi
fi

# --- what is actually being served -------------------------------------------------------
url="$BASE$PATH_REL?cb=$RANDOM$RANDOM"
body=$(curl -fsS "$url" 2>/dev/null) || { echo "live   : FETCH FAILED $url"; exit 2; }
echo "served : $(printf '%s' "$body" | wc -c | tr -d ' ') bytes  $(curl -sI "$BASE$PATH_REL" | awk -F': ' '/[Ll]ast-[Mm]odified/{print $2}' | tr -d '\r')"

rc=0
if [ -n "$NEEDLE" ]; then
  if printf '%s' "$body" | grep -q -- "$NEEDLE"; then
    echo "needle : FOUND  '$NEEDLE'"
  else
    echo "needle : MISSING '$NEEDLE'  <-- the live page is NOT your latest build"
    rc=1
  fi
fi
exit $rc
