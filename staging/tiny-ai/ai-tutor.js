/* ai-tutor.js — bring-your-own-AI teaching assistant for the tiny-ai lab.

   The mental model is a collaborator on a shared Google Doc. The student keeps using the AI
   they already have (Claude, ChatGPT — app or voice mode); this file gives that AI presence on
   the page: a labelled cursor it can move, Docs-style text highlighting with a blinking caret,
   and a live view of what the STUDENT is pointing at, hovering, or selecting.

   Three tiers, degrading gracefully:
     1. Static: the page + AGENTS.md brief any LLM that fetches the URL into Socratic-tutor mode.
        (No code here involved — see the hidden "for AI assistants" block in index.html.)
     2. Paste loop: the student copies a context snippet to their AI; the AI replies with
        ```aitutor``` command blocks the student pastes back. Zero infrastructure.
     3. Live bridge: the page holds an SSE channel to a small relay (tutor-bridge/server.mjs);
        the student's AI connects to the same relay as an MCP server and drives the presence
        layer in real time.

   Deliberate limits: the AI can point, highlight, and speak in a bubble. It cannot click,
   type, scroll-jack (it may request a scroll to what it points at), or navigate. A tutor
   that can do the exercise for you is not a tutor, and this is a classroom prototype.

   This is a classic deferred script ON PURPOSE: the lab's inline script declares its state
   (P, P0, f, stage, focusId, ...) with top-level const/let, which live in the shared global
   lexical scope — reachable from another classic script, invisible to a module. Every read
   is wrapped in try/catch so this file never breaks the lab if a name moves. */

