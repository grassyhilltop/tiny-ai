/* ============================================================
 * Lab 07 — viz.js (Attacking MCP)
 *
 * No interactive widgets — the lab is heavy on real attack scripts
 * and code walkthroughs. The only wired-up feature is the shared
 * inline-glossary explainer (CSS lives in ../_shared/lab-base.css;
 * see CLAUDE.md "Inline glossary explainer" for the contract).
 * ============================================================ */

(function () {
  'use strict';

  // Inline glossary — security jargon in the prose is hoverable, and the
  // explainer panel re-parents to sit directly under the term's block.
  (function initGlossary() {
    const panel = document.getElementById('glossary-panel');
    if (!panel) return;
    const content = document.getElementById('glossary-content');
    const closeBtn = document.getElementById('glossary-close');
    const terms = document.querySelectorAll('.gloss[data-gloss]');

    const GLOSSARY = {
      'memory-corruption': {
        title: 'memory-corruption bug',
        body:
          '<p>A vulnerability where a program reads or writes <em>outside the bounds</em> of the memory it was given — buffer overflows, use-after-free, and the like — almost always in low-level languages such as C/C++ that don\'t check those bounds for you. By overwriting adjacent memory (a saved return address, a function pointer), an attacker redirects the program\'s control flow and runs their own machine code.</p>' +
          '<p>These are the classic exploits: most CVEs with "overflow" in the title, Heartbleed, the stuff of CTF binary-exploitation challenges. MCP attacks are a different species entirely — nothing is corrupted. The server runs exactly as written; the attacker just abuses the <em>trust</em> between the host, the model, and the tools. No memory bug required.</p>',
      },
    };

    function clearActive() {
      document.querySelectorAll('.gloss.active').forEach(t => t.classList.remove('active'));
    }
    function nearestBlock(el) {
      let node = el;
      while (node && node.parentNode) {
        if (node.id === 'glossary-panel' || node === panel) { node = node.parentElement; continue; }
        const tag = node.tagName;
        if (tag && /^(P|H[1-6]|LI|UL|OL|FIGURE|TABLE|BLOCKQUOTE|PRE)$/.test(tag)) return node;
        node = node.parentElement;
      }
      return el;
    }
    function show(term) {
      const key = term.getAttribute('data-gloss');
      const entry = GLOSSARY[key];
      if (!entry) return;
      clearActive();
      term.classList.add('active');
      content.innerHTML =
        '<div class="glossary-panel-title">' + entry.title + '</div>' + entry.body;
      const target = nearestBlock(term);
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
      t.addEventListener('click', () => show(t));
      t.addEventListener('mouseenter', () => show(t));
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(t); } });
    });
    closeBtn.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (panel.hidden) return;
      if (e.target && e.target.matches && e.target.matches('input, textarea, [contenteditable]')) return;
      hide();
    });
  })();

  // Annotated code — hover/tap any .code-step line to render its explanation
  // in the sibling .code-explain-panel (id = block id + '-explain').
  (function initAnnotatedCode() {
    document.querySelectorAll('.annotated-code').forEach(block => {
      const panel = document.getElementById(block.id + '-explain');
      if (!panel) return;
      const steps = block.querySelectorAll('.code-step');

      function activate(step) {
        steps.forEach(s => s.classList.remove('active'));
        step.classList.add('active');
        const name = step.dataset.stepName || '';
        const explain = step.dataset.explain || '';
        panel.innerHTML =
          (name ? '<div class="code-explain-name">' + name + '</div>' : '') + explain;
      }

      steps.forEach(step => {
        step.setAttribute('tabindex', '0');
        step.addEventListener('mouseenter', () => activate(step));
        step.addEventListener('focusin', () => activate(step));
        step.addEventListener('click', () => activate(step));
      });
    });
  })();

  // Interactive architecture diagram — hover/tap a tool to highlight it, its
  // resource, and its connector, and explain the seam each attack breaks.
  (function initArchDiagram() {
    const root = document.getElementById('viz-architecture');
    if (!root) return;
    const detail = document.getElementById('arch-detail');
    const tools = root.querySelectorAll('.arch-tool');

    const TOOLS = {
      format_code: {
        res: 'arch-res-desc', arrow: 'arch-arrow-desc', vuln: true, tag: '§2', section: '#attack-1',
        does: 'Formats source code in the “MegaCorpAI” style.',
        reaches: 'Its description string is read from <code>tool_descriptions/format_code.txt</code> on disk at startup.',
        seam: 'That file is shipped to the LLM verbatim, with no integrity check — whoever can write it controls what the model is told the tool does.',
      },
      read_document: {
        res: 'arch-res-docs', arrow: 'arch-arrow-docs', vuln: true, tag: '§3', section: '#attack-2',
        does: 'Reads a file from the <code>data/documents/</code> sandbox.',
        reaches: 'The documents directory — and, via traversal, its sibling <code>data/.secrets/</code>.',
        seam: 'The prefix check runs <em>before</em> <code>.resolve()</code>, so <code>../.secrets/…</code> passes the gate, then lands outside the sandbox.',
      },
      db_query: {
        res: 'arch-res-db', arrow: 'arch-arrow-db', vuln: true, tag: '§4', section: '#attack-3',
        does: 'Runs one read-only <code>SELECT</code> against <code>megacorp.db</code>.',
        reaches: 'Every table the DB role owns — <code>customers</code>, <code>customer_pii</code>, <code>api_keys</code>, <code>financial_records</code>.',
        seam: '“Read-only” is not a confidentiality control. The docstring says “customer database”; the role behind it reaches everything.',
      },
      update_ticket: {
        res: 'arch-res-tickets', vuln: false,
        does: 'Stores or overwrites a ticket’s text.',
        reaches: 'The in-memory <code>TICKETS</code> store.',
      },
      list_tickets: {
        res: 'arch-res-tickets', vuln: false,
        does: 'Lists every stored ticket.',
        reaches: 'The in-memory <code>TICKETS</code> store.',
      },
      compile_sprint: {
        res: 'arch-res-tickets', vuln: false,
        does: 'Joins all tickets into one text blob.',
        reaches: 'The in-memory <code>TICKETS</code> store.',
      },
      render_report: {
        res: 'arch-res-tickets', arrow: 'arch-arrow-tickets', vuln: true, tag: '§5', section: '#attack-5',
        does: 'Renders the compiled sprint blob into a report.',
        reaches: 'The Jinja2 engine — on ticket text an attacker controls.',
        seam: 'It renders the blob with Jinja2 <em>unsandboxed</em>, so <code>{{ … }}</code> stored in a ticket gets evaluated. The bug is the chain: store → join → render.',
      },
    };

    function clear() {
      root.querySelectorAll('.arch-tool.active, .arch-res.active, .arch-arrow.active')
        .forEach(e => e.classList.remove('active'));
    }
    function show(g) {
      const t = TOOLS[g.dataset.tool];
      if (!t) return;
      clear();
      g.classList.add('active');
      const res = document.getElementById(t.res);
      if (res) res.classList.add('active');
      if (t.arrow) { const a = document.getElementById(t.arrow); if (a) a.classList.add('active'); }

      let html = '<div class="arch-detail-title">' + g.dataset.tool +
        (t.vuln ? ' <span class="arch-vuln-tag">planted bug · ' + t.tag + '</span>' : '') + '</div>';
      html += '<p><strong>Does:</strong> ' + t.does + '</p>';
      html += '<p><strong>Reaches:</strong> ' + t.reaches + '</p>';
      if (t.seam) {
        html += '<p><strong>The seam:</strong> ' + t.seam +
          ' <a href="' + t.section + '">' + t.tag + ' →</a></p>';
      } else {
        html += '<p>Benign on its own — but it feeds the §5 SSTI chain through <code>render_report</code>.</p>';
      }
      detail.innerHTML = html;
    }

    tools.forEach(g => {
      g.addEventListener('mouseenter', () => show(g));
      g.addEventListener('focusin', () => show(g));
      g.addEventListener('click', () => show(g));
    });
  })();

})();
