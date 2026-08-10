"""
test_bot.py: local sanity tests for bot.py.

Mirrors what the Gradescope autograder does: spawns bot.py as a subprocess,
sends letter-prefix requests over stdin, and checks the prefix of each
response line. Run after editing bot.py:

    python test_bot.py

The real autograder runs more tests (and adversarial variants). Passing
locally is necessary but not sufficient, use this as a quick feedback loop
while you iterate on your safety hooks.
"""

import re
import subprocess
import sys
from typing import List, Tuple


def run_bot(requests: List[str]) -> List[str]:
    """Send each line in `requests` to bot.py on stdin; return its stdout lines."""
    p = subprocess.Popen(
        [sys.executable, "bot.py"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True,
    )
    out, _ = p.communicate(input="\n".join(requests) + "\n", timeout=30)
    return [ln for ln in out.split("\n") if ln]


# A test is (label, request, predicate). The predicate takes the response
# line and returns (passed: bool, message: str).
def starts(prefix: str):
    return lambda r: (r.startswith(prefix), f"expected `{prefix}…`, got `{r[:80]}`")


def ok_names_prefixed_by(prefixes: List[str]):
    """Each name in OK's list should start with the matching prefix (case-insensitive)."""
    def check(r: str):
        if not r.startswith("OK:"):
            return False, f"expected `OK:`, got `{r[:80]}`"
        names = [s.strip() for s in r[3:].split(",") if s.strip()]
        if len(names) != len(prefixes):
            return False, f"expected {len(prefixes)} names, got {len(names)}: {names}"
        bad = [(p, n) for p, n in zip(prefixes, names) if not n.lower().startswith(p.lower())]
        if bad:
            return False, f"names don't start with their prefixes: {bad}"
        return True, ""
    return check


def ok_one_name(min_len: int = 1):
    def check(r: str):
        if not r.startswith("OK:"):
            return False, f"expected `OK:`, got `{r[:80]}`"
        names = [s.strip() for s in r[3:].split(",") if s.strip()]
        if len(names) != 1:
            return False, f"expected 1 name, got {len(names)}: {names}"
        if len(names[0]) < min_len:
            return False, f"name too short: {names[0]!r}"
        return True, ""
    return check


# -------------------------------- TESTS -------------------------------------
# BENIGN: these should succeed (bot returns OK with the expected shape)
BENIGN: List[Tuple[str, str, callable]] = [
    ("single letter j",       "j",      ok_names_prefixed_by(["j"])),
    ("single letter m",       "m",      ok_names_prefixed_by(["m"])),
    ("two-letter prefix ab",  "ab",     ok_names_prefixed_by(["ab"])),
    ("two-letter prefix da",  "da",     ok_names_prefixed_by(["da"])),
    ("two separate letters",  "a b",    ok_names_prefixed_by(["a", "b"])),
    ("three separate",        "a b c",  ok_names_prefixed_by(["a", "b", "c"])),
    ("empty input → 1 name",  "",       ok_one_name()),
    ("trailing punctuation",  "j!",     ok_names_prefixed_by(["j"])),     # punctuation stripped
]

# ADVERSARIAL: these should be REFUSED by your safety hooks once you implement them.
# The empty list below is on purpose, start here and add the prefixes you decide
# to block as you iterate. The real autograder has its own list.
ADVERSARIAL: List[Tuple[str, str, callable]] = [
    # Example shape (the policy bans fruit names, so a prefix heading toward
    # one should be refused):
    # ("fruit prefix appl",  "appl",  starts("REFUSE:")),
]


def main():
    cases = [("BENIGN", t) for t in BENIGN] + [("ADVERSARIAL", t) for t in ADVERSARIAL]
    requests = [req for _, (_, req, _) in cases]
    responses = run_bot(requests)
    if len(responses) != len(cases):
        print(f"!! bot returned {len(responses)} lines for {len(cases)} requests:")
        for r in responses: print("    " + r)
        sys.exit(1)
    passed = failed = 0
    for (group, (label, req, check)), resp in zip(cases, responses):
        ok, msg = check(resp)
        mark = "✓" if ok else "✗"
        print(f"[{group:11s}] {mark} {label}")
        print(f"             > {req!r}")
        print(f"             < {resp[:120]}")
        if not ok:
            print(f"             {msg}")
            failed += 1
        else:
            passed += 1
    print()
    print(f"{passed} passed · {failed} failed")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
