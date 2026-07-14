"""Shared helpers for the Lab 16 attack scripts.

Each attack starts from a real attack-class flow from the test set,
perturbs it within network-valid constraints, and checks whether the
perturbed flow gets re-classified as benign by the trained classifier.
"""

from __future__ import annotations
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "nids"))
import micro_nids as m  # noqa: E402


def load_target():
    """Return (bundle, df_attacks) — model + a frame of test-set flows
    the classifier confidently labels as attack. These are the "hard" ones
    we try to disguise."""
    bundle = m.load_bundle()
    df = m.load("test")
    X, y, *_ = m.preprocess(
        df, encoders=bundle["encoders"], scaler=bundle["scaler"])
    proba = bundle["model"].predict_proba(X)[:, 1]
    # Keep only true attacks the model spots with confidence ≥ 0.9.
    mask = (df["y"].values == 1) & (proba >= 0.9)
    attacks = df.loc[mask].reset_index(drop=True)
    print(f"  pool: {len(attacks)} high-confidence attack flows")
    return bundle, attacks


def score(bundle, df_row: pd.DataFrame) -> float:
    """Score a single perturbed flow and return the attack probability."""
    X, _, *_ = m.preprocess(
        df_row, encoders=bundle["encoders"], scaler=bundle["scaler"])
    return float(bundle["model"].predict_proba(X)[0, 1])


def banner(s: str):
    print()
    print("=" * 70)
    print(s)
    print("=" * 70)


def report(orig: float, perturbed: float) -> bool:
    delta = orig - perturbed
    print(f"  original score      : {orig:.3f}")
    print(f"  after perturbation  : {perturbed:.3f}   (Δ = -{delta:.3f})")
    if perturbed < 0.5 <= orig:
        print("  ✓ EVASION SUCCEEDED — flow now classified as benign")
        return True
    print("  ✗ still classified as attack")
    return False
