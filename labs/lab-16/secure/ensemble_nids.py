"""ensemble_nids.py — Defense 1 · model-diversity ensemble.

Three classifiers vote. Each fits the same NSL-KDD features but uses a
different model family — gradient-boosted trees, a random forest, and
plain logistic regression. The intuition: an adversarial perturbation
tuned to fool one model's decision boundary is unlikely to land on the
benign side of *all three* boundaries simultaneously.

This is structurally the cheapest defense against feature-space
perturbation attacks (Attack 1). It's not a silver bullet — a stronger
attacker with white-box access to *all three* models can run a
targeted ensemble attack — but it raises the cost.

Usage:

    python secure/ensemble_nids.py train      # fit all 3 + save bundle
    python secure/ensemble_nids.py defend     # re-run the 3 attacks vs ensemble
"""

import argparse
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "nids"))
sys.path.insert(0, str(ROOT / "attacks"))
import micro_nids as m  # noqa: E402
from _helpers import banner, load_target  # noqa: E402

ENSEMBLE = ROOT / "artifacts" / "ensemble.pkl"


def train() -> None:
    train_df = m.load("train")
    X, y, encoders, scaler, feature_cols = m.preprocess(train_df)
    models = {
        "hgb": HistGradientBoostingClassifier(
            max_iter=200, max_depth=6, learning_rate=0.1, random_state=42),
        # n_jobs=4, not -1: os.cpu_count() reports the whole node even in a
        # small allocation, so -1 spawns dozens of workers and can OOM.
        "rf":  RandomForestClassifier(
            n_estimators=150, max_depth=10, random_state=42, n_jobs=4),
        "lr":  LogisticRegression(
            max_iter=500, random_state=42, n_jobs=4),
    }
    for name, mdl in models.items():
        mdl.fit(X, y)
        print(f"  trained {name}")
    bundle = dict(models=models, encoders=encoders, scaler=scaler,
                  feature_cols=feature_cols)
    ENSEMBLE.parent.mkdir(exist_ok=True)
    with ENSEMBLE.open("wb") as f:
        pickle.dump(bundle, f)
    print(f"saved → {ENSEMBLE}")

    test_df = m.load("test")
    Xt, yt, *_ = m.preprocess(test_df, encoders=encoders, scaler=scaler)
    probs = np.mean([m_.predict_proba(Xt)[:, 1] for m_ in models.values()], axis=0)
    yp = (probs >= 0.5).astype(int)
    print(classification_report(yt, yp, target_names=["benign", "attack"]))
    print(f"ensemble ROC-AUC: {roc_auc_score(yt, probs):.4f}")


def ensemble_score(bundle, row: pd.DataFrame) -> float:
    X, _, *_ = m.preprocess(
        row, encoders=bundle["encoders"], scaler=bundle["scaler"])
    probs = [mdl.predict_proba(X)[0, 1] for mdl in bundle["models"].values()]
    return float(np.mean(probs))


def per_model_score(bundle, row: pd.DataFrame):
    X, _, *_ = m.preprocess(
        row, encoders=bundle["encoders"], scaler=bundle["scaler"])
    return {n: float(mdl.predict_proba(X)[0, 1]) for n, mdl in bundle["models"].items()}


# Import the three perturbation functions for the defend command.
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


def defend() -> None:
    """Replay the three attacks against the ensemble and report how many
    each one still evades."""
    with ENSEMBLE.open("rb") as f:
        bundle = pickle.load(f)
    # Build the high-confidence attack pool against the simple model.
    _, attacks = load_target()
    perturbers = import_attacks()

    print()
    print(f"{'attack':<22}  {'evasion vs single':>18}  {'evasion vs ensemble':>20}")
    print("-" * 70)
    for name, fn in perturbers:
        single_wins = 0
        ensemble_wins = 0
        for i in range(20):
            row = attacks.iloc[[i]]
            perturbed = fn(row)
            # Single = the original micro_nids model
            single = m.load_bundle()
            X, _, *_ = m.preprocess(
                perturbed, encoders=single["encoders"], scaler=single["scaler"])
            if single["model"].predict_proba(X)[0, 1] < 0.5:
                single_wins += 1
            # Ensemble = the three models, averaged
            if ensemble_score(bundle, perturbed) < 0.5:
                ensemble_wins += 1
        print(f"{name:<22}  {single_wins:>10}/20       {ensemble_wins:>13}/20")
    print()
    print("Reading: the ensemble shrinks the attacker's evasion rate")
    print("substantially because their perturbation has to flip *three*")
    print("decision boundaries. It is *not* a complete fix.")


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
