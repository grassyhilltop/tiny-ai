/* ============================================================
 * Lab 05 — viz.js
 *
 * Widgets:
 *   1. #viz-try-it          — one-shot LLM vs agent loop comparison
 *   2. #viz-agent-loop      — static SVG of the ReAct loop
 *   3. #viz-skill-anatomy   — SKILL.md hover-explain
 *   4. #viz-sprint          — clickable seven-phase sprint timeline
 *   5. #glossary-panel      — inline glossary (re-parented per-term)
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
  // Widget 1 · A/B comparison — one-shot vs agent loop
  // ============================================================
  (function initAB() {
    const root = document.getElementById('viz-try-it');
    if (!root) return;
    const oneshotScreen = document.getElementById('ab-oneshot-screen');
    const agentScreen   = document.getElementById('ab-agent-screen');
    const oneshotVerd   = document.getElementById('ab-oneshot-verdict');
    const agentVerd     = document.getElementById('ab-agent-verdict');
    const goalSel       = document.getElementById('ab-goal-select');
    const runBtn        = document.getElementById('ab-run');
    const resetBtn      = document.getElementById('ab-reset');

    // Three canned scenarios. Each has:
    //   oneshot:  array of {cls, text} lines (rendered together, no animation)
    //   oneshotVerdict: {cls, text}
    //   agent:    array of {cls, text} lines, rendered one at a time
    //   agentVerdict: {cls, text}
    const SCENARIOS = {
      cve: {
        oneshot: [
          { cls: 'ab-step-label', text: 'completion' },
          { cls: 'ab-bad',        text: 'openssl 3.0.2 has several known vulnerabilities, including CVE-2022-0778 (infinite loop in BN_mod_sqrt) and possibly others. You should upgrade to the latest 3.0.x release.' },
          { cls: 'ab-note',       text: '(no source. no version match. half right at best.)' },
        ],
        oneshotVerdict: { cls: 'bad', text: 'plausible-sounding, partly wrong, no way to verify.' },
        agent: [
          { cls: 'ab-step-label', text: 'think' },
          { cls: 'ab-think',      text: 'I should look this up in the NVD database rather than guessing from memory.' },
          { cls: 'ab-step-label', text: 'act · tool call' },
          { cls: 'ab-tool',       text: 'web_search("openssl 3.0.2 CVE NVD")' },
          { cls: 'ab-step-label', text: 'observe' },
          { cls: 'ab-obs',        text: 'NVD returns 11 CVEs for openssl ≤3.0.2. Top-cited: CVE-2022-0778 (DoS), CVE-2023-0286 (X.400 type confusion), CVE-2023-0464 (policy chain DoS).' },
          { cls: 'ab-step-label', text: 'reflect' },
          { cls: 'ab-think',      text: 'I have the answer, but I should confirm the fixed-in version for each one.' },
          { cls: 'ab-step-label', text: 'act · tool call' },
          { cls: 'ab-tool',       text: 'fetch_url("https://nvd.nist.gov/vuln/detail/CVE-2023-0286")' },
          { cls: 'ab-step-label', text: 'observe' },
          { cls: 'ab-obs',        text: 'fixed-in: openssl 3.0.8. so 3.0.2 IS affected.' },
          { cls: 'ab-final',      text: '✓ yes — 11 CVEs apply to openssl 3.0.2. The most critical is CVE-2023-0286 (X.400 type confusion). Upgrade to 3.0.8 or later. Linked sources: NVD entries above.' },
        ],
        agentVerdict: { cls: 'ok', text: 'verifiable answer, sourced, version-correct.' },
      },
      readme: {
        oneshot: [
          { cls: 'ab-step-label', text: 'completion' },
          { cls: 'ab-bad',        text: 'garrytan/gstack is a JavaScript library by Garry Tan for building UI components with a focus on accessibility and TypeScript types. The README explains how to install it via npm and integrate it into a React application.' },
          { cls: 'ab-note',       text: '(hallucinated — gstack is not a UI library.)' },
        ],
        oneshotVerdict: { cls: 'bad', text: 'confidently wrong. the model invented a plausible repo from the name.' },
        agent: [
          { cls: 'ab-step-label', text: 'think' },
          { cls: 'ab-think',      text: 'I don\'t know what this repo is. I should fetch the README rather than guess.' },
          { cls: 'ab-step-label', text: 'act · tool call' },
          { cls: 'ab-tool',       text: 'fetch_url("https://raw.githubusercontent.com/garrytan/gstack/main/README.md")' },
          { cls: 'ab-step-label', text: 'observe' },
          { cls: 'ab-obs',        text: '"gstack — AI-Powered Software Factory. 23 Claude Code skills that replicate a complete engineering team\'s workflows. Sprint structure: Think → Plan → Build → Review → Test → Ship → Reflect..."' },
          { cls: 'ab-step-label', text: 'reflect' },
          { cls: 'ab-think',      text: 'This is a Claude Code skill bundle, not a UI library. Let me summarize the actual content.' },
          { cls: 'ab-final',      text: '✓ gstack is an MIT-licensed bundle of 23 Claude Code skills that orchestrate a sprint-shaped engineering workflow — office-hours, plan-*, review, qa, ship, all invoked as /gstack <skill>. Created by Garry Tan; targets solo engineers wanting a "small team" workflow.' },
        ],
        agentVerdict: { cls: 'ok', text: 'accurate, derived from the actual README.' },
      },
      ssh: {
        oneshot: [
          { cls: 'ab-step-label', text: 'completion' },
          { cls: 'ab-bad',        text: 'You can find failed SSH logins with `grep "Failed password" /var/log/auth.log | awk \'{print $11}\' | sort | uniq -c | sort -rn`. The top IPs are likely suspicious.' },
          { cls: 'ab-note',       text: '(generic snippet — no idea what is actually in your auth.log.)' },
        ],
        oneshotVerdict: { cls: 'bad', text: 'useful starting point, but doesn\'t answer your actual question.' },
        agent: [
          { cls: 'ab-step-label', text: 'think' },
          { cls: 'ab-think',      text: 'I need to look at the file first to know what "suspicious" means here.' },
          { cls: 'ab-step-label', text: 'act · tool call' },
          { cls: 'ab-tool',       text: 'read_file("/var/log/auth.log", lines=200)' },
          { cls: 'ab-step-label', text: 'observe' },
          { cls: 'ab-obs',        text: '~180 "Failed password" lines, mostly from 203.0.113.42 (137 of them, all within 90 seconds). A second IP (198.51.100.7) has 4 failures spaced across 2 days.' },
          { cls: 'ab-step-label', text: 'reflect' },
          { cls: 'ab-think',      text: 'The .42 IP is clearly a brute-force burst. The .7 IP is plausibly a real user mistyping. The framing of "suspicious" matters.' },
          { cls: 'ab-step-label', text: 'act · tool call' },
          { cls: 'ab-tool',       text: 'run_bash("whois 203.0.113.42 | grep -i country")' },
          { cls: 'ab-step-label', text: 'observe' },
          { cls: 'ab-obs',        text: 'country: hosting provider, known scanning ASN.' },
          { cls: 'ab-final',      text: '✓ 203.0.113.42 fired 137 failed logins in 90s from a known scanning ASN — high-confidence brute-force, block it. 198.51.100.7 had 4 failures over 2 days, more consistent with a forgotten password than an attack.' },
        ],
        agentVerdict: { cls: 'ok', text: 'concrete, ranked, with reasoning you can audit.' },
      },
    };

    let timers = [];
    function cancelTimers() {
      timers.forEach(clearTimeout);
      timers = [];
    }

    function clearScreen(scr, verd) {
      scr.innerHTML = '';
      verd.innerHTML = '';
      verd.className = 'ab-verdict';
    }

    function writeLine(scr, line) {
      const div = document.createElement('div');
      div.className = line.cls || '';
      div.textContent = line.text;
      scr.appendChild(div);
      scr.scrollTop = scr.scrollHeight;
    }

    function reset() {
      cancelTimers();
      runBtn.disabled = false;
      clearScreen(oneshotScreen, oneshotVerd);
      clearScreen(agentScreen,   agentVerd);
      const note = document.createElement('div');
      note.className = 'ab-note';
      note.textContent = '(pick a goal · press ▶ Run both)';
      oneshotScreen.appendChild(note.cloneNode(true));
      agentScreen.appendChild(note);
    }

    function run() {
      cancelTimers();
      runBtn.disabled = true;
      clearScreen(oneshotScreen, oneshotVerd);
      clearScreen(agentScreen,   agentVerd);

      const scen = SCENARIOS[goalSel.value];
      if (!scen) { runBtn.disabled = false; return; }

      // Left side: render the one-shot completion all at once with a tiny delay.
      timers.push(setTimeout(() => {
        scen.oneshot.forEach(l => writeLine(oneshotScreen, l));
        oneshotVerd.textContent = scen.oneshotVerdict.text;
        oneshotVerd.className = 'ab-verdict ' + scen.oneshotVerdict.cls;
      }, 200));

      // Right side: render the agent loop one line at a time.
      const steps = scen.agent;
      const baseDelay = 500;
      const perLine = 550;
      steps.forEach((line, i) => {
        timers.push(setTimeout(() => writeLine(agentScreen, line), baseDelay + i * perLine));
      });
      timers.push(setTimeout(() => {
        agentVerd.textContent = scen.agentVerdict.text;
        agentVerd.className = 'ab-verdict ' + scen.agentVerdict.cls;
        runBtn.disabled = false;
      }, baseDelay + steps.length * perLine));
    }

    runBtn.addEventListener('click', run);
    resetBtn.addEventListener('click', reset);
    reset();
  })();

  // ============================================================
  // Widget 2 · Agent loop SVG (ReAct cycle, static)
  // ============================================================
  (function initLoop() {
    const svg = document.getElementById('loop-svg');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Arrow marker
    const defs = el('defs', null, svg);
    const m = el('marker', {
      id: 'loop-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse',
    }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--accent)' }, m);

    // Central LLM node
    el('rect', { class: 'node llm', x: 230, y: 130, width: 140, height: 60, rx: 8 }, svg);
    el('text', { class: 'node-label', x: 300, y: 152 }, svg, 'LLM');
    el('text', { class: 'node-sub',   x: 300, y: 170 }, svg, 'one forward pass per turn');

    // Tools — right of LLM
    el('rect', { class: 'node tool', x: 430, y: 70,  width: 140, height: 50, rx: 8 }, svg);
    el('text', { class: 'node-label', x: 500, y: 90 }, svg, 'Tools');
    el('text', { class: 'node-sub',   x: 500, y: 106 }, svg, 'bash · read · web · MCP');

    // Memory / context — below LLM
    el('rect', { class: 'node memo', x: 230, y: 230, width: 140, height: 50, rx: 8 }, svg);
    el('text', { class: 'node-label', x: 300, y: 250 }, svg, 'Memory');
    el('text', { class: 'node-sub',   x: 300, y: 266 }, svg, 'context window · transcript');

    // Goal — left of LLM
    el('rect', { class: 'node', x: 30, y: 130, width: 140, height: 60, rx: 8 }, svg);
    el('text', { class: 'node-label', x: 100, y: 152 }, svg, 'Goal');
    el('text', { class: 'node-sub',   x: 100, y: 170 }, svg, 'user-supplied');

    // Goal → LLM
    el('path', { class: 'edge', d: 'M 170 160 L 230 160', 'marker-end': 'url(#loop-arrow)' }, svg);

    // LLM → Tools (act)
    el('path', { class: 'edge', d: 'M 370 145 Q 410 110 430 100', 'marker-end': 'url(#loop-arrow)' }, svg);
    el('text', { class: 'edge-label', x: 392, y: 110 }, svg, 'act');

    // Tools → LLM (observe)
    el('path', { class: 'edge', d: 'M 430 105 Q 390 145 370 165', 'marker-end': 'url(#loop-arrow)' }, svg);
    el('text', { class: 'edge-label', x: 408, y: 138 }, svg, 'observe');

    // LLM ↔ Memory
    el('path', { class: 'edge', d: 'M 290 190 L 290 230', 'marker-end': 'url(#loop-arrow)' }, svg);
    el('path', { class: 'edge', d: 'M 310 230 L 310 190', 'marker-end': 'url(#loop-arrow)' }, svg);
    el('text', { class: 'edge-label', x: 360, y: 215 }, svg, 'write / read');

    // Self-loop on LLM (think)
    el('path', { class: 'edge', d: 'M 245 130 Q 220 80 270 90 Q 295 95 280 125', 'marker-end': 'url(#loop-arrow)' }, svg);
    el('text', { class: 'edge-label', x: 232, y: 80 }, svg, 'think');

    // Final answer arrow — out the right
    el('path', { class: 'edge', d: 'M 370 175 Q 510 220 520 280', 'marker-end': 'url(#loop-arrow)' }, svg);
    el('text', { class: 'edge-label', x: 470, y: 240 }, svg, 'final answer');
  })();

  // ============================================================
  // Widget 3 · Skill anatomy hover-explain
  // ============================================================
  (function initSkill() {
    const root = document.getElementById('viz-skill-anatomy');
    if (!root) return;
    const explain = document.getElementById('skill-explain');
    const lines = root.querySelectorAll('.skill-line');
    const DEFAULT = 'Hover any line for an explanation. Click a line to lock the explanation in place.';
    let locked = null;

    function setExplain(t) { explain.textContent = t; }

    lines.forEach(line => {
      line.addEventListener('mouseenter', () => {
        if (locked) return;
        lines.forEach(o => o.classList.remove('active'));
        line.classList.add('active');
        const t = line.getAttribute('data-explain') || '';
        if (t) setExplain(t);
      });
      line.addEventListener('mouseleave', () => {
        if (locked) return;
        line.classList.remove('active');
        setExplain(DEFAULT);
      });
      line.addEventListener('click', () => {
        // Toggle lock on this line
        if (locked === line) {
          locked = null;
          line.classList.remove('active');
          setExplain(DEFAULT);
        } else {
          if (locked) locked.classList.remove('active');
          locked = line;
          lines.forEach(o => o.classList.remove('active'));
          line.classList.add('active');
          const t = line.getAttribute('data-explain') || '';
          if (t) setExplain(t);
        }
      });
    });
    setExplain(DEFAULT);
  })();

  // ============================================================
  // Widget 4 · Seven-phase sprint timeline
  // ============================================================
  (function initSprint() {
    const svg = document.getElementById('sprint-svg');
    if (!svg) return;
    const detail = document.getElementById('sprint-detail');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const PHASES = [
      { id: 'think',   name: 'Think',   x:  20, body: 'Frame the problem. Skills: <code>/gstack office-hours</code>. Output: <code>SPEC.md</code>. <strong>Most-skipped phase, most-expensive to skip.</strong>' },
      { id: 'plan',    name: 'Plan',    x: 120, body: 'Design doc with modules, test matrix, and risks. Skills: <code>/gstack plan-eng-review</code>, <code>/gstack plan-design-review</code>, <code>/gstack plan-ceo-review</code>. Output: <code>PLAN.md</code>.' },
      { id: 'build',   name: 'Build',   x: 220, body: 'Auto-implementation. The agent reads <code>PLAN.md</code> and writes every file in the design. Your job is to <strong>review every diff</strong>, not to type.' },
      { id: 'review',  name: 'Review',  x: 320, body: 'Senior-engineer code audit. Skills: <code>/gstack review</code>, <code>/gstack cso</code> (OWASP/STRIDE security pass). Auto-fixes safe issues, flags risky ones for human approval.' },
      { id: 'test',    name: 'Test',    x: 420, body: 'End-to-end verification. Skills: <code>/gstack qa</code> (real browser, real input), <code>/gstack benchmark</code>. <code>/gstack qa</code> writes regression tests for any bugs it finds.' },
      { id: 'ship',    name: 'Ship',    x: 520, body: 'Commit, push, open PR with a description derived from <code>SPEC.md</code> + <code>PLAN.md</code> + <code>/gstack review</code> output. Skills: <code>/gstack ship</code>, <code>/gstack land-and-deploy</code>.' },
      { id: 'reflect', name: 'Reflect', x: 620, body: 'Retrospective. Skills: <code>/gstack retro</code>, <code>/gstack learn</code>. Reads the whole session transcript and writes <code>LEARNINGS.md</code> — future sprints in this repo read it on startup.' },
    ];

    // Phase band
    el('rect', { class: 'phase-band', x: 10, y: 90, width: 700, height: 60, rx: 30 }, svg);

    PHASES.forEach((p, i) => {
      // Connector arrow to next phase
      if (i < PHASES.length - 1) {
        const x1 = p.x + 80, x2 = PHASES[i + 1].x + 5;
        el('line', { class: 'phase-arrow', x1, y1: 120, x2, y2: 120 }, svg);
      }
      // Chip
      const chip = el('rect', { class: 'phase-chip', 'data-phase': p.id, x: p.x, y: 95, width: 85, height: 50, rx: 8 }, svg);
      el('text', { class: 'phase-num',  x: p.x + 42, y: 110 }, svg, '0' + (i + 1));
      el('text', { class: 'phase-name', x: p.x + 42, y: 132 }, svg, p.name);
      chip.addEventListener('click', () => activate(p.id));
      chip.addEventListener('mouseenter', () => activate(p.id, true));
    });

    // Caption strip below
    el('text', { class: 'phase-num', x: 360, y: 200 }, svg, 'one sprint · artifacts compound · each phase reads the last');

    let activeId = null;
    function activate(id, transient) {
      const phase = PHASES.find(p => p.id === id);
      if (!phase) return;
      if (!transient) activeId = id;
      svg.querySelectorAll('.phase-chip').forEach(c =>
        c.classList.toggle('active', c.getAttribute('data-phase') === id)
      );
      detail.innerHTML =
        '<div class="phase-detail-title">' + phase.name.toLowerCase() + '</div>' +
        '<div>' + phase.body + '</div>';
    }

    // Initial
    activate('think');
  })();

  // ============================================================
  // Widget 5 · Decompose — pieces fanning out from one contract
  // ============================================================
  (function initDecompose() {
    const svg = document.getElementById('decompose-svg');
    if (!svg) return;
    const teamSel = document.getElementById('decompose-team');
    const projSel = document.getElementById('decompose-project');
    const detail  = document.getElementById('decompose-detail');

    // Each project carries a shared contract and up to 5 candidate pieces,
    // ordered by priority. A team of N takes the first N pieces; the rest
    // become "going further" (or fold into a core piece for small teams).
    const PROJECTS = {
      authlog: {
        contract: 'Event {timestamp, ip, user, outcome}  →  Alert {ip, class, confidence, evidence[]}',
        pieces: [
          { name: 'Parser',     role: 'log lines → Event[]',        detail: 'Read raw <code>auth.log</code>, emit one <code>Event</code> per line. Owns timestamp/year inference and malformed-line skipping. <strong>Produces</strong> the first half of the contract.' },
          { name: 'Classifier', role: 'Event[] → labelled events',  detail: 'Tag each event: brute-force, credential-stuffing, scanner, or wrong-password. <strong>Consumes</strong> <code>Event</code>, adds a <code>class</code> + <code>confidence</code>.' },
          { name: 'Reporter',   role: 'Alert[] → human summary',    detail: 'Roll alerts into a readable daily digest (stdout / JSON). <strong>Consumes</strong> the second half of the contract; renders it.' },
          { name: 'Eval harness', role: 'fixture → precision/recall', detail: 'Run the full pipeline over a labelled fixture, report metrics, gate CI. <strong>Owns the shared fixture</strong> every other piece tests against.' },
          { name: 'Aggregator', role: 'events → dedup\'d Alerts',   detail: 'Window + dedup events into <code>Alert</code> objects, collapsing repeats and surfacing slow-burn patterns. Sits between classifier and reporter.' },
        ],
      },
      phishing: {
        contract: 'UrlVerdict {url, features{}, score, label, reasons[]}',
        pieces: [
          { name: 'Feature extractor', role: 'url → features{}',        detail: 'Parse a URL into lexical + host features (length, entropy, TLD, has-IP, domain age). <strong>Produces</strong> the <code>features</code> field of the contract.' },
          { name: 'Risk scorer',       role: 'features{} → score+reasons', detail: 'Heuristic rules + an LLM-judge. <strong>Consumes</strong> <code>features</code>, emits a <code>score</code>, a <code>label</code>, and human-readable <code>reasons[]</code>.' },
          { name: 'Front-end (CLI/web)', role: 'url → UrlVerdict shown', detail: 'Accept a URL or a batch, drive the pipeline, render the verdict. <strong>Consumes</strong> the whole contract.' },
          { name: 'Eval harness',      role: 'labelled set → P/R',     detail: 'Score a labelled corpus, report precision/recall, gate CI. <strong>Owns the shared fixture.</strong>' },
          { name: 'Alert sink',        role: 'verdicts → digest',      detail: 'Roll high-risk verdicts into a daily digest or webhook. <strong>Consumes</strong> the contract downstream of the front-end.' },
        ],
      },
      cve: {
        contract: 'Finding {package, installed_version, cve_id, severity, fixed_in}',
        pieces: [
          { name: 'Dependency parser', role: 'manifest → packages[]',  detail: 'Read <code>requirements.txt</code> / <code>package.json</code> into <code>{package, installed_version}</code>. <strong>Produces</strong> the left half of the contract.' },
          { name: 'Feed poller',       role: 'NVD → CVE cache',        detail: 'Fetch + cache the NVD feed. Emits raw CVE records the matcher reads. Owns rate-limiting and the local cache.' },
          { name: 'Version matcher',   role: 'pkg × CVE → Finding[]',  detail: 'Match installed versions against CVE affected-ranges (CPE strings). <strong>Produces the full <code>Finding</code></strong> — the heart of the contract.' },
          { name: 'Notifier',          role: 'Finding[] → alert',      detail: 'Emit findings to stdout / email / Slack, deduped by <code>cve_id</code>. <strong>Consumes</strong> the contract.' },
          { name: 'Scheduler/daemon',  role: 'orchestrate the loop',   detail: 'Run the poll → match → notify loop on a schedule. Wires the other pieces together; owns no contract field of its own.' },
        ],
      },
      custom: {
        contract: 'Your shared record — define it first; it is the seam.',
        pieces: [
          { name: 'Piece 1', role: 'ingest / parse input',   detail: 'The piece that turns raw input into the first contract record. <strong>Name it, then pin exactly what it produces.</strong>' },
          { name: 'Piece 2', role: 'core logic',             detail: 'The piece that does the real work on the parsed records. <strong>Consumes</strong> piece 1\'s output, produces the next record.' },
          { name: 'Piece 3', role: 'output / report',        detail: 'The piece a human (or downstream system) actually reads. <strong>Consumes</strong> the final contract record.' },
          { name: 'Piece 4', role: 'eval / fixture',         detail: 'Owns the shared fixture and the metrics that gate CI. Every other piece tests against this.' },
          { name: 'Piece 5', role: 'orchestration / 2nd source', detail: 'Glue: a daemon, a scheduler, or a second input source. Wires the pieces together.' },
        ],
      },
    };

    const SVG_NS2 = 'http://www.w3.org/2000/svg';
    function e2(name, attrs, parent, text) {
      const node = document.createElementNS(SVG_NS2, name);
      if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
      if (text != null) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    }

    const DEFAULT_DETAIL = 'Click any piece chip above for what it owns.';
    let activeIdx = null;

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      activeIdx = null;
      detail.innerHTML = DEFAULT_DETAIL;

      const proj = PROJECTS[projSel.value] || PROJECTS.custom;
      const n = Math.max(2, Math.min(5, parseInt(teamSel.value, 10) || 3));
      const pieces = proj.pieces.slice(0, n);

      // Arrow markers (down = write to bus, up = read from bus)
      const defs = e2('defs', null, svg);
      const mk = e2('marker', { id: 'dc-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
      e2('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--accent)' }, mk);

      // Contract bus
      const busY = 200, busH = 30;
      e2('rect', { class: 'dc-bus', x: 30, y: busY, width: 660, height: busH, rx: 15 }, svg);
      e2('text', { class: 'dc-bus-label', x: 360, y: busY + busH / 2 + 1 }, svg, 'shared contract');

      // Contract shape under the bus
      e2('text', { class: 'dc-contract', x: 360, y: busY + busH + 22 }, svg, proj.contract);

      // Pieces along the top, evenly distributed, each wired to the bus
      const boxW = 124, boxH = 56, topY = 50;
      const slotW = 660 / n;
      pieces.forEach((p, i) => {
        const cx = 30 + slotW * (i + 0.5);
        const x = cx - boxW / 2;

        // connector: piece <-> bus (bidirectional: reads and writes)
        e2('line', { class: 'dc-wire', x1: cx - 5, y1: topY + boxH, x2: cx - 5, y2: busY, 'marker-end': 'url(#dc-arrow)' }, svg);
        e2('line', { class: 'dc-wire', x1: cx + 5, y1: busY, x2: cx + 5, y2: topY + boxH, 'marker-end': 'url(#dc-arrow)' }, svg);

        const g = e2('g', { class: 'dc-piece', 'data-idx': i }, svg);
        e2('rect', { class: 'dc-box', x, y: topY, width: boxW, height: boxH, rx: 7 }, g);
        e2('text', { class: 'dc-owner', x: cx, y: topY - 8 }, g, 'teammate ' + (i + 1));
        e2('text', { class: 'dc-name', x: cx, y: topY + 23 }, g, p.name);
        // role can be long — wrap into two short lines if needed
        e2('text', { class: 'dc-role', x: cx, y: topY + 40 }, g, p.role);

        g.addEventListener('click', () => activate(i, pieces));
        g.addEventListener('mouseenter', () => activate(i, pieces, true));
      });
    }

    function activate(i, pieces, transient) {
      if (!transient) activeIdx = i;
      svg.querySelectorAll('.dc-piece').forEach(g =>
        g.classList.toggle('active', parseInt(g.getAttribute('data-idx'), 10) === i)
      );
      const p = pieces[i];
      if (!p) return;
      detail.innerHTML =
        '<div class="dc-detail-title">' + p.name + ' · <span>' + p.role + '</span></div>' +
        '<div>' + p.detail + '</div>';
    }

    teamSel.addEventListener('change', render);
    projSel.addEventListener('change', render);
    render();
  })();

  // ============================================================
  // Widget · Orchestrator — how to build one, per pattern
  // ============================================================
  (function initOrchestrator() {
    const svg = document.getElementById('orchestrator-svg');
    if (!svg) return;
    const controls = document.getElementById('orch-controls');
    const detail = document.getElementById('orch-detail');

    const SVGNS = 'http://www.w3.org/2000/svg';
    function n(name, attrs, parent, text) {
      const node = document.createElementNS(SVGNS, name);
      if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
      if (text != null) node.textContent = text;
      if (parent) parent.appendChild(node);
      return node;
    }

    const ORCH = { x: 285, y: 12, w: 150, h: 56, t: 'Orchestrator', s: 'you + controller', cls: 'llm' };

    const PATTERNS = {
      sequential: {
        label: 'Sequential',
        nodes: [
          ORCH,
          { x: 30,  y: 116, w: 130, h: 48, t: '1 · parse',  cls: 'unit' },
          { x: 295, y: 116, w: 130, h: 48, t: '2 · detect', cls: 'unit' },
          { x: 560, y: 116, w: 130, h: 48, t: '3 · report', cls: 'unit' },
          { x: 560, y: 232, w: 130, h: 42, t: 'result', cls: 'out' },
        ],
        edges: [
          { x1: 360, y1: 68, x2: 95,  y2: 116, t: 'dispatch' },
          { x1: 160, y1: 140, x2: 295, y2: 140, t: 'out→in' },
          { x1: 425, y1: 140, x2: 560, y2: 140, t: 'out→in' },
          { x1: 625, y1: 164, x2: 625, y2: 232, t: '' },
        ],
        how: [
          'Run each skill in order; each one\'s output file is the next one\'s input.',
          'Stop on the first failure — a broken artifact shouldn\'t flow downstream.',
          'This is the gstack sprint: SPEC → PLAN → code → review → qa → ship.',
        ],
        code: 'spec = office_hours(idea)        # → SPEC.md\n' +
              'plan = plan_review(spec)         # reads SPEC.md → PLAN.md\n' +
              'code = implement(plan)           # reads PLAN.md\n' +
              'review(code); qa(code); ship(code)',
      },
      fanout: {
        label: 'Fan-out',
        nodes: [
          ORCH,
          { x: 30,  y: 116, w: 130, h: 48, t: 'piece A', cls: 'unit' },
          { x: 295, y: 116, w: 130, h: 48, t: 'piece B', cls: 'unit' },
          { x: 560, y: 116, w: 130, h: 48, t: 'piece C', cls: 'unit' },
          { x: 275, y: 232, w: 170, h: 42, t: 'merge / integrate', cls: 'out' },
        ],
        edges: [
          { x1: 360, y1: 68, x2: 95,  y2: 116, t: 'split' },
          { x1: 360, y1: 68, x2: 360, y2: 116, t: '' },
          { x1: 360, y1: 68, x2: 625, y2: 116, t: '' },
          { x1: 95,  y1: 164, x2: 320, y2: 232, t: '' },
          { x1: 360, y1: 164, x2: 360, y2: 232, t: '' },
          { x1: 625, y1: 164, x2: 400, y2: 232, t: '' },
        ],
        how: [
          'Split the goal into independent units that share ONE contract.',
          'Dispatch them all at once; wait for all; merge on the contract.',
          'This is the team assignment — N teammates, N pieces, one shared record.',
        ],
        code: 'units   = split(goal)            # each conforms to CONTRACT\n' +
              'results = parallel(run, units)   # run concurrently\n' +
              'merge(results)                   # combine via the contract',
      },
      delegation: {
        label: 'Delegation',
        nodes: [
          { x: 285, y: 12, w: 150, h: 56, t: 'Coordinator', s: 'lean context', cls: 'llm' },
          { x: 40,  y: 118, w: 180, h: 58, t: 'sub-agent', s: 'own fresh context', cls: 'unit dashed' },
          { x: 270, y: 118, w: 180, h: 58, t: 'sub-agent', s: 'own fresh context', cls: 'unit dashed' },
          { x: 500, y: 118, w: 180, h: 58, t: 'sub-agent', s: 'own fresh context', cls: 'unit dashed' },
          { x: 275, y: 240, w: 170, h: 40, t: 'collected results', cls: 'out' },
        ],
        edges: [
          { x1: 360, y1: 68, x2: 130, y2: 118, t: 'scoped task' },
          { x1: 360, y1: 68, x2: 360, y2: 118, t: '' },
          { x1: 360, y1: 68, x2: 590, y2: 118, t: '' },
          { x1: 130, y1: 176, x2: 320, y2: 240, t: 'result only' },
          { x1: 360, y1: 176, x2: 360, y2: 240, t: '' },
          { x1: 590, y1: 176, x2: 400, y2: 240, t: '' },
        ],
        how: [
          'When a subtask needs heavy reading, spawn a sub-agent with a scoped prompt.',
          'Each sub-agent runs in its OWN context window and returns only the answer.',
          'The coordinator stays lean — it never holds all the raw material at once.',
        ],
        code: 'for file in changed_files:\n' +
              '    finding = subagent("review " + file)  # fresh context each\n' +
              '    collect(finding)                      # only the result returns',
      },
      loop: {
        label: 'Loop-until-done',
        nodes: [
          { x: 24,  y: 96, w: 120, h: 48, t: 'Orchestrator', cls: 'llm' },
          { x: 188, y: 96, w: 150, h: 52, t: 'work', s: 'review + fix', cls: 'unit' },
          { x: 386, y: 96, w: 140, h: 52, t: 'check', s: 'rubric clean?', cls: 'unit' },
          { x: 574, y: 96, w: 122, h: 48, t: 'result', cls: 'out' },
        ],
        edges: [
          { x1: 144, y1: 120, x2: 188, y2: 120, t: '' },
          { x1: 338, y1: 122, x2: 386, y2: 122, t: '' },
          { x1: 526, y1: 122, x2: 574, y2: 122, t: 'yes' },
          { curve: 'M 456 96 C 456 50 263 50 263 96', x2: 263, y2: 96, t: 'no, iterate' },
        ],
        how: [
          'Repeat work → check until a quality bar is met (or a budget is hit).',
          'ALWAYS set a stop condition — a max number of tries or a token budget.',
          'Example: re-run /gstack review + fix until the rubric comes back clean.',
        ],
        code: 'tries = 0\n' +
              'while not passes(rubric) and tries < MAX:\n' +
              '    output = work(output)   # /gstack review + apply fixes\n' +
              '    tries += 1',
      },
    };

    function draw(key) {
      const p = PATTERNS[key];
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      const defs = n('defs', null, svg);
      const m = n('marker', { id: 'orch-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      n('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--accent)' }, m);

      // edges first (under nodes)
      p.edges.forEach(e => {
        if (e.curve) {
          n('path', { class: 'orch-edge', d: e.curve, 'marker-end': 'url(#orch-arrow)' }, svg);
        } else {
          n('line', { class: 'orch-edge', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, 'marker-end': 'url(#orch-arrow)' }, svg);
        }
        if (e.t) {
          const mx = e.curve ? 360 : (e.x1 + e.x2) / 2;
          const my = e.curve ? 44 : (e.y1 + e.y2) / 2 - 4;
          n('text', { class: 'orch-edge-label', x: mx, y: my }, svg, e.t);
        }
      });

      // nodes
      p.nodes.forEach(d => {
        n('rect', { class: 'orch-node ' + (d.cls || ''), x: d.x, y: d.y, width: d.w, height: d.h, rx: 8 }, svg);
        const cx = d.x + d.w / 2;
        const cy = d.y + d.h / 2;
        if (d.s) {
          // two lines, centred as a pair around the node's middle
          n('text', { class: 'orch-node-title', x: cx, y: cy - 8 }, svg, d.t);
          n('text', { class: 'orch-node-sub', x: cx, y: cy + 12 }, svg, d.s);
        } else {
          n('text', { class: 'orch-node-title', x: cx, y: cy }, svg, d.t);
        }
      });
    }

    function showDetail(key) {
      const p = PATTERNS[key];
      detail.innerHTML =
        '<div class="orch-detail-title">' + p.label + ' · how to build it</div>' +
        '<ul class="orch-how">' + p.how.map(h => '<li>' + h + '</li>').join('') + '</ul>' +
        '<div class="orch-code-label">control logic</div>' +
        '<pre class="orch-code">' + p.code.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>';
    }

    let active = 'sequential';
    function select(key) {
      active = key;
      controls.querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b.getAttribute('data-key') === key));
      draw(key);
      showDetail(key);
    }

    Object.keys(PATTERNS).forEach(key => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.setAttribute('data-key', key);
      b.textContent = PATTERNS[key].label;
      b.addEventListener('click', () => select(key));
      controls.appendChild(b);
    });

    select('sequential');
  })();

  // ============================================================
  // Widget 6 · Inline glossary — re-parents under the term's
  // nearest block. Same contract as lab-01 (now documented in
  // CLAUDE.md as a shared widget pattern).
  // ============================================================
  (function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'agent': {
        title: 'agent',
        body:
          '<p>An <strong>agent</strong> is an LLM running in a loop with three extras: a set of tools it can call, a persistent memory of what it has seen, and the autonomy to decide its next step. The loop is what distinguishes an agent from a chatbot — a chatbot emits one completion and stops; an agent keeps going until it decides the goal is met (or until you stop it).</p>' +
          '<p>The canonical pattern is <strong>ReAct</strong>: on each turn the agent <em>thinks</em>, <em>acts</em> (tool call), <em>observes</em> (tool result), and <em>reflects</em>. See <a href="https://arxiv.org/abs/2210.03629">Yao et al. (2022)</a> for the original paper.</p>',
      },
      'skill': {
        title: 'skill',
        body:
          '<p>A <strong>skill</strong> is a focused, reusable instruction set the agent invokes for a particular kind of work. Think of it as a function library for prompts: instead of typing the same paragraph of instructions every time you want a code review, you write it once in <code>~/.claude/skills/review/SKILL.md</code> and invoke it with <code>/review</code>.</p>' +
          '<p>In Claude Code, a skill is a single Markdown file: a YAML front-matter block (<code>name</code>, <code>description</code>, <code>allowed-tools</code>) plus a body of instructions in plain English. No code. <a href="https://github.com/garrytan/gstack">gstack</a> ships 23 of them. You\'ll write your own before this lab is over.</p>',
      },
      'claude-code': {
        title: 'Claude Code',
        body:
          '<p>Anthropic\'s agentic CLI — a terminal program that runs an agent loop over the Claude family of LLMs, with access to your file system, shell, browser, and any MCP servers you wire up. Distinct from the Claude web/desktop chat interface: it edits files, runs commands, and shells out to git on your behalf.</p>' +
          '<p>You install it with <code>curl … | bash</code>, sign in with a Claude subscription (Pro, Max, or Education), and from there it\'s <code>claude</code> in any project directory. Docs: <a href="https://docs.claude.com/en/docs/claude-code/overview">docs.claude.com/en/docs/claude-code</a>.</p>',
      },
      'tool-call': {
        title: 'tool call',
        body:
          '<p>A <strong>tool call</strong> is the agent\'s mechanism for taking action in the world. Concretely, it\'s a structured JSON payload the LLM emits — <code>{ "name": "read_file", "args": { "path": "auth.log" } }</code> — that the framework intercepts, executes, and returns results for. The LLM never executes anything itself; it only <em>requests</em> actions.</p>' +
          '<p>The set of available tools is up to whoever runs the agent. Claude Code ships with <code>Read</code>, <code>Edit</code>, <code>Bash</code>, <code>WebFetch</code>, etc., and accepts arbitrary additional tools via <a href="https://modelcontextprotocol.io">MCP</a>. Restricting tools per skill (via <code>allowed-tools:</code>) is the most important guardrail you have.</p>',
      },
      'react': {
        title: 'ReAct',
        body:
          '<p><strong>ReAct</strong> stands for <em>Reason + Act</em>. It\'s the loop pattern at the heart of every modern coding agent: the LLM emits a chain-of-thought (the <em>reasoning</em>) and a tool call (the <em>action</em>) on each turn, then sees the tool\'s output and decides what to do next.</p>' +
          '<p>Named in <a href="https://arxiv.org/abs/2210.03629">Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models" (NeurIPS 2022)</a>. The paper\'s observation: letting the model <em>write down its reasoning</em> between actions sharply improves accuracy on multi-step tasks. Every framework you use today inherits this insight.</p>',
      },
      'context-window': {
        title: 'context window',
        body:
          '<p>The <strong>context window</strong> is the LLM\'s working memory — the maximum number of <em>tokens</em> (roughly: word-pieces) the model can attend to in a single forward pass. Frontier models in 2026 sit around 200K–1M tokens; older or smaller models are 4K–128K.</p>' +
          '<p>Everything the agent has ever said, every tool result it received, and the user\'s entire history this session lives in that window. When it fills, the framework either summarizes older turns or drops them, and the agent loses access to that detail. Designing for finite context — short tool results, periodic summarization, scoped subtasks — is half of agentic engineering.</p>',
      },
      'retrospective': {
        title: 'retrospective',
        body:
          '<p>A <strong>retrospective</strong> (or "retro") is the meeting that disciplined human teams hold at the end of every sprint to ask <em>what went well, what went wrong, what to change next time</em>. gstack adopts the practice for agent sessions: <code>/gstack retro</code> reads the entire session transcript and produces a structured reflection.</p>' +
          '<p>The output lands in <code>LEARNINGS.md</code> at the repo root. Future skill invocations read it on startup — so the project gets smarter sprint over sprint without you re-typing instructions.</p>',
      },
      'prompt-injection': {
        title: 'prompt injection',
        body:
          '<p><strong>Prompt injection</strong> is the agent-era equivalent of SQL injection. Anything the agent reads — a README, a tool result, a comment in a file you opened, an HTML page you fetched — is implicitly part of its prompt. A hostile document can therefore contain <em>instructions</em> the agent will follow, undermining whatever the user actually asked for.</p>' +
          '<p>Treat untrusted input the same way you\'d treat untrusted SQL: validate, sanitize, and never let the agent execute privileged actions on instructions it found in data. <code>allowed-tools:</code> restriction in skills is your strongest defense. Anthropic has a longer write-up at <a href="https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/prompt-injection">docs.claude.com/en/docs/build-with-claude/prompt-engineering/prompt-injection</a>.</p>',
      },
      'brute-force': {
        title: 'brute-force attack',
        body:
          '<p>A <strong>brute-force attack</strong> tries many secrets against a target until one works — classically, an automated tool throwing thousands of passwords at a login service (SSH, RDP, a web form) far faster than any human could type. Against SSH it floods the server\'s <code>auth.log</code> with <code>Failed password</code> entries, all from the attacker\'s source IP.</p>' +
          '<p>A close cousin is <strong>credential stuffing</strong>: instead of <em>guessing</em>, the attacker replays username/password pairs leaked from some other breach, betting that people reuse passwords. Both show the same log signature — a spike in failures from one source — so the same volume-per-IP detector (<code>failed-logins</code>, then <code>sshbursts</code>) catches them. Defenses: rate-limiting, key-only auth, and tools like <code>fail2ban</code> that block an IP after N failures.</p>',
      },
      'mcp': {
        title: 'MCP · Model Context Protocol',
        body:
          '<p>The <strong>Model Context Protocol</strong> is Anthropic\'s open standard (2024) for connecting agents to external tools. Before MCP, every agent framework defined its own bespoke way to expose "read a file" or "query a database"; MCP standardizes the wire format so a single <em>MCP server</em> works with any compatible agent.</p>' +
          '<p>You don\'t have to know MCP for Lab 05 — Claude Code\'s built-in tools cover everything in this lab. You will use it in Lab 06 when we wire an agent up to your IDS database. Spec and reference servers: <a href="https://modelcontextprotocol.io">modelcontextprotocol.io</a>.</p>',
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

    closeBtn.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (panel.hidden) return;
      if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
      hide();
    });
  })();

})();
