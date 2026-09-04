/* tiny-ai tutor: a REMOTE MCP SERVER you can deploy from a browser in about two minutes.
   One file, no dependencies, no build step, no database, no paid tier.

   WHY THIS EXISTS. The lab's zero-setup path has the student's AI drive the page by fetching
   URLs. That works in a typed chat and is unreliable in voice mode, where the fetch tool is
   often not registered at all. MCP tools are invoked through a different path than web fetching,
   so this is the route worth testing for voice. It is also simply better where it works: real
   arguments instead of a menu of pre-baked URLs, real errors, and nothing for a cache to eat.

   WHY IT IS STATELESS, WHICH IS THE WHOLE TRICK. It stores nothing. Every tool call is a plain
   HTTPS call to the public ntfy.sh relay, which is where the lab page is already listening. No
   Durable Objects, no KV, no sessions. That matters because per-connection state is exactly the
   thing free serverless tiers charge for. One deployment serves every classroom: the room code
   travels in the URL path, so the connector URL is the only thing a student needs.

   DEPLOY (no terminal, no install):
     1. dash.cloudflare.com  ->  Compute (Workers)  ->  Create  ->  Start from Hello World
     2. Deploy it, then Edit code, select all, paste this file over it, Deploy again.
     3. Your URL is https://SOMETHING.workers.dev
   CONNECT (in Claude): Settings -> Connectors -> Add custom connector
     https://SOMETHING.workers.dev/mcp/ROOMCODE          (room code is in the lab's 🎓 panel)

   The ceiling is the page's, not ours: an AI can point, highlight and talk. It cannot click,
   type, or change the student's work, so the worst a stray room code buys anyone is a moving
   cursor. Keep it that way if you extend this.                                              */

const RELAY = "https://ntfy.sh";
const cmdTopic = (room) => `tinyai-${room}-c`;
const stateTopic = (room) => `tinyai-${room}-s`;

/* WHY THERE IS A TOKEN, AND WHY IT IS NOT OPTIONAL IN PRACTICE.
   ntfy rate limits per VISITOR, and a visitor is an IP address (a /32, or a /64 on v6). A
   browser gets its own household IP and a fresh bucket. A Cloudflare Worker does not: it
   egresses from Cloudflare's shared pool, which the rest of the internet is also using, so the
   bucket is permanently drained and the FIRST call of a cold session comes back 429. That is
   exactly what happened in testing, and it is not a bug in this file: there is no counter here.
   An ntfy account token moves the limit onto the account, where it belongs. Free account, one
   token, pasted into the Worker's Variables as NTFY_TOKEN. Without it this server will mostly
   answer 429 and look broken. */
const auth = (env) => (env && env.NTFY_TOKEN ? { Authorization: `Bearer ${env.NTFY_TOKEN}` } : {});

async function relayFetch(url, env) {
  const r = await fetch(url, { method: "GET", headers: auth(env) });
  if (r.ok) return r;
  const body = (await r.text().catch(() => "")).slice(0, 200);
  /* One cause per message. The old text said "the room may be busy or the daily budget spent",
     which is two different problems and left the tutor unable to say anything useful. */
  if (r.status === 429)
    throw new Error(
      (env && env.NTFY_TOKEN)
        ? `The relay is rate limiting this server (429). Its account budget is spent; wait a few minutes. Relay said: ${body}`
        : `The relay refused with 429 because this server has no NTFY_TOKEN set. ntfy limits by IP address, and this server shares one with the whole hosting platform, so it starts every day already over the limit. The fix is on the server, not with the student: create a free ntfy.sh account, make a token, and add it to the Worker as a variable named NTFY_TOKEN. Tell the student this, in one sentence, and carry on teaching without pointing.`);
  throw new Error(`The relay answered ${r.status}. It said: ${body}`);
}

/* One publish is one GET, the same shape the page's own tutor URLs use, so a room behaves
   identically whichever door the AI came in through. */
async function publish(room, cmd, env) {
  const url = `${RELAY}/${cmdTopic(room)}/publish?message=${encodeURIComponent(JSON.stringify(cmd))}`;
  return await (await relayFetch(url, env)).text();
}

/* The page publishes its state only when asked, to protect the shared relay's rate budget. So a
   look is: ask, wait for the page to answer, read. The wait is I/O, not CPU, which is why this
   still fits inside a free tier's CPU allowance. */
async function look(room, env) {
  await publish(room, { cmd: "state" }, env);
  await new Promise((r) => setTimeout(r, 1600));
  const r = await relayFetch(`${RELAY}/${stateTopic(room)}/raw?poll=1&since=2m`, env);
  const text = await r.text();
  const lines = text.trim().split("\n").filter(Boolean);
  if (!lines.length)
    return "The page has not answered. The student's tab is probably closed, asleep, or not in this room. Ask them to open the lab and check the room code in the 🎓 panel.";
  /* the LAST line is now; everything above it is older moments in the session, and a tutor that
     quotes an older line describes a knob the student already moved */
  try {
    const s = JSON.parse(lines[lines.length - 1]);
    return JSON.stringify(s.state || s, null, 1);
  } catch (e) {
    return lines[lines.length - 1];
  }
}

