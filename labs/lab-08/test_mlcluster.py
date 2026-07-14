#!/usr/bin/env python3
"""
Autograder for Lab 08 - cluster Shodan-style banners into campaigns.

Pure Python standard library only (no numpy, no scikit-learn). It spawns the
student's mlcluster.py as a subprocess, reads the JSON label array off stdout,
and scores it against the hidden ground-truth campaign labels with the
Adjusted Rand Index (ARI), implemented from scratch below.

Two test groups, same pass/fail style as the other labs' graders:

  SCAFFOLD  - runs on the UNEDITED stub. Checks that mlcluster.py prints a
              parseable JSON list of ints whose length equals the number of
              banners. Proves the scaffolding works before any real logic.
  QUALITY   - the actual clustering quality bar: ARI(pred, truth) >= 0.60.
              The all-zeros stub fails this; a real TF-IDF + clustering
              solution passes it.

Exit code is non-zero if SCAFFOLD fails (the student's harness is broken).
"""

import json
import os
import subprocess
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "mlcluster.py")
DATA = os.path.join(HERE, "mlcluster_banners.json")

ARI_THRESHOLD = 0.60

# ---------------------------------------------------------------------------
# Ground truth -- do not peek if you're the student.
# One label per banner, in id order. Labels 0..5 are the six real
# botnet/scanner campaigns (Dropbear-SSH, hakai self-signed TLS, GoAhead-Webs
# IoT cameras, Mirai/BusyBox Telnet, nginx+PHP webshell, Dahua RTSP). Labels
# 6..33 are legitimate, unrelated "noise" services -- each gets its OWN unique
# label, because a real benign host "should not cluster with anything". The
# scorer (ARI) is permutation-invariant, so the specific integers don't matter,
# only the grouping does.
# ---------------------------------------------------------------------------
GROUND_TRUTH = [
    4, 2, 6, 1, 2, 5, 4, 5, 0, 4, 4, 7, 2, 4, 0, 3, 4, 8, 1, 9,
    0, 3, 2, 5, 1, 5, 3, 3, 5, 2, 0, 0, 2, 4, 0, 1, 4, 0, 10, 0,
    1, 4, 11, 4, 1, 2, 5, 12, 3, 1, 13, 14, 1, 3, 5, 0, 5, 15, 2, 2,
    0, 2, 5, 2, 1, 1, 3, 3, 3, 4, 0, 3, 0, 4, 2, 2, 1, 1, 4, 0,
    16, 2, 0, 4, 2, 1, 0, 17, 0, 0, 3, 4, 4, 2, 1, 1, 5, 18, 3, 5,
    4, 1, 1, 1, 1, 1, 2, 19, 0, 2, 20, 21, 0, 4, 3, 0, 0, 0, 1, 1,
    1, 0, 5, 1, 0, 5, 0, 0, 5, 0, 5, 22, 23, 3, 4, 24, 3, 0, 3, 3,
    25, 4, 3, 1, 2, 3, 5, 3, 0, 2, 4, 5, 26, 5, 4, 2, 2, 2, 3, 27,
    2, 3, 28, 3, 4, 2, 29, 30, 3, 31, 1, 1, 4, 0, 2, 1, 3, 3, 5, 5,
    3, 5, 3, 0, 4, 1, 2, 0, 1, 4, 32, 3, 0, 2, 33, 3, 5, 0,
]


# --------------------------- ARI (pure stdlib) -----------------------------
def _comb2(n):
    """n choose 2."""
    return n * (n - 1) // 2


