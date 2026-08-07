/* Honest GPU cost per frame.
   Two traps this avoids: rendering in a tight JS loop measures command submission, not the GPU;
   and Babylon's GPU counter only fills up while a real rAF loop is running. So each variant runs
   the actual loop for a couple of seconds and reads the disjoint-timer-query average. */
(async () => {
  const eng = BABYLON.Engine.Instances[0], sc = eng.scenes[0];
  const gl = eng._gl;
  const inst = new BABYLON.EngineInstrumentation(eng);
  inst.captureGPUFrameTime = true;

  eng.stopRenderLoop();
  let frames = 0;
  eng.runRenderLoop(() => { sc.render(); frames++; });     // uncapped, no throttle

  const bench = async (label, ms = 2200) => {
    await new Promise(r => setTimeout(r, 400));            // let shaders/state settle
    frames = 0; const t0 = performance.now();
    await new Promise(r => setTimeout(r, ms));
    const wallFps = frames / ((performance.now() - t0) / 1000);
    const gpu = inst.gpuFrameTimeCounter.lastSecAverage / 1e6;   // ns -> ms
    return { [label]: { gpuMs: +gpu.toFixed(2), fps: Math.round(wallFps) } };
  };

  const pipes = sc.postProcessRenderPipelineManager.supportedPipelines;
  const pipe = pipes.find(p => (p._name || p.name) === "p");
  const ssao = pipes.find(p => (p._name || p.name) === "ssao");
  const klamps = sc.lights.filter(l => /^klamp/.test(l.name));
  const gen = sc.lights.map(l => l.getShadowGenerator && l.getShadowGenerator()).find(Boolean);

  const out = {};
  Object.assign(out, await bench("00_baseline"));

  // one feature off at a time, each restored before the next -> isolated costs
  klamps.forEach(l => l.setEnabled(false));
  Object.assign(out, await bench("01_no_knob_lights"));
  klamps.forEach(l => l.setEnabled(true));

  if (ssao) { ssao.dispose(); Object.assign(out, await bench("02_no_ssao_cumulative")); }

  if (pipe) {
    pipe.depthOfFieldEnabled = false;
    Object.assign(out, await bench("03_also_no_dof"));
    pipe.bloomEnabled = false;
    Object.assign(out, await bench("04_also_no_bloom"));
    const s = pipe.samples; pipe.samples = 1;
    Object.assign(out, await bench("05_also_no_msaa"));
    pipe.samples = s; pipe.bloomEnabled = true; pipe.depthOfFieldEnabled = true;
  }

  if (gen) { const rl = gen.getShadowMap().renderList.slice(); gen.getShadowMap().renderList = [];
    Object.assign(out, await bench("06_no_shadows_only")); gen.getShadowMap().renderList = rl; }

  const hw = eng.getHardwareScalingLevel();
  eng.setHardwareScalingLevel(1);
  Object.assign(out, await bench("07_hwscale_1_only"));
  eng.setHardwareScalingLevel(hw);

  return { ...out, ctx: {
    buffer: [eng.getRenderWidth(), eng.getRenderHeight()], hw, dpr: window.devicePixelRatio,
    css: [eng.getRenderingCanvas().clientWidth, eng.getRenderingCanvas().clientHeight],
    meshes: sc.meshes.length, active: sc.getActiveMeshes().length,
    lights: sc.lights.length, enabled: sc.lights.filter(l => l.isEnabled()).length,
    msaa: pipe?.samples, shadowMapSize: gen?.getShadowMap()?.getSize()?.width,
    shadowCasters: gen?.getShadowMap()?.renderList?.length,
    timerExt: !!gl.getExtension("EXT_disjoint_timer_query_webgl2"),
  }};
})()
