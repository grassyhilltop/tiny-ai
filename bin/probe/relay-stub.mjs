/* A tiny stand-in for the parts of ntfy.sh this lab uses, so the whole live loop can be
   tested without touching the real service.

   This exists because the real relay's quota is PER IP, and the machine running the probes is
   usually the same machine running the student's browser. A probe loop quietly spent the
   allowance and a real session lost its eyes, with nothing on either side saying why. Tests
   should not be able to break the product.

   Endpoints, matching ntfy's shapes:
     GET  /<topic>/sse?since=...        text/event-stream, one `data: {...}` per message
     GET  /<topic>/publish?message=...  publish via URL (what a chat AI's fetch tool does)
     GET  /<topic>/trigger              publish the default body; the MEANING is the topic name
     GET  /<a>,<b>,<c>/sse              one stream over several topics, comma joined
     POST /<topic>                      publish via body (what the page does)
     GET  /<topic>/raw?poll=1&since=... text/plain, one message body per line
     GET  /<topic>/json?poll=1          application/x-ndjson, like the real thing

   Run:  node bin/probe/relay-stub.mjs [port]        (default 8788)                          */

import http from "node:http";

const PORT = +(process.argv[2] || process.env.PORT || 8788);
const topics = new Map();                      // name -> { msgs: [], subs: Set<res> }

function topic(name) {
  let t = topics.get(name);
  if (!t) { t = { msgs: [], subs: new Set() }; topics.set(name, t); }
  return t;
}
let seq = 0;
function publish(name, message) {
  const t = topic(name);
  const env = { id: "stub" + (++seq), time: Math.floor(Date.now() / 1000),
                event: "message", topic: name, message: String(message) };
  t.msgs.push(env);
  while (t.msgs.length > 200) t.msgs.shift();
  for (const res of t.subs) { try { res.write("data: " + JSON.stringify(env) + "\n\n"); } catch {} }
  return env;
}
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*",
               "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  if (!parts.length) return res.writeHead(200, cors).end("relay stub");

  const name = parts[0], tail = parts[1] || "";

  if (req.method === "GET" && tail === "sse") {
    /* ntfy subscribes to several topics from one stream when they are comma joined, and the
       page's path-only command channel depends on it: every command is its own topic. */
    const names = name.split(",").filter(Boolean);
    res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
                         Connection: "keep-alive" });
    res.write(": open\n\n");
    /* ntfy replays recent messages on subscribe when asked; the page relies on that to bridge
       a reload, and the page's own BOOT_AT filter decides what is too old to act on */
    const since = url.searchParams.get("since");
    if (since) {
      const secs = /^(\d+)s$/.test(since) ? +RegExp.$1 : /^(\d+)m$/.test(since) ? +RegExp.$1 * 60 : 0;
      const cut = Math.floor(Date.now() / 1000) - secs;
      for (const n of names)
        for (const m of topic(n).msgs) if (m.time >= cut) res.write("data: " + JSON.stringify(m) + "\n\n");
    }
    const ts = names.map(topic);
    ts.forEach(t => t.subs.add(res));
    const beat = setInterval(() => { try { res.write(": hb\n\n"); } catch {} }, 20000);
    req.on("close", () => { clearInterval(beat); ts.forEach(t => t.subs.delete(res)); });
    return;
  }

  if (req.method === "GET" && tail === "trigger") {
    const env = publish(name, "triggered");     // ntfy's default body when handed no message
    return res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(env));
  }

  if (req.method === "GET" && tail === "publish") {
    const env = publish(name, url.searchParams.get("message") || "");
    return res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(env));
  }

  if (req.method === "GET" && (tail === "raw" || tail === "json")) {
    const msgs = topic(name).msgs;
    if (tail === "raw")
      return res.writeHead(200, { ...cors, "Content-Type": "text/plain; charset=utf-8" })
                .end(msgs.map(m => m.message).join("\n") + (msgs.length ? "\n" : ""));
    return res.writeHead(200, { ...cors, "Content-Type": "application/x-ndjson; charset=utf-8" })
              .end(msgs.map(m => JSON.stringify(m)).join("\n") + (msgs.length ? "\n" : ""));
  }

  if (req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => {
      const env = publish(name, body);
      res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(env));
    });
    return;
  }
  res.writeHead(404, cors).end("no");
});

server.listen(PORT, () => console.log("relay stub on http://localhost:" + PORT));
