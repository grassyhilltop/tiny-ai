# Lab 16 — Instructor Notes (microNIDS)

## What this lab is for

Two jobs:

1. **Anchor the course title.** "ML in Systems and Network Security"
   without a network-IDS lab is a broken promise. This is the lab where
   ML, network primitives, and adversarial security all meet.
2. **Set up Lab 17.** Adversarial examples on images (FGSM/PGD) are the
   same abstract attack — *gradient-following perturbation of model
   inputs to flip the decision* — applied to a different domain. By
   the time students reach Lab 17 they should be able to articulate
   "Lab 16 attacked features; Lab 17 attacks pixels."

## In-class teaching plan

- **0:00-0:15** — Walk §1 anatomy on the projector. The "five steps"
  diagram is the cognitive anchor for the rest of the class.
- **0:15-0:40** — Students train + predict + explain locally. The
  explain output (top-5 feature importance) becomes the key transition
  to the attack section. Pause and ask "if you knew the model
  depended on src_bytes most, what would you change first?" — the
  answer is the next 30 minutes.
- **0:40-1:15** — Students run all three attack scripts. Discuss the
  *very different* evasion rates (4/5, 2/5, 1/5) and what they tell us
  about attack space vs. feature space. Walk the exercise on why
  Saint survives feature perturbation but Neptune doesn't.
- **1:15-1:50** — Both defenses, both ways. The defenses **deliberately
  don't fully work**. Resist students' temptation to find "the answer"
  — there isn't one; the answer is layered, costly, and incomplete.
- **1:50-2:15** — Walk §8 (production NIDS context). The Snort/Suricata/
  Zeek + ML hybrid is what they should know exists.
- **2:15-2:30** — Assignment kickoff. The composite attack is the next
  natural move; students who get all three attacks combined into one
  script have demonstrated the structural lesson.

## Common student questions

- **"Why is the test accuracy only 80% if ROC-AUC is 0.96?"** — NSL-KDD
  test contains attack categories that aren't in train (it's a deliberate
  feature of the dataset). The model misses entire categories, dropping
  raw accuracy; AUC stays high because for the categories it does see,
  it's very confident. This is a useful illustration of why accuracy
  alone is a bad IDS metric.

- **"Should we use XGBoost instead of HistGradientBoosting?"** — Same
  family, identical API in the relevant subset. XGBoost / LightGBM are
  marginally faster at scale and more configurable; sklearn's HGB is the
  right pedagogical choice (no extra install, no native-lib pain). For
  production work, XGBoost is the industry standard — encourage students
  to do the one-line swap as an exercise.

- **"The envelope defense barely catches anything. Why include it?"** —
  Because the *failure mode* is instructive. The envelope catches
  attacks with unusual feature values; the attacker's job is to use
  *usual* values. This generalizes: most "anomaly detection" defenses
  fail the same way against calibrated attackers, and recognizing that
  family of failure mode is more valuable than knowing how to fix it.

## Assignment grading

The assignment has three deliverables:

- **04_composite.py** — combines Attacks 1+2+3 cleanly. Target ≥ 95%
  evasion on the 20-flow pool.
- **Third defense** — adversarial training, DPI features, or per-category
  one-vs-all. Should reduce composite-attack evasion by ≥ 30 percentage
  points.
- **writeup.md** — three sections (composite design, defense rationale,
  next-attack-class prediction).

Tier:

- 50-65 if both technical pieces work but the writeup is shallow
  (e.g., "regex doesn't work").
- 65-80 if the writeup correctly names the structural assumption the
  defense exploits.
- 80-100 if the next-attack-class prediction is sound and supported
  by reasoning about the assumption's failure mode.

Reject submissions where the "composite" is just the strongest of the
three attacks run alone. The point is the combination.

## Known limitations

- NSL-KDD is dated (1999 data with 2009 revisions). Results don't directly
  transfer to modern encrypted traffic, where the model can't see byte
  patterns. The lab's §8 walks the CIC-IDS2017 upgrade path as a Going
  Further extension.
- The "adversarial flow" perturbations are *feature-space* perturbations,
  not packet-level perturbations. A student who wants to generate actual
  PCAPs from perturbed flows would need a tool like Scapy. That's a
  legitimate follow-on but not part of this lab.
- The envelope defense uses median + IQR. A multi-variate approach
  (Mahalanobis distance, isolation forest) would catch more attacks
  but at the cost of more complexity. Students who want to extend
  this are welcome to.
- The model uses sklearn's `HistGradientBoostingClassifier`. Swapping in
  XGBoost or LightGBM is one line and gives marginally better results
  at the cost of an extra dependency.
