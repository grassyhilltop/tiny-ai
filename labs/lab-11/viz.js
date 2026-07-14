/* ============================================================
 * Lab 07 — viz.js
 *
 * Widgets:
 *   1. #viz-try-it          — 2D refusal-direction projection toy
 *   2. #viz-defense-stack   — clickable defense-in-depth layers
 *   3. #glossary-panel      — inline glossary (shared pattern)
 * ============================================================ */

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent, text) {
    const node = document.createElementNS(SVG_NS, name);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  // ============================================================
  // Widget 1 · Refusal-direction projection (2D toy)
  // ============================================================
  (function initRefViz() {
    const svg = document.getElementById('ref-svg');
    if (!svg) return;
    const readout      = document.getElementById('ref-readout');
    const epsSlider    = document.getElementById('ref-eps');
    const epsVal       = document.getElementById('ref-eps-val');
    const abliterateBtn= document.getElementById('ref-abliterate');
    const resetBtn     = document.getElementById('ref-reset');

    // Coordinate transform
    const VB = 480, DOM = 3;
    const toSvg = (x, y) => [
      (x + DOM) / (2 * DOM) * VB,
      VB - (y + DOM) / (2 * DOM) * VB,
    ];
    const toDom = (sx, sy) => [
      (sx / VB) * (2 * DOM) - DOM,
      ((VB - sy) / VB) * (2 * DOM) - DOM,
    ];

    // LCG for deterministic clusters
    function lcg(seed) {
      let s = seed >>> 0;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    }
    function randn(rng) {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    function makeData() {
      const rng = lcg(13);
      const pts = [];
      // Refusal cluster (top-right) and compliance cluster (bottom-left)
      for (let i = 0; i < 20; i++) pts.push({ x:  1.1 + 0.45 * randn(rng), y:  1.0 + 0.45 * randn(rng), label: 'refuse' });
      for (let i = 0; i < 20; i++) pts.push({ x: -1.0 + 0.45 * randn(rng), y: -0.8 + 0.45 * randn(rng), label: 'comply' });
      return pts;
    }
    const DATA = makeData();

    // Refusal direction = mean(refuse) - mean(comply), normalized
    function meanLabel(label) {
      const xs = DATA.filter(p => p.label === label);
      const x = xs.reduce((a, b) => a + b.x, 0) / xs.length;
      const y = xs.reduce((a, b) => a + b.y, 0) / xs.length;
      return { x, y };
    }
    const mr = meanLabel('refuse'), mc = meanLabel('comply');
    const wx_raw = mr.x - mc.x, wy_raw = mr.y - mc.y;
    const wnorm = Math.sqrt(wx_raw * wx_raw + wy_raw * wy_raw);
    const wx = wx_raw / wnorm, wy = wy_raw / wnorm;

    // Decision boundary: line through the midpoint, perpendicular to w
    const mid = { x: (mr.x + mc.x) / 2, y: (mr.y + mc.y) / 2 };
    function classify(px, py) {
      // sign((p - mid) · w) > 0 → refuse, ≤ 0 → comply
      return ((px - mid.x) * wx + (py - mid.y) * wy) > 0 ? 'refuse' : 'comply';
    }
    function projectionMagnitude(px, py) {
      return (px - mid.x) * wx + (py - mid.y) * wy;
    }

    // State
    let probe = null;            // {x, y} in dom coords (the original)
    let abliterated = null;      // {x, y} after projection
    let eps = parseFloat(epsSlider.value);

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      // Axes
      const [ax0, ay0] = toSvg(0, -DOM);
      const [ax1, ay1] = toSvg(0,  DOM);
      el('line', { class: 'axis', x1: ax0, y1: ay0, x2: ax1, y2: ay1 }, svg);
      const [bx0, by0] = toSvg(-DOM, 0);
      const [bx1, by1] = toSvg( DOM, 0);
      el('line', { class: 'axis', x1: bx0, y1: by0, x2: bx1, y2: by1 }, svg);

      // Decision boundary line (perpendicular to w through mid).
      // Parametric form: mid + t * perp(w), draw across the viewBox.
      const perpx = -wy, perpy = wx;
      const T = 6;
      const [lx0, ly0] = toSvg(mid.x - T * perpx, mid.y - T * perpy);
      const [lx1, ly1] = toSvg(mid.x + T * perpx, mid.y + T * perpy);
      el('line', { class: 'boundary', x1: lx0, y1: ly0, x2: lx1, y2: ly1 }, svg);

      // Refusal direction arrow (from mid, length 1.4 in dom units)
      const ARR_LEN = 1.4;
      const aTailX = mid.x, aTailY = mid.y;
      const aHeadX = mid.x + ARR_LEN * wx, aHeadY = mid.y + ARR_LEN * wy;
      const [sx0, sy0] = toSvg(aTailX, aTailY);
      const [sx1, sy1] = toSvg(aHeadX, aHeadY);
      el('line', { class: 'refusal-arrow', x1: sx0, y1: sy0, x2: sx1, y2: sy1 }, svg);
      // Arrowhead — small triangle at the head
      const ah = 6;
      const px = sx1 - sx0, py = sy1 - sy0;
      const pl = Math.sqrt(px * px + py * py);
      const ux = px / pl, uy = py / pl;
      const vx = -uy, vy = ux;
      const t1x = sx1 - ah * ux + ah * 0.55 * vx;
      const t1y = sy1 - ah * uy + ah * 0.55 * vy;
      const t2x = sx1 - ah * ux - ah * 0.55 * vx;
      const t2y = sy1 - ah * uy - ah * 0.55 * vy;
      const points = sx1 + ',' + sy1 + ' ' + t1x + ',' + t1y + ' ' + t2x + ',' + t2y;
      el('polygon', { class: 'refusal-arrow-head', points }, svg);
      // Label
      const [lblX, lblY] = toSvg(aHeadX + 0.15 * wx + 0.2 * vx,
                                  aHeadY + 0.15 * wy + 0.2 * vy);
      el('text', { class: 'refusal-label', x: lblX, y: lblY }, svg, 'w (refusal direction)');

      // Data points
      DATA.forEach(p => {
        const [sx, sy] = toSvg(p.x, p.y);
        el('circle', {
          class: 'pt ' + (p.label === 'refuse' ? 'refuse' : 'comply'),
          cx: sx, cy: sy, r: 5,
        }, svg);
      });

      // Verdict chips at top-corners
      el('rect', { class: 'verdict-bg', x: 320, y: 12, width: 144, height: 28, rx: 14 }, svg);
      el('text', { class: 'verdict-text refuse', x: 392, y: 30 }, svg, 'green side · REFUSE');
      el('rect', { class: 'verdict-bg', x: 16, y: 12, width: 144, height: 28, rx: 14 }, svg);
      el('text', { class: 'verdict-text comply', x: 88, y: 30 }, svg, 'orange side · COMPLY');

      // Probe (if present)
      if (probe) {
        const [px2, py2] = toSvg(probe.x, probe.y);
        el('circle', { class: 'probe', cx: px2, cy: py2, r: 7 }, svg);
        if (abliterated) {
          const [ax, ay] = toSvg(abliterated.x, abliterated.y);
          // Trail from probe to abliterated point
          el('line', {
            class: 'probe-trail',
            x1: px2, y1: py2, x2: ax, y2: ay,
          }, svg);
          el('circle', { class: 'probe abliterated', cx: ax, cy: ay, r: 7 }, svg);
          el('text', {
            class: 'probe-label',
            x: ax + 10, y: ay - 8,
          }, svg, 'x′');
          el('text', {
            class: 'probe-label',
            x: px2 + 10, y: py2 - 8,
          }, svg, 'x');
        } else {
          el('text', {
            class: 'probe-label',
            x: px2 + 10, y: py2 - 8,
          }, svg, 'x');
        }
      }
    }

    function setEps(v) {
      eps = parseFloat(v);
      epsVal.textContent = eps.toFixed(2);
      // Recompute abliterated if a probe exists
      if (probe) {
        recomputeAbliteration();
        updateReadout();
        render();
      }
    }

    function recomputeAbliteration() {
      // x' = x - eps * (x · w) where the projection is measured relative to mid
      const m = projectionMagnitude(probe.x, probe.y);
      abliterated = {
        x: probe.x - eps * m * wx,
        y: probe.y - eps * m * wy,
      };
    }

    function updateReadout() {
      if (!probe) {
        readout.textContent = 'Click anywhere on the plane to add a probe prompt.';
        return;
      }
      const beforeCls = classify(probe.x, probe.y);
      const afterCls  = abliterated ? classify(abliterated.x, abliterated.y) : null;
      const m = projectionMagnitude(probe.x, probe.y);
      let txt = 'x = (' + probe.x.toFixed(2) + ', ' + probe.y.toFixed(2) + ')';
      txt += '  ·  proj = ' + m.toFixed(2);
      txt += '  ·  before: ' + beforeCls.toUpperCase();
      if (abliterated) txt += '  →  after: ' + afterCls.toUpperCase();
      readout.textContent = txt;
    }

    // Click on the SVG to place a probe
    svg.addEventListener('click', (ev) => {
      const rect = svg.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * VB;
      const sy = ((ev.clientY - rect.top)  / rect.height) * VB;
      const [x, y] = toDom(sx, sy);
      probe = { x, y };
      abliterated = null;
      abliterateBtn.disabled = false;
      updateReadout();
      render();
    });

    abliterateBtn.addEventListener('click', () => {
      if (!probe) return;
      recomputeAbliteration();
      updateReadout();
      render();
    });

    resetBtn.addEventListener('click', () => {
      probe = null;
      abliterated = null;
      abliterateBtn.disabled = true;
      epsSlider.value = '1.0';
      setEps('1.0');
    });

    epsSlider.addEventListener('input', e => setEps(e.target.value));

    // Initial render
    setEps(epsSlider.value);
    render();
  })();

  // ============================================================
  // Widget 1b · Latent space — analogy arithmetic (§2)
  //   Meaning = position, concepts = directions. A tiny 2D space
  //   where B - A + C lands on the analogy's answer.
  // ============================================================
  (function initLatentSpace() {
    const svg = document.getElementById('lat-svg');
    if (!svg) return;
    const SVGNS = 'http://www.w3.org/2000/svg';

    // x = gender (0 female … 2 male), y = royalty (0 commoner … 2 monarch)
    const VOCAB = {
      woman: [0, 0], man: [2, 0],
      lady:  [0, 1], lord: [2, 1],
      queen: [0, 2], king: [2, 2],
    };
    const WORDS = Object.keys(VOCAB);

    // data -> svg coords
    const sx = (x) => 70 + (x / 2) * 320;          // 70 … 390
    const sy = (y) => 280 - (y / 2) * 220;         // 280 … 60

    const aSel = document.getElementById('lat-a');
    const bSel = document.getElementById('lat-b');
    const cSel = document.getElementById('lat-c');
    const goBtn = document.getElementById('lat-go');
    const resetBtn = document.getElementById('lat-reset');
    const readout = document.getElementById('lat-readout');

    [aSel, bSel, cSel].forEach((sel) => {
      WORDS.forEach((w) => {
        const o = document.createElement('option');
        o.value = w; o.textContent = w; sel.appendChild(o);
      });
    });
    aSel.value = 'man'; bSel.value = 'king'; cSel.value = 'woman';

    function el(tag, attrs, text) {
      const e = document.createElementNS(SVGNS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      return e;
    }

    function solve(a, b, c) {
      const A = VOCAB[a], B = VOCAB[b], C = VOCAB[c];
      const v = [B[0] - A[0] + C[0], B[1] - A[1] + C[1]];
      let best = null, bd = Infinity;
      for (const w of WORDS) {
        if (w === a || w === b || w === c) continue;
        const p = VOCAB[w];
        const d = (p[0] - v[0]) ** 2 + (p[1] - v[1]) ** 2;
        if (d < bd) { bd = d; best = w; }
      }
      return { v, best, exact: bd === 0 };
    }

    function render(showSolve) {
      const a = aSel.value, b = bSel.value, c = cSel.value;
      svg.textContent = '';

      // faint grid axes
      svg.appendChild(el('line', { x1: sx(0), y1: sy(0), x2: sx(2), y2: sy(0), stroke: '#d8d2c4', 'stroke-width': 1 }));
      svg.appendChild(el('line', { x1: sx(0), y1: sy(0), x2: sx(0), y2: sy(2), stroke: '#d8d2c4', 'stroke-width': 1 }));
      // axis labels
      svg.appendChild(el('text', { x: sx(1), y: 312, 'text-anchor': 'middle', class: 'lat-axis-lbl' }, '→ gender'));
      const yl = el('text', { x: 30, y: sy(1), 'text-anchor': 'middle', class: 'lat-axis-lbl', transform: `rotate(-90 30 ${sy(1)})` }, '↑ royalty');
      svg.appendChild(yl);

      const result = solve(a, b, c);

      // relation arrows: A->B and C->answer
      const arrow = (p, q, cls) => {
        svg.appendChild(el('line', {
          x1: sx(p[0]), y1: sy(p[1]), x2: sx(q[0]), y2: sy(q[1]),
          class: cls, 'marker-end': 'url(#lat-arr)',
        }));
      };
      if (showSolve) {
        arrow(VOCAB[a], VOCAB[b], 'lat-rel');
        arrow(VOCAB[c], result.v, 'lat-rel lat-rel-c');
      }

      // points
      for (const w of WORDS) {
        const [x, y] = VOCAB[w];
        let cls = 'lat-pt';
        if (w === a) cls += ' lat-a'; else if (w === b) cls += ' lat-b';
        else if (w === c) cls += ' lat-c';
        else if (showSolve && w === result.best) cls += ' lat-ans';
        svg.appendChild(el('circle', { cx: sx(x), cy: sy(y), r: 7, class: cls }));
        svg.appendChild(el('text', { x: sx(x), y: sy(y) - 12, 'text-anchor': 'middle', class: 'lat-lbl' }, w));
      }

      // result star
      if (showSolve) {
        svg.appendChild(el('circle', { cx: sx(result.v[0]), cy: sy(result.v[1]), r: 5, class: 'lat-result' }));
        readout.innerHTML = `<code>${b} − ${a} + ${c} = (${result.v[0]}, ${result.v[1]})</code> ≈ <strong>${result.best}</strong>` +
          (result.exact ? ' <span class="lat-exact">exact ✓</span>' : ' <span class="lat-near">(nearest)</span>');
      } else {
        readout.textContent = '';
      }
    }

    // arrowhead marker
    const defs = el('defs', {});
    const marker = el('marker', { id: 'lat-arr', markerWidth: 7, markerHeight: 7, refX: 6, refY: 3, orient: 'auto' });
    marker.appendChild(el('path', { d: 'M0,0 L6,3 L0,6 z', fill: '#b14a2e' }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    goBtn.addEventListener('click', () => render(true));
    resetBtn.addEventListener('click', () => render(false));
    [aSel, bSel, cSel].forEach((s) => s.addEventListener('change', () => render(false)));
    render(true);
  })();

  // ============================================================
  // Widget 1c · Activation-space ablation playground (§3)
  //   A real (tiny) network deposits an activation in a 2D
  //   "residual stream"; the refusal direction is computed from
  //   cached harmful/harmless activations exactly as FailSpy does;
  //   the directional_hook (a - (a·d)d) is applied live.
  //   Two instances: shallow 2→2 and deep 2→3→2. The activation-
  //   space half is identical — only the left-hand network differs,
  //   so the reader sees abliteration act on the layer OUTPUT
  //   regardless of depth (just like hooking resid_post/mlp_out).
  // ============================================================
  (function initAblationPlaygrounds() {
    // ---- deterministic cached "calibration" activations ----
    function lcg(seed) {
      let s = seed >>> 0;
      return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    }
    function randn(rng) {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    const rng = lcg(7);
    const HARMFUL = [], HARMLESS = [];
    for (let i = 0; i < 20; i++) HARMFUL.push({ x: 1.45 + 0.38 * randn(rng), y: 1.15 + 0.38 * randn(rng) });
    for (let i = 0; i < 20; i++) HARMLESS.push({ x: -1.2 + 0.38 * randn(rng), y: -1.0 + 0.38 * randn(rng) });
    const mean = (arr) => ({
      x: arr.reduce((s, p) => s + p.x, 0) / arr.length,
      y: arr.reduce((s, p) => s + p.y, 0) / arr.length,
    });
    const harmfulMean = mean(HARMFUL);     // torch.mean(self.harmful[key], dim=0)
    const harmlessMean = mean(HARMLESS);   // torch.mean(self.harmless[key], dim=0)
    const dRawX = harmfulMean.x - harmlessMean.x;   // harmful_mean - harmless_mean
    const dRawY = harmfulMean.y - harmlessMean.y;
    const dNorm = Math.sqrt(dRawX * dRawX + dRawY * dRawY);
    const D = { x: dRawX / dNorm, y: dRawY / dNorm };   // refusal_dir = v / v.norm()

    const fmt = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);

    // ---- coordinate transform for the activation space ----
    const VB = 460, DOM = 3.4;
    const toSvg = (x, y) => [(x + DOM) / (2 * DOM) * VB, VB - (y + DOM) / (2 * DOM) * VB];

    function arrowHead(svg, x0, y0, x1, y1, cls, len) {
      const px = x1 - x0, py = y1 - y0, pl = Math.sqrt(px * px + py * py) || 1;
      const ux = px / pl, uy = py / pl, vx = -uy, vy = ux, h = len || 7;
      const t1x = x1 - h * ux + h * 0.55 * vx, t1y = y1 - h * uy + h * 0.55 * vy;
      const t2x = x1 - h * ux - h * 0.55 * vx, t2y = y1 - h * uy - h * 0.55 * vy;
      el('polygon', { class: cls, points: x1 + ',' + y1 + ' ' + t1x + ',' + t1y + ' ' + t2x + ',' + t2y }, svg);
    }

    // ============================================================
    function build(cfg) {
      const netSvg = document.getElementById(cfg.net);
      const spaceSvg = document.getElementById(cfg.space);
      if (!netSvg || !spaceSvg) return;
      const controls = document.getElementById(cfg.controls);
      const readout = document.getElementById(cfg.readout);
      const hookBtn = document.getElementById(cfg.hook);

      let xs = cfg.start.slice();   // input vector x
      let hookOn = false;
      let manual = false;           // true once the reader drags the activation
      let manualA = null;

      // ---- forward pass: returns {h (hidden, deep only), a (activation)} ----
      function forward(inp) {
        if (cfg.kind === 'shallow') {
          const W = cfg.W, b = cfg.b;
          const a = {
            x: W[0][0] * inp[0] + W[0][1] * inp[1] + b[0],
            y: W[1][0] * inp[0] + W[1][1] * inp[1] + b[1],
          };
          return { h: null, a };
        }
        // deep: h = ReLU(W1·x + b1), a = W2·h + b2
        const { W1, b1, W2, b2 } = cfg;
        const h = W1.map((row, j) => Math.max(0, row[0] * inp[0] + row[1] * inp[1] + b1[j]));
        const a = {
          x: W2[0][0] * h[0] + W2[0][1] * h[1] + W2[0][2] * h[2] + b2[0],
          y: W2[1][0] * h[0] + W2[1][1] * h[1] + W2[1][2] * h[2] + b2[1],
        };
        return { h, a };
      }

      function currentA() {
        if (manual) return manualA;
        return forward(xs).a;
      }

      // ---- the ablation, exactly as FailSpy's directional_hook ----
      function ablate(a) {
        const dot = a.x * D.x + a.y * D.y;          // einsum(activation, direction)
        const proj = { x: dot * D.x, y: dot * D.y }; // * direction
        const ap = { x: a.x - proj.x, y: a.y - proj.y }; // activation - proj
        return { dot, proj, ap };
      }

      // ========== left panel: the network diagram ==========
      function renderNet() {
        while (netSvg.firstChild) netSvg.removeChild(netSvg.firstChild);
        const { h, a } = forward(xs);
        const N = cfg.nodes;

        // edges (drawn first, under the nodes)
        function edge(p1, p2, w) {
          const stroke = w >= 0 ? 'var(--pos-stroke)' : 'var(--neg-stroke)';
          el('line', {
            x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
            stroke, 'stroke-width': (0.8 + Math.min(2.6, Math.abs(w) * 1.6)).toFixed(2),
            opacity: (0.35 + Math.min(0.5, Math.abs(w) * 0.4)).toFixed(2),
            'stroke-linecap': 'round',
          }, netSvg);
        }
        if (cfg.kind === 'shallow') {
          for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) edge(N.in[c], N.out[r], cfg.W[r][c]);
        } else {
          for (let j = 0; j < 3; j++) for (let c = 0; c < 2; c++) edge(N.in[c], N.hid[j], cfg.W1[j][c]);
          for (let r = 0; r < 2; r++) for (let j = 0; j < 3; j++) edge(N.hid[j], N.out[r], cfg.W2[r][j]);
        }

        // input squares (DATA → rectangles)
        N.in.forEach((p, i) => {
          el('rect', { class: 'abl-data', x: p.x - 17, y: p.y - 15, width: 34, height: 30, rx: 4 }, netSvg);
          el('text', { class: 'abl-vlabel', x: p.x, y: p.y + 4 }, netSvg, fmt(xs[i]).trim());
          el('text', { class: 'abl-nlabel', x: p.x, y: p.y - 24 }, netSvg, 'x' + (i + 1));
        });
        // hidden neurons (deep only) → circles
        if (cfg.kind === 'deep') {
          N.hid.forEach((p, j) => {
            const live = h[j] > 0.01;
            el('circle', { class: 'abl-neuron' + (live ? '' : ' dead'), cx: p.x, cy: p.y, r: 17 }, netSvg);
            el('text', { class: 'abl-vlabel', x: p.x, y: p.y + 4 }, netSvg, fmt(h[j]).trim());
          });
          el('text', { class: 'abl-collabel', x: N.hid[0].x, y: 22 }, netSvg, 'hidden · ReLU');
        }
        // output neurons (the residual stream a) → circles
        const outVals = [a.x, a.y];
        N.out.forEach((p, r) => {
          el('circle', { class: 'abl-neuron abl-out' + (manual ? ' ghost' : ''), cx: p.x, cy: p.y, r: 19 }, netSvg);
          el('text', { class: 'abl-vlabel', x: p.x, y: p.y + 4 }, netSvg, fmt(manual ? [manualA.x, manualA.y][r] : outVals[r]).trim());
          el('text', { class: 'abl-nlabel', x: p.x + 30, y: p.y + 4, 'text-anchor': 'start' }, netSvg, 'a' + (r + 1));
        });
        el('text', { class: 'abl-collabel', x: N.in[0].x, y: 22 }, netSvg, 'input x');
        el('text', { class: 'abl-collabel', x: N.out[0].x, y: 22 }, netSvg, 'residual stream a');
        if (manual) el('text', { class: 'abl-ghostnote', x: cfg.netW / 2, y: cfg.netH - 8 }, netSvg, 'activation set by drag — slide an input to re-couple');
      }

      // ========== right panel: the activation space ==========
      function renderSpace() {
        while (spaceSvg.firstChild) spaceSvg.removeChild(spaceSvg.firstChild);
        const a = currentA();
        const { dot, proj, ap } = ablate(a);

        // axes
        let p0 = toSvg(0, -DOM), p1 = toSvg(0, DOM);
        el('line', { class: 'abl-axis', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] }, spaceSvg);
        p0 = toSvg(-DOM, 0); p1 = toSvg(DOM, 0);
        el('line', { class: 'abl-axis', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] }, spaceSvg);

        // ablation plane: line through origin ⟂ d (where a·d = 0)
        const perp = { x: -D.y, y: D.x }, T = 4.6;
        const q0 = toSvg(-T * perp.x, -T * perp.y), q1 = toSvg(T * perp.x, T * perp.y);
        el('line', { class: 'abl-plane' + (hookOn ? ' on' : ''), x1: q0[0], y1: q0[1], x2: q1[0], y2: q1[1] }, spaceSvg);
        if (hookOn) {
          const lp = toSvg(T * perp.x * 0.62, T * perp.y * 0.62);
          el('text', { class: 'abl-planelabel', x: lp[0], y: lp[1] }, spaceSvg, 'a·d = 0  (refusal killed)');
        }

        // cached clusters
        HARMLESS.forEach((p) => { const s = toSvg(p.x, p.y); el('circle', { class: 'abl-pt harmless', cx: s[0], cy: s[1], r: 4 }, spaceSvg); });
        HARMFUL.forEach((p) => { const s = toSvg(p.x, p.y); el('circle', { class: 'abl-pt harmful', cx: s[0], cy: s[1], r: 4 }, spaceSvg); });
        // means (✕)
        function cross(m, cls, label) {
          const s = toSvg(m.x, m.y), r = 6;
          el('line', { class: cls, x1: s[0] - r, y1: s[1] - r, x2: s[0] + r, y2: s[1] + r }, spaceSvg);
          el('line', { class: cls, x1: s[0] - r, y1: s[1] + r, x2: s[0] + r, y2: s[1] - r }, spaceSvg);
          el('text', { class: 'abl-meanlabel', x: s[0] + 9, y: s[1] - 7 }, spaceSvg, label);
        }
        cross(harmlessMean, 'abl-mean harmless', 'harmless_mean');
        cross(harmfulMean, 'abl-mean harmful', 'harmful_mean');

        // refusal direction arrow from origin
        const aLen = 1.7;
        const h0 = toSvg(0, 0), h1 = toSvg(aLen * D.x, aLen * D.y);
        el('line', { class: 'abl-dir', x1: h0[0], y1: h0[1], x2: h1[0], y2: h1[1] }, spaceSvg);
        arrowHead(spaceSvg, h0[0], h0[1], h1[0], h1[1], 'abl-dir-head', 8);
        const dl = toSvg(aLen * D.x + 0.12, aLen * D.y + 0.18);
        el('text', { class: 'abl-dirlabel', x: dl[0], y: dl[1] }, spaceSvg, 'refusal_dir  d');

        // activation a, projection, and ablated a'
        const as = toSvg(a.x, a.y);
        if (hookOn) {
          const aps = toSvg(ap.x, ap.y);
          el('line', { class: 'abl-projline', x1: as[0], y1: as[1], x2: aps[0], y2: aps[1] }, spaceSvg);
          arrowHead(spaceSvg, as[0], as[1], aps[0], aps[1], 'abl-projhead', 7);
          el('circle', { class: 'abl-aprime', cx: aps[0], cy: aps[1], r: 7 }, spaceSvg);
          el('text', { class: 'abl-alabel prime', x: aps[0] - 10, y: aps[1] + 18 }, spaceSvg, "a′ = a − proj");
        }
        const refuseSide = dot > 0;
        el('circle', { class: 'abl-a' + (refuseSide ? ' refuse' : ' comply'), cx: as[0], cy: as[1], r: 8 }, spaceSvg);
        el('text', { class: 'abl-alabel', x: as[0] + 11, y: as[1] - 9 }, spaceSvg, 'a');
      }

      function renderReadout() {
        const a = currentA();
        const { dot, proj, ap } = ablate(a);
        readout.innerHTML =
          '<span class="rk">harmful_mean </span>= (' + fmt(harmfulMean.x) + ', ' + fmt(harmfulMean.y) + ')\n' +
          '<span class="rk">harmless_mean</span>= (' + fmt(harmlessMean.x) + ', ' + fmt(harmlessMean.y) + ')\n' +
          '<span class="rk">refusal_dir d</span>= (' + fmt(D.x) + ', ' + fmt(D.y) + ')   ‖d‖ = 1.00\n' +
          '<span class="rd">activation a </span>= (' + fmt(a.x) + ', ' + fmt(a.y) + ')\n' +
          '<span class="rk">a · d        </span>= ' + fmt(dot) + '   (dot product: a\'s reach along d)\n' +
          '<span class="rk">proj=(a·d)·d </span>= (' + fmt(proj.x) + ', ' + fmt(proj.y) + ')\n' +
          (hookOn
            ? '<span class="ra">a − proj     </span>= (' + fmt(ap.x) + ', ' + fmt(ap.y) + ')   ← directional_hook'
            : '<span class="rmute">hook OFF — toggle it to subtract proj from a</span>');
      }

      function renderAll() { renderNet(); renderSpace(); renderReadout(); }

      // ---- controls ----
      controls.innerHTML = '';
      const sliderWrap = document.createElement('div');
      sliderWrap.className = 'abl-sliders';
      const valSpans = [];
      for (let i = 0; i < 2; i++) {
        const label = document.createElement('label');
        label.innerHTML = '<span class="abl-ctrl-name">x' + (i + 1) + '</span>' +
          '<input type="range" min="-2" max="2" step="0.05" value="' + xs[i] + '">' +
          '<span class="abl-ctrl-val">' + fmt(xs[i]).trim() + '</span>';
        const input = label.querySelector('input');
        const val = label.querySelector('.abl-ctrl-val');
        valSpans.push({ input, val });
        input.addEventListener('input', () => {
          xs[i] = parseFloat(input.value);
          val.textContent = fmt(xs[i]).trim();
          manual = false; manualA = null;
          renderAll();
        });
        sliderWrap.appendChild(label);
      }
      controls.appendChild(sliderWrap);

      const btnRow = document.createElement('div');
      btnRow.className = 'abl-btnrow';
      function preset(name, vec) {
        const b = document.createElement('button');
        b.className = 'btn'; b.type = 'button'; b.textContent = name;
        b.addEventListener('click', () => {
          xs = vec.slice(); manual = false; manualA = null;
          valSpans.forEach((s, i) => { s.input.value = xs[i]; s.val.textContent = fmt(xs[i]).trim(); });
          renderAll();
        });
        btnRow.appendChild(b);
      }
      preset('harmful prompt', cfg.harmful);
      preset('harmless prompt', cfg.harmless);
      preset('ambiguous', cfg.ambiguous);
      controls.appendChild(btnRow);

      hookBtn.addEventListener('click', () => {
        hookOn = !hookOn;
        hookBtn.classList.toggle('on', hookOn);
        hookBtn.textContent = hookOn ? 'directional_hook: ON' : 'directional_hook: OFF';
        renderAll();
      });

      // ---- drag the activation directly ----
      function dragTo(ev) {
        const rect = spaceSvg.getBoundingClientRect();
        const cx = ((ev.clientX - rect.left) / rect.width) * VB;
        const cy = ((ev.clientY - rect.top) / rect.height) * VB;
        manualA = { x: (cx / VB) * (2 * DOM) - DOM, y: ((VB - cy) / VB) * (2 * DOM) - DOM };
        manual = true;
        renderAll();
      }
      let dragging = false;
      spaceSvg.addEventListener('pointerdown', (ev) => { dragging = true; spaceSvg.setPointerCapture(ev.pointerId); dragTo(ev); });
      spaceSvg.addEventListener('pointermove', (ev) => { if (dragging) dragTo(ev); });
      spaceSvg.addEventListener('pointerup', () => { dragging = false; });

      renderAll();
    }

    // ---- shallow 2→2 instance ----
    build({
      kind: 'shallow',
      net: 'abl22-net', space: 'abl22-space', controls: 'abl22-controls',
      readout: 'abl22-readout', hook: 'abl22-hook',
      netW: 300, netH: 300,
      W: [[1.05, 0.32], [0.28, 1.12]], b: [-0.35, -0.25],
      start: [0.3, -0.2],
      harmful: [1.44, 0.89], harmless: [-0.66, -0.51], ambiguous: [0.3, -0.2],
      nodes: {
        in: [{ x: 60, y: 105 }, { x: 60, y: 210 }],
        out: [{ x: 235, y: 105 }, { x: 235, y: 210 }],
      },
    });
  })();

  // ============================================================
  // Widget 2 · Defense-in-depth stack
  // ============================================================
  (function initStack() {
    const svg = document.getElementById('stack-svg');
    if (!svg) return;
    const detail = document.getElementById('stack-detail');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const LAYERS = [
      { id: 'l1', name: 'Input layer · prompt sanitization',          sub: 'strip / normalize / classify the user\'s prompt before it touches the model', body: 'Catches the simplest jailbreaks (prompt-template stuffing, banned-word lists, encoding attacks). Cheap, fast, low recall. Misses any attack the user can paraphrase. <strong>Useful but never sufficient.</strong>' },
      { id: 'l2', name: 'Model alignment · RLHF / DPO / CAI',         sub: 'training-time refusal behavior',                                                body: 'The model itself trained to refuse harmful prompts. Robust against naïve jailbreaks; <strong>completely bypassed</strong> by abliteration. If you ship a model behind a public endpoint, this is necessary but the smallest part of your defense.' },
      { id: 'l3', name: 'System prompt · "you are an assistant that…"',sub: 'in-context instruction layer',                                                  body: 'A long-form instruction at the start of every conversation. Improves over no system prompt. Bypassed by abliteration, prompt-extraction attacks, and jailbreaks that get the model to roleplay. Treat as a hint, not a guardrail.' },
      { id: 'l4', name: 'Generation-time monitoring',                 sub: 'logit / token / activation inspection during generation',                       body: 'Look at the model\'s own activations (e.g., probe the refusal direction!) or token-by-token outputs as they\'re generated. Promising research area; not yet production-ready for most teams. Watch the literature.' },
      { id: 'l5', name: 'Output classifier · Llama Guard / similar',  sub: 'separate model reading (prompt, response)',                                     body: '<strong>The defense you build in the assignment.</strong> Lives outside the generation model, so abliteration of the gen model doesn\'t bypass it. Easiest to verify and retrain. Highest ROI single defense in 2026.' },
      { id: 'l6', name: 'Human review queue',                         sub: 'humans on borderline outputs',                                                  body: 'For outputs flagged "borderline" by the classifier. Staffed by trained reviewers, ideally with rotating focus areas. Slow but irreplaceable for the long tail of weird edge cases. Audit logs feed back into classifier training.' },
      { id: 'l7', name: 'Audit log + monitoring',                     sub: 'persistent post-incident record',                                               body: 'Every request, every response, every classifier verdict — stored, queryable, retained per your compliance policy. Not a real-time defense but the only way to catch a slow attacker and the only artifact your IR team will have post-incident.' },
    ];

    const W = 600, H = 420;
    const rowH = 50, rowY0 = 22, rowGap = 4;
    LAYERS.forEach((L, i) => {
      const y = rowY0 + i * (rowH + rowGap);
      const row = el('rect', {
        class: 'layer-row', 'data-id': L.id,
        x: 28, y, width: W - 56, height: rowH, rx: 6,
      }, svg);
      el('text', { class: 'layer-num',  x: 52, y: y + rowH / 2 + 4 }, svg, String(i + 1));
      el('text', { class: 'layer-name', x: 80, y: y + 22 }, svg, L.name);
      el('text', { class: 'layer-sub',  x: 80, y: y + 38 }, svg, L.sub);
      row.addEventListener('click',      () => activate(L.id));
      row.addEventListener('mouseenter', () => activate(L.id, true));
    });

    function activate(id) {
      const L = LAYERS.find(l => l.id === id);
      if (!L) return;
      svg.querySelectorAll('.layer-row').forEach(r =>
        r.classList.toggle('active', r.getAttribute('data-id') === id)
      );
      detail.innerHTML =
        '<div class="stack-detail-title">' + L.name + '</div>' +
        '<div>' + L.body + '</div>';
    }
    activate('l5'); // Default to the output classifier — the assignment hook
  })();

  // ============================================================
  // Widget D · The residual stream — the spine (§2)
  // A lab-02-style architecture-column + neuron-flow diagram, but
  // centred on the residual stream as a vertical "read / add back" spine.
  // Toy values pinned to microGPT's forward pass for continuity.
  // ============================================================
  (function initResStream() {
    const svg = document.getElementById('resstream-svg');
    if (!svg) return;

    const SPINE = 360;                 // spine centre x
    function cellColor(v) {
      if (v > 0.05)  return ['var(--pos)', 'var(--pos-stroke)'];
      if (v < -0.05) return ['var(--neg)', 'var(--neg-stroke)'];
      return ['var(--zero)', 'var(--rule)'];
    }
    const fnum = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);

    // a residual-stream value: two tinted cells centred on the spine + a tag
    function drawVec(cy, vals, tag) {
      const CW = 46, CH = 30, x0 = SPINE - vals.length * CW / 2;
      const g = el('g', { class: 'rs-vec' }, svg);
      vals.forEach((v, i) => {
        const [fill, stroke] = cellColor(v);
        el('rect', { class: 'rs-cell', x: x0 + i * CW, y: cy - CH / 2, width: CW, height: CH,
                     rx: 4, fill, stroke }, g);
        el('text', { class: 'rs-cell-val', x: x0 + i * CW + CW / 2, y: cy + 4,
                     'text-anchor': 'middle' }, g, fnum(v));
      });
      if (tag) el('text', { class: 'rs-tag', x: x0 - 12, y: cy + 4, 'text-anchor': 'end' }, svg, tag);
      return { top: cy - CH / 2, bot: cy + CH / 2, right: x0 + vals.length * CW };
    }
    function plusNode(cy) {
      el('circle', { class: 'rs-plus', cx: SPINE, cy, r: 14 }, svg);
      el('text', { class: 'rs-plus-sign', x: SPINE, y: cy + 6, 'text-anchor': 'middle' }, svg, '+');
    }
    function arrow(x1, y1, x2, y2, cls, group, dashed) {
      const attrs = { class: 'rs-arrow ' + cls, x1, y1, x2, y2 };
      if (dashed) attrs['stroke-dasharray'] = '4 3';
      if (group) attrs['data-rsgroup'] = group;
      el('line', attrs, svg);
      const ang = Math.atan2(y2 - y1, x2 - x1), s = 7;
      const head = el('path', { class: 'rs-arrow-head ' + cls,
        d: 'M' + x2 + ',' + y2 +
           ' L' + (x2 - s * Math.cos(ang - 0.4)) + ',' + (y2 - s * Math.sin(ang - 0.4)) +
           ' L' + (x2 - s * Math.cos(ang + 0.4)) + ',' + (y2 - s * Math.sin(ang + 0.4)) + ' Z' }, svg);
      if (group) head.setAttribute('data-rsgroup', group);
    }
    function archBand(y, h, title, sub) {
      el('rect', { class: 'rs-arch-band', x: 16, y, width: 132, height: h, rx: 8 }, svg);
      el('text', { class: 'rs-arch-title', x: 82, y: y + 22, 'text-anchor': 'middle' }, svg, title);
      if (sub) el('text', { class: 'rs-arch-sub', x: 82, y: y + 40, 'text-anchor': 'middle' }, svg, sub);
    }
    function block(y, h, group, title, sub, out) {
      const g = el('g', { class: 'rs-block', 'data-rsgroup-host': group }, svg);
      el('rect', { class: 'rs-block-box', x: 452, y, width: 156, height: h, rx: 8, 'data-rsgroup': group }, g);
      el('text', { class: 'rs-block-title', x: 530, y: y + 22, 'text-anchor': 'middle' }, g, title);
      el('text', { class: 'rs-block-sub', x: 530, y: y + 40, 'text-anchor': 'middle' }, g, sub);
      el('text', { class: 'rs-block-out', x: 530, y: y + h - 12, 'text-anchor': 'middle' }, g,
         'output ' + out);
      g.addEventListener('mouseenter', () => lit(group, true));
      g.addEventListener('mouseleave', () => lit(group, false));
    }
    function lit(group, on) {
      svg.querySelectorAll('[data-rsgroup="' + group + '"]').forEach((n) =>
        n.classList.toggle('lit', on));
    }

    // ---- channel + spine ----
    el('rect', { class: 'rs-channel', x: 305, y: 70, width: 110, height: 400, rx: 10 }, svg);
    el('line', { class: 'rs-spine', x1: SPINE, y1: 72, x2: SPINE, y2: 460 }, svg);
    el('text', { class: 'rs-spine-lbl', x: 182, y: 270,
                 transform: 'rotate(-90 182 270)', 'text-anchor': 'middle' }, svg,
       'RESIDUAL STREAM h · running sum, fixed width');

    // ---- architecture column (left) ----
    archBand(60,  92, 'EMBEDDING',      'token + position');
    archBand(160, 150, 'SELF-ATTENTION', 'reads · mixes · adds');
    archBand(318, 100, 'MLP',            'reads · transforms · adds');
    archBand(426, 96, 'OUTPUT',         'unembed → logits');

    // ---- spine checkpoints + nodes ----
    const A = drawVec(100, [-0.40, 0.50], 'h₀ · x + wpe');
    plusNode(205);
    const B = drawVec(255, [-0.26, 0.71], 'h₁ · + attention');
    plusNode(360);
    drawVec(410, [0.15, 1.05], 'h₂ · + MLP');
    arrow(SPINE, 426, SPINE, 452, 'rs-spine-arrow', null, false);
    el('text', { class: 'rs-final-lbl', x: SPINE, y: 470, 'text-anchor': 'middle' }, svg,
       'h₂ → unembed → next-token logits');

    // ---- spine flow arrows (identity wire) ----
    arrow(SPINE, A.bot, SPINE, 191, 'rs-spine-arrow', null, false);   // A → +1
    arrow(SPINE, 219, SPINE, B.top, 'rs-spine-arrow', null, false);   // +1 → B
    arrow(SPINE, B.bot, SPINE, 346, 'rs-spine-arrow', null, false);   // B → +2
    arrow(SPINE, 374, SPINE, 393, 'rs-spine-arrow', null, false);     // +2 → final

    // ---- attention block: reads A, adds to +1 ----
    block(150, 70, 'attn', 'Attention', 'norm · Q·K·V · ΣwV · Wₒ', '[0.14, 0.21]');
    arrow(A.right + 2, 100, 452, 172, 'rs-read', 'attn', true);
    arrow(452, 200, SPINE + 13, 199, 'rs-write', 'attn', false);
    el('text', { class: 'rs-edge-lbl', x: 430, y: 128, 'text-anchor': 'end',
                 'data-rsgroup': 'attn' }, svg, 'reads');
    el('text', { class: 'rs-edge-lbl', x: 432, y: 214, 'text-anchor': 'end',
                 'data-rsgroup': 'attn' }, svg, 'adds');

    // ---- MLP block: reads B, adds to +2 ----
    block(320, 70, 'mlp', 'MLP', 'norm · fc1 · ReLU · fc2', '[0.41, 0.34]');
    arrow(B.right + 2, 255, 452, 342, 'rs-read', 'mlp', true);
    arrow(452, 368, SPINE + 13, 354, 'rs-write', 'mlp', false);
    el('text', { class: 'rs-edge-lbl', x: 430, y: 296, 'text-anchor': 'end',
                 'data-rsgroup': 'mlp' }, svg, 'reads');
    el('text', { class: 'rs-edge-lbl', x: 432, y: 368, 'text-anchor': 'end',
                 'data-rsgroup': 'mlp' }, svg, 'adds');

    // ---- refusal-direction call-out ----
    el('text', { class: 'rs-refusal', x: SPINE, y: 500, 'text-anchor': 'middle' }, svg,
       'the refusal direction w is read off this stream — and abliteration subtracts it');
  })();

  // ============================================================
  // Widget E · Refusal direction from a mean difference (§2)
  // A worked 2-D scatter: two clouds, their means, and w = μ_R − μ_C.
  // Numbers match the arithmetic in the prose (μ_R=[1.4,1.2], μ_C=[0.2,0.3],
  // w_raw=[1.2,0.9], ‖w‖=1.5, w=[0.8,0.6]).
  // ============================================================
  (function initRefusalMean() {
    const svg = document.getElementById('refmean-svg');
    if (!svg) return;
    const REFUSE = [[1.5, 1.4], [1.6, 1.0], [1.2, 1.3], [1.3, 1.1]];
    const COMPLY = [[0.1, 0.4], [0.4, 0.2], [0.0, 0.5], [0.3, 0.1]];
    const mean = (pts) => [
      pts.reduce((s, p) => s + p[0], 0) / pts.length,
      pts.reduce((s, p) => s + p[1], 0) / pts.length,
    ];
    const muR = mean(REFUSE), muC = mean(COMPLY);   // [1.4,1.2], [0.2,0.3]

    const W = 560, H = 440, PL = { l: 46, r: 20, t: 18, b: 42 };
    const XMAX = 1.8, YMAX = 1.5;
    const px = (x) => PL.l + x / XMAX * (W - PL.l - PL.r);
    const py = (y) => (H - PL.b) - y / YMAX * (H - PL.b - PL.t);

    // axes + ticks
    el('line', { class: 'rm-axis', x1: px(0), y1: py(0), x2: px(XMAX), y2: py(0) }, svg);
    el('line', { class: 'rm-axis', x1: px(0), y1: py(0), x2: px(0), y2: py(YMAX) }, svg);
    for (let t = 0.5; t <= XMAX + 1e-9; t += 0.5) {
      el('line', { class: 'rm-tick', x1: px(t), y1: py(0), x2: px(t), y2: py(0) + 4 }, svg);
      el('text', { class: 'rm-tick-lbl', x: px(t), y: py(0) + 16, 'text-anchor': 'middle' }, svg, t.toFixed(1));
    }
    for (let t = 0.5; t <= YMAX + 1e-9; t += 0.5) {
      el('line', { class: 'rm-tick', x1: px(0) - 4, y1: py(t), x2: px(0), y2: py(t) }, svg);
      el('text', { class: 'rm-tick-lbl', x: px(0) - 8, y: py(t) + 3, 'text-anchor': 'end' }, svg, t.toFixed(1));
    }
    el('text', { class: 'rm-axis-lbl', x: px(XMAX), y: py(0) + 30, 'text-anchor': 'end' }, svg, 'residual dim 1  (h₁)');
    el('text', { class: 'rm-axis-lbl', x: px(0) + 6, y: py(YMAX) + 6 }, svg, 'dim 2 (h₂)');

    // cloud points
    COMPLY.forEach((p) => el('circle', { class: 'rm-pt rm-comply', cx: px(p[0]), cy: py(p[1]), r: 5 }, svg));
    REFUSE.forEach((p) => el('circle', { class: 'rm-pt rm-refuse', cx: px(p[0]), cy: py(p[1]), r: 5 }, svg));

    // w arrow: μ_comply → μ_refuse
    const ax1 = px(muC[0]), ay1 = py(muC[1]), ax2 = px(muR[0]), ay2 = py(muR[1]);
    el('line', { class: 'rm-w', x1: ax1, y1: ay1, x2: ax2, y2: ay2 }, svg);
    const ang = Math.atan2(ay2 - ay1, ax2 - ax1), s = 10;
    el('path', { class: 'rm-w-head',
      d: 'M' + ax2 + ',' + ay2 +
         ' L' + (ax2 - s * Math.cos(ang - 0.4)) + ',' + (ay2 - s * Math.sin(ang - 0.4)) +
         ' L' + (ax2 - s * Math.cos(ang + 0.4)) + ',' + (ay2 - s * Math.sin(ang + 0.4)) + ' Z' }, svg);
    el('text', { class: 'rm-w-lbl', x: (ax1 + ax2) / 2 + 12, y: (ay1 + ay2) / 2 - 8 }, svg,
       'w = μ_refuse − μ_comply');

    // class means (large outlined dots)
    el('circle', { class: 'rm-mean rm-comply', cx: ax1, cy: ay1, r: 9 }, svg);
    el('circle', { class: 'rm-mean rm-refuse', cx: ax2, cy: ay2, r: 9 }, svg);
    el('text', { class: 'rm-mean-lbl', x: ax1 - 13, y: ay1 + 4, 'text-anchor': 'end' }, svg, 'μ_comply');
    el('text', { class: 'rm-mean-lbl', x: ax2 + 14, y: ay2 + 4 }, svg, 'μ_refuse');

    // legend (bottom-right, empty region)
    const lx = 402, ly = 316;
    const leg = [['rm-refuse', 'refuses'], ['rm-comply', 'complies']];
    leg.forEach((row, i) => {
      el('circle', { class: 'rm-pt ' + row[0], cx: lx, cy: ly + i * 22, r: 5 }, svg);
      el('text', { class: 'rm-legend-lbl', x: lx + 14, y: ly + i * 22 + 4 }, svg, row[1]);
    });
    el('line', { class: 'rm-w', x1: lx - 7, y1: ly + 44, x2: lx + 7, y2: ly + 44 }, svg);
    el('text', { class: 'rm-legend-lbl', x: lx + 14, y: ly + 48 }, svg, 'w (refusal direction)');
  })();

  // ============================================================
  // Widget F · GODMODE meta-strategy — fire at the fleet (§5.1)
  // Illustrative simulation of "brute-force many models, keep whichever
  // slips." Each model has a per-fire compliance probability; a fire rolls
  // each one independently. Not data about any real model.
  // ============================================================
  (function initGodmode() {
    const root = document.getElementById('viz-godmode');
    if (!root) return;
    const grid = document.getElementById('gm-grid');
    const readout = document.getElementById('gm-readout');
    const fireBtn = document.getElementById('gm-fire');
    const resetBtn = document.getElementById('gm-reset');
    const modeBtns = root.querySelectorAll('.gm-mode');

    // per-fire "slips the filter" probability; first 5 are relatively robust
    const P = [0.06, 0.10, 0.05, 0.12, 0.08,  0.35, 0.06, 0.45, 0.09, 0.30,
               0.15, 0.50, 0.05, 0.20, 0.40,  0.25, 0.55, 0.11, 0.33, 0.08,
               0.28, 0.14, 0.42, 0.07];
    const MODELS = P.map((p, i) => ({ id: 'model-' + String(i + 1).padStart(2, '0'), p }));
    let mode = 'classic';
    let firing = false;
    const activeCount = () => (mode === 'classic' ? 5 : MODELS.length);

    function renderGrid() {
      grid.innerHTML = '';
      MODELS.slice(0, activeCount()).forEach((m) => {
        const chip = document.createElement('div');
        chip.className = 'gm-chip idle';
        chip.setAttribute('data-id', m.id);
        chip.innerHTML = '<span class="gm-name">' + m.id +
          '</span><span class="gm-status">· waiting</span>';
        grid.appendChild(chip);
      });
      readout.innerHTML = '<span class="gm-mute">Press <b>Fire</b> to send the same jailbreak ' +
        'prompt to all ' + activeCount() + ' models at once.</span>';
    }

    function fire() {
      if (firing) return;
      firing = true; fireBtn.disabled = true;
      const chips = Array.prototype.slice.call(grid.children);
      chips.forEach((c) => {
        c.className = 'gm-chip probing';
        c.querySelector('.gm-status').textContent = 'probing…';
      });
      let resolved = 0, liberated = 0;
      chips.forEach((c, i) => {
        const m = MODELS.find((x) => x.id === c.getAttribute('data-id'));
        const delay = 260 + i * (mode === 'classic' ? 120 : 40) + Math.random() * 120;
        setTimeout(() => {
          const slipped = Math.random() < m.p;
          c.className = 'gm-chip ' + (slipped ? 'liberated' : 'refused');
          c.querySelector('.gm-status').textContent = slipped ? '🔓 liberated' : '✓ refused';
          if (slipped) liberated++;
          resolved++;
          if (resolved === chips.length) {
            firing = false; fireBtn.disabled = false;
            const refused = chips.length - liberated;
            readout.innerHTML = liberated
              ? 'Fired at <b>' + chips.length + '</b> · <span class="gm-ok">' + refused +
                ' refused</span> · <span class="gm-bad">' + liberated + ' 🔓 liberated</span>. ' +
                'The attacker keeps the ' + liberated + ' that slipped — <b>one is enough</b>.'
              : 'Fired at <b>' + chips.length + '</b> · all refused <em>this round</em>. ' +
                'So the attacker just fires again — you have to hold <em>every</em> round; ' +
                'they only need <b>one</b>.';
          }
        }, delay);
      });
    }

    modeBtns.forEach((b) => b.addEventListener('click', () => {
      if (firing) return;
      mode = b.getAttribute('data-mode');
      modeBtns.forEach((x) => x.classList.toggle('active', x === b));
      renderGrid();
    }));
    fireBtn.addEventListener('click', fire);
    resetBtn.addEventListener('click', () => { if (!firing) renderGrid(); });
    renderGrid();
  })();

  // ============================================================
  // Widget G · Low-rank matrix explorer (§ fine-tuning · LoRA)
  // W (12×12) = B (12×r) · A (r×12), drawn as value heatmaps. Slider on r
  // shows how few numbers a low-rank matrix costs, and that r=1 makes every
  // row of W a scaled copy of one pattern.
  // ============================================================
  (function initLowRank() {
    const svg = document.getElementById('lowrank-svg');
    if (!svg) return;
    const slider = document.getElementById('lr-rank');
    const rankVal = document.getElementById('lr-rank-val');
    const readout = document.getElementById('lr-readout');

    const N = 12, MAXR = 12, CELL = 13;
    function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
    const rnd = lcg(24681);
    const U = [], V = [], Wt = [];   // rank-1 components: u_i v_iᵀ, weighted
    for (let i = 0; i < MAXR; i++) {
      U.push(Array.from({ length: N }, () => 2 * rnd() - 1));
      V.push(Array.from({ length: N }, () => 2 * rnd() - 1));
      Wt.push(Math.pow(0.82, i));
    }
    const POS = '#c15a34', NEG = '#4f8f6a';
    const Bval = (a, i) => U[i][a] * Wt[i];
    const Aval = (i, b) => V[i][b];
    const Mval = (a, b, r) => { let s = 0; for (let i = 0; i < r; i++) s += U[i][a] * V[i][b] * Wt[i]; return s; };

    function grid(ox, oy, rows, cols, getVal, maxAbs) {
      for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) {
        const v = getVal(a, b);
        const op = (0.12 + 0.88 * Math.min(1, Math.abs(v) / (maxAbs || 1))).toFixed(3);
        el('rect', { class: 'lr-cell', x: ox + b * CELL, y: oy + a * CELL,
          width: CELL, height: CELL, fill: v >= 0 ? POS : NEG, 'fill-opacity': op }, svg);
      }
    }
    function maxAbs(rows, cols, f) { let m = 0; for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) m = Math.max(m, Math.abs(f(a, b))); return m; }

    function draw() {
      const r = +slider.value;
      rankVal.textContent = r;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const G = N * CELL;                 // 156
      const bx = 16, by = 18, mid = by + G / 2 + 6;

      // B — 12×r, full height, right-aligned in its slot so it sits next to ×
      const bDrawX = bx + (G - r * CELL);
      grid(bDrawX, by, N, r, (a, i) => Bval(a, i), maxAbs(N, r, (a, i) => Bval(a, i)));
      el('text', { class: 'lr-lbl', x: bx + G, y: by + G + 15, 'text-anchor': 'end' }, svg, 'B · 12×' + r);

      el('text', { class: 'lr-op', x: bx + G + 10, y: mid, 'text-anchor': 'middle' }, svg, '×');

      // A — r×12, full width, vertically centered in its slot
      const ax = bx + G + 22, ay = by + (G - r * CELL) / 2;
      grid(ax, ay, r, N, (i, b) => Aval(i, b), maxAbs(r, N, (i, b) => Aval(i, b)));
      el('text', { class: 'lr-lbl', x: ax, y: by + G + 15 }, svg, 'A · ' + r + '×12');

      el('text', { class: 'lr-op', x: ax + G + 10, y: mid, 'text-anchor': 'middle' }, svg, '=');

      // W = B·A — 12×12
      const mx = ax + G + 22;
      grid(mx, by, N, N, (a, b) => Mval(a, b, r), maxAbs(N, N, (a, b) => Mval(a, b, r)));
      el('text', { class: 'lr-lbl', x: mx, y: by + G + 15 }, svg, 'W = B·A · 12×12');

      const full = N * N, fact = 2 * N * r, pct = Math.round(fact / full * 100);
      const verdict = r < 6
        ? '<span class="lr-hi">' + pct + '% of full</span> — the two strips win.'
        : r === 6 ? '<b>' + pct + '% — exactly break-even</b> at rank 6.'
        : pct + '% — the strips now cost <em>more</em> than <code>W</code>; low rank is the whole point.';
      readout.innerHTML =
        'rank <b>r = ' + r + '</b> · full <code>W</code> = 12×12 = <b>' + full + '</b> numbers · ' +
        'factored <code>B·A</code> = 12×' + r + ' + ' + r + '×12 = <b>' + fact + '</b> · ' + verdict +
        (r === 1 ? '<br><span class="lr-hi">r = 1:</span> every row of <code>W</code> is a scaled copy of one row — one pattern.' : '');
    }
    slider.addEventListener('input', draw);
    draw();
  })();

  // ============================================================
  // Widget 3 · Inline glossary
  // ============================================================
  (function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'alignment': {
        title: 'alignment',
        body:
          '<p>The post-pretraining process that turns a raw language model — which by default will complete any text plausibly, including text describing how to commit crimes — into one that\'s useful for normal users and refuses obviously dangerous requests. Stacks <strong>supervised fine-tuning</strong> (SFT) + <strong>preference training</strong> (RLHF, DPO, or Constitutional AI) + sometimes a runtime system prompt and output filter.</p>' +
          '<p>"Alignment" in this lab refers specifically to <em>safety</em> alignment (the model refusing harmful prompts). The broader research program — making the model want what humans want — is much harder and far from solved.</p>',
      },
      'rlhf': {
        title: 'RLHF · reinforcement learning from human feedback',
        body:
          '<p>The standard approach to preference training since OpenAI\'s 2022 InstructGPT paper. Step 1: collect pairs of model responses to the same prompt, and have humans rank which response they prefer. Step 2: train a small reward model to predict the human preference. Step 3: use the reward model as the reward signal in a PPO loop that fine-tunes the language model to produce higher-reward responses.</p>' +
          '<p>Modern variants skip the reward-model step and optimize the policy <em>directly</em> on the preference pairs — cheaper, often more stable, and now more common than vanilla RLHF in production pipelines:</p>' +
          '<ul>' +
          '<li><strong><a href="https://arxiv.org/abs/2305.18290">DPO</a></strong> (Direct Preference Optimization, Rafailov et al. 2023). The key trick: the authors show that the optimal RLHF policy and its reward model are related by a closed-form equation, so the reward is <em>implicit</em> in the policy and you never have to train a separate one. That collapses the whole three-step RLHF pipeline into a single classification-style loss on "chosen vs. rejected" response pairs — no reward model, no PPO, no sampling loop. It is by far the most widely used variant today; most open-weights chat models you download were preference-tuned with DPO or a close cousin.</li>' +
          '<li><strong><a href="https://arxiv.org/abs/2402.01306">KTO</a></strong> (Kahneman–Tversky Optimization, Ethayarajh et al. 2024). Borrows the value function from prospect theory — the behavioral-economics finding that people feel losses more sharply than equivalent gains — and bakes that asymmetry into the loss. The practical payoff is the data format: KTO needs only a binary "this response was good / bad" label per example, not paired comparisons of two responses to the same prompt. That kind of thumbs-up/thumbs-down signal is far cheaper and more natural to collect at scale (e.g. from production user feedback).</li>' +
          '<li><strong><a href="https://arxiv.org/abs/2310.12036">IPO</a></strong> (Identity Preference Optimization, Azar et al. 2023). A theoretical fix for a failure mode of DPO: when the preference data is nearly deterministic (one response almost always beats the other), DPO\'s objective pushes the probability ratio toward infinity and the model overfits, drifting far from the reference policy. IPO adds a regularization term that caps this pressure, keeping the tuned policy close to where it started instead of collapsing onto a handful of "always preferred" responses. In practice it trades a little peak performance for more robust, predictable training.</li>' +
          '</ul>' +
          '<p><strong>Note — "policy" is just the model.</strong> In all of these, the <em>policy</em> is the language model being trained: the same object you optimized with <a href="../lab-03/nanochat.html">GRPO</a> (Group Relative Policy Optimization) in the nanochat lab\'s RL phase. What differs is the reward signal. GRPO uses <em>verifiable</em> rewards — did the math check out, did the code pass tests? — scored against a group-relative baseline, with no human labels and no reward model. RLHF/DPO/KTO/IPO instead tune the policy on <em>human or AI preference</em> data (which of two responses is better). Same thing being adjusted, different source of "what counts as better."</p>',
      },
      'lora': {
        title: 'LoRA · Low-Rank Adaptation',
        body:
          '<p>A way to fine-tune cheaply by training a tiny <em>add-on</em> instead of the whole model. The insight: the change you make to a weight matrix during fine-tuning, <code>ΔW</code>, is <strong>low-rank</strong> — it fits in a small subspace — so you can write <code>ΔW = B·A</code> with two skinny matrices of rank <code>r</code> (say 8), freeze the original weights, and train only <code>A</code> and <code>B</code>. That\'s typically under 1% of the parameters.</p>' +
          '<p>Because only <code>A</code> and <code>B</code> carry gradients and optimizer state, the memory cost of fine-tuning collapses. It is the standard tool for fine-tuning on limited hardware. Paper: Hu et al., <a href="https://arxiv.org/abs/2106.09685">LoRA (2021)</a>. See also <strong>QLoRA</strong> and <strong>PEFT</strong>.</p>',
      },
      'qlora': {
        title: 'QLoRA · quantized LoRA',
        body:
          '<p><strong>LoRA</strong> with one extra trick: store the <em>frozen</em> base model in <strong>4-bit</strong> precision instead of 16- or 32-bit. Since the base is never updated — only the small adapters train — you can afford the lower precision when reading it for the forward pass, and its memory drops roughly 4×.</p>' +
          '<p>The payoff is concrete: a 7-billion-parameter model becomes fine-tunable on a single consumer GPU (~6–12 GB of <strong>VRAM</strong>), in minutes-to-hours rather than days. Paper: Dettmers et al., <a href="https://arxiv.org/abs/2305.14314">QLoRA (2023)</a>.</p>',
      },
      'fp32': {
        title: 'fp32 · 32-bit floating point',
        body:
          '<p>The standard "full precision" number format: 32 bits — <strong>4 bytes</strong> — per value, the default for a model\'s weights, gradients, and optimizer state during training. That\'s why the count here is 16 bytes per parameter (4 numbers × 4 bytes).</p>' +
          '<p>Lower-precision formats trade accuracy for memory: <code>fp16</code>/<code>bf16</code> are 16-bit (2 bytes, half the size), and 4-bit <strong>quantization</strong> (as in QLoRA) is 8× smaller than fp32. Cutting precision is the main lever for fitting training or serving into limited GPU memory.</p>',
      },
      'quantization': {
        title: 'quantization',
        body:
          '<p>Storing a model\'s numbers in fewer bits — e.g. 4-bit integers instead of 16- or 32-bit floats — to shrink its memory and speed up inference, at a small cost in precision. A 7B model in fp16 needs ~14 GB just for the weights; in 4-bit, ~3.5 GB.</p>' +
          '<p>It matters for fine-tuning because a <em>frozen</em> base model (as in <strong>QLoRA</strong>) tolerates aggressive quantization well — you only read it, never update it — so you spend your precision budget on the parts that are actually learning.</p>',
      },
      'peft': {
        title: 'PEFT · parameter-efficient fine-tuning',
        body:
          '<p>The umbrella term for methods that fine-tune a model by updating only a <em>small fraction</em> of its parameters (or a few added ones) instead of all of them. <strong>LoRA</strong> is the most common member; others include prefix-tuning and adapters.</p>' +
          '<p>Also the name of <a href="https://huggingface.co/docs/peft">Hugging Face\'s <code>peft</code> library</a>, which implements them. The goal is always the same: get most of the benefit of fine-tuning for a tiny fraction of the compute and memory.</p>',
      },
      'vram': {
        title: 'VRAM · GPU memory',
        body:
          '<p>The memory on a graphics card, where a model\'s weights, activations, and (during training) gradients and optimizer state must all fit to run on the GPU. It is the usual bottleneck for both fine-tuning and serving large models — a consumer card has 8–24 GB, a data-center A100/H100 has 40–80 GB.</p>' +
          '<p>The whole point of <strong>LoRA</strong>/<strong>QLoRA</strong> is to fit a fine-tune into consumer-sized VRAM: full fine-tuning a 7B model needs ~100 GB of optimizer state, while QLoRA fits in ~6–12 GB.</p>',
      },
      'constitutional-ai': {
        title: 'Constitutional AI',
        body:
          '<p>Anthropic\'s 2022 alignment technique. Instead of relying on human red-teamers and labelers (expensive, slow, capped by human bandwidth), use a <em>separate LLM</em> to critique and revise responses according to a written "constitution" — a list of principles the model should follow ("be helpful", "avoid harm", "don\'t deceive", etc.).</p>' +
          '<p>The constitution is small (a few hundred lines of English); the critique loop is automated and scales. Constitutional AI is the technique behind Claude\'s alignment. Paper: <a href="https://www.anthropic.com/news/constitutional-ai-harmlessness-from-ai-feedback">anthropic.com/news/constitutional-ai</a>.</p>',
      },
      'refusal-direction': {
        title: 'refusal direction',
        body:
          '<p>A single vector in the model\'s residual-stream basis that "fires" whenever the model is about to refuse a prompt. <strong>Computed simply</strong> as the mean residual stream for refused prompts minus the mean for complied-with prompts (normalized).</p>' +
          '<p>The empirical observation from <a href="https://arxiv.org/abs/2406.11717">Arditi et al. (2024)</a>: this single direction <em>fully mediates</em> refusal behavior — projecting it out of the weights ablates the behavior without measurably affecting other capabilities. Found in every aligned chat model the authors tested (Llama, Qwen, Yi, Gemma, Mistral). The 2D visualization at the top of this lab is exactly this finding, scaled to a toy.</p>',
      },
      'residual-stream': {
        title: 'residual stream',
        body:
          '<p>In a transformer, every token\'s processing at every layer produces an output vector that\'s added to a "running sum" — the residual stream. Each subsequent attention or MLP layer reads from this stream and writes back into it. The residual stream has a fixed dimensionality (e.g., 4,096 for a 7B Llama model, 12,288 for GPT-3) regardless of layer count.</p>' +
          '<p>For our purposes: the residual stream is the model\'s internal "working memory." Concepts like "this is a refusal" live as <em>directions</em> in this space. Mechanistic interpretability is the project of identifying those directions and the circuits that use them.</p>',
      },
      'activation': {
        title: 'activation',
        body:
          '<p>The actual <em>numbers</em> flowing through a network at run time — the output vector a layer produces for a given input, as opposed to the fixed <strong>weights</strong> that produced it. In a transformer, the activation we care about here is the residual-stream vector at a layer: one point in the model\'s latent space for each token.</p>' +
          '<p>The distinction is the whole game in abliteration. A <strong>hook</strong> edits the <em>activation</em> as it flows past (temporary, this forward pass only); <code>apply_refusal_dirs</code> edits the <em>weights</em> so every future activation is born without the refusal component (permanent). FailSpy caches activations from <code>resid_pre</code>, <code>resid_post</code>, <code>mlp_out</code>, and <code>attn_out</code> — all layer outputs.</p>',
      },
      'latent-space': {
        title: 'latent space',
        body:
          '<p>A learned, high-dimensional space in which a model represents its inputs as vectors, arranged so that <em>semantic similarity becomes geometric proximity</em> — similar things sit close together. You already know examples: a word2vec embedding, an autoencoder\'s bottleneck, the space a PCA or t-SNE plot projects down from.</p>' +
          '<p>The key property this lab leans on: meaningful concepts often correspond to <em>directions</em> in that space, so you can do arithmetic with meaning (<code>king − man + woman ≈ queen</code>). In a transformer the relevant latent space is the <strong>residual stream</strong>, and "refuse" is one such direction — which is why it can be measured, projected onto, and subtracted. Play with the 2D version in §2.</p>',
      },
      'abliteration': {
        title: 'abliteration',
        body:
          '<p>The procedure that removes a behavior (typically refusal) from a model\'s weights by projecting a corresponding direction out of every weight matrix that writes into the residual stream. ~30 lines of Python; runs in minutes on a single GPU.</p>' +
          '<p>Coined as a portmanteau of <em>ablation</em> (the neuroscience term for removing tissue to see what stops working) and <em>obliteration</em>. The community implementation everyone copies is <a href="https://github.com/FailSpy/abliterator">FailSpy\'s abliterator</a>; the standard write-up is <a href="https://huggingface.co/blog/mlabonne/abliteration">Maxime Labonne\'s</a>.</p>',
      },
      'dolphin': {
        title: 'Dolphin (model family)',
        body:
          '<p>Eric Hartford\'s line of uncensored open-weights fine-tunes — Dolphin-Mistral, Dolphin-Llama, Dolphin-Mixtral, etc. Hartford takes a popular base model, fine-tunes on a dataset with alignment-shaped examples removed, and publishes the weights on Hugging Face.</p>' +
          '<p>Hundreds of thousands of downloads collectively. The model card carries a famous disclaimer about uncensored output and user responsibility. From the defender\'s POV: a real, widely-distributed example of how easily off-the-shelf alignment is undone. Catalog: <a href="https://huggingface.co/cognitivecomputations">huggingface.co/cognitivecomputations</a>.</p>',
      },
      'output-classifier': {
        title: 'output classifier',
        body:
          '<p>A separate model — smaller and simpler than the one generating responses — whose only job is to read <code>(prompt, response)</code> and emit a safety verdict (<em>safe / unsafe / borderline</em>), often with a category tag.</p>' +
          '<p>The cheapest, most effective single defense against unaligned generation models. Lives <em>outside</em> the generation model so weight-modification attacks like abliteration don\'t bypass it. Open implementations: Meta\'s <a href="https://huggingface.co/meta-llama/LlamaGuard-7b">Llama Guard</a>, AllenAI\'s WildGuard, OpenAI\'s Moderation endpoint. This is what you ship for the assignment.</p>',
      },
      'llama-guard': {
        title: 'Llama Guard',
        body:
          '<p>Meta\'s open-source safety classifier — a fine-tuned Llama variant whose job is to classify <code>(prompt, response)</code> pairs into a taxonomy of safety categories (violence, hate, sexual content, criminal planning, self-harm, regulated advice). Releases tracked at <a href="https://huggingface.co/meta-llama/LlamaGuard-7b">huggingface.co/meta-llama/LlamaGuard-7b</a>.</p>' +
          '<p>The canonical example of "ship the safety classifier separately from the generation model." The classifier is small enough to run on the same GPU as your generation model with negligible latency overhead. The assignment for this lab is a Llama-Guard-style classifier in miniature.</p>',
      },
      'red-team': {
        title: 'red team',
        body:
          '<p>A group (in security) or AI-safety-team subgroup (in ML safety) whose job is to <em>attack</em> the system to find weaknesses before adversaries do. In ML alignment specifically, red-teaming is the process of constructing prompts that trick aligned models into producing unsafe content.</p>' +
          '<p>Anthropic, OpenAI, Google DeepMind, and Meta all have internal red teams. Public red-team datasets — <a href="https://arxiv.org/abs/2308.03825">HarmBench</a>, <a href="https://github.com/llm-attacks/llm-attacks">llm-attacks</a>, AdvBench — are widely used to evaluate alignment. Red-teaming the classifier (your assignment\'s output) is itself an exercise; covered in Lab 12.</p>',
      },
      'jailbreak': {
        title: 'jailbreak',
        body:
          '<p>An <em>input-only</em> attack that makes an aligned model produce content its safety training would normally refuse — no weight changes, no fine-tuning, just a crafted prompt (or image, or multi-turn setup) that shifts the model\'s most-likely continuation away from "I can\'t help with that."</p>' +
          '<p>Contrast with <a href="https://github.com/FailSpy/abliterator">abliteration</a>, which edits the weights: a jailbreak leaves the model untouched and works even on closed APIs whose weights you never see. The same model can be both abliterated <em>and</em> jailbroken. Defenders treat "the model refused in testing" as no guarantee — see the technique families in §5.2.</p>',
      },
      'openrouter': {
        title: 'OpenRouter',
        body:
          '<p>A commercial API gateway that exposes 100+ models from many providers (OpenAI, Anthropic, Google, Moonshot, open-weights hosts, …) behind a single OpenAI-compatible endpoint and one API key. You change a model string, not your code, to switch providers.</p>' +
          '<p>Relevant here because tools like G0DM0D3 use it to fire the <em>same</em> jailbreak prompt at many models at once and keep whichever complies — turning "which model is breakable today?" into a parallel search. Site: <a href="https://openrouter.ai/">openrouter.ai</a>.</p>',
      },
      'hf-spaces': {
        title: 'Hugging Face Spaces',
        body:
          '<p><a href="https://huggingface.co/">Hugging Face</a> is the dominant hub for sharing open models, datasets, and demos. A <strong>Space</strong> is a ready-to-run web app hosted on HF — a chat box or demo UI you open in a browser with no install and no API key of your own. It wraps a model behind a public URL so anyone can use it.</p>' +
          '<p>For this lab Spaces are the <em>distribution</em> layer: an uncensored or abliterated model behind a Space needs zero skill to use. HF\'s <a href="https://huggingface.co/content-policy">content policy</a> covers Models, Datasets, and Spaces, but moderation is largely flag-then-review — so a defender assumes the artifact is reachable somewhere. Browse <a href="https://huggingface.co/spaces?search=uncensored">Spaces</a> for "uncensored" to see the live list.</p>',
      },
    };

    function clearActive() {
      document.querySelectorAll('.gloss.active').forEach(t => t.classList.remove('active'));
    }
    function findInsertTarget(termEl) {
      if (!termEl || !termEl.parentElement) return null;
      let node = termEl.parentElement;
      while (node) {
        const tag = (node.tagName || '').toLowerCase();
        if (['p','h1','h2','h3','h4','h5','blockquote','pre','figure','div'].includes(tag)) {
          if (node.id === 'glossary-panel' || node === panel) { node = node.parentElement; continue; }
          return node;
        }
        if (tag === 'li') {
          const list = node.parentElement;
          if (list && (list.tagName === 'OL' || list.tagName === 'UL')) return list;
          return node;
        }
        if (tag === 'td' || tag === 'th') {
          let t = node;
          while (t && t.tagName !== 'TABLE') t = t.parentElement;
          return t || node;
        }
        if (tag === 'main' || tag === 'body') return null;
        node = node.parentElement;
      }
      return null;
    }
    function show(termId, el) {
      const entry = GLOSSARY[termId];
      if (!entry) return;
      clearActive();
      if (el) el.classList.add('active');
      content.innerHTML =
        '<div class="glossary-panel-title">' + entry.title + '</div>' + entry.body;
      const target = el ? findInsertTarget(el) : null;
      if (target && target.parentNode && target.nextSibling !== panel) {
        target.parentNode.insertBefore(panel, target.nextSibling);
      }
      panel.hidden = false;
      panel.style.animation = 'none';
      void panel.offsetWidth;
      panel.style.animation = '';
    }
    function hide() { clearActive(); panel.hidden = true; }

    terms.forEach(t => {
      t.setAttribute('tabindex', '0');
      t.setAttribute('role', 'button');
      const id = t.getAttribute('data-gloss');
      t.addEventListener('mouseenter', () => show(id, t));
      t.addEventListener('focus',      () => show(id, t));
      t.addEventListener('click',      (e) => { e.preventDefault(); show(id, t); });
      t.addEventListener('keydown',    (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(id, t); }
      });
    });
    closeBtn.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (panel.hidden) return;
      if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
      hide();
    });
  })();

})();
