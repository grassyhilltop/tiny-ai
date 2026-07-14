/* ============================================================
 * Lab 13 — viz.js
 *
 * Widgets:
 *   1. #viz-try-it     — interactive shared-responsibility per layer
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
  // Widget 1 · Shared responsibility — 9 layers × 3 patterns
  // ============================================================
  (function initResp() {
    const svg = document.getElementById('resp-svg');
    if (!svg) return;
    const detail = document.getElementById('resp-detail');
    const radios = document.querySelectorAll('input[name="pattern"]');

    // Layer list (top of stack → bottom)
    const LAYERS = [
      { id: 'l9', num: '9', name: 'Observability' },
      { id: 'l8', num: '8', name: 'Identity & access' },
      { id: 'l7', num: '7', name: 'Network' },
      { id: 'l6', num: '6', name: 'Application logic' },
      { id: 'l5', num: '5', name: 'Application API' },
      { id: 'l4', num: '4', name: 'Inference server' },
      { id: 'l3', num: '3', name: 'Model weights' },
      { id: 'l2', num: '2', name: 'Inference runtime' },
      { id: 'l1', num: '1', name: 'Hardware + OS' },
    ];

    // Ownership per (pattern, layer).
    //   'cloud'    = platform owns it
    //   'shared'   = both sides have responsibilities
    //   'customer' = customer owns it
    const OWNERSHIP = {
      // SaaS API — e.g. Claude API, Gemini API
      saas: {
        l9: 'shared',   l8: 'shared',   l7: 'cloud',
        l6: 'customer', l5: 'customer',
        l4: 'cloud',    l3: 'cloud',    l2: 'cloud', l1: 'cloud',
      },
      // Managed inference — Vertex / Bedrock / Foundry serving open-weights
      managed: {
        l9: 'shared',   l8: 'customer', l7: 'shared',
        l6: 'customer', l5: 'customer',
        l4: 'cloud',    l3: 'shared',   l2: 'cloud', l1: 'cloud',
      },
      // Self-hosted on cloud — GKE / EKS / AKS, you ran vLLM yourself
      hosted: {
        l9: 'customer', l8: 'customer', l7: 'customer',
        l6: 'customer', l5: 'customer',
        l4: 'customer', l3: 'customer', l2: 'shared',  l1: 'cloud',
      },
    };

    // Per-layer detail text (varies by pattern).
    const LAYER_DETAILS = {
      l9: { // Observability
        saas:    'Platform logs your API calls + your billing. You add app-level logs and a sink to a queryable warehouse.',
        managed: 'Platform produces audit logs. You decide what to retain, where to ship them, and how to alert.',
        hosted:  'Fully yours. OpenTelemetry, Vector/Loki/Grafana, retention policy, alert rules.',
      },
      l8: { // IAM
        saas:    'API key auth provided. You manage who in your org has keys and what rate limits apply.',
        managed: 'Workload identity / IAM roles for your service callers. Platform enforces; you configure.',
        hosted:  'Fully yours. Plus you still need the cloud IAM for the underlying VMs/cluster.',
      },
      l7: { // Network
        saas:    'TLS to api.* is the platform\'s. Your call patterns and exfil prevention are yours.',
        managed: 'Platform offers VPC service controls / PrivateLink. You configure them.',
        hosted:  'Fully yours: VPC, ingress, WAF, mTLS. Plus the cloud\'s networking primitives.',
      },
      l6: { // App logic
        saas:    'Fully yours — your agent, your RAG, your tool-call authorization.',
        managed: 'Fully yours.',
        hosted:  'Fully yours.',
      },
      l5: { // App API
        saas:    'Your gateway, rate limits, input validation, output filtering.',
        managed: 'Your gateway. Platform may offer a managed gateway (e.g. API Gateway) but the policy is yours.',
        hosted:  'Fully yours.',
      },
      l4: { // Inference server
        saas:    'Platform serves the model. Internals (batching, cache lifecycle, isolation) are theirs.',
        managed: 'Platform-managed vLLM/Triton/equivalent. You pick a SKU; they run it.',
        hosted:  'Fully yours — you run vLLM/TGI in your cluster (this is Lab 12 in a cloud VM).',
      },
      l3: { // Weights
        saas:    'Platform-trained, platform-protected. Not visible to you.',
        managed: 'For first-party models (e.g. Gemini): platform owns. For your fine-tunes: shared — you provide weights, they store them encrypted with CMEK.',
        hosted:  'Fully yours. You download them, verify them, store them in your cloud bucket.',
      },
      l2: { // Runtime
        saas:    'CUDA, framework, library versions — fully the platform\'s.',
        managed: 'Platform-managed. You may pick versions; you don\'t maintain them.',
        hosted:  'Shared — cloud provides hardened OS images, you pick the framework and packages.',
      },
      l1: { // Hardware
        saas:    'Fully the platform\'s.',
        managed: 'Fully the platform\'s.',
        hosted:  'Fully the cloud\'s — hypervisor, hardware, firmware. (Unless you go bare-metal.)',
      },
    };

    let activeId = 'l5'; // assignment-anchor layer (API gateway)
    let pattern = 'saas';

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      const W = 640, ROW_H = 50, ROW_GAP = 4, ROW_X = 28, BADGE_W = 110;
      const ROW_W = W - ROW_X * 2 - BADGE_W;

      // Title strip
      el('text', { class: 'resp-legend', x: 28, y: 16 }, svg, 'Layers (top: user-facing · bottom: hardware) — colour = who is responsible.');

      LAYERS.forEach((L, i) => {
        const y = 28 + i * (ROW_H + ROW_GAP);
        const owner = OWNERSHIP[pattern][L.id];

        // Layer row
        const row = el('rect', {
          class: 'resp-layer ' + owner + (L.id === activeId ? ' active' : ''),
          'data-id': L.id,
          x: ROW_X, y, width: ROW_W, height: ROW_H, rx: 6,
        }, svg);
        el('text', { class: 'layer-num',  x: ROW_X + 22, y: y + ROW_H / 2 }, svg, L.num);
        el('text', { class: 'layer-name', x: ROW_X + 54, y: y + ROW_H / 2 + 1 }, svg, L.name);

        // Ownership badge
        const badgeX = ROW_X + ROW_W + 14;
        el('text', {
          class: 'owner-badge ' + owner,
          x: badgeX, y: y + ROW_H / 2 + 1,
        }, svg, owner === 'cloud' ? 'cloud owns' :
                  owner === 'customer' ? 'you own' : 'shared');

        row.addEventListener('click',      () => activate(L.id));
        row.addEventListener('mouseenter', () => activate(L.id, true));
      });

      // Legend at the bottom
      const legY = 28 + LAYERS.length * (ROW_H + ROW_GAP) + 6;
      el('rect', { class: 'resp-layer cloud',    x: 28,  y: legY, width: 14, height: 14, rx: 3 }, svg);
      el('text', { class: 'resp-legend',         x: 48,  y: legY + 11 }, svg, 'cloud owns');
      el('rect', { class: 'resp-layer shared',   x: 140, y: legY, width: 14, height: 14, rx: 3 }, svg);
      el('text', { class: 'resp-legend',         x: 160, y: legY + 11 }, svg, 'shared');
      el('rect', { class: 'resp-layer customer', x: 230, y: legY, width: 14, height: 14, rx: 3 }, svg);
      el('text', { class: 'resp-legend',         x: 250, y: legY + 11 }, svg, 'you own');
    }

    function activate(id) {
      activeId = id;
      const L = LAYERS.find(l => l.id === id);
      if (!L) return;
      const ownership = OWNERSHIP[pattern][id];
      const txt = (LAYER_DETAILS[id] && LAYER_DETAILS[id][pattern]) || '';
      detail.innerHTML =
        '<div class="resp-detail-title">' + L.num + ' · ' + L.name + ' · ' +
        (ownership === 'cloud' ? 'cloud owns this' :
         ownership === 'customer' ? 'you own this' : 'shared responsibility') +
        '</div>' +
        '<div>' + txt + '</div>';
      render();
    }

    radios.forEach(r => r.addEventListener('change', () => {
      if (r.checked) {
        pattern = r.value;
        activate(activeId);
      }
    }));

    activate('l5');
  })();

  // ============================================================
  // Widget 1b · Architecture — Azure + DeepSeek-R1 + dcode
  // ============================================================
  (function initArch() {
    const svg = document.getElementById('arch-svg');
    if (!svg) return;
    const detail = document.getElementById('arch-detail');

    // zones
    const ZONES = [
      { x: 12,  y: 44, w: 194, h: 300, label: 'YOUR MACHINE', cls: 'client' },
      { x: 250, y: 32, w: 458, h: 372, label: 'YOUR AZURE SUBSCRIPTION · FOUNDRY PROJECT', cls: 'azure' },
    ];

    const BOXES = [
      { id: 'dev',   x: 26,  y: 116, w: 166, h: 40, lines: ['Developer (you)'], zone: 'client',
        d: 'You author the tasks and hold the endpoint key. Everything left of the dashed line runs on your laptop — outside Azure\'s control and outside its audit log. That side is your responsibility.' },
      { id: 'dcode', x: 26,  y: 176, w: 166, h: 76, lines: ['dcode — local agent', 'read/write/edit files,', 'execute (shell), subagents'], zone: 'client',
        d: 'Deep Agents Code: the open-source "Claude Code" running locally. Its execute tool runs real shell commands. YOU own its approval gate and tool scope — the client-side control. Auto-approving shell turns a bad completion into code execution on your box.' },
      { id: 'azlogin', x: 26, y: 60, w: 166, h: 38, lines: ['az login → token'], zone: 'client',
        d: 'az login caches a short-lived Entra token here — workload identity, not a static key. It can\'t be committed to git and expires on its own. This is how the CLI authorizes every deploy step.' },
      { id: 'entra', x: 268, y: 52, w: 180, h: 44, lines: ['Microsoft Entra ID', 'identity · RBAC'], zone: 'azure',
        d: 'Authenticates every az command and authorizes the deployment. Assign least-privilege roles (Azure AI Developer, never Owner). Appears in every audit-log line.' },
      { id: 'kv',    x: 508, y: 52, w: 184, h: 44, lines: ['Azure Key Vault', 'CMK · secrets'], zone: 'azure',
        d: 'Customer-managed keys encrypt the workspace and model artifacts at rest. Revoking the key makes the data permanently unreadable — a deletion control, and where the endpoint key belongs (not a dotfile).' },
      { id: 'endpoint', x: 300, y: 150, w: 320, h: 66, lines: ['DeepSeek-R1 · serverless endpoint', 'OpenAI-compatible · KEY AUTH'], zone: 'azure', hero: true,
        d: 'The remote model, hosted by Azure — the "big model over the network" half of Claude Code. Key-authenticated by default (no anonymous calls). This is the one URL + key the agent uses. Azure owns the GPU and runtime; YOU own who holds the key and whether it is network-public.' },
      { id: 'cs',    x: 300, y: 250, w: 150, h: 50, lines: ['Azure AI', 'Content Safety'], zone: 'azure',
        d: 'Screens prompts and responses for harmful content. ON by default on the serverless deployment. The cloud-side twin of dcode\'s approval gate.' },
      { id: 'pe',    x: 470, y: 250, w: 150, h: 50, lines: ['Private Endpoint', '/ VNet (optional)'], zone: 'azure',
        d: 'Makes the endpoint reachable only inside your VNet, off the public internet. Necessary, not sufficient: a leaked key still works from anywhere the caller can reach the endpoint.' },
      { id: 'mon',   x: 300, y: 330, w: 320, h: 50, lines: ['Azure Monitor · Log Analytics', 'audit logs (KQL)'], zone: 'azure',
        d: 'Every call and safety verdict lands here via diagnostic settings. Day-one requirement: answer "who called the model, when" with a KQL query within minutes.' },
    ];

    // arrows: [fromX, fromY, toX, toY, label]
    const ARROWS = [
      [192, 79,  268, 82,  'authenticate'],
      [192, 210, 300, 190, 'HTTPS + key'],
      [600, 96,  560, 150, 'CMK'],
      [360, 216, 360, 250, ''],
      [560, 216, 545, 250, ''],
      [460, 216, 460, 330, 'audit'],
    ];

    function draw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      ZONES.forEach(z => {
        el('rect', { class: 'arch-zone ' + z.cls, x: z.x, y: z.y, width: z.w, height: z.h, rx: 8 }, svg);
        el('text', { class: 'arch-zone-label', x: z.x + 10, y: z.y + 16 }, svg, z.label);
      });
      // trust boundary
      el('line', { class: 'arch-boundary', x1: 228, y1: 30, x2: 228, y2: 410 }, svg);
      el('text', { class: 'arch-boundary-label', x: 228, y: 424, 'text-anchor': 'middle' }, svg, 'trust boundary');

      // arrows
      ARROWS.forEach(a => {
        const [x1, y1, x2, y2, label] = a;
        el('line', { class: 'arch-arrow', x1, y1, x2, y2, 'marker-end': 'url(#arch-head)' }, svg);
        if (label) el('text', { class: 'arch-arrow-label', x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 3, 'text-anchor': 'middle' }, svg, label);
      });
      // arrowhead marker
      const defs = el('defs', {}, svg);
      const m = el('marker', { id: 'arch-head', markerWidth: 8, markerHeight: 8, refX: 7, refY: 3, orient: 'auto', markerUnits: 'strokeWidth' }, defs);
      el('path', { d: 'M0,0 L7,3 L0,6 Z', class: 'arch-head-fill' }, m);

      // boxes
      BOXES.forEach(b => {
        const g = el('g', { class: 'arch-box-g', 'data-id': b.id }, svg);
        el('rect', { class: 'arch-box' + (b.hero ? ' hero' : '') + (b.id === activeId ? ' active' : ''),
          x: b.x, y: b.y, width: b.w, height: b.h, rx: 6 }, g);
        const lh = 14, startY = b.y + b.h / 2 - (b.lines.length - 1) * lh / 2 + 4;
        b.lines.forEach((ln, i) => {
          el('text', { class: 'arch-box-label' + (i === 0 ? ' t0' : ''), x: b.x + b.w / 2, y: startY + i * lh, 'text-anchor': 'middle' }, g, ln);
        });
        g.addEventListener('click', () => activate(b.id));
        g.addEventListener('mouseenter', () => activate(b.id));
      });
    }

    let activeId = 'endpoint';
    function activate(id) {
      activeId = id;
      const b = BOXES.find(x => x.id === id);
      if (b) detail.innerHTML = '<div class="arch-detail-title">' + b.lines[0] +
        ' · <span class="arch-owner ' + b.zone + '">' + (b.zone === 'client' ? 'you own (client side)' : 'shared — Azure hosts, you configure') + '</span></div><div>' + b.d + '</div>';
      draw();
    }
    activate('endpoint');
  })();

  // ============================================================
  // Widget 1c · §7 attack chain — step-through escalation
  // ============================================================
  (function initAttackChain() {
    const svg = document.getElementById('ac-svg');
    if (!svg) return;
    const caption = document.getElementById('ac-caption');
    const progress = document.getElementById('ac-progress');

    // container + leaf boxes (leaf = a concrete resource; container = a scope)
    const BOX = {
      internet: { x: 8,   y: 116, w: 92,  h: 52,  lines: ['Internet', 'attacker'], leaf: true },
      sub:      { x: 118, y: 30,  w: 448, h: 236, label: 'Azure subscription' },
      rg:       { x: 140, y: 64,  w: 250, h: 190, label: 'resource group · sthubbins-rg' },
      vm:       { x: 160, y: 96,  w: 150, h: 52,  lines: ['patient-portal-vm', '(Azure VM)'], leaf: true },
      auto:     { x: 160, y: 180, w: 214, h: 50,  lines: ['mlops-automation', 'identity = Contributor @ sub'], leaf: true },
      kv:       { x: 406, y: 70,  w: 148, h: 30,  lines: ['Key Vault secrets'], leaf: true },
      stg:      { x: 406, y: 108, w: 148, h: 30,  lines: ['Storage keys · App Config'], leaf: true },
      acr:      { x: 406, y: 146, w: 148, h: 30,  lines: ['Automation vars · ACR'], leaf: true },
      model:    { x: 496, y: 196, w: 172, h: 52,  lines: ['deepseek-vllm-vm', 'vLLM :8000 · public IP'], leaf: true },
    };

    const STEPS = [
      { hop: '0', hi: ['vm'], scope: null, arrow: 'ssrf',
        id: 'Internet · anonymous',
        act: 'SSRF: /api/export makes the VM fetch the IMDS token URL',
        nsa: '#2 Validate input',
        note: 'A web bug lets the attacker make the server fetch a URL of their choice — including the VM’s own metadata service.' },
      { hop: '1', hi: ['vm'], scope: null, arrow: 'ssrf',
        id: 'patient-portal-vm managed identity',
        act: 'IMDS returns the VM’s Azure Resource Manager token (a JWT)',
        nsa: '#2 Input · #3 Network',
        note: 'No password needed. The token inherits whatever RBAC that VM was granted.' },
      { hop: '2', hi: ['vm', 'auto'], scope: 'rg', arrow: null,
        id: 'portal-app-role · custom, RG-scoped',
        act: 'listKeys + start an Automation runbook',
        nsa: '#5 Least privilege',
        note: 'Scoped to one resource group — but it can trigger a runbook that runs as a different, broader identity.' },
      { hop: '3', hi: ['auto', 'vm'], scope: 'sub', arrow: null,
        id: 'mlops-automation identity',
        act: 'the runbook runs as Contributor @ subscription',
        nsa: '#5 · the built-in-role trap',
        note: 'The blast radius jumps from one resource group to the ENTIRE subscription. This one over-broad assignment is the whole lesson.' },
      { hop: '4', hi: ['kv', 'stg', 'acr'], scope: 'sub', arrow: null,
        id: 'Contributor @ subscription',
        act: 'read secrets across five services',
        nsa: '#4 Encrypt · #6 Logging',
        note: 'Key Vault, storage keys, App Configuration, Automation variables, ACR images — real production credentials.' },
      { hop: '5', hi: ['model'], scope: null, arrow: 'internet',
        id: 'Internet · no credentials at all',
        act: 'query the self-hosted model VM directly',
        nsa: '#3 Restrict network access',
        note: 'An NSG rule “Allow 8000 from Internet” lets anyone hit the model — bypassing key auth, Content Safety, RBAC, and every audit log.' },
    ];

    let step = 0;

    function boxEl(id, active, dim) {
      const b = BOX[id];
      const cls = (b.leaf ? 'ac-box' : 'ac-scope') + (active ? ' active' : '') + (dim ? ' dim' : '');
      const g = el('g', {}, svg);
      el('rect', { class: cls, x: b.x, y: b.y, width: b.w, height: b.h, rx: b.leaf ? 5 : 8 }, g);
      if (b.label) el('text', { class: 'ac-scope-label', x: b.x + 8, y: b.y + 15 }, g, b.label);
      if (b.lines) {
        const cy = b.y + b.h / 2 - (b.lines.length - 1) * 6.5 + 4;
        b.lines.forEach((ln, i) => el('text', {
          class: 'ac-box-label' + (i === 0 ? ' t0' : ''),
          x: b.x + b.w / 2, y: cy + i * 13, 'text-anchor': 'middle',
        }, g, ln));
      }
    }

    function arrow(x1, y1, x2, y2, cls) {
      el('line', { class: 'ac-arrow ' + cls, x1, y1, x2, y2, 'marker-end': 'url(#ac-head)' }, svg);
    }

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const defs = el('defs', {}, svg);
      const m = el('marker', { id: 'ac-head', markerWidth: 8, markerHeight: 8, refX: 7, refY: 3, orient: 'auto', markerUnits: 'strokeWidth' }, defs);
      el('path', { d: 'M0,0 L7,3 L0,6 Z', class: 'ac-head-fill' }, m);

      const s = STEPS[step];
      const scopeActive = s.scope;      // 'rg' | 'sub' | null
      const finale = s.arrow === 'internet';

      // containers first (so leaf boxes sit on top)
      boxEl('sub', scopeActive === 'sub', finale);
      boxEl('rg', scopeActive === 'rg' || scopeActive === 'sub', finale);
      // leaf boxes
      ['vm', 'auto', 'kv', 'stg', 'acr', 'model'].forEach(id =>
        boxEl(id, s.hi.includes(id), finale && id !== 'model'));
      boxEl('internet', s.arrow === 'ssrf' || finale, false);

      // arrows
      if (s.arrow === 'ssrf') arrow(100, 138, 160, 120, 'ssrf');
      if (finale) {
        arrow(712, 222, 668, 222, 'danger');
        el('text', { class: 'ac-arrow-label danger', x: 664, y: 190, 'text-anchor': 'end' }, svg, 'any internet user');
      }

      // caption + progress
      progress.textContent = 'hop ' + s.hop + ' of 5';
      caption.innerHTML =
        '<span class="ac-hop">Hop ' + s.hop + '</span> ' +
        '<span class="ac-id">' + s.id + '</span>' +
        '<span class="ac-nsa">NSA ' + s.nsa + '</span>' +
        '<div class="ac-act"><strong>' + s.act + '</strong></div>' +
        '<div class="ac-note">' + s.note + '</div>';
    }

    document.getElementById('ac-step').addEventListener('click', () => { if (step < STEPS.length - 1) step++; render(); });
    document.getElementById('ac-back').addEventListener('click', () => { if (step > 0) step--; render(); });
    document.getElementById('ac-reset').addEventListener('click', () => { step = 0; render(); });
    render();
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
  // Widget 2 · Inline glossary
  // ============================================================
  (function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'shared-responsibility': {
        title: 'shared-responsibility model',
        body:
          '<p>The contract that splits security work between a cloud provider and a customer. The provider owns the layers <em>below the line</em>: physical security, hypervisor, networking fabric, foundational services. The customer owns the layers <em>above the line</em>: data, identity, application logic, configuration. <strong>Where the line is drawn depends on what service you bought</strong>; SaaS pushes the line up, IaaS pushes it down.</p>' +
          '<p>The reason this matters: most cloud breaches in the last decade — Capital One, Imperva, Snowflake — happened because the customer assumed the cloud was handling something it wasn\'t. The doc you should read once: <a href="https://aws.amazon.com/compliance/shared-responsibility-model/">AWS</a>, <a href="https://learn.microsoft.com/azure/security/fundamentals/shared-responsibility">Azure</a>, <a href="https://cloud.google.com/blog/products/identity-security/shared-fate-a-new-approach-to-cloud-security">GCP</a>.</p>',
      },
      'iam': {
        title: 'IAM · identity & access management',
        body:
          '<p>The cloud subsystem that answers two questions for every request: <em>who is this</em> (identity) and <em>are they allowed to do that</em> (authorization). Every cloud has one with a slightly different name — AWS IAM, Google Cloud IAM, Azure Entra ID — but the model is the same.</p>' +
          '<p><strong>Least-privilege</strong> means giving each identity exactly the permissions it needs and no more. The temptation is to grant <code>Editor</code> or <code>roles/owner</code> "to make it work"; the result is a blast radius the size of your project. Treat IAM as the most important configuration you touch.</p>',
      },
      'iap': {
        title: 'IAP · Identity-Aware Proxy',
        body:
          '<p>Google\'s "Google authentication in front of every request" service. Sits in front of Cloud Run, App Engine, or GKE; intercepts every HTTP request; redirects unauthenticated users through a Google sign-in; once signed in, forwards the request to your app with a signed JWT header you can verify.</p>' +
          '<p>The point: you don\'t write auth code. The platform does. Your app sees only authenticated requests; identity lives in the signed header. Azure\'s equivalent is <em>App Service Authentication</em>; AWS\'s closest equivalent is <em>Application Load Balancer + Cognito</em>.</p>',
      },
      'kms': {
        title: 'KMS · key management service',
        body:
          '<p>The cloud subsystem that manages cryptographic keys for encryption-at-rest, signing, and tokens. Customer-managed encryption keys (CMEK / CMK) let you bring your own key material — the cloud encrypts your data with a key you control, can rotate, and can revoke. Revoking the key makes the encrypted data permanently unreadable.</p>' +
          '<p>For regulated workloads (HIPAA, FedRAMP-Moderate-and-up), CMEK is usually required. For unregulated workloads it\'s defense in depth — and a deletion control. Every cloud has one: <a href="https://cloud.google.com/kms">Cloud KMS</a>, <a href="https://azure.microsoft.com/products/key-vault">Azure Key Vault</a>, <a href="https://docs.aws.amazon.com/kms/">AWS KMS</a>.</p>',
      },
      'workload-identity': {
        title: 'workload identity',
        body:
          '<p>The modern alternative to static API keys for service-to-service auth. Instead of "your app holds a key forever," the cloud issues a short-lived token bound to a specific workload (a Cloud Run service, a Kubernetes pod, a Lambda function). Tokens expire in minutes; leaking one is a small problem; storing one in git is impossible.</p>' +
          '<p>The names: <em>Workload Identity Federation</em> (GCP), <em>Managed Identity</em> (Azure), <em>IAM Roles for Service Accounts</em> (AWS / EKS). They all do the same thing: kill the "long-lived JSON key committed to a repo" anti-pattern at the protocol level.</p>',
      },
      'private-endpoint': {
        title: 'private endpoint',
        body:
          '<p>An IP address inside your VPC that lets you call a managed service without traffic ever crossing the public internet. Vertex AI, Bedrock, Foundry, Cloud SQL, every managed database — they all support private endpoints (also called <em>Private Service Connect</em>, <em>Private Endpoints</em>, or <em>VPC Endpoints</em> depending on which cloud).</p>' +
          '<p>Benefit: removes the public-internet attack surface. Caveat: doesn\'t replace IAM. A compromised service account inside your VPC can still call the model API at full rate; private endpoints don\'t protect against insider threats. Necessary, not sufficient.</p>',
      },
      'nsa-ai-guide': {
        title: 'NSA "Deploying AI Systems Securely" (2024)',
        body:
          '<p>April 2024 joint guidance from the NSA, CISA, FBI, ASD (Australia), CCCS (Canada), NCSC-NZ, and NCSC-UK. 19 pages, vendor-neutral. Synthesizes lessons from public AI deployments into seven themes covering environment, weights, APIs, monitoring, access control, and ongoing testing.</p>' +
          '<p>The reason to cite this document specifically: it\'s the most authoritative current statement of what a hardened AI deployment looks like, written by seven cyber agencies who do not normally agree on much. <a href="https://media.defense.gov/2024/Apr/15/2003439257/-1/-1/0/CSI-DEPLOYING-AI-SYSTEMS-SECURELY.PDF">Direct PDF link</a>. Read once, save the citation.</p>',
      },
      'deepseek': {
        title: 'DeepSeek-R1',
        body:
          '<p>DeepSeek\'s open-weights (MIT-licensed) frontier model: a large mixture-of-experts LLM that is strong at code and supports tool/function calling — the property an agent like dcode needs to actually edit files and run commands. Because the weights are open, you can host it yourself, or rent hosting from a cloud, instead of paying per token to a closed API.</p>' +
          '<p>On Azure it is a <em>sold-by-Azure</em> serverless catalog model (registry <code>azureml-deepseek</code>), so it deploys with a single <code>az ml serverless-endpoint create</code> — no Marketplace subscription. For this lab that matters two ways. Security: open weights let you verify and control the model artifact (Lab 12\'s provenance lesson). Economics/lock-in: you\'re buying <em>hosting</em> from Azure, not the model — so you can move it in-house or to another cloud later without rewriting around a proprietary API.</p>',
      },
      'azure-foundry': {
        title: 'Azure AI Foundry',
        body:
          '<p>Microsoft\'s umbrella AI platform (formerly Azure ML + Azure OpenAI + Cognitive Services). A <em>Foundry project</em> is an Azure ML workspace with a model catalog, deployment tooling, content safety, and monitoring attached. You deploy catalog models as <strong>serverless</strong> endpoints (pay-per-token, no VM) or to <strong>managed compute</strong> (your own GPU VM).</p>' +
          '<p>Every deployed endpoint speaks the <a href="https://learn.microsoft.com/azure/ai-foundry/model-inference/reference/reference-model-inference-api">Azure AI Model Inference API</a>, which is OpenAI-compatible — so any OpenAI client library, and agents like dcode, talk to it unchanged given the endpoint URL and key.</p>',
      },
      'entra-id': {
        title: 'Microsoft Entra ID',
        body:
          '<p>Azure\'s identity provider (formerly Azure Active Directory). It authenticates users and workloads and is the front end of Azure RBAC — who can deploy, read keys, or call a resource. <code>az login</code> signs you in to Entra and caches a short-lived token; every later <code>az</code> command reuses it.</p>' +
          '<p>The security point: an Entra identity is <em>workload/user identity</em>, not a long-lived secret. Prefer it (and its <a href="#" onclick="return false">managed-identity</a> form for services) over static keys wherever a caller is an Azure workload — it\'s NSA principles #3 and #6 in one primitive.</p>',
      },
      'managed-identity': {
        title: 'managed identity (Entra)',
        body:
          '<p>Azure\'s workload-identity mechanism: an Entra identity automatically attached to an Azure resource (a VM, App Service, container) so it can call other Azure services <em>without any stored secret</em>. Azure issues and rotates short-lived tokens under the hood.</p>' +
          '<p>Use it instead of the endpoint\'s static key whenever the caller is itself an Azure workload — then there is no key to leak, commit, or paste into an agent\'s config. It\'s the Azure equivalent of GCP Workload Identity Federation and AWS IAM Roles for Service Accounts.</p>',
      },
      'deep-agent': {
        title: 'Deep Agents Code (dcode)',
        body:
          '<p>LangChain\'s open-source terminal coding agent, built on the <code>deepagents</code> Python SDK (<code>create_deep_agent</code>). It plans work, reads/writes/edits files, runs shell commands (<code>execute</code>), searches, and spawns subagents — driven by whatever chat model you configure, including any OpenAI-compatible endpoint via a custom base URL + key.</p>' +
          '<p>Its safety model is <strong>human approval gates</strong> on destructive operations. That gate is a client-side security control every bit as load-bearing as a cloud content filter: an agent with an <code>execute</code> tool and auto-approve is remote-code-execution-as-a-feature. Run untrusted tasks in a sandbox.</p>',
      },
      'imds': {
        title: 'IMDS · Instance Metadata Service',
        body:
          '<p>A special link-local address (<code>169.254.169.254</code>) that every cloud VM can reach to learn about itself — and, critically, to fetch a <strong>managed-identity access token</strong> for whatever cloud identity the VM was assigned. Code on the VM uses it legitimately to authenticate without a stored key.</p>' +
          '<p>It\'s also the prize an SSRF aims for: reach IMDS from a request-forgery bug and you mint the VM\'s token. Azure\'s only guard is a required <code>Metadata: true</code> header (there is no AWS-IMDSv2-style session token), so on Azure the real defense is keeping each identity\'s RBAC tiny and blocking outbound traffic to the link-local address from request-handling code.</p>',
      },
      'ssrf': {
        title: 'SSRF · Server-Side Request Forgery',
        body:
          '<p>A vulnerability where an attacker makes a server fetch a URL of the attacker\'s choosing. If a web app takes a <code>url=</code> parameter and fetches it server-side without validation, the attacker can point it at internal addresses the server can reach but they can\'t — cloud metadata endpoints (<code>169.254.169.254</code>), <code>file://</code> paths, internal APIs.</p>' +
          '<p>On a cloud VM or function, SSRF against the metadata service (or <code>/proc/self/environ</code>) leaks the workload\'s injected credentials — turning "fetch a URL" into "assume the server\'s identity." The fix is an allowlist of fetchable destinations plus IMDSv2 / hop-limit protections on the metadata service.</p>',
      },
      'serverless': {
        title: 'serverless deployment',
        body:
          '<p>You call the model over an HTTPS API and pay <strong>per token</strong>; Azure runs, scales, and patches the machine behind it, and there is no VM for you to manage. It\'s the cloud-inference analog of a serverless function: no idle cost, nothing to keep running. Contrast with <em>managed compute</em>, where you rent a GPU VM by the hour whether or not anyone is using it.</p>' +
          '<svg viewBox="0 0 300 92" width="100%" style="max-width:300px" font-family="sans-serif">' +
          '<text x="0" y="12" font-size="10" font-weight="700" fill="#5a8a6f">serverless</text>' +
          '<rect x="0" y="18" width="118" height="22" rx="3" fill="#d5e6dc" stroke="#5a8a6f"/>' +
          '<text x="59" y="33" font-size="9" text-anchor="middle" font-family="monospace">API · $/token</text>' +
          '<text x="126" y="33" font-size="9">no VM, auto-scales</text>' +
          '<text x="0" y="60" font-size="10" font-weight="700" fill="#b14a2e">managed compute</text>' +
          '<rect x="0" y="66" width="118" height="22" rx="3" fill="#fde0d2" stroke="#b14a2e"/>' +
          '<text x="59" y="81" font-size="9" text-anchor="middle" font-family="monospace">GPU VM · $/hour</text>' +
          '<text x="126" y="81" font-size="9">you scale / delete</text>' +
          '</svg>',
      },
      'managed-compute': {
        title: 'managed compute',
        body:
          '<p>The other way to deploy a catalog model: Azure spins up a dedicated <strong>GPU virtual machine</strong> in your workspace and runs the model on it. You get the same OpenAI-compatible endpoint + key, but you pay for the VM <em>by the hour</em> as long as it exists — idle or busy — and you need GPU quota approved on the subscription.</p>' +
          '<p>Use it when a model isn\'t offered <em>serverless</em> in your region, or when steady high volume makes a fixed hourly rate cheaper than per-token. The catch people hit: forgetting to scale it to zero or delete it, which quietly burns your whole budget overnight.</p>',
      },
      'resource-group': {
        title: 'resource group',
        body:
          '<p>Azure\'s basic container for related resources — the workspace, its storage account, its Key Vault, the endpoint, and the logs all live in one group. It\'s a management and lifecycle boundary: permissions, tags, and cost can be tracked per group, and <strong>deleting the group deletes everything in it</strong> in one command.</p>' +
          '<p>That last property is why the lab puts every lab resource in <code>ds6042-lab13</code>: teardown is a single <code>az group delete</code>, so you never leave stray resources billing.</p>',
      },
      'rbac': {
        title: 'RBAC · role-based access control',
        body:
          '<p>Azure\'s authorization model. A <strong>role assignment</strong> ties three things together: a <em>principal</em> (who — a user, group, or managed identity), a <em>role</em> (what actions, e.g. <code>Reader</code>, <code>Contributor</code>, or a custom role), and a <em>scope</em> (where — a subscription, resource group, or single resource). Least-privilege means the narrowest role at the narrowest scope that still works.</p>' +
          '<svg viewBox="0 0 300 44" width="100%" style="max-width:300px" font-size="9" font-family="sans-serif">' +
          '<rect x="2" y="12" width="78" height="20" rx="3" fill="#eef2f6" stroke="#9db3c4"/><text x="41" y="25" text-anchor="middle">who (principal)</text>' +
          '<text x="88" y="26" text-anchor="middle" font-size="12">&#8594;</text>' +
          '<rect x="100" y="12" width="52" height="20" rx="3" fill="#fde0d2" stroke="#b14a2e"/><text x="126" y="25" text-anchor="middle">role</text>' +
          '<text x="160" y="26" text-anchor="middle" font-size="12">&#8594;</text>' +
          '<rect x="172" y="12" width="122" height="20" rx="3" fill="#d5e6dc" stroke="#5a8a6f"/><text x="233" y="25" text-anchor="middle">scope (what / where)</text>' +
          '</svg>' +
          '<p>The §7 attack chain is entirely an RBAC story: a role that was too broad (<code>Contributor</code>) at too wide a scope (the whole subscription) on a shared identity.</p>',
      },
      'jwt': {
        title: 'JWT · JSON Web Token',
        body:
          '<p>The token format Azure (and most OAuth systems) hand out. It\'s three base64url segments joined by dots: a <em>header</em>, a <em>payload</em> of JSON "claims" (who you are, what you can access, when it expires), and a <em>signature</em>. The signature is what makes it tamper-proof; the payload is <strong>not encrypted</strong> — anyone holding the token can base64-decode the middle segment and read the claims.</p>' +
          '<svg viewBox="0 0 300 40" width="100%" style="max-width:300px" font-size="8.5" font-family="monospace">' +
          '<rect x="2" y="10" width="66" height="20" fill="#f0eee5" stroke="#cfc9b8"/><text x="35" y="23" text-anchor="middle">header</text>' +
          '<text x="71" y="24">.</text>' +
          '<rect x="78" y="10" width="128" height="20" fill="#fde0d2" stroke="#b14a2e"/><text x="142" y="23" text-anchor="middle">payload (readable JSON)</text>' +
          '<text x="209" y="24">.</text>' +
          '<rect x="216" y="10" width="80" height="20" fill="#f0eee5" stroke="#cfc9b8"/><text x="256" y="23" text-anchor="middle">signature</text>' +
          '</svg>' +
          '<p>That\'s why §7 can <code>base64 -d</code> the stolen token to learn <em>which</em> identity it belongs to (the <code>oid</code>/<code>xms_mirid</code> claims) without any special tooling.</p>',
      },
      'nsg': {
        title: 'NSG · Network Security Group',
        body:
          '<p>Azure\'s stateful firewall for a VM or subnet: an ordered list of allow/deny rules matching on port, protocol, and source/destination. The source can be an IP range or a <em>service tag</em> like <code>Internet</code> (which means <code>0.0.0.0/0</code> — the whole public internet) or <code>VirtualNetwork</code>.</p>' +
          '<svg viewBox="0 0 300 60" width="100%" style="max-width:300px" font-size="9" font-family="monospace">' +
          '<text x="0" y="10" font-family="sans-serif" font-weight="700">example rules</text>' +
          '<rect x="0" y="16" width="300" height="18" fill="#fde0d2" stroke="#b14a2e"/><text x="6" y="29">Allow 8000 from Internet   (world-open!)</text>' +
          '<rect x="0" y="36" width="300" height="18" fill="#d5e6dc" stroke="#5a8a6f"/><text x="6" y="49">Allow 443  from VirtualNetwork  (scoped)</text>' +
          '</svg>' +
          '<p>The §7 finale is a single wrong NSG rule: <code>Allow 8000 from Internet</code> on the model VM exposed it to the whole world, no auth required.</p>',
      },
      'reverse-proxy': {
        title: 'reverse proxy',
        body:
          '<p>A server that sits <em>in front of</em> your real service, receives every client request, and forwards it on. It\'s where you centralize the things the model server shouldn\'t do itself: TLS termination, authentication, rate limiting, and a Web Application Firewall. The backend (e.g. vLLM) binds to <code>127.0.0.1</code> and is never reachable directly — only the proxy is public.</p>' +
          '<svg viewBox="0 0 300 46" width="100%" style="max-width:300px" font-size="8.5" font-family="sans-serif">' +
          '<rect x="0" y="14" width="52" height="20" rx="3" fill="#eef2f6" stroke="#9db3c4"/><text x="26" y="27" text-anchor="middle">client</text>' +
          '<text x="58" y="28" font-size="12">&#8594;</text>' +
          '<rect x="72" y="14" width="132" height="20" rx="3" fill="#fde0d2" stroke="#b14a2e"/><text x="138" y="27" text-anchor="middle">reverse proxy :443 (TLS + auth)</text>' +
          '<text x="210" y="28" font-size="12">&#8594;</text>' +
          '<rect x="224" y="14" width="74" height="20" rx="3" fill="#d5e6dc" stroke="#5a8a6f"/><text x="261" y="27" text-anchor="middle">model :8000</text>' +
          '</svg>',
      },
      'kql': {
        title: 'KQL · Kusto Query Language',
        body:
          '<p>The query language for Azure Monitor / Log Analytics. If you know SQL and pandas method-chaining, KQL reads instantly: you start from a table and pipe it through operators with <code>|</code> — <code>where</code> to filter, <code>project</code> to select columns, <code>summarize</code> to aggregate, <code>order by</code> to sort.</p>' +
          '<p>It\'s how you turn "we have logs" into "we can answer <em>who called the model in the last 24 hours</em> in ten seconds" — the §5.6 audit query is plain KQL.</p>',
      },
      'soft-delete': {
        title: 'soft-delete',
        body:
          '<p>A safety feature where "deleting" a resource actually moves it to a recoverable holding state for a retention window (days), rather than destroying it immediately — so a fat-fingered delete can be undone. Azure Key Vault (and its secrets) has this on by default.</p>' +
          '<p>The gotcha it creates: a soft-deleted Key Vault still <em>reserves its name</em>, so re-creating a vault with the same name fails until you <code>az keyvault purge</code> the soft-deleted one. Purge is the "really, permanently delete now" step.</p>',
      },
      'service-principal': {
        title: 'service principal',
        body:
          '<p>A non-human identity in Entra — an "account" for an application or script, so software can authenticate to Azure on its own. It carries either a <em>client secret</em> (a password) or a certificate. A <em>managed identity</em> is a service principal that Azure creates and rotates for you, which is why it\'s the safer default.</p>' +
          '<p>The danger is the standalone client secret: it\'s a long-lived credential that, if it leaks (into git, a log, an unencrypted variable), lets anyone act as that application until someone rotates it.</p>',
      },
      'automation-account': {
        title: 'Automation Account',
        body:
          '<p>An Azure service for running scheduled operational scripts — called <em>runbooks</em> — such as nightly retraining, cleanup, or scaling jobs. The account has its own <strong>managed identity</strong>, and the runbooks it executes run <em>as that identity</em>, with whatever RBAC it was granted.</p>' +
          '<p>That indirection is the §7 escalation: if you can trigger a runbook, you borrow the Automation Account\'s identity — which is exactly why granting that identity broad rights (Contributor at subscription scope) is so dangerous.</p>',
      },
      'runbook': {
        title: 'runbook',
        body:
          '<p>A script (PowerShell or Python) stored in an Azure <em>Automation Account</em> and run on demand or on a schedule. When it runs, it executes as the Automation Account\'s managed identity — so a runbook is a way to run code with that identity\'s permissions.</p>' +
          '<p>In §7 the attacker never needs the automation identity\'s credentials directly: the right to <em>start a runbook</em> is enough, because the runbook runs as that identity for them.</p>',
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
