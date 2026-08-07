#!/usr/bin/env bash
# Promote staging/ to the live site at the repo root, then commit and push.
#
#   ./promote.sh --dry-run     # see what would change
#   ./promote.sh               # do it
#
# WHY THIS IS FUSSY. It is an rsync --delete, so anything at the root that staging has no copy of
# gets removed. staging is the site's CONTENT; CNAME, .github/, .nojekyll, bin/, CLAUDE.md and the
# rest are its PLUMBING and live at the root by design. The original version excluded only
# staging, .git and itself, which meant running it deleted the custom domain and the deploy
# workflow. A later version still ate CLAUDE.md, because a blocklist only protects what somebody
# remembered to add.
#
# So there are two layers now: the explicit excludes below, AND a guard that refuses to delete
# anything git is tracking. The blocklist is the intent; the guard is what catches the next file
# nobody thought of.
set -euo pipefail
cd "$(dirname "$0")"

# macOS still ships bash 3.2, where "${ARR[@]}" on an empty array trips `set -u`.
DRY=(); [ "${1:-}" = "--dry-run" ] && DRY=(-n -v)

EXCLUDES=(
  --exclude '/staging'          # the source; never copy it into itself
  --exclude '/.git'
  --exclude '/promote.sh'
  --exclude '/.github'          # the deploy workflow
  --exclude '/CNAME'            # the custom domain
  --exclude '/.nojekyll'        # without it, Jekyll drops labs/_shared/
  --exclude '/.gitignore'
  --exclude '/CLAUDE.md'        # notes for whoever works on this next
  --exclude '/bin'              # check-deploy.sh, the measurement harness
  --exclude '/dist'             # local-only build output
  --exclude '/tiny-ai-site.zip' # local-only build output
  --exclude '/.claude'          # agent scratch, incl. workflow worktrees
  --exclude '.DS_Store'
)

# --- the guard -----------------------------------------------------------------------------
# Ask rsync what it would delete, and stop if any of it is a file git is tracking. Untracked
# junk at the root is fair game; a tracked file is somebody's work.
# -v is load-bearing: without it rsync does the deletions but never prints "deleting X",
# so the guard sees an empty list and waves everything through.
doomed=$(rsync -avn --delete "${EXCLUDES[@]}" staging/ ./ 2>/dev/null \
         | sed -n 's/^deleting //p' | sed 's#/$##')
tracked=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then tracked="$tracked  $f"$'\n'; fi
done <<< "$doomed"

if [ -n "$tracked" ]; then
  echo "promote.sh refused to run: it would delete files git is tracking." >&2
  echo >&2
  printf '%s' "$tracked" >&2
  echo >&2
  echo "These live at the root on purpose. Add each to EXCLUDES in this script, or move it into" >&2
  echo "staging/ if it really is site content." >&2
  exit 1
fi

rsync -a --delete ${DRY[@]+"${DRY[@]}"} "${EXCLUDES[@]}" staging/ ./

if [ "${#DRY[@]}" -eq 0 ]; then
  echo
  echo "staging promoted to live. Now:"
  echo "  git add -A && git commit -m 'promote staging' && git push"
  echo "  bin/check-deploy.sh /tiny-ai/index.html '<a string only the new build has>'"
fi
