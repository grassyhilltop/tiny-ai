// Record an animated clip of the lab: drive it over CDP, grab PNG frames of one rectangle, and
// hand them to bin/probe/gif.py. This exists because every interesting thing on this page is a
// motion (the box opening, the line converging, the face changing) and a still frame argues for
// none of it.
//
//   node bin/probe/clip.mjs <url> <framedir> <recipe.js>
//
// The recipe is evaluated in the page and defines:
//   window.__clip   {sel:"#c3d", pad:8} or {x,y,w,h} in CSS px
//   window.__frames how many frames to grab      (default 48)
//   window.__setup  async, run once BEFORE recording: get the page into the starting state
//   window.__tick   async (i, n), run BEFORE each capture: POSE frame i
//   window.__settle milliseconds to wait after __tick before grabbing (default 120)
//
// POSE, do not record in real time. A screenshot of this page costs seconds under a software
// renderer, so a recipe that starts an animation and grabs frames on a timer samples one motion
// at four second intervals and produces nonsense. __tick(i, n) is handed the frame number and
// sets the exact state for it: camera angle, knob values, how many training steps have run. The
// clip then plays back at whatever rate gif.py is told, and looks identical on any machine.
//
// __tick is also the only way to film anything slower than the capture: the auto-trainer takes
// 30 seconds of real time to converge, and this films it in 60 posed frames.
//
// WRAP EVERY RECIPE IN AN IIFE. It is evaluated at the lab's own top level, and the lab's
// top-level const/let live in the same lexical scope, so a recipe with `let A0` collides with the
// knob code's `A0` and the whole file fails to parse.
//
// CHROME     path to the browser        (default: Google Chrome on macOS)
// VENDOR_DIR a directory of CDN mirrors, if the machine cannot reach cdn.babylonjs.com
// WIN, DPR   as in cdp.mjs
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, dir = "frames", recipeFile] = process.argv.slice(2);
const PORT = 9222 + (process.pid % 500);
const prof = mkdtempSync(join(tmpdir(), "clip-"));
mkdirSync(dir, { recursive: true });

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VDIR = process.env.VENDOR_DIR;
const VENDOR = VDIR ? {
  "https://cdn.babylonjs.com/babylon.js": join(VDIR, "babylonjs-7.54.3/babylon.js"),
  "https://cdn.babylonjs.com/cannon.js": join(VDIR, "cannon-0.6.2/build/cannon.js"),
  "https://cdn.babylonjs.com/serializers/babylonjs.serializers.min.js":
    join(VDIR, "babylonjs-serializers-7.54.3/babylonjs.serializers.min.js"),
} : {};

// detached, so the whole process GROUP can be killed at the end. --headless=new forks a zygote
// and a renderer that survive a kill of the parent, and after a few runs there were thirty stray
// chrome processes on a 4-core box holding the load average above 11. A screenshot went from
// under a second to seven, which reads exactly like "the page got slower".
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  `--window-size=${process.env.WIN || "1400,1000"}`,
  `--force-device-scale-factor=${process.env.DPR || "1"}`,
  "--no-sandbox", "--no-first-run", "--no-default-browser-check",
  "--enable-unsafe-swiftshader", "--hide-scrollbars", "--disable-gpu",
  "about:blank",
], { stdio: ["ignore", "ignore", "ignore"], detached: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

let list;
for (let i = 0; i < 60; i++) {
  try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));

let id = 0; const pend = new Map(); const logs = [];
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    logs.push("EXC: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Fetch.requestPaused") {
    const { requestId, request } = m.params, u = request.url;
    if (VENDOR[u] && existsSync(VENDOR[u]))
      ws.send(JSON.stringify({ id: ++id, method: "Fetch.fulfillRequest", params: { requestId,
        responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/javascript" }],
        body: readFileSync(VENDOR[u]).toString("base64") } }));
    else if (/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(u) || !VDIR)
      ws.send(JSON.stringify({ id: ++id, method: "Fetch.continueRequest", params: { requestId } }));
    else
      ws.send(JSON.stringify({ id: ++id, method: "Fetch.failRequest", params: { requestId, errorReason: "BlockedByClient" } }));
  }
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalp = async expression => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

await send("Runtime.enable");
await send("Page.enable");
// --window-size is the WINDOW, and the viewport comes out ~140px shorter, which quietly clipped
// the bottom of the 3D card off every frame. Set the viewport itself.
{
  const [vw, vh] = (process.env.EMU || process.env.WIN || "1400,1000").split(",").map(Number);
  await send("Emulation.setDeviceMetricsOverride", { width: vw, height: vh,
    deviceScaleFactor: +(process.env.DPR || 1), mobile: false });
}
if (VDIR) await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
await send("Page.navigate", { url });
await sleep(+(process.env.SETTLE || 11000));      // Babylon, the scene build and the first frames

const say = m => console.error("[clip] " + m);
say("loaded, running recipe");
await evalp(readFileSync(recipeFile, "utf8"));
say("recipe evaluated, running __setup");
await evalp("(window.__setup ? window.__setup() : Promise.resolve())");
say("__setup done");

// Resolve the clip AFTER setup: the recipes scroll things into view, and the rectangle is only
// meaningful once whatever is being filmed has stopped moving on the page.
// Clamped to the viewport: captureBeyondViewport is off, so anything past the fold comes back as
// blank white rather than as content, which is not obvious until you look at the frames. `h`
// overrides the element's own height, for elements taller than the frame worth filming.
const clip = await evalp(`(() => {
  const c = window.__clip || {};
  let x, y, width, height;
  if (c.sel) { const r = document.querySelector(c.sel).getBoundingClientRect(); const p = c.pad || 0;
    x = Math.round(r.left - p); y = Math.round(r.top - p);
    width = Math.round(r.width + 2*p); height = Math.round(c.h || r.height + 2*p); }
  else { x = c.x|0; y = c.y|0; width = c.w|0; height = c.h|0; }
  /* Clamp to the VISIBLE part of the page, then convert to document coordinates.
     captureScreenshot's clip is in page coordinates, but getBoundingClientRect is in viewport
     coordinates, and the two agree only while the page is scrolled to the top. Every recipe that
     scrolled produced a rectangle that was numerically fine and pointed at empty background
     below the content. Nothing errors; you just get a stack of blank frames. */
  if (x < 0) { width += x; x = 0; }
  if (y < 0) { height += y; y = 0; }
  width  = Math.max(1, Math.min(width,  innerWidth  - x));
  height = Math.max(1, Math.min(height, innerHeight - y));
  const sx = scrollX || document.documentElement.scrollLeft || 0;
  const sy = scrollY || document.documentElement.scrollTop  || 0;
  return { x: x + sx, y: y + sy, width, height };
})()`);
say("clip " + JSON.stringify(clip));
const frames = await evalp("window.__frames || 48");
const settle = await evalp("window.__settle || 120");

const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await evalp(`(window.__tick ? window.__tick(${i}, ${frames}) : Promise.resolve())`);
  await sleep(settle);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false,
    clip: { ...clip, scale: 1 } });
  writeFileSync(join(dir, String(i).padStart(3, "0") + ".png"), Buffer.from(shot.data, "base64"));
  if (i % 10 === 0) say(`frame ${i}/${frames}`);
}
const real = (Date.now() - t0) / frames;
console.log(JSON.stringify({ dir, frames, clip, msPerFrame: Math.round(real),
  totalSec: Math.round((Date.now() - t0) / 1000), logs: logs.slice(0, 8) }, null, 1));

ws.close();
try { process.kill(-chrome.pid, "SIGKILL"); } catch { chrome.kill("SIGKILL"); }
process.exit(0);
