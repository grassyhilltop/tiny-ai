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

`server.mjs` above needs a machine that stays on and a tunnel. **`worker.js` needs neither.** It is
one file you paste into a Cloudflare Worker: free tier, no build step, and **it stores nothing**,
which is the trick that keeps it free. Every tool call is a plain HTTPS call to the public ntfy
relay the lab page is already listening on, so there are no sessions to hold and no Durable Objects
to pay for. **One deployment serves every classroom and every session**, because the room code is a
tool argument rather than part of the URL.

**Deploy, about two minutes, no terminal and nothing installed:**

1. `dash.cloudflare.com` -> **Compute (Workers)** -> **Create** -> **Start from Hello World** ->
   **Deploy**.
2. **Edit code**, select all, paste
   [`worker.js`](https://claybits.xyz/staging/tiny-ai/tutor-bridge/worker.js) over it, **Deploy**.
3. **Set `NTFY_TOKEN`. This is not optional, see below.** Settings -> Variables and Secrets ->
   add `NTFY_TOKEN` -> Deploy.
4. Your URL is `https://SOMETHING.workers.dev`. Visit it in a browser and it prints its own
   instructions and tells you whether the token is set.

### `NTFY_TOKEN`, and why the first call comes back 429 without it

ntfy rate limits per **visitor**, and a visitor is an IP address (a `/32`, or a `/64` on v6). A
browser gets its household IP and its own bucket. A Cloudflare Worker does not: it egresses from
Cloudflare's shared pool, which the rest of the internet is also drawing on, so the bucket is
permanently drained and the **first tool call of a cold session returns 429**. Nothing in
`worker.js` counts anything; there is no budget of ours to spend. The fix is an ntfy account token,
which moves the limit onto the account:

1. `ntfy.sh` -> Sign up (free) -> **Account** -> **Access tokens** -> Create token.
2. Paste it into the Worker as a variable named `NTFY_TOKEN`, redeploy.

Without it the server says so in its own error text, so a tutor hitting the wall can tell the
teacher what to fix instead of telling the student their page is broken.

### Connect it in Claude

Settings -> Connectors -> *Add custom connector* -> Authentication: **None** ->

```
https://SOMETHING.workers.dev/mcp
```

**No room code in the URL.** That is deliberate: a teacher can hand the connector URL out days in
advance, before any room exists, and it never needs changing again. The room code is an argument
the AI passes to each tool, and it arrives in the invite the student pastes at the start of a
session. (`/mcp/ROOMCODE` still works and makes that code the default, for a fixed classroom room.)

### Three tools, not six

`look_at_screen`, `show_on_screen`, `clear_marks`. Pointing, highlighting and speech are three
optional arguments of one call rather than three separate tools, because the Claude connector UI
asks for approval **per tool**, and every tool you add is another switch a fourteen-year-old has to
find. Three is the floor that still keeps reading and writing distinguishable.

`show_on_screen` reports "sent, now verify", never "done". All the server knows is that the relay
took the message; whether the page found that target is the page's business, and a nonsense target
used to come back as a cheerful success.

### Test it before you deploy anything

No account and no cost, using the stub relay:

```bash
node bin/probe/relay-stub.mjs 8788 &
node bin/probe/worker-local.mjs 8789 http://localhost:8788 &
curl -s -X POST localhost:8789/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`worker-local.mjs` runs that exact file on Node by wrapping its fetch handler, so what you test is
what you deploy.

### A URL a student will trust

`white-bread-211a.joel-sadler.workers.dev` is a fine address and a terrible thing to ask a class to
paste. Put a custom domain on the Worker: Cloudflare dashboard -> the Worker -> **Settings** ->
**Domains & Routes** -> **Add custom domain** -> `tutor.claybits.xyz`. It needs the zone on
Cloudflare, costs nothing extra, and the connector URL becomes `https://tutor.claybits.xyz/mcp`,
which matches the lab's own domain and reads as the same project rather than as a magic link.

## Connect the student's page

Hand out one prepared link: `https://claybits.xyz/tiny-ai/?bridge=RELAY_URL&room=CODE`
, the page connects to your relay on load, using the room code from the URL (the page mints
one if the link has none; the code shows in the 🎓 panel).

## Connect the student's AI

`server.mjs` serves streamable HTTP MCP at `RELAY_URL/mcp/ROOMCODE`, no auth. (`worker.js` serves
the same protocol at `RELAY_URL/mcp`, with the room as a tool argument, see above.)

- **claude.ai / Claude apps**: Settings -> Connectors -> *Add custom connector* -> paste the URL,
  Authentication **None**.
- **Claude Code**: `claude mcp add --transport http tutor RELAY_URL/mcp/ROOMCODE`
- **ChatGPT**: Settings -> Connectors (developer mode) -> add the same URL.
- Any other MCP-capable client: it's a plain streamable-HTTP server.

Tools `server.mjs` offers: `get_page_state`, `point_at`, `highlight_text`, `move_cursor`, `say`,
`clear_annotations`, `introduce`. `worker.js` collapses those to three, because the Claude UI asks
for approval per tool. Either way the page enforces the ceiling: an AI can point, highlight and
talk, it cannot click, type, or change the student's work.

**Then the student pastes the short invite.** In the lab's 🎓 panel, under the big copy button,
*"Short invite, if your AI has the tutor connector"* copies a fifteen-line message carrying the
room code and the teaching rules. Fifteen lines pastes as visible text; the full URL-menu invite is
long enough that Claude and ChatGPT turn it into an attached file, which is exactly the thing a
student is right not to trust from a stranger's page.

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

## worker-do.js: the same thing with no ntfy at all, and no quota

`worker.js` is stateless and rents ntfy.sh as its postbox. That turned out to be the binding
constraint, and the diagnosis is worth writing down because it wasted a round: **ntfy's free
allowance is 250 messages a day per IP ADDRESS**, and a Cloudflare Worker egresses from
Cloudflare's shared pool. So the ceiling is not yours, it is everyone's, and an ntfy account
token does not lift it, because the refusal happens before the account is ever consulted. The
symptom is a server that works, then does not, then does again, while your own ntfy dashboard
says you have used 74 of your 250.

`worker-do.js` deletes that whole problem, and introduces a different one that is worth
understanding before you deploy it. Durable Objects joined the Workers free plan in April 2025:
**100,000 requests a day and 13,000 GB-s of duration**. Duration is the one that binds. An object
is billed at 128 MB for every second it is resident, so the day's allowance is
13,000 / 0.128 = **101,562 object-seconds, which is 28 hours of one room**, not 28 rooms:

| | GB-s | share of a day |
|---|---|---|
| one room held open around the clock | 11,059 | 85% |
| one half-hour lesson | 230 | 1.8%, so 56 lessons a day |
| one idle tab that pauses after ten minutes | 77 | 0.6% |

Generous for teaching, and it cannot afford a single tab left open overnight. It ran the account
dry twice before that was understood. **An open EventSource is what keeps an object resident, and
EventSource reconnects by itself**, so the relay cannot close a room on its own: every reap it
tried was answered a second later by a fresh stream. The page has to agree, so it hangs up after
ten quiet minutes and after ninety in total, the relay sends an `ended` envelope rather than
closing silently, and the lab's 🎓 panel says "paused" on a line that resumes with one click.
`bin/probe/relay-idle.mjs` and `bin/probe/relay-hangup.js` hold the two halves of that.

Even so: one service instead of two, no second account, no token, and no rate limit to explain to
a teacher at nine in the morning.

**It impersonates ntfy**, route for route (`/{topic}/sse`, `/publish`, `/raw`, `/json`,
`/trigger`, and `POST /{topic}`), so the lab page needs no changes and the switch is one URL:

```
https://claybits.xyz/tiny-ai/?relay=https://YOURS.workers.dev
```

which also means it rolls back the same way.

**Deploy** (this one is not a pure copy-paste, because a Durable Object needs a binding):

1. Create a Worker, **Edit code**, paste `worker-do.js` over it, **Deploy**.
2. **Settings -> Bindings -> Add -> Durable Object namespace**: variable name `ROOMS`, class name
   `Room`, same Worker. **Deploy** again. Cloudflare writes the migration itself.
3. Visit `https://YOURS.workers.dev/`. It says whether the binding arrived.
   `…/diag?room=CODE` shows a live room: its topics, message counts and open streams.

Connector URL is unchanged: `https://YOURS.workers.dev/mcp`, no room code in it.

**Test it locally first**, no account and no deploy:

```bash
node bin/probe/worker-do-local.mjs 8797       # provides a fake ROOMS binding on Node
curl -s localhost:8797/                       # prints what it sees
curl -s "localhost:8797/tinyai-test-c/publish?message=hi"
curl -s -X POST localhost:8797/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Then point a real page at it: `http://localhost:8783/tiny-ai/?room=TEST&relay=http://localhost:8797`.

**One thing to keep if you extend it.** Duration, not requests, is what the free tier meters, so a
subscriber that is never removed keeps its object resident forever: a single leaked stream costs
more than a whole day of real teaching. `Room.fetch` therefore reaps three ways: writes that
reject drop the subscriber, a keepalive proves the pipe every 45 seconds, and every stream is
retired after 25 minutes regardless. EventSource reconnects by itself and asks for `since=90s`, so
a retired stream costs the page nothing.

### If the Worker's root URL serves the lab instead of the tutor text

Then it is not running this file. **Leave the Builds root directory blank and Cloudflare deploys
the repository as a STATIC SITE**: `/` answers with the tiny-ai landing page, `/tiny-ai/` answers
with a stale copy of the lab, `/mcp` does not exist, and none of it has a Durable Object in it.
The build log still says success, because deploying a static site IS a success. Set the root
directory to `staging/tiny-ai/tutor-bridge` (no leading slash) and rebuild.

Two more things from the same afternoon:

- **`workers.dev` routes default to disabled** on a Worker created this way. Domains & Routes,
  turn on Production. Until then nothing can reach it at all.
- **Keep `"name"` in wrangler.jsonc equal to the Worker's name in the dashboard.** Builds names
  the Worker from the dashboard but `npx wrangler deploy` names it from the file, so a mismatch
  quietly creates a SECOND Worker at a different URL while the one you keep testing never
  changes. The dashboard warns about this and it is worth heeding.

**The page defends itself against all of the above.** `ensureRelay()` probes each candidate with a
real publish and requires the message envelope back, so a host that answers 200 with a page of
HTML is rejected rather than adopted, and the session falls through to ntfy. That check exists
because a 200 from a misconfigured Worker is exactly what a working relay looks like from the
outside, and adopting one would send every command into a web server that cheerfully returns the
landing page. So: if the invite still shows `ntfy.sh` URLs, the Worker is not yet a relay. That is
the diagnostic, and it is also the safety net.
