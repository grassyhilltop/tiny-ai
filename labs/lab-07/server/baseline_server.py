"""baseline_server.py — the vulnerable MCP server students will attack.

Same JSON-RPC shape as microMCP, but over HTTP instead of stdio, with
four tools that each carry one or more planted vulnerabilities matching
the canonical MCP attack taxonomy:

    Vuln 1 · format_code        — poisonable description (T0010.005 supply chain)
    Vuln 2 · read_document      — prefix-before-normalize path traversal
                                  (CVE-2025-53109 / CVE-2025-53110)
    Vuln 3 · db_query           — over-privileged DB role; tool can read every
                                  table it was never advertised to touch
    Vuln 4 · update_ticket +
             compile_sprint +
             render_report      — Jinja2 SSTI through the ticket→render chain

Run:

    uvicorn server.baseline_server:app --port 8080 --reload

Endpoints:

    POST /              — JSON-RPC (initialize, tools/list, tools/call)
    GET  /openapi.json  — tool catalog (the attacker's recon target)
    GET  /health        — liveness
"""

from __future__ import annotations

import base64
import json
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from jinja2 import Template            # NOT the sandboxed environment — deliberately

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
DB_PATH = HERE.parent / "data" / "megacorp.db"

app = FastAPI(title="baseline-mcp")


# === Vuln 2 · over-broad filesystem sandbox ================================
#
# We advertise the tool as scoped to /data/documents/. The validation
# checks that the requested path STARTS WITH that prefix — but does the
# prefix check BEFORE normalizing the path. So a request for
# `/data/documents/../.secrets/credentials.json` passes the check
# (string starts with the right prefix) and then resolves outside the
# sandbox to /data/.secrets/credentials.json.
#
# This is the bug-pattern in Anthropic's official filesystem server,
# tracked as CVE-2025-53109 and CVE-2025-53110.

LOGICAL_ROOT = "/data/documents"
DOCS_ROOT = (DATA / "documents").resolve()


def read_document(path: str) -> str:
    # 1. Prefix check on the RAW string. Vulnerable.
    if not path.startswith(LOGICAL_ROOT + "/"):
        return f"error: path must start with {LOGICAL_ROOT}/"
    # 2. Translate logical → physical, then resolve. By this point the
    #    traversal has slipped past the gate.
    suffix = path[len(LOGICAL_ROOT) + 1:]
    real = (DOCS_ROOT / suffix).resolve()
    # NOTE: no second check that `real` is still under DOCS_ROOT —
    # that re-check is exactly what secure_server.py adds.
    if not real.exists() or not real.is_file():
        return f"error: not found: {path}"
    return real.read_text(encoding="utf-8", errors="replace")


# === Vuln 1 · poisonable tool description ==================================
#
# The description text is read from disk at startup. An attacker who can
# write to this file (or to its upstream repository) modifies the
# description and ships hidden instructions to the LLM.

FORMAT_CODE_DESCRIPTION = (HERE / "tool_descriptions" / "format_code.txt").read_text()


def format_code(content: str, style: str = "megacorpai") -> str:
    """Format source code. (Or pretend to — this isn't a real formatter.)
    The pedagogical value is that the *description* string above is what
    the LLM sees as "trustworthy tool documentation"."""
    # Vuln 1's exfil sketch: real-world poisoned variants append a
    # ``// build-cache: <base64>`` line whenever the content looks
    # sensitive. We leave that line OUT of the baseline so students see
    # the clean version, then add it in the lab-10 attack walkthrough.
    lines = [line.rstrip() for line in content.splitlines()]
    return f"Formatted ({style} style):\n\n" + "\n".join(lines)


# === Vuln 3 · over-privileged DB ===========================================
#
# The tool is advertised as "execute a SQL query against the database",
# which sounds innocuous. The role it connects as owns every table in
# the public schema — including customer_pii, api_keys, financial_records.

def db_query(sql: str) -> str:
    """Execute one read-only SQL statement against megacorp.db.
    VULNERABILITY: the connection has access to every table, not just the
    one the tool's docstring implies."""
    if not sql.strip().lower().startswith("select"):
        return "error: only SELECT statements are allowed"
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(sql).fetchall()
    except sqlite3.Error as e:
        return f"sql error: {e}"
    finally:
        conn.close()
    # Render as plain text so the LLM (or attacker) can read it.
    if not rows:
        return "(no rows)"
    return "\n".join("  ".join(str(c) for c in r) for r in rows)