(function () {
  "use strict";
  if (window.AITutor) return;                    // one instance per page

  /* ---------------- configuration ---------------- */

  var AI_PRESETS = {
    claude:  { name: "Claude",  color: "#d97757" },
    chatgpt: { name: "ChatGPT", color: "#10a37f" },
    other:   { name: "AI tutor", color: "#7b5cc6" },
  };
  var state = {
    ai: null,                    // {name, color} once known (hello cmd or panel pick)
    bridge: null,                // live bridge client, when connected
    room: null,                  // live session room code
    pointer: { x: null, y: null, target: null, at: 0 },
    selection: null,             // {text, target}
    asks: [],                    // student utterances queued for the AI ("what is this?")
    kcheck: null,                // last knowledge-check sentence submitted
    lastSay: null,
    demoRunning: false,
  };
  function ai() { return state.ai || AI_PRESETS.other; }

  /* Where the static tutor briefing lives, relative to wherever this copy of the lab is
     served from (staging or live), so the copied prompt always points at itself. */
  var PAGE_URL = location.origin + location.pathname.replace(/index\.html$/, "");
  var AGENTS_URL = PAGE_URL + "AGENTS.md";

  /* ---------------- the semantic map ----------------
     "The student is at (612, 404)" is useless to a language model. This map turns DOM
     positions into teachable things: which knob, which graph, which section. Order matters —
     first match wins, most specific first. */

  var TARGETS = [
    ["#doseKnob",   "dose",     "the dose dial — x, the input, 0–10 mg"],
    ["#doseHud",    "dose",     "the dose HUD card (dial plus current x in mg)"],
    ["#fxHud",      "results",  "the Results card — predicted vs actual happiness"],
    ["#giveBtn",    "give",     "the 'Give the dose' button — runs one real trial, adds a data point"],
    ["#c3d",        "scene",    "the 3D scene — black box (the model), patient, dials on the box front"],
    ["#step0card",  "sec:1",    "step 1 card — a straight line, two knobs: m (slope) and c (starting height)"],
    ["#stagecard1", "sec:2",    "step 2 card — teach the line to bend (ReLU hinge appears)"],
    ["#netcard",    "sec:2",    "the 2-neuron machine diagram — weights are just knobs"],
    ["#codoncard",  "sec:2",    "the same machine written in codon (visual language)"],
    ["#bpcard",     "sec:3",    "backprop card — the automatic hand that turns knobs"],
    ["#quizcard",   "quiz",     "section 4, the tiny test — predict from YOUR trained line, 3 in a row"],
    ["#quizIn",     "quiz",     "the quiz answer box (happiness 0–100)"],
    ["#checkcard",  "kcheck",   "section 5, checking in — the one-sentence knowledge check"],
    ["#kcheck",     "kcheck",   "the knowledge-check sentence box: what does training a model actually do?"],
    ["#npsCard",    "sec:6",    "the feedback card (0–10 dial)"],
    ["#wrapcard",   "sec:7",    "the wrap-up — what you just did, in AI Fluency terms"],
    ["#bonuscard",  "sec:8",    "the bonus build-a-neuron canvas"],
    ["#challenge",  "challenge","the challenge statement and the before-you-start confidence question"],
    [".tailorbar",  "fluency",  "the AI-experience slider (1 beginner – 7 pro)"],
  ];

  var SECTION_ANCHORS = {
    "sec:1": "#step0card", "sec:2": "#stagecard1", "sec:3": "#bpcard",
    "sec:4": "#quizcard",  "quiz": "#quizcard",
    "sec:5": "#checkcard", "kcheck": "#checkcard",
    "sec:6": "#npsCard",   "sec:7": "#wrapcard", "sec:8": "#bonuscard",
    "dose": "#doseKnob",   "scene": "#c3d",      "give": "#giveBtn",
    "results": "#fxHud",   "challenge": "#challenge",
  };

  /* Friendly names for the model's knobs. DISP in the lab maps slots to printed labels
     (w1 -> m1 ...), but the words below are what a tutor would actually say. */
  var KNOB_WORDS = {
    w1: "w1 (m — the slope: how fast happiness rises per mg)",
    b1: "b1 (c — the starting height at zero dose)",
    w2: "w2 (slope of the second neuron — the downhill side)",
    b2: "b2 (where the second bend sits)",
    w3: "w3 (how much of neuron 1 reaches the output)",
    w4: "w4 (how much of neuron 2 reaches the output — negative pulls down)",
    b3: "b3 (the output's floor)",
  };

  function resolveTarget(spec) {
    if (!spec) return null;
    if (typeof spec === "object" && spec.nodeType === 1) return spec;
    spec = String(spec).trim();
    if (SECTION_ANCHORS[spec]) spec = SECTION_ANCHORS[spec];
    var m = /^knob:(\w+)$/.exec(spec);
    if (m) {
      try { var els = knobEls[m[1]]; if (els && els.length) return els[0].c; } catch (e) {}
      return document.getElementById("doseKnob");
    }
    try { return document.querySelector(spec); } catch (e) { return null; }
  }

  /* What is the student's pointer over, in words? Climb from the element to the most
     specific entry in TARGETS; name knobs individually via the lab's own knobEls table. */
  function describeEl(el) {
    if (!el || el.nodeType !== 1) return null;
    var knob = knobName(el);
    if (knob) return { key: "knob:" + knob, label: KNOB_WORDS[knob] || ("the " + knob + " knob") };
    for (var node = el; node && node !== document.body; node = node.parentElement) {
      for (var i = 0; i < TARGETS.length; i++) {
        try { if (node.matches(TARGETS[i][0])) return { key: TARGETS[i][1], label: TARGETS[i][2] }; } catch (e) {}
      }
    }
    var h = el.closest && el.closest("h2");
    if (h) return { key: "heading", label: 'the heading "' + h.textContent.trim() + '"' };
    var txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90);
    return { key: el.id ? "#" + el.id : el.tagName.toLowerCase(),
             label: txt ? 'text near "' + txt + '"' : ("a " + el.tagName.toLowerCase() + " element") };
  }

  function knobName(el) {
    if (!el || el.tagName !== "CANVAS") return null;
    try {
      for (var n in knobEls) {
        var arr = knobEls[n];
        for (var i = 0; i < arr.length; i++) if (arr[i].c === el) return n;
      }
    } catch (e) {}
    return null;
  }

  /* ---------------- lab state snapshot (student -> AI) ----------------
     Everything a tutor needs to know, nothing it doesn't. All reads guarded: if the lab
     renames a variable this degrades to fewer fields, never to a broken page. */

  function labSnapshot() {
    var s = { url: location.href, at: new Date().toISOString() };
    try { s.stage = stage; } catch (e) {}
    try { s.section_in_view = (function(){
      var e = FOCUS.find(function (r) { return r[0] === focusId; });
      return { id: focusId, name: e ? e[1] : focusId };
    })(); } catch (e) {}
    try { s.step1_model = { m: +P0.m.toFixed(3), c: +P0.c.toFixed(3),
                            note: "step-1 straight line, y01 = m*x01 + c (0..1 units)" }; } catch (e) {}
    try {
      s.shared_model = {};
      stageKnobs().forEach(function (n) { s.shared_model[n] = +P[n].toFixed(3); });
      s.shared_model.note = "0..1 units; display is mg = x*10, happiness = y*100";
    } catch (e) {}
    try { s.loss = +loss().toFixed(5); } catch (e) {}
    try { s.dose_mg = +(doseFrac * 10).toFixed(1); } catch (e) {}
    try { s.data_points = DATA.length; } catch (e) {}
    try { s.quiz = { started: qStarted, streak: qStreak,
                     current_case_mg: qDose == null ? null : +(qDose * 10).toFixed(1) }; } catch (e) {}
    try { var kc = document.getElementById("kcheck");
          s.knowledge_check_draft = kc && kc.value.trim() || null; } catch (e) {}
    s.student_pointer = state.pointer.target
      ? { over: state.pointer.target.label, seconds_ago: +((Date.now() - state.pointer.at) / 1000).toFixed(1) }
      : null;
    s.student_selection = state.selection || null;
    if (state.asks.length) s.student_asked = state.asks.slice(-3);
    if (state.kcheck) s.knowledge_check_submitted = state.kcheck;
    return s;
  }

  /* ---------------- styles ---------------- */

  var css = document.createElement("style");
  css.textContent = [
    /* presence layer: everything absolute in DOCUMENT coordinates so scrolling needs no
       bookkeeping. Appended to <html>, not .wrap — an ancestor with transform/filter would
       re-anchor these (the knob guide learned this the hard way). */
    "#aitLayer{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147482800;pointer-events:none}",
    "#aitLayer *{pointer-events:none;box-sizing:border-box}",
    ".ait-cursor{position:absolute;left:0;top:0;transition:opacity .6s;will-change:transform}",
    ".ait-cursor svg{display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}",
    ".ait-flag{position:absolute;left:13px;top:17px;white-space:nowrap;font:600 11px/1.7 var(--sans,system-ui);color:#fff;padding:0 8px;border-radius:9px;letter-spacing:.2px}",
    ".ait-ring{position:absolute;border:2.5px solid;border-radius:50%;opacity:0;animation:aitring 1s ease-out 2}",
    "@keyframes aitring{0%{transform:scale(.4);opacity:.9}100%{transform:scale(1.5);opacity:0}}",
    ".ait-caret{position:absolute;width:2px;animation:aitblink 1s steps(1) infinite}",
    ".ait-caret .ait-flag{left:-2px;top:-20px}",
    "@keyframes aitblink{50%{opacity:0}}",
    ".ait-mark{position:absolute;border-radius:2px;mix-blend-mode:multiply}",
    ".ait-bubble{position:absolute;max-width:300px;font:400 13.5px/1.45 var(--sans,system-ui);color:var(--ink,#1f1d1a);background:#fff;border:1px solid var(--rule,#d9d2c4);border-radius:12px;border-top-left-radius:3px;padding:8px 11px;box-shadow:0 4px 14px rgba(0,0,0,.13);opacity:0;transition:opacity .25s}",
    ".ait-bubble b.ait-who{font-size:11px;letter-spacing:.4px;text-transform:uppercase;display:block;margin-bottom:2px}",
    /* the CTA chip and its panel, styled to sit beside ⚙ without stealing the landing */
    /* the one labelled chip in a row of 27px icon squares: same height, its own width —
       .viewtoggle button pins width:27px, so the id must override it */
    "#aitBtn{display:inline-flex;align-items:center;gap:5px;width:auto;height:27px;padding:0 9px;white-space:nowrap;font:600 12.5px var(--sans,system-ui);cursor:pointer}",
    "#aitPanel{display:none;position:absolute;right:0;top:calc(100% + 8px);width:min(340px,86vw);background:var(--bg-elev,#fffdf7);border:1px solid var(--rule,#d9d2c4);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.16);padding:14px 15px;z-index:60;text-align:left;font:400 13px/1.5 var(--sans,system-ui);color:var(--ink,#1f1d1a);cursor:default}",
    "#aitPanel.open{display:block}",
    "#aitPanel h3{margin:0 0 6px;font:700 14px var(--sans,system-ui)}",
    "#aitPanel p{margin:6px 0;color:var(--ink-soft,#4c463c)}",
    "#aitPanel .ait-row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}",
    /* width/height:auto matters: these buttons sit inside .viewtoggle, whose rule pins every
       button to a 27px icon square, and that rule still applies where this one is silent */
    "#aitPanel button{width:auto;height:auto;font:600 12.5px var(--sans,system-ui);padding:7px 11px;border:1px solid var(--ink,#1f1d1a);border-radius:9px;background:#fff;cursor:pointer}",
    "#aitPanel button.ait-primary{background:var(--ink,#1f1d1a);color:#fff}",
    "#aitPanel button:disabled{opacity:.45;cursor:default}",
    "#aitPanel .ait-pick{border-radius:999px;padding:5px 11px}",
    "#aitPanel .ait-pick.on{outline:2px solid currentColor}",
    "#aitPanel .ait-note{font-size:11.5px;color:var(--ink-mute,#7a7263);margin-top:8px}",
    "#aitPanel .ait-ok{color:var(--visited,#237841);font-weight:600}",
    "#aitPanel textarea{width:100%;font:400 12px var(--mono,monospace);border:1px solid var(--rule,#d9d2c4);border-radius:8px;padding:6px;margin-top:6px}",
    "#aitPanel input[type=text]{width:100%;font:400 12px var(--mono,monospace);border:1px solid var(--rule,#d9d2c4);border-radius:8px;padding:6px;box-sizing:border-box}",
    "#aitPanel .ait-live{display:none;border-top:1px dashed var(--rule,#d9d2c4);margin-top:10px;padding-top:8px}",
    "#aitPanel .ait-live.open{display:block}",
    "#aitPanel .ait-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#c4281c;margin-right:5px;vertical-align:baseline}",
    "#aitPanel .ait-dot.on{background:#237841}",
    "#aitKcheckNudge{font:600 12.5px var(--sans,system-ui);margin-left:10px}",
    "#aitKcheckNudge a{cursor:pointer;text-decoration:underline}",
    "::highlight(ait-hl){background-color:rgba(255,213,79,.55);color:inherit}",
  ].join("\n");
  document.head.appendChild(css);

  var layer = document.createElement("div");
  layer.id = "aitLayer";
  document.documentElement.appendChild(layer);

  /* ---------------- the AI cursor ---------------- */

  var cursor = null, cursorPos = { x: 0, y: 0 }, cursorAnim = null, idleTimer = null;
  function ensureCursor() {
    if (cursor) return cursor;
    cursor = document.createElement("div");
    cursor.className = "ait-cursor";
    cursor.style.opacity = "0";
    cursor.innerHTML =
      '<svg width="20" height="22" viewBox="0 0 20 22"><path d="M2 1l14 9.5-6.2 1.3L13 20l-3.4 1.4-3.2-8.2L2 17z"/></svg>' +
      '<span class="ait-flag"></span>';
    layer.appendChild(cursor);
    paintCursor();
    return cursor;
  }
  function paintCursor() {
    if (!cursor) return;
    cursor.querySelector("path").setAttribute("fill", ai().color);
    var flag = cursor.querySelector(".ait-flag");
    flag.style.background = ai().color;
    flag.textContent = ai().name + " · AI";
  }
  function bumpIdle() {
    ensureCursor().style.opacity = "1";
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (cursor) cursor.style.opacity = "0.25"; }, 9000);
  }
  /* Document-space move with an eased glide: a cursor that teleports reads as a glitch,
     one that travels reads as presence. */
  function cursorTo(x, y, ms) {
    ensureCursor(); bumpIdle();
    var fx = cursorPos.x, fy = cursorPos.y, t0 = performance.now();
    if (fx === 0 && fy === 0) { fx = x + 120; fy = y + 160; }   // first appearance: arrive from below
    ms = ms == null ? 650 : ms;
    if (cursorAnim) cancelAnimationFrame(cursorAnim);
    (function step() {
      var u = Math.min(1, (performance.now() - t0) / ms);
      var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      cursorPos.x = fx + (x - fx) * e; cursorPos.y = fy + (y - fy) * e;
      cursor.style.transform = "translate(" + cursorPos.x + "px," + cursorPos.y + "px)";
      cursorAnim = u < 1 ? requestAnimationFrame(step) : null;
    })();
  }
  function docRect(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height,
             cx: r.left + scrollX + r.width / 2, cy: r.top + scrollY + r.height / 2 };
  }
  function maybeScrollTo(el) {
    var r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > innerHeight - 60)
      el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function pulseAt(x, y, size) {
    var ring = document.createElement("div");
    ring.className = "ait-ring";
    size = size || 46;
    ring.style.cssText = "left:" + (x - size / 2) + "px;top:" + (y - size / 2) + "px;width:" + size + "px;height:" + size + "px;border-color:" + ai().color;
    layer.appendChild(ring);
    setTimeout(function () { ring.remove(); }, 2100);
  }

  /* ---------------- text highlighting, Docs style ----------------
     Custom Highlight API when the browser has it (no DOM mutation at all — vital on a page
     whose script owns its DOM), overlay rectangles otherwise. Both paths keep the Range so
     the blinking caret can sit at its end like a collaborator's insertion point. */

  var hl = { ranges: [], marks: [], caret: null };
  var CAN_HL = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";

  function clearHighlights() {
    if (CAN_HL) CSS.highlights.delete("ait-hl");
    hl.marks.forEach(function (m) { m.remove(); });
    if (hl.caret) hl.caret.remove();
    hl = { ranges: [], marks: [], caret: null };
  }

  /* Find `text` anywhere in `scope`, across element boundaries (a sentence with a <b> in the
     middle is one string to a reader and three nodes to the DOM). Whitespace-insensitive. */
  function findTextRange(text, scope) {
    scope = scope || document.body;
    var want = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (!want) return null;
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [], flat = "", map = [];         // map[i] = {node, offset} for each char of `flat`
    var n;
    while ((n = walker.nextNode())) {
      var t = n.nodeValue;
      for (var i = 0; i < t.length; i++) {
        var ch = /\s/.test(t[i]) ? " " : t[i].toLowerCase();
        if (ch === " " && flat.slice(-1) === " ") continue;   // collapse runs of whitespace
        flat += ch; map.push({ node: n, offset: i });
      }
      nodes.push(n);
    }
    var idx = flat.indexOf(want);
    if (idx < 0) return null;
    var a = map[idx], b = map[idx + want.length - 1];
    var range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset + 1);
    return range;
  }

  function showCaretAt(range) {
    if (hl.caret) hl.caret.remove();
    var rects = range.getClientRects();
    if (!rects.length) return;
    var last = rects[rects.length - 1];
    var caret = document.createElement("div");
    caret.className = "ait-caret";
    caret.style.cssText = "left:" + (last.right + scrollX) + "px;top:" + (last.top + scrollY) + "px;height:" + last.height + "px;background:" + ai().color;
    var flag = document.createElement("span");
    flag.className = "ait-flag";
    flag.style.background = ai().color;
    flag.textContent = ai().name;
    caret.appendChild(flag);
    layer.appendChild(caret);
    hl.caret = caret;
  }

  function highlightRange(range) {
    if (CAN_HL) {
      hl.ranges.push(range);
      CSS.highlights.set("ait-hl", new (Highlight.bind.apply(Highlight, [null].concat(hl.ranges)))());
    } else {
      var rects = range.getClientRects();
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i], m = document.createElement("div");
        m.className = "ait-mark";
        m.style.cssText = "left:" + (r.left + scrollX) + "px;top:" + (r.top + scrollY) + "px;width:" + r.width + "px;height:" + r.height + "px;background:rgba(255,213,79,.55)";
        layer.appendChild(m); hl.marks.push(m);
      }
    }
    showCaretAt(range);
  }

  /* ---------------- speech bubble ---------------- */

  var bubble = null, bubbleTimer = null;
  function say(text, nearX, nearY) {
    if (bubble) bubble.remove();
    bubble = document.createElement("div");
    bubble.className = "ait-bubble";
    var who = document.createElement("b");
    who.className = "ait-who"; who.style.color = ai().color; who.textContent = ai().name;
    bubble.appendChild(who);
    bubble.appendChild(document.createTextNode(text));
    var x = nearX != null ? nearX : cursorPos.x, y = nearY != null ? nearY : cursorPos.y;
    if (!x && !y) { x = scrollX + innerWidth / 2 - 150; y = scrollY + innerHeight * 0.35; }
    bubble.style.left = Math.max(scrollX + 8, Math.min(x + 22, scrollX + innerWidth - 320)) + "px";
    bubble.style.top = (y + 24) + "px";
    layer.appendChild(bubble);
    requestAnimationFrame(function () { bubble.style.opacity = "1"; });
    clearTimeout(bubbleTimer);
    var linger = Math.min(14000, 3500 + text.length * 55);   // reading time, capped
    bubbleTimer = setTimeout(function () { if (bubble) { bubble.style.opacity = "0"; } }, linger);
    state.lastSay = text;
  }

  /* ---------------- command execution (AI -> page) ---------------- */

  function exec(cmd) {
    if (!cmd || typeof cmd !== "object") return { ok: false, error: "not a command object" };
    var el, r;
    try {
      switch (cmd.cmd) {
        case "hello":
          if (cmd.name) {
            var nm = String(cmd.name).slice(0, 24), low = nm.toLowerCase();
            // a known AI introducing itself by name gets its house colour without asking
            var preset = low.indexOf("claude") >= 0 ? AI_PRESETS.claude
                       : /gpt|openai/.test(low) ? AI_PRESETS.chatgpt : null;
            state.ai = { name: nm,
                         color: /^#[0-9a-f]{3,8}$/i.test(cmd.color || "") ? cmd.color
                               : preset ? preset.color : ai().color };
          }
          paintCursor(); ensureCursor(); bumpIdle();
          ui.setStatus();
          return { ok: true, result: "present as " + ai().name };

        case "cursor":                                  // {x,y} as 0..1 viewport fractions or px
          var x = cmd.x <= 1 ? scrollX + cmd.x * innerWidth : cmd.x;
          var y = cmd.y <= 1 ? scrollY + cmd.y * innerHeight : cmd.y;
          cursorTo(x, y);
          return { ok: true };

        case "point":                                   // {target, note?}
          el = resolveTarget(cmd.target);
          if (!el) return { ok: false, error: "no such target: " + cmd.target };
          maybeScrollTo(el);
          r = docRect(el);
          cursorTo(r.cx + Math.min(30, r.width / 4), r.cy + Math.min(18, r.height / 4));
          pulseAt(r.cx, r.cy, Math.min(90, Math.max(40, r.width / 3)));
          if (cmd.note) setTimeout(function () { say(cmd.note, r.cx, r.cy); }, 500);
          return { ok: true, result: "pointing at " + (describeEl(el) || {}).label };

        case "highlight":                               // {text, scope?, note?} or {target, note?}
          var range = null;
          if (cmd.text) {
            var scope = cmd.scope ? resolveTarget(cmd.scope) : null;
            range = findTextRange(String(cmd.text), scope || undefined);
            if (!range) return { ok: false, error: "text not found on page: " + String(cmd.text).slice(0, 60) };
          } else if (cmd.target) {
            el = resolveTarget(cmd.target);
            if (!el) return { ok: false, error: "no such target: " + cmd.target };
            range = document.createRange(); range.selectNodeContents(el);
          } else return { ok: false, error: "highlight needs text or target" };
          var box = range.getBoundingClientRect();
          if (box.top < 60 || box.bottom > innerHeight - 60)
            (range.startContainer.parentElement || document.body)
              .scrollIntoView({ behavior: "smooth", block: "center" });
          highlightRange(range);
          bumpIdle();
          var rr = range.getBoundingClientRect();
          cursorTo(rr.right + scrollX + 6, rr.bottom + scrollY - 4);
          if (cmd.note) setTimeout(function () { say(cmd.note); }, 450);
          return { ok: true, result: "highlighted" };

        case "say":                                     // {text}
          if (!cmd.text) return { ok: false, error: "say needs text" };
          ensureCursor(); bumpIdle();
          say(String(cmd.text).slice(0, 400));
          return { ok: true };

        case "clear":
          clearHighlights();
          if (bubble) { bubble.remove(); bubble = null; }
          return { ok: true };

        case "state":
          return { ok: true, result: labSnapshot() };

        default:
          return { ok: false, error: "unknown cmd: " + cmd.cmd + " (know: hello, cursor, point, highlight, say, clear, state)" };
      }
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  /* Run a batch with human pacing — a paste of five commands executed in one frame looks
     like a glitch; spaced out it looks like somebody working. */
  function execScript(cmds, gap) {
    gap = gap || 1400;
    var out = [];
    return cmds.reduce(function (p, c, i) {
      return p.then(function () {
        return new Promise(function (res) {
          setTimeout(function () { out.push(exec(c)); res(); }, i === 0 ? 0 : gap);
        });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  /* Accept commands from pasted AI replies: ```aitutor fenced blocks, a bare JSON array,
     or one JSON object per line. Forgiving on purpose — chat apps love to reflow text. */
  function parsePasted(text) {
    var cmds = [];
    var fence = /```aitutor\s*([\s\S]*?)```/g, m;
    var bodies = [];
    while ((m = fence.exec(text))) bodies.push(m[1]);
    if (!bodies.length) bodies = [text];
    bodies.forEach(function (b) {
      b = b.trim();
      try { var v = JSON.parse(b); cmds = cmds.concat(Array.isArray(v) ? v : [v]); return; } catch (e) {}
      b.split(/\n+/).forEach(function (line) {
        line = line.trim();
        if (!line || line[0] !== "{") return;
        try { cmds.push(JSON.parse(line)); } catch (e) {}
      });
    });
    return cmds.filter(function (c) { return c && typeof c.cmd === "string"; });
  }

  /* ---------------- student context tracking (student -> AI) ---------------- */

  var lastMove = 0;
  addEventListener("mousemove", function (e) {
    var now = Date.now();
    if (now - lastMove < 120) return;
    lastMove = now;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    state.pointer = { x: e.clientX + scrollX, y: e.clientY + scrollY,
                      target: describeEl(el), at: now };
  }, { passive: true });

  var selTimer = null;
  document.addEventListener("selectionchange", function () {
    clearTimeout(selTimer);
    selTimer = setTimeout(function () {
      var sel = document.getSelection();
      var text = sel && String(sel).replace(/\s+/g, " ").trim();
      if (!text) { state.selection = null; return; }
      var el = sel.anchorNode && sel.anchorNode.parentElement;
      state.selection = { text: text.slice(0, 280), in_: (describeEl(el) || {}).label };
      if (state.bridge) state.bridge.event("selection", state.selection);
    }, 400);
  });

  /* ---------------- knowledge check hook (section 5) ----------------
     The lab's own handler saves and telemeters the sentence; this one, added alongside it,
     hands the sentence to the student's AI for Socratic feedback — live over the bridge if
     connected, otherwise via a one-click copyable review request. Never auto-grades on the
     page: the feedback conversation belongs in the student's own AI. */

  function hookKcheck() {
    var btn = document.getElementById("kcheckSave");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var t = (document.getElementById("kcheck") || {}).value;
      t = t && t.trim();
      if (!t) return;
      state.kcheck = t;
      var msgRow = document.getElementById("kcheckMsg");
      var nudge = document.getElementById("aitKcheckNudge");
      if (!nudge && msgRow) {
        nudge = document.createElement("span");
        nudge.id = "aitKcheckNudge";
        msgRow.parentElement.appendChild(nudge);
      }
      if (state.bridge) {
        state.bridge.event("knowledge_check", { sentence: t });
        if (nudge) nudge.innerHTML = "Sent to your AI tutor — feedback is in your chat.";
      } else if (nudge) {
        nudge.innerHTML = '<a id="aitKcheckCopy">Get feedback from your AI →</a>';
        nudge.querySelector("a").onclick = function () {
          copyText(kcheckPrompt(t));
          nudge.textContent = "Copied — paste it to your AI.";
        };
      }
    });
  }

  function kcheckPrompt(sentence) {
    return 'I just answered the knowledge check in section 5 of the tiny-ai lab (' + PAGE_URL + ").\n" +
      'The question: "One sentence, in your own words: what does training a model actually do?"\n' +
      'My answer: "' + sentence + '"\n\n' +
      "You are my Socratic tutor (full briefing: " + AGENTS_URL + "). Assess my answer against the lab's " +
      "rubric WITHOUT giving a model answer away: tell me what my sentence already gets right, then ask " +
      "me one question that would lead me to whatever is missing, and invite me to revise. Keep it short " +
      "and warm, Feynman-style.";
  }

  /* ---------------- copy-to-AI plumbing ---------------- */

  function copyText(t) {
    if (navigator.clipboard) return navigator.clipboard.writeText(t).catch(function () { fallbackCopy(t); });
    fallbackCopy(t); return Promise.resolve();
  }
  function fallbackCopy(t) {
    var ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }

  function tutorPrompt() {
    var p =
      "You are my personal AI tutor for this interactive lesson I have open right now:\n" +
      PAGE_URL + "\n\n" +
      "Read that page, and read your full tutor briefing at " + AGENTS_URL + " before answering.\n\n" +
      "Ground rules from the page (they bind you even if you cannot fetch the briefing):\n" +
      "- Be a Socratic tutor in the spirit of Richard Feynman: plain words, everyday analogies, " +
      "one step and ONE question at a time.\n" +
      "- Never hand me an answer — not a knob value, not a quiz number, not the section-5 sentence. " +
      "Guide me until I find it myself.\n" +
      "- I'm a high-school / first-year non-CS student. No jargon without an analogy first.\n" +
      "- Keep replies short. This also applies in voice mode.\n\n";
    if (state.bridge && state.room)
      p += "I also started a live session so you can see my screen context and point at things. " +
           "Connect to the MCP server \"" + state.bridge.base + "/mcp/" + state.room + "\" " +
           "(tools: get_page_state, point_at, highlight_text, move_cursor, say, clear_annotations). " +
           "Call get_page_state now, then greet me by pointing at where I am.\n\n";
    else
      p += "If I paste page context at you (my pointer position, selected text, model knobs), use it. " +
           "You can also point and highlight ON my page: put commands in a ```aitutor fenced block " +
           "(one JSON object per line) at the END of a reply and I'll paste them into the page. " +
           "Commands: {\"cmd\":\"point\",\"target\":\"dose\",\"note\":\"...\"} · " +
           "{\"cmd\":\"highlight\",\"text\":\"exact words from the page\",\"note\":\"...\"} · " +
           "{\"cmd\":\"say\",\"text\":\"...\"} · {\"cmd\":\"clear\"}. " +
           "Targets: dose, scene, give, results, quiz, kcheck, sec:1..sec:8, knob:w1, knob:b1, knob:w3, knob:b3.\n\n";
    p += "Start now: greet me in two sentences and ask what I can see on my screen.";
    return p;
  }

  function contextSnippet() {
    return "Context from my tiny-ai lab page right now (I'm the student — remember: Socratic, no answers):\n" +
      "```json\n" + JSON.stringify(labSnapshot(), null, 1) + "\n```\n" +
      "My question: what is this that I'm pointing at, and how does it work?";
  }

  /* ---------------- live bridge client ----------------
     One SSE stream in (commands), plain POSTs out (results + events). The relay is
     tutor-bridge/server.mjs; the page only ever talks to the base URL the student typed,
     nothing is contacted by default. */

  function connectBridge(base, room, onChange) {
    base = base.replace(/\/+$/, "");
    var es, closed = false, backoff = 1000;
    var client = {
      base: base, room: room, alive: false,
      event: function (type, data) {
        fetch(base + "/rooms/" + room + "/events", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({ type: type, at: Date.now() }, data)),
        }).catch(function () {});
      },
      close: function () { closed = true; if (es) es.close(); client.alive = false; onChange(); },
    };
    function open() {
      if (closed) return;
      es = new EventSource(base + "/rooms/" + room + "/page");
      es.onopen = function () { client.alive = true; backoff = 1000; onChange();
        client.event("hello", { state: labSnapshot() }); };
      es.onerror = function () {
        client.alive = false; onChange(); es.close();
        if (!closed) setTimeout(open, backoff = Math.min(15000, backoff * 1.7));
      };
      es.onmessage = function (m) {
        var cmd; try { cmd = JSON.parse(m.data); } catch (e) { return; }
        var res = exec(cmd);
        if (cmd._id) fetch(base + "/rooms/" + room + "/results", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: cmd._id, res: res }),
        }).catch(function () {});
      };
    }
    open();
    /* a heartbeat of fresh state, so get_page_state is never stale even if the student
       hasn't touched anything — cheap, tiny, and only while connected */
    var beat = setInterval(function () {
      if (closed) { clearInterval(beat); return; }
      if (client.alive) client.event("state", { state: labSnapshot() });
    }, 2500);
    return client;
  }

  /* ---------------- the demo tour ----------------
     Runs the same exec() pipeline a real AI uses — it demonstrates the presence layer AND
     smoke-tests it. Wording stays Socratic so the demo teaches the tone. */

  function runDemo() {
    if (state.demoRunning) return;
    state.demoRunning = true;
    if (!state.ai) { state.ai = AI_PRESETS.claude; paintCursor(); }
    var seq = [
      { cmd: "hello", name: ai().name },
      { cmd: "say", text: "Hi! Once you connect me, I can see your page and point at things — like this." },
      { cmd: "point", target: "dose", note: "This dial is x, the dose. Try turning it — what happens to the prediction bar?" },
      { cmd: "highlight", text: "teach the machine in the black box to pick the right dose",
        note: "This sentence is the whole game. Everything below is just this, step by step." },
      { cmd: "point", target: "sec:1", note: "Two knobs, m and c. What do you think m changes about the line?" },
      { cmd: "say", text: "That's the idea — I point and ask, you turn the knobs and answer. Connect me for real from the 🎓 AI tutor button." },
      { cmd: "clear" },
    ];
    execScript(seq, 3400).then(function () { state.demoRunning = false; });
  }

  /* ---------------- CTA + panel ---------------- */

  var ui = { setStatus: function () {} };

  function buildUI() {
    var toggle = document.querySelector(".viewtoggle");
    if (!toggle) return;

    var btn = document.createElement("button");
    btn.id = "aitBtn"; btn.type = "button";
    btn.title = "Get help from your own AI — Claude or ChatGPT";
    btn.innerHTML = "🎓 <span>AI tutor</span>";
    toggle.insertBefore(btn, toggle.firstChild);

    var panel = document.createElement("div");
    panel.id = "aitPanel";
    panel.innerHTML =
      '<h3>Bring your own AI tutor</h3>' +
      '<p>Your Claude or ChatGPT can coach you through this page — it will ask questions, ' +
      'not hand out answers.</p>' +
      '<div class="ait-row">' +
        '<button class="ait-pick" data-ai="claude" style="color:#d97757">Claude</button>' +
        '<button class="ait-pick" data-ai="chatgpt" style="color:#10a37f">ChatGPT</button>' +
        '<button class="ait-pick" data-ai="other" style="color:#7b5cc6">other AI</button>' +
      '</div>' +
      '<div class="ait-row">' +
        '<button id="aitCopyLink" class="ait-primary">Copy the tutor link</button>' +
        '<button id="aitCopyCtx">Copy “what am I looking at?”</button>' +
      '</div>' +
      '<span id="aitCopied" class="ait-ok"></span>' +
      '<p class="ait-note">Paste it into a new chat. On your phone: paste, then switch to ' +
      'voice mode and just talk — your AI stays in tutor mode.</p>' +
      '<div class="ait-row">' +
        '<button id="aitPaste">Paste your AI’s reply</button>' +
        '<button id="aitDemo">Show me a demo</button>' +
        '<button id="aitLiveBtn">Live session…</button>' +
      '</div>' +
      '<div id="aitPasteBox" style="display:none"><textarea rows="4" placeholder="Paste the whole reply — I’ll find the ```aitutor``` commands in it."></textarea>' +
      '<div class="ait-row"><button id="aitRunPaste" class="ait-primary">Run it</button><span id="aitPasteMsg"></span></div></div>' +
      '<div id="aitLive" class="ait-live">' +
        '<p style="margin-top:0"><span id="aitDot" class="ait-dot"></span><b>Live presence</b> ' +
        '<span id="aitLiveState">— not connected</span></p>' +
        '<p class="ait-note">Needs a running relay (see <a href="tutor-bridge/" target="_blank" rel="noopener" style="pointer-events:auto">tutor-bridge</a> in this repo). Paste its URL:</p>' +
        '<input type="text" id="aitBridgeUrl" placeholder="https://your-relay.example or http://localhost:8787">' +
        '<div class="ait-row"><button id="aitConnect" class="ait-primary">Connect</button>' +
        '<span id="aitRoomLab" style="font:600 12px var(--mono,monospace);align-self:center"></span></div>' +
        '<p class="ait-note">Then copy the tutor link again — it will include your session code ' +
        'for your AI’s MCP connector.</p>' +
      '</div>' +
      '<p class="ait-note">The page never contacts an AI by itself. Your AI can point, highlight ' +
      'and talk — it cannot click, type, or change your work.</p>';
    toggle.appendChild(panel);

    btn.onclick = function (e) { e.stopPropagation(); panel.classList.toggle("open"); };
    panel.onclick = function (e) { e.stopPropagation(); };
    document.addEventListener("click", function () { panel.classList.remove("open"); });

    var copied = panel.querySelector("#aitCopied");
    function flash(t) { copied.textContent = t; clearTimeout(flash._t); flash._t = setTimeout(function () { copied.textContent = ""; }, 4000); }

    panel.querySelectorAll(".ait-pick").forEach(function (b) {
      b.onclick = function () {
        state.ai = AI_PRESETS[b.dataset.ai]; paintCursor();
        panel.querySelectorAll(".ait-pick").forEach(function (x) { x.classList.toggle("on", x === b); });
      };
    });

    panel.querySelector("#aitCopyLink").onclick = function () {
      copyText(tutorPrompt()).then(function () { flash("Copied — paste it into " + ai().name + "."); });
    };
    panel.querySelector("#aitCopyCtx").onclick = function () {
      copyText(contextSnippet()).then(function () { flash("Copied — paste it into your AI chat."); });
    };
    panel.querySelector("#aitDemo").onclick = function () { panel.classList.remove("open"); runDemo(); };

    var pasteBox = panel.querySelector("#aitPasteBox");
    panel.querySelector("#aitPaste").onclick = function () {
      pasteBox.style.display = pasteBox.style.display === "none" ? "block" : "none";
    };
    panel.querySelector("#aitRunPaste").onclick = function () {
      var ta = pasteBox.querySelector("textarea"), msg = panel.querySelector("#aitPasteMsg");
      var cmds = parsePasted(ta.value);
      if (!cmds.length) { msg.textContent = "No aitutor commands found in that."; return; }
      msg.textContent = "Running " + cmds.length + " command" + (cmds.length > 1 ? "s" : "") + "…";
      panel.classList.remove("open");
      ta.value = "";
      execScript(cmds).then(function () { msg.textContent = ""; });
    };

    var live = panel.querySelector("#aitLive");
    panel.querySelector("#aitLiveBtn").onclick = function () { live.classList.toggle("open"); };

    var urlIn = panel.querySelector("#aitBridgeUrl");
    try { urlIn.value = new URLSearchParams(location.search).get("bridge") ||
                        localStorage.getItem("ait_bridge") || ""; } catch (e) {}
    if (urlIn.value) live.classList.add("open");

    ui.setStatus = function () {
      var dot = panel.querySelector("#aitDot"), lab = panel.querySelector("#aitLiveState");
      var room = panel.querySelector("#aitRoomLab");
      var on = state.bridge && state.bridge.alive;
      dot.classList.toggle("on", !!on);
      lab.textContent = on ? "— connected as " + ai().name : state.bridge ? "— reconnecting…" : "— not connected";
      room.textContent = state.room ? "session code: " + state.room : "";
    };

    panel.querySelector("#aitConnect").onclick = function () {
      var base = urlIn.value.trim();
      if (!base) return;
      if (!/^https?:\/\//.test(base)) base = "https://" + base;
      try { localStorage.setItem("ait_bridge", base); } catch (e) {}
      if (state.bridge) state.bridge.close();
      state.room = state.room ||
        Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 5).toUpperCase();
      state.bridge = connectBridge(base, state.room, ui.setStatus);
      ui.setStatus();
    };

    /* auto-connect when a bridge was handed over in the URL (a teacher can hand out one link) */
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.get("bridge")) {
        state.room = (qs.get("room") || "").toUpperCase() ||
          Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 5).toUpperCase();
        var base = qs.get("bridge");
        if (!/^https?:\/\//.test(base)) base = "https://" + base;
        state.bridge = connectBridge(base, state.room, ui.setStatus);
        live.classList.add("open");
      }
    } catch (e) {}
    ui.setStatus();
  }

  /* ---------------- public API — any transport, the console, or tests ---------------- */

  window.AITutor = {
    exec: exec,
    run: execScript,
    state: labSnapshot,
    parse: parsePasted,
    demo: runDemo,
    ask: function (q) {                       // student-side: queue a question for the AI
      state.asks.push({ q: String(q), at: new Date().toISOString(),
                        pointer: state.pointer.target && state.pointer.target.label });
      if (state.bridge) state.bridge.event("ask", { q: String(q) });
    },
    _internals: { findTextRange: findTextRange, describeEl: describeEl, resolveTarget: resolveTarget },
  };

  /* ---------------- boot ---------------- */

  function boot() { buildUI(); hookKcheck(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
