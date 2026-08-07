(async () => {
  const eng = BABYLON.Engine.Instances[0], sc = eng.scenes[0];
  const cv = eng.getRenderingCanvas();
  const count = async (label, ms, during) => {
    let n = 0; const ob = sc.onAfterRenderObservable.add(() => n++);
    const stop = during ? during() : null;
    const t0 = performance.now();
    await new Promise(r => setTimeout(r, ms));
    const fps = n / ((performance.now() - t0) / 1000);
    sc.onAfterRenderObservable.remove(ob); if (stop) stop();
    return { [label]: Math.round(fps) };
  };
  const out = {};
  await new Promise(r => setTimeout(r, 8000));                 // let the drop-in finish
  Object.assign(out, await count("A_idle_untouched", 2500));
  Object.assign(out, await count("B_pointer_over_canvas", 2500, () => {
    const iv = setInterval(() => cv.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })), 60);
    return () => clearInterval(iv);
  }));
  Object.assign(out, await count("C_pointer_over_TEXT_column", 2500, () => {
    const iv = setInterval(() => window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })), 60);
    return () => clearInterval(iv);
  }));
  Object.assign(out, await count("D_camera_flight", 2200, () => {
    const cam = sc.activeCamera; let a = cam.alpha;
    const iv = setInterval(() => { cam.alpha = (a += 0.02); }, 16);   // programmatic, no input
    return () => clearInterval(iv);
  }));
  Object.assign(out, await count("E_back_to_idle", 2500));
  Object.assign(out, await count("F_tab_hidden", 1500, () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    return () => Object.defineProperty(document, "hidden", { value: false, configurable: true });
  }));
  return out;
})()
