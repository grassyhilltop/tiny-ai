// Can a REAL mouse actually hit the things this feature asks people to click?
//   bin/probe/fixture.sh
//   node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/" 3000 out.png bin/probe/tutor-click.js
//
// This exists because the cursor, the bubble's close button and the invite button all shipped
// unclickable and every probe passed. `#aitLayer *{pointer-events:none}` carries ID
// specificity, so it beat every `.class{pointer-events:auto}` written after it, and
// element.dispatchEvent(new MouseEvent("click")) does not care: it skips hit-testing and
// invokes the handler directly, so it reports success on an element no user can reach.
//
// elementFromPoint is the honest test: it answers "what would the mouse land on here".
(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 240 && typeof window.AITutor === "undefined"; i++) await w(500);
  await w(3000);                                   // cursor drifts into its seat

  const r = {};
  const cur = document.querySelector(".ait-cursor");
  const owns = (el) => !!(el && cur.contains(el));
  const hit = (x, y) => document.elementFromPoint(Math.round(x), Math.round(y));

  const svg = cur.querySelector("svg").getBoundingClientRect();
  const flag = cur.querySelector(".ait-flag").getBoundingClientRect();
  r.arrowClickable = owns(hit(svg.left + svg.width / 2, svg.top + svg.height / 2));
  r.flagClickable = owns(hit(flag.left + flag.width / 2, flag.top + flag.height / 2));
  // the pad is the point: a near miss on the arrow must still land on the tutor
  r.nearMissClickable = owns(hit(svg.left - 8, svg.top - 6));

  // nothing plays on load any more: the cursor sits, no bubble, no tour
  r.silentOnLoad = !document.querySelector(".ait-bubble");
  r.noStickyIntroState = (() => { try { return localStorage.getItem("ait_intro_n") === null; }
                                  catch (e) { return true; } })();

  // clicking it starts the tour (this is now the ONLY way the tour ever runs)
  cur.click();
  await w(2500);
  r.clickStartsTour = !!document.querySelector(".ait-bubble");

  // the bubble and its controls have to be reachable too
  const bub = document.querySelector(".ait-bubble");
  if (bub) {
    const bb = bub.getBoundingClientRect();
    const x = bub.querySelector(".ait-x").getBoundingClientRect();
    r.bubbleClickable = !!(bub.contains(hit(bb.left + 30, bb.top + bb.height - 10)));
    r.closeClickable = !!(bub.contains(hit(x.left + x.width / 2, x.top + x.height / 2)));
    // whitespace: how much of the widest line is empty? a max-content box that wrapped badly
    // leaves a shelf of dead space on the right
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:" +
      getComputedStyle(bub).font;
    probe.textContent = bub.textContent.replace(/×/g, "").trim();
    document.body.appendChild(probe);
    r.bubbleWidth = Math.round(bb.width);
    probe.remove();
  }

  // scrolled into the lesson, the corner cursor must answer a click with the help bubble
  document.getElementById("stagecard1").scrollIntoView({ block: "center" });
  await w(4000);
  const c2 = cur.getBoundingClientRect();
  r.cornerClickable = owns(hit(c2.left + c2.width / 2, c2.top + c2.height / 2));
  cur.click();
  await w(1200);
  const help = document.querySelector(".ait-bubble");
  r.cornerGivesHelp = !!(help && help.querySelector(".ait-act") && help.querySelector(".ait-steps"));
  if (help) {
    const hb = help.getBoundingClientRect();
    r.helpInViewport = hb.left >= 0 && hb.top >= 0 && hb.right <= innerWidth && hb.bottom <= innerHeight;
    const act = help.querySelector(".ait-act").getBoundingClientRect();
    r.inviteButtonClickable = !!(help.contains(hit(act.left + act.width / 2, act.top + act.height / 2)));
  }

  r.PASS = r.arrowClickable && r.flagClickable && r.nearMissClickable && r.silentOnLoad &&
           r.clickStartsTour && r.bubbleClickable && r.closeClickable && r.cornerClickable &&
           r.cornerGivesHelp && r.helpInViewport && r.inviteButtonClickable;
  return r;
})()
