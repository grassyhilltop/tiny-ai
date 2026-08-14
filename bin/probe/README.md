# Measuring the 3D scene

The lab has no build step, so there is nowhere to hang instrumentation. These drive real headless
Chrome over the DevTools Protocol instead: load the page, run one expression inside it, print the
value, optionally save a screenshot.

```bash
# serve the repo (the page loads Babylon from a CDN, so it needs the network)
python3 -m http.server 8783

# then, from this directory
DPR=2 WIN=1512,950 node cdp.mjs "http://localhost:8783/staging/labs/goldilocks/index.html" \
     15000 out.png gpu-cost.js
```

| arg | meaning |
|---|---|
| 1 | URL (`file://` works too) |
| 2 | ms to wait before running the probe, the scene needs ~12 s to build and settle |
| 3 | screenshot path, or `-` to skip |
| 4 | a `.js` file holding **one** parenthesised expression, optionally `async` |

| env | why it matters |
|---|---|
| `DPR=2` | **Set this.** At dpr 1 you measure a quarter of the real fill rate. |
| `WIN=w,h` | window size; the 3D panel is roughly a third of the width |
| `SEED_LS='{...}'` | writes `gl_opts` before a reload, reproduces a **returning** visitor, which is how the stale-defaults class of bug shows up |

## The probes

- **`gpu-cost.js`**: GPU ms/frame with the real rAF loop running, peeling one feature at a time.
- **`frame-rates.js`**: renders/sec while idle, while the pointer is over the canvas, over the
  text column, during a programmatic camera flight, and with the tab hidden.
- **`sample-pixels.js`**: reads actual backbuffer pixels with `gl.readPixels` and dumps the colour
  pipeline settings. Use this for any "it looks too grey/dark" question; eyeballing a screenshot
  will not tell you whether the clear colour is even reaching the frame.
- **`shadow-noise.js`**: luminance stddev on a flat surface, plus how much it changes for a tiny
  camera nudge. Shimmer is spatial noise that *swims*, so the nudge number is the one that matters.

- **`qa-smoke.js` / `qa-deep.js`**: the QA runs. See [`../../QA.md`](../../QA.md); that is where
  the process lives, this is only the mechanism.
- **`byoai.js`**: the BYO-AI tutor, through `AITutor.exec`, which is the one entry point all
  three transports share.

## Recording the README clips

`clip.mjs` drives the page and grabs PNG frames of one rectangle; `gif.py` turns them into a GIF.
The recipes in `clips/` are what each clip does.

```bash
node bin/probe/clip.mjs "http://localhost:8783/tiny-ai/" frames/ bin/probe/clips/auto-fit.js
python3 bin/probe/gif.py frames/ docs/img/auto-fit.gif --fps 11 --width 620
```

Four things about this that are not obvious, all of them learned the hard way:

1. **Pose each frame, do not record in real time.** A screenshot of this page costs seconds under
   a software renderer, so a recipe that starts an animation and samples it on a timer photographs
   one motion at four-second intervals. `__tick(i, n)` sets the exact state for frame i instead:
   camera angle, knob values, how many training steps have run. It is also the only way to film
   the trainer, which takes half a minute of real time to converge, in 44 frames.
2. **`captureScreenshot`'s clip is in DOCUMENT coordinates.** `getBoundingClientRect` is in
   viewport coordinates, and the two agree only at scroll 0. Every recipe that scrolled produced a
   rectangle that was numerically plausible and pointed at empty page below the content: a stack
   of blank frames and no error. `clip.mjs` converts; recipes must re-assert their scroll position
   every frame, because the lab scrolls itself and `scroll-behavior` is smooth.
3. **A rectangle that starts off-screen never comes back.** `scrollIntoView({block:"center"})` on a
   card taller than the window gives a negative `y`, and `captureScreenshot` simply does not
   answer. The run sits there with setup finished and not one frame written.
4. **Kill the process group, not the process.** `--headless=new` forks a zygote and a renderer that
   survive a kill of the parent. After a few runs there were thirty stray chrome processes on a
   four-core box, the load average was over 11, and a screenshot had gone from under a second to
   seven, which reads exactly like "the page got slower".

Wrap every recipe in an IIFE: it is evaluated at the lab's own top level, so a recipe with
`let A0` collides with the knob code's `A0` and the whole file fails to parse.

## Two traps

1. **Never time `scene.render()` in a tight JS loop.** That measures command submission, not the
   GPU, and reports 1000+ fps. Run the loop for real and read `EngineInstrumentation`'s
   `gpuFrameTimeCounter`: it is a rolling 1-second average, so allow ~2.5 s per variant.
2. **Synthetic `PointerEvent`s do not survive Babylon's DOM input layer here.** To test a click,
   pick first and then notify the scene's own observable:
   ```js
   const p = sc.pick(x, y);
   sc.onPointerObservable.notifyObservers({
     type: BABYLON.PointerEventTypes.POINTERTAP, pickInfo: p, event: {button: 0} });
   ```

Nothing is exported to `window`. Reach the scene with `BABYLON.Engine.Instances[0].scenes[0]`.

## `fixture.sh`: probe without the CDN

`index.html` loads Babylon, cannon and the serializers from `cdn.babylonjs.com` with **blocking**
script tags. When that CDN is slow the whole page stalls, the deferred tutor layer never runs,
and every probe reports something that looks like your bug (`AITutor never loaded`, an empty
`EVAL: {}`). That happened for a stretch on 2026-08-13 and cost a round of false debugging.

```bash
bin/probe/fixture.sh          # copy staging/ to .probe-fixture/, vendor Babylon, serve on 8785
node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/" 5000 out.png bin/probe/byoai.js
```

It vendors from the npm registry once (about 8 MB, cached in `.probe-fixture/vendor/`, gitignored)
and rewrites exactly three URLs. Everything the probes measure is unchanged. **Check the CDN
before you debug a probe that says nothing loaded**: `curl -o /dev/null -w '%{http_code} %{time_total}\n'
--max-time 8 https://cdn.babylonjs.com/babylon.js`.

Serve on 8785, not 8783: 8783 is often already taken by a server rooted at the repo root, which
serves the PROMOTED copy of the lab, so a probe there silently tests yesterday's build.
