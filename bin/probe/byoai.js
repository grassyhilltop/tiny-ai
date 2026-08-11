// Does the BYO-AI tutor layer work, from a fresh default state?
//   python3 -m http.server 8783   (from staging/)
//   node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 12000 out.png bin/probe/byoai.js
// Everything here goes through AITutor.exec — the same pipeline the paste box, the demo and
// the live MCP bridge use, so green here means all three transports have a working page side.
(async () => {
  const r = {};
  const wait = ms => new Promise(res => setTimeout(res, ms));

  r.cta = !!document.getElementById("aitBtn");
  r.brief = !!document.getElementById("aiTutorBrief");
  r.api = typeof AITutor === "object";
  // presence is lazy: no cursor, no highlight, nothing on screen until a command arrives
  r.inertUntilAsked = !document.querySelector(".ait-cursor");

  r.hello = AITutor.exec({ cmd: "hello", name: "Claude" }).ok;
  r.point = AITutor.exec({ cmd: "point", target: "dose", note: "what does this dial change?" }).ok;
  await wait(900);
  r.cursorLabel = document.querySelector(".ait-cursor .ait-flag")?.textContent;
  r.highlight = AITutor.exec({ cmd: "highlight",
    text: "teach the machine in the black box to pick the right dose" }).ok;
  await wait(200);
  r.caret = !!document.querySelector(".ait-caret");
  r.marked = (CSS.highlights && CSS.highlights.has("ait-hl")) || !!document.querySelector(".ait-mark");
  r.badTargetFailsSoft = AITutor.exec({ cmd: "point", target: "#nope" }).ok === false;
  r.clear = AITutor.exec({ cmd: "clear" }).ok && !document.querySelector(".ait-caret");

  // the snapshot must read the live lab, not a copy: turn the dose knob's state and re-read
  const before = AITutor.state();
  r.snapshotSeesLab = typeof before.stage === "number" && !!before.step1_model;

  // the section-5 handoff (endpoints may be unreachable in a probe; the nudge is ours)
  const kc = document.getElementById("kcheck");
  kc.value = "probe sentence — training nudges the knobs to shrink the error.";
  document.getElementById("kcheckSave").click();
  await wait(600);
  r.kcheckNudge = document.getElementById("aitKcheckNudge")?.textContent || null;

  return r;   // expect: every boolean true, cursorLabel "Claude · AI", kcheckNudge non-null
})()
