(() => {
  const eng = BABYLON.Engine.Instances[0], sc = eng.scenes[0];
  for (let i=0;i<20;i++) sc.render();
  const cv = eng.getRenderingCanvas();
  // read straight off the WebGL backbuffer
  const gl = eng._gl, W = eng.getRenderWidth(), H = eng.getRenderHeight();
  const px = new Uint8Array(4);
  const at = (fx, fy) => { gl.readPixels(Math.round(fx*W), Math.round((1-fy)*H), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return "#" + [...px].slice(0,3).map(v=>v.toString(16).padStart(2,"0")).join(""); };
  // what is actually behind the scene?
  const ray = sc.createPickingRay(cv.clientWidth*0.5, cv.clientHeight*0.06, BABYLON.Matrix.Identity(), sc.activeCamera);
  const hit = sc.pickWithRay(ray);
  return {
    topLeft: at(0.08,0.05), topMid: at(0.5,0.05), topRight: at(0.92,0.05),
    upperMid: at(0.5,0.20), leftEdge: at(0.03,0.5), farCorner: at(0.97,0.35),
    clearColor: sc.clearColor.toHexString(),
    fog: { mode: sc.fogMode, color: sc.fogColor.toHexString(), start: sc.fogStart, end: sc.fogEnd },
    envIntensity: sc.environmentIntensity,
    toneMapping: sc.imageProcessingConfiguration.toneMappingEnabled,
    toneType: sc.imageProcessingConfiguration.toneMappingType,
    exposure: sc.imageProcessingConfiguration.exposure,
    contrast: sc.imageProcessingConfiguration.contrast,
    whatIsUpThere: hit?.pickedMesh?.name || "nothing - clear colour",
    bigMeshes: sc.meshes.filter(m=>{ const b=m.getBoundingInfo().boundingBox;
      return (b.maximumWorld.x-b.minimumWorld.x)>25; }).map(m=>m.name+" "+(m.material?.name||"")),
  };
})()
