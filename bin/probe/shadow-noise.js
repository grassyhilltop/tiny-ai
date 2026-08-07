(async () => {
  const eng = BABYLON.Engine.Instances[0], sc = eng.scenes[0], gl = eng._gl, cam = sc.activeCamera;
  const W = eng.getRenderWidth(), H = eng.getRenderHeight();
  // read a patch of the shadowed baseplate and report luminance spread + frame-to-frame swim
  const patch = (fx, fy, w=90, h=60) => {
    const buf = new Uint8Array(w*h*4);
    gl.readPixels(Math.round(fx*W), Math.round((1-fy)*H), w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const L = []; for (let i=0;i<buf.length;i+=4) L.push(0.2126*buf[i]+0.7152*buf[i+1]+0.0722*buf[i+2]);
    const m = L.reduce((a,b)=>a+b,0)/L.length;
    const sd = Math.sqrt(L.reduce((a,b)=>a+(b-m)*(b-m),0)/L.length);
    return { mean:+m.toFixed(1), stddev:+sd.toFixed(2), min:Math.round(Math.min(...L)), max:Math.round(Math.max(...L)), L };
  };
  const measure = label => {
    for (let i=0;i<10;i++) sc.render();
    const a = patch(0.22, 0.42);                       // shadowed baseplate under the gantry
    cam.alpha += 0.004; for (let i=0;i<3;i++) sc.render();   // nudge the camera: does the noise swim?
    const b = patch(0.22, 0.42);
    cam.alpha -= 0.004;
    let swim = 0; for (let i=0;i<a.L.length;i++) swim += Math.abs(a.L[i]-b.L[i]);
    swim /= a.L.length;
    return { [label]: { stddev: a.stddev, spread: a.max-a.min, mean: a.mean, swimOnCameraNudge: +swim.toFixed(2) } };
  };
  const out = {};
  Object.assign(out, measure("ssao_on_halfres_8taps"));
  const ssao = sc.postProcessRenderPipelineManager.supportedPipelines.find(p=>(p._name||p.name)==="ssao");
  ssao.dispose();
  Object.assign(out, measure("ssao_off"));
  return out;
})()
