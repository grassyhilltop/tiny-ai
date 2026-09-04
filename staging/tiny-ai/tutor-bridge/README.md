# tutor-bridge: the self-hosted MCP option for the BYO-AI teaching assistant

The lab works with any AI the student already has. The zero-setup path (🎓 AI tutor →
*Copy the invite for your AI* → paste) asks that AI to fetch two URLs: one to read the
student's screen, one to send a command. Reading works widely. **Sending does not work in the
claude.ai chat client**, which only fetches URLs that already appeared in the conversation and
will refuse, or silently substitute, one the model builds. There the tutor sees and talks, and
its pointing arrives through the one-click **📋 Apply reply** paste pill.

This folder is how you get the full thing: a **self-hosted relay with a real MCP connector**,
where the AI calls tools directly and the URL restriction never applies. It is the only route
to an AI that points at things by itself inside the Claude app.

## Why you probably DO need this for the Claude app

The zero-setup path asks the AI to fetch a URL per command. The claude.ai chat client only
fetches URLs that already appeared in the conversation, so a constructed command URL is
refused, or quietly swapped for an earlier one (which publishes the wrong payload while
reporting success). MCP has no such restriction: the AI calls tools directly. If you want the
tutor to actually point at things inside the Claude app, this folder is the way.

## Run it, the short way

```bash
bin/tutor-live.sh          # from the repo root: starts the bridge, opens a public tunnel,
                           # and prints the connector URL and the lab link to open
```

Needs `cloudflared` for the public URL (`brew install cloudflared`), or pass `--local` to use
it with Claude Code on the same machine.

## Run it, by hand

```bash
node server.mjs            # Node 18+, no dependencies, listens on :8787
```

For an AI that lives in the cloud (claude.ai, ChatGPT) the relay needs a public HTTPS URL.
Quickest, no account:

```bash
cloudflared tunnel --url http://localhost:8787
# prints https://something.trycloudflare.com, that's your relay URL
```

(`ngrok http 8787` works the same way. For a classroom, deploying this file to any tiny Node
host, Render, Railway, Fly, gives everyone one stable URL.)

## The no-terminal option: `worker.js`

`server.mjs` above needs a machine that stays on and a tunnel. **`worker.js` needs neither.** Same
idea as a Cloudflare Worker: one file, deployed from a browser, free tier, and **it stores
nothing**, which is the trick that keeps it free. Every tool call is a plain HTTPS call to the
public ntfy relay the lab page is already listening on, so there are no sessions to hold and no
Durable Objects to pay for. One deployment serves every classroom, because the room code rides in
the URL.

**Deploy, about two minutes, no terminal and nothing installed:**

1. `dash.cloudflare.com` -> **Compute (Workers)** -> **Create** -> **Start from Hello World** ->
   **Deploy**.
2. **Edit code**, select all, paste
   [`worker.js`](https://claybits.xyz/staging/tiny-ai/tutor-bridge/worker.js) over it, **Deploy**.
3. Your URL is `https://SOMETHING.workers.dev`. Visit it and it prints its own instructions.

**Connect it in Claude:** Settings -> Connectors -> *Add custom connector* ->

```
https://SOMETHING.workers.dev/mcp/ROOMCODE
```

The room code is the four letters in the lab's graduation-cap panel. Everyone pastes the same base
URL and changes only the code, so a teacher hands the connector out once.

Tools: `look_at_screen`, `point_at`, `highlight_text`, `say`, `clear_marks`, `introduce`.

`point_at` reports "sent, now verify", never "done". All the server knows is that the relay took
the message; whether the page found that target is the page's business, and a nonsense target used
to come back as a cheerful success.

**Test it before you deploy anything**, no account and no cost, using the stub relay:

```bash
node bin/probe/relay-stub.mjs 8788 &
node bin/probe/worker-local.mjs 8789 http://localhost:8788 &
curl -s -X POST localhost:8789/mcp/TEST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`worker-local.mjs` runs that exact file on Node by wrapping its fetch handler, so what you test is
what you deploy.

## Connect the student's page

Hand out one prepared link: `https://claybits.xyz/tiny-ai/?bridge=RELAY_URL&room=CODE`
, the page connects to your relay on load, using the room code from the URL (the page mints
one if the link has none; the code shows in the 🎓 panel).

## Connect the student's AI

The MCP endpoint is `RELAY_URL/mcp/ROOMCODE` (streamable HTTP, no auth).

- **claude.ai / Claude apps**: Settings → Connectors → *Add custom connector* → paste the URL.
  Then in the chat, the pasted tutor link tells Claude to call `get_page_state` first.
- **Claude Code**: `claude mcp add --transport http tutor RELAY_URL/mcp/ROOMCODE`
- **ChatGPT**: Settings → Connectors (developer mode) → add the same URL.
- Any other MCP-capable client: it's a plain streamable-HTTP server.

Tools the AI gets: `get_page_state`, `point_at`, `highlight_text`, `move_cursor`, `say`,
`clear_annotations`, `introduce`. The page enforces the ceiling: an AI can point, highlight
and talk, it cannot click, type, or change the student's work.

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
- No TLS of its own, the tunnel provides it.
- One page per room: a second tab replaces the first.
