# QA for the tiny-ai lab

Two levels. **Smoke QA** runs before every push to `main`. **Deep QA** runs on any substantive
change, and whenever Joel asks for "a QA run" or "deep QA".

Everything here exists because it broke at least once. The notes in brackets say what.

```bash
# start the server the probes talk to, from staging/
python3 -m http.server 8783

# then, from the repo root
WIN=1400,1000 node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 12000 out.png bin/probe/qa-smoke.js
WIN=1400,1000 node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 14000 out.png bin/probe/qa-deep.js
```

Smoke takes about **80 seconds**, deep about **2.5 minutes**, most of it the auto-train loop
running to convergence for real. Both print one line per check and write a screenshot. Neither
needs the network: the analytics endpoints are stubbed during the run.

`bin/probe/qa-smoke.js` and `bin/probe/qa-deep.js` do the mechanical half. **They do not replace
looking at the page.** Several of the worst bugs shipped green: a monitor that overlapped the
neurons, a knob row shoved off its card, a settings button crushed to one letter per line. All of
them were obvious in a screenshot and invisible to an assertion.

### A cross is a claim, not a verdict

Every cross has to be traced to a cause before it is called a bug or waved off. The first deep run
printed five, and four were the probe lying:

- `#plot0 path` picked the arrowhead `<marker>` in `<defs>`, not the model line, so a line that was
  moving perfectly read as frozen. Key off `path[clip-path]`.
- The backprop step does not land on click. `bpWalk()` lights the code lines one `BP_DWELL` apart
  and trains at the end, so a fixed 600 ms wait missed it. Poll for the change.
- Passing the tiny test zeroes `qStreak` and flips the button to "Play again" in the same handler,
  so `qStreak >= 3` is never true by the time you can read it.
- The knob drag measured from wherever the previous check left the dial, so a knob already parked
  at max "moved 0.00" and **passed** the "a 10px nudge is fine" test. Park every dial at a known
  value before measuring, and assert the nudge is small *and* non-zero.

The one that was real is in "Layout delta" below. A silent pass is worth more suspicion than a
cross: three of those checks would have gone on passing forever.

---

## Smoke QA, before every push to main

1. **Load and LOOK.** Screenshot the page at 1400x1000 and open it. Compare against
   `docs/qa-reference/home-1400.png`. You are checking that it looks like the reference keyframe:
   3D scene on the left with the patient and black box, reading column on the right, challenge
   text and the confidence question visible, nothing overlapping, nothing missing.
   [Whole sections have vanished before. A diff of the two images is a hint, not a verdict, since
   the 3D scene and the breathing dial legitimately differ frame to frame.]
2. **Console is clean.** No exceptions, no `NaN` attribute errors.
   [A dozen `<line> attribute x2: Expected length, "NaN"` errors rode along for weeks, hiding
   anything real.]
3. **No horizontal overflow** at 1200px, where the split layout is tightest.
   [`1fr` is `minmax(auto,1fr)`, whose floor is min-content: one over-wide child grew the page.]
