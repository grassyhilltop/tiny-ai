/* WHAT A ROOM COSTS WHEN NOBODY IS TEACHING ON IT.

   Duration, not requests, is the free tier's scarce resource: a Durable Object bills for the
   wall-clock time it is resident, and an open SSE stream keeps it resident. A day's allowance
   is about 28 hours of one stream, so a single tab left open exhausts it. Twice now it did.

   This asserts the three things that stop that happening, all of which were broken:
     1. a room with no TUTOR in it hangs up, even while the student's page is heartbeating,
     2. it says `ended` on the way out, so the page can agree to stop instead of reconnecting,
     3. a stream that closes early leaves nothing pending behind it.

   Run against the local harness, which shrinks the timers:
     FAST=1 node bin/probe/worker-do-local.mjs 8799 &
     node bin/probe/relay-idle.mjs 8799                                                       */
const PORT = +(process.argv[2] || 8799);
const BASE = "http://localhost:" + PORT;
const ROOM = "idle";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const ok = (name, pass, note) => {
  if (!pass) bad++;
  console.log((pass ? "  ok   " : "  FAIL ") + name + (note ? "   " + note : ""));
};

/* read an SSE stream into a list of envelopes until it closes or the deadline passes */
async function listen(topic, ms) {
  const seen = [];
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  let closedEarly = false;
  try {
    const res = await fetch(`${BASE}/${topic}/sse?since=all`, { signal: ctl.signal });
    const rd = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await rd.read();
      if (done) { closedEarly = true; break; }
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).replace(/^data: /, "");
        buf = buf.slice(i + 2);
        try { seen.push(JSON.parse(line)); } catch (e) {}
      }
    }
  } catch (e) {}
  clearTimeout(to);
  return { seen, closedEarly };
}

const diag = async () => (await fetch(`${BASE}/diag?room=${ROOM}`)).json();

console.log("relay idle/duration probe on " + BASE);

/* 1. THE STUDENT'S OWN HEARTBEAT MUST NOT KEEP THE ROOM ALIVE. This is the bug that cost two
      days of quota: the reap watched "last message on any topic", and the page publishes state
      every ninety seconds, so a room with a tab open and no AI in it was never idle. */
const beat = setInterval(() => {
  fetch(`${BASE}/tinyai-${ROOM}-s`, { method: "POST", body: JSON.stringify({ type: "state", state: {} }) })
    .catch(() => {});
}, 500);
const run = listen(`tinyai-${ROOM}-c`, 9000);
await sleep(1200);
const mid = await diag();
ok("stream is open while the page listens", mid.open_streams >= 1, "open_streams=" + mid.open_streams);
const { seen, closedEarly } = await run;
clearInterval(beat);
const ended = seen.filter((e) => e.event === "ended");
ok("an idle room hangs up despite the page heartbeating", ended.length === 1,
   ended.length ? "reason: " + ended[0].reason : "never hung up: " + seen.length + " envelopes, none ended");
ok("and closes the stream after saying so", closedEarly);

const after = await diag();
ok("no stream is left behind", after.open_streams === 0, "open_streams=" + after.open_streams);
ok("diag prices the room", typeof after.stream_seconds_served === "number" &&
   typeof after.no_tutor_seconds === "number",
   "served=" + after.stream_seconds_served + "s no_tutor=" + after.no_tutor_seconds + "s");

/* 2. A TUTOR RESETS THE CLOCK, or a lesson would be cut off in the middle of itself. Use
      /clear rather than /p/: pointing blocks for up to eight seconds waiting for the page to
      confirm it landed, which is fine in a lesson and useless in a timing test. */
const room2 = "busy";
async function diag2(r) { return (await fetch(`${BASE}/diag?room=${r}`)).json(); }
const run2 = listen(`tinyai-${room2}-c`, 9000);
await sleep(300);
for (let i = 0; i < 6; i++) { await fetch(`${BASE}/clear/${room2}/${i}`); await sleep(600); }
const d2 = await diag2(room2);
ok("a tutor's commands keep its own room open past the reap", d2.open_streams >= 1 && d2.no_tutor_seconds <= 2,
   "open_streams=" + d2.open_streams + " no_tutor=" + d2.no_tutor_seconds + "s after " +
   d2.room_age_seconds + "s of a 2.5s reap window");
const r2 = await run2;
const e2 = r2.seen.filter((e) => e.event === "ended");
ok("and it is hung up once the tutor stops", e2.length === 1, e2.map((e) => e.reason).join());

/* 3. AND A STREAM THAT ENDS EARLY LEAVES NOTHING BEHIND, which is the leak that survived the
      first fix. drop() cleared the keepalive and not the retirement timeout, so every stream
      that closed before its half hour was up left a thirty-minute timer inside the object, and
      an object with pending work is resident and billed: a tab closed at five was still being
      paid for at midnight. Node lists pending timers, so this is directly countable. Loaded in
      process rather than over HTTP because the question is about the object's own state; the
      substitution is the same one bin/probe/worker-do-local.mjs makes and for the same reason. */
{
  const { readFileSync, writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const tmp = join(mkdtempSync(join(tmpdir(), "idle-")), "w.mjs");
  writeFileSync(tmp, readFileSync("staging/tiny-ai/tutor-bridge/worker-do.js", "utf8").replace(
    'import { DurableObject } from "cloudflare:workers";',
    'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }'));
  const { Room } = await import(tmp);
  const inst = new Room({ id: { name: "t" } });
  const timers = () => process.getActiveResourcesInfo().filter((x) => x === "Timeout").length;
  const base = timers();
  const ctl = new AbortController();
  await inst.fetch(new Request("https://room/?topics=tinyai-t-c&op=sse", { signal: ctl.signal }));
  const held = timers();
  ok("an open stream holds timers", held > base, held - base + " of them");
  ctl.abort();
  await sleep(60);
  ok("and closing it clears every one", timers() <= base, timers() - base + " left pending");
  ok("and the subscriber goes with them", inst.subs.size === 0, "subs=" + inst.subs.size);
}

console.log(bad ? `\nFAIL: ${bad} check(s)` : "\nPASS: relay holds a room only while it is being taught on");
process.exit(bad ? 1 : 0);
