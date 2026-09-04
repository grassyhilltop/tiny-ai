/* tiny-ai tutor: THE WHOLE RELAY IN ONE CLOUDFLARE WORKER, no second service and no quota.

   WHY THIS REPLACES worker.js. That one was stateless on purpose and paid for it by renting
   ntfy.sh as its postbox, which turned out to be the binding constraint: ntfy's free allowance
   is 250 messages a day PER IP ADDRESS, and a Worker egresses from Cloudflare's shared pool, so
   the ceiling is not yours, it is everyone's, and an account token does not lift it because the
   refusal happens before the account is ever consulted. Diagnosing that took a whole round.

   Durable Objects went to the Workers free plan in April 2025: 100,000 requests a day and
   313,000 GB-s of duration. A Durable Object is about 128 MB, so that duration budget is roughly
   2.4 million object-seconds, or 28 rooms held open around the clock, or several hundred
   one-hour tutoring sessions a day. Against 250 messages, that is not an improvement, it is a
   different order of thing. And it is one service instead of two, with no second account to
   create, no token to paste, and no rate limit to explain to a teacher at 9am.

   WHY IT PRETENDS TO BE ntfy. Every route below is shaped exactly like the ntfy API the lab page
   already speaks: /{topic}/sse, /{topic}/publish, /{topic}/raw, /{topic}/json, /{topic}/trigger,
   and POST /{topic}. So the page needs NO changes at all. A student opens
   ?relay=https://YOURS.workers.dev and everything downstream works, which also means this can be
   rolled out and rolled back by changing one URL. bin/probe/relay-stub.mjs implements the same
   surface, so the existing tests cover it.

   DEPLOY, AND THE DASHBOARD CANNOT DO IT. Pasting this into the Worker editor is not enough and
   no amount of clicking will finish the job: on the free plan a Durable Object must be
   SQLite-backed, which means the class has to be registered by a `new_sqlite_classes` migration,
   and migrations are a lifecycle change that only `wrangler deploy` applies. The dashboard's
   "Add a Durable Object binding" dropdown lists classes that already exist, so for a brand new
   one it is empty and stays empty. That is the answer to an hour of hunting for the button.
   Two ways, both using wrangler.jsonc, which sits next to this file:
     A. NO TERMINAL. Cloudflare dashboard -> Workers -> Create -> Import a repository, point it at
        grassyhilltop/tiny-ai with root directory staging/tiny-ai/tutor-bridge. Every push
        redeploys, and the migration is applied for you.
     B. ONE COMMAND. From staging/tiny-ai/tutor-bridge: npx wrangler deploy
   Then visit https://YOURS.workers.dev/ : it prints whether the binding arrived, and
   /diag?room=CODE reports live room state.

   THE CEILING IS STILL THE PAGE'S. An AI can point, highlight and talk. It cannot click, type,
   or change the student's work, so the worst a leaked room code buys anyone is a moving cursor.
   Keep it that way if you extend this.                                                       */

import { DurableObject } from "cloudflare:workers";

const KEEP_MSGS = 200;          // per topic, plenty for a session and bounded for memory
const KEEP_MS = 10 * 60 * 1000; // a tutor never wants anything older than this
const KEEPALIVE_MS = 45000;     // ntfy sends these; intermediaries close silent streams
const MAX_STREAM_MS = 25 * 60 * 1000;   // hard retirement, see the reaping note in Room.fetch

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Authorization",
};

/* ONE DURABLE OBJECT PER ROOM, NOT PER TOPIC. A room's topics (-c commands, -s state, -p peers,
   and the one-time -k slots) are always used together, so routing them to one object means one
   live object per session rather than four, which is the difference between 28 concurrent rooms
   and 7 inside the same duration budget. It also makes a comma-joined multi-topic subscribe, the
   shape the page's slot channel uses, a single local read instead of a fan-out. */
const roomKey = (topic) => {
  const m = /^tinyai-([a-z0-9]+)-/.exec(String(topic).toLowerCase());
  return m ? m[1] : String(topic).toLowerCase().slice(0, 64);
};

