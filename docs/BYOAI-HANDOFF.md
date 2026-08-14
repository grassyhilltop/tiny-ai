# BYO-AI: handoff to whoever picks this up next

You have a fresh clone and no memory of the last six rounds. This is what the feature is, what is
already built, where the bodies are buried, and what is still open.

Read [`../CLAUDE.md`](../CLAUDE.md) first for the lab as a whole. This file is only the tutor.

---

## The idea in one paragraph

The lab does not ship an AI and has no server. It **borrows the reader's own** (Claude, ChatGPT,
app or voice) and gives it *presence on the page*: a labelled cursor, Docs-style text
highlighting with a blinking caret, and sight of what the reader's mouse is over. The mental model
is a collaborator in a shared Google Doc, not a chat window bolted to the side. The tutor is
Socratic by instruction and bounded by code: it can **point, highlight and talk**, and it cannot
click, type, or change the reader's work. The audience is high-schoolers and first-year non-CS
students, so the tone is Feynman, not lecture, and the answer is never given away.

## The four pieces

| file | what it is |
|---|---|
| `staging/tiny-ai/AGENTS.md` | The tutor briefing. The **only** ground truth the AI gets. |
| `staging/tiny-ai/ai-tutor.js` | Everything on the page: the chip, presence, context, the section 5 handoff. |
| `staging/tiny-ai/tutor-bridge/` | The optional live relay: zero-dependency Node, MCP over streamable HTTP. |
| `staging/tiny-ai/index.html` | Carries **exactly two** insertions, and that is on purpose. |

### The two insertions, and why there are only two

`index.html` gets the `#aiTutorBrief` block near the top of `<body>` and the `ai-tutor.js` script
tag. Nothing else. Every control, every style and every listener the feature needs is injected at
runtime by `ai-tutor.js`. That keeps the lab one self-contained page and keeps the feature's diff
reviewable on its own. **Do not start adding tutor markup to the lab file.**

### The hidden briefing block is offscreen, NOT display:none

`#aiTutorBrief` is positioned offscreen and left visible to the accessibility and extraction
layer. Readability-style extractors, which is how an LLM handed a URL actually sees the page,
**drop `display:none` subtrees**. The block exists for exactly those readers, so hiding it
properly would delete the whole discovery mechanism. If you tidy the CSS, leave this alone.

### ai-tutor.js is a classic script on purpose

The lab's top-level `const`/`let` live in the shared global lexical scope. Another **classic**
script can read them; a module cannot. `ai-tutor.js` needs `stage`, `P`, `P0`, `loss()`, `DATA`
and friends to build its snapshot, so it is `<script defer src=...>` and not `type="module"`.
Every read is wrapped in try/catch, because the lab is allowed to change and the tutor is not
allowed to break the page when it does.

## The one entry point: `AITutor.exec`

All three transports (paste loop, live bridge, demo) funnel into `window.AITutor.exec(cmd)`.
That is deliberate: testing `exec` tests all three. The probe is
[`../bin/probe/byoai.js`](../bin/probe/byoai.js).

```
hello     { name }                       introduce the cursor, set its label and colour
cursor    { x, y }                       move the labelled cursor
point     { target, note }               move to a named target and say something about it
highlight { text }                       find the text and mark it, Docs style, caret blinking
say       { text }                       speech line, no movement
clear     {}                             take everything down
state     {}                             read the lab back: stage, models, loss, pointer, selection
```

There is no `click` and no `type`, and adding one is the one change that would break the feature's
promise. `exec` returns `{ok:false}` for anything it cannot do rather than throwing, so a
confused model degrades to doing nothing.

`TARGETS` maps DOM positions to teachable descriptions ("the dose dial, x, the input, 0 to 10
mg"). It is ordered **most specific first** and the first match wins. `findTextRange()` walks
text nodes across element boundaries and is whitespace-insensitive, so a model quoting the page
with different line wrapping still lands the highlight.

## Rules that are load-bearing

1. **Change the lab, change `AGENTS.md`.** It carries the section map, the model internals in
   display units (dose in mg 0 to 10, happiness 0 to 100) and the section 5 rubric. It is the
   tutor's only ground truth, and a stale briefing produces a tutor that confidently describes a
   page that no longer exists.
2. **Display units, always.** Internally the model works in 0..1 on both axes; `XUNIT=10` and
   `YUNIT=100` convert for display. The briefing and everything the tutor says are in display
   units. Mixing them is the fastest way to make the tutor sound wrong.
3. **The page never grades the knowledge check.** Section 5 offers a handoff (live event, or one
   click to copy the sentence plus a rubric request). The reader's own AI grades it in their own
   chat. That is what makes the check mean anything; do not "improve" it into an autograder.
4. **The chip stays on one line.** `#aitBtn` lives in `.viewtoggle`, whose own rule pins buttons
   to a 27px square, so the chip carries a `width:auto; height:27px` override. Anything else added
   to that row needs the same treatment. This has shipped broken twice, in the settings panel.
5. **The landing screen carries the challenge and nothing else.** If a tutor feature would push
   the reader's first task below the fold, say so before building it.
6. **No em dashes.** Anywhere. This is a standing instruction, not a style preference.

## The live bridge

`tutor-bridge/` is optional and nothing on the page contacts it unless the reader types its URL.
It is a room relay: the page opens an SSE channel, the AI speaks JSON-RPC over MCP streamable
HTTP, rooms expire after an hour. Its README has the claude.ai and ChatGPT connector steps. It has
no database and no persistence by design, and it should stay that way; the moment it stores a
transcript it becomes a thing with a privacy policy.

## How to work on it

```bash
python3 -m http.server 8783        # from staging/
# then, from the repo root
node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 12000 out.png bin/probe/byoai.js
```

Expect every boolean true, `cursorLabel` "Claude · AI", and `kcheckNudge` non-null. Then run the
QA in [`../QA.md`](../QA.md) like any other change, because the tutor injects into the page and
layout regressions are the failure mode nobody catches by reading the diff.

To film it: `bin/probe/clips/ai-tutor-cursor.js` drives a scripted conversation through `exec`
and is a good manual smoke test as well as a README clip.

## What is done

- The presence layer: labelled cursor, highlighting with a blinking caret, speech line.
- The context tracker: what the pointer is over, what is selected, which section is in focus.
- The `AGENTS.md` briefing and the hidden discovery block.
- The CTA chip in the head row.
- The section 5 handoff.
- The live bridge, with its README.
- The paste loop, including parsing ` ```aitutor ` blocks out of a pasted reply.

## What is open

- **The feature is staging-only.** It has never been promoted to the live lab. That is a
  deliberate hold, not an oversight.
- **The revised intent.** Joel has a rewrite of what this feature should be. It has not landed in
  a message yet, and until it does this document describes the built thing, not the intended one.
  **Get that spec before doing design work on the tutor.** Building against this file when a
  revision exists is how you spend a round on the wrong thing.
- Voice mode is only tested as "the phone talks and the reader pastes". Nothing on the page knows
  the difference, which is fine, but nobody has sat with a phone and a real student yet.
- No user test has been run with the tutor switched on. Everything measured so far (n=4, 100%
  completion, median 13:31, NPS +50, **no movement on any of the three confidence measures**) is
  from the lab without it. That flat confidence result is the most actionable thing in the data
  and is the obvious thing for the tutor to move.
