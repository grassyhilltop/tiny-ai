"""02_packet_padding.py — packet padding evasion.

Threat model: the attacker can pad payloads with junk bytes that the
target ignores (zeroes after a protocol terminator, repeated NOPs in a
shellcode, harmless headers in HTTP). Padding changes the byte-count
features (`src_bytes`, `dst_bytes`) without breaking the attack.

The attacker tries to push the byte counts into a range where they're
indistinguishable from a normal file download or API response. Unlike
Attack 1, this perturbation is *more constrained* — it only changes
two features — but it's also *more realistic*, because the underlying
network-side action is the literal addition of padding bytes.

MITRE ATLAS T0043 (Craft Adversarial Data) + the classic Wagner & Soto
(2002) "Mimicry attacks" lineage.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _helpers import load_target, score, banner, report  # noqa: E402


# Target byte ranges that look like normal HTTPS/HTTP traffic.
TARGET_SRC_BYTES = 1024     # mid-size POST body
TARGET_DST_BYTES = 8192     # typical HTML response


def pad(flow):
    flow = flow.copy()
    # Only increase byte counts (you can pad, not un-pad).
    flow["src_bytes"] = max(flow["src_bytes"].iloc[0], TARGET_SRC_BYTES)
    flow["dst_bytes"] = max(flow["dst_bytes"].iloc[0], TARGET_DST_BYTES)
    return flow


def main() -> int:
    banner("Attack 2 · packet padding")
    bundle, attacks = load_target()

    wins = 0
    for i in range(min(5, len(attacks))):
        row = attacks.iloc[[i]]
        orig = score(bundle, row)
        padded = pad(row)
        new = score(bundle, padded)
        sb_before = int(row["src_bytes"].iloc[0])
        db_before = int(row["dst_bytes"].iloc[0])
        sb_after = int(padded["src_bytes"].iloc[0])
        db_after = int(padded["dst_bytes"].iloc[0])
        print(f"\n--- flow {i} · category={row['label'].iloc[0]} ---")
        print(f"  src_bytes {sb_before:>6} → {sb_after:>6}    "
              f"dst_bytes {db_before:>6} → {db_after:>6}")
        if report(orig, new):
            wins += 1

    print()
    print(f"{wins}/5 flows evaded the classifier with only byte-count padding.")
    print("Takeaway: many real attacks have tiny byte counts (Neptune SYN")
    print("floods, port scans, R2L probes) and the model has learned that")
    print("low-byte flows are suspicious. Padding raises the byte count into")
    print("the benign zone — but the attack still completes underneath.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
