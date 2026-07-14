/* microgpt — interactive visualizations
 * Tokenizer · Value class · topological sort + backward · parameters · architecture · attention · softmax · loss curve
 */

(function () {
  'use strict';

  /* ---------------------------------------------------------------- */
  /*  Toy-GPT button listeners — attached FIRST, before anything else */
  /*  can throw. If a later widget fails, these still work.           */
  /* ---------------------------------------------------------------- */
  (function bindToyGptButtonsEarly() {
    const map = [
      ['toygpt-train',        '__toygptTrain'],
      ['toygpt-step',         '__toygptStep'],
      ['toygpt-untrain',      '__toygptUntrain'],
      ['toygpt-reset-pinned', '__toygptRestore'],
    ];
    for (const [id, key] of map) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      btn.addEventListener('click', () => {
        console.log('[toygpt] ' + id + ' click reached top-level handler');
        const fn = window[key];
        if (typeof fn === 'function') {
          try { fn(); }
          catch (e) {
            console.error('[toygpt] ' + id + ' handler threw:', e);
          }
        } else {
          console.warn('[toygpt] ' + id + ' handler not registered — an earlier viz.js init likely failed; check console for the first error');
        }
      });
    }
  })();

  /* ---------------------------------------------------------------- */
  /*  Generic tabs                                                    */
  /* ---------------------------------------------------------------- */
  document.querySelectorAll('.tabs').forEach((tabs) => {
    const buttons = tabs.querySelectorAll('.tab-buttons button');
    const panes = tabs.querySelectorAll('.tab-content > div');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        buttons.forEach((b) => b.classList.toggle('active', b === btn));
        panes.forEach((p) => p.classList.toggle('active', p.dataset.pane === target));
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Tokenizer playground                                            */
  /* ---------------------------------------------------------------- */
  const UCHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const BOS_ID = UCHARS.length; // 26

  function renderTokens(name) {
    const out = document.getElementById('tok-output');
    if (!out) return;
    const ids = [BOS_ID, ...name.split('').map((c) => UCHARS.indexOf(c.toLowerCase())).filter((id) => id >= 0), BOS_ID];
    const display = [];
    display.push({ char: 'BOS', id: BOS_ID, bos: true });
    name.toLowerCase().split('').forEach((c) => {
      const idx = UCHARS.indexOf(c);
      if (idx >= 0) display.push({ char: c, id: idx });
    });
    display.push({ char: 'BOS', id: BOS_ID, bos: true });
    out.innerHTML = '';
    display.forEach((d) => {
      const chip = document.createElement('span');
      chip.className = 'token-chip' + (d.bos ? ' bos' : '');
      chip.innerHTML = `<span class="char">${d.char}</span><span class="id">${d.id}</span>`;
      out.appendChild(chip);
    });
    const summary = document.createElement('div');
    summary.style.marginTop = '12px';
    summary.style.fontSize = '13px';
    summary.style.fontFamily = 'var(--sans)';
    summary.style.color = 'var(--ink-mute)';
    const idArr = display.map((d) => d.id);
    summary.innerHTML = `<strong>tokens</strong> = <code style="background:transparent">[${idArr.join(', ')}]</code> · length ${idArr.length}`;
    out.appendChild(summary);
  }

  const tokInput = document.getElementById('tok-input');
  if (tokInput) {
    tokInput.addEventListener('input', (e) => renderTokens(e.target.value));
    document.querySelectorAll('[data-tok]').forEach((b) => {
      b.addEventListener('click', () => {
        tokInput.value = b.dataset.tok;
        renderTokens(b.dataset.tok);
      });
    });
    renderTokens(tokInput.value);
  }

  /* ---------------------------------------------------------------- */
  /*  Backprop animation — 4 progressively richer cases (tabbed)      */
  /* ---------------------------------------------------------------- */
  const bpSvg = document.getElementById('bp-svg');
  if (bpSvg) {
    const ns = 'http://www.w3.org/2000/svg';

    // Each case has: nodes, edges, viewBox, intro, and a step sequence.
    const CASES = {
      add: {
        intro: '<strong>Case 1 — addition only.</strong> The simplest possible backward pass: <code>L = a + b</code>. Local derivatives of <code>+</code> are both <code>1</code>, so the gradient just <em>copies</em> through.',
        viewBox: '0 0 700 320',
        nodes: {
          a: { x: 130, y: 90,  label: 'a', data: 3 },
          b: { x: 130, y: 230, label: 'b', data: 5 },
          L: { x: 540, y: 160, label: 'L = a+b', data: 8 },
        },
        edges: [
          { from: 'a', to: 'L', localGrad: 1, key: 'a→L' },
          { from: 'b', to: 'L', localGrad: 1, key: 'b→L' },
        ],
        steps: [
          { msg: 'Create leaf <code>a = Value(3)</code>.', visibleNodes:['a'], visibleEdges:[], grads:{} },
          { msg: 'Create leaf <code>b = Value(5)</code>.', visibleNodes:['a','b'], visibleEdges:[], grads:{} },
          { msg: 'Compute <code>L = a + b = 8</code>. Local grads on both edges are <code>1</code>.', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], grads:{},
            math: [
              'L = a + b = 3 + 5 = 8',
              '\\text{local: } \\quad \\frac{\\partial L}{\\partial a} = 1, \\quad \\frac{\\partial L}{\\partial b} = 1'
            ] },
          { msg: 'Topological sort: <code>[a, b, L]</code>.', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], topo:['a','b','L'], grads:{} },
          { msg: 'Seed <code>L.grad = 1</code>.', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], topo:['a','b','L'], current:'L', grads:{L:1},
            math: ['\\frac{\\partial L}{\\partial L} = 1'] },
          { msg: 'Pop <code>L</code>. <code>a.grad += 1 × 1 = 1</code> and <code>b.grad += 1 × 1 = 1</code>. <strong>Addition copies the gradient to every input.</strong>', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], activeEdges:['a→L','b→L'], topo:['a','b','L'], current:'L', grads:{L:1,a:1,b:1},
            math: [
              '\\begin{aligned}\\frac{\\partial L}{\\partial a} &= \\underbrace{\\frac{\\partial L}{\\partial L}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial L}{\\partial a}\\bigg|_{\\text{local}}}_{=\\,1} \\\\ &= 1 \\cdot 1 \\\\ &= 1 \\end{aligned}',
              '\\begin{aligned}\\frac{\\partial L}{\\partial b} &= \\underbrace{\\frac{\\partial L}{\\partial L}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial L}{\\partial b}\\bigg|_{\\text{local}}}_{=\\,1} \\\\ &= 1 \\cdot 1 \\\\ &= 1 \\end{aligned}'
            ] },
          { msg: 'Done. ✓<br><strong>Final: <code>a.grad = 1</code>, <code>b.grad = 1</code>.</strong>', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], topo:['a','b','L'], grads:{L:1,a:1,b:1}, done:true,
            math: ['\\boxed{\\;\\frac{\\partial L}{\\partial a} = 1, \\quad \\frac{\\partial L}{\\partial b} = 1\\;}'] },
        ],
      },

      mul: {
        intro: '<strong>Case 2 — multiplication only.</strong> Same shape, but the local derivative of <code>L = a × b</code> w.r.t. <code>a</code> is <code>b</code>, and vice-versa. Multiplication <em>swaps</em> the values when sending gradients back.',
        viewBox: '0 0 700 320',
        nodes: {
          a: { x: 130, y: 90,  label: 'a', data: 4 },
          b: { x: 130, y: 230, label: 'b', data: 3 },
          L: { x: 540, y: 160, label: 'L = a·b', data: 12 },
        },
        edges: [
          { from: 'a', to: 'L', localGrad: 3, key: 'a→L' },   // ∂L/∂a = b
          { from: 'b', to: 'L', localGrad: 4, key: 'b→L' },   // ∂L/∂b = a
        ],
        steps: [
          { msg: 'Create leaf <code>a = Value(4)</code>.', visibleNodes:['a'], visibleEdges:[], grads:{} },
          { msg: 'Create leaf <code>b = Value(3)</code>.', visibleNodes:['a','b'], visibleEdges:[], grads:{} },
          { msg: 'Compute <code>L = a × b = 12</code>. Local grads: <code>∂L/∂a = b = 3</code> and <code>∂L/∂b = a = 4</code>.', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], grads:{},
            math: [
              'L = a \\cdot b = 4 \\cdot 3 = 12',
              '\\text{local: } \\quad \\frac{\\partial L}{\\partial a} = b = 3, \\quad \\frac{\\partial L}{\\partial b} = a = 4'
            ] },
          { msg: 'Topological sort: <code>[a, b, L]</code>.', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], topo:['a','b','L'], grads:{} },
          { msg: 'Seed <code>L.grad = 1</code>.', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], topo:['a','b','L'], current:'L', grads:{L:1},
            math: ['\\frac{\\partial L}{\\partial L} = 1'] },
          { msg: 'Pop <code>L</code>. <code>a.grad += b × 1 = 3</code> · <code>b.grad += a × 1 = 4</code>. <strong>Multiplication sends each input the <em>other</em> input\'s value as its gradient.</strong>', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], activeEdges:['a→L','b→L'], topo:['a','b','L'], current:'L', grads:{L:1,a:3,b:4},
            math: [
              '\\begin{aligned}\\frac{\\partial L}{\\partial a} &= \\underbrace{\\frac{\\partial L}{\\partial L}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial L}{\\partial a}\\bigg|_{\\text{local}}}_{=\\,b} \\\\ &= 1 \\cdot b \\\\ &= 1 \\cdot 3 \\\\ &= 3 \\end{aligned}',
              '\\begin{aligned}\\frac{\\partial L}{\\partial b} &= \\underbrace{\\frac{\\partial L}{\\partial L}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial L}{\\partial b}\\bigg|_{\\text{local}}}_{=\\,a} \\\\ &= 1 \\cdot a \\\\ &= 1 \\cdot 4 \\\\ &= 4 \\end{aligned}'
            ] },
          { msg: 'Done. ✓<br><strong>Final: <code>a.grad = 3</code>, <code>b.grad = 4</code>.</strong> Bigger paired value → bigger gradient.', visibleNodes:['a','b','L'], visibleEdges:['a→L','b→L'], topo:['a','b','L'], grads:{L:1,a:3,b:4}, done:true,
            math: ['\\boxed{\\;\\frac{\\partial L}{\\partial a} = 3, \\quad \\frac{\\partial L}{\\partial b} = 4\\;}'] },
        ],
      },

      combo: {
        intro: '<strong>Case 3 — both, with a branch.</strong> <code>c = a × b</code>; <code>L = c + a</code>. Now <code>a</code> is used in two places — the graph branches at <code>a</code>. Its gradient becomes the <em>sum</em> over both paths (the <code>+=</code> in <code>backward()</code>).',
        viewBox: '0 0 700 320',
        nodes: {
          a: { x: 110, y: 220, label: 'a', data: 2 },
          b: { x: 110, y: 80,  label: 'b', data: 3 },
          c: { x: 360, y: 150, label: 'c = a·b', data: 6 },
          L: { x: 590, y: 150, label: 'L = c+a',  data: 8 },
        },
        edges: [
          { from: 'a', to: 'c', localGrad: 3.0, key: 'a→c' },
          { from: 'b', to: 'c', localGrad: 2.0, key: 'b→c' },
          { from: 'c', to: 'L', localGrad: 1.0, key: 'c→L' },
          { from: 'a', to: 'L', localGrad: 1.0, key: 'a→L' },
        ],
        steps: [
          { msg: 'Create leaf <code>a = Value(2.0)</code>.', visibleNodes:['a'], visibleEdges:[], grads:{} },
          { msg: 'Create leaf <code>b = Value(3.0)</code>.', visibleNodes:['a','b'], visibleEdges:[], grads:{} },
          { msg: 'Compute <code>c = a × b</code>. Children <code>(a, b)</code> with local grads <code>(b=3, a=2)</code>.', visibleNodes:['a','b','c'], visibleEdges:['a→c','b→c'], grads:{},
            math: [
              'c = a \\cdot b = 2 \\cdot 3 = 6',
              '\\text{local at } c: \\quad \\frac{\\partial c}{\\partial a} = b = 3, \\quad \\frac{\\partial c}{\\partial b} = a = 2'
            ] },
          { msg: 'Compute <code>L = c + a</code>. <code>a</code> is now a child of two parents — the graph <strong>branches</strong>.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], grads:{},
            math: [
              'L = c + a = 6 + 2 = 8',
              '\\text{local at } L: \\quad \\frac{\\partial L}{\\partial c} = 1, \\quad \\frac{\\partial L}{\\partial a} = 1'
            ] },
          { msg: 'DFS from <code>L</code>. Mark visited, recurse into children.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], visited:['L'], current:'L', grads:{} },
          { msg: 'Descend into <code>c</code>.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], visited:['L','c'], current:'c', grads:{} },
          { msg: 'Descend into <code>a</code>. Leaf — <code>topo.append(a)</code>.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], topo:['a'], visited:['L','c','a'], current:'a', grads:{} },
          { msg: 'Back at <code>c</code>. Recurse into <code>b</code>. Leaf — <code>topo.append(b)</code>.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], topo:['a','b'], visited:['L','c','a','b'], current:'b', grads:{} },
          { msg: 'All <code>c</code>\'s children done. <code>topo.append(c)</code>.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], topo:['a','b','c'], visited:['L','c','a','b'], current:'c', grads:{} },
          { msg: 'Back at <code>L</code>. <code>a</code> already visited — skip. <code>topo.append(L)</code>.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], topo:['a','b','c','L'], visited:['L','c','a','b'], current:'L', grads:{} },
          { msg: 'Seed <code>L.grad = 1</code>.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], topo:['a','b','c','L'], current:'L', grads:{L:1},
            math: ['\\frac{\\partial L}{\\partial L} = 1'] },
          { msg: 'Pop <code>L</code>. <code>c.grad += 1×1 = 1</code> · <code>a.grad += 1×1 = 1</code>.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], activeEdges:['c→L','a→L'], topo:['a','b','c','L'], current:'L', grads:{L:1,c:1,a:1},
            math: [
              '\\begin{aligned}\\frac{\\partial L}{\\partial c} &= \\frac{\\partial L}{\\partial L} \\cdot \\frac{\\partial L}{\\partial c}\\bigg|_{\\text{local}} \\\\ &= 1 \\cdot 1 = 1 \\end{aligned}',
              '\\begin{aligned}\\frac{\\partial L}{\\partial a} \\mathrel{+}{}\\!\\!&= \\frac{\\partial L}{\\partial L} \\cdot \\frac{\\partial L}{\\partial a}\\bigg|_{\\text{local}} \\\\ &= 1 \\cdot 1 = 1 \\quad \\text{(first path)} \\end{aligned}'
            ] },
          { msg: 'Pop <code>c</code>. <code>a.grad += 3×1 = 3</code> <strong>(now total 4 — the two paths summed)</strong> · <code>b.grad += 2×1 = 2</code>.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], activeEdges:['a→c','b→c'], topo:['a','b','c','L'], current:'c', grads:{L:1,c:1,a:4,b:2},
            math: [
              '\\begin{aligned}\\frac{\\partial L}{\\partial a} \\mathrel{+}{}\\!\\!&= \\underbrace{\\frac{\\partial L}{\\partial c}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial c}{\\partial a}}_{=\\,b} \\\\ &= 1 \\cdot b \\\\ &= 1 \\cdot 3 \\\\ &= 3 \\quad \\text{(second path; total } = 1 + 3 = 4) \\end{aligned}',
              '\\begin{aligned}\\frac{\\partial L}{\\partial b} &= \\underbrace{\\frac{\\partial L}{\\partial c}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial c}{\\partial b}}_{=\\,a} \\\\ &= 1 \\cdot a \\\\ &= 1 \\cdot 2 \\\\ &= 2 \\end{aligned}'
            ] },
          { msg: 'Done. ✓<br><strong>Final: <code>a.grad = 4</code>, <code>b.grad = 2</code>.</strong> Identical to PyTorch.', visibleNodes:['a','b','c','L'], visibleEdges:['a→c','b→c','c→L','a→L'], topo:['a','b','c','L'], grads:{L:1,c:1,a:4,b:2}, done:true,
            math: ['\\boxed{\\;\\frac{\\partial L}{\\partial a} = 4, \\quad \\frac{\\partial L}{\\partial b} = 2\\;}'] },
        ],
      },

      loss: {
        intro: '<strong>Case 4 — a real training step.</strong> Inputs <code>x</code> and target <code>y</code> are data (fixed); <code>w</code> and <code>b</code> are parameters we want to nudge. We compute a prediction <code>ŷ = w·x + b</code>, the error <code>err = ŷ - y</code>, and the loss <code>err²</code>. Backprop gives us <code>∂loss/∂w</code> and <code>∂loss/∂b</code> — exactly what an optimizer needs.',
        viewBox: '0 0 920 420',
        nodes: {
          w: { x: 80,  y: 70,  label: 'w (param)',  data: 2 },
          x: { x: 80,  y: 160, label: 'x (data)',   data: 3 },
          b: { x: 80,  y: 270, label: 'b (param)',  data: 1 },
          y: { x: 80,  y: 360, label: 'y (target)', data: 10 },
          z:    { x: 300, y: 115, label: 'z = w·x',   data: 6 },
          yhat: { x: 500, y: 190, label: 'ŷ = z+b',   data: 7 },
          err:  { x: 690, y: 275, label: 'err = ŷ−y', data: -3 },
          loss: { x: 850, y: 275, label: 'loss = err²', data: 9 },
        },
        edges: [
          { from: 'w', to: 'z',    localGrad: 3,  key: 'w→z' },   // ∂z/∂w = x = 3
          { from: 'x', to: 'z',    localGrad: 2,  key: 'x→z' },   // ∂z/∂x = w = 2
          { from: 'z', to: 'yhat', localGrad: 1,  key: 'z→ŷ' },
          { from: 'b', to: 'yhat', localGrad: 1,  key: 'b→ŷ' },
          { from: 'yhat', to: 'err', localGrad: 1, key: 'ŷ→err' },
          { from: 'y',    to: 'err', localGrad: -1, key: 'y→err' },
          { from: 'err',  to: 'loss', localGrad: -6, key: 'err→loss' },   // ∂loss/∂err = 2·err = -6
        ],
        steps: [
          { msg: 'Inputs: data <code>x = 3</code>, target <code>y = 10</code>. Parameters: <code>w = 2</code>, <code>b = 1</code>.', visibleNodes:['w','x','b','y'], visibleEdges:[], grads:{} },
          { msg: 'Forward: <code>z = w × x = 6</code>. Local grads <code>(x=3, w=2)</code>.', visibleNodes:['w','x','b','y','z'], visibleEdges:['w→z','x→z'], grads:{},
            math: [
              'z = w \\cdot x = 2 \\cdot 3 = 6',
              '\\text{local: } \\quad \\frac{\\partial z}{\\partial w} = x = 3, \\quad \\frac{\\partial z}{\\partial x} = w = 2'
            ] },
          { msg: 'Forward: <code>ŷ = z + b = 7</code>. Local grads <code>(1, 1)</code>.', visibleNodes:['w','x','b','y','z','yhat'], visibleEdges:['w→z','x→z','z→ŷ','b→ŷ'], grads:{},
            math: [
              '\\hat{y} = z + b = 6 + 1 = 7',
              '\\text{local: } \\quad \\frac{\\partial \\hat{y}}{\\partial z} = 1, \\quad \\frac{\\partial \\hat{y}}{\\partial b} = 1'
            ] },
          { msg: 'Forward: <code>err = ŷ − y = −3</code>. Local grads <code>(+1 from ŷ, −1 from y)</code>.', visibleNodes:['w','x','b','y','z','yhat','err'], visibleEdges:['w→z','x→z','z→ŷ','b→ŷ','ŷ→err','y→err'], grads:{},
            math: [
              '\\text{err} = \\hat{y} - y = 7 - 10 = -3',
              '\\text{local: } \\quad \\frac{\\partial\\,\\text{err}}{\\partial \\hat{y}} = 1, \\quad \\frac{\\partial\\,\\text{err}}{\\partial y} = -1'
            ] },
          { msg: 'Forward: <code>loss = err² = 9</code>. Local grad <code>∂loss/∂err = 2·err = −6</code>.', visibleNodes:['w','x','b','y','z','yhat','err','loss'], visibleEdges:['w→z','x→z','z→ŷ','b→ŷ','ŷ→err','y→err','err→loss'], grads:{},
            math: [
              '\\text{loss} = \\text{err}^2 = (-3)^2 = 9',
              '\\text{local: } \\quad \\frac{\\partial\\,\\text{loss}}{\\partial\\,\\text{err}} = 2 \\cdot \\text{err} = 2(-3) = -6'
            ] },
          { msg: 'Topological sort done. Seed <code>loss.grad = 1</code>.', visibleNodes:['w','x','b','y','z','yhat','err','loss'], visibleEdges:['w→z','x→z','z→ŷ','b→ŷ','ŷ→err','y→err','err→loss'], topo:['w','x','b','y','z','yhat','err','loss'], current:'loss', grads:{loss:1},
            math: ['\\frac{\\partial\\,\\text{loss}}{\\partial\\,\\text{loss}} = 1'] },
          { msg: 'Pop <code>loss</code>. <code>err.grad += −6 × 1 = −6</code>.', visibleNodes:['w','x','b','y','z','yhat','err','loss'], visibleEdges:['w→z','x→z','z→ŷ','b→ŷ','ŷ→err','y→err','err→loss'], activeEdges:['err→loss'], topo:['w','x','b','y','z','yhat','err','loss'], current:'loss', grads:{loss:1,err:-6},
            math: ['\\begin{aligned}\\frac{\\partial\\,\\text{loss}}{\\partial\\,\\text{err}} &= \\underbrace{\\frac{\\partial\\,\\text{loss}}{\\partial\\,\\text{loss}}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial\\,\\text{loss}}{\\partial\\,\\text{err}}\\bigg|_{\\text{local}}}_{=\\,2\\,\\text{err}} \\\\ &= 1 \\cdot 2\\,\\text{err} \\\\ &= 1 \\cdot 2(-3) \\\\ &= -6 \\end{aligned}'] },
          { msg: 'Pop <code>err</code>. <code>ŷ.grad += 1×(−6) = −6</code>; <code>y.grad += (−1)×(−6) = +6</code> (we don\'t train <code>y</code>, but the gradient still exists).', visibleNodes:['w','x','b','y','z','yhat','err','loss'], visibleEdges:['w→z','x→z','z→ŷ','b→ŷ','ŷ→err','y→err','err→loss'], activeEdges:['ŷ→err','y→err'], topo:['w','x','b','y','z','yhat','err','loss'], current:'err', grads:{loss:1,err:-6,yhat:-6,y:6},
            math: [
              '\\begin{aligned}\\frac{\\partial\\,\\text{loss}}{\\partial \\hat{y}} &= \\underbrace{\\frac{\\partial\\,\\text{loss}}{\\partial\\,\\text{err}}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial\\,\\text{err}}{\\partial \\hat{y}}}_{=\\,1} \\\\ &= -6 \\cdot 1 = -6 \\end{aligned}',
              '\\begin{aligned}\\frac{\\partial\\,\\text{loss}}{\\partial y} &= \\underbrace{\\frac{\\partial\\,\\text{loss}}{\\partial\\,\\text{err}}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial\\,\\text{err}}{\\partial y}}_{=\\,-1} \\\\ &= -6 \\cdot (-1) = 6 \\end{aligned}'
            ] },
          { msg: 'Pop <code>ŷ</code>. <code>z.grad += 1×(−6) = −6</code>; <code>b.grad += 1×(−6) = −6</code>.', visibleNodes:['w','x','b','y','z','yhat','err','loss'], visibleEdges:['w→z','x→z','z→ŷ','b→ŷ','ŷ→err','y→err','err→loss'], activeEdges:['z→ŷ','b→ŷ'], topo:['w','x','b','y','z','yhat','err','loss'], current:'yhat', grads:{loss:1,err:-6,yhat:-6,y:6,z:-6,b:-6},
            math: [
              '\\begin{aligned}\\frac{\\partial\\,\\text{loss}}{\\partial z} &= \\underbrace{\\frac{\\partial\\,\\text{loss}}{\\partial \\hat{y}}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial \\hat{y}}{\\partial z}}_{=\\,1} \\\\ &= -6 \\cdot 1 = -6 \\end{aligned}',
              '\\begin{aligned}\\frac{\\partial\\,\\text{loss}}{\\partial b} &= \\underbrace{\\frac{\\partial\\,\\text{loss}}{\\partial \\hat{y}}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial \\hat{y}}{\\partial b}}_{=\\,1} \\\\ &= -6 \\cdot 1 = -6 \\end{aligned}'
            ] },
          { msg: 'Pop <code>z</code>. <code>w.grad += x × (−6) = 3 × (−6) = −18</code>; <code>x.grad += w × (−6) = −12</code>. <strong>Bigger input <code>x</code> means bigger leverage on <code>w</code>\'s gradient.</strong>', visibleNodes:['w','x','b','y','z','yhat','err','loss'], visibleEdges:['w→z','x→z','z→ŷ','b→ŷ','ŷ→err','y→err','err→loss'], activeEdges:['w→z','x→z'], topo:['w','x','b','y','z','yhat','err','loss'], current:'z', grads:{loss:1,err:-6,yhat:-6,y:6,z:-6,b:-6,w:-18,x:-12},
            math: [
              '\\begin{aligned}\\frac{\\partial\\,\\text{loss}}{\\partial w} &= \\underbrace{\\frac{\\partial\\,\\text{loss}}{\\partial z}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial z}{\\partial w}}_{=\\,x} \\\\ &= -6 \\cdot x \\\\ &= -6 \\cdot 3 \\\\ &= -18 \\end{aligned}',
              '\\begin{aligned}\\frac{\\partial\\,\\text{loss}}{\\partial x} &= \\underbrace{\\frac{\\partial\\,\\text{loss}}{\\partial z}}_{\\text{upstream}} \\cdot \\underbrace{\\frac{\\partial z}{\\partial x}}_{=\\,w} \\\\ &= -6 \\cdot w \\\\ &= -6 \\cdot 2 \\\\ &= -12 \\end{aligned}'
            ] },
          { msg: 'Done. ✓<br><strong>Parameter gradients: <code>∂loss/∂w = −18</code>, <code>∂loss/∂b = −6</code>.</strong><br>A small step <em>against</em> the gradient (i.e., <code>w ← w + 0.01·18</code>) will reduce the loss. That\'s gradient descent in one line.', visibleNodes:['w','x','b','y','z','yhat','err','loss'], visibleEdges:['w→z','x→z','z→ŷ','b→ŷ','ŷ→err','y→err','err→loss'], topo:['w','x','b','y','z','yhat','err','loss'], grads:{loss:1,err:-6,yhat:-6,y:6,z:-6,b:-6,w:-18,x:-12}, done:true,
            math: ['\\boxed{\\;\\frac{\\partial\\,\\text{loss}}{\\partial w} = -18, \\quad \\frac{\\partial\\,\\text{loss}}{\\partial b} = -6\\;}'] },
        ],
      },
    };

    function el(name, attrs, parent) {
      const e = document.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
      if (parent) parent.appendChild(e);
      return e;
    }

    let currentCase = 'add';
    let stepIdx = 0;
    let autoplayTimer = null;
    let nodeEls = {}, edgeEls = {};

    function buildSvg() {
      bpSvg.innerHTML = '';
      const C = CASES[currentCase];
      bpSvg.setAttribute('viewBox', C.viewBox);

      const defs = el('defs', {}, bpSvg);
      const marker = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--edge)' }, marker);
      const markerActive = el('marker', { id: 'arrow-active', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--accent)' }, markerActive);

      const edgeG = el('g', { class: 'edges' }, bpSvg);
      edgeEls = {};
      C.edges.forEach((e) => {
        const from = C.nodes[e.from], to = C.nodes[e.to];
        const r = 28;
        const dx = to.x - from.x, dy = to.y - from.y;
        const dist = Math.hypot(dx, dy);
        const ux = dx / dist, uy = dy / dist;
        const x1 = from.x + ux * r, y1 = from.y + uy * r;
        const x2 = to.x - ux * (r + 4), y2 = to.y - uy * (r + 4);
        const path = el('line', { x1, y1, x2, y2, class: 'edge', 'marker-end': 'url(#arrow)' }, edgeG);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 6;
        const lbl = el('text', { x: mx, y: my, 'text-anchor': 'middle', 'font-family': 'var(--mono)', 'font-size': 11, fill: 'var(--ink-mute)' }, edgeG);
        lbl.textContent = `∂=${e.localGrad}`;
        edgeEls[e.key] = { line: path, label: lbl };
      });

      const nodeG = el('g', { class: 'nodes' }, bpSvg);
      nodeEls = {};
      Object.entries(C.nodes).forEach(([id, n]) => {
        const g = el('g', { class: 'node', transform: `translate(${n.x},${n.y})` }, nodeG);
        el('circle', { r: 28 }, g);
        const lbl = el('text', { class: 'label', y: -34, 'text-anchor': 'middle' }, g);
        lbl.textContent = n.label;
        const data = el('text', { class: 'data', y: 2, 'text-anchor': 'middle', 'alignment-baseline': 'middle' }, g);
        data.textContent = n.data;
        const grad = el('text', { class: 'grad', y: 14, 'text-anchor': 'middle' }, g);
        grad.textContent = '';
        nodeEls[id] = { group: g, data, grad };
      });
    }

    function render() {
      const C = CASES[currentCase];
      const s = C.steps[stepIdx];
      Object.entries(nodeEls).forEach(([id, els]) => {
        const visible = s.visibleNodes.includes(id);
        els.group.style.opacity = visible ? 1 : 0.12;
        const isVisited = (s.visited || []).includes(id);
        const inTopo = (s.topo || []).includes(id);
        const isCurrent = s.current === id;
        els.group.classList.remove('visited', 'topo', 'current');
        if (isCurrent) els.group.classList.add('current');
        else if (inTopo) els.group.classList.add('topo');
        else if (isVisited) els.group.classList.add('visited');
        const g = (s.grads || {})[id];
        els.grad.textContent = g !== undefined ? `grad ${g}` : '';
      });
      Object.entries(edgeEls).forEach(([k, ee]) => {
        const visible = s.visibleEdges.includes(k);
        ee.line.style.opacity = visible ? 1 : 0;
        ee.label.style.opacity = visible ? 1 : 0;
        const active = (s.activeEdges || []).includes(k);
        ee.line.classList.toggle('active', active);
        if (active) ee.line.setAttribute('marker-end', 'url(#arrow-active)');
        else ee.line.setAttribute('marker-end', 'url(#arrow)');
      });
      document.getElementById('bp-status').innerHTML = s.msg;
      const topoEl = document.getElementById('bp-topo');
      topoEl.innerHTML = '<span class="topo-label">Topo list:</span>';
      if (!s.topo || s.topo.length === 0) {
        const empty = document.createElement('span');
        empty.style.cssText = 'color:var(--ink-mute);font-style:italic;';
        empty.textContent = '(empty)';
        topoEl.appendChild(empty);
      } else {
        s.topo.forEach((id, i) => {
          const chip = document.createElement('span');
          chip.className = 'topo-node' + (i === s.topo.length - 1 ? ' active' : '');
          chip.textContent = id;
          topoEl.appendChild(chip);
        });
      }
      document.getElementById('bp-step-num').textContent = stepIdx + 1;
      document.getElementById('bp-step-total').textContent = C.steps.length;
      document.getElementById('bp-next').disabled = stepIdx >= C.steps.length - 1;
      document.getElementById('bp-case-intro').innerHTML = C.intro;
      // Math panel
      const mathEl = document.getElementById('bp-math-content');
      if (s.math && s.math.length) {
        mathEl.innerHTML = s.math.map(line => '$$' + line + '$$').join('');
        if (window.renderMathInElement) {
          renderMathInElement(mathEl, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$',  right: '$',  display: false },
            ],
            throwOnError: false,
          });
        }
      } else {
        mathEl.innerHTML = '<span class="bp-math-empty">— (no math for this step)</span>';
      }
    }

    function switchCase(name) {
      if (!CASES[name]) return;
      currentCase = name;
      stepIdx = 0;
      if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; document.getElementById('bp-auto').textContent = '▶ Auto-play'; }
      // Tab UI
      document.querySelectorAll('#bp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.bp === name));
      buildSvg();
      render();
    }

    document.getElementById('bp-next').addEventListener('click', () => {
      const total = CASES[currentCase].steps.length;
      if (stepIdx < total - 1) stepIdx++;
      render();
    });
    document.getElementById('bp-reset').addEventListener('click', () => {
      stepIdx = 0;
      if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; document.getElementById('bp-auto').textContent = '▶ Auto-play'; }
      render();
    });
    document.getElementById('bp-auto').addEventListener('click', (e) => {
      const total = CASES[currentCase].steps.length;
      if (autoplayTimer) {
        clearInterval(autoplayTimer); autoplayTimer = null;
        e.target.textContent = '▶ Auto-play';
      } else {
        e.target.textContent = '⏸ Pause';
        autoplayTimer = setInterval(() => {
          if (stepIdx < CASES[currentCase].steps.length - 1) { stepIdx++; render(); }
          else { clearInterval(autoplayTimer); autoplayTimer = null; e.target.textContent = '▶ Auto-play'; }
        }, 1400);
      }
    });
    document.querySelectorAll('#bp-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => switchCase(btn.dataset.bp));
    });

    switchCase('add');
  }

  /* ---------------------------------------------------------------- */
  /*  Parameters breakdown                                            */
  /* ---------------------------------------------------------------- */
  const paramBars = document.getElementById('param-bars');
  if (paramBars) {
    // Default config: n_embd=16, n_head=4, n_layer=1, block_size=16, vocab_size=27
    const vocab = 27, n_embd = 16, block = 16, n_layer = 1;
    const PARAMS = [
      { name: 'wte',          shape: [vocab, n_embd], detail: 'Token embedding table. Row <em>i</em> is the vector for token <em>i</em>. Looked up in O(1) given a token id.' },
      { name: 'wpe',          shape: [block, n_embd], detail: 'Positional embedding table. Row <em>p</em> is the vector for position <em>p</em>. Added to the token embedding so the model knows <em>where</em> the token is.' },
      { name: 'attn_wq',      shape: [n_embd, n_embd], layer: true, detail: 'Query projection. Turns the current token vector into the query "what am I looking for?".' },
      { name: 'attn_wk',      shape: [n_embd, n_embd], layer: true, detail: 'Key projection. Turns each token into its key "what do I contain?".' },
      { name: 'attn_wv',      shape: [n_embd, n_embd], layer: true, detail: 'Value projection. Turns each token into the value "what do I offer if selected?".' },
      { name: 'attn_wo',      shape: [n_embd, n_embd], layer: true, detail: 'Output projection. Mixes the attention output back into the residual stream.' },
      { name: 'mlp_fc1',      shape: [4*n_embd, n_embd], layer: true, detail: 'MLP layer 1. Projects up to 4× the embedding dimension. This is where most "thinking per position" happens.' },
      { name: 'mlp_fc2',      shape: [n_embd, 4*n_embd], layer: true, detail: 'MLP layer 2. Projects back down to the embedding dimension.' },
      { name: 'lm_head',      shape: [vocab, n_embd], detail: 'Output head. Projects the final hidden state to one logit per token in the vocabulary.' },
    ];
    let total = 0;
    PARAMS.forEach((p) => { p.count = p.shape[0] * p.shape[1] * (p.layer ? n_layer : 1); total += p.count; });
    const max = Math.max(...PARAMS.map((p) => p.count));

    paramBars.innerHTML = '';
    PARAMS.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'param-bar';
      const pct = (p.count / max) * 100;
      const shapeStr = `${p.shape[0]} × ${p.shape[1]}` + (p.layer && n_layer > 1 ? ` × ${n_layer} layers` : '');
      row.innerHTML = `
        <div class="pname">${p.name}${p.layer ? ` <span style="color:var(--ink-mute)">(×layer)</span>` : ''}</div>
        <div class="pbar"><div class="pfill" style="width:${pct}%"></div></div>
        <div class="pcount">${p.count.toLocaleString()}</div>
        <div class="pdetail">shape: <code>${shapeStr}</code> · ${p.detail}</div>
      `;
      row.addEventListener('click', () => row.classList.toggle('expanded'));
      paramBars.appendChild(row);
    });
    document.getElementById('param-total-value').textContent = `${total.toLocaleString()} params`;
  }

  /* ---------------------------------------------------------------- */
  /*  Architecture forward-pass animation                             */
  /* ---------------------------------------------------------------- */
  const archStack = document.getElementById('arch-stack');
  if (archStack) {
    const BLOCKS = [
      { id: 'emb-tok', name: 'wte[token_id] — token embedding lookup', shape: '→ vector [16]', note: 'Pick row <em>token_id</em> of the token embedding table.' },
      { id: 'emb-pos', name: 'wpe[pos_id] — position embedding lookup', shape: '→ vector [16]', note: 'Pick row <em>pos_id</em> of the positional embedding table. Added to the token embedding.' },
      { id: 'rmsnorm-0', name: 'rmsnorm', shape: '[16] → [16]', note: 'Normalize so the vector has unit RMS. Stabilizes the activations entering the first layer.' },
      { id: 'attn-norm', name: '↳ rmsnorm (pre-attention)', shape: '[16] → [16]', note: 'Pre-norm: each block normalizes its input first. The residual <code>x_residual</code> is saved separately.' },
      { id: 'attn-qkv', name: '↳ Q, K, V = linear(x, wq/wk/wv)', shape: '[16] → 3× [16]', note: 'Three matrix-vector products. Each head will take a slice of length 4 (= head_dim).' },
      { id: 'attn-cache', name: '↳ append K, V to KV cache', shape: 'cache[layer].append(k, v)', note: 'Past keys and values stay live in the computation graph for backprop.' },
      { id: 'attn-score', name: '↳ attention scores: Q · Kᵀ / √d', shape: 't past tokens', note: 'For each past position, dot-product the head\'s query with that position\'s key. Scale by √d_head to keep variance bounded.' },
      { id: 'attn-softmax', name: '↳ softmax → attention weights', shape: '[t]', note: 'Probabilities over past tokens: where to look.' },
      { id: 'attn-out', name: '↳ weighted sum of V; concat heads; linear(attn_wo)', shape: '[16] → [16]', note: 'Combine the value vectors using the attention weights, glue all heads back together, mix with attn_wo. Then add the residual <code>x_residual</code>.' },
      { id: 'mlp-norm', name: '↳ rmsnorm (pre-MLP)', shape: '[16] → [16]', note: 'Save a new residual <code>x_residual</code>, then normalize.' },
      { id: 'mlp-fc', name: '↳ fc1 → ReLU → fc2', shape: '[16] → [64] → [64] → [16]', note: 'Two-layer MLP. Project up to 4× the embedding dim, apply ReLU, project back down. Then add the residual.' },
      { id: 'lm-head', name: 'lm_head — final projection', shape: '[16] → [27] (logits)', note: 'One logit per token in the vocabulary. Higher = more probable next token.' },
    ];

    function renderArch() {
      archStack.innerHTML = '';
      BLOCKS.forEach((b, i) => {
        const row = document.createElement('div');
        row.className = 'arch-block';
        row.dataset.idx = i;
        row.innerHTML = `<span class="arch-name">${b.name}</span><span class="arch-shape">${b.shape}</span>`;
        archStack.appendChild(row);
      });
      document.getElementById('arch-step-total').textContent = BLOCKS.length;
    }

    let archIdx = -1;
    let archTimer = null;

    function showArchStep(i) {
      archIdx = i;
      const rows = archStack.querySelectorAll('.arch-block');
      rows.forEach((r, idx) => r.classList.toggle('active', idx === i));
      document.getElementById('arch-step-num').textContent = i + 1;
      if (i >= 0) {
        document.getElementById('arch-status').innerHTML = BLOCKS[i].note;
      } else {
        document.getElementById('arch-status').innerHTML = 'Press <strong>Next step</strong> to start the forward pass.';
      }
    }

    renderArch();

    document.getElementById('arch-next').addEventListener('click', () => {
      if (archIdx < BLOCKS.length - 1) showArchStep(archIdx + 1);
    });
    document.getElementById('arch-reset').addEventListener('click', () => {
      if (archTimer) { clearInterval(archTimer); archTimer = null; document.getElementById('arch-auto').textContent = '▶ Auto-play'; }
      showArchStep(-1);
    });
    document.getElementById('arch-auto').addEventListener('click', (e) => {
      if (archTimer) {
        clearInterval(archTimer); archTimer = null; e.target.textContent = '▶ Auto-play';
      } else {
        e.target.textContent = '⏸ Pause';
        archTimer = setInterval(() => {
          if (archIdx < BLOCKS.length - 1) showArchStep(archIdx + 1);
          else { clearInterval(archTimer); archTimer = null; e.target.textContent = '▶ Auto-play'; }
        }, 1300);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Attention head viz                                              */
  /* ---------------------------------------------------------------- */
  const attnContent = document.getElementById('attn-content');
  if (attnContent) {
    // Sequence so far: BOS, e, m, m. Current token = m at position 3, predicting next char.
    const sequence = [
      { tok: 'BOS', label: 'BOS', value: '+pos-init' },
      { tok: 'e',   label: 'e',   value: 'vowel' },
      { tok: 'm',   label: 'm',   value: 'consonant' },
      { tok: 'm',   label: 'm',   value: 'consonant' },
    ];
    // Default "affinities" between current query and each past key (user can adjust)
    const defaultAffinity = [0.2, 1.8, 0.5, 0.4];

    attnContent.innerHTML = `
      <div style="margin-bottom:18px;font-family:var(--sans);font-size:13px;color:var(--ink-soft);">
        Generating the next token after "<strong>emm</strong>". The current token's query asks <em>"what vowels appeared recently?"</em>. Drag a slider to set how strongly the query matches each past token's key.
      </div>
      <div style="display:grid;grid-template-columns:80px 1fr 60px;gap:8px 12px;align-items:center;font-family:var(--mono);font-size:13px;" id="attn-rows"></div>
      <div style="margin-top:24px;padding:14px 16px;background:var(--bg-elev);border-radius:6px;border:1px solid var(--rule);">
        <div style="font-family:var(--sans);font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-mute);font-weight:600;margin-bottom:8px;">After softmax → attention weights</div>
        <div class="attn-weights" id="attn-weights-out"></div>
        <div style="margin-top:14px;font-family:var(--sans);font-size:13px;color:var(--ink-soft);">
          Output = Σ(weight<sub>t</sub> · value<sub>t</sub>) — a learned, weighted mixture of the past. <strong id="attn-mix">—</strong>
        </div>
      </div>
    `;

    const rows = document.getElementById('attn-rows');
    sequence.forEach((s, i) => {
      const tok = document.createElement('div');
      tok.className = 'attn-token' + (i === sequence.length - 1 ? '' : '');
      tok.textContent = s.label;
      rows.appendChild(tok);

      const sliderWrap = document.createElement('div');
      sliderWrap.style.cssText = 'display:flex; align-items:center; gap:10px; font-family:var(--sans);font-size:12px;';
      sliderWrap.innerHTML = `
        <span style="color:var(--ink-mute);width:64px;">q · k:</span>
        <input type="range" min="-2" max="3" step="0.1" value="${defaultAffinity[i]}" data-aff="${i}" style="flex:1;">
        <span style="font-family:var(--mono); width:36px; text-align:right;" id="aff-val-${i}">${defaultAffinity[i].toFixed(1)}</span>
      `;
      rows.appendChild(sliderWrap);

      const valLabel = document.createElement('div');
      valLabel.style.cssText = 'font-size:11px;color:var(--ink-mute);font-family:var(--sans);';
      valLabel.textContent = s.value;
      rows.appendChild(valLabel);
    });

    function recompute() {
      const aff = Array.from(document.querySelectorAll('[data-aff]')).map((el) => parseFloat(el.value));
      // softmax
      const m = Math.max(...aff);
      const exps = aff.map((x) => Math.exp(x - m));
      const sum = exps.reduce((a, b) => a + b, 0);
      const weights = exps.map((e) => e / sum);
      const out = document.getElementById('attn-weights-out');
      out.innerHTML = '';
      weights.forEach((w, i) => {
        const cell = document.createElement('div');
        cell.className = 'attn-weight-cell';
        cell.style.flex = `${Math.max(w, 0.02)}`;
        cell.textContent = w.toFixed(2);
        cell.style.opacity = Math.max(0.35, w);
        cell.title = sequence[i].label;
        out.appendChild(cell);
      });
      const top = weights.indexOf(Math.max(...weights));
      document.getElementById('attn-mix').innerHTML = `Most of the signal comes from <code style="color:var(--accent)">${sequence[top].label}</code> (${(weights[top]*100).toFixed(0)}% of the mixture).`;
    }
    document.querySelectorAll('[data-aff]').forEach((el) => {
      el.addEventListener('input', (e) => {
        document.getElementById(`aff-val-${e.target.dataset.aff}`).textContent = parseFloat(e.target.value).toFixed(1);
        recompute();
      });
    });
    recompute();
  }

  /* ---------------------------------------------------------------- */
  /*  Softmax + temperature                                           */
  /* ---------------------------------------------------------------- */
  const tempSlider = document.getElementById('temp-slider');
  if (tempSlider) {
    // 27 hand-picked "logits" that vaguely resemble what microgpt might output after
    // the prefix "ann" (favoring 'a', 'e', 'i', 'BOS' = end of name).
    // Indices: 0..25 are a..z, 26 is BOS.
    const labels = [...'abcdefghijklmnopqrstuvwxyz', 'BOS'];
    const logits = [
      2.8, -0.4, 0.1, 0.6, 2.3,  // a b c d e
      -0.2, 0.0, 0.4, 1.9, -0.6, // f g h i j
      0.5, 1.0, 0.4, 1.1, 0.8,   // k l m n o
      -0.4, -0.7, 0.2, 0.6, 0.9, // p q r s t
      0.4, -0.3, 0.1, -0.8, 0.7, -0.5, // u v w x y z
      2.6  // BOS
    ];

    function softmaxT(t) {
      const scaled = logits.map((l) => l / t);
      const m = Math.max(...scaled);
      const exps = scaled.map((x) => Math.exp(x - m));
      const sum = exps.reduce((a, b) => a + b, 0);
      return exps.map((e) => e / sum);
    }

    const barsEl = document.getElementById('softmax-bars');
    barsEl.innerHTML = '';
    labels.forEach((lab) => {
      const b = document.createElement('div');
      b.className = 'dist-bar';
      b.innerHTML = `<span class="dist-label">${lab}</span>`;
      barsEl.appendChild(b);
    });

    function render() {
      const t = parseFloat(tempSlider.value);
      document.getElementById('temp-value').textContent = t.toFixed(2);
      const probs = softmaxT(t);
      const maxP = Math.max(...probs);
      const peakIdx = probs.indexOf(maxP);
      const bars = barsEl.querySelectorAll('.dist-bar');
      bars.forEach((bar, i) => {
        const h = (probs[i] / maxP) * 100;
        bar.style.height = Math.max(2, h) + '%';
        bar.classList.toggle('peak', i === peakIdx);
        bar.title = `${labels[i]}: ${(probs[i] * 100).toFixed(1)}%`;
      });
      document.getElementById('softmax-peak').textContent = `"${labels[peakIdx]}" (${(maxP * 100).toFixed(1)}%)`;
      // Entropy in bits
      const H = -probs.reduce((a, p) => a + (p > 0 ? p * Math.log2(p) : 0), 0);
      document.getElementById('softmax-entropy').textContent = H.toFixed(2);
    }

    tempSlider.addEventListener('input', render);
    document.querySelectorAll('[data-temp]').forEach((b) => {
      b.addEventListener('click', () => {
        tempSlider.value = b.dataset.temp;
        render();
      });
    });
    render();
  }

  /* ---------------------------------------------------------------- */
  /*  Training loss curve                                             */
  /* ---------------------------------------------------------------- */
  const lossCanvas = document.getElementById('loss-canvas');
  if (lossCanvas) {
    const ctx = lossCanvas.getContext('2d');
    const numSteps = 1000;
    // Pre-generate a noisy curve that descends from ~3.3 toward ~2.37
    const seed = 1729;
    let rnd = seed;
    function lcg() { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; }
    const trueLoss = [];
    for (let i = 0; i < numSteps; i++) {
      const base = 2.37 + (3.30 - 2.37) * Math.exp(-i / 280);
      const noise = (lcg() - 0.5) * 0.55 * Math.exp(-i / 800);
      trueLoss.push(Math.max(2.0, base + noise));
    }

    let currentStep = 0;
    let animationFrame = null;
    let speed = 15;

    function resize() {
      const rect = lossCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      lossCanvas.width = rect.width * dpr;
      lossCanvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      const rect = lossCanvas.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      const padL = 44, padR = 12, padT = 12, padB = 24;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const minY = 2.0, maxY = 3.6;
      function xCoord(i) { return padL + (i / (numSteps - 1)) * plotW; }
      function yCoord(v) { return padT + (1 - (v - minY) / (maxY - minY)) * plotH; }

      ctx.clearRect(0, 0, W, H);

      // Axes labels
      ctx.fillStyle = '#8a857d';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      [2.0, 2.4, 2.8, 3.2, 3.6].forEach((v) => {
        const y = yCoord(v);
        ctx.fillText(v.toFixed(1), padL - 6, y + 4);
        ctx.strokeStyle = '#e6e1d6';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      });
      ctx.textAlign = 'center';
      [0, 250, 500, 750, 1000].forEach((s) => {
        const x = xCoord(s);
        ctx.fillText(s.toString(), x, H - 6);
      });

      // Reference lines
      ctx.strokeStyle = '#c89b1f';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      const yRand = yCoord(3.296);
      ctx.beginPath(); ctx.moveTo(padL, yRand); ctx.lineTo(W - padR, yRand); ctx.stroke();
      ctx.fillStyle = '#c89b1f';
      ctx.textAlign = 'left';
      ctx.fillText('random ≈ 3.30', padL + 6, yRand - 4);

      ctx.strokeStyle = '#2a6f5b';
      const yConv = yCoord(2.37);
      ctx.beginPath(); ctx.moveTo(padL, yConv); ctx.lineTo(W - padR, yConv); ctx.stroke();
      ctx.fillStyle = '#2a6f5b';
      ctx.fillText('converged ≈ 2.37', padL + 6, yConv - 4);
      ctx.setLineDash([]);

      // Curve up to currentStep
      if (currentStep > 1) {
        ctx.strokeStyle = '#b14a2e';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < currentStep; i++) {
          const x = xCoord(i), y = yCoord(trueLoss[i]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // Current dot
        ctx.fillStyle = '#b14a2e';
        ctx.beginPath();
        ctx.arc(xCoord(currentStep - 1), yCoord(trueLoss[currentStep - 1]), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function tick() {
      if (currentStep >= numSteps) {
        animationFrame = null;
        document.getElementById('loss-play').textContent = '▶ Train';
        return;
      }
      currentStep = Math.min(numSteps, currentStep + speed);
      document.getElementById('loss-step').textContent = currentStep;
      document.getElementById('loss-current').textContent = trueLoss[currentStep - 1].toFixed(4);
      const best = Math.min(...trueLoss.slice(0, currentStep));
      document.getElementById('loss-best').textContent = best.toFixed(4);
      draw();
      animationFrame = requestAnimationFrame(tick);
    }

    document.getElementById('loss-play').addEventListener('click', (e) => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame); animationFrame = null;
        e.target.textContent = '▶ Train';
      } else {
        if (currentStep >= numSteps) currentStep = 0;
        e.target.textContent = '⏸ Pause';
        tick();
      }
    });
    document.getElementById('loss-reset').addEventListener('click', () => {
      if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; document.getElementById('loss-play').textContent = '▶ Train'; }
      currentStep = 0;
      document.getElementById('loss-step').textContent = '0';
      document.getElementById('loss-current').textContent = '—';
      document.getElementById('loss-best').textContent = '—';
      draw();
    });
    document.getElementById('loss-speed').addEventListener('input', (e) => {
      speed = parseInt(e.target.value, 10);
    });

    draw();
  }

  /* ---------------------------------------------------------------- */
  /*  Interactive neuron widgets — replacing hand-drawn PDF images    */
  /* ---------------------------------------------------------------- */

  // small helper to format numbers with sign
  function fmt(n, digits) { return (n >= 0 ? ' ' : '−') + Math.abs(n).toFixed(digits === undefined ? 1 : digits); }
  function fmtPlain(n, digits) { return n.toFixed(digits === undefined ? 1 : digits); }
  function fmtSigned(n, digits) { return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(digits === undefined ? 1 : digits); }

  // generic slider-binding
  function bindSliders(rootId, callback) {
    const root = document.getElementById(rootId);
    if (!root) return null;
    const inputs = root.querySelectorAll('input[type="range"][data-ctrl]');
    function getValues() {
      const v = {};
      inputs.forEach((i) => { v[i.dataset.ctrl] = parseFloat(i.value); });
      return v;
    }
    function refresh() { callback(getValues()); }
    inputs.forEach((i) => i.addEventListener('input', refresh));
    refresh();
    return { root, refresh, getValues, inputs };
  }

  /* === Widget 1: bare neuron a = x + b === */
  if (document.getElementById('iv-neuron-1')) {
    bindSliders('iv-neuron-1', ({ x, b }) => {
      const a = x + b;
      document.getElementById('iv1-xc').textContent = fmtPlain(x);
      document.getElementById('iv1-bc').textContent = fmtPlain(b);
      document.getElementById('iv1-x-val').textContent = fmtPlain(x);
      document.getElementById('iv1-b-val').textContent = fmtPlain(b);
      document.getElementById('iv1-out').textContent = fmtPlain(a);
      document.getElementById('iv1-a-out').textContent = '= ' + fmtPlain(a);
      document.getElementById('iv1-readout').textContent =
        `a = ${fmtPlain(x)} + (${fmtPlain(b)}) = ${fmtPlain(a)}`;
    });
  }

  /* === Widget 2: weighted neuron a = x*w + b === */
  if (document.getElementById('iv-neuron-2')) {
    bindSliders('iv-neuron-2', ({ x, w, b }) => {
      const z = x * w;
      const a = z + b;
      document.getElementById('iv2-xc').textContent = fmtPlain(x);
      document.getElementById('iv2-wc').textContent = fmtPlain(w);
      document.getElementById('iv2-bc').textContent = fmtPlain(b);
      document.getElementById('iv2-x-val').textContent = fmtPlain(x);
      document.getElementById('iv2-w-val').textContent = fmtPlain(w);
      document.getElementById('iv2-b-val').textContent = fmtPlain(b);
      document.getElementById('iv2-z').textContent = 'z = ' + fmtPlain(z);
      document.getElementById('iv2-out').textContent = 'a = ' + fmtPlain(a);
      document.getElementById('iv2-readout').textContent =
        `z = ${fmtPlain(x)} × ${fmtPlain(w)} = ${fmtPlain(z)};  a = z + (${fmtPlain(b)}) = ${fmtPlain(a)}`;
      // color the edge by weight sign
      const edge = document.getElementById('iv2-edge');
      edge.classList.toggle('edge-w-pos', w > 0);
      edge.classList.toggle('edge-w-neg', w < 0);
      edge.style.strokeWidth = (1.4 + Math.min(2.5, Math.abs(w))).toFixed(1);
    });
  }

  /* === Widget 3: ReLU neuron === */
  if (document.getElementById('iv-neuron-3')) {
    bindSliders('iv-neuron-3', ({ x, w, b }) => {
      const z = x * w + b;
      const a = Math.max(0, z);
      document.getElementById('iv3-xc').textContent = fmtPlain(x);
      document.getElementById('iv3-wc').textContent = fmtPlain(w);
      document.getElementById('iv3-bc').textContent = fmtPlain(b);
      document.getElementById('iv3-x-val').textContent = fmtPlain(x);
      document.getElementById('iv3-w-val').textContent = fmtPlain(w);
      document.getElementById('iv3-b-val').textContent = fmtPlain(b);
      document.getElementById('iv3-z').textContent = fmtPlain(z);
      document.getElementById('iv3-out').textContent = fmtPlain(a);
      // circle color
      const c = document.getElementById('iv3-circle');
      c.classList.toggle('active', z > 0);
      c.classList.toggle('dead', z <= 0);
      // ReLU plot: x-axis range z ∈ [-6, 6], plotted from x=10 to x=250 (width=240), zero at 130
      // y range f ∈ [0, 6], plotted from y=60 (bottom) up to y=12 (top, 48px tall) → scale 8 px per unit
      const px = 130 + Math.max(-6, Math.min(6, z)) * 20; // 20 px per unit on x
      const py = 60 - Math.max(0, Math.min(6, a)) * 8;
      document.getElementById('iv3-point').setAttribute('cx', px);
      document.getElementById('iv3-point').setAttribute('cy', py);
      const lbl = document.getElementById('iv3-point-label');
      lbl.setAttribute('x', px);
      lbl.setAttribute('y', py - 6);
      lbl.textContent = fmtPlain(a);
      const ro = document.getElementById('iv3-readout');
      if (z > 0) ro.innerHTML = `<strong>Active.</strong> z = ${fmtPlain(z)} &gt; 0, so a = z = ${fmtPlain(a)}`;
      else ro.innerHTML = `<strong>Dead.</strong> z = ${fmtPlain(z)} ≤ 0, so a = max(0, z) = 0`;
    });
  }

  /* === Widget 4: multi-input neuron — built dynamically === */
  if (document.getElementById('iv-neuron-4')) {
    const W4 = document.getElementById('iv-neuron-4');
    const NSVG = 'http://www.w3.org/2000/svg';
    const nIn = 4;
    // initial values
    const state4 = { x: [1.0, -0.5, 0.8, 0.3], w: [0.6, -1.2, 0.9, 0.4], b: -0.5 };
    // Build edges + labels in SVG
    const edgeG = document.getElementById('iv4-edges');
    const yInputs = [55, 100, 165, 215];
    const circleCx = 240, circleCy = 140;
    for (let i = 0; i < nIn; i++) {
      const y = yInputs[i];
      const x1 = 20, x2 = 190;
      const line = document.createElementNS(NSVG, 'line');
      line.setAttribute('class', 'edge');
      line.setAttribute('x1', x1); line.setAttribute('y1', y);
      line.setAttribute('x2', x2); line.setAttribute('y2', circleCy);
      line.setAttribute('marker-end', 'url(#iv-arrow-4)');
      line.id = 'iv4-edge-' + i;
      edgeG.appendChild(line);
      // x label
      const xL = document.createElementNS(NSVG, 'text');
      xL.setAttribute('class', 'var'); xL.setAttribute('x', x1); xL.setAttribute('y', y - 8);
      xL.textContent = `x${i+1}`;
      edgeG.appendChild(xL);
      const xV = document.createElementNS(NSVG, 'text');
      xV.setAttribute('class', 'val'); xV.setAttribute('x', x1 + 10); xV.setAttribute('y', y + 16);
      xV.id = 'iv4-xv-' + i;
      edgeG.appendChild(xV);
      // w label (mid-edge)
      const mx = (x1 + x2) / 2, my = (y + circleCy) / 2;
      const wL = document.createElementNS(NSVG, 'text');
      wL.setAttribute('class', 'val'); wL.setAttribute('x', mx); wL.setAttribute('y', my - 4);
      wL.setAttribute('text-anchor', 'middle');
      wL.id = 'iv4-wv-' + i;
      edgeG.appendChild(wL);
    }
    // Controls
    const controls = document.getElementById('iv4-controls');
    let html = '';
    for (let i = 0; i < nIn; i++) {
      html += `<label><span class="ctrl-name">x${i+1}</span><input type="range" min="-3" max="3" step="0.1" value="${state4.x[i]}" data-kind="x" data-i="${i}"><span class="ctrl-val" id="iv4-xc-${i}">${fmtPlain(state4.x[i])}</span></label>`;
      html += `<label><span class="ctrl-name">w${i+1}</span><input type="range" min="-2" max="2" step="0.1" value="${state4.w[i]}" data-kind="w" data-i="${i}"><span class="ctrl-val" id="iv4-wc-${i}">${fmtPlain(state4.w[i])}</span></label>`;
    }
    html += `<label><span class="ctrl-name">b</span><input type="range" min="-3" max="3" step="0.1" value="${state4.b}" data-kind="b"><span class="ctrl-val" id="iv4-bc">${fmtPlain(state4.b)}</span></label>`;
    controls.innerHTML = html;

    function recompute4() {
      let z = 0;
      for (let i = 0; i < nIn; i++) z += state4.x[i] * state4.w[i];
      z += state4.b;
      const a = Math.max(0, z);
      // update labels
      for (let i = 0; i < nIn; i++) {
        document.getElementById(`iv4-xc-${i}`).textContent = fmtPlain(state4.x[i]);
        document.getElementById(`iv4-wc-${i}`).textContent = fmtPlain(state4.w[i]);
        document.getElementById(`iv4-xv-${i}`).textContent = fmtPlain(state4.x[i]);
        document.getElementById(`iv4-wv-${i}`).textContent = 'w=' + fmtPlain(state4.w[i]);
        // color edge by weight
        const e = document.getElementById('iv4-edge-' + i);
        e.classList.toggle('edge-w-pos', state4.w[i] > 0);
        e.classList.toggle('edge-w-neg', state4.w[i] < 0);
        e.style.strokeWidth = (1 + Math.min(2.5, Math.abs(state4.w[i]) * 1.5)).toFixed(1);
        e.style.opacity = (0.45 + Math.min(0.5, Math.abs(state4.w[i]) * 0.3)).toFixed(2);
      }
      document.getElementById('iv4-bc').textContent = fmtPlain(state4.b);
      document.getElementById('iv4-b-val').textContent = fmtPlain(state4.b);
      document.getElementById('iv4-z').textContent = 'z = ' + fmtPlain(z);
      document.getElementById('iv4-out').textContent = 'a = ' + fmtPlain(a);
      document.getElementById('iv4-circle').classList.toggle('active', z > 0);
      document.getElementById('iv4-circle').classList.toggle('dead', z <= 0);
      // Readout
      const parts = [];
      for (let i = 0; i < nIn; i++) parts.push(`${fmtPlain(state4.x[i])}×${fmtPlain(state4.w[i])}`);
      document.getElementById('iv4-readout').innerHTML =
        `z = ${parts.join(' + ')} + (${fmtPlain(state4.b)}) = <strong>${fmtPlain(z)}</strong>;  a = ReLU(z) = <strong>${fmtPlain(a)}</strong>`;
    }
    controls.querySelectorAll('input[type="range"]').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const kind = e.target.dataset.kind, idx = e.target.dataset.i;
        if (kind === 'b') state4.b = parseFloat(e.target.value);
        else state4[kind][parseInt(idx, 10)] = parseFloat(e.target.value);
        recompute4();
      });
    });
    recompute4();
  }

  /* === Widget 5: Mini MLP (3 → 4 → 2) === */
  function buildMlpWidget(rootId, controlsId, randBtnId, readoutId, conf) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const nIn = conf.nIn, nH = conf.nH, nOut = conf.nOut;
    const positions = {
      in: Array.from({length: nIn}, (_, i) => ({ x: 60, y: 50 + i * (200 / Math.max(1, nIn - 1)) })),
      h: Array.from({length: nH}, (_, i) => ({ x: 270, y: 40 + i * (220 / Math.max(1, nH - 1)) })),
      out: Array.from({length: nOut}, (_, i) => ({ x: 480, y: 80 + i * (120 / Math.max(1, nOut - 1)) })),
    };
    // state
    let xs = Array(nIn).fill(0).map((_, i) => [0.5, -0.3, 0.8][i] || 0);
    function randn() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.2; }
    let W1 = Array.from({length: nH}, () => Array.from({length: nIn}, randn));
    let b1 = Array.from({length: nH}, () => randn() * 0.3);
    let W2 = Array.from({length: nOut}, () => Array.from({length: nH}, randn));
    let b2 = Array.from({length: nOut}, () => randn() * 0.3);

    function compute() {
      const h = Array(nH).fill(0).map((_, j) => {
        let z = b1[j]; for (let i = 0; i < nIn; i++) z += xs[i] * W1[j][i];
        return Math.max(0, z);
      });
      const o = Array(nOut).fill(0).map((_, k) => {
        let z = b2[k]; for (let j = 0; j < nH; j++) z += h[j] * W2[k][j];
        return z;
      });
      return { h, o };
    }

    const NS = 'http://www.w3.org/2000/svg';
    function el(name, attrs, parent) {
      const e = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
      if (parent) parent.appendChild(e);
      return e;
    }
    // Clear all SVG content while preserving the <defs> element
    const svg = root.querySelector('svg');
    const defs = svg.querySelector('defs');
    svg.innerHTML = '';
    if (defs) svg.appendChild(defs);
    // Build edges (input → hidden, hidden → output)
    const edgeEls = { ih: [], ho: [] };
    for (let j = 0; j < nH; j++) {
      for (let i = 0; i < nIn; i++) {
        const p1 = positions.in[i], p2 = positions.h[j];
        edgeEls.ih.push(el('line', { x1: p1.x + 12, y1: p1.y, x2: p2.x - 16, y2: p2.y, class: 'edge' }, svg));
      }
    }
    for (let k = 0; k < nOut; k++) {
      for (let j = 0; j < nH; j++) {
        const p1 = positions.h[j], p2 = positions.out[k];
        edgeEls.ho.push(el('line', { x1: p1.x + 16, y1: p1.y, x2: p2.x - 14, y2: p2.y, class: 'edge' }, svg));
      }
    }
    // Build nodes
    const nodeEls = { in: [], h: [], out: [] };
    positions.in.forEach((p, i) => {
      const c = el('circle', { cx: p.x, cy: p.y, r: 14, class: 'node-circle' }, svg);
      const t = el('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'var(--mono)' }, svg);
      t.textContent = fmtPlain(xs[i]);
      nodeEls.in.push({ c, t });
    });
    positions.h.forEach((p, j) => {
      const c = el('circle', { cx: p.x, cy: p.y, r: 18, class: 'node-circle' }, svg);
      const t = el('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'var(--mono)' }, svg);
      nodeEls.h.push({ c, t });
    });
    positions.out.forEach((p, k) => {
      const c = el('circle', { cx: p.x, cy: p.y, r: 18, class: 'node-circle' }, svg);
      const t = el('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'var(--mono)' }, svg);
      nodeEls.out.push({ c, t });
    });
    // Header labels back on top
    const lbl1 = el('text', { x: 60, y: 18, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-mute)' }, svg);
    lbl1.textContent = 'inputs';
    const lbl2 = el('text', { x: 270, y: 18, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-mute)' }, svg);
    lbl2.textContent = 'hidden (ReLU)';
    const lbl3 = el('text', { x: 480, y: 18, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-mute)' }, svg);
    lbl3.textContent = 'outputs';

    function render() {
      const { h, o } = compute();
      // edges: color/opacity by weight magnitude
      let ei = 0;
      for (let j = 0; j < nH; j++) for (let i = 0; i < nIn; i++) {
        const e = edgeEls.ih[ei++];
        const w = W1[j][i];
        e.classList.toggle('edge-w-pos', w > 0);
        e.classList.toggle('edge-w-neg', w < 0);
        e.style.strokeWidth = (0.6 + Math.min(2.5, Math.abs(w))).toFixed(2);
        e.style.opacity = (0.3 + Math.min(0.5, Math.abs(w) * 0.35)).toFixed(2);
      }
      ei = 0;
      for (let k = 0; k < nOut; k++) for (let j = 0; j < nH; j++) {
        const e = edgeEls.ho[ei++];
        const w = W2[k][j];
        e.classList.toggle('edge-w-pos', w > 0);
        e.classList.toggle('edge-w-neg', w < 0);
        e.style.strokeWidth = (0.6 + Math.min(2.5, Math.abs(w))).toFixed(2);
        e.style.opacity = (0.3 + Math.min(0.5, Math.abs(w) * 0.35)).toFixed(2);
      }
      // nodes: input values
      nodeEls.in.forEach((n, i) => { n.t.textContent = fmtPlain(xs[i]); });
      // hidden activations (color by magnitude, label)
      nodeEls.h.forEach((n, j) => {
        n.t.textContent = fmtPlain(h[j]);
        const active = h[j] > 0.01;
        n.c.classList.toggle('active', active);
        n.c.classList.toggle('dead', !active);
      });
      // outputs
      nodeEls.out.forEach((n, k) => {
        n.t.textContent = fmtPlain(o[k]);
      });
      if (readoutId) {
        document.getElementById(readoutId).innerHTML =
          `inputs = [${xs.map(v => fmtPlain(v)).join(', ')}]  →  outputs = [<strong>${o.map(v => fmtPlain(v)).join(', ')}</strong>]`;
      }
    }

    // Controls
    const controls = document.getElementById(controlsId);
    controls.innerHTML = '';
    for (let i = 0; i < nIn; i++) {
      const label = document.createElement('label');
      label.innerHTML = `<span class="ctrl-name">x${i+1}</span><input type="range" min="-2" max="2" step="0.1" value="${xs[i]}"><span class="ctrl-val">${fmtPlain(xs[i])}</span>`;
      const input = label.querySelector('input');
      const val = label.querySelector('.ctrl-val');
      input.addEventListener('input', () => {
        xs[i] = parseFloat(input.value);
        val.textContent = fmtPlain(xs[i]);
        render();
      });
      controls.appendChild(label);
    }
    // Randomize button
    if (randBtnId) {
      document.getElementById(randBtnId).addEventListener('click', () => {
        W1 = Array.from({length: nH}, () => Array.from({length: nIn}, randn));
        b1 = Array.from({length: nH}, () => randn() * 0.3);
        W2 = Array.from({length: nOut}, () => Array.from({length: nH}, randn));
        b2 = Array.from({length: nOut}, () => randn() * 0.3);
        render();
      });
    }
    render();
  }

  if (document.getElementById('iv-neuron-5')) {
    buildMlpWidget('iv-neuron-5', 'iv5-controls', 'iv5-rand', 'iv5-readout', { nIn: 3, nH: 4, nOut: 2 });
  }
  if (document.getElementById('iv-mlp-preview')) {
    buildMlpWidget('iv-mlp-preview', 'mlp-preview-controls', 'mlp-preview-rand', null, { nIn: 3, nH: 4, nOut: 2 });
  }

  /* === Value-class explorer (replaces autograd hand-drawn images) === */
  const vexSvg = document.getElementById('vexplorer-svg');
  if (vexSvg) {
    const NS2 = 'http://www.w3.org/2000/svg';
    let stage = 1;
    function el2(name, attrs, parent, text) {
      const e = document.createElementNS(NS2, name);
      for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    }
    function drawValueBox(parent, x, y, label, data, idHex, opts) {
      const g = el2('g', { transform: `translate(${x},${y})`, class: 'value-box-group' }, parent);
      const rect = el2('rect', { x: 0, y: 0, width: 130, height: 60, rx: 6, class: 'value-box' + (opts && opts.highlight ? ' highlight' : '') }, g);
      el2('text', { x: 65, y: -8, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--ink-mute)' }, g, label);
      el2('text', { x: 12, y: 24, 'font-family': 'var(--mono)', 'font-size': 12 }, g, `data = ${data}`);
      if (opts && opts.children) {
        el2('text', { x: 12, y: 44, 'font-family': 'var(--mono)', 'font-size': 11, fill: 'var(--ink-mute)' }, g, `_children = (${opts.children})`);
      }
      if (idHex) {
        el2('text', { x: 65, y: 76, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--ink-mute)', 'font-family': 'var(--mono)' }, g, `id ${idHex}`);
      }
      return g;
    }
    function render() {
      const g = document.getElementById('vexplorer-g');
      g.innerHTML = '';
      const a = parseFloat(document.getElementById('vex-a').value) || 0;
      const b = parseFloat(document.getElementById('vex-b').value) || 0;
      const ro = document.getElementById('vex-readout');

      if (stage === 1) {
        // Two independent boxes
        drawValueBox(g, 90, 100, 'a = Value(' + a + ')', a, '0x47A');
        drawValueBox(g, 410, 100, 'b = Value(' + b + ')', b, '0x47B');
        ro.innerHTML = `Stage 1: Two independent Value objects. Each just wraps a number. <code>a.data = ${a}</code>, <code>b.data = ${b}</code>.`;
      } else if (stage === 2) {
        // a + b → c
        drawValueBox(g, 50, 100, 'a', a, '0x47A');
        drawValueBox(g, 50, 200, 'b', b, '0x47B');
        const op = el2('g', { transform: 'translate(310, 130)' }, g);
        el2('circle', { cx: 0, cy: 0, r: 22, class: 'op-node' }, op);
        el2('text', { x: 0, y: 6, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 }, op, '+');
        // arrows
        el2('line', { x1: 180, y1: 130, x2: 288, y2: 132, class: 'edge', 'marker-end': 'url(#vex-arrow)' }, g);
        el2('line', { x1: 180, y1: 230, x2: 288, y2: 138, class: 'edge', 'marker-end': 'url(#vex-arrow)' }, g);
        // output box
        drawValueBox(g, 470, 100, 'c = a + b', a + b, '0x47C', { highlight: true });
        el2('line', { x1: 332, y1: 130, x2: 458, y2: 130, class: 'edge', 'marker-end': 'url(#vex-arrow)' }, g);
        ro.innerHTML = `Stage 2: <code>c = a + b</code> returns a new Value with <code>data = ${a + b}</code>. <strong>But c doesn't yet remember it came from a and b</strong> — there's no link back. Backprop can't walk this graph yet.`;
      } else {
        // Stage 3: same but with children pointers
        drawValueBox(g, 50, 100, 'a', a, '0x47A');
        drawValueBox(g, 50, 200, 'b', b, '0x47B');
        const op = el2('g', { transform: 'translate(310, 130)' }, g);
        el2('circle', { cx: 0, cy: 0, r: 22, class: 'op-node' }, op);
        el2('text', { x: 0, y: 6, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700 }, op, '+');
        el2('line', { x1: 180, y1: 130, x2: 288, y2: 132, class: 'edge', 'marker-end': 'url(#vex-arrow)' }, g);
        el2('line', { x1: 180, y1: 230, x2: 288, y2: 138, class: 'edge', 'marker-end': 'url(#vex-arrow)' }, g);
        drawValueBox(g, 470, 100, 'c = a + b', a + b, '0x47C', { highlight: true, children: 'a, b' });
        el2('line', { x1: 332, y1: 130, x2: 458, y2: 130, class: 'edge', 'marker-end': 'url(#vex-arrow)' }, g);
        // children pointer arrows (dashed) from c back to a and b
        el2('path', { d: 'M 470 175 Q 320 250 180 175', class: 'child-edge', 'marker-end': 'url(#vex-arrow)' }, g);
        el2('path', { d: 'M 470 185 Q 320 290 180 230', class: 'child-edge', 'marker-end': 'url(#vex-arrow)' }, g);
        el2('text', { x: 320, y: 268, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--ink-mute)', 'font-family': 'var(--mono)' }, g, '_children pointers (dashed)');
        ro.innerHTML = `Stage 3: <code>c._children = (a, b)</code>. The dashed arrows are the new pointers. Now backprop can walk from <code>c</code> back to its inputs. This is the version microgpt actually uses.`;
      }
    }
    document.querySelectorAll('#viz-value-explorer .tab-buttons button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#viz-value-explorer .tab-buttons button').forEach((b) => b.classList.toggle('active', b === btn));
        stage = parseInt(btn.dataset.vstage, 10);
        render();
      });
    });
    document.getElementById('vex-a').addEventListener('input', render);
    document.getElementById('vex-b').addEventListener('input', render);
    render();
  }

  /* === Backprop exercise widget === */
  const bxSvg = document.getElementById('iv-backprop-ex');
  if (bxSvg) {
    const NS3 = 'http://www.w3.org/2000/svg';
    let backwardDone = false;
    function el3(name, attrs, parent, text) {
      const e = document.createElementNS(NS3, name);
      for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    }
    function getVals() {
      return {
        x: parseFloat(document.getElementById('iv-backprop-ex').parentElement.querySelector('[data-ctrl="x"]').value),
        w: parseFloat(document.getElementById('iv-backprop-ex').parentElement.querySelector('[data-ctrl="w"]').value),
        b: parseFloat(document.getElementById('iv-backprop-ex').parentElement.querySelector('[data-ctrl="b"]').value),
      };
    }
    function render() {
      const g = document.getElementById('iv-bx-g');
      g.innerHTML = '';
      const { x, w, b } = getVals();
      const z = x * w + b;
      const a = Math.max(0, z);
      const reluOn = z > 0;
      // Nodes: x, w, * (=mul), b, + (=add), ReLU (=a)
      // Positions
      const N = (X, Y, label, data, grad) => {
        const node = el3('g', { transform: `translate(${X},${Y})` }, g);
        el3('circle', { cx: 0, cy: 0, r: 22, class: 'node-circle' + (data !== null ? '' : ' dead') }, node);
        el3('text', { x: 0, y: -28, 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'var(--mono)' }, node, label);
        if (data !== null) el3('text', { x: 0, y: 5, 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'var(--mono)', 'font-weight': 700 }, node, fmtPlain(data));
        if (grad !== null) el3('text', { x: 0, y: 36, 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'var(--mono)', fill: 'var(--accent)' }, node, 'grad ' + fmtPlain(grad, 2));
        return node;
      };
      // grads (only shown after backward)
      const dA = 1;
      const dZ = reluOn ? dA : 0;
      const dMul = dZ; // through +
      const dB = dZ;
      const dX = w * dMul;
      const dW = x * dMul;

      const showG = backwardDone ? null : 'hide';
      function gradOrNull(v) { return backwardDone ? v : null; }
      const arrow = (x1, y1, x2, y2, label, active) => {
        const ln = el3('line', { x1, y1, x2, y2, class: 'edge' + (active ? ' active' : ''), 'marker-end': 'url(#iv-arrow-bx)', stroke: active ? 'var(--accent)' : 'var(--ink)', 'stroke-width': active ? 2.5 : 1.6 }, g);
        if (label) {
          el3('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 8, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--ink-mute)', 'font-family': 'var(--mono)' }, g, label);
        }
        return ln;
      };
      // x at (60, 60), w at (60, 140), mul at (200, 100), b at (60, 210), add at (340, 140), relu at (480, 140)
      // (b sits 70px below w so the two circles + their value/label text don't collide)
      N(60, 60, 'x', x, gradOrNull(dX));
      N(60, 140, 'w', w, gradOrNull(dW));
      N(60, 210, 'b', b, gradOrNull(dB));
      N(200, 100, '×', x * w, gradOrNull(dMul));
      N(340, 140, '+', z, gradOrNull(dZ));
      N(480, 140, 'a = ReLU', a, 1);
      // edges
      arrow(82, 60, 178, 96, '', false);
      arrow(82, 140, 178, 108, '', false);
      arrow(222, 100, 318, 132, '', false);
      arrow(82, 210, 318, 148, '', false);
      arrow(362, 140, 458, 140, '', false);
      // local grad labels on edges (visible after backward)
      if (backwardDone) {
        // label local grad ∂mul/∂x = w, ∂mul/∂w = x
        el3('text', { x: 130, y: 50, 'font-size': 10, fill: 'var(--accent)', 'font-family': 'var(--mono)' }, g, `∂/∂x = w = ${fmtPlain(w)}`);
        el3('text', { x: 130, y: 160, 'font-size': 10, fill: 'var(--accent)', 'font-family': 'var(--mono)' }, g, `∂/∂w = x = ${fmtPlain(x)}`);
        el3('text', { x: 400, y: 132, 'font-size': 10, fill: 'var(--accent)', 'font-family': 'var(--mono)' }, g, reluOn ? '∂a/∂z = 1' : '∂a/∂z = 0');
      }
    }
    document.querySelectorAll('#iv-backprop-ex').forEach((el) => el);
    function updateLabels() {
      const { x, w, b } = getVals();
      document.getElementById('bx-xc').textContent = fmtPlain(x);
      document.getElementById('bx-wc').textContent = fmtPlain(w);
      document.getElementById('bx-bc').textContent = fmtPlain(b);
    }
    const widget = document.getElementById('iv-backprop-ex').parentElement;
    widget.querySelectorAll('input[type="range"]').forEach((i) => {
      i.addEventListener('input', () => { backwardDone = false; updateLabels(); render(); resetReadout(); });
    });
    function resetReadout() {
      document.getElementById('bx-readout').innerHTML = 'Forward pass shown. Press <strong>Run backward</strong> to propagate gradients (assuming <code>∂L/∂a = 1</code>).';
    }
    document.getElementById('bx-forward').addEventListener('click', () => {
      backwardDone = false;
      resetReadout();
      render();
    });
    document.getElementById('bx-backward').addEventListener('click', () => {
      backwardDone = true;
      render();
      const { x, w, b } = getVals();
      const z = x * w + b;
      const reluOn = z > 0;
      const dZ = reluOn ? 1 : 0;
      const dX = w * dZ, dW = x * dZ, dB = dZ;
      document.getElementById('bx-readout').innerHTML =
        reluOn
        ? `ReLU is <strong>active</strong> (z = ${fmtPlain(z)} &gt; 0), so the gradient flows back through with ∂a/∂z = 1.<br>
           <code>∂L/∂x = w · 1 = ${fmtPlain(dX, 2)}</code> ·
           <code>∂L/∂w = x · 1 = ${fmtPlain(dW, 2)}</code> ·
           <code>∂L/∂b = 1 = ${fmtPlain(dB, 2)}</code>`
        : `ReLU is <strong>dead</strong> (z = ${fmtPlain(z)} ≤ 0), so ∂a/∂z = 0 and <em>all upstream gradients become zero</em>. The neuron contributes nothing to the loss reduction at this input.`;
    });
    document.getElementById('bx-reset').addEventListener('click', () => {
      widget.querySelectorAll('input[type="range"]').forEach((i, idx) => {
        i.value = [2, 1.5, -1][idx];
      });
      backwardDone = false;
      updateLabels();
      resetReadout();
      render();
    });
    updateLabels();
    render();
  }

  /* ---------------------------------------------------------------- */
  /*  Transformer architecture diagram — click-to-explain             */
  /* ---------------------------------------------------------------- */
  const archSvg = document.getElementById('arch-svg');
  if (archSvg) {
    const INFO = {
      wte: {
        title: 'Input Embedding · <code>wte</code>',
        body: `<p>Look up the row of the token-embedding table corresponding to the input token id. Turns an integer (e.g. <code>5</code>) into a length-16 vector.</p>
<pre><code class="language-python">tok_emb = state_dict['wte'][token_id]   # length 16</code></pre>
<p><strong>state_dict:</strong> <code>wte</code> with shape (vocab_size, n_embd) = (27, 16). 432 parameters.</p>`,
      },
      wpe: {
        title: 'Positional Encoding · <code>wpe</code>',
        body: `<p>microgpt uses <em>learned absolute</em> positional embeddings — another table, one row per position. The vector at row <code>pos_id</code> tells the model "you are at this position in the sequence".</p>
<pre><code class="language-python">pos_emb = state_dict['wpe'][pos_id]     # length 16</code></pre>
<p><strong>state_dict:</strong> <code>wpe</code> with shape (block_size, n_embd) = (16, 16). 256 parameters.</p>
<p>Modern LLMs replace this with <strong>RoPE</strong> (Rotary Position Embeddings), which encode position via rotation in the attention dot product. No learned table required.</p>`,
      },
      emb_add: {
        title: '+ · token + position',
        body: `<p>Add the token embedding and positional embedding element-wise. The model now has a single vector that encodes both <em>what</em> the token is and <em>where</em> it sits.</p>
<pre><code class="language-python">x = [t + p for t, p in zip(tok_emb, pos_emb)]
x = rmsnorm(x)                          # then normalize</code></pre>`,
      },
      dropout: {
        title: 'Dropout · <em>not used in microgpt</em>',
        body: `<p>Dropout zeroes out a random fraction of activations during training. It's a regularizer — forces the network to not rely on any single neuron. <strong>microgpt skips this entirely</strong> because the model and dataset are both small enough that overfitting isn't a concern. Every <em>Dropout</em> box in the diagram is just deleted in our code.</p>`,
      },
      transformer_layers: {
        title: 'Transformer Block · the <code>for li in range(n_layer)</code> loop',
        body: `<p>The orange blocks repeat <code>n_layer</code> times. microgpt has <code>n_layer = 1</code>; GPT-2 had 12; GPT-4-class models stack around 100. Each block does <em>attention → residual → MLP → residual</em>.</p>
<pre><code class="language-python">for li in range(n_layer):
    # attention block with residual
    # MLP block with residual
    ...</code></pre>
<p>Click any block inside the orange container on the right to see the per-line code for one layer.</p>`,
      },
      final_norm: {
        title: 'Final LayerNorm · microgpt uses <strong>RMSNorm</strong>',
        body: `<p>One last normalization before the output projection. microgpt swaps LayerNorm for the simpler <em>RMSNorm</em>: divide by the root-mean-square (no centering, no learned scale/shift).</p>
<pre><code class="language-python">def rmsnorm(x):
    ms = sum(xi * xi for xi in x) / len(x)
    scale = (ms + 1e-5) ** -0.5
    return [xi * scale for xi in x]</code></pre>
<p>This call happens implicitly inside the last layer's MLP block — microgpt has no separate final norm because <code>n_layer = 1</code>. In multi-layer GPTs there's an explicit final norm before <code>lm_head</code>.</p>`,
      },
      lm_head: {
        title: 'Output Linear · <code>lm_head</code>',
        body: `<p>Project the final hidden state to vocabulary size — one logit per possible next token.</p>
<pre><code class="language-python">logits = linear(x, state_dict['lm_head'])    # length 27</code></pre>
<p><strong>state_dict:</strong> <code>lm_head</code> with shape (vocab_size, n_embd) = (27, 16). 432 parameters.</p>`,
      },
      softmax: {
        title: 'Softmax · turn logits into probabilities',
        body: `<p>Exponentiate, normalize. Output is a length-27 probability distribution over the next token.</p>
<pre><code class="language-python">def softmax(logits):
    max_val = max(val.data for val in logits)
    exps = [(val - max_val).exp() for val in logits]
    total = sum(exps)
    return [e / total for e in exps]</code></pre>
<p>During training, this is also applied internally so we can compute cross-entropy loss as <code>-probs[target_id].log()</code>.</p>`,
      },
      attn_norm: {
        title: 'Pre-attention LayerNorm · <strong>microgpt: RMSNorm</strong>',
        body: `<p>"Pre-norm" Transformer: each sub-block normalizes its input before doing work. The pre-block input is saved separately as the residual <code>x_residual</code>.</p>
<pre><code class="language-python">x_residual = x
x = rmsnorm(x)</code></pre>`,
      },
      attn_qkv: {
        title: 'Q · K · V Linear projections',
        body: `<p>Three separate matrix-vector multiplies, producing the query, key, and value vectors for this token. The trapezoid widens in the diagram because in practice these three are computed in parallel and concatenated into one big linear; in microgpt they are three separate calls for clarity.</p>
<pre><code class="language-python">q = linear(x, state_dict[f'layer{li}.attn_wq'])
k = linear(x, state_dict[f'layer{li}.attn_wk'])
v = linear(x, state_dict[f'layer{li}.attn_wv'])
keys[li].append(k); values[li].append(v)</code></pre>
<p><strong>state_dict:</strong> <code>attn_wq</code>, <code>attn_wk</code>, <code>attn_wv</code>, each shape (16, 16) = 256 params apiece. Multi-head is implemented by <em>slicing</em> these 16-dim vectors into 4 chunks of 4 — no separate matrices per head.</p>`,
      },
      attn_matmul1: {
        title: 'Matmul Q · K · scaled',
        body: `<p>Dot-product the query with each past key, scaled by √d_head for variance control. This produces one attention score per past position.</p>
<pre><code class="language-python">attn_logits = [
    sum(q_h[j] * k_h[t][j] for j in range(head_dim)) / head_dim**0.5
    for t in range(len(k_h))
]</code></pre>`,
      },
      attn_mask: {
        title: 'Causal Mask · <em>implicit in microgpt</em>',
        body: `<p>In production, the attention scores are masked so a token at position <em>t</em> can only attend to positions <em>0..t</em> — no peeking at future tokens.</p>
<p><strong>microgpt doesn't need an explicit mask</strong> because it processes one token at a time and only the keys/values from past tokens are in the KV cache. There's literally nothing to mask.</p>`,
      },
      attn_softmax: {
        title: 'Softmax over scores → attention weights',
        body: `<p>Convert raw attention scores to a probability distribution over past tokens. These weights say "how much of each past token's value should flow into me?".</p>
<pre><code class="language-python">attn_weights = softmax(attn_logits)</code></pre>`,
      },
      attn_matmul2: {
        title: 'Matmul weights · V',
        body: `<p>Weighted sum of past value vectors. This is the head's output — a length-<code>head_dim</code> vector that mixes information from selected past tokens.</p>
<pre><code class="language-python">head_out = [
    sum(attn_weights[t] * v_h[t][j] for t in range(len(v_h)))
    for j in range(head_dim)
]
x_attn.extend(head_out)</code></pre>`,
      },
      attn_wo: {
        title: 'Attention output projection · <code>attn_wo</code>',
        body: `<p>Concatenate all head outputs and project back to the embedding dimension. This is what mixes information between heads.</p>
<pre><code class="language-python">x = linear(x_attn, state_dict[f'layer{li}.attn_wo'])</code></pre>
<p><strong>state_dict:</strong> <code>attn_wo</code> shape (16, 16) = 256 params.</p>`,
      },
      attn_residual: {
        title: '+ residual (attention)',
        body: `<p>Add the attention output back to the saved input. This "residual connection" gives gradients a direct highway from the loss back to the embedding — essential for training deep networks.</p>
<pre><code class="language-python">x = [a + b for a, b in zip(x, x_residual)]</code></pre>`,
      },
      mlp_norm: {
        title: 'Pre-MLP LayerNorm · <strong>microgpt: RMSNorm</strong>',
        body: `<p>Save a new <code>x_residual</code> (the post-attention stream) and normalize before the MLP.</p>
<pre><code class="language-python">x_residual = x
x = rmsnorm(x)</code></pre>`,
      },
      mlp_fc1: {
        title: 'MLP up-projection · <code>mlp_fc1</code>',
        body: `<p>Project from <code>n_embd</code> up to <code>4 * n_embd</code>. This is the "thinking room" — the model has more dimensions to compute in.</p>
<pre><code class="language-python">x = linear(x, state_dict[f'layer{li}.mlp_fc1'])    # 16 → 64</code></pre>
<p><strong>state_dict:</strong> <code>mlp_fc1</code> shape (64, 16) = 1,024 params. The biggest single tensor in microgpt.</p>`,
      },
      mlp_act: {
        title: 'GeLU activation · <strong>microgpt: ReLU</strong>',
        body: `<p>The nonlinearity. GPT-2 used GeLU; modern models use SwiGLU / GeGLU. microgpt uses the simplest: ReLU.</p>
<pre><code class="language-python">x = [xi.relu() for xi in x]</code></pre>
<p>Without this step, two stacked linears would collapse into one linear and the network couldn't learn nonlinear patterns.</p>`,
      },
      mlp_fc2: {
        title: 'MLP down-projection · <code>mlp_fc2</code>',
        body: `<p>Project from <code>4 * n_embd</code> back down to <code>n_embd</code>. This brings us back to the residual stream dimension so we can add.</p>
<pre><code class="language-python">x = linear(x, state_dict[f'layer{li}.mlp_fc2'])    # 64 → 16</code></pre>
<p><strong>state_dict:</strong> <code>mlp_fc2</code> shape (16, 64) = 1,024 params.</p>`,
      },
      mlp_residual: {
        title: '+ residual (MLP)',
        body: `<p>Add the MLP output back to the post-attention residual. This is what comes out of one Transformer block. In a multi-layer GPT, this output is the input to the next block.</p>
<pre><code class="language-python">x = [a + b for a, b in zip(x, x_residual)]</code></pre>`,
      },
    };

    const info = document.getElementById('arch-info');
    archSvg.querySelectorAll('.block').forEach((g) => {
      g.addEventListener('click', () => {
        const key = g.dataset.key;
        if (!key || !INFO[key]) return;
        archSvg.querySelectorAll('.block').forEach((b) => {
          b.classList.toggle('active', b.dataset.key === key);
        });
        const d = INFO[key];
        info.innerHTML = `<div class="ai-title">${d.title}</div>${d.body}`;
        // Re-run Prism on the new code blocks
        if (window.Prism) Prism.highlightAllUnder(info);
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Forward-pass section — tiny network + 3D prediction surface     */
  /* ---------------------------------------------------------------- */
  if (document.getElementById('fp-canvas')) {
    const archSvg = document.getElementById('fp-arch');
    const canvas = document.getElementById('fp-canvas');
    const ctx = canvas.getContext('2d');
    const NS = 'http://www.w3.org/2000/svg';

    const state = {
      w1: 0.8, w2: -0.6, w3: 0.5,
      b1: 0.2, b2: 0.0, b3: 0.0,
      x3: 0,
      theta: -0.6,   // azimuth (around vertical)
      phi: 1.1,      // elevation tilt (radians)
    };

    // Training mode state
    let target = null;            // { w1, w2, w3, b1, b2, b3 } when training, else null
    let lossHistory = [];         // recent loss readings
    let bestLoss = Infinity;

    function fmt(n) { return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2); }

    function predict(x1, x2, x3) {
      const h1 = Math.max(0, state.w1 * x1 + state.w2 * x2 + state.b1);
      const h2 = Math.max(0, state.w3 * x3 + state.b2);
      return Math.max(0, h1 + h2 + state.b3);
    }

    function predictWith(W, x1, x2, x3) {
      const h1 = Math.max(0, W.w1 * x1 + W.w2 * x2 + W.b1);
      const h2 = Math.max(0, W.w3 * x3 + W.b2);
      return Math.max(0, h1 + h2 + W.b3);
    }

    function computeLoss() {
      if (!target) return null;
      const G = 14, R = 3;
      let total = 0;
      for (let i = 0; i < G; i++) {
        for (let j = 0; j < G; j++) {
          const x1 = -R + 2 * R * i / (G - 1);
          const x2 = -R + 2 * R * j / (G - 1);
          const p = predict(x1, x2, state.x3);
          const t = predictWith(target, x1, x2, state.x3);
          total += (p - t) ** 2;
        }
      }
      return total / (G * G);
    }

    // --- Architecture SVG diagram ---
    function el(name, attrs, parent, text) {
      const e = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    }
    function renderArch() {
      archSvg.innerHTML = '';
      // Marker
      const defs = el('defs', {}, archSvg);
      const m = el('marker', { id: 'fp-arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--ink)' }, m);

      const inputs = [
        { x: 38, y: 50,  label: 'x₁' },
        { x: 38, y: 110, label: 'x₂' },
        { x: 38, y: 180, label: 'x₃' },
      ];
      const h1 = { x: 190, y: 75,  label: 'h₁', formula: 'ReLU' };
      const h2 = { x: 190, y: 180, label: 'h₂', formula: 'ReLU' };
      const output = { x: 320, y: 128, label: 'a' };
      // Bias boxes
      const b1 = { x: 250, y: 75,  label: 'b₁' };
      const b2 = { x: 250, y: 180, label: 'b₂' };
      const b3 = { x: 320, y: 210, label: 'b₃' };

      function edgeWithLabel(from, to, label, val, fromR, toR) {
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len;
        const x1 = from.x + ux * (fromR || 16), y1 = from.y + uy * (fromR || 16);
        const x2 = to.x - ux * (toR || 25), y2 = to.y - uy * (toR || 25);
        const color = val !== undefined ? (val > 0 ? '#b14a2e' : (val < 0 ? '#2a6f5b' : '#8a857d')) : '#1f1d1a';
        const sw = val !== undefined ? (0.8 + Math.min(2.5, Math.abs(val) * 1.4)) : 1.6;
        el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': sw, 'marker-end': 'url(#fp-arr)' }, archSvg);
        if (label) {
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 5;
          el('text', { x: mx, y: my, 'text-anchor': 'middle', 'font-size': 10, 'font-family': 'var(--mono)', fill: color }, archSvg, label);
        }
      }
      function edgeFromBias(from, to) {
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len;
        const x1 = from.x + ux * 12, y1 = from.y + uy * 12;
        const x2 = to.x - ux * 23, y2 = to.y - uy * 23;
        el('line', { x1, y1, x2, y2, stroke: '#8a857d', 'stroke-width': 1.3, 'marker-end': 'url(#fp-arr)' }, archSvg);
      }

      // Edges: inputs → hidden
      edgeWithLabel(inputs[0], h1, 'w₁', state.w1, 16, 22);
      edgeWithLabel(inputs[1], h1, 'w₂', state.w2, 16, 22);
      edgeWithLabel(inputs[2], h2, 'w₃', state.w3, 16, 22);
      // Edges: hidden → output (no weight labels)
      edgeWithLabel(h1, output, null, undefined, 22, 24);
      edgeWithLabel(h2, output, null, undefined, 22, 24);
      // Bias edges
      edgeFromBias(b1, h1);
      edgeFromBias(b2, h2);
      edgeFromBias(b3, output);

      // Input nodes
      inputs.forEach((p) => {
        el('circle', { cx: p.x, cy: p.y, r: 16, fill: '#fffefa', stroke: 'var(--ink)', 'stroke-width': 1.6 }, archSvg);
        el('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'var(--mono)' }, archSvg, p.label);
      });
      // Hidden
      [h1, h2].forEach((p) => {
        el('circle', { cx: p.x, cy: p.y, r: 22, fill: '#fff3d6', stroke: 'var(--ink)', 'stroke-width': 1.6 }, archSvg);
        el('text', { x: p.x, y: p.y - 2, 'text-anchor': 'middle', 'font-size': 13, 'font-family': 'var(--mono)' }, archSvg, p.label);
        el('text', { x: p.x, y: p.y + 12, 'text-anchor': 'middle', 'font-size': 10, 'font-family': 'var(--mono)', fill: 'var(--ink-mute)' }, archSvg, p.formula);
      });
      // Output (also ReLU)
      el('circle', { cx: output.x, cy: output.y, r: 24, fill: '#fde0d2', stroke: 'var(--accent)', 'stroke-width': 1.8 }, archSvg);
      el('text', { x: output.x, y: output.y - 2, 'text-anchor': 'middle', 'font-size': 14, 'font-family': 'var(--mono)', 'font-weight': 700 }, archSvg, output.label);
      el('text', { x: output.x, y: output.y + 12, 'text-anchor': 'middle', 'font-size': 10, 'font-family': 'var(--mono)', fill: 'var(--ink-mute)' }, archSvg, 'ReLU');

      // Bias boxes
      function biasBox(p, val) {
        el('rect', { x: p.x - 12, y: p.y - 9, width: 24, height: 18, fill: '#fffefa', stroke: 'var(--ink-mute)', 'stroke-width': 1.2, rx: 3 }, archSvg);
        el('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'var(--mono)' }, archSvg, p.label);
        // value below
        el('text', { x: p.x, y: p.y + 22, 'text-anchor': 'middle', 'font-size': 9, 'font-family': 'var(--mono)', fill: 'var(--ink-mute)' }, archSvg, fmt(val));
      }
      biasBox(b1, state.b1);
      biasBox(b2, state.b2);
      biasBox(b3, state.b3);
    }

    // --- Canvas 3D surface ---
    function rotate(p) {
      const ct = Math.cos(state.theta), st = Math.sin(state.theta);
      const cp = Math.cos(state.phi), sp = Math.sin(state.phi);
      // rotate around z (vertical) axis: this swivels the whole plot left/right
      const x1 = p[0] * ct - p[1] * st;
      const y1 = p[0] * st + p[1] * ct;
      const z1 = p[2];
      // tilt around x axis
      const y2 = y1 * cp - z1 * sp;
      const z2 = y1 * sp + z1 * cp;
      return [x1, y2, z2];
    }
    function project(p3, W, H, scale) {
      return {
        x: W / 2 + p3[0] * scale,
        y: H / 2 - p3[2] * scale - 30, // shift surface up a bit
        depth: p3[1],
      };
    }

    function colorFor(t) {
      // t in [0,1] — diverging palette
      t = Math.max(0, Math.min(1, t));
      if (t < 0.5) {
        const m = t * 2;
        const r = 200 + (245 - 200) * m;
        const g = 224 + (240 - 224) * m;
        const b = 210 + (228 - 210) * m;
        return `rgb(${r|0},${g|0},${b|0})`;
      } else {
        const m = (t - 0.5) * 2;
        const r = 245 + (200 - 245) * m;
        const g = 240 + (110 - 240) * m;
        const b = 228 + (70 - 228) * m;
        return `rgb(${r|0},${g|0},${b|0})`;
      }
    }

    function renderSurface() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      if (canvas.width !== W * dpr) {
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      ctx.clearRect(0, 0, W, H);

      const N = 28, RANGE = 3;
      const scale = Math.min(W, H) / 9;

      // Sample (x1, x2) grid; height = a(x1, x2, state.x3)
      const pts = [];
      let zMin = Infinity, zMax = -Infinity;
      for (let i = 0; i <= N; i++) {
        const row = [];
        for (let j = 0; j <= N; j++) {
          const x1 = -RANGE + (2 * RANGE * i / N);
          const x2 = -RANGE + (2 * RANGE * j / N);
          const a = predict(x1, x2, state.x3);
          row.push([x1, x2, a]);
          if (a < zMin) zMin = a;
          if (a > zMax) zMax = a;
        }
        pts.push(row);
      }
      const zRange = Math.max(0.1, zMax - zMin);
      // Fixed height scale so absolute level (including the constant lift from x3) is visible.
      // a=6 maps to plot-z=3; surface sits on the floor at a=0.
      const heightScale = 0.5;
      const floorZ = -1.5; // place a=0 below center so positive a rises toward the top

      const sp = pts.map(row => row.map(p => {
        const p3 = rotate([p[0], p[1], floorZ + p[2] * heightScale]);
        const s = project(p3, W, H, scale);
        s.a = p[2];
        return s;
      }));

      // Axis helpers
      function dline(p1, p2, color) {
        const r1 = rotate(p1), r2 = rotate(p2);
        const s1 = project(r1, W, H, scale), s2 = project(r2, W, H, scale);
        ctx.strokeStyle = color || '#8a857d';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
      }
      function dtext(p, txt, color) {
        const r = rotate(p), s = project(r, W, H, scale);
        ctx.fillStyle = color || '#4a4742';
        ctx.font = '12px -apple-system, sans-serif';
        ctx.fillText(txt, s.x + 4, s.y + 4);
      }
      // Floor outline at a=0 (which is floorZ in plot coords)
      dline([-RANGE, -RANGE, floorZ], [RANGE, -RANGE, floorZ], '#e6e1d6');
      dline([RANGE, -RANGE, floorZ], [RANGE, RANGE, floorZ], '#e6e1d6');
      dline([RANGE, RANGE, floorZ], [-RANGE, RANGE, floorZ], '#e6e1d6');
      dline([-RANGE, RANGE, floorZ], [-RANGE, -RANGE, floorZ], '#e6e1d6');
      // Axes — x1, x2 on the floor; a points up
      dline([0, 0, floorZ], [RANGE * 1.2, 0, floorZ], '#8a857d');
      dline([0, 0, floorZ], [0, RANGE * 1.2, floorZ], '#8a857d');
      dline([0, 0, floorZ], [0, 0, floorZ + 6 * heightScale], '#8a857d');
      dtext([RANGE * 1.2, 0, floorZ], 'x₁');
      dtext([0, RANGE * 1.2, floorZ], 'x₂');
      dtext([0, 0, floorZ + 6 * heightScale], 'a');

      // Triangles
      const tris = [];
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const a = sp[i][j], b = sp[i+1][j], c = sp[i+1][j+1], d = sp[i][j+1];
          const aVal = (a.a + b.a + c.a) / 3;
          const bVal = (a.a + c.a + d.a) / 3;
          tris.push({ p: [a, b, c], avgZ: aVal, depth: (a.depth + b.depth + c.depth) / 3 });
          tris.push({ p: [a, c, d], avgZ: bVal, depth: (a.depth + c.depth + d.depth) / 3 });
        }
      }
      tris.sort((a, b) => b.depth - a.depth);

      tris.forEach(t => {
        const tFrac = (t.avgZ - zMin) / zRange;
        ctx.fillStyle = colorFor(tFrac);
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(t.p[0].x, t.p[0].y);
        ctx.lineTo(t.p[1].x, t.p[1].y);
        ctx.lineTo(t.p[2].x, t.p[2].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      // === Target surface overlay (training mode) ===
      if (target) {
        const TN = 12;  // coarser wireframe for visibility
        const tpts = [];
        for (let i = 0; i <= TN; i++) {
          const row = [];
          for (let j = 0; j <= TN; j++) {
            const x1 = -RANGE + (2 * RANGE * i / TN);
            const x2 = -RANGE + (2 * RANGE * j / TN);
            const a = predictWith(target, x1, x2, state.x3);
            const p3 = rotate([x1, x2, floorZ + a * heightScale]);
            const s = project(p3, W, H, scale);
            row.push(s);
          }
          tpts.push(row);
        }
        ctx.strokeStyle = 'rgba(20, 30, 50, 0.7)';
        ctx.lineWidth = 1.2;
        // Horizontal lines (rows)
        for (let i = 0; i <= TN; i++) {
          ctx.beginPath();
          ctx.moveTo(tpts[i][0].x, tpts[i][0].y);
          for (let j = 1; j <= TN; j++) ctx.lineTo(tpts[i][j].x, tpts[i][j].y);
          ctx.stroke();
        }
        // Vertical lines (columns)
        for (let j = 0; j <= TN; j++) {
          ctx.beginPath();
          ctx.moveTo(tpts[0][j].x, tpts[0][j].y);
          for (let i = 1; i <= TN; i++) ctx.lineTo(tpts[i][j].x, tpts[i][j].y);
          ctx.stroke();
        }
        // Legend
        ctx.fillStyle = 'rgba(20, 30, 50, 0.85)';
        ctx.font = 'bold 11px -apple-system, sans-serif';
        ctx.fillText('━ target', W - 70, 18);
      }

      ctx.fillStyle = '#4a4742';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillText(`a ∈ [${zMin.toFixed(2)}, ${zMax.toFixed(2)}]   (x₃ = ${state.x3.toFixed(2)})`, 10, H - 10);
    }

    // === Loss history chart ===
    function drawLossHistory() {
      const cv = document.getElementById('fp-loss-history');
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = cv.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr; cv.height = h * dpr;
        cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const c = cv.getContext('2d');
      c.clearRect(0, 0, w, h);

      const pad = { l: 32, r: 8, t: 8, b: 16 };
      const plotW = w - pad.l - pad.r;
      const plotH = h - pad.t - pad.b;

      // Gridlines and reference
      c.strokeStyle = '#e6e1d6'; c.lineWidth = 1;
      [0, 0.25, 0.5, 0.75, 1].forEach(f => {
        const y = pad.t + plotH * (1 - f);
        c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke();
      });

      if (lossHistory.length === 0) {
        c.fillStyle = '#8a857d'; c.font = '11px -apple-system, sans-serif';
        c.fillText('Adjust a slider to plot loss…', pad.l + 6, pad.t + plotH / 2 + 3);
        return;
      }

      const maxL = Math.max(...lossHistory, 0.01);
      const N = lossHistory.length;
      // Y-axis ticks
      c.fillStyle = '#8a857d'; c.font = '10px -apple-system, sans-serif';
      [0, maxL / 2, maxL].forEach(v => {
        const y = pad.t + plotH * (1 - v / maxL);
        c.fillText(v.toFixed(2), 2, y + 3);
      });
      // X axis label
      c.textAlign = 'left';
      c.fillText('time →', pad.l, h - 3);
      c.textAlign = 'start';

      // Plot the line
      c.strokeStyle = '#b14a2e'; c.lineWidth = 1.6;
      c.beginPath();
      lossHistory.forEach((v, i) => {
        const x = pad.l + plotW * (i / Math.max(1, N - 1));
        const y = pad.t + plotH * (1 - v / maxL);
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
      c.stroke();
      // Best-loss horizontal line
      if (bestLoss < Infinity && bestLoss > 0) {
        const bestY = pad.t + plotH * (1 - bestLoss / maxL);
        c.strokeStyle = '#2a6f5b';
        c.setLineDash([4, 4]);
        c.beginPath(); c.moveTo(pad.l, bestY); c.lineTo(w - pad.r, bestY); c.stroke();
        c.setLineDash([]);
        c.fillStyle = '#2a6f5b';
        c.font = '10px -apple-system, sans-serif';
        c.fillText('best ' + bestLoss.toFixed(3), w - pad.r - 70, bestY - 4);
      }
      // Current point
      const lastY = pad.t + plotH * (1 - lossHistory[N - 1] / maxL);
      const lastX = pad.l + plotW;
      c.fillStyle = '#b14a2e';
      c.beginPath(); c.arc(lastX, lastY, 3, 0, Math.PI * 2); c.fill();
    }

    function updateLossUI() {
      if (!target) return;
      const loss = computeLoss();
      lossHistory.push(loss);
      if (lossHistory.length > 120) lossHistory.shift();
      if (loss < bestLoss) bestLoss = loss;
      document.getElementById('fp-loss-value').textContent = loss.toFixed(4);
      document.getElementById('fp-loss-best').textContent = bestLoss.toFixed(4);
      const fillPct = Math.min(100, (loss / 1.5) * 100); // 1.5 is a generous high bound
      document.getElementById('fp-loss-bar-fill').style.width = fillPct + '%';
      drawLossHistory();
    }

    function renderAll() {
      // Update slider value labels
      document.getElementById('fp-w1-val').textContent = fmt(state.w1);
      document.getElementById('fp-w2-val').textContent = fmt(state.w2);
      document.getElementById('fp-w3-val').textContent = fmt(state.w3);
      document.getElementById('fp-b1-val').textContent = fmt(state.b1);
      document.getElementById('fp-b2-val').textContent = fmt(state.b2);
      document.getElementById('fp-b3-val').textContent = fmt(state.b3);
      document.getElementById('fp-x3-val').textContent = fmt(state.x3);
      renderArch();
      renderSurface();
      updateLossUI();
    }

    // === Training mode wiring ===
    function newTarget() {
      function r() { return (Math.random() * 2 - 1) * 1.2; }
      target = {
        w1: r(), w2: r(), w3: r(),
        b1: r() * 0.5, b2: r() * 0.5, b3: r() * 0.5,
      };
      lossHistory = [];
      bestLoss = Infinity;
      document.getElementById('fp-target-reveal').style.display = 'none';
    }
    document.getElementById('fp-set-target').addEventListener('click', () => {
      newTarget();
      document.getElementById('fp-training').classList.add('active');
      renderAll();
    });
    document.getElementById('fp-new-target').addEventListener('click', () => {
      newTarget();
      renderAll();
    });
    document.getElementById('fp-stop-target').addEventListener('click', () => {
      target = null;
      lossHistory = [];
      bestLoss = Infinity;
      document.getElementById('fp-training').classList.remove('active');
      document.getElementById('fp-target-reveal').style.display = 'none';
      renderAll();
    });
    document.getElementById('fp-reveal-target').addEventListener('click', () => {
      const el = document.getElementById('fp-target-reveal');
      if (!target) return;
      if (el.style.display === 'none' || el.style.display === '') {
        el.style.display = 'block';
        el.innerHTML =
          `target weights: ` +
          `w₁=${fmt(target.w1)}  w₂=${fmt(target.w2)}  w₃=${fmt(target.w3)}  ` +
          `b₁=${fmt(target.b1)}  b₂=${fmt(target.b2)}  b₃=${fmt(target.b3)}`;
      } else {
        el.style.display = 'none';
      }
    });

    // Wire sliders
    document.querySelectorAll('#fp-controls input[type="range"]').forEach((inp) => {
      inp.addEventListener('input', () => {
        state[inp.dataset.ctrl] = parseFloat(inp.value);
        renderAll();
      });
    });
    document.getElementById('fp-x3').addEventListener('input', (e) => {
      state.x3 = parseFloat(e.target.value);
      renderAll();
    });
    document.getElementById('fp-randomize').addEventListener('click', () => {
      function r() { return (Math.random() * 2 - 1) * 1.2; }
      state.w1 = r(); state.w2 = r(); state.w3 = r();
      state.b1 = r() * 0.5; state.b2 = r() * 0.5; state.b3 = r() * 0.5;
      // Sync sliders to new state
      document.querySelectorAll('#fp-controls input[type="range"]').forEach((inp) => {
        inp.value = state[inp.dataset.ctrl];
      });
      renderAll();
    });
    document.getElementById('fp-reset-view').addEventListener('click', () => {
      state.theta = -0.6; state.phi = 1.1;
      renderAll();
    });

    // Mouse drag → rotate
    let dragging = false, dragStart = null, startTheta = 0, startPhi = 0;
    function onDown(e) {
      dragging = true;
      const p = e.touches ? e.touches[0] : e;
      dragStart = { x: p.clientX, y: p.clientY };
      startTheta = state.theta; startPhi = state.phi;
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - dragStart.x, dy = p.clientY - dragStart.y;
      state.theta = startTheta - dx * 0.01;
      state.phi = Math.max(0.2, Math.min(1.5, startPhi - dy * 0.01));
      renderSurface();
      e.preventDefault();
    }
    function onUp() { dragging = false; }
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown);
    canvas.addEventListener('touchmove', onMove);
    canvas.addEventListener('touchend', onUp);

    window.addEventListener('resize', renderSurface);
    renderAll();
  }

  /* ---------------------------------------------------------------- */
  /*  Concrete numeric Transformer block walkthrough                  */
  /* ---------------------------------------------------------------- */
  if (document.getElementById('num-tour')) {
    const D = 2;       // d_model
    const DH = 2;      // head_dim (single head)
    const PAST = 2;    // pre-cached past tokens (current is position 2)
    const POS = 2;     // current position (0-indexed)
    const MLP_H = 4 * D; // 8

    // Seeded RNG for reproducible weights
    function makeLcg(seed) {
      let s = seed >>> 0;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return ((s / 0x7fffffff) * 2 - 1) * 0.5; // ~[-0.5, 0.5]
      };
    }

    // Position-embedding table (pinned to the toy walkthrough values).
    // pos 0 = BOS slot, pos 1 = first letter, pos 2 = current token, etc.
    const TOY_WPE_TABLE = [
      [ 0.10, -0.05],  // pos 0
      [ 0.05,  0.15],  // pos 1
      [-0.10,  0.10],  // pos 2 ← current
      [ 0.15,  0.00],  // pos 3
    ];

    // lm_head — one row per vocab token (BOS, 'a', 'b', 'c'). Matches mat-lm-head in the matrix viz.
    const TOY_LM_HEAD = [
      [ 0.30,  0.10],   // BOS
      [-0.20,  0.40],   // 'a'
      [ 0.50, -0.30],   // 'b'
      [-0.10,  0.60],   // 'c'
    ];
    const VOCAB_LABELS = ['BOS', "'a'", "'b'", "'c'"];

    // All other weights pinned to the toy walkthrough so widget numbers
    // match the Attention/MLP "Toy walkthrough" callouts.
    const TOY_W = {
      Wq: [[ 0.50,  0.20], [ 0.10,  0.40]],
      Wk: [[ 0.30, -0.10], [ 0.20,  0.50]],
      Wv: [[ 0.40,  0.10], [-0.20,  0.60]],
      Wo: [[ 0.60,  0.20], [ 0.10,  0.70]],
      fc1: [
        [ 0.40,  0.10], [-0.20,  0.50], [ 0.30, -0.30], [ 0.10,  0.40],
        [-0.50,  0.20], [ 0.20, -0.10], [ 0.60,  0.30], [-0.10, -0.40],
      ],
      fc2: [
        [ 0.10,  0.30, -0.20,  0.40,  0.00,  0.20, -0.10,  0.50],
        [-0.30,  0.20,  0.50, -0.10,  0.40, -0.40,  0.30,  0.10],
      ],
      cacheK: [[ 0.30,  0.10], [-0.10,  0.40]],
      cacheV: [[ 0.20, -0.30], [ 0.50,  0.20]],
    };

    let W = {};
    function regen(seed) {
      if (seed === undefined || seed === null) {
        // Toy walkthrough values (default — matches the callouts)
        W = {
          wpe: TOY_WPE_TABLE[POS],
          Wq: TOY_W.Wq.map(r => r.slice()),
          Wk: TOY_W.Wk.map(r => r.slice()),
          Wv: TOY_W.Wv.map(r => r.slice()),
          Wo: TOY_W.Wo.map(r => r.slice()),
          fc1: TOY_W.fc1.map(r => r.slice()),
          fc2: TOY_W.fc2.map(r => r.slice()),
          cacheK: TOY_W.cacheK.map(r => r.slice()),
          cacheV: TOY_W.cacheV.map(r => r.slice()),
        };
        return;
      }
      const r = makeLcg(seed);
      W = {
        wpe: TOY_WPE_TABLE[POS],   // wpe stays pinned even when other weights randomize
        Wq: [[r(), r()], [r(), r()]],
        Wk: [[r(), r()], [r(), r()]],
        Wv: [[r(), r()], [r(), r()]],
        Wo: [[r(), r()], [r(), r()]],
        fc1: Array.from({ length: MLP_H }, () => Array.from({ length: D }, r)),
        fc2: Array.from({ length: D }, () => Array.from({ length: MLP_H }, r)),
        cacheK: Array.from({ length: PAST }, () => [r() * 1.2, r() * 1.2]),
        cacheV: Array.from({ length: PAST }, () => [r() * 1.2, r() * 1.2]),
      };
    }
    regen();

    // --- linear algebra helpers ---
    function matvec(M, x) {
      return M.map(row => row.reduce((a, w, i) => a + w * x[i], 0));
    }
    function vecAdd(a, b) { return a.map((v, i) => v + b[i]); }
    function vecZeros(n) { return Array(n).fill(0); }
    function rmsnorm(x) {
      const ms = x.reduce((a, v) => a + v * v, 0) / x.length;
      const scale = 1 / Math.sqrt(ms + 1e-5);
      return x.map(v => v * scale);
    }
    function softmaxArr(s) {
      const m = Math.max(...s);
      const exps = s.map(v => Math.exp(v - m));
      const sum = exps.reduce((a, b) => a + b, 0);
      return exps.map(e => e / sum);
    }
    function reluVec(x) { return x.map(v => Math.max(0, v)); }

    function forward(x_input) {
      const s = {};
      s.x = x_input;
      s.x_pos = vecAdd(x_input, W.wpe);
      s.x_norm_attn = rmsnorm(s.x_pos);
      s.q = matvec(W.Wq, s.x_norm_attn);
      s.k = matvec(W.Wk, s.x_norm_attn);
      s.v = matvec(W.Wv, s.x_norm_attn);
      s.allK = [...W.cacheK, s.k];
      s.allV = [...W.cacheV, s.v];
      s.scores = s.allK.map(ki => ki.reduce((a, kj, j) => a + s.q[j] * kj, 0) / Math.sqrt(DH));
      s.attn_w = softmaxArr(s.scores);
      const ao = vecZeros(DH);
      for (let t = 0; t < s.allV.length; t++)
        for (let j = 0; j < DH; j++) ao[j] += s.attn_w[t] * s.allV[t][j];
      s.attn_pre_o = ao;
      s.attn_out = matvec(W.Wo, ao);
      s.x_post_attn = vecAdd(s.x_pos, s.attn_out);
      s.x_norm_mlp = rmsnorm(s.x_post_attn);
      s.h_pre = matvec(W.fc1, s.x_norm_mlp);
      s.h_relu = reluVec(s.h_pre);
      s.mlp_out = matvec(W.fc2, s.h_relu);
      s.x_final = vecAdd(s.x_post_attn, s.mlp_out);
      // Output stage: lm_head projection → softmax over toy vocab
      s.logits   = TOY_LM_HEAD.map(row => row.reduce((a, w, j) => a + w * s.x_final[j], 0));
      s.out_probs = softmaxArr(s.logits);
      return s;
    }

    // --- rendering helpers ---
    function fmtNum(v) { return v.toFixed(2); }
    function tensorHtml(arr, opts) {
      opts = opts || {};
      const peak = opts.peak;
      return '<span class="tensor-box">' + arr.map((v, i) => {
        const cls = v > 0.01 ? 'pos' : (v < -0.01 ? 'neg' : 'zero');
        const peakCls = (peak === i) ? ' peak' : '';
        return `<span class="tensor-cell ${cls}${peakCls}">${fmtNum(v)}</span>`;
      }).join('') + '</span>';
    }
    function stageHtml(name, formula, label, valueHtml, opts) {
      opts = opts || {};
      const blockAttr = opts.block ? ` data-block="${opts.block}"` : '';
      return `<div class="num-stage${opts.cls ? ' ' + opts.cls : ''}"${blockAttr}>
        <div>
          <div class="ns-name">${name}</div>
          ${formula ? `<div class="ns-formula">${formula}</div>` : ''}
        </div>
        <div class="ns-output">${label ? `<span class="ns-label">${label}</span>` : ''}${valueHtml}</div>
      </div>`;
    }
    function sectionHtml(text) {
      return `<div class="num-stage section-header">${text}</div>`;
    }
    function arrowHtml() {
      return '<div class="num-arrow">↓</div>';
    }

    function kvCacheHtml(allK, allV) {
      let html = '<div class="kv-cache-display">';
      for (let i = 0; i < allK.length; i++) {
        const marker = (i === allK.length - 1) ? ' (new)' : ` (pos ${i})`;
        const isNew = i === allK.length - 1;
        html += `<div class="kv-row"><span class="kv-label">${isNew ? `pos ${i}*` : `pos ${i}`}</span>k=${tensorHtml(allK[i])} v=${tensorHtml(allV[i])}</div>`;
      }
      html += '</div>';
      return html;
    }

    function render() {
      const x0 = parseFloat(document.getElementById('num-x0').value);
      const x1 = parseFloat(document.getElementById('num-x1').value);
      document.getElementById('num-x0-val').textContent = fmtNum(x0);
      document.getElementById('num-x1-val').textContent = fmtNum(x1);

      const s = forward([x0, x1]);
      const peakAttn = s.attn_w.indexOf(Math.max(...s.attn_w));

      const html = [
        sectionHtml('Inputs'),
        stageHtml('Token vector (current)', 'x ∈ ℝᵈ, d=2', 'x =', tensorHtml(s.x), { block: 'E' }),
        stageHtml('Position embedding lookup', 'wpe[pos=' + POS + ']', 'wpe =', tensorHtml(W.wpe), { block: 'E' }),
        stageHtml('+ token & position', 'x ← x + wpe', 'x =', tensorHtml(s.x_pos), { block: 'E' }),

        sectionHtml('Attention block'),
        stageHtml('RMSNorm (pre-attn)', 'x / √(mean(x²) + ε)', 'x̂ =', tensorHtml(s.x_norm_attn), { block: 'AN' }),
        stageHtml(
          'Q, K, V projections',
          'q=Wq·x̂   k=Wk·x̂   v=Wv·x̂',
          '',
          `<span class="ns-label">q=</span>${tensorHtml(s.q)} <span class="ns-label">k=</span>${tensorHtml(s.k)} <span class="ns-label">v=</span>${tensorHtml(s.v)}`,
          { block: 'AQ' }
        ),
        stageHtml(
          'Append k, v to KV cache',
          PAST + ' past + current = ' + (PAST + 1) + ' positions',
          '',
          kvCacheHtml(s.allK, s.allV),
          { block: 'AQ' }
        ),
        stageHtml('Attention scores', 'sₜ = (q · kₜ) / √d_head', 's =', tensorHtml(s.scores, { peak: peakAttn }), { block: 'AC' }),
        stageHtml('Softmax → attention weights', 'w = softmax(s)', 'w =', tensorHtml(s.attn_w, { peak: peakAttn }), { block: 'AC' }),
        stageHtml('Weighted sum of V', 'Σₜ wₜ · vₜ', 'attn =', tensorHtml(s.attn_pre_o), { block: 'AC' }),
        stageHtml('Linear (Wₒ)', 'attn ← Wₒ · attn', '', tensorHtml(s.attn_out), { block: 'AO' }),
        stageHtml('+ residual', 'x ← x_pos + attn_out', 'x =', tensorHtml(s.x_post_attn), { cls: 'residual', block: 'AO' }),

        sectionHtml('MLP block'),
        stageHtml('RMSNorm (pre-MLP)', 'x / √(mean(x²) + ε)', 'x̂ =', tensorHtml(s.x_norm_mlp), { block: 'MN' }),
        stageHtml('fc1 — project up (2 → 8)', 'h = fc1 · x̂', 'h =', tensorHtml(s.h_pre), { block: 'MF' }),
        stageHtml('ReLU', 'h ← max(0, h)', 'h =', tensorHtml(s.h_relu), { block: 'MF' }),
        stageHtml('fc2 — project down (8 → 2)', 'm = fc2 · h', 'mlp =', tensorHtml(s.mlp_out), { block: 'MF' }),
        stageHtml('+ residual', 'x ← x_post_attn + mlp_out', 'x =', tensorHtml(s.x_final), { cls: 'residual', block: 'MR' }),

        sectionHtml('Block output (would feed the next layer, or lm_head)'),
      ];
      document.getElementById('num-tour').innerHTML = html.join('');
      if (!archColumnsBuilt) {
        WIDGETS.forEach(w => buildArchColumn(w));
        archColumnsBuilt = true;
      }
      WIDGETS.forEach(w => renderNN(s, w));
      bindBlockHover();
    }

    // === Word-picker attention demo ("The quick brown fox jumps over the lazy dog") ===
    (function initWordPicker() {
      const row = document.getElementById('wp-row');
      const result = document.getElementById('wp-result');
      if (!row || !result) return;

      // Per-word Q/K/V vectors. 3-dim, designed so the resulting attention pattern
      // is pedagogically meaningful:
      //   dim 0 ≈ "noun-ness"   (positive = noun/object, ~zero = verb/prep)
      //   dim 1 ≈ "action/verb-ness"
      //   dim 2 ≈ "position" (positive = front of sentence, negative = back)
      // Q (what this word is "looking for") and K (what this word "advertises")
      // differ — that's why attention isn't just self-similarity.
      const WORDS = [
        { id: 'the1',  word: 'The',
          Q: [+1.0, +0.0, +1.4], K: [+0.4, +0.0, +1.6], V: [+0.1, +0.0, +0.1],
          note: 'The first "the" is a determiner — it looks for a nearby noun in the front of the sentence (fox) and at itself for grammatical context.' },
        { id: 'quick', word: 'quick',
          Q: [+1.4, +0.0, +0.8], K: [+0.2, +0.4, +1.2], V: [+0.4, +0.5, +0.1],
          note: '"quick" is an adjective modifying "fox" — most weight lands on the noun it describes.' },
        { id: 'brown', word: 'brown',
          Q: [+1.4, +0.0, +0.8], K: [+0.2, +0.2, +0.8], V: [+0.5, +0.2, +0.0],
          note: '"brown" is also an adjective for "fox" — same pattern as "quick", strong attention on the noun.' },
        { id: 'fox',   word: 'fox',
          Q: [+0.4, +1.4, +0.4], K: [+1.8, +0.2, +0.4], V: [+0.9, +0.4, +0.2],
          note: '"fox" is the subject — its attention spreads over the action ("jumps") and the words describing it ("quick", "brown").' },
        { id: 'jumps', word: 'jumps',
          Q: [+1.6, +0.4, +0.4], K: [+0.0, +1.8, +0.0], V: [+0.3, +0.9, +0.1],
          note: '"jumps" is the main verb — strongest attention to its subject ("fox"). Direction words ("over") and the object ("dog") also matter.' },
        { id: 'over',  word: 'over',
          Q: [+0.6, +1.2, +0.0], K: [+0.0, +1.2, -0.4], V: [+0.1, +0.7, +0.0],
          note: '"over" is a preposition — it attends to the verb it modifies ("jumps") and the noun on the other side ("dog").' },
        { id: 'the2',  word: 'the',
          Q: [+1.0, +0.0, -1.0], K: [+0.4, +0.0, -1.2], V: [+0.1, +0.0, -0.1],
          note: 'The second "the" is the determiner for "dog" — attention concentrates on that noun (and itself).' },
        { id: 'lazy',  word: 'lazy',
          Q: [+1.4, +0.0, -1.2], K: [+0.2, +0.2, -1.4], V: [+0.4, +0.2, -0.1],
          note: '"lazy" is the adjective for "dog" — most weight on the noun it describes.' },
        { id: 'dog',   word: 'dog',
          Q: [+0.4, +1.4, -0.4], K: [+1.8, +0.2, -1.6], V: [+0.8, +0.3, -0.1],
          note: '"dog" is the object — attention divides between the action ("jumps"), the preposition ("over"), and its modifier ("lazy").' },
      ];

      const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

      function softmax(arr) {
        const m = Math.max(...arr);
        const exps = arr.map(v => Math.exp(v - m));
        const s = exps.reduce((a, b) => a + b, 0);
        return exps.map(e => e / s);
      }

      function fmt(v) { return (v >= 0 ? '+' : '') + v.toFixed(2); }
      function fmtVec(v) { return '[' + v.map(fmt).join(', ') + ']'; }

      function render(activeId) {
        // Build pickers
        row.innerHTML = '';
        WORDS.forEach(w => {
          const btn = document.createElement('button');
          btn.className = 'wp-btn' + (w.id === activeId ? ' active' : '');
          btn.textContent = w.word;
          btn.dataset.wid = w.id;
          btn.addEventListener('click', () => render(w.id));
          row.appendChild(btn);
        });

        const qWord = WORDS.find(w => w.id === activeId);
        const q = qWord.Q;
        // Compute scores = q · K_i for every word, then softmax → weights
        const scores = WORDS.map(w => dot(q, w.K));
        const weights = softmax(scores);
        const peak = weights.indexOf(Math.max(...weights));
        const maxW = weights[peak];
        // Output = Σ weights[i] * V[i]
        const dV = WORDS[0].V.length;
        const output = Array(dV).fill(0);
        WORDS.forEach((w, i) => {
          for (let j = 0; j < dV; j++) output[j] += weights[i] * w.V[j];
        });

        // ───── Bar chart (matches numbers in the diagram below) ─────
        let html = `<div class="wp-query-row">Query: <strong>${qWord.word}</strong> &nbsp;→ attention weights against each key (softmax of q·K)</div>`;
        html += '<div class="wp-bars">';
        WORDS.forEach((w, i) => {
          const wt = weights[i];
          const pct = (wt / maxW) * 100;
          const peakCls = i === peak ? ' peak' : '';
          html += `<div class="wp-bar-row${peakCls}">`;
          html += `<span class="wp-word">${w.word}</span>`;
          html += `<div class="wp-bar-track"><div class="wp-bar-fill" style="width:${pct}%"></div></div>`;
          html += `<span class="wp-val">${wt.toFixed(2)}</span>`;
          html += '</div>';
        });
        html += '</div>';
        html += `<div class="wp-explain">${qWord.note}</div>`;

        // ───── Live attention-mechanism diagram with concrete vectors ─────
        html += '<div class="wp-diagram">';
        html += '<div class="wp-diagram-title">The same step, with concrete numbers</div>';

        // Top: query box
        html += '<div class="wpd-stage wpd-query-stage">';
        html += `<span class="wpd-tag query">query</span>`;
        html += `<span class="wpd-pill purple"><span class="wpd-word">${qWord.word}</span> &rarr; q = ${fmtVec(q)}</span>`;
        html += '</div>';
        html += '<div class="wpd-arrow">↓</div>';

        // Key column + Value column side-by-side
        html += '<div class="wpd-cols">';
        // Keys
        html += '<div class="wpd-col key-col">';
        html += '<div class="wpd-col-header"><span class="wpd-tag key">keys (K)</span></div>';
        html += '<table class="wpd-table">';
        WORDS.forEach((w, i) => {
          const hl = i === peak ? ' class="peak"' : '';
          html += `<tr${hl}><th>${w.word}</th><td>${fmtVec(w.K)}</td></tr>`;
        });
        html += '</table>';
        html += '</div>';
        // Values
        html += '<div class="wpd-col value-col">';
        html += '<div class="wpd-col-header"><span class="wpd-tag value">values (V)</span></div>';
        html += '<table class="wpd-table">';
        WORDS.forEach((w, i) => {
          const hl = i === peak ? ' class="peak"' : '';
          html += `<tr${hl}><th>${w.word}</th><td>${fmtVec(w.V)}</td></tr>`;
        });
        html += '</table>';
        html += '</div>';
        html += '</div>'; // .wpd-cols
        html += '<div class="wpd-arrow">↓</div>';

        // Scores box
        html += '<div class="wpd-stage wpd-scores-stage">';
        html += '<div class="wpd-stage-title"><code>score<sub>i</sub> = q · K<sub>i</sub></code></div>';
        html += '<table class="wpd-table wpd-row-table">';
        html += '<tr>';
        WORDS.forEach((w, i) => {
          const cls = i === peak ? 'peak' : (scores[i] < 0 ? 'neg' : '');
          html += `<th class="${cls}">${w.word}</th>`;
        });
        html += '</tr><tr>';
        WORDS.forEach((w, i) => {
          const cls = i === peak ? 'peak' : (scores[i] < 0 ? 'neg' : '');
          html += `<td class="${cls}">${fmt(scores[i])}</td>`;
        });
        html += '</tr></table>';
        html += '</div>';
        html += '<div class="wpd-arrow">↓ softmax</div>';

        // Weights box
        html += '<div class="wpd-stage wpd-weights-stage">';
        html += '<div class="wpd-stage-title">softmax(scores) → weights · sum = 1.00</div>';
        html += '<table class="wpd-table wpd-row-table">';
        html += '<tr>';
        WORDS.forEach((w, i) => {
          const cls = i === peak ? 'peak' : '';
          html += `<th class="${cls}">${w.word}</th>`;
        });
        html += '</tr><tr>';
        WORDS.forEach((w, i) => {
          const cls = i === peak ? 'peak' : '';
          html += `<td class="${cls}">${weights[i].toFixed(3)}</td>`;
        });
        html += '</tr></table>';
        html += '</div>';
        html += '<div class="wpd-arrow">↓ Σ w<sub>i</sub> · V<sub>i</sub></div>';

        // Output box
        html += '<div class="wpd-stage wpd-output-stage">';
        html += `<span class="wpd-tag">output</span>`;
        html += `<span class="wpd-pill">${fmtVec(output)}</span>`;
        html += '</div>';

        html += '</div>'; // .wp-diagram
        result.innerHTML = html;
      }
      render('jumps');
    })();

    // === Widget configuration: progressive three-views copies ===
    const ALL_TV_BLOCKS = [
      { id: 'E',  color: 'embed',     name: 'Embeddings',    sub: 'x + wpe' },
      { id: 'AN', color: 'norm',      name: 'RMSNorm',       sub: 'pre-attn' },
      { id: 'AQ', color: 'linear',    name: 'Linear',        sub: 'Q · K · V' },
      { id: 'AC', color: 'attention', name: 'Attention',     sub: 'scores → softmax → ΣwV' },
      { id: 'AO', color: 'linear',    name: 'Linear Wₒ + residual', sub: '' },
      { id: 'MN', color: 'norm',      name: 'RMSNorm',       sub: 'pre-MLP' },
      { id: 'MF', color: 'mlp',       name: 'MLP',           sub: 'fc1 · ReLU · fc2' },
      { id: 'MR', color: 'residual',  name: '+ residual',    sub: '' },
      { id: 'OL', color: 'linear',    name: 'lm_head',       sub: 'final → logits' },
      { id: 'OS', color: 'softmax',   name: 'softmax',       sub: 'next-letter probs' },
    ];
    const WIDGETS = [
      { archId: 'tv-arch-1',  svgId: 'tv-nn-svg-1',  blocks: new Set(['E']) },
      { archId: 'tv-arch-1b', svgId: 'tv-nn-svg-1b', blocks: new Set(['E','AN']) },
      { archId: 'tv-arch-2',  svgId: 'tv-nn-svg-2',  blocks: new Set(['E','AN','AQ','AC','AO']) },
      { archId: 'tv-arch-3',  svgId: 'tv-nn-svg-3',  blocks: new Set(['E','AN','AQ','AC','AO','MN','MF','MR']) },
      { archId: 'tv-arch-4',     svgId: 'tv-nn-svg-4',     blocks: new Set(['E','AN','AQ','AC','AO','MN','MF','MR','OL','OS']) },
      { archId: 'tv-arch-train', svgId: 'tv-nn-svg-train', blocks: new Set(['E','AN','AQ','AC','AO','MN','MF','MR','OL','OS']) },
    ];
    let archColumnsBuilt = false;

    // Group block ids into stages, like the Karpathy-microgpt reference diagram
    const STAGES = [
      { id: 'EMB',  label: 'Embedding',      blocks: ['E'] },
      { id: 'ATTN', label: 'Self-Attention', blocks: ['AN','AQ','AC','AO'] },
      { id: 'MLP',  label: 'MLP',            blocks: ['MN','MF','MR'] },
      { id: 'OUT',  label: 'Output',         blocks: ['OL','OS'] },
    ];

    function buildArchColumn(widget) {
      const c = document.getElementById(widget.archId);
      if (!c) return;
      c.innerHTML = '<div class="tv-arch-label">Architecture</div>';

      // Render each stage that has at least one block in this widget
      const visibleStages = STAGES
        .map(stage => ({
          stage,
          blocks: ALL_TV_BLOCKS.filter(b => stage.blocks.includes(b.id) && widget.blocks.has(b.id)),
        }))
        .filter(g => g.blocks.length > 0);

      visibleStages.forEach((g, gi) => {
        const stageEl = document.createElement('div');
        stageEl.className = 'tv-arch-stage';
        stageEl.dataset.stage = g.stage.id;
        const stageLabel = document.createElement('div');
        stageLabel.className = 'tv-arch-stage-label';
        stageLabel.textContent = g.stage.label;
        stageEl.appendChild(stageLabel);

        g.blocks.forEach((b, i) => {
          const block = document.createElement('div');
          block.className = 'tv-arch-block';
          block.dataset.block = b.id;
          block.dataset.color = b.color;
          block.innerHTML = b.name + (b.sub ? `<span class="tvdesc">${b.sub}</span>` : '');
          stageEl.appendChild(block);
          if (i < g.blocks.length - 1) {
            const arrow = document.createElement('div');
            arrow.className = 'tv-arrow';
            arrow.textContent = '↓';
            stageEl.appendChild(arrow);
          }
        });
        c.appendChild(stageEl);

        // Inter-stage arrow (sits outside any colored band)
        if (gi < visibleStages.length - 1) {
          const arrow = document.createElement('div');
          arrow.className = 'tv-arrow tv-arrow-inter';
          arrow.textContent = '↓';
          c.appendChild(arrow);
        }
      });
    }

    // --- Neural-network rendering (linked side-by-side view, per widget) ---
    function renderNN(s, widget) {
      const svg = document.getElementById(widget.svgId);
      if (!svg) return;
      const allowed = widget.blocks;
      const NS = 'http://www.w3.org/2000/svg';
      svg.innerHTML = '';
      function el(name, attrs, parent, text) {
        const e = document.createElementNS(NS, name);
        for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
        if (text !== undefined) e.textContent = text;
        if (parent) parent.appendChild(e);
        return e;
      }
      const cx = 190;
      const R = 11;

      // Helper: create a layer group with neurons at row(y, vals, opts) — returns positions
      function makeLayer(yc, vals, blockId, opts) {
        opts = opts || {};
        const n = vals.length;
        const spacing = opts.spacing || 32;
        const groups = opts.groups || 1; // for QKV-style, split into groups separated by gap
        const startX = opts.cxOverride !== undefined ? opts.cxOverride : (cx - ((n - 1) * spacing) / 2);
        const positions = [];
        // Top-level layer group, with data-block for hover linking
        const g = el('g', { class: 'layer', 'data-block': blockId }, svg);
        // Placeholder background highlight rect — sized once we know cell positions
        const bgRect = el('rect', { class: 'layer-bg', x: 4, y: yc - R - 8, width: 1, height: 2 * R + 16, rx: 6 }, g);
        const kind = opts.kind || 'neuron'; // 'neuron' = circle, 'cell' = data rectangle
        vals.forEach((v, i) => {
          let x;
          if (opts.groups) {
            const groupSize = n / opts.groups;
            const gIdx = Math.floor(i / groupSize);
            const inGroupIdx = i % groupSize;
            const groupGap = opts.groupGap || 22;
            const groupW = (groupSize - 1) * spacing;
            const totalW = groups * groupW + (groups - 1) * groupGap;
            const startGX = cx - totalW / 2;
            x = startGX + gIdx * (groupW + groupGap) + inGroupIdx * spacing;
          } else {
            x = startX + i * spacing;
          }
          positions.push({ x, y: yc });
          const cls = v > 0.05 ? 'pos' : (v < -0.05 ? 'neg' : 'zero');
          if (kind === 'cell') {
            // Rectangle for vector data (not a learned-weight neuron)
            const cw = 30, ch = 22;
            el('rect', {
              x: x - cw / 2, y: yc - ch / 2,
              width: cw, height: ch, rx: 3,
              class: 'nn-data-cell ' + cls,
            }, g);
          } else {
            el('circle', { cx: x, cy: yc, r: R, class: 'nn-neuron-circle ' + cls }, g);
          }
          el('text', { x: x, y: yc + 3, class: 'nn-neuron-label' }, g, v.toFixed(2));
        });
        // Size the bg rect to wrap the actual cells (plus the left-side label if any),
        // so two layers sharing a y don't overlap each other on hover-highlight.
        if (positions.length) {
          const half = kind === 'cell' ? 17 : 13;
          const minX = Math.min(...positions.map(p => p.x)) - half;
          const maxX = Math.max(...positions.map(p => p.x)) + half;
          const bgX = opts.name ? 4 : minX - 4;
          const bgW = maxX - bgX + 4;
          bgRect.setAttribute('x', bgX);
          bgRect.setAttribute('width', bgW);
        }
        // Layer name (left side)
        if (opts.name) {
          el('text', { x: 10, y: yc + 3, class: 'layer-name' }, g, opts.name);
        }
        return { positions, group: g };
      }

      // Helper: draw edges between two positions arrays with a weight matrix (Wmat[i][j] = weight from j-th source to i-th dest)
      function drawEdges(src, dst, Wmat, parent, residual) {
        for (let i = 0; i < dst.positions.length; i++) {
          for (let j = 0; j < src.positions.length; j++) {
            const w = Wmat ? Wmat[i][j] : 1;
            if (!Wmat && i !== j) continue; // 1:1 edges (no weight matrix) only connect same index
            const cls = w > 0 ? 'pos' : 'neg';
            const opacity = Wmat ? Math.min(0.85, 0.15 + Math.abs(w) * 0.8) : 0.6;
            const sw = Wmat ? (0.5 + Math.min(1.8, Math.abs(w) * 1.5)) : 1.0;
            el('line', {
              x1: src.positions[j].x, y1: src.positions[j].y + R,
              x2: dst.positions[i].x, y2: dst.positions[i].y - R,
              class: 'nn-edge' + (Wmat ? ' ' + cls : '') + (residual ? ' residual' : ''),
              'stroke-opacity': opacity, 'stroke-width': sw,
            }, parent);
          }
        }
      }

      // Y positions
      const Y = {
        x: 36, plusOp: 90, xPos: 144,
        norm_attn: 210,
        qkv: 284,
        scores: 360, weights: 412, attnPre: 484,
        attnOut: 556, postAttn: 620,
        norm_mlp: 690,
        hRelu: 762,
        mlpOut: 830,
      };

      // Track the range of Y values used so we can size the viewBox
      const usedYs = [];
      let Lx, Lwpe, LxPos, Lnorm, Lqkv, Lscores, Lweights, LattnPre, LattnOut, LpostAttn, LnormMlp, LhRelu, LmlpOut, Lfinal, Llogits, Lprobs;

      // Block E — x_token and wpe both feed into a ⊕ adder, output is x + wpe
      if (allowed.has('E')) {
        // Two side-by-side cell pairs at the top: token row on the left, wpe row on the right.
        // makeLayer's cxOverride is the startX (left edge of first cell), so for 2 cells
        // with spacing 32, center C means cxOverride = C - 16.
        const xCenter = 100, wpeCenter = 280, sumCenter = 190;
        Lx  = makeLayer(Y.x, s.x,    'E', { kind: 'cell', cxOverride: xCenter - 16 });
        Lwpe = makeLayer(Y.x, W.wpe, 'E', { kind: 'cell', cxOverride: wpeCenter - 16 });
        // Manual labels above each column
        el('text', { x: xCenter,   y: Y.x - 18, class: 'layer-name', 'text-anchor': 'middle', 'data-block': 'E' }, svg, 'x = wte[id]');
        el('text', { x: wpeCenter, y: Y.x - 18, class: 'layer-name', 'text-anchor': 'middle', 'data-block': 'E' }, svg, 'wpe[pos=' + POS + ']');

        // Output row (x + wpe) centered below the adder
        LxPos = makeLayer(Y.xPos, s.x_pos, 'E', { kind: 'cell', cxOverride: sumCenter - 16 });
        el('text', { x: sumCenter, y: Y.xPos + 26, class: 'layer-name', 'text-anchor': 'middle', 'data-block': 'E' }, svg, 'x + wpe');

        // ⊕ operator in the middle
        const opG = el('g', { class: 'layer', 'data-block': 'E' }, svg);
        el('rect', { class: 'layer-bg', x: 4, y: Y.plusOp - 22, width: 372, height: 44, rx: 6 }, opG);
        el('circle', { cx: sumCenter, cy: Y.plusOp, r: 14, class: 'nn-op-circle' }, opG);
        el('text', { x: sumCenter, y: Y.plusOp + 5, class: 'nn-op-label' }, opG, '+');

        // Edges: every input cell → ⊕ ; ⊕ → every output cell
        function lineTo(p1x, p1y, p2x, p2y, parent) {
          el('line', {
            x1: p1x, y1: p1y, x2: p2x, y2: p2y,
            class: 'nn-edge', 'stroke-opacity': 0.7, 'stroke-width': 1.1,
          }, parent || svg);
        }
        Lx.positions.forEach(p => lineTo(p.x, p.y + 11, sumCenter - 10, Y.plusOp - 10));
        Lwpe.positions.forEach(p => lineTo(p.x, p.y + 11, sumCenter + 10, Y.plusOp - 10));
        LxPos.positions.forEach(p => lineTo(sumCenter, Y.plusOp + 14, p.x, p.y - 11));

        usedYs.push(Y.x - 18, Y.xPos + 30);
      }

      // Block AN — normalized data (no learned weights)
      if (allowed.has('AN')) {
        Lnorm = makeLayer(Y.norm_attn, s.x_norm_attn, 'AN', { name: 'x̂ (norm)', kind: 'cell' });
        if (LxPos) drawEdges(LxPos, Lnorm, null, svg, false);
        usedYs.push(Y.norm_attn);
      }

      // Block AQ: 6 neurons (q, k, v as 3 groups of 2)
      if (allowed.has('AQ')) {
        const qkvVals = [...s.q, ...s.k, ...s.v];
        Lqkv = makeLayer(Y.qkv, qkvVals, 'AQ', { name: 'Q | K | V', groups: 3, spacing: 26, groupGap: 24 });
        // Group labels (Q / K / V) above each pair so it's obvious the 6 nodes
        // are three 2-vectors, not one 6-vector.
        ['Q', 'K', 'V'].forEach((tag, gi) => {
          const pair = Lqkv.positions.slice(gi * 2, gi * 2 + 2);
          const midX = (pair[0].x + pair[1].x) / 2;
          el('text', {
            x: midX, y: Y.qkv - 20,
            class: 'layer-name nn-group-tag',
            'text-anchor': 'middle',
            'data-block': 'AQ',
          }, Lqkv.group, tag);
        });
        if (Lnorm) {
          for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 2; j++) {
              let w;
              const proj = Math.floor(i / 2);
              const within = i % 2;
              if (proj === 0) w = W.Wq[within][j];
              else if (proj === 1) w = W.Wk[within][j];
              else w = W.Wv[within][j];
              el('line', {
                x1: Lnorm.positions[j].x, y1: Lnorm.positions[j].y + R,
                x2: Lqkv.positions[i].x, y2: Lqkv.positions[i].y - R,
                class: 'nn-edge ' + (w > 0 ? 'pos' : 'neg'),
                'stroke-opacity': Math.min(0.85, 0.15 + Math.abs(w) * 0.8),
                'stroke-width': 0.5 + Math.min(1.8, Math.abs(w) * 1.5),
              }, Lqkv.group);
            }
          }
        }
        usedYs.push(Y.qkv);
      }

      // Block AC: scores → weights → attn_pre (computed quantities, not neurons)
      if (allowed.has('AC')) {
        // ----- K and V cache side panels (right of main column) -----
        // Each cache: 3 rows × 2 cells, anchored next to the Q|K|V row.
        // Position 0/1 come from the pinned past (W.cacheK / W.cacheV), position 2
        // is the current token's k/v that we just computed at Y.qkv.
        const cacheX_K = 410;
        const cacheX_V = 520;
        const cacheW   = 92;
        const cacheRowH = 30;
        const cacheH   = 3 * cacheRowH + 14;
        const cacheTopY = Y.qkv - 10;
        const allK = [W.cacheK[0], W.cacheK[1], s.k];
        const allV = [W.cacheV[0], W.cacheV[1], s.v];

        function makeCachePanel(boxX, label, rows) {
          const g = el('g', { class: 'layer', 'data-block': 'AC' }, svg);
          el('rect', { x: boxX, y: cacheTopY, width: cacheW, height: cacheH, rx: 4, class: 'kvc-box' }, g);
          el('text', { x: boxX + cacheW / 2, y: cacheTopY - 5, class: 'kvc-title', 'text-anchor': 'middle' }, g, label);
          for (let p = 0; p < 3; p++) {
            const rowY = cacheTopY + 8 + p * cacheRowH;
            const isCurrent = (p === 2);
            if (isCurrent) {
              el('rect', { x: boxX + 2, y: rowY - 3, width: cacheW - 4, height: cacheRowH - 4, rx: 3, class: 'kvc-row-current' }, g);
            }
            // Two cells per row
            for (let i = 0; i < 2; i++) {
              const v = rows[p][i];
              const cls = v > 0.05 ? 'pos' : (v < -0.05 ? 'neg' : 'zero');
              const cellW = 26, cellH = 18;
              const cellX = boxX + 6 + i * (cellW + 2);
              el('rect', { x: cellX, y: rowY, width: cellW, height: cellH, rx: 2, class: 'nn-data-cell ' + cls }, g);
              el('text', { x: cellX + cellW / 2, y: rowY + 13, class: 'kvc-cell-text', 'text-anchor': 'middle' }, g, v.toFixed(2));
            }
            el('text', { x: boxX + cacheW - 4, y: rowY + 13, class: 'kvc-pos', 'text-anchor': 'end' }, g, 'p' + p);
          }
          return g;
        }
        makeCachePanel(cacheX_K, 'K cache', allK);
        makeCachePanel(cacheX_V, 'V cache', allV);
        usedYs.push(cacheTopY, cacheTopY + cacheH);

        Lscores = makeLayer(Y.scores, s.scores, 'AC', { name: 'scores', kind: 'cell' });
        Lweights = makeLayer(Y.weights, s.attn_w, 'AC', { name: 'w (softmax)', kind: 'cell' });
        LattnPre = makeLayer(Y.attnPre, s.attn_pre_o, 'AC', { name: 'Σ wₜ vₜ', kind: 'cell' });
        // Q → scores
        if (Lqkv) {
          for (let i = 0; i < 2; i++) {
            for (let j = 0; j < Lscores.positions.length; j++) {
              el('line', {
                x1: Lqkv.positions[i].x, y1: Lqkv.positions[i].y + R,
                x2: Lscores.positions[j].x, y2: Lscores.positions[j].y - R,
                class: 'nn-edge residual',
                'stroke-opacity': 0.35, 'stroke-width': 0.8,
              }, Lscores.group);
            }
          }
        }
        drawEdges(Lscores, Lweights, null, svg, false);
        for (let i = 0; i < Lweights.positions.length; i++) {
          for (let j = 0; j < LattnPre.positions.length; j++) {
            el('line', {
              x1: Lweights.positions[i].x, y1: Lweights.positions[i].y + R,
              x2: LattnPre.positions[j].x, y2: LattnPre.positions[j].y - R,
              class: 'nn-edge',
              'stroke-opacity': 0.4, 'stroke-width': 0.9,
            }, LattnPre.group);
          }
        }
        if (Lqkv) {
          for (let i = 0; i < 2; i++) {
            const v = Lqkv.positions[4 + i];
            const target = LattnPre.positions[i];
            el('path', {
              d: `M ${v.x} ${v.y + R} C ${v.x - 35} ${(v.y + target.y) / 2}, ${target.x - 35} ${(v.y + target.y) / 2}, ${target.x} ${target.y - R}`,
              class: 'nn-edge residual',
              'stroke-opacity': 0.35, 'stroke-width': 0.8,
            }, LattnPre.group);
          }
        }
        usedYs.push(Y.scores, Y.weights, Y.attnPre);
      }

      // Block AO: attn_out (learned Wₒ → neurons) then post_attn (residual sum → cell)
      if (allowed.has('AO')) {
        LattnOut = makeLayer(Y.attnOut, s.attn_out, 'AO', { name: 'Wₒ output' });
        if (LattnPre) drawEdges(LattnPre, LattnOut, W.Wo, svg, false);
        LpostAttn = makeLayer(Y.postAttn, s.x_post_attn, 'AO', { name: '+ residual', kind: 'cell' });
        drawEdges(LattnOut, LpostAttn, null, svg, false);
        // Residual edge from x_pos → post_attn
        if (LxPos) {
          for (let j = 0; j < 2; j++) {
            el('path', {
              d: `M ${LxPos.positions[j].x} ${LxPos.positions[j].y + R} C 365 ${LxPos.positions[j].y + R}, 365 ${LpostAttn.positions[j].y - R}, ${LpostAttn.positions[j].x + R + 2} ${LpostAttn.positions[j].y}`,
              class: 'nn-edge residual',
              'stroke-opacity': 0.5,
            }, svg);
          }
        }
        usedYs.push(Y.attnOut, Y.postAttn);
      }

      // Block MN — normalized data
      if (allowed.has('MN')) {
        LnormMlp = makeLayer(Y.norm_mlp, s.x_norm_mlp, 'MN', { name: 'x̂ (norm)', kind: 'cell' });
        if (LpostAttn) drawEdges(LpostAttn, LnormMlp, null, svg, false);
        usedYs.push(Y.norm_mlp);
      }

      // Block MF: fc1+ReLU → fc2
      if (allowed.has('MF')) {
        LhRelu = makeLayer(Y.hRelu, s.h_relu, 'MF', { name: 'fc1 + ReLU', spacing: 24 });
        if (LnormMlp) drawEdges(LnormMlp, LhRelu, W.fc1, svg, false);
        LmlpOut = makeLayer(Y.mlpOut, s.mlp_out, 'MF', { name: 'fc2' });
        drawEdges(LhRelu, LmlpOut, W.fc2, svg, false);
        usedYs.push(Y.hRelu, Y.mlpOut);
      }

      // Block MR: + residual = x_final
      if (allowed.has('MR')) {
        const Y_FINAL = 898;
        Lfinal = makeLayer(Y_FINAL, s.x_final, 'MR', { name: 'final (+ res)', kind: 'cell' });
        if (LmlpOut) drawEdges(LmlpOut, Lfinal, null, svg, false);
        if (LpostAttn) {
          for (let j = 0; j < 2; j++) {
            el('path', {
              d: `M ${LpostAttn.positions[j].x} ${LpostAttn.positions[j].y + R} C 10 ${LpostAttn.positions[j].y + R}, 10 ${Lfinal.positions[j].y - R}, ${Lfinal.positions[j].x - R - 2} ${Lfinal.positions[j].y}`,
              class: 'nn-edge residual',
              'stroke-opacity': 0.5,
            }, svg);
          }
        }
        usedYs.push(Y_FINAL);
      }

      // Block OL: lm_head logits — final x_final dotted with each row of lm_head.
      // Drawn as neurons (circles) because the logits are the output of a learned linear projection.
      if (allowed.has('OL')) {
        const Y_LOGITS = 982;
        Llogits = makeLayer(Y_LOGITS, s.logits, 'OL', { name: 'logits (lm_head)' });
        if (Lfinal) {
          for (let i = 0; i < TOY_LM_HEAD.length; i++) {
            for (let j = 0; j < 2; j++) {
              const w = TOY_LM_HEAD[i][j];
              el('line', {
                x1: Lfinal.positions[j].x, y1: Lfinal.positions[j].y + R,
                x2: Llogits.positions[i].x, y2: Llogits.positions[i].y - R,
                class: 'nn-edge ' + (w > 0 ? 'pos' : 'neg'),
                'stroke-opacity': Math.min(0.85, 0.15 + Math.abs(w) * 0.8),
                'stroke-width': 0.5 + Math.min(1.8, Math.abs(w) * 1.5),
              }, Llogits.group);
            }
          }
        }
        usedYs.push(Y_LOGITS);
      }

      // Block OS: softmax over the logits → next-letter probability distribution
      if (allowed.has('OS')) {
        const Y_PROBS = 1058;
        Lprobs = makeLayer(Y_PROBS, s.out_probs, 'OS', { name: 'softmax probs' });
        if (Llogits) drawEdges(Llogits, Lprobs, null, svg, false);
        // Vocab labels (BOS, 'a', 'b', 'c') below each prob cell
        Lprobs.positions.forEach((p, i) => {
          el('text', {
            x: p.x, y: p.y + 24, class: 'layer-name nn-group-tag',
            'text-anchor': 'middle', 'data-block': 'OS',
          }, Lprobs.group, VOCAB_LABELS[i]);
        });
        usedYs.push(Y_PROBS + 24);
      }

      // Size the viewBox to fit only the rendered content. Widgets that show the
      // K/V cache panels need a wider viewBox to fit them on the right side.
      if (usedYs.length) {
        const yMin = Math.min(...usedYs) - 30;
        const yMax = Math.max(...usedYs) + 30;
        const vbW = allowed.has('AC') ? 620 : 380;
        svg.setAttribute('viewBox', `0 ${yMin} ${vbW} ${yMax - yMin}`);
        const maxH = Math.min(960, yMax - yMin) + 'px';
        svg.style.maxHeight = maxH;
      }
    }

    // --- Code snippets that map to each block ID ---
    const CODE_FOR_BLOCK = {
      E:  { name: 'Embeddings', meta: 'state_dict: wte, wpe',
        code: `# Token-embedding and position-embedding lookups (each length 16)
tok_emb = state_dict['wte'][token_id]
pos_emb = state_dict['wpe'][pos_id]

# Combine — x carries both "what" (token) and "where" (position)
x = [t + p for t, p in zip(tok_emb, pos_emb)]
x = rmsnorm(x)` },
      AN: { name: 'RMSNorm — pre-attention', meta: 'no learned params',
        code: `# Save the input as the residual, then normalize
x_residual = x
x = rmsnorm(x)` },
      AQ: { name: 'Linear projections — Q, K, V', meta: 'state_dict: attn_wq · attn_wk · attn_wv',
        code: `# Three matrix-vector products: x → q, k, v  (each length 16)
q = linear(x, state_dict[f'layer{li}.attn_wq'])
k = linear(x, state_dict[f'layer{li}.attn_wk'])
v = linear(x, state_dict[f'layer{li}.attn_wv'])

# Append current k, v to the KV cache for this layer
keys[li].append(k)
values[li].append(v)` },
      AC: { name: 'Attention — scores · softmax · weighted sum of V', meta: 'no learned params (just arithmetic)',
        code: `for h in range(n_head):
    hs = h * head_dim
    q_h = q[hs:hs+head_dim]
    k_h = [ki[hs:hs+head_dim] for ki in keys[li]]
    v_h = [vi[hs:hs+head_dim] for vi in values[li]]

    # Scores: q · kₜ / √d_head  for every cached position t
    attn_logits = [
        sum(q_h[j] * k_h[t][j] for j in range(head_dim)) / head_dim**0.5
        for t in range(len(k_h))
    ]

    # Softmax → attention weights, summing to 1
    attn_weights = softmax(attn_logits)

    # Weighted sum of value vectors
    head_out = [
        sum(attn_weights[t] * v_h[t][j] for t in range(len(v_h)))
        for j in range(head_dim)
    ]
    x_attn.extend(head_out)` },
      AO: { name: 'Linear Wₒ + residual', meta: 'state_dict: attn_wo',
        code: `# Mix the per-head outputs back into the residual stream
x = linear(x_attn, state_dict[f'layer{li}.attn_wo'])
x = [a + b for a, b in zip(x, x_residual)]` },
      MN: { name: 'RMSNorm — pre-MLP', meta: 'no learned params',
        code: `# Save the new residual (the post-attention stream), then normalize
x_residual = x
x = rmsnorm(x)` },
      MF: { name: 'MLP — fc1 · ReLU · fc2', meta: 'state_dict: mlp_fc1, mlp_fc2',
        code: `# Project up 4×, apply ReLU, then project back down
x = linear(x, state_dict[f'layer{li}.mlp_fc1'])   # 16 → 64
x = [xi.relu() for xi in x]
x = linear(x, state_dict[f'layer{li}.mlp_fc2'])   # 64 → 16` },
      MR: { name: 'Residual add — block output', meta: 'no learned params',
        code: `# Add the MLP output back into the residual stream
x = [a + b for a, b in zip(x, x_residual)]
# This x is the input to the next Transformer block (or to lm_head if it's the last layer).` },
      OL: { name: 'lm_head — final → logits', meta: 'state_dict: lm_head',
        code: `# Final block output → vocabulary logits (one per token in the vocab)
logits = linear(x, state_dict['lm_head'])   # length vocab_size (27 in real microgpt, 4 in our toy)
return logits` },
      OS: { name: 'softmax — logits → next-letter probabilities', meta: 'not in gpt() — applied externally during sampling',
        code: `# Convert logits into a probability distribution
probs = softmax(logits)
# probs[i] is the model's predicted probability that token i comes next.
# At inference time you sample from this distribution (with temperature, top-k, etc.).` },
    };

    function escapeHtml(s) {
      return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    function showCodeForBlock(blk) {
      const info = CODE_FOR_BLOCK[blk];
      const nameEl = document.getElementById('tvc-block-name');
      const metaEl = document.getElementById('tvc-block-meta');
      const contentEl = document.getElementById('tvc-content');
      if (!info) {
        nameEl.textContent = 'hover or click any block';
        metaEl.textContent = '';
        contentEl.innerHTML = '<div class="tvc-placeholder">Hover an architecture block on the left, a layer in the neural-network drawing, or a row in the numeric tour below — the matching microgpt lines will appear here. Click to pin.</div>';
        return;
      }
      nameEl.textContent = info.name;
      metaEl.textContent = info.meta || '';
      contentEl.innerHTML = `<pre><code class="language-python">${escapeHtml(info.code)}</code></pre>`;
      if (window.Prism) window.Prism.highlightAllUnder(contentEl);
    }

    // --- Cross-view hover highlighting + code panel ---
    let pinnedBlock = null;
    function bindBlockHover() {
      // Re-bind every render since the inner HTML is replaced
      const all = document.querySelectorAll('[data-block]');
      all.forEach((el) => {
        if (el.__bound) return;
        el.__bound = true;
        // Only blocks inside the widget that OWNS the code panel should drive code-panel updates.
        // Otherwise hovering a block in (e.g.) viz-tv-4 would scroll/reflow the panel in viz-tv-3.
        const owningViz = el.closest('.viz');
        const drivesCodePanel = !!(owningViz && owningViz.querySelector('.three-views-code'));
        el.addEventListener('mouseenter', () => {
          const blk = el.dataset.block;
          document.querySelectorAll(`[data-block="${blk}"]`).forEach((e) => e.classList.add('block-hl'));
          if (drivesCodePanel && !pinnedBlock) showCodeForBlock(blk);
        });
        el.addEventListener('mouseleave', () => {
          const blk = el.dataset.block;
          document.querySelectorAll(`[data-block="${blk}"]`).forEach((e) => e.classList.remove('block-hl'));
          if (drivesCodePanel && !pinnedBlock) showCodeForBlock(null);
        });
        el.addEventListener('click', (ev) => {
          if (!drivesCodePanel) return;
          const blk = el.dataset.block;
          const panel = document.getElementById('three-views-code');
          if (pinnedBlock === blk) {
            // unpin
            pinnedBlock = null;
            if (panel) panel.classList.remove('pinned');
            showCodeForBlock(blk);
          } else {
            pinnedBlock = blk;
            if (panel) panel.classList.add('pinned');
            showCodeForBlock(blk);
          }
          ev.stopPropagation();
        });
      });
    }

    // Toy wte for the token picker — must match the values listed in the HTML
    // picker buttons and the architecture-section "Toy walkthrough" callouts.
    const TOY_WTE = [
      [ 0.20,  0.30],  // BOS
      [ 0.50, -0.10],  // 'a'
      [-0.30,  0.40],  // 'b'
      [ 0.10,  0.20],  // 'c'
    ];
    const TOK_LABELS = ['BOS', "'a'", "'b'", "'c'"];

    function setInputFromToken(tokId) {
      const row = TOY_WTE[tokId];
      const x0 = document.getElementById('num-x0');
      const x1 = document.getElementById('num-x1');
      x0.value = row[0];
      x1.value = row[1];
      render();
      // Highlight active button + update readout on EVERY picker on the page.
      const fmt = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
      document.querySelectorAll('.token-picker').forEach(picker => {
        picker.querySelectorAll('.tp-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.token, 10) === tokId);
        });
        const ro = picker.querySelector('.tp-readout');
        if (ro) ro.textContent = `token_id = ${tokId} → x = wte[${tokId}] = [${fmt(row[0])}, ${fmt(row[1])}]`;
      });
      // Reflect the choice in every sequence-context strip
      document.querySelectorAll('.ss-current-name').forEach(el => {
        el.textContent = TOK_LABELS[tokId];
      });
    }

    // When the user drags sliders manually, clear the picker's active state
    function clearPickerActive() {
      const pickers = document.querySelectorAll('.token-picker');
      if (!pickers.length) return;
      const x0 = parseFloat(document.getElementById('num-x0').value);
      const x1 = parseFloat(document.getElementById('num-x1').value);
      let match = -1;
      for (let i = 0; i < TOY_WTE.length; i++) {
        if (Math.abs(TOY_WTE[i][0] - x0) < 1e-3 && Math.abs(TOY_WTE[i][1] - x1) < 1e-3) {
          match = i; break;
        }
      }
      const fmt = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
      const readoutText = match >= 0
        ? `token_id = ${match} → x = wte[${match}] = [${fmt(x0)}, ${fmt(x1)}]`
        : `off-vocabulary x = [${fmt(x0)}, ${fmt(x1)}] (slider override)`;
      pickers.forEach(picker => {
        picker.querySelectorAll('.tp-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.token, 10) === match);
        });
        const ro = picker.querySelector('.tp-readout');
        if (ro) ro.textContent = readoutText;
      });
      if (match >= 0) {
        document.querySelectorAll('.ss-current-name').forEach(el => {
          el.textContent = TOK_LABELS[match];
        });
      }
    }

    document.getElementById('num-x0').addEventListener('input', () => { render(); clearPickerActive(); });
    document.getElementById('num-x1').addEventListener('input', () => { render(); clearPickerActive(); });
    document.getElementById('num-rand').addEventListener('click', () => {
      regen(Math.floor(Math.random() * 1e6));
      render();
    });
    document.getElementById('num-reset').addEventListener('click', () => {
      setInputFromToken(2);  // back to 'b'
    });

    // Wire up EVERY token picker on the page (one per "block so far" widget).
    document.querySelectorAll('.token-picker').forEach(picker => {
      picker.querySelectorAll('.tp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          setInputFromToken(parseInt(btn.dataset.token, 10));
        });
      });
    });

    render();

    /* -------------------------------------------------------------- */
    /*  Attention-flow interactive diagram (separate widget)          */
    /* -------------------------------------------------------------- */
    (function initAttnFlow() {
      const root = document.getElementById('viz-attn-flow');
      if (!root) return;
      const svg = document.getElementById('af-svg');
      const stepLabelEl = document.getElementById('af-step-label');
      const formulaEl = document.getElementById('af-formula');
      const playBtn = document.getElementById('af-play');
      const stepBtn = document.getElementById('af-step');
      const backBtn = document.getElementById('af-back');
      const resetBtn = document.getElementById('af-reset');
      if (!svg || !stepLabelEl || !formulaEl) return;

      // ----- Precompute toy values (matches the Toy walkthrough callout) -----
      const x_tok = TOY_WTE[2];                   // 'b'
      const wpe2  = TOY_WPE_TABLE[2];             // pos 2
      const x_pos = vecAdd(x_tok, wpe2);
      const x_norm = rmsnorm(x_pos);
      const q = matvec(TOY_W.Wq, x_norm);          // ≈ [-0.22, 0.35]
      const k_cur = matvec(TOY_W.Wk, x_norm);      // ≈ [-0.37, 0.37]
      const v_cur = matvec(TOY_W.Wv, x_norm);      // ≈ [-0.24, 0.84]
      const cacheK_full = [TOY_W.cacheK[0], TOY_W.cacheK[1], k_cur];
      const cacheV_full = [TOY_W.cacheV[0], TOY_W.cacheV[1], v_cur];
      const sqrtDH = Math.sqrt(2);
      const rawDots = cacheK_full.map(ki => q[0] * ki[0] + q[1] * ki[1]);
      const scores = rawDots.map(d => d / sqrtDH);
      const weights = softmaxArr(scores);
      // Running partial weighted sums (per phase): partials[i] = Σ_{t≤i} w_t · v_t
      const partials = [];
      let acc = [0, 0];
      for (let i = 0; i < 3; i++) {
        acc = [acc[0] + weights[i] * cacheV_full[i][0],
               acc[1] + weights[i] * cacheV_full[i][1]];
        partials.push([acc[0], acc[1]]);
      }
      const output = partials[2];

      const f = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
      const fmtTerm = v => v < 0 ? `(${f(v)})` : f(v);
      const cellCls = v => v > 0.005 ? 'pos' : (v < -0.005 ? 'neg' : 'zero');

      // ----- Layout constants -----
      const LAY = {
        // Top row: Q | K | V circles
        topY: 75, rTop: 25,
        qcx0: 105, qcx1: 175, qLabelX: 140,
        kcx0: 405, kcx1: 475, kLabelX: 440,
        vcx0: 705, vcx1: 775, vLabelX: 740,
        // Caches (centered under K and V groups)
        kBoxX: 345, kBoxW: 190,
        vBoxX: 645, vBoxW: 190,
        cacheY: 140, cacheH: 165, cacheTopPad: 18,
        rowH: 48,
        // Score boxes (dot products + scaling) — placed to the LEFT of K cache
        scoreBoxW: 110, scoreBoxH: 60, scoreY: 345,
        scoreCx: [80, 200, 320],
        // Softmax
        softmaxCx: 200, softmaxCy: 445, softmaxRx: 70, softmaxRy: 22,
        // Weights row (aligned with score boxes)
        weightCellW: 70, weightCellH: 40, weightY: 488,
        // Weighted sum box (lives to the right, under the V cache)
        sumBoxX: 500, sumBoxY: 555, sumBoxW: 320, sumBoxH: 80,
        // Output cells (under sum box)
        outY: 670, outCellW: 70, outCellH: 40,
        outCx: 660,
      };

      // ----- Phase metadata -----
      const PHASES = [
        {
          name: 'Reset — caches hold past tokens',
          formula: `<div class="af-fm-title">Setup</div>The current token is <code>'b'</code> at position 2. Layer 0's KV cache already contains <code>k</code> and <code>v</code> for positions 0 (BOS) and 1 ('a') from earlier forward passes. The current token's <code>q</code>, <code>k</code>, <code>v</code> have not been computed yet.`,
        },
        {
          name: 'Compute q, k, v for the current token',
          formula: `<div class="af-fm-title">Project x̂ → q, k, v</div><code>q = Wq · x̂  =  [${f(q[0])}, ${f(q[1])}]</code><br><code>k = Wk · x̂  =  [${f(k_cur[0])}, ${f(k_cur[1])}]</code><br><code>v = Wv · x̂  =  [${f(v_cur[0])}, ${f(v_cur[1])}]</code><br>Each projection is a 2×2 matrix times the normalized input vector x̂ ≈ [−0.88, 1.10].`,
        },
        {
          name: 'Append k and v to the KV caches',
          formula: `<div class="af-fm-title">cache append</div>The new <code>k</code> slots in at <code>keys[0][2]</code>; the new <code>v</code> at <code>values[0][2]</code>. The cache now has <strong>3 rows</strong>, one per token seen so far. <em>q is NOT cached</em> — each new token computes a fresh query, but it needs to attend to every past <code>k</code> / <code>v</code>.`,
        },
        {
          name: 'Score s₀ = q · k₀ / √2 (attend to BOS)',
          formula: `<div class="af-fm-title">dot product, position 0</div><code>s₀ = (q[0]·k₀[0] + q[1]·k₀[1]) / √2</code><br>= (${fmtTerm(q[0])}·${fmtTerm(cacheK_full[0][0])} + ${fmtTerm(q[1])}·${fmtTerm(cacheK_full[0][1])}) / 1.41<br>= (${fmtTerm(q[0]*cacheK_full[0][0])} + ${fmtTerm(q[1]*cacheK_full[0][1])}) / 1.41<br>= ${fmtTerm(rawDots[0])} / 1.41  =  <em>${f(scores[0])}</em>`,
        },
        {
          name: 'Score s₁ = q · k₁ / √2 (attend to "a")',
          formula: `<div class="af-fm-title">dot product, position 1</div><code>s₁ = (q[0]·k₁[0] + q[1]·k₁[1]) / √2</code><br>= (${fmtTerm(q[0])}·${fmtTerm(cacheK_full[1][0])} + ${fmtTerm(q[1])}·${fmtTerm(cacheK_full[1][1])}) / 1.41<br>= (${fmtTerm(q[0]*cacheK_full[1][0])} + ${fmtTerm(q[1]*cacheK_full[1][1])}) / 1.41<br>= ${fmtTerm(rawDots[1])} / 1.41  =  <em>${f(scores[1])}</em>`,
        },
        {
          name: 'Score s₂ = q · k₂ / √2 (attend to itself)',
          formula: `<div class="af-fm-title">dot product, position 2</div><code>s₂ = (q[0]·k₂[0] + q[1]·k₂[1]) / √2</code><br>= (${fmtTerm(q[0])}·${fmtTerm(cacheK_full[2][0])} + ${fmtTerm(q[1])}·${fmtTerm(cacheK_full[2][1])}) / 1.41<br>= (${fmtTerm(q[0]*cacheK_full[2][0])} + ${fmtTerm(q[1]*cacheK_full[2][1])}) / 1.41<br>= ${fmtTerm(rawDots[2])} / 1.41  =  <em>${f(scores[2])}</em>`,
        },
        {
          name: 'Softmax — turn scores into weights',
          formula: `<div class="af-fm-title">softmax(s)</div><code>w = softmax([${f(scores[0])}, ${f(scores[1])}, ${f(scores[2])}])</code><br>= [<em>${f(weights[0])}</em>, <em>${f(weights[1])}</em>, <em>${f(weights[2])}</em>]<br>The weights sum to 1 and act as soft "how much should I attend to position <em>i</em>" coefficients. Note that <code>'b'</code> attends most strongly to itself.`,
        },
        {
          name: 'Weighted sum, contribution from position 0',
          formula: `<div class="af-fm-title">running sum: w₀ · v₀</div><code>out += w₀ · v₀</code><br>= ${f(weights[0])} · [${f(cacheV_full[0][0])}, ${f(cacheV_full[0][1])}]<br>= [${f(weights[0]*cacheV_full[0][0])}, ${f(weights[0]*cacheV_full[0][1])}]<br>Running total: <em>[${f(partials[0][0])}, ${f(partials[0][1])}]</em>`,
        },
        {
          name: 'Weighted sum, + contribution from position 1',
          formula: `<div class="af-fm-title">running sum: + w₁ · v₁</div><code>out += w₁ · v₁</code><br>= ${f(weights[1])} · [${f(cacheV_full[1][0])}, ${f(cacheV_full[1][1])}]<br>= [${f(weights[1]*cacheV_full[1][0])}, ${f(weights[1]*cacheV_full[1][1])}]<br>Running total: <em>[${f(partials[1][0])}, ${f(partials[1][1])}]</em>`,
        },
        {
          name: 'Weighted sum, + contribution from position 2',
          formula: `<div class="af-fm-title">running sum: + w₂ · v₂</div><code>out += w₂ · v₂</code><br>= ${f(weights[2])} · [${f(cacheV_full[2][0])}, ${f(cacheV_full[2][1])}]<br>= [${f(weights[2]*cacheV_full[2][0])}, ${f(weights[2]*cacheV_full[2][1])}]<br>Final head output: <em>[${f(output[0])}, ${f(output[1])}]</em>`,
        },
        {
          name: 'Done — head output ready for Wo + residual',
          formula: `<div class="af-fm-title">attention head output</div><code>head_out = Σᵢ wᵢ · vᵢ  =  [<em>${f(output[0])}</em>, <em>${f(output[1])}</em>]</code><br>Next: <code>Wo</code> mixes this back into the residual stream's shape, then it's added to the residual <code>x</code>. The KV cache now stores 3 rows; when the next token arrives we'll grow it to 4.</br>`,
        },
      ];

      let phase = 0;

      function isCacheRowFilled(pos) {
        // pos 0 and 1 are always pre-filled; pos 2 is filled starting from phase 2
        if (pos < 2) return true;
        return phase >= 2;
      }
      function isCacheRowJustFilled(pos) {
        if (pos < 2) return false;
        return phase === 2;
      }
      function isQKVRevealed() { return phase >= 1; }
      function scoreState(i) {
        if (phase < 3 + i) return 'empty';
        if (phase === 3 + i) return 'active';
        return 'computed';
      }
      function weightsRevealed() { return phase >= 6; }
      function weightActive(i) { return phase === 7 + i; }
      function contribDone(i) { return phase > 7 + i; }
      function sumActive() { return phase >= 7 && phase <= 9; }
      function outputRevealed() { return phase >= 9; }

      // ----- SVG building helpers -----
      function svgCell(x, y, w, h, value, opts) {
        opts = opts || {};
        const cls = ['af-cell'];
        if (opts.empty) cls.push('empty');
        else cls.push(cellCls(value));
        if (opts.dim) cls.push('dim');
        if (opts.active) cls.push('active');
        const numStr = opts.empty ? '' : f(value);
        return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="${cls.join(' ')}"/>
          <text x="${x + w/2}" y="${y + h/2 + 4}" text-anchor="middle" class="af-num">${numStr}</text></g>`;
      }
      function svgCircle(cx, cy, r, value, opts) {
        opts = opts || {};
        const cls = ['af-circle'];
        if (opts.kind) cls.push(opts.kind);
        if (opts.dim) cls.push('dim');
        if (opts.active) cls.push('active');
        const numStr = (value === null || value === undefined) ? '·' : f(value);
        return `<g><circle cx="${cx}" cy="${cy}" r="${r}" class="${cls.join(' ')}"/>
          <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="af-num">${numStr}</text></g>`;
      }
      function svgLine(x1, y1, x2, y2, opts) {
        opts = opts || {};
        const cls = ['af-line'];
        if (opts.active) cls.push('active');
        if (opts.dim) cls.push('dim');
        const marker = opts.arrow ? ' marker-end="url(#af-arrow)"' : '';
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls.join(' ')}"${marker}/>`;
      }
      function svgPath(d, opts) {
        opts = opts || {};
        const cls = ['af-line'];
        if (opts.active) cls.push('active');
        if (opts.dim) cls.push('dim');
        const marker = opts.arrow ? ' marker-end="url(#af-arrow)"' : '';
        return `<path d="${d}" class="${cls.join(' ')}"${marker}/>`;
      }

      // ----- Build the full SVG for the current phase -----
      function buildSvg() {
        let h = '';
        // Arrow marker
        h += `<defs>
          <marker id="af-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="af-arrow"/>
          </marker>
          <marker id="af-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="af-arrow active"/>
          </marker>
        </defs>`;

        // ----- Top row labels -----
        h += `<text x="${LAY.qLabelX}" y="30" text-anchor="middle" class="af-group-label">Q</text>`;
        h += `<text x="${LAY.qLabelX}" y="46" text-anchor="middle" class="af-sub">query (current)</text>`;
        h += `<text x="${LAY.kLabelX}" y="30" text-anchor="middle" class="af-group-label">K</text>`;
        h += `<text x="${LAY.kLabelX}" y="46" text-anchor="middle" class="af-sub">key (current)</text>`;
        h += `<text x="${LAY.vLabelX}" y="30" text-anchor="middle" class="af-group-label">V</text>`;
        h += `<text x="${LAY.vLabelX}" y="46" text-anchor="middle" class="af-sub">value (current)</text>`;

        // ----- Top circles: Q, K, V components -----
        const qkvActive = phase === 1;
        const qkvVisible = isQKVRevealed();
        h += svgCircle(LAY.qcx0, LAY.topY, LAY.rTop, qkvVisible ? q[0] : null, { kind: 'q', active: qkvActive, dim: !qkvVisible });
        h += svgCircle(LAY.qcx1, LAY.topY, LAY.rTop, qkvVisible ? q[1] : null, { kind: 'q', active: qkvActive, dim: !qkvVisible });
        h += `<text x="${LAY.qcx0}" y="${LAY.topY + LAY.rTop + 14}" text-anchor="middle" class="af-sub">q[0]</text>`;
        h += `<text x="${LAY.qcx1}" y="${LAY.topY + LAY.rTop + 14}" text-anchor="middle" class="af-sub">q[1]</text>`;

        h += svgCircle(LAY.kcx0, LAY.topY, LAY.rTop, qkvVisible ? k_cur[0] : null, { kind: 'k', active: qkvActive, dim: !qkvVisible });
        h += svgCircle(LAY.kcx1, LAY.topY, LAY.rTop, qkvVisible ? k_cur[1] : null, { kind: 'k', active: qkvActive, dim: !qkvVisible });
        h += `<text x="${LAY.kcx0}" y="${LAY.topY + LAY.rTop + 14}" text-anchor="middle" class="af-sub">k[0]</text>`;
        h += `<text x="${LAY.kcx1}" y="${LAY.topY + LAY.rTop + 14}" text-anchor="middle" class="af-sub">k[1]</text>`;

        h += svgCircle(LAY.vcx0, LAY.topY, LAY.rTop, qkvVisible ? v_cur[0] : null, { kind: 'v', active: qkvActive, dim: !qkvVisible });
        h += svgCircle(LAY.vcx1, LAY.topY, LAY.rTop, qkvVisible ? v_cur[1] : null, { kind: 'v', active: qkvActive, dim: !qkvVisible });
        h += `<text x="${LAY.vcx0}" y="${LAY.topY + LAY.rTop + 14}" text-anchor="middle" class="af-sub">v[0]</text>`;
        h += `<text x="${LAY.vcx1}" y="${LAY.topY + LAY.rTop + 14}" text-anchor="middle" class="af-sub">v[1]</text>`;

        // ----- K cache box -----
        h += `<rect x="${LAY.kBoxX}" y="${LAY.cacheY}" width="${LAY.kBoxW}" height="${LAY.cacheH}" class="af-cache-box"/>`;
        h += `<text x="${LAY.kBoxX + LAY.kBoxW/2}" y="${LAY.cacheY - 6}" text-anchor="middle" class="af-cache-title">Key cache · layer 0</text>`;
        // 3 rows
        for (let p = 0; p < 3; p++) {
          const rowY = LAY.cacheY + LAY.cacheTopPad + p * LAY.rowH;
          const filled = isCacheRowFilled(p);
          const justFilled = isCacheRowJustFilled(p);
          const cellsActive = (phase === 3 + p);
          // Row background
          let rowCls = 'af-cache-row';
          if (justFilled) rowCls += ' justfilled';
          else if (filled) rowCls += ' filled';
          h += `<rect x="${LAY.kBoxX + 4}" y="${rowY - 2}" width="${LAY.kBoxW - 8}" height="${LAY.rowH - 4}" rx="3" class="${rowCls}"/>`;
          // Cells
          const cw = 60, ch = 32, cellY = rowY + 6;
          const c0x = LAY.kBoxX + 12, c1x = LAY.kBoxX + 80;
          h += filled
            ? svgCell(c0x, cellY, cw, ch, cacheK_full[p][0], { active: cellsActive })
            : svgCell(c0x, cellY, cw, ch, 0, { empty: true });
          h += filled
            ? svgCell(c1x, cellY, cw, ch, cacheK_full[p][1], { active: cellsActive })
            : svgCell(c1x, cellY, cw, ch, 0, { empty: true });
          // Position label
          h += `<text x="${LAY.kBoxX + LAY.kBoxW - 8}" y="${rowY + LAY.rowH/2 + 3}" text-anchor="end" class="af-cache-poslabel">pos ${p}${p === 2 ? ' ★' : ''}</text>`;
        }

        // ----- V cache box -----
        h += `<rect x="${LAY.vBoxX}" y="${LAY.cacheY}" width="${LAY.vBoxW}" height="${LAY.cacheH}" class="af-cache-box"/>`;
        h += `<text x="${LAY.vBoxX + LAY.vBoxW/2}" y="${LAY.cacheY - 6}" text-anchor="middle" class="af-cache-title">Value cache · layer 0</text>`;
        for (let p = 0; p < 3; p++) {
          const rowY = LAY.cacheY + LAY.cacheTopPad + p * LAY.rowH;
          const filled = isCacheRowFilled(p);
          const justFilled = isCacheRowJustFilled(p);
          const cellsActive = weightActive(p);
          let rowCls = 'af-cache-row';
          if (justFilled) rowCls += ' justfilled';
          else if (filled) rowCls += ' filled';
          h += `<rect x="${LAY.vBoxX + 4}" y="${rowY - 2}" width="${LAY.vBoxW - 8}" height="${LAY.rowH - 4}" rx="3" class="${rowCls}"/>`;
          const cw = 60, ch = 32, cellY = rowY + 6;
          const c0x = LAY.vBoxX + 12, c1x = LAY.vBoxX + 80;
          h += filled
            ? svgCell(c0x, cellY, cw, ch, cacheV_full[p][0], { active: cellsActive })
            : svgCell(c0x, cellY, cw, ch, 0, { empty: true });
          h += filled
            ? svgCell(c1x, cellY, cw, ch, cacheV_full[p][1], { active: cellsActive })
            : svgCell(c1x, cellY, cw, ch, 0, { empty: true });
          h += `<text x="${LAY.vBoxX + LAY.vBoxW - 8}" y="${rowY + LAY.rowH/2 + 3}" text-anchor="end" class="af-cache-poslabel">pos ${p}${p === 2 ? ' ★' : ''}</text>`;
        }

        // ----- Top → cache arrows (phase 2 activates them) -----
        const appendActive = phase === 2;
        const cacheRow2Y = LAY.cacheY + LAY.cacheTopPad + 2 * LAY.rowH + LAY.rowH/2 - 2;
        // K-current → key cache pos 2
        h += svgPath(
          `M ${LAY.kLabelX} ${LAY.topY + LAY.rTop + 4} L ${LAY.kLabelX} ${LAY.cacheY - 14} L ${LAY.kBoxX + LAY.kBoxW/2} ${LAY.cacheY - 14} L ${LAY.kBoxX + LAY.kBoxW/2} ${cacheRow2Y}`,
          { active: appendActive, arrow: true }
        );
        // V-current → value cache pos 2
        h += svgPath(
          `M ${LAY.vLabelX} ${LAY.topY + LAY.rTop + 4} L ${LAY.vLabelX} ${LAY.cacheY - 14} L ${LAY.vBoxX + LAY.vBoxW/2} ${LAY.cacheY - 14} L ${LAY.vBoxX + LAY.vBoxW/2} ${cacheRow2Y}`,
          { active: appendActive, arrow: true }
        );

        // ----- Score boxes (q · k_i / √2) -----
        for (let i = 0; i < 3; i++) {
          const cx = LAY.scoreCx[i];
          const x = cx - LAY.scoreBoxW / 2;
          const state = scoreState(i);
          let cls = 'af-dotbox';
          if (state === 'active') cls += ' active';
          else if (state === 'computed') cls += ' computed';
          h += `<rect x="${x}" y="${LAY.scoreY}" width="${LAY.scoreBoxW}" height="${LAY.scoreBoxH}" class="${cls}"/>`;
          h += `<text x="${cx}" y="${LAY.scoreY + 18}" text-anchor="middle" class="af-sub">s${'₀₁₂'[i]} = q · k${'₀₁₂'[i]} / √2</text>`;
          if (state === 'empty') {
            h += `<text x="${cx}" y="${LAY.scoreY + 44}" text-anchor="middle" class="af-num" style="fill: var(--ink-mute)">·</text>`;
          } else {
            h += `<text x="${cx}" y="${LAY.scoreY + 44}" text-anchor="middle" class="af-num">${f(scores[i])}</text>`;
          }
        }

        // ----- Q → score boxes lines -----
        for (let i = 0; i < 3; i++) {
          const active = phase === 3 + i;
          // Source: bottom of Q group, around y=110
          // Target: top of dot box i
          const x2 = LAY.scoreCx[i];
          const y1 = LAY.topY + LAY.rTop + 16;
          const y2 = LAY.scoreY;
          // Curved path
          h += svgPath(
            `M ${LAY.qLabelX} ${y1} C ${LAY.qLabelX} ${(y1+y2)/2}, ${x2} ${(y1+y2)/2}, ${x2} ${y2}`,
            { active }
          );
        }

        // ----- K cache row i → score box i lines -----
        for (let i = 0; i < 3; i++) {
          const active = phase === 3 + i;
          const rowMidY = LAY.cacheY + LAY.cacheTopPad + i * LAY.rowH + LAY.rowH/2 - 2;
          const x1 = LAY.kBoxX;
          const y1 = rowMidY;
          const x2 = LAY.scoreCx[i];
          const y2 = LAY.scoreY;
          // S-curve: from cache-left going horizontally first, then down to score box top
          const midY = (y1 + y2) / 2;
          h += svgPath(
            `M ${x1} ${y1} C ${x1 - 80} ${y1}, ${x2} ${midY}, ${x2} ${y2}`,
            { active, arrow: true }
          );
        }

        // ----- Score → softmax arrows -----
        for (let i = 0; i < 3; i++) {
          const active = phase === 6;
          h += svgPath(
            `M ${LAY.scoreCx[i]} ${LAY.scoreY + LAY.scoreBoxH} L ${LAY.scoreCx[i]} ${LAY.softmaxCy - LAY.softmaxRy - 4} L ${LAY.softmaxCx} ${LAY.softmaxCy - LAY.softmaxRy}`,
            { active, arrow: true }
          );
        }

        // ----- Softmax ellipse -----
        const sActive = phase === 6;
        h += `<ellipse cx="${LAY.softmaxCx}" cy="${LAY.softmaxCy}" rx="${LAY.softmaxRx}" ry="${LAY.softmaxRy}" class="af-softmax${sActive ? ' active' : ''}"/>`;
        h += `<text x="${LAY.softmaxCx}" y="${LAY.softmaxCy + 5}" text-anchor="middle" class="af-num">softmax</text>`;

        // ----- Softmax → weights arrows -----
        for (let i = 0; i < 3; i++) {
          const active = phase === 6;
          h += svgPath(
            `M ${LAY.softmaxCx} ${LAY.softmaxCy + LAY.softmaxRy} L ${LAY.softmaxCx} ${LAY.weightY - 6} L ${LAY.scoreCx[i]} ${LAY.weightY - 6} L ${LAY.scoreCx[i]} ${LAY.weightY}`,
            { active, arrow: true }
          );
        }

        // ----- Weights row -----
        for (let i = 0; i < 3; i++) {
          const cx = LAY.scoreCx[i];
          const x = cx - LAY.weightCellW / 2;
          const active = weightActive(i);
          h += weightsRevealed()
            ? svgCell(x, LAY.weightY, LAY.weightCellW, LAY.weightCellH, weights[i], { active })
            : svgCell(x, LAY.weightY, LAY.weightCellW, LAY.weightCellH, 0, { empty: true });
          h += `<text x="${cx}" y="${LAY.weightY + LAY.weightCellH + 14}" text-anchor="middle" class="af-sub">w${'₀₁₂'[i]}</text>`;
        }

        // ----- Weighted sum box -----
        const sumX = LAY.sumBoxX, sumY = LAY.sumBoxY, sumW = LAY.sumBoxW, sumH_ = LAY.sumBoxH;
        const sumActiveNow = sumActive();
        h += `<rect x="${sumX}" y="${sumY}" width="${sumW}" height="${sumH_}" class="af-sumbox${sumActiveNow ? ' active' : ''}"/>`;
        h += `<text x="${sumX + sumW/2}" y="${sumY + 20}" text-anchor="middle" class="af-title">Σ wᵢ · vᵢ</text>`;
        // Show running partial inside
        let runningStr;
        if (phase < 7) runningStr = '[ · , · ]';
        else if (phase === 7) runningStr = `[${f(partials[0][0])}, ${f(partials[0][1])}]`;
        else if (phase === 8) runningStr = `[${f(partials[1][0])}, ${f(partials[1][1])}]`;
        else runningStr = `[${f(output[0])}, ${f(output[1])}]`;
        h += `<text x="${sumX + sumW/2}" y="${sumY + 46}" text-anchor="middle" class="af-num">${runningStr}</text>`;
        h += `<text x="${sumX + sumW/2}" y="${sumY + 66}" text-anchor="middle" class="af-sub">running total</text>`;

        // ----- Weights → sum box arrow -----
        const wToSumActive = sumActiveNow;
        // Path from right side of last weight cell to left side of sum box
        const wRightCx = LAY.scoreCx[2];
        const wRightY = LAY.weightY + LAY.weightCellH/2;
        h += svgPath(
          `M ${wRightCx + LAY.weightCellW/2} ${wRightY} L ${(wRightCx + LAY.weightCellW/2 + sumX)/2} ${wRightY} L ${(wRightCx + LAY.weightCellW/2 + sumX)/2} ${sumY + sumH_/2} L ${sumX} ${sumY + sumH_/2}`,
          { active: wToSumActive, arrow: true }
        );

        // ----- V cache → sum box arrow (down right side) -----
        const vToSumActive = sumActiveNow;
        const vMidX = LAY.vBoxX + LAY.vBoxW/2;
        h += svgPath(
          `M ${vMidX} ${LAY.cacheY + LAY.cacheH} L ${vMidX} ${sumY - 12} L ${sumX + sumW/2} ${sumY - 12} L ${sumX + sumW/2} ${sumY}`,
          { active: vToSumActive, arrow: true }
        );

        // Individual highlighting: when contributing position i, highlight that V cache row
        // (already handled by weightActive(i) in V cache cells above)

        // ----- Output cells (below the sum box) -----
        const outX0 = LAY.outCx - LAY.outCellW - 5;
        const outX1 = LAY.outCx + 5;
        const outVisible = outputRevealed();
        h += `<text x="${LAY.outCx}" y="${LAY.outY - 8}" text-anchor="middle" class="af-sub">head output</text>`;
        h += outVisible
          ? svgCell(outX0, LAY.outY, LAY.outCellW, LAY.outCellH, output[0], { active: phase === 10 })
          : svgCell(outX0, LAY.outY, LAY.outCellW, LAY.outCellH, 0, { empty: true });
        h += outVisible
          ? svgCell(outX1, LAY.outY, LAY.outCellW, LAY.outCellH, output[1], { active: phase === 10 })
          : svgCell(outX1, LAY.outY, LAY.outCellW, LAY.outCellH, 0, { empty: true });

        // ----- Sum → output arrow -----
        const sToOActive = phase === 10;
        h += svgPath(
          `M ${sumX + sumW/2} ${sumY + sumH_} L ${LAY.outCx} ${LAY.outY - 4}`,
          { active: sToOActive, arrow: true }
        );

        // ----- "Next: Wo + residual" annotation -----
        if (phase === 10) {
          h += `<text x="${LAY.outCx}" y="${LAY.outY + LAY.outCellH + 24}" text-anchor="middle" class="af-sub">→ Wo, residual, then MLP</text>`;
        }

        svg.innerHTML = h;
      }

      function setPhase(p) {
        phase = Math.max(0, Math.min(PHASES.length - 1, p));
        buildSvg();
        stepLabelEl.textContent = `Step ${phase} of ${PHASES.length - 1} — ${PHASES[phase].name}`;
        formulaEl.innerHTML = PHASES[phase].formula;
      }

      // ----- Controls -----
      let playTimer = null;
      function stopPlay() {
        if (playTimer) { clearInterval(playTimer); playTimer = null; }
        playBtn.classList.remove('playing');
        playBtn.textContent = '▶ Play';
      }
      function startPlay() {
        playBtn.classList.add('playing');
        playBtn.textContent = '⏸ Pause';
        playTimer = setInterval(() => {
          if (phase >= PHASES.length - 1) {
            stopPlay();
            return;
          }
          setPhase(phase + 1);
        }, 1600);
      }
      playBtn.addEventListener('click', () => {
        if (playTimer) {
          stopPlay();
        } else {
          if (phase >= PHASES.length - 1) setPhase(0);
          startPlay();
        }
      });
      stepBtn.addEventListener('click', () => {
        stopPlay();
        if (phase >= PHASES.length - 1) setPhase(0);
        else setPhase(phase + 1);
      });
      backBtn.addEventListener('click', () => { stopPlay(); setPhase(phase - 1); });
      resetBtn.addEventListener('click', () => { stopPlay(); setPhase(0); });

      setPhase(0);
    })();

    /* -------------------------------------------------------------- */
    /*  Slider-driven attention flow widget                           */
    /*  Same layout as the phased attention-flow diagram, but the     */
    /*  user drags q[0] and q[1] and the whole block recomputes live. */
    /* -------------------------------------------------------------- */
    (function initAttnSliderFlow() {
      const root = document.getElementById('viz-attn-slider-flow');
      if (!root) return;
      const svg = document.getElementById('asf-svg');
      const q0Slider = document.getElementById('asf-q0');
      const q1Slider = document.getElementById('asf-q1');
      const q0Val = document.getElementById('asf-q0-val');
      const q1Val = document.getElementById('asf-q1-val');
      const resetBtn = document.getElementById('asf-reset');
      if (!svg || !q0Slider || !q1Slider) return;

      // Pinned KV cache (matches toy walkthrough; pos 2 is the 'b' token).
      const cacheK = [[0.30, 0.10], [-0.10, 0.40], [-0.37, 0.37]];
      const cacheV = [[0.20, -0.30], [0.50, 0.20], [-0.24, 0.84]];
      const DEFAULT_Q = [-0.22, 0.35];
      // Same lm_head as the Parameter matrices section below.
      const TOY_LM_HEAD = [
        [ 0.30,  0.10],   // BOS
        [-0.20,  0.40],   // 'a'
        [ 0.50, -0.30],   // 'b'
        [-0.10,  0.60],   // 'c'
      ];
      const VOCAB = ['BOS', "'a'", "'b'", "'c'"];

      // Build the letter bars once (DOM nodes are reused; we update widths + text per slider event).
      const letterBarsRoot = document.getElementById('asf-letter-bars');
      const letterBarEls = [];
      if (letterBarsRoot) {
        letterBarsRoot.innerHTML = '';
        for (let i = 0; i < VOCAB.length; i++) {
          const letterEl = document.createElement('span');
          letterEl.className = 'asf-bar-letter';
          letterEl.textContent = VOCAB[i];
          const trackEl = document.createElement('div');
          trackEl.className = 'asf-bar-track';
          const fillEl = document.createElement('div');
          fillEl.className = 'asf-bar-fill';
          trackEl.appendChild(fillEl);
          const pctEl = document.createElement('span');
          pctEl.className = 'asf-bar-pct';
          letterBarsRoot.appendChild(letterEl);
          letterBarsRoot.appendChild(trackEl);
          letterBarsRoot.appendChild(pctEl);
          letterBarEls.push({ row: [letterEl, trackEl, pctEl], fill: fillEl, pct: pctEl, letter: letterEl });
        }
      }

      const f = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
      const cellCls = v => v > 0.005 ? 'pos' : (v < -0.005 ? 'neg' : 'zero');

      // Layout shared with the phased attention-flow widget.
      const LAY = {
        topY: 75, rTop: 25,
        qcx0: 105, qcx1: 175, qLabelX: 140,
        kcx0: 405, kcx1: 475, kLabelX: 440,
        vcx0: 705, vcx1: 775, vLabelX: 740,
        kBoxX: 345, kBoxW: 190,
        vBoxX: 645, vBoxW: 190,
        cacheY: 140, cacheH: 165, cacheTopPad: 18,
        rowH: 48,
        scoreBoxW: 110, scoreBoxH: 60, scoreY: 345,
        scoreCx: [80, 200, 320],
        softmaxCx: 200, softmaxCy: 445, softmaxRx: 70, softmaxRy: 22,
        weightCellW: 70, weightCellH: 40, weightY: 488,
        sumBoxX: 500, sumBoxY: 555, sumBoxW: 320, sumBoxH: 80,
        outY: 670, outCellW: 70, outCellH: 40,
        outCx: 660,
      };

      function compute(q) {
        const sqrt2 = Math.sqrt(2);
        const scores = cacheK.map(k => (q[0] * k[0] + q[1] * k[1]) / sqrt2);
        const weights = softmaxArr(scores);
        const head_out = [0, 1].map(j =>
          weights.reduce((acc, w, i) => acc + w * cacheV[i][j], 0)
        );
        // Shortcut: head_out → lm_head → softmax. Skips Wo + residual + MLP, used only
        // to illustrate which letter the attention "points at"; not the model's real prediction.
        const logits = TOY_LM_HEAD.map(row => row[0] * head_out[0] + row[1] * head_out[1]);
        const letterProbs = softmaxArr(logits);
        return { scores, weights, head_out, logits, letterProbs };
      }

      function svgCell(x, y, w, h, value, opts) {
        opts = opts || {};
        const cls = ['af-cell', cellCls(value)];
        if (opts.dim) cls.push('dim');
        return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="${cls.join(' ')}"/>
          <text x="${x + w/2}" y="${y + h/2 + 4}" text-anchor="middle" class="af-num">${f(value)}</text></g>`;
      }
      function svgCircle(cx, cy, r, value, kind) {
        const cls = ['af-circle'];
        if (kind) cls.push(kind);
        return `<g><circle cx="${cx}" cy="${cy}" r="${r}" class="${cls.join(' ')}"/>
          <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="af-num">${f(value)}</text></g>`;
      }
      function svgPath(d, arrow) {
        const marker = arrow ? ' marker-end="url(#asf-arrow)"' : '';
        return `<path d="${d}" class="af-line"${marker}/>`;
      }

      function buildSvg(q, state) {
        const { scores, weights, head_out } = state;
        let h = '';
        // Arrow marker
        h += `<defs><marker id="asf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="af-arrow"/></marker></defs>`;

        // Group labels
        h += `<text x="${LAY.qLabelX}" y="30" text-anchor="middle" class="af-group-label">Q</text>`;
        h += `<text x="${LAY.qLabelX}" y="46" text-anchor="middle" class="af-sub">query (sliders)</text>`;
        h += `<text x="${LAY.kLabelX}" y="30" text-anchor="middle" class="af-group-label">K cache</text>`;
        h += `<text x="${LAY.vLabelX}" y="30" text-anchor="middle" class="af-group-label">V cache</text>`;

        // Q circles (driven by sliders)
        h += svgCircle(LAY.qcx0, LAY.topY, LAY.rTop, q[0], 'q');
        h += svgCircle(LAY.qcx1, LAY.topY, LAY.rTop, q[1], 'q');
        h += `<text x="${LAY.qcx0}" y="${LAY.topY + LAY.rTop + 14}" text-anchor="middle" class="af-sub">q[0]</text>`;
        h += `<text x="${LAY.qcx1}" y="${LAY.topY + LAY.rTop + 14}" text-anchor="middle" class="af-sub">q[1]</text>`;

        // K cache box + 3 rows
        h += `<rect x="${LAY.kBoxX}" y="${LAY.cacheY}" width="${LAY.kBoxW}" height="${LAY.cacheH}" class="af-cache-box"/>`;
        h += `<text x="${LAY.kBoxX + LAY.kBoxW/2}" y="${LAY.cacheY - 6}" text-anchor="middle" class="af-cache-title">Key cache · pinned</text>`;
        for (let p = 0; p < 3; p++) {
          const rowY = LAY.cacheY + LAY.cacheTopPad + p * LAY.rowH;
          h += `<rect x="${LAY.kBoxX + 4}" y="${rowY - 2}" width="${LAY.kBoxW - 8}" height="${LAY.rowH - 4}" rx="3" class="af-cache-row filled"/>`;
          const cw = 60, ch = 32, cellY = rowY + 6;
          h += svgCell(LAY.kBoxX + 12, cellY, cw, ch, cacheK[p][0]);
          h += svgCell(LAY.kBoxX + 80, cellY, cw, ch, cacheK[p][1]);
          h += `<text x="${LAY.kBoxX + LAY.kBoxW - 8}" y="${rowY + LAY.rowH/2 + 3}" text-anchor="end" class="af-cache-poslabel">pos ${p}</text>`;
        }

        // V cache box + 3 rows
        h += `<rect x="${LAY.vBoxX}" y="${LAY.cacheY}" width="${LAY.vBoxW}" height="${LAY.cacheH}" class="af-cache-box"/>`;
        h += `<text x="${LAY.vBoxX + LAY.vBoxW/2}" y="${LAY.cacheY - 6}" text-anchor="middle" class="af-cache-title">Value cache · pinned</text>`;
        for (let p = 0; p < 3; p++) {
          const rowY = LAY.cacheY + LAY.cacheTopPad + p * LAY.rowH;
          h += `<rect x="${LAY.vBoxX + 4}" y="${rowY - 2}" width="${LAY.vBoxW - 8}" height="${LAY.rowH - 4}" rx="3" class="af-cache-row filled"/>`;
          const cw = 60, ch = 32, cellY = rowY + 6;
          h += svgCell(LAY.vBoxX + 12, cellY, cw, ch, cacheV[p][0]);
          h += svgCell(LAY.vBoxX + 80, cellY, cw, ch, cacheV[p][1]);
          h += `<text x="${LAY.vBoxX + LAY.vBoxW - 8}" y="${rowY + LAY.rowH/2 + 3}" text-anchor="end" class="af-cache-poslabel">pos ${p}</text>`;
        }

        // Score boxes (computed live)
        for (let i = 0; i < 3; i++) {
          const cx = LAY.scoreCx[i];
          const x = cx - LAY.scoreBoxW / 2;
          h += `<rect x="${x}" y="${LAY.scoreY}" width="${LAY.scoreBoxW}" height="${LAY.scoreBoxH}" class="af-dotbox computed"/>`;
          h += `<text x="${cx}" y="${LAY.scoreY + 18}" text-anchor="middle" class="af-sub">s${'₀₁₂'[i]} = q · k${'₀₁₂'[i]} / √2</text>`;
          h += `<text x="${cx}" y="${LAY.scoreY + 44}" text-anchor="middle" class="af-num">${f(scores[i])}</text>`;
        }

        // Q → score lines (S-curves, no arrow)
        for (let i = 0; i < 3; i++) {
          const x2 = LAY.scoreCx[i];
          const y1 = LAY.topY + LAY.rTop + 16;
          const y2 = LAY.scoreY;
          h += svgPath(`M ${LAY.qLabelX} ${y1} C ${LAY.qLabelX} ${(y1+y2)/2}, ${x2} ${(y1+y2)/2}, ${x2} ${y2}`);
        }

        // K cache row → score box lines (with arrow)
        for (let i = 0; i < 3; i++) {
          const rowMidY = LAY.cacheY + LAY.cacheTopPad + i * LAY.rowH + LAY.rowH/2 - 2;
          const x1 = LAY.kBoxX, y1 = rowMidY;
          const x2 = LAY.scoreCx[i], y2 = LAY.scoreY;
          const midY = (y1 + y2) / 2;
          h += svgPath(`M ${x1} ${y1} C ${x1 - 80} ${y1}, ${x2} ${midY}, ${x2} ${y2}`, true);
        }

        // Score → softmax arrows
        for (let i = 0; i < 3; i++) {
          h += svgPath(`M ${LAY.scoreCx[i]} ${LAY.scoreY + LAY.scoreBoxH} L ${LAY.scoreCx[i]} ${LAY.softmaxCy - LAY.softmaxRy - 4} L ${LAY.softmaxCx} ${LAY.softmaxCy - LAY.softmaxRy}`, true);
        }

        // Softmax ellipse
        h += `<ellipse cx="${LAY.softmaxCx}" cy="${LAY.softmaxCy}" rx="${LAY.softmaxRx}" ry="${LAY.softmaxRy}" class="af-softmax"/>`;
        h += `<text x="${LAY.softmaxCx}" y="${LAY.softmaxCy + 5}" text-anchor="middle" class="af-num">softmax</text>`;

        // Softmax → weights arrows
        for (let i = 0; i < 3; i++) {
          h += svgPath(`M ${LAY.softmaxCx} ${LAY.softmaxCy + LAY.softmaxRy} L ${LAY.softmaxCx} ${LAY.weightY - 6} L ${LAY.scoreCx[i]} ${LAY.weightY - 6} L ${LAY.scoreCx[i]} ${LAY.weightY}`, true);
        }

        // Weight cells (computed)
        for (let i = 0; i < 3; i++) {
          const cx = LAY.scoreCx[i];
          const x = cx - LAY.weightCellW / 2;
          h += svgCell(x, LAY.weightY, LAY.weightCellW, LAY.weightCellH, weights[i]);
          h += `<text x="${cx}" y="${LAY.weightY + LAY.weightCellH + 14}" text-anchor="middle" class="af-sub">w${'₀₁₂'[i]}</text>`;
        }

        // Weighted-sum box (always-active style)
        const sumX = LAY.sumBoxX, sumY = LAY.sumBoxY, sumW = LAY.sumBoxW, sumH_ = LAY.sumBoxH;
        h += `<rect x="${sumX}" y="${sumY}" width="${sumW}" height="${sumH_}" class="af-sumbox active"/>`;
        h += `<text x="${sumX + sumW/2}" y="${sumY + 20}" text-anchor="middle" class="af-title">Σ wᵢ · vᵢ</text>`;
        h += `<text x="${sumX + sumW/2}" y="${sumY + 46}" text-anchor="middle" class="af-num">[${f(head_out[0])}, ${f(head_out[1])}]</text>`;
        h += `<text x="${sumX + sumW/2}" y="${sumY + 66}" text-anchor="middle" class="af-sub">head output</text>`;

        // Weights → sum arrow
        const wRightCx = LAY.scoreCx[2];
        const wRightY = LAY.weightY + LAY.weightCellH/2;
        h += svgPath(`M ${wRightCx + LAY.weightCellW/2} ${wRightY} L ${(wRightCx + LAY.weightCellW/2 + sumX)/2} ${wRightY} L ${(wRightCx + LAY.weightCellW/2 + sumX)/2} ${sumY + sumH_/2} L ${sumX} ${sumY + sumH_/2}`, true);

        // V cache → sum arrow
        const vMidX = LAY.vBoxX + LAY.vBoxW/2;
        h += svgPath(`M ${vMidX} ${LAY.cacheY + LAY.cacheH} L ${vMidX} ${sumY - 12} L ${sumX + sumW/2} ${sumY - 12} L ${sumX + sumW/2} ${sumY}`, true);

        // Output cells (live)
        const outX0 = LAY.outCx - LAY.outCellW - 5;
        const outX1 = LAY.outCx + 5;
        h += `<text x="${LAY.outCx}" y="${LAY.outY - 8}" text-anchor="middle" class="af-sub">→ Wo, residual</text>`;
        h += svgCell(outX0, LAY.outY, LAY.outCellW, LAY.outCellH, head_out[0]);
        h += svgCell(outX1, LAY.outY, LAY.outCellW, LAY.outCellH, head_out[1]);

        // Sum → output arrow
        h += svgPath(`M ${sumX + sumW/2} ${sumY + sumH_} L ${LAY.outCx} ${LAY.outY - 4}`, true);

        svg.innerHTML = h;
      }

      function updateLetterBars(letterProbs) {
        if (!letterBarEls.length) return;
        const maxIdx = letterProbs.indexOf(Math.max(...letterProbs));
        for (let i = 0; i < letterBarEls.length; i++) {
          const p = letterProbs[i];
          letterBarEls[i].fill.style.width = `${(p * 100).toFixed(1)}%`;
          letterBarEls[i].pct.textContent = `${(p * 100).toFixed(0)}%`;
          const isTop = i === maxIdx;
          letterBarEls[i].fill.classList.toggle('top', isTop);
          letterBarEls[i].pct.classList.toggle('top', isTop);
          letterBarEls[i].letter.classList.toggle('top', isTop);
        }
      }

      function update() {
        const q = [parseFloat(q0Slider.value), parseFloat(q1Slider.value)];
        q0Val.textContent = f(q[0]);
        q1Val.textContent = f(q[1]);
        const state = compute(q);
        buildSvg(q, state);
        updateLetterBars(state.letterProbs);
      }

      q0Slider.addEventListener('input', update);
      q1Slider.addEventListener('input', update);
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          q0Slider.value = DEFAULT_Q[0];
          q1Slider.value = DEFAULT_Q[1];
          update();
        });
      }
      update();
    })();

    /* -------------------------------------------------------------- */
    /*  ToyGPT — standalone training + chat section (#viz-tv-train).  */
    /*  Real SGD on lm_head only; the diagram in this section redraws */
    /*  every few steps so the bottom row converges visibly.          */
    /* -------------------------------------------------------------- */
    (function initToyGptPanel() {
      const root        = document.getElementById('viz-tv-train');
      if (!root) return;
      const badge       = document.getElementById('toygpt-badge');
      const lossEl      = document.getElementById('toygpt-loss');   // may be null (removed); writes are null-guarded
      const setLossText = (text) => { if (lossEl) lossEl.textContent = text; };
      const trainBtn    = document.getElementById('toygpt-train');
      const stepBtn     = document.getElementById('toygpt-step');
      const untrainBtn  = document.getElementById('toygpt-untrain');
      const restoreBtn  = document.getElementById('toygpt-reset-pinned');
      const chatLog     = document.getElementById('train-chat-log');
      const chatForm    = document.getElementById('train-chat-form');
      const chatIn      = document.getElementById('train-chat-input');
      const chatBtn     = document.getElementById('train-chat-send');
      const promptEl    = document.getElementById('train-chat-prompt');
      if (!badge || !trainBtn || !chatForm || !chatIn) {
        console.warn('[toygpt] panel setup aborted — missing required element(s):',
          { badge, trainBtn, chatForm, chatIn });
        return;
      }

      // Snapshot the original pinned values so we can restore exactly later.
      const deepCopy = arr => arr.map(r => Array.isArray(r) ? r.slice() : r);
      const PINNED = {
        wte:     deepCopy(TOY_WTE),
        lm_head: deepCopy(TOY_LM_HEAD),
        wpe:     W.wpe.slice(),
        Wq:      deepCopy(W.Wq),
        Wk:      deepCopy(W.Wk),
        Wv:      deepCopy(W.Wv),
        Wo:      deepCopy(W.Wo),
        fc1:     deepCopy(W.fc1),
        fc2:     deepCopy(W.fc2),
      };

      const CHAR2ID = { bos: 0, a: 1, b: 2, c: 3 };
      const LABELS  = ['BOS', "'a'", "'b'", "'c'"];

      // Restore all trainable params in-place so other widgets pick up the change.
      function restoreFromSnapshot(snap) {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) TOY_WTE[i][j]     = snap.wte[i][j];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) TOY_LM_HEAD[i][j] = snap.lm_head[i][j];
        for (let j = 0; j < 2; j++) W.wpe[j] = snap.wpe[j];
        for (const name of ['Wq', 'Wk', 'Wv', 'Wo']) {
          for (let i = 0; i < W[name].length; i++)
            for (let j = 0; j < W[name][i].length; j++) W[name][i][j] = snap[name][i][j];
        }
        for (const name of ['fc1', 'fc2']) {
          for (let i = 0; i < W[name].length; i++)
            for (let j = 0; j < W[name][i].length; j++) W[name][i][j] = snap[name][i][j];
        }
      }

      // Iterator over every trainable scalar — used by the numerical gradient.
      function getParamRefs() {
        const refs = [];
        const addMat = (mat) => {
          for (let i = 0; i < mat.length; i++) {
            const row = mat[i];
            for (let j = 0; j < row.length; j++) {
              const col = j;
              refs.push({ get: () => row[col], set: v => { row[col] = v; } });
            }
          }
        };
        const addVec = (vec) => {
          for (let j = 0; j < vec.length; j++) {
            const col = j;
            refs.push({ get: () => vec[col], set: v => { vec[col] = v; } });
          }
        };
        addMat(TOY_WTE);
        addVec(W.wpe);     // only the current-position row is referenced by forward()
        addMat(W.Wq);
        addMat(W.Wk);
        addMat(W.Wv);
        addMat(W.Wo);
        addMat(W.fc1);
        addMat(W.fc2);
        addMat(TOY_LM_HEAD);
        return refs;
      }
      function setBadge(state, text) {
        badge.dataset.state = state;
        badge.textContent = text;
      }
      function rerender() { render(); }

      // ---------- Training (the whole model, via numerical gradient) ----------
      // Each three-letter word produces TWO training examples at position 2:
      //   (a) predict the third letter given the second
      //   (b) predict BOS after the third letter so generation can terminate
      // The toy forward handles position 2 directly; positions 0 and 1 stay
      // pinned in the KV cache. We use central differences across every
      // trainable scalar (~66 params) rather than implementing backprop by
      // hand — slow (a few seconds for 100 steps) but visually convincing
      // because every edge in the diagram changes as weights move.
      // ---------- Editable training data ----------
      const wordsTextarea = document.getElementById('toygpt-words');
      const wordsHint     = document.getElementById('toygpt-words-hint');
      const datasetEl     = document.getElementById('toygpt-dataset');
      const consoleEl     = document.getElementById('toygpt-console');
      const counterEl     = document.getElementById('toygpt-console-counter');
      let wordEls = [];     // re-populated whenever we rebuild the dataset cards

      // Valid training word: 2–4 letters from {a, b, c}. The toy uses only the
      // LAST two chars (input = w[-2], target = w[-1]), so leading letters in
      // a 3- or 4-letter word are decorative — but they're useful when reading
      // the dataset aloud ("model sees `bca`, predicts the `a` after `c`").
      const WORD_RE = /^[abc]{2,4}$/;
      function parseWords() {
        if (!wordsTextarea) return ['abc', 'bca', 'cab', 'aab', 'bbc', 'cca'];
        const raw = wordsTextarea.value.split(/\s+|,/).map(s => s.trim().toLowerCase()).filter(Boolean);
        const valid = raw.filter(w => WORD_RE.test(w));
        const invalid = raw.filter(w => !WORD_RE.test(w));
        if (wordsHint) {
          if (invalid.length) {
            wordsHint.className = 'toygpt-edit-hint error';
            wordsHint.textContent = `${valid.length} valid · ignoring ${invalid.length} (2–4 letters from {a,b,c} only): ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`;
          } else {
            wordsHint.className = 'toygpt-edit-hint';
            wordsHint.textContent = `${valid.length} valid word${valid.length === 1 ? '' : 's'}`;
          }
        }
        return valid;
      }

      function rebuildDataset() {
        if (!datasetEl) return [];
        const words = parseWords();
        datasetEl.innerHTML = '';
        const examples = [];
        // Each word: input = second-to-last char, target = last char.
        for (const w of words) {
          const inputCh  = w[w.length - 2];
          const targetCh = w[w.length - 1];
          const el = document.createElement('span');
          el.className = 'toygpt-word';
          el.dataset.input = inputCh;
          el.dataset.target = targetCh;
          el.innerHTML = `${inputCh} → ${targetCh} <span class="toygpt-from">from <code>${w}</code></span>`;
          datasetEl.appendChild(el);
          examples.push({ input: CHAR2ID[inputCh], target: CHAR2ID[targetCh], label: `${inputCh} → ${targetCh} (${w})` });
        }
        // BOS terminal: one per distinct last-char so generation can end.
        const enders = Array.from(new Set(words.map(w => w[w.length - 1])));
        for (const ch of enders) {
          const el = document.createElement('span');
          el.className = 'toygpt-word terminal';
          el.dataset.input = ch;
          el.dataset.target = 'bos';
          el.innerHTML = `${ch} → BOS <span class="toygpt-from">end-of-word</span>`;
          datasetEl.appendChild(el);
          examples.push({ input: CHAR2ID[ch], target: CHAR2ID.bos, label: `${ch} → BOS`, terminal: true });
        }
        wordEls = Array.from(datasetEl.querySelectorAll('.toygpt-word'));
        return examples;
      }

      function trainExamples() {
        // Build from the current textarea state.
        return rebuildDataset();
      }

      if (wordsTextarea) wordsTextarea.addEventListener('input', rebuildDataset);
      rebuildDataset();   // initial render

      function singleLoss(ex) {
        const s = forward(TOY_WTE[ex.input]);
        return -Math.log(Math.max(1e-9, s.out_probs[ex.target]));
      }
      function batchLoss(examples) {
        let t = 0;
        for (const ex of examples) t += singleLoss(ex);
        return t / examples.length;
      }

      // One full SGD step using numerical gradient (central differences) on
      // EVERY param. Returns the average loss over the batch.
      function trainStepFull(lr, examples) {
        const refs = getParamRefs();
        const EPS = 0.001;
        const grads = new Float64Array(refs.length);
        for (let p = 0; p < refs.length; p++) {
          const v = refs[p].get();
          refs[p].set(v + EPS);
          const lPlus = batchLoss(examples);
          refs[p].set(v - EPS);
          const lMinus = batchLoss(examples);
          refs[p].set(v);
          grads[p] = (lPlus - lMinus) / (2 * EPS);
        }
        for (let p = 0; p < refs.length; p++) refs[p].set(refs[p].get() - lr * grads[p]);
        return batchLoss(examples);
      }

      // One step on a SINGLE example (used by the "Step ▸" button).
      function trainStepSingle(lr, ex) {
        // Compute the WHOLE gradient at the current θ (central differences)
        // THEN apply all updates. The previous version updated each param
        // immediately, which turned this into coordinate descent on a moving
        // target — over many steps the noisy single-example gradients would
        // oscillate the weights and break training.
        const refs = getParamRefs();
        const EPS = 0.001;
        const grads = new Float64Array(refs.length);
        for (let p = 0; p < refs.length; p++) {
          const v = refs[p].get();
          refs[p].set(v + EPS);
          const lPlus = singleLoss(ex);
          refs[p].set(v - EPS);
          const lMinus = singleLoss(ex);
          refs[p].set(v);
          grads[p] = (lPlus - lMinus) / (2 * EPS);
        }
        for (let p = 0; p < refs.length; p++) refs[p].set(refs[p].get() - lr * grads[p]);
        return singleLoss(ex);
      }

      function highlightExample(idx) {
        wordEls.forEach((el, i) => el.classList.toggle('active', i === idx));
      }
      function clearHighlights() { wordEls.forEach(el => el.classList.remove('active')); }

      // ---------- Training console (message box) ----------
      function logEvent(html) {
        if (!consoleEl) return;
        const line = document.createElement('div');
        line.className = 'toygpt-console-line event';
        line.innerHTML = html;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }
      function logStep({ step, total, exampleIdx, examplesLen, label, lossBefore, lossAfter }) {
        if (!consoleEl) return;
        const line = document.createElement('div');
        line.className = 'toygpt-console-line';
        line.innerHTML =
          `<span class="pos">[${String(step).padStart(3)}/${total}]</span> ` +
          `ex ${exampleIdx + 1}/${examplesLen}: <span class="word">${label}</span> ` +
          `<span class="arrow">·</span> loss ` +
          `${lossBefore.toFixed(3)}<span class="arrow">→</span><span class="loss">${lossAfter.toFixed(3)}</span>`;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }
      function logClear() {
        if (consoleEl) consoleEl.innerHTML = '';
      }
      function setCounter(text) { if (counterEl) counterEl.textContent = text; }

      async function trainModel() {
        // Make sure the user always gets a visible signal that the click was
        // received (any silent throw downstream is otherwise invisible).
        logClear();
        logEvent('<strong>Train clicked.</strong> Parsing words…');

        const TOTAL_STEPS = 20;
        const LR = 0.4;
        const buttons = [trainBtn, stepBtn, untrainBtn, restoreBtn, chatBtn, chatIn, wordsTextarea];
        const setDisabled = (b) => buttons.forEach(el => el && (el.disabled = b));

        try {
          const examples = trainExamples();
          if (!examples.length) {
            logEvent('<strong>No valid training words.</strong> Edit the textarea above and try again.');
            return;
          }
          setBadge('training', 'training the whole model…');
          setDisabled(true);
          logEvent(`Training · ${examples.length} examples · ${TOTAL_STEPS} batch-SGD steps · lr ${LR}`);

          let lastLoss = batchLoss(examples);
          if (!isFinite(lastLoss)) {
            logEvent('<strong>Warning:</strong> initial loss is non-finite — weights may be NaN. Try <em>Restore pinned</em> first.');
          }
          logEvent(`<span class="pos">initial</span> batch loss <span class="loss">${lastLoss.toFixed(3)}</span>`);

          for (let step = 1; step <= TOTAL_STEPS; step++) {
            const i = (step - 1) % examples.length;
            const ex = examples[i];
            highlightExample(i);
            const lossBefore = lastLoss;
            lastLoss = trainStepFull(LR, examples);
            logStep({
              step, total: TOTAL_STEPS,
              exampleIdx: i, examplesLen: examples.length,
              label: ex.label,
              lossBefore, lossAfter: lastLoss,
            });
            setCounter(`step ${step}/${TOTAL_STEPS} · loss ${lastLoss.toFixed(3)}`);
            setLossText(`step ${step}/${TOTAL_STEPS} · loss ${lastLoss.toFixed(3)}`);
            rerender();
            await new Promise(r => setTimeout(r, 60));
          }
          clearHighlights();
          setBadge('trained', `trained (${TOTAL_STEPS} batch steps)`);
          setCounter(`done · final loss ${lastLoss.toFixed(3)}`);
          setLossText(`loss ${lastLoss.toFixed(3)}`);
          const lastPicked = parseInt(
            (document.querySelector('#viz-try-it .tp-btn.active') || document.querySelector('.tp-btn.active'))?.dataset.token || '2',
            10
          );
          setInputFromToken(lastPicked);
          rerender();
          logEvent(`<strong>Done.</strong> ${previewPredictions()}`);
          botSay('done training. ' + previewPredictions());
          stepIdx = 0;
        } catch (err) {
          // Make any silent failure visible in the training log rather than
          // letting it disappear into the browser console.
          console.error('toygpt training error:', err);
          setBadge('untrained', 'error');
          logEvent(`<strong>Error during training:</strong> ${(err && err.message) || err}`);
        } finally {
          // No matter what went wrong, always re-enable the controls.
          setDisabled(false);
        }
      }

      // ---------- Step-through (one example at a time) ----------
      let stepIdx = 0;
      async function stepOne() {
        const examples = trainExamples();
        if (!examples.length) {
          logEvent('<strong>No valid training words.</strong> Edit the textarea above.');
          return;
        }
        if (stepIdx >= examples.length) stepIdx = 0;
        const ex = examples[stepIdx];
        const lossBefore = singleLoss(ex);

        [trainBtn, stepBtn, untrainBtn, restoreBtn, chatBtn, chatIn, wordsTextarea].forEach(el => el && (el.disabled = true));
        setBadge('training', `stepping example ${stepIdx + 1}/${examples.length}…`);
        highlightExample(stepIdx);
        await new Promise(r => setTimeout(r, 60));   // let the highlight render

        // Use a small learning rate for single-example SGD — large LRs
        // (we tried 0.5) let one step overwrite everything the previous
        // steps learned, so the model appears to "reset" on the last
        // example of a cycle. 0.15 keeps each step gentle.
        const lossAfter = trainStepSingle(0.15, ex);
        rerender();

        logStep({
          step: stepIdx + 1, total: examples.length,
          exampleIdx: stepIdx, examplesLen: examples.length,
          label: ex.label,
          lossBefore, lossAfter,
        });
        setCounter(`single step · loss ${lossAfter.toFixed(3)}`);
        setLossText(`single-step on ${ex.label} · loss ${lossAfter.toFixed(3)}`);
        setBadge('training', `stepped ${stepIdx + 1}/${examples.length}`);
        stepIdx = (stepIdx + 1) % examples.length;

        [trainBtn, stepBtn, untrainBtn, restoreBtn, chatBtn, chatIn, wordsTextarea].forEach(el => el && (el.disabled = false));
      }

      // ---------- State resets ----------
      function untrain() {
        // Small random perturbation around zero for ALL params.
        const refs = getParamRefs();
        let s = 13;
        function rand() { s = (s * 1664525 + 1013904223) >>> 0; return (s / 4294967296 - 0.5) * 0.2; }
        for (const r of refs) r.set(rand());
        setBadge('untrained', 'untrained (random)');
        setLossText('');
        setCounter('');
        clearHighlights();
        rerender();
        logEvent('<strong>Untrain.</strong> All parameters set to small random values. ' + previewPredictions());
        botSay('weights randomized. ' + previewPredictions());
        stepIdx = 0;
      }
      function restorePinned() {
        restoreFromSnapshot(PINNED);
        setBadge('trained', 'trained (pinned)');
        setLossText('');
        setCounter('');
        clearHighlights();
        rerender();
        logEvent('<strong>Restore pinned.</strong> ' + previewPredictions());
        botSay('pinned weights restored. ' + previewPredictions());
        stepIdx = 0;
      }
      function previewPredictions() {
        // Tiny one-liner showing what the model now predicts for each input.
        const out = [];
        for (const k of ['a', 'b', 'c']) {
          const s = forward(TOY_WTE[CHAR2ID[k]]);
          let topIdx = 0;
          for (let i = 1; i < s.out_probs.length; i++) if (s.out_probs[i] > s.out_probs[topIdx]) topIdx = i;
          out.push(`'${k}' → ${LABELS[topIdx]} (${(s.out_probs[topIdx] * 100).toFixed(0)}%)`);
        }
        return 'now: ' + out.join('  ·  ');
      }

      // ---------- Chat ----------
      function userSay(text) {
        const w = document.createElement('div');
        w.className = 'chat-msg user';
        const b = document.createElement('span');
        b.className = 'chat-bubble';
        b.textContent = text;
        w.appendChild(b);
        chatLog.appendChild(w);
        chatLog.scrollTop = chatLog.scrollHeight;
      }
      function botSay(html) {
        const w = document.createElement('div');
        w.className = 'chat-msg bot';
        const b = document.createElement('span');
        b.className = 'chat-bubble';
        b.innerHTML = html;
        w.appendChild(b);
        chatLog.appendChild(w);
        chatLog.scrollTop = chatLog.scrollHeight;
        return b;
      }
      function sampleFromProbs(probs) {
        const r = Math.random();
        let c = 0;
        for (let i = 0; i < probs.length; i++) {
          c += probs[i];
          if (r < c) return i;
        }
        return probs.length - 1;
      }

      async function handleChat(rawText) {
        const text = (rawText || '').trim().toLowerCase();
        if (!text) return;
        userSay(text);
        chatIn.value = '';
        if (!(text in CHAR2ID)) {
          botSay('unknown token — I only know <code>BOS</code>, <code>a</code>, <code>b</code>, <code>c</code>.');
          return;
        }

        // Autoregressive generation: keep sampling until BOS (or hit a safety cap).
        // The diagram updates between each step so the user can see the model
        // running on each emitted token.
        const MAX_GEN = 8;
        chatIn.disabled = true;
        chatBtn.disabled = true;

        const bubble = botSay(`Starting from <code>${text}</code>: <span class="toygpt-gen"></span>`);
        const seqEl = bubble.querySelector('.toygpt-gen');
        let cur = CHAR2ID[text];

        for (let i = 0; i < MAX_GEN; i++) {
          setInputFromToken(cur);
          const s = forward(TOY_WTE[cur]);
          const next = sampleFromProbs(s.out_probs);
          const label = next === 0 ? 'BOS' : LABELS[next].replace(/'/g, '');
          const isBos = next === 0;

          // Append the freshly-emitted token to the bubble.
          if (i > 0) seqEl.appendChild(document.createTextNode(' → '));
          const tokEl = document.createElement('strong');
          tokEl.textContent = label;
          if (isBos) tokEl.style.color = 'var(--accent)';
          seqEl.appendChild(tokEl);
          chatLog.scrollTop = chatLog.scrollHeight;

          if (isBos) break;
          cur = next;
          await new Promise(r => setTimeout(r, 380));  // pause so the user can see the diagram update
        }

        // If we never hit BOS, note the cap.
        if (!seqEl.textContent.endsWith('BOS')) {
          seqEl.appendChild(document.createTextNode(' (capped at ' + MAX_GEN + ' tokens — try training first)'));
        }

        chatIn.disabled = false;
        chatBtn.disabled = false;
        chatIn.focus();
      }
      chatForm.addEventListener('submit', (e) => { e.preventDefault(); handleChat(chatIn.value); });

      // Register handlers for the top-level button listeners installed at the
      // start of viz.js. This is the moment the panel is fully wired up.
      window.__toygptTrain   = trainModel;
      window.__toygptStep    = stepOne;
      window.__toygptUntrain = untrain;
      window.__toygptRestore = restorePinned;
      console.log('[toygpt] panel ready — handlers registered');
    })();
  }

  /* ---------------------------------------------------------------- */
  /*  Parameter matrix visualizations — toy d=2 values, readable text */
  /* ---------------------------------------------------------------- */
  (function initMatrices() {
    // Row labels (left of grid) and column labels (top of grid) per matrix.
    // These match the toy walkthrough in the Architecture section.
    const TOY = {
      'mat-wte': {
        rowLabels: ['BOS', "'a'", "'b'", "'c'"],
        colLabels: ['d₀', 'd₁'],
        data: [
          [ 0.20,  0.30],
          [ 0.50, -0.10],
          [-0.30,  0.40],
          [ 0.10,  0.20],
        ],
      },
      'mat-wpe': {
        rowLabels: ['pos 0', 'pos 1', 'pos 2', 'pos 3'],
        colLabels: ['d₀', 'd₁'],
        data: [
          [ 0.10, -0.05],
          [ 0.05,  0.15],
          [-0.10,  0.10],
          [ 0.15,  0.00],
        ],
      },
      'mat-attn-wq': {
        rowLabels: ['out₀', 'out₁'],
        colLabels: ['in₀', 'in₁'],
        data: [
          [ 0.50,  0.20],
          [ 0.10,  0.40],
        ],
      },
      'mat-attn-wk': {
        rowLabels: ['out₀', 'out₁'],
        colLabels: ['in₀', 'in₁'],
        data: [
          [ 0.30, -0.10],
          [ 0.20,  0.50],
        ],
      },
      'mat-attn-wv': {
        rowLabels: ['out₀', 'out₁'],
        colLabels: ['in₀', 'in₁'],
        data: [
          [ 0.40,  0.10],
          [-0.20,  0.60],
        ],
      },
      'mat-attn-wo': {
        rowLabels: ['out₀', 'out₁'],
        colLabels: ['in₀', 'in₁'],
        data: [
          [ 0.60,  0.20],
          [ 0.10,  0.70],
        ],
      },
      'mat-mlp-fc1': {
        rowLabels: ['h₀','h₁','h₂','h₃','h₄','h₅','h₆','h₇'],
        colLabels: ['in₀', 'in₁'],
        data: [
          [ 0.40,  0.10],
          [-0.20,  0.50],
          [ 0.30, -0.30],
          [ 0.10,  0.40],
          [-0.50,  0.20],
          [ 0.20, -0.10],
          [ 0.60,  0.30],
          [-0.10, -0.40],
        ],
      },
      'mat-mlp-fc2': {
        rowLabels: ['out₀', 'out₁'],
        colLabels: ['h₀','h₁','h₂','h₃','h₄','h₅','h₆','h₇'],
        data: [
          [ 0.10,  0.30, -0.20,  0.40,  0.00,  0.20, -0.10,  0.50],
          [-0.30,  0.20,  0.50, -0.10,  0.40, -0.40,  0.30,  0.10],
        ],
      },
      'mat-lm-head': {
        rowLabels: ['BOS', "'a'", "'b'", "'c'"],
        colLabels: ['d₀', 'd₁'],
        data: [
          [ 0.30,  0.10],
          [-0.20,  0.40],
          [ 0.50, -0.30],
          [-0.10,  0.60],
        ],
      },
    };

    function classFor(v) {
      if (Math.abs(v) < 1e-6) return 'mat-cell zero';
      return v > 0 ? 'mat-cell pos' : 'mat-cell neg';
    }

    function fmt(v) {
      const s = v.toFixed(2);
      // pad single-digit negatives so columns line up
      return s.replace('-0.', '−0.').replace(/^([0-9])/, ' $1');
    }

    function render(gridId, readoutId) {
      const grid = document.getElementById(gridId);
      if (!grid) return;
      const spec = TOY[gridId];
      if (!spec) return;
      const readout = readoutId ? document.getElementById(readoutId) : null;
      const rows = spec.data.length;
      const cols = spec.data[0].length;

      // grid: 1 header column for row labels + cols data columns
      grid.style.gridTemplateColumns = `auto repeat(${cols}, minmax(56px, 1fr))`;
      grid.innerHTML = '';

      // Header row: empty corner + column labels
      const corner = document.createElement('div');
      corner.className = 'mat-corner';
      grid.appendChild(corner);
      for (let j = 0; j < cols; j++) {
        const h = document.createElement('div');
        h.className = 'mat-colhdr';
        h.textContent = spec.colLabels[j] ?? `c${j}`;
        grid.appendChild(h);
      }

      const cellEls = [];   // [i][j] → DOM element
      for (let i = 0; i < rows; i++) {
        cellEls[i] = [];
        const rh = document.createElement('div');
        rh.className = 'mat-rowhdr';
        rh.textContent = spec.rowLabels[i] ?? `r${i}`;
        grid.appendChild(rh);
        for (let j = 0; j < cols; j++) {
          const v = spec.data[i][j];
          const d = document.createElement('div');
          d.className = classFor(v);
          d.textContent = fmt(v);
          d.title = `[${i}, ${j}] = ${v.toFixed(2)}`;
          d.dataset.cell = `${i}-${j}`;
          if (readout) {
            d.addEventListener('mouseenter', () => {
              readout.textContent =
                `${spec.rowLabels[i]} · ${spec.colLabels[j]} = ${v.toFixed(2)}`;
            });
          }
          grid.appendChild(d);
          cellEls[i][j] = d;
        }
      }

      // Optional fan diagram (2-in / 2-out connection visualization) for 2×2 attn matrices
      if (spec.fan && rows === 2 && cols === 2) {
        renderFan(spec, grid, readout, cellEls);
      }
    }

    function renderFan(spec, grid, readout, cellEls) {
      const parent = grid.parentNode;
      // Remove any pre-existing fan (idempotent re-render)
      const existing = parent.querySelector('.mat-fan');
      if (existing) existing.remove();
      const fan = document.createElement('div');
      fan.className = 'mat-fan';

      // Layout: viewBox 200 × 140, two inputs at top, two outputs at bottom.
      const inCx  = [55, 145];
      const outCx = [55, 145];
      const inCy  = 26;
      const outCy = 112;
      const r = 14;

      const edgeCls = v => v > 0.01 ? 'pos' : v < -0.01 ? 'neg' : 'zero';

      let svg = '<svg viewBox="0 0 200 144" preserveAspectRatio="xMidYMid meet" class="mat-fan-svg">';

      // Edges: spec.data[i][j] connects in_j (top) → out_i (bottom)
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const v = spec.data[i][j];
          const x1 = inCx[j],  y1 = inCy + r;
          const x2 = outCx[i], y2 = outCy - r;
          svg += `<line class="mat-fan-edge ${edgeCls(v)}" data-edge="${i}-${j}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
        }
      }
      // Input nodes (top)
      for (let j = 0; j < 2; j++) {
        svg += `<circle class="mat-fan-node in" cx="${inCx[j]}" cy="${inCy}" r="${r}"></circle>`;
        svg += `<text class="mat-fan-label" x="${inCx[j]}" y="${inCy + 4}" text-anchor="middle">${spec.colLabels[j]}</text>`;
      }
      // Output nodes (bottom)
      for (let i = 0; i < 2; i++) {
        svg += `<circle class="mat-fan-node out" cx="${outCx[i]}" cy="${outCy}" r="${r}"></circle>`;
        svg += `<text class="mat-fan-label" x="${outCx[i]}" y="${outCy + 4}" text-anchor="middle">${spec.rowLabels[i]}</text>`;
      }
      svg += '</svg>';
      fan.innerHTML = svg;

      // Insert between grid and readout
      if (readout && readout.parentNode === parent) parent.insertBefore(fan, readout);
      else parent.appendChild(fan);

      // Bidirectional hover linking
      const edges = {};
      fan.querySelectorAll('.mat-fan-edge').forEach(e => { edges[e.dataset.edge] = e; });

      function highlight(i, j, on) {
        const key = `${i}-${j}`;
        const edge = edges[key];
        const cell = cellEls[i] && cellEls[i][j];
        if (edge) edge.classList.toggle('hl', on);
        if (cell) cell.classList.toggle('linked-hl', on);
        if (on && readout) {
          const v = spec.data[i][j];
          readout.textContent = `${spec.rowLabels[i]} · ${spec.colLabels[j]} = ${v.toFixed(2)}`;
        }
      }

      // Cell → edge
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const cell = cellEls[i][j];
          if (!cell) continue;
          cell.addEventListener('mouseenter', () => highlight(i, j, true));
          cell.addEventListener('mouseleave', () => highlight(i, j, false));
        }
      }
      // Edge → cell
      fan.querySelectorAll('.mat-fan-edge').forEach(edge => {
        const [i, j] = edge.dataset.edge.split('-').map(Number);
        edge.addEventListener('mouseenter', () => highlight(i, j, true));
        edge.addEventListener('mouseleave', () => highlight(i, j, false));
      });
    }

    const MATRICES = [
      { grid: 'mat-wte',     readout: 'mat-wte-out' },
      { grid: 'mat-wpe',     readout: 'mat-wpe-out' },
      { grid: 'mat-attn-wq', readout: 'mat-attn-wq-out' },
      { grid: 'mat-attn-wk', readout: 'mat-attn-wk-out' },
      { grid: 'mat-attn-wv', readout: 'mat-attn-wv-out' },
      { grid: 'mat-attn-wo', readout: 'mat-attn-wo-out' },
      { grid: 'mat-mlp-fc1', readout: 'mat-mlp-fc1-out' },
      { grid: 'mat-mlp-fc2', readout: 'mat-mlp-fc2-out' },
      { grid: 'mat-lm-head', readout: 'mat-lm-head-out' },
    ];
    MATRICES.forEach(m => render(m.grid, m.readout));

    // Combined Q/K/V fan diagram — shared x̂ inputs, three output groups.
    renderQKVFan();
    // Wo fan diagram — separate network because Wo operates on the attention head output, not on x̂.
    renderWoFan();
    // MLP fan diagram — 2 → 8 → 2 (up-projection, ReLU, down-projection).
    renderMLPFan();

    function renderMLPFan() {
      const svg = document.getElementById('mlp-fan');
      if (!svg) return;
      const fc1 = TOY['mat-mlp-fc1'].data;   // (8 × 2): h[i] = Σ_j fc1[i][j] · in[j]
      const fc2 = TOY['mat-mlp-fc2'].data;   // (2 × 8): out[i] = Σ_j fc2[i][j] · h[j]

      const edgeCls = v => v > 0.01 ? 'pos' : v < -0.01 ? 'neg' : 'zero';

      // Layout (viewBox 760 × 400)
      const inCx  = [340, 420];
      const inCy  = 50;
      const inR   = 16;
      // 8 hidden nodes
      const hCx   = [70, 165, 260, 355, 450, 545, 640, 735].map(x => x - 35 + 30);  // recenter
      // simpler: evenly spaced from 60 to 700
      const hxs = Array.from({ length: 8 }, (_, i) => 60 + i * (640 / 7));  // 60..700
      const hCy   = 215;
      const hR    = 14;
      const outCx = [340, 420];
      const outCy = 360;
      const outR  = 16;

      let h = '';

      // Top label
      h += `<text x="380" y="22" text-anchor="middle" class="qkv-fan-input-label">x̂  · normalized input</text>`;

      // fc1 edges: in[j] (top) → h[i] (middle)
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 2; j++) {
          const v = fc1[i][j];
          const x1 = inCx[j], y1 = inCy + inR;
          const x2 = hxs[i],  y2 = hCy - hR;
          h += `<line class="qkv-fan-edge ${edgeCls(v)}" data-mat="fc1" data-edge="${i}-${j}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
        }
      }
      // fc2 edges: h[j] (middle) → out[i] (bottom)
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 8; j++) {
          const v = fc2[i][j];
          const x1 = hxs[j],   y1 = hCy + hR;
          const x2 = outCx[i], y2 = outCy - outR;
          h += `<line class="qkv-fan-edge ${edgeCls(v)}" data-mat="fc2" data-edge="${i}-${j}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
        }
      }

      // Input nodes
      for (let j = 0; j < 2; j++) {
        h += `<circle class="qkv-fan-node in" cx="${inCx[j]}" cy="${inCy}" r="${inR}"></circle>`;
        h += `<text class="qkv-fan-node-label" x="${inCx[j]}" y="${inCy + 4}" text-anchor="middle">x̂[${j}]</text>`;
      }

      // Hidden layer label + nodes
      h += `<text x="380" y="${hCy - hR - 18}" text-anchor="middle" class="qkv-fan-group-label">h  · hidden (post-ReLU)</text>`;
      for (let i = 0; i < 8; i++) {
        h += `<circle class="qkv-fan-node q" cx="${hxs[i]}" cy="${hCy}" r="${hR}"></circle>`;
        h += `<text class="qkv-fan-node-label" x="${hxs[i]}" y="${hCy + 4}" text-anchor="middle">h${'₀₁₂₃₄₅₆₇'[i]}</text>`;
      }

      // Output label + nodes
      h += `<text x="380" y="${outCy - outR - 12}" text-anchor="middle" class="qkv-fan-group-label">mlp_out  · added to residual</text>`;
      for (let i = 0; i < 2; i++) {
        h += `<circle class="qkv-fan-node v" cx="${outCx[i]}" cy="${outCy}" r="${outR}"></circle>`;
        h += `<text class="qkv-fan-node-label" x="${outCx[i]}" y="${outCy + 4}" text-anchor="middle">out[${i}]</text>`;
      }

      svg.innerHTML = h;

      // Bidirectional hover linking with mlp_fc1 and mlp_fc2 cells.
      const cellMap = {};
      document.querySelectorAll('#mat-mlp-fc1 .mat-cell').forEach(cell => {
        cellMap[`fc1-${cell.dataset.cell}`] = cell;
      });
      document.querySelectorAll('#mat-mlp-fc2 .mat-cell').forEach(cell => {
        cellMap[`fc2-${cell.dataset.cell}`] = cell;
      });
      const edgeMap = {};
      svg.querySelectorAll('.qkv-fan-edge').forEach(edge => {
        edgeMap[`${edge.dataset.mat}-${edge.dataset.edge}`] = edge;
      });

      function highlight(key, on) {
        const edge = edgeMap[key];
        const cell = cellMap[key];
        if (edge) edge.classList.toggle('hl', on);
        if (cell) cell.classList.toggle('linked-hl', on);
      }

      Object.entries(cellMap).forEach(([key, cell]) => {
        cell.addEventListener('mouseenter', () => highlight(key, true));
        cell.addEventListener('mouseleave', () => highlight(key, false));
      });
      Object.entries(edgeMap).forEach(([key, edge]) => {
        edge.addEventListener('mouseenter', () => highlight(key, true));
        edge.addEventListener('mouseleave', () => highlight(key, false));
      });
    }

    function renderWoFan() {
      const svg = document.getElementById('wo-fan');
      if (!svg) return;
      const wo = TOY['mat-attn-wo'].data;
      // Toy walkthrough values (match the callout above):
      // head_out ≈ [0.14, 0.28], x_attn = Wo · head_out ≈ [0.14, 0.21]
      const headOut = [0.14, 0.28];
      const woOut = [
        wo[0][0] * headOut[0] + wo[0][1] * headOut[1],
        wo[1][0] * headOut[0] + wo[1][1] * headOut[1],
      ];

      const f = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
      const edgeCls = v => v > 0.01 ? 'pos' : v < -0.01 ? 'neg' : 'zero';

      // viewBox 460 × 220
      const inCx  = [200, 260];
      const outCx = [200, 260];
      const inCy  = 55;
      const outCy = 168;
      const inR   = 20;
      const outR  = 20;

      let h = '';

      // Top label
      h += `<text x="230" y="22" text-anchor="middle" class="qkv-fan-input-label">Σ wᵢ vᵢ  · attention head output</text>`;

      // Edges (under nodes)
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const v = wo[i][j];
          h += `<line class="qkv-fan-edge ${edgeCls(v)}" data-mat="wo" data-edge="${i}-${j}" x1="${inCx[j]}" y1="${inCy + inR}" x2="${outCx[i]}" y2="${outCy - outR}"></line>`;
        }
      }

      // Input nodes (with values)
      for (let j = 0; j < 2; j++) {
        h += `<circle class="qkv-fan-node in" cx="${inCx[j]}" cy="${inCy}" r="${inR}"></circle>`;
        h += `<text class="qkv-fan-node-value" x="${inCx[j]}" y="${inCy + 4}" text-anchor="middle">${f(headOut[j])}</text>`;
      }
      // Output nodes (with values)
      for (let i = 0; i < 2; i++) {
        h += `<circle class="qkv-fan-node q" cx="${outCx[i]}" cy="${outCy}" r="${outR}"></circle>`;
        h += `<text class="qkv-fan-node-value" x="${outCx[i]}" y="${outCy + 4}" text-anchor="middle">${f(woOut[i])}</text>`;
      }

      // Side captions for left/right labels (above each row of nodes)
      h += `<text x="80" y="${inCy + 5}" text-anchor="middle" class="qkv-fan-node-label" style="font-size:11px;">attn = [</text>`;
      h += `<text x="380" y="${inCy + 5}" text-anchor="middle" class="qkv-fan-node-label" style="font-size:11px;">]</text>`;
      h += `<text x="80" y="${outCy + 5}" text-anchor="middle" class="qkv-fan-node-label" style="font-size:11px;">x_attn = [</text>`;
      h += `<text x="380" y="${outCy + 5}" text-anchor="middle" class="qkv-fan-node-label" style="font-size:11px;">]</text>`;

      svg.innerHTML = h;

      // Bidirectional hover linking with attn_wo cells
      const cellMap = {};
      document.querySelectorAll('#mat-attn-wo .mat-cell').forEach(cell => {
        cellMap[cell.dataset.cell] = cell;
      });
      const edgeMap = {};
      svg.querySelectorAll('.qkv-fan-edge').forEach(edge => {
        edgeMap[edge.dataset.edge] = edge;
      });

      function highlight(key, on) {
        const edge = edgeMap[key];
        const cell = cellMap[key];
        if (edge) edge.classList.toggle('hl', on);
        if (cell) cell.classList.toggle('linked-hl', on);
      }

      Object.entries(cellMap).forEach(([key, cell]) => {
        cell.addEventListener('mouseenter', () => highlight(key, true));
        cell.addEventListener('mouseleave', () => highlight(key, false));
      });
      Object.entries(edgeMap).forEach(([key, edge]) => {
        edge.addEventListener('mouseenter', () => highlight(key, true));
        edge.addEventListener('mouseleave', () => highlight(key, false));
      });
    }

    function renderQKVFan() {
      const svg = document.getElementById('qkv-fan');
      if (!svg) return;
      const specs = [
        { name: 'q', data: TOY['mat-attn-wq'].data, gridId: 'mat-attn-wq', label: 'Q' },
        { name: 'k', data: TOY['mat-attn-wk'].data, gridId: 'mat-attn-wk', label: 'K' },
        { name: 'v', data: TOY['mat-attn-wv'].data, gridId: 'mat-attn-wv', label: 'V' },
      ];

      // Layout (matches the SVG viewBox of 760 × 230)
      const inCx = [340, 420];
      const inCy = 50;
      const inR  = 16;
      const outR = 14;
      const outCy = 175;
      const groupCx = [150, 380, 610];         // centers of Q, K, V groups
      const outCxs  = groupCx.map(c => [c - 30, c + 30]);  // two outputs per group
      const groupLabelY = 142;

      const edgeCls = v => v > 0.01 ? 'pos' : v < -0.01 ? 'neg' : 'zero';

      let h = '';

      // x̂ super-label
      h += `<text x="380" y="22" text-anchor="middle" class="qkv-fan-input-label">x̂  · normalized residual</text>`;

      // Edges first (so nodes sit on top)
      specs.forEach((spec, gi) => {
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            const v = spec.data[i][j];
            const x1 = inCx[j], y1 = inCy + inR;
            const x2 = outCxs[gi][i], y2 = outCy - outR;
            h += `<line class="qkv-fan-edge ${edgeCls(v)}" data-mat="${spec.name}" data-edge="${i}-${j}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`;
          }
        }
      });

      // Input nodes
      for (let j = 0; j < 2; j++) {
        h += `<circle class="qkv-fan-node in" cx="${inCx[j]}" cy="${inCy}" r="${inR}"></circle>`;
        h += `<text class="qkv-fan-node-label" x="${inCx[j]}" y="${inCy + 4}" text-anchor="middle">x̂[${j}]</text>`;
      }

      // Group labels + output nodes
      specs.forEach((spec, gi) => {
        h += `<text class="qkv-fan-group-label" x="${groupCx[gi]}" y="${groupLabelY}" text-anchor="middle">${spec.label}</text>`;
        for (let i = 0; i < 2; i++) {
          const cx = outCxs[gi][i];
          h += `<circle class="qkv-fan-node ${spec.name}" cx="${cx}" cy="${outCy}" r="${outR}"></circle>`;
          h += `<text class="qkv-fan-node-label" x="${cx}" y="${outCy + 4}" text-anchor="middle">${spec.name}[${i}]</text>`;
        }
      });

      svg.innerHTML = h;

      // Build cell ↔ edge maps for bidirectional hover linking.
      // Key: `${matName}-${i}-${j}`
      const cellMap = {};
      const edgeMap = {};
      specs.forEach(spec => {
        document.querySelectorAll(`#${spec.gridId} .mat-cell`).forEach(cell => {
          cellMap[`${spec.name}-${cell.dataset.cell}`] = cell;
        });
      });
      svg.querySelectorAll('.qkv-fan-edge').forEach(edge => {
        edgeMap[`${edge.dataset.mat}-${edge.dataset.edge}`] = edge;
      });

      function highlight(key, on) {
        const edge = edgeMap[key];
        const cell = cellMap[key];
        if (edge) edge.classList.toggle('hl', on);
        if (cell) cell.classList.toggle('linked-hl', on);
      }

      Object.entries(cellMap).forEach(([key, cell]) => {
        cell.addEventListener('mouseenter', () => highlight(key, true));
        cell.addEventListener('mouseleave', () => highlight(key, false));
      });
      Object.entries(edgeMap).forEach(([key, edge]) => {
        edge.addEventListener('mouseenter', () => highlight(key, true));
        edge.addEventListener('mouseleave', () => highlight(key, false));
      });
    }
  })();

  /* ---------------------------------------------------------------- */
  /*  Try-it widget — chat with the trained microgpt                  */
  /* ---------------------------------------------------------------- */
  (function initTryIt() {
    const root = document.getElementById('viz-try-it');
    if (!root) return;
    const chatLog  = document.getElementById('chat-log');
    const chatForm = document.getElementById('chat-form');
    const chatIn   = document.getElementById('chat-input');
    const chatBtn  = document.getElementById('chat-send');
    const tempIn   = document.getElementById('chat-temp');
    const tempVal  = document.getElementById('chat-temp-val');
    if (!chatLog || !chatForm || !chatIn || !chatBtn) return;

    let model = null;
    const MAX_NAMES = 20;
    const DEFAULT_COUNT = 5;
    const FALLBACK_TEMP = 0.7;
    function currentTemp() {
      const v = tempIn ? parseFloat(tempIn.value) : NaN;
      return (isFinite(v) && v > 0) ? v : FALLBACK_TEMP;
    }
    if (tempIn && tempVal) {
      const update = () => { tempVal.textContent = parseFloat(tempIn.value).toFixed(2); };
      tempIn.addEventListener('input', update);
      update();
    }

    // ---------- Source for the downloadable standalone samplers ----------
    // Plain string concatenation (no template-literal interpolation) so this
    // string can sit inside a JS template literal without escaping anything.
    const SAMPLER_JS_SRC = [
      "// sampler.js — generate names from microgpt's trained weights.",
      "// Loads model.json from the current directory.",
      "// Node:    node sampler.js [prefix ...]      one name per prefix arg",
      "//          node sampler.js j                  one name starting with j",
      "//          node sampler.js ab                 one name starting with ab",
      "//          node sampler.js a b c              three names, one each",
      "//          node sampler.js                    one name, no prefix",
      "// Browser: include this file next to model.json on a local server,",
      "//          then in the console: microgpt.generateOne(0.7, 'da')",
      "",
      "(function () {",
      "  function rmsnorm(x, eps) {",
      "    if (eps === undefined) eps = 1e-5;",
      "    let s = 0;",
      "    for (const v of x) s += v * v;",
      "    const sc = 1 / Math.sqrt(s / x.length + eps);",
      "    return x.map(function (v) { return v * sc; });",
      "  }",
      "  function matvec(M, x) {",
      "    return M.map(function (row) {",
      "      let s = 0;",
      "      for (let i = 0; i < x.length; i++) s += row[i] * x[i];",
      "      return s;",
      "    });",
      "  }",
      "  function vecAdd(a, b) { return a.map(function (v, i) { return v + b[i]; }); }",
      "  function softmax(s, t) {",
      "    if (!t) t = 1.0;",
      "    const scaled = s.map(function (v) { return v / t; });",
      "    const m = Math.max.apply(null, scaled);",
      "    const e = scaled.map(function (v) { return Math.exp(v - m); });",
      "    const Z = e.reduce(function (a, b) { return a + b; }, 0);",
      "    return e.map(function (v) { return v / Z; });",
      "  }",
      "  function sampleIdx(p) {",
      "    const r = Math.random();",
      "    let c = 0;",
      "    for (let i = 0; i < p.length; i++) { c += p[i]; if (r < c) return i; }",
      "    return p.length - 1;",
      "  }",
      "",
      "  function makeSampler(model) {",
      "    const cfg = model.config, sd = model.state_dict;",
      "    const itos = model.tokenizer.itos, stoi = model.tokenizer.stoi;",
      "    const BOS = cfg.BOS;",
      "",
      "    function forward(tokenId, posId, keys, values) {",
      "      let x = vecAdd(sd.wte[tokenId], sd.wpe[posId]);",
      "      x = rmsnorm(x);",
      "      for (let li = 0; li < cfg.n_layer; li++) {",
      "        const xr = x;",
      "        let xn = rmsnorm(x);",
      "        const q = matvec(sd['layer' + li + '.attn_wq'], xn);",
      "        const k = matvec(sd['layer' + li + '.attn_wk'], xn);",
      "        const v = matvec(sd['layer' + li + '.attn_wv'], xn);",
      "        keys[li].push(k); values[li].push(v);",
      "        const xa = new Array(cfg.n_embd).fill(0);",
      "        const sqd = Math.sqrt(cfg.head_dim);",
      "        for (let h = 0; h < cfg.n_head; h++) {",
      "          const hs = h * cfg.head_dim, T = keys[li].length;",
      "          const logs = new Array(T);",
      "          let mx = -Infinity;",
      "          for (let t = 0; t < T; t++) {",
      "            let s = 0;",
      "            for (let j = 0; j < cfg.head_dim; j++) s += q[hs+j] * keys[li][t][hs+j];",
      "            logs[t] = s / sqd;",
      "            if (logs[t] > mx) mx = logs[t];",
      "          }",
      "          let Z = 0; const w = new Array(T);",
      "          for (let t = 0; t < T; t++) { w[t] = Math.exp(logs[t] - mx); Z += w[t]; }",
      "          for (let t = 0; t < T; t++) w[t] /= Z;",
      "          for (let t = 0; t < T; t++) {",
      "            const vt = values[li][t];",
      "            for (let j = 0; j < cfg.head_dim; j++) xa[hs+j] += w[t] * vt[hs+j];",
      "          }",
      "        }",
      "        x = vecAdd(matvec(sd['layer' + li + '.attn_wo'], xa), xr);",
      "        const xrm = x;",
      "        let xm = rmsnorm(x);",
      "        xm = matvec(sd['layer' + li + '.mlp_fc1'], xm);",
      "        for (let i = 0; i < xm.length; i++) if (xm[i] < 0) xm[i] = 0;",
      "        xm = matvec(sd['layer' + li + '.mlp_fc2'], xm);",
      "        x = vecAdd(xm, xrm);",
      "      }",
      "      return matvec(sd.lm_head, x);",
      "    }",
      "",
      "    function generateOne(temperature, prefix) {",
      "      if (!temperature) temperature = 0.7;",
      "      const keys = Array.from({length: cfg.n_layer}, function () { return []; });",
      "      const values = Array.from({length: cfg.n_layer}, function () { return []; });",
      "      let tokenId = BOS;",
      "      const chars = [];",
      "      const prefixIds = [];",
      "      if (prefix) {",
      "        for (const ch of String(prefix).toLowerCase()) {",
      "          const id = stoi[ch];",
      "          if (id !== undefined) prefixIds.push(id);",
      "        }",
      "      }",
      "      for (let pos = 0; pos < cfg.block_size; pos++) {",
      "        const logits = forward(tokenId, pos, keys, values);",
      "        if (pos < prefixIds.length) tokenId = prefixIds[pos];",
      "        else tokenId = sampleIdx(softmax(logits, temperature));",
      "        if (tokenId === BOS) break;",
      "        chars.push(itos[String(tokenId)]);",
      "      }",
      "      return chars.join('');",
      "    }",
      "    return { generateOne: generateOne, config: cfg };",
      "  }",
      "",
      "  if (typeof require !== 'undefined' && typeof module !== 'undefined') {",
      "    const fs = require('fs');",
      "    const model = JSON.parse(fs.readFileSync('model.json', 'utf-8'));",
      "    const samp = makeSampler(model);",
      "    const args = process.argv.slice(2);",
      "    const prefixes = args.length ? args : [null];",
      "    for (const px of prefixes) console.log(samp.generateOne(0.7, px || null));",
      "  } else if (typeof window !== 'undefined') {",
      "    fetch('model.json').then(function (r) { return r.json(); }).then(function (model) {",
      "      window.microgpt = makeSampler(model);",
      "      console.log('microgpt loaded — try: microgpt.generateOne(0.7, \"da\")');",
      "    });",
      "  }",
      "})();",
      "",
    ].join('\n');

    const SAMPLER_PY_SRC = [
      "# sampler.py — generate names from microgpt's trained weights.",
      "# Loads model.json from the current directory.",
      "# Usage: python sampler.py [prefix ...]   one name per prefix arg",
      "#   python sampler.py j                   one name starting with j",
      "#   python sampler.py ab                  one name starting with ab",
      "#   python sampler.py a b c               three names, one each",
      "#   python sampler.py                     one name, no prefix",
      "",
      "import json, math, random, sys",
      "",
      "with open('model.json') as f:",
      "    model = json.load(f)",
      "",
      "cfg  = model['config']",
      "sd   = model['state_dict']",
      "itos = model['tokenizer']['itos']",
      "stoi = model['tokenizer']['stoi']",
      "BOS  = cfg['BOS']",
      "",
      "def rmsnorm(x, eps=1e-5):",
      "    ms = sum(v * v for v in x) / len(x)",
      "    s = 1 / math.sqrt(ms + eps)",
      "    return [v * s for v in x]",
      "",
      "def matvec(M, x):",
      "    return [sum(r[j] * x[j] for j in range(len(x))) for r in M]",
      "",
      "def vec_add(a, b):",
      "    return [u + v for u, v in zip(a, b)]",
      "",
      "def softmax(s, t=1.0):",
      "    scaled = [v / t for v in s]",
      "    m = max(scaled)",
      "    exps = [math.exp(v - m) for v in scaled]",
      "    Z = sum(exps)",
      "    return [e / Z for e in exps]",
      "",
      "def sample_idx(probs):",
      "    r = random.random()",
      "    c = 0",
      "    for i, p in enumerate(probs):",
      "        c += p",
      "        if r < c:",
      "            return i",
      "    return len(probs) - 1",
      "",
      "def forward(token_id, pos_id, keys, values):",
      "    x = vec_add(sd['wte'][token_id], sd['wpe'][pos_id])",
      "    x = rmsnorm(x)",
      "    for li in range(cfg['n_layer']):",
      "        x_res = x",
      "        xn = rmsnorm(x)",
      "        q = matvec(sd[f'layer{li}.attn_wq'], xn)",
      "        k = matvec(sd[f'layer{li}.attn_wk'], xn)",
      "        v = matvec(sd[f'layer{li}.attn_wv'], xn)",
      "        keys[li].append(k)",
      "        values[li].append(v)",
      "        x_attn = [0.0] * cfg['n_embd']",
      "        sqrt_dh = math.sqrt(cfg['head_dim'])",
      "        for h in range(cfg['n_head']):",
      "            hs = h * cfg['head_dim']",
      "            logits = [sum(q[hs+j] * kt[hs+j] for j in range(cfg['head_dim'])) / sqrt_dh",
      "                      for kt in keys[li]]",
      "            mx = max(logits)",
      "            exps = [math.exp(L - mx) for L in logits]",
      "            Z = sum(exps)",
      "            w = [e / Z for e in exps]",
      "            for t, vt in enumerate(values[li]):",
      "                for j in range(cfg['head_dim']):",
      "                    x_attn[hs+j] += w[t] * vt[hs+j]",
      "        x = vec_add(matvec(sd[f'layer{li}.attn_wo'], x_attn), x_res)",
      "        x_res_mlp = x",
      "        xm = rmsnorm(x)",
      "        xm = matvec(sd[f'layer{li}.mlp_fc1'], xm)",
      "        xm = [max(0.0, v) for v in xm]",
      "        xm = matvec(sd[f'layer{li}.mlp_fc2'], xm)",
      "        x = vec_add(xm, x_res_mlp)",
      "    return matvec(sd['lm_head'], x)",
      "",
      "def generate_one(temperature=0.7, prefix=None):",
      "    keys   = [[] for _ in range(cfg['n_layer'])]",
      "    values = [[] for _ in range(cfg['n_layer'])]",
      "    token_id = BOS",
      "    chars = []",
      "    prefix_ids = []",
      "    if prefix:",
      "        for ch in prefix.lower():",
      "            if ch in stoi:",
      "                prefix_ids.append(stoi[ch])",
      "    for pos in range(cfg['block_size']):",
      "        logits = forward(token_id, pos, keys, values)",
      "        if pos < len(prefix_ids):",
      "            token_id = prefix_ids[pos]",
      "        else:",
      "            probs = softmax(logits, temperature)",
      "            token_id = sample_idx(probs)",
      "        if token_id == BOS:",
      "            break",
      "        chars.append(itos[str(token_id)])",
      "    return ''.join(chars)",
      "",
      "if __name__ == '__main__':",
      "    prefixes = sys.argv[1:] or [None]",
      "    for px in prefixes:",
      "        print(generate_one(0.7, px))",
      "",
    ].join('\n');

    // --- minimal numeric helpers (specific to this widget; no external state) ---
    function rmsnorm(x, eps = 1e-5) {
      let ms = 0;
      for (let i = 0; i < x.length; i++) ms += x[i] * x[i];
      ms /= x.length;
      const scale = 1 / Math.sqrt(ms + eps);
      const out = new Array(x.length);
      for (let i = 0; i < x.length; i++) out[i] = x[i] * scale;
      return out;
    }
    function matvec(M, x) {
      const rows = M.length;
      const cols = x.length;
      const out = new Array(rows);
      for (let i = 0; i < rows; i++) {
        const row = M[i];
        let s = 0;
        for (let j = 0; j < cols; j++) s += row[j] * x[j];
        out[i] = s;
      }
      return out;
    }
    function vecAdd(a, b) {
      const out = new Array(a.length);
      for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
      return out;
    }
    function softmaxTemp(s, t) {
      let m = -Infinity;
      const scaled = new Array(s.length);
      for (let i = 0; i < s.length; i++) { scaled[i] = s[i] / t; if (scaled[i] > m) m = scaled[i]; }
      let sum = 0;
      const exps = new Array(s.length);
      for (let i = 0; i < s.length; i++) { exps[i] = Math.exp(scaled[i] - m); sum += exps[i]; }
      for (let i = 0; i < s.length; i++) exps[i] /= sum;
      return exps;
    }
    function sample(probs) {
      const r = Math.random();
      let cum = 0;
      for (let i = 0; i < probs.length; i++) {
        cum += probs[i];
        if (r < cum) return i;
      }
      return probs.length - 1;
    }

    function forward(tokenId, posId, keys, values) {
      const sd = model.state_dict;
      const cfg = model.config;
      let x = vecAdd(sd.wte[tokenId], sd.wpe[posId]);
      x = rmsnorm(x);

      for (let li = 0; li < cfg.n_layer; li++) {
        const xRes = x;
        let xn = rmsnorm(x);
        const q = matvec(sd[`layer${li}.attn_wq`], xn);
        const k = matvec(sd[`layer${li}.attn_wk`], xn);
        const v = matvec(sd[`layer${li}.attn_wv`], xn);
        keys[li].push(k);
        values[li].push(v);

        const xAttn = new Array(cfg.n_embd).fill(0);
        const sqrtDh = Math.sqrt(cfg.head_dim);
        for (let h = 0; h < cfg.n_head; h++) {
          const hs = h * cfg.head_dim;
          // scores
          const T = keys[li].length;
          const logits = new Array(T);
          let maxL = -Infinity;
          for (let t = 0; t < T; t++) {
            let s = 0;
            const kt = keys[li][t];
            for (let j = 0; j < cfg.head_dim; j++) s += q[hs + j] * kt[hs + j];
            logits[t] = s / sqrtDh;
            if (logits[t] > maxL) maxL = logits[t];
          }
          // softmax
          let sumExp = 0;
          const w = new Array(T);
          for (let t = 0; t < T; t++) { w[t] = Math.exp(logits[t] - maxL); sumExp += w[t]; }
          for (let t = 0; t < T; t++) w[t] /= sumExp;
          // weighted sum of v
          for (let t = 0; t < T; t++) {
            const vt = values[li][t];
            const wt = w[t];
            for (let j = 0; j < cfg.head_dim; j++) xAttn[hs + j] += wt * vt[hs + j];
          }
        }

        x = vecAdd(matvec(sd[`layer${li}.attn_wo`], xAttn), xRes);

        // MLP block
        const xResMlp = x;
        let xm = rmsnorm(x);
        xm = matvec(sd[`layer${li}.mlp_fc1`], xm);
        for (let i = 0; i < xm.length; i++) if (xm[i] < 0) xm[i] = 0;
        xm = matvec(sd[`layer${li}.mlp_fc2`], xm);
        x = vecAdd(xm, xResMlp);
      }
      return matvec(sd.lm_head, x);
    }

    // Sample one name. If prefix is provided (e.g. "j", "da"), force the first
    // prefix.length sampled tokens to be those letters; the rest is sampled normally.
    function generateOne(temperature, prefix) {
      const cfg = model.config;
      const BOS = cfg.BOS;
      const keys   = Array.from({ length: cfg.n_layer }, () => []);
      const values = Array.from({ length: cfg.n_layer }, () => []);
      let tokenId = BOS;
      const chars = [];
      const prefixIds = [];
      if (prefix) {
        for (const ch of prefix.toLowerCase()) {
          const id = model.tokenizer.stoi[ch];
          if (id !== undefined) prefixIds.push(id);
        }
      }
      for (let pos = 0; pos < cfg.block_size; pos++) {
        const logits = forward(tokenId, pos, keys, values);
        if (pos < prefixIds.length) {
          tokenId = prefixIds[pos];
        } else {
          tokenId = sample(softmaxTemp(logits, temperature));
        }
        if (tokenId === BOS) break;
        chars.push(model.tokenizer.itos[String(tokenId)]);
      }
      return chars.join('');
    }

    // ----- Minimal chat flow -----
    // Stage 1: user types a single letter → one generated name.
    // Stage 2 (after first input): user types multiple letters:
    //   "ab"  → one name starting with "ab"
    //   "a b" → two names, one each starting with "a" and "b"
    // No greetings, no help, no count parsing. Just run the model.
    const chatPromptEl = document.getElementById('chat-prompt');
    let firstInputDone = false;

    function userSay(text) {
      const wrap = document.createElement('div');
      wrap.className = 'chat-msg user';
      const bubble = document.createElement('span');
      bubble.className = 'chat-bubble';
      bubble.textContent = text;
      wrap.appendChild(bubble);
      chatLog.appendChild(wrap);
      chatLog.scrollTop = chatLog.scrollHeight;
    }
    function botBubble() {
      const wrap = document.createElement('div');
      wrap.className = 'chat-msg bot';
      const bubble = document.createElement('span');
      bubble.className = 'chat-bubble';
      wrap.appendChild(bubble);
      chatLog.appendChild(wrap);
      chatLog.scrollTop = chatLog.scrollHeight;
      return bubble;
    }

    function setBusy(busy) {
      chatBtn.disabled = busy || !model;
      chatIn.disabled  = busy || !model;
      chatBtn.textContent = busy ? 'Generating…' : 'Send';
    }

    // Build a pill that bolds the forced prefix in the generated name.
    function namePill(prefix, name) {
      const pill = document.createElement('span');
      pill.className = 'try-name fresh';
      const px = (prefix || '').toLowerCase();
      if (px && name.toLowerCase().startsWith(px)) {
        const head = document.createElement('span');
        head.className = 'pfx';
        head.textContent = name.slice(0, px.length);
        pill.appendChild(head);
        pill.appendChild(document.createTextNode(name.slice(px.length)));
      } else {
        pill.textContent = name;
      }
      setTimeout(() => pill.classList.remove('fresh'), 220);
      return pill;
    }

    function generateForPrefixes(prefixes) {
      const bubble = botBubble();
      const grid = document.createElement('span');
      grid.className = 'try-names-grid';
      bubble.appendChild(grid);
      let i = 0;
      function step() {
        if (i >= prefixes.length) { setBusy(false); return; }
        const px = prefixes[i];
        // Up to a few retries if the model immediately emits BOS.
        let name = '';
        const t = currentTemp();
        for (let attempt = 0; attempt < 5 && !name; attempt++) name = generateOne(t, px);
        if (!name) name = px || '?';
        grid.appendChild(namePill(px, name));
        chatLog.scrollTop = chatLog.scrollHeight;
        i++;
        if (i < prefixes.length) requestAnimationFrame(step);
        else setBusy(false);
      }
      setBusy(true);
      requestAnimationFrame(step);
    }

    function updatePromptStage(stage) {
      if (!chatPromptEl) return;
      if (stage === 1) {
        chatPromptEl.innerHTML = 'Type a single letter and press <kbd>Enter</kbd>.';
      } else {
        chatPromptEl.innerHTML =
          'Now try <strong>2 or more letters</strong>. Combine them (<code>ab</code>) for one name with that prefix, ' +
          'or separate with a space (<code>a b</code>) for one name per letter.';
      }
    }

    function handleRequest(rawText) {
      const text = rawText.trim();
      if (!text) return;
      if (!model) return;
      userSay(text);
      chatIn.value = '';

      // Each whitespace-separated token is one prefix. Filter to a–z only.
      const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
      const prefixes = tokens
        .map(t => t.replace(/[^a-z]/g, ''))
        .filter(t => t.length > 0);
      if (!prefixes.length) {
        chatIn.focus();
        return;
      }
      generateForPrefixes(prefixes);

      if (!firstInputDone) {
        firstInputDone = true;
        updatePromptStage(2);
        chatIn.placeholder = 'e.g. ab  or  a b';
      }
    }

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleRequest(chatIn.value);
    });
    updatePromptStage(1);

    // ----- Download buttons: standalone JS + Python samplers -----
    function downloadAs(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    const dlJs = document.getElementById('dl-js');
    const dlPy = document.getElementById('dl-py');
    if (dlJs) dlJs.addEventListener('click', () => downloadAs('sampler.js', SAMPLER_JS_SRC, 'application/javascript'));
    if (dlPy) dlPy.addEventListener('click', () => downloadAs('sampler.py', SAMPLER_PY_SRC, 'text/x-python'));

    // Load the model.json that sits next to the lab HTML.
    fetch('model.json')
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(m => {
        if (!m.state_dict || !m.config || !m.tokenizer) throw new Error('unexpected model.json shape');
        model = m;
        chatBtn.disabled = false;
        chatIn.disabled = false;
        chatBtn.textContent = 'Send';
        chatIn.focus();
      })
      .catch(err => {
        chatBtn.disabled = true;
        chatIn.disabled = true;
        chatBtn.textContent = 'Model unavailable';
        if (chatPromptEl) {
          chatPromptEl.innerHTML =
            'Couldn\'t load <code>model.json</code> — if you opened this file directly (<code>file://</code>) browsers block local fetches. ' +
            'Serve the folder with <code>python3 -m http.server</code> and reload over <code>http://localhost:8000/</code>.';
        }
      });
  })();

  /* ---------------------------------------------------------------- */
  /*  SGD intuition widget — interactive parabolic loss curve         */
  /* ---------------------------------------------------------------- */
  (function initSgdIntuition() {
    const root = document.getElementById('viz-sgd-intuition');
    if (!root) return;
    const slider = document.getElementById('sgd-p');
    const valEl  = document.getElementById('sgd-p-val');
    const svg    = document.getElementById('sgd-svg');
    const explain = document.getElementById('sgd-explain');
    if (!slider || !svg || !explain) return;

    // L(p) = 0.5 * p²  →  L'(p) = p
    const loss = p => 0.5 * p * p;
    const grad = p => p;
    const LR   = 0.5;  // exaggerated learning rate so the arrow is visible

    // ViewBox: 600 × 320
    // p axis: [-3.5, 3.5] → x: [60, 540]
    // loss:  [0, 7]       → y: [275, 35]  (parabola peaks at p = ±3.5, L = 6.125)
    const X_LEFT = 60, X_RIGHT = 540;
    const Y_BOTTOM = 275, Y_TOP = 35;
    const P_MIN = -3.5, P_MAX = 3.5;
    const L_MIN = 0, L_MAX = 7;
    const xToSvg = p => X_LEFT + (p - P_MIN) * (X_RIGHT - X_LEFT) / (P_MAX - P_MIN);
    const yToSvg = y => Y_BOTTOM - (y - L_MIN) * (Y_BOTTOM - Y_TOP) / (L_MAX - L_MIN);

    const fmt = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);

    function render() {
      const p  = parseFloat(slider.value);
      const y  = loss(p);
      const g  = grad(p);
      const newP = p - LR * g;
      valEl.textContent = fmt(p);

      let h = '';
      // Defs: arrow head
      h += `<defs><marker id="sgd-arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="sgd-arrow-head"/></marker></defs>`;

      // Parabola
      let d = '';
      for (let i = 0; i <= 80; i++) {
        const pi = P_MIN + (i / 80) * (P_MAX - P_MIN);
        const yi = loss(pi);
        d += (i === 0 ? 'M ' : 'L ') + xToSvg(pi).toFixed(1) + ' ' + yToSvg(yi).toFixed(1) + ' ';
      }
      h += `<path d="${d}" class="sgd-curve"/>`;

      // p-axis (horizontal line at L = 0)
      h += `<line x1="${xToSvg(P_MIN)}" y1="${yToSvg(0)}" x2="${xToSvg(P_MAX)}" y2="${yToSvg(0)}" class="sgd-axis"/>`;
      // Minimum marker: dashed vertical at p = 0
      h += `<line x1="${xToSvg(0)}" y1="${yToSvg(0) + 6}" x2="${xToSvg(0)}" y2="${yToSvg(6.5)}" class="sgd-min-marker"/>`;
      h += `<text x="${xToSvg(0)}" y="${yToSvg(0) + 22}" text-anchor="middle" class="sgd-axis-label">minimum (p = 0)</text>`;

      // Loss axis label
      h += `<text x="38" y="${yToSvg(3.5)}" text-anchor="middle" class="sgd-axis-label" transform="rotate(-90 38 ${yToSvg(3.5)})">L(p)</text>`;
      // p axis end label
      h += `<text x="${xToSvg(P_MAX) + 16}" y="${yToSvg(0) + 4}" class="sgd-axis-label">p</text>`;

      // Tangent line at point
      const tangSpan = 1.4;
      const tangP1 = Math.max(P_MIN, p - tangSpan);
      const tangP2 = Math.min(P_MAX, p + tangSpan);
      const tangY1 = y + g * (tangP1 - p);
      const tangY2 = y + g * (tangP2 - p);
      h += `<line x1="${xToSvg(tangP1)}" y1="${yToSvg(tangY1)}" x2="${xToSvg(tangP2)}" y2="${yToSvg(tangY2)}" class="sgd-tangent"/>`;
      // Gradient label, placed near the tangent's high end
      const labelP = g >= 0 ? tangP2 + 0.1 : tangP1 - 0.1;
      const labelY = g >= 0 ? tangY2 : tangY1;
      const labelAnchor = g >= 0 ? 'start' : 'end';
      h += `<text x="${xToSvg(labelP)}" y="${yToSvg(labelY) - 6}" text-anchor="${labelAnchor}" class="sgd-grad-label">grad = ${fmt(g)}</text>`;

      // Step arrow on the p-axis (just below it for visibility): p → p - LR*g
      const arrowY = yToSvg(0) + 38;
      if (Math.abs(g) > 0.02) {
        h += `<line x1="${xToSvg(p)}" y1="${arrowY}" x2="${xToSvg(newP)}" y2="${arrowY}" class="sgd-arrow" marker-end="url(#sgd-arrow-head)"/>`;
        const midX = (xToSvg(p) + xToSvg(newP)) / 2;
        h += `<text x="${midX}" y="${arrowY + 16}" text-anchor="middle" class="sgd-arrow-label">−lr · grad = ${fmt(-LR * g)}</text>`;
      } else {
        h += `<text x="${xToSvg(p)}" y="${arrowY + 4}" text-anchor="middle" class="sgd-arrow-label">grad ≈ 0 — no step</text>`;
      }

      // Current point + a tiny tick on the axis
      h += `<line x1="${xToSvg(p)}" y1="${yToSvg(0) - 4}" x2="${xToSvg(p)}" y2="${yToSvg(0) + 4}" class="sgd-axis"/>`;
      h += `<circle cx="${xToSvg(p)}" cy="${yToSvg(y)}" r="7" class="sgd-point"/>`;

      svg.innerHTML = h;

      // Explanation panel
      let direction, reason;
      if (g > 0.02) {
        direction = `<strong>moves LEFT</strong> (toward the minimum)`;
        reason = `Gradient is <em>positive</em> — increasing <code>p</code> would <em>raise</em> the loss, so the positive-gradient direction points away from the minimum. The update <code>p -= ${LR} · (+${g.toFixed(2)})</code> subtracts a positive number, so <code>p</code> goes down.`;
      } else if (g < -0.02) {
        direction = `<strong>moves RIGHT</strong> (toward the minimum)`;
        reason = `Gradient is <em>negative</em> — decreasing <code>p</code> would <em>raise</em> the loss, so the negative-gradient direction points <em>toward</em> the minimum. The update <code>p -= ${LR} · (${g.toFixed(2)})</code> subtracts a negative number — i.e. adds — so <code>p</code> goes up.`;
      } else {
        direction = `<strong>stays put</strong> (we're at the minimum)`;
        reason = `Gradient is ≈ 0. The update doesn't move <code>p</code> — we've reached the optimum.`;
      }
      explain.innerHTML =
        `<div class="sgd-explain-row">p = <strong>${fmt(p)}</strong> &nbsp;·&nbsp; grad = <strong>${fmt(g)}</strong> &nbsp;·&nbsp; p − lr · grad = <strong>${fmt(newP)}</strong> → ${direction}</div>` +
        `<div class="sgd-explain-reason">${reason}</div>`;
    }

    slider.addEventListener('input', render);
    root.querySelectorAll('[data-sgd-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        slider.value = btn.dataset.sgdPreset;
        render();
      });
    });
    render();
  })();

  /* ---------------------------------------------------------------- */
  /*  Annotated gpt() code — hover a line to see what it does         */
  /* ---------------------------------------------------------------- */
  (function initAnnotatedCode() {
    const root = document.getElementById('gpt-annotated');
    const panel = document.getElementById('gpt-explain');
    if (!root || !panel) return;
    const tagEl = panel.querySelector('.code-explain-tag');
    const textEl = panel.querySelector('.code-explain-text');
    if (!tagEl || !textEl) return;
    const defaultTag = tagEl.textContent;
    const defaultText = textEl.innerHTML;

    // Lightweight Python syntax highlighter that emits Prism's token classes,
    // so the existing Prism CSS theme paints the code. We can't use Prism itself
    // here because each line is its own <div> (for hover scoping).
    const KEYWORDS = new Set(['def','for','in','return','if','else','elif','None','True','False','and','or','not','lambda','class','import','from','as','with','while','break','continue','pass','yield','global','nonlocal','raise','try','except','finally']);
    const BUILTINS = new Set(['range','len','zip','print','sum','enumerate','map','filter','list','dict','tuple','set','int','float','str','bool','abs','min','max','round','sorted','reversed']);
    const escapeHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    function highlight(text) {
      // Single master regex — order matters: comments first, then strings, then numbers/idents.
      const re = /(#[^\n]*)|(f'(?:[^'\\]|\\.)*'|f"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
      let out = '';
      let last = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) out += escapeHtml(text.substring(last, m.index));
        let cls = null;
        let body = m[0];
        if (m[1])      cls = 'comment';
        else if (m[2]) cls = 'string';
        else if (m[3]) cls = 'number';
        else if (m[4]) {
          const word = m[4];
          if (KEYWORDS.has(word)) cls = 'keyword';
          else if (BUILTINS.has(word)) cls = 'builtin';
          else {
            // Check if it's a function call (followed by '(')
            const rest = text.substring(m.index + word.length);
            if (/^\s*\(/.test(rest)) cls = 'function';
          }
        }
        if (cls) out += `<span class="token ${cls}">${escapeHtml(body)}</span>`;
        else out += escapeHtml(body);
        last = m.index + m[0].length;
      }
      if (last < text.length) out += escapeHtml(text.substring(last));
      return out;
    }

    // Highlight each line, preserving the wrapper div + data attributes.
    root.querySelectorAll('.code-step').forEach(el => {
      el.innerHTML = highlight(el.textContent);
    });

    root.querySelectorAll('.code-step[data-explain]').forEach(el => {
      const step = el.dataset.step;
      const peers = root.querySelectorAll(`.code-step[data-step="${step}"]`);
      el.addEventListener('mouseenter', () => {
        peers.forEach(p => p.classList.add('active'));
        tagEl.textContent = el.dataset.stepName || step;
        textEl.innerHTML = el.dataset.explain;
      });
      el.addEventListener('mouseleave', () => {
        peers.forEach(p => p.classList.remove('active'));
        tagEl.textContent = defaultTag;
        textEl.innerHTML = defaultText;
      });
    });
  })();

  /* ---------------------------------------------------------------- */
  /*  Active TOC link as you scroll                                   */
  /* ---------------------------------------------------------------- */
  const headings = Array.from(document.querySelectorAll('main h2[id], main header[id]'));
  const tocLinks = Array.from(document.querySelectorAll('aside.toc a'));
  function updateActiveToc() {
    const scrollTop = window.scrollY + 100;
    let active = headings[0];
    for (const h of headings) {
      if (h.offsetTop <= scrollTop) active = h;
    }
    if (!active) return;
    tocLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + active.id));
  }
  window.addEventListener('scroll', updateActiveToc, { passive: true });
  updateActiveToc();
})();


