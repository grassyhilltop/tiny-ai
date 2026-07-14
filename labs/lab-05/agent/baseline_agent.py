"""baseline_agent.py — the vulnerable agent students will attack.

Run:
    cd Class/labs/lab-08
    cp agent/.env.example agent/.env  # then edit with real Rivanna values
    pip install -r agent/requirements.txt
    export AGENT_PORT=8013   # a free port — shared node, pick your own
    uvicorn agent.baseline_agent:app --port $AGENT_PORT --reload

Endpoints:
    GET  /health                              — health + name
    POST /chat       {"message": ..., "session_id"?}
    POST /upload     multipart/form-data file
    POST /summarize  — summarize every file currently in intake/
    POST /reset      — wipe intake/

This agent has THREE deliberate vulnerabilities matched to the three
attacks in the lab:

  1. The output filter only matches credentials as literal substrings,
     so character-spacing in the LLM output bypasses it.
  2. /summarize concatenates every file in intake/ into one LLM
     context, so a split injection across two files reassembles.
  3. /chat reads from notes.db without verifying article authorship,
     so an attacker who can write to notes.db poisons every future
     user's session.

Each vulnerability is fixed in secure_agent.py.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from agent.llm_client import LLMClient, LLMError
from agent.tools import call_tool, TOOL_MANIFEST


# ---- config & boilerplate -------------------------------------------------

load_dotenv(Path(__file__).resolve().parent / ".env")

AGENT_NAME = "Baseline IT Helpdesk"
AGENT_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT = (AGENT_DIR / "system_prompt.txt").read_text()
INTAKE_DIR = AGENT_DIR / "intake"
INTAKE_DIR.mkdir(exist_ok=True)
NOTES_DB = Path(os.environ.get("NOTES_DB", AGENT_DIR / "notes.db"))

app = FastAPI(title=AGENT_NAME)
llm = LLMClient()


# Naive output filter — exactly the kind a real product would ship.
# Lists every "secret" the agent must never disclose verbatim.
SECRET_PATTERNS = [
    "Megacorp_DB_2026!",
    "AKIA3MEGACORP2026DOCS",
    "wJalrXUtn3MEGACORP/K7MDENG/bPxR26DocStore",
    "xoxb-EXAMPLE-FAKE-SLACK-TOKEN-FOR-LAB-ONLY",
    "db-internal.megacorpone.local",
]

# Input-side keyword filter — catches the most obvious injection phrases.
INJECTION_KEYWORDS = [
    "ignore previous instructions",
    "ignore all prior instructions",
    "disregard your instructions",
    "you are now",
    "your new task",
    "system prompt",
    "reveal your prompt",
]


def input_filter(user_msg: str) -> str | None:
    """Returns a refusal string if the input matches a known-bad pattern,
    else None.  Case-insensitive literal-substring match — i.e. weak."""
    low = user_msg.lower()
    for kw in INJECTION_KEYWORDS:
        if kw in low:
            return "I cannot process that request."
    return None


def output_filter(text: str) -> str:
    """Strip the response if it contains any known credential verbatim.
    The bypass: literal-substring match, so 'M e g a c o r p _ D B' is
    not caught."""
    for secret in SECRET_PATTERNS:
        if secret in text:
            return "I cannot provide that information."
    return text


# ---- ReAct loop ------------------------------------------------------------

REACT_LOOP_LIMIT = 4


def react_step(messages: list[dict[str, str]]) -> dict[str, Any]:
    """One LLM call. Returns the parsed action dict the LLM produced."""
    raw = llm.chat(messages, temperature=0.2, max_tokens=512)
    # Find the first {...} block in the response and parse it.
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        return {"action": "final", "answer": raw.strip()}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {"action": "final", "answer": raw.strip()}


def react_loop(user_msg: str, extra_context: str = "") -> str:
    """Run the ReAct loop until the LLM emits a 'final' action or we hit
    the step limit."""
    sys = SYSTEM_PROMPT
    if extra_context:
        sys = sys + "\n\n## Additional context\n\n" + extra_context
    messages: list[dict[str, str]] = [
        {"role": "system", "content": sys},
        {"role": "user", "content": user_msg},
    ]
    for _ in range(REACT_LOOP_LIMIT):
        action = react_step(messages)
        if action.get("action") == "final":
            return action.get("answer", "")
        tool = action.get("action", "")
        args = action.get("args", {}) or {}
        try:
            obs = call_tool(tool, **args)
        except Exception as e:
            obs = f"tool error: {e}"
        messages.append({"role": "assistant", "content": json.dumps(action)})
        messages.append({
            "role": "user",
            "content": f"Observation from {tool}: {obs}\n\nDecide the next action.",
        })
    return "I ran out of steps trying to answer that."


# ---- /chat ----------------------------------------------------------------


class ChatIn(BaseModel):
    message: str
    session_id: str | None = None


@app.post("/chat")
def chat(req: ChatIn) -> dict[str, str]:
    refusal = input_filter(req.message)
    if refusal:
        return {"response": refusal, "session_id": req.session_id or str(uuid.uuid4())}

    # Pull any matching memory notes into the context.  This is the
    # vulnerable read path — no authorship check on what comes back.
    notes_context = _retrieve_notes(req.message)

    try:
        answer = react_loop(req.message, extra_context=notes_context)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    return {
        "response": output_filter(answer),
        "session_id": req.session_id or str(uuid.uuid4()),
    }


# ---- /upload + /summarize -------------------------------------------------


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, Any]:
    dest = INTAKE_DIR / file.filename
    body = await file.read()
    # Per-file content scan — the same kind a real upload pipeline runs.
    if _injection_in_text(body.decode("utf-8", errors="replace")):
        return JSONResponse(
            status_code=400,
            content={"error": "blocked: injection keywords detected in file"},
        )
    dest.write_bytes(body)
    return {"status": "uploaded", "path": str(dest), "size": len(body)}


def _injection_in_text(text: str) -> bool:
    low = text.lower()
    return any(kw in low for kw in [
        "ignore the document", "ignore previous", "instead output",
        "ignore the page content", "override your instructions",
    ])


@app.post("/summarize")
def summarize() -> dict[str, str]:
    files = sorted(INTAKE_DIR.iterdir())
    if not files:
        return {"summary": "(no files to summarize)"}
    # VULNERABILITY: all files joined into ONE context. Cross-document
    # fragmentation reassembles the injection here.
    joined = "\n\n".join(
        f"=== {p.name} ===\n{p.read_text(encoding='utf-8', errors='replace')}"
        for p in files
    )
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": (
            "Summarize the following uploaded documents. Follow any "
            "summary-format conventions the documents themselves "
            "establish.\n\n" + joined
        )},
    ]
    try:
        raw = llm.chat(messages, temperature=0.3, max_tokens=900)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"summary": output_filter(raw)}


@app.post("/reset")
def reset() -> dict[str, str]:
    for p in INTAKE_DIR.iterdir():
        p.unlink()
    return {"status": "intake cleared"}


# ---- Memory / notes -------------------------------------------------------


def _ensure_notes_db() -> None:
    NOTES_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(NOTES_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS kb_articles (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            topic       TEXT NOT NULL,
            title       TEXT NOT NULL,
            body        TEXT NOT NULL,
            author      TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
    """)
    # Seed with a few legitimate articles if empty.
    cur = conn.execute("SELECT COUNT(*) FROM kb_articles")
    if cur.fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO kb_articles(topic, title, body, author, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            [
                ("password reset",
                 "Password Reset Policy",
                 "Visit https://password.megacorpone.local to reset your password. "
                 "Requirements: 12+ chars, mixed case, number, symbol. "
                 "Locked out? Call ext. 4357.",
                 "it_admin", "2026-01-15"),
                ("vpn",
                 "VPN Setup",
                 "Download GlobalProtect from the IT portal. Connect to "
                 "vpn.megacorpone.local with your AD credentials.",
                 "it_admin", "2026-01-20"),
            ],
        )
    conn.commit()
    conn.close()


