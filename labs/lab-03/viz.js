/* ============================================================
 * Lab 03 — viz.js (nanochat)
 *
 * Widgets:
 *   1. #viz-try-it    — five-phase pipeline timeline (clickable)
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
  // Widget 1 · nanochat pipeline timeline
  // ============================================================
  (function initPipeline() {
    const svg = document.getElementById('pipeline-svg');
    if (!svg) return;
    const detail = document.getElementById('pipeline-detail');

    const PHASES = [
      {
        id: 'tok', name: 'Tokenize', x: 20, tag: '~10 min',
        body: 'Train a <strong>BPE</strong> (byte-pair encoding) tokenizer on the raw text corpus. Script: <code>scripts/tok_train.py</code>. Output: <code>tokenizer.pkl</code> (32,768 entries in the default config; 8,192 for this lab). The tokenizer\'s job is to chop arbitrary text into the discrete units the model will operate on. <em>Why it comes first:</em> the embedding table\'s size depends on the vocabulary size, so you can\'t even define the model architecture until tokenization is decided.',
      },
      {
        id: 'pre', name: 'Pretrain', x: 160, tag: '~20 min – 3 h',
        body: 'Train the base GPT to predict the next token on raw text. Script: <code>scripts/base_train.py</code>. Output: <code>base_model.pt</code>. Dominates wall-clock — depth-4 on one A100 is ~12 min, depth-24 on 8×H100 is ~2 h. <em>What you get:</em> a model that completes sentences fluently but does not know what a chat is. It will continue any prompt for as long as you let it generate.',
      },
      {
        id: 'sft', name: 'SFT', x: 300, tag: '~15 min',
        body: '<strong>Supervised fine-tuning</strong> — continue training on chat-shaped data (alternating user/assistant turns with end-of-turn tokens). Script: <code>scripts/chat_sft.py</code>. Output: <code>sft_model.pt</code>. <em>What you get:</em> a chat model. The base model\'s language ability is preserved; on top of it the model learns the <em>shape</em> of a conversation — when to stop, when the other person\'s turn is.',
      },
      {
        id: 'rl', name: 'RL', x: 440, tag: '~30 min · optional',
        optional: true,
        body: '<strong>Reinforcement learning</strong> using <strong>GRPO</strong> (Group Relative Policy Optimization — DeepSeek-popularized, no separate reward model required). Script: <code>scripts/chat_rl.py</code>. Output: <code>rl_model.pt</code>. <em>What you get:</em> better answers on reasoning tasks (GSM8K, ARC). Optional for the lab; the assignment can skip RL and still get a working chat.',
      },
      {
        id: 'chat', name: 'Chat', x: 580, tag: '~5 sec to start',
        body: 'Serve the final model behind a small Flask web UI. Script: <code>scripts/chat_web.py</code>. Default port: 8000. <em>What you get:</em> a URL with a ChatGPT-style interface pointing at <em>your</em> model. Combined with Code Server\'s port forwarding, your laptop\'s browser talks to a model running on Rivanna.',
      },
    ];

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Phase band
    el('rect', { class: 'phase-band', x: 10, y: 90, width: 700, height: 60, rx: 30 }, svg);

    PHASES.forEach((p, i) => {
      // Connector arrow to next
      if (i < PHASES.length - 1) {
        const x1 = p.x + 105, x2 = PHASES[i + 1].x + 5;
        el('line', { class: 'phase-arrow', x1, y1: 120, x2, y2: 120 }, svg);
      }
      // Chip
      const chip = el('rect', {
        class: 'phase-chip' + (p.optional ? ' optional' : ''),
        'data-phase': p.id,
        x: p.x, y: 95, width: 110, height: 50, rx: 8,
      }, svg);
      el('text', { class: 'phase-num',  x: p.x + 55, y: 110 }, svg, '0' + (i + 1));
      el('text', { class: 'phase-name', x: p.x + 55, y: 132 }, svg, p.name);

      // Time tag below the chip
      el('text', { class: 'phase-tag', x: p.x + 55, y: 168 }, svg, p.tag);

      chip.addEventListener('click',      () => activate(p.id));
      chip.addEventListener('mouseenter', () => activate(p.id, true));
    });

    el('text', { class: 'phase-tag', x: 360, y: 215 }, svg, 'one pipeline · artifacts compound · final output is a chat URL');

    function activate(id /*, transient*/) {
      const p = PHASES.find(p => p.id === id);
      if (!p) return;
      svg.querySelectorAll('.phase-chip').forEach(c =>
        c.classList.toggle('active', c.getAttribute('data-phase') === id)
      );
      detail.innerHTML =
        '<div class="phase-detail-title">' + p.name.toLowerCase() +
        (p.optional ? ' · optional' : '') + ' · ' + p.tag + '</div>' +
        '<div>' + p.body + '</div>';
    }

    activate('tok');
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
      'nanochat': {
        title: 'nanochat',
        body:
          '<p>Andrej Karpathy\'s 2025 MIT-licensed repository that takes you from raw text to a working chat model in one shell script. Built as the conceptual successor to <a href="https://github.com/karpathy/nanoGPT">nanoGPT</a> — same minimalism, plus the SFT/RL stages and a web UI on top.</p>' +
          '<p>The famous claim: trains a GPT-2-grade model on 8×H100 in ~3 hours for roughly $100 of compute. The educational point: every stage of the ChatGPT pipeline fits in ~2,000 lines of readable Python with no configuration framework. <a href="https://github.com/karpathy/nanochat">github.com/karpathy/nanochat</a>.</p>',
      },
      'rivanna-afton': {
        title: 'Rivanna / Afton',
        body:
          '<p>UVA\'s two HPC clusters, operated jointly by Research Computing. <strong>Rivanna</strong> is the older, broader system (CPUs, older GPUs, large-memory nodes); <strong>Afton</strong> is the newer GPU-heavy expansion (A100, H100, MIG-sliced cards).</p>' +
          '<p>From a user\'s standpoint they\'re one cluster: same scheduler (SLURM), same storage (<code>/home</code>, <code>/scratch</code>, <code>/project</code>), same front door at <a href="https://ood.hpc.virginia.edu">ood.hpc.virginia.edu</a>. You request a partition (Interactive / Standard / GPU / GPU-MIG) and the scheduler picks the right physical node. Docs: <a href="https://www.rc.virginia.edu/userinfo/hpc/">rc.virginia.edu/userinfo/hpc</a>.</p>',
      },
      'slurm': {
        title: 'SLURM',
        body:
          '<p><strong>S</strong>imple <strong>L</strong>inux <strong>U</strong>tility for <strong>R</strong>esource <strong>M</strong>anagement — the queue scheduler running on most academic HPC clusters, including Rivanna/Afton. Your job describes what it needs (CPUs, memory, GPUs, wall time); SLURM finds a node that has it and runs the job when it\'s available.</p>' +
          '<p>You almost never write <code>sbatch</code> scripts in this lab — Open OnDemand wraps the SLURM commands behind a web form. Worth knowing the basics anyway: <code>squeue -u $USER</code> (your jobs), <code>scancel $JOBID</code> (kill a job), <code>sinfo</code> (cluster status).</p>',
      },
      'ood': {
        title: 'Open OnDemand',
        body:
          '<p>An open-source web portal that fronts HPC clusters with a friendlier UI than ssh + sbatch. Originally from Ohio Supercomputer Center; now deployed at most major US academic clusters including UVA\'s <a href="https://ood.hpc.virginia.edu">ood.hpc.virginia.edu</a>.</p>' +
          '<p>You sign in with your institutional credentials, pick an app (Desktop, JupyterLab, RStudio, Code Server, terminal), configure resources, and OOD submits the SLURM job for you. Once running, it provides an HTTPS-tunneled connection to the app from your browser — no SSH client, no X-forwarding, no manual port management.</p>',
      },
      'bpe': {
        title: 'BPE · byte-pair encoding',
        body:
          '<p>The tokenization algorithm used by GPT-2, GPT-3, GPT-4, Claude, Llama, and nanochat. Idea: start with one token per byte. Count the most-frequent adjacent pair across the corpus. Merge them into a new token. Repeat until you have the desired vocabulary size.</p>' +
          '<p>The result is a tokenizer where common words and morphemes get single tokens, rare words decompose into pieces, and any string in any language is representable. nanochat uses a tiktoken-compatible BPE implementation; the default vocab is 32,768 (we use 8,192 in this lab\'s scaled-down run).</p>',
      },
      'depth': {
        title: 'depth (the dial)',
        body:
          '<p>nanochat\'s single complexity knob — the number of transformer layers in the model. Setting <code>--depth N</code> automatically configures every other hyperparameter: hidden width, attention head count, learning rate, total training steps, weight decay. The design philosophy is "you should have to think about exactly one number."</p>' +
          '<p>Roughly: depth 4 ≈ ~16M params (this lab), depth 6 ≈ ~40M, depth 12 ≈ ~200M, depth 20 ≈ 560M, depth 24 ≈ ~1.6B (GPT-2 capability), depth 30+ ≈ serious compute. The auto-scaling is calibrated against <a href="https://arxiv.org/abs/2203.15556">Chinchilla scaling laws</a> so each depth value is "compute-optimal" at its size.</p>',
      },
      'sft': {
        title: 'SFT · supervised fine-tuning',
        body:
          '<p>The middle phase of the ChatGPT-style pipeline. After pretraining produces a model that completes raw text, SFT continues training on <em>chat-formatted</em> data — multi-turn dialogues with explicit user/assistant markers and end-of-turn tokens.</p>' +
          '<p>The base model already knows English from pretraining. SFT teaches it the <em>shape</em> of a conversation: when to stop, when the user\'s turn is, what an assistant answer looks like. Tiny compared to pretraining (minutes, not hours) but the qualitative leap is dramatic — a base model rambles; an SFT model converses.</p>',
      },
      'grpo': {
        title: 'GRPO · Group Relative Policy Optimization',
        body:
          '<p>The RL algorithm DeepSeek-V2 popularized in 2024 and that nanochat uses for its optional reinforcement-learning phase. Variant of PPO that avoids the need for a separate reward model — it estimates relative goodness within a group of sampled completions per prompt, then optimizes the policy to favor the relatively-better ones.</p>' +
          '<p>Cheaper than full RLHF (there\'s no reward model to train) and, on long-context tasks, more stable than <strong>DPO</strong> (<a href="https://arxiv.org/abs/2305.18290">Direct Preference Optimization</a>, Rafailov et al. 2023) — the other popular reward-model-free method, which optimizes directly on pairs of preferred/rejected responses. Together they make GRPO the algorithm of choice for current open-source chat models. Paper: <a href="https://arxiv.org/abs/2402.03300">DeepSeekMath: Pushing the Limits of Mathematical Reasoning</a>.</p>',
      },
      'core-metric': {
        title: 'CORE',
        body:
          '<p>The benchmark nanochat tracks on its leaderboard. Defined in <a href="https://arxiv.org/abs/2406.11794">the DCLM paper</a> (DataComp-LM, 2024): centered accuracy across 22 in-context-learning tasks (HellaSwag, ARC-Challenge, MMLU subsets, et al.). A single scalar that summarizes "how good is this base model at language understanding without any chat-specific training."</p>' +
          '<p>GPT-2 scores 0.256525 on CORE. nanochat\'s headline goal is to beat that score under $100 of compute. At depth 4 (this lab\'s scale) CORE isn\'t meaningful — the model is too small. At depth 16+ the metric starts to be informative.</p>',
      },
      'port-forwarding': {
        title: 'port forwarding',
        body:
          '<p>The technique of routing network traffic from a port on one machine through a tunnel to a port on another. Classic SSH usage: <code>ssh -L 8000:localhost:8000 user@remote</code> — traffic to <code>localhost:8000</code> on your laptop is forwarded over the SSH connection to port 8000 on the remote.</p>' +
          '<p>Code Server (the app you use in this lab) does this automatically via its <strong>Ports</strong> panel — click "Forward a Port", enter the port number, get a URL on your laptop\'s <code>localhost</code> that proxies to the same port on the Rivanna compute node. Underneath: an HTTPS tunnel through the OOD reverse proxy. You never see the SSH machinery.</p>',
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

  // ============================================================
  // Widget 3 · BPE merge stepper
  // ============================================================
  (function initBPE() {
    const root = document.getElementById('viz-bpe');
    if (!root) return;

    const INITIAL = [
      { word: 'the',     count: 5 },
      { word: 'they',    count: 3 },
      { word: 'then',    count: 4 },
      { word: 'this',    count: 2 },
      { word: 'running', count: 3 },
      { word: 'singing', count: 3 },
    ];

    const SEP = '';
    let state;

    function freshState() {
      const words = INITIAL.map(w => ({ tokens: w.word.split(''), count: w.count }));
      const vocab = new Set();
      for (const w of words) for (const t of w.tokens) vocab.add(t);
      return { words, vocab, mergeCount: 0, newToken: null };
    }

    function computePairs() {
      const pairs = new Map();
      for (const w of state.words) {
        for (let i = 0; i < w.tokens.length - 1; i++) {
          const key = w.tokens[i] + SEP + w.tokens[i + 1];
          pairs.set(key, (pairs.get(key) || 0) + w.count);
        }
      }
      return pairs;
    }

    function findWinner(pairs) {
      let best = null;
      for (const [key, count] of pairs) {
        const idx = key.indexOf(SEP);
        const a = key.slice(0, idx);
        const b = key.slice(idx + 1);
        const merged = a + b;
        if (!best || count > best.count || (count === best.count && merged < best.merged)) {
          best = { a, b, merged, count };
        }
      }
      return best;
    }

    function doMerge(pair) {
      for (const w of state.words) {
        const out = [];
        let i = 0;
        while (i < w.tokens.length) {
          if (i < w.tokens.length - 1 && w.tokens[i] === pair.a && w.tokens[i + 1] === pair.b) {
            out.push(pair.merged);
            i += 2;
          } else {
            out.push(w.tokens[i]);
            i += 1;
          }
        }
        w.tokens = out;
      }
      state.vocab.add(pair.merged);
      state.mergeCount += 1;
      state.newToken = pair.merged;
    }

    function step() {
      const pairs = computePairs();
      if (!pairs.size) return false;
      const winner = findWinner(pairs);
      if (!winner) return false;
      doMerge(winner);
      return true;
    }

    function stepN(n) {
      let any = false;
      for (let i = 0; i < n; i++) {
        if (step()) any = true; else break;
      }
      if (any) render();
    }

    function reset() {
      state = freshState();
      render();
    }

    const corpusEl     = document.getElementById('bpe-corpus');
    const pairsEl      = document.getElementById('bpe-pairs-table');
    const vocabEl      = document.getElementById('bpe-vocab');
    const vocabCountEl = document.getElementById('bpe-vocab-count');
    const mergeCountEl = document.getElementById('bpe-merge-count');

    function render() {
      const pairs = computePairs();
      const upcoming = pairs.size ? findWinner(pairs) : null;

      // corpus
      corpusEl.innerHTML = '';
      for (const w of state.words) {
        const row = document.createElement('div');
        row.className = 'bpe-word';
        const c = document.createElement('span');
        c.className = 'bpe-word-count';
        c.textContent = '×' + w.count;
        row.appendChild(c);
        for (let i = 0; i < w.tokens.length; i++) {
          const t = w.tokens[i];
          const chip = document.createElement('span');
          chip.className = 'bpe-tok';
          chip.textContent = t;
          if (state.newToken && t === state.newToken) {
            chip.classList.add('bpe-tok-new');
          } else if (upcoming) {
            const isA = (t === upcoming.a && w.tokens[i + 1] === upcoming.b);
            const isB = (i > 0 && w.tokens[i - 1] === upcoming.a && t === upcoming.b);
            if (isA || isB) chip.classList.add('bpe-tok-pair');
          }
          row.appendChild(chip);
        }
        corpusEl.appendChild(row);
      }

      // pair-counts table
      const sorted = [...pairs.entries()]
        .map(([key, count]) => {
          const idx = key.indexOf(SEP);
          const a = key.slice(0, idx);
          const b = key.slice(idx + 1);
          return { a, b, merged: a + b, count };
        })
        .sort((x, y) => y.count - x.count || x.merged.localeCompare(y.merged))
        .slice(0, 6);
      pairsEl.innerHTML = '';
      if (!sorted.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.textContent = '— no more pairs to merge —';
        td.style.color = 'var(--ink-mute)';
        td.style.fontStyle = 'italic';
        tr.appendChild(td);
        pairsEl.appendChild(tr);
      }
      for (const p of sorted) {
        const tr = document.createElement('tr');
        if (upcoming && p.a === upcoming.a && p.b === upcoming.b) tr.className = 'bpe-pair-winner';
        const td1 = document.createElement('td');
        td1.innerHTML = '<code>' + p.a + '</code>&nbsp;+&nbsp;<code>' + p.b + '</code>&nbsp;→&nbsp;<code>' + p.merged + '</code>';
        const td2 = document.createElement('td');
        td2.textContent = p.count;
        tr.appendChild(td1);
        tr.appendChild(td2);
        pairsEl.appendChild(tr);
      }

      // vocab
      vocabEl.innerHTML = '';
      const vocabArr = [...state.vocab].sort((a, b) => a.length - b.length || a.localeCompare(b));
      for (const t of vocabArr) {
        const chip = document.createElement('span');
        chip.className = 'bpe-tok';
        if (t === state.newToken) chip.classList.add('bpe-tok-new');
        chip.textContent = t;
        vocabEl.appendChild(chip);
      }
      vocabCountEl.textContent = state.vocab.size;
      mergeCountEl.textContent = state.mergeCount;
    }

    document.getElementById('bpe-step').addEventListener('click', () => { if (step()) render(); });
    document.getElementById('bpe-step5').addEventListener('click', () => stepN(5));
    document.getElementById('bpe-reset').addEventListener('click', reset);

    state = freshState();
    render();
  })();

  // ============================================================
  // Widget 4 · SFT base-vs-finetuned side-by-side
  // ============================================================
  (function initSFT() {
    const root = document.getElementById('viz-sft');
    if (!root) return;

    // Each example: prompt, the canned base & SFT completions as token arrays,
    // and a short one-line failure tag for each side.
    // Tokens beginning with '<|' are rendered as special-token chips.
    const TOK_END = '<|end_of_turn|>';
    const TOK_USR = '<|user|>';
    const TOK_AST = '<|assistant|>';

    function toks(...parts) {
      // Helper: split a mix of strings and special tokens into a flat array.
      // Whitespace strings preserved; non-special strings split into word tokens.
      const out = [];
      for (const p of parts) {
        if (p.startsWith('<|') && p.endsWith('|>')) { out.push(p); continue; }
        // Split into word + trailing-whitespace chunks so we can stream word-by-word.
        const re = /\S+\s*|\s+/g;
        let m;
        while ((m = re.exec(p)) !== null) out.push(m[0]);
      }
      return out;
    }

    const EXAMPLES = [
      {
        caption: 'asks a question',
        prompt: 'What is the capital of France?',
        base: toks(
          'The ', 'capital ', 'of ', 'France ', 'is ', 'Paris. ',
          'The ', 'capital ', 'of ', 'Germany ', 'is ', 'Berlin. ',
          'The ', 'capital ', 'of ', 'Spain ', 'is ', 'Madrid. ',
          'The ', 'capital ', 'of ', 'Italy ', 'is ', 'Rome. ',
          'The ', 'capital ', 'of ', '…'
        ),
        baseDrift: 'drifts: keeps the "capital of X is Y" pattern instead of stopping',
        sft: toks(
          'The ', 'capital ', 'of ', 'France ', 'is ', 'Paris.', TOK_END
        ),
        sftGood: 'one clean sentence + end-of-turn token',
      },
      {
        caption: 'asks for help',
        prompt: 'Can you help me write a Python function to reverse a string?',
        base: toks(
          'Can ', 'you ', 'help ', 'me ', 'write ', 'a ', 'Python ', 'function ', 'to ', 'reverse ', 'a ', 'string?\n',
          'Can ', 'you ', 'help ', 'me ', 'write ', 'a ', 'Python ', 'function ', 'to ', 'sort ', 'a ', 'list?\n',
          'Can ', 'you ', 'help ', 'me ', 'write ', '…'
        ),
        baseDrift: 'echoes the prompt format instead of answering — it has only ever continued patterns',
        sft: toks(
          'Sure! ', 'Here\'s ', 'one ', 'way:\n\n',
          'def ', 'reverse(s):\n',
          '    ', 'return ', 's[::-1]\n', TOK_END
        ),
        sftGood: 'recognized the request, answered, then stopped',
      },
      {
        caption: 'open-ended chat',
        prompt: 'Hello!',
        base: toks(
          'Hello! ', 'Welcome ', 'to ', 'our ', 'website. ',
          'Sign ', 'up ', 'for ', 'our ', 'newsletter ', 'and ', 'get ', '10% ', 'off ', 'your ', 'first ', 'order. ',
          'Free ', 'shipping ', 'on ', 'orders ', 'over ', '$50. ', '…'
        ),
        baseDrift: 'the word "Hello!" most often appears on marketing pages — so it continues like one',
        sft: toks(
          'Hi! ', 'How ', 'can ', 'I ', 'help ', 'you ', 'today?', TOK_END
        ),
        sftGood: 'adopts the helpful-assistant persona from the SFT dialogues',
      },
      {
        caption: 'a math problem',
        prompt: 'If a train leaves at 3 PM and travels at 60 mph for 2 hours, what time does it arrive?',
        base: toks(
          'If ', 'a ', 'train ', 'leaves ', 'at ', '3 ', 'PM ', 'and ', 'travels ', 'at ', '60 ', 'mph ', 'for ', '2 ', 'hours, ', 'what ', 'time ', 'does ', 'it ', 'arrive?\n',
          'a) ', '4 ', 'PM   ', 'b) ', '5 ', 'PM   ', 'c) ', '6 ', 'PM   ', 'd) ', '7 ', 'PM\n',
          'Answer: ', '…'
        ),
        baseDrift: 'pattern-matches to a homework-worksheet format it has seen on the web',
        sft: toks(
          'It ', 'arrives ', 'at ', '5 ', 'PM.', TOK_END
        ),
        sftGood: 'answers the question directly, no padding',
      },
    ];

    const promptEl   = document.getElementById('sft-prompt');
    const baseEl     = document.getElementById('sft-stream-base');
    const sftEl      = document.getElementById('sft-stream-sft');
    const baseFailEl = document.getElementById('sft-failure-base');
    const sftFailEl  = document.getElementById('sft-failure-sft');
    const numEl      = document.getElementById('sft-example-num');
    const totalEl    = document.getElementById('sft-example-total');
    const captionEl  = document.getElementById('sft-caption-mini');
    const playBtn    = document.getElementById('sft-play');
    const resetBtn   = document.getElementById('sft-reset');
    const prevBtn    = document.getElementById('sft-prev');
    const nextBtn    = document.getElementById('sft-next');

    totalEl.textContent = EXAMPLES.length;

    let exampleIdx = 0;
    let timers = [];
    let playing = false;

    function clearTimers() {
      for (const t of timers) clearTimeout(t);
      timers = [];
    }

    function renderToken(t, container) {
      if (t.startsWith('<|') && t.endsWith('|>')) {
        const chip = document.createElement('span');
        chip.className = 'sft-special' + (t === TOK_END ? ' sft-special-end' : '');
        chip.textContent = t;
        container.appendChild(chip);
        return chip;
      }
      const span = document.createElement('span');
      span.className = 'sft-tok';
      span.textContent = t;
      container.appendChild(span);
      return span;
    }

    function showPrompt() {
      const ex = EXAMPLES[exampleIdx];
      promptEl.innerHTML = '';
      // Render prompt with the SFT-format wrapper around it so students see what the SFT model "saw".
      renderToken(TOK_USR, promptEl);
      promptEl.appendChild(document.createTextNode(' '));
      const text = document.createElement('span');
      text.textContent = ex.prompt;
      promptEl.appendChild(text);
      promptEl.appendChild(document.createTextNode(' '));
      renderToken(TOK_END, promptEl);
      promptEl.appendChild(document.createTextNode(' '));
      renderToken(TOK_AST, promptEl);
    }

    function resetStreams() {
      clearTimers();
      playing = false;
      playBtn.textContent = '▶ Play';
      baseEl.innerHTML = '';
      sftEl.innerHTML = '';
      baseFailEl.textContent = '';
      sftFailEl.textContent  = '';
    }

    function loadExample() {
      resetStreams();
      const ex = EXAMPLES[exampleIdx];
      numEl.textContent = exampleIdx + 1;
      captionEl.textContent = ex.caption;
      showPrompt();
    }

    function streamInto(container, tokens, perTokenMs, onDone) {
      const startedAt = Date.now();
      tokens.forEach((tok, i) => {
        const id = setTimeout(() => {
          const node = renderToken(tok, container);
          node.classList.add('sft-tok-new');
          setTimeout(() => node.classList.remove('sft-tok-new'), 350);
          // auto-scroll if needed
          container.scrollTop = container.scrollHeight;
          if (i === tokens.length - 1 && onDone) onDone();
        }, i * perTokenMs);
        timers.push(id);
      });
    }

    function play() {
      if (playing) return;
      playing = true;
      playBtn.textContent = '■ Stop';
      const ex = EXAMPLES[exampleIdx];
      baseEl.innerHTML = '';
      sftEl.innerHTML = '';
      baseFailEl.textContent = '';
      sftFailEl.textContent  = '';
      const ms = 110;
      // both streams run in parallel (start at t=0)
      streamInto(baseEl, ex.base, ms, () => {
        baseFailEl.textContent = '↯ ' + ex.baseDrift;
      });
      streamInto(sftEl, ex.sft, ms, () => {
        sftFailEl.textContent = '✓ ' + ex.sftGood;
        // mark playback complete when the longer stream finishes
        const totalMs = Math.max(ex.base.length, ex.sft.length) * ms + 50;
        const lastId = setTimeout(() => {
          playing = false;
          playBtn.textContent = '▶ Play';
        }, totalMs - ex.sft.length * ms);
        timers.push(lastId);
      });
      // safety: also flip the button back when the longer stream finishes
      const totalMs = Math.max(ex.base.length, ex.sft.length) * ms + 100;
      const stopId = setTimeout(() => {
        playing = false;
        playBtn.textContent = '▶ Play';
      }, totalMs);
      timers.push(stopId);
    }

    function stop() {
      clearTimers();
      playing = false;
      playBtn.textContent = '▶ Play';
    }

    playBtn.addEventListener('click', () => { if (playing) stop(); else play(); });
    resetBtn.addEventListener('click', () => { resetStreams(); });
    prevBtn.addEventListener('click', () => {
      exampleIdx = (exampleIdx - 1 + EXAMPLES.length) % EXAMPLES.length;
      loadExample();
    });
    nextBtn.addEventListener('click', () => {
      exampleIdx = (exampleIdx + 1) % EXAMPLES.length;
      loadExample();
    });

    loadExample();
  })();

  // ============================================================
  // Widget 5 · GRPO one-step diagram
  // ============================================================
  (function initGRPO() {
    const root = document.getElementById('viz-grpo');
    if (!root) return;

    // Each example has a prompt, a task-type tag, and 2–3 candidate
    // "groups" of 4 completions. Each completion has text + reward.
    // Re-sample cycles through the groups so students see that
    // sampling the model again gives a different mix.
    const EXAMPLES = [
      {
        task: 'math · verifiable answer',
        prompt: 'What is 13 × 7? Answer with the number only.',
        truth: 91,
        groups: [
          [
            { text: '13 × 7 = 91. The answer is 91.', reward: 1 },
            { text: 'I think it is 92.',               reward: 0 },
            { text: '91',                              reward: 1 },
            { text: 'Let me calculate: 10×7 = 70, plus 3×7 = 21, so 91.', reward: 1 },
          ],
          [
            { text: '13 times 7 is 81.',               reward: 0 },
            { text: 'The answer is 91.',               reward: 1 },
            { text: '13 × 7 = 91',                     reward: 1 },
            { text: 'Hmm, around 90 something. Maybe 93?', reward: 0 },
          ],
          [
            { text: '7 × 13 = 91.',                    reward: 1 },
            { text: '91.',                             reward: 1 },
            { text: '91.',                             reward: 1 },
            { text: '91.',                             reward: 1 },
          ],
        ],
      },
      {
        task: 'code · run the tests',
        prompt: 'Write a Python function that returns the sum of two integers.',
        truth: 'tests pass',
        groups: [
          [
            { text: 'def add(a, b):\n    return a + b',            reward: 1 },
            { text: 'def add(a, b):\n    return a - b',            reward: 0 },
            { text: 'def add(a, b):\n    return a + b',            reward: 1 },
            { text: 'def sum(a, b):\n    return a*b',              reward: 0 },
          ],
          [
            { text: 'def add(a, b):\n    return int(a) + int(b)',  reward: 1 },
            { text: 'def add(a, b):\n    return a + b',            reward: 1 },
            { text: 'add = lambda a, b: a + b',                    reward: 1 },
            { text: 'def add(a,b): return a*b',                    reward: 0 },
          ],
        ],
      },
      {
        task: 'word problem · GSM8K-style',
        prompt: 'A train leaves at 3 PM and travels at 60 mph for 2 hours. What time does it arrive?',
        truth: '5 PM',
        groups: [
          [
            { text: '60 × 2 = 120 miles. It arrives at 5 PM.',  reward: 1 },
            { text: 'It arrives at 4 PM.',                      reward: 0 },
            { text: 'The train arrives at 5 PM.',               reward: 1 },
            { text: '2 hours after 3 PM is 5 PM.',              reward: 1 },
          ],
          [
            { text: 'I think 6 PM.',                            reward: 0 },
            { text: '3 + 2 = 5, so 5 PM.',                      reward: 1 },
            { text: 'About 7 PM probably.',                     reward: 0 },
            { text: '5 PM.',                                    reward: 1 },
          ],
        ],
      },
      {
        task: 'format · follow the schema',
        prompt: 'Reply with JSON: {"city": ..., "country": ...} for Paris.',
        truth: 'valid JSON, correct keys',
        groups: [
          [
            { text: '{"city": "Paris", "country": "France"}',   reward: 1 },
            { text: 'Paris is in France.',                      reward: 0 },
            { text: '{"city": "Paris", "country": "France"}',   reward: 1 },
            { text: '{ city: Paris, country: France }',         reward: 0 },
          ],
          [
            { text: '{"city": "Paris", "country": "France"}',   reward: 1 },
            { text: '{"city":"Paris","country":"France"}',      reward: 1 },
            { text: '{"name": "Paris"}',                        reward: 0 },
            { text: '{"city": "Paris", "country": "France"}',   reward: 1 },
          ],
        ],
      },
    ];

    const promptEl   = document.getElementById('grpo-prompt');
    const gridEl     = document.getElementById('grpo-grid');
    const summaryEl  = document.getElementById('grpo-summary');
    const numEl      = document.getElementById('grpo-example-num');
    const totalEl    = document.getElementById('grpo-example-total');
    const tagEl      = document.getElementById('grpo-task-tag');
    const sampleBtn  = document.getElementById('grpo-sample');
    const prevBtn    = document.getElementById('grpo-prev');
    const nextBtn    = document.getElementById('grpo-next');

    totalEl.textContent = EXAMPLES.length;

    let exampleIdx = 0;
    let groupIdx   = 0;

    function compute(group) {
      const rewards = group.map(c => c.reward);
      const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
      const variance = rewards.reduce((a, b) => a + (b - mean) ** 2, 0) / rewards.length;
      const std = Math.sqrt(variance);
      const advantages = rewards.map(r => std > 1e-9 ? (r - mean) / std : 0);
      return { mean, std, advantages };
    }

    function render() {
      const ex = EXAMPLES[exampleIdx];
      const group = ex.groups[groupIdx % ex.groups.length];
      const { mean, std, advantages } = compute(group);

      numEl.textContent = exampleIdx + 1;
      tagEl.textContent = ex.task;
      promptEl.textContent = ex.prompt;

      // Find the max |advantage| so we can size the bars proportionally.
      const maxAbs = Math.max(0.01, ...advantages.map(Math.abs));

      gridEl.innerHTML = '';
      group.forEach((c, i) => {
        const adv = advantages[i];
        const isPos = adv > 0.01;
        const isNeg = adv < -0.01;
        const card = document.createElement('div');
        card.className = 'grpo-card' + (isPos ? ' grpo-pos' : isNeg ? ' grpo-neg' : '');

        const head = document.createElement('div');
        head.className = 'grpo-card-head';
        const no = document.createElement('span');
        no.className = 'grpo-sample-no';
        no.textContent = 'sample ' + (i + 1);
        const reward = document.createElement('span');
        reward.className = 'grpo-reward ' + (c.reward >= 1 ? 'grpo-reward-pass' : c.reward <= 0 ? 'grpo-reward-fail' : '');
        reward.textContent = (c.reward >= 1 ? '✓ ' : c.reward <= 0 ? '✗ ' : '· ') + 'reward = ' + c.reward.toFixed(1);
        head.appendChild(no);
        head.appendChild(reward);
        card.appendChild(head);

        const text = document.createElement('div');
        text.className = 'grpo-completion';
        text.textContent = c.text;
        card.appendChild(text);

        const advRow = document.createElement('div');
        advRow.className = 'grpo-advantage-row';
        const label = document.createElement('span');
        label.textContent = 'advantage';
        const bar = document.createElement('div');
        bar.className = 'grpo-adv-bar';
        const fill = document.createElement('div');
        const pct = Math.min(50, Math.abs(adv) / maxAbs * 50);
        fill.className = 'grpo-adv-fill' + (isNeg ? ' grpo-neg-fill' : '');
        if (isPos) {
          fill.style.left = '50%';
          fill.style.width = pct + '%';
        } else if (isNeg) {
          fill.style.right = '50%';
          fill.style.width = pct + '%';
        } else {
          fill.style.width = '0';
        }
        bar.appendChild(fill);
        const num = document.createElement('span');
        num.className = 'grpo-adv-num ' + (isPos ? 'grpo-pos-num' : isNeg ? 'grpo-neg-num' : '');
        num.textContent = (adv >= 0 ? '+' : '') + adv.toFixed(2);
        advRow.appendChild(label);
        advRow.appendChild(bar);
        advRow.appendChild(num);
        card.appendChild(advRow);

        const verdict = document.createElement('div');
        verdict.className = 'grpo-verdict ' + (isPos ? 'grpo-pos' : isNeg ? 'grpo-neg' : '');
        verdict.textContent = isPos ? '↑ reinforced — make this kind of output more likely'
                              : isNeg ? '↓ suppressed — make this kind of output less likely'
                              : '· neutral — same reward as the group';
        card.appendChild(verdict);

        gridEl.appendChild(card);
      });

      summaryEl.innerHTML = '';
      const kv = (label, value) => {
        const span = document.createElement('span');
        span.className = 'grpo-summary-kv';
        span.innerHTML = label + '<strong>' + value + '</strong>';
        return span;
      };
      summaryEl.appendChild(kv('group mean reward', mean.toFixed(2)));
      summaryEl.appendChild(kv('group std', std.toFixed(2)));
      summaryEl.appendChild(kv('ground truth', '<code>' + ex.truth + '</code>'));
      summaryEl.appendChild(kv('formula', 'advantageᵢ = (rᵢ − mean) / std'));
    }

    sampleBtn.addEventListener('click', () => {
      const n = EXAMPLES[exampleIdx].groups.length;
      groupIdx = (groupIdx + 1) % n;
      render();
    });
    prevBtn.addEventListener('click', () => {
      exampleIdx = (exampleIdx - 1 + EXAMPLES.length) % EXAMPLES.length;
      groupIdx = 0;
      render();
    });
    nextBtn.addEventListener('click', () => {
      exampleIdx = (exampleIdx + 1) % EXAMPLES.length;
      groupIdx = 0;
      render();
    });

    render();
  })();

  /* ============================================================
   *  #viz-residual — what a residual position is, made visible,
   *  via the "scorecard for every word" analogy. Three panels:
   *   1. One word's scorecard — 16 labeled, hoverable blanks.
   *   2. Width explorer — drag d_model 16 → 1,280, watch it morph.
   *   3. Sequence stage — one card per word, micro vs nano toggle.
   * ============================================================ */
  (function initResidual() {
    const root = document.getElementById('viz-residual');
    if (!root) return;
    const stage = document.getElementById('rp-stage');
    if (!stage) return;

    /* ---------- the 16 labeled qualities ---------- */
    const LABELS = [
      { key: 'animal',   name: 'animal-ness',   hi: 'an animal',          lo: 'not an animal' },
      { key: 'plural',   name: 'plural?',       hi: 'many',               lo: 'just one' },
      { key: 'texture',  name: 'texture',       hi: 'soft / furry',       lo: 'hard / smooth' },
      { key: 'role',     name: 'sentence role', hi: 'the subject (doer)', lo: 'an object (acted on)' },
      { key: 'concrete', name: 'concreteness',  hi: 'a physical thing',   lo: 'an abstract idea' },
      { key: 'tense',    name: 'tense',         hi: 'past',               lo: 'present / none' },
      { key: 'tone',     name: 'tone',          hi: 'positive',           lo: 'negative' },
      { key: 'size',     name: 'size',          hi: 'big',                lo: 'small' },
      { key: 'name',     name: 'is-a-name?',    hi: 'a proper name',      lo: 'a common word' },
      { key: 'living',   name: 'living?',       hi: 'alive',              lo: 'inanimate' },
      { key: 'refers',   name: 'refers back?',  hi: 'points to an earlier word', lo: 'stands on its own' },
      { key: 'phrase',   name: 'phrase-start?', hi: 'begins a phrase',    lo: 'sits mid-phrase' },
      { key: 'food',     name: 'food-related',  hi: 'about food',         lo: 'nothing to do with food' },
      { key: 'freq',     name: 'frequency',     hi: 'a common word',      lo: 'a rare word' },
      { key: 'register', name: 'register',      hi: 'formal',             lo: 'casual' },
      { key: 'verb',     name: 'action / verb', hi: 'an action (verb)',   lo: 'a thing (noun)' },
    ];

    const WORDS = ['cat', 'dogs', 'ran', 'Paris', 'it', 'happily'];

    // A few hand-set scores so obvious qualities light up sensibly.
    const OVERRIDES = {
      cat:     { animal: 0.92, living: 0.9,  plural: -0.85, name: -0.8, verb: -0.85, concrete: 0.8 },
      dogs:    { animal: 0.88, living: 0.88, plural: 0.92,  name: -0.8, verb: -0.8,  concrete: 0.8 },
      ran:     { verb: 0.95,  tense: 0.9,   animal: -0.6,  living: -0.5, plural: -0.4, concrete: -0.6 },
      Paris:   { name: 0.95,  concrete: 0.6, animal: -0.7,  living: -0.6, plural: -0.6, verb: -0.8 },
      it:      { refers: 0.92, animal: -0.1, name: -0.7,    concrete: -0.3, plural: -0.3, verb: -0.7 },
      happily: { verb: -0.6,  tense: -0.4,  animal: -0.7,  concrete: -0.7, tone: 0.5,   register: -0.3 },
    };

    function hashStr(s) {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    }
    // Signed score in roughly [-1, 1] for (word, blank index).
    function scoreFor(word, i) {
      const o = OVERRIDES[word];
      if (o && LABELS[i] && o[LABELS[i].key] != null) return o[LABELS[i].key];
      const h = (hashStr(word) ^ Math.imul(i + 1, 2654435761)) >>> 0;
      return Math.round((((h % 2000) / 1000) - 1) * 100) / 100;
    }

    // Color: orange = positive, green = negative, cream = near-zero.
    function colorFor(v) {
      const a = Math.abs(v);
      if (a < 0.12) return { fill: '#f0eee5', stroke: '#cfcbbe' };
      if (v > 0) {
        return { fill: `rgb(${Math.round(253 - a * 30)},${Math.round(224 - a * 90)},${Math.round(210 - a * 80)})`, stroke: '#b14a2e' };
      }
      return { fill: `rgb(${Math.round(213 - a * 40)},${Math.round(230 - a * 30)},${Math.round(220 - a * 30)})`, stroke: '#588b6e' };
    }
    function fmtVal(v) { return (v >= 0 ? '+' : '') + v.toFixed(2); }

    /* ============================================================
     *  PANEL 1 · one word's scorecard
     * ============================================================ */
    const wordsEl   = document.getElementById('sc-words');
    const cardEl    = document.getElementById('sc-card');
    const readoutEl = document.getElementById('sc-readout');
    let activeWord = 'cat';

    function defaultReadout() {
      readoutEl.innerHTML = `
        <div class="sc-readout-tag">the card</div>
        <div class="sc-readout-text">Each row is one blank on <strong>${activeWord}</strong>'s card — one number microGPT stores for this word. <strong>Hover or tap a row</strong> to read what it measures. Pick another word above to watch all 16 blanks get re-scored.</div>`;
    }

    function showRow(i) {
      const L = LABELS[i];
      const v = scoreFor(activeWord, i);
      let lean;
      if (v > 0.12)       lean = `Leans toward <strong>${L.hi}</strong>.`;
      else if (v < -0.12) lean = `Leans toward <strong>${L.lo}</strong>.`;
      else                lean = `Sits in the middle — <strong>${L.hi}</strong> vs <strong>${L.lo}</strong> is roughly a toss-up.`;
      readoutEl.innerHTML = `
        <div class="sc-readout-tag">blank ${i + 1} · ${L.name}</div>
        <div class="sc-readout-text"><strong>${activeWord}</strong> scores <strong>${fmtVal(v)}</strong> here. ${lean}</div>`;
    }

    function renderCard() {
      cardEl.innerHTML = LABELS.map((L, i) => {
        const v = scoreFor(activeWord, i);
        const c = colorFor(v);
        const half = Math.min(Math.abs(v), 1) * 50;
        const fill = v >= 0
          ? `left:50%;width:${half}%;background:#b14a2e;`
          : `right:50%;width:${half}%;background:#588b6e;`;
        return `
          <div class="sc-row" data-i="${i}" tabindex="0">
            <span class="sc-row-i">${i + 1}</span>
            <span class="sc-dot" style="background:${c.fill};border-color:${c.stroke}"></span>
            <span class="sc-row-name">${L.name}</span>
            <span class="sc-bar"><span class="sc-bar-mid"></span><span class="sc-bar-fill" style="${fill}"></span></span>
            <span class="sc-row-val">${fmtVal(v)}</span>
          </div>`;
      }).join('');
      cardEl.querySelectorAll('.sc-row').forEach(row => {
        const i = +row.dataset.i;
        const on  = () => { cardEl.querySelectorAll('.sc-row').forEach(r => r.classList.remove('active')); row.classList.add('active'); showRow(i); };
        const off = () => { row.classList.remove('active'); defaultReadout(); };
        row.addEventListener('mouseenter', on);
        row.addEventListener('mouseleave', off);
        row.addEventListener('focus', on);
        row.addEventListener('blur', off);
      });
    }

    function renderWordChips() {
      wordsEl.innerHTML = WORDS.map(w =>
        `<button class="sc-chip${w === activeWord ? ' active' : ''}" data-w="${w}">${w}</button>`).join('');
      wordsEl.querySelectorAll('.sc-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          activeWord = btn.dataset.w;
          renderWordChips();
          renderCard();
          defaultReadout();
        });
      });
    }

    if (wordsEl && cardEl && readoutEl) {
      renderWordChips();
      renderCard();
      defaultReadout();
    }

    /* ============================================================
     *  PANEL 2 · width explorer (d_model 16 -> 1,280)
     * ============================================================ */
    const wSlider  = document.getElementById('sc-width-slider');
    const wCol     = document.getElementById('sc-width-col');
    const wReadout = document.getElementById('sc-width-readout');
    const wPool    = document.getElementById('sc-width-pool');

    const POOL = [
      'animal-ness', 'plural?', 'furry?', 'subject?', 'past-tense?', 'positive tone',
      'big / small', 'is-a-name?', 'alive?', 'refers-to-what?', 'phrase-start?',
      'food-related?', 'common word?', 'formal?', 'is-a-verb?', 'sarcasm?',
      'inside-a-quote?', 'rhymes-with?', 'question-word?', 'negation?', 'color word?',
      'number word?', 'time word?', 'place word?', 'emotion?', 'politeness?',
      'technical jargon?', 'slang?', 'first-person?', 'verb agreement?', 'possessive?',
      'comparative?', 'superlative?', 'metaphor?', 'idiom-part?', 'topic: science?',
      'topic: sports?', 'topic: law?', 'who is speaking?', 'sentence-start?',
    ];
    const LOG80 = Math.log(80);
    const dFromSlider = () => Math.round(16 * Math.exp((+wSlider.value / 1000) * LOG80));
    const sliderFromD = d => Math.round(1000 * Math.log(d / 16) / LOG80);

    function renderWidth(d) {
      const H = 250, W = 48;
      const drawn = Math.min(d, 130);
      const ch = H / drawn;
      let cells = '';
      for (let i = 0; i < drawn; i++) {
        const col = colorFor(scoreFor('cat', i));
        cells += `<div class="sc-wc-cell" style="height:${ch}px;background:${col.fill};border-color:${col.stroke}"></div>`;
      }
      wCol.style.width = W + 'px';
      wCol.style.height = H + 'px';
      wCol.innerHTML = cells;

      const name = d <= 16 ? 'microGPT' : (d >= 1280 ? 'nanochat' : 'between the two');
      const ratio = d / 16;
      const cmp = d <= 16
        ? 'the baseline card'
        : `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}x longer than microGPT's card`;
      wReadout.innerHTML = `
        <div class="sc-width-num">${d.toLocaleString()}</div>
        <div class="sc-width-unit">blanks per word</div>
        <div class="sc-width-name">${name}</div>
        <div class="sc-width-cmp">${cmp}</div>`;

      const shown = Math.min(d, POOL.length);
      const chips = POOL.slice(0, shown).map(q => `<span class="sc-pool-chip">${q}</span>`).join('');
      const more = d > POOL.length
        ? `<span class="sc-pool-more">+ ${(d - POOL.length).toLocaleString()} more the model fills in (no room to draw)</span>`
        : '';
      wPool.innerHTML = chips + more;
    }

    if (wSlider && wCol && wReadout && wPool) {
      wSlider.addEventListener('input', () => renderWidth(dFromSlider()));
      root.querySelectorAll('.sc-width-presets [data-w]').forEach(btn => {
        btn.addEventListener('click', () => {
          const d = +btn.dataset.w;
          wSlider.value = String(sliderFromD(d));
          renderWidth(d);
        });
      });
      renderWidth(16);
    }

    /* ============================================================
     *  PANEL 3 · one card per word, across the sentence
     * ============================================================ */
    const TOKENS = ['the', 'cat', 'sat', 'on', 'the', 'mat'];
    const MODES = {
      micro: {
        dModel: 16, cellR: 9, cellGap: 3, colWidth: 28,
        label: '16-blank cards · matches Lab 02',
        note: 'You could read all 16 numbers out loud. Six words x 16 blanks = the residual stream at this layer.',
      },
      nano: {
        dModel: 1280, cellsToDraw: 24, cellH: 6, cellGap: 1, colWidth: 28,
        label: '1,280-blank cards',
        note: 'Eighty times longer than microGPT — eighty times more independent ideas the model can record about each word.',
      },
    };
    let mode = 'micro';

    function renderCirclesCol(tokenIdx) {
      const m = MODES.micro;
      const svgH = 8 + m.dModel * (m.cellR * 2 + m.cellGap);
      let out = '';
      for (let i = 0; i < m.dModel; i++) {
        const cy = 8 + m.cellR + i * (m.cellR * 2 + m.cellGap);
        const c = colorFor(scoreFor(TOKENS[tokenIdx], i));
        out += `<circle cx="${m.colWidth / 2}" cy="${cy}" r="${m.cellR}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.4"/>`;
      }
      return `<svg viewBox="0 0 ${m.colWidth} ${svgH}" width="${m.colWidth}" height="${svgH}">${out}</svg>`;
    }

    function renderStripeCol(tokenIdx) {
      const m = MODES.nano;
      const half = m.cellsToDraw / 2;
      let cells = '';
      for (let i = 0; i < half; i++) {
        const c = colorFor(scoreFor(TOKENS[tokenIdx], i));
        cells += `<div class="rp-cell" style="width:${m.colWidth}px;height:${m.cellH}px;background:${c.fill};border-color:${c.stroke}"></div>`;
      }
      cells += `<div class="rp-cell-gap" style="width:${m.colWidth}px">⋮ <span class="rp-cell-gap-num">${m.dModel - m.cellsToDraw}</span> more ⋮</div>`;
      for (let i = half; i < m.cellsToDraw; i++) {
        const c = colorFor(scoreFor(TOKENS[tokenIdx], i + 1000));
        cells += `<div class="rp-cell" style="width:${m.colWidth}px;height:${m.cellH}px;background:${c.fill};border-color:${c.stroke}"></div>`;
      }
      return `<div class="rp-column" style="width:${m.colWidth}px">${cells}</div>`;
    }

    function renderStage() {
      const m = MODES[mode];
      const colInner = TOKENS.map((tok, ti) => `
          <div class="rp-column-wrap">
            ${mode === 'micro' ? renderCirclesCol(ti) : renderStripeCol(ti)}
            <div class="rp-token">${tok}</div>
          </div>`).join('');
      const colH = mode === 'micro'
        ? 8 + m.dModel * (m.cellR * 2 + m.cellGap)
        : m.cellsToDraw * (m.cellH + m.cellGap) + 22;
      stage.innerHTML = `
        <div class="rp-row">
          <div class="rp-axis" style="height:${colH}px" aria-label="d_model dimension">
            <span class="rp-axis-top">d_model</span>
            <span class="rp-axis-bot">${m.label}</span>
          </div>
          ${colInner}
        </div>
        <div class="rp-note">${m.note}</div>`;
      root.querySelectorAll('.rp-toggle button').forEach(b =>
        b.classList.toggle('active', b.dataset.rp === mode));
    }

    root.querySelectorAll('.rp-toggle button').forEach(b => {
      b.addEventListener('click', () => { mode = b.dataset.rp; renderStage(); });
    });
    renderStage();
  })();

  /* ============================================================
   *  .annotated-term — terminal-snippet variant of Lab 02's
   *  annotated-code pattern. Each <div class="term-step"> can carry
   *  data-step-name + data-explain; hovering any annotated line
   *  updates the .term-explain-panel below the block and highlights
   *  the row. Lines without data-explain are routine output and
   *  stay quiet.
   *
   *  Auto-discovers every block with class="annotated-term" on
   *  page load, so future blocks don't need extra wiring.
   * ============================================================ */
  (function initAnnotatedTerms() {
    document.querySelectorAll('.annotated-term').forEach(root => {
      const panel  = root.querySelector('.term-explain-panel');
      if (!panel) return;
      const tagEl  = panel.querySelector('.term-explain-tag');
      const textEl = panel.querySelector('.term-explain-text');
      if (!tagEl || !textEl) return;
      const defaultTag  = tagEl.textContent;
      const defaultText = textEl.innerHTML;

      root.querySelectorAll('.term-step[data-explain]').forEach(el => {
        function show() {
          el.classList.add('active');
          tagEl.textContent = el.dataset.stepName || '';
          textEl.innerHTML  = el.dataset.explain;
        }
        function hide() {
          el.classList.remove('active');
          tagEl.textContent = defaultTag;
          textEl.innerHTML  = defaultText;
        }
        el.addEventListener('mouseenter', show);
        el.addEventListener('mouseleave', hide);
        // Keyboard accessibility: each annotated line is focusable.
        el.tabIndex = 0;
        el.addEventListener('focus', show);
        el.addEventListener('blur',  hide);
      });
    });
  })();

})();


