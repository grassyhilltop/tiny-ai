#!/usr/bin/env bash
# Build the Gradescope autograder zip. Upload autograder.zip under
# "Configure Autograder" → "Zip File Upload". No top-level folder (Gradescope
# requires the scripts at the zip root).
set -euo pipefail
cd "$(dirname "$0")"
OUT="autograder.zip"
rm -f "$OUT"
chmod +x run_autograder setup.sh
zip -j "$OUT" run_autograder setup.sh grader.py
echo "Built $(pwd)/$OUT"
unzip -l "$OUT"