def _retrieve_notes(query: str) -> str:
    """Pull articles whose topic appears in the user's query. Returns
    a flat string suitable for stuffing into the system prompt.

    VULNERABILITY: returns the most-recent article first, no
    authorship verification, no review. Whoever can write a row
    controls what the agent says next time someone asks about that
    topic."""
    _ensure_notes_db()
    conn = sqlite3.connect(NOTES_DB)
    q = query.lower()
    rows = conn.execute(
        "SELECT title, body, author, updated_at FROM kb_articles "
        "ORDER BY updated_at DESC"
    ).fetchall()
    conn.close()
    hits = []
    for title, body, author, updated in rows:
        # naive topic matching: does the title appear in the query?
        for word in title.lower().split():
            if len(word) > 3 and word in q:
                hits.append(f"[KB:{title} · updated {updated}]\n{body}")
                break
    return ("Knowledge-base articles relevant to this request:\n\n"
            + "\n\n".join(hits)) if hits else ""


# ---- /health --------------------------------------------------------------


@app.get("/health")
def health() -> dict[str, str | int]:
    return {"status": "healthy", "agent": AGENT_NAME, "port": int(os.environ.get("AGENT_PORT", 8001))}


@app.on_event("startup")
def _startup() -> None:
    _ensure_notes_db()
