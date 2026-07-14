"""secure_server.py — the hardened twin of baseline_server.py.

Same JSON-RPC shape, same tool catalog, four defenses applied:

  D1 · description hash pin             — defeats Attack 1 description poisoning
  D2 · post-resolve sandbox re-check    — defeats Attack 2 path traversal
  D3 · per-tool table allowlist         — defeats Attack 3 over-privileged DB
  D4 · Jinja2 SandboxedEnvironment      — defeats Attack 4 SSTI chain

Run on a different port from the baseline:

    uvicorn server.secure_server:app --port 8081 --reload

Re-point the attack scripts at port 8081 and re-run. Each should fail.
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from jinja2.sandbox import SandboxedEnvironment

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
DB_PATH = DATA / "megacorp.db"

app = FastAPI(title="secure-mcp")


# === D1 · description hash pin =============================================

EXPECTED_DESCRIPTION_HASHES = {
    # SHA-256 of the original tool description files. Generated once
    # from a trusted snapshot; checked at every startup.
    "format_code.txt": "f16e90beb45293f68928983971d594741846b1b454503b408c99e1cbd7fae2ec",
}


def _load_description(filename: str) -> str:
    path = HERE / "tool_descriptions" / filename
    body = path.read_text()
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    expected = EXPECTED_DESCRIPTION_HASHES.get(filename)
    if expected and digest != expected:
        # In production this would page an SRE. For the lab we refuse to
        # serve the poisoned description and replace it with a placeholder.
        print(f"!! description integrity failure for {filename}: "
              f"hash {digest[:16]}… ≠ expected {expected[:16]}…",
              file=sys.stderr)
        return f"(description quarantined: hash mismatch on {filename})"
    return body


FORMAT_CODE_DESCRIPTION = _load_description("format_code.txt")


# === D2 · post-resolve sandbox re-check ====================================

LOGICAL_ROOT = "/data/documents"
DOCS_ROOT = (DATA / "documents").resolve()


def read_document(path: str) -> str:
    if not path.startswith(LOGICAL_ROOT + "/"):
        return f"error: path must start with {LOGICAL_ROOT}/"
    suffix = path[len(LOGICAL_ROOT) + 1:]
    real = (DOCS_ROOT / suffix).resolve()
    # ─── the line baseline_server.py is missing ──────────────────────
    if not str(real).startswith(str(DOCS_ROOT) + "/"):
        return "error: path escapes the sandbox"
    # ─────────────────────────────────────────────────────────────────
    if not real.exists() or not real.is_file():
        return f"error: not found: {path}"
    return real.read_text(encoding="utf-8", errors="replace")


# === D3 · per-tool table allowlist =========================================

DB_ALLOWLIST = frozenset({"customers"})  # the only table the tool advertises

# Cheap regex sniff for which tables a SELECT touches. Not bulletproof —
# a real defense would use sqlglot or sqlparse — but it catches the lab's
# attacks. The point is the *concept* of a per-tool table policy.
_TABLE_REF = re.compile(r"(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)", re.IGNORECASE)


def db_query(sql: str) -> str:
    if not sql.strip().lower().startswith("select"):
        return "error: only SELECT statements are allowed"
    referenced = {t.lower() for t in _TABLE_REF.findall(sql)}
    if "sqlite_master" in referenced or referenced - DB_ALLOWLIST:
        return f"error: tool not authorized to read tables: {sorted(referenced - DB_ALLOWLIST)}"
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(sql).fetchall()
    except sqlite3.Error as e:
        return f"sql error: {e}"
    finally:
        conn.close()
    if not rows:
        return "(no rows)"
    return "\n".join("  ".join(str(c) for c in r) for r in rows)


# === Sprint pipeline · D4 applied at render_report =========================

TICKETS: dict[str, str] = {}
_SANDBOX = SandboxedEnvironment()


def update_ticket(ticket_id: str, content: str) -> str:
    TICKETS[ticket_id] = content
    return f"ticket {ticket_id} updated ({len(content)} chars)"


def list_tickets() -> str:
    if not TICKETS:
        return "(no tickets)"
    return "\n".join(f"{tid}: {body[:60]}" for tid, body in TICKETS.items())


def compile_sprint(sprint_id: str) -> str:
    parts = [f"Sprint: {sprint_id}", "=" * 40]
    for tid in sorted(TICKETS):
        parts.append(f"\n{tid}:")
        parts.append(TICKETS[tid])
    return "\n".join(parts)


def render_report(report_data: str) -> str:
    """D4: use SandboxedEnvironment — `__globals__`, `__class__`, callables
    not on a strict allowlist all raise SecurityError. {{ 7*7 }} still works."""
    rule = "=" * 40
    template = _SANDBOX.from_string(
        f"Sprint Report — MegaCorpAI\n{rule}\n{{{{ data }}}}\n\n{rule}\nEnd of Report\n"
    )
    rendered_once = template.render(data=report_data)
    # We *still* call render twice on purpose so the report's own
    # template variables work — but the sandbox bars dangerous access.
    return _SANDBOX.from_string(rendered_once).render()


# === Tool catalog ==========================================================

TOOLS = [
    {
        "name": "format_code",
        "description": FORMAT_CODE_DESCRIPTION,
        "inputSchema": {
            "type": "object",
            "properties": {"content": {"type": "string"}, "style": {"type": "string"}},
            "required": ["content"],
        },
    },
    {
        "name": "read_document",
        "description": "Read a file from the company documents directory.",
        "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
    },
    {
        "name": "db_query",
        "description": "Execute a read-only SQL query against the customer table.",
        "inputSchema": {"type": "object", "properties": {"sql": {"type": "string"}}, "required": ["sql"]},
    },
    {
        "name": "update_ticket",
        "description": "Store or overwrite a ticket's content.",
        "inputSchema": {"type": "object", "properties": {"ticket_id": {"type": "string"}, "content": {"type": "string"}}, "required": ["ticket_id", "content"]},
    },
    {
        "name": "list_tickets",
        "description": "List every ticket currently in the sprint store.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "compile_sprint",
        "description": "Aggregate every stored ticket into a sprint blob.",
        "inputSchema": {"type": "object", "properties": {"sprint_id": {"type": "string"}}, "required": ["sprint_id"]},
    },
    {
        "name": "render_report",
        "description": "Render a sprint report from compiled sprint data.",
        "inputSchema": {"type": "object", "properties": {"report_data": {"type": "string"}}, "required": ["report_data"]},
    },
]


DISPATCH = {
    "format_code":    lambda content, style="megacorpai": f"Formatted ({style}):\n\n{content}",
    "read_document":  read_document,
    "db_query":       db_query,
    "update_ticket":  update_ticket,
    "list_tickets":   list_tickets,
    "compile_sprint": compile_sprint,
    "render_report":  render_report,
}


def handle(method: str, params: dict) -> dict:
    if method == "initialize":
        return {"protocolVersion": "0.1", "capabilities": {"tools": {}},
                "serverInfo": {"name": "secure-mcp", "version": "1.0.0"}}
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        name = params.get("name", "")
        args = params.get("arguments", {}) or {}
        fn = DISPATCH.get(name)
        if fn is None:
            return {"isError": True, "content": [{"type": "text", "text": f"unknown tool: {name}"}]}
        try:
            text = fn(**args)
        except TypeError as e:
            return {"isError": True, "content": [{"type": "text", "text": f"bad args: {e}"}]}
        except Exception as e:                                    # noqa: BLE001
            return {"isError": True, "content": [{"type": "text", "text": f"sandbox: {e}"}]}
        return {"content": [{"type": "text", "text": text}]}
    raise ValueError(f"unknown method: {method}")


@app.post("/")
async def jsonrpc(request: Request) -> JSONResponse:
    req = await request.json()
    rid = req.get("id")
    try:
        result = handle(req.get("method", ""), req.get("params", {}) or {})
        return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": result})
    except Exception as e:                                        # noqa: BLE001
        return JSONResponse({"jsonrpc": "2.0", "id": rid,
                             "error": {"code": -32000, "message": str(e)}})


@app.get("/openapi.json")
def openapi_descriptions() -> dict[str, Any]:
    return {"tools": TOOLS}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "agent": "secure-mcp"}
