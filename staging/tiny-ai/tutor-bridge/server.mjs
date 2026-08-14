/* tutor-bridge, the relay that connects a student's own AI to their open tiny-ai lab page.
   One file, zero dependencies, Node 18+.  Run:  node server.mjs   (PORT=8787 by default)

   Two faces, joined by a room code the page invents:

     the page  ──SSE──▶  GET  /rooms/:room/page      commands flowing page-ward
     the page  ──POST──▶ POST /rooms/:room/events    state / selections / questions / kcheck
     the page  ──POST──▶ POST /rooms/:room/results   acks for commands that carried an _id

     the AI    ──POST──▶ POST /mcp/:room             MCP (streamable HTTP, JSON responses)
     the AI    ──GET───▶ GET  /v/:room/...           the same tools as plain URLs, for VOICE

   WHY THERE ARE TWO AI-FACING DOORS. Voice mode, on both Claude and ChatGPT, does not get
   custom MCP connectors. It gets a curated tool set: web search, and on Claude a first-party
   connector allowlist (Gmail, Calendar, Docs, Slack, Canva, Notion). A room's MCP endpoint is
   invisible to it, which is why the cursor works in a text chat and goes dead the moment you
   switch to voice. See the README for sources.

   The one general-purpose tool voice DOES have is fetching a URL. So every tool here is also
   an ordinary GET that returns plain text: /v/ROOM/point/dose?say=what+does+this+do. Nothing
   about the page changes; this is a second way to reach the same dispatch.

   The AI's MCP tools (get_page_state, point_at, highlight_text, move_cursor, say,
   clear_annotations, introduce) turn into the page's presence commands and back.

   This is a CLASSROOM PROTOTYPE. There is no auth beyond the room code, no TLS of its own
   (put cloudflared/ngrok in front for a public URL), and rooms evaporate after an hour of
   silence. The only thing an AI can do through it is point, highlight and talk, the page
   refuses anything else, so the blast radius of a leaked room code is a moving cursor.    */

import http from "node:http";

const PORT = process.env.PORT || 8787;
const ROOM_TTL_MS = 60 * 60 * 1000;
const ACK_TIMEOUT_MS = 3000;

const rooms = new Map(); // CODE -> room

function room(code) {
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!code) return null;
  let r = rooms.get(code);
  if (!r) {
    r = { code, page: null, lastState: null, events: [], pending: new Map(), seq: 0,
          touched: Date.now() };
    rooms.set(code, r);
  }
  r.touched = Date.now();
  return r;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, r] of rooms) if (now - r.touched > ROOM_TTL_MS) { try { r.page?.end(); } catch {} rooms.delete(k); }
}, 60_000).unref();

/* ---- page side ------------------------------------------------------------------ */

function sseAttach(r, res) {
  try { r.page?.end(); } catch {}
  r.page = res;
  res.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*", "Connection": "keep-alive",
  });
  res.write(": connected\n\n");
  const beat = setInterval(() => { try { res.write(": hb\n\n"); } catch {} }, 25_000);
  res.on("close", () => { clearInterval(beat); if (r.page === res) r.page = null; });
}

function sendToPage(r, cmd, wantAck) {
  if (!r.page) return Promise.resolve({ ok: false, error: "no page connected to room " + r.code });
  const id = wantAck ? ++r.seq : null;
  if (id) cmd = { ...cmd, _id: id };
  try { r.page.write("data: " + JSON.stringify(cmd) + "\n\n"); }
  catch { return Promise.resolve({ ok: false, error: "page stream broke" }); }
  if (!id) return Promise.resolve({ ok: true });
  return new Promise((resolve) => {
    const t = setTimeout(() => { r.pending.delete(id);
      resolve({ ok: false, error: "page did not confirm within " + ACK_TIMEOUT_MS + "ms (tab closed or asleep?)" });
    }, ACK_TIMEOUT_MS);
    r.pending.set(id, (res_) => { clearTimeout(t); resolve(res_); });
  });
}

function recordEvent(r, ev) {
  if (ev.type === "state" || ev.type === "hello") { r.lastState = ev.state || r.lastState; }
  if (ev.type !== "state") {                     // states are a heartbeat, not history
    r.events.push(ev);
    while (r.events.length > 40) r.events.shift();
  }
}

/* ---- MCP side ------------------------------------------------------------------- */

