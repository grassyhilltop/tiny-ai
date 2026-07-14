#!/usr/bin/env python3
"""grader.py — Gradescope autograder for lab-06 (the guard() tool-call policy).

Scoring (100 pts):

    10  Server smoke test (initialize + tools/list still work)
    25  Benign calls are ALLOWED (no over-blocking)
    35  read_file path constraints enforced (traversal / absolute / .md / type)
    15  get_greeting argument constraints enforced (length / single-line / type)
    15  Allowlist enforced (tools outside the allowlist are refused)

How it works: the grader spawns the student's micromcp.py as a subprocess and
drives it over the real JSON-RPC/stdio transport — exactly as a host would. A
call is ALLOWED if its result content does not start with "REFUSE:"; it is
BLOCKED if the content starts with "REFUSE:". Nothing the student writes is
imported or exec'd in-process, and no tool here does anything destructive.

Run on Gradescope via run_autograder. Locally:
    python3 grader.py --submission ../../solution   # reference -> 100/100
    python3 grader.py --submission ../              # template  -> low score
"""

import argparse
import json
import os
import subprocess
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
GS_SUBMISSION = "/autograder/submission"
GS_RESULTS_DIR = "/autograder/results"

DATA_FILES = {
    "hello.md": "# Hello from microMCP\n\nIf you can read this file the server is working.\n",
    "password_policy.md": "# Password Reset Policy\n\nVisit https://password.megacorpone.local to reset your password.\n",
    "network_help.md": "# Wi-Fi Troubleshooting\n\nIf your Wi-Fi keeps dropping: forget the network and rejoin.\n",
}


