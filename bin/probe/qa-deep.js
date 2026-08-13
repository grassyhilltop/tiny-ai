/* Deep QA: walks sections 1 to 8 as a student, exercises the 3D scene, measures every knob's
   drag sensitivity against its intended value, and audits the animation loops for the CPU peg
   that has bitten twice. Run on any substantive change, and whenever a QA run is asked for.

     node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 14000 out.png bin/probe/qa-deep.js

   Prints a tick or a cross per row. Read it alongside a screenshot: this cannot see a control
   sitting outside its card, and that class of bug has shipped more than once. See QA.md.
*/
(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const R = {}; const ok = (k, v, note) => { R[k] = (v ? "OK  " : "XX  ") + (note || ""); return v; };
  const sc = () => BABYLON.Engine.Instances[0].scenes[0];
  await w(1500);

  /* ---------- sections 1 to 8 ---------- */
  // 1: step 1 dials move the line, reset restores.
  // `#plot0 path` is NOT the model line: axes() emits an arrowhead <marker> containing a <path>,
  // and it lands earlier in the innerHTML. Only the model line is clipped, so key off that.
  const d0 = () => document.querySelector("#plot0 path[clip-path]")?.getAttribute("d") || "";
  const a0 = d0(); P0.m = 3.4; step0Changed(); await w(80);
  ok("s1 step-1 dials move the line", d0() !== a0);
  document.querySelector("#knobs0 .knobreset").click(); await w(80);
  ok("s1 reset restores", Math.abs(P0.m - 2.0) < 0.01);

  // 2: add a bend, then the net card and its mini graph
  const nx = document.getElementById("nextStage");
  if (nx && nx.offsetParent !== null) { nx.click(); await w(400); }
  ok("s2 stage advanced past a straight line", stage >= 2, "stage=" + stage);
  ["netcard", "codoncard", "bpcard"].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = "block"; });
  buildKnobs(); drawAll(); await w(300);
  ok("s2 net diagram rendered", (document.getElementById("net")?.innerHTML || "").length > 200);
  ok("s2 mini graph under the machine draws", (document.getElementById("plot3")?.innerHTML || "").length > 200);

  // wiggling a weight in the net card opens the black box
  netAutoOpened = false;
  maybeOpenBoxFromNet(document.querySelector("#knobs3 canvas") || document.getElementById("net"));
  await w(1500);
  ok("s2 wiggling a weight opens the black box", !!bbOpen);
  const mon = sc().getMeshByName("mon");
  const studTop = Math.max(...sc().meshes.filter(m => m.metadata && m.metadata.bb
      && /^(yellow|blue|red|green)$/.test(m.metadata.colorKey || ""))
      .map(m => m.getBoundingInfo().boundingBox.maximumWorld.y));
  const monBottom = mon.getBoundingInfo().boundingBox.minimumWorld.y;
  ok("s2 monitor clears the neurons", monBottom > studTop + 0.2,
     "gap " + (monBottom - studTop).toFixed(2));
  document.getElementById("bbBack").click(); await w(1400);
  ok("s2 closing the box restores the monitor", !bbOpen && Math.abs(mon.position.y - 3.26) < 0.1);

  // codon panel
  ok("s2 codon panel handshook", typeof codonReady !== "undefined" && codonReady);

  // 3: the automatic hand. The step does not land on click: bpWalk() lights the code lines one
  // BP_DWELL apart and only then trains, so this has to wait out the walk, not a fixed 600ms.
  const steps0 = typeof stepCount !== "undefined" ? stepCount : 0;
  document.getElementById("stepBtn").click();
  for (let i = 0; i < 20 && stepCount === steps0; i++) await w(200);
  ok("s3 one backprop step moves the knobs", stepCount > steps0);
  document.getElementById("runBtn").click();
  for (let i = 0; i < 60 && document.getElementById("runBtn").textContent === "Stop"; i++) await w(500);
  const stars = starsFor(loss());
  ok("s3 auto-train converges", stars >= 4, stars + " stars, loss " + loss().toFixed(5));

  // 4: the tiny test. Passing RESETS qStreak to 0 and flips the button to "Play again", so
  // qStreak >= 3 is never true by the time you can read it. Watch the button, not the counter.
  const quizPassed = () => document.getElementById("quizGo").textContent === "Play again";
  document.getElementById("quizGo").click(); await w(200);
  let passed = false;
  for (let i = 0; i < 8 && !passed; i++) {
    if (qDose == null) break;
    document.getElementById("quizIn").value = Math.round(Math.max(0, Math.min(1, f(qDose))) * 100);
    document.getElementById("quizGo").click(); await w(300);
    passed = quizPassed();
  }
  ok("s4 tiny test passable from your own line", passed);

  // 5, 6: the two reporting controls, with the network stubbed
  const rf = window.fetch;
  window.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}") });
  document.getElementById("kcheck").value = "QA sentence";
  document.getElementById("kcheckSave").click(); await w(500);
  ok("s5 knowledge check saves", /Saved/i.test(document.getElementById("kcheckMsg").textContent));
  npsVal = 9; npsTouched = true; drawNps();
  document.getElementById("npsText").value = "QA text";
  document.getElementById("npsSend").click(); await w(500);
  ok("s6 feedback sends", /thank you|Got it/i.test(document.getElementById("npsThanks").textContent));
  window.fetch = rf;

  // 7, 8
  ok("s7 wrap-up renders with the 4 Ds", /4 ?Ds/i.test(document.getElementById("wrapcard").textContent));
  ok("s8 bonus card present", !!document.getElementById("bonuscard"));

  /* ---------- the 3D scene ---------- */
  const dl = document.getElementById("doseLabel").textContent;
  doseFrac = 0.62; updateDose(); await w(100);
  ok("3D dose dial drives the label and the bar", document.getElementById("doseLabel").textContent !== dl
     && +document.getElementById("fxpct").textContent > 0);
  const dots = DATA.length;
  document.getElementById("giveBtn").click(); await w(700);
  ok("3D give the dose adds a data point", DATA.length > dots);
  ok("3D actual result is filled in", document.getElementById("fxTruthV").textContent !== "--");

  /* ---------- knob sensitivity, the thing that keeps regressing ---------- */
  const feel = (canvas, px) => new Promise(async res => {
    const b = canvas.getBoundingClientRect();
    const get = () => canvas.__qaGet();
    const v0 = get();
    canvas.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: b.left + 20, clientY: b.top + 20 }));
    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: b.left + 20, clientY: b.top + 20 - px }));
    await w(30);
    const v1 = get();
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    res(Math.abs(v1 - v0));
  });
  // Expose a getter and a parker per knob without touching the page's own code. PARK FIRST, ALWAYS:
  // a drag that runs into the end of the range moves by however much was left, so measuring from
  // wherever the last check happened to leave the dial reports a smaller throw than the knob has.
  // Worse, the 10px nudge then reads 0.00 and passes a "nudges are fine" test while pinned at max.
  const tkKey = typeof stageKnobs === "function" ? stageKnobs()[0] : null;
  const tk = document.querySelector("#knobs canvas.knobc");
  if (tk) { tk.__qaGet = () => P[tkKey]; tk.__qaPark = v => { P[tkKey] = v; drawAll(); }; }
  const dk = document.getElementById("doseKnob");
  dk.__qaGet = () => doseFrac; dk.__qaPark = v => { doseFrac = v; updateDose(); };
  const nk = document.getElementById("npsKnob");
  nk.__qaGet = () => npsVal; nk.__qaPark = v => { npsVal = v; drawNps(); };
  const feelFrom = async (c, px, start) => { c.__qaPark(start); await w(60); return feel(c, px); };

  if (tk) {
    const full = await feelFrom(tk, 150, -4);
    ok("knob feel: textbook reaches range in 150px", full > 7.5, "moved " + full.toFixed(2) + " of 8");
    const fine = await feelFrom(tk, 10, 0);
    ok("knob feel: textbook 10px nudge is fine but real", fine > 0.02 && fine < 0.4, "moved " + fine.toFixed(2));
  }
  { const full = await feelFrom(dk, 150, 0); ok("knob feel: dose reaches range in 150px", full > 0.95, "moved " + full.toFixed(2) + " of 1"); }
  { const fine = await feelFrom(dk, 10, 0.5); ok("knob feel: dose 10px nudge is fine but real", fine > 0.003 && fine < 0.06, "moved " + fine.toFixed(3)); }
  { const full = await feelFrom(nk, 80, 0); ok("knob feel: NPS reaches 10 in 80px", full >= 9, "moved " + full); }
  ok("knob cursor is the up/down arrow", getComputedStyle(document.getElementById("doseKnob")).cursor === "ns-resize");

  // the row must not shift as digits change width
  if (tk) {
    const row = document.getElementById("knobs"), ks = row.querySelectorAll(".knob");
    const x0 = ks[1].getBoundingClientRect().left;
    P[stageKnobs()[0]] = -3.999; drawAll(); await w(60);
    ok("knob row does not shift when digits widen", Math.abs(ks[1].getBoundingClientRect().left - x0) < 1);
  }

  /* ---------- layout: controls inside their cards ---------- */
  let strays = [];
  document.querySelectorAll(".stagecard").forEach(card => {
    if (card.offsetParent === null) return;
    const cr = card.getBoundingClientRect();
    card.querySelectorAll("button, canvas, svg, input, textarea").forEach(el => {
      const r = el.getBoundingClientRect();
      const over = Math.round(Math.max(r.right - cr.right, cr.left - r.left));
      if (r.width && over > 2)
        strays.push((el.id || el.className || el.tagName) + " in #" + card.id + " by " + over + "px");
    });
  });
  ok("layout: no control escapes its card", strays.length === 0, strays.slice(0, 4).join(", "));
  ok("layout: no horizontal page overflow", document.documentElement.scrollWidth <= innerWidth + 1);

  /* ---------- perf ---------- */
  let dose = 0, all = 0, screen = 0;
  const oD = window.updateDose; window.updateDose = function () { dose++; return oD.apply(this, arguments); };
  const oA = window.drawAll; window.drawAll = function () { all++; return oA.apply(this, arguments); };
  const oS = window.drawScreen; if (oS) window.drawScreen = function () { screen++; return oS.apply(this, arguments); };
  stopDoseWiggle(); stopCodonDemo(true);
  await w(5000);
  window.updateDose = oD; window.drawAll = oA; if (oS) window.drawScreen = oS;
  ok("perf: idle after interaction is silent", dose === 0 && all === 0 && screen === 0,
     `updateDose ${dose} drawAll ${all} drawScreen ${screen} in 5s`);
  ok("perf: attract timers cleared", doseWiggleTimer === null && codonDemoTimer === null);

  R.CROSSES = Object.entries(R).filter(([, v]) => String(v).startsWith("XX")).map(([k]) => k);
  R.SUMMARY = R.CROSSES.length ? R.CROSSES.length + " FAILED" : "all checks passed";
  return R;
})()
