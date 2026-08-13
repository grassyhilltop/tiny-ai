# tiny-ai: notes for whoever works on this next

**What this is.** A free site that teaches machine learning to complete beginners. Lab 1 is one
neuron in the browser: a patient, a dose, and knobs you turn until the model's predictions match
the data. Labs 2 and 3 go further: a small GPT, then a small chat model, as Python notebooks on
a free Colab GPU. Everything else is plain HTML/CSS/JS plus a Babylon.js 3D scene, served as
static files by GitHub Pages. There is no server of ours; the only things that leave the page are
the optional reader feedback and timing telemetry POSTs, documented under "Feedback, NPS and
completion tracking" below, and, only when the reader opts into a live tutor session, the
page-state/presence messages relayed through ntfy.sh, documented under "The BYO-AI teaching
assistant" below.

Joel Sadler's teaching site. Read this before touching anything; most of it is here because
getting it wrong already cost a round.

## Where things live

| | |
|---|---|
| Live site | **https://claybits.xyz** (custom domain, `CNAME` at the repo root) |
| The lab | **https://claybits.xyz/tiny-ai**: short enough to say out loud |
| Deploy | GitHub Actions, `.github/workflows/pages.yml`, on push to `main` |
| Work happens in | `staging/`: edit there, then `./promote.sh` |
| Main lab source | **`staging/tiny-ai/index.html`** (~215 KB, one self-contained file) |
| Sister repo | `codon` at `/Users/joel/devlocal/codon` → github.com/grassyhilltop/codon |

`grassyhilltop.github.io/tiny-ai/...` **301-redirects to claybits.xyz**: normal and unavoidable
once a custom domain is set. It is not a broken deploy.

### URL routing
GitHub Pages is static: no rewrites, only files and redirect stubs.

| path | what is there |
|---|---|
| `/tiny-ai/` | **the real lab.** Canonical. Edit `staging/tiny-ai/index.html`. |
| `/tinyai/` | stub → `/tiny-ai/` (typed without the hyphen) |
| `/labs/goldilocks/` | stub → `/tiny-ai/` (the old path; existing links still work) |
| `/staging/labs/goldilocks/` | the same stub, promoted |

Because the lab sits one level under the root, **its asset paths are absolute**
(`/labs/_shared/codon.html`, `/labs/lab-02/styles.css`). Keep them that way.

## Framing, get this right

**codon is a visual programming language for CS novices.** Its vocabulary (cell, wire, gate,
synapse, axon) is *borrowed metaphor, not biology*. Joel: *"i only used this language to have
metaphores and have a clear analogy."* Do not describe either project as biology.

Lab 1 teaches one neuron via one story: a patient, a dose in **mg (0 to 10)**, and **happiness on a
0 to 100 scale**. One story, one pair of units, throughout. Internally the model works in 0..1 on both
axes; `XUNIT=10` / `YUNIT=100` convert for display only.

## Things that will bite you

### 1. Saved settings used to freeze that day's defaults
`applyOpts()` once wrote the **whole** `opt` object to localStorage and the loader let it win over
the defaults, so a returning visitor was permanently pinned to whatever the defaults were on their
first-ever visit. Fresh profiles (headless runs, incognito) look fine, which is what makes it so
hard to see. It cost several rounds of "hi-res still isn't the default" / "the dials are gone"
while every test passed.

Now only keys the user actually toggled are saved (`gl_opts2`, a `touched` set), plus a **reset
button** in the ⚙ panel. **When someone reports a default not taking effect, reproduce as a
returning visitor**: seed localStorage first (`SEED_LS` in the harness).

### 2. `promote.sh` is an `rsync --delete`
`staging/` is the site's **content**; `CNAME`, `.github/`, `.nojekyll`, `bin/`, `CLAUDE.md` are its
**plumbing** and live only at the root. An early version excluded only `staging`/`.git`/itself and
would have deleted the custom domain and the deploy workflow; a later one still ate this file.
There is now a **guard that refuses to delete anything git tracks**: but add new root-level infra
to `EXCLUDES` anyway, and run `./promote.sh --dry-run` first.

