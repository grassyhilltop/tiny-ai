/* ============================================================
 * Lab 07 — viz.js (microagent walkthrough)
 *
 * Widgets:
 *   1. #viz-try-it          — interactive ReAct trace stepper
 *   2. annotated code panels (hover per-line)
 * ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // Widget 1 · interactive ReAct trace
  // ============================================================
  (function initTryIt() {
    const root = document.getElementById('viz-try-it');
    if (!root) return;

    const SYSTEM_PROMPT = `You are a tiny IT helper. You have one tool:

  file_read(path)  — read a file from the knowledge base

When you want to call the tool, reply with this JSON, nothing else:

  {"action": "file_read", "args": {"path": "..."}}

When you have the answer, reply with:

  {"action": "final", "answer": "..."}`;

    const FILES = {
      'password_policy.md':
`# Password Reset Policy

Visit https://password.megacorpone.local to reset your password.

Requirements: 12+ characters, mixed case, number, special character.
Passwords expire every 90 days.

If you are locked out, contact the helpdesk at extension 4357.`,
      'network_help.md':
`# Wi-Fi Troubleshooting

If your Wi-Fi keeps dropping:

1. Forget the network and re-join it.
2. Check that you joined \`megacorp-corp\`, not the guest network.
3. If it still drops, restart NetworkManager.`,
      'hello.md':
`# Greeting

Hi! Ask me about resetting your password or fixing wifi.`,
    };

    const SCENARIOS = {
      'how do I reset my password?': [
        { action: 'file_read', args: { path: 'password_policy.md' } },
        { action: 'final', answer: 'Visit https://password.megacorpone.local. Locked out? Ext. 4357.' },
      ],
      'my wifi keeps dropping': [
        { action: 'file_read', args: { path: 'network_help.md' } },
        { action: 'final', answer: 'Forget the network and rejoin megacorp-corp (not guest). If it keeps dropping, restart NetworkManager.' },
      ],
      'hello': [
        { action: 'final', answer: 'Hi! Ask me about passwords or wifi.' },
      ],
    };

    const presetsEl = document.getElementById('micro-presets');
    const stepBtn   = document.getElementById('micro-step');
    const runBtn    = document.getElementById('micro-run');
    const resetBtn  = document.getElementById('micro-reset');
    const traceEl   = document.getElementById('micro-trace');
    const ctxEl     = document.getElementById('micro-context');

    let state = null;

    function reset(scenarioKey) {
      const script = SCENARIOS[scenarioKey];
      state = {
        key: scenarioKey,
        script: script,
        step: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: scenarioKey },
        ],
        trace: [],
        done: false,
      };
      render();
    }

    function step() {
      if (!state || state.done) return;
      const action = state.script[Math.min(state.step, state.script.length - 1)];
      // Show what the LLM "produced"
      state.trace.push({ type: 'action', step: state.step, action });
      if (action.action === 'final') {
        state.done = true;
        render();
        return;
      }
      // Dispatch the tool
      const obs = (action.action === 'file_read')
        ? (FILES[action.args.path] || ('not found: ' + action.args.path))
        : ('unknown tool: ' + action.action);
      state.trace.push({ type: 'obs', step: state.step, obs });
      state.messages.push({ role: 'assistant', content: JSON.stringify(action) });
      state.messages.push({ role: 'user',      content: 'Observation: ' + obs });
      state.step += 1;
      render();
    }

    function runToEnd() {
      while (state && !state.done) step();
    }

    function render() {
      // Presets
      presetsEl.innerHTML = '<span style="margin-right: 6px;">scenarios:</span>';
      Object.keys(SCENARIOS).forEach(k => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'micro-preset' + (state && state.key === k ? ' active' : '');
        b.textContent = k;
        b.addEventListener('click', () => reset(k));
        presetsEl.appendChild(b);
      });

      // Trace
      if (!state || !state.trace.length) {
        traceEl.innerHTML = '<div class="micro-trace-empty">Pick a scenario and press ▶ Step.</div>';
      } else {
        traceEl.innerHTML = '';
        state.trace.forEach(t => {
          const d = document.createElement('div');
          if (t.type === 'action') {
            d.className = 'micro-trace-step micro-action' + (t.action.action === 'final' ? ' micro-final' : '');
            d.innerHTML = '<span class="micro-trace-tag">step ' + t.step + ' · action</span>' +
                          escapeHTML(JSON.stringify(t.action, null, 0));
          } else {
            d.className = 'micro-trace-step micro-obs';
            d.innerHTML = '<span class="micro-trace-tag">step ' + t.step + ' · observation</span>' +
                          escapeHTML(t.obs);
          }
          traceEl.appendChild(d);
        });
        if (state.done) {
          const d = document.createElement('div');
          d.className = 'micro-trace-step micro-final';
          d.innerHTML = '<span class="micro-trace-tag">done</span>loop terminated; final answer returned to user.';
          traceEl.appendChild(d);
        }
      }

      // Context
      if (!state) {
        ctxEl.innerHTML = '<div class="micro-trace-empty" style="color: #8a857d;">No scenario selected.</div>';
      } else {
        ctxEl.innerHTML = '';
        state.messages.forEach(m => {
          const d = document.createElement('div');
          d.className = 'micro-msg micro-msg-' + m.role;
          d.innerHTML = '<span class="micro-msg-role">' + m.role + '</span>' + escapeHTML(m.content);
          ctxEl.appendChild(d);
        });
      }

      stepBtn.disabled = !state || state.done;
      runBtn.disabled  = !state || state.done;
    }

    function escapeHTML(s) {
      return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    }

    stepBtn.addEventListener('click', step);
    runBtn.addEventListener('click', runToEnd);
    resetBtn.addEventListener('click', () => {
      if (state) reset(state.key); else render();
    });

    // Initial state — pick the first scenario by default so the panels
    // are populated immediately.
    reset('how do I reset my password?');
  })();

  // ============================================================
  // Annotated code blocks (hover per-line, panel below)
  // ============================================================
  document.querySelectorAll('.annotated-code').forEach(block => {
    const panelId = block.id + '-explain';
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const steps = block.querySelectorAll('.code-step');
    steps.forEach(step => {
      step.addEventListener('mouseenter', () => activate(step));
      step.addEventListener('focusin',   () => activate(step));
      step.addEventListener('click',     () => activate(step));
    });

    function activate(step) {
      steps.forEach(s => s.classList.remove('active'));
      step.classList.add('active');
      const name = step.dataset.stepName || '';
      const explain = step.dataset.explain || '';
      panel.innerHTML =
        (name ? '<div class="code-explain-name">' + name + '</div>' : '') +
        explain;
    }
  });

  // ============================================================
  // Widget · ReAct flow diagram (§2.5)
  // ============================================================
  (function initReactFlow() {
    const root   = document.getElementById('viz-react-loop');
    const detail = document.getElementById('react-flow-detail');
    if (!root || !detail) return;

    const NODES = {
      seed: {
        title: '① Seed messages',
        runs: 'Pack the system prompt and the user\'s question into a list with role labels. This is what the LLM sees on its very first call.',
        codeStep: 'init-msgs',
        attack: 'A poisoned user message lands here — direct prompt injection enters the loop on the first iteration.',
      },
      ask: {
        title: '② LLM thinks',
        runs: 'Send the whole <code>messages</code> list to the LLM and receive a reply. The reply is a string of JSON-ish text the LLM produced.',
        codeStep: 'ask',
        attack: 'The LLM\'s reply on later iterations is shaped by every token in <code>messages</code> — including poisoned tool observations from prior steps.',
      },
      parse: {
        title: '③ Parse action JSON',
        runs: '<code>parse_action()</code> pulls the first <code>{...}</code> block out of the reply. If the JSON is malformed, the reply is treated as a final answer.',
        codeStep: 'ask',
        attack: 'A model coaxed into emitting an action it shouldn\'t (a wrong tool, a forbidden path) lands as a valid JSON object — the parser will dispatch it.',
      },
      decide: {
        title: '◇ Is action == "final"?',
        runs: 'The branch. <strong>yes</strong> → return the answer and exit. <strong>no</strong> → dispatch a tool and append the result back into the messages list, then loop.',
        codeStep: 'check-final',
        attack: 'A jailbroken LLM may emit <code>final</code> earlier than it should, leaking a system-prompt secret in the answer field. Or it may emit a tool call to skip the answer entirely.',
      },
      dispatch: {
        title: '④ Dispatch tool',
        runs: 'Look the tool name up in the <code>TOOLS</code> dict and call it with the args dict the LLM produced. If the name is unknown, the observation says so.',
        codeStep: 'dispatch',
        attack: 'The LLM controls the tool name AND its arguments — a coaxed argument path (<code>file_read("/etc/passwd")</code>) is exactly the structural defense that scoping the tool to one folder catches.',
      },
      append: {
        title: '⑤ Append assistant + user turns',
        runs: 'Two appends: the LLM\'s action becomes an <code>assistant</code> message, the tool\'s output becomes a <code>user</code> message. Then the loop goes back to step ②.',
        codeStep: 'append-obs',
        attack: '<strong>This is the trust-boundary bug.</strong> The tool\'s output is appended with role <code>user</code> — the LLM cannot tell whether the next iteration\'s "user message" is from a real human or from a file the agent just read. Indirect prompt injection enters here.',
      },
      final: {
        title: '⑥ Final answer',
        runs: 'The <code>yes</code> branch terminus. <code>return action["answer"]</code> hands the LLM\'s final text back to the caller; the loop ends.',
        codeStep: 'check-final',
        attack: 'Whatever the LLM put in the <code>answer</code> field reaches the user verbatim. Output filters live just before this point — they only see literal text, so encoded leaks slip past.',
      },
    };

    const nodes = root.querySelectorAll('.rf-node');
    const codeBlock = document.getElementById('ma-loop');

    function activate(key) {
      const n = NODES[key];
      if (!n) return;
      nodes.forEach(el => el.classList.toggle('active', el.dataset.node === key));
      // cross-highlight the code line(s) with matching data-step
      if (codeBlock) {
        codeBlock.querySelectorAll('.code-step').forEach(s => {
          s.classList.toggle('flow-active', s.dataset.step === n.codeStep);
        });
      }
      detail.innerHTML =
        '<div class="react-flow-detail-title">' + n.title + '</div>' +
        '<div class="react-flow-detail-body">' +
          '<div class="react-flow-detail-row"><strong>What runs</strong>' + n.runs + '</div>' +
          '<div class="react-flow-detail-row"><strong>Matching code</strong>see the line labeled <code>' + n.codeStep + '</code> in the annotated block below — it just lit up.</div>' +
          '<div class="react-flow-detail-row"><strong>Attack vector</strong>' + n.attack + '</div>' +
        '</div>';
    }

    nodes.forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => activate(el.dataset.node));
    });

    // Start with node ② (LLM thinks) highlighted — it's the "interesting" loop step.
    activate('ask');
  })();

  // ============================================================
  // Widget · Chat with the toy agent (§2.3 → §2.4 bridge)
  //
  // Same canned SCRIPTS dict that microagent.py's ToyLLM uses.
  // Runs the ReAct loop client-side and renders each step as a
  // chat bubble: user msg → think → observation → final answer.
  // ============================================================
  (function initChatAgent() {
    const root      = document.getElementById('viz-chat-agent');
    if (!root) return;
    const hintsEl   = document.getElementById('chat-hints');
    const historyEl = document.getElementById('chat-history');
    const formEl    = document.getElementById('chat-form');
    const inputEl   = document.getElementById('chat-input');
    const clearBtn  = document.getElementById('chat-clear');

    // Mirror of microagent.py's microdata/ folder — file_read(path) reads
    // from this dict.
    const FILES = {
      'password_policy.md':
        '# Password Reset Policy\n\n' +
        'Visit https://password.megacorpone.local to reset your password.\n\n' +
        'Requirements: 12+ characters, mixed case, number, special character.\n' +
        'Passwords expire every 90 days.\n\n' +
        'If you are locked out, contact the helpdesk at extension 4357.',
      'network_help.md':
        '# Wi-Fi Troubleshooting\n\n' +
        'If your Wi-Fi keeps dropping:\n' +
        '1. Forget the network and re-join it.\n' +
        '2. Check that you joined `megacorp-corp`, not the guest network.\n' +
        '3. If it still drops, restart NetworkManager.',
      'hello.md':
        '# Greeting\n\nHi! Ask me about resetting your password or fixing wifi.',
    };

    // Mirror of microagent.py's ToyLLM.SCRIPTS.
    const SCRIPTS = {
      'how do i reset my password': [
        { action: 'file_read', args: { path: 'password_policy.md' } },
        { action: 'final', answer:
          'Visit https://password.megacorpone.local. Locked out? Ext. 4357.' },
      ],
      'my wifi keeps dropping': [
        { action: 'file_read', args: { path: 'network_help.md' } },
        { action: 'final', answer:
          'Forget the network and rejoin megacorp-corp (not guest). ' +
          'If it keeps dropping, restart NetworkManager.' },
      ],
      'hello': [
        { action: 'final', answer: 'Hi! Ask me about passwords or wifi.' },
      ],
    };

    const FALLBACK = [
      { action: 'final', answer:
        '(no canned answer for that — add it to ToyLLM.SCRIPTS, or swap ToyLLM for RealLLM in §2.4)' },
    ];

    // Render helpers.
    function addBubble(kind, content, tag) {
      // Clear the "empty" placeholder bubble if present.
      const empty = historyEl.querySelector('.chat-bubble-empty');
      if (empty) empty.remove();
      const b = document.createElement('div');
      b.className = 'chat-bubble chat-bubble-' + kind;
      if (tag) {
        const t = document.createElement('span');
        t.className = 'chat-bubble-tag';
        t.textContent = tag;
        b.appendChild(t);
      }
      b.appendChild(document.createTextNode(content));
      historyEl.appendChild(b);
      historyEl.scrollTop = historyEl.scrollHeight;
    }

    function pickScript(userMsg) {
      const key = userMsg.toLowerCase().replace(/[?.!\s]+$/g, '').trim();
      return SCRIPTS[key] || FALLBACK;
    }

    // The ReAct loop — same shape as microagent.py's react().
    // Async + setTimeout so each step animates into view.
    function runReact(userMsg) {
      const script = pickScript(userMsg);
      let step = 0;
      const tick = () => {
        if (step >= 5) {                  // bounded loop, same as Python
          addBubble('agent', '(ran out of steps)', 'agent');
          return;
        }
        const action = script[Math.min(step, script.length - 1)];
        if (action.action === 'final') {
          addBubble('agent', action.answer, 'agent · final');
          return;
        }
        // think bubble: show the action JSON
        addBubble('think', JSON.stringify(action), 'step ' + step + ' · think');
        // observation: run the tool
        setTimeout(() => {
          let obs;
          if (action.action === 'file_read') {
            const path = action.args && action.args.path;
            obs = (path in FILES) ? FILES[path] : ('not found: ' + path);
          } else {
            obs = 'unknown tool: ' + action.action;
          }
          // truncate long observations the way the Python trace does
          const shown = obs.length > 200 ? obs.slice(0, 200) + ' …' : obs;
          addBubble('obs', shown, 'step ' + step + ' · observation');
          step += 1;
          setTimeout(tick, 400);
        }, 400);
      };
      tick();
    }

    function send(message) {
      const msg = message.trim();
      if (!msg) return;
      addBubble('user', msg, 'you');
      inputEl.value = '';
      setTimeout(() => runReact(msg), 250);
    }

    // Hint chips for the three canned scenarios.
    const hints = ['how do I reset my password?', 'my wifi keeps dropping', 'hello'];
    hintsEl.innerHTML = '<span style="font-family: var(--mono); font-size: 0.82rem; color: var(--ink-mute); margin-right: 4px;">try:</span>';
    hints.forEach(h => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-hint';
      b.textContent = h;
      b.addEventListener('click', () => send(h));
      hintsEl.appendChild(b);
    });

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      send(inputEl.value);
    });

    clearBtn.addEventListener('click', () => {
      historyEl.innerHTML =
        '<div class="chat-bubble chat-bubble-empty">Type a message below, or click one of the preset chips above.</div>';
    });
  })();

})();
