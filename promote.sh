#!/bin/bash
# Promote staging to live: run from repo root, then commit and push.
rsync -a --delete --exclude staging --exclude .git --exclude promote.sh staging/ ./
echo "staging promoted to live. Now: git add -A && git commit -m 'promote staging' && git push"
