// Drive headless Chrome over CDP: load a URL, run an expression, screenshot.
//   node cdp.mjs <url> <wait_ms> <out.png> [exprFile]
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, waitMs = "9000", out = "shot.png", exprFile] = process.argv.slice(2);
const PORT = 9222 + (process.pid % 500);
const prof = mkdtempSync(join(tmpdir(), "cdp-"));

const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  `--window-size=${process.env.WIN || "1400,1000"}`,
  `--force-device-scale-factor=${process.env.DPR || "1"}`,   // 2 = match a retina Mac's fill rate
  "--allow-file-access-from-files", "--no-first-run", "--no-default-browser-check",
  "--use-angle=metal", "--enable-unsafe-swiftshader", "--hide-scrollbars",
  "about:blank",
], { stdio: ["ignore", "ignore", "ignore"] });

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
  if (m.method === "Runtime.consoleAPICalled")
    logs.push(m.params.type + ": " + m.params.args.map(a => a.value ?? a.description ?? JSON.stringify(a.preview?.properties)).join(" "));
  if (m.method === "Runtime.exceptionThrown")
    logs.push("EXC: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
if (process.env.SEED_LS) {                       // reproduce a returning visitor's saved settings
  await sleep(1200);
  await send("Runtime.evaluate", { expression: `localStorage.setItem("gl_opts",${JSON.stringify(process.env.SEED_LS)})` });
  await send("Page.navigate", { url: url + (url.includes("?") ? "&" : "?") + "r=1" });
}
await sleep(+waitMs);

if (exprFile) {
  const r = await send("Runtime.evaluate", {
    expression: readFileSync(exprFile, "utf8"), returnByValue: true, awaitPromise: true,
  });
  console.log("EVAL:", JSON.stringify(r.result?.value ?? r.exceptionDetails?.exception?.description, null, 1));
}
if (logs.length) console.log("CONSOLE:\n" + logs.slice(0, 40).join("\n"));

if (out !== "-") {
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("wrote", out);
}
ws.close(); chrome.kill(); process.exit(0);
