"""03_timing_jitter.py — duration / count perturbation.

Threat model: the attacker can slow down the attack or break it across
many flows. Both reshape the count-of-similar-connections features
that the classifier relies on (`count`, `srv_count`, `dst_host_count`,
`dst_host_srv_count`, `serror_rate`, etc.).

This is the "slow and low" attacker variant. A Neptune SYN flood that
opens 500 connections per second is trivial to detect — the count
features all spike. The same Neptune attack at one connection per
minute is invisible to a count-window-based classifier.

MITRE ATLAS T0043 (Craft Adversarial Data) + the classic "slow rate"
DoS technique used by Slowloris and friends.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _helpers import load_target, score, banner, report  # noqa: E402


def jitter(flow):
    """Stretch the attack out: longer duration, lower repetition counts,
    lower error rates (because we're spaced out enough to not retry)."""
    flow = flow.copy()
    flow["duration"] = max(int(flow["duration"].iloc[0]), 120)  # ≥ 2 minutes
    flow["count"] = 1
    flow["srv_count"] = 1
    flow["serror_rate"] = 0.0
    flow["srv_serror_rate"] = 0.0
    flow["dst_host_count"] = min(int(flow["dst_host_count"].iloc[0]), 5)
    flow["dst_host_srv_count"] = min(int(flow["dst_host_srv_count"].iloc[0]), 5)
    flow["dst_host_serror_rate"] = 0.0
    flow["dst_host_srv_serror_rate"] = 0.0
    return flow


def main() -> int:
    banner("Attack 3 · timing / count perturbation (slow-and-low)")
    bundle, attacks = load_target()

    wins = 0
    for i in range(min(5, len(attacks))):
        row = attacks.iloc[[i]]
        orig = score(bundle, row)
        slow = jitter(row)
        new = score(bundle, slow)
        cnt_b = int(row["count"].iloc[0])
        cnt_a = int(slow["count"].iloc[0])
        dur_b = int(row["duration"].iloc[0])
        dur_a = int(slow["duration"].iloc[0])
        print(f"\n--- flow {i} · category={row['label'].iloc[0]} ---")
        print(f"  duration {dur_b:>5} → {dur_a:>5} s    "
              f"count {cnt_b:>4} → {cnt_a:>4}")
        if report(orig, new):
            wins += 1

    print()
    print(f"{wins}/5 flows evaded the classifier via slow-and-low timing.")
    print("Takeaway: every count-window feature in NSL-KDD assumes the")
    print("attacker is rushing. An attacker who can wait — Slowloris-style")
    print("DoS, drip-feed port scans — empties those features into the")
    print("benign distribution.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
