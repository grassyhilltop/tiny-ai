// The whole live loop, played exactly the way the claude.ai client plays it: fetch ONLY the
// finished URLs that appear in the invite, never build one. Run against the local relay stub
// so it costs nobody's quota:
//
//   node bin/probe/relay-stub.mjs &
//   bin/probe/fixture.sh
//   node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/?relay=http://localhost:8788" \
//        3000 out.png bin/probe/live-loop.js
//
// What it proves, in order: the page joins the room, publishes state a tutor can READ as
// plain text, obeys hello, obeys a pointing command from the menu, and refreshes state on
// request. If this passes and the real thing fails, the difference is the relay, not the lab.
(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 240 && typeof window.AITutor === "undefined"; i++) await w(500);
  await w(2000);

  const r = {};
  const inv = AITutor.invite();
  const RELAY = new URLSearchParams(location.search).get("relay");
  r.relay = RELAY;

  // pull the finished URLs out of the invite, the way a model reading it would
  const urls = inv.match(new RegExp(RELAY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\S+", "g")) || [];
  const helloUrl = urls.find(u => u.includes("%22hello%22"));
  const stateUrl = urls.find(u => u.includes("%22state%22"));
  const readUrl = urls.find(u => u.includes("/raw?poll=1"));
  const pointDose = urls.find(u => u.includes("%22dose%22"));
  r.foundUrls = { hello: !!helloUrl, stateCmd: !!stateUrl, reader: !!readUrl, pointDose: !!pointDose };

  // the student arms the session (this is the "copy the invite" click)
  AITutor.connect();
  for (let i = 0; i < 60 && !AITutor._internals.live.on; i++) await w(200);
  r.pageJoinedRoom = AITutor._internals.live.on === true;
  await w(1500);

  // 1. the tutor reads the room before saying anything
  const first = await (await fetch(readUrl)).text();
  r.readsAsText = first.length > 0;
  r.readIsPlain = !/^\s*\{"id"/.test(first);            // /raw, not /json
  r.firstReadHasState = first.includes("\"section\"") || first.includes("\"stage\"");

  // 2. hello, fetched verbatim
  await fetch(helloUrl);
  for (let i = 0; i < 30 && !document.querySelector(".ait-badge.ait-live"); i++) await w(200);
  r.helloLanded = !!document.querySelector(".ait-badge.ait-live");

  // 3. point at the dose dial, fetched verbatim from the menu
  const before = { x: AITutor._internals.cursorPos.x, y: AITutor._internals.cursorPos.y };
  await fetch(pointDose);
  await w(2200);
  const after = AITutor._internals.cursorPos;
  r.pointMovedCursor = Math.hypot(after.x - before.x, after.y - before.y) > 20;

  // 4. ask for fresh state, then read it
  await fetch(stateUrl);
  await w(1800);
  const second = await (await fetch(readUrl)).text();
  r.stateRefreshed = second.length > first.length;
  r.stateMentionsSection = /"section"\s*:/.test(second);
  r.stateIsSmall = second.split("\n").filter(Boolean).slice(-1)[0].length < 700;

  r.PASS = r.foundUrls.hello && r.foundUrls.stateCmd && r.foundUrls.reader && r.foundUrls.pointDose &&
           r.pageJoinedRoom && r.readsAsText && r.readIsPlain && r.firstReadHasState &&
           r.helloLanded && r.pointMovedCursor && r.stateRefreshed && r.stateMentionsSection;
  return r;
})()