/* ============================================================
 * Widget · gradient descent over multiple steps (#viz-gd-steps)
 *   Reuses the Case-4 toy (x=3, y=10, w=2, b=1). Each click does one
 *   SGD step: forward → grads (2·err·x, 2·err) → update w,b by −lr·grad.
 *   Shows ŷ climbing to the target and loss shrinking over 4 steps.
 * ============================================================ */
(function initGdSteps() {
  'use strict';
  var root = document.getElementById('viz-gd-steps');
  if (!root) return;
  var NS = 'http://www.w3.org/2000/svg';
  function svg(name, attrs, parent, text) {
    var n = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  var X = 3, Y = 10, LR = 0.02, MAXSTEP = 4, W0 = 2, B0 = 1, LOSS0 = 9;

  var graph    = root.querySelector('#gd-graph');
  var track    = root.querySelector('#gd-track');
  var fwd      = root.querySelector('#gd-forward');
  var cardW    = root.querySelector('#gd-card-w');
  var cardB    = root.querySelector('#gd-card-b');
  var lossFill = root.querySelector('#gd-loss-fill');
  var lossVal  = root.querySelector('#gd-loss-val');
  var stepEl   = root.querySelector('#gd-step');
  var nextBtn  = root.querySelector('#gd-next');
  var resetBtn = root.querySelector('#gd-reset');

  var step, w, b, ghosts;

  function f(n, d) { return n.toFixed(d == null ? 2 : d); }
  function cls(n) { return n >= 0 ? 'gd-pos' : 'gd-neg'; }
  function signed(n, d) { d = d == null ? 2 : d; return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d); }
  function gfmt(n) { var s = Number.isInteger(n) ? String(n) : n.toFixed(2); return s.replace('-', '−'); }

  // ---- computation graph (mirrors Case 4) ----
  var GR = 22;
  var GNODES = {
    w:    { x: 56,  y: 48,  label: 'w (param)' },
    x:    { x: 56,  y: 120, label: 'x (data)' },
    b:    { x: 56,  y: 200, label: 'b (param)' },
    y:    { x: 56,  y: 266, label: 'y (target)' },
    z:    { x: 222, y: 84,  label: 'z = w·x' },
    yhat: { x: 376, y: 152, label: 'ŷ = z+b' },
    err:  { x: 506, y: 212, label: 'err = ŷ−y' },
    loss: { x: 604, y: 212, label: 'loss = err²' }
  };
  var GEDGES = [['w','z'],['x','z'],['z','yhat'],['b','yhat'],['yhat','err'],['y','err'],['err','loss']];
  function drawGraph(vals, ed) {
    graph.innerHTML = '';
    var defs = svg('defs', null, graph);
    var mk = svg('marker', { id: 'gd-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
    svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'gd-arrowhead' }, mk);
    GEDGES.forEach(function (e) {
      var a = GNODES[e[0]], c = GNODES[e[1]];
      var dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      var x1 = a.x + ux * GR, y1 = a.y + uy * GR, x2 = c.x - ux * (GR + 6), y2 = c.y - uy * (GR + 6);
      svg('line', { x1: x1, y1: y1, x2: x2, y2: y2, class: 'gd-edge', 'marker-end': 'url(#gd-arrow)' }, graph);
      svg('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 5, 'text-anchor': 'middle', class: 'gd-edge-label' }, graph, ed[e[0] + '>' + e[1]]);
    });
    Object.keys(GNODES).forEach(function (k) {
      var n = GNODES[k];
      svg('text', { x: n.x, y: n.y - GR - 7, 'text-anchor': 'middle', class: 'gd-node-label' }, graph, n.label);
      svg('circle', { cx: n.x, cy: n.y, r: GR, class: 'gd-node' }, graph);
      svg('text', { x: n.x, y: n.y + 4, 'text-anchor': 'middle', class: 'gd-node-val' }, graph, vals[k]);
    });
  }

  // prediction track geometry
  var AXMIN = 6, AXMAX = 11, AX0 = 48, AX1 = 552, AY = 60;
  function px(v) { return AX0 + (v - AXMIN) / (AXMAX - AXMIN) * (AX1 - AX0); }

  function drawTrack(yhat) {
    track.innerHTML = '';
    svg('line', { x1: AX0, y1: AY, x2: AX1, y2: AY, class: 'gd-axis' }, track);
    for (var v = AXMIN; v <= AXMAX; v++) {
      svg('line', { x1: px(v), y1: AY - 4, x2: px(v), y2: AY + 4, class: 'gd-tick' }, track);
      svg('text', { x: px(v), y: AY + 19, 'text-anchor': 'middle' }, track, String(v));
    }
    // target marker
    svg('line', { x1: px(Y), y1: AY - 28, x2: px(Y), y2: AY + 8, class: 'gd-target-line' }, track);
    svg('text', { x: px(Y), y: AY - 32, 'text-anchor': 'middle', class: 'gd-target-label' }, track, 'target y = 10');
    // ghosts (previous predictions)
    ghosts.forEach(function (g) { svg('circle', { cx: px(g), cy: AY, r: 4, class: 'gd-ghost' }, track); });
    // err connector ŷ → target
    svg('line', { x1: px(yhat), y1: AY, x2: px(Y), y2: AY, class: 'gd-err' }, track);
    // current prediction
    svg('circle', { cx: px(yhat), cy: AY, r: 7, class: 'gd-yhat' }, track);
    svg('text', { x: px(yhat), y: AY - 13, 'text-anchor': 'middle', class: 'gd-yhat-label' }, track, 'ŷ = ' + f(yhat));
  }

  function card(name, val, grad, gradExpr) {
    var nudge = -LR * grad;
    var next = val + nudge;
    var atEnd = step >= MAXSTEP;
    var html = '<div class="gd-card-head"><span class="gd-card-name">' + name + '</span>'
      + '<span class="gd-card-transition">' + f(val) + (atEnd ? '' : ' → ' + f(next)) + '</span></div>'
      + '<div class="gd-card-row">∂loss/∂' + name + ' = ' + gradExpr
      + ' = <span class="' + cls(grad) + '">' + f(grad, 1) + '</span></div>';
    if (atEnd) {
      html += '<div class="gd-card-row gd-muted">4 steps done — ↺ Reset to replay</div>';
    } else {
      html += '<div class="gd-card-row">nudge = −lr·grad = <span class="gd-nudge">−0.02 × (' + f(grad, 1) + ')</span> = <span class="' + cls(nudge) + '">' + signed(nudge) + '</span></div>'
        + '<div class="gd-card-row gd-next-row">' + name + ': ' + f(val) + ' ' + (nudge >= 0 ? '+' : '−') + ' ' + Math.abs(nudge).toFixed(2) + ' = <span class="gd-num">' + f(next) + '</span></div>';
    }
    return html;
  }

  function render() {
    var yhat = w * X + b, err = yhat - Y, loss = err * err;
    var gw = 2 * err * X, gb = 2 * err;
    var z = w * X;
    drawGraph(
      { w: gfmt(w), x: gfmt(X), b: gfmt(b), y: gfmt(Y), z: gfmt(z), yhat: gfmt(yhat), err: gfmt(err), loss: gfmt(loss) },
      { 'w>z': '∂=' + gfmt(X), 'x>z': '∂=' + gfmt(w), 'z>yhat': '∂=1', 'b>yhat': '∂=1', 'yhat>err': '∂=1', 'y>err': '∂=−1', 'err>loss': '∂=' + gfmt(gb) }
    );
    drawTrack(yhat);
    fwd.innerHTML =
      'ŷ = w·x + b = <span class="gd-num">' + f(w) + '</span>·3 + <span class="gd-num">' + f(b) + '</span> = <span class="gd-num">' + f(yhat) + '</span>'
      + '<span class="gd-dot">·</span>err = ŷ − y = <span class="gd-num ' + cls(err) + '">' + f(err) + '</span>'
      + '<span class="gd-dot">·</span>loss = err² = <span class="gd-num">' + f(loss) + '</span>';
    cardW.innerHTML = card('w', w, gw, '2·err·x');
    cardB.innerHTML = card('b', b, gb, '2·err');
    lossFill.style.width = Math.max(2, loss / LOSS0 * 100) + '%';
    lossVal.textContent = f(loss);
    stepEl.textContent = 'step ' + step + ' / ' + MAXSTEP;
    nextBtn.disabled = step >= MAXSTEP;
  }

  function next() {
    if (step >= MAXSTEP) return;
    var yhat = w * X + b, err = yhat - Y;
    ghosts.push(yhat);
    w = w - LR * (2 * err * X);
    b = b - LR * (2 * err);
    step++;
    render();
  }

  function reset() { step = 0; w = W0; b = B0; ghosts = []; render(); }

  nextBtn.addEventListener('click', next);
  resetBtn.addEventListener('click', reset);
  reset();
})();
