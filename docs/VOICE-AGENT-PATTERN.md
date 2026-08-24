# Letting a voice AI drive your web page

**The problem.** You have a web prototype open. You want to talk to Claude (or ChatGPT) by voice
while your hands are on the page, and you want the AI to see what you are doing and point at
things on your screen. Text chat can do this with MCP. **Voice cannot**, and the failure is
confusing: it works in the chat, then dies the instant you press the voice button.

This is how we made it work in [tiny-ai](https://claybits.xyz/tiny-ai). The pattern is not
specific to that lab. It needs no server of your own and no accounts.

---

## Background, if "GET request" is not everyday vocabulary

A web address is a request. When your browser loads `https://example.com/thing`, it sends a
**GET**: "give me whatever is at this address." That is the only verb most tools have.

The important part: **a GET can have a side effect.** Nothing stops the server at the other end
from doing something when you ask for an address, rather than just handing back a document. So if
you can arrange for `https://something/do-this-thing` to *mean* "do this thing", then anything
that can fetch a web address can trigger it. A voice AI can fetch a web address.

That is the whole trick. Every action becomes an address.

## What voice mode can and cannot do

Measured in August 2026:

| | text chat | voice mode |
|---|---|---|
| Custom MCP connectors | yes | **no** |
| First-party connectors (Gmail, Calendar, Docs, Slack, Canva, Notion) | yes | yes (Claude, paid) |
| Web search / fetching a page | yes | yes |

Custom MCP servers are not discovered in voice chat on Claude; the request was
[closed as not planned](https://github.com/anthropics/claude-ai-mcp/issues/146), reproduced on web
and Android. ChatGPT does not expose MCP during Advanced Voice either, so switching vendor buys
nothing. Voice is also absent from Claude Code and Cowork, which have dictation only.

**So the only channel that survives into voice is fetching a URL.** Everything below follows from
that one fact.

## The shape that works

Two families of address, one per direction. Both are ordinary `https://` links.

```
READ   https://ntfy.sh/tinyai-x3ya-s/raw?poll=1&since=5m
       the page publishes what it sees here; the AI fetches it to look at your screen

WRITE  https://ntfy.sh/tinyai-x3ya-c/publish?message=%7B%22cmd%22%3A%22point%22...%7D
       the AI fetches this to move its cursor; the page is listening and obeys
```

`ntfy.sh` is a free public message relay. One topic carries the page's state outward, another
carries commands inward. The page subscribes to the command topic over a live connection and runs
what arrives. **We host nothing.** The room code (`x3ya`) is the only thing that pairs the two.

The `message=` part is a small piece of JSON, percent-encoded so it survives being inside a web
address. `{"cmd":"point","target":"dose"}` becomes `%7B%22cmd%22%3A%22point%22...`. Ugly, and
that is fine: nobody types these.

## The four rules that actually decide whether it works

Each of these was learned by shipping the version without it.

### 1. Write out every URL in advance. Never let the AI build one.

This is the big one, and it is the answer to "why are the links pre-generated".

The claude.ai web app's fetch tool **only allows URLs that already appeared in the conversation.**
A URL the model composes is refused with *"This URL was not in any prior search or fetch result."*

Worse: sometimes a constructed URL is silently matched to the nearest URL already in the
conversation, and **that** one is fetched instead. In testing, every command in a session
"succeeded", each returning a real message id, while publishing the *example payload from the
prompt* over and over. It looks like it is working. It is not.

So the setup message writes out the tutor's **entire vocabulary as finished URLs**: one complete,
percent-encoded address for every action against every target, with an instruction to fetch them
character for character and never edit one. The AI is choosing from a menu, not composing.

That is the whole reason the links are generated ahead of time. Not efficiency. It is the only
shape the client will accept.

### 2. Pre-generate several copies of each URL, because a repeat is not free.

Fetch an identical address twice and the client answers the second one from its own cache without
the request ever leaving. Your command silently does not happen. Pointing somewhere else in
between does **not** clear it.

A tutor comes back to the same control three or four times in a session, so every target gets
several distinct URLs (we use three, differing only in an `n=1|2|3` field inside the payload).
Each is spent once.

Note what does **not** work: adding a cache-busting query parameter. Those get stripped. We
measured `since=15m` come back served as `since=3m`.

### 2b. Better: let each reply hand out the next batch of URLs.

Pre-generating in the prompt has a ceiling. Whatever number of uses per target you write out, a
tutor that comes back a sixth time has nothing left.

The client's rule is the way out. It allows any URL that appeared in **"any prior search or fetch
result"**, and a fetch *result* counts. You control what your read endpoint returns, so **put a
fresh batch of command URLs inside the state you hand back**. The AI reads the screen and is
given new hands in the same breath.

In tiny-ai the page appends a `next` list to every state it publishes: seven point URLs plus a
clear, each carrying a rising nonce so it has never been fetched, and the first one aimed at
whatever the student is hovering at that instant. Measured over five consecutive reads: forty
URLs, no repeats, about 1.6 KB per message.

The invite menu is now only the opening hand. After the first look the supply is endless, and the
model still never builds a URL.

### 3. Serve plain text, and check the content type.

A fetching tool reads a *web page*. `ntfy`'s `/json` endpoint is `application/x-ndjson`, which the
fetcher hands back as `[binary data]` and refuses to read. `/raw` is `text/plain` and works.

More generally: answer in prose or plain lines, not JSON. The reply is flattened and skim-read,
and structure gets summarised away.

### 4. Keep the read window short.

`/raw` returns every message in the window, oldest first, undated. Over an hour that is a wall of
near-identical lines, and a fetcher that truncates a long body hands the AI the *start* of the
session. It will then describe, with total confidence, the state you were in twenty minutes ago.
We ask for the last few minutes only, and refresh immediately before reading.

## The workflow for the human

**You cannot paste into a voice session.** So the order matters:

1. Open the page. Click the invite button and copy the setup message.
2. Paste it into a **normal text chat** with your AI.
3. **Then** press the voice button in that same conversation.

The menu of URLs is now in the conversation, which is exactly what rule 1 requires. Now talk.

The setup message also makes the AI **self-test in its first reply**, so a session that cannot go
live says so within ten seconds instead of pretending for twenty minutes.

## Where this lives in this repo

| what | where |
|---|---|
| The setup message and the URL menu | `MENU`, `cmdUrl()`, `invitePrompt()` in [`staging/tiny-ai/ai-tutor.js`](../staging/tiny-ai/ai-tutor.js) |
| What the AI is told to do with them | [`staging/tiny-ai/AGENTS.md`](../staging/tiny-ai/AGENTS.md) |
| The hard-won details and what is still open | [`BYOAI-HANDOFF.md`](BYOAI-HANDOFF.md) |
| The optional MCP route | [`staging/tiny-ai/tutor-bridge/`](../staging/tiny-ai/tutor-bridge/) |

## What about MCP?

We ship an MCP bridge, and it is **not** what the live room uses. It is the optional route.

**MCP is better wherever it is available.** The AI calls real tools with real arguments, so
there is no menu to pre-generate, no cache to fight, no percent-encoding, and no whitelist. It can
say arbitrary sentences and point at anything, not just the fourteen targets someone wrote out in
advance. It reports proper errors. If you are building for text chat only, use MCP.

It costs you: a server that has to be running and publicly reachable (we use a cloudflared
tunnel), and a connector the user installs in their settings. And it **does not exist in voice**,
which is the entire reason for the URL menu.

A fair summary: **MCP is the better channel, the URL menu is the one that works in voice.** Ship
both, default to the one that needs no setup.

## Honest limits

- Public relay, no auth beyond an unguessable room code. Fine for a prototype and a classroom.
  A school should self-host ntfy or run the bridge.
- Free relays have a daily message budget per IP. Automated test loops can spend a real user's
  allowance, so keep tests off the shared relay.
- Every action must be harmless. Ours can point, highlight and talk, and cannot click, type or
  change your work. Put side effects on a GET only when the worst case is a moving cursor.
