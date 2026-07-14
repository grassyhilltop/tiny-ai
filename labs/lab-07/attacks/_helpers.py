"""Shared helpers for the attack scripts."""

import itertools
import sys
import httpx

SERVER = "http://127.0.0.1:8080"

_ids = itertools.count(1)


def rpc(method: str, params: dict | None = None) -> dict:
    """One JSON-RPC round trip."""
    rid = next(_ids)
    body = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}
    try:
        r = httpx.post(SERVER + "/", json=body, timeout=15)
    except httpx.ConnectError:
        print(f"!! cannot reach {SERVER} — start the server first:")
        print("   .venv/bin/uvicorn server.baseline_server:app --port 8080 --reload")
        sys.exit(2)
    r.raise_for_status()
    return r.json()


def call(name: str, **kwargs) -> str:
    """Call a tool and return the first text block of the result."""
    resp = rpc("tools/call", {"name": name, "arguments": kwargs})
    if "error" in resp:
        return "ERROR: " + resp["error"].get("message", "unknown")
    result = resp.get("result", {})
    if result.get("isError"):
        return "ERROR: " + result["content"][0]["text"]
    return result["content"][0]["text"]


def banner(label: str) -> None:
    print()
    print("=" * 72)
    print(label)
    print("=" * 72)
