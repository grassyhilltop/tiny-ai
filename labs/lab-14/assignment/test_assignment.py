"""test_assignment.py — local autograder for the Lab 14 retriever-hardening task.

Run it from the folder that holds your assignment.py:

    python3 test_assignment.py

It imports your rank() and checks four things. The Gradescope autograder runs
the same checks (plus hidden variants) — passing locally is necessary, not
sufficient. Pure Python 3 stdlib.
"""
import importlib, sys
from collections import Counter

BENIGN = [
    ("reset my password okta",         "password.md"),
    ("vpn globalprotect access",       "network.md"),
    ("postgresql database hostname",   "database.md"),
    ("new hire orientation onboarding","onboarding.md"),
]
NONSENSE   = "flibberjab wuzzle qxzzy"   # nothing in the corpus matches
DIVERSE_Q  = "database"                   # every chunk of database.md matches


def doc_of(chunk_id):
    return chunk_id.split("#")[0]


def grade(mod):
    valid = {c["id"] for c in mod.CORPUS}
    top_k = getattr(mod, "TOP_K", 4)
    results = []   # (name, points, max, detail)

    def contract_ok(r):
        if r is None:
            return True
        return (isinstance(r, list) and len(r) <= top_k
                and all(isinstance(x, str) and x in valid for x in r))

    # --- BENIGN retrieval: right doc on top (10 pts each) ---
    for q, want in BENIGN:
        try:
            r = mod.rank(q)
            ok = contract_ok(r) and isinstance(r, list) and r and doc_of(r[0]) == want
            results.append((f"benign: {q!r} -> top is {want}", 10 if ok else 0, 10,
                            f"got {r}"))
        except Exception as e:
            results.append((f"benign: {q!r} -> top is {want}", 0, 10, f"raised {e!r}"))

    # --- GROUNDING gate: nonsense query must REFUSE (25) ---
    try:
        r = mod.rank(NONSENSE)
        ok = r is None
        results.append(("grounding gate: nonsense query REFUSES (returns None)",
                        25 if ok else 0, 25, f"got {r!r}, expected None"))
    except Exception as e:
        results.append(("grounding gate: nonsense query REFUSES (returns None)", 0, 25, f"raised {e!r}"))

    # --- DIVERSITY cap: 'database' must not be all one source (25) ---
    try:
        r = mod.rank(DIVERSE_Q)
        if not isinstance(r, list) or not r:
            results.append(("diversity cap: 'database' <=2 per source, >=2 sources", 0, 25,
                            f"expected a list of chunk ids, got {r!r}"))
        else:
            counts = Counter(doc_of(x) for x in r)
            capped = max(counts.values()) <= 2
            diverse = len(counts) >= 2
            ok = capped and diverse
            results.append(("diversity cap: 'database' <=2 per source, >=2 sources",
                            25 if ok else 0, 25,
                            f"got {r} (per-source counts {dict(counts)})"))
    except Exception as e:
        results.append(("diversity cap: 'database' <=2 per source, >=2 sources", 0, 25, f"raised {e!r}"))

    # --- CONTRACT: every response is well-formed (10) ---
    try:
        bad = []
        for q, _ in BENIGN + [(NONSENSE, None), (DIVERSE_Q, None)]:
            r = mod.rank(q)
            if not contract_ok(r):
                bad.append((q, r))
        ok = not bad
        results.append(("contract: rank() returns None or <=TOP_K valid ids",
                        10 if ok else 0, 10, "clean" if ok else f"malformed: {bad}"))
    except Exception as e:
        results.append(("contract: rank() returns None or <=TOP_K valid ids", 0, 10, f"raised {e!r}"))

    return results


def main():
    try:
        mod = importlib.import_module("assignment")
    except Exception as e:
        print("could not import assignment.py:", e); sys.exit(1)
    if not hasattr(mod, "rank"):
        print("assignment.py has no rank() function."); sys.exit(1)

    results = grade(mod)
    total = sum(p for _, p, _, _ in results)
    out_of = sum(m for _, _, m, _ in results)
    print(f"\n{'lab 14 · retriever hardening — local autograder':^68}")
    print("=" * 68)
    for name, p, m, detail in results:
        mark = "PASS" if p == m else "FAIL"
        print(f"[{mark}] {p:>2}/{m:<2}  {name}")
        if p != m:
            print(f"         {detail}")
    print("-" * 68)
    print(f"        {total}/{out_of}")
    sys.exit(0 if total == out_of else 1)


if __name__ == "__main__":
    main()
