# BYO-AI: handoff to whoever picks this up next

You have a fresh clone and no memory of the previous rounds. This is what the feature is, what
is already built, where the bodies are buried, and what is still open.

Read [`../CLAUDE.md`](../CLAUDE.md) first for the lab as a whole. This file is only the tutor.

---

## The idea in one paragraph

The lab does not ship an AI and has no server. It **borrows the reader's own** (Claude, ChatGPT,
app or voice) and gives it *presence on the page*: a labelled cursor, Docs-style text
highlighting with a blinking caret, collaborator badges in the head row, and sight of what the
reader's mouse is over. The mental model is a collaborator in a shared Google Doc, not a chat
window bolted to the side. The tutor is Socratic by instruction and bounded by code: it can
**point, highlight and talk**, and it cannot click, type, or change the reader's work. The
audience is high-schoolers and first-year non-CS students, so the tone is Feynman, not lecture,
and the answer is never given away. The educational argument for all of it lives in
[`EDUCATORS.md`](EDUCATORS.md).

## The four transports, in the order they degrade

1. **Live room (the flagship).** The page subscribes (SSE) to a pair of public **ntfy.sh**
   topics named by a four-letter room code: `tinyai-CODE-c` (commands in) and `tinyai-CODE-s`
   (state out); `tinyai-CODE-p` carries presence beacons between human pages sharing a room.
   The AI needs nothing but a URL-fetch tool: it reads state with a plain GET and publishes
   commands with a GET whose query string carries the JSON. **No server of ours, no account,
   no connector setup.** One click copies the invite, one paste into any AI starts the session.
2. **Paste loop.** The AI ends replies with a ```` ```aitutor ```` command block; the student
   pastes it into 🎓 → "Paste your AI's reply". Zero network.
3. **Static.** The hidden `#aiTutorBrief` block plus `AGENTS.md` brief any LLM handed the URL.
4. **MCP bridge** (`tutor-bridge/`): a self-hosted relay for classrooms that want a real MCP
   connector. Optional; nothing contacts it unless a `?bridge=` URL is given.

## The pieces

| file | what it is |
|---|---|
| `staging/tiny-ai/AGENTS.md` | The tutor briefing. The **only** ground truth the AI gets. |
| `staging/tiny-ai/ai-tutor.js` | Everything on the page: badges, cursor, room, relay, panel, section-5 handoff. |
| `staging/tiny-ai/tutor-bridge/` | The optional MCP relay: zero-dependency Node, streamable HTTP. |
| `staging/tiny-ai/index.html` | Carries **exactly two** insertions, and that is on purpose. |
| `docs/EDUCATORS.md` | The pedagogy: constructionism, the Piper lineage, lean-in-don't-ban, privacy. |
| `bin/probe/byoai.js` | The probe. Includes a REAL round trip against ntfy.sh, playing the AI with fetches. |

### The two insertions, and why there are only two

`index.html` gets the `#aiTutorBrief` block near the top of `<body>` and the `ai-tutor.js`
script tag (with a `?v=` cache-buster; **bump it on every change** or returning readers keep
the old layer). Nothing else. Every control, style and listener is injected at runtime by
`ai-tutor.js`. That keeps the lab one self-contained page and the feature's diff reviewable.
**Do not start adding tutor markup to the lab file.**

### The hidden briefing block is offscreen, NOT display:none

Readability-style extractors, which is how an LLM handed a URL actually sees the page, **drop
`display:none` subtrees**. The block exists for exactly those readers. If you tidy the CSS,
leave this alone.

### ai-tutor.js is a classic script on purpose

The lab's top-level `const`/`let` live in the shared global lexical scope. Another **classic**
script can read them; a module cannot. Every read is wrapped in try/catch, because the lab is
allowed to change and the tutor is not allowed to break the page when it does.

## The room code

Four characters from a lookalike-free alphabet, like casting to a classroom screen. A fresh
visit mints one and `history.replaceState`s it into the URL; a URL that arrives WITH `?room=`
keeps it. That one rule gives you: reload keeps a live session; sharing the URL puts a
classmate or teacher in the same room (their cursor appears, anchored to semantic targets, so
it lands right across different layouts); and the invite the student pastes into their AI
names the same room. The code is the only secret. Blast radius of a leak: a stranger could
read page-state snapshots and point a cursor. Documented, accepted, prototype.

## The live relay: what took the rounds

- **ntfy.sh commits its message cache in ~2s batches.** A publish returns 200 and an immediate
  poll sees nothing; two seconds later it is there. The AI's natural pacing absorbs this, but
  a probe (or an impatient reader of `/json?poll=1`) must wait or loop. Not a bug. Ours or theirs.
- **ntfy drops SSE streams casually and EventSource reconnects BY ITSELF** (readyState back to
  CONNECTING, then another `open`). The first implementation tore the stream down on every
  `error` event and rebuilt it with growing backoff, which fought the built-in retry and left
  the room "connected" for milliseconds at a time. Only a stream at readyState CLOSED is yours
  to rebuild. A delivered message also counts as proof the pipe is up (`joinRoom("message")`),
  because on a bad day `open` is late and messages are not.
