#!/usr/bin/env bash
# Gradescope runs this once when building the autograder image.
# This autograder is pure Python 3 stdlib — nothing to install.
set -euo pipefail
python3 --version
