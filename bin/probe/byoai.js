// Does the BYO-AI tutor layer work, from a fresh default state?
//   python3 -m http.server 8783   (from staging/)
//   node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 12000 out.png bin/probe/byoai.js
// Everything here goes through AITutor.exec — the same pipeline the paste box, the demo and
// the live room use, so green here means every transport has a working page side. The live
// section talks to the REAL public relay (ntfy.sh) and plays the AI's half with plain
// fetches, which is exactly what a chat AI's URL tool does; it needs the network.
(async () => {
  const r = {};
  const wait = ms => new Promise(res => setTimeout(res, ms));

  // deferred scripts (this layer included) run only after the Babylon CDN download; on a
  // cold profile that can take a while, so wait for readiness instead of trusting the
  // harness's fixed pre-wait
  for (let i = 0; i < 240 && typeof window.AITutor === "undefined"; i++) await wait(500);
  if (typeof window.AITutor === "undefined") return { fatal: "AITutor never loaded" };
  await wait(1000);                              // let buildUI settle

  r.cta = !!document.getElementById("aitBtn");
  r.badges = document.querySelectorAll("#aitBadges .ait-badge").length >= 2;
  r.brief = !!document.getElementById("aiTutorBrief");
  r.api = typeof AITutor === "object";
  // presence is the invite now: the cursor is on screen from load, parked by the badges
  r.cursorOnLoad = !!document.querySelector(".ait-cursor");
  r.room = AITutor.room();
  r.roomIsWellFormed = /^[A-Z0-9]{4,8}$/.test(r.room);
  // privacy: an organic visit neither stamps ?room= into the URL nor touches the relay;
  // the room reaches the URL only when an invite or room link is copied
  r.roomNotInUrlBeforeOptIn = new URLSearchParams(location.search).get("room") === null;
  const inv = AITutor.invite();
  r.inviteCarriesRoom = inv.includes(r.room) && inv.includes("ntfy.sh") && inv.includes("AGENTS.md");
  r.noNetworkUntilOptIn = AITutor._internals.live.on === false;
  // the review round's regressions, pinned: a knob nobody unlocked errors instead of
  // silently pointing at the dose dial, and a malformed cursor command cannot NaN-poison
  r.unknownKnobErrs = AITutor.exec({ cmd: "point", target: "knob:zz" }).ok === false;
  r.badCursorRejected = AITutor.exec({ cmd: "cursor" }).ok === false;
  r.step1KnobResolves = !!AITutor._internals.resolveTarget("knob:m");

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

  // the snapshot must read the live lab, not a copy
  const snap = AITutor.state();
  r.snapshotSeesLab = typeof snap.stage === "number" && !!snap.step1_model && snap.room === r.room;

  // live round trip against the real relay, playing the AI with plain fetches:
  //   subscribe -> GET-publish a command -> the page executes it -> the page's own state
  //   shows up on the state topic for the "AI" to poll
  try {
    AITutor.connect();
    // the public relay's SSE open is usually instant and occasionally takes many seconds;
    // the page has its own watchdog, the probe just waits it out
    for (let i = 0; i < 100 && !AITutor._internals.live.on; i++) await wait(250);
    r.liveSubscribed = AITutor._internals.live.on === true;
    const tC = AITutor._internals.topic("c"), tS = AITutor._internals.topic("s");
    const cmd = encodeURIComponent(JSON.stringify({ cmd: "say", text: "probe says hi" }));
    await fetch("https://ntfy.sh/" + tC + "/publish?message=" + cmd);
    // relay hop latency varies from sub-second to many seconds; the bubble lingers ~9s,
    // so poll rather than sampling one instant
    for (let i = 0; i < 24 && !r.liveCommandLanded; i++) {
      await wait(500);
      const bub = document.querySelector(".ait-bubble");
      r.liveCommandLanded = !!bub && bub.textContent.includes("probe says hi");
    }
    r.liveBadgeLit = !!document.querySelector(".ait-badge.ait-live");
    // the page publishes state on join; ntfy commits its cache in ~2s batches, so poll-loop
    for (let i = 0; i < 6 && !r.liveStateReadable; i++) {
      await wait(2500);
      // cache-bust with _ (ignored by ntfy); &t= is NOT junk there, it silently empties the poll
      const poll = await (await fetch("https://ntfy.sh/" + tS + "/json?poll=1&since=10m&_=" + Date.now())).text();
      r.liveStateReadable = poll.includes("shared_model") || poll.includes('\\"stage\\"');
    }
  } catch (e) { r.liveError = String(e); }

  // the section-5 handoff (live: routed to the AI; offline: a copyable request)
  const kc = document.getElementById("kcheck");
  kc.value = "probe sentence, training nudges the knobs to shrink the error.";
  document.getElementById("kcheckSave").click();
  await wait(600);
  r.kcheckNudge = document.getElementById("aitKcheckNudge")?.textContent || null;

  return r;   // expect: every boolean true, cursorLabel starting "Claude", kcheckNudge non-null
})()
