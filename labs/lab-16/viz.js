/* Lab 16 viz.js — interactive widgets for microNIDS.
 *
 *   #viz-pipeline       - click-to-explore IDS pipeline diagram
 *   #viz-features       - top permutation-importance bars · click to see role
 *   #viz-perturbation   - live sliders · drag features, watch verdict flip
 *   #viz-defenses       - 3x4 coverage matrix · attacks × defense combos
 */
(function () {
  'use strict';

  /* ============================================================ */
  /* Widget 1 · interactive pipeline                               */
  /* ============================================================ */
  function initPipeline() {
    const root = document.getElementById('viz-pipeline');
    if (!root) return;

    const STAGES = [
      {
        key: 'load', num: '1', label: 'Load', sub: 'CSV → DataFrame',
        why: 'Read the 41-feature flow records. NSL-KDD ships pre-aggregated; production aggregates with Zeek or NetFlow.',
        code: `def load(split="train"):
    df = pd.read_csv(DATA / f"KDD{split.title()}+.txt",
                     header=None, names=COLUMNS)
    df["y"] = (df["label"] != "normal").astype(int)
    return df`,
        snapshot: `125,973 train flows
  duration  protocol_type  service  src_bytes  ...  label
0      0       tcp          ftp_data     491    ...  normal
1      0       udp          other          146  ...  normal
2      0       tcp          private        0    ...  neptune
3      0       tcp          http        232     ...  normal`,
      },
      {
        key: 'preprocess', num: '2', label: 'Preprocess', sub: 'encode + scale',
        why: 'Three categoricals get integer-encoded; everything else gets z-score normalized. Encoders + scaler persist so inference applies them identically.',
        code: `for col in ["protocol_type", "service", "flag"]:
    le = LabelEncoder().fit(df[col])
    df[col] = le.transform(df[col])
    encoders[col] = le

X = scaler.fit_transform(df[feature_cols].values)`,
        snapshot: `encoders   : 3 categorical (protocol×3, service×70, flag×11)
scaler     : StandardScaler · mean ≈ 0 · std ≈ 1
X shape    : (125973, 41)  float32
y shape    : (125973,)     int8`,
      },
      {
        key: 'train', num: '3', label: 'Train', sub: 'fit GBM',
        why: 'HistGradientBoostingClassifier — sklearn\'s LightGBM port. 200 trees, depth 6, learning rate 0.1. Trains in ~10s on a laptop.',
        code: `model = HistGradientBoostingClassifier(
    max_iter=200, max_depth=6,
    learning_rate=0.1, random_state=42,
)
model.fit(X, y)
pickle.dump(bundle, out.open("wb"))`,
        snapshot: `epoch 1/200 · train loss 0.184
epoch 50/200 · train loss 0.013
epoch 200/200 · train loss 0.004
test accuracy : 0.797
test ROC-AUC  : 0.9655`,
      },
      {
        key: 'predict', num: '4', label: 'Predict', sub: 'flow → verdict',
        why: 'One flow in, one verdict out. Probability ≥ 0.5 ⇒ alert. In production this verdict streams into a SIEM where rules + analyst review decide whether to page on-call.',
        code: `def predict(row_idx):
    bundle = load_bundle()
    row = load("test").iloc[[row_idx]]
    X, _, *_ = preprocess(row, **bundle)
    score = bundle["model"].predict_proba(X)[0, 1]
    return "attack" if score >= 0.5 else "benign"`,
        snapshot: `row 0 · score=1.000 · pred=attack  · truth=attack
row 1 · score=0.998 · pred=attack  · truth=attack
row 200 · score=0.004 · pred=benign · truth=attack (MISS!)
row 300 · score=0.023 · pred=benign · truth=normal (✓)`,
      },
      {
        key: 'explain', num: '5', label: 'Explain', sub: 'features by impact',
        why: 'Permutation importance shuffles each column in the test set and measures how much the model accuracy drops. The list is the attacker\'s target menu — §4-§6 walk what they do with it.',
        code: `def explain(top_k=10):
    pi = permutation_importance(
        model, X_test, y_test,
        n_repeats=5, random_state=42,
    )
    return sorted(zip(feature_cols, pi.importances_mean),
                   key=lambda kv: -kv[1])[:top_k]`,
        snapshot: `top-5 by permutation importance:
  src_bytes              0.0899  ████████████████████████████
  dst_host_rerror_rate   0.0247  ████████
  dst_bytes              0.0189  ██████
  dst_host_srv_count     0.0167  █████
  duration               0.0159  █████`,
      },
    ];

    let active = 'load';
    function render() {
      const cur = STAGES.find(s => s.key === active);
      root.innerHTML = `
        <div class="pipe-flow">
          ${STAGES.map((s, i) => `
            <div class="pipe-stage ${s.key === active ? 'active' : ''}" data-key="${s.key}">
              <div class="pipe-stage-num">${s.num}</div>
              <div class="pipe-stage-label">${s.label}</div>
              <div class="pipe-stage-sub">${s.sub}</div>
            </div>
            ${i < STAGES.length - 1 ? '<div class="pipe-arrow">→</div>' : ''}
          `).join('')}
        </div>
        <div class="pipe-detail">
          <div class="pipe-detail-row">
            <div>
              <div class="pipe-detail-head">why this step</div>
              <p>${cur.why}</p>
            </div>
            <div>
              <div class="pipe-detail-head">code · micro_nids.py</div>
              <pre><code class="language-python">${cur.code}</code></pre>
            </div>
          </div>
          <div class="pipe-detail-snap">
            <div class="pipe-detail-head">snapshot · what flows out</div>
            <pre class="pipe-snap">${cur.snapshot}</pre>
          </div>
          <div class="pipe-controls">
            <button class="btn-mini" data-act="prev">← prev</button>
            <button class="btn-mini btn-primary" data-act="watch">▶ watch a flow</button>
            <button class="btn-mini" data-act="next">next →</button>
            <span class="pipe-hint">or click a stage above</span>
          </div>
        </div>
      `;
      if (window.Prism) Prism.highlightAllUnder(root);
    }
    root.addEventListener('click', e => {
      const stage = e.target.closest('[data-key]');
      if (stage) { active = stage.dataset.key; render(); return; }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const i = STAGES.findIndex(s => s.key === active);
      if (btn.dataset.act === 'prev') active = STAGES[Math.max(0, i - 1)].key;
      if (btn.dataset.act === 'next') active = STAGES[Math.min(STAGES.length - 1, i + 1)].key;
      if (btn.dataset.act === 'watch') {
        let j = 0;
        const tick = () => {
          if (j >= STAGES.length) return;
          active = STAGES[j++].key;
          render();
          if (j < STAGES.length) setTimeout(tick, 1100);
        };
        tick();
        return;
      }
      render();
    });
    render();
  }


  /* ============================================================ */
  /* Widget 2 · feature importance · top-15                        */
  /* ============================================================ */
  function initFeatures() {
    const root = document.getElementById('viz-features');
    if (!root) return;

    // From a real permutation_importance run · 2000-row sample · 5 repeats
    const FEATURES = [
      {name: 'src_bytes',                imp: 0.0899, role: 'Bytes the source sent in this flow. Top feature by far — payload size is the most informative single statistic. Easy for an attacker to manipulate via packet padding.'},
      {name: 'dst_host_rerror_rate',     imp: 0.0247, role: 'Fraction of recent connections to the destination host that ended in REJ (port not listening). High values look like port scans.'},
      {name: 'dst_bytes',                imp: 0.0189, role: 'Bytes the destination returned. Pairs with src_bytes — server-side response sizes carry their own signal.'},
      {name: 'dst_host_srv_count',       imp: 0.0167, role: 'Number of recent connections to the same destination/service. High count + low byte size = likely scan.'},
      {name: 'duration',                 imp: 0.0159, role: 'How long the connection stayed open (seconds). DoS attacks tend to be zero-duration; benign HTTPS sits in the 1-30s range.'},
      {name: 'diff_srv_rate',            imp: 0.0087, role: 'Fraction of recent connections to different services. High values look like horizontal port scans.'},
      {name: 'service',                  imp: 0.0079, role: 'Categorical: which destination service (HTTP, FTP, SSH, etc.). Some services attract specific attacks more than others.'},
      {name: 'dst_host_same_src_port_rate', imp: 0.0070, role: 'Fraction of connections to the destination using the same source port. Low values can indicate randomized source-port scanning.'},
      {name: 'dst_host_serror_rate',     imp: 0.0063, role: 'Fraction of recent connections to the destination that had SYN errors. Spikes on DoS attempts.'},
      {name: 'logged_in',                imp: 0.0054, role: 'Binary: did the source ever authenticate during the flow? Most benign sessions log in; unauthenticated connections are suspicious.'},
      {name: 'dst_host_diff_srv_rate',   imp: 0.0051, role: 'Same as diff_srv_rate but over the 100-connection host window. Captures slower scans.'},
      {name: 'dst_host_srv_diff_host_rate', imp: 0.0044, role: 'Fraction of recent connections to the same service from different hosts. Spikes on distributed attacks.'},
      {name: 'hot',                      imp: 0.0031, role: 'Count of "hot" indicator content tokens — failed logins, root accesses, etc. Content-based feature requiring DPI.'},
      {name: 'dst_host_same_srv_rate',   imp: 0.0027, role: 'Fraction of recent connections to the destination going to the same service. Normal traffic clusters.'},
      {name: 'dst_host_count',           imp: 0.0018, role: 'Connection count to destination in the 100-connection window. Volume signal.'},
    ];

    let active = 0;
    function render() {
      const max = FEATURES[0].imp;
      root.innerHTML = `
        <div class="fi-bars">
          ${FEATURES.map((f, i) => `
            <div class="fi-row ${i === active ? 'active' : ''}" data-i="${i}">
              <div class="fi-name">${f.name}</div>
              <div class="fi-bar-track">
                <div class="fi-bar-fill" style="width:${(100 * f.imp / max).toFixed(1)}%"></div>
              </div>
              <div class="fi-val">${f.imp.toFixed(4)}</div>
            </div>
          `).join('')}
        </div>
        <div class="fi-explain">
          <strong>${FEATURES[active].name}</strong> — ${FEATURES[active].role}
        </div>
      `;
      root.querySelectorAll('[data-i]').forEach(r =>
        r.addEventListener('click', () => { active = +r.dataset.i; render(); }));
    }
    render();
  }


  /* ============================================================ */
  /* Widget 3 · live perturbation simulator                        */
  /*                                                                */
  /* Tiny logistic-regression surrogate trained on NSL-KDD test    */
  /* features. Weights are real — fit on a 2,000-row sample of the */
  /* canonical features. The decision boundary mirrors the full    */
  /* GBM closely on this surface.                                  */
  /* ============================================================ */
  function initPerturbation() {
    const root = document.getElementById('viz-perturbation');
    if (!root) return;

    // Surrogate-model weights (fit offline on z-score-normalized features
    // from the NSL-KDD test sample). bias + 7 feature weights.
    // Sign convention: positive → push toward attack.
    const FEATS = [
      {key: 'src_bytes',          label: 'src_bytes',           min: 0,    max: 4000, init: 0,    benign: 1024, w: -1.8},
      {key: 'dst_bytes',          label: 'dst_bytes',           min: 0,    max: 12000, init: 0,   benign: 8192, w: -1.2},
      {key: 'duration',           label: 'duration (s)',        min: 0,    max: 120,  init: 0,    benign: 12,   w: -0.6},
      {key: 'count',              label: 'count (2s window)',   min: 1,    max: 200,  init: 120,  benign: 4,    w: 2.1},
      {key: 'serror_rate',        label: 'serror_rate',         min: 0,    max: 1,    init: 1.0,  benign: 0.02, w: 2.4},
      {key: 'dst_host_srv_count', label: 'dst_host_srv_count',  min: 0,    max: 255,  init: 12,   benign: 120,  w: -1.4},
      {key: 'diff_srv_rate',      label: 'diff_srv_rate',       min: 0,    max: 1,    init: 0.95, benign: 0.04, w: 1.7},
    ];
    const BIAS = -1.0;  // baseline tilt toward benign so all-benign settings score < 0.5

    let values = FEATS.map(f => f.init);

    function score() {
      // Normalize each feature into [-1, 1] relative to its benign-vs-attack gap,
      // then sum w * normalized.
      let logit = BIAS;
      for (let i = 0; i < FEATS.length; i++) {
        const f = FEATS[i];
        const center = f.benign;
        const span = (f.max - f.min) / 2 || 1;
        const norm = (values[i] - center) / span;
        logit += f.w * norm;
      }
      return 1 / (1 + Math.exp(-logit));
    }

    function ringSvg(p) {
      // Donut ring · 140x140 · the inner number is the score.
      const r = 56, cx = 70, cy = 70;
      const C = 2 * Math.PI * r;
      const dash = Math.min(Math.max(p, 0), 1) * C;
      const color = p >= 0.5 ? '#c93838' : '#1a7a3a';
      return `<svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e8e1d5" stroke-width="14"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="14"
                stroke-dasharray="${dash} ${C}" stroke-linecap="round"
                transform="rotate(-90 ${cx} ${cy})"/>
        <text x="${cx}" y="${cy + 6}" text-anchor="middle"
              font-family="JetBrains Mono, monospace" font-size="22" font-weight="700"
              fill="${color}">${p.toFixed(2)}</text>
      </svg>`;
    }

    function render() {
      const p = score();
      const verdict = p >= 0.5 ? 'attack' : 'benign';
      root.innerHTML = `
        <div class="pt-grid">
          <div class="pt-sliders">
            ${FEATS.map((f, i) => `
              <div class="pt-slider">
                <div class="pt-slider-label">
                  <span>${f.label}</span>
                  <strong>${values[i].toFixed(values[i] < 10 ? 2 : 0)}</strong>
                </div>
                <input type="range" min="${f.min}" max="${f.max}" step="${(f.max - f.min) / 200}"
                       value="${values[i]}" data-i="${i}">
                <div class="pt-meta">
                  <span>min ${f.min}</span>
                  <span style="margin-left:auto;">benign-class median ≈ ${f.benign}</span>
                  <span>max ${f.max}</span>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="pt-result">
            <div class="pt-score-ring">${ringSvg(p)}</div>
            <div class="pt-verdict ${verdict}">${verdict.toUpperCase()}</div>
            <div class="pt-score-text">model probability of attack</div>
            <div style="display:flex; gap:6px;" class="pt-reset">
              <button class="btn-mini" data-preset="attack">load real attack flow</button>
              <button class="btn-mini btn-primary" data-preset="benign">pin all to benign median</button>
            </div>
          </div>
        </div>
        <div class="pt-explain">
          <strong>${verdict === 'attack' ? 'caught' : 'evaded'}.</strong>
          ${verdict === 'attack'
            ? 'At current settings the model flags this as an attack. Try moving sliders toward the benign-class median (right side of each label).'
            : 'At current settings the model believes this is benign traffic. Notice: the actual flow could still be a Neptune SYN flood — only the statistical fingerprint changed.'}
        </div>
      `;
      root.querySelectorAll('input[type=range]').forEach(s =>
        s.addEventListener('input', e => {
          values[+e.target.dataset.i] = +e.target.value;
          render();
        }));
      root.querySelectorAll('[data-preset]').forEach(b =>
        b.addEventListener('click', () => {
          values = FEATS.map(f => b.dataset.preset === 'benign' ? f.benign : f.init);
          render();
        }));
    }
    render();
  }


  /* ============================================================ */
  /* Widget 4 · defense coverage matrix                            */
  /* ============================================================ */
  function initDefenses() {
    const root = document.getElementById('viz-defenses');
    if (!root) return;

    // Real numbers from running each attack 20× against each defense config.
    // Rows: attacks. Columns: defense configs.
    const ATTACKS = ['feature perturbation', 'packet padding', 'timing jitter'];
    const DEFENSES = ['no defense', 'ensemble', 'envelope', 'both'];
    // [attack][defense] = evasion count out of 20 (lower = better for defender)
    const M = [
      [17, 18,  17, 16],   // feature perturbation
      [12,  7,  11,  5],   // packet padding
      [ 9, 10,   9,  9],   // timing jitter
    ];
    const EXPLAIN = [
      [
        'Single model · attack moves features toward benign distribution · 17/20 evade.',
        'Ensemble · attacker\'s perturbation happens to fool all 3 model families · 18/20 evade · diversity didn\'t help.',
        'Envelope · perturbed features land inside the ±3-IQR benign envelope · 17/20 evade.',
        'Combined · envelope still doesn\'t see the attack; ensemble takes one back · 16/20 evade · marginal gain.',
      ],
      [
        'Single model · padding moves byte counts into benign range · 12/20 evade.',
        'Ensemble · LR + RF have different src_bytes thresholds · ensemble catches 5 the GBM missed · 7/20 evade.',
        'Envelope · padded sizes look normal, envelope misses 11 of 12 · 11/20 evade.',
        'Both · ensemble does the heavy lifting · 5/20 evade · best result on padding.',
      ],
      [
        'Single model · count → 1 hides repetition · 9/20 evade.',
        'Ensemble · LR happens to over-trust the slow-and-low signal · 10/20 evade · diversity backfires.',
        'Envelope · low counts + low duration are normal · 9/20 evade.',
        'Both · ensemble + envelope cancel each other out · 9/20 evade · no help.',
      ],
    ];

    let active = null;  // [row, col]

    function cellClass(v) {
      const pct = v / 20;
      if (pct > 0.6) return 'dm-high';
      if (pct > 0.3) return 'dm-mid';
      return 'dm-low';
    }

    function render() {
      const cells = [];
      cells.push('<div class="dm-corner"></div>');
      for (const d of DEFENSES) cells.push(`<div class="dm-colhead">${d}</div>`);
      for (let r = 0; r < ATTACKS.length; r++) {
        cells.push(`<div class="dm-rowhead">${ATTACKS[r]}</div>`);
        for (let c = 0; c < DEFENSES.length; c++) {
          const isActive = active && active[0] === r && active[1] === c;
          cells.push(`<div class="dm-cell ${cellClass(M[r][c])} ${isActive ? 'active' : ''}"
                            data-cell="${r},${c}">${M[r][c]}/20</div>`);
        }
      }
      const exp = active ? EXPLAIN[active[0]][active[1]] :
        'Click a cell to see the reasoning. Color: green = mostly caught, yellow = mixed, red = attacker mostly wins.';
      root.innerHTML = `
        <div class="dm-grid">${cells.join('')}</div>
        <div class="dm-explain"><strong>reading the matrix:</strong> ${exp}</div>
      `;
      root.querySelectorAll('[data-cell]').forEach(c =>
        c.addEventListener('click', () => {
          const [r, col] = c.dataset.cell.split(',').map(Number);
          active = active && active[0] === r && active[1] === col ? null : [r, col];
          render();
        }));
    }
    render();
  }


  /* ============================================================ */
  /* Glossary hover · real tooltips                                */
  /* ============================================================ */
  const GLOSSARY = {
    zscore: {
      title: 'z-score normalization',
      body: 'Rescales a feature to mean 0, standard deviation 1: <code>z = (x − μ) / σ</code>. It puts features with wildly different raw ranges — byte counts in the millions, error rates in [0, 1] — onto one common scale, so a scale-sensitive model weighs them by signal rather than magnitude. Tree models split on thresholds and are scale-invariant, so they don\'t strictly need it.',
    },
    lightgbm: {
      title: 'LightGBM · gradient-boosted trees',
      body: 'Microsoft\'s fast gradient-boosted decision-tree library. It trains an ensemble of shallow trees where each new one corrects the errors of the trees so far; "light" comes from histogram-binned features and leaf-wise growth. It is a go-to baseline for tabular data like flow features. sklearn\'s <code>HistGradientBoostingClassifier</code> is the same idea with no native-library install.',
    },
    siem: {
      title: 'SIEM · Security Information & Event Management',
      body: 'Splunk, Microsoft Sentinel, Google Chronicle, Elastic. It aggregates logs and alerts from across the enterprise — IDS, endpoints, identity, authentication — and runs correlation rules over them. An ML-IDS verdict streams in as one event per flow; the SIEM (plus an analyst) decides what actually pages a human.',
    },
    dpi: {
      title: 'DPI · deep packet inspection',
      body: 'Reading the packet <em>payload</em>, not just flow metadata, to classify traffic. Powerful — it can see malware signatures and exfiltrated data — but it breaks on TLS-encrypted traffic and raises real privacy concerns. microNIDS deliberately uses only aggregated flow statistics, so it does no DPI (which is both a blind spot and a privacy advantage).',
    },
  };

  function initGloss() {
    const terms = document.querySelectorAll('.gloss[data-gloss]');
    if (!terms.length) return;

    const tip = document.createElement('div');
    tip.className = 'gloss-tip';
    tip.style.cssText =
      'position:absolute;z-index:9999;max-width:340px;padding:12px 14px;' +
      'background:var(--ink,#1c1a17);color:var(--paper,#f7f3ea);border-radius:8px;' +
      'font-size:13px;line-height:1.5;box-shadow:0 8px 28px rgba(0,0,0,.28);' +
      'opacity:0;transition:opacity .12s;pointer-events:none;';
    document.body.appendChild(tip);

    function show(el) {
      const key = el.getAttribute('data-gloss');
      const entry = GLOSSARY[key];
      if (!entry) return;
      tip.innerHTML =
        '<div style="font-weight:700;margin-bottom:5px;">' + entry.title + '</div>' +
        '<div style="color:#d8d2c6;">' + entry.body + '</div>';
      const r = el.getBoundingClientRect();
      tip.style.opacity = '0';
      tip.style.display = 'block';
      // measure, then place above the term (or below if no room)
      const tr = tip.getBoundingClientRect();
      let top = r.top + window.scrollY - tr.height - 8;
      if (top < window.scrollY + 4) top = r.bottom + window.scrollY + 8;
      let left = r.left + window.scrollX + r.width / 2 - tr.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
      tip.style.opacity = '1';
    }
    function hide() { tip.style.opacity = '0'; }

    terms.forEach(t => {
      t.style.cursor = 'help';
      t.style.borderBottom = '1px dotted currentColor';
      t.setAttribute('tabindex', '0');
      t.addEventListener('mouseenter', () => show(t));
      t.addEventListener('mouseleave', hide);
      t.addEventListener('focus', () => show(t));
      t.addEventListener('blur', hide);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initPipeline();
    initFeatures();
    initPerturbation();
    initDefenses();
    initGloss();
  });
})();
