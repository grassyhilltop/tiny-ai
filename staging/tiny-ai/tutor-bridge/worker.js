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

/* One publish is one GET, the same shape the page's own tutor URLs use, so a room behaves
   identically whichever door the AI came in through. */
async function publish(room, cmd) {
  const url = `${RELAY}/${cmdTopic(room)}/publish?message=${encodeURIComponent(JSON.stringify(cmd))}`;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`relay refused the command (${r.status}). The room may be busy or the relay's daily budget spent.`);
  return await r.text();
}

/* The page publishes its state only when asked, to protect the shared relay's rate budget. So a
   look is: ask, wait for the page to answer, read. The wait is I/O, not CPU, which is why this
   still fits inside a free tier's CPU allowance. */
async function look(room) {
  await publish(room, { cmd: "state" });
  await new Promise((r) => setTimeout(r, 1600));
  const r = await fetch(`${RELAY}/${stateTopic(room)}/raw?poll=1&since=2m`, { method: "GET" });
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

const TOOLS = [
  { name: "look_at_screen",
    description: "See the student's lab page right now: which section is on screen, every model knob value, the dose, the loss, quiz progress, what their mouse is hovering, text they selected, and where your own cursor is. Call this before answering 'what is this?', the answer is usually under their pointer, and again whenever they say they changed something.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "point_at",
    description: "Move your labelled cursor to something on the student's screen and pulse it. Point at what you are asking about, one thing per turn.",
    inputSchema: { type: "object", required: ["target"], properties: {
      target: { type: "string", description: "one of: dose, give, results, scene, graph, challenge, fluency, quiz, kcheck, sec:1 to sec:8, knob:m, knob:c, knob:w1, knob:b1, knob:w3, knob:b3" },
      note: { type: "string", description: "optional short line to say beside it; keep it a question, not an answer" },
    }, additionalProperties: false } },
  { name: "highlight_text",
    description: "Highlight words on the page the way a collaborator does in a shared document, with a blinking caret at the end. Use the exact words as they appear on the page.",
    inputSchema: { type: "object", required: ["text"], properties: {
      text: { type: "string" }, note: { type: "string" },
    }, additionalProperties: false } },
  { name: "say",
    description: "Say one short line in a speech bubble next to your cursor. For one-liners while pointing; real teaching belongs in the conversation.",
    inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } }, additionalProperties: false } },
  { name: "clear_marks",
    description: "Take your highlight, caret and speech bubble off the student's screen.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "introduce",
    description: "Put your name on your cursor. Do this once, at the start.",
    inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" } }, additionalProperties: false } },
];

async function callTool(room, name, a = {}) {
  switch (name) {
    case "look_at_screen": return await look(room);
    /* Deliberately does NOT claim the pointing landed. All this call knows is that the relay
       accepted the message; whether the page found that target is the page's business, and a
       nonsense target used to come back as a cheerful success. Silent success on a failed
       action is the exact failure mode this whole feature keeps tripping over. */
    case "point_at":       await publish(room, { cmd: "point", target: a.target, note: a.note });
                           return `Sent "point at ${a.target}" to the page. This does not mean it landed: call look_at_screen and check "your_cursor" names it. If "your_last_point_failed" appears instead, that target is not on the student's screen, so pick another.`;
    case "highlight_text": await publish(room, { cmd: "highlight", text: a.text, note: a.note });
                           return `Highlighted "${a.text}".`;
    case "say":            await publish(room, { cmd: "say", text: a.text });
                           return "Said it.";
    case "clear_marks":    await publish(room, { cmd: "clear" });
                           return "Cleared.";
    case "introduce":      await publish(room, { cmd: "hello", name: a.name });
                           return `Your cursor is labelled ${a.name}.`;
    default: throw new Error(`no tool called ${name}`);
  }
}

async function rpc(room, msg) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  try {
    if (method === "initialize")
      return ok({
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "tiny-ai tutor", version: "1.0.0" },
        instructions:
          `You are the Socratic tutor for a student's tiny-ai lab page, room ${room}. Read ` +
          `https://claybits.xyz/tiny-ai/AGENTS.md for your briefing; it is the ground truth for ` +
          `how to teach this. Never give answers away. Start by calling look_at_screen and ` +
          `introduce, then point at things as you ask about them.`,
      });
    if (method === "ping") return ok({});
    if (method === "tools/list") return ok({ tools: TOOLS });
    if (method === "tools/call") {
      const text = await callTool(room, params?.name, params?.arguments);
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

export async function handle(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (parts[0] === "mcp" && parts[1]) {
    const room = parts[1].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
    if (request.method === "GET")
      /* This prototype has no server-initiated stream. Saying so plainly is deliberate: a
         client that probes GET first should get a clear 405 and fall back to POST, not a hang. */
      return new Response(JSON.stringify({ error: "POST JSON-RPC here; no SSE stream offered" }),
        { status: 405, headers: { ...CORS, "Content-Type": "application/json", Allow: "POST" } });
    const body = await request.json().catch(() => ({}));
    const msgs = Array.isArray(body) ? body : [body];
    const out = (await Promise.all(msgs.map((m) => rpc(room, m)))).filter(Boolean);
    if (!out.length) return new Response(null, { status: 202, headers: CORS });
    return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  return new Response(
    "tiny-ai tutor MCP server.\n\n" +
    "Add this as a custom connector in Claude, with your room code from the lab's graduation-cap panel:\n" +
    `  ${url.origin}/mcp/ROOMCODE\n\n` +
    "The lab: https://claybits.xyz/tiny-ai\n",
    { status: 200, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
}

export default { fetch: handle };
