"""micro_nids.py — the smallest readable ML-based Network IDS.

One file. Two paths (train + predict). Gradient-boosted trees on NSL-KDD
flow features. Stdlib + pandas + sklearn.

We use sklearn's HistGradientBoostingClassifier — the same family of
model as XGBoost and LightGBM, but with no native-library install dance.
For production deployments you'd swap in XGBoost or LightGBM and tune;
the calling code is identical.

How an ML-IDS works in ~180 lines:

    raw flows (NSL-KDD records)
       ↓
    preprocess  →  label-encode categoricals, scale numerics
       ↓
    train       →  fit XGBoost on labeled flows  →  model.pkl
       ↓
    predict     →  score a new flow              →  {benign, attack}
       ↓
    explain     →  SHAP / feature importance     →  what the model looks at

Run interactively:

    python nids/micro_nids.py train
    python nids/micro_nids.py predict --row 0
    python nids/micro_nids.py explain

That's the whole pipeline. Lab 16 §3 attacks every step of it.
"""

from __future__ import annotations
import argparse, json, pickle, sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance


HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
ARTIFACTS = HERE.parent / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)


# === DATA · NSL-KDD 41-feature schema ======================================
#
# Columns 0-40 are features; column 41 is the attack-category label;
# column 42 is a "difficulty" weight we drop. The dataset is on the
# internet; we ship a small sample (data/nslkdd_sample.csv) so the lab
# runs offline. The full corpus loads transparently if present.

COLUMNS = [
    "duration", "protocol_type", "service", "flag", "src_bytes", "dst_bytes",
    "land", "wrong_fragment", "urgent", "hot", "num_failed_logins", "logged_in",
    "num_compromised", "root_shell", "su_attempted", "num_root", "num_file_creations",
    "num_shells", "num_access_files", "num_outbound_cmds", "is_host_login",
    "is_guest_login", "count", "srv_count", "serror_rate", "srv_serror_rate",
    "rerror_rate", "srv_rerror_rate", "same_srv_rate", "diff_srv_rate",
    "srv_diff_host_rate", "dst_host_count", "dst_host_srv_count",
    "dst_host_same_srv_rate", "dst_host_diff_srv_rate", "dst_host_same_src_port_rate",
    "dst_host_srv_diff_host_rate", "dst_host_serror_rate", "dst_host_srv_serror_rate",
    "dst_host_rerror_rate", "dst_host_srv_rerror_rate", "label", "difficulty",
]

CATEGORICAL = ["protocol_type", "service", "flag"]


# === STEP 1 · LOAD =========================================================

def load(split: str = "train") -> pd.DataFrame:
    """Load NSL-KDD. Prefer the full file if present; fall back to the
    bundled sample so the lab runs without a download."""
    full = DATA / ("KDDTrain+.txt" if split == "train" else "KDDTest+.txt")
    sample = DATA / "nslkdd_sample.csv"
    if full.exists():
        df = pd.read_csv(full, header=None, names=COLUMNS)
        df = df.drop(columns=["difficulty"])
    elif sample.exists():
        df = pd.read_csv(sample)
    else:
        raise FileNotFoundError(
            f"No NSL-KDD data found. Put KDDTrain+.txt in {DATA} or "
            f"ship nslkdd_sample.csv."
        )
    # Binary label: anything not "normal" is an attack.
    df["y"] = (df["label"] != "normal").astype(int)
    return df


# === STEP 2 · PREPROCESS ===================================================
#
# Three categoricals get label-encoded; everything else is already numeric.
# We fit encoders + scaler on train, save them, and reuse at predict time.

def preprocess(df: pd.DataFrame, encoders=None, scaler=None):
    """Return (X, y, encoders, scaler). If encoders/scaler are None, fit
    them; otherwise just transform."""
    df = df.copy()
    if encoders is None:
        encoders = {}
        for col in CATEGORICAL:
            le = LabelEncoder().fit(df[col])
            df[col] = le.transform(df[col])
            encoders[col] = le
    else:
        for col in CATEGORICAL:
            le = encoders[col]
            # Unseen categories at predict time get folded onto the
            # most common class; not perfect, but it keeps the demo running.
            mask = df[col].isin(le.classes_)
            df.loc[~mask, col] = le.classes_[0]
            df[col] = le.transform(df[col])

    feature_cols = [c for c in df.columns if c not in ("label", "y")]
    X = df[feature_cols].values.astype(np.float32)
    y = df["y"].values.astype(np.int8)

    if scaler is None:
        scaler = StandardScaler().fit(X)
    X = scaler.transform(X).astype(np.float32)
    return X, y, encoders, scaler, feature_cols


