"""attack_my_server.py — exploit YOUR planted vulnerability, OVER MCP.

Spawns your server as a subprocess and talks to it as a real MCP client (the
same way a host would). The point is to exploit the tool *through the protocol*,
not by importing your function and calling it directly. Finish build_payload().

    python attack_my_server.py                       # attacks my_server.py
    python attack_my_server.py my_server_secure.py    # should now FAIL
"""

import asyncio
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def build_payload() -> str:
    """Return the malicious `name` argument that triggers your planted vuln."""
    # ========================================================================
    # YOUR JOB · Part 3.
    # For a path-traversal plant in read_note, this is a name that escapes the
    # notes/ directory (recall §3 / Attack 2). For a different bug class, craft
    # whatever argument trips your planted flaw.
    return ""   # TODO
    # ========================================================================


async def main(server: str) -> int:
    params = StdioServerParameters(command=sys.executable, args=[server])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as s:
            await s.initialize()
            tools = await s.list_tools()
            print("tools:", [t.name for t in tools.tools])

            print("\n[benign] read_note('welcome.txt'):")
            r = await s.call_tool("read_note", {"name": "welcome.txt"})
            print("".join(getattr(b, "text", "") for b in r.content).strip())

            payload = build_payload()
            if not payload:
                print("\n(!) build_payload() is empty — write your exploit and re-run.")
                return 1

            print(f"\n[attack] read_note({payload!r}):")
            r = await s.call_tool("read_note", {"name": payload})
            out = "".join(getattr(b, "text", "") for b in r.content)
            print(out.strip())

            # Decide success however fits your vuln, and print a clear verdict so
            # the grader (and you) can see it at a glance.
            if "flag{" in out:
                print("\n✓ ATTACK SUCCEEDED — read a file outside notes/.")
                return 0
            print("\n✗ attack did not land (or you're running the secure server).")
            return 1


if __name__ == "__main__":
    server = sys.argv[1] if len(sys.argv) > 1 else "my_server.py"
    raise SystemExit(asyncio.run(main(server)))