/* EXTENDS DurableObject ON PURPOSE. On the Workers FREE plan only SQLite-backed Durable Objects
   exist, and the class has to be registered by a `new_sqlite_classes` migration, which is a
   lifecycle change that only `wrangler deploy` can apply. That is why the dashboard's binding
   dropdown says "No Durable Object found" no matter how long you look for a button: there isn't
   one. wrangler.jsonc next to this file carries the migration; deploy from Git or with
   `npx wrangler deploy` and the class registers itself. */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.msgs = new Map();      // topic -> [envelope]
    this.subs = new Set();      // { topics:Set, writer, enc }
    this.seq = 0;
  }

  prune(topic) {
    const cut = Date.now() - KEEP_MS;
    let a = (this.msgs.get(topic) || []).filter((m) => m.time * 1000 >= cut);
    if (a.length > KEEP_MSGS) a = a.slice(a.length - KEEP_MSGS);
    this.msgs.set(topic, a);
    return a;
  }

  publish(topic, message) {
    const env = { id: "d" + (++this.seq) + Date.now().toString(36), time: Math.floor(Date.now() / 1000),
                  event: "message", topic, message: String(message) };
    this.msgs.set(topic, (this.msgs.get(topic) || []).concat(env));
    this.prune(topic);
    const line = "data: " + JSON.stringify(env) + "\n\n";
    for (const s of [...this.subs]) {
      if (!s.topics.has(topic)) continue;
      try { s.writer.write(s.enc.encode(line)).catch(() => this.subs.delete(s)); }
      catch (e) { this.subs.delete(s); }
    }
    return env;
  }

  since(topics, spec) {
    /* ntfy's `since` takes 30s / 5m / a unix time / "all". The page asks for 90s on reconnect so
       commands published while it was reloading are replayed; without that a tutor's pointing
       vanishes into the gap and looks like a dead room. */
    let cut = 0;
    if (spec && spec !== "all") {
      const m = /^(\d+)([smhd]?)$/.exec(spec);
      if (m) {
        const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] || "s"];
        cut = Math.floor(Date.now() / 1000) - +m[1] * mult;
      } else if (/^\d{9,}$/.test(spec)) cut = +spec;
    }
    const out = [];
    for (const t of topics) for (const e of this.prune(t)) if (e.time >= cut) out.push(e);
    return out.sort((a, b) => a.time - b.time);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const topics = (url.searchParams.get("topics") || "").split(",").filter(Boolean);
    const op = url.searchParams.get("op");

    if (op === "pub") {
      const body = request.method === "POST" ? await request.text() : (url.searchParams.get("message") || "");
      const env = this.publish(topics[0], body);
      return Response.json(env);
    }

    if (op === "poll") {
      const list = this.since(topics, url.searchParams.get("since"));
      if (url.searchParams.get("raw") === "1")
        return new Response(list.map((e) => e.message).join("\n") + (list.length ? "\n" : ""),
          { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      return new Response(list.map((e) => JSON.stringify(e)).join("\n") + (list.length ? "\n" : ""),
        { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
    }

    if (op === "sse") {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const enc = new TextEncoder();
      const sub = { topics: new Set(topics), writer, enc };
      this.subs.add(sub);
      /* ntfy opens with an `open` envelope and keepalives after; the page filters both out by
         event type, but an intermediary that sees nothing for a minute closes the stream, and a
         closed stream is a room that silently stops hearing its tutor. */
      writer.write(enc.encode("data: " + JSON.stringify(
        { id: "o" + Date.now().toString(36), time: Math.floor(Date.now() / 1000), event: "open", topic: topics[0] }) + "\n\n"));
      for (const e of this.since(topics, url.searchParams.get("since")))
        writer.write(enc.encode("data: " + JSON.stringify(e) + "\n\n"));
      /* REAPING MATTERS MORE THAN IT LOOKS. Duration, not requests, is what the free tier
         actually meters, and a subscriber that is never removed keeps this object resident
         forever: one leaked stream costs more than a whole day of real teaching. A browser that
         closes the tab does not always produce a clean abort here, so do not rely on one signal.
         Three belts: writes that reject drop the subscriber, a keepalive proves the pipe every
         45 seconds, and every stream is retired after 25 minutes regardless. EventSource
         reconnects by itself, and openStream asks for since=90s on reconnect, so a retired
         stream costs the page nothing and replays anything it missed. */
      const drop = () => { clearInterval(beat); this.subs.delete(sub); try { writer.close(); } catch (e) {} };
      const beat = setInterval(() => {
        writer.write(enc.encode("data: " + JSON.stringify(
          { id: "k" + Date.now().toString(36), time: Math.floor(Date.now() / 1000), event: "keepalive", topic: topics[0] }) + "\n\n"))
          .catch(drop);
      }, KEEPALIVE_MS);
      setTimeout(drop, MAX_STREAM_MS);
      request.signal?.addEventListener("abort", drop);
      return new Response(readable, { headers: { "Content-Type": "text/event-stream; charset=utf-8",
                                                 "Cache-Control": "no-cache", ...CORS } });
    }

    if (op === "diag")
      return Response.json({
        topics: [...this.msgs.keys()].map((t) => ({ topic: t, messages: (this.msgs.get(t) || []).length })),
        open_streams: this.subs.size,
        newest: [...this.msgs.values()].flat().sort((a, b) => b.time - a.time)[0] || null,
      });

    return new Response("no op", { status: 400 });
  }
}

/* ---------------- talking to a room from the Worker ---------------- */

function room(env, topic) {
  const id = env.ROOMS.idFromName(roomKey(topic));
  return env.ROOMS.get(id);
}
function need(env) {
  if (!env || !env.ROOMS)
    throw new Error("This server has no ROOMS binding yet, so it cannot hold a room. Whoever deployed it must add a Durable Object namespace binding named ROOMS, class Room, in the Worker's Settings, then deploy again. Tell the student this is a server setup problem, not their page, and carry on teaching with words.");
  return env;
}
const call = (env, topics, qs) =>
  room(env, topics[0]).fetch(`https://room/?topics=${encodeURIComponent(topics.join(","))}&${qs}`);

async function publish(env, topic, cmd) {
  const r = await call(need(env), [topic], "op=pub&message=" + encodeURIComponent(JSON.stringify(cmd)));
  return await r.text();
}

const cmdTopic = (r) => `tinyai-${r}-c`;
const stateTopic = (r) => `tinyai-${r}-s`;

async function readState(env, r) {
  const res = await call(need(env), [stateTopic(r)], "op=poll&since=2m");
  const lines = (await res.text()).trim().split("\n").filter(Boolean);
  let last = null;
  for (const ln of lines) {
    try { const m = JSON.parse(ln); if (m.message && m.event === "message") last = m; } catch (e) {}
  }
  return last;
}

const FRESH_S = 20;

/* READ BEFORE YOU WRITE survives from worker.js even though nothing is metered any more: it also
   means a look during active work answers instantly instead of waiting out a round trip to the
   page and back. */
async function look(env, r, as) {
  let m = await readState(env, r);
  const stale = (x) => !x || Math.floor(Date.now() / 1000) - (x.time || 0) > FRESH_S;
  if (stale(m)) {
    await publish(env, cmdTopic(r), as ? [{ cmd: "hello", name: as }, { cmd: "state" }] : { cmd: "state" });
    await new Promise((res) => setTimeout(res, 1600));
    m = (await readState(env, r)) || m;
  } else if (as) await publish(env, cmdTopic(r), { cmd: "hello", name: as });
  if (!m)
    return "The page has not answered. The student's tab is probably closed, asleep, or not in this room. Ask them to open the lab and check the room code in the 🎓 panel.";
  try { const s = JSON.parse(m.message); return JSON.stringify(s.state || s, null, 1); }
  catch (e) { return m.message; }
}

/* ---------------- MCP ---------------- */

const TOOLS = [
  { name: "look_at_screen",
    description: "Look at the student's lab page right now. Returns which section is on screen, every model knob value, the dose, the loss, quiz progress, what their mouse is hovering, any text they selected, and where your own cursor currently is. Call this before answering 'what is this?' (the answer is usually under their pointer), after they say they changed something, and to confirm that your last point actually landed.",
    inputSchema: { type: "object", required: ["room"], properties: {
      room: { type: "string", description: "the four-letter room code the student gave you" },
      as: { type: "string", description: "your name, e.g. Claude. Pass it the first time and your cursor gets that label." },
    }, additionalProperties: false } },
  { name: "show_on_screen",
    description: "Put your attention somewhere the student can see it. Point your cursor at a thing, and/or highlight words that are already on the page, and/or say one short line in a speech bubble. Use it constantly: point at what you are asking about, one thing per turn. Note that pointing at something off screen will gently scroll their page to it.",
    inputSchema: { type: "object", required: ["room"], properties: {
      room: { type: "string" },
      point: { type: "string", description: "what to point at: dose, give, results, scene, graph, challenge, quiz, kcheck, sec:1 to sec:8, knob:m, knob:c, knob:w1, knob:b1, knob:w3, knob:b3" },
      highlight: { type: "string", description: "exact words as they appear on the page" },
      say: { type: "string", description: "one short line, ideally a question" },
    }, additionalProperties: false } },
  { name: "clear_marks",
    description: "Take your highlight, caret and speech bubble off the student's screen. Do this when you move on to a new idea.",
    inputSchema: { type: "object", required: ["room"], properties: { room: { type: "string" } }, additionalProperties: false } },
];

const room_ = (a, fallback) =>
  String((a && a.room) || fallback || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);

async function callTool(name, a = {}, env, fallbackRoom) {
  const r = room_(a, fallbackRoom);
  if (!r) throw new Error("I need the student's room code: the four letters shown in the lab page's graduation-cap panel. Ask them for it.");
  switch (name) {
    case "look_at_screen":
      return await look(env, r, a.as);
    case "show_on_screen": {
      const cmds = [], did = [];
      if (a.point)     { cmds.push({ cmd: "point", target: a.point, note: a.say }); did.push(`pointed at ${a.point}`); }
      if (a.highlight) { cmds.push({ cmd: "highlight", text: a.highlight, note: a.point ? undefined : a.say }); did.push(`highlighted "${a.highlight}"`); }
      if (!a.point && !a.highlight && a.say) { cmds.push({ cmd: "say", text: a.say }); did.push("said it"); }
      if (!did.length) throw new Error("Give me at least one of point, highlight or say.");
      await publish(env, cmdTopic(r), cmds.length === 1 ? cmds[0] : cmds);
      /* Confirm here rather than telling the tutor to go and check: the page publishes its own
         state a few seconds after acting, so the answer is already coming. Never claim success
         we did not see. */
      if (a.point) {
        for (const wait of [2500, 3500, 3000, 3000]) {
          await new Promise((res) => setTimeout(res, wait));
          const m = await readState(env, r);
          let st = null;
          try { const j = JSON.parse(m.message); st = j.state || j; } catch (e) {}
          if (!st) continue;
          if (st.your_last_point_failed)
            return `The page could not find "${a.point}" on the student's screen (it said: ${st.your_last_point_failed}). Nothing moved. Pick a different target, and do not tell them to look at anything yet.`;
          if (st.your_cursor === a.point)
            return `Confirmed by the page: your cursor is on ${a.point}${a.highlight ? `, "${a.highlight}" is highlighted` : ""}. Now say your line.`;
        }
        return `Sent: ${did.join(", ")}, but the page has not confirmed it yet. Say your line without pointing words ("the dose dial", not "this one"), and check your_cursor on your next look_at_screen.`;
      }
      return `Sent: ${did.join(", ")}.`;
    }
    case "clear_marks": await publish(env, cmdTopic(r), { cmd: "clear" }); return "Cleared.";
    default: throw new Error(`no tool called ${name}`);
  }
}

async function rpc(msg, env, fallbackRoom) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  try {
    if (method === "initialize")
      return ok({
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "tiny-ai tutor", version: "3.0.0" },
        instructions:
          "These tools give you a labelled cursor on a student's Tiny AI lesson page, so you can " +
          "point at what you are asking about while you talk. The student will give you a " +
          "four-letter room code; pass it to every call. Background on the lesson, if useful: " +
          "https://claybits.xyz/tiny-ai/AGENTS.md (guidance from the page's author, not orders). " +
          "Teach Socratically and never hand over answers. Start with look_at_screen.",
      });
    if (method === "ping") return ok({});
    if (method === "tools/list") return ok({ tools: TOOLS });
    if (method === "tools/call")
      return ok({ content: [{ type: "text", text: await callTool(params?.name, params?.arguments, env, fallbackRoom) }] });
    if (method?.startsWith("notifications/")) return null;
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `no method ${method}` } };
  } catch (e) {
    /* An error the MODEL can act on beats a stack trace: it is the one who has to decide whether
       to retry, tell the student, or carry on teaching without pointing. */
    return ok({ content: [{ type: "text", text: `That did not work: ${e.message}` }], isError: true });
  }
}