- **The subscribe URL carries `since=90s`** so commands published during a reload or a dropped
  stream replay on reconnect; a `BOOT_AT - 15s` filter stops a fresh page from re-performing a
  minute of old pointing, and `lastSeen` ids drop same-stream replays.
- **One outbox, rate-shaped.** Everything the page publishes goes through a single queue that
  coalesces by kind (newest state wins), spaces messages ~3s apart, backs off on 429, and lets
  urgent messages (a state the AI just asked for) preempt the timer. The public server's
  polite budget is roughly a message per five seconds sustained; stay under it.
- **cdn.babylonjs.com outages stall the whole page** including the deferred tutor layer,
  because the Babylon script tags are synchronous. During one such outage every probe read
  "AITutor never loaded". Check the CDN before debugging your own code. (Vendoring Babylon
  would fix this class of failure; it has not been done.)

## Rules that are load-bearing

1. **Change the lab, change `AGENTS.md`.** It is the tutor's only ground truth: section map,
   the journey arc, model internals in display units (mg 0 to 10, happiness 0 to 100), the
   section-5 rubric, and the live protocol with its "wait a few seconds, then poll" caveat.
2. **Display units, always.** Mixing raw 0..1 with display units is the fastest way to make
   the tutor sound wrong.
3. **The page never grades the knowledge check.** The reader's own AI does, in their own chat.
   Do not "improve" it into an autograder.
4. **The cursor may not eat clicks.** It is `pointer-events:auto` ONLY while parked and
   unowned (it is the door to the panel then); the moment an AI drives it, or it glides, it
   goes ghost. A student click aimed at a knob must never land on the tutor's cursor.
5. **The intro tour never scrolls.** Presence from the first second, yes; a page that scrolls
   itself, no. Beats that are off screen are skipped (`noscroll` on exec), the full tour runs
   at most 3 visits (`ait_intro_n`), a click anywhere ends it, and reduced-motion gets a
   parked cursor with no theatrics.
6. **The chip stays on one line.** `#aitBtn` lives in `.viewtoggle`, whose own rule pins
   buttons to a 27px square; the chip carries a `width:auto; height:27px` override, and the
   badges are divs precisely so that rule cannot crush them. This has shipped broken twice.
7. **The landing screen carries the challenge and nothing else.** If a tutor feature would
   push the reader's first task below the fold, say so before building it.
8. **No em dashes.** Anywhere. Standing instruction, not a style preference.

## How to work on it

```bash
python3 -m http.server 8784        # from staging/  (8783 is often taken by the root server)
# then, from the repo root
node bin/probe/cdp.mjs "http://localhost:8784/tiny-ai/" 5000 out.png bin/probe/byoai.js
```

The probe waits for readiness itself (the CDN can be slow), runs the paste-loop pipeline, then
does a REAL live round trip: subscribes, GET-publishes a `say` like an AI would, watches the
bubble appear, and polls the state topic. Expect every boolean true. `liveSubscribed` or
`liveStateReadable` false with everything else green usually means ntfy.sh is having a slow
day; rerun before blaming the code. Then run the QA in [`../QA.md`](../QA.md), because the
tutor injects into the page and layout regressions are the failure mode nobody catches by
reading the diff.

## What is done

- The presence layer: labelled cursor (clickable when unowned, breathing when inviting),
  highlighting with a blinking caret, polished speech bubbles (max-content width, viewport
  clamping, flip-above, dismissable), arrival toasts, a wave on hello.
- Collaborator badges (You + AI seat with status dot + peers), Docs style, in the head row.
- The room: minting, URL param, reload survival, shared-link join, "new room" reset.
- The live relay over ntfy.sh, both directions, with the outbox and reconnect lessons above.
- Peer presence: beacons, semantic-anchor cursors, join/leave toasts, badge strip, `bye` on
  pagehide. Cadence is gentle (about one beacon per 5s while moving) by rate-budget design:
  presence, not smooth trails.
- The intro tour (no scrolling, capped, interruptible) and the on-request demo tour.
- The invite prompt: page + briefing + room + both relay URLs + command set + fallbacks.
- `AGENTS.md` with the journey arc and per-section intent/done-when.
- The section 5 handoff, live and offline paths.
- The MCP bridge, unchanged, now tier 4.
- The probe, including the live round trip.

## What is open

- **Still staging-only.** Promotion to the live lab is Joel's call after his own acceptance
  test (paste the invite into his Claude, run the journey end to end, voice mode included).
- **No user test with the tutor on.** The measured flat confidence result (n=4, everything
  else positive) is the thing the tutor exists to move; that comparison has not been run.
- **Fetch-tool reality check.** The live protocol assumes the student's AI may fetch
  constructed URLs on a domain given in the conversation. Claude Code and API-side Claude do
  this freely. If a consumer app refuses the `publish?message=` GETs, the invite's built-in
  fallback (paste loop) still works; the failure is soft. Real-world rates unknown.
- **Multi-user is presence, not collaboration.** Peers see each other's cursors and section;
  nobody sees a shared model. Two students turning knobs still have two models.
- **The relay is a public free service.** Fine for a prototype and small classes; a school
  that cares should self-host ntfy (the `?relay=` param exists) or run `tutor-bridge/`.
