# tutor-bridge — live presence for the BYO-AI teaching assistant

The lab works with any AI the student already has, three ways, in increasing order of magic:

1. **No setup** — the student copies the tutor link (🎓 AI tutor → *Copy the tutor link*) into
   Claude or ChatGPT. The page and `AGENTS.md` brief the AI into Socratic tutor mode. Voice
   mode included. Nothing to run.
2. **Paste loop** — the AI ends replies with a small ```` ```aitutor ```` command block; the
   student pastes it into 🎓 → *Paste your AI's reply* and the AI's cursor/highlights appear.
   Still nothing to run.
3. **Live (this folder)** — the AI holds an MCP connection to the page and can see the
   student's pointer/selection and point back in real time. Needs this one relay running
   somewhere both ends can reach.

## Run it

```bash
node server.mjs            # Node 18+, no dependencies, listens on :8787
```

For an AI that lives in the cloud (claude.ai, ChatGPT) the relay needs a public HTTPS URL.
Quickest, no account:

```bash
cloudflared tunnel --url http://localhost:8787
# prints https://something.trycloudflare.com — that's your relay URL
```

(`ngrok http 8787` works the same way. For a classroom, deploying this file to any tiny Node
host — Render, Railway, Fly — gives everyone one stable URL.)

## Connect the student's page

On the lab page: **🎓 AI tutor → Live session… →** paste the relay URL → **Connect**.
The page invents a 5-letter room code and shows it. The tutor link the student copies
afterwards includes the MCP URL and room code automatically.

Or hand out one prepared link: `https://claybits.xyz/tiny-ai/?bridge=RELAY_URL&room=CODE`
— the page connects on load.

## Connect the student's AI

The MCP endpoint is `RELAY_URL/mcp/ROOMCODE` (streamable HTTP, no auth).

- **claude.ai / Claude apps**: Settings → Connectors → *Add custom connector* → paste the URL.
  Then in the chat, the pasted tutor link tells Claude to call `get_page_state` first.
- **Claude Code**: `claude mcp add --transport http tutor RELAY_URL/mcp/ROOMCODE`
- **ChatGPT**: Settings → Connectors (developer mode) → add the same URL.
- Any other MCP-capable client: it's a plain streamable-HTTP server.

Tools the AI gets: `get_page_state`, `point_at`, `highlight_text`, `move_cursor`, `say`,
`clear_annotations`, `introduce`. The page enforces the ceiling: an AI can point, highlight
and talk — it cannot click, type, or change the student's work.

## Smoke test without any AI

```bash
node server.mjs &
# pretend to be the AI:
curl -s localhost:8787/mcp/TEST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 400
# with the lab open and connected to room TEST, make the cursor move:
curl -s localhost:8787/mcp/TEST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"point_at","arguments":{"target":"dose","note":"hello from curl"}}}'
```

## Honest limits (it's a classroom prototype)

- A room code is the only secret; anyone who has it can move the cursor and read page state.
  Codes are short-lived (rooms die after an hour idle) and the worst case is a moving cursor,
  but don't reuse codes across days.
- No TLS of its own — the tunnel provides it.
- One page per room: a second tab replaces the first.
