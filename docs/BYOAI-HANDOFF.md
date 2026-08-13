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

## READ THIS FIRST: what a chat client will and will not fetch

The zero-setup relay assumed the AI could build a URL per command and fetch it. **In the
claude.ai chat client it cannot**, and the way it fails is nasty. Measured, in that client:

- a URL the model constructs is refused outright: *"This URL was not in any prior search or
  fetch result."* Only URLs that already appeared in the conversation are fetchable.
- worse, a constructed URL is sometimes matched to the nearest URL already in the
  conversation and THAT is fetched instead. A `hello` command came back reporting success,
  with a real ntfy message id, having published the EXAMPLE payload written in the prompt.
  Every command in a session published the same example. Silent, total, looks like it works.
- query-string variation does not make a URL new: `_=N` cache-busters are stripped and
  `since=15m` came back served as `since=3m`.
- `ntfy /json` is `application/x-ndjson`, which the fetcher labels `[binary data]` and will
  not read. **Use `/raw`, which is `text/plain`.** This one is ours and is fixed.

**The answer that works: write the tutor's whole vocabulary out as finished URLs.** The invite
now carries a MENU (`MENU` + `cmdUrl()` in `ai-tutor.js`): hello, refresh-state, clear, and a
point-at URL for each of thirteen targets, every one complete and percent-encoded, with an
instruction to fetch them character for character and never build one. A client that refuses
constructed URLs is perfectly happy to fetch these, because they are literally in the
conversation. Pointing carries no note on purpose: in voice mode the words belong in the
student's ear, and a baked-in note would contradict whatever the tutor actually said.

Consequences, and they are load-bearing for anyone redesigning this:

1. **A GET-per-command channel cannot work in that client.** No relay swap fixes it; it is a
   client policy, not a transport problem. Do not "fix" it by choosing another host.
2. **A fixed URL that the prompt spells out in full is the one shape that does travel.** That
   is why the SEE url is written out literally and the AI is told never to modify it.
3. **MCP is the route to full live in the Claude app**, because tools are invoked directly
   and never dressed up as web pages. `bin/tutor-live.sh` stands the bridge up behind a
   cloudflared tunnel and prints the connector URL. Verified end to end: with the page on
   `?bridge=`, an MCP `get_page_state` returned live state and `point_at` moved the cursor
   and raised the right bubble.
4. **Paste mode is not the sad fallback, it is the default in those clients.** Hence the
   `📋 Apply reply` pill in the head row, which reads the clipboard and runs the commands in
   one click.

The invite therefore makes the AI **self-test in its first reply** and say which of three
states it is in (live / see-only / paste). A session that cannot go live now says so in ten
seconds instead of pretending for twenty minutes.

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
- **The quota is per IP, and the probe machine is the student's machine.** A day of automated
  testing spent the allowance on the laptop a real session was running on; the page's publishes
   429'd, the state topic stayed empty for twelve hours, and the tutor reported "I can point but
  not see" with no way to know why. The live round trip in `bin/probe/byoai.js` is now opt-in
  (`?live=1`), and `bin/probe/relay-stub.mjs` + `bin/probe/live-loop.js` exercise the entire
  loop locally for free. **A test must not be able to break the product.**
- **The page fails over between relays** (`RELAYS`, `ensureRelay()`): ntfy.sh, then ntfy.envs.net,
  then ntfy.adminforge.de, all independent public instances speaking the same protocol. The
  choice is made when the panel opens, BEFORE the invite is generated, because the invite
  freezes the host into every URL the tutor will ever fetch; if it settles late and moves, the
  panel tells the student to copy again. A read cannot detect an exhausted quota (reads are
  served happily while publishes 429), so the check is one real publish to a throwaway topic.
- **ntfy.sh has a DAILY quota per IP, and it is small.** Over it, publishes come back
  `429 {"code":42908,"error":"limit reached: daily message quota reached"}` and the room
  silently stops updating. A day of probing was enough to hit it from one laptop. Two
  consequences, both live in the code: the page publishes on things that MATTER (section,
  stage, data points, quiz streak) and lets the AI ask for the rest with its `state` command,
  and the pointer position is deliberately NOT in the change digest, because it changed every
  time the mouse crossed a card and was the single largest source of traffic. Measured after
  that change: **2 messages a minute** during active use, about 40 for a 20-minute session,
  against roughly 10/min before. A whole classroom behind one NAT is still the case that
  breaks it, which is what `tutor-bridge/` and the `?relay=` override are for. When the relay
  does start refusing, the page says so once in a toast rather than going quiet.
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
4. **The cursor may not eat clicks, and it must accept its own.** It is `pointer-events:auto`
   ONLY while parked and unowned; the moment an AI drives it, or it glides, it goes ghost, so
   a student click aimed at a knob never lands on the tutor. The flip side bit hard: the
   layer's own `#aitLayer *{pointer-events:none}` is **ID specificity (1-0-0)** and silently
   beats any `.class{pointer-events:auto}` written later, so the cursor, the bubble's close
   button and the invite button all shipped unclickable. Overrides in that layer need the id
   in front of them, and clickability must be tested with `elementFromPoint`
   (`bin/probe/tutor-click.js`), never with `dispatchEvent`, which skips hit-testing and
   passes on anything.
5. **The tour never plays by itself, and it never scrolls.** It is something the reader asks
   for by clicking the cursor. Autoplay was tried and removed: the first seconds of this page
   already have a 3D scene assembling itself, and a tutor flying around on top of that is
   noise. The visit counter that capped autoplay is gone too, because a page that behaves
   differently on the fourth reload than the first reads as haunted. Within the tour, beats
   that are off screen are skipped (`noscroll` on exec), a click or a scroll ends it (and
   **clears the pending beat**, or it fires seconds later and yanks the cursor), and
   reduced-motion gets a parked cursor with no theatrics.
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
