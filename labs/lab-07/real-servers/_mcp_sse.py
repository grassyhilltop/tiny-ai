"""Shared MCP-over-SSE client helpers for the real-server attacks (§7–§11).

Unlike the toy baseline_server (plain JSON-RPC over HTTP POST, see
attacks/_helpers.py), the three *real* servers in this part of the lab speak
the actual Model Context Protocol. We reach all three the same way — an MCP
Server-Sent-Events endpoint at  <base>/sse. This script runs in a VS Code
terminal on the *same* Rivanna compute node as the servers, so the URL you point
at is simply http://127.0.0.1:<port>/sse — the server (and any command it runs)
lives on that node, not your laptop. VS Code's Ports panel additionally forwards
each port to your browser for viewing. See RIVANNA.md for the deploy steps.

  * DVMCP challenge 8 .......... speaks SSE natively (port 9008)
  * cyanheads/git-mcp-server ... stdio, wrapped by supergateway -> SSE
  * Anthropic mcp-server-git ... stdio, wrapped by supergateway -> SSE

Because supergateway exposes the same /sse contract DVMCP serves directly,
this one tiny client works against all three. It is the official MCP Python
SDK (`pip install mcp`) — the same library a real MCP host uses — so what you
send here is exactly what a compromised agent would send.
"""

import asyncio
import contextlib

from mcp import ClientSession
from mcp.client.sse import sse_client


def text_of(result) -> str:
    """Flatten a tools/call result into plain text.

    A CallToolResult carries a list of content blocks; for these servers the
    interesting payload is always the text block(s).
    """
    parts = []
    for block in getattr(result, "content", []) or []:
        parts.append(getattr(block, "text", str(block)))
    out = "\n".join(parts)
    if getattr(result, "isError", False):
        return "ERROR: " + out
    return out


@contextlib.asynccontextmanager
async def mcp_session(url: str):
    """Open one initialized MCP session over SSE and yield it.

    Usage:
        async with mcp_session("http://127.0.0.1:9008/sse") as s:
            tools = await s.list_tools()
            r = await s.call_tool("evaluate_expression", {"expression": "6*7"})
            print(text_of(r))
    """
    async with sse_client(url) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session


async def list_tool_names(session) -> list[str]:
    resp = await session.list_tools()
    return [t.name for t in resp.tools]


def _looks_like_connection_error(exc: BaseException) -> bool:
    """True if exc (or anything nested in an ExceptionGroup) is a connect failure.

    Covers raw socket errors and httpx transport errors (ConnectError,
    ConnectTimeout, ...), which anyio re-raises inside an ExceptionGroup.
    """
    if isinstance(exc, (OSError, ConnectionError)):
        return True
    if type(exc).__name__ in {
        "ConnectError", "ConnectTimeout", "ReadError", "RemoteProtocolError",
    }:
        return True
    inner = getattr(exc, "exceptions", None)  # ExceptionGroup from anyio task groups
    return bool(inner) and any(_looks_like_connection_error(e) for e in inner)


def run(coro) -> int:
    """Drive an async main() to completion; return its int exit code.

    Turns the usual anyio connection-refused noise into one actionable line.
    """
    try:
        return asyncio.run(coro)
    except BaseException as exc:  # noqa: BLE001 - we re-raise anything unexpected
        if _looks_like_connection_error(exc):
            print("\n!! could not reach the MCP server over SSE.")
            print("   Check the server is running on the right port, in a VS Code")
            print("   terminal on this same node. See real-servers/RIVANNA.md.")
            return 2
        raise


def banner(label: str) -> None:
    print()
    print("=" * 72)
    print(label)
    print("=" * 72)
