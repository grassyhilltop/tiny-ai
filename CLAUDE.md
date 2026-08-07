# tiny-ai — notes for whoever works on this next

Joel Sadler's teaching site. Read this before touching anything; most of it is here because
getting it wrong already cost a round.

## Where things live

| | |
|---|---|
| Live site | **https://claybits.xyz** (custom domain, `CNAME` at the repo root) |
| The lab | **https://claybits.xyz/tiny-ai** — short enough to say out loud |
| Deploy | GitHub Actions, `.github/workflows/pages.yml`, on push to `main` |
| Work happens in | `staging/` — edit there, then `./promote.sh` |
| Main lab source | **`staging/tiny-ai/index.html`** (~215 KB, one self-contained file) |
| Sister repo | `codon` at `/Users/joel/devlocal/codon` → github.com/grassyhilltop/codon |

`grassyhilltop.github.io/tiny-ai/...` **301-redirects to claybits.xyz** — normal and unavoidable
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

## Framing — get this right

**codon is a visual programming language for CS novices.** Its vocabulary (cell, wire, gate,
synapse, axon) is *borrowed metaphor, not biology*. Joel: *"i only used this language to have
metaphores and have a clear analogy."* Do not describe either project as biology.

Lab 1 teaches one neuron via one story: a patient, a dose in **mg (0–10)**, and **happiness on a
0–100 scale**. One story, one pair of units, throughout. Internally the model works in 0..1 on both
axes; `XUNIT=10` / `YUNIT=100` convert for display only.

## Things that will bite you

### 1. Saved settings used to freeze that day's defaults
`applyOpts()` once wrote the **whole** `opt` object to localStorage and the loader let it win over
the defaults, so a returning visitor was permanently pinned to whatever the defaults were on their
first-ever visit. Fresh profiles (headless runs, incognito) look fine — which is what makes it so
hard to see. It cost several rounds of "hi-res still isn't the default" / "the dials are gone"
while every test passed.

Now only keys the user actually toggled are saved (`gl_opts2`, a `touched` set), plus a **reset
button** in the ⚙ panel. **When someone reports a default not taking effect, reproduce as a
returning visitor** — seed localStorage first (`SEED_LS` in the harness).

### 2. `promote.sh` is an `rsync --delete`
`staging/` is the site's **content**; `CNAME`, `.github/`, `.nojekyll`, `bin/`, `CLAUDE.md` are its
**plumbing** and live only at the root. An early version excluded only `staging`/`.git`/itself and
would have deleted the custom domain and the deploy workflow; a later one still ate this file.
There is now a **guard that refuses to delete anything git tracks** — but add new root-level infra
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

### Measurement harness — `bin/probe/`
No build step, so measure in real headless Chrome over CDP. See `bin/probe/README.md`.

```bash
python3 -m http.server 8783
DPR=2 WIN=1512,950 node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 15000 out.png probe.js
```
- `DPR=2` matters — at dpr 1 you measure a quarter of the real fill rate.
- Nothing is on `window`; reach the scene via `BABYLON.Engine.Instances[0].scenes[0]`.
- **Never time `scene.render()` in a tight JS loop** — that measures command submission and reports
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
| depth of field | ~1.0–1.7 |
| bloom | 0.34 |
| shadows | 0.18 |
| MSAA 4× | 0.10 |
| SSAO / dial point lights | below the 0.3 ms noise floor |

**Frames are the fan dial, not features.** 120 fps × 3 ms held the GPU at ~45% forever. The loop
renders at the `opt.fps` cap while anything moves (default `balanced` = 60), 10 fps when nothing
does, 0 when off screen or hidden. Measured duty: 44.5% → 6.2% at 30 fps → 0.6% idle.