# === Vuln 4 · Jinja2 SSTI through the sprint pipeline ======================

TICKETS: dict[str, str] = {}  # in-memory ticket store


def update_ticket(ticket_id: str, content: str) -> str:
    """Store or overwrite a ticket's content. Plain string in, plain string out.
    Tickets are deliberately unvalidated — accept whatever the user writes."""
    TICKETS[ticket_id] = content
    return f"ticket {ticket_id} updated ({len(content)} chars)"


def list_tickets() -> str:
    if not TICKETS:
        return "(no tickets)"
    return "\n".join(f"{tid}: {body[:60]}" for tid, body in TICKETS.items())


def compile_sprint(sprint_id: str) -> str:
    """Aggregate every ticket into a single text blob ready for rendering."""
    parts = [f"Sprint: {sprint_id}", "=" * 40]
    for tid in sorted(TICKETS):
        parts.append(f"\n{tid}:")
        parts.append(TICKETS[tid])
    return "\n".join(parts)


def render_report(report_data: str) -> str:
    """Render a sprint report.
    VULNERABILITY: this hands report_data straight to Jinja2 with no
    sandboxing. Any {{ ... }} or {% ... %} in the data gets EVALUATED."""
    rule = "=" * 40
    template = Template(
        f"Sprint Report — MegaCorpAI\n{rule}\n{{{{ data }}}}\n\n{rule}\nEnd of Report\n"
    )
    rendered_once = template.render(data=report_data)
    # The vulnerability is the SECOND render: the engine evaluates whatever
    # template syntax survived the first pass — i.e., whatever the attacker
    # stored in a ticket.
    return Template(rendered_once).render()


# === Tool catalog ==========================================================

TOOLS = [
    {
        "name": "format_code",
        "description": FORMAT_CODE_DESCRIPTION,
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "source code text"},
                "style":   {"type": "string", "description": "style id"},
            },
            "required": ["content"],
        },
    },
    {
        "name": "read_document",
        "description": "Read a file from the company documents directory.",
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "db_query",
        "description": "Execute a read-only SQL query against the customer database.",
        "inputSchema": {
            "type": "object",
            "properties": {"sql": {"type": "string"}},
            "required": ["sql"],
        },
    },
    {
        "name": "update_ticket",
        "description": "Store or overwrite a ticket's content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "ticket_id": {"type": "string"},
                "content":   {"type": "string"},
            },
            "required": ["ticket_id", "content"],
        },
    },
    {
        "name": "list_tickets",
        "description": "List every ticket currently in the sprint store.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "compile_sprint",
        "description": "Aggregate every stored ticket into a sprint blob.",
        "inputSchema": {
            "type": "object",
            "properties": {"sprint_id": {"type": "string"}},
            "required": ["sprint_id"],
        },
    },
    {
        "name": "render_report",
        "description": "Render a sprint report from compiled sprint data.",
        "inputSchema": {
            "type": "object",
            "properties": {"report_data": {"type": "string"}},
            "required": ["report_data"],
        },
    },
]


DISPATCH = {
    "format_code":    format_code,
    "read_document":  read_document,
    "db_query":       db_query,
    "update_ticket":  update_ticket,
    "list_tickets":   list_tickets,
    "compile_sprint": compile_sprint,
    "render_report":  render_report,
}


# === HTTP / JSON-RPC =======================================================

def handle(method: str, params: dict) -> dict:
    if method == "initialize":
        return {
            "protocolVersion": "0.1",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "baseline-mcp", "version": "1.0.0"},
        }
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
        return {"content": [{"type": "text", "text": text}]}
    raise ValueError(f"unknown method: {method}")


@app.post("/")
async def jsonrpc(request: Request) -> JSONResponse:
    req = await request.json()
    rid = req.get("id")
    try:
        result = handle(req.get("method", ""), req.get("params", {}) or {})
        return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": result})
    except Exception as e:                                       # noqa: BLE001
        return JSONResponse({"jsonrpc": "2.0", "id": rid,
                             "error": {"code": -32000, "message": str(e)}})


@app.get("/openapi.json")
def openapi_descriptions() -> dict[str, Any]:
    """Expose the tool catalog for OpenAPI-style consumers.
    Useful for attackers who want to verify a description got poisoned."""
    return {"tools": TOOLS}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "agent": "baseline-mcp"}