# === STEP 3 · TRAIN ========================================================

def train(out: Path = ARTIFACTS / "model.pkl"):
    """Train XGB on train split, save model + encoders + scaler + feature
    names to one pickle for the predict and attack scripts to load."""
    train_df = load("train")
    X, y, encoders, scaler, feature_cols = preprocess(train_df)

    model = HistGradientBoostingClassifier(
        max_iter=200, max_depth=6, learning_rate=0.1,
        random_state=42,
    )
    model.fit(X, y)

    bundle = {
        "model": model, "encoders": encoders, "scaler": scaler,
        "feature_cols": feature_cols,
    }
    with out.open("wb") as f:
        pickle.dump(bundle, f)
    print(f"saved → {out}  ({X.shape[0]} training flows)")

    # Quick self-evaluation.
    test_df = load("test")
    Xt, yt, *_ = preprocess(test_df, encoders=encoders, scaler=scaler)
    yp = model.predict(Xt)
    yp_proba = model.predict_proba(Xt)[:, 1]
    print(classification_report(yt, yp, target_names=["benign", "attack"]))
    print(f"ROC-AUC: {roc_auc_score(yt, yp_proba):.4f}")
    return bundle


# === STEP 4 · PREDICT ======================================================

def load_bundle(path: Path = ARTIFACTS / "model.pkl") -> dict:
    with path.open("rb") as f:
        return pickle.load(f)


def predict(row_idx: int = 0, split: str = "test"):
    """Score one flow from the named split; print the verdict + score."""
    bundle = load_bundle()
    df = load(split)
    if row_idx >= len(df):
        sys.exit(f"row {row_idx} out of range for {split} (len={len(df)})")
    row = df.iloc[[row_idx]]
    X, y, *_ = preprocess(
        row, encoders=bundle["encoders"], scaler=bundle["scaler"])
    score = float(bundle["model"].predict_proba(X)[0, 1])
    pred = "attack" if score >= 0.5 else "benign"
    truth = "attack" if y[0] else "benign"
    print(f"row {row_idx} · score={score:.3f} · predicted={pred} · truth={truth}")
    return {"score": score, "predicted": pred, "truth": truth}


# === STEP 5 · EXPLAIN ======================================================
#
# Permutation importance: for each feature, shuffle its column in the test
# set and measure how much the model's accuracy drops. Bigger drop ⇒ more
# the model relied on that feature. Model-agnostic, slower than gain-based
# importance but works for any classifier.

def explain(top_k: int = 10, n_repeats: int = 5, sample: int = 2000):
    bundle = load_bundle()
    model, feat = bundle["model"], bundle["feature_cols"]
    test_df = load("test").sample(n=min(sample, 22000), random_state=42)
    X, y, *_ = preprocess(
        test_df, encoders=bundle["encoders"], scaler=bundle["scaler"])
    # n_jobs=1 (in-process), NOT -1/parallel: permutation_importance parallelizes
    # by spawning loky worker PROCESSES, each of which reloads numpy and copies
    # the data. On a memory-constrained node those workers get OOM-killed
    # (TerminatedWorkerError). Running in-process is a touch slower on this tiny
    # 2,000-row sample but never falls over. See run.sh for the thread caps.
    pi = permutation_importance(model, X, y, n_repeats=n_repeats,
                                random_state=42, n_jobs=1)
    imp = sorted(zip(feat, pi.importances_mean),
                 key=lambda kv: -kv[1])[:top_k]
    width = max(len(f) for f, _ in imp)
    print(f"top-{top_k} features by permutation importance:")
    top_val = max(v for _, v in imp) or 1.0
    for f, v in imp:
        bar = "█" * int(max(v, 0) * 60 / top_val)
        print(f"  {f:<{width}}  {v:.4f}  {bar}")
    return imp


# === CLI ===================================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("train", help="train + save the model bundle")
    p_pred = sub.add_parser("predict", help="score one flow")
    p_pred.add_argument("--row", type=int, default=0)
    p_pred.add_argument("--split", default="test", choices=["train", "test"])
    p_exp = sub.add_parser("explain", help="top-K feature importances")
    p_exp.add_argument("--top-k", type=int, default=10)
    args = ap.parse_args()
    if args.cmd == "train":   train()
    if args.cmd == "predict": predict(args.row, args.split)
    if args.cmd == "explain": explain(args.top_k)


if __name__ == "__main__":
    main()
