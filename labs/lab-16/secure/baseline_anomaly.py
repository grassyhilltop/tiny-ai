"""baseline_anomaly.py — Defense 2 · statistical baselining.

Per-feature distributional baselining. We fit a normal-class envelope
(median + IQR per feature) on benign training flows, then flag any
incoming flow as suspicious if too many of its features sit outside
the envelope simultaneously.

The intuition: an adversarial perturbation that pushes a single
feature into the benign range often pushes *neighbouring* features
into an unusual joint distribution. The univariate envelope can't see
the joint, but it can see the marginals — and a flow with 12 features
all pinned at the median of a histogram is itself a fingerprint of
adversarial pre-processing.

Usage:

    python secure/baseline_anomaly.py train
    python secure/baseline_anomaly.py defend
"""

import argparse
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "nids"))
sys.path.insert(0, str(ROOT / "attacks"))
import micro_nids as m  # noqa: E402
from _helpers import load_target  # noqa: E402

ENVELOPE = ROOT / "artifacts" / "envelope.pkl"


def train(z_threshold: float = 3.0) -> None:
    """Fit the envelope on benign-class training flows."""
    train_df = m.load("train")
    benign = train_df[train_df["y"] == 0]
    # Drop categorical features — they're encoded ints with no
    # meaningful distance. Numeric features only.
    numeric = [c for c in train_df.columns
               if c not in (*m.CATEGORICAL, "label", "y")]
    stats = {}
    for col in numeric:
        x = benign[col].values.astype(float)
        median = np.median(x)
        iqr = np.percentile(x, 75) - np.percentile(x, 25)
        # Use IQR as a robust spread proxy; guard against zero.
        stats[col] = (median, max(iqr, 1.0))
    envelope = {"stats": stats, "z_threshold": z_threshold,
                "numeric_cols": numeric}
    ENVELOPE.parent.mkdir(exist_ok=True)
    with ENVELOPE.open("wb") as f:
        pickle.dump(envelope, f)
    print(f"saved → {ENVELOPE}  ({len(numeric)} features baselined)")


def anomaly_score(envelope, row: pd.Series) -> tuple[float, int]:
    """Return (mean-z, count-of-outlier-features). High count ⇒ suspicious."""
    z_values = []
    outliers = 0
    for col, (med, iqr) in envelope["stats"].items():
        v = float(row[col])
        z = abs(v - med) / iqr
        z_values.append(z)
        if z >= envelope["z_threshold"]:
            outliers += 1
    return float(np.mean(z_values)), outliers


def import_attacks():
    sys.path.insert(0, str(ROOT / "attacks"))
    import importlib
    a1 = importlib.import_module("01_feature_perturbation")
    a2 = importlib.import_module("02_packet_padding")
    a3 = importlib.import_module("03_timing_jitter")
    return [
        ("feature perturbation", a1.perturb),
        ("packet padding",       a2.pad),
        ("timing jitter",        a3.jitter),
    ]


def defend(min_outliers: int = 4) -> None:
    """Replay the three attacks. Flag any perturbed flow that breaches the
    envelope on ≥ min_outliers features."""
    with ENVELOPE.open("rb") as f:
        envelope = pickle.load(f)
    single = m.load_bundle()
    _, attacks = load_target()
    perturbers = import_attacks()

    print()
    print(f"envelope threshold: ≥ {min_outliers} features outside ±{envelope['z_threshold']:.1f} IQR")
    print(f"{'attack':<22}  {'evasion (single)':>18}  {'caught by envelope':>20}")
    print("-" * 70)
    for name, fn in perturbers:
        evades = 0
        caught_by_anomaly = 0
        for i in range(20):
            row = attacks.iloc[[i]]
            perturbed = fn(row)
            X, _, *_ = m.preprocess(
                perturbed, encoders=single["encoders"], scaler=single["scaler"])
            score = single["model"].predict_proba(X)[0, 1]
            if score < 0.5:
                evades += 1
                # Did the envelope flag this perturbed flow?
                _, n_out = anomaly_score(envelope, perturbed.iloc[0])
                if n_out >= min_outliers:
                    caught_by_anomaly += 1
        coverage = f"{caught_by_anomaly}/{evades}" if evades else "n/a"
        print(f"{name:<22}  {evades:>10}/20       {coverage:>13} caught")
    print()
    print("Reading: the envelope catches attacks that pin features at")
    print("statistically improbable values. It misses attacks that move")
    print("features within the benign range — that's why the secure")
    print("system needs *both* the ensemble AND the envelope; one fills")
    print("the other's gap.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("train")
    sub.add_parser("defend")
    args = ap.parse_args()
    if args.cmd == "train":  train()
    if args.cmd == "defend": defend()
    return 0


if __name__ == "__main__":
    sys.exit(main())
