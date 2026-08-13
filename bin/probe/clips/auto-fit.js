/* The automatic hand. Same seven dials, nobody touching them, the line walking onto the dots and
   the stars filling in. This is the payoff of section 3 and the reason the lab can claim to have
   taught training rather than curve fitting.

   Posed by RUNNING the trainer, not by watching it: __tick advances the model to a cumulative
   step count for frame i and redraws. Real time never enters into it, so the clip is the same
   length whatever the machine does, and the early steps (where all the visible change is) get as
   many frames as the long flat tail. */
(() => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  let done = 0;
  const TOTAL = 900;
  // steps land on a curve, not evenly: half the visible movement happens in the first 5% of them
  const upto = (i, n) => Math.round(TOTAL * Math.pow(i / (n - 1), 2.6));

  let top0 = 0;

  window.__frames = 44;
  window.__settle = 90;

  window.__setup = async () => {
    document.documentElement.style.scrollBehavior = "auto";
    // climb to stage 3 the way a reader does, then throw the fit away again: the clip is about
    // the trainer finding the answer, so it has to start from one that is visibly wrong
    for (let s = 0; s < 3 && stage < 3; s++) {
      const nx = document.getElementById("nextStage");
      if (nx && nx.offsetParent !== null) { nx.click(); await w(450); }
      readyForTraining();          // this is what widens the dose range and collects the trials
      await w(400);
      for (let i = 0; i < 800; i++) trainStep(0.15);
      drawAll(); await w(250);
    }
    document.getElementById("bpcard").style.display = "block";
    resetP(); bendP(); bumpP();
    stepCount = 0; bumpStepCount(0);
    drawAll();
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
    const card = document.getElementById("stagecard1").getBoundingClientRect();
    const top  = document.getElementById("plot").getBoundingClientRect().top - 46;
    const bot  = document.getElementById("knobs").getBoundingClientRect().bottom + 8;
    window.__clip = { x: Math.round(card.left), y: Math.round(top),
                      w: Math.round(card.width), h: Math.round(bot - top) };
  };

  window.__tick = async (i, n) => {
    document.documentElement.scrollTop = top0;   // nothing else is allowed to move the frame
    const want = upto(i, n);
    while (done < want) { trainStep(0.15); done++; }
    bumpStepCount(0);
    drawAll();
  };
})();
