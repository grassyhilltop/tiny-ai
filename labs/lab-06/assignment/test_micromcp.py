"""test_micromcp.py — local sanity tests for the guard() assignment.

Mirrors what the Gradescope autograder does, in miniature: it spawns your
micromcp.py as a subprocess, pipes JSON-RPC `tools/call` requests through
stdin, and reads the responses back on stdout — the real MCP transport. It
checks that benign calls are ALLOWED and that adversarial calls are BLOCKED
with a `REFUSE:` content message.

    python3 test_micromcp.py

Passing locally is necessary but not sufficient — the real autograder runs a
larger battery (more paths, more argument shapes). Add your own adversarial
cases to ADVERSARIAL as you think of them.
"""

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE / "micromcp.py"


def session(calls):
    """Spawn micromcp.py, send one tools/call per (name, arguments) tuple,
    and return the list of content-text strings the server replied with."""
    proc = subprocess.Popen(
        [sys.executable, str(SERVER)],
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
            resp = json.loads(proc.stdout.readline())
            result = resp.get("result", {}) or {}
            content = result.get("content") or [{}]
            texts.append(content[0].get("text", ""))
    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    return texts


# (name, arguments) calls that MUST be allowed — each maps to a substring we
# expect to see in the (non-refused) result.
BENIGN = [
    (("get_greeting", {}),                              "Hello, world!"),
    (("get_greeting", {"name": "alice"}),               "Hello, alice!"),
    (("read_file",    {"path": "hello.md"}),            "Hello from microMCP"),
    (("read_file",    {"path": "password_policy.md"}),  "Password Reset Policy"),
    (("read_file",    {"path": "network_help.md"}),     "Wi-Fi Troubleshooting"),
]

# (name, arguments) calls that MUST be blocked with a REFUSE: message.
ADVERSARIAL = [
    ("read_file",    {"path": "../server/micromcp.py"}),  # parent traversal
    ("read_file",    {"path": "../../etc/passwd"}),       # deeper traversal
    ("read_file",    {"path": "/etc/passwd"}),            # absolute path
    ("read_file",    {"path": "secrets.json"}),           # not a .md file
    ("read_file",    {"path": ""}),                       # empty path
    ("read_file",    {"path": 1234}),                     # non-string path
    ("get_greeting", {"name": "A" * 40}),                 # name too long
    ("get_greeting", {"name": "alice\nInjected: line"}),  # multi-line name
    ("exec",         {"cmd": "id"}),                      # not on the allowlist
    ("read_dir",     {"path": "."}),                      # not on the allowlist
    # add your own ↓
]


def main():
    if not SERVER.is_file():
        print(f"micromcp.py not found at {SERVER}")
        sys.exit(1)

    passed = failed = 0

    def check(ok, label, detail=""):
        nonlocal passed, failed
        mark = "✓" if ok else "✗"
        print(f"  {mark} {label}" + (f"   {detail}" if (detail and not ok) else ""))
        if ok: passed += 1
        else:  failed += 1

    print("[BENIGN — must be allowed]")
    benign_results = session([c for c, _ in BENIGN])
    for (call, expect), text in zip(BENIGN, benign_results):
        ok = (not text.startswith("REFUSE:")) and (expect in text)
        check(ok, f"allow {call[0]}({call[1]})", f"got {text[:60]!r}")

    print("[ADVERSARIAL — must be refused with REFUSE:]")
    adv_results = session(ADVERSARIAL)
    for call, text in zip(ADVERSARIAL, adv_results):
        ok = text.startswith("REFUSE:")
        check(ok, f"refuse {call[0]}({call[1]})", f"got {text[:60]!r}")

    print(f"\n{passed} passed · {failed} failed")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
