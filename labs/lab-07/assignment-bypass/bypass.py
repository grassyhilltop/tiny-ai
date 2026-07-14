"""bypass.py — defeat ONE secure_server.py defense and retrieve a credential.

This is the file you submit. The autograder (test_bypass.py) starts
secure_server.py on a fresh port, plants a random canary credential in the data
it protects, runs your bypass against it, and PASSES if your script PRINTS that
credential to stdout.

Pick one of the secure server's defenses and slip past it to read a secret:

  * D2 · post-resolve sandbox check  →  read  data/.secrets/credentials.json
  * D3 · per-tool table allowlist    →  read  the  api_keys  table
  * D4 · Jinja2 SandboxedEnvironment →  escape to RCE, then read the file

…then PRINT whatever you retrieved. (D1, the description hash pin, doesn't yield
a credential directly, so it isn't the target here.)

    python bypass.py                          # targets http://127.0.0.1:8081
    python bypass.py --url http://127.0.0.1:8081
"""

import argparse
import itertools
import json
import sys
import urllib.request

_ids = itertools.count(1)


def call(url: str, tool: str, **arguments) -> str:
    """Call one tool on the (secure) server over JSON-RPC and return its text.

    Stdlib only — no pip install needed to run your bypass.
    """
    body = json.dumps({
        "jsonrpc": "2.0", "id": next(_ids),
        "method": "tools/call", "params": {"name": tool, "arguments": arguments},
    }).encode()
    req = urllib.request.Request(url.rstrip("/") + "/", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        resp = json.load(r)
    if "error" in resp:
        return "ERROR: " + resp["error"].get("message", "unknown")
    result = resp.get("result", {})
    if result.get("isError"):
        return "ERROR: " + result["content"][0]["text"]
    return result["content"][0]["text"]


def bypass(url: str) -> None:
    # ========================================================================
    # YOUR JOB.
    # Call a tool with a payload that defeats one secure_server defense and
    # returns a credential, then PRINT the secret you retrieve. For example,
    # a db_query payload that slips a non-allow-listed table past the D3 regex:
    #
    #     print(call(url, "db_query", sql="SELECT ... FROM ... "))
    #
    # The secure server blocks the obvious version — find the form its check
    # misses but SQLite still runs (think about how the regex matches a table
    # name, and what SQLite accepts as an equivalent way to write one).
    raise NotImplementedError("write your bypass, then print the credential")
    # ========================================================================


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8081",
                    help="secure_server base URL")
    bypass(ap.parse_args().url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
