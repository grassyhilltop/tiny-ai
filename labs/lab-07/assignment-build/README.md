# Lab 07 · Part 2 — build your own MCP server, test it with MCP Inspector (group)

You've spent the lab attacking other people's MCP servers. Now write one — as a
**group** — host it on GitHub, and prove it works with a real MCP client. This is
a **Build → Break → Secure** exercise on a server *you* author.

> **Submit:** a link to your group's **public GitHub repo** with the three Python
> files below and `SERVER.md`. List every member in the repo README.

## What's here

```
assignment-build/
├── my_server.py            ← BUILD: two tool stubs; finish them, plant one vuln
├── attack_my_server.py     ← BREAK: MCP client; finish build_payload() to exploit
├── notes/                  ← sample data the read_note tool serves
│   ├── welcome.txt
│   └── todo.txt
└── secret.txt              ← a file OUTSIDE notes/ — your traversal target, if you go that way
```

## Test it with MCP Inspector

Your server speaks MCP over stdio. The easiest way to load it in a real MCP
client and call a tool is the official **MCP Inspector** — a zero-install testing
UI. (We use Inspector rather than an IDE host because IDE MCP support is still
in preview and fiddly to install; Inspector runs the same everywhere — your
laptop or the OOD Code Server on Rivanna.)

1. `pip install mcp` in your Python environment.
2. Launch Inspector pointed at your server (needs Node ≥ 18; nothing to install —
   `npx` fetches it):
   ```bash
   npx @modelcontextprotocol/inspector python my_server.py
   ```
3. It opens a local web UI. Click **Connect**, open the **Tools** tab — your two
   tools should be listed. Pick one, fill in the arguments, and click **Call**.
4. **Capture a screenshot** of Inspector listing your tools and the result of one
   tool call — that screenshot goes in `SERVER.md` as proof the server loads.

> Prefer a full LLM host? **Claude Desktop** (macOS/Windows) and **Cursor**
> (all platforms) both load the same server — add a `my-server` entry pointing at
> `python my_server.py` to their MCP config. Inspector is all the assignment
> requires, but a real agent calling your tool is the more realistic demo.

## The task

1. **Build** — implement `my_server.py` so it exposes **≥2 working tools** over
   MCP, one of which touches something sensitive (here: `read_note` reads files).
2. **Break** — plant **exactly one** vulnerability from the lab taxonomy
   (description poisoning, path traversal, over-privileged tool,
   command/argument injection, or SSTI), then finish `attack_my_server.py` so it
   lands the exploit **through the MCP interface** — as a client calling the
   tool, not by importing your function.
3. **Secure** — copy `my_server.py` to `my_server_secure.py`, fix the one bug
   (remove the dangerous capability, don't just blocklist your single payload),
   and show the attack now fails:
   ```bash
   python attack_my_server.py                    # vulnerable → exploit lands
   python attack_my_server.py my_server_secure.py # secure → exploit fails
   ```

## Run it

```bash
pip install mcp          # the official MCP SDK (same one §9–§11 use)
python my_server.py      # starts the server on stdio (waits for a client)
# in another shell:
python attack_my_server.py
```

## Submit

The three Python files plus **`SERVER.md`**: what your server does, the MCP
Inspector screenshot proving a tool call, which vulnerability class you planted
and why it's a realistic developer mistake, the one-line root cause, and the
one-line fix.

**Try it (ungraded):** swap repos with another group and exploit their planted
vuln *blind* — before reading their `SERVER.md`.

A worked reference (path-traversal plant + secure twin) lives in
`../solution/build/` — for the instructor; don't peek until you've tried it.