const TOOLS = [
  { name: "get_page_state",
    description: "See the student's page right now: which section is on screen, every model knob value, the dose, quiz progress, what their mouse is hovering, text they selected, questions they queued, and their section-5 knowledge-check sentence if submitted. Call this before answering 'what is this?', the answer is usually under their pointer.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "point_at",
    description: "Move your labelled cursor to something on the student's page and pulse it, optionally saying a short line in a speech bubble next to it. Targets: dose, scene, give, results, quiz, kcheck, sec:1..sec:8, knob:w1, knob:b1, knob:w3, knob:b3, or any CSS selector.",
    inputSchema: { type: "object", required: ["target"], properties: {
      target: { type: "string", description: "what to point at" },
      note: { type: "string", description: "optional short line to say beside it (keep Socratic, a question, not an answer)" },
    }, additionalProperties: false } },
  { name: "highlight_text",
    description: "Highlight words on the page Google-Docs style, with your blinking caret at the end. Give the EXACT words as they appear on the page (case-insensitive, whitespace-forgiving).",
    inputSchema: { type: "object", required: ["text"], properties: {
      text: { type: "string", description: "exact words from the page" },
      note: { type: "string", description: "optional short line to say about it" },
    }, additionalProperties: false } },
  { name: "move_cursor",
    description: "Move your cursor to a viewport position. x and y are fractions 0..1 (0.5,0.5 = centre of what the student currently sees).",
    inputSchema: { type: "object", required: ["x", "y"], properties: {
      x: { type: "number" }, y: { type: "number" },
    }, additionalProperties: false } },
  { name: "say",
    description: "Say a short line in a speech bubble by your cursor. Use for one-liners while pointing; longer teaching belongs in the chat.",
    inputSchema: { type: "object", required: ["text"], properties: {
      text: { type: "string" },
    }, additionalProperties: false } },
  { name: "clear_annotations",
    description: "Remove your highlights, caret and speech bubble from the page.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "introduce",
    description: "Set the name on your cursor's label (e.g. 'Claude'). Do this once at the start of a live session.",
    inputSchema: { type: "object", required: ["name"], properties: {
      name: { type: "string" },
    }, additionalProperties: false } },
];

async function callTool(r, name, args) {
  args = args || {};
  switch (name) {
    case "get_page_state": {
      const fresh = await sendToPage(r, { cmd: "state" }, true);
      const state = fresh.ok && fresh.res?.result ? fresh.res.result : r.lastState;
      return {
        page_connected: !!r.page, state: state || "no page state yet, is the student's tab open and connected?",
        recent_student_events: r.events.slice(-8),
      };
    }
    case "point_at":       return (await sendToPage(r, { cmd: "point", target: args.target, note: args.note }, true));
    case "highlight_text": return (await sendToPage(r, { cmd: "highlight", text: args.text, note: args.note }, true));
    case "move_cursor":    return (await sendToPage(r, { cmd: "cursor", x: args.x, y: args.y }, true));
    case "say":            return (await sendToPage(r, { cmd: "say", text: args.text }, true));
    case "clear_annotations": return (await sendToPage(r, { cmd: "clear" }, true));
    case "introduce":      return (await sendToPage(r, { cmd: "hello", name: args.name }, true));
    default: throw new Error("unknown tool: " + name);
  }
}

async function mcpRpc(r, msg) {
  const { id, method, params } = msg;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  try {
    switch (method) {
      case "initialize": {
        /* a courtesy: label the cursor after the connecting client before the AI even speaks */
        const cn = (params?.clientInfo?.name || "").toLowerCase();
        const guess = cn.includes("claude") ? "Claude" : /openai|chatgpt|gpt/.test(cn) ? "ChatGPT" : null;
        if (guess) sendToPage(r, { cmd: "hello", name: guess }, false);
        return reply({
          protocolVersion: params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "tiny-ai tutor-bridge", version: "0.1.0" },
          instructions:
            "You are connected to a student's live tiny-ai lab page (room " + r.code + "). " +
            "You are their Socratic tutor, read https://claybits.xyz/tiny-ai/AGENTS.md for your " +
            "briefing; never give answers away. Start with get_page_state, introduce yourself, " +
            "and point at things as you ask about them.",
        });
      }
      case "ping": return reply({});
      case "tools/list": return reply({ tools: TOOLS });
      case "tools/call": {
        const out = await callTool(r, params?.name, params?.arguments);
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 1) }],
                       isError: out && out.ok === false });
      }
      default:
        if (method?.startsWith("notifications/")) return null;   // fire-and-forget
        return fail(-32601, "method not found: " + method);
    }
  } catch (e) {
    return fail(-32000, String(e?.message || e));
  }
}

/* ---- voice side: the same tools, as plain URLs ------------------------------------
   A fetching model reads a WEB PAGE, not an API response: whatever it gets is flattened to
   text and skim-read. JSON survives that badly (quotes and braces get summarised away and the
   model starts inventing fields), so everything here answers in prose. Every reply ends with
   the live page state, so ONE fetch both acts and observes: voice round-trips are slow and a
   model that has to call twice per turn mostly calls once and guesses. */

