"""Agent tools.

Three callable tools the agent can invoke during its ReAct loop:
  - file_search(pattern)  -> list of matching paths under DATA_DIR
  - file_read(path)       -> file contents
  - config_lookup(key)    -> value from config.json

All tools are scoped to DATA_DIR. The agent only has access to files
inside that directory; everything else returns "not found".

Why this matters for the lab: these are exactly the kinds of tools a
real IT-helpdesk agent has — enough to be useful, enough to be
dangerous if the attacker controls what the agent reads.
"""

from pathlib import Path
import fnmatch
import json


DATA_DIR = Path(__file__).resolve().parent / "data"


def _safe_resolve(path: str) -> Path | None:
    """Resolve `path` to an absolute path inside DATA_DIR. Returns None
    on any escape attempt."""
    try:
        p = (DATA_DIR / path).resolve()
        p.relative_to(DATA_DIR.resolve())
        return p
    except (ValueError, RuntimeError):
        return None


def file_search(pattern: str) -> list[str]:
    """List every file under DATA_DIR whose basename matches `pattern`
    (glob syntax — e.g. `*.txt`, `config*`).
    """
    out: list[str] = []
    for p in DATA_DIR.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(DATA_DIR).as_posix()
        if fnmatch.fnmatch(p.name, pattern) or fnmatch.fnmatch(rel, pattern):
            out.append(rel)
    return sorted(out)


def file_read(path: str) -> str:
    """Read the contents of a single file under DATA_DIR. Returns the
    file body as a string, or an error message."""
    p = _safe_resolve(path)
    if p is None or not p.exists() or not p.is_file():
        return f"file not found: {path}"
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return f"read error: {e}"


def config_lookup(key: str) -> str:
    """Return a value from data/config.json. Dot-notation supported:
    `database.password` -> config['database']['password']."""
    cfg_path = _safe_resolve("config.json")
    if cfg_path is None or not cfg_path.exists():
        return "config not found"
    try:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return f"config parse error: {e}"
    cur: object = cfg
    for part in key.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return f"key not found: {key}"
    return json.dumps(cur) if not isinstance(cur, str) else cur


# Manifest the agent passes to the LLM so it knows what tools exist.
TOOL_MANIFEST = [
    {
        "name": "file_search",
        "description": "Search for files in the helpdesk knowledge base matching a glob pattern (e.g. '*.md', 'employee*').",
        "params": {"pattern": "glob pattern"},
    },
    {
        "name": "file_read",
        "description": "Read the contents of a file from the helpdesk knowledge base by path.",
        "params": {"path": "relative path under the knowledge base"},
    },
    {
        "name": "config_lookup",
        "description": "Look up a configuration value from the agent's config file. Use dot-notation for nested keys.",
        "params": {"key": "config key, e.g. 'database.host'"},
    },
]


def call_tool(name: str, **kwargs) -> str:
    """Dispatch a tool call by name. Returns a string the LLM will see
    as the tool's observation."""
    if name == "file_search":
        result = file_search(kwargs.get("pattern", ""))
        return "\n".join(result) if result else "(no matches)"
    if name == "file_read":
        return file_read(kwargs.get("path", ""))
    if name == "config_lookup":
        return config_lookup(kwargs.get("key", ""))
    return f"unknown tool: {name}"
