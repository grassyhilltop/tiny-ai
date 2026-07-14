/* ============================================================
 * Lab 12 — viz.js
 *
 * Widgets:
 *   1. #viz-try-it     — interactive AI component stack
 *   2. #glossary-panel — inline glossary (shared pattern)
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
  // Widget 1 · AI component stack
  // ============================================================
  (function initStack() {
    const svg = document.getElementById('stack-svg');
    if (!svg) return;
    const detail = document.getElementById('stack-detail');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const LAYERS = [
      {
        id: 'l9', num: '9', name: 'Observability',
        sub: 'logs · traces · metrics · alerts',
        bracket: 'Operations',
        attacks: ['log injection (forge audit trail)', 'denial-of-monitoring (flood with noise)', 'PII over-logging (regulatory exposure)'],
        defenses: ['structured logs (JSON, hashed prompts)', 'tamper-evident storage (append-only)', 'rate-limit log writers', 'separation of duties — log readers ≠ log writers'],
        tools: 'OpenTelemetry · Vector · Loki · Grafana',
      },
      {
        id: 'l8', num: '8', name: 'Identity & access',
        sub: 'OAuth · SSO · API keys · RBAC',
        bracket: 'Operations',
        attacks: ['stolen API keys', 'session-token replay', 'over-broad scopes ("admin for everyone")', 'service-account sprawl'],
        defenses: ['short-lived tokens (15 min)', 'least-privilege scopes', 'audited key rotation', 'service-account inventory + 30-day unused cleanup'],
        tools: 'Auth0 · Keycloak · cloud IAM',
      },
      {
        id: 'l7', num: '7', name: 'Network',
        sub: 'TLS · ingress · WAF · load balancer',
        bracket: 'Operations',
        attacks: ['TLS downgrade', 'request smuggling', 'volumetric DoS', 'unrestricted egress (used by compromised app to call out)'],
        defenses: ['TLS 1.3 only · HSTS · mTLS for internal', 'egress allowlist', 'WAF for common patterns', 'separate ingress per environment'],
        tools: 'Caddy · Nginx · Cloudflare · Cilium',
      },
      {
        id: 'l6', num: '6', name: 'Application logic',
        sub: 'agent · RAG · pipelines',
        bracket: 'Application',
        attacks: ['prompt injection from retrieved docs', 'tool-call escalation (agent does more than user intended)', 'business-rule bypass'],
        defenses: ['allowed-tools whitelist per agent', 'output classifier (your Lab 11 work)', 'human-in-the-loop for destructive tools', 'session budgets and time-boxes'],
        tools: 'LangChain · LlamaIndex · custom code',
      },
      {
        id: 'l5', num: '5', name: 'Application API',
        sub: 'FastAPI · Flask · gateway',
        bracket: 'Application',
        attacks: ['model exfiltration (high-volume querying)', 'system-prompt extraction', 'OWASP API Top-10 (BOLA, BFLA, mass assignment)'],
        defenses: ['per-user rate limiting', 'prompt length caps', 'output filter on system-prompt fragments', 'OWASP API checklist'],
        tools: 'FastAPI · slowapi · Kong · APISIX',
      },
      {
        id: 'l4', num: '4', name: 'Inference server',
        sub: 'vLLM · TGI · Triton',
        bracket: 'Serving',
        assignment: true,
        attacks: ['KV-cache cross-talk between users', 'unbounded request fills cache → DoS', 'unauthenticated default API'],
        defenses: ['per-request cache isolation', 'max-tokens / max-prompt-length budgets', 'API-key auth (vLLM ships keyless by default)', 'localhost binding + reverse proxy'],
        tools: 'vLLM · TGI · Triton Inference Server',
      },
      {
        id: 'l3', num: '3', name: 'Model weights',
        sub: '.safetensors / .gguf on disk',
        bracket: 'Serving',
        attacks: ['supply-chain swap (poisoned variant)', 'weight exfiltration (insider with disk read)', 'weight modification (abliteration, see Lab 11!)'],
        defenses: ['SHA-256 verification on load', 'Sigstore-signed artifacts where available', 'read-only mount for the server', 'encryption at rest'],
        tools: 'Sigstore · SLSA · Hugging Face signed commits',
      },
      {
        id: 'l2', num: '2', name: 'Inference runtime',
        sub: 'CUDA · PyTorch · JAX',
        bracket: 'Platform',
        attacks: ['compromised package (pip / conda supply chain)', 'kernel-level data leak between GPU contexts', 'PyTorch pickle deserialization (CVE-2024-3568)'],
        defenses: ['lockfile pinning + SBOM', 'CUDA MPS isolation', 'safetensors not pickle for weights', 'GPU driver patching cadence'],
        tools: 'pip-tools · uv · Syft (SBOM)',
      },
      {
        id: 'l1', num: '1', name: 'Hardware + OS',
        sub: 'GPU · driver · kernel · hypervisor',
        bracket: 'Platform',
        attacks: ['physical access', 'firmware tampering', 'hypervisor escape (multi-tenant)', 'side-channel (Spectre-class)'],
        defenses: ['secure boot', 'measured boot + TPM attestation', 'TEE / confidential computing (Intel TDX, AMD SEV, NVIDIA CC)', 'no shared tenants for sensitive workloads'],
        tools: 'Intel TDX · AMD SEV-SNP · NVIDIA H100 CC',
      },
    ];

    // Layout: layer rows top-to-bottom (9 → 1, so reading top→down reads the user-facing→hardware direction)
    const W = 600, ROW_H = 50, ROW_GAP = 4, BRACKET_W = 96, ROW_X = 28 + BRACKET_W;
    const ROW_W = W - ROW_X - 28;

    // Group layers by bracket so we can draw the bracket bars on the left
    const bracketGroups = [];
    let curBracket = null;
    LAYERS.forEach((L, i) => {
      const y = 22 + i * (ROW_H + ROW_GAP);
      if (!curBracket || curBracket.label !== L.bracket) {
        curBracket = { label: L.bracket, yTop: y, yBot: y + ROW_H };
        bracketGroups.push(curBracket);
      } else {
        curBracket.yBot = y + ROW_H;
      }

      // Layer row
      const row = el('rect', {
        class: 'stack-layer' + (L.assignment ? ' assignment' : ''),
        'data-id': L.id,
        x: ROW_X, y, width: ROW_W, height: ROW_H, rx: 6,
      }, svg);
      el('text', { class: 'layer-num',  x: ROW_X + 22, y: y + ROW_H / 2 }, svg, L.num);
      el('text', { class: 'layer-name', x: ROW_X + 50, y: y + 21 }, svg, L.name);
      el('text', { class: 'layer-sub',  x: ROW_X + 50, y: y + 38 }, svg, L.sub);

      row.addEventListener('click',      () => activate(L.id));
      row.addEventListener('mouseenter', () => activate(L.id, true));
    });

    // Brackets on the left
    bracketGroups.forEach(g => {
      const midY = (g.yTop + g.yBot) / 2;
      // Bracket lines
      el('path', {
        class: 'stack-bracket',
        d: 'M 24 ' + g.yTop +
           ' L 18 ' + g.yTop +
           ' L 18 ' + g.yBot +
           ' L 24 ' + g.yBot,
      }, svg);
      // Rotated label
      el('text', {
        class: 'stack-bracket-label',
        x: 10, y: midY,
        transform: 'rotate(-90 10 ' + midY + ')',
        'text-anchor': 'middle',
      }, svg, g.label);
    });

    function activate(id) {
      const L = LAYERS.find(l => l.id === id);
      if (!L) return;
      svg.querySelectorAll('.stack-layer').forEach(r =>
        r.classList.toggle('active', r.getAttribute('data-id') === id)
      );
      const html =
        '<div class="stack-detail-title">' + L.num + ' · ' + L.name + (L.assignment ? ' · assignment-anchor layer' : '') + '</div>' +
        '<div class="stack-detail-section">attacks</div>' +
        '<ul>' + L.attacks.map(a => '<li>' + a + '</li>').join('') + '</ul>' +
        '<div class="stack-detail-section">defenses</div>' +
        '<ul>' + L.defenses.map(d => '<li>' + d + '</li>').join('') + '</ul>' +
        '<div class="stack-detail-section">common tools</div>' +
        '<div style="font-family: var(--mono); font-size: 13px;">' + L.tools + '</div>';
      detail.innerHTML = html;
    }
    activate('l4'); // Default to the assignment anchor
  })();

  // ============================================================
  // Widget · macOS / Windows code tabs
  // ============================================================
  (function initCodetabs() {
    document.querySelectorAll('.codetabs').forEach(function (box) {
      const btns = box.querySelectorAll('.codetab-btn');
      const panels = box.querySelectorAll('.codetab-panel');
      btns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          const os = btn.getAttribute('data-os');
          btns.forEach(b => b.classList.toggle('active', b === btn));
          panels.forEach(p => { p.hidden = p.getAttribute('data-os') !== os; });
        });
      });
    });
  })();

  // ============================================================
  // Widget · two phases + growing KV cache
  // ============================================================
  (function initKvCache() {
    const svg = document.getElementById('kv-svg');
    if (!svg) return;
    const readout = document.getElementById('kv-readout');
    const sel = document.getElementById('kv-model');
    const TOKENS = ['Four','score','and','seven','years','ago','our',
                    'fathers','brought','forth','upon','this','continent','a','new'];
    const PROMPT_LEN = 7;
    let n = 0;           // tokens whose KV is cached
    let prefilled = false;

    function perTokenMB() { return parseFloat(sel.options[sel.selectedIndex].dataset.kv); }

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const cw = 38, gap = 2, x0 = 10, y = 54, h = 28;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (cw + gap);
        const isPrompt = i < PROMPT_LEN;
        el('rect', { x, y, width: cw, height: h, rx: 3,
          fill: isPrompt ? '#d5e6dc' : '#fde0d2',
          stroke: isPrompt ? '#5a8a6f' : '#b14a2e', 'stroke-width': 1.2 }, svg);
        el('text', { x: x + cw / 2, y: y + h / 2 + 4, 'text-anchor': 'middle',
          'font-size': 9, 'font-family': 'var(--mono)' }, svg, TOKENS[i] || '');
      }
      // brackets / labels
      if (n > 0) {
        const pxEnd = x0 + Math.min(n, PROMPT_LEN) * (cw + gap) - gap;
        el('text', { x: x0, y: y - 10, 'font-size': 11, 'font-weight': 600, fill: '#5a8a6f' }, svg,
          'prompt · prefill (one parallel pass)');
        if (n > PROMPT_LEN) {
          el('text', { x: pxEnd + 8, y: y - 10, 'font-size': 11, 'font-weight': 600, fill: '#b14a2e' }, svg,
            'decode · one token per step →');
        }
      } else {
        el('text', { x: x0, y: y - 10, 'font-size': 11, fill: '#8a8577' }, svg, 'press Prefill to begin');
      }
      const mb = (n * perTokenMB());
      readout.innerHTML = n === 0
        ? 'KV cache: <strong>0</strong> — nothing cached yet.'
        : 'Cached tokens: <strong>' + n + '</strong> &nbsp;·&nbsp; KV cache ≈ <strong>' + n +
          ' × ' + perTokenMB() + ' MB = ' + (mb >= 1024 ? (mb/1024).toFixed(2)+' GB' : mb.toFixed(2)+' MB') +
          '</strong>' + (n > PROMPT_LEN
            ? ' &nbsp;·&nbsp; <span style="color:#b14a2e">decode is memory-bound — each step just appends one token\'s KV</span>'
            : ' &nbsp;·&nbsp; prefill computed all ' + PROMPT_LEN + ' prompt tokens at once');
    }
    document.getElementById('kv-prefill').addEventListener('click', () => { n = PROMPT_LEN; prefilled = true; render(); });
    document.getElementById('kv-step').addEventListener('click', () => {
      if (!prefilled) { n = PROMPT_LEN; prefilled = true; }
      else if (n < TOKENS.length) n++;
      render();
    });
    document.getElementById('kv-reset').addEventListener('click', () => { n = 0; prefilled = false; render(); });
    sel.addEventListener('change', render);
    render();
  })();

  // ============================================================
  // Widget · PagedAttention block-table translation (Kwon Fig. 3.6)
  // ============================================================
  (function initPaged() {
    const svg = document.getElementById('paged-svg');
    if (!svg) return;
    const caption = document.getElementById('paged-caption');
    const B = 4;                               // block size
    const PROMPT = ['Four','score','and','seven','years','ago','our'];
    const OUTPUTS = ['fathers','brought','forth','upon','this','continent'];
    const ALL = PROMPT.concat(OUTPUTS);
    const PHYS_ORDER = [7, 1, 3, 5, 0, 2, 4, 6, 8];  // physical blocks handed out (paper uses 7,1,3)
    const NPHYS = 9;

    const CAPTIONS = [
      'Press ① to run prefill.',
      '① Prefill: the 7 prompt tokens fill logical block 0 (→ physical 7) and 3 slots of logical block 1 (→ physical 1). The 4th slot of block 1 is reserved for the first generated token.',
      '② Decode "fathers": it lands in the reserved slot of logical block 1. No new block needed — the block table just bumps block 1 to filled 4/4.',
      '③ Decode "brought": logical block 1 is full, so vLLM allocates a NEW logical block 2 and maps it to physical block 3. Note 7, 1, 3 are scattered — non-contiguous is fine.',
      'Decode "forth": fills logical block 2 (physical 3), now 2/4.',
      'Decode "upon": logical block 2 now 3/4.',
      'Decode "this": logical block 2 fills to 4/4.',
      'Decode "continent": block 2 full — allocate logical block 3 → physical 5.',
    ];

    let step = 0;   // 0 idle, 1 prefill(7 tokens), 2.. each +1 token
    function tokenCount() { return step === 0 ? 0 : Math.min(PROMPT.length + (step - 1), ALL.length); }

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const n = tokenCount();
      const nBlocks = Math.max(0, Math.ceil(n / B));

      // ---- column titles
      el('text', { x: 12, y: 16, 'font-size': 12, 'font-weight': 700 }, svg, 'Logical KV blocks');
      el('text', { x: 232, y: 16, 'font-size': 12, 'font-weight': 700 }, svg, 'Block table');
      el('text', { x: 440, y: 16, 'font-size': 12, 'font-weight': 700, fill: '#b14a2e' }, svg, 'Physical KV blocks · GPU DRAM');

      const cwL = 38, hL = 26, rowGap = 46, yTop = 34, xL = 20;

      // ---- logical blocks + block table rows
      for (let b = 0; b < nBlocks; b++) {
        const by = yTop + b * rowGap;
        const filled = Math.min(B, n - b * B);
        const phys = PHYS_ORDER[b];
        el('text', { x: xL, y: by - 4, 'font-size': 10, fill: '#8a8577' }, svg, 'logical block ' + b);
        for (let s = 0; s < B; s++) {
          const idx = b * B + s;
          const x = xL + s * (cwL + 2);
          const isFilled = idx < n;
          const isReserved = !isFilled && b === nBlocks - 1;
          el('rect', { x, y: by, width: cwL, height: hL, rx: 3,
            fill: isFilled ? '#fde0d2' : (isReserved ? '#f0eee5' : '#fff'),
            stroke: isFilled ? '#b14a2e' : '#cfc9b8', 'stroke-width': isFilled ? 1.2 : 1,
            'stroke-dasharray': isReserved ? '3 2' : 'none' }, svg);
          if (isFilled) el('text', { x: x + cwL / 2, y: by + hL / 2 + 4, 'text-anchor': 'middle',
            'font-size': 8.5, 'font-family': 'var(--mono)' }, svg, ALL[idx]);
          else if (isReserved) el('text', { x: x + cwL / 2, y: by + hL / 2 + 4, 'text-anchor': 'middle',
            'font-size': 7.5, fill: '#a8a291' }, svg, 'resv');
        }
        // block-table row
        const bx = 228, bw = 176;
        el('rect', { x: bx, y: by, width: bw, height: hL, rx: 3, fill: '#eef2f6', stroke: '#9db3c4' }, svg);
        el('text', { x: bx + 10, y: by + hL / 2 + 4, 'font-size': 11, 'font-family': 'var(--mono)' }, svg,
          'L' + b + '  →  physical ' + phys);
        el('text', { x: bx + bw - 8, y: by + hL / 2 + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#5a6b7a' }, svg,
          'filled ' + filled + '/' + B);
      }
      if (nBlocks === 0) el('text', { x: xL, y: yTop + 16, 'font-size': 11, fill: '#8a8577' }, svg, '(empty)');

      // ---- physical grid (blocks 0..8)
      const xP = 442, cwP = 36, hP = 18, pGap = 4, yP = 30;
      const assigned = {};
      for (let b = 0; b < nBlocks; b++) assigned[PHYS_ORDER[b]] = b;
      for (let p = 0; p < NPHYS; p++) {
        const py = yP + p * (hP + pGap);
        el('text', { x: xP - 4, y: py + hP / 2 + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#8a8577' }, svg, 'blk ' + p);
        const b = assigned[p];
        for (let s = 0; s < B; s++) {
          const x = xP + 4 + s * (cwP + 1);
          const idx = (b != null) ? b * B + s : -1;
          const isFilled = b != null && idx < n;
          el('rect', { x, y: py, width: cwP, height: hP, rx: 2,
            fill: isFilled ? '#fde0d2' : '#fff',
            stroke: isFilled ? '#b14a2e' : '#e4dfd2', 'stroke-width': isFilled ? 1.3 : 1 }, svg);
          if (isFilled) el('text', { x: x + cwP / 2, y: py + hP / 2 + 4, 'text-anchor': 'middle',
            'font-size': 8, 'font-family': 'var(--mono)' }, svg, ALL[idx]);
        }
        if (b != null) el('text', { x: xP + 4 + B * (cwP + 1) + 6, y: py + hP / 2 + 4, 'font-size': 9, 'font-weight': 700, fill: '#b14a2e' }, svg, '←L' + b);
      }

      caption.textContent = CAPTIONS[Math.min(step, CAPTIONS.length - 1)];
    }

    document.getElementById('pg-prefill').addEventListener('click', () => { step = 1; render(); });
    document.getElementById('pg-step').addEventListener('click', () => {
      if (step === 0) step = 1;
      else if (tokenCount() < ALL.length) step++;
      render();
    });
    document.getElementById('pg-reset').addEventListener('click', () => { step = 0; render(); });
    render();
  })();

  // ============================================================
  // Widget 2 · Inline glossary (shared pattern)
  // ============================================================
  (function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'inference-server': {
        title: 'inference server',
        body:
          '<p>The piece of software whose only job is to serve a model efficiently. Sits between your application code and the GPU. Handles batching, KV-cache management, scheduling concurrent requests, and exposing an HTTP/gRPC API.</p>' +
          '<p>The dominant open-source options in 2026: <strong>vLLM</strong> (UC Berkeley, paged attention + continuous batching, the default), <strong>TGI</strong> / <strong>Text Generation Inference</strong> (Hugging Face), and <strong>Triton Inference Server</strong> (Nvidia, framework-agnostic). For development on a laptop, <strong>Ollama</strong> wraps <strong>llama.cpp</strong> with a friendly CLI; not a production server.</p>',
      },
      'vllm': {
        title: 'vLLM',
        body:
          '<p>Open-source inference server out of UC Berkeley (Kwon et al. 2023). Its innovation is <em>paged attention</em> — managing the KV cache like an OS manages virtual memory, so concurrent requests share GPU memory efficiently. The result is ~2-4× higher throughput than naïve implementations.</p>' +
          '<p>vLLM ships an OpenAI-compatible HTTP API out of the box, which is why every "drop-in replacement for OpenAI" stack starts here. Caveats for security: <em>ships keyless by default</em> (you must add <code>--api-key</code>), binds to <code>0.0.0.0</code> by default, and logs requests verbosely by default. All three are fixable in the launch command; all three are most-common misconfigurations.</p>',
      },
      'stride': {
        title: 'STRIDE',
        body:
          '<p>Microsoft\'s threat-modeling acronym: <strong>S</strong>poofing identity, <strong>T</strong>ampering with data, <strong>R</strong>epudiation, <strong>I</strong>nformation disclosure, <strong>D</strong>enial of service, <strong>E</strong>levation of privilege. Six classes of attack to check every component against.</p>' +
          '<p>Old (1999), still the right starter taxonomy for an audit. Modern alternatives — LINDDUN for privacy, OCTAVE for risk — are deeper but heavier. STRIDE\'s virtue is that you can run it in 30 minutes per component and produce a written record. <a href="https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats">Microsoft\'s reference</a>.</p>',
      },
      'kv-cache': {
        title: 'KV cache',
        body:
          '<p>The transformer trick that makes autoregressive generation tractable. As the model generates token N, it needs the key/value projections of every <em>previous</em> token in the sequence. Recomputing them from scratch each step would be quadratic; instead the server caches the key/value pairs (the "KV cache") and only computes new ones for the latest token. Result: linear-time generation.</p>' +
          '<p>The security wrinkle: when multiple requests are batched, their KV caches share GPU memory. Bugs in cache lifecycle (failure to clear between requests, off-by-one in slot allocation) can cause one user\'s tokens to influence another user\'s generation. vLLM\'s paged-attention design handles this carefully; bespoke serving code often gets it wrong.</p>',
      },
      'prefill': {
        title: 'prefill phase',
        body:
          '<p>The first phase of serving a request: the model reads the entire prompt at once and computes the key/value vectors for every prompt token in a single parallel matrix multiply. Because all the tokens are known up front, prefill is <em>compute-bound</em> — it keeps the GPU\'s math units busy.</p>' +
          '<p>Contrast with <strong>decode</strong>, which runs afterward, one token at a time. Prefill latency scales with prompt length; a very long prompt makes the user wait before the first output token appears (the "time to first token").</p>',
      },
      'decode': {
        title: 'decode phase',
        body:
          '<p>The autoregressive phase: the model generates output tokens one at a time, each requiring a full forward pass that attends to all previous tokens\' cached KV. Only one new token\'s KV is computed per step.</p>' +
          '<p>Decode is <em>memory-bound</em> — the GPU spends most of its time moving the KV cache and weights, not doing math — so it dominates the wall-clock latency of generation. Getting more throughput out of decode is the whole reason PagedAttention and continuous batching exist.</p>',
      },
      'paged-attention': {
        title: 'PagedAttention',
        body:
          '<p>vLLM\'s core algorithm (Kwon et al., SOSP 2023). It borrows virtual-memory <em>paging</em> from operating systems: the KV cache is split into fixed-size <strong>KV blocks</strong> that can live anywhere in GPU memory, and a per-sequence <strong>block table</strong> maps logical block numbers to physical ones. The attention kernel is rewritten to gather from these scattered blocks.</p>' +
          '<p>The payoff is near-zero memory fragmentation (effective utilization jumps from ~20-40% toward ~100%), so far more requests fit in memory and can be batched together — the dissertation reports up to 24× the throughput of naive serving.</p>',
      },
      'kv-block': {
        title: 'KV block',
        body:
          '<p>A fixed-size chunk of the KV cache holding the key/value vectors for a small, fixed number of tokens (16 in production vLLM; 4 in this lab\'s toy example). The block is the unit of allocation — like a page of memory in an OS.</p>' +
          '<p>Blocks are filled left-to-right; a new physical block is allocated only when the current one fills up. Because blocks are addressed indirectly through a block table, they need not be contiguous, and identical blocks (e.g. a shared system prompt) can be pointed at by multiple sequences.</p>',
      },
      'block-table': {
        title: 'block table',
        body:
          '<p>A small per-sequence lookup table — the direct analog of an OS page table. Each entry maps one <em>logical</em> KV block (the sequence\'s own 0,1,2,… numbering) to a <em>physical</em> KV block (an actual location in GPU DRAM), plus a count of how many slots in that block are filled.</p>' +
          '<p>This indirection is what lets vLLM place blocks non-contiguously, grow the cache on demand instead of reserving for the max length, and share physical blocks across sequences via reference counting and copy-on-write.</p>',
      },
      'tee': {
        title: 'TEE · trusted execution environment',
        body:
          '<p>Hardware-enforced isolation for sensitive computation. A TEE creates a memory region the host OS, hypervisor, and other tenants cannot read — even if they have full privileges everywhere else. Intel <strong>TDX</strong>, AMD <strong>SEV-SNP</strong>, and NVIDIA <strong>H100 Confidential Computing</strong> are the production-grade options in 2026.</p>' +
          '<p>For ML: lets you serve a model in a public cloud without trusting the cloud operator to not read your weights, your prompts, or your responses. Operational cost is real (slower, harder to debug, fewer ML-framework integrations); reserve for workloads where the threat actually warrants it.</p>',
      },
      'model-card': {
        title: 'model card',
        body:
          '<p>The standardized documentation that ships with a model. Originally proposed by <a href="https://arxiv.org/abs/1810.03993">Mitchell et al. (2019)</a>; now the de-facto requirement on Hugging Face. Lists: training data, intended use, known limitations, evaluation results, ethical considerations, the maintainer.</p>' +
          '<p>The card is the <em>claim</em>, not the proof. A model card that says "trained on filtered web data" tells you what the publisher says; verifying it (especially for supply-chain integrity) requires SHA-256 checksums, Sigstore signatures, and provenance traces (SLSA levels). Read the card before you ship; cross-check before you trust.</p>',
      },
      'supply-chain': {
        title: 'ML supply chain',
        body:
          '<p>The set of artifacts and operations between "someone publishes a model" and "the model serves traffic in your stack." For traditional software the supply chain has been a known threat vector for a decade (Solarwinds, XZ-utils, vsftpd). For ML it\'s newer but the same shape: weights, datasets, fine-tunes, and adapters are all things you import and could be tampered with.</p>' +
          '<p>Hardening: pin model versions, verify checksums, prefer signed artifacts, maintain an allowlist of permitted models in code, audit downloads. Lab 03 in the syllabus picks this up at depth; this lab gives you the deployment-layer view.</p>',
      },
      'model-exfiltration': {
        title: 'model exfiltration',
        body:
          '<p>Stealing a usable approximation of a model via its API alone — without ever touching the weights. The classic results: <a href="https://arxiv.org/abs/1609.02943">Tramèr et al. (2016)</a> showed it was tractable for shallow models; <a href="https://arxiv.org/abs/2403.06634">Carlini et al. (2024)</a> reduced the cost dramatically for production LLMs.</p>' +
          '<p>The attack queries the target model with crafted inputs and trains a smaller "student" model on the responses. Defenses: aggressive rate limiting, watermarking responses, query-distribution monitoring (the attacker\'s query distribution is usually visibly different from real users), bounded API surface (don\'t expose logprobs unless you must).</p>',
      },
      'apptainer': {
        title: 'Apptainer',
        body:
          '<p>The container runtime built for shared HPC clusters (formerly Singularity). It runs the same OCI/Docker images you know, but <strong>rootless</strong> and <strong>daemonless</strong>: there is no background service and you never need admin rights, so a whole cluster of untrusting users can safely run containers. An image is a single <code>.sif</code> file you own, not a layer store managed by root.</p>' +
          '<p>Two flags matter in this lab: <code>apptainer pull … docker://…</code> converts a Docker image to a <code>.sif</code>, and <code>apptainer run --nv</code> executes it with the host\'s NVIDIA GPU passed in. By default it mounts your home directory and current directory but not <code>/scratch</code> — hence <code>--bind /scratch/$USER</code>.</p>',
      },
      'allocation': {
        title: 'allocation (SLURM account)',
        body:
          '<p>On a shared cluster, compute time is metered against an <em>allocation</em> — a named account (here <code>ds6042</code>, the course\'s) with a balance of core-hours. Every job you submit charges its allocation, which is how the cluster shares a finite machine fairly across hundreds of users. You name it with the <code>-A</code> / <code>--account</code> flag.</p>' +
          '<p>Run <code>allocations</code> on Rivanna to see the accounts you belong to and their remaining balance. Forgetting <code>-A</code>, or naming one you\'re not on, is the most common reason a job is rejected at submission.</p>',
      },
      'partition': {
        title: 'partition (SLURM queue)',
        body:
          '<p>A <em>partition</em> is a named queue mapped to a pool of nodes with a shared policy — a time limit, a set of node types, a priority. You pick one with <code>-p</code>. On Rivanna, <code>interactive</code> is a small, fast-turnaround pool (12&nbsp;h cap) for exactly this kind of hands-on work; <code>gpu</code> is the large batch pool (3-day jobs, many more GPU nodes) you fall back to when <code>interactive</code> is full.</p>' +
          '<p>The scheduler places your job on a free node <em>in that partition</em> that satisfies your resource request (<code>--gres</code>, <code>--mem</code>, cores). Ask for more than a partition offers and the job pends forever; ask for a busy GPU type and you wait in line behind everyone else.</p>',
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
