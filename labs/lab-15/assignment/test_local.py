#!/usr/bin/env python3
"""Grade your Lab 15 secure twin locally — the same automated checks Gradescope
runs (65 of 100 points; the write-up and a non-triviality review are by hand).

Run it from the folder that holds secure_rag.py and writeup.md:

    python3 test_local.py

or point it at another folder:

    python3 test_local.py path/to/submission

Needs: fastapi, httpx, uvicorn, pydantic  (pip install fastapi httpx uvicorn pydantic)
"""
import os
import sys
import json
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "autograder"))

try:
    import grader  # noqa: E402
except Exception as e:  # pragma: no cover
    print("Could not import the grader:", e)
    sys.exit(2)


def run(submission):
    results = tempfile.mktemp(suffix=".json")
    argv_backup = sys.argv
    sys.argv = ["grader", "--submission", submission, "--results", results]
    try:
        grader.main()
    finally:
        sys.argv = argv_backup
    with open(results) as f:
        return json.load(f)


def main():
    submission = sys.argv[1] if len(sys.argv) > 1 else "."
    data = run(submission)
    print("\n" + "=" * 68)
    for t in data["tests"]:
        mark = "PASS" if t["score"] == t["max_score"] and t["max_score"] else (
            "----" if t["max_score"] == 0 else "part" if t["score"] else "FAIL")
        print(f"[{mark}] {t['score']:>5.1f}/{t['max_score']:<3}  {t['name']}")
    print("=" * 68)
    auto = sum(t["max_score"] for t in data["tests"])
    print(f"       {data['score']:>5.1f}/{auto:<3}  automatic points "
          f"(+ 40 manual: write-up & non-triviality)")
    print("\nPer-check detail:\n")
    for t in data["tests"]:
        print(f"### {t['name']}")
        print("    " + t["output"].replace("\n", "\n    "))
        print()


if __name__ == "__main__":
    main()