### `wake()` — read this before adding any animation
Nothing here uses Babylon `animatables`, so `scene.animatables.length` is **always 0** and is
useless for "is something moving". Motion comes from `requestAnimationFrame` step loops (camera
flights), `setInterval` (dose bounce, confetti) and per-frame lerps in `registerBeforeRender` (the
box opening). **Every one calls `wake(ms)`.** Forget it and your animation runs at 10 fps. The loop
also watches the camera transform as a backstop.

### ACES tone mapping eats your white level
`clearColor` white renders as `#dbdbdb`, because ACES maps linear 1.0 to about 0.8. You cannot fix
it with a whiter colour — `#ffffff` is the whitest colour. Hand the tone mapper a value above 1.0
(the pipeline is `hdr=true`, so the buffer is float; `Color4.FromHexString` cannot express it — use
the constructor). Measured: 1.0→`#dbdbdb`, 2.2→`#f1f1f1`, **2.6→`#f4f4f4`**, 3.0→`#f5f5f5`.

### SSAO2 is removed on purpose — do not add it back casually
Three separate complaints, one cause, and it bought nothing measurable:
- its intermediate scene-colour target is **LDR**, so it clamps the HDR buffer and the white level
  above becomes unreachable (clear 1.0 and clear 5.0 both gave `#dbdbdb`);
- it darkened everything, not just crevices (plate mean luminance 213 → 202);
- its noise **swims** with the camera — a 0.004 rad nudge moved the shadowed plate 1.65 levels/px
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
  across sections has to know about both — `liveDials()` and `focusModel()` are where that happens.
  `step0Changed()` is the "step 1 moved" entry point; use it, not bare `drawStep0()`.
- `FOCUS` maps the card nearest the middle of the screen to the model the 3D scene mirrors. The
  monitor, the dials and the predictor badge all follow `focusId`.
- `SEED` deliberately includes **(0, 0)**. Without it a straight line scores 5 stars in step 1,
  contradicting the page's whole argument. Measured with it: best straight line 0.00486 against a
  5★ bar of 0.0035, so five stars genuinely waits for the bend.
- Star thresholds are **measured, not guessed**. Change the model or the data and you must
  re-measure the best achievable loss per stage (random-restart the trainer) and re-tune, or you
  ship an unreachable or a free five stars.
- The knowledge check compares against **`f(qDose)` — the reader's own tuned model**, not the
  ground truth. Keep it that way; it is the only thing making the check mean anything.

## Feedback, NPS and completion tracking

Bottom of section 4, revealed only when the knowledge check is passed. One config object,
`FEEDBACK`, near the quiz code:

- `ENDPOINT` — a URL that accepts a JSON POST. Currently
  `https://formsubmit.co/ajax/joel@claybits.xyz`. **FormSubmit needs no account, but the first
  submission sends a confirmation email and nothing is delivered until somebody clicks the link in
  it.** So it is armed, not live. Submissions pass through formsubmit.co — worth knowing before
  anyone types anything private into the box. Set `ENDPOINT` to `null` to disable the network
  entirely; the mail share link still works.
- Two events: `completed` (fired once per browser, deduped through `localStorage.gl_done`, because
  a reader pressing "play again" four times must not read as four completions) and `feedback`
  (0–10 score, promoter/passive/detractor bucket, optional free text).
- Only promoters (9–10) see the share row. That restraint is the point of the question.

To move it: change `ENDPOINT`. A Google Apps Script web app writing to a Sheet, a Cloudflare
Worker, Formspree — anything taking a POST — is a drop-in. Nothing else knows where it goes.

## Working agreements

- **Verify from a fresh default state before saying anything is done**, and list exceptions
  *before* the completion claim, not after. A screenshot taken after forcing internal state is not
  evidence — that mistake has been made here.
- Screenshots and measured numbers as proof for anything visual or performance-related.
- Comments explain **why**, especially the non-obvious constraint that forced the code. Match the
  existing voice.
- Do not commit `resume dev/Tools/dev/github PAT.txt`, and do not push the original DS6042 repo's
  history (push protection blocks a secret buried in it; this repo is a clean-room copy).