function stateText(s) {
  if (!s) return "The page has not reported its state yet. Is the student's tab open and connected?";
  const L = [];
  // the pointer goes FIRST: "what am I looking at" is the question a voice tutor actually has
  L.push(s.student_pointer
    ? "STUDENT'S POINTER: over " + s.student_pointer.over + " (" + s.student_pointer.seconds_ago + "s ago)."
    : "STUDENT'S POINTER: not over anything the page recognises right now.");
  if (s.student_selection && s.student_selection.text)
    L.push('SELECTED TEXT: "' + s.student_selection.text + '"');
  if (s.section_in_view) L.push("SECTION ON SCREEN: " + s.section_in_view.name);
  if (s.stage != null) L.push("STAGE: " + s.stage + " (1 straight line, 2 one bend, 3 two bends)");
  if (s.dose_mg != null) L.push("DOSE DIAL: " + s.dose_mg + " mg of 10");
  if (s.data_points != null) L.push("TRIALS RUN: " + s.data_points);
  if (s.step1_model) L.push("STEP 1 KNOBS: m=" + s.step1_model.m + " c=" + s.step1_model.c + " (0..1 units)");
  if (s.shared_model) {
    const k = Object.keys(s.shared_model).filter((n) => n !== "note");
    if (k.length) L.push("MODEL KNOBS: " + k.map((n) => n + "=" + s.shared_model[n]).join(" "));
  }
  if (s.loss != null) L.push("LOSS: " + s.loss + " (lower is better; 5 stars is about 0.0035)");
  if (s.quiz) L.push("TINY TEST: " + (s.quiz.started
    ? "in progress, " + s.quiz.streak + " of 3 right in a row"
      + (s.quiz.current_case_mg != null ? ", current case " + s.quiz.current_case_mg + " mg" : "")
    : "not started"));
  if (s.knowledge_check_draft) L.push('SECTION 5 DRAFT: "' + s.knowledge_check_draft + '"');
  if (s.student_asked) L.push("STUDENT ASKED: " + s.student_asked.map((a) => a.q || a).join(" | "));
  return L.join("\n");
}

function voiceMenu(room) {
  return [
    "WHAT YOU CAN DO (each is a URL to fetch; every one answers with the page state again):",
    "  /v/" + room + "                          look, without touching anything",
    "  /v/" + room + "/point/TARGET             move your cursor there and pulse it",
    "  /v/" + room + "/highlight/EXACT+WORDS    highlight words that are on the page",
    "  /v/" + room + "/say/YOUR+LINE            one short line in a speech bubble",
    "  /v/" + room + "/clear                    take your marks off the page",
    "  /v/" + room + "/hello/Claude             put your name on the cursor (once, at the start)",
    "Add ?say=a+short+question to point or highlight to do both in one fetch.",
    "TARGETS: dose scene give results quiz kcheck sec:1 sec:2 sec:3 sec:4 sec:5 sec:6 sec:7 sec:8",
    "         knob:w1 knob:b1 knob:w3 knob:b3, or any CSS selector.",
    "You can point, highlight and talk. You cannot click, type, or change the student's work.",
    "IMPORTANT: add a different ?n=NUMBER to every fetch. Web fetching caches, and a cached",
    "reply will show you the student's screen as it was minutes ago.",
  ].join("\n");
}

/* Always ask the page for a fresh snapshot rather than trusting r.lastState. The page acks a
   command with {ok:true}, and only reports state when asked, so lastState can easily be a
   minute old, and a tutor being told where the pointer WAS is worse than being told nothing. */
async function freshState(r) {
  const got = await sendToPage(r, { cmd: "state" }, true);
  if (got.ok && got.res?.result) { r.lastState = got.res.result; }
  return r.lastState;
}

async function voiceCall(r, action, arg, q) {
  const say = q.get("say");
  switch (action) {
    case "":
    case "look":      return "Looked.";
    case "point":     await sendToPage(r, { cmd: "point", target: arg, note: say }, true);
                      return "Pointed at " + arg + (say ? ' and said "' + say + '".' : ".");
    case "highlight": await sendToPage(r, { cmd: "highlight", text: arg, note: say }, true);
                      return 'Highlighted "' + arg + '"' + (say ? ' and said "' + say + '".' : ".");
    case "say":       await sendToPage(r, { cmd: "say", text: arg }, true);
                      return 'Said "' + arg + '".';
    case "clear":     await sendToPage(r, { cmd: "clear" }, true); return "Cleared your marks.";
    case "hello":     await sendToPage(r, { cmd: "hello", name: arg }, true);
                      return "Your cursor is now labelled " + arg + ".";
    case "help":      return "Here is what you can do.";
    default:          return "There is no action called '" + action + "'. Here is what there is.";
  }
}