### 3. `set -o pipefail` + `grep -q` = exit 141
`grep -q` quits on first match, SIGPIPEs the writer, and pipefail reports the writer's death.
A successful match reads as failure. `bin/check-deploy.sh` was reporting a live site as not-live
because of this. Use a here-string, not a pipe.

### 4. Pushed ≠ deployed
Verify the **served bytes**, never the push:
```bash
bin/check-deploy.sh /tiny-ai/index.html "<a string only the new build has>"
```
GitHub Pages had a 5½-hour `major_outage` on 2026-08-06. Base rate: ~50 GitHub incidents in 12
months, 7 touching Pages ≈ one every 7 weeks.

## The 3D scene (Babylon.js)

One file, one `buildScene()`. Toggling **rounded edges** or **dials** rebuilds the scene; everything
else is live.

### Measurement harness, `bin/probe/`
No build step, so measure in real headless Chrome over CDP. See `bin/probe/README.md`.

```bash
python3 -m http.server 8783
DPR=2 WIN=1512,950 node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 15000 out.png probe.js
```
- `DPR=2` matters, at dpr 1 you measure a quarter of the real fill rate.
- Nothing is on `window`; reach the scene via `BABYLON.Engine.Instances[0].scenes[0]`.
- **Never time `scene.render()` in a tight JS loop**: that measures command submission and reports
  1000+ fps. Run the real rAF loop and read `EngineInstrumentation.gpuFrameTimeCounter`
  (a rolling 1-second average; allow ~2.5 s per variant).
- The in-app Browser pane throttles rAF, so Babylon barely renders there.
- Synthetic `PointerEvent`s do not survive Babylon's DOM input layer. To test a click, pick first,
  then `sc.onPointerObservable.notifyObservers({type: POINTERTAP, pickInfo, event:{button:0}})`.

### Measured costs (M5 Max, retina, 1512×950)
| | GPU ms/frame |
|---|---|
| render resolution 2× device px | 4.84 |
| render resolution 1.5× (current) | **3.08** |
| depth of field | ~1.0 to 1.7 |
| bloom | 0.34 |
| shadows | 0.18 |
| MSAA 4× | 0.10 |
| SSAO / dial point lights | below the 0.3 ms noise floor |

**Frames are the fan dial, not features.** 120 fps × 3 ms held the GPU at ~45% forever. The loop
renders at the `opt.fps` cap while anything moves (default `balanced` = 60), 10 fps when nothing
does, 0 when off screen or hidden. Measured duty: 44.5% → 6.2% at 30 fps → 0.6% idle.

### `wake()`: read this before adding any animation
Nothing here uses Babylon `animatables`, so `scene.animatables.length` is **always 0** and is
useless for "is something moving". Motion comes from `requestAnimationFrame` step loops (camera
flights), `setInterval` (dose bounce, confetti) and per-frame lerps in `registerBeforeRender` (the
box opening). **Every one calls `wake(ms)`.** Forget it and your animation runs at 10 fps. The loop
also watches the camera transform as a backstop.

### A frame counter is not a simulation clock, the trap that cost three rounds
`engine.runRenderLoop` calls `engine.beginFrame()` on **every** animation frame and *then* invokes
your callback. So a callback that returns early to throttle has still advanced the clock:
`getDeltaTime()` reports the gap since the last `beginFrame` (8 ms on a 120 Hz display), not the
gap since the last real render (17 ms at a 60 fps cap, 100 ms when idle). Babylon steps the
**physics** with exactly that number, so the simulated world runs at a fraction of real time no
matter how many frames get drawn.

Symptom: dropped bricks sink through treacle while every frame counter reads a healthy 60, and
turning the resolution down changes nothing. It was reported three separate times and I "measured
60 fps" and moved on each time, because *the frame rate was genuinely fine*.

