#!/usr/bin/env bash
# Gradescope image build step. The grader and the student's micromcp.py are
# pure Python 3 stdlib — nothing to install.
set -euo pipefail
python3 --version
