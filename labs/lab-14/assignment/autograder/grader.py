#!/usr/bin/env python3
"""Gradescope grader for the Lab 14 retriever-hardening assignment.

Imports the student's assignment.py, calls rank(), and scores four checks
(100 pts, fully automatic):

    benign retrieval    40  (4 queries x 10 — right document on top)
    grounding gate      25  (out-of-corpus query must REFUSE)
    diversity cap       25  ('database' must not be all one source)
    contract            10  (rank returns None or <=TOP_K valid ids)

Local use (grade the reference solution or any folder with assignment.py):

    python3 grader.py --submission ../solution
    python3 grader.py --submission ..            # the unedited template -> 50

Pure Python 3 stdlib.
"""
import argparse, importlib.util, json, os, sys, traceback
from collections import Counter

GS_SUB = "/autograder/submission"
GS_RES = "/autograder/results/results.json"

BENIGN = [
    ("reset my password okta",          "password.md"),
    ("vpn globalprotect access",        "network.md"),
    ("postgresql database hostname",    "database.md"),
    ("new hire orientation onboarding", "onboarding.md"),
]
NONSENSE  = "flibberjab wuzzle qxzzy"
DIVERSE_Q = "database"


def find_assignment(d):
    if os.path.isfile(os.path.join(d, "assignment.py")):
        return os.path.join(d, "assignment.py")
    for root, _dirs, files in os.walk(d):
        if "assignment.py" in files:
            return os.path.join(root, "assignment.py")
    return None


def load(path):
    spec = importlib.util.spec_from_file_location("assignment", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["assignment"] = mod
    spec.loader.exec_module(mod)
    return mod


def doc_of(cid):
    return cid.split("#")[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--submission", default=GS_SUB)
    ap.add_argument("--results", default=GS_RES)
    args = ap.parse_args()

    tests = []
    def add(name, score, mx, output):
        tests.append({"name": name, "score": round(float(score), 2),
                      "max_score": mx, "output": output})

    path = find_assignment(os.path.abspath(args.submission))
    if path is None:
        add("Submission check", 0, 100,
            "No assignment.py found in your submission. Upload assignment.py.")
        write(args.results, tests); return
    try:
        mod = load(path)
    except Exception:
        add("Import assignment.py", 0, 100,
            "assignment.py could not be imported:\n" + traceback.format_exc())
        write(args.results, tests); return
    if not hasattr(mod, "rank"):
        add("rank() present", 0, 100, "assignment.py has no rank() function.")
        write(args.results, tests); return

    valid = {c["id"] for c in mod.CORPUS}
    top_k = getattr(mod, "TOP_K", 4)

    def contract_ok(r):
        if r is None:
            return True
        return (isinstance(r, list) and len(r) <= top_k
                and all(isinstance(x, str) and x in valid for x in r))

    # benign
    for q, want in BENIGN:
        try:
            r = mod.rank(q)
            ok = isinstance(r, list) and r and doc_of(r[0]) == want and contract_ok(r)
            add(f"Benign retrieval: {q!r} -> {want} on top", 10 if ok else 0, 10,
                "ok" if ok else f"expected top result from {want}, got {r}")
        except Exception:
            add(f"Benign retrieval: {q!r} -> {want} on top", 0, 10, traceback.format_exc())

    # grounding
    try:
        r = mod.rank(NONSENSE)
        ok = r is None
        add("Grounding gate: out-of-corpus query REFUSES", 25 if ok else 0, 25,
            "ok" if ok else f"expected None (REFUSE) for a no-match query, got {r!r}")
    except Exception:
        add("Grounding gate: out-of-corpus query REFUSES", 0, 25, traceback.format_exc())

    # diversity
    try:
        r = mod.rank(DIVERSE_Q)
        if isinstance(r, list) and r:
            counts = Counter(doc_of(x) for x in r)
            ok = max(counts.values()) <= 2 and len(counts) >= 2
            add("Diversity cap: 'database' <=2 per source, >=2 sources",
                25 if ok else 0, 25,
                "ok" if ok else f"per-source counts {dict(counts)} in {r}")
        else:
            add("Diversity cap: 'database' <=2 per source, >=2 sources", 0, 25,
                f"expected a list of chunk ids, got {r!r}")
    except Exception:
        add("Diversity cap: 'database' <=2 per source, >=2 sources", 0, 25, traceback.format_exc())

    # contract
    try:
        bad = []
        for q, _ in BENIGN + [(NONSENSE, None), (DIVERSE_Q, None)]:
            if not contract_ok(mod.rank(q)):
                bad.append(q)
        add("Contract: rank() returns None or <=TOP_K valid ids",
            10 if not bad else 0, 10, "ok" if not bad else f"malformed response for: {bad}")
    except Exception:
        add("Contract: rank() returns None or <=TOP_K valid ids", 0, 10, traceback.format_exc())

    write(args.results, tests)


def write(results_path, tests):
    total = sum(t["score"] for t in tests)
    out_of = sum(t["max_score"] for t in tests)
    payload = {"score": round(total, 2), "tests": tests,
               "output": f"Autograder: {total:g}/{out_of}. "
                         "See per-test output below. The write-up is graded separately."}
    os.makedirs(os.path.dirname(results_path) or ".", exist_ok=True)
    with open(results_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
