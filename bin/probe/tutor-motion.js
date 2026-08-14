// How the tutor MOVES, which is the half of this feature that assertions usually miss.
//   bin/probe/fixture.sh
//   node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/" 2000 out.png bin/probe/tutor-motion.js
//
// Films the intro tour at 200ms and checks the three things that made it feel wrong before:
//   1. a speech bubble never covers the cursor or its name badge (it used to, at every stop);
//   2. a visible bubble is never STRANDED far from the cursor (the "want a real guide?" line
//      used to sit over the 3D scene long after the cursor had gone home);
//   3. the tour is mostly DWELL, not motion, so it reads as a colleague and not as a fly.
//
// Note on (2): do not try to catch this by sampling "was the cursor moving while a bubble was
// up". A 200ms sample straddles the moment a glide ends and its arrival bubble fades in, so
// that test reports a bug nobody can see. Distance between the two is what the reader
// actually perceives, and it does not care where the sample boundaries fell.
(async () => {
  const wait = ms => new Promise(res => setTimeout(res, ms));
  for (let i = 0; i < 240 && typeof window.AITutor === "undefined"; i++) await wait(500);

  // The tour no longer plays by itself, so ASK for it. Without this the probe films an idle
  // page, measures nothing, and passes: the silent pass this file exists to prevent.
  await wait(2500);
  document.querySelector(".ait-cursor").click();

  const r = { overlaps: 0, stranded: 0, worstGap: 0, movingFrames: 0, frames: 0, sides: {},
              bubblesSeen: 0 };
  let last = null;
  const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.l - b.right, b.left - a.r)),
                                   Math.max(0, Math.max(a.t - b.bottom, b.top - a.b)));
  for (let i = 0; i < 130; i++) {
    await wait(200);
    const c = document.querySelector(".ait-cursor");
    if (!c) continue;
    r.frames++;
    const cb = c.getBoundingClientRect();
    const flag = c.querySelector(".ait-flag").getBoundingClientRect();
    const box = { l: Math.min(cb.left, flag.left), t: Math.min(cb.top, flag.top),
                  r: Math.max(cb.right, flag.right), b: Math.max(cb.bottom, flag.bottom) };
    const bub = document.querySelector(".ait-bubble");
    if (last && Math.hypot(cb.left - last.x, cb.top - last.y) > 4) r.movingFrames++;
    if (bub && +getComputedStyle(bub).opacity > 0.5) {
      r.bubblesSeen++;
      const bb = bub.getBoundingClientRect();
      if (!(bb.right < box.l || bb.left > box.r || bb.bottom < box.t || bb.top > box.b)) r.overlaps++;
      const d = Math.round(gap(box, bb));
      if (d > r.worstGap) r.worstGap = d;
      if (d > 60) r.stranded++;                  // talking from somewhere the cursor is not
      const side = [...bub.classList].find(x => /^ait-(above|below|left|right)$/.test(x));
      if (side) r.sides[side] = (r.sides[side] || 0) + 1;
    }
    last = { x: cb.left, y: cb.top };
  }
  r.movingShare = +(r.movingFrames / Math.max(1, r.frames)).toFixed(2);
  // bubblesSeen guards the guard: if the tour did not run, this probe proves nothing
  r.PASS = r.bubblesSeen > 10 && r.overlaps === 0 && r.stranded === 0 && r.movingShare < 0.35;
  return r;   // expect PASS true, overlaps 0, stranded 0, movingShare around 0.1
})()