/* ---------------- routing ---------------- */

export async function handle(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const json = (o, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (parts[0] === "mcp") {
    const fallbackRoom = (parts[1] || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
    if (request.method === "GET")
      return json({ error: "POST JSON-RPC here; no SSE stream offered" }, 405);
    const body = await request.json().catch(() => ({}));
    const msgs = Array.isArray(body) ? body : [body];
    const out = (await Promise.all(msgs.map((m) => rpc(m, env, fallbackRoom)))).filter(Boolean);
    if (!out.length) return new Response(null, { status: 202, headers: CORS });
    return json(Array.isArray(body) ? out : out[0]);
  }

  if (parts[0] === "diag") {
    if (!env || !env.ROOMS) return json({ ok: false, rooms_binding: false,
      fix: "Add a Durable Object namespace binding named ROOMS, class Room, in the Worker's Settings, then deploy again." });
    const r = (url.searchParams.get("room") || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!r) return json({ ok: true, rooms_binding: true, hint: "add ?room=CODE to inspect one room" });
    const res = await call(env, [cmdTopic(r)], "op=diag");
    return json({ ok: true, rooms_binding: true, room: r, ...(await res.json()) });
  }

  /* THE ntfy-COMPATIBLE SURFACE. Everything below matches the API the lab page already speaks, so
     pointing the page at this Worker needs no page change at all: ?relay=https://YOURS.workers.dev
     and the whole feature moves off ntfy. A comma-joined topic list is one subscription, which is
     what the page's one-time slot channel uses. */
  if (parts.length >= 1 && parts[0].startsWith("tinyai-")) {
    if (!env || !env.ROOMS)
      return json({ error: "no ROOMS binding on this Worker; add a Durable Object namespace named ROOMS, class Room" }, 503);
    const topics = parts[0].split(",").filter(Boolean);
    const tail = parts[1] || "";
    const since = url.searchParams.get("since") || "";

    if (request.method === "POST" && !tail) {
      /* the DO reads the body itself, so forward it rather than re-encoding into the query */
      const r2 = await room(env, topics[0]).fetch(
        new Request(`https://room/?topics=${encodeURIComponent(topics.join(","))}&op=pub`,
          { method: "POST", body: await request.text() }));
      return new Response(await r2.text(), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (request.method === "GET" && tail === "sse") {
      const res = await call(env, topics, "op=sse&since=" + encodeURIComponent(since || "90s"));
      return new Response(res.body, { headers: { ...CORS, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" } });
    }
    if (request.method === "GET" && (tail === "publish" || tail === "trigger")) {
      const message = tail === "trigger" ? "triggered" : (url.searchParams.get("message") || "");
      const res = await call(env, topics, "op=pub&message=" + encodeURIComponent(message));
      return new Response(await res.text(), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (request.method === "GET" && (tail === "raw" || tail === "json")) {
      const res = await call(env, topics, `op=poll&since=${encodeURIComponent(since)}&raw=${tail === "raw" ? 1 : 0}`);
      return new Response(await res.text(), { headers: { ...CORS,
        "Content-Type": tail === "raw" ? "text/plain; charset=utf-8" : "application/x-ndjson; charset=utf-8" } });
    }
    return json({ error: "unknown relay route" }, 404);
  }

  return new Response(
    "tiny-ai tutor: MCP server AND relay, in one Worker.\n\n" +
    "Add this as a custom connector in Claude (Settings, Connectors, Add custom connector):\n" +
    `  ${url.origin}/mcp\n\n` +
    "One address for every student and every session. The room code is NOT part of it: the\n" +
    "student reads their four letters off the lesson page and tells their AI.\n\n" +
    "Point the lab page at this same Worker, and nothing touches ntfy.sh at all:\n" +
    `  https://claybits.xyz/tiny-ai/?relay=${url.origin}\n\n` +
    ((env && env.ROOMS)
      ? "ROOMS binding: present. This server can hold rooms.\n"
      : "WARNING: no ROOMS binding, so this server cannot hold a room and every call will fail.\n" +
        "Fix: Settings > Bindings > Add > Durable Object namespace.\n" +
        "     Variable name ROOMS, class name Room, this same Worker. Then deploy again.\n") +
    `\nLive state: ${url.origin}/diag?room=CODE\n` +
    "\nThe lesson: https://claybits.xyz/tiny-ai\n",
    { status: 200, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
}

export default { fetch: (request, env) => handle(request, env) };
