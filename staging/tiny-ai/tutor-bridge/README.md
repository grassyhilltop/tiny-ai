# tutor-bridge, live presence for the BYO-AI teaching assistant

The lab works with any AI the student already has, three ways, in increasing order of magic:

1. **No setup**: the student copies the tutor link (🎓 AI tutor → *Copy the tutor link*) into
   Claude or ChatGPT. The page and `AGENTS.md` brief the AI into Socratic tutor mode. Voice
   mode included. Nothing to run.
2. **Paste loop**: the AI ends replies with a small ```` ```aitutor ```` command block; the
   student pastes it into 🎓 → *Paste your AI's reply* and the AI's cursor/highlights appear.
   Still nothing to run.
3. **Live (this folder)**: the AI holds an MCP connection to the page and can see the
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
# prints https://something.trycloudflare.com, that's your relay URL
```

(`ngrok http 8787` works the same way. For a classroom, deploying this file to any tiny Node
host, Render, Railway, Fly, gives everyone one stable URL.)

## Connect the student's page

On the lab page: **🎓 AI tutor → Live session… →** paste the relay URL → **Connect**.
The page invents a 5-letter room code and shows it. The tutor link the student copies
afterwards includes the MCP URL and room code automatically.

Or hand out one prepared link and the page connects on load:
`https://claybits.xyz/tiny-ai/?bridge=RELAY_URL&room=CODE`

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

## Voice mode: use the plain URLs, not MCP

**Voice mode does not get custom MCP connectors.** Not on Claude, not on ChatGPT. This is the
single most confusing thing about the feature: the cursor works perfectly in a text chat and
goes dead the second you press the voice button, in the same conversation, with the same
connector installed.

What voice *does* have is a tool for reading a web page. So every tool above is also an
ordinary GET that answers in plain text:

```
GET RELAY/v/ROOM                                   look at the student's screen
GET RELAY/v/ROOM/point/dose?say=what+does+this+do   point, and ask
GET RELAY/v/ROOM/highlight/too+much+does+harm      highlight words on the page
GET RELAY/v/ROOM/say/one+short+line
GET RELAY/v/ROOM/clear
GET RELAY/v/ROOM/hello/Claude
```

Every reply **acts and then reports the page state**, so one fetch per turn is enough. Voice
round-trips are slow, and a model that needs two calls to point and look mostly makes one and
guesses.

Three things that are load-bearing:

- **The prompt has to be in the conversation before voice starts.** You cannot paste into a
  voice session, so paste the tutor link into a normal text chat first and *then* press the
  voice button in that same conversation. The URLs are in the context by then.
- **Cache-bust every call.** Web fetching caches hard. Without a changing `?n=` the model is
  handed the student's screen as it was minutes ago and will confidently describe the wrong
  thing. The menu in every response says so, because the model is the one who has to remember.
- **`+` in a path is a literal plus, not a space.** Models write `/highlight/too+much+does+harm`
  anyway, because query strings taught them that. The relay decodes `+` as a space for this
  reason.

Side effects on a GET is normally a sin. It is deliberate here, and the ceiling is unchanged:
the worst anyone can do with a leaked room code, by any door, is move a cursor.

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

The voice door is easier to check, because it is just a URL. With the lab open and connected to
room `TEST`, this should move the cursor and print the state back:

```bash
curl "localhost:8787/v/TEST/point/dose?say=hello+from+curl&n=1"
```

If that works and your AI still cannot do it in voice, the problem is the AI's fetching tool,
not the relay.

## Getting this file without cloning

The relay is served as a static file alongside the lab, so a tester can grab and run it in two
lines:

```bash
curl -O https://claybits.xyz/staging/tiny-ai/tutor-bridge/server.mjs
node server.mjs
```

## Honest limits (it's a classroom prototype)

- A room code is the only secret; anyone who has it can move the cursor and read page state.
  Codes are short-lived (rooms die after an hour idle) and the worst case is a moving cursor,
  but don't reuse codes across days.
- No TLS of its own, the tunnel provides it.
- One page per room: a second tab replaces the first.
