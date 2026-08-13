/* Smoke QA: the five things that must survive or a reader cannot finish the lab, plus the
   cheap regression traps. Run before every push to main. See QA.md.

     node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 12000 docs/qa-reference/home-1400.png bin/probe/qa-smoke.js

   Every line prints PASS or FAIL. A FAIL is a stop-the-push. Note that this checks BEHAVIOUR,
   not appearance: look at the screenshot too, because the worst bugs here all passed assertions.
*/
(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const out = {}; const P_ = (k, v) => { out[k] = v ? "PASS" : "FAIL"; return v; };
  await w(1200);

  // --- the page is actually up ---
  P_("1. babylon scene built", typeof BABYLON !== "undefined"
      && BABYLON.Engine.Instances[0].scenes[0].meshes.length > 100);
  P_("2. reading column rendered", !!document.querySelector(".challengeline")
      && !!document.getElementById("preSurvey").firstChild);
  P_("3. no horizontal overflow", document.documentElement.scrollWidth <= innerWidth + 1);

  // --- 1. a knob moves the line ---
  // Only the model line is clipped. Plain `#plot0 path` picks up the arrowhead <marker> that
  // axes() writes into <defs>, which of course never changes, so the check silently fails.
  const knob = document.querySelector("#knobs0 canvas.knobc") || document.querySelector("#knobs canvas.knobc");
  const line = () => document.querySelector("#plot0 path[clip-path], #plot path[clip-path]")?.getAttribute("d") || "";
  const before = line();
  P0.m = 3.2; if (typeof step0Changed === "function") step0Changed();
  if (typeof drawAll === "function") drawAll();
  await w(120);
  const after = line();
  P_("4. turning a knob redraws the graph", !!knob && before !== after && after.length > 20);

  // --- 2. auto-train converges from here ---
  document.getElementById("runBtn").click();
  for (let i = 0; i < 60 && document.getElementById("runBtn").textContent === "Stop"; i++) await w(500);
  const stars = starsFor(loss());
  P_("5. auto-train converges (>=4 stars)", stars >= 4);

  // --- 3. the tiny test can be passed ---
  // Passing zeroes qStreak and flips the button to "Play again" in the same handler, so reading
  // qStreak afterwards always sees 0. Watch the button.
  const go = document.getElementById("quizGo"), input = document.getElementById("quizIn");
  go.click(); await w(200);
  let passed = false;
  for (let i = 0; i < 8 && !passed; i++) {
    if (qDose == null) break;
    input.value = Math.round(Math.max(0, Math.min(1, f(qDose))) * 100);  // read off your own line
    go.click(); await w(300);
    passed = go.textContent === "Play again";
  }
  P_("6. tiny test reaches 3 in a row", passed);

  // --- 4 and 5. the two things that report data ---
  const noNet = () => { const rf = window.fetch; window.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}") }); return () => window.fetch = rf; };
  let restore = noNet();
  document.getElementById("kcheck").value = "QA: training nudges the knobs until the guesses match.";
  document.getElementById("kcheckSave").click(); await w(600);
  P_("7. section 5 saves the sentence", /Saved/i.test(document.getElementById("kcheckMsg").textContent));

  npsVal = 9; npsTouched = true; if (typeof drawNps === "function") drawNps();
  document.getElementById("npsText").value = "QA feedback text";
  document.getElementById("npsSend").click(); await w(600);
  P_("8. section 6 sends the feedback", /thank you|Got it/i.test(document.getElementById("npsThanks").textContent));
  restore();

  out["stars after auto-train"] = stars;
  out["quiz passed"] = passed;
  out["FAILURES"] = Object.entries(out).filter(([, v]) => v === "FAIL").map(([k]) => k);
  return out;
})()