def call_batch(server_path, calls, timeout=10):
    """Spawn the server once, send a tools/call per (name, arguments) tuple,
    return the list of result content-text strings."""
    proc = subprocess.Popen(
        [sys.executable, str(server_path)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, bufsize=1,
    )
    texts = []
    try:
        for i, (name, args) in enumerate(calls, start=1):
            req = {"jsonrpc": "2.0", "id": i, "method": "tools/call",
                   "params": {"name": name, "arguments": args}}
            proc.stdin.write(json.dumps(req) + "\n")
            proc.stdin.flush()
            line = proc.stdout.readline()
            resp = json.loads(line) if line.strip() else {}
            result = resp.get("result", {}) or {}
            content = result.get("content") or [{}]
            texts.append(content[0].get("text", ""))
    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
    return texts


def raw_request(server_path, req, timeout=10):
    """Send one arbitrary JSON-RPC request, return the full parsed response."""
    proc = subprocess.Popen(
        [sys.executable, str(server_path)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, bufsize=1,
    )
    try:
        proc.stdin.write(json.dumps(req) + "\n")
        proc.stdin.flush()
        line = proc.stdout.readline()
    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
    return json.loads(line) if line.strip() else {}


# ---- test data ------------------------------------------------------------
BENIGN = [
    (("get_greeting", {}),                              "Hello, world!"),
    (("get_greeting", {"name": "alice"}),               "Hello, alice!"),
    (("get_greeting", {"name": "x" * 32}),              "Hello, "),          # exactly 32 — boundary, allowed
    (("read_file",    {"path": "hello.md"}),            "Hello from microMCP"),
    (("read_file",    {"path": "password_policy.md"}),  "Password Reset Policy"),
    (("read_file",    {"path": "network_help.md"}),     "Wi-Fi Troubleshooting"),
]

PATH_ADVERSARIAL = [
    ("read_file", {"path": "../server/micromcp.py"}),
    ("read_file", {"path": "../../etc/passwd"}),
    ("read_file", {"path": "/etc/passwd"}),
    ("read_file", {"path": "subdir/../../secret.md"}),
    ("read_file", {"path": "notes.txt"}),     # not .md
    ("read_file", {"path": ""}),              # empty
    ("read_file", {"path": 1234}),            # non-string
]

GREETING_ADVERSARIAL = [
    ("get_greeting", {"name": "A" * 33}),                 # 33 > 32
    ("get_greeting", {"name": "A" * 200}),                # very long
    ("get_greeting", {"name": "alice\nInjected"}),        # newline
    ("get_greeting", {"name": "alice\rInjected"}),        # carriage return
    ("get_greeting", {"name": 999}),                      # non-string
]

ALLOWLIST_ADVERSARIAL = [
    ("exec",        {"cmd": "id"}),
    ("read_dir",    {"path": "."}),
    ("delete_file", {"path": "hello.md"}),
    ("eval",        {"expr": "1+1"}),
]


def _blocked(text):
    return text.startswith("REFUSE:")


# ---- graders --------------------------------------------------------------
def grade_smoke(server):
    init = raw_request(server, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    listed = raw_request(server, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
    tools = (listed.get("result", {}) or {}).get("tools", [])
    names = {t.get("name") for t in tools}
    checks = [
        ("initialize returns serverInfo",
         lambda: bool((init.get("result", {}) or {}).get("serverInfo"))),
        ("tools/list advertises get_greeting and read_file",
         lambda: {"get_greeting", "read_file"} <= names),
    ]
    return _run_checks(checks, 10)


def grade_benign(server):
    results = call_batch(server, [c for c, _ in BENIGN])
    checks = []
    for (call, expect), text in zip(BENIGN, results):
        checks.append((f"allow {call[0]}({call[1]!r})",
                       (lambda text=text, expect=expect: (not _blocked(text)) and (expect in text))))
    return _run_checks(checks, 25)


def grade_path(server):
    results = call_batch(server, PATH_ADVERSARIAL)
    checks = [(f"refuse read_file path={call[1].get('path')!r}",
               (lambda text=text: _blocked(text)))
              for call, text in zip(PATH_ADVERSARIAL, results)]
    return _run_checks(checks, 35)


def grade_greeting(server):
    results = call_batch(server, GREETING_ADVERSARIAL)
    checks = [(f"refuse get_greeting name={str(call[1].get('name'))[:16]!r}…",
               (lambda text=text: _blocked(text)))
              for call, text in zip(GREETING_ADVERSARIAL, results)]
    return _run_checks(checks, 15)


def grade_allowlist(server):
    results = call_batch(server, ALLOWLIST_ADVERSARIAL)
    checks = [(f"refuse non-allowlisted tool {call[0]!r}",
               (lambda text=text: _blocked(text)))
              for call, text in zip(ALLOWLIST_ADVERSARIAL, results)]
    return _run_checks(checks, 15)


def _run_checks(checks, max_score):
    detail, correct = [], 0
    for name, fn in checks:
        try:
            ok = fn()
            if ok:
                correct += 1
            else:
                detail.append(f"  ✗ {name}")
        except Exception as e:
            detail.append(f"  ✗ {name} raised {e!r}")
    score = max_score * correct / len(checks)
    head = f"{correct}/{len(checks)} checks passed."
    return score, head + ("\n" + "\n".join(detail) if detail else "")


# ---- orchestration --------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--submission", default=GS_SUBMISSION)
    ap.add_argument("--results", default=None)
    args = ap.parse_args()

    submission = Path(args.submission).resolve()
    server = submission / "micromcp.py"
    if not server.is_file():
        found = next((Path(r) for r, _d, f in os.walk(submission) if "micromcp.py" in f), None)
        if found is None:
            return write_results(args, [{"name": "Submission check", "score": 0,
                "max_score": 100, "output": "No micromcp.py found in your submission."}])
        server = found / "micromcp.py"

    # Ensure the microdata/ the server reads exists next to it, with the files
    # the benign tests expect.
    try:
        data_dir = server.parent / "microdata"
        data_dir.mkdir(parents=True, exist_ok=True)
        for fname, body in DATA_FILES.items():
            (data_dir / fname).write_text(body, encoding="utf-8")
    except Exception as e:
        print(f"warning: could not prepare microdata: {e}", file=sys.stderr)

    tests = []
    def add(name, fn, mx):
        try:
            s, out = fn(server)
        except Exception:
            s, out = 0, "Crashed:\n" + traceback.format_exc()
        tests.append({"name": name, "score": round(s, 2), "max_score": mx, "output": out})

    add("Server smoke test (initialize + tools/list)", grade_smoke, 10)
    add("Benign calls are allowed (no over-blocking)", grade_benign, 25)
    add("read_file path constraints enforced", grade_path, 35)
    add("get_greeting argument constraints enforced", grade_greeting, 15)
    add("Allowlist enforced (unknown tools refused)", grade_allowlist, 15)

    write_results(args, tests)


def write_results(args, tests):
    total = round(sum(t["score"] for t in tests), 2)
    results = {"score": total, "output": f"Total: {total}/100", "tests": tests,
               "visibility": "visible", "stdout_visibility": "visible"}
    out_path = (args.results if args.results
                else os.path.join(GS_RESULTS_DIR, "results.json") if os.path.isdir(GS_RESULTS_DIR)
                else os.path.join(os.getcwd(), "results.json"))
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(json.dumps(results, indent=2))
    print(f"\nWrote {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
