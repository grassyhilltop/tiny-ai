/* THE PATH BEING DEMOED, end to end: an MCP tools/call reaching the student's page.

   Text mode and voice mode disagree about which door is open, but both end up here: the tool
   call lands on the Worker, the Worker publishes into the room's Durable Object, and the page's
   open stream carries it to the cursor. Everything in between has been rewritten twice for the
   duration budget, so this asserts that the rewrite did not quietly break the door that works.

     node bin/probe/worker-do-local.mjs 8817 &          (no FAST: a lesson must not be reaped)
     python3 -m http.server 8783 --directory staging &
     node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 30000 out.png bin/probe/mcp-path.js
*/
(async () => {
  const RELAY = "http://localhost:8881";
  const r = {};
  const wait = ms => new Promise(res => setTimeout(res, ms));
  for (let i = 0; i < 240 && typeof window.AITutor === "undefined"; i++) await wait(500);
  if (typeof window.AITutor === "undefined") return { fatal: "AITutor never loaded" };
  await wait(800);

  AITutor._internals.setRelays([RELAY]);
  AITutor.connect();
  for (let i = 0; i < 40 && !(AITutor._internals.streamKeys().length && AITutor.session().live); i++) await wait(250);
  const room = AITutor.room();
  r.roomLive = AITutor.session().live === true;

  /* speak MCP at it exactly as a connector does: JSON-RPC over the Streamable HTTP endpoint */
  const rpc = (method, params, id) => fetch(RELAY + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }).then(res => res.text());

  const list = await rpc("tools/list", {}, 1);
  r.toolsAdvertised = ["look_at_screen", "show_on_screen", "clear_marks"].every(n => list.includes(n));

  /* relayState, not the console snapshot: your_cursor is only on the former, and reading the
     wrong one compares undefined with undefined and passes for the wrong reason */
  const cursor = () => AITutor._internals.relayState().your_cursor;
  const before = cursor();
  const said = await rpc("tools/call", { name: "show_on_screen",
    arguments: { room: room, point: "graph", say: "What happens to the line here?" } }, 2);
  for (let i = 0; i < 40 && cursor() === before; i++) await wait(250);
  r.pointLanded = cursor() !== before;
  r.pointedAt = cursor();
  r.bubbleShown = !!document.querySelector(".ait-bubble");
  r.toolConfirmed = /graph/i.test(said);

  /* and the read back, which is the half a tutor uses to check its own work */
  const seen = await rpc("tools/call", { name: "look_at_screen", arguments: { room: room, as: "QA" } }, 3);
  r.lookSawTheLab = /dose_mg|section|your_cursor/i.test(seen);
  r.lookIsNotNobodyHome = !/has not answered/.test(seen);
  /* A READ THE TUTOR ASKED FOR CARRIES THE VOCABULARY. It has never seen this page's HTML, so
     without this it can neither name a target nor write a selector and is reduced to guessing
     from the short list in the tool description. */
  r.lookOffersTargets = /point_at/.test(seen) && /Save my answer/.test(seen);

  /* and the words actually reach the cursor over MCP, not just in the console */
  const was = cursor();
  await rpc("tools/call", { name: "show_on_screen",
    arguments: { room: room, point: "Save my answer" } }, 4);
  for (let i = 0; i < 40 && cursor() === was; i++) await wait(250);
  r.pointedByWords = cursor() !== was;
  r.wordsLandedOn = cursor();

  r.PASS = r.roomLive && r.toolsAdvertised && r.pointLanded && r.bubbleShown && r.toolConfirmed &&
           r.lookSawTheLab && r.lookIsNotNobodyHome && r.lookOffersTargets && r.pointedByWords;
  return r;
})()
