/* The loop the whole lab hangs off: turn the dial, press the button, a black dot lands on the
   graph. Filmed orbiting, because the scene is the thing a still frame sells worst.

   The camera angle is a function of the frame number, not of time. A screenshot of this page
   costs seconds under a software renderer, so anything driven by requestAnimationFrame would be
   sampled at four second intervals and come out as a jump cut. */
(() => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const cam = () => BABYLON.Engine.Instances[0].scenes[0].activeCamera;
  const GIVE_AT = 34;        // press the button here, and let the last frames show the result
  let a0 = 0, b0 = 0;

  window.__clip = { sel: "#stage", h: 660 };   // the card runs past the fold; frame the machine
  window.__frames = 60;
  window.__settle = 220;

  window.__setup = async () => {
    /* Pin the scroll. captureScreenshot's clip is in document coordinates while only the
       viewport is actually rendered, so any drift here returns blank frames rather than wrong
       ones. scroll-behavior is smooth on this page, hence the override. */
    document.documentElement.style.scrollBehavior = "auto";
    document.documentElement.scrollTop = 0;
    stopDoseWiggle();        // the attract breathing would fight the dial sweep below
    await w(400);
    a0 = cam().alpha; b0 = cam().beta;
    doseFrac = 0.12; updateDose();
    await w(400);
  };

  window.__tick = async i => {
    document.documentElement.scrollTop = 0;
    const u = i / 60 * Math.PI * 2;
    cam().alpha = a0 + Math.sin(u) * 0.40;
    cam().beta  = b0 + Math.sin(u) * 0.06;
    // the dial climbs to a dose worth giving, then holds while the trial plays out
    if (i <= GIVE_AT) { doseFrac = 0.12 + 0.30 * (i / GIVE_AT); updateDose(); }
    if (i === GIVE_AT) { document.getElementById("giveBtn").click(); await w(900); }
    wake(400);               // or the throttled loop leaves the pose undrawn
  };
})();
