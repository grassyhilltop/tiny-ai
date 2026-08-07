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
| 2 | ms to wait before running the probe — the scene needs ~12 s to build and settle |
| 3 | screenshot path, or `-` to skip |
| 4 | a `.js` file holding **one** parenthesised expression, optionally `async` |

| env | why it matters |
|---|---|
| `DPR=2` | **Set this.** At dpr 1 you measure a quarter of the real fill rate. |
| `WIN=w,h` | window size; the 3D panel is roughly a third of the width |
| `SEED_LS='{...}'` | writes `gl_opts` before a reload — reproduces a **returning** visitor, which is how the stale-defaults class of bug shows up |

## The probes

- **`gpu-cost.js`** — GPU ms/frame with the real rAF loop running, peeling one feature at a time.
- **`frame-rates.js`** — renders/sec while idle, while the pointer is over the canvas, over the
  text column, during a programmatic camera flight, and with the tab hidden.
- **`sample-pixels.js`** — reads actual backbuffer pixels with `gl.readPixels` and dumps the colour
  pipeline settings. Use this for any "it looks too grey/dark" question; eyeballing a screenshot
  will not tell you whether the clear colour is even reaching the frame.
- **`shadow-noise.js`** — luminance stddev on a flat surface, plus how much it changes for a tiny
  camera nudge. Shimmer is spatial noise that *swims*, so the nudge number is the one that matters.

## Two traps

1. **Never time `scene.render()` in a tight JS loop.** That measures command submission, not the
   GPU, and reports 1000+ fps. Run the loop for real and read `EngineInstrumentation`'s
   `gpuFrameTimeCounter` — it is a rolling 1-second average, so allow ~2.5 s per variant.
2. **Synthetic `PointerEvent`s do not survive Babylon's DOM input layer here.** To test a click,
   pick first and then notify the scene's own observable:
   ```js
   const p = sc.pick(x, y);
   sc.onPointerObservable.notifyObservers({
     type: BABYLON.PointerEventTypes.POINTERTAP, pickInfo: p, event: {button: 0} });
   ```

Nothing is exported to `window`. Reach the scene with `BABYLON.Engine.Instances[0].scenes[0]`.
