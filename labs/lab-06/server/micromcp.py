"""micromcp.py — the smallest readable Model Context Protocol server.

One file. JSON-RPC over stdio. Two tools. No third-party libraries.
Read it top to bottom and you've read every line of an MCP server.

How to run:

    # From another process (the lab's client.py does this for you):
    python server/micromcp.py < requests.jsonl

    # Or interactively, line by line:
    python server/micromcp.py
    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
    ^D

Every request is one JSON object per line on stdin; every response is
one JSON object per line on stdout. That is the entire transport.
"""

from __future__ import annotations
import json
import sys
from pathlib import Path


# === ONE DATA ROOT =========================================================

DATA = Path(__file__).resolve().parent.parent / "microdata"


# === TWO TOOLS =============================================================

def get_greeting(name: str = "world") -> str:
    """Return a deterministic greeting. Useful for testing connectivity."""
    return f"Hello, {name}! This greeting came from micromcp."


def read_file(path: str) -> str:
    """Read a UTF-8 file from the microdata/ folder. Path must be relative."""
    p = (DATA / path).resolve()
    # The simplest possible sandbox: refuse anything that escapes microdata/.
    if not str(p).startswith(str(DATA.resolve())):
        return "error: path escapes the sandbox"
    if not p.exists() or not p.is_file():
        return f"error: not found: {path}"
    return p.read_text(encoding="utf-8", errors="replace")


# === TOOL CATALOG (what tools/list returns) ================================

TOOLS = [
    {
        "name": "get_greeting",
        "description": "Return a friendly greeting. Useful for testing the connection.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "who to greet"},
            },
            "required": [],
        },
    },
    {
        "name": "read_file",
        "description": "Read a UTF-8 text file from the micromcp knowledge base.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "file path relative to microdata/"},
            },
            "required": ["path"],
        },
    },
]


DISPATCH = {
    "get_greeting": get_greeting,
    "read_file":    read_file,
}


# === JSON-RPC HANDLERS =====================================================

def handle_initialize(params: dict) -> dict:
    """Tell the client what this server supports."""
    return {
        "protocolVersion": "0.1",
        "capabilities": {"tools": {}},
        "serverInfo": {"name": "micromcp", "version": "0.1.0"},
    }


def handle_tools_list(params: dict) -> dict:
    """Return the tool catalog. The LLM (or client) decides what to call."""
    return {"tools": TOOLS}


def handle_tools_call(params: dict) -> dict:
    """Run one tool. The result becomes an MCP `content` block."""
    name = params.get("name", "")
    args = params.get("arguments", {}) or {}
    fn = DISPATCH.get(name)
    if fn is None:
        return {"isError": True, "content": [{"type": "text", "text": f"unknown tool: {name}"}]}
    try:
        text = fn(**args)
    except TypeError as e:
        return {"isError": True, "content": [{"type": "text", "text": f"bad arguments: {e}"}]}
    return {"content": [{"type": "text", "text": text}]}


METHODS = {
    "initialize": handle_initialize,
    "tools/list": handle_tools_list,
    "tools/call": handle_tools_call,
}


# === MAIN STDIO LOOP =======================================================

def reply(rid, result=None, error=None) -> None:
    """Write one JSON-RPC response to stdout."""
    msg = {"jsonrpc": "2.0", "id": rid}
    if error is not None:
        msg["error"] = error
    else:
        msg["result"] = result
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def main() -> None:
    """Read one JSON object per line, dispatch, reply."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            reply(None, error={"code": -32700, "message": f"parse error: {e}"})
            continue

        rid = req.get("id")
        method = req.get("method", "")
        params = req.get("params", {}) or {}
        handler = METHODS.get(method)
        if handler is None:
            reply(rid, error={"code": -32601, "message": f"unknown method: {method}"})
            continue
        try:
            reply(rid, result=handler(params))
        except Exception as e:                   # noqa: BLE001
            reply(rid, error={"code": -32000, "message": f"server error: {e}"})


if __name__ == "__main__":
    main()