4. **The minimal completion path works** (the green check below).
5. **Perf**, if any timer, loop or animation changed. See "Perf" below.
6. **The tutor layer**, if `ai-tutor.js`, `AGENTS.md` or the head row changed. Build the
   fixture first so a slow Babylon CDN cannot masquerade as your bug:
   ```bash
   bin/probe/fixture.sh
   node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/" 5000 out.png bin/probe/byoai.js
   node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/" 2000 out.png bin/probe/tutor-motion.js
   ```
   ```bash
   node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/" 3000 out.png bin/probe/tutor-click.js
   ```
   `byoai.js`: expect every boolean true. **Its live round trip is opt-in** (`?live=1`) and
   costs real relay messages; leave it off unless you are testing the relay itself.
   [The relay's publish quota is per IP, and the probe machine is usually the student's
   machine. A probe loop spent the day's allowance, so a real session's page could no longer
   publish state: the tutor had no eyes and nothing said why. Tests must not be able to break
   the product.]

   To exercise the whole live loop for free, use the stub, which speaks ntfy's shapes:
   ```bash
   node bin/probe/relay-stub.mjs &
   node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/?relay=http://localhost:8788" \
        3000 out.png bin/probe/live-loop.js
   ```
   `live-loop.js` plays the client the way claude.ai plays it (it fetches ONLY the finished
   URLs found in the invite, never a constructed one) and expects `PASS`. If this is green and
   the real thing is not, the difference is the relay, not the lab. Check it directly:
   ```bash
   curl -s "https://ntfy.sh/tinyai-healthcheck/publish?message=ping"
   ```
   A `429 {"code":42908 ... daily message quota reached}` means that IP has spent its day. The
   page fails over to the mirrors in `RELAYS` on its own, before writing the invite.
   `tutor-motion.js`: expect `PASS`, `overlaps` 0, `stranded` 0, `movingShare` around 0.1.
   `tutor-click.js`: expect `PASS`. Run it at 390x844 as well as 1400x1000.
   [**Never assert clickability with `dispatchEvent`.** It skips hit-testing and calls the
   handler directly, so it passes on elements no mouse can reach. `#aitLayer *
   {pointer-events:none}` carries ID specificity and silently beat every later
   `.class{pointer-events:auto}`: the cursor, the bubble's close button and the invite button
   all shipped unclickable while every probe was green. `tutor-click.js` uses
   `elementFromPoint`, which is what a real mouse does.]
   Then LOOK: badges + 🎓 chip on one line in the head row, the parked cursor by the badges,
   and the challenge still above the fold. Scroll: the cursor should follow into the corner
   of the card you are reading, quietly, without its name tag sitting on any words.
   [Every number in the motion probe is a bug that shipped: bubbles that covered the cursor
   at all three intro stops, a bubble left over the 3D scene after the cursor went home, a
   tour that flitted about too fast to read, and a name tag clipped off the window edge.]

## The minimal completion path

The lab has to survive all five of these, or a reader cannot finish:

| | check |
|---|---|
| 1 | Turn a textbook knob and the graph line moves |
| 2 | "Auto-train" converges to at least 4 stars from a fresh page |
| 3 | Section 4: start the tiny test, answer from the graph, reach 3 in a row |
| 4 | Section 5: type a sentence, "Save my answer" reports saved |
| 5 | Section 6: turn the NPS dial, type feedback, "Send" reports sent |

`bin/probe/qa-smoke.js` runs all five and prints a pass line per step.

## The two BYO-AI checks in the smoke run

Checks 9 and 10 are not part of the completion path; they are there because both bugs shipped and
neither was visible on the page.

9. **The tutor invite is not truncated.** Assert it ends with `ask me one question.`
   [A missing `+` between two adjacent string literals inside `invitePrompt()` is a syntax error
   almost anywhere else. Mid-expression it is not: ASI ends the `return` statement and the rest of
   the invite becomes an unreachable expression statement. It parsed, `node --check` passed, the
   button copied, and the invite had silently lost its last twenty lines, including the whole
   "HOW TO TEACH" section and the "Start now:" instruction that tells the AI to fetch anything at
   all. It went out that way for a full round of live testing, and the symptoms all looked like
   the tutor misbehaving. Check the tail, never the length.]
