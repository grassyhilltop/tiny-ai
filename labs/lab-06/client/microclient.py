"""microclient.py — the smallest readable MCP client.

Spawns the server as a subprocess, sends JSON-RPC requests on stdin,
reads responses on stdout. No third-party libraries. Mirrors what a
real MCP host (Claude Desktop, Continue, OpenAI Apps) does — just
without the LLM in the loop.

Usage:

    # interactive REPL
    python client/microclient.py

    # one-shot
    python client/microclient.py call read_file path=hello.md
    python client/microclient.py list
"""

from __future__ import annotations
import argparse
import itertools
import json
import re
import subprocess
import sys
from pathlib import Path


SERVER = Path(__file__).resolve().parent.parent / "server" / "micromcp.py"


class MCPClient:
    """Holds a subprocess running the server and a request-id counter."""

    def __init__(self, server_path: Path = SERVER):
        self.proc = subprocess.Popen(
            [sys.executable, str(server_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True, bufsize=1,
        )
        self._ids = itertools.count(1)

    def request(self, method: str, params: dict | None = None) -> dict:
        rid = next(self._ids)
        msg = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        return json.loads(line)

    # Convenience wrappers — same shape as the official SDKs.

    def initialize(self) -> dict:
        return self.request("initialize")

    def tools_list(self) -> list[dict]:
        return self.request("tools/list")["result"]["tools"]

    def tools_call(self, tool_name: str, /, **kwargs) -> str:
        # `/` makes tool_name positional-only so a tool argument literally
        # called `name` (e.g. get_greeting) doesn't collide with it.
        result = self.request("tools/call", {"name": tool_name, "arguments": kwargs})["result"]
        # MCP tool results are a list of "content blocks". Each tool we
        # ship returns exactly one text block.
        return result["content"][0]["text"]

    def close(self) -> None:
        self.proc.stdin.close()
        self.proc.wait(timeout=2)


_KW = re.compile(r"""(\w+)\s*=\s*('[^']*'|"[^"]*"|\S+)""")


def parse_kwargs(text: str) -> dict:
    """Parse `key=value` pairs, tolerating spaces around `=` and quoted values.

    So `path=hello.md`, `path = hello.md`, and `path = '../server/x.py'`
    all yield {"path": "../server/x.py"} (quotes stripped).
    """
    return {k: v.strip("'\"") for k, v in _KW.findall(text)}


def repl() -> None:
    """Interactive shell so students can poke the server directly."""
    c = MCPClient()
    init = c.initialize()
    print(f"connected: {init['result']['serverInfo']}\n")
    print("commands: list | call NAME [key=value]... | quit\n")
    while True:
        try:
            line = input("mcp> ").strip()
        except (EOFError, KeyboardInterrupt):
            print(); break
        if not line: continue
        if line in ("quit", "exit", ":q"):
            break
        parts = line.split()
        cmd = parts[0]
        if cmd == "list":
            for t in c.tools_list():
                print(f"  {t['name']:14s}  {t['description']}")
        elif cmd == "call":
            if len(parts) < 2:
                print("usage: call NAME [key=value]..."); continue
            name = parts[1]
            kwargs = parse_kwargs(line[line.index(name) + len(name):])
            print(c.tools_call(name, **kwargs))
        else:
            print(f"unknown command: {cmd}")
    c.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("repl",   help="interactive REPL (default if no args)")
    sub.add_parser("list",   help="list the server's tools and exit")
    call = sub.add_parser("call", help="call one tool and exit")
    call.add_argument("name")
    call.add_argument("kwargs", nargs="*", help="key=value pairs")
    args = ap.parse_args()

    if args.cmd in (None, "repl"):
        repl()
        return

    c = MCPClient()
    c.initialize()
    if args.cmd == "list":
        for t in c.tools_list():
            print(f"{t['name']}  —  {t['description']}")
    elif args.cmd == "call":
        kwargs = parse_kwargs(" ".join(args.kwargs))
        print(c.tools_call(args.name, **kwargs))
    c.close()


if __name__ == "__main__":
    main()
