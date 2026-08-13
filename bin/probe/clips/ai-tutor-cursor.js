/* The borrowed AI, present on the page: a labelled cursor that moves to what it is talking about,
   Docs-style highlighting, and a line of speech. The mental model is a collaborator in a shared
   Google Doc, and no still frame carries that.

   Everything goes through AITutor.exec, the single entry point the paste loop, the live bridge
   and the demo all use, so this films the real feature rather than a mock of it. The ceiling is
   visible in what the recipe CANNOT ask for: there is no click and no type.

   Beats are HELD, not fired once. Real time runs at about four seconds per frame here, and the
   presence layer is built for a human: the speech bubble expires on a timer and the cursor dims
   to a quarter opacity after nine seconds of no movement. Fire each beat once and the clip is a
   sequence of frames with a ghost cursor and no bubble. So the say is re-issued every frame of
   its beat, and the cursor's opacity is pinned. */
(() => {
  const w = ms => new Promise(r => setTimeout(r, ms));

  window.__frames = 30;
  window.__settle = 500;      // the cursor slides and the bubble fades in; do not shoot the fade

  const BEATS = [
    { at: 0,  n: 4, run: () => AITutor.exec({ cmd: "hello", name: "Claude" }),
      say: "I am not going to give you the answer. I am going to ask you things." },
    { at: 4,  n: 7, run: () => AITutor.exec({ cmd: "point", target: "dose" }),
      say: "Before you touch anything: what do you think this dial changes?" },
    { at: 11, n: 9, run: () => AITutor.exec({ cmd: "highlight",
        text: "teach the machine in the black box to pick the right dose" }),
      say: "That sentence is the whole job. Say it back to me in your own words." },
    { at: 20, n: 10, run: () => AITutor.exec({ cmd: "point", target: "sec:1" }),
      say: "Good. Now turn one knob and tell me which way the line went." },
  ];

  window.__setup = async () => {
    /* Pin the scroll. captureScreenshot's clip is in document coordinates while only the viewport
       is actually rendered, so any drift here returns blank frames rather than wrong ones.
       scroll-behavior is smooth on this page, hence the override. */
    document.documentElement.style.scrollBehavior = "auto";
    document.documentElement.scrollTop = 0;
    stopDoseWiggle();
    await w(500);
    window.__clip = { x: 40, y: 0, w: 1320, h: 620 };
  };

  window.__tick = async i => {
    document.documentElement.scrollTop = 0;
    for (const b of BEATS) {
      if (i === b.at) { b.run(); await w(400); }          // let the cursor arrive before it talks
      if (i >= b.at && i < b.at + b.n) AITutor.exec({ cmd: "say", text: b.say });
    }
    const c = document.querySelector(".ait-cursor");
    if (c) c.style.opacity = "1";                          // undo the nine-second idle dim
  };
})();