10. **`mouse_over` never quotes the AI briefing.** Hover a gap between cards and read
    `AITutor.state().student_pointer.over`.
    [`describeEl()`'s last resort quoted `el.textContent.slice(0, 90)`. Over any gap that element
    is `.wrap` or `<body>`, whose text is the whole page, and the page's first child is the
    offscreen `#aiTutorBrief` block. So the state feed told the tutor the student was reading the
    tutor's own briefing. A container now returns no label at all.]

---

## Deep QA

Everything in Smoke QA, plus the following. Output is a report with a tick or a cross per row.

### Sections 1 to 8, as a student

Walk the lab as a reader would, in order, and confirm each section does its job:

| section | what has to work |
|---|---|
| 1 · dots and lines | Step 1 dials `m` and `c` move the line; score and stars update; reset returns them |
| 2 · teach it to bend | "Add a bend" advances the stage; four dials; the hinge is visible on the graph |
| 2 · 2-neuron machine | Weight boxes drag; the mini graph under the diagram tracks them; wiggling a weight opens the black box in the 3D scene |
| 2 · codon | The panel loads and mirrors the weights; the overview/Python morph works; any press stops the auto-preview |
| 3 · the automatic hand | "Run one step" moves the knobs; "Auto-train" converges; the code panel highlights lines as it runs |
| 4 · the tiny test | Start gives a case; the crosshair reads the value off your own line; 3 within 15 points passes |
| 5 · checking in | The post-confidence item records; the sentence saves and sends |
| 6 · feedback | The dial reads only once touched; Send delivers score and text |
| 7 · what you just did | Renders; the 4 Ds wording and citations are intact |
| 8 · bonus | The codon build canvas loads |

### The 3D scene

- Turn the dose dial: the label, the cylinder in the scene and the Predicted bar all follow.
- "Give the dose": a dot appears on the graph, the patient's face changes, Actual fills in.
- Click the black box: it opens; the monitor drops beside the neurons **without covering them**;
  the stand fades. Press "back": everything returns exactly.
  [The monitor sat 0.15 units *below* the neuron tops and hid the machine it explains.]
- Orbit, zoom, the home button, the axis gizmo.

### Every knob, and how far you have to drag

The sensitivities below are the intended feel. They have broken repeatedly, in both directions:
too coarse to settle on a value, then too long to reach the end without lifting the mouse.

| knob | full range in | note |
|---|---|---|
| dose dial (3D HUD) | 150px | about two dial diameters |
| textbook dials (steps 1, 2, net, codon rows) | 150px | response is accelerated, so a 10px nudge moves `w1` by about 0.18 |
| NPS dial | 80px | about one diameter, eleven stops |

For each: drag it, confirm the value moves smoothly with no jumps, the slider hint appears beside
**its own** dial at the height of its highlight box, and the cursor is the up/down arrow.
Confirm the row does not shift sideways as digits change width.
[A label going from `c = -4` to `c = -104` used to relayout the whole row mid-drag.]

### Layout delta

Two keyframes live in `docs/qa-reference/`, both shot at 1400x1000 with `WIN=1400,1000`:

| file | state | why this frame |
|---|---|---|
| `home-1400.png` | fresh load, scrolled to top | the landing, and the "can you see what to do without scrolling" test |
| `stage3-knobs-1400.png` | stage 3 after auto-train, knob row centred | **seven** dials, the widest the row ever gets |

Compare against them. Look for:
- a control outside its parent card,
- a section that failed to render at all,
- text overlapping a graph,
- buttons crushed to an icon width in the settings panel.
  [`.viewtoggle button` pins width to 27px; anything new in that panel inherits it unless the
  panel's own rule catches it. This shipped broken twice.]

**Check the knob row at stage 3, not stage 1.** Step 1 has two dials and stage 2 has four; only
stage 3 has seven, and only there did the row fill up and shove the reset button 10px off the
card. Reset is absolutely positioned at `left:100%` of the group, so no part of the layout knows
it exists and nothing stops the group growing over it. `.knobrow` now carries a 62px right padding
to reserve its footprint. Note that a centred group only gives back **half** of any reserve you
take, so the reserve has to be the button's full width, not half of it. Adding a dial to a stage
means re-shooting this frame.

### Analytics

With **debug mode** on and a tester name set: press **"Send one test of every event"**. It drives
the real controls, so it proves the real path. Confirm six events with the right names
(`expertise-level-input`, `pre-confidence-score`, `post-confidence-score`,
`knowledge-check-input`, `completed-tiny-test`, `journey-summary`), a row per event in the sheet
reader, and the emails arriving.
[The first version of this button built its own payloads and its own event names, so it passed
while the page sent something else entirely.]

### Perf

Required whenever a loop, timer, animation or anything graphical changes. This is browser 3D with
a lot of dynamic JavaScript and it is genuinely prone to this.

Measure, over ten seconds with the page idle and the scene in view:

| counter | expected |
|---|---|
| `drawAll` per second | 0 |
| `drawScreen` per second | 0 |
| codon `postMessage` per second | 0 while the codon card is off screen |
| `updateDose` per second | under 1 (the breathing dial, which only writes when the value changes) |

Then interact once and confirm every counter goes to 0 and the attract timers are cleared.
[A `requestAnimationFrame` loop that never stopped, calling `wake()` every frame, held the
renderer at its full cap forever and pegged the CPU. Idle duty is meant to be 0.6%.]

**Rules of thumb that would have caught it:** an animation loop must have a stop condition, must
not reschedule once it is unwanted, must do nothing while `document.hidden` or off screen, and
must not call `wake()` on frames where nothing changed.

---

## When to run which

- Icon, colour, one string: smoke.
- Anything touching a section: smoke, plus the deep checks **for that section**. A change in
  section 2 gets section 2 walked end to end.
  [Asking for a tweak inside one section is where regressions in that section come from.]
- New loops, timing, 3D, layout, analytics: deep.
- Before a user test or sending the link to anyone: deep.