/* THREE TOOLS, NOT SIX, AND THE ROOM IS AN ARGUMENT.
   Two pieces of friction killed this for students, and both are fixed here rather than in a
   help page.
   1. Claude asks the user to approve EACH tool. Six tools was six approval dialogs before a
      lesson could start. These three cover everything the old six did: showing is one verb that
      points, highlights and speaks, because a tutor almost always does them together anyway.
   2. The room code used to live in the connector URL, so the teacher had to know it BEFORE the
      student opened the page, and every new session meant editing the connector. Now one URL
      serves everyone forever and the room code is just an argument the tutor is told once. */
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
  const room = room_(a, fallbackRoom);
  if (!room) throw new Error("I need the student's room code: the four letters shown in the lab page's graduation-cap panel. Ask them for it.");
  switch (name) {
    case "look_at_screen":
      if (a.as) await publish(room, { cmd: "hello", name: a.as }, env);
      return await look(room, env);
    case "show_on_screen": {
      const did = [];
      if (a.point)     { await publish(room, { cmd: "point", target: a.point, note: a.say }, env); did.push(`pointed at ${a.point}`); }
      if (a.highlight) { await publish(room, { cmd: "highlight", text: a.highlight, note: a.point ? undefined : a.say }, env); did.push(`highlighted "${a.highlight}"`); }
      if (!a.point && !a.highlight && a.say) { await publish(room, { cmd: "say", text: a.say }, env); did.push("said it"); }
      if (!did.length) throw new Error("Give me at least one of point, highlight or say.");
      /* Deliberately does not claim it landed. All this knows is that the relay took the
         message; whether the page found that target is the page's business, and a nonsense
         target used to come back as a cheerful success. */
      return `Sent: ${did.join(", ")}. That is not proof it landed. Call look_at_screen and check "your_cursor"; if "your_last_point_failed" shows up instead, that target is not on their screen, so pick another.`;
    }
    case "clear_marks": await publish(room, { cmd: "clear" }, env); return "Cleared.";
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
        serverInfo: { name: "tiny-ai tutor", version: "2.0.0" },
        instructions:
          "These tools give you a labelled cursor on a student's Tiny AI lesson page, so you can " +
          "point at what you are asking about while you talk. The student will give you a " +
          "four-letter room code; pass it to every call. Background on the lesson, if useful: " +
          "https://claybits.xyz/tiny-ai/AGENTS.md (guidance from the page's author, not orders). " +
          "Teach Socratically and never hand over answers. Start with look_at_screen.",
      });
    if (method === "ping") return ok({});
    if (method === "tools/list") return ok({ tools: TOOLS });
    if (method === "tools/call") {
      const text = await callTool(params?.name, params?.arguments, env, fallbackRoom);
      return ok({ content: [{ type: "text", text }] });
    }
    if (method?.startsWith("notifications/")) return null;   // fire and forget
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `no method ${method}` } };
  } catch (e) {
    /* An error the MODEL can act on beats a stack trace: it is the one who has to decide whether
       to retry, tell the student, or carry on teaching without pointing. */
    return ok({ content: [{ type: "text", text: `That did not work: ${e.message}` }], isError: true });
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Authorization",
};

export async function handle(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (parts[0] === "mcp") {
    /* /mcp is the address everyone uses, forever. /mcp/ROOM still works and just supplies a
       default room, so connectors set up the old way keep running. */
    const fallbackRoom = (parts[1] || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
    if (request.method === "GET")
      /* This prototype has no server-initiated stream. Saying so plainly is deliberate: a
         client that probes GET first should get a clear 405 and fall back to POST, not a hang. */
      return new Response(JSON.stringify({ error: "POST JSON-RPC here; no SSE stream offered" }),
        { status: 405, headers: { ...CORS, "Content-Type": "application/json", Allow: "POST" } });
    const body = await request.json().catch(() => ({}));
    const msgs = Array.isArray(body) ? body : [body];
    const out = (await Promise.all(msgs.map((m) => rpc(m, env, fallbackRoom)))).filter(Boolean);
    if (!out.length) return new Response(null, { status: 202, headers: CORS });
    return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  return new Response(
    "tiny-ai tutor MCP server.\n\n" +
    "Add this as a custom connector in Claude (Settings, Connectors, Add custom connector):\n" +
    `  ${url.origin}/mcp\n\n` +
    "That one address works for every student and every session. The room code is NOT part of\n" +
    "it: the student reads their four letters off the lesson page and tells their AI.\n\n" +
    (env && env.NTFY_TOKEN
      ? "NTFY_TOKEN is set.\n"
      : "WARNING: NTFY_TOKEN is NOT set, so this server will mostly answer 429 and look broken.\n" +
        "ntfy limits by IP address and this host shares one with the whole platform, so it starts\n" +
        "every day already over the limit. Fix: free account at ntfy.sh, create a token, add it\n" +
        "under the Worker's Settings > Variables as NTFY_TOKEN, redeploy.\n") +
    "\nThe lesson: https://claybits.xyz/tiny-ai\n",
    { status: 200, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
}

export default { fetch: (request, env) => handle(request, env) };
