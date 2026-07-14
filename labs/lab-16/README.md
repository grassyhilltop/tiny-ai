# Lab 16 — microNIDS (build → break → secure)

DS 6042 · Module 6 · ~2h15m in class + 3-hour assignment.

The smallest readable ML-based Network Intrusion Detection System.
Gradient-boosted trees on NSL-KDD flow features. Three adversarial
flow attacks. Two layered defenses. Read top to bottom in ~180 lines.

## Files

```
lab-16/
├── nids.html                ← walkthrough page (student-facing)
├── styles.css, viz.js
├── README.md
├── lab-16-code.zip
│
├── nids/
│   └── micro_nids.py        ← the whole pipeline (~180 lines)
├── data/
│   ├── nslkdd_sample.csv    ← 4,000-row offline sample (~560 KB)
│   ├── KDDTrain+.txt        ← full NSL-KDD train (~125k flows)
│   └── KDDTest+.txt         ← full NSL-KDD test (~22k flows)
├── attacks/
│   ├── _helpers.py
│   ├── 01_feature_perturbation.py
│   ├── 02_packet_padding.py
│   └── 03_timing_jitter.py
├── secure/
│   ├── ensemble_nids.py     ← Defense 1 · model-diversity ensemble
│   └── baseline_anomaly.py  ← Defense 2 · per-feature envelope
└── solution/
    └── NOTES.md             ← instructor notes
```

## Quick start — one command

```bash
cd Class/labs/lab-16
module load miniforge     # Rivanna only — gives you Python 3.13 (skip elsewhere if you already have 3.9+)
chmod +x ./run.sh         # make the script executable (only needed once)
./run.sh                  # venv + install + build → break → secure, all of it
```

`run.sh` creates a local `.venv`, installs the three dependencies, then runs
every step with headings. Re-run it any time — the venv and trained models are
cached. You can also run one phase at a time:

```bash
./run.sh build     # train + predict + explain
./run.sh break     # the three attacks
./run.sh secure    # the two defenses
```

### Or step by step

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r nids/requirements.txt

python nids/micro_nids.py train                 # build
python nids/micro_nids.py predict --row 0
python nids/micro_nids.py explain --top-k 8
python attacks/01_feature_perturbation.py       # break
python attacks/02_packet_padding.py
python attacks/03_timing_jitter.py
python secure/ensemble_nids.py train && python secure/ensemble_nids.py defend   # secure
python secure/baseline_anomaly.py train && python secure/baseline_anomaly.py defend
```

The full NSL-KDD splits (`KDDTrain+.txt`, `KDDTest+.txt`, ~22 MB) ship with the
lab, so every number matches the walkthrough exactly. If they're ever missing,
the code falls back to the bundled 4,000-row `nslkdd_sample.csv` automatically.

## Authorized use

Adversarial ML against ML-NIDS systems on production networks is
unauthorized access — felony under the CFAA, CMA, NIS2. The skills
generalize directly; the corresponding boundary is research disclosure
to the vendor, never live testing.

## Previous and next labs

- **Previous** — [Lab 15 · Attacking RAG](../lab-15/attack-rag.html).
- **Next** — Lab 17 · Adversarial examples / FGSM (forthcoming).