/* ============================================================
 * Widget · §6.2 · microGPT → nanochat scaling (#viz-scale)
 *   One dial (depth) drives layer count AND width (= 64 × depth).
 *   Parameter curve is calibrated to the lab's own anchors:
 *     ~40M @ depth 6, ~560M @ depth 20, ~840M @ depth 24 (≈ GPT-2).
 *   params(d) = 40e6 * (d/6)^2.2  — super-linear because width
 *   itself grows with depth, so each added layer is also wider.
 * ============================================================ */
(function initScale() {
  'use strict';
  const root = document.getElementById('viz-scale');
  if (!root) return;

  const NS = 'http://www.w3.org/2000/svg';
  function svg(name, attrs, parent, text) {
    const n = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  const MICRO = { layers: 1, width: 16, params: 4192 };   // Lab 02, fixed
  const widthOf  = d => 64 * d;
  const paramsOf = d => 40e6 * Math.pow(d / 6, 2.2);

  function fmt(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n < 1e10 ? 2 : 1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K';
    return String(Math.round(n));
  }
  function fmtX(r) {
    if (r >= 1e6) return (r / 1e6).toFixed(1) + 'M×';
    if (r >= 1e3) return (r / 1e3).toFixed(0) + 'K×';
    return Math.round(r) + '×';
  }

  const microSvg = document.getElementById('scale-micro-svg');
  const nanoSvg  = document.getElementById('scale-nano-svg');
  const slider   = document.getElementById('scale-depth');
  const depthOut = document.getElementById('scale-depth-out');
  const nanoSub  = document.getElementById('scale-nano-sub');
  const readout  = document.getElementById('scale-readout');
  const attnRow  = document.getElementById('scale-attn-row');
  const attnNote = document.getElementById('scale-attn-note');

  const pxW = w => 8 + 7 * Math.log2(w);   // log scale so 16 and 1,536 both fit

  function drawStack(target, layers, width, isMicro) {
    target.innerHTML = '';
    const vb = target.viewBox.baseVal;
    const cx = vb.width / 2;
    const bottom = 280, top = 30, gap = 3;
    let bh = (bottom - top - (layers - 1) * gap) / layers;
    bh = Math.max(4, Math.min(16, bh));
    const total = layers * bh + (layers - 1) * gap;
    const startY = bottom - total;
    const pw = pxW(width);
    svg('text', { x: cx, y: startY - 7, 'text-anchor': 'middle' }, target,
        layers + (layers > 1 ? ' layers' : ' layer'));
    for (let i = 0; i < layers; i++) {
      svg('rect', {
        x: cx - pw / 2, y: startY + i * (bh + gap), width: pw, height: bh,
        rx: 1.5, class: 'scale-block' + (isMicro ? ' scale-block-micro' : ''),
      }, target);
    }
    // width caliper under the stack
    svg('line', { x1: cx - pw / 2, y1: bottom + 8, x2: cx + pw / 2, y2: bottom + 8, class: 'scale-caliper' }, target);
    svg('line', { x1: cx - pw / 2, y1: bottom + 5, x2: cx - pw / 2, y2: bottom + 11, class: 'scale-caliper' }, target);
    svg('line', { x1: cx + pw / 2, y1: bottom + 5, x2: cx + pw / 2, y2: bottom + 11, class: 'scale-caliper' }, target);
    svg('text', { x: cx, y: bottom + 22, 'text-anchor': 'middle' }, target, 'width ' + width);
  }

  function renderReadout(d) {
    const w = widthOf(d);
    const rows = [
      ['', 'microGPT', 'nanochat', true],
      ['layers (depth)', String(MICRO.layers), String(d), false],
      ['width · d_model (numbers / token)', String(MICRO.width), String(w), false],
      ['Q / K / V matrix — each', MICRO.width + ' × ' + MICRO.width, w + ' × ' + w, false],
      ['total parameters', '~' + fmt(MICRO.params), '≈' + fmt(paramsOf(d)), false],
      ['vs. microGPT', '1×', fmtX(paramsOf(d) / MICRO.params), false],
    ];
    readout.innerHTML = '';
    rows.forEach(([label, micro, nano, isHead]) => {
      const base = isHead ? 'scale-rhead' : '';
      const add = (txt, extra) => {
        const div = document.createElement('div');
        div.className = (base + ' ' + (extra || '')).trim();
        div.innerHTML = txt;
        readout.appendChild(div);
      };
      add(label, isHead ? '' : 'scale-rlabel');
      add(micro, '');
      add(nano, isHead ? '' : 'scale-rnano');
    });
  }

  function renderAttn(d) {
    const w = widthOf(d);
    const side = Math.max(16, Math.min(140, w * 0.085));
    attnRow.innerHTML = '';
    ['Q', 'K', 'V'].forEach(name => {
      const item = document.createElement('div');
      item.className = 'scale-attn-item';
      const sq = document.createElement('div');
      sq.className = 'scale-mat';
      sq.style.width = side + 'px';
      sq.style.height = side + 'px';
      const lab = document.createElement('div');
      lab.className = 'scale-mat-label';
      lab.textContent = name;
      item.appendChild(sq);
      item.appendChild(lab);
      attnRow.appendChild(item);
    });
    const each = w * w, micro = MICRO.width * MICRO.width;
    attnNote.innerHTML =
      'Each square is <strong>d_model × d_model = ' + w + ' × ' + w + ' = ' + fmt(each) +
      ' weights</strong>. There are four per block (Q, K, V, and the output projection O) ≈ ' +
      fmt(4 * each) + ' weights — and that is just <em>one</em> of the ' + d + ' layers. ' +
      'microGPT\'s are ' + MICRO.width + ' × ' + MICRO.width + ' = ' + micro +
      ' each, about ' + Math.round(each / micro) + '× smaller. Double the width and every one of these squares quadruples — that is the square-law in the caption.';
  }

  function render() {
    const d = parseInt(slider.value, 10);
    depthOut.textContent = d;
    nanoSub.textContent = 'depth ' + d;
    drawStack(microSvg, MICRO.layers, MICRO.width, true);
    drawStack(nanoSvg, d, widthOf(d), false);
    renderReadout(d);
    renderAttn(d);
  }

  slider.addEventListener('input', render);
  root.querySelectorAll('.scale-presets [data-depth]').forEach(btn => {
    btn.addEventListener('click', () => { slider.value = btn.getAttribute('data-depth'); render(); });
  });
  render();
})();


/* ============================================================
 * Widget · §6.2 · anatomy of the pretraining command (#viz-cmd)
 *   Hover / focus / tap each part of the torchrun command to
 *   show what it does and what you'd change to scale up.
 * ============================================================ */
(function initCmd() {
  'use strict';
  const root = document.getElementById('viz-cmd');
  if (!root) return;
  const detail = document.getElementById('cmd-detail');
  const parts = root.querySelectorAll('.cmd-part');

  const EXPLAIN = {
    torchrun:
      '<strong>torchrun</strong> — PyTorch\'s distributed launcher. It starts one worker process per GPU and wires up the environment they use to coordinate (each worker\'s rank, the total world size, the address they sync through). On a single GPU it behaves almost like plain <code>python</code> — but using it now means this exact command also runs on 8 GPUs later, unchanged except for the next flag.',
    nproc:
      '<strong>--nproc_per_node=1</strong> — how many worker processes to launch on this machine, one per GPU. <code>=1</code> is single-GPU, which is what your Code Server session has. On a node with 8×H100 you\'d write <code>=8</code>; torchrun starts 8 copies that each take a slice of the batch and average their gradients together every step.',
    master_port:
      '<strong>--master_port=$MASTER_PORT</strong> — sets the network port torchrun uses for inter-process communication between GPU workers. On a shared cluster, multiple students\' jobs may land on the same node, so <em>everyone using the same port collides</em> — the second job dies with a cryptic "address already in use" error. <strong>Pick your own port:</strong> 29500 is just an example, so change it to any unused number (roughly 20000–60000), or derive a unique one from your username with <code>export MASTER_PORT=$(( ($(echo "$USER" | cksum | cut -d\' \' -f1) % 20000) + 20000 ))</code> (<code>$UID</code> is empty in some HPC shells, so hash <code>$USER</code> instead). If a port is taken, just bump the number and rerun.',
    module:
      '<strong>-m scripts.base_train</strong> — <code>-m</code> runs a module by its import path instead of a file path: Python imports <code>scripts/base_train.py</code> and executes it. It\'s like <code>python scripts/base_train.py</code>, except <code>-m</code> sets up the package properly so the script\'s own <code>scripts.*</code> imports resolve.',
    depth:
      '<strong>--depth $DEPTH</strong> — the one knob. nanochat derives almost everything else from it: the number of layers (= depth) and the model width (= 64 × depth). <code>$DEPTH</code> is the shell variable you set back in §5.3 (4 for this lab). See the scaling widget below for exactly what turning this up does to the model.',
    dbs:
      '<strong>--device-batch-size $DEVICE_BATCH_SIZE</strong> — how many sequences each GPU handles per forward/backward pass. This is the dial you lower if you hit CUDA out-of-memory (16 → 8 → 4 → 2). nanochat uses <em>gradient accumulation</em>, so a smaller device batch just runs more micro-steps to reach the same effective batch — slower, not worse. <code>$DEVICE_BATCH_SIZE</code> is also set in §5.3.',
    iters:
      '<strong>--num-iterations 2000</strong> — how many optimizer steps to run. More iterations = more training = lower loss, up to a point — and the curve has mostly flattened by ~1,500 steps at this scale, so the lab stops at 2000 to save time. It finishes in ~10 minutes at depth 4 on one GPU. <em>This is the flag the lab template originally got wrong — older nanochat called it <code>--steps</code>.</em>',
    tee:
      '<strong>2&gt;&amp;1 | tee train.log</strong> — shell plumbing, not nanochat. <code>2&gt;&amp;1</code> merges stderr into stdout so all output is one stream; <code>| tee train.log</code> forks that stream two ways — printing to your screen <em>and</em> writing a copy to <code>train.log</code>. You capture the per-step loss during the run you were going to do anyway, then plot it afterward (loss-curve step below) instead of training a second time.',
  };
  const DEFAULT = 'Hover, tap, or tab to a part of the command above to see what it does.';

  function show(part) {
    parts.forEach(p => p.classList.remove('active'));
    part.classList.add('active');
    detail.innerHTML = EXPLAIN[part.getAttribute('data-k')] || DEFAULT;
  }
  function clear() {
    parts.forEach(p => p.classList.remove('active'));
    detail.innerHTML = DEFAULT;
  }
  parts.forEach(part => {
    part.addEventListener('mouseenter', () => show(part));
    part.addEventListener('mouseleave', clear);
    part.addEventListener('focus', () => show(part));
    part.addEventListener('blur', clear);
    part.addEventListener('click', () => show(part));
  });
})();


/* ============================================================
 * §8 · Inside nanochat/ — annotated source-code blocks
 *   Ported from Lab 02's annotated gpt() walkthrough, generalized:
 *   auto-discovers every .annotated-code-wrap on the page, so each
 *   file in the source tour needs zero extra wiring.
 *
 *   Structure expected inside each .annotated-code-wrap:
 *     .annotated-code  > .code-step[data-step][data-step-name][data-explain]
 *     .code-explain-panel > .code-explain-tag + .code-explain-text
 *
 *   Hovering (or keyboard-focusing) an annotated line paints it,
 *   paints all peer lines sharing its data-step, and swaps the
 *   explain panel's content for the line's data-explain HTML.
 * ============================================================ */
(function initAnnotatedSource() {
  'use strict';

  // Lightweight Python syntax highlighter emitting Prism token classes so the
  // Prism CSS theme already loaded on the page paints the code. We can't run
  // Prism itself because every line lives in its own <div> (for hover scoping).
  const KEYWORDS = new Set(['def','for','in','return','if','else','elif','None','True','False',
    'and','or','not','lambda','class','import','from','as','with','while','break','continue',
    'pass','yield','global','nonlocal','raise','try','except','finally','assert','del','is','async','await']);
  const BUILTINS = new Set(['range','len','zip','print','sum','enumerate','map','filter','list',
    'dict','tuple','set','int','float','str','bool','abs','min','max','round','sorted','reversed',
    'isinstance','super','hasattr','getattr','setattr','open','all','any','bytes','iter','next','vars']);
  const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function highlight(text) {
    // One master regex — order matters: comments, then strings, then numbers, then identifiers.
    const re = /(#[^\n]*)|([rbfu]{0,2}'(?:[^'\\]|\\.)*'|[rbfu]{0,2}"(?:[^"\\]|\\.)*")|(\b\d[\d_]*(?:\.\d+)?(?:e-?\d+)?\b)|([A-Za-z_]\w*)/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out += escapeHtml(text.substring(last, m.index));
      let cls = null;
      const body = m[0];
      if (m[1]) cls = 'comment';
      else if (m[2]) cls = 'string';
      else if (m[3]) cls = 'number';
      else if (m[4]) {
        const word = m[4];
        if (KEYWORDS.has(word)) cls = 'keyword';
        else if (BUILTINS.has(word)) cls = 'builtin';
        else if (/^\s*\(/.test(text.substring(m.index + word.length))) cls = 'function';
      }
      out += cls ? `<span class="token ${cls}">${escapeHtml(body)}</span>` : escapeHtml(body);
      last = m.index + m[0].length;
    }
    if (last < text.length) out += escapeHtml(text.substring(last));
    return out;
  }

  document.querySelectorAll('.annotated-code-wrap').forEach(wrap => {
    const root = wrap.querySelector('.annotated-code');
    const panel = wrap.querySelector('.code-explain-panel');
    if (!root || !panel) return;
    const tagEl = panel.querySelector('.code-explain-tag');
    const textEl = panel.querySelector('.code-explain-text');
    if (!tagEl || !textEl) return;
    const defaultTag = tagEl.textContent;
    const defaultText = textEl.innerHTML;

    // Elided-lines markers keep their literal text (⋯ …); real code gets highlighted.
    root.querySelectorAll('.code-step').forEach(el => {
      if (!el.classList.contains('code-elide')) {
        el.innerHTML = highlight(el.textContent);
      }
    });

    root.querySelectorAll('.code-step[data-explain]').forEach(el => {
      const step = el.dataset.step;
      const peers = step ? root.querySelectorAll(`.code-step[data-step="${step}"]`) : [el];
      function show() {
        peers.forEach(p => p.classList.add('active'));
        tagEl.textContent = el.dataset.stepName || step || '';
        textEl.innerHTML = el.dataset.explain;
      }
      function hide() {
        peers.forEach(p => p.classList.remove('active'));
        tagEl.textContent = defaultTag;
        textEl.innerHTML = defaultText;
      }
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      el.tabIndex = 0; // keyboard accessibility
      el.addEventListener('focus', show);
      el.addEventListener('blur', hide);
    });
  });
})();


/* ============================================================
 * Widget · §6.2 · RoPE — rotary embeddings (#viz-rope)
 *   Panel 1: 8 "clock dials", one per channel pair, hand angle
 *   m·θ_c with θ_c = base^(−c/(N−1)) — geometric frequency decay,
 *   mirroring gpt.py's inv_freq = 1/base^(channel/head_dim).
 *   Panel 2: q rotated by i·θ, k by j·θ on one circle; readout
 *   shows q·k = cos((i−j)·θ) — invariant when both slide together.
 * ============================================================ */
(function initRope() {
  'use strict';
  const root = document.getElementById('viz-rope');
  if (!root) return;
  const NS = 'http://www.w3.org/2000/svg';
  function svg(name, attrs, parent, text) {
    const n = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  const fmt = (x, d) => (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);

  /* ---------------- Panel 1 · dial bank ---------------- */
  const N_DIALS = 8, BASE = 1000;
  const thetas = Array.from({ length: N_DIALS }, (_, c) => Math.pow(BASE, -c / (N_DIALS - 1)));
  const dialsBox = document.getElementById('rope-dials');
  const hands = [], angleLabels = [];
  thetas.forEach((th, c) => {
    const wrap = document.createElement('div');
    wrap.className = 'rope-dial';
    const s = svg('svg', { width: 62, height: 62, viewBox: '0 0 62 62' }, null);
    svg('circle', { cx: 31, cy: 31, r: 26, fill: '#fff', stroke: '#e6e1d6', 'stroke-width': 1.5 }, s);
    // 12 o'clock tick = "position 0"
    svg('line', { x1: 31, y1: 3.5, x2: 31, y2: 9, stroke: '#8a857d', 'stroke-width': 1.5 }, s);
    const hand = svg('line', { x1: 31, y1: 31, x2: 31, y2: 9, stroke: '#b14a2e', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, s);
    svg('circle', { cx: 31, cy: 31, r: 2.4, fill: '#b14a2e' }, s);
    wrap.appendChild(s);
    const lab = document.createElement('div');
    lab.className = 'rope-dial-label';
    lab.innerHTML = `pair ${c}<br>θ=${th >= 0.01 ? fmt(th, 2) : fmt(th, 3)}`;
    wrap.appendChild(lab);
    dialsBox.appendChild(wrap);
    hands.push(hand);
    angleLabels.push(lab);
  });
  const posSlider = document.getElementById('rope-pos');
  const posOut = document.getElementById('rope-pos-out');
  function renderDials() {
    const m = +posSlider.value;
    posOut.textContent = m;
    thetas.forEach((th, c) => {
      const a = m * th; // radians, clockwise from 12 o'clock
      const x = 31 + 22 * Math.sin(a);
      const y = 31 - 22 * Math.cos(a);
      hands[c].setAttribute('x2', x);
      hands[c].setAttribute('y2', y);
    });
  }
  posSlider.addEventListener('input', renderDials);
  // animate button
  let animTimer = null;
  const animBtn = document.getElementById('rope-anim');
  animBtn.addEventListener('click', () => {
    if (animTimer) {
      clearInterval(animTimer); animTimer = null;
      animBtn.textContent = '▶ animate m';
      return;
    }
    animBtn.textContent = '⏸ stop';
    animTimer = setInterval(() => {
      posSlider.value = (+posSlider.value + 1) % (+posSlider.max + 1);
      renderDials();
    }, 110);
  });
  renderDials();

  /* ---------------- Panel 2 · relative position ---------------- */
  const THETA = 0.35;            // one shared frequency for the demo
  const rel = document.getElementById('rope-rel-svg');
  const CX = 125, CY = 125, R = 92;
  svg('circle', { cx: CX, cy: CY, r: R, fill: '#fff', stroke: '#e6e1d6', 'stroke-width': 1.5 }, rel);
  svg('line', { x1: CX, y1: CY - R, x2: CX, y2: CY - R + 7, stroke: '#8a857d', 'stroke-width': 1.5 }, rel);
  svg('text', { x: CX, y: CY - R - 6, 'text-anchor': 'middle', 'font-size': 10, fill: '#8a857d', 'font-family': 'monospace' }, rel, 'position 0');
  const gapArc = svg('path', { fill: 'none', stroke: '#d9a441', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.85 }, rel);
  const qLine = svg('line', { x1: CX, y1: CY, stroke: '#b14a2e', 'stroke-width': 3, 'stroke-linecap': 'round' }, rel);
  const kLine = svg('line', { x1: CX, y1: CY, stroke: '#2e5fb1', 'stroke-width': 3, 'stroke-linecap': 'round' }, rel);
  const qDot = svg('circle', { r: 5, fill: '#b14a2e' }, rel);
  const kDot = svg('circle', { r: 5, fill: '#2e5fb1' }, rel);
  const qLab = svg('text', { 'font-size': 12, 'font-weight': 700, fill: '#b14a2e', 'font-family': 'monospace' }, rel, 'q');
  const kLab = svg('text', { 'font-size': 12, 'font-weight': 700, fill: '#2e5fb1', 'font-family': 'monospace' }, rel, 'k');
  svg('circle', { cx: CX, cy: CY, r: 2.5, fill: '#8a857d' }, rel);
  const gapLab = svg('text', { 'font-size': 11, fill: '#9a7118', 'font-family': 'monospace', 'text-anchor': 'middle' }, rel, '');

  const iS = document.getElementById('rope-i'), jS = document.getElementById('rope-j');
  const iOut = document.getElementById('rope-i-out'), jOut = document.getElementById('rope-j-out');
  const readout = document.getElementById('rope-readout');
  const pt = (a, r) => [CX + r * Math.sin(a), CY - r * Math.cos(a)];

  function renderRel(held) {
    const i = +iS.value, j = +jS.value;
    iOut.textContent = i; jOut.textContent = j;
    const ai = i * THETA, aj = j * THETA;
    const [qx, qy] = pt(ai, R), [kx, ky] = pt(aj, R);
    qLine.setAttribute('x2', qx); qLine.setAttribute('y2', qy);
    kLine.setAttribute('x2', kx); kLine.setAttribute('y2', ky);
    qDot.setAttribute('cx', qx); qDot.setAttribute('cy', qy);
    kDot.setAttribute('cx', kx); kDot.setAttribute('cy', ky);
    const [qlx, qly] = pt(ai, R + 14); const [klx, kly] = pt(aj, R + 14);
    qLab.setAttribute('x', qlx - 4); qLab.setAttribute('y', qly + 4);
    kLab.setAttribute('x', klx - 4); kLab.setAttribute('y', kly + 4);
    // gap arc between the two hands (short way, at inner radius)
    const rArc = R - 14;
    const a0 = Math.min(ai, aj), a1 = Math.max(ai, aj);
    // draw the arc from a0 to a1 going clockwise; split into segments for large angles
    const steps = Math.max(2, Math.ceil((a1 - a0) / 0.2));
    let d = '';
    for (let s = 0; s <= steps; s++) {
      const [x, y] = pt(a0 + (a1 - a0) * s / steps, rArc);
      d += (s === 0 ? 'M' : 'L') + fmt(x, 1) + ' ' + fmt(y, 1);
    }
    gapArc.setAttribute('d', d);
    const [gx, gy] = pt((a0 + a1) / 2, rArc - 14);
    gapLab.setAttribute('x', gx); gapLab.setAttribute('y', gy);
    gapLab.textContent = 'gap';
    const gap = (i - j) * THETA;
    const score = Math.cos(gap);
    const hold = held ? ' rr-hold' : '';
    readout.innerHTML =
      `<span class="rr-q">q</span> rotated by  i·θ = ${fmt(ai, 2)} rad<br>` +
      `<span class="rr-k">k</span> rotated by  j·θ = ${fmt(aj, 2)} rad<br>` +
      `gap = (i−j)·θ = <span class="${hold ? 'rr-hold' : ''}">${fmt(gap, 2)} rad</span><br>` +
      `score q·k = cos(gap) = <span class="${hold ? 'rr-hold' : ''}">${fmt(score, 3)}</span>`;
  }
  iS.addEventListener('input', () => renderRel(false));
  jS.addEventListener('input', () => renderRel(false));

  function slideBoth(delta) {
    let i = +iS.value, j = +jS.value;
    const max = +iS.max;
    if (Math.max(i, j) + delta > max) { i -= 20; j -= 20; } // wrap, gap preserved
    const ti = i + delta, tj = j + delta;
    const t0 = performance.now(), DUR = 450;
    function step(now) {
      const f = Math.min(1, (now - t0) / DUR);
      iS.value = Math.round(i + (ti - i) * f);
      jS.value = Math.round(j + (tj - j) * f);
      renderRel(true);
      if (f < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  document.getElementById('rope-shift').addEventListener('click', () => slideBoth(5));
  document.getElementById('rope-shift1').addEventListener('click', () => slideBoth(1));
  document.getElementById('rope-rst').addEventListener('click', () => { iS.value = 9; jS.value = 4; renderRel(false); });
  renderRel(false);
})();


/* ============================================================
 * Widget · §6.2 · Flash Attention (#viz-flash)
 *   16×16 causal score matrix. Two algorithms animated:
 *   - naive: fill the whole lower triangle in "HBM" (meter grows)
 *   - flash: process 4×4 tiles; only the live tile exists (SRAM),
 *     processed tiles are discarded; per-row running (m, ℓ, O)
 *     accumulators shown updating. Window toggle greys out cells
 *     beyond a 6-token sliding window (nanochat's "S" layers).
 * ============================================================ */
(function initFlash() {
  'use strict';
  const root = document.getElementById('viz-flash');
  if (!root) return;
  const NS = 'http://www.w3.org/2000/svg';
  function svg(name, attrs, parent, text) {
    const n = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  const T = 16, TILE = 4, CELL = 20, PAD = 30;
  const WINDOW = 6; // "S" layer demo window (keys within 6 back)
  const grid = document.getElementById('flash-grid');
  const sram = document.getElementById('flash-sram');
  const accBox = document.getElementById('flash-acc');
  const meterFill = document.getElementById('flash-meter-fill');
  const meterLabel = document.getElementById('flash-meter-label');
  const statusBox = document.getElementById('flash-status');
  const caption = document.getElementById('flash-caption');
  const legend = document.getElementById('flash-legend');

  const COLORS = {
    future:  { fill: '#faf8f3', stroke: '#eeeae0' },   // j > i, masked by causality
    skipped: { fill: '#e4e0d3', stroke: '#d6d1c2' },   // outside sliding window
    valid:   { fill: '#ffffff', stroke: '#e0dbd0' },   // to be computed
    stored:  { fill: '#d98e62', stroke: '#c07747' },   // naive: sitting in HBM
    active:  { fill: '#b14a2e', stroke: '#8e3a22' },   // flash: current tile in SRAM
    done:    { fill: '#d5e6dc', stroke: '#b8cfc2' },   // flash: computed, discarded
  };

  let mode = 'flash', win = 'L';
  let timer = null;

  // Build grid cells + axis labels
  const cells = [];
  for (let i = 0; i < T; i++) {
    cells.push([]);
    for (let j = 0; j < T; j++) {
      const r = svg('rect', {
        x: PAD + j * CELL + 1, y: PAD + i * CELL + 1,
        width: CELL - 2, height: CELL - 2, rx: 2,
      }, grid);
      cells[i].push(r);
    }
  }
  for (let k = 0; k < T; k += 4) {
    svg('text', { x: PAD + k * CELL + CELL / 2, y: PAD - 8, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#8a857d', 'font-family': 'monospace' }, grid, 'k' + k);
    svg('text', { x: PAD - 6, y: PAD + k * CELL + CELL / 2 + 3, 'text-anchor': 'end', 'font-size': 9.5, fill: '#8a857d', 'font-family': 'monospace' }, grid, 'q' + k);
  }
  // SRAM mini-tile
  const sramCells = [];
  for (let a = 0; a < TILE; a++) {
    sramCells.push([]);
    for (let b = 0; b < TILE; b++) {
      const r = svg('rect', { x: 2 + b * 24, y: 2 + a * 24, width: 21, height: 21, rx: 3, fill: '#f4f1ea', stroke: '#e0dbd0' }, sram);
      sramCells[a].push(r);
    }
  }

  const isValid = (i, j) => j <= i && (win === 'L' || (i - j) <= WINDOW);
  const cellKind = (i, j) => j > i ? 'future' : (isValid(i, j) ? 'valid' : 'skipped');

  function paint(r, kind) {
    r.setAttribute('fill', COLORS[kind].fill);
    r.setAttribute('stroke', COLORS[kind].stroke);
  }
  function paintSram(on, tileCells) {
    for (let a = 0; a < TILE; a++) for (let b = 0; b < TILE; b++) {
      const lit = on && tileCells && tileCells[a][b];
      sramCells[a][b].setAttribute('fill', lit ? '#b14a2e' : '#f4f1ea');
      sramCells[a][b].setAttribute('stroke', lit ? '#8e3a22' : '#e0dbd0');
    }
  }
  function setLegend() {
    const items = mode === 'naive'
      ? [['stored in HBM', COLORS.stored.fill], ['not yet computed', COLORS.valid.fill], ['masked (future)', COLORS.future.fill]]
      : [['live tile (SRAM)', COLORS.active.fill], ['computed → discarded', COLORS.done.fill], ['not yet computed', COLORS.valid.fill], ['masked (future)', COLORS.future.fill]];
    if (win === 'S') items.push(['outside window — skipped', COLORS.skipped.fill]);
    legend.innerHTML = items.map(([t, c]) => `<span><span class="fl-swatch" style="background:${c}"></span>${t}</span>`).join('');
  }
  function setCaption() {
    const winNote = win === 'S'
      ? ` <strong>Sliding window:</strong> the grey cells aren't optimized away — they're <em>never computed</em>. That's nanochat's <code>window_size=(768, 0)</code> on the <code>S</code> layers of the <code>"SSSL"</code> pattern: 3 of every 4 layers only look 768 tokens back, and only the periodic <code>L</code> layers (and always the last) pay for full context.`
      : '';
    if (mode === 'naive') {
      caption.innerHTML = `<strong>Naive:</strong> every score is written to HBM, then the whole triangle is read <em>back</em> for softmax, then again for the ×V multiply. At this toy T=16 that's ${totalValid()} values; at nanochat's T=2,048 it's ~2.1M <em>per head, per batch row</em> — attention becomes memory-bound, and memory traffic, not math, sets the speed.` + winNote;
    } else {
      caption.innerHTML = `<strong>Flash:</strong> identical output, but the matrix never exists. Each 4×4 tile (real kernels: up to 128×128) is computed in SRAM and immediately folded into three running values per query row — the max <code>m</code>, the softmax denominator <code>ℓ</code>, and the output accumulator <code>O</code>. The <em>online softmax</em> trick makes this exact: when a new tile raises a row's max, the already-accumulated <code>ℓ</code> and <code>O</code> are rescaled by <code>exp(m_old − m_new)</code> before the tile is folded in. Peak score storage: one tile, no matter how long the sequence. (The backward pass recomputes tiles instead of storing them — trading cheap FLOPs for expensive memory.)` + winNote;
    }
    caption.innerHTML += ` <em>FA3 is this algorithm hand-tuned for Hopper GPUs; PyTorch's SDPA is a built-in fused version of the same idea — the code below picks whichever your hardware supports.</em>`;
  }
  function totalValid() {
    let n = 0;
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (isValid(i, j)) n++;
    return n;
  }

  function resetBoard() {
    if (timer) { clearInterval(timer); timer = null; }
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) paint(cells[i][j], cellKind(i, j));
    paintSram(false);
    accBox.innerHTML = '<span style="color:#8a857d">running per-row state appears here</span>';
    meterFill.style.width = '0%';
    meterLabel.textContent = 'score values stored: 0';
    statusBox.textContent = 'press ▶ Play';
    setLegend();
    setCaption();
  }

  function playNaive() {
    const order = [];
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) if (isValid(i, j)) order.push([i, j]);
    const total = order.length;
    let idx = 0;
    timer = setInterval(() => {
      for (let s = 0; s < 6 && idx < total; s++, idx++) {
        const [i, j] = order[idx];
        paint(cells[i][j], 'stored');
      }
      meterFill.style.width = (idx / total * 100) + '%';
      meterLabel.textContent = `score values stored: ${idx} / ${total}`;
      statusBox.textContent = `computing row q${order[Math.min(idx, total - 1)][0]} — every score parked in HBM…`;
      if (idx >= total) {
        clearInterval(timer); timer = null;
        statusBox.innerHTML = `Full triangle in HBM: <strong>${total} values</strong>. Now softmax (and then ×V) must read them all <em>back</em> — two more slow passes over memory. At T=2,048: ~2.1M values per head per row.`;
      }
    }, 90);
  }

  function playFlash() {
    // Build tile list: row blocks top→bottom, tiles left→right, only tiles containing valid cells
    const tiles = [];
    for (let rb = 0; rb < T / TILE; rb++) {
      for (let cb = 0; cb <= rb; cb++) {
        let any = false;
        const mask = [];
        for (let a = 0; a < TILE; a++) {
          mask.push([]);
          for (let b = 0; b < TILE; b++) {
            const v = isValid(rb * TILE + a, cb * TILE + b);
            mask[a].push(v);
            any = any || v;
          }
        }
        if (any) tiles.push({ rb, cb, mask });
      }
    }
    let idx = 0;
    let prev = null;
    timer = setInterval(() => {
      if (prev) {
        for (let a = 0; a < TILE; a++) for (let b = 0; b < TILE; b++)
          if (prev.mask[a][b]) paint(cells[prev.rb * TILE + a][prev.cb * TILE + b], 'done');
      }
      if (idx >= tiles.length) {
        clearInterval(timer); timer = null;
        paintSram(false);
        statusBox.innerHTML = `Done — same output as naive, but peak score storage was <strong>one ${TILE}×${TILE} tile</strong> in SRAM (real kernels: 128×128). HBM stored: <strong>0</strong> scores; only the final output O was written.`;
        return;
      }
      const t = tiles[idx];
      for (let a = 0; a < TILE; a++) for (let b = 0; b < TILE; b++)
        if (t.mask[a][b]) paint(cells[t.rb * TILE + a][t.cb * TILE + b], 'active');
      paintSram(true, t.mask);
      const rows = Array.from({ length: TILE }, (_, a) => t.rb * TILE + a);
      accBox.innerHTML = rows.map(r =>
        `<span class="fa-chip pulse">q${r}: m ℓ O ⟳</span>`).join('') +
        `<br><span style="color:#8a857d">tile ${t.cb + 1}/${t.rb + 1} of row block ${t.rb + 1} — rescale by exp(m_old−m_new), fold in, discard</span>`;
      meterFill.style.width = '0%';
      meterLabel.textContent = `score values stored: 0 · SRAM holds: ${TILE * TILE}`;
      statusBox.textContent = `row block ${t.rb + 1}/${T / TILE} · tile ${t.cb + 1}: scores live only in SRAM; per-row running max/sum/output updated, tile thrown away.`;
      prev = t;
      idx++;
    }, 380);
  }

  document.getElementById('flash-play').addEventListener('click', () => {
    resetBoard();
    statusBox.textContent = 'running…';
    if (mode === 'naive') playNaive(); else playFlash();
  });
  document.getElementById('flash-reset').addEventListener('click', resetBoard);
  root.querySelectorAll('[data-flash-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-flash-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mode = btn.dataset.flashMode;
      resetBoard();
    });
  });
  root.querySelectorAll('[data-flash-win]').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-flash-win]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      win = btn.dataset.flashWin;
      resetBoard();
    });
  });
  resetBoard();
})();