The loop therefore owns its own `requestAnimationFrame` and calls `beginFrame`/`endFrame` only
around frames it actually draws. **Do not put it back on `runRenderLoop` while the throttle
exists.**

**Verify simulation speed against physics, not against fps.** A brick dropped from rest should
cover `0.5 * 9.8 * t²`. Measured in the first 400 ms: 0.224 units before the fix (0.28× gravity),
0.85 after (1.08×). `bin/probe/` has the probe. A frame counter can be true and useless.

### There are five dials, and they all go through `attachKnob()`
The model row, step 1's own pair, the dose dial in the HUD, and the feedback dial. When the knobs
were converted from vertical drag to radial, four were done and the **dose dial was missed**: the
first knob anyone touches, and so the only control still un-turnable during the user test that was
specifically about turning knobs. If you change knob behaviour, `grep -c "attachKnob("` should be
5, and check the dose dial by hand.

Radial (angle of the pointer = the value) is the default because a novice looking at a knob tries
to turn it; vertical drag is the expert convention and is kept as a setting. Two details make
radial survive its own weakness: precision scales with distance from the centre for free, and the
90° dead zone under the dial **clamps instead of wrapping** so dragging past an end parks at
min/max rather than teleporting to the other extreme.

### The .usdz was big because of studs, not fillets
Each stud's bevel ring was a torus at tessellation 28: 784 vertices for a bevel two pixels across,
so a 2×4 brick carried ~8,000 invisible vertices. `STUD_SEG`/`RIM_SEG` control this. 376,398 →
117,998 vertices and 12.6 MB → 4.97 MB with no visible change. Fillets are visible and were never
the problem; check where the vertices actually are before deleting a feature.

### ACES tone mapping eats your white level
`clearColor` white renders as `#dbdbdb`, because ACES maps linear 1.0 to about 0.8. You cannot fix
it with a whiter colour, `#ffffff` is the whitest colour. Hand the tone mapper a value above 1.0
(the pipeline is `hdr=true`, so the buffer is float; `Color4.FromHexString` cannot express it, use
the constructor). Measured: 1.0→`#dbdbdb`, 2.2→`#f1f1f1`, **2.6→`#f4f4f4`**, 3.0→`#f5f5f5`.

### SSAO2 is removed on purpose, do not add it back casually
Three separate complaints, one cause, and it bought nothing measurable:
- its intermediate scene-colour target is **LDR**, so it clamps the HDR buffer and the white level
  above becomes unreachable (clear 1.0 and clear 5.0 both gave `#dbdbdb`);
- it darkened everything, not just crevices (plate mean luminance 213 → 202);
- its noise **swims** with the camera, a 0.004 rad nudge moved the shadowed plate 1.65 levels/px
  with it against 0.68 without. That was the "shimmering dots / haze".

The blur-exponential shadow map does the grounding it was added for.

### Other traps
- Babylon samples only **4 lights per material** by default; this scene has 12. The black-box
  materials set `maxSimultaneousLights = 16` or the dial lamps are silently dropped.
- Babylon scenes are **left-handed**. `right = cross(forward, up)` is right-handed and points the
  gizmo's X arm the wrong way.
- Fog must clear the scene: the plate sits ~15 units out, so `fogStart 16` swallowed everything.
  It is 30/78.
- Dial positions are owned by `syncBBKnobs()` (they lay out for however many are live), so they opt
  out of the explode lerp with `dial:true` and carry their own offset.

## Lab 1 structure

- **Step 1** (`step0card`) runs its **own two-knob model `P0 = {m, c}`** with `drawStep0()`,
  separate from the shared `P`/`f` used by everything after it. Anything that must feel consistent
  across sections has to know about both, `liveDials()` and `focusModel()` are where that happens.
  `step0Changed()` is the "step 1 moved" entry point; use it, not bare `drawStep0()`.
