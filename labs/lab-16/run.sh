#!/usr/bin/env bash
# run.sh — one command to build, break, and secure microNIDS.
#
#   ./run.sh            # full walkthrough: build -> break -> secure
#   ./run.sh build      # just train + predict + explain
#   ./run.sh break       # just the three attacks
#   ./run.sh secure      # just the two defenses
#
# Creates a local .venv on first run, installs deps, and executes each step
# with a heading. Safe to re-run — the venv and trained models are cached.
set -euo pipefail
cd "$(dirname "$0")"

# Cap worker threads. sklearn/OpenMP otherwise spawn one thread per core (40 on
# a Rivanna node); under a login-node or small-allocation CPU cap that many
# threads thrash and training slows to a crawl. 4 is plenty for this data size.
# Respect an existing value so a large dedicated node can override it.
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-4}"
export OPENBLAS_NUM_THREADS="${OPENBLAS_NUM_THREADS:-4}"

PY=.venv/bin/python
step() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }

# --- one-time environment setup -------------------------------------------
if [ ! -x "$PY" ]; then
  # This lab needs Python 3.9+ (pandas 2 / scikit-learn 1.3+). Rivanna's
  # default /usr/bin/python3 is 3.6 — students must `module load miniforge`
  # (or any modern Python) first. Fail early with an actionable message.
  if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
    echo "!! python3 is $(python3 --version 2>&1), but this lab needs 3.9+."
    echo "   On Rivanna:  module load miniforge   then re-run ./run.sh"
    echo "   Elsewhere:   install/point to a Python 3.9+ and re-run."
    exit 1
  fi
  step "setup · creating .venv and installing dependencies (first run only)"
  python3 -m venv .venv
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r nids/requirements.txt
fi

phase="${1:-all}"

build() {
  step "BUILD · train the classifier"
  $PY nids/micro_nids.py train
  step "BUILD · score one flow"
  $PY nids/micro_nids.py predict --row 0
  step "BUILD · the attacker's target menu (feature importance)"
  $PY nids/micro_nids.py explain --top-k 8
}

break_() {
  step "BREAK · Attack 1 · feature perturbation"
  $PY attacks/01_feature_perturbation.py
  step "BREAK · Attack 2 · packet padding"
  $PY attacks/02_packet_padding.py
  step "BREAK · Attack 3 · slow-and-low timing"
  $PY attacks/03_timing_jitter.py
}

secure() {
  step "SECURE · Defense 1 · model-diversity ensemble"
  $PY secure/ensemble_nids.py train
  $PY secure/ensemble_nids.py defend
  step "SECURE · Defense 2 · per-feature envelope"
  $PY secure/baseline_anomaly.py train
  $PY secure/baseline_anomaly.py defend
}

case "$phase" in
  build)  build ;;
  break)  break_ ;;
  secure) secure ;;
  all)    build; break_; secure
          step "DONE · you built it, broke it three ways, and secured it two ways"
          echo "Read nids.html §4-§7 alongside these numbers." ;;
  *) echo "usage: ./run.sh [build|break|secure]   (no arg = all)"; exit 2 ;;
esac
