#!/usr/bin/env bash
# Promote staging/ to the live site at the repo root, then commit and push.
#
#   ./promote.sh --dry-run     # see what would change
#   ./promote.sh               # do it
#
# WHY THE EXCLUDE LIST MATTERS. This is an rsync --delete, so anything at the root that is
# not in staging/ gets removed. The original version excluded only staging, .git and itself,
# which meant running it deleted CNAME (claybits.xyz stops resolving to the site),
# .github/workflows/pages.yml (the deploy itself), .nojekyll (Jekyll then eats _shared/) and
# bin/. Those live at the root by design -- staging is the site's CONTENT, not its plumbing.
# If you add a new root-level infrastructure file, add it here too.
set -euo pipefail
cd "$(dirname "$0")"

# macOS still ships bash 3.2, where "${ARR[@]}" on an empty array trips `set -u`.
DRY=(); [ "${1:-}" = "--dry-run" ] && DRY=(-n -v)

rsync -a --delete ${DRY[@]+"${DRY[@]}"} \
  --exclude '/staging'          `# the source; never copy it into itself` \
  --exclude '/.git'             \
  --exclude '/promote.sh'       \
  --exclude '/.github'          `# the deploy workflow` \
  --exclude '/CNAME'            `# the custom domain` \
  --exclude '/.nojekyll'        `# without it, Jekyll drops labs/_shared/` \
  --exclude '/.gitignore'       \
  --exclude '/bin'              `# check-deploy.sh and friends` \
  --exclude '/dist'             `# local-only build output` \
  --exclude '/tiny-ai-site.zip' `# local-only build output` \
  --exclude '/.claude'          `# agent scratch, incl. workflow worktrees` \
  --exclude '.DS_Store'         \
  staging/ ./

if [ "${#DRY[@]}" -eq 0 ]; then
  echo
  echo "staging promoted to live. Now:"
  echo "  git add -A && git commit -m 'promote staging' && git push"
  echo "  bin/check-deploy.sh /labs/goldilocks/index.html '<a string only the new build has>'"
fi
