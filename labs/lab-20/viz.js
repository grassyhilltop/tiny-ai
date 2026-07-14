/* ============================================================
 * Lab "deepfakes" — viz.js
 *
 * Widgets (built incrementally — see NOTES.md for the full plan):
 *   1. #viz-try-it      — 2D diffusion sampler (exact GMM denoiser, DDIM)
 *   2. #glossary-panel  — inline glossary (shared contract)
 *
 * The 2D demo is REAL diffusion: the data is a Gaussian mixture whose
 * components sit on the points of a target shape, so the optimal denoiser
 * E[x0 | x_t] has a closed form — no trained weights needed. We run proper
 * DDIM reverse sampling with that exact denoiser. Later sections show how a
 * real model LEARNS this denoiser instead of computing it.
 * ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // Widget 1 · 2D diffusion sampler
  // ============================================================
  (function initDiffusionDemo() {
    const canvas = document.getElementById('df-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const shapeSel  = document.getElementById('df-shape');
    const stepsInp  = document.getElementById('df-steps');
    const stepsVal  = document.getElementById('df-steps-val');
    const noiseChk  = document.getElementById('df-noise');
    const goBtn     = document.getElementById('df-go');
    const resetBtn  = document.getElementById('df-reset');
    const readout   = document.getElementById('df-readout');

    const N_PARTICLES = 220;
    const SIGMA_MAX = 1.25;
    const SIGMA_MIN = 0.02;
    const S0 = 0.025;           // base std of each data Gaussian (shape thickness)

    // ---- target shapes: arrays of {x,y} in roughly [-1,1] ----
    function smiley() {
      const pts = [];
      for (let i = 0; i < 46; i++) { const a = (i / 46) * 2 * Math.PI; pts.push({ x: 0.82 * Math.cos(a), y: 0.82 * Math.sin(a) }); }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 2 * Math.PI; pts.push({ x: -0.32 + 0.1 * Math.cos(a), y: 0.3 + 0.1 * Math.sin(a) }); }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 2 * Math.PI; pts.push({ x: 0.32 + 0.1 * Math.cos(a), y: 0.3 + 0.1 * Math.sin(a) }); }
      for (let i = 0; i <= 18; i++) { const a = Math.PI * (1.15 + 0.7 * (i / 18)); pts.push({ x: 0.5 * Math.cos(a), y: -0.1 + 0.5 * Math.sin(a) }); }
      return pts;
    }
    function spiral() {
      const pts = [];
      for (let i = 0; i < 90; i++) { const t = i / 90; const r = 0.08 + 0.82 * t; const a = t * 4.2 * Math.PI; pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) }); }
      return pts;
    }
    function moons() {
      const pts = [];
      for (let i = 0; i < 45; i++) { const a = Math.PI * (i / 45); pts.push({ x: Math.cos(a) - 0.5, y: Math.sin(a) - 0.25 }); }
      for (let i = 0; i < 45; i++) { const a = Math.PI * (i / 45); pts.push({ x: Math.cos(a) + 0.5 - 0.5, y: -Math.sin(a) + 0.25 }); }
      return pts;
    }
    const SHAPES = { smiley, spiral, moons };
    let DATA = smiley();

    // ---- exact denoiser for the GMM: posterior mean E[x0 | x at noise sigma] ----
    // p_sigma(x) = (1/K) sum_k N(x; mu_k, (S0^2 + sigma^2) I)
    // E[x0|x]    = sum_k r_k(x) mu_k,  r_k = softmax over -||x-mu_k||^2 / (2 v)
    function denoise(px, py, sigma) {
      const v = S0 * S0 + sigma * sigma;
      let max = -Infinity;
      const logits = new Array(DATA.length);
      for (let k = 0; k < DATA.length; k++) {
        const dx = px - DATA[k].x, dy = py - DATA[k].y;
        const l = -(dx * dx + dy * dy) / (2 * v);
        logits[k] = l;
        if (l > max) max = l;
      }
      let sum = 0;
      for (let k = 0; k < DATA.length; k++) { logits[k] = Math.exp(logits[k] - max); sum += logits[k]; }
      let mx = 0, my = 0;
      for (let k = 0; k < DATA.length; k++) { const r = logits[k] / sum; mx += r * DATA[k].x; my += r * DATA[k].y; }
      return [mx, my];
    }

    function randn() {
      let u = 0, w = 0;
      while (u === 0) u = Math.random();
      while (w === 0) w = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
    }

    // ---- coordinate transform ----
    const VB = 2.6; // view spans [-1.3, 1.3]
    function toPx(x, y) {
      const w = canvas.width, h = canvas.height;
      return [(x + VB / 2) / VB * w, h - (y + VB / 2) / VB * h];
    }

    // ---- state ----
    let particles = [];        // {x,y}
    let sigmas = [];
    let stepIdx = 0;
    let raf = null;
    let running = false;

    function geomSigmas(L) {
      const arr = [];
      for (let i = 0; i < L; i++) {
        const t = i / (L - 1);
        arr.push(Math.exp(Math.log(SIGMA_MAX) * (1 - t) + Math.log(SIGMA_MIN) * t));
      }
      arr.push(0); // final clean step
      return arr;
    }

    function initParticles() {
      particles = [];
      for (let i = 0; i < N_PARTICLES; i++) particles.push({ x: randn() * SIGMA_MAX, y: randn() * SIGMA_MAX });
    }

    function draw() {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      // faint target shape
      ctx.fillStyle = 'rgba(177,74,46,0.16)';
      for (let k = 0; k < DATA.length; k++) { const [sx, sy] = toPx(DATA[k].x, DATA[k].y); ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, 2 * Math.PI); ctx.fill(); }
      // particles, colored by how "denoised" they are (distance to their x0 estimate)
      for (let i = 0; i < particles.length; i++) {
        const [sx, sy] = toPx(particles[i].x, particles[i].y);
        ctx.fillStyle = 'rgba(31,29,26,0.82)';
        ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, 2 * Math.PI); ctx.fill();
      }
    }

    function setReadout() {
      const total = sigmas.length - 1;
      const sig = stepIdx < sigmas.length ? sigmas[stepIdx] : 0;
      if (!running && stepIdx >= total) {
        readout.innerHTML = '<span class="df-done">✓ sampled</span> · ' + N_PARTICLES + ' particles · noise σ → 0 · every dot landed on the shape';
      } else {
        readout.innerHTML = 'step ' + Math.min(stepIdx, total) + '/' + total + ' · noise σ = ' + sig.toFixed(3) + ' · denoise → step toward Ê[x₀] → lower σ';
      }
    }

    // one DDIM reverse step across all particles
    function stepOnce() {
      const sigma = sigmas[stepIdx];
      const sigmaNext = sigmas[stepIdx + 1];
      const addNoise = noiseChk && noiseChk.checked;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const [x0x, x0y] = denoise(p.x, p.y, sigma);
        // DDIM (deterministic): x_next = x0 + (sigmaNext/sigma) * (x - x0)
        const ratio = sigma > 1e-9 ? sigmaNext / sigma : 0;
        let nx = x0x + ratio * (p.x - x0x);
        let ny = x0y + ratio * (p.y - x0y);
        if (addNoise && sigmaNext > 1e-9) { // optional Langevin-ish churn
          const churn = 0.35 * sigmaNext;
          nx += churn * randn(); ny += churn * randn();
        }
        p.x = nx; p.y = ny;
      }
      stepIdx++;
    }

    function animate() {
      if (stepIdx >= sigmas.length - 1) { running = false; draw(); setReadout(); goBtn.disabled = false; return; }
      stepOnce();
      draw(); setReadout();
      raf = requestAnimationFrame(animate);
    }

    function start() {
      if (running) return;
      cancelAnimationFrame(raf);
      const L = parseInt(stepsInp.value, 10);
      sigmas = geomSigmas(L);
      initParticles();
      stepIdx = 0;
      running = true;
      goBtn.disabled = true;
      draw(); setReadout();
      raf = requestAnimationFrame(animate);
    }

    function reset() {
      cancelAnimationFrame(raf);
      running = false;
      goBtn.disabled = false;
      const L = parseInt(stepsInp.value, 10);
      sigmas = geomSigmas(L);
      initParticles();
      stepIdx = 0;
      draw();
      readout.innerHTML = 'pure noise · press <strong>Generate</strong> to run the reverse diffusion';
    }

    // ---- controls ----
    if (stepsInp && stepsVal) stepsInp.addEventListener('input', () => { stepsVal.textContent = stepsInp.value; if (!running) reset(); });
    if (shapeSel) shapeSel.addEventListener('change', () => { DATA = (SHAPES[shapeSel.value] || smiley)(); if (!running) reset(); });
    goBtn.addEventListener('click', start);
    resetBtn.addEventListener('click', reset);

    // size canvas to its container, then init
    function fit() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const size = Math.max(240, Math.min(rect.width, 460));
      canvas.width = size * dpr; canvas.height = size * dpr;
      canvas.style.height = size + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // note: width/height above are device px; toPx uses canvas.width which includes dpr — keep consistent
      canvas.width = size; canvas.height = size; // simplify: 1:1 (crisp enough for dots)
    }
    fit();
    if (stepsVal) stepsVal.textContent = stepsInp.value;
    reset();
    window.addEventListener('resize', () => { if (!running) { fit(); reset(); } });
  })();

  // ============================================================
  // Widget 2 · live-trained autoencoder (2-8-1-8-2) on a 2D arc
  //   "Reconstruct your own input, no labels." Watch the 1D
  //   bottleneck learn the data manifold (the decoded curve).
  // ============================================================
  (function initAutoencoderTrain() {
    const canvas = document.getElementById('ae-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const trainBtn = document.getElementById('ae-train');
    const stepBtn  = document.getElementById('ae-step');
    const resetBtn = document.getElementById('ae-reset');
    const readout  = document.getElementById('ae-readout');

    const NIN = 2, NH = 8, NZ = 1;
    let W1, b1, W2, b2, W3, b3, W4, b4, epoch, raf = null, training = false;
    const LR = 0.05;

    function lcg(s) { return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
    let rng = lcg(7);
    const rn = () => rng() * 2 - 1;
    const zeros = n => new Array(n).fill(0);

    // data: a half-circle arc (the "manifold" the bottleneck must discover)
    const DATA = [];
    for (let i = 0; i < 160; i++) { const t = Math.PI * (i / 159); DATA.push([Math.cos(t), Math.sin(t)]); }

    function initWeights() {
      rng = lcg(7);
      W1 = []; for (let j = 0; j < NH; j++) W1.push([rn() * 0.8, rn() * 0.8]);
      b1 = zeros(NH);
      W2 = [Array.from({ length: NH }, () => rn() * 0.5)]; b2 = zeros(NZ);
      W3 = []; for (let j = 0; j < NH; j++) W3.push([rn() * 0.8]); b3 = zeros(NH);
      W4 = []; for (let i = 0; i < NIN; i++) W4.push(Array.from({ length: NH }, () => rn() * 0.5)); b4 = zeros(NIN);
      epoch = 0;
    }
    const th = Math.tanh;
    function fwd(x) {
      const h1 = zeros(NH);
      for (let j = 0; j < NH; j++) h1[j] = th(b1[j] + W1[j][0] * x[0] + W1[j][1] * x[1]);
      const z = zeros(NZ);
      for (let k = 0; k < NZ; k++) { let s = b2[k]; for (let j = 0; j < NH; j++) s += W2[k][j] * h1[j]; z[k] = s; }
      const h3 = zeros(NH);
      for (let j = 0; j < NH; j++) { let s = b3[j]; for (let k = 0; k < NZ; k++) s += W3[j][k] * z[k]; h3[j] = th(s); }
      const xh = zeros(NIN);
      for (let i = 0; i < NIN; i++) { let s = b4[i]; for (let j = 0; j < NH; j++) s += W4[i][j] * h3[j]; xh[i] = s; }
      return { h1, z, h3, xh };
    }
    function decode(zval) {
      const h3 = zeros(NH);
      for (let j = 0; j < NH; j++) { let s = b3[j]; for (let k = 0; k < NZ; k++) s += W3[j][k] * zval[k]; h3[j] = th(s); }
      const xh = zeros(NIN);
      for (let i = 0; i < NIN; i++) { let s = b4[i]; for (let j = 0; j < NH; j++) s += W4[i][j] * h3[j]; xh[i] = s; }
      return xh;
    }
    function trainEpoch() {
      for (const x of DATA) {
        const { h1, z, h3, xh } = fwd(x);
        const dxh = [xh[0] - x[0], xh[1] - x[1]];
        const dh3 = zeros(NH);
        for (let i = 0; i < NIN; i++) { for (let j = 0; j < NH; j++) { dh3[j] += W4[i][j] * dxh[i]; W4[i][j] -= LR * dxh[i] * h3[j]; } b4[i] -= LR * dxh[i]; }
        const da3 = zeros(NH); for (let j = 0; j < NH; j++) da3[j] = dh3[j] * (1 - h3[j] * h3[j]);
        const dz = zeros(NZ);
        for (let j = 0; j < NH; j++) { for (let k = 0; k < NZ; k++) { dz[k] += W3[j][k] * da3[j]; W3[j][k] -= LR * da3[j] * z[k]; } b3[j] -= LR * da3[j]; }
        const dh1 = zeros(NH);
        for (let k = 0; k < NZ; k++) { for (let j = 0; j < NH; j++) { dh1[j] += W2[k][j] * dz[k]; W2[k][j] -= LR * dz[k] * h1[j]; } b2[k] -= LR * dz[k]; }
        const da1 = zeros(NH); for (let j = 0; j < NH; j++) da1[j] = dh1[j] * (1 - h1[j] * h1[j]);
        for (let j = 0; j < NH; j++) { W1[j][0] -= LR * da1[j] * x[0]; W1[j][1] -= LR * da1[j] * x[1]; b1[j] -= LR * da1[j]; }
      }
      epoch++;
    }
    function avgLoss() {
      let L = 0; for (const x of DATA) { const { xh } = fwd(x); L += 0.5 * ((xh[0] - x[0]) ** 2 + (xh[1] - x[1]) ** 2); } return L / DATA.length;
    }

    const VB = 2.6;
    function toPx(x, y) { const w = canvas.width, h = canvas.height; return [(x + VB / 2) / VB * w, h - (y + VB / 2) / VB * h]; }
    function draw() {
      const w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h);
      // data
      ctx.fillStyle = 'rgba(63,140,99,0.5)';
      for (const x of DATA) { const [sx, sy] = toPx(x[0], x[1]); ctx.beginPath(); ctx.arc(sx, sy, 2, 0, 2 * Math.PI); ctx.fill(); }
      // learned manifold: sweep z across the encoded range, decode -> curve
      let zmin = Infinity, zmax = -Infinity;
      for (const x of DATA) { const { z } = fwd(x); if (z[0] < zmin) zmin = z[0]; if (z[0] > zmax) zmax = z[0]; }
      ctx.strokeStyle = 'var(--accent)'; ctx.strokeStyle = '#b14a2e'; ctx.lineWidth = 2.4; ctx.beginPath();
      const M = 80;
      for (let i = 0; i <= M; i++) { const zv = zmin + (zmax - zmin) * (i / M); const xh = decode([zv]); const [sx, sy] = toPx(xh[0], xh[1]); if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); }
      ctx.stroke();
    }
    function setReadout() { readout.innerHTML = 'epoch <strong>' + epoch + '</strong> · reconstruction loss <strong>' + avgLoss().toFixed(4) + '</strong> · red = the 1D bottleneck\'s learned manifold'; }

    function loop() { if (!training) return; for (let k = 0; k < 3; k++) trainEpoch(); draw(); setReadout(); raf = requestAnimationFrame(loop); }
    function setTrain(on) {
      training = on; trainBtn.textContent = on ? '⏸ Pause' : '▶ Train';
      if (on) { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf);
    }
    trainBtn.addEventListener('click', () => setTrain(!training));
    stepBtn.addEventListener('click', () => { for (let k = 0; k < 10; k++) trainEpoch(); draw(); setReadout(); });
    resetBtn.addEventListener('click', () => { setTrain(false); initWeights(); draw(); setReadout(); });

    function fit() { const rect = canvas.getBoundingClientRect(); const size = Math.max(240, Math.min(rect.width, 420)); canvas.width = size; canvas.height = size; }
    fit(); initWeights(); draw(); setReadout();
  })();

  // ============================================================
  // Widget 3 · the face-swap (shared encoder + two decoders)
  //   Real linear algebra: expression lives in mouth pixels,
  //   identity in the rest -> orthogonal subspaces -> the shared
  //   encoder recovers pure expression and the swap is exact.
  // ============================================================
  (function initFaceSwap() {
    const srcCanvas = document.getElementById('fs-src');
    if (!srcCanvas) return;
    const outACanvas = document.getElementById('fs-outA');
    const outBCanvas = document.getElementById('fs-outB');
    const idSel   = document.getElementById('fs-id');
    const smileInp = document.getElementById('fs-smile');
    const openInp  = document.getElementById('fs-open');
    const readout = document.getElementById('fs-readout');

    // --- stage-2 mini net: pixel squares → frozen edges → two live code neurons ---
    // Squares are data, circles are learned-layer outputs (the lab-wide convention).
    // The edges are drawn once and never touched again — they ARE the frozen weights;
    // only the two code neurons (fill + number) update as the input changes.
    const encSvg = document.getElementById('fs-enc-svg');
    let encUI = null;
    if (encSvg) {
      const NS = 'http://www.w3.org/2000/svg';
      const mk = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); encSvg.appendChild(el); return el; };
      const sqY = [30, 62, 94, 126, 158], cY = [66, 130], sqX = 30, cX = 178;
      sqY.forEach((y, i) => cY.forEach(cy => mk('line', {
        x1: sqX + 9, y1: y, x2: cX - 14, y2: cy,
        stroke: i >= 3 ? '#a09a8e' : '#ddd7ca', 'stroke-width': i >= 3 ? 1.6 : 1
      })));
      sqY.forEach((y, i) => mk('rect', {
        x: sqX - 9, y: y - 9, width: 18, height: 18, rx: 3,
        fill: '#ffffff', stroke: i >= 3 ? '#8a857d' : '#c9c3b6', 'stroke-width': 1.2
      }));
      mk('text', { x: sqX + 1, y: sqY[2] + 21, 'text-anchor': 'middle', class: 'fs-svg-dots' }).textContent = '⋮';
      mk('text', { x: sqX, y: 192, 'text-anchor': 'middle', class: 'fs-svg-label' }).textContent = 'x · 64 pixels';
      mk('text', { x: (sqX + cX) / 2, y: 18, 'text-anchor': 'middle', class: 'fs-svg-label' }).textContent = 'w · frozen';
      const circles = [], vals = [];
      cY.forEach((cy, i) => {
        circles.push(mk('circle', { cx: cX, cy, r: 13, fill: '#f0eee5', stroke: '#b14a2e', 'stroke-width': 1.6 }));
        mk('text', { x: cX + 20, y: cy + 4, class: 'fs-svg-label' }).textContent = i === 0 ? 'smile' : 'open';
        vals.push(mk('text', { x: cX, y: cy + 30, 'text-anchor': 'middle', class: 'fs-svg-val' }));
      });
      mk('text', { x: cX, y: 192, 'text-anchor': 'middle', class: 'fs-svg-label' }).textContent = 'code z';
      encUI = { circles, vals };
    }
    function updateEnc(z) {
      if (!encUI) return;
      z.forEach((v, i) => {
        const mag = Math.min(1, Math.abs(v));
        const fill = v > 0.05 ? 'rgba(253,224,210,' + (0.35 + 0.65 * mag).toFixed(2) + ')'
                   : v < -0.05 ? 'rgba(213,230,220,' + (0.35 + 0.65 * mag).toFixed(2) + ')'
                   : '#f0eee5';
        encUI.circles[i].setAttribute('fill', fill);
        encUI.vals[i].textContent = v.toFixed(2);
      });
    }

    const G = 8, P = G * G;
    const idx = (r, c) => r * G + c;
    const zeros = n => new Array(n).fill(0);
    const mouth = []; for (let c = 1; c <= 6; c++) { mouth.push(idx(5, c)); mouth.push(idx(6, c)); }

    // shared neutral mouth (identity-agnostic baseline so expression is always visible)
    const mNeutral = zeros(P);
    for (let c = 1; c <= 6; c++) mNeutral[idx(6, c)] = 0.55;
    // expression basis W (supported only on mouth pixels)
    const w0 = zeros(P), w1 = zeros(P); // smile, openness
    w0[idx(5, 1)] = 0.45; w0[idx(5, 6)] = 0.45; w0[idx(6, 1)] = 0.2; w0[idx(6, 6)] = 0.2; w0[idx(6, 3)] = -0.3; w0[idx(6, 4)] = -0.3;
    w1[idx(5, 3)] = 0.4; w1[idx(5, 4)] = 0.4;
    // identity offsets (zero on mouth pixels -> orthogonal to col(W)).
    // Each eye's two pixels are the four-pixel walkthrough's exact identity
    // vectors, top-to-bottom: A = [1, 0.6] (a_A), B = [0.6, 1] (a_B).
    function baseFace(kind) {
      const a = zeros(P);
      for (let c = 0; c < G; c++) { a[idx(0, c)] = 0.7; a[idx(7, c)] = 0.7; }
      for (let r = 0; r < G; r++) { a[idx(r, 0)] = 0.7; a[idx(r, 7)] = 0.7; }
      if (kind === 'A') { a[idx(2, 2)] = 1; a[idx(2, 5)] = 1; a[idx(3, 2)] = 0.6; a[idx(3, 5)] = 0.6; }
      else { a[idx(2, 2)] = 0.6; a[idx(2, 5)] = 0.6; a[idx(3, 2)] = 1; a[idx(3, 5)] = 1; }
      for (const m of mouth) a[m] = 0;
      return a;
    }
    const aA = baseFace('A'), aB = baseFace('B');
    function dot(u, v) { let s = 0; for (let i = 0; i < P; i++) s += u[i] * v[i]; return s; }
    function render(base, z0, z1) { const x = base.slice(); for (let i = 0; i < P; i++) x[i] += mNeutral[i] + z0 * w0[i] + z1 * w1[i]; return x; }
    // encoder E = (WtW)^-1 Wt applied to (x - mNeutral)
    const a = dot(w0, w0), b = dot(w0, w1), d = dot(w1, w1), det = a * d - b * b;
    function encode(x) {
      const xc = x.slice(); for (let i = 0; i < P; i++) xc[i] -= mNeutral[i];
      const p0 = dot(w0, xc), p1 = dot(w1, xc);
      return [(d * p0 - b * p1) / det, (-b * p0 + a * p1) / det];
    }
    function drawFace(canvas, x, highlight) {
      const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height; const cw = w / G, ch = h / G;
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#fbfaf7'; ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
        const v = Math.max(0, Math.min(1, x[idx(r, c)]));
        if (v > 0.02) { ctx.fillStyle = 'rgba(31,29,26,' + v.toFixed(3) + ')'; ctx.fillRect(c * cw + 0.5, r * ch + 0.5, cw - 1, ch - 1); }
      }
      ctx.strokeStyle = highlight ? '#b14a2e' : 'rgba(0,0,0,0.12)'; ctx.lineWidth = highlight ? 3 : 1; ctx.strokeRect(1, 1, w - 2, h - 2);
    }

    // "Meet the identities" reference strip: both faces at neutral expression
    // (z = 0), with a dashed box around the eye region — the only pixels that
    // differ between A and B, i.e. where identity lives.
    (function drawIdentityRefs() {
      const idA = document.getElementById('fs-idA'), idB = document.getElementById('fs-idB');
      if (!idA || !idB) return;
      const eyeBox = canvas => {
        const ctx = canvas.getContext('2d'), cw = canvas.width / G, ch = canvas.height / G;
        ctx.setLineDash([4, 3]); ctx.strokeStyle = '#b14a2e'; ctx.lineWidth = 1.5;
        ctx.strokeRect(1 * cw + 1, 2 * ch + 1, 6 * cw - 2, 2 * ch - 2);   // rows 2–3, cols 1–6 (the eye pixels)
        ctx.setLineDash([]);
      };
      drawFace(idA, render(aA, 0, 0), false); eyeBox(idA);
      drawFace(idB, render(aB, 0, 0), false); eyeBox(idB);
    })();

    function update() {
      const id = idSel.value; // 'A' or 'B'
      const z0 = parseFloat(smileInp.value), z1 = parseFloat(openInp.value);
      const base = id === 'A' ? aA : aB;
      const srcFace = render(base, z0, z1);
      const zhat = encode(srcFace);                 // shared encoder recovers expression
      const outA = render(aA, zhat[0], zhat[1]);     // decoder A
      const outB = render(aB, zhat[0], zhat[1]);     // decoder B
      drawFace(srcCanvas, srcFace, false);
      drawFace(outACanvas, outA, id === 'B');        // highlight the SWAP target
      drawFace(outBCanvas, outB, id === 'A');
      updateEnc(zhat);
      const swapName = id === 'A' ? 'B' : 'A';
      readout.innerHTML = 'source = <strong>' + id + '</strong> · shared encoder → z = (smile ' + zhat[0].toFixed(2) + ', open ' + zhat[1].toFixed(2) +
        ') · decoder <strong>' + swapName + '</strong> = the swap (same expression, ' + swapName + '’s identity)';
    }
    [idSel, smileInp, openInp].forEach(el => { el.addEventListener('input', update); el.addEventListener('change', update); });
    update();
  })();

  // ============================================================
  // Widget 3b · live 2D GAN (generator vs discriminator)
  //   Same algorithm as gan.py: MLP + Adam + non-saturating G loss,
  //   gradient flows through D into G. Target = 8-Gaussian ring.
  //   Background heatmap = D's decision surface (warm = "real").
  // ============================================================
  (function initGAN() {
    const canvas = document.getElementById('gan-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const trainBtn = document.getElementById('gan-train');
    const resetBtn = document.getElementById('gan-reset');
    const readout  = document.getElementById('gan-readout');

    function lcg(s) { return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
    let rng = lcg(42);
    const randn = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const relu = x => x > 0 ? x : 0;
    const sig = x => 1 / (1 + Math.exp(-x));

    function MLP(sizes, sigmoidOut) {
      const L = sizes.length - 1, W = [], b = [];
      for (let l = 0; l < L; l++) { const s = Math.sqrt(2 / sizes[l]); const m = []; for (let i = 0; i < sizes[l + 1]; i++) { const r = []; for (let j = 0; j < sizes[l]; j++) r.push(randn() * s); m.push(r); } W.push(m); b.push(new Array(sizes[l + 1]).fill(0)); }
      const z3 = a => a.map(r => r.map(() => 0)), z1 = a => a.map(() => 0);
      return { sizes, sigmoidOut, L, W, b, mW: W.map(z3), vW: W.map(z3), mb: b.map(z1), vb: b.map(z1), t: 0 };
    }
    function fwd(net, x) {
      const acts = [x], pre = []; let a = x;
      for (let l = 0; l < net.L; l++) {
        const Wl = net.W[l], bl = net.b[l], z = new Array(Wl.length);
        for (let i = 0; i < Wl.length; i++) { let s = bl[i]; const Wi = Wl[i]; for (let j = 0; j < a.length; j++) s += Wi[j] * a[j]; z[i] = s; }
        pre.push(z);
        a = (l < net.L - 1) ? z.map(relu) : (net.sigmoidOut ? z.map(sig) : z.slice());
        acts.push(a);
      }
      return { acts, pre, out: a };
    }
    function bwd(net, fb, dOut) {
      const { acts, pre } = fb;
      const gW = net.W.map(W => W.map(r => r.map(() => 0))), gb = net.b.map(b => b.map(() => 0));
      let dUp = null, dz;
      for (let l = net.L - 1; l >= 0; l--) {
        const Wl = net.W[l], aPrev = acts[l];
        if (l === net.L - 1) { if (net.sigmoidOut) { const o = acts[l + 1]; dz = dOut.map((g, i) => g * o[i] * (1 - o[i])); } else dz = dOut.slice(); }
        else { const z = pre[l]; dz = dUp.map((g, i) => g * (z[i] > 0 ? 1 : 0)); }
        for (let i = 0; i < Wl.length; i++) { gb[l][i] += dz[i]; const gWi = gW[l][i]; for (let j = 0; j < aPrev.length; j++) gWi[j] += dz[i] * aPrev[j]; }
        dUp = new Array(aPrev.length).fill(0);
        for (let i = 0; i < Wl.length; i++) { const Wi = Wl[i]; for (let j = 0; j < aPrev.length; j++) dUp[j] += Wi[j] * dz[i]; }
      }
      return { gW, gb, gIn: dUp };
    }
    function adam(net, gW, gb, lr) {
      net.t++; const b1 = 0.5, b2 = 0.999, eps = 1e-8, bc1 = 1 - Math.pow(b1, net.t), bc2 = 1 - Math.pow(b2, net.t);
      for (let l = 0; l < net.L; l++) for (let i = 0; i < net.W[l].length; i++) {
        for (let j = 0; j < net.W[l][i].length; j++) { const g = gW[l][i][j]; net.mW[l][i][j] = b1 * net.mW[l][i][j] + (1 - b1) * g; net.vW[l][i][j] = b2 * net.vW[l][i][j] + (1 - b2) * g * g; net.W[l][i][j] -= lr * (net.mW[l][i][j] / bc1) / (Math.sqrt(net.vW[l][i][j] / bc2) + eps); }
        const gg = gb[l][i]; net.mb[l][i] = b1 * net.mb[l][i] + (1 - b1) * gg; net.vb[l][i] = b2 * net.vb[l][i] + (1 - b2) * gg * gg; net.b[l][i] -= lr * (net.mb[l][i] / bc1) / (Math.sqrt(net.vb[l][i] / bc2) + eps);
      }
    }
    const MODES = []; for (let k = 0; k < 8; k++) MODES.push([0.9 * Math.cos(k / 8 * 2 * Math.PI), 0.9 * Math.sin(k / 8 * 2 * Math.PI)]);
    const realSample = () => { const m = MODES[Math.floor(rng() * 8)]; return [m[0] + randn() * 0.05, m[1] + randn() * 0.05]; };

    let G, D, iter, raf = null, training = false;
    const BATCH = 24, LR = 4e-3;
    function reset() {
      cancelAnimationFrame(raf); training = false; if (trainBtn) trainBtn.textContent = '▶ Train';
      rng = lcg(42); G = MLP([2, 16, 16, 2], false); D = MLP([2, 16, 16, 1], true); iter = 0;
      draw(); setReadout();
    }
    function trainIters(K) {
      for (let it = 0; it < K; it++) {
        // D step
        let gW = D.W.map(W => W.map(r => r.map(() => 0))), gb = D.b.map(b => b.map(() => 0));
        for (let n = 0; n < BATCH; n++) {
          const xr = realSample(); const fr = fwd(D, xr); const br = bwd(D, fr, [-1 / (fr.out[0] + 1e-8)]);
          const xf = fwd(G, [randn(), randn()]).out; const ff = fwd(D, xf); const bf = bwd(D, ff, [1 / (1 - ff.out[0] + 1e-8)]);
          for (let l = 0; l < D.L; l++) for (let i = 0; i < D.W[l].length; i++) { for (let j = 0; j < D.W[l][i].length; j++) gW[l][i][j] += (br.gW[l][i][j] + bf.gW[l][i][j]) / BATCH; gb[l][i] += (br.gb[l][i] + bf.gb[l][i]) / BATCH; }
        }
        adam(D, gW, gb, LR);
        // G step (through D)
        gW = G.W.map(W => W.map(r => r.map(() => 0))); gb = G.b.map(b => b.map(() => 0));
        for (let n = 0; n < BATCH; n++) {
          const fg = fwd(G, [randn(), randn()]); const fd = fwd(D, fg.out); const bd = bwd(D, fd, [-1 / (fd.out[0] + 1e-8)]); const bg = bwd(G, fg, bd.gIn);
          for (let l = 0; l < G.L; l++) for (let i = 0; i < G.W[l].length; i++) { for (let j = 0; j < G.W[l][i].length; j++) gW[l][i][j] += bg.gW[l][i][j] / BATCH; gb[l][i] += bg.gb[l][i] / BATCH; }
        }
        adam(G, gW, gb, LR);
        iter++;
      }
    }
    const VB = 2.6;
    function toPx(x, y) { const w = canvas.width, h = canvas.height; return [(x + VB / 2) / VB * w, h - (y + VB / 2) / VB * h]; }
    function draw() {
      const w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h);
      // D decision surface heatmap
      const GR = 34, cw = w / GR, ch = h / GR;
      for (let gy = 0; gy < GR; gy++) for (let gx = 0; gx < GR; gx++) {
        const dx = ((gx + 0.5) / GR) * VB - VB / 2, dy = VB / 2 - ((gy + 0.5) / GR) * VB;
        const v = fwd(D, [dx, dy]).out[0]; // P(real)
        // warm (real) -> orange, cool (fake) -> green
        const r = Math.round(245 - 70 * (1 - v)), g = Math.round(225 - 60 * v), b = Math.round(210 - 90 * v);
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.6)';
        ctx.fillRect(gx * cw, gy * ch, cw + 1, ch + 1);
      }
      // real data (target ring)
      ctx.fillStyle = 'rgba(177,74,46,0.55)';
      for (let n = 0; n < 200; n++) { const xr = realSample(); const [sx, sy] = toPx(xr[0], xr[1]); ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, 2 * Math.PI); ctx.fill(); }
      // generated samples
      ctx.fillStyle = 'rgba(31,29,26,0.9)';
      for (let n = 0; n < 200; n++) { const xf = fwd(G, [randn(), randn()]).out; const [sx, sy] = toPx(xf[0], xf[1]); ctx.beginPath(); ctx.arc(sx, sy, 2, 0, 2 * Math.PI); ctx.fill(); }
    }
    function coverage() { const hit = new Array(8).fill(0), K = 300; for (let n = 0; n < K; n++) { const xf = fwd(G, [randn(), randn()]).out; let best = 1e9, bi = 0; for (let k = 0; k < 8; k++) { const d = Math.hypot(xf[0] - MODES[k][0], xf[1] - MODES[k][1]); if (d < best) { best = d; bi = k; } } if (best < 0.2) hit[bi]++; } return hit.filter(c => c > K * 0.01).length; }
    function setReadout() { readout.innerHTML = 'iter <strong>' + iter + '</strong> · modes captured <strong>' + coverage() + '/8</strong> · <span style="color:#b14a2e">orange dots</span> = real, <span style="color:#1f1d1a">dark dots</span> = generated, background = D’s "real" surface'; }
    function loop() { if (!training) return; trainIters(6); draw(); setReadout(); raf = requestAnimationFrame(loop); }
    function setTrain(on) { training = on; trainBtn.textContent = on ? '⏸ Pause' : '▶ Train'; if (on) { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf); }
    trainBtn.addEventListener('click', () => setTrain(!training));
    resetBtn.addEventListener('click', reset);
    function fit() { const rect = canvas.getBoundingClientRect(); const size = Math.max(240, Math.min(rect.width, 420)); canvas.width = size; canvas.height = size; }
    fit(); reset();
  })();

  // ============================================================
  // Widget 4 · network-architecture diagrams (nodes + lines)
  //   (a) the autoencoder hourglass  (b) the shared-encoder /
  //   two-decoder face-swap fork. Hover a node to light its wires.
  // ============================================================
  (function initArchDiagrams() {
    const NS = 'http://www.w3.org/2000/svg';
    function el(name, attrs, parent, text) {
      const n = document.createElementNS(NS, name);
      if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
      if (text != null) n.textContent = text;
      if (parent) parent.appendChild(n);
      return n;
    }
    // node y-positions for a column of n nodes spanning [top, bot]
    function spread(n, top, bot) {
      if (n === 1) return [(top + bot) / 2];
      const ys = []; for (let i = 0; i < n; i++) ys.push(top + (bot - top) * i / (n - 1)); return ys;
    }

    // ---- (a) hourglass autoencoder -------------------------------------
    (function hourglass() {
      const svg = document.getElementById('ae-arch-svg');
      if (!svg) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const W = 740, H = 300, padX = 86, top = 40, bot = H - 46;
      const layers = [
        { n: 2, kind: 'data',   label: 'input x' },
        { n: 8, kind: 'neuron', label: 'hidden' },
        { n: 1, kind: 'code',   label: 'code z' },
        { n: 8, kind: 'neuron', label: 'hidden' },
        { n: 2, kind: 'data',   label: 'x̂ (reconstruction)' },
      ];
      const xs = layers.map((_, i) => padX + i * (W - 2 * padX) / (layers.length - 1));
      layers.forEach(L => { L.ys = spread(L.n, top, bot); });

      // background bands: encoder (cols 0-2) and decoder (cols 2-4)
      el('rect', { x: xs[0] - 34, y: 14, width: xs[2] - xs[0] + 30, height: H - 28, rx: 10, fill: 'rgba(63,140,99,0.07)', stroke: 'rgba(63,140,99,0.25)' }, svg);
      el('rect', { x: xs[2] + 4, y: 14, width: xs[4] - xs[2] + 34, height: H - 28, rx: 10, fill: 'rgba(177,74,46,0.06)', stroke: 'rgba(177,74,46,0.22)' }, svg);
      el('text', { x: (xs[0] + xs[2]) / 2, y: 28, 'text-anchor': 'middle', class: 'arch-band' }, svg, 'ENCODER  f');
      el('text', { x: (xs[2] + xs[4]) / 2, y: 28, 'text-anchor': 'middle', class: 'arch-band' }, svg, 'DECODER  g');

      // edges (adjacent fully connected)
      const edges = [];
      for (let i = 0; i < layers.length - 1; i++) {
        for (let a = 0; a < layers[i].n; a++) for (let b = 0; b < layers[i + 1].n; b++) {
          const line = el('line', { x1: xs[i], y1: layers[i].ys[a], x2: xs[i + 1], y2: layers[i + 1].ys[b], class: 'arch-edge' }, svg);
          line.dataset.a = i + ':' + a; line.dataset.b = (i + 1) + ':' + b;
          edges.push(line);
        }
      }
      // nodes
      layers.forEach((L, i) => {
        L.ys.forEach((y, k) => {
          let node;
          if (L.kind === 'data') { node = el('rect', { x: xs[i] - 9, y: y - 9, width: 18, height: 18, rx: 3, class: 'arch-node data' }, svg); }
          else { node = el('circle', { cx: xs[i], cy: y, r: L.kind === 'code' ? 13 : 10, class: 'arch-node ' + (L.kind === 'code' ? 'code' : 'neuron') }, svg); }
          const id = i + ':' + k;
          node.addEventListener('mouseenter', () => edges.forEach(e => { if (e.dataset.a === id || e.dataset.b === id) e.classList.add('hl'); }));
          node.addEventListener('mouseleave', () => edges.forEach(e => e.classList.remove('hl')));
        });
        el('text', { x: xs[i], y: H - 16, 'text-anchor': 'middle', class: 'arch-label' }, svg, L.label);
      });
      // bottleneck annotation
      el('text', { x: xs[2], y: bot + 22, 'text-anchor': 'middle', class: 'arch-note' }, svg, '↑ the squeeze');
    })();

    // ---- (b) shared encoder -> two decoders (the swap) -----------------
    (function yfork() {
      const svg = document.getElementById('swap-arch-svg');
      if (!svg) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const W = 760, H = 360;
      const colX = [70, 210, 340, 500, 660]; // input, enc-hidden, code, dec-hidden, output
      const midY = H / 2;
      const encIn = spread(3, 70, H - 70);          // input face (3 sample nodes)
      const encH  = spread(5, 60, H - 60);
      const code  = spread(2, midY - 30, midY + 30);
      const decAH = spread(4, 40, midY - 20);        // decoder A (upper)
      const decBH = spread(4, midY + 20, H - 40);    // decoder B (lower)
      const outA  = spread(2, 70, midY - 50);
      const outB  = spread(2, midY + 50, H - 70);

      function connect(x1, ys1, x2, ys2, cls) {
        ys1.forEach(y1 => ys2.forEach(y2 => el('line', { x1, y1, x2, y2, class: 'arch-edge ' + (cls || '') }, svg)));
      }
      // background bands
      el('rect', { x: 40, y: 18, width: colX[2] - 40 + 26, height: H - 36, rx: 10, fill: 'rgba(63,140,99,0.07)', stroke: 'rgba(63,140,99,0.25)' }, svg);
      el('text', { x: (40 + colX[2]) / 2, y: 34, 'text-anchor': 'middle', class: 'arch-band' }, svg, 'SHARED ENCODER  f');
      el('rect', { x: colX[2] + 30, y: 18, width: W - (colX[2] + 30) - 14, height: midY - 18 - 6, rx: 10, fill: 'rgba(177,74,46,0.06)', stroke: 'rgba(177,74,46,0.22)' }, svg);
      el('text', { x: (colX[3] + colX[4]) / 2, y: 34, 'text-anchor': 'middle', class: 'arch-band' }, svg, 'DECODER A  (Alice)');
      el('rect', { x: colX[2] + 30, y: midY + 6, width: W - (colX[2] + 30) - 14, height: midY - 18 - 6, rx: 10, fill: 'rgba(177,74,46,0.06)', stroke: 'rgba(177,74,46,0.22)' }, svg);
      el('text', { x: (colX[3] + colX[4]) / 2, y: H - 22, 'text-anchor': 'middle', class: 'arch-band' }, svg, 'DECODER B  (Bob)');

      connect(colX[0], encIn, colX[1], encH);
      connect(colX[1], encH, colX[2], code);
      connect(colX[2], code, colX[3], decAH, 'eA');
      connect(colX[2], code, colX[3], decBH, 'eB');
      connect(colX[3], decAH, colX[4], outA, 'eA');
      connect(colX[3], decBH, colX[4], outB, 'eB');

      function nodes(x, ys, kind) { ys.forEach(y => {
        if (kind === 'data') el('rect', { x: x - 9, y: y - 9, width: 18, height: 18, rx: 3, class: 'arch-node data' }, svg);
        else el('circle', { cx: x, cy: y, r: kind === 'code' ? 12 : 9, class: 'arch-node ' + (kind === 'code' ? 'code' : 'neuron') }, svg);
      }); }
      nodes(colX[0], encIn, 'data'); nodes(colX[1], encH, 'neuron'); nodes(colX[2], code, 'code');
      nodes(colX[3], decAH, 'neuron'); nodes(colX[3], decBH, 'neuron');
      nodes(colX[4], outA, 'data'); nodes(colX[4], outB, 'data');

      el('text', { x: colX[0], y: H - 8, 'text-anchor': 'middle', class: 'arch-label' }, svg, 'face in');
      el('text', { x: colX[2], y: H - 8, 'text-anchor': 'middle', class: 'arch-label' }, svg, 'code z');
      el('text', { x: colX[4], y: midY - 50 - 16, 'text-anchor': 'middle', class: 'arch-label' }, svg, 'Alice out');
      el('text', { x: colX[4], y: H - 8, 'text-anchor': 'middle', class: 'arch-label' }, svg, 'Bob out');
      el('text', { x: colX[2], y: midY + 52, 'text-anchor': 'middle', class: 'arch-note' }, svg, 'one code, two painters');
    })();

    // ---- (c) GAN: generator + discriminator + the adversarial loop ------
    (function gan() {
      const svg = document.getElementById('gan-arch-svg');
      if (!svg) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const H = 320;
      const colX = [70, 200, 330, 470, 600, 700];
      const noise = spread(2, 110, 210);
      const gH    = spread(5, 60, H - 60);
      const fake  = spread(2, 120, 200);   // generated point
      const dH    = spread(5, 50, H - 50);
      const score = spread(1, H / 2, H / 2);

      // bands — the G band stops BEFORE the x̂/real-x column: both samples sit
      // between the networks, so "real x" clearly isn't produced by G
      el('rect', { x: 44, y: 18, width: colX[2] - 44 - 26, height: H - 36, rx: 10, fill: 'rgba(31,29,26,0.05)', stroke: 'rgba(31,29,26,0.18)' }, svg);
      el('text', { x: (44 + colX[2]) / 2 - 13, y: 34, 'text-anchor': 'middle', class: 'arch-band' }, svg, 'GENERATOR  G');
      el('rect', { x: colX[2] + 28, y: 18, width: colX[5] - colX[2] - 28 + 30, height: H - 36, rx: 10, fill: 'rgba(177,74,46,0.06)', stroke: 'rgba(177,74,46,0.22)' }, svg);
      el('text', { x: (colX[3] + colX[5]) / 2, y: 34, 'text-anchor': 'middle', class: 'arch-band' }, svg, 'DISCRIMINATOR  D');

      function connect(x1, ys1, x2, ys2, cls) { ys1.forEach(y1 => ys2.forEach(y2 => el('line', { x1, y1, x2, y2, class: 'arch-edge ' + (cls || '') }, svg))); }
      connect(colX[0], noise, colX[1], gH);
      connect(colX[1], gH, colX[2], fake);
      connect(colX[2], fake, colX[3], dH, 'eA');
      connect(colX[3], dH, colX[4], score, 'eA');
      // also: real data feeds D — the first term of the objective, E_x[log D(x)].
      // D trains on BOTH inputs (real -> 1, fake -> 0); G never sees real data.
      // Two squares, matching the two-component fake x̂ above: D sees the WHOLE
      // sample (x1 AND x2), not a summary of it.
      const realY = [240, 272];
      connect(colX[2], realY, colX[3], dH, 'eA');
      nodes(colX[2], realY, 'data');

      function nodes(x, ys, kind) { ys.forEach(y => { if (kind === 'data') el('rect', { x: x - 9, y: y - 9, width: 18, height: 18, rx: 3, class: 'arch-node data' }, svg); else el('circle', { cx: x, cy: y, r: kind === 'code' ? 12 : 9, class: 'arch-node ' + (kind === 'code' ? 'code' : 'neuron') }, svg); }); }
      nodes(colX[0], noise, 'data'); nodes(colX[1], gH, 'neuron'); nodes(colX[2], fake, 'code'); nodes(colX[3], dH, 'neuron'); nodes(colX[4], score, 'code');

      el('text', { x: colX[0], y: H - 8, 'text-anchor': 'middle', class: 'arch-label' }, svg, 'noise z');
      el('text', { x: colX[2], y: 96, 'text-anchor': 'middle', class: 'arch-label' }, svg, 'fake x̂');
      el('text', { x: colX[2] - 16, y: 246, 'text-anchor': 'end', class: 'arch-label' }, svg, 'real x');
      el('text', { x: colX[2] - 16, y: 262, 'text-anchor': 'end', class: 'arch-label' }, svg, '(x₁, x₂)');
      el('text', { x: colX[4], y: H / 2 - 18, 'text-anchor': 'middle', class: 'arch-label' }, svg, 'P(real)');
      // feedback arrow: D's verdict trains G
      el('path', { d: 'M ' + colX[4] + ' ' + (H / 2 + 16) + ' C ' + colX[4] + ' ' + (H - 14) + ', ' + colX[1] + ' ' + (H - 14) + ', ' + colX[1] + ' ' + (H - 60 + 18), fill: 'none', stroke: '#b14a2e', 'stroke-width': 1.6, 'stroke-dasharray': '5 4', 'marker-end': 'url(#gan-arrow)' }, svg);
      const defs = el('defs', {}, svg); const mk = el('marker', { id: 'gan-arrow', viewBox: '0 0 8 8', refX: 6, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs); el('path', { d: 'M0,0 L8,4 L0,8 z', fill: '#b14a2e' }, mk);
      el('text', { x: (colX[1] + colX[4]) / 2, y: H - 6, 'text-anchor': 'middle', class: 'arch-note' }, svg, 'D’s verdict is G’s training signal — fool the critic');
    })();

    // ---- (d) video: per-frame denoisers + temporal attention -----------
    (function video() {
      const svg = document.getElementById('video-arch-svg');
      if (!svg) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const W = 760, H = 300, NF = 4;
      const fx = []; for (let f = 0; f < NF; f++) fx.push(110 + f * (W - 220) / (NF - 1));
      const rowY = [80, 150, 220]; // 3 spatial layers per frame
      // per-frame spatial edges (vertical, within a frame)
      fx.forEach(x => {
        for (let r = 0; r < rowY.length - 1; r++) el('line', { x1: x, y1: rowY[r], x2: x, y2: rowY[r + 1], class: 'arch-edge' }, svg);
      });
      // temporal attention: horizontal dashed links across frames at the middle layer
      for (let f = 0; f < NF - 1; f++) {
        el('line', { x1: fx[f], y1: rowY[1], x2: fx[f + 1], y2: rowY[1], class: 'arch-edge eA', 'stroke-dasharray': '5 4', 'stroke-width': 1.6 }, svg);
      }
      // nodes
      fx.forEach((x, f) => {
        rowY.forEach((y, r) => { el('circle', { cx: x, cy: y, r: r === 1 ? 11 : 9, class: 'arch-node ' + (r === 1 ? 'code' : 'neuron') }, svg); });
        el('rect', { x: x - 13, y: rowY[0] - 40, width: 26, height: 20, rx: 3, class: 'arch-node data' }, svg);
        el('line', { x1: x, y1: rowY[0] - 20, x2: x, y2: rowY[0] - 9, class: 'arch-edge' }, svg);
        el('text', { x: x, y: H - 30, 'text-anchor': 'middle', class: 'arch-label' }, svg, 'frame ' + (f + 1));
      });
      el('text', { x: W / 2, y: 26, 'text-anchor': 'middle', class: 'arch-band' }, svg, 'ONE DENOISER, RUN ON EVERY FRAME');
      el('text', { x: fx[0] - 64, y: rowY[1] + 4, 'text-anchor': 'middle', class: 'arch-band', fill: '#b14a2e' }, svg, 'temporal');
      el('text', { x: fx[0] - 64, y: rowY[1] + 18, 'text-anchor': 'middle', class: 'arch-band', fill: '#b14a2e' }, svg, 'attention');
      el('text', { x: W / 2, y: H - 8, 'text-anchor': 'middle', class: 'arch-note' }, svg, 'red dashed = frames attend to each other along time → consistency');
    })();
  })();

  // ============================================================
  // Widget 5 · forward noising (the easy half of diffusion)
  //   Drag the noise level; watch a clean 8x8 image dissolve into
  //   static. x_sigma = x0 + sigma * eps  (eps fixed so it's smooth).
  // ============================================================
  (function initForwardNoise() {
    const canvas = document.getElementById('fwd-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const sigInp = document.getElementById('fwd-sigma');
    const sigVal = document.getElementById('fwd-sigma-val');
    const readout = document.getElementById('fwd-readout');
    const G = 8, P = G * G, idx = (r, c) => r * G + c;

    // a clean 8x8 "face" glyph in [0,1]
    const x0 = new Array(P).fill(0);
    for (let c = 0; c < G; c++) { x0[idx(0, c)] = 0.7; x0[idx(7, c)] = 0.7; }
    for (let r = 0; r < G; r++) { x0[idx(r, 0)] = 0.7; x0[idx(r, 7)] = 0.7; }
    x0[idx(2, 2)] = 1; x0[idx(2, 5)] = 1;                 // eyes
    x0[idx(5, 2)] = 0.8; x0[idx(6, 3)] = 0.9; x0[idx(6, 4)] = 0.9; x0[idx(5, 5)] = 0.8; // smile
    // fixed noise field so dragging the slider is smooth
    function randn() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    const eps = []; for (let i = 0; i < P; i++) eps.push(randn());

    function draw() {
      const sigma = parseFloat(sigInp.value);
      const w = canvas.width, h = canvas.height, cw = w / G, ch = h / G;
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#fbfaf7'; ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
        const v = Math.max(0, Math.min(1, x0[idx(r, c)] + sigma * eps[idx(r, c)]));
        ctx.fillStyle = 'rgba(31,29,26,' + v.toFixed(3) + ')';
        ctx.fillRect(c * cw + 0.5, r * ch + 0.5, cw - 1, ch - 1);
      }
      if (sigVal) sigVal.textContent = sigma.toFixed(2);
      if (readout) {
        const pct = Math.min(100, Math.round(sigma / 1.2 * 100));
        readout.innerHTML = 'noise level σ = <strong>' + sigma.toFixed(2) + '</strong> · the image is x₀ + σ·ε — ' +
          (sigma < 0.05 ? 'basically the clean face' : sigma > 0.9 ? 'almost pure static' : 'a recognizable face under ' + pct + '% noise');
      }
    }
    function fit() { const rect = canvas.getBoundingClientRect(); const size = Math.max(160, Math.min(rect.width, 260)); canvas.width = size; canvas.height = size; }
    sigInp.addEventListener('input', draw);
    fit(); draw();
  })();

  // ============================================================
  // Widget 6 · the LEARNED denoiser (train, then generate)
  //   Same DDIM sampler as the top demo, but the denoiser is now
  //   a trained MLP (EDM preconditioning), not the exact formula.
  // ============================================================
  (function initLearnedDiffusion() {
    const canvas = document.getElementById('ld-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const trainBtn = document.getElementById('ld-train');
    const genBtn   = document.getElementById('ld-sample');
    const resetBtn = document.getElementById('ld-reset');
    const shapeSel = document.getElementById('ld-shape');
    const readout  = document.getElementById('ld-readout');

    function lcg(s) { return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
    let rng = lcg(3);
    const randn = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const relu = x => x > 0 ? x : 0;
    function MLP(sizes) { const L = sizes.length - 1, W = [], b = []; for (let l = 0; l < L; l++) { const s = Math.sqrt(2 / sizes[l]); const m = []; for (let i = 0; i < sizes[l + 1]; i++) { const r = []; for (let j = 0; j < sizes[l]; j++) r.push(randn() * s); m.push(r); } W.push(m); b.push(new Array(sizes[l + 1]).fill(0)); } const z3 = a => a.map(r => r.map(() => 0)), z1 = a => a.map(() => 0); return { sizes, L, W, b, mW: W.map(z3), vW: W.map(z3), mb: b.map(z1), vb: b.map(z1), t: 0 }; }
    function fwd(net, x) { const acts = [x], pre = []; let a = x; for (let l = 0; l < net.L; l++) { const Wl = net.W[l], bl = net.b[l], z = new Array(Wl.length); for (let i = 0; i < Wl.length; i++) { let s = bl[i]; const Wi = Wl[i]; for (let j = 0; j < a.length; j++) s += Wi[j] * a[j]; z[i] = s; } pre.push(z); a = (l < net.L - 1) ? z.map(relu) : z.slice(); acts.push(a); } return { acts, pre, out: a }; }
    function bwd(net, fb, dOut) { const { acts, pre } = fb; const gW = net.W.map(W => W.map(r => r.map(() => 0))), gb = net.b.map(b => b.map(() => 0)); let dUp = null, dz; for (let l = net.L - 1; l >= 0; l--) { const Wl = net.W[l], aPrev = acts[l]; if (l === net.L - 1) dz = dOut.slice(); else { const z = pre[l]; dz = dUp.map((g, i) => g * (z[i] > 0 ? 1 : 0)); } for (let i = 0; i < Wl.length; i++) { gb[l][i] += dz[i]; const gWi = gW[l][i]; for (let j = 0; j < aPrev.length; j++) gWi[j] += dz[i] * aPrev[j]; } dUp = new Array(aPrev.length).fill(0); for (let i = 0; i < Wl.length; i++) { const Wi = Wl[i]; for (let j = 0; j < aPrev.length; j++) dUp[j] += Wi[j] * dz[i]; } } return { gW, gb }; }
    function adam(net, gW, gb, lr) { net.t++; const b1 = 0.9, b2 = 0.999, e = 1e-8, bc1 = 1 - Math.pow(b1, net.t), bc2 = 1 - Math.pow(b2, net.t); for (let l = 0; l < net.L; l++) for (let i = 0; i < net.W[l].length; i++) { for (let j = 0; j < net.W[l][i].length; j++) { const g = gW[l][i][j]; net.mW[l][i][j] = b1 * net.mW[l][i][j] + (1 - b1) * g; net.vW[l][i][j] = b2 * net.vW[l][i][j] + (1 - b2) * g * g; net.W[l][i][j] -= lr * (net.mW[l][i][j] / bc1) / (Math.sqrt(net.vW[l][i][j] / bc2) + e); } const gg = gb[l][i]; net.mb[l][i] = b1 * net.mb[l][i] + (1 - b1) * gg; net.vb[l][i] = b2 * net.vb[l][i] + (1 - b2) * gg * gg; net.b[l][i] -= lr * (net.mb[l][i] / bc1) / (Math.sqrt(net.vb[l][i] / bc2) + e); } }

    const SMAX = 1.2, SMIN = 0.02, SD = 0.5;
    function pre_(sig) { const ss = sig * sig + SD * SD; return { cin: 1 / Math.sqrt(ss), cskip: SD * SD / ss, cout: sig * SD / Math.sqrt(ss), cnoise: Math.log(sig) / 4 }; }
    function moons() { const d = []; for (let i = 0; i < 90; i++) { const a = Math.PI * (i / 89); d.push([Math.cos(a) - 0.5, Math.sin(a) - 0.25]); } for (let i = 0; i < 90; i++) { const a = Math.PI * (i / 89); d.push([Math.cos(a), -Math.sin(a) + 0.25]); } return d; }
    function ring() { const d = []; for (let k = 0; k < 80; k++) { const a = k / 80 * 2 * Math.PI; d.push([0.85 * Math.cos(a), 0.85 * Math.sin(a)]); } return d; }
    function smiley() { const p = []; for (let i = 0; i < 46; i++) { const a = i / 46 * 2 * Math.PI; p.push([0.82 * Math.cos(a), 0.82 * Math.sin(a)]); } for (let i = 0; i <= 18; i++) { const a = Math.PI * (1.15 + 0.7 * (i / 18)); p.push([0.5 * Math.cos(a), -0.1 + 0.5 * Math.sin(a)]); } p.push([-0.32, 0.3]); p.push([0.32, 0.3]); return p; }
    const SHAPES = { moons, ring, smiley };
    let DATA = moons();

    let F, iter, particles = null, raf = null, mode = 'idle'; // idle|training|sampling
    function reset() {
      cancelAnimationFrame(raf); mode = 'idle';
      rng = lcg(3); F = MLP([3, 64, 64, 2]); iter = 0; particles = null;
      if (trainBtn) trainBtn.textContent = '▶ Train denoiser';
      draw(); readout.innerHTML = 'untrained · press <strong>Train denoiser</strong> (then <strong>Generate</strong>). Try Generate <em>before</em> training to see noise stay noise.';
    }
    function trainIters(K) {
      let gW = F.W.map(W => W.map(r => r.map(() => 0))), gb = F.b.map(b => b.map(() => 0)), loss = 0;
      for (let n = 0; n < K; n++) {
        const x0 = DATA[Math.floor(rng() * DATA.length)];
        // EDM log-normal noise-level sampling: concentrates training on the mid-range
        // sigmas that actually matter, instead of wasting it on near-useless extremes.
        let sig = Math.exp(-1.2 + 1.2 * randn()); sig = Math.min(Math.max(sig, SMIN), SMAX * 4);
        const p = pre_(sig);
        const x = [x0[0] + sig * randn(), x0[1] + sig * randn()];
        const fb = fwd(F, [p.cin * x[0], p.cin * x[1], p.cnoise]);
        const tgt = [(x0[0] - p.cskip * x[0]) / p.cout, (x0[1] - p.cskip * x[1]) / p.cout];
        const d = [fb.out[0] - tgt[0], fb.out[1] - tgt[1]]; loss += d[0] * d[0] + d[1] * d[1];
        const bk = bwd(F, fb, d);
        for (let l = 0; l < F.L; l++) for (let i = 0; i < F.W[l].length; i++) { for (let j = 0; j < F.W[l][i].length; j++) gW[l][i][j] += bk.gW[l][i][j] / K; gb[l][i] += bk.gb[l][i] / K; }
      }
      adam(F, gW, gb, 5e-3); iter += K; return loss / K;
    }
    function denoise(x, sig) { const p = pre_(sig); const o = fwd(F, [p.cin * x[0], p.cin * x[1], p.cnoise]).out; return [p.cskip * x[0] + p.cout * o[0], p.cskip * x[1] + p.cout * o[1]]; }

    const VB = 2.6; function toPx(x, y) { const w = canvas.width, h = canvas.height; return [(x + VB / 2) / VB * w, h - (y + VB / 2) / VB * h]; }
    function draw() {
      const w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(63,140,99,0.45)';
      for (const d of DATA) { const [sx, sy] = toPx(d[0], d[1]); ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, 2 * Math.PI); ctx.fill(); }
      if (particles) { ctx.fillStyle = 'rgba(31,29,26,0.85)'; for (const pt of particles) { const [sx, sy] = toPx(pt[0], pt[1]); ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, 2 * Math.PI); ctx.fill(); } }
    }
    // Per frame: 10 small-batch Adam steps (~160 samples, same compute as before) but
    // 10x the optimizer updates -- one big batched step per frame converged far too slowly.
    function trainLoop() { if (mode !== 'training') return; let L = 0; for (let s = 0; s < 10; s++) L = trainIters(16); draw(); readout.innerHTML = 'training the denoiser · iter <strong>' + iter + '</strong> · loss <strong>' + L.toFixed(3) + '</strong> (green = data it’s learning to rebuild)'; raf = requestAnimationFrame(trainLoop); }
    let sgmas, sIdx;
    function geom(Ln) { const a = []; for (let i = 0; i < Ln; i++) { const t = i / (Ln - 1); a.push(Math.exp(Math.log(SMAX) * (1 - t) + Math.log(SMIN) * t)); } a.push(0); return a; }
    function sampleLoop() {
      if (mode !== 'sampling') return;
      if (sIdx >= sgmas.length - 1) { mode = 'idle'; draw(); readout.innerHTML = 'generated <strong>' + particles.length + '</strong> samples with the <em>learned</em> denoiser — same DDIM loop as the demo at the top of the page, but nothing here knew the data in closed form.'; return; }
      const sig = sgmas[sIdx], sn = sgmas[sIdx + 1];
      for (const pt of particles) { const x0 = denoise(pt, sig); const r = sig > 1e-9 ? sn / sig : 0; pt[0] = x0[0] + r * (pt[0] - x0[0]); pt[1] = x0[1] + r * (pt[1] - x0[1]); }
      sIdx++; draw(); readout.innerHTML = 'sampling · noise σ = <strong>' + sig.toFixed(3) + '</strong> · denoise → step → lower σ'; raf = requestAnimationFrame(sampleLoop);
    }
    function setTrain(on) { if (on) { mode = 'training'; trainBtn.textContent = '⏸ Pause'; cancelAnimationFrame(raf); raf = requestAnimationFrame(trainLoop); } else { mode = 'idle'; trainBtn.textContent = (iter > 0 ? '▶ Train more' : '▶ Train denoiser'); cancelAnimationFrame(raf); } }
    trainBtn.addEventListener('click', () => setTrain(mode !== 'training'));
    genBtn.addEventListener('click', () => { cancelAnimationFrame(raf); mode = 'sampling'; trainBtn.textContent = (iter > 0 ? '▶ Train more' : '▶ Train denoiser'); sgmas = geom(40); sIdx = 0; particles = []; for (let i = 0; i < 220; i++) particles.push([randn() * SMAX, randn() * SMAX]); draw(); raf = requestAnimationFrame(sampleLoop); });
    resetBtn.addEventListener('click', reset);
    if (shapeSel) shapeSel.addEventListener('change', () => { DATA = (SHAPES[shapeSel.value] || moons)(); reset(); });
    function fit() { const rect = canvas.getBoundingClientRect(); const size = Math.max(240, Math.min(rect.width, 380)); canvas.width = size; canvas.height = size; }
    fit(); reset();
  })();

  // ============================================================
  // Widget 7 · image -> video (per-frame flicker vs consistency)
  //   Two animations of the SAME motion. Left re-draws fresh noise
  //   every frame (independent samples -> flicker); right shares one
  //   fixed noise field across frames (the core video-diffusion fix).
  // ============================================================
  (function initVideo() {
    const naive = document.getElementById('vid-naive');
    if (!naive) return;
    const consist = document.getElementById('vid-consistent');
    const playBtn = document.getElementById('vid-play');
    const regenBtn = document.getElementById('vid-regen');
    const noiseInp = document.getElementById('vid-noise');
    const noiseVal = document.getElementById('vid-noise-val');
    const readout = document.getElementById('vid-readout');
    const nctx = naive.getContext('2d'), cctx = consist.getContext('2d');

    const G = 12, P = G * G, idx = (r, c) => r * G + c;
    function randn() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    let sharedNoise = []; function regen() { sharedNoise = []; for (let i = 0; i < P; i++) sharedNoise.push(randn()); }
    regen();

    // build a clean face for phase p in [0,1): sway + blink + smile
    function facePixels(p) {
      const x = new Array(P).fill(0);
      const dx = Math.round(1.6 * Math.sin(2 * Math.PI * p));        // horizontal sway
      const blink = (p > 0.46 && p < 0.56);                          // eyes closed mid-loop
      const smile = 0.5 + 0.5 * Math.sin(2 * Math.PI * p);           // mouth curvature 0..1
      const put = (r, c, v) => { const cc = c + dx; if (r >= 0 && r < G && cc >= 0 && cc < G) x[idx(r, cc)] = Math.max(x[idx(r, cc)], v); };
      // outline (a rounded square)
      for (let c = 2; c <= 9; c++) { put(1, c, 0.6); put(10, c, 0.6); }
      for (let r = 2; r <= 9; r++) { put(r, 1, 0.6); put(r, 10, 0.6); }
      // eyes
      if (blink) { put(4, 3, 0.9); put(4, 4, 0.9); put(4, 7, 0.9); put(4, 8, 0.9); }
      else { put(3, 4, 1); put(4, 4, 0.8); put(3, 7, 1); put(4, 7, 0.8); }
      // mouth: a smile arc whose ends rise with `smile`
      const up = Math.round(2 * smile);
      put(8, 4, 0.9); put(8, 7, 0.9); put(9, 5, 0.9); put(9, 6, 0.9);
      put(8 - up, 3, 0.85); put(8 - up, 8, 0.85);
      return x;
    }
    function drawFace(ctx, canvas, pix, noiseField, amp) {
      const w = canvas.width, h = canvas.height, cw = w / G, ch = h / G;
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#fbfaf7'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < P; i++) {
        const v = Math.max(0, Math.min(1, pix[i] + amp * noiseField[i]));
        if (v > 0.02) { ctx.fillStyle = 'rgba(31,29,26,' + v.toFixed(3) + ')'; const r = Math.floor(i / G), c = i % G; ctx.fillRect(c * cw + 0.5, r * ch + 0.5, cw - 1, ch - 1); }
      }
    }

    let frame = 0, raf = null, playing = false;
    const FRAMES = 24;
    function tick() {
      if (!playing) return;
      const p = (frame % FRAMES) / FRAMES;
      const amp = parseFloat(noiseInp.value);
      const pix = facePixels(p);
      // naive: a fresh independent noise field every frame
      const fresh = []; for (let i = 0; i < P; i++) fresh.push(randn());
      drawFace(nctx, naive, pix, fresh, amp);
      // consistent: the SAME shared noise field every frame
      drawFace(cctx, consist, pix, sharedNoise, amp);
      frame++;
      raf = setTimeout(() => requestAnimationFrame(tick), 90); // ~11 fps
    }
    function setPlay(on) { playing = on; playBtn.textContent = on ? '⏸ Pause' : '▶ Play'; if (on) tick(); else { clearTimeout(raf); } }

    function setReadout() { readout.innerHTML = 'same face, same motion (sway · blink · smile) · <strong>left</strong>: fresh noise each frame → flicker · <strong>right</strong>: one shared noise field → stable. Noise at 0 makes them identical.'; }
    playBtn.addEventListener('click', () => setPlay(!playing));
    regenBtn.addEventListener('click', () => { regen(); if (!playing) { const p = (frame % FRAMES) / FRAMES, amp = parseFloat(noiseInp.value), pix = facePixels(p); const fresh = []; for (let i = 0; i < P; i++) fresh.push(randn()); drawFace(nctx, naive, pix, fresh, amp); drawFace(cctx, consist, pix, sharedNoise, amp); } });
    noiseInp.addEventListener('input', () => { noiseVal.textContent = parseFloat(noiseInp.value).toFixed(2); });
    function fit(cv) { const rect = cv.getBoundingClientRect(); const size = Math.max(130, Math.min(rect.width, 200)); cv.width = size; cv.height = size; }
    fit(naive); fit(consist);
    noiseVal.textContent = parseFloat(noiseInp.value).toFixed(2);
    // draw first frame, then auto-play
    { const pix = facePixels(0), amp = parseFloat(noiseInp.value), fresh = []; for (let i = 0; i < P; i++) fresh.push(randn()); drawFace(nctx, naive, pix, fresh, amp); drawFace(cctx, consist, pix, sharedNoise, amp); }
    setReadout(); setPlay(true);
  })();

  // ============================================================
  // Widget 8 · frequency fingerprint (deepfake detection)
  //   A faint periodic "upsampling" artifact is invisible to the eye
  //   but lights up the 2D Fourier spectrum. Drag the artifact up
  //   and watch the detector's signal appear.
  // ============================================================
  (function initFFT() {
    const imgC = document.getElementById('fft-image');
    if (!imgC) return;
    const specC = document.getElementById('fft-spectrum');
    const artInp = document.getElementById('fft-artifact');
    const artVal = document.getElementById('fft-artifact-val');
    const readout = document.getElementById('fft-readout');
    const ictx = imgC.getContext('2d'), sctx = specC.getContext('2d');
    const N = 32, K = 8; // grid size, artifact frequency

    const base = new Array(N * N).fill(0);
    const blobs = [[10, 12, 6, 0.9], [22, 20, 7, 0.7], [16, 8, 5, 0.6]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0.12; for (const [bx, by, r, a] of blobs) v += a * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * r * r)); base[y * N + x] = Math.min(1, v); }

    function withArtifact(amp) { const out = base.slice(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] = Math.max(0, Math.min(1, out[y * N + x] + amp * Math.cos(2 * Math.PI * K * x / N) * Math.cos(2 * Math.PI * K * y / N))); return out; }
    function dftMag(im) {
      const mag = new Array(N * N).fill(0);
      for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) {
        let re = 0, imn = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const ang = -2 * Math.PI * (u * x + v * y) / N; const p = im[y * N + x]; re += p * Math.cos(ang); imn += p * Math.sin(ang); }
        mag[v * N + u] = Math.sqrt(re * re + imn * imn);
      }
      return mag;
    }
    function hiloRatio(mag) { let hi = 0, lo = 0; for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) { const du = Math.min(u, N - u), dv = Math.min(v, N - v); const r = Math.hypot(du, dv); const m = mag[v * N + u]; if (r > 6) hi += m * m; else lo += m * m; } return hi / (lo + 1e-9); }

    function drawGrid(ctx, canvas, vals, mapVal) {
      const w = canvas.width, h = canvas.height, cw = w / N, ch = h / N;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { ctx.fillStyle = mapVal(vals[y * N + x]); ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1); }
    }
    function render() {
      const amp = parseFloat(artInp.value);
      const im = withArtifact(amp);
      drawGrid(ictx, imgC, im, v => { const g = Math.round(255 * (1 - v)); return 'rgb(' + g + ',' + g + ',' + g + ')'; });
      const mag = dftMag(im);
      // log-scale + fftshift (DC to center)
      let mx = 0; const logm = mag.map(m => Math.log(1 + m)); for (const m of logm) if (m > mx) mx = m;
      const shifted = new Array(N * N);
      for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { const su = (u + N / 2) % N, sv = (v + N / 2) % N; shifted[sv * N + su] = logm[v * N + u] / (mx || 1); }
      drawGrid(sctx, specC, shifted, s => { const t = Math.min(1, s); const r = Math.round(20 + 225 * t), g = Math.round(18 + 120 * t), b = Math.round(14 + 40 * t); return 'rgb(' + r + ',' + g + ',' + b + ')'; });
      if (artVal) artVal.textContent = amp.toFixed(3);
      const ratio = hiloRatio(mag);
      readout.innerHTML = amp < 0.005
        ? 'no artifact · spectrum is a single bright center (all energy is low-frequency, like a real photo) · high-freq ratio <strong>' + ratio.toFixed(4) + '</strong>'
        : 'artifact barely visible in the image — but the spectrum now has <strong>four bright peaks</strong> at the grid frequency · high-freq ratio jumped to <strong>' + ratio.toFixed(4) + '</strong> (a detector flags this instantly)';
    }
    function fit() { [imgC, specC].forEach(cv => { const rect = cv.getBoundingClientRect(); const size = Math.max(140, Math.min(rect.width, 220)); cv.width = size; cv.height = size; }); }
    artInp.addEventListener('input', render);
    fit(); render();
  })();

  // ============================================================
  // Widget · Inline glossary (shared contract; grows with the lab)
  // ============================================================
  (function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'latent-space': {
        title: 'latent space',
        body:
          '<p>The model\'s private shorthand: instead of working with a million pixels, it describes each input as a short list of numbers (a "code"), and does its thinking there. Similar inputs get similar codes, and directions in code-land often mean something — one direction adds a smile, another turns the head. You met this in Lab 11 as the residual stream; here it is the code an autoencoder squeezes a face into and a decoder paints back out.</p>',
      },
      'generative-model': {
        title: 'generative model',
        body:
          '<p>A model of the <em>distribution</em> of data, not just a label for it. A classifier learns <code>p(label | image)</code>; a generative model learns <code>p(image)</code> well enough to <strong>sample new images</strong> that look like the training set. Deepfakes are what you get when that sampling is conditioned on a target identity.</p>',
      },
      'denoiser': {
        title: 'denoiser',
        body:
          '<p>A function that, shown a noisy input and told how much noise was added, guesses the clean original. Its ideal answer is the average of every clean image that could have produced what it sees, weighted by how likely each is (§4.2 calls this the posterior mean, <code>E[x₀ | xₜ]</code>). Diffusion models are <em>trained</em> denoisers; the 2D demo at the top uses an <em>exact</em> one because we chose the data ourselves. Sampling = denoise a little, lower the noise, repeat.</p>',
      },
      'score-function': {
        title: 'score function',
        body:
          '<p>The gradient of the log-density, <code>∇ₓ log p(x)</code> — the direction to nudge <code>x</code> so it looks more like real data ("uphill" in probability; <code>∇</code> is the gradient symbol nabla, not a delta). It is the denoiser\'s knowledge in different clothes: for Gaussian noise the ideal denoiser\'s <em>correction</em> gives the score exactly — <code>∇log p(x_σ) = (E[x₀|x_σ] − x_σ)/σ²</code> (Tweedie\'s formula) — and the noise guess is another rescaling, <code>ε̂ = −σ·∇log p</code>. That is why predicting the clean image, the noise, or the score are three views of one target. For the 2D demo the score is closed-form; for images a network learns it.</p>',
      },
    };

    function clearActive() { document.querySelectorAll('.gloss.active').forEach(t => t.classList.remove('active')); }
    function findInsertTarget(termEl) {
      let node = termEl && termEl.parentElement;
      while (node) {
        const tag = (node.tagName || '').toLowerCase();
        if (['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'figure', 'div'].includes(tag)) {
          if (node.id === 'glossary-panel' || node === panel) { node = node.parentElement; continue; }
          return node;
        }
        if (tag === 'li') { const list = node.parentElement; return (list && (list.tagName === 'OL' || list.tagName === 'UL')) ? list : node; }
        if (tag === 'main' || tag === 'body') return null;
        node = node.parentElement;
      }
      return null;
    }
    function show(id, el) {
      const entry = GLOSSARY[id]; if (!entry) return;
      clearActive(); if (el) el.classList.add('active');
      content.innerHTML = '<div class="glossary-panel-title">' + entry.title + '</div>' + entry.body;
      const target = el ? findInsertTarget(el) : null;
      if (target && target.parentNode && target.nextSibling !== panel) target.parentNode.insertBefore(panel, target.nextSibling);
      panel.hidden = false; panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';
    }
    function hide() { clearActive(); panel.hidden = true; }
    terms.forEach(t => {
      t.setAttribute('tabindex', '0'); t.setAttribute('role', 'button');
      const id = t.getAttribute('data-gloss');
      t.addEventListener('mouseenter', () => show(id, t));
      t.addEventListener('focus', () => show(id, t));
      t.addEventListener('click', (e) => { e.preventDefault(); show(id, t); });
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(id, t); } });
    });
    if (closeBtn) closeBtn.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || panel.hidden) return;
      if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
      hide();
    });
  })();

  // ============================================================
  // Widget · annotated code blocks (hover a line → explanation)
  //   Same contract as lab-02: each .annotated-code holds one
  //   <div class="code-step"> per source line. Hovering a line with
  //   data-explain lights up its data-step peers and fills the panel
  //   named by the block's data-panel attribute. Lines with class
  //   "doc" render as string-colored (multi-line docstrings that a
  //   per-line highlighter can't token-match).
  // ============================================================
  (function initAnnotatedCode() {
    const KEYWORDS = new Set(['def','for','in','return','if','else','elif','None','True','False','and','or','not','lambda','class','import','from','as','with','while','break','continue','pass','yield','raise','try','except','finally']);
    const BUILTINS = new Set(['range','len','zip','print','sum','enumerate','map','filter','list','dict','tuple','set','int','float','str','bool','abs','min','max','round','sorted','reversed']);
    const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    function highlight(text) {
      const re = /(#[^\n]*)|(f'(?:[^'\\]|\\.)*'|f"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?(?:e-?\d+)?\b)|([A-Za-z_]\w*)/g;
      let out = '', last = 0, m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) out += escapeHtml(text.substring(last, m.index));
        let cls = null;
        if (m[1]) cls = 'comment';
        else if (m[2]) cls = 'string';
        else if (m[3]) cls = 'number';
        else if (m[4]) {
          const w = m[4];
          if (KEYWORDS.has(w)) cls = 'keyword';
          else if (BUILTINS.has(w)) cls = 'builtin';
          else if (/^\s*\(/.test(text.substring(m.index + w.length))) cls = 'function';
        }
        out += cls ? '<span class="token ' + cls + '">' + escapeHtml(m[0]) + '</span>' : escapeHtml(m[0]);
        last = m.index + m[0].length;
      }
      if (last < text.length) out += escapeHtml(text.substring(last));
      return out;
    }
    document.querySelectorAll('.annotated-code').forEach(root => {
      root.querySelectorAll('.code-step').forEach(el => {
        el.innerHTML = el.classList.contains('doc')
          ? '<span class="token string">' + escapeHtml(el.textContent) + '</span>'
          : highlight(el.textContent);
      });
      const panel = document.getElementById(root.dataset.panel || '');
      const tagEl = panel && panel.querySelector('.code-explain-tag');
      const textEl = panel && panel.querySelector('.code-explain-text');
      if (!tagEl || !textEl) return;
      const defaultTag = tagEl.textContent, defaultText = textEl.innerHTML;
      root.querySelectorAll('.code-step[data-explain]').forEach(el => {
        const peers = root.querySelectorAll('.code-step[data-step="' + el.dataset.step + '"]');
        el.addEventListener('mouseenter', () => {
          peers.forEach(p => p.classList.add('active'));
          tagEl.textContent = el.dataset.stepName || el.dataset.step;
          textEl.innerHTML = el.dataset.explain;
          // KaTeX auto-render ran once at load; injected $...$ needs its own pass
          if (window.renderMathInElement) {
            renderMathInElement(textEl, { delimiters: [{ left: '$', right: '$', display: false }] });
          }
        });
        el.addEventListener('mouseleave', () => {
          peers.forEach(p => p.classList.remove('active'));
          tagEl.textContent = defaultTag;
          textEl.innerHTML = defaultText;
        });
      });
    });
  })();

  // ============================================================
  // Widget · §2.2 why L2 loves the blurry average
  //   Two plausible sharp pixel values; drag one prediction and
  //   watch expected L2 bottom out at their (blurry) mean.
  // ============================================================
  (function initL2Blur() {
    const canvas = document.getElementById('l2-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const slider = document.getElementById('l2-pred');
    const valEl = document.getElementById('l2-pred-val');
    const readout = document.getElementById('l2-readout');
    const M = [0.2, 0.8];
    const loss = p => 0.5 * (p - M[0]) ** 2 + 0.5 * (p - M[1]) ** 2;
    const W = canvas.width, H = canvas.height, mx = 42, axisY = H - 44;
    const X = v => mx + v * (W - 2 * mx);
    const maxL = loss(0);
    const Y = L => axisY - 16 - (L / maxL) * (axisY - 66);
    function draw() {
      const p = parseFloat(slider.value);
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = '#c9c3b6'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx, axisY); ctx.lineTo(W - mx, axisY); ctx.stroke();
      ctx.strokeStyle = '#8a857d'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i <= 100; i++) { const v = i / 100, x = X(v), y = Y(loss(v)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#b14a2e'; ctx.beginPath();
      ctx.moveTo(X(0.5), axisY); ctx.lineTo(X(0.5), Y(loss(0.5))); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#3f8c63';
      for (const m of M) { ctx.beginPath(); ctx.arc(X(m), axisY, 6, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#4a4742'; ctx.font = '12px -apple-system, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('dark strand 0.2', X(0.2), axisY + 18);
      ctx.fillText('bright skin 0.8', X(0.8), axisY + 18);
      ctx.fillStyle = '#b14a2e';
      ctx.fillText('the blurry mean', X(0.5), Y(loss(0.5)) - 10);
      ctx.fillStyle = '#1f1d1a';
      ctx.beginPath(); ctx.arc(X(p), Y(loss(p)), 6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(X(p), axisY, 4, 0, 7); ctx.fill();
      valEl.textContent = p.toFixed(2);
      const dNear = Math.min(Math.abs(p - M[0]), Math.abs(p - M[1]));
      readout.innerHTML = Math.abs(p - 0.5) < 0.02
        ? 'expected L2 = <strong>' + loss(p).toFixed(3) + '</strong> — the minimum. But the distance to the nearest sharp answer is now at its <em>maximum</em> (0.30): L2’s favorite output is the most obviously unreal one.'
        : 'expected L2 = <strong>' + loss(p).toFixed(3) + '</strong> · distance to nearest sharp answer = ' + dNear.toFixed(2);
    }
    slider.addEventListener('input', draw);
    draw();
  })();

  // ============================================================
  // Widget · §3.1 hover-to-explain minimax equation
  //   Each .eq-part carries a data-eq key; hover/focus/tap swaps
  //   the explanation into the shared panel. Injected text can
  //   contain $...$ — KaTeX auto-render ran once at load, so we
  //   re-render the panel on every swap.
  // ============================================================
  (function initMinimaxEq() {
    const root = document.getElementById('minimax-eq');
    if (!root) return;
    const tag = document.getElementById('minimax-eq-tag');
    const text = document.getElementById('minimax-eq-text');
    const EXPLAIN = {
      ming: {
        t: 'min over G · the generator’s move',
        b: 'The outer player. $G$ picks its weights to make the whole value as <em>small</em> as possible — but it appears only inside the right-hand term, through its fakes $G(z)$. Making that term small means pushing $D(G(z))$ toward $1$: the critic fooled.'
      },
      maxd: {
        t: 'max over D · the critic’s move, nested inside',
        b: 'For whatever $G$ does, $D$ best-responds: pick critic weights that make the value as <em>big</em> as possible. Read the equation inside-out — the critic sharpens first, then the generator plans against the sharpened critic. The alternating training loop below approximates this nesting one step at a time.'
      },
      real: {
        t: 'E over real data · score the real samples',
        b: 'Read $\\mathbb{E}_{x\\sim\\text{data}}[\\cdot]$ as “the average of the bracket when $x$ is drawn at random from the real data” — $\\sim$ means “distributed as.” $D(x)$ is the critic’s probability that the sample is real, so the term is the average log-score on real data, largest when the critic calls real real ($D(x)\\to 1$). In code it is a minibatch mean: <code>mean(log D(x)) over a real batch</code>. <strong>Only $D$ controls this term</strong> — the generator never touches real data.'
      },
      plus: {
        t: '+ · two halves of one log-loss',
        b: 'The sum makes $\\max_D$ exactly binary cross-entropy with labels real $= 1$, fake $= 0$: the critic is an ordinary logistic classifier trained by maximum likelihood. That is one of the reasons for the logs — see the “why the log?” callout below.'
      },
      fake: {
        t: 'E over noise · score the fakes — the contested term',
        b: 'Same $\\mathbb{E}$ grammar as the real term, but now the random draw is noise: average over $z \\sim \\mathcal{N}$ (a fresh fake per draw). Inside-out: $z$ is a noise draw, $G(z)$ is the fake built from it, $D(G(z))$ is the critic’s realness verdict on that fake, and $1 - D(G(z))$ is the probability it assigns to “this is fake.” $D$ wants the term big (catch every fake); $G$ wants it small (get called real). <strong>Both players touch this term</strong> — the adversarial game lives here.'
      }
    };
    const parts = root.querySelectorAll('.eq-part');
    function show(part) {
      const e = EXPLAIN[part.dataset.eq];
      if (!e) return;
      parts.forEach(p => p.classList.toggle('active', p === part));
      tag.textContent = e.t;
      text.innerHTML = e.b;
      if (window.renderMathInElement) {
        renderMathInElement(text, { delimiters: [{ left: '$', right: '$', display: false }] });
      }
    }
    parts.forEach(p => {
      p.addEventListener('mouseenter', () => show(p));
      p.addEventListener('focus', () => show(p));
      p.addEventListener('click', () => show(p));
    });
  })();

  // ============================================================
  // Widget · §3.1 non-saturating loss explorer
  //   Both generator loss curves over p = D(G(z)), with tangent
  //   segments at the chosen p — the tangent's steepness IS the
  //   push. Curves drawn once; dots/tangents/readout on input.
  // ============================================================
  (function initNonSatLoss() {
    const svg = document.getElementById('ns-svg');
    if (!svg) return;
    const slider = document.getElementById('ns-p');
    const pVal = document.getElementById('ns-p-val');
    const readout = document.getElementById('ns-readout');
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs, parent) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); (parent || svg).appendChild(el); return el; };
    const X0 = 50, X1 = 430, Y0 = 24, VMIN = -5, YS = 186 / 5;
    const px = p => X0 + (X1 - X0) * p;
    const py = v => Y0 + (-v) * YS;
    // frame + axis labels
    mk('line', { x1: X0, y1: Y0, x2: X1, y2: Y0, stroke: 'rgba(31,29,26,0.25)' });
    mk('line', { x1: X0, y1: Y0, x2: X0, y2: py(VMIN), stroke: 'rgba(31,29,26,0.25)' });
    mk('text', { x: X0 - 8, y: Y0 + 4, 'text-anchor': 'end', class: 'arch-label' }).textContent = '0';
    mk('text', { x: X0 - 8, y: py(VMIN) + 4, 'text-anchor': 'end', class: 'arch-label' }).textContent = '−5';
    mk('text', { x: X0, y: py(VMIN) + 18, 'text-anchor': 'middle', class: 'arch-label' }).textContent = 'p = 0';
    mk('text', { x: px(0.5), y: py(VMIN) + 18, 'text-anchor': 'middle', class: 'arch-label' }).textContent = '½';
    mk('text', { x: X1, y: py(VMIN) + 18, 'text-anchor': 'middle', class: 'arch-label' }).textContent = 'p = 1';
    // static curves
    function curvePath(f, pa, pb) {
      let d = '';
      for (let p = pa; p <= pb + 1e-9; p += 0.004) {
        d += (d ? 'L' : 'M') + px(p).toFixed(1) + ' ' + py(Math.max(VMIN, f(p))).toFixed(1) + ' ';
      }
      return d;
    }
    mk('path', { d: curvePath(p => Math.log(1 - p), 0.005, 1 - Math.exp(-5)), fill: 'none', stroke: '#8a857d', 'stroke-width': 2 });
    mk('path', { d: curvePath(Math.log, Math.exp(-5), 0.995), fill: 'none', stroke: '#b14a2e', 'stroke-width': 2 });
    // dynamic layer, clipped to the plot area so tangents can't escape
    const defs = mk('defs', {});
    const clip = mk('clipPath', { id: 'ns-clip' }, defs);
    mk('rect', { x: X0 - 2, y: Y0 - 6, width: X1 - X0 + 34, height: py(VMIN) - Y0 + 12 }, clip);
    const dyn = mk('g', { 'clip-path': 'url(#ns-clip)' });
    function update() {
      const p = parseFloat(slider.value);
      pVal.textContent = p.toFixed(2);
      while (dyn.firstChild) dyn.removeChild(dyn.firstChild);
      mk('line', { x1: px(p), y1: Y0, x2: px(p), y2: py(VMIN), stroke: 'rgba(31,29,26,0.3)', 'stroke-dasharray': '4 3' }, dyn);
      // one entry per loss curve: value, slope d/dp, color
      const items = [
        { v: Math.log(1 - p), m: -1 / (1 - p), color: '#8a857d' },
        { v: Math.log(p), m: 1 / p, color: '#b14a2e' }
      ];
      for (const it of items) {
        const cx = px(p), cy = py(Math.max(VMIN, it.v));
        // tangent: pixel-space direction (dx/dp, dpy/dp) = (X1-X0, -m*YS), normalized to ±34px
        let dx = X1 - X0, dy = -it.m * YS;
        const len = Math.hypot(dx, dy); dx = dx / len * 34; dy = dy / len * 34;
        mk('line', { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy, stroke: it.color, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.85 }, dyn);
        mk('circle', { cx, cy, r: 5, fill: it.color }, dyn);
      }
      const mMM = 1 / (1 - p), mNS = 1 / p, ratio = (1 - p) / p;
      let note;
      if (p <= 0.15) note = 'this is where early training lives — the fix shouts, minimax whispers.';
      else if (p < 0.5) note = 'the fakes are still being caught; the fix still pushes harder.';
      else note = 'G is winning — minimax is the steeper one now, but the coaching is no longer needed.';
      readout.innerHTML = 'at grade p = ' + p.toFixed(2) +
        ' · volume from log(1−p) = <strong>' + mMM.toFixed(2) + '</strong>' +
        ' · from log p = <strong>' + mNS.toFixed(1) + '</strong>' +
        (ratio >= 1 ? ' — the fix is <strong>' + ratio.toFixed(0) + '×</strong> louder · ' : ' · ') + note;
    }
    slider.addEventListener('input', update);
    document.getElementById('ns-early').addEventListener('click', () => { slider.value = 0.01; update(); });
    update();
  })();

  // ============================================================
  // Widget · §7.2 classifier-free guidance on a two-word world
  //   Two labeled clusters ("cat" left, "dog" right). Exact GMM
  //   denoisers (same posterior-mean math as the top demo):
  //   conditional = chosen cluster only, unconditional = all data.
  //   Guided guess: x0_u + s*(x0_c - x0_u), run through DDIM.
  // ============================================================
  (function initGuidedDiffusion() {
    const canvas = document.getElementById('gd-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const promptSel = document.getElementById('gd-prompt');
    const sInp = document.getElementById('gd-s');
    const sVal = document.getElementById('gd-s-val');
    const goBtn = document.getElementById('gd-go');
    const readout = document.getElementById('gd-readout');

    const S0 = 0.05, SIGMA_MAX = 1.3, SIGMA_MIN = 0.02, N = 200, STEPS = 40;
    function ringPts(cx, cy, r, n) {
      const pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
      return pts;
    }
    const CAT = ringPts(-0.55, 0.05, 0.26, 14);
    const DOG = ringPts(0.55, 0.05, 0.26, 14);
    const ALL = CAT.concat(DOG);
    const SETS = { cat: CAT, dog: DOG };

    // exact posterior mean E[x0 | x, sigma] for a uniform GMM on pts
    function denoiseSet(px, py, sigma, pts) {
      const v = S0 * S0 + sigma * sigma;
      let max = -Infinity;
      const logits = new Array(pts.length);
      for (let k = 0; k < pts.length; k++) {
        const dx = px - pts[k].x, dy = py - pts[k].y;
        const l = -(dx * dx + dy * dy) / (2 * v);
        logits[k] = l; if (l > max) max = l;
      }
      let sum = 0;
      for (let k = 0; k < pts.length; k++) { logits[k] = Math.exp(logits[k] - max); sum += logits[k]; }
      let mx = 0, my = 0;
      for (let k = 0; k < pts.length; k++) { const r = logits[k] / sum; mx += r * pts[k].x; my += r * pts[k].y; }
      return [mx, my];
    }
    function guidedX0(px, py, sigma, condPts, s) {
      const u = denoiseSet(px, py, sigma, ALL);
      const c = denoiseSet(px, py, sigma, condPts);
      return [u[0] + s * (c[0] - u[0]), u[1] + s * (c[1] - u[1])];
    }
    function randn() {
      let u = 0, w = 0;
      while (u === 0) u = Math.random();
      while (w === 0) w = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
    }
    function geomSigmas() {
      const arr = [];
      for (let i = 0; i < STEPS; i++) {
        const t = i / (STEPS - 1);
        arr.push(Math.exp(Math.log(SIGMA_MAX) * (1 - t) + Math.log(SIGMA_MIN) * t));
      }
      arr.push(0);
      return arr;
    }

    const VB = 2.6;
    function toPx(x, y) { const w = canvas.width, h = canvas.height; return [(x + VB / 2) / VB * w, h - (y + VB / 2) / VB * h]; }

    let particles = [], sigmas = [], stepIdx = 0, raf = null;

    function draw() {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const tint = (pts, color) => {
        ctx.fillStyle = color;
        for (const p of pts) { const [sx, sy] = toPx(p.x, p.y); ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, 2 * Math.PI); ctx.fill(); }
      };
      tint(CAT, 'rgba(177,74,46,0.3)');
      tint(DOG, 'rgba(47,125,110,0.3)');
      ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(177,74,46,0.8)'; ctx.fillText('"cat"', toPx(-0.55, -0.38)[0], toPx(-0.55, -0.38)[1]);
      ctx.fillStyle = 'rgba(47,125,110,0.8)'; ctx.fillText('"dog"', toPx(0.55, -0.38)[0], toPx(0.55, -0.38)[1]);
      ctx.fillStyle = 'rgba(31,29,26,0.82)';
      for (const p of particles) { const [sx, sy] = toPx(p.x, p.y); ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, 2 * Math.PI); ctx.fill(); }
    }

    function finish() {
      const prompt = promptSel.value, target = SETS[prompt];
      let obey = 0;
      const counts = new Array(target.length).fill(0);
      for (const p of particles) {
        const dCat = Math.hypot(p.x + 0.55, p.y - 0.05), dDog = Math.hypot(p.x - 0.55, p.y - 0.05);
        if ((prompt === 'cat' ? dCat : dDog) <= (prompt === 'cat' ? dDog : dCat)) obey++;
        let bi = 0, bd = Infinity;
        target.forEach((q, i) => { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; bi = i; } });
        counts[bi]++;
      }
      const covered = counts.filter(c => c > 0).length;
      readout.innerHTML = '<span class="df-done">✓ sampled</span> · s = ' + parseFloat(sInp.value).toFixed(2) +
        ' · <strong>' + Math.round(100 * obey / particles.length) + '%</strong> landed on "' + prompt + '"' +
        ' · cluster coverage <strong>' + covered + '/' + target.length + '</strong> points' +
        (covered < target.length ? ' — the missing ones face the other word' : '');
    }

    function tick() {
      if (stepIdx >= sigmas.length - 1) { raf = null; draw(); finish(); return; }
      const sig = sigmas[stepIdx], sigN = sigmas[stepIdx + 1];
      const s = parseFloat(sInp.value), condPts = SETS[promptSel.value];
      for (const p of particles) {
        const x0 = guidedX0(p.x, p.y, sig, condPts, s);
        p.x = x0[0] + (sigN / sig) * (p.x - x0[0]);
        p.y = x0[1] + (sigN / sig) * (p.y - x0[1]);
      }
      stepIdx++;
      draw();
      readout.innerHTML = 'step ' + stepIdx + '/' + (sigmas.length - 1) + ' · σ = ' + sigN.toFixed(3) + ' · denoise twice (with and without the prompt) → blend → step';
      raf = requestAnimationFrame(tick);
    }

    function go() {
      if (raf) cancelAnimationFrame(raf);
      particles = [];
      for (let i = 0; i < N; i++) particles.push({ x: randn() * SIGMA_MAX, y: randn() * SIGMA_MAX });
      sigmas = geomSigmas(); stepIdx = 0;
      raf = requestAnimationFrame(tick);
    }

    sInp.addEventListener('input', () => { sVal.textContent = parseFloat(sInp.value).toFixed(2); });
    goBtn.addEventListener('click', go);
    draw();
    readout.innerHTML = 'pick a prompt and a guidance scale, then press <strong>Generate</strong>';
  })();

  // ============================================================
  // Widget · §4.3 DDIM stepper on a number line
  //   The callout's exact toy numbers, animated one press at a time:
  //   x0=0.8, x starts at 0.2, σ schedule 0.5→0.3→0.15→0.05→0.
  // ============================================================
  (function initDdimStepper() {
    const canvas = document.getElementById('ddim-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const stepBtn = document.getElementById('ddim-step-btn');
    const resetBtn = document.getElementById('ddim-reset');
    const readout = document.getElementById('ddim-readout');
    const SIG = [0.5, 0.3, 0.15, 0.05, 0], X0 = 0.8;
    const W = canvas.width, H = canvas.height, mx = 42, axisY = H - 48;
    const PX = v => mx + v * (W - 2 * mx);
    let x, k, trail;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = '#c9c3b6'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx, axisY); ctx.lineTo(W - mx, axisY); ctx.stroke();
      ctx.fillStyle = '#8a857d'; ctx.font = '11px -apple-system, sans-serif'; ctx.textAlign = 'center';
      for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        ctx.beginPath(); ctx.moveTo(PX(t), axisY - 3); ctx.lineTo(PX(t), axisY + 3); ctx.stroke();
        ctx.fillText(t.toFixed(1), PX(t), axisY + 18);
      }
      ctx.fillStyle = '#3f8c63';
      ctx.beginPath(); ctx.arc(PX(X0), axisY, 7, 0, 7); ctx.fill();
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillText('x̂0 (clean)', PX(X0), axisY - 40);
      // ghost trail of previous positions
      for (let i = 0; i < trail.length - 1; i++) {
        ctx.fillStyle = 'rgba(31,29,26,' + (0.15 + 0.35 * i / Math.max(1, trail.length - 1)) + ')';
        ctx.beginPath(); ctx.arc(PX(trail[i]), axisY, 5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#1f1d1a';
      ctx.beginPath(); ctx.arc(PX(x), axisY, 7, 0, 7); ctx.fill();
      ctx.fillText('x = ' + x.toFixed(2) + '  ·  σ = ' + SIG[k].toFixed(2), PX(x), axisY - 22);
    }
    function reset() {
      x = 0.2; k = 0; trail = [0.2]; stepBtn.disabled = false;
      draw();
      readout.innerHTML = 'σ = 0.50 · x = 0.20 — the noised pixel from the walkthrough. Press <strong>Step</strong>.';
    }
    function step() {
      if (k >= SIG.length - 1) return;
      const s = SIG[k], sn = SIG[k + 1];
      const nx = X0 + (sn / s) * (x - X0);
      readout.innerHTML = 'x ← 0.8 + (' + sn.toFixed(2) + '/' + s.toFixed(2) + ')·(' + x.toFixed(2) + ' − 0.8) = <strong>' + nx.toFixed(2) + '</strong>' +
        (sn === 0 ? ' — σ hit 0: nothing of the gap is kept, x lands exactly on the clean value.' : ' · kept ' + Math.round((sn / s) * 100) + '% of the remaining gap');
      x = nx; k++; trail.push(x);
      draw();
      if (k >= SIG.length - 1) stepBtn.disabled = true;
    }
    stepBtn.addEventListener('click', step);
    resetBtn.addEventListener('click', reset);
    reset();
  })();


})();
