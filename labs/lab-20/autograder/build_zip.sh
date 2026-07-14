#!/usr/bin/env bash
# Build the Gradescope autograder zip. Upload autograder.zip under
# "Configure Autograder" -> "Zip File Upload". The zip contains, at its ROOT
# (Gradescope requires no top-level folder):  run_autograder  setup.sh  grader.py
set -euo pipefail
cd "$(dirname "$0")"
OUT="autograder.zip"
rm -f "$OUT"
chmod +x run_autograder setup.sh
zip -j "$OUT" run_autograder setup.sh grader.py
echo "Built $(pwd)/$OUT"
unzip -l "$OUT"
