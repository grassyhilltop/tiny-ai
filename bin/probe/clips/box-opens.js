/* The black box coming apart: every wall slides along its own normal, the lid lifts, the monitor
   rides down beside the exposed neurons. This is the moment the lab is built around, so it is
   worth the frames.

   animBBEx() owns the real animation and it lives inside buildScene's closure, so its parts list
   is not reachable from here and the pose cannot be set directly. Instead setup drives the box to
   both ends with setBBView() and RECORDS where every mesh sits at each end; __tick then lerps
   between the two recordings itself. bbEx and applyMonitorDrop are module level, so the monitor
   drop and the dial placement come along for free. */
(() => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const sc = () => BABYLON.Engine.Instances[0].scenes[0];
  const cam = () => sc().activeCamera;
  const home = new Map(), open = new Map();
  // the camera moves too: setBBView explodes first and flies in second, so a clip that poses only
  // the walls starts on an extreme close-up of a shut box and reads as nothing at all
  let camA = null, camB = null;
  const grab = () => { const c = cam();
    return { t: c.target.clone(), r: c.radius, a: c.alpha, b: c.beta }; };

  window.__clip = { sel: "#stage", h: 660 };
  window.__frames = 34;
  window.__settle = 200;

  window.__setup = async () => {
    /* Pin the scroll. captureScreenshot's clip is in document coordinates while only the
       viewport is actually rendered, so any drift here returns blank frames rather than wrong
       ones. scroll-behavior is smooth on this page, hence the override. */
    document.documentElement.style.scrollBehavior = "auto";
    document.documentElement.scrollTop = 0;
    stopDoseWiggle();
    await w(400);
    setBBView(0); await w(1600);
    for (const m of sc().meshes) home.set(m, m.position.clone());
    camA = grab();
    setBBView(1); await w(1800);
    for (const m of sc().meshes) open.set(m, m.position.clone());
    camB = grab();
    // stay in the open state so the glass, the glow and the stand fade all read as "open";
    // only the positions get posed below
  };

  window.__tick = async i => {
    document.documentElement.scrollTop = 0;
    const u = i / (window.__frames - 1);
    const e = u < 0.5 ? 4*u*u*u : 1 - Math.pow(-2*u + 2, 3) / 2;   // the same ease animBBEx uses
    for (const [m, h] of home) {
      const o = open.get(m); if (!o) continue;
      BABYLON.Vector3.LerpToRef(h, o, e, m.position);
    }
    const c = cam();
    c.setTarget(BABYLON.Vector3.Lerp(camA.t, camB.t, e));
    c.radius = camA.r + (camB.r - camA.r) * e;
    c.alpha  = camA.a + (camB.a - camA.a) * e;
    c.beta   = camA.b + (camB.b - camA.b) * e;
    bbEx = e;
    applyMonitorDrop(e);
    syncBBKnobs();          // the front-panel dials opt out of the lerp and are placed from bbEx
    wake(400);
  };
})();
