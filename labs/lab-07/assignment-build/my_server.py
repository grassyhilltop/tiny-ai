"""my_server.py — YOUR MCP server.  Lab 07 · Part 3 capstone (Build → Break → Secure).

You've attacked three real MCP servers (§9–§11). Now build one. This skeleton
uses the official MCP SDK (`pip install mcp`) over stdio — the same protocol the
real servers speak. Run it and it waits for an MCP client on stdin/stdout:

    python my_server.py

Attack it with the companion client (also a template you finish):

    python attack_my_server.py

Your job (see the Part 3 assignment on the lab page):
  1. BUILD   — make both tools below actually work (≥2 working tools).
  2. BREAK   — plant exactly ONE vulnerability from the lab taxonomy in a tool,
               and finish attack_my_server.py to exploit it OVER MCP.
  3. SECURE  — copy this to my_server_secure.py, fix the one bug (remove the
               dangerous capability, don't just blocklist your one payload), and
               show the same attack now fails.
"""

from pathlib import Path

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-server")

NOTES_DIR = Path(__file__).parent / "notes"


@mcp.tool()
def list_notes() -> str:
    """List the note files available to read. (A benign tool, so the catalog has
    more than one entry — leave this one safe.)"""
    return "\n".join(sorted(p.name for p in NOTES_DIR.glob("*.txt"))) or "(no notes)"


@mcp.tool()
def read_note(name: str) -> str:
    """Read a note by name from the notes/ directory and return its text.

    A legitimate call looks like:  read_note("welcome.txt")  ->  notes/welcome.txt
    """
    # ========================================================================
    # YOUR JOB · Part 3.
    # Implement read_note so the legitimate call above works, AND so it carries
    # exactly ONE planted vulnerability from the lab taxonomy. Path traversal is
    # the natural fit for a file-reading tool (think back to §3 / Attack 2), but
    # you may pick a different bug class and a different tool — just plant
    # exactly one, and document it in SERVER.md.
    raise NotImplementedError("implement read_note, and plant your vulnerability")
    # ========================================================================


if __name__ == "__main__":
    mcp.run()  # stdio transport — an MCP client speaks JSON-RPC over stdin/stdout
