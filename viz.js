/* Lab 14 viz.js — interactive RAG widgets.
 *
 * Four widgets:
 *   #viz-pipeline       - click-to-explore RAG pipeline diagram
 *   #viz-chunking       - sliders for chunk size / overlap over real text
 *   #viz-tfidf          - corpus DF + IDF table, hover to highlight chunks
 *   #viz-hybrid         - type a query, see kw/em/hybrid scores live
 *
 * All math (TF-IDF, hashed-feature embedding, cosine, normalize, hybrid blend)
 * is reimplemented in JS so the widget exactly matches what micro_rag.py does.
 *
 * Glossary hover styling preserved from earlier version.
 */
(function () {
  'use strict';

  /* ============================================================ */
  /* Shared data — chunks pulled from microdata/, IDF computed at  */
  /* ingest time. Kept inline so the widget runs without fetching. */
  /* ============================================================ */
  const CHUNKS = [
    {doc: 'architecture.md',     idx: 0, body: '# MegaCorpAI Architecture Overview\n\n## Production environment\n\n- Application servers: `api01.megacorpai.local`, `api02.megacorpai.local`, `api03.megacorpai.local`\n- Database: `db-prod.megacorpai.local` (PostgreSQL 15)\n- Cache: `redis-prod.megacorpai.local`\n- Object store: S3 buckets `megacorpai-prod'},
    {doc: 'architecture.md',     idx: 1, body: 'egacorpai.local`\n- Object store: S3 buckets `megacorpai-prod-uploads`, `megacorpai-prod-backups`\n\n## Staging environment\n\n- One replica of each production service prefixed with `staging-`.\n- Staging data is sanitized weekly. Real customer data must never be loaded into staging.\n\n## Internal services'},
    {doc: 'architecture.md',     idx: 2, body: 'ata must never be loaded into staging.\n\n## Internal services\n\n- Identity: Okta tenant `megacorpai.okta.com`\n- Source control: GitHub Enterprise at `github.megacorpai.local`\n- Wiki: Confluence at `wiki.megacorpai.local`\n- Ticketing: JIRA at `jira.megacorpai.local`'},
    {doc: 'architecture.md',     idx: 3, body: '`jira.megacorpai.local`'},
    {doc: 'network_help.md',     idx: 0, body: '# Wi-Fi and VPN Troubleshooting\n\n## Wi-Fi keeps dropping\n\n1. Forget the network and re-join.\n2. Confirm you joined `megacorpai-corp`, NOT the guest network.\n3. If it still drops, restart NetworkManager (`sudo systemctl restart NetworkManager` on Linux; toggle Wi-Fi on macOS/Windows).\n\n## VPN access'},
    {doc: 'network_help.md',     idx: 1, body: 'r` on Linux; toggle Wi-Fi on macOS/Windows).\n\n## VPN access\n\nDownload the GlobalProtect client from the IT portal. Connect to `vpn.megacorpai.local` with your Active Directory credentials. Internal services (JIRA, Confluence, the document repo) require VPN; verify your IP is in `10.10.0.0/16`.\n\n## D'},
    {doc: 'network_help.md',     idx: 2, body: 'epo) require VPN; verify your IP is in `10.10.0.0/16`.\n\n## DNS resolution problems\n\nRun `dig` or `nslookup` against the company DNS server `10.10.1.53` before troubleshooting further.'},
    {doc: 'onboarding.md',       idx: 0, body: '# Engineering Onboarding\n\nWelcome to MegaCorpAI Engineering. Your first week:\n\n## Day 1\n- Pick up your laptop from IT (Floor 4, room 401). The asset tag is your username.\n- Sign the Acceptable Use Policy and the IP Assignment Agreement.\n- Join the `#new-hires` Slack channel.\n\n## Day 2-3\n- Provision'},
    {doc: 'onboarding.md',       idx: 1, body: 'oin the `#new-hires` Slack channel.\n\n## Day 2-3\n- Provision your GitHub access via the IT portal under "Source Code".\n- Set up your VPN per the Wi-Fi and VPN Troubleshooting guide.\n- Schedule a 1:1 with your manager.\n\n## Day 4-5\n- Pair-program with your onboarding buddy through the company\'s "Hello'},
    {doc: 'onboarding.md',       idx: 2, body: 'ram with your onboarding buddy through the company\'s "Hello World" exercise.\n- Submit your first PR against the `playground` repo.\n\nIf anything blocks you, the helpdesk extension is 4357.'},
    {doc: 'password_policy.md',  idx: 0, body: '# Password Reset Policy\n\nTo reset your password at MegaCorpAI:\n\n1. Visit the login page at https://login.megacorpai.local and click "Need help signing in".\n2. Authenticate with Okta Verify push notification (preferred) or SMS fallback.\n3. Set a new passphrase with at least sixteen characters, includ'},
    {doc: 'password_policy.md',  idx: 1, body: 'et a new passphrase with at least sixteen characters, including one symbol and one number.\n\nPasswords expire every 90 days. If you are locked out, contact the helpdesk at extension 4357.\n\nService-account passwords are rotated quarterly by IT Operations.'},
    {doc: 'password_policy.md',  idx: 2, body: 'T Operations.'},
  ];

  /* ============================================================ */
  /* TF-IDF + hashed-feature embedding · JS port of micro_rag.py   */
  /* ============================================================ */
  const TOKEN_RE = /[a-zA-Z][a-zA-Z']+/g;
  const EMBED_DIM = 128;

  function tokenize(s) {
    return (s.toLowerCase().match(TOKEN_RE) || []);
  }

  function countMap(arr) {
    const m = new Map();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    return m;
  }

  // Build IDF + per-chunk TF-IDF dict.
  function buildTfidf(chunks) {
    const df = new Map();
    for (const c of chunks) {
      const seen = new Set(tokenize(c.body));
      for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
    }
    const N = chunks.length;
    const idf = new Map();
    for (const [t, d] of df) idf.set(t, Math.log((N + 1) / (d + 1)) + 1.0);
    for (const c of chunks) {
      const tf = countMap(tokenize(c.body));
      const v = {};
      for (const [t, cnt] of tf) v[t] = cnt * (idf.get(t) || 0);
      c.tfidf = v;
    }
    return {idf, df};
  }

  function tfidfScore(query, chunkTfidf, idf) {
    const qtf = countMap(tokenize(query));
    const qv = {};
    for (const [t, cnt] of qtf) qv[t] = cnt * (idf.get(t) || 0);
    let dot = 0;
    for (const t of Object.keys(qv)) dot += qv[t] * (chunkTfidf[t] || 0);
    const qn = Math.sqrt(Object.values(qv).reduce((s, v) => s + v * v, 0));
    const cn = Math.sqrt(Object.values(chunkTfidf).reduce((s, v) => s + v * v, 0));
    return dot / (qn * cn + 1e-9);
  }

  // MD5-ish small hash · deterministic, replaces the Python md5 in the hashed
  // embedding. Token → 128 buckets is what matters, not the exact hash.
  function smallHash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  function embed(text) {
    const v = new Array(EMBED_DIM).fill(0);
    for (const tok of tokenize(text)) v[smallHash(tok) % EMBED_DIM] += 1;
    let n = 0; for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    return v.map(x => x / n);
  }

  function cosine(a, b) {
    let d = 0;
    for (let i = 0; i < a.length; i++) d += a[i] * b[i];
    return d;
  }

  function normalize(xs) {
    let lo = Infinity, hi = -Infinity;
    for (const x of xs) { if (x < lo) lo = x; if (x > hi) hi = x; }
    if (hi === lo) return xs.map(() => 0);
    return xs.map(x => (x - lo) / (hi - lo));
  }

  function retrieve(query, chunks, idf, topK, wKw) {
    const qe = embed(query);
    const kw = chunks.map(c => tfidfScore(query, c.tfidf, idf));
    const em = chunks.map(c => cosine(qe, c.emb));
    const kwN = normalize(kw), emN = normalize(em);
    const scored = chunks.map((c, i) => ({
      ...c,
      kw_raw: kw[i], em_raw: em[i],
      kw_score: kwN[i], em_score: emN[i],
      hybrid: wKw * kwN[i] + (1 - wKw) * emN[i],
    }));
    scored.sort((a, b) => b.hybrid - a.hybrid);
    return scored.slice(0, topK);
  }

  // Build once, share across widgets.
  const {idf: IDF, df: DF} = buildTfidf(CHUNKS);
  for (const c of CHUNKS) c.emb = embed(c.body);


  /* ============================================================ */
  /* Widget 1 · Interactive pipeline diagram                       */
  /*                                                                */
  /* Five clickable stages. Each click animates its arrow, swaps    */
  /* the explainer panel, and lights up the matching code excerpt.  */
  /* A "Watch a query flow" preset runs all five in sequence.       */
  /* ============================================================ */
  function initPipeline() {
    const root = document.getElementById('viz-pipeline');
    if (!root) return;

    const STAGES = [
      {
        key: 'chunk',
        num: '1',
        label: 'Chunk',
        sub: 'docs → list[chunk]',
        why: 'Split every document into overlapping 300-character windows so the relevant slice fits in one chunk. Overlap rescues sentences that land on chunk boundaries.',
        code: `def chunk(text, size=300, overlap=60):
    out, i = [], 0
    while i < len(text):
        out.append(text[i:i+size].strip())
        i += size - overlap
    return [c for c in out if c]`,
        snapshot: () => `13 chunks total
  architecture.md ch0 ··· ch3   (4 chunks · 716 chars)
  network_help.md ch0 ··· ch2   (3 chunks · 580 chars)
  onboarding.md   ch0 ··· ch2   (3 chunks · 612 chars)
  password_policy.md ch0 ··· ch2 (3 chunks · 408 chars)`,
      },
      {
        key: 'index',
        num: '2',
        label: 'Index ×2',
        sub: 'TF-IDF · embedding',
        why: 'Two independent representations of each chunk: a sparse keyword vector (rare terms count more — IDF) and a dense 128-d "semantic" vector (hashed buckets here; real models in production).',
        code: `def build_tfidf(chunks):
    idf = log((N+1)/(df_t+1)) + 1
    for c in chunks:
        c["tfidf"] = {t: cnt * idf[t] for t, cnt in tf}
    return idf

def embed(text):           # hashed-feature 128-d
    vec = [0.0] * 128
    for tok in tokens(text):
        vec[hash(tok) % 128] += 1
    return normalize(vec)`,
        snapshot: () => {
          const top = Array.from(IDF.entries())
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([t, v]) => `${t.padEnd(12)} idf=${v.toFixed(2)}`)
            .join('\n  ');
          return `IDF (most discriminating terms)
  ${top}
embedding dim = 128 · unit-normalized`;
        },
      },
      {
        key: 'retrieve',
        num: '3',
        label: 'Retrieve',
        sub: 'query → top-K',
        why: 'Score the query against every chunk twice. Normalize each score axis to [0,1] (different scales!) and blend with a tunable keyword weight w_kw. Sort, return top K.',
        code: `def retrieve(query, chunks, idf,
             top_k=4, w_kw=0.5):
    kw = [tfidf_score(q, c.tfidf, idf) for c in chunks]
    em = [cosine(embed(q), c.emb) for c in chunks]
    kw_n, em_n = normalize(kw), normalize(em)
    scored = [w_kw*kw_n[i] + (1-w_kw)*em_n[i]
              for i in range(len(chunks))]
    return top_k(scored)`,
        snapshot: () => {
          const top = retrieve('how do I reset my password?', CHUNKS, IDF, 3, 0.5);
          const lines = top.map(t =>
            `  hybrid=${t.hybrid.toFixed(3)} kw=${t.kw_score.toFixed(2)} em=${t.em_score.toFixed(2)}  ${t.doc} #${t.idx}`
          );
          return `query · "how do I reset my password?" · top-3\n${lines.join('\n')}`;
        },
      },
      {
        key: 'augment',
        num: '4',
        label: 'Augment',
        sub: 'top-K → messages',
        why: 'Paste the retrieved chunks into the user message as a "Retrieved context" block, with the question below. A system prompt instructs the LLM to use only this context. The LLM has no separate channel for retrieved text — this is the trust boundary Lab 15 attacks.',
        code: `SYSTEM = "Answer using ONLY the retrieved context. Cite the source filename."

def augment(query, top):
    ctx = "\\n\\n".join(
        f"[source: {c.doc} · chunk {c.idx}]\\n{c.body}"
        for c in top)
    return [
      {"role": "system", "content": SYSTEM},
      {"role": "user",   "content":
          f"# Retrieved context\\n\\n{ctx}\\n\\n# Question\\n\\n{query}"},
    ]`,
        snapshot: () => `messages[0] · system · "Answer using ONLY the retrieved context. …"
messages[1] · user
  # Retrieved context
  [source: password_policy.md · chunk 0]
  # Password Reset Policy …
  [source: password_policy.md · chunk 2]
  T Operations.
  [source: password_policy.md · chunk 1]
  et a new passphrase with at least sixteen …
  # User question
  how do I reset my password?`,
      },
      {
        key: 'generate',
        num: '5',
        label: 'Generate',
        sub: 'messages → answer',
        why: 'One ordinary chat-completions call. The LLM reads the system + augmented user message and produces an answer that should be entirely grounded in the retrieved context.',
        code: `def chat(messages):
    r = httpx.post(LLM_URL + "/chat/completions",
        headers={"Authorization": f"Bearer {KEY}"},
        json={"model": MODEL,
              "messages": messages,
              "temperature": 0.2})
    return r.json()["choices"][0]["message"]["content"]`,
        snapshot: () => `assistant · "To reset your password at MegaCorpAI:
  1. Visit https://login.megacorpai.local and click 'Need help signing in'.
  2. Authenticate with Okta Verify (preferred) or SMS fallback.
  3. Set a new passphrase with at least sixteen characters …
  Source: password_policy.md"`,
      },
    ];

    let active = 'chunk';

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
            <div class="pipe-detail-block">
              <div class="pipe-detail-head">why this step</div>
              <p>${cur.why}</p>
            </div>
            <div class="pipe-detail-block">
              <div class="pipe-detail-head">code · micro_rag.py</div>
              <pre><code class="language-python">${cur.code}</code></pre>
            </div>
          </div>
          <div class="pipe-detail-block pipe-detail-snap">
            <div class="pipe-detail-head">snapshot · what flows out</div>
            <pre class="pipe-snap">${cur.snapshot()}</pre>
          </div>
        </div>
        <div class="pipe-controls">
          <button class="btn-mini" data-act="prev">← prev</button>
          <button class="btn-mini btn-primary" data-act="watch">▶ watch a query flow</button>
          <button class="btn-mini" data-act="next">next →</button>
          <span class="pipe-hint">or click a stage above</span>
        </div>
      `;
      if (window.Prism) Prism.highlightAllUnder(root);
    }

    root.addEventListener('click', e => {
      const stage = e.target.closest('.pipe-stage');
      if (stage) { active = stage.dataset.key; render(); return; }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const i = STAGES.findIndex(s => s.key === active);
      if (btn.dataset.act === 'prev')  active = STAGES[Math.max(0, i - 1)].key;
      if (btn.dataset.act === 'next')  active = STAGES[Math.min(STAGES.length - 1, i + 1)].key;
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
  /* Widget 2 · Chunking visualizer                                */
  /*                                                                */
  /* Real text from password_policy.md is sliced live as you move   */
  /* the chunk-size and overlap sliders. Overlap regions render in  */
  /* a darker shade so the "60-char overlap" lesson is visible.     */
  /* ============================================================ */
  function initChunking() {
    const root = document.getElementById('viz-chunking');
    if (!root) return;

    const TEXT = `# Password Reset Policy\n\nTo reset your password at MegaCorpAI:\n\n1. Visit the login page at https://login.megacorpai.local and click "Need help signing in".\n2. Authenticate with Okta Verify push notification (preferred) or SMS fallback.\n3. Set a new passphrase with at least sixteen characters, including one symbol and one number.\n\nPasswords expire every 90 days. If you are locked out, contact the helpdesk at extension 4357.\n\nService-account passwords are rotated quarterly by IT Operations.`;

    let size = 300, overlap = 60;

    function makeChunks() {
      const out = [];
      let i = 0;
      while (i < TEXT.length) {
        out.push({ start: i, end: Math.min(i + size, TEXT.length) });
        i += size - overlap;
      }
      return out;
    }

    function renderText(chunks) {
      // Color each character by which chunks contain it (0, 1, or 2 = overlap).
      const cov = new Array(TEXT.length).fill(0);
      const cIdx = new Array(TEXT.length).fill(-1);
      chunks.forEach((c, k) => {
        for (let p = c.start; p < c.end; p++) {
          cov[p]++;
          if (cIdx[p] === -1) cIdx[p] = k;
        }
      });
      // Build runs.
      let out = '';
      let runStart = 0;
      function emit(end) {
        if (end <= runStart) return;
        const c = cov[runStart];
        const k = cIdx[runStart];
        const cls = c === 2 ? 'ch-overlap' : `ch-${k % 4}`;
        const piece = TEXT.slice(runStart, end)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        out += `<span class="${cls}">${piece}</span>`;
        runStart = end;
      }
      for (let i = 1; i < TEXT.length; i++) {
        if (cov[i] !== cov[i - 1] || cIdx[i] !== cIdx[i - 1]) emit(i);
      }
      emit(TEXT.length);
      return out;
    }

    function render() {
      const chunks = makeChunks();
      const overlapPct = size === 0 ? 0 : Math.round(100 * overlap / size);
      root.innerHTML = `
        <div class="ck-controls">
          <label>chunk size · <strong>${size}</strong> chars
            <input type="range" min="60" max="500" step="10" value="${size}" data-k="size">
          </label>
          <label>overlap · <strong>${overlap}</strong> chars
            <input type="range" min="0" max="200" step="5" value="${overlap}" data-k="overlap">
          </label>
          <div class="ck-stats">
            <span>${chunks.length} chunks</span>
            <span>${overlapPct}% overlap</span>
            <span>doc · ${TEXT.length} chars</span>
          </div>
        </div>
        <pre class="ck-text">${renderText(chunks)}</pre>
        <div class="ck-legend">
          <span class="ck-swatch ch-0"></span> chunk 0
          <span class="ck-swatch ch-1"></span> chunk 1
          <span class="ck-swatch ch-2"></span> chunk 2
          <span class="ck-swatch ch-3"></span> chunk 3
          <span class="ck-swatch ch-overlap"></span> overlap (in two chunks)
        </div>
      `;
      root.querySelectorAll('input[type=range]').forEach(inp => {
        inp.addEventListener('input', () => {
          if (inp.dataset.k === 'size') {
            size = +inp.value;
            // keep overlap < size
            if (overlap >= size) overlap = Math.max(0, size - 10);
          }
          if (inp.dataset.k === 'overlap') overlap = +inp.value;
          render();
        });
      });
    }

    render();
  }


  /* ============================================================ */
  /* Widget 3 · TF-IDF inspector                                   */
  /*                                                                */
  /* Shows the corpus IDF table sorted by rarity. Hover/click a     */
  /* term → highlight every chunk that contains it. Reinforces why  */
  /* rare terms dominate the TF-IDF score.                          */
  /* ============================================================ */
  function initTfidf() {
    const root = document.getElementById('viz-tfidf');
    if (!root) return;

    const all = Array.from(IDF.entries())
      .map(([t, v]) => ({term: t, idf: v, df: DF.get(t)}))
      .sort((a, b) => b.idf - a.idf || a.term.localeCompare(b.term));

    // Take top 24 rare + bottom 8 common · 32 total
    const rows = [...all.slice(0, 24), ...all.slice(-8)];
    let active = null;

    function termInChunk(term, c) {
      const toks = tokenize(c.body);
      return toks.includes(term);
    }

    function render() {
      const cells = rows.map(r => `
        <div class="tfidf-cell ${active === r.term ? 'active' : ''}" data-term="${r.term}">
          <span class="tfidf-term">${r.term}</span>
          <span class="tfidf-num">idf ${r.idf.toFixed(2)}</span>
          <span class="tfidf-num tfidf-df">df ${r.df}</span>
        </div>
      `).join('');
      const chunkPills = CHUNKS.map((c, k) => {
        const hit = active && termInChunk(active, c);
        return `<div class="tfidf-chip ${hit ? 'hit' : ''}" title="${c.doc} chunk ${c.idx}">
          ${c.doc.replace('.md', '')}#${c.idx}
        </div>`;
      }).join('');
      root.innerHTML = `
        <div class="tfidf-hint">Each term's <strong>IDF</strong> = log((N+1)/(df+1)) + 1. Higher IDF = rarer = more discriminating. Click a term to highlight chunks containing it.</div>
        <div class="tfidf-grid">${cells}</div>
        <div class="tfidf-hint" style="margin-top:14px;"><strong>${active ? `"${active}" appears in:` : 'corpus · 13 chunks'}</strong></div>
        <div class="tfidf-chips">${chunkPills}</div>
      `;
    }

    root.addEventListener('click', e => {
      const cell = e.target.closest('.tfidf-cell');
      if (!cell) return;
      active = active === cell.dataset.term ? null : cell.dataset.term;
      render();
    });
    render();
  }


  /* ============================================================ */
  /* Widget 4 · Hybrid retrieval scorer                            */
  /*                                                                */
  /* Type a query, drag the w_kw slider, watch the top-K reshuffle. */
  /* Each row gets a stacked bar: kw (orange) + em (green) = hybrid */
  /* ============================================================ */
  function initHybrid() {
    const root = document.getElementById('viz-hybrid');
    if (!root) return;

    const PRESETS = [
      'how do I reset my password?',
      'what database hostnames exist?',
      'how do I get a VPN?',
      'employee onboarding new hire',
    ];
    let query = PRESETS[0];
    let wKw = 0.5;
    let topK = 4;

    function renderRow(c, isTop) {
      const kwBar  = (c.kw_score * 100 * wKw).toFixed(1);
      const emBar  = (c.em_score * 100 * (1 - wKw)).toFixed(1);
      const hyb100 = (c.hybrid * 100).toFixed(1);
      const body = c.body.replace(/\n/g, ' ').slice(0, 90).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return `
        <div class="hyb-row ${isTop ? 'top' : ''}">
          <div class="hyb-id">${c.doc.replace('.md', '')}<span>#${c.idx}</span></div>
          <div class="hyb-bar">
            <div class="hyb-bar-kw" style="width:${kwBar}%"></div>
            <div class="hyb-bar-em" style="width:${emBar}%"></div>
            <div class="hyb-bar-label">${hyb100}</div>
          </div>
          <div class="hyb-scores">
            kw <strong>${c.kw_score.toFixed(2)}</strong>
            em <strong>${c.em_score.toFixed(2)}</strong>
          </div>
          <div class="hyb-body">${body}…</div>
        </div>
      `;
    }

    function render() {
      const all = retrieve(query, CHUNKS, IDF, CHUNKS.length, wKw);
      const html = all.map((c, i) => renderRow(c, i < topK)).join('');
      root.innerHTML = `
        <div class="hyb-controls">
          <div class="hyb-query">
            <label>query</label>
            <input type="text" id="hyb-q" value="${query.replace(/"/g, '&quot;')}">
          </div>
          <div class="hyb-presets">
            ${PRESETS.map(p => `<button class="btn-mini ${p === query ? 'active' : ''}" data-q="${p.replace(/"/g, '&quot;')}">${p}</button>`).join('')}
          </div>
          <div class="hyb-knobs">
            <label>w_kw · keyword vs embedding · <strong>${wKw.toFixed(2)}</strong>
              <span class="hyb-knob-end">embedding</span>
              <input type="range" min="0" max="1" step="0.05" value="${wKw}" id="hyb-w">
              <span class="hyb-knob-end">keyword</span>
            </label>
            <label>top_K · <strong>${topK}</strong>
              <input type="range" min="1" max="8" step="1" value="${topK}" id="hyb-k">
            </label>
          </div>
        </div>
        <div class="hyb-legend">
          <span class="ck-swatch hyb-bar-kw"></span> keyword score × w_kw
          <span class="ck-swatch hyb-bar-em"></span> embedding score × (1 - w_kw)
          <span style="margin-left:auto;color:var(--ink-mute);">top ${topK} chunks shown emphasized — full 13 scored below</span>
        </div>
        <div class="hyb-rows">${html}</div>
      `;
      const qIn = root.querySelector('#hyb-q');
      qIn.addEventListener('input', () => { query = qIn.value; render(); qIn.focus(); });
      root.querySelector('#hyb-w').addEventListener('input', e => { wKw = +e.target.value; render(); });
      root.querySelector('#hyb-k').addEventListener('input', e => { topK = +e.target.value; render(); });
      root.querySelectorAll('[data-q]').forEach(b =>
        b.addEventListener('click', () => { query = b.dataset.q; render(); }));
    }

    render();
  }


  /* ============================================================ */
  /* Inline glossary widget (panel re-parents under the term)      */
  /* Ported from lab-01; CSS lives in _shared/lab-base.css         */
  /* ============================================================ */
  function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'tfidf': {
        title: 'TF-IDF · term frequency × inverse document frequency',
        body:
          '<p><strong>TF-IDF</strong> is the classic way to score how well a word identifies a document, and it long predates neural search. It multiplies two counts. <strong>Term frequency (TF)</strong> is how often a word appears in <em>this</em> document — repetition signals what the document is about. <strong>Inverse document frequency (IDF)</strong> is the inverse of how many documents contain the word <em>at all</em> — a word in every document (<em>the</em>, <em>your</em>) can\'t tell them apart, while a word in just one is almost a fingerprint.</p>' +
          '<p>The formula is <code>idf(t) = log((N+1)/(df_t+1)) + 1</code>, with <code>N</code> the number of documents and <code>df_t</code> how many contain term <code>t</code>. Multiply TF by IDF and each document becomes a bag of weighted words — filler contributes ≈ 0, rare distinctive terms dominate — and you rank documents against a query by summing the weights of the shared words. (In microRAG each "document" is one of the short text <em>chunks</em> it slices files into, introduced in Step 1; §2.2 works this out on the lab\'s corpus.)</p>' +
          '<p>TF-IDF\'s strength is <em>exact tokens</em> — hostnames, error codes, version strings — which is exactly where embeddings are weakest, so production systems run both and blend the scores. BM25 is the modern, better-normalized cousin of the same idea.</p>',
      },
      'idf': {
        title: 'IDF · inverse document frequency',
        body:
          '<p>The half of TF-IDF that rewards rarity. A term appearing in many chunks says little about <em>which</em> chunk you want, so IDF pushes its weight toward zero; a term in a single chunk gets amplified. microRAG: <code>idf(t) = log((N+1)/(df_t+1)) + 1</code>. With <code>N = 13</code> chunks, a term in one chunk scores ≈ 2.95 while a term in all thirteen scores 1.0 — a roughly 3× swing per occurrence, and the whole reason TF-IDF can pick "postgresql" out of a wall of "the / a / your".</p>',
      },
      'rag': {
        title: 'RAG · Retrieval-Augmented Generation',
        body:
          '<p>A pattern for answering questions from documents a frozen language model never saw in training. Rather than retrain the model, you <em>retrieve</em> the few most relevant text chunks at question time and paste them into the prompt as context, then ask the model to answer using only that context. Introduced by <a href="https://arxiv.org/abs/2005.11401">Lewis et al. (2020)</a>.</p>' +
          '<p>It is how essentially every "chat with our docs" product works. The five steps — chunk, index, retrieve, augment, generate — are this entire lab; each of Lab 15\'s attacks hijacks one of them.</p>',
      },
      'embedding': {
        title: 'embedding',
        body:
          '<p>A fixed-length vector of numbers that represents a piece of text\'s <em>meaning</em>, arranged so that texts about similar things land near each other in vector space and their similarity can be read off with a cosine. "How do I sign in" ends up close to "password reset" even though they share no words — the thing keyword search can\'t do.</p>' +
          '<p>Real models (<code>all-MiniLM-L6-v2</code>, OpenAI <code>text-embedding-3</code>) learn this mapping from billions of sentences. microRAG fakes it with a hash so the lab needs no GPU and no model download — enough to demonstrate the plumbing, not enough for real semantic search.</p>',
      },
      'bm25': {
        title: 'BM25',
        body:
          '<p><strong>BM25</strong> ("Best Matching 25") is the standard modern refinement of TF-IDF used by search engines like Elasticsearch and OpenSearch. It keeps TF-IDF\'s core idea — reward rare shared words — but adds two fixes: <em>term-frequency saturation</em> (the 10th occurrence of a word adds far less than the 2nd) and <em>document-length normalization</em> (so long documents don\'t win just by being long).</p>' +
          '<p>microRAG uses plain TF-IDF because it\'s the readable version of the same principle; swapping in BM25 is a drop-in upgrade to the keyword leg of hybrid retrieval.</p>',
      },
      'cosine': {
        title: 'cosine similarity',
        body:
          '<p>A measure of how aligned two vectors are, ignoring their length: the cosine of the angle between them, running from 1 (same direction) through 0 (unrelated) to −1 (opposite). Because it throws away magnitude, it compares <em>direction</em> — which for text vectors means topical overlap, not how long the texts are. It\'s the standard similarity for both TF-IDF weight vectors and embedding vectors, which is why microRAG scores against both indexes with the same <code>cosine()</code> function.</p>',
      },
      'streamlit': {
        title: 'Streamlit',
        body:
          '<p>An open-source Python library that turns a plain script into a shareable web app with almost no web code — you write <code>st.text_input(...)</code> and <code>st.write(...)</code>, and it renders a browser UI for you. It became the default way data scientists put a quick front end on a model or a RAG demo without touching HTML, JavaScript, or a real web server.</p>' +
          '<p>In production RAG it often serves as the chat UI layer. The tradeoff: it is built for prototypes and internal tools, not high-traffic public services.</p>',
      },
      'grpc': {
        title: 'gRPC',
        body:
          '<p>A high-performance framework for one service to call another over the network — Google\'s modern alternative to REST (HTTP + JSON). Instead of human-readable JSON it sends compact <em>binary</em> messages (Protocol Buffers) over HTTP/2, which makes calls faster and strongly typed, at the cost of not being readable in a browser or with a plain <code>curl</code>.</p>' +
          '<p>It\'s the usual choice for <em>internal</em> service-to-service traffic in a large system — e.g. the RAG API calling a vector-database service or a reranker service — where speed and a strict message contract matter more than being able to poke it by hand.</p>',
      },
      'moderation-api': {
        title: 'moderation API',
        body:
          '<p>A hosted service that scores a piece of text for policy-violating content — hate, harassment, sexual content, self-harm, violence — and returns a per-category breakdown and a flag. OpenAI, Azure, and Google all offer one: you send the model\'s output (or the user\'s input) and get back "safe" or "blocked, category X".</p>' +
          '<p>In RAG it sits at Step 5 as an output guardrail — run the generated answer through it before returning, and refuse or redact anything it flags. Note it catches <em>categories</em> of harmful content, which is a different job from catching one specific leaked secret; that\'s what substring filters and entity recognition are for.</p>',
      },
      'entity-recognition': {
        title: 'entity recognition',
        body:
          '<p>Short for <em>named-entity recognition</em> (NER): a model that scans text and labels the spans that are <em>things</em> — people, organizations, locations, dates, and, crucially for security, emails, phone numbers, credit-card numbers, and API keys. Unlike a fixed regex, it recognizes an entity from context and shape, so it can catch an email written <code>alice [at] corp</code> or a key it has never seen before.</p>' +
          '<p>In RAG it powers the Step 5 output redactor: find the sensitive entities in the answer and mask them before it reaches the user. Common tools: spaCy, Microsoft Presidio, and cloud NER APIs.</p>',
      },
      'hnsw': {
        title: 'HNSW · Hierarchical Navigable Small World',
        body:
          '<p>The most common index for fast approximate nearest-neighbor search. It builds a layered graph over the stored vectors: sparse "express lanes" at the top for big jumps across the space, denser layers below for fine local steps. A query enters at the top, greedily hops toward closer and closer neighbours, and drops down the layers — reaching the nearest vectors in a few dozen hops instead of comparing against all of them.</p>' +
          '<p>The cost is memory (it stores the graph) and a small chance of missing the true nearest neighbour, in exchange for millisecond search over millions of vectors. It\'s the default index in Pinecone, Weaviate, Qdrant, and pgvector.</p>',
      },
      'nli': {
        title: 'NLI · Natural Language Inference',
        body:
          '<p>A model trained to judge, given two texts — a <em>premise</em> and a <em>hypothesis</em> — whether the premise <strong>entails</strong> the hypothesis, <strong>contradicts</strong> it, or is <strong>neutral</strong>. In one word: does this text <em>support</em> that claim?</p>' +
          '<p>In RAG it powers the Step 5 grounding check: take each retrieved chunk as the premise and each sentence of the LLM\'s answer as the hypothesis. If no chunk entails a sentence, that sentence is ungrounded — a likely hallucination — so the system flags, drops, or refuses it. A small dedicated NLI model (e.g. DeBERTa fine-tuned on MNLI) does this far more cheaply than asking a full LLM to judge.</p>',
      },
      'ivf-pq': {
        title: 'IVF-PQ · inverted file + product quantization',
        body:
          '<p>A two-part trick for searching huge vector sets cheaply. <strong>IVF (inverted file)</strong> clusters all the vectors into buckets, so a query only searches the few buckets nearest its own cluster and skips the rest. <strong>PQ (product quantization)</strong> then compresses each vector into a short code (it splits the vector into pieces and rounds each piece to the nearest entry in a small codebook), so millions of vectors fit in RAM and distance comparisons become fast table lookups.</p>' +
          '<p>The result is a smaller, faster index than HNSW at very large scale, in exchange for more approximation. It\'s the FAISS / Milvus workhorse for billion-vector corpora.</p>',
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

    function hide() {
      clearActive();
      panel.hidden = true;
    }

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

    if (closeBtn) closeBtn.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (panel.hidden) return;
      if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
      hide();
    });
  }

  /* ============================================================ */
  /* Widget 5 · vector database — drag the query, see k-NN         */
  /* ============================================================ */
  function initVectorDB() {
    const root = document.getElementById('viz-vectordb');
    if (!root) return;

    const DOC_COLOR = {
      'password_policy.md': '#b14a2e',
      'network_help.md':    '#3a6ea5',
      'onboarding.md':      '#3f8a5f',
      'architecture.md':    '#7a55a0',
    };
    const POINTS = [
      { id: 'pw-0',  doc: 'password_policy.md', chunk: 0, x: 0.18, y: 0.24, text: 'Reset your password at login.megacorpai.local …' },
      { id: 'pw-1',  doc: 'password_policy.md', chunk: 1, x: 0.27, y: 0.31, text: 'Passwords rotate every 90 days; 14-char minimum …' },
      { id: 'pw-2',  doc: 'password_policy.md', chunk: 2, x: 0.14, y: 0.36, text: 'Okta Verify is the preferred second factor …' },
      { id: 'net-0', doc: 'network_help.md',    chunk: 0, x: 0.74, y: 0.22, text: 'Connect to the VPN with GlobalProtect …' },
      { id: 'net-1', doc: 'network_help.md',    chunk: 1, x: 0.82, y: 0.30, text: 'The office subnet is 10.20.0.0/16 …' },
      { id: 'net-2', doc: 'network_help.md',    chunk: 2, x: 0.70, y: 0.34, text: 'DNS is served from ns1.megacorpai.local …' },
      { id: 'onb-0', doc: 'onboarding.md',      chunk: 0, x: 0.27, y: 0.72, text: 'New hires complete orientation in week one …' },
      { id: 'onb-1', doc: 'onboarding.md',      chunk: 1, x: 0.36, y: 0.80, text: 'Request a laptop and badge from IT on day one …' },
      { id: 'onb-2', doc: 'onboarding.md',      chunk: 2, x: 0.20, y: 0.80, text: 'Benefits enrollment closes after 30 days …' },
      { id: 'arch-0', doc: 'architecture.md',   chunk: 0, x: 0.74, y: 0.71, text: 'Services run on Kubernetes in us-east-1 …' },
      { id: 'arch-1', doc: 'architecture.md',   chunk: 1, x: 0.83, y: 0.79, text: 'The primary datastore is PostgreSQL 15 …' },
      { id: 'arch-2', doc: 'architecture.md',   chunk: 2, x: 0.70, y: 0.81, text: 'db-prod.megacorpai.local hosts the write replica …' },
    ];
    function vecPreview(i) {
      const out = []; let s = i * 7 + 3;
      for (let d = 0; d < 6; d++) { s = (s * 1103515245 + 12345) & 0x7fffffff; out.push(((s % 2000) / 1000 - 1).toFixed(2)); }
      return out;
    }

    const W = 440, H = 300, PADX = 34, PADY = 24, PW = W - 2 * PADX, PH = H - 2 * PADY;
    const sx = x => PADX + x * PW, sy = y => PADY + y * PH;
    let q = { x: 0.5, y: 0.5 }, k = 3;

    const legend = Object.entries(DOC_COLOR).map(([doc, c]) =>
      '<span><i style="background:' + c + '"></i>' + doc.replace('.md', '') + '</span>').join('');
    root.insertAdjacentHTML('beforeend',
      '<div class="vdb-wrap">' +
        '<div class="vdb-canvas" id="vdb-canvas"></div>' +
        '<div class="vdb-panel">' +
          '<label class="vdb-k">k nearest = <strong id="vdb-kval">3</strong>' +
            '<input type="range" id="vdb-k" min="1" max="5" value="3"></label>' +
          '<div class="vdb-legend">' + legend + '</div>' +
          '<div class="vdb-results" id="vdb-results"></div>' +
          '<div class="vdb-record" id="vdb-record"></div>' +
        '</div>' +
      '</div>');

    const canvas = root.querySelector('#vdb-canvas');
    const results = root.querySelector('#vdb-results');
    const record = root.querySelector('#vdb-record');

    function render() {
      const ranked = POINTS.map((p, i) => ({ p, i, d: Math.hypot(p.x - q.x, p.y - q.y) })).sort((a, b) => a.d - b.d);
      const top = ranked.slice(0, k);
      const topIds = new Set(top.map(t => t.p.id));
      const qx = sx(q.x), qy = sy(q.y);

      let g = '';
      g += '<line x1="' + PADX + '" y1="' + (H - PADY) + '" x2="' + (W - PADX) + '" y2="' + (H - PADY) + '" stroke="#d9d3c4" stroke-width="1"/>';
      g += '<line x1="' + PADX + '" y1="' + PADY + '" x2="' + PADX + '" y2="' + (H - PADY) + '" stroke="#d9d3c4" stroke-width="1"/>';
      g += '<text x="' + (W - PADX) + '" y="' + (H - PADY + 15) + '" text-anchor="end" font-size="10" fill="#9a9384" font-family="ui-monospace, monospace">embedding dim i →</text>';
      g += '<text x="' + (PADX - 4) + '" y="' + (PADY - 9) + '" font-size="10" fill="#9a9384" font-family="ui-monospace, monospace">↑ dim j</text>';
      top.forEach(t => { g += '<line x1="' + qx + '" y1="' + qy + '" x2="' + sx(t.p.x) + '" y2="' + sy(t.p.y) + '" stroke="#b14a2e" stroke-width="1.3" stroke-dasharray="3 3" opacity="0.7"/>'; });
      POINTS.forEach(p => {
        const hit = topIds.has(p.id);
        g += '<circle cx="' + sx(p.x) + '" cy="' + sy(p.y) + '" r="' + (hit ? 9 : 7) + '" fill="' + DOC_COLOR[p.doc] + '" opacity="' + (hit ? 1 : 0.3) + '"' + (hit ? ' stroke="#1f1d1a" stroke-width="1.5"' : '') + '/>';
      });
      g += '<circle cx="' + qx + '" cy="' + qy + '" r="11" fill="none" stroke="#1f1d1a" stroke-width="1.5"/>';
      g += '<line x1="' + (qx - 7) + '" y1="' + qy + '" x2="' + (qx + 7) + '" y2="' + qy + '" stroke="#1f1d1a" stroke-width="2"/>';
      g += '<line x1="' + qx + '" y1="' + (qy - 7) + '" x2="' + qx + '" y2="' + (qy + 7) + '" stroke="#1f1d1a" stroke-width="2"/>';
      g += '<text x="' + (qx + 14) + '" y="' + (qy + 4) + '" font-size="11" font-weight="700" fill="#1f1d1a">query</text>';
      canvas.innerHTML = '<svg class="vdb-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-label="two-dimensional vector space">' + g + '</svg>';

      results.innerHTML = top.map((t, idx) =>
        '<div class="vdb-res-row">' +
          '<span class="vdb-res-rank">' + (idx + 1) + '</span>' +
          '<span class="vdb-dot" style="background:' + DOC_COLOR[t.p.doc] + '"></span>' +
          '<span>' + t.p.doc + ' · chunk ' + t.p.chunk + '</span>' +
          '<span class="vdb-res-dist">dist ' + t.d.toFixed(2) + '</span>' +
        '</div>').join('');

      const h = top[0].p, hi = top[0].i;
      record.innerHTML =
        '{\n' +
        '  <span class="vdb-key">"id"</span>: <span class="vdb-str">"' + h.id + '"</span>,\n' +
        '  <span class="vdb-key">"vector"</span>: [<span class="vdb-num">' + vecPreview(hi).join(', ') + '</span>, …]  <span class="vdb-dim">(128-d)</span>,\n' +
        '  <span class="vdb-key">"payload"</span>: {\n' +
        '    <span class="vdb-key">"doc"</span>: <span class="vdb-str">"' + h.doc + '"</span>,\n' +
        '    <span class="vdb-key">"chunk_idx"</span>: <span class="vdb-num">' + h.chunk + '</span>,\n' +
        '    <span class="vdb-key">"text"</span>: <span class="vdb-str">"' + h.text + '"</span>\n' +
        '  }\n' +
        '}';
    }

    function moveTo(clientX, clientY) {
      const svg = canvas.querySelector('svg');
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const vx = (clientX - r.left) / r.width * W, vy = (clientY - r.top) / r.height * H;
      q.x = Math.min(1, Math.max(0, (vx - PADX) / PW));
      q.y = Math.min(1, Math.max(0, (vy - PADY) / PH));
      render();
    }
    let dragging = false;
    canvas.addEventListener('mousedown', e => { dragging = true; moveTo(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => { if (dragging) moveTo(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { dragging = false; });
    canvas.addEventListener('touchstart', e => { dragging = true; const t = e.touches[0]; moveTo(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', e => { if (dragging) { const t = e.touches[0]; moveTo(t.clientX, t.clientY); e.preventDefault(); } }, { passive: false });
    window.addEventListener('touchend', () => { dragging = false; });
    root.querySelector('#vdb-k').addEventListener('input', e => { k = +e.target.value; root.querySelector('#vdb-kval').textContent = k; render(); });

    render();
  }

  /* ============================================================ */
  /* Widget 6 · production RAG pipeline — hover a stage, see the   */
  /*            microRAG step it maps to and the failure it fixes  */
  /* ============================================================ */
  function initProdPipeline() {
    const root = document.getElementById('viz-prod-pipeline');
    if (!root) return;

    const STEP = {
      retrieve: { n: 'Step 3 · retrieve', c: '#3a6ea5' },
      augment:  { n: 'Step 4 · augment',  c: '#b14a2e' },
      generate: { n: 'Step 5 · generate', c: '#7a55a0' },
      io:       { n: 'input / output',    c: '#6b6456' },
    };
    const STAGES = [
      { row: 0, col: 'full',  step: 'io',       label: 'user query', sub: '' },
      { row: 1, col: 'full',  step: 'retrieve', label: 'query rewriter', sub: 'LLM · ~$0.0001', note: 'none — the raw query goes in as-is', fix: 'vague queries that miss the right chunks' },
      { row: 2, col: 'left',  step: 'retrieve', label: 'BM25 first-pass', sub: 'OpenSearch · ~10 ms', note: 'the TF-IDF index, brute-forced', fix: 'scale — sub-ms keyword search over 100M docs' },
      { row: 2, col: 'right', step: 'retrieve', label: 'ANN first-pass', sub: 'Pinecone · ~5 ms', note: 'the hashed embedding, brute-forced', fix: 'scale — HNSW instead of scanning every vector' },
      { row: 3, col: 'full',  step: 'retrieve', label: 'reranker', sub: 'Cohere Rerank v3 · ~50 ms', note: 'none — the hybrid blend is the only ranking', fix: 'the first pass is coarse; a cross-encoder re-scores the top-100', inLabel: 'merge top-100' },
      { row: 4, col: 'full',  step: 'augment',  label: 'prompt assembly', sub: 'Jinja2 · <1 ms', note: 'the f-string in augment()', fix: 'citation markers, freshness metadata, templating', inLabel: 'top-4 chunks' },
      { row: 5, col: 'full',  step: 'generate', label: 'grounded LLM', sub: 'GPT-4o / Kimi K2.5 · ~700 ms', note: 'the chat() call', fix: 'nothing — this IS Step 5, generate' },
      { row: 6, col: 'left',  step: 'generate', label: 'output validator', sub: 'NLI grounding · ~30 ms', note: 'none', fix: 'hallucination — checks each answer sentence is grounded' },
      { row: 6, col: 'right', step: 'generate', label: 'output redactor', sub: 'Presidio + regex · ~5 ms', note: 'none', fix: 'PII / secret leakage in the answer' },
      { row: 7, col: 'full',  step: 'io',       label: 'answer + citations', sub: '' },
    ];

    const rowY = r => 14 + r * 72, H = 42;
    const geom = c => c === 'left' ? { x: 40, w: 180, cx: 130 }
                    : c === 'right' ? { x: 260, w: 180, cx: 350 }
                    : { x: 90, w: 300, cx: 240 };
    const cy = r => rowY(r) + H;

    function arrow(x1, y1, x2, y2) {
      return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#b8b1a1" stroke-width="1.3" marker-end="url(#pp-ar)"/>';
    }
    let g = '';
    // arrows (fixed topology)
    g += arrow(240, cy(0), 240, rowY(1));
    g += arrow(240, cy(1), 130, rowY(2)) + arrow(240, cy(1), 350, rowY(2));
    g += arrow(130, cy(2), 240, rowY(3)) + arrow(350, cy(2), 240, rowY(3));
    g += '<text x="300" y="' + (cy(2) + 16) + '" font-size="9.5" fill="#8a8371" font-family="ui-monospace,monospace">merge top-100</text>';
    g += arrow(240, cy(3), 240, rowY(4));
    g += '<text x="248" y="' + (cy(3) + 18) + '" font-size="9.5" fill="#8a8371" font-family="ui-monospace,monospace">top-4 chunks</text>';
    g += arrow(240, cy(4), 240, rowY(5));
    g += arrow(240, cy(5), 130, rowY(6)) + arrow(240, cy(5), 350, rowY(6));
    g += arrow(130, cy(6), 240, rowY(7)) + arrow(350, cy(6), 240, rowY(7));
    // boxes
    STAGES.forEach((s, i) => {
      const gm = geom(s.col), y = rowY(s.row), col = STEP[s.step].c;
      g += '<g class="pp-stage" data-i="' + i + '">';
      g += '<rect x="' + gm.x + '" y="' + y + '" width="' + gm.w + '" height="' + H + '" rx="6" fill="' + col + '" fill-opacity="0.12" stroke="' + col + '" stroke-width="1.4"/>';
      g += '<text x="' + gm.cx + '" y="' + (y + (s.sub ? 18 : 26)) + '" text-anchor="middle" font-size="12.5" font-weight="600" fill="#1f1d1a">' + s.label + '</text>';
      if (s.sub) g += '<text x="' + gm.cx + '" y="' + (y + 33) + '" text-anchor="middle" font-size="9.5" fill="#6b6456" font-family="ui-monospace,monospace">' + s.sub + '</text>';
      g += '</g>';
    });

    const legend = ['retrieve', 'augment', 'generate'].map(k =>
      '<span><i style="background:' + STEP[k].c + '"></i>' + STEP[k].n + '</span>').join('');

    root.insertAdjacentHTML('beforeend',
      '<div class="pp-wrap">' +
        '<div class="pp-canvas" id="pp-canvas">' +
          '<svg class="pp-svg" viewBox="0 0 480 576" aria-label="production RAG pipeline">' +
            '<defs><marker id="pp-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#b8b1a1"/></marker></defs>' +
            g +
          '</svg>' +
        '</div>' +
        '<div class="pp-side">' +
          '<div class="pp-legend">' + legend + '<span class="pp-note">chunk &amp; index (Steps 1–2) happen once, at ingest</span></div>' +
          '<div class="pp-panel" id="pp-panel"></div>' +
        '</div>' +
      '</div>');

    const panel = root.querySelector('#pp-panel');
    const DEFAULT = '<p class="pp-hint">Hover (or tap) a stage to see which of microRAG\'s five steps it is a scaled-up version of — and the failure in the bare version it exists to fix.</p>';
    panel.innerHTML = DEFAULT;

    function showStage(i) {
      const s = STAGES[i]; if (!s) return;
      const st = STEP[s.step];
      let h = '<div class="pp-panel-title" style="color:' + st.c + '">' + s.label + '</div>';
      h += '<div class="pp-map">maps to → <strong>' + st.n + '</strong></div>';
      if (s.sub) h += '<div class="pp-sub">' + s.sub + '</div>';
      if (s.note) h += '<div class="pp-row"><span class="pp-k">in microRAG:</span> ' + s.note + '</div>';
      if (s.fix) h += '<div class="pp-row"><span class="pp-k">fixes:</span> ' + s.fix + '</div>';
      if (!s.note && !s.fix) h += '<div class="pp-row">the query in and the answer out — the two ends microRAG already has.</div>';
      panel.innerHTML = h;
    }
    const canvas = root.querySelector('#pp-canvas');
    canvas.addEventListener('mouseover', e => { const g = e.target.closest('.pp-stage'); if (g) showStage(+g.dataset.i); });
    canvas.addEventListener('click', e => { const g = e.target.closest('.pp-stage'); if (g) showStage(+g.dataset.i); });
    canvas.querySelectorAll('.pp-stage').forEach(el => {
      el.setAttribute('tabindex', '0');
      el.addEventListener('focus', () => showStage(+el.dataset.i));
    });
  }

  /* ============================================================ */
  /* Widget 7 · NLI answer-grounding check                        */
  /* ============================================================ */
  function initNLI() {
    const root = document.getElementById('viz-nli');
    if (!root) return;

    const V = {
      entails:     { t: 'ENTAILS',     c: '#3f8a5f' },
      neutral:     { t: 'NEUTRAL',     c: '#6b6456' },
      contradicts: { t: 'CONTRADICTS', c: '#c0392b' },
    };
    const CTX = [
      { id: 'password_policy.md#0', text: 'To reset your MegaCorpAI password, open the login page, click "Need help signing in", then authenticate with Okta Verify (preferred) or the SMS fallback.' },
      { id: 'password_policy.md#1', text: 'Passwords rotate every 90 days. Choose a passphrase of at least sixteen characters, including one symbol and one number.' },
      { id: 'onboarding.md#0',      text: 'New hires complete orientation during their first week and request a laptop and badge from IT.' },
    ];
    const SENT = [
      { text: 'To reset your password, open the login page and authenticate with Okta Verify.', premise: 'password_policy.md#0', verdict: 'entails',     reason: 'Chunk 0 states exactly this — the sentence is fully supported by a retrieved chunk.' },
      { text: 'If you get locked out, call the IT helpdesk at extension 4357.',                 premise: null,                verdict: 'neutral',     reason: 'No retrieved chunk mentions a helpdesk or an extension. The model invented a plausible detail — a textbook hallucination.' },
      { text: 'A new passphrase needs at least eight characters.',                              premise: 'password_policy.md#1', verdict: 'contradicts', reason: 'Chunk 1 says at least SIXTEEN characters. The model misread its own source — a contradiction, not just an omission.' },
      { text: 'Password resets are approved by your manager within 24 hours.',                  premise: null,                verdict: 'neutral',     reason: 'Nothing in the context mentions manager approval or a 24-hour window — unsupported by every chunk.' },
    ];

    const ctxHtml = CTX.map(c =>
      '<div class="nli-ctx" data-cid="' + c.id + '"><span class="nli-cid">' + c.id + '</span>' + c.text + '</div>').join('');
    const btnHtml = SENT.map((s, i) =>
      '<button type="button" class="nli-btn" data-si="' + i + '">' + s.text + '</button>').join('');
    root.insertAdjacentHTML('beforeend',
      '<div class="nli-wrap">' +
        '<div class="nli-left"><div class="nli-head">Retrieved context · the premises</div>' + ctxHtml + '</div>' +
        '<div class="nli-right"><div class="nli-head">Candidate answer sentences · the hypotheses</div>' +
          '<div class="nli-btns">' + btnHtml + '</div><div class="nli-card" id="nli-card"></div></div>' +
      '</div>');

    const card = root.querySelector('#nli-card');
    const ctxEls = root.querySelectorAll('.nli-ctx');
    const btnEls = root.querySelectorAll('.nli-btn');
    card.innerHTML = '<p class="nli-hint">Pick a sentence to check it against the retrieved context.</p>';

    function show(i) {
      const s = SENT[i], v = V[s.verdict], grounded = s.verdict === 'entails';
      ctxEls.forEach(e => e.classList.toggle('active', e.dataset.cid === s.premise));
      btnEls.forEach((e, j) => e.classList.toggle('active', j === i));
      card.innerHTML =
        '<div class="nli-line"><span class="nli-k">hypothesis:</span> <em>"' + s.text + '"</em></div>' +
        '<div class="nli-line"><span class="nli-k">checked against:</span> ' +
          (s.premise ? '<code>' + s.premise + '</code>' : '<span class="nli-none">no chunk supports it</span>') + '</div>' +
        '<div class="nli-verdict"><span class="nli-badge" style="background:' + v.c + '">' + v.t + '</span>' +
          '<span class="nli-ground ' + (grounded ? 'ok' : 'bad') + '">' + (grounded ? '✓ grounded' : '✗ flagged') + '</span></div>' +
        '<div class="nli-reason">' + s.reason + '</div>';
    }
    btnEls.forEach((e, i) => e.addEventListener('click', () => show(i)));
  }

  /* ============================================================ */
  /* Boot                                                          */
  /* ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    initPipeline();
    initChunking();
    initTfidf();
    initHybrid();
    initVectorDB();
    initProdPipeline();
    initNLI();
    initGlossary();
  });
})();