- `FOCUS` maps the card nearest the middle of the screen to the model the 3D scene mirrors. The
  monitor, the dials and the predictor badge all follow `focusId`.
- `SEED` deliberately includes **(0, 0)**. Without it a straight line scores 5 stars in step 1,
  contradicting the page's whole argument. Measured with it: best straight line 0.00486 against a
  5★ bar of 0.0035, so five stars genuinely waits for the bend.
- Star thresholds are **measured, not guessed**. Change the model or the data and you must
  re-measure the best achievable loss per stage (random-restart the trainer) and re-tune, or you
  ship an unreachable or a free five stars.
- The knowledge check compares against **`f(qDose)`: the reader's own tuned model**, not the
  ground truth. Keep it that way; it is the only thing making the check mean anything.

## Feedback, NPS and completion tracking

Bottom of section 4, revealed only when the knowledge check is passed. One config object,
`FEEDBACK`, near the quiz code:

- `ENDPOINT`: a URL that accepts a JSON POST. Currently
  `https://formsubmit.co/ajax/joel@claybits.xyz`. **FormSubmit needs no account, but the first
  submission sends a confirmation email and nothing is delivered until somebody clicks the link in
  it.** So it is armed, not live. Submissions pass through formsubmit.co, worth knowing before
  anyone types anything private into the box. Set `ENDPOINT` to `null` to disable the network
  entirely; the mail share link still works.
- Two events: `completed` (fired once per browser, deduped through `localStorage.gl_done`, because
  a reader pressing "play again" four times must not read as four completions) and `feedback`
  (0 to 10 score, promoter/passive/detractor bucket, optional free text).
- Only promoters (9 or 10) see the share row. That restraint is the point of the question.

To move it: change `ENDPOINT`. A Google Apps Script web app writing to a Sheet, a Cloudflare
Worker, Formspree, anything taking a POST, is a drop-in. Nothing else knows where it goes.

## Feedback, NPS and completion tracking

Its own section at the bottom of the lab, always visible (it used to appear only on passing the
knowledge check, which meant the one group never asked was everybody who gave up). One config
object, `FEEDBACK`, near the quiz code:

- `ENDPOINT`: FormSubmit, addressed by **activation token** rather than the naked email, so the
  page does not ship a harvestable address. A new address means a new token. Set `ENDPOINT` to
  `null` to disable the network entirely; the mailto share still works.
- Two events: `completed` (fired once per browser, deduped through `localStorage.gl_done`, because
  a reader pressing "play again" four times must not read as four completions) and `feedback`
  (0 to 10 score, promoter/passive/detractor bucket, optional free text).
- **The dial parks at 0 and does not count until touched.** A dial starting at 7 suggests its own
  answer; starting at 0 biases the other way, so `npsTouched` gates it, until then the label is a
  dash, the face is a resting smile, and Send refuses an untouched dial rather than recording a 0.

To move it anywhere else: change `ENDPOINT`. A Google Apps Script writing to a Sheet, a Cloudflare
Worker, Formspree, anything taking a POST is a drop-in.

## Exporting the scene (USDZ / GLB / site zip)

`exportUSDZ()` chains Babylon → GLB → three.js → USDZ in the browser (three loads only on click,
via the importmap in `<head>`). Two things that were wrong and are worth not re-breaking:

- **The monitor screen exports black unless you swap its material.** It is a StandardMaterial with
  `disableLighting = true` and the reader's curve in an `emissiveTexture`. Babylon writes that as
  `KHR_materials_unlit`; three's GLTFLoader turns unlit into `MeshBasicMaterial`, which has neither
  `.emissive` nor `.emissiveMap`, so the exporter has nothing to write. `withExportableScreen()`
  puts the same texture on a lit material's **diffuse** slot for the duration of the export,
  baseColor is the one channel every hop agrees on. Verified: the archive carries
  `textures/Texture_6_false.png` (the graph) bound to the `scr` prim's `diffuseColor`.