def adjusted_rand_index(labels_true, labels_pred):
    """Adjusted Rand Index, computed directly from the contingency table.

    ARI = (sum_ij C(n_ij,2) - E) / (0.5*(sum_i C(a_i,2)+sum_j C(b_j,2)) - E)
    where E = (sum_i C(a_i,2) * sum_j C(b_j,2)) / C(n,2).
    Returns 1.0 for a perfect match; ~0 for random labelings.
    """
    assert len(labels_true) == len(labels_pred)
    n = len(labels_true)
    if n == 0:
        return 1.0

    # contingency table: count of items per (true, pred) pair
    contingency = Counter(zip(labels_true, labels_pred))
    a = Counter(labels_true)   # row sums
    b = Counter(labels_pred)   # column sums

    sum_comb_cells = sum(_comb2(v) for v in contingency.values())
    sum_comb_a = sum(_comb2(v) for v in a.values())
    sum_comb_b = sum(_comb2(v) for v in b.values())

    total_comb = _comb2(n)
    if total_comb == 0:
        return 1.0

    expected = (sum_comb_a * sum_comb_b) / total_comb
    max_index = 0.5 * (sum_comb_a + sum_comb_b)
    denom = max_index - expected
    if denom == 0:
        # both labelings put everything in one cluster (or all singletons):
        # they agree perfectly iff the cell sum equals the expected value.
        return 1.0
    return (sum_comb_cells - expected) / denom


# ------------------------------- runner ------------------------------------
def run_student():
    """Spawn mlcluster.py and parse its stdout as a JSON list."""
    proc = subprocess.run(
        [sys.executable, SCRIPT],
        capture_output=True, text=True, cwd=HERE, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(
            "mlcluster.py exited %d\n--- stderr ---\n%s"
            % (proc.returncode, proc.stderr.strip()))
    out = proc.stdout.strip()
    try:
        labels = json.loads(out)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            "stdout was not valid JSON: %s\n--- first 200 chars ---\n%s"
            % (e, out[:200]))
    return labels


def main():
    n_expected = len(GROUND_TRUTH)
    with open(DATA) as f:
        n_data = len(json.load(f))
    assert n_data == n_expected, (
        "dataset has %d records but ground truth has %d" % (n_data, n_expected))

    print("=" * 60)
    print("Lab 08 autograder - banner campaign clustering")
    print("=" * 60)

    scaffold_ok = True
    quality_ok = False
    ari = None

    # --- SCAFFOLD ---------------------------------------------------------
    print("\n[SCAFFOLD] harness produces a valid label array")
    try:
        labels = run_student()
        checks = [
            ("output is a list", isinstance(labels, list)),
            ("all labels are ints",
             all(isinstance(x, int) for x in labels) if isinstance(labels, list) else False),
            ("length == #banners (%d)" % n_expected,
             isinstance(labels, list) and len(labels) == n_expected),
        ]
        for name, ok in checks:
            print("  [%s] %s" % ("PASS" if ok else "FAIL", name))
            scaffold_ok = scaffold_ok and ok
    except Exception as e:
        scaffold_ok = False
        print("  [FAIL] mlcluster.py did not run cleanly")
        print("         " + str(e).replace("\n", "\n         "))

    # --- QUALITY ----------------------------------------------------------
    print("\n[QUALITY] Adjusted Rand Index vs hidden campaigns (>= %.2f)"
          % ARI_THRESHOLD)
    if scaffold_ok:
        ari = adjusted_rand_index(GROUND_TRUTH, labels)
        quality_ok = ari >= ARI_THRESHOLD
        print("  ARI = %.4f" % ari)
        print("  [%s] ARI >= %.2f" % ("PASS" if quality_ok else "FAIL", ARI_THRESHOLD))
    else:
        print("  [SKIP] scaffold failed; not scoring quality")

    # --- summary ----------------------------------------------------------
    print("\n" + "-" * 60)
    print("SUMMARY: SCAFFOLD %s | QUALITY %s%s" % (
        "PASS" if scaffold_ok else "FAIL",
        "PASS" if quality_ok else "FAIL",
        "" if ari is None else " (ARI=%.4f)" % ari))
    print("-" * 60)

    # Non-zero only when the scaffold itself is broken; a failing QUALITY bar
    # on the unedited stub is expected and is not a hard error.
    if not scaffold_ok:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
