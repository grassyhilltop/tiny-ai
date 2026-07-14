"""micromcp.py — ASSIGNMENT TEMPLATE · constrain the tools.

This is the microMCP server from §2 with one thing removed: the tool-call
*policy*. Right now the server runs whatever tool the client names, with
whatever arguments it sends. Your job is to put a gate in front of every
`tools/call` so the server only runs what it should.

You implement exactly ONE function — `guard()`. Everything else (the tools,
the catalog, the JSON-RPC loop) is done.

────────────────────────────────────────────────────────────────────────────
THE CONTRACT  (this is what the autograder checks)
────────────────────────────────────────────────────────────────────────────
`handle_tools_call` already calls `guard(name, arguments)` BEFORE running any
tool. Your `guard` returns:

    • None              → ALLOW the call (the tool runs normally)
    • a reason string   → BLOCK the call; the server replies with
                          {"content":[{"type":"text","text":"REFUSE: <reason>"}],
                           "isError": true}  and the tool never runs.

Implement these constraints:

  1. ALLOWLIST.        Only the tools in ALLOWED_TOOLS ({"get_greeting",
                       "read_file"}) may be called. Any other name → block.

  2. read_file.path    The "path" argument must be:
                         a. a non-empty string,
                         b. NOT absolute  (must not start with "/"),
                         c. free of parent traversal  (no ".." path segment),
                         d. a markdown file  (must end with ".md").

  3. get_greeting.name If a "name" argument is given, it must be:
                         a. a string,
                         b. at most 32 characters long,
                         c. a single line  (no "\\n" or "\\r").

Allowed calls return the tool's real output as ordinary content (no REFUSE:
prefix). read_file's own sandbox / not-found messages ("error: ...") are
tool-level results, NOT policy refusals — leave those alone.

Run the local autograder after editing:   python3 test_micromcp.py
"""

from __future__ import annotations
import json
import sys
from pathlib import Path


# === ONE DATA ROOT =========================================================

DATA = Path(__file__).resolve().parent / "microdata"


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


# === TOOL-CALL POLICY · YOUR JOB ===========================================

ALLOWED_TOOLS = {"get_greeting", "read_file"}


def guard(name: str, arguments: dict) -> str | None:
    """Decide whether a tools/call may run. Return None to allow, or a short
    reason string to block. See THE CONTRACT in the module docstring.

    # ───────────────────────── YOUR JOB starts here. ─────────────────────
    Implement the three constraints. Until you do, guard() allows everything,
    so the benign tests pass but every adversarial test fails.
    """
    # TODO 1 — ALLOWLIST: if `name` is not in ALLOWED_TOOLS, return a reason.

    # TODO 2 — read_file: if name == "read_file", constrain arguments["path"]
    #          (non-empty string, not absolute, no "..", ends with ".md").

    # TODO 3 — get_greeting: if name == "get_greeting" and "name" is given,
    #          constrain it (string, <= 32 chars, single line).

    return None  # default-allow — replace with your checks above
    # ───────────────────────── YOUR JOB ends here. ───────────────────────


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
    """Run one tool — but only after the policy gate clears it."""
    name = params.get("name", "")
    args = params.get("arguments", {}) or {}

    # THE POLICY GATE. guard() is yours; this wiring is done for you.
    reason = guard(name, args)
    if reason is not None:
        return {"isError": True, "content": [{"type": "text", "text": f"REFUSE: {reason}"}]}

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
