"""01_feature_perturbation.py — feature-space perturbation.

Threat model: the attacker has white-box access to the trained classifier
(read its feature importances or get gradients) and can craft attack
flows that perturb the most-important features into ranges the model
associates with benign traffic.

Constraint: the perturbed flow must still successfully complete the
attack. We restrict ourselves to features the attacker can manipulate
without breaking the underlying behavior — payload size (`src_bytes`,
`dst_bytes`), connection duration, count-of-similar-connections features.
Features like `protocol_type`, `service`, and `flag` are off-limits
(changing them would break the attack).

MITRE ATLAS T0043 — Craft Adversarial Data.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _helpers import load_target, score, banner, report  # noqa: E402


# Network-realistic bounds on each feature we'll perturb. These come from
# the NSL-KDD value distributions for the BENIGN class; we move the
# attacker's flow toward those distributions.
PERTURB_TARGETS = {
    "src_bytes":               (200,  2000),   # typical HTTP response
    "dst_bytes":               (500,  5000),
    "duration":                (1,    30),     # 1-30 seconds
    "count":                   (1,    8),      # low repetition
    "srv_count":               (1,    8),
    "diff_srv_rate":           (0.0,  0.1),
    "dst_host_srv_count":      (50,   200),
    "dst_host_same_srv_rate":  (0.8,  1.0),
    "dst_host_diff_srv_rate":  (0.0,  0.1),
}


def perturb(flow):
    """Return a perturbed copy of the flow with each PERTURB_TARGETS
    feature moved to the middle of its benign range."""
    flow = flow.copy()
    for col, (lo, hi) in PERTURB_TARGETS.items():
        if col not in flow.columns:
            continue
        flow[col] = (lo + hi) / 2
    return flow


def main() -> int:
    banner("Attack 1 · feature-space perturbation")
    bundle, attacks = load_target()

    # Take the first 5 attack flows and try the perturbation on each.
    wins = 0
    for i in range(min(5, len(attacks))):
        row = attacks.iloc[[i]]
        orig = score(bundle, row)
        perturbed = perturb(row)
        new = score(bundle, perturbed)
        print(f"\n--- flow {i} · category={row['label'].iloc[0]} ---")
        if report(orig, new):
            wins += 1

    print()
    print(f"{wins}/5 flows successfully disguised by feature perturbation.")
    print("Takeaway: nothing about the perturbation required new payloads or")
    print("new attack tools — only that the flow's *statistical fingerprint*")
    print("be reshaped to look like the benign-class distribution. A static")
    print("classifier on flow stats has no way to know the perturbation is")
    print("cosmetic.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
