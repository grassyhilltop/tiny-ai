/* The patient's face, frowning at a bad dose and smiling at a good one. The mouth is drawn into
   a canvas texture and bent by setMood(0..1), so nothing moves and the clip compresses to almost
   nothing. Encode with --loopback: it reads as one patient changing their mind, not a jump cut.

   The camera pose is stolen from faceZoom() rather than guessed. faceZoom flies in, holds, and
   flies back out after 1900ms, so setup reads the pose off the camera mid-hold and then reapplies
   it every frame, which also overrides the return flight. */
(() => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const cam = () => BABYLON.Engine.Instances[0].scenes[0].activeCamera;
  let pose = null;

  window.__clip = { sel: "#stage", h: 560 };
  window.__frames = 26;
  window.__settle = 200;

  window.__setup = async () => {
    /* Pin the scroll. captureScreenshot's clip is in document coordinates while only the
       viewport is actually rendered, so any drift here returns blank frames rather than wrong
       ones. scroll-behavior is smooth on this page, hence the override. */
    document.documentElement.style.scrollBehavior = "auto";
    document.documentElement.scrollTop = 0;
    stopDoseWiggle();
    await w(400);
    faceZoom();
    await w(1500);                                   // in flight done, return flight not started
    const c = cam();
    pose = { t: c.target.clone(), r: c.radius, a: c.alpha, b: c.beta };
    await w(2900);                                   // let the return flight finish and stop
    setMood(0);
  };

  window.__tick = async i => {
    document.documentElement.scrollTop = 0;
    const c = cam();
    /* Closer than faceZoom parks it. faceZoom's radius is chosen so the reader still sees the
       ward around the patient; this clip is only about the mouth, and at 2.6 the head is a
       thumbnail in the corner of the frame. */
    /* Take faceZoom's target, but not its angle. Straight down faceZoom's axis the torso brick
       covers half the head and only one eye is visible, which is fine in the app (the reader is
       looking at a patient in a bed) and useless as a clip about an expression. Swinging alpha
       round by 0.6 puts the camera in front of the face. lowerRadiusLimit has to come down
       before the radius is assigned or the assignment is silently clamped back: the camera
       normally stops the reader flying inside the bricks. */
    c.lowerRadiusLimit = 0.4;
    c.setTarget(pose.t.clone());
    c.radius = 4.3; c.alpha = pose.a + 0.6; c.beta = pose.b;
    setMood(i / (window.__frames - 1));               // 0 frown to 1 smile
    wake(400);
  };
})();