/* ---- plumbing ------------------------------------------------------------------- */

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
const json = (res, code, obj, extra = {}) =>
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...extra })
     .end(JSON.stringify(obj));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "OPTIONS")
    return res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Authorization",
      "Access-Control-Max-Age": "86400",
    }).end();

  try {
    // GET /rooms/:room/page, the student's tab attaches here
    if (req.method === "GET" && parts[0] === "rooms" && parts[2] === "page")
      return sseAttach(room(parts[1]), res);

    // POST /rooms/:room/events, the page reporting what the student is doing
    if (req.method === "POST" && parts[0] === "rooms" && parts[2] === "events") {
      const r = room(parts[1]);
      recordEvent(r, JSON.parse(await readBody(req) || "{}"));
      return json(res, 200, { ok: true });
    }

    // POST /rooms/:room/results, the page acking a command
    if (req.method === "POST" && parts[0] === "rooms" && parts[2] === "results") {
      const r = room(parts[1]);
      const { id, res: result } = JSON.parse(await readBody(req) || "{}");
      const waiter = r.pending.get(id);
      if (waiter) { r.pending.delete(id); waiter({ ok: true, res: result }); }
      return json(res, 200, { ok: true });
    }

    // GET /rooms/:room/status, quick debugging
    if (req.method === "GET" && parts[0] === "rooms" && parts[2] === "status") {
      const r = room(parts[1]);
      return json(res, 200, { room: r.code, page_connected: !!r.page, events: r.events.length,
                              has_state: !!r.lastState });
    }

    /* GET /v/:room[/action[/arg]], the student's AI, when all it has is a fetcher.
       Side effects on a GET is normally a sin. It is deliberate here and the blast radius is
       the same as the MCP door's: point, highlight, talk. Nothing can change the student's
       work, so the worst a stray crawler on a leaked room code can do is move a cursor. */
    if (req.method === "GET" && parts[0] === "v" && parts[1]) {
      const r = room(parts[1]);
      const action = (parts[2] || "").toLowerCase();
      /* `+` means space in a QUERY STRING and a literal plus in a PATH. Models write
         /highlight/too+much+does+harm because that is what a query string taught them, and the
         strict reading hands the page "too+much+does+harm", which matches nothing and looks
         like the highlighter is broken. Treat it as a space: none of these arguments (page
         prose, a target name, a tutor's line) has a reason to contain a real plus. */
      const arg = parts.slice(3).map((s) => decodeURIComponent(s.replace(/\+/g, "%20"))).join("/");
      let line, snap = null;
      try {
        line = await voiceCall(r, action, arg, url.searchParams);
        snap = await freshState(r);
      } catch (e) { line = "That did not work: " + String(e?.message || e); }
      const body = [
        line,
        "",
        r.page ? stateText(snap)
               : "NOBODY IS CONNECTED to room " + r.code + " right now. The student's tab is closed, "
                 + "asleep, or was never connected. Ask them to reopen the lab page.",
        "",
        voiceMenu(r.code),
      ].join("\n");
      return res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Access-Control-Allow-Origin": "*",
      }).end(body);
    }

    // POST /mcp/:room, the student's AI
    if (parts[0] === "mcp" && parts[1]) {
      const r = room(parts[1]);
      if (req.method === "GET")                       // no server-initiated stream in this prototype
        return json(res, 405, { error: "SSE stream not offered; POST JSON-RPC here" }, { Allow: "POST" });
      if (req.method !== "POST") return json(res, 405, { error: "POST only" }, { Allow: "POST" });
      const body = JSON.parse(await readBody(req) || "{}");
      const msgs = Array.isArray(body) ? body : [body];
      const replies = (await Promise.all(msgs.map((m) => mcpRpc(r, m)))).filter(Boolean);
      if (!replies.length) return res.writeHead(202, { "Access-Control-Allow-Origin": "*" }).end();
      return json(res, 200, Array.isArray(body) ? replies : replies[0]);
    }

    if (req.method === "GET" && parts.length === 0)
      return json(res, 200, {
        service: "tiny-ai tutor-bridge", rooms: rooms.size,
        page: "GET /rooms/CODE/page (SSE) · POST /rooms/CODE/events · POST /rooms/CODE/results",
        ai: "POST /mcp/CODE (MCP streamable HTTP) \u00b7 GET /v/CODE/... (plain URLs, for voice)",
      });

    return json(res, 404, { error: "not found" });
  } catch (e) {
    return json(res, 400, { error: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log("tutor-bridge listening on http://localhost:" + PORT);
  console.log("  student page:   🎓 AI tutor → Live session… → paste http://localhost:" + PORT);
  console.log("  student's AI:   MCP endpoint http://localhost:" + PORT + "/mcp/ROOMCODE");
  console.log("  public URL:     cloudflared tunnel --url http://localhost:" + PORT + "   (or ngrok http " + PORT + ")");
});