- **Export freezes live state**, so `settleScene()` shuts the box first. Without it, pressing the
  button mid-explode bakes that pose into the file.

`usdchecker --arkit` passes on the real output (~12.6 MB, 60 entries, all stored, 64-byte aligned).
The size is dominated by the rounded-edge geometry; turning fillets off drops it to about 1.5 MB.

⚙ → **pack this lab into a .zip** fetches the page and its assets and writes a Netlify-ready zip
client-side (stored entries, no compression library needed).

## The BYO-AI teaching assistant (staging only, for now)

The lab can borrow the reader's own AI, Claude or ChatGPT, app or voice mode, as a Socratic
tutor with *presence* on the page: collaborator badges in the head row, a labelled cursor
(visible and parked from page load; clickable while no AI owns it), Docs-style text
highlighting with a blinking caret, speech bubbles, and sight of what the student's mouse is
over. The mental model is a collaborator in a shared Google Doc. The pieces:

- **The live room is the flagship transport and needs no server of ours.** Every visit gets a
  four-letter room code in the URL (`?room=`); the page subscribes over SSE to ntfy.sh topics
  named by the code, the student's AI reads state and publishes presence commands with plain
  URL fetches. One click copies the invite, one paste into any AI starts the session. Sharing
  the URL puts a classmate or teacher in the same room with their own cursor. Privacy stance:
  an organic visit performs no tutor networking at all; the relay is contacted only when the
  URL carries `?room=` from a shared/reloaded link or the reader copies the invite. The hard
  lessons about ntfy (2s cache batches, casual SSE drops, the rate budget) are recorded in
  `docs/BYOAI-HANDOFF.md`; read them before touching the relay code.
- **`staging/tiny-ai/AGENTS.md`**: the tutor briefing. Any LLM that fetches the lab URL is
  pointed at it by a hidden block at the top of `<body>` (`#aiTutorBrief`, offscreen but NOT
  `display:none`: readability extractors drop display:none nodes, and the block exists for
  exactly those readers). The briefing carries the Socratic rules, the journey arc, the
  section map with per-section intent, the model internals in display units, the section-5
  rubric, and the live protocol. Change the lab, change the briefing: it is the tutor's only
  ground truth.
- **`staging/tiny-ai/ai-tutor.js`**: everything on the page: the badges and 🎓 chip in the
  headrow (kept to one line; the landing rule below still applies), the room + relay client,
  the presence layer, the intro tour (never scrolls, capped at 3 visits, interruptible), the
  context tracker, and the section-5 handoff. The AI's ceiling is enforced here: it can point,
  highlight and talk, never click, type, or change work. `window.AITutor.exec()` is the one
  entry point for every transport (live room, paste loop, MCP bridge, demo), so testing exec
  tests them all: `bin/probe/byoai.js` (which also does a real ntfy round trip). Bump the
  `?v=` cache-buster on the script tag with every change.
- **`staging/tiny-ai/tutor-bridge/`**: the optional self-hosted MCP relay (zero-dep Node +
  MCP streamable HTTP), for classrooms that want a real connector instead of the public
  relay. Nothing on the page contacts it unless the reader passes `?bridge=`.
- **`index.html` carries exactly two insertions**: the `#aiTutorBrief` block and the
  `ai-tutor.js` script tag. Everything else the feature does is injected at runtime, so the
  lab file stays one self-contained page and the diff stays reviewable.

The knowledge check stays honest: the page never grades the sentence, the reader's own AI
does, in their own chat; the page only offers the handoff (live event or one-click copy of
sentence + rubric request). The pedagogy behind the whole feature is written up for humans in
`docs/EDUCATORS.md`, linked from the README.

## Credit for other people's work, read `CREDITS.md`

The lab frames itself around **AI Fluency** and quotes the 4D framework. That is someone else's
work and the attribution on the page has been checked against primary sources. Two traps that were
already nearly published wrong:

- The **AI Fluency Index** report was **written by Kristen Swanson**. Zoe Ludwig and Drew Bent
  contributed framework alignment, messaging and review. It was not "rewritten by" Ludwig.
- **"The artifact paradox" is not the report's phrase** and does not appear in it. The report's own
  heading is *"When creating outputs, users become more directive but less evaluative"*; Anthropic's
  companion guide calls it *the artifact effect*. Quote the report's wording; do not attribute the
  coinage to it.

The **4D framework** is by **Prof. Rick Dakan** (Ringling College) and **Prof. Joseph Feller**
(University College Cork); **Maggie Vo** and **Drew Bent** are the Anthropic-side course
instructors, not framework authors. Nobody else co-developed it. The one-pager is
**CC BY-NC-SA 4.0**; the longer Practical Summary Document is **CC BY-NC-ND 4.0**, so quote that
one but never adapt it. Both are **NonCommercial**: fine for a free teaching page, not for
anything monetised.

The page states no employer for the Index report's contributors beyond what a primary source says,
because the report itself names none. Do not fill those in from an aggregator; one such site was
checked and did not contain the person it was cited for at all.

## The pre/post measures and the timing telemetry

`likertRow()` builds the 1 to 7 rows; `TELEM`/`telemSummary()` carry the timings. Both are documented
in `staging/tiny-ai/SURVEY.md`, including the one caveat that matters when reading the numbers.
Nothing leaves the page except through `feedbackSend()`.

## The landing screen gets the challenge and nothing else

The first five minutes decide whether anyone stays. The top of a lab carries the challenge, plus
any measure that has to be taken *before* the reader knows what the task involves, and nothing
else. Framing, philosophy, citations and credits go after the work, where they are relevant and
where the reader has earned them.

This was learned the expensive way: the landing was filled with a philosophy paragraph and an AI
Fluency framing block, both requested, and together they pushed the actual task below the fold.
Everything moved to section 5 and reads better there. **Joel asked to be told when he violates
this himself**, so if a request would push the task below the fold, say so before building it.

Test: can the reader see the first thing they are meant to *do* without scrolling?

## QA, and the two other docs an agent needs

- **`QA.md`** is the process to run before pushing to `main`. Two levels: smoke, about 80 seconds,
  every push; deep, about 2.5 minutes, on any substantive change and whenever Joel asks for "a QA
  run". `bin/probe/qa-smoke.js` and `bin/probe/qa-deep.js` do the mechanical half and
  `docs/qa-reference/` holds the keyframes to compare against. Every check in it exists because
  something broke once, and each one says which.
- **`docs/BYOAI-HANDOFF.md`** is the standalone brief for the BYO-AI tutor: what it is, the four
  pieces, the rules that are load-bearing, and what is still open.
- **`bin/probe/clip.mjs` + `bin/probe/gif.py` + `bin/probe/clips/`** record the README clips. Pose
  each frame by index; do not record in real time. The probe README has the four traps.

A cross in a QA run is a claim, not a verdict. The first deep run printed five and four of them
were the probe lying. Trace every one to a cause before calling it a bug or waving it off, and be
more suspicious of a silent pass: three of those checks would have gone on passing forever.

## Working agreements

- **Verify from a fresh default state before saying anything is done**, and list exceptions
  *before* the completion claim, not after. A screenshot taken after forcing internal state is not
  evidence, that mistake has been made here.
- Screenshots and measured numbers as proof for anything visual or performance-related.
- Comments explain **why**, especially the non-obvious constraint that forced the code. Match the
  existing voice.
- Nothing from outside this working directory belongs in a commit here. Joel keeps credentials and
  personal drafts elsewhere on disk; this project needs none of them.
- This repo carries none of the git history of the course it adapts, DS 6042 (Prof. Daniel
  Graham, University of Virginia). It was rebuilt from scratch, and the lineage lives in
  `README.md` and `CREDITS.md` instead. Keep it that way: no upstream remote, no replayed commits.
