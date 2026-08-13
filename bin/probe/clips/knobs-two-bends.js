/* Stage 3, the textbook view: seven dials and the two-bend curve they make. Turning a dial moves
   the line, and that is the entire idea the lab is trying to land, so it is the one clip that has
   to be legible at README width.

   The dials are swept around a TRAINED solution rather than from scratch: the point is that each
   knob owns a part of the shape, which only reads if the shape is a good fit to begin with. */
(() => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  let base = null;

  let top0 = 0;

  window.__frames = 40;
  window.__settle = 90;

  window.__setup = async () => {
    document.documentElement.style.scrollBehavior = "auto";
    // Climb to stage 3, the seven-dial two-bend view. "Add a bend" only moves one stage at a
    // time and the next one does not unlock until the current fit is good, so this alternates
    // advancing and training. Trained by calling trainStep directly rather than by pressing
    // Auto-train and waiting on its interval: same answer, no 30 seconds of wall clock per
    // stage, and the same state every run.
    for (let s = 0; s < 3 && stage < 3; s++) {
      const nx = document.getElementById("nextStage");
      if (nx && nx.offsetParent !== null) { nx.click(); await w(450); }
      readyForTraining();          // this is what widens the dose range and collects the trials;
      await w(400);                // calling trainStep alone leaves the dots stuck below 5 mg
      for (let i = 0; i < 800; i++) trainStep(0.15);
      drawAll(); await w(250);
    }
    base = JSON.parse(JSON.stringify(P));
    /* Set scrollTop directly, and remember the absolute offset so every frame can re-assert it.
       scrollIntoView is no good here: the page sets scroll-behavior:smooth, so it animates, and
       an in-flight smooth scroll from the "Add a bend" button kept moving the page AFTER setup
       finished, which slid the card out from under the capture rectangle and produced forty
       frames of blank background. block:"center" is wrong for a second reason: this card is
       taller than the window, so centring it puts the graph above the top of the viewport and
       the rectangle comes out with a negative y, which captureScreenshot never answers. */
    const de = document.documentElement;
    de.style.scrollBehavior = "auto";
    top0 = de.scrollTop + document.getElementById("stagecard1").getBoundingClientRect().top - 8;
    de.scrollTop = top0;
    await w(400);

    // frame the argument: the score line down through the graph to the dials, nothing else
    const card = document.getElementById("stagecard1").getBoundingClientRect();
    const top  = document.getElementById("plot").getBoundingClientRect().top - 46;
    const bot  = document.getElementById("knobs").getBoundingClientRect().bottom + 8;
    window.__clip = { x: Math.round(card.left), y: Math.round(top),
                      w: Math.round(card.width), h: Math.round(bot - top) };
  };

  window.__tick = async i => {
    document.documentElement.scrollTop = top0;   // nothing else is allowed to move the frame
    const u = i / window.__frames * Math.PI * 2;         // a whole cycle, so the loop is seamless
    P.m2 = base.m2 + Math.sin(u) * 1.6;                  // the falling side steepens and eases
    P.c2 = base.c2 - Math.sin(u) * 1.1;                  // and its hinge slides along the dose axis
    P.m1 = base.m1 + Math.sin(u + 1.2) * 0.9;            // the rising side, out of phase with it
    P.w4 = base.w4 + Math.sin(u * 2) * 0.35;             // how much of that neuron reaches the sum
    drawAll();
  };
})();
