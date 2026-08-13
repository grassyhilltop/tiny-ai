/* ai-tutor.js, bring-your-own-AI teaching assistant for the tiny-ai lab.

   The mental model is a collaborator on a shared Google Doc. The student keeps using the AI
   they already have (Claude, ChatGPT, app or voice mode); this file gives that AI presence on
   the page: a labelled cursor it can move, Docs-style text highlighting with a blinking caret,
   collaborator badges in the head row, and a live view of what the STUDENT is pointing at,
   hovering, or selecting.

   Four tiers, degrading gracefully:
     1. Static: the page + AGENTS.md brief any LLM that fetches the URL into Socratic-tutor mode.
        (No code here involved, see the hidden "for AI assistants" block in index.html.)
     2. Paste loop: the student copies a context snippet to their AI; the AI replies with
        ```aitutor``` command blocks the student pastes back. Zero infrastructure.
     3. LIVE, the default we sell: the page holds an SSE subscription to a public ntfy.sh
        topic pair named by a room code. The student's AI needs nothing but the ability to
        fetch a URL: it reads page state from one topic (plain GET) and publishes presence
        commands to the other (GET with the JSON in the query string). No server of ours,
        no account, no connector setup. One click copies the invite, one paste starts it.
     4. MCP bridge: tutor-bridge/server.mjs, for classrooms that want a self-hosted relay
        and a real MCP connector. Optional, nothing contacts it unless a URL is typed.

   Deliberate limits: the AI can point, highlight, and speak in a bubble. It cannot click,
   type, scroll-jack (it may request a scroll to what it points at), or navigate. A tutor
   that can do the exercise for you is not a tutor, and this is a classroom prototype.

   Privacy: the page performs NO tutor networking on an organic visit. The relay is contacted
   only when the URL carries a ?room= (a shared or reloaded session link) or the student
   copies the invite on purpose. What transits the relay: small page-state snapshots (knob
   values, section in view, pointer target, selections) and the presence commands. The tutor
   CONVERSATION never touches the relay; it lives in the student's own AI.

   This is a classic deferred script ON PURPOSE: the lab's inline script declares its state
   (P, P0, f, stage, focusId, ...) with top-level const/let, which live in the shared global
   lexical scope, reachable from another classic script, invisible to a module. Every read
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
  /* Docs-style palette for human peers who join the room from a shared link */
  var PEER_COLORS = ["#2e6da4", "#237841", "#b0529f", "#c89b1f", "#6a5acd", "#0d8a8a"];

  var state = {
    ai: null,                    // {name, color} once known (hello cmd or panel pick)
    bridge: null,                // MCP bridge client, when connected (tier 4)
    room: null,                  // session room code, always set at boot
    live: null,                  // null | "invited" (invite copied, waiting) | "here"
    joinedViaLink: false,        // arrived with ?room= already in the URL
    pointer: { x: null, y: null, target: null, at: 0 },
    selection: null,             // {text, target}
    asks: [],                    // student utterances queued for the AI ("what is this?")
    kcheck: null,                // last knowledge-check sentence submitted
    lastSay: null,
    demoRunning: false,
    peers: {},                   // id -> {name, color, el, at}
  };
  function ai() { return state.ai || AI_PRESETS.claude; }

  /* Where the static tutor briefing lives, relative to wherever this copy of the lab is
     served from (staging or live), so the copied prompt always points at itself. */
  var PAGE_URL = location.origin + location.pathname.replace(/index\.html$/, "");
  var AGENTS_URL = PAGE_URL + "AGENTS.md";

  var REDUCED = false;
  try { REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  /* ---------------- the room code ----------------
     Four characters, like casting to a classroom screen. It is the session's name AND its
     only secret, so the alphabet drops lookalikes (0/O, 1/I/L, 5/S...). A fresh visit mints
     a fresh code; a URL that already carries ?room= keeps it, which is how a reload keeps a
     live AI session and how a shared link puts a classmate or teacher in the same room. */

  var ROOM_ABC = "ACDEFHJKMNPRTWXY34679";
  function mintRoom() {
    var s = "", i;
    var a = new Uint32Array(4);
    try { crypto.getRandomValues(a); } catch (e) { for (i = 0; i < 4; i++) a[i] = Math.random() * 1e9; }
    for (i = 0; i < 4; i++) s += ROOM_ABC[a[i] % ROOM_ABC.length];
    return s;
  }
  (function initRoom() {
    var qs = null;
    try { qs = new URLSearchParams(location.search); } catch (e) {}
    var fromUrl = qs && (qs.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    state.joinedViaLink = !!fromUrl;
    state.room = fromUrl || mintRoom();
  })();
  /* The room lands in the URL only when the session becomes real (invite or room link
     copied), NOT at boot. Stamping it on every organic visit was tried and reverted: the
     next reload was indistinguishable from a shared link, so the page auto-joined the relay
     and the no-network-before-opt-in promise quietly broke. */
  function stampRoomInUrl() {
    try {
      var qs = new URLSearchParams(location.search);
      qs.set("room", state.room);
      history.replaceState(null, "", location.pathname + "?" + qs + location.hash);
    } catch (e) {}
  }
  function roomUrl() {
    return location.origin + location.pathname + "?room=" + state.room;
  }

  /* ---------------- the semantic map ----------------
     "The student is at (612, 404)" is useless to a language model. This map turns DOM
     positions into teachable things: which knob, which graph, which section. Order matters,
     first match wins, most specific first. */

  var TARGETS = [
    ["#doseKnob",   "dose",     "the dose dial, x, the input, 0 to 10 mg"],
    ["#doseHud",    "dose",     "the dose HUD card (dial plus current x in mg)"],
    ["#fxHud",      "results",  "the Results card, predicted vs actual happiness"],
    ["#giveBtn",    "give",     "the 'Give the dose' button, runs one real trial, adds a data point"],
    ["#c3d",        "scene",    "the 3D scene, black box (the model), patient, dials on the box front"],
    ["#step0card",  "sec:1",    "step 1 card, a straight line, two knobs: m (slope) and c (starting height)"],
    ["#stagecard1", "sec:2",    "step 2 card, teach the line to bend (ReLU hinge appears)"],
    ["#netcard",    "sec:2",    "the 2-neuron machine diagram, weights are just knobs"],
    ["#codoncard",  "sec:2",    "the same machine written in codon (visual language)"],
    ["#bpcard",     "sec:3",    "backprop card, the automatic hand that turns knobs"],
    ["#quizcard",   "quiz",     "section 4, the tiny test, predict from YOUR trained line, 3 in a row"],
    ["#quizIn",     "quiz",     "the quiz answer box (happiness 0 to 100)"],
    ["#checkcard",  "kcheck",   "section 5, checking in, the one-sentence knowledge check"],
    ["#kcheck",     "kcheck",   "the knowledge-check sentence box: what does training a model actually do?"],
    ["#npsCard",    "sec:6",    "the feedback card (0 to 10 dial)"],
    ["#wrapcard",   "sec:7",    "the wrap-up, what you just did, in AI Fluency terms"],
    ["#bonuscard",  "sec:8",    "the bonus build-a-neuron canvas"],
    ["#challenge",  "challenge","the challenge statement and the before-you-start confidence question"],
    [".challengeline", "challenge", "the challenge sentence: teach the machine to pick the right dose"],
    [".tailorbar",  "fluency",  "the AI-experience slider (1 beginner, 7 pro)"],
  ];

  var SECTION_ANCHORS = {
    "sec:1": "#step0card", "sec:2": "#stagecard1", "sec:3": "#bpcard",
    "sec:4": "#quizcard",  "quiz": "#quizcard",
    "sec:5": "#checkcard", "kcheck": "#checkcard",
    "sec:6": "#npsCard",   "sec:7": "#wrapcard", "sec:8": "#bonuscard",
    "dose": "#doseKnob",   "scene": "#c3d",      "give": "#giveBtn",
    "results": "#fxHud",   "challenge": "#challenge", "fluency": ".tailorbar",
  };

  /* Friendly names for the model's knobs. DISP in the lab maps slots to printed labels
     (w1 -> m1 ...), but the words below are what a tutor would actually say. */
  var KNOB_WORDS = {
    m:  "the m knob (step 1's slope: how fast happiness rises per mg)",
    c:  "the c knob (step 1's starting height at zero dose)",
    w1: "w1 (m, the slope: how fast happiness rises per mg)",
    b1: "b1 (c, the starting height at zero dose)",
    w2: "w2 (slope of the second neuron, the downhill side)",
    b2: "b2 (where the second bend sits)",
    w3: "w3 (how much of neuron 1 reaches the output)",
    w4: "w4 (how much of neuron 2 reaches the output, negative pulls down)",
    b3: "b3 (the output's floor)",
  };

  function resolveTarget(spec) {
    if (!spec) return null;
    if (typeof spec === "object" && spec.nodeType === 1) return spec;
    spec = String(spec).trim();
    if (SECTION_ANCHORS[spec]) spec = SECTION_ANCHORS[spec];
    var m = /^knob:(\w+)$/.exec(spec);
    if (m) {
      /* step 1's own pair lives outside knobEls (it drives P0, not P) */
      if (m[1] === "m" || m[1] === "c") {
        var pair = document.querySelectorAll("#knobs0 canvas");
        return pair[m[1] === "m" ? 0 : 1] || document.getElementById("step0card");
      }
      try { var els = knobEls[m[1]]; if (els && els.length) return els[0].c; } catch (e) {}
      /* an unknown or not-yet-unlocked knob is an error the AI should hear about, not a
         silent redirect to the dose dial (which pointed at the wrong thing convincingly) */
      return null;
    }
    try { return document.querySelector(spec); } catch (e) { return null; }
  }

  /* What is the student's pointer over, in words? Climb from the element to the most
     specific entry in TARGETS; name knobs individually via the lab's own knobEls table. */
  function describeEl(el) {
    if (!el || el.nodeType !== 1) return null;
    var knob = knobName(el);
    if (knob) return { key: "knob:" + knob, sel: null, label: KNOB_WORDS[knob] || ("the " + knob + " knob") };
    if (el.tagName === "CANVAS" && el.closest && el.closest("#knobs0")) {
      var pair = document.querySelectorAll("#knobs0 canvas");
      var which = pair[0] === el ? "m" : "c";
      return { key: "knob:" + which, sel: null, label: KNOB_WORDS[which] };
    }
    for (var node = el; node && node !== document.body; node = node.parentElement) {
      for (var i = 0; i < TARGETS.length; i++) {
        try { if (node.matches(TARGETS[i][0])) return { key: TARGETS[i][1], sel: TARGETS[i][0], label: TARGETS[i][2] }; } catch (e) {}
      }
    }
    var h = el.closest && el.closest("h2");
    if (h) return { key: "heading", sel: null, label: 'the heading "' + h.textContent.trim() + '"' };
    var txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90);
    return { key: el.id ? "#" + el.id : el.tagName.toLowerCase(), sel: el.id ? "#" + el.id : null,
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
    var s = { url: location.href, room: state.room, at: new Date().toISOString() };
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
    try { s.loss = +loss().toFixed(5);
          s.loss_note = "fit of the shared model (sections 2+); step 1's line scores separately"; } catch (e) {}
    try { s.dose_mg = +(doseFrac * 10).toFixed(1); } catch (e) {}
    try { s.data_points = DATA.length; } catch (e) {}
    try { s.quiz = { started: qStarted, streak: qStreak,
                     current_case_mg: qDose == null ? null : +(qDose * 10).toFixed(1) }; } catch (e) {}
    /* deliberately NOT the live textarea: the draft streams to a public topic guarded by a
       four-letter code, so the sentence travels only once the student presses save */
    s.student_pointer = state.pointer.target
      ? { over: state.pointer.target.label, seconds_ago: +((Date.now() - state.pointer.at) / 1000).toFixed(1) }
      : null;
    s.student_selection = state.selection || null;
    if (state.asks.length) s.student_asked = state.asks.slice(-3);
    if (state.kcheck) s.knowledge_check_submitted = state.kcheck;
    return s;
  }

  /* A SMALL, readable state for the relay read channel. Two reasons it is not labSnapshot:
     the relay path serves each message as one text/plain line (ntfy /raw), so a fetch tool
     that summarises pages with a small model parses a short flat object far better than a
     pretty-printed blob; and it keeps messages tiny on a shared free relay. Everything a
     tutor asks "where am I, what did I do" is here; the console/bridge still get the full
     labSnapshot. */
  function relayState() {
    /* a clock on every line: /raw carries no ids or timestamps, so without this a tutor
       reading a truncated or replayed body has no way to tell now from twenty minutes ago */
    var d = new Date();
    var s = { at: d.toTimeString().slice(0, 8), room: state.room };
    try { var e = FOCUS.find(function (r) { return r[0] === focusId; }); s.section = e ? e[1] : focusId; } catch (x) {}
    try { s.stage = stage; } catch (x) {}
    try { s.dose_mg = +(doseFrac * 10).toFixed(1); } catch (x) {}
    try { s.step1 = { m: +P0.m.toFixed(2), c: +P0.c.toFixed(2) }; } catch (x) {}
    try { var sm = {}; stageKnobs().forEach(function (n) { sm[n] = +P[n].toFixed(2); }); s.model = sm; } catch (x) {}
    try { s.loss = +loss().toFixed(4); } catch (x) {}
    try { s.data_points = DATA.length; } catch (x) {}
    try { s.quiz = qStarted ? (qStreak + "/3" + (qDose != null ? ", case " + (+(qDose * 10).toFixed(1)) + "mg" : "")) : "not started"; } catch (x) {}
    s.mouse_over = state.pointer.target ? state.pointer.target.label : null;
    s.selected = state.selection ? state.selection.text : null;
    if (state.kcheck) s.section5_sentence = state.kcheck;
    return s;
  }

  /* ---------------- styles ---------------- */

  var css = document.createElement("style");
  css.textContent = [
    /* presence layer: everything absolute in DOCUMENT coordinates so scrolling needs no
       bookkeeping. Appended to <html>, not .wrap, an ancestor with transform/filter would
       re-anchor these (the knob guide learned this the hard way). */
    "#aitLayer{position:absolute;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147482800;pointer-events:none}",
    "#aitLayer *{pointer-events:none;box-sizing:border-box}",
    /* THE ID IN THAT SELECTOR OUTRANKS EVERY CLASS. `#aitLayer *` is specificity 1-0-0, so a
       later `.ait-cursor.ait-int{pointer-events:auto}` (0-2-0) loses and the element stays
       untouchable. The cursor, the bubble's close button and the invite button all looked
       interactive and were not; probes missed it because dispatchEvent skips hit-testing.
       Anything here that must accept a real click needs the id in front of it, and needs
       testing with elementFromPoint, not dispatchEvent. */
    "#aitLayer .ait-cursor.ait-int,#aitLayer .ait-cursor.ait-int *{pointer-events:auto}",
    "#aitLayer .ait-bubble,#aitLayer .ait-bubble *{pointer-events:auto}",
    /* a 20x22 arrow is a dart-throw for a mouse and impossible on a phone: this invisible
       pad widens the target to a comfortable one, and the name tag is clickable too */
    ".ait-cursor .ait-hit{position:absolute;left:-14px;top:-12px;width:48px;height:46px;border-radius:14px}",
    /* no will-change here: it promotes the cursor to a permanent compositor layer for the
       life of the page to speed up moves that happen a handful of times. It is set on the
       element only while it is actually travelling, and dropped when it lands. */
    ".ait-cursor{position:absolute;left:0;top:0;transition:opacity .6s}",
    ".ait-cursor svg{display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}",
    /* the cursor is a door as well as a pointer: before an AI is live it accepts clicks and
       invites them. While an AI drives it, it goes ghost so it can never eat a student click. */
    ".ait-cursor.ait-int{pointer-events:auto;cursor:pointer}",
    ".ait-cursor.ait-int:hover svg{transform:scale(1.18);transition:transform .18s}",
    /* hovering the parked cursor brings it fully back: it is faded because it is waiting,
       not because it is disabled, and a reader who points at it is asking what it is */
    ".ait-cursor.ait-hot{opacity:1 !important}",
    /* riding a card's corner, the name tag stands down after its entrance so it is not
       sitting on the reader's words; hover (or a new section) brings it back */
    ".ait-cursor .ait-flag{transition:opacity .35s,transform .35s}",
    /* docked at a card's top-right corner the name tag would run off the edge of the window,
       so it swaps to the other side of the arrow instead of being clipped */
    ".ait-cursor.ait-flip .ait-flag{left:auto;right:9px}",
    ".ait-cursor.ait-quiet .ait-flag{opacity:0;transform:translateX(-6px)}",
    ".ait-cursor.ait-quiet:hover .ait-flag,.ait-cursor.ait-hot .ait-flag{opacity:1;transform:none}",
    /* THREE pulses, not infinite. An animation that never stops keeps a composited, filtered
       layer repainting for as long as the tab is open, on a page whose whole perf story is
       "frames are the fan dial" and whose idle duty is meant to be a fraction of a percent.
       Three breaths say "I am alive, click me"; the fourth is just heat. Hovering re-arms it. */
    ".ait-cursor.ait-breathe svg{animation:aitbreathe 3.2s ease-in-out 3}",
    "@keyframes aitbreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.09)}}",
    ".ait-cursor.ait-wave svg{animation:aitwave .9s ease-in-out 1}",
    "@keyframes aitwave{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}55%{transform:rotate(10deg)}}",
    ".ait-flag{position:absolute;left:13px;top:17px;white-space:nowrap;font:600 11px/1.8 var(--sans,system-ui);color:#fff;padding:0 8px;border-radius:9px;letter-spacing:.2px;box-shadow:0 1px 3px rgba(0,0,0,.2)}",
    ".ait-ring{position:absolute;border:2.5px solid;border-radius:50%;opacity:0;animation:aitring 1s ease-out 2}",
    "@keyframes aitring{0%{transform:scale(.4);opacity:.9}100%{transform:scale(1.5);opacity:0}}",
    ".ait-caret{position:absolute;width:2px;animation:aitblink 1s steps(1) infinite}",
    ".ait-caret .ait-flag{left:-2px;top:-20px}",
    "@keyframes aitblink{50%{opacity:0}}",
    ".ait-mark{position:absolute;border-radius:2px;mix-blend-mode:multiply}",
    /* the speech bubble. width:max-content is doing real work: #aitLayer is a 0x0 box, so an
       absolutely positioned child has zero available width and shrink-to-fit collapses the
       bubble to its longest WORD, one word per line down the page. max-width alone cannot
       rescue that: it caps a width the bubble never had. */
    /* text-wrap:balance evens the lines out, which is what kills the ragged shelf of empty
       space on the right that a max-content box leaves after wrapping */
    ".ait-bubble{position:absolute;width:max-content;max-width:min(320px,calc(100vw - 34px));font:400 14px/1.5 var(--sans,system-ui);text-wrap:balance;color:var(--ink,#1f1d1a);background:var(--bg-elev,#fffdf7);border:1px solid var(--rule,#d9d2c4);border-radius:14px;padding:10px 14px 11px;box-shadow:0 6px 24px rgba(0,0,0,.14);opacity:0;transform:translateY(4px);transition:opacity .25s,transform .25s;cursor:default}",
    ".ait-bubble.ait-wide{max-width:min(400px,calc(100vw - 34px))}",
    ".ait-bubble .ait-title{font:700 14.5px/1.35 var(--sans,system-ui);margin:0 0 4px}",
    ".ait-bubble .ait-steps{margin:8px 0 2px;padding:0;list-style:none;counter-reset:s}",
    ".ait-bubble .ait-steps li{counter-increment:s;position:relative;padding-left:23px;margin:5px 0;font-size:13.5px;line-height:1.45;color:var(--ink-soft,#4c463c)}",
    ".ait-bubble .ait-steps li:before{content:counter(s);position:absolute;left:0;top:1px;width:16px;height:16px;border-radius:50%;background:var(--ink,#1f1d1a);color:#fff;font:700 10px/16px var(--sans,system-ui);text-align:center}",
    ".ait-bubble .ait-room{display:inline-block;margin-top:8px;font:700 12px var(--mono,monospace);letter-spacing:2px;background:var(--bg,#f6f1e7);border:1px solid var(--rule,#d9d2c4);border-radius:7px;padding:4px 9px}",
    ".ait-bubble.ait-on{opacity:1;transform:translateY(0)}",
    ".ait-bubble .ait-who{display:flex;align-items:center;gap:6px;font:700 11px/1 var(--sans,system-ui);letter-spacing:.5px;text-transform:uppercase;margin:0 0 5px}",
    ".ait-bubble .ait-who i{width:8px;height:8px;border-radius:50%;flex:none}",
    /* the dismiss button rides OUTSIDE the corner: inside, it needed a wide right padding
       reserved across every line, which read as a slab of dead space in short bubbles */
    ".ait-bubble .ait-x{position:absolute;top:-9px;right:-9px;width:21px;height:21px;border-radius:50%;background:var(--bg-elev,#fffdf7);border:1px solid var(--rule,#d9d2c4);box-shadow:0 1px 4px rgba(0,0,0,.14);color:var(--ink-mute,#7a7263);font:400 13px/19px var(--sans,system-ui);text-align:center;cursor:pointer}",
    ".ait-bubble .ait-x:hover{color:var(--ink,#1f1d1a);border-color:var(--ink-soft,#4c463c)}",
    ".ait-bubble .ait-act{display:block;margin:9px 0 1px;font:600 12.5px var(--sans,system-ui);padding:7px 12px;border:1px solid var(--ink,#1f1d1a);border-radius:9px;background:var(--ink,#1f1d1a);color:#fff;cursor:pointer;width:auto;height:auto}",
    /* the tail, on the side facing the speaker: --tx/--ty are set from the cursor's tip, so
       it keeps pointing at the arrow even when clamping slid the bubble along an edge */
    ".ait-bubble:before{content:'';position:absolute;width:10px;height:10px;background:inherit;border-left:1px solid var(--rule,#d9d2c4);border-top:1px solid var(--rule,#d9d2c4)}",
    ".ait-bubble.ait-above:before{bottom:-6px;left:var(--tx,16px);transform:rotate(225deg)}",
    ".ait-bubble.ait-below:before{top:-6px;left:var(--tx,16px);transform:rotate(45deg)}",
    ".ait-bubble.ait-right:before{left:-6px;top:var(--ty,16px);transform:rotate(-45deg)}",
    ".ait-bubble.ait-left:before{right:-6px;top:var(--ty,16px);transform:rotate(135deg)}",

    /* collaborator badges, Google-Docs style: overlapping circles in the head row. They sit
       inside .viewtoggle, whose own rule pins BUTTONS to 27px squares; these are divs, so
       only the chip below needs the width override. */
    "#aitBadges{display:flex;align-items:center;margin:0 2px 0 0;padding-left:7px;cursor:pointer}",
    ".ait-badge{position:relative;width:27px;height:27px;border-radius:50%;margin-left:-7px;border:2px solid var(--bg-elev,#fffdf7);display:flex;align-items:center;justify-content:center;font:700 10px/1 var(--sans,system-ui);color:#fff;flex:none;box-shadow:0 1px 3px rgba(0,0,0,.18);transition:transform .15s}",
    "#aitBadges:hover .ait-badge{transform:translateY(-1px)}",
    ".ait-badge svg{width:13px;height:13px;display:block}",
    ".ait-badge .ait-dot2{position:absolute;right:-2px;bottom:-2px;width:9px;height:9px;border-radius:50%;border:2px solid var(--bg-elev,#fffdf7);background:#b9b2a4}",
    ".ait-badge.ait-waiting .ait-dot2{background:#c89b1f;animation:aitblink 1.2s steps(1) infinite}",
    ".ait-badge.ait-live .ait-dot2{background:#237841}",

    /* the CTA chip and its panel, styled to sit beside the gear without stealing the landing.
       The one labelled chip in a row of 27px icon squares: same height, its own width,
       .viewtoggle button pins width:27px, so the id must override it. */
    "#aitBtn{display:inline-flex;align-items:center;gap:5px;width:auto;height:27px;padding:0 9px;white-space:nowrap;font:600 12.5px var(--sans,system-ui);cursor:pointer}",
    /* the paste pill: in the apps where an AI cannot drive the page directly, this is the
       whole command channel, so it is one click and not three levels down a panel */
    "#aitApply{display:none;align-items:center;gap:5px;width:auto;height:27px;padding:0 9px;white-space:nowrap;font:600 12.5px var(--sans,system-ui);cursor:pointer;border-color:var(--accent,#c4632c);color:var(--accent,#c4632c)}",
    "#aitApply.on{display:inline-flex}",
    "@media (max-width:640px){#aitApply span{display:none}#aitApply{padding:0 7px}}",
    "@media (max-width:640px){#aitBtn span{display:none}#aitBtn{padding:0 7px}}",
    "#aitPanel{display:none;position:absolute;right:0;top:calc(100% + 8px);width:min(360px,calc(100vw - 24px));background:var(--bg-elev,#fffdf7);border:1px solid var(--rule,#d9d2c4);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.16);padding:14px 15px;z-index:60;text-align:left;font:400 13px/1.5 var(--sans,system-ui);color:var(--ink,#1f1d1a);cursor:default}",
    "#aitPanel.open{display:block}",
    "#aitPanel h3{margin:0 0 6px;font:700 14.5px var(--sans,system-ui)}",
    "#aitPanel p{margin:6px 0;color:var(--ink-soft,#4c463c)}",
    "#aitPanel .ait-row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;align-items:center}",
    /* width/height:auto matters: these buttons sit inside .viewtoggle, whose rule pins every
       button to a 27px icon square, and that rule still applies where this one is silent */
    "#aitPanel button{width:auto;height:auto;font:600 12.5px var(--sans,system-ui);padding:7px 11px;border:1px solid var(--ink,#1f1d1a);border-radius:9px;background:var(--bg-elev,#fffdf7);cursor:pointer}",
    "#aitPanel button.ait-primary{background:var(--ink,#1f1d1a);color:#fff;font-size:13px;padding:9px 14px;width:100%;justify-content:center;display:inline-flex;gap:7px}",
    "#aitPanel button:disabled{opacity:.45;cursor:default}",
    "#aitPanel .ait-pick{border-radius:999px;padding:5px 11px;border-color:var(--rule,#d9d2c4)}",
    "#aitPanel .ait-pick.on{outline:2px solid currentColor}",
    "#aitPanel .ait-note{font-size:11.5px;color:var(--ink-mute,#7a7263);margin-top:8px}",
    "#aitPanel .ait-ok{color:var(--visited,#237841);font-weight:600}",
    "#aitPanel textarea{width:100%;font:400 12px var(--mono,monospace);border:1px solid var(--rule,#d9d2c4);border-radius:8px;padding:6px;margin-top:6px;box-sizing:border-box}",
    "#aitPanel details{border-top:1px dashed var(--rule,#d9d2c4);margin-top:10px;padding-top:8px}",
    "#aitPanel summary{cursor:pointer;font:600 12px var(--sans,system-ui);color:var(--ink-soft,#4c463c)}",
    "#aitPanel .ait-roomchip{font:700 17px/1 var(--mono,monospace);letter-spacing:3px;background:var(--bg,#f6f1e7);border:1px solid var(--rule,#d9d2c4);border-radius:9px;padding:7px 12px;cursor:pointer;display:inline-block}",
    "#aitPanel .ait-roomchip:hover{border-color:var(--ink-soft,#4c463c)}",
    "#aitPanel .ait-roomchip small{display:block;font:600 9.5px var(--sans,system-ui);letter-spacing:.8px;color:var(--ink-mute,#7a7263);margin-bottom:3px}",
    "#aitPanel .ait-status{display:flex;align-items:center;gap:7px;font:600 12.5px var(--sans,system-ui);margin:8px 0 2px}",
    "#aitPanel .ait-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#b9b2a4;flex:none}",
    "#aitPanel .ait-dot.wait{background:#c89b1f;animation:aitblink 1.2s steps(1) infinite}",
    "#aitPanel .ait-dot.on{background:#237841}",
    "#aitKcheckNudge{font:600 12.5px var(--sans,system-ui);margin-left:10px}",
    "#aitKcheckNudge a{cursor:pointer;text-decoration:underline}",
    /* a small toast for arrivals: slides in under the badges, gets out of the way on its own */
    "#aitToast{position:fixed;top:44px;right:14px;z-index:2147482900;font:600 12.5px var(--sans,system-ui);color:var(--ink,#1f1d1a);background:var(--bg-elev,#fffdf7);border:1px solid var(--rule,#d9d2c4);border-radius:999px;padding:7px 13px;box-shadow:0 6px 20px rgba(0,0,0,.15);opacity:0;transform:translateY(-6px);transition:opacity .3s,transform .3s;pointer-events:none;display:flex;align-items:center;gap:7px}",
    "#aitToast.on{opacity:1;transform:translateY(0)}",
    "#aitToast i{width:8px;height:8px;border-radius:50%;flex:none}",
    /* the presence layer sits above everything so it can point at anything, which means it
       also sits above the panel: while the panel is open the tutor's own cursor and bubble
       stand down rather than covering the words the reader just asked to see */
    "html.ait-panel .ait-cursor,html.ait-panel .ait-bubble{opacity:0 !important;pointer-events:none !important}",
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
    cursor.title = "Your AI tutor sits at this cursor. Click it to connect yours.";
    cursor.innerHTML =
      '<i class="ait-hit"></i>' +
      '<svg width="20" height="22" viewBox="0 0 20 22"><path d="M2 1l14 9.5-6.2 1.3L13 20l-3.4 1.4-3.2-8.2L2 17z"/></svg>' +
      '<span class="ait-flag"></span>';
    /* The cursor is the feature's front door, so what a click does depends on where the
       reader is. At the top of the page it replays the tour (somebody who missed it on load
       and got curious). Inside the lesson, curiosity means "how do I get help HERE", so it
       offers the live session with the invite one click away. */
    cursor.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!cursor.classList.contains("ait-int")) return;
      /* acknowledge in the same frame as the click. Everything after this takes hundreds of
         milliseconds (a glide, then a bubble), and without an instant tell the click feels
         like it missed, which is exactly how the dead-click bug felt before it was found. */
      waveCursor();
      showFlagFor(0);
      if (dock.mode === "card") helpCTA();
      else introDemo();
    });
    cursor.addEventListener("mouseenter", function () {
      cursor.classList.add("ait-hot");
      /* the breathing is capped at three pulses, so by now it has finished; somebody with a
         pointer on it is asking what it is, which is the moment to be alive again */
      if (cursor.classList.contains("ait-int") && !REDUCED) {
        cursor.classList.remove("ait-breathe");
        void cursor.offsetWidth;
        cursor.classList.add("ait-breathe");
      }
      cursor.title = dock.mode === "card"
        ? "Click me: get " + ai().name + " tutoring you on this section"
        : "Click me: see what an AI tutor does here";
    });
    cursor.addEventListener("mouseleave", function () { cursor.classList.remove("ait-hot"); });
    layer.appendChild(cursor);
    paintCursor();
    return cursor;
  }
  function paintCursor() {
    if (!cursor) return;
    cursor.querySelector("path").setAttribute("fill", ai().color);
    var flag = cursor.querySelector(".ait-flag");
    flag.style.background = ai().color;
    flag.textContent = (state.live === "here" || state.ai) ? ai().name + " · AI" : ai().name + " · your AI tutor";
  }
  /* Clickable only while it belongs to nobody: parked, no live AI, nothing animating.
     The moment an AI drives it (or it glides somewhere) it goes ghost, so a student click
     aimed at a knob can never land on the tutor's cursor instead. */
  function setCursorInteractive(on) {
    if (!cursor) return;
    cursor.classList.toggle("ait-int", !!on);
    cursor.classList.toggle("ait-breathe", !!on && !REDUCED);
  }
  function bumpIdle() {
    ensureCursor().style.opacity = "1";
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (cursor) cursor.style.opacity = "0.35"; }, 9000);
  }
  /* Document-space move. A cursor that teleports reads as a glitch and a cursor that slides
     down a straight line at constant speed reads as a robot; a hand pivots, so the path bows
     perpendicular to the travel (a quadratic Bezier) and the speed eases in and out. The
     duration follows the distance, because a short hop that takes as long as a long flight
     is the other way this looks wrong. */
  var arcFlip = 1;
  function cursorTo(x, y, ms, done) {
    if (!isFinite(x) || !isFinite(y)) return;    // belt to the exec-side braces
    ensureCursor(); bumpIdle();
    setCursorInteractive(false);
    /* a speech bubble belongs to where the cursor WAS: take it down before leaving, or it
       hangs over the scene talking about something the cursor has already left behind */
    killBubble();
    var fx = cursorPos.x, fy = cursorPos.y, t0 = performance.now();
    if (fx === 0 && fy === 0) { fx = x + 120; fy = y + 160; }   // first appearance: arrive from below
    var dx = x - fx, dy = y - fy, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (ms == null) ms = Math.min(2100, Math.max(560, 380 + dist * 0.85));
    if (REDUCED) ms = 0;
    arcFlip = -arcFlip;                          // alternate the bow so repeats do not trace one groove
    var bow = Math.min(110, dist * 0.16) * arcFlip;
    var cxp = (fx + x) / 2 + (-dy / dist) * bow; // control point, perpendicular to the travel
    var cyp = (fy + y) / 2 + (dx / dist) * bow;
    if (cursorAnim) cancelAnimationFrame(cursorAnim);
    cursor.style.willChange = "transform";       // only for the duration of the flight
    (function step() {
      var u = ms <= 0 ? 1 : Math.min(1, (performance.now() - t0) / ms);
      var e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;   // easeInOutCubic
      var k = 1 - e;
      cursorPos.x = k * k * fx + 2 * k * e * cxp + e * e * x;
      cursorPos.y = k * k * fy + 2 * k * e * cyp + e * e * y;
      cursor.style.transform = "translate(" + cursorPos.x + "px," + cursorPos.y + "px)";
      if (u < 1) { cursorAnim = requestAnimationFrame(step); }
      else {
        cursorAnim = null;
        cursor.style.willChange = "auto";        // let the layer go
        orientFlag();
        if (done) done();
      }
    })();
  }
  /* keep the name tag inside the window: hanging right by default, flipped left when the
     cursor is parked near the right edge (which is exactly where it docks) */
  function orientFlag() {
    if (!cursor) return;
    cursor.classList.toggle("ait-flip",
      cursorPos.x + 13 + flagWidth() > scrollX + innerWidth - 10);
  }
  function waveCursor() {
    if (!cursor || REDUCED) return;
    cursor.classList.remove("ait-wave");
    void cursor.offsetWidth;                     // restart the animation
    cursor.classList.add("ait-wave");
    setTimeout(function () { cursor && cursor.classList.remove("ait-wave"); }, 1000);
  }
  /* ---------------- where the cursor sits when nobody is driving it ----------------
     Two docks. At the top of the page it is the AI's empty seat under the collaborator
     badges, label showing, because that is the invitation. Once the reader scrolls into the
     lesson it follows them: it parks in the top-right corner of whatever card they are
     working in, like a teammate who moved chairs, and drops its label a couple of seconds
     later so a name tag is not sitting on top of the words. */

  var dock = { mode: "home", card: null, flagTimer: null };

  function flagWidth() {
    if (!cursor) return 96;
    var f = cursor.querySelector(".ait-flag");
    return (f && f.offsetWidth) || 96;
  }
  function homeSpot() {
    var b = document.getElementById("aitBadges");
    if (b && b.offsetWidth) { var r = docRect(b); return { x: r.left + r.width / 2 - 34, y: r.top + r.height + 26 }; }
    return { x: scrollX + innerWidth - 130, y: scrollY + 96 };
  }
  /* inside the card's top-right corner, which is padding on every card in this lab; when the
     card's top has scrolled away the cursor rides the top of the viewport instead, so it
     stays with the reader rather than sitting above the fold being useful to nobody */
  function cardSpot(el) {
    var r = docRect(el);
    var x = r.left + r.width - 30;
    /* prefer the card's own top-right corner; ride the top of the viewport once the card's
       top has scrolled away; and stay inside the card's bottom edge. The viewport clamp goes
       LAST, because the card-bottom clamp can pull the cursor off the top of the screen when
       the reader has scrolled nearly past a short card. */
    var y = Math.max(r.top + 9, scrollY + 64);
    y = Math.min(y, r.top + r.height - 40);
    y = Math.min(Math.max(y, scrollY + 64), scrollY + innerHeight - 80);
    return { x: Math.max(scrollX + 12, x), y: y };
  }
  function parkSpot() { return dock.mode === "card" && dock.card ? cardSpot(dock.card) : homeSpot(); }
  function showFlagFor(ms) {
    if (!cursor) return;
    cursor.classList.remove("ait-quiet");
    clearTimeout(dock.flagTimer);
    if (ms) dock.flagTimer = setTimeout(function () {
      if (cursor && dock.mode === "card") cursor.classList.add("ait-quiet");
    }, ms);
  }
  function parkCursor(instant, done) {
    var p = parkSpot();
    cursorTo(p.x, p.y, instant ? 0 : null, function () {
      if (!aiHoldsCursor()) setCursorInteractive(true);
      if (done) done();
    });
  }

  /* which card is the reader in? the one covering the most of the upper half of the screen,
     which is where people read from, not the geometric middle */
  var FOLLOW_SEL = "#challenge, .stagecard";
  function currentCard() {
    var best = null, bestArea = 0, band = innerHeight * 0.62;
    var cards = document.querySelectorAll(FOLLOW_SEL);
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      if (!r.height || r.bottom < 70 || r.top > band) continue;
      var area = Math.min(r.bottom, band) - Math.max(r.top, 70);
      if (area > bestArea) { bestArea = area; best = cards[i]; }
    }
    return best;
  }
  /* How long a tutor's gesture stays "theirs". While an AI is actively pointing, the cursor
     belongs to it and must not be dragged around by scrolling. But a connected AI that has
     gone quiet (it is listening, or the student is reading) should not leave its cursor
     pinned to a paragraph half a page back: the presence layer lives in DOCUMENT coordinates,
     so an abandoned cursor scrolls away with the text and ends up in the 3D scene or off
     screen entirely. After this long with no command, the cursor goes back to its corner and
     follows the reader again, exactly as it does when nobody is connected. */
  var HOLD_MS = 25000, lastCmdAt = 0;
  function aiHoldsCursor() {
    return (state.live === "here" || state.bridge) && Date.now() - lastCmdAt < HOLD_MS;
  }
  var followTimer = null;
  function followScroll() {
    if (aiHoldsCursor()) return;                         // an AI is mid-gesture: hands off
    if (state.demoRunning || !cursor) return;
    if (panelEl && panelEl.classList.contains("open")) return;
    var top = scrollY < 80;
    var card = top ? null : currentCard();
    if (top) {
      if (dock.mode === "home") return;
      dock.mode = "home"; dock.card = null;
      showFlagFor(0);
      parkCursor();
      return;
    }
    if (!card) return;
    if (card === dock.card) {
      /* same section, but its corner may have travelled: inside a long card the dock rides
         the top of the viewport, and that is a moving target. Without this the cursor stayed
         where the card's corner USED to be and scrolled off the top of the screen, which on
         a phone happens within one flick. Only correct real drift, or it chases every pixel. */
      var want = cardSpot(card);
      /* no !cursorAnim guard here: a correction that arrives mid-glide used to be dropped and
         never retried, which is how the cursor ended up stranded above the top of a phone
         screen. cursorTo cancels the in-flight glide and re-aims from wherever it got to,
         which is exactly what is wanted, and followScroll never runs while an AI or the tour
         owns the cursor anyway. */
      if (Math.abs(want.x - cursorPos.x) + Math.abs(want.y - cursorPos.y) > 24)
        cursorTo(want.x, want.y, 420, function () {
          if (!aiHoldsCursor()) setCursorInteractive(true);
        });
      return;
    }
    dock.mode = "card"; dock.card = card;
    showFlagFor(2600);                                   // announce, then get out of the way
    parkCursor();
  }
  addEventListener("scroll", function () {
    /* scrolling away from a tour is the same statement as clicking: I have moved on. The
       tour never scrolls the page itself, so this cannot cancel itself. */
    if (state.demoRunning) { endIntro(); return; }
    if (followTimer) return;
    followTimer = setTimeout(function () { followTimer = null; followScroll(); }, 260);
  }, { passive: true });
  addEventListener("resize", function () {
    if (!state.demoRunning && state.live !== "here" && !cursorAnim) parkCursor(true);
  });
  /* Scroll events are not the only way the dock goes stale. The 3D canvas sizes itself after
     first paint and the reading column reflows under it, so a card can travel a long way with
     no scroll event at all, leaving the cursor parked where the corner used to be (off the top
     of a phone screen, in the case that caught this). Watching the body's box catches exactly
     that, and fires only on real layout change rather than on a timer. */
  if (window.ResizeObserver) {
    var roTimer = null;
    new ResizeObserver(function () {
      if (roTimer) return;
      roTimer = setTimeout(function () { roTimer = null; followScroll(); }, 300);
    }).observe(document.body);
  }
  function docRect(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height,
             cx: r.left + scrollX + r.width / 2, cy: r.top + scrollY + r.height / 2 };
  }
  function fullyVisible(el, pad) {
    var r = el.getBoundingClientRect();
    pad = pad || 10;
    return r.top >= pad && r.bottom <= innerHeight - pad && r.width > 0;
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
     Custom Highlight API when the browser has it (no DOM mutation at all, vital on a page
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
    /* first VISIBLE occurrence wins. The page deliberately keeps an offscreen briefing
       block (#aiTutorBrief) and a closed settings panel ahead of the lab text, and both are
       full of quotable phrases; a match in there gives an invisible highlight, a caret at
       x = -99999 and a cursor flight off the page, all while reporting success. */
    var idx = -1, guard = 0;
    while (guard++ < 40) {
      idx = flat.indexOf(want, idx + 1);
      if (idx < 0) return null;
      var a = map[idx], b = map[idx + want.length - 1];
      var range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset + 1);
      var rs = range.getClientRects();
      if (rs.length && rs[0].width > 0 && rs[0].left > -1000) return range;
    }
    return null;
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
  function killBubble() {
    if (!bubble) return;
    var b = bubble; bubble = null;
    b.classList.remove("ait-on");
    setTimeout(function () { b.remove(); }, 300);
  }
  /* Shrink the box to the text that is actually in it.

     `width:max-content` sizes to the UNWRAPPED text and then max-width clamps it, so any
     bubble longer than the cap is exactly cap-wide no matter where the words fell. The last
     line ends early, and the leftover is a shelf of empty space down the right hand side,
     which is what kept looking wrong. text-wrap:balance evens the lines but does not shrink
     the box. So: measure where the text really ends, and pull the wall in to meet it. */
  function tighten(b) {
    var cs = getComputedStyle(b);
    var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    var contentLeft = b.getBoundingClientRect().left + padL;
    var need = 0, range = document.createRange();
    var walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walk.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      /* the dismiss button is a text node that lives OUTSIDE the box, hanging off the top
         right corner. Measuring it made every bubble "need" its own width plus the overhang,
         so nothing ever shrank and the dead space stayed exactly where it was. */
      if (n.parentElement && n.parentElement.closest(".ait-x")) continue;
      range.selectNodeContents(n);
      var rs = range.getClientRects();
      for (var i = 0; i < rs.length; i++) need = Math.max(need, rs[i].right - contentLeft);
    }
    /* boxes, not text: these have their own padding and must not be squeezed */
    var floors = b.querySelectorAll(".ait-act,.ait-room");
    for (var j = 0; j < floors.length; j++) need = Math.max(need, floors[j].offsetWidth);
    if (need > 0) b.style.width = Math.ceil(need + padL + padR + 2) + "px";
  }

  /* The cursor's own footprint: the arrow, plus the name badge that hangs off its right.
     Every bubble placement has to clear this box, or the tutor talks over its own face. */
  function cursorBox() {
    /* the badge hangs right normally and LEFT when flipped at the window edge; a box that
       assumes right lets a left-placed bubble sit straight on top of the name tag */
    var fw = flagWidth(), flipped = cursor && cursor.classList.contains("ait-flip");
    return { l: flipped ? cursorPos.x - 9 - fw : cursorPos.x,
             t: cursorPos.y,
             r: flipped ? cursorPos.x + 20 : cursorPos.x + 13 + fw,
             b: cursorPos.y + 38 };
  }

  /* Comic-strip rules: the bubble belongs ABOVE the speaker, tail pointing down at them.
     Only an edge overrules that, and then in order of least surprise: below, then to the
     side. Whatever is chosen, it clears the cursor and its badge and stays in the viewport. */
  function placeBubble(box, bw, bh, prefer) {
    var M = 16;                                  // viewport margin (the close button sits outside)
    var GAP = 13;                                // breathing room between bubble and cursor
    var vt = scrollY + M, vb = scrollY + innerHeight - M;
    var vl = scrollX + M, vr = scrollX + innerWidth - M;
    /* the dismiss button hangs 9px outside the top-right corner, so the right wall has to
       stand further in than the left or it clips against the scrollbar */
    var clampX = function (x) { return Math.max(vl, Math.min(x, vr - bw - 12)); };
    var clampY = function (y) { return Math.max(vt, Math.min(y, vb - bh)); };
    /* hang the bubble so the tail lands near its MIDDLE rather than its left corner: a
       bubble pinned by its left edge to a cursor near the right of the window runs straight
       into that edge, and looked like it was being shoved off the page */
    var mid = box.l + 6 - bw / 2;
    var cands = [
      { side: "above", x: mid, y: box.t - GAP - bh, fits: box.t - GAP - bh >= vt },
      { side: "below", x: mid, y: box.b + GAP,      fits: box.b + GAP + bh <= vb },
      { side: "right", x: box.r + GAP, y: box.t - 8, fits: box.r + GAP + bw <= vr },
      { side: "left",  x: box.l - GAP - bw, y: box.t - 8, fits: box.l - GAP - bw >= vl },
    ];
    /* a caller can ask for a side first (the help bubble wants the room to its left, where
       there is page to spare, rather than above where it would cover the card it explains) */
    if (prefer) cands.sort(function (a, b) {
      return (a.side === prefer ? -1 : 0) - (b.side === prefer ? -1 : 0);
    });
    var pick = null, i;
    for (i = 0; i < cands.length; i++) if (cands[i].fits) { pick = cands[i]; break; }
    if (!pick) pick = cands[0];                  // nothing fits (tiny viewport): above, clamped
    pick.x = clampX(pick.x);
    pick.y = clampY(pick.y);
    /* clamping can drag a side placement back over the cursor; push it clear vertically */
    if ((pick.side === "left" || pick.side === "right") &&
        pick.x < box.r && pick.x + bw > box.l && pick.y < box.b && pick.y + bh > box.t)
      pick.y = clampY(box.b + GAP);
    return pick;
  }

  function say(text, opts) {
    opts = opts || {};
    if (bubble) { bubble.remove(); bubble = null; }
    bubble = document.createElement("div");
    bubble.className = "ait-bubble";
    var who = document.createElement("div");
    who.className = "ait-who"; who.style.color = ai().color;
    var dot = document.createElement("i"); dot.style.background = ai().color;
    who.appendChild(dot);
    who.appendChild(document.createTextNode(ai().name));
    bubble.appendChild(who);
    var x0 = document.createElement("span");
    x0.className = "ait-x"; x0.textContent = "×"; x0.title = "dismiss";
    x0.addEventListener("click", function (e) { e.stopPropagation(); killBubble(); });
    bubble.appendChild(x0);
    if (opts.wide) bubble.classList.add("ait-wide");
    if (opts.title) {
      var h = document.createElement("div");
      h.className = "ait-title"; h.textContent = opts.title;
      bubble.appendChild(h);
    }
    bubble.appendChild(document.createTextNode(text));
    if (opts.steps) {                            // numbered instructions, for the help bubble
      var ol = document.createElement("ul");
      ol.className = "ait-steps";
      opts.steps.forEach(function (s) {
        var li = document.createElement("li"); li.textContent = s; ol.appendChild(li);
      });
      bubble.appendChild(ol);
    }
    if (opts.room) {
      var rm = document.createElement("span");
      rm.className = "ait-room"; rm.textContent = "ROOM " + opts.room;
      bubble.appendChild(rm);
    }
    if (opts.action) {                           // a bubble can carry one thing to click
      var a = document.createElement("button");
      a.className = "ait-act"; a.textContent = opts.action.label;
      a.addEventListener("click", function (e) { e.stopPropagation(); opts.action.run(a); });
      bubble.appendChild(a);
    }
    layer.appendChild(bubble);
    tighten(bubble);
    var box = cursorBox();
    if (!cursorPos.x && !cursorPos.y)            // no cursor yet: talk from the middle
      box = { l: scrollX + innerWidth / 2, t: scrollY + innerHeight * 0.4,
              r: scrollX + innerWidth / 2, b: scrollY + innerHeight * 0.4 };
    var bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    var p = placeBubble(box, bw, bh, opts.prefer);
    bubble.style.left = p.x + "px";
    bubble.style.top = p.y + "px";
    bubble.classList.add("ait-" + p.side);
    /* the tail points back at the arrow tip, wherever clamping left the bubble */
    var tx = Math.max(14, Math.min(box.l + 4 - p.x, bw - 26));
    var ty = Math.max(14, Math.min(box.t + 6 - p.y, bh - 26));
    bubble.style.setProperty("--tx", tx + "px");
    bubble.style.setProperty("--ty", ty + "px");
    requestAnimationFrame(function () { bubble && bubble.classList.add("ait-on"); });
    clearTimeout(bubbleTimer);
    // reading time, generous at the short end, capped; a pinned bubble waits to be dismissed
    var linger = opts.hold ? 0 : Math.min(16000, 4600 + text.length * 60);
    if (linger) bubbleTimer = setTimeout(killBubble, linger);
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
          if (!cursorPos.x && !cursorPos.y) parkCursor(true);
          waveCursor();
          ui.setStatus(); ui.setBadges();
          return { ok: true, result: "present as " + ai().name };

        case "cursor":                                  // {x,y} as 0..1 viewport fractions or px
          /* a confused model sending {"cmd":"cursor"} or "50%" must not poison cursorPos
             with NaN (an invalid transform freezes the cursor for the rest of the session,
             silently); validate, and tell the AI what it got wrong */
          var cx = +cmd.x, cy = +cmd.y;
          if (!isFinite(cx) || !isFinite(cy))
            return { ok: false, error: "cursor needs numeric x and y (0..1 viewport fractions or pixels)" };
          var x = cx <= 1 ? scrollX + Math.max(0, cx) * innerWidth : cx;
          var y = cy <= 1 ? scrollY + Math.max(0, cy) * innerHeight : cy;
          cursorTo(x, y);
          return { ok: true };

        case "point":                                   // {target, note?}
          el = resolveTarget(cmd.target);
          if (!el) return { ok: false, error: "no such target: " + cmd.target };
          if (cmd.noscroll && !fullyVisible(el)) return { ok: false, error: "target off screen, skipped (noscroll)" };
          if (!cmd.noscroll) maybeScrollTo(el);
          r = docRect(el);
          /* the note lands when the cursor ARRIVES, not while it is still flying: a bubble
             placed mid-flight is positioned against a stale cursor and lands crooked */
          cursorTo(r.cx + Math.min(30, r.width / 4), r.cy + Math.min(18, r.height / 4), null,
                   cmd.note ? function () { say(String(cmd.note)); } : null);
          pulseAt(r.cx, r.cy, Math.min(90, Math.max(40, r.width / 3)));
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
          if (!cmd.noscroll && (box.top < 60 || box.bottom > innerHeight - 60))
            (range.startContainer.parentElement || document.body)
              .scrollIntoView({ behavior: "smooth", block: "center" });
          highlightRange(range);
          bumpIdle();
          var rr = range.getBoundingClientRect();
          cursorTo(rr.right + scrollX + 6, rr.bottom + scrollY - 4, null,
                   cmd.note ? function () { say(String(cmd.note)); } : null);
          return { ok: true, result: "highlighted" };

        case "say":                                     // {text}
          if (!cmd.text) return { ok: false, error: "say needs text" };
          ensureCursor(); bumpIdle();
          say(String(cmd.text).slice(0, 400));
          return { ok: true };

        case "clear":
          clearHighlights();
          killBubble();
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

  /* Run a batch with human pacing, a paste of five commands executed in one frame looks
     like a glitch; spaced out it looks like somebody working. */
  function execScript(cmds, gap, cancelled) {
    gap = gap || 1400;
    var out = [];
    return cmds.reduce(function (p, c, i) {
      return p.then(function () {
        return new Promise(function (res) {
          setTimeout(function () {
            /* a script can be preempted mid-run (a real AI arriving trumps the demo);
               skip the rest rather than fighting the newcomer for the one cursor */
            if (cancelled && cancelled()) { res(); return; }
            out.push(exec(c)); res();
          }, i === 0 ? 0 : gap);
        });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  /* Accept commands from pasted AI replies: ```aitutor fenced blocks, a bare JSON array,
     or one JSON object per line. Forgiving on purpose, chat apps love to reflow text. */
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

  /* ---------------- the live relay (tier 3): ntfy.sh, zero infrastructure ----------------

     Two public pub/sub topics named by the room code:
       tinyai-CODE-c   commands, AI to page. The page holds one SSE subscription; the AI
                       publishes with a plain GET (message in the query string), which is
                       the one network verb every chat AI's URL-fetch tool has.
       tinyai-CODE-s   state and events, page to AI. The AI polls it with a plain GET.
     A third, tinyai-CODE-p, carries presence beacons between HUMAN pages sharing the room
     (a classmate or teacher who opened the same link).

     The public server's polite-use budget is roughly a message per five seconds sustained,
     with a burst bucket. Everything published here goes through one outbox that coalesces
     by kind and backs off on 429, so a chatty session degrades to slower updates, never to
     hammering a free service. */

  var BOOT_AT = Date.now();
  /* The relay's publish quota is PER IP, and a school is one IP. ntfy.sh's anonymous
     allowance is small enough that a class, or one enthusiastic afternoon of testing, spends
     it; publishes then 429 and the page goes silent with the tutor none the wiser. These are
     independent public ntfy instances that speak the identical protocol, so the page can
     simply move house. The choice is made BEFORE the invite is written, because the invite
     bakes the host into every URL the tutor will ever fetch. */
  var RELAYS = ["https://ntfy.sh", "https://ntfy.envs.net", "https://ntfy.adminforge.de"];
  var RELAY_DEFAULT = RELAYS[0];
  var RELAY = RELAY_DEFAULT;
  try {
    var relayQ = new URLSearchParams(location.search).get("relay");
    if (relayQ && /^https?:\/\//.test(relayQ)) RELAY = relayQ.replace(/\/+$/, "");
  } catch (e) {}
  /* a ?relay= override exists for classrooms that self-host ntfy, but a crafted link could
     use it to route a session (page state included) through anywhere; a custom relay
     therefore never auto-connects, it asks first (see boot and the panel's relay row) */
  var RELAY_CUSTOM = RELAY !== RELAY_DEFAULT;
  function relayHost() { try { return new URL(RELAY).host; } catch (e) { return RELAY; } }

  /* Find a relay that will actually accept a publish, and remember it for the session. A read
     cannot answer this question: an exhausted quota rejects publishes and serves reads
     happily, which is exactly how a room ends up listening to a channel it can never speak on.
     So the check is one real publish, to a throwaway topic, and it doubles as proof. */
  var relayReady = null;
  function ensureRelay() {
    if (relayReady) return relayReady;
    if (RELAY_CUSTOM) { relayReady = Promise.resolve(RELAY); return relayReady; }
    var ping = "tinyai-ping-" + Math.random().toString(36).slice(2, 8);
    relayReady = RELAYS.reduce(function (chain, host) {
      return chain.then(function (found) {
        if (found) return found;
        return fetch(host + "/" + ping, { method: "POST", body: "ping" })
          .then(function (res) { return res.ok ? host : null; })
          .catch(function () { return null; });
      });
    }, Promise.resolve(null)).then(function (host) {
      if (host && host !== RELAY) {
        badHosts[RELAY] = 1;
        RELAY = host;
        toast("Using relay " + relayHost(), "#c89b1f");
        /* the streams may already be open on the host we just abandoned: rebuild them, or the
           page listens in one place and speaks in another, which is the split that made a
           session look alive while every word it said went nowhere */
        if (Object.keys(live.streams).length) { stopLive(); startLive(); }
      }
      ui.setStatus();
      return RELAY;
    });
    return relayReady;
  }

  /* PREDICTING THE RELAY IS NOT ENOUGH, because the prediction can be made too late or not at
     all. This is the reaction: a publish that comes back refused means the tutor is about to
     go blind, so move to the next relay, take the streams with us, and tell the student in
     the loudest way the page has. The AI is holding URLs for the old host and cannot be
     reached, so the only repair is a fresh invite in their clipboard. */
  var relayFailed = 0, relayMoveShown = false;
  function relayRefused() {
    if (RELAY_CUSTOM) return;                    // their relay, their business
    if (++relayFailed < 2) return;               // one blip is not a verdict
    var next = RELAYS[(RELAYS.indexOf(RELAY) + 1) % RELAYS.length];
    if (next === RELAY) return;
    badHosts[RELAY] = 1;                         // never adopt a host that has refused us
    RELAY = next;
    relayFailed = 0;
    relayReady = Promise.resolve(RELAY);
    live.minGap = 3000; live.warned = false;
    if (Object.keys(live.streams).length) { stopLive(); startLive(); }  // listen where we speak
    ui.setStatus();
    if (relayMoveShown) return;
    relayMoveShown = true;
    toast("Relay was full, moved to " + relayHost(), "#c4281c");
    say("My message relay ran out of room, so I moved to a different one. Your AI still has " +
        "the old address, so copy the invite again and paste it into the chat.", {
      hold: true, wide: true,
      action: { label: "📋 Copy the new invite", run: function (btn) {
        copyText(invitePrompt()).then(function () {
          btn.textContent = "Copied. Paste it into " + ai().name + ".";
        });
      } },
    });
  }
  function topic(kind) { return "tinyai-" + state.room.toLowerCase() + "-" + kind; }

  var live = {
    streams: {},                 // key -> EventSource; one per topic PER HOST, see startLive
    gen: 0,                      // bumped by stopLive; orphaned reconnect timers check it
    on: false, backoff: 1500, lastSeen: {},             // lastSeen: msg ids, to drop replays
    outbox: {}, pumpTimer: null, minGap: 3000, lastPump: 0, warned: false,
  };

  /* queue one message per kind; the newest wins. Kinds map to topics. */
  function relayQueue(kind, obj, urgent) {
    live.outbox[kind] = obj;
    pumpOutbox(urgent);
  }
  function pumpOutbox(urgent) {
    /* an urgent message may not wait behind a lazily scheduled timer: an AI that asked for
       state deserves its answer now, the rate budget can absorb the occasional jump */
    if (live.pumpTimer) {
      if (!urgent) return;
      clearTimeout(live.pumpTimer);
      live.pumpTimer = null;
    }
    var wait = Math.max(0, (urgent ? 400 : live.minGap) - (Date.now() - live.lastPump));
    live.pumpTimer = setTimeout(function () {
      live.pumpTimer = null;
      var kinds = Object.keys(live.outbox);
      if (!kinds.length) return;
      var kind = kinds[0], obj = live.outbox[kind];
      delete live.outbox[kind];
      live.lastPump = Date.now();
      var t = kind === "peer" ? topic("p") : topic("s");
      fetch(RELAY + "/" + t, { method: "POST", body: JSON.stringify(obj) })
        .then(function (res) {
          if (res.status === 429) {
            /* throttled: slow down AND put the message back (unless a newer one of its
               kind arrived meanwhile), or a state the AI asked for silently vanishes */
            live.minGap = Math.min(20000, live.minGap * 2);
            if (!(kind in live.outbox)) { live.outbox[kind] = obj; pumpOutbox(); }
            /* a per-second throttle recovers on its own; a DAILY quota does not, and a room
               that has quietly stopped updating is worse than one that says so. Move house. */
            relayRefused();
          } else { live.minGap = Math.max(3000, live.minGap * 0.9); live.warned = false; relayFailed = 0; }
        })
        .catch(function () {
          if (!(kind in live.outbox)) { live.outbox[kind] = obj; pumpOutbox(); }
        });
      if (Object.keys(live.outbox).length) pumpOutbox();
    }, wait);
  }
  function sendState(reason, urgent) {
    if (!live.on) return;
    relayQueue("state", { type: "state", reason: reason || "update", state: relayState() }, urgent);
  }
  function sendEvent(type, data) {
    if (!live.on) return;
    relayQueue("ev:" + type, Object.assign({ type: type, at: Date.now() }, data), true);
  }

  /* One topic per stream, ON PURPOSE. ntfy supports comma-multi-topic subscriptions and
     they even deliver, but Chrome's EventSource never received an `open` for one against
     ntfy.sh (messages flowed, the handshake event did not), so the room could not say
     "connected". Single-topic streams open in well under a second. The second idle
     connection is a fair price for a status light that works.

     since=90s: commands published while the page was reloading or the stream was down are
     replayed on (re)connect; lastSeen drops replays, and the BOOT_AT filter below keeps a
     fresh page from re-performing a minute of old pointing. */
  function openStream(host, name, slot, onMsg, onUp) {
    if (live.streams[slot]) return;
    var es;
    try { es = new EventSource(host + "/" + name + "/sse?since=90s"); } catch (e) { return; }
    live.streams[slot] = es;
    /* everything this stream schedules is stamped with the generation it was born into;
       "new room" bumps the generation, so an orphaned reconnect timer from the old room can
       never resurrect the old topic into the new session */
    var gen = live.gen;
    /* the public relay occasionally accepts the connection and then sits silent; an
       EventSource stuck CONNECTING never fires onerror, so give it a deadline of our own */
    var watchdog = setTimeout(function () {
      if (live.gen === gen && live.streams[slot] === es && es.readyState !== 1) {
        delete live.streams[slot]; es.close(); openStream(host, name, slot, onMsg, onUp);
      }
    }, 12000);
    es.onopen = function () { if (live.gen === gen && onUp) onUp("open"); };
    /* the relay drops streams casually and EventSource RECONNECTS BY ITSELF (readyState
       goes back to CONNECTING). Tearing the stream down on every error and rebuilding it
       fought that built-in retry and left the room flapping; only a CLOSED stream, one the
       browser has given up on, is ours to rebuild. */
    es.onerror = function () {
      if (live.gen !== gen || live.streams[slot] !== es) return;
      if (es.readyState !== 2) return;           // browser is retrying on its own
      clearTimeout(watchdog);
      if (onUp) {
        live.on = false;
        /* a genuine reconnect should re-announce: the AI's reader window is finite, and a
           room that dropped and came back with no fresh state looks to the tutor exactly
           like a page that was never there */
        joinedOnce = false;
        ui.setStatus();
      }
      delete live.streams[slot];
      setTimeout(function () {
        if (live.gen === gen && !live.streams[slot]) openStream(host, name, slot, onMsg, onUp);
      }, live.backoff = Math.min(30000, live.backoff * 1.8));
    };
    es.onmessage = function (m) {
      if (live.gen !== gen) return;
      if (onUp) onUp("message");                 // a delivered message proves the pipe
      var env; try { env = JSON.parse(m.data); } catch (e) { return; }
      if (!env || env.event !== "message") return;
      if (env.id && live.lastSeen[env.id]) return;
      if (env.id) live.lastSeen[env.id] = 1;
      if (env.time && env.time * 1000 < BOOT_AT - 15000) return;
      onMsg(env.message);
    };
  }
  var joinedOnce = false;
  function joinRoom(how) {
    live.backoff = 1500;
    if (!live.on) { live.on = true; ui.setStatus(); }
    if (joinedOnce) return;
    joinedOnce = true;
    sendState("page joined room " + state.room + " (" + how + ")", true);
    sendPeerBeacon(true);
  }
  /* LISTEN EVERYWHERE, SPEAK WHERE THE TUTOR IS.

     The invite freezes one host into every URL the tutor will ever fetch. The page, meanwhile,
     can be moved to another host by a failed quota check. When those two disagree the session
     splits in half in the cruellest way: commands arrive and the cursor moves, so it looks
     alive, while every word the page says goes to a topic nobody is reading. That is exactly
     what happened in room 7NJA, and no amount of care about WHEN the relay is chosen fixes it,
     because the invite may have been pasted an hour ago.

     So the page subscribes to the command topic on the relay it chose AND on the default one
     every older invite names. Reads are free. Whichever host a command actually arrives on is,
     by definition, where the tutor is, so that is where the page starts publishing its state. */
  var badHosts = {}, recopyShown = false;
  /* One-way sessions are the worst failure this feature has: the cursor moves, so everything
     looks right, while the tutor never sees a word and starts guessing about the page. Say it
     out loud, and put the repair one click away. */
  function tutorOnUnreachableRelay() {
    if (recopyShown) return;
    recopyShown = true;
    toast("Your AI is on a relay I can't answer on", "#c4281c");
    /* the command that revealed this is about to move the cursor, and a moving cursor takes
       its bubble down with it; let the tutor finish its gesture, then speak */
    setTimeout(function () {
      say("I can hear your AI, but it is listening on a relay my page is not allowed to " +
          "publish to today, so it cannot see your screen. Copy the invite again and paste it " +
          "into the chat: the new one points at a relay we can both use.", {
        hold: true, wide: true,
        action: { label: "📋 Copy the new invite", run: function (btn) {
          copyText(invitePrompt()).then(function () {
            btn.textContent = "Copied. Paste it into " + ai().name + ".";
          });
        } },
      });
    }, 1600);
  }
  function cmdHosts() {
    if (RELAY_CUSTOM) return [RELAY];
    var hosts = [RELAY];
    if (RELAY !== RELAY_DEFAULT) hosts.push(RELAY_DEFAULT);
    return hosts;
  }
  function adoptHost(host) {
    if (host === RELAY || badHosts[host] || RELAY_CUSTOM) return;
    RELAY = host;                                // speak where we were spoken to
    live.minGap = 3000; live.warned = false; relayFailed = 0;
    ui.setStatus();
  }
  function startLive() {
    /* every path that arms a session funnels through here, so this is the one place that can
       guarantee the relay has been checked. It was only wired to the panel opening, so a
       student who armed from the cursor's own CTA got an invite naming a relay nobody had
       tested, which is exactly how a session ended up able to hear but never speak. */
    ensureRelay();
    ensureCursor();
    cmdHosts().forEach(function (host) {
      var key = "c@" + host;
      if (live.streams[key]) return;
      openStream(host, topic("c"), key, function (raw) {
        /* the tutor is wherever its commands come from. Speak back to it there if we can; if
           that host is one that has already refused our publishes, we can hear it and it can
           never hear us, and the only repair on earth is a fresh invite in their clipboard. */
        if (host !== RELAY) { if (badHosts[host]) tutorOnUnreachableRelay(); else adoptHost(host); }
        handleLiveCommand(raw);
      }, joinRoom);
    });
    var pkey = "p@" + RELAY;
    if (!live.streams[pkey]) openStream(RELAY, topic("p"), pkey, onPeerBeacon, null);
  }
  function stopLive() {
    live.gen++;                                  // orphan every timer the old streams left
    Object.keys(live.streams).forEach(function (key) {
      var e = live.streams[key];
      delete live.streams[key];
      try { e.close(); } catch (err) {}
    });
    live.on = false;
    joinedOnce = false;
    ui.setStatus();
  }

  function handleLiveCommand(raw) {
    lastCmdAt = Date.now();                    // the cursor is the tutor's again for a while
    var cmd;
    try { cmd = JSON.parse(raw); } catch (e) {
      /* a bare string published to the command topic is treated as speech: forgiving,
         because chat AIs sometimes lose the JSON on the way out */
      if (raw && raw.length < 400) { markLive(); exec({ cmd: "say", text: String(raw) }); }
      return;
    }
    if (Array.isArray(cmd)) {
      markLive();
      execScript(cmd, 1600);
      return;
    }
    if (!cmd || typeof cmd !== "object") return;
    markLive();
    if (cmd.cmd === "state") { sendState("requested", true); return; }
    var res = exec(cmd);
    /* failures go back on the state topic so the AI can self-correct; successes are
       visible to the student already and not worth a message from the rate budget */
    if (res && res.ok === false) sendEvent("result", { of: cmd.cmd, ok: false, error: res.error });
    if (cmd.cmd === "hello") sendState("hello ack", true);
  }

  /* the moment the first live command lands, the seat is taken */
  function markLive() {
    if (state.live === "here") return;
    state.live = "here";
    if (!state.ai) { state.ai = AI_PRESETS.claude; paintCursor(); }
    /* a real tutor preempts the intro tour, pending beat included: nothing is worse than a
       canned demo elbowing a live AI aside mid-sentence */
    state.demoRunning = false;
    clearTimeout(introTimer);
    setCursorInteractive(false);
    toast(ai().name + " joined your room", ai().color);
    ui.setStatus();
  }

  /* ---------------- human peers in the same room ---------------- */

  var PEER_ID = null, peerName = null, lastPeerSent = 0, peerMoved = false;
  (function () {
    try {
      PEER_ID = sessionStorage.getItem("ait_peer_id");
      if (!PEER_ID) { PEER_ID = Math.random().toString(36).slice(2, 8); sessionStorage.setItem("ait_peer_id", PEER_ID); }
      peerName = localStorage.getItem("ait_peer_name") || "";
    } catch (e) { PEER_ID = Math.random().toString(36).slice(2, 8); }
  })();
  function myPeerColor() {
    var h = 0, s = PEER_ID || "";
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PEER_COLORS[h % PEER_COLORS.length];
  }

  function peerCount() {
    var n = 0, now = Date.now();
    for (var id in state.peers) if (now - state.peers[id].at < 25000) n++;
    return n;
  }

  /* Where am I, in a form another layout can reproduce? Anchor to the semantic target under
     the pointer plus a fractional offset inside it; a phone and a desktop disagree on pixels
     but agree on "two thirds of the way across the dose dial". */
  function myAnchor() {
    var t = state.pointer.target;
    if (!t || !t.sel) return null;
    var el = null;
    try { el = document.querySelector(t.sel); } catch (e) {}
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var vx = state.pointer.x - scrollX, vy = state.pointer.y - scrollY;
    return { sel: t.sel, fx: +((vx - r.left) / r.width).toFixed(3), fy: +((vy - r.top) / r.height).toFixed(3) };
  }
  function sendPeerBeacon(force) {
    if (!live.on) return;
    if (!force && !peerMoved) return;
    if (!force && Date.now() - lastPeerSent < 5000) return;
    lastPeerSent = Date.now(); peerMoved = false;
    relayQueue("peer", { type: "peer", id: PEER_ID, name: peerName || null,
                         color: myPeerColor(), anchor: myAnchor(), at: Date.now() });
  }
  /* every field of a peer beacon arrives off a public topic and is hostile until proven
     otherwise. Names are escaped at the sinks; colours are VALIDATED here, because they are
     interpolated into style/fill attributes where escaping alone is not a guarantee. */
  function safeColor(c) {
    return /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "#2e6da4";
  }
  function onPeerBeacon(raw) {
    var p; try { p = JSON.parse(raw); } catch (e) { return; }
    if (!p || typeof p !== "object" || p.id === PEER_ID) return;
    if (p.type === "bye") { removePeer(p.id); return; }
    if (p.type !== "peer") return;
    p.color = safeColor(p.color);
    p.name = p.name == null ? null : String(p.name).slice(0, 24);
    var known = state.peers[p.id];
    if (!known) {
      known = state.peers[p.id] = { el: makePeerCursor(p), name: p.name, color: p.color, at: 0 };
      toast((p.name || "A classmate") + " is in your room", known.color);
      ui.setBadges();
      /* answer a newcomer right away so they see us without waiting for our next move */
      lastPeerSent = 0; peerMoved = true; sendPeerBeacon(true);
    }
    known.at = Date.now();
    if (p.name && p.name !== known.name) { known.name = p.name; known.el.querySelector(".ait-flag").textContent = p.name; }
    var pos = null;
    if (p.anchor && p.anchor.sel) {
      var el = null;
      try { el = document.querySelector(p.anchor.sel); } catch (e) {}
      if (el) { var r = docRect(el); pos = { x: r.left + p.anchor.fx * r.width, y: r.top + p.anchor.fy * r.height }; }
    }
    if (pos) {
      known.el.style.opacity = "0.9";
      known.el.style.transform = "translate(" + pos.x + "px," + pos.y + "px)";
    } else known.el.style.opacity = "0";          // present (badge shows it), position unknown:
                                                  // an unplaced cursor squats at (0,0) otherwise
  }
  function makePeerCursor(p) {
    var d = document.createElement("div");
    d.className = "ait-cursor";
    d.style.opacity = "0";
    d.style.transition = "opacity .6s, transform 1.2s ease";
    var col = safeColor(p.color);
    d.innerHTML =
      '<svg width="16" height="18" viewBox="0 0 20 22"><path fill="' + col + '" d="M2 1l14 9.5-6.2 1.3L13 20l-3.4 1.4-3.2-8.2L2 17z"/></svg>' +
      '<span class="ait-flag" style="background:' + col + '">' + escapeHtml(p.name || "classmate") + "</span>";
    layer.appendChild(d);
    return d;
  }
  function removePeer(id) {
    var p = state.peers[id];
    if (!p) return;
    p.el.remove();
    delete state.peers[id];
    ui.setBadges();
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  setInterval(function () {
    var now = Date.now();
    for (var id in state.peers) if (now - state.peers[id].at > 30000) removePeer(id);
  }, 10000);
  /* Coming back to the tab is the moment a tutor is most likely to be asking where we are:
     make sure the stream is up and put fresh state where it can read it. */
  var lastReturnPush = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if (state.live !== "here" && state.live !== "invited" && !state.joinedViaLink) return;
    startLive();
    /* This session is TWO tabs by design, the lab and the chat, so a student flips between
       them constantly. Publishing on every flip filled the reader's window with duplicates of
       the same moment and pushed the useful line off the end. Once a minute is plenty. */
    if (Date.now() - lastReturnPush < 60000) return;
    lastReturnPush = Date.now();
    sendState("student came back", true);
  });
  addEventListener("pagehide", function () {
    if (!live.on) return;
    try {
      navigator.sendBeacon(RELAY + "/" + topic("p"), JSON.stringify({ type: "bye", id: PEER_ID }));
    } catch (e) {}
  });

  /* a slow watch that keeps the AI's picture fresh without a chatty heartbeat: publish only
     when what the tutor would care about actually changed */
  /* THE RELAY HAS A DAILY BUDGET, and it is per IP and shared by everyone behind it. ntfy.sh
     answers a publish over the anonymous quota with 429 "daily message quota reached", and
     then the room simply stops updating. So publish on things that MATTER and let the AI ask
     for the rest: it has a `state` command and it knows when it needs a fresh look.

     What is deliberately NOT in the digest: where the student's mouse is. It changes every
     time they cross a card, it was by far the largest source of traffic, and it is in every
     snapshot anyway, so the AI gets it the moment it asks. */
  var lastDigest = "";
  setInterval(function () {
    if (!live.on || document.hidden) return;
    /* a reader who sits still is present, not gone: keepalive well inside the 30s reap
       window, so an observing teacher's cursor does not vanish and re-toast all session.
       Only worth spending messages on once somebody is actually in the room with us. */
    if (peerCount() || state.joinedViaLink) {
      if (Date.now() - lastPeerSent > 20000) sendPeerBeacon(true);
      else sendPeerBeacon(false);
    }
    if (state.live !== "here") return;
    /* the tutor has gone quiet: take the cursor back to the reader's corner rather than
       leaving it stranded wherever the last gesture ended, scrolling away with the text */
    if (!aiHoldsCursor() && !cursorAnim) followScroll();
    var d = "";
    try {
      d = [typeof focusId !== "undefined" ? focusId : "", typeof stage !== "undefined" ? stage : "",
           typeof DATA !== "undefined" ? DATA.length : "",
           typeof qStreak !== "undefined" ? qStreak : ""].join("|");
    } catch (e) {}
    if (d !== lastDigest) { lastDigest = d; sendState("changed"); }
  }, 10000);

  /* ---------------- student context tracking (student -> AI) ---------------- */

  var lastMove = 0;
  addEventListener("mousemove", function (e) {
    var now = Date.now();
    if (now - lastMove < 120) return;
    lastMove = now;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    state.pointer = { x: e.clientX + scrollX, y: e.clientY + scrollY,
                      target: describeEl(el), at: now };
    peerMoved = true;
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
      if (state.live === "here") sendEvent("selection", state.selection);
    }, 400);
  });

  /* ---------------- knowledge check hook (section 5) ----------------
     The lab's own handler saves and telemeters the sentence; this one, added alongside it,
     hands the sentence to the student's AI for Socratic feedback, live if connected,
     otherwise via a one-click copyable review request. Never auto-grades on the page: the
     feedback conversation belongs in the student's own AI. */

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
      if (state.bridge || state.live === "here") {
        if (state.bridge) state.bridge.event("knowledge_check", { sentence: t });
        else { sendEvent("knowledge_check", { sentence: t }); sendState("knowledge check", true); }
        if (nudge) nudge.innerHTML = "Sent to your AI tutor, feedback is in your chat.";
      } else if (nudge) {
        nudge.innerHTML = '<a id="aitKcheckCopy">Get feedback from your AI &rarr;</a>';
        nudge.querySelector("a").onclick = function () {
          copyText(kcheckPrompt(t));
          nudge.textContent = "Copied, paste it to your AI.";
        };
      }
    });
  }

  function kcheckPrompt(sentence) {
    return 'I just answered the knowledge check in section 5 of the tiny-ai lab (' + PAGE_URL + ").\n" +
      'The question: "One sentence, in your own words: what does training a model actually do?"\n' +
      'My answer: "' + sentence + '"\n\n' +
      "You are my Socratic tutor (full briefing: " + AGENTS_URL + ", but the rubric is right here " +
      "in case you cannot fetch). A strong sentence carries three ideas: training ADJUSTS the " +
      "model's internal numbers (the knobs / weights); the adjustments are GUIDED BY THE ERROR " +
      "against real examples; and the goal is to GENERALIZE to cases nobody tried yet. " +
      "WITHOUT giving a model answer away and without grading with a number: tell me what my " +
      "sentence already gets right, then ask me ONE question that would lead me to the most " +
      "important missing idea, and invite me to revise. Keep it short and warm, Feynman-style.";
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

  /* THE invite. One paste into any AI that can fetch URLs makes it a live tutor with
     presence on this page. Everything it needs is in here: the page, the briefing, the
     room, the two relay URLs, the command set, and the rules that hold even if it cannot
     fetch a thing. Kept as tight as it can be while still working on a bad day. */
  /* THE INVITE, written against what chat clients can ACTUALLY do.

     A previous version assumed the AI could build a URL per command and fetch it. In the
     claude.ai web app it cannot: its fetch tool only allows URLs that already appeared in the
     conversation, and a constructed one is either refused or quietly matched to the nearest
     URL already present. The observed result was the worst kind of failure, a command that
     "succeeded" while publishing the EXAMPLE payload from this prompt, every time. So:

       - the SEE url is FIXED and written out in full, because a fixed url is the one shape
         every client will fetch, and it is served as text/plain (ntfy's /json is
         application/x-ndjson, which fetchers hand back as "[binary data]");
       - the ACT url is offered as a capability to TEST, not an assumption, and the AI is told
         exactly which error means "your client forbids this" and what to do instead;
       - the first reply is a self-test with a word the student can check, so a session that
         cannot go live says so in ten seconds instead of pretending for twenty minutes. */
  /* THE COMMAND MENU. The client will fetch a URL that appears literally in the conversation
     and refuses one the model builds, so the way to give a tutor hands is to write its whole
     vocabulary out as finished URLs. Pointing carries no note: in voice mode the words belong
     in the student's ear, not in a bubble, and a fixed note would only contradict whatever the
     tutor actually said. */
  var MENU = [
    ["challenge", "the challenge sentence"],
    ["fluency", "the experience slider"],
    ["dose", "the dose dial"],
    ["give", "the Give the dose button"],
    ["results", "the Results card"],
    ["scene", "the 3D scene"],
    ["knob:m", "step 1's m knob"],
    ["knob:c", "step 1's c knob"],
    ["sec:1", "section 1, dots and lines"],
    ["sec:2", "section 2, teach it to bend"],
    ["sec:3", "section 3, the automatic hand"],
    ["quiz", "section 4, the tiny test"],
    ["kcheck", "section 5, the knowledge check"],
  ];
  function cmdUrl(obj) {
    return RELAY + "/" + topic("c") + "/publish?message=" + encodeURIComponent(JSON.stringify(obj));
  }
  function invitePrompt() {
    var code = state.room;
    /* A SHORT window, and the reason is not bandwidth. /raw returns every message in the
       window, one per line, OLDEST FIRST, undated. Over an hour that is a wall of
       near-identical JSON, and a fetch tool that truncates a long body can hand the tutor the
       start of the session: it then reports, with total confidence, the knob values and the
       section the student left behind twenty minutes ago. The refresh command is fetched
       immediately before the read, so a few minutes is all the window ever needs to hold. */
    /* a different `since` per look: same recent window in practice, but a distinct URL, which
       is the only way past a client that caches by URL. The tutor's own report: four reads,
       one address, four empty bodies, the last one echoing the URL back instead of content. */
    var seeUrl = function (n) {
      return RELAY + "/" + topic("s") + "/raw?poll=1&since=" + (4 + n) + "m";
    };
    var actUrl = RELAY + "/" + topic("c") + "/publish?message=";
    /* the student may have picked ChatGPT in the panel; announcing "Claude" would not just
       mislabel the cursor, exec's hello handler would reassign state.ai and repaint it in
       Claude's colour, quietly undoing their choice */
    var helloUrl = cmdUrl({ cmd: "hello", name: ai().name });
    var menuLines = MENU.map(function (m) {
      return "  " + m[1] + "\n  " + cmdUrl({ cmd: "point", target: m[0] });
    }).join("\n");
    return "You are my live AI tutor for an interactive lesson I have open in my browser right " +
      "now. I am learning how a neural network works by turning knobs on a tiny model.\n\n" +
      "The lesson page (fetch and skim it): " + roomUrl() + "\n" +
      "Your tutor briefing (fetch it, it binds you): " + AGENTS_URL + "\n" +
      "My room code: " + code + "\n\n" +
      "HOW THIS WORKS. You have a cursor on my screen. You move it by FETCHING one of the URLs " +
      "written out below. Every URL you will ever need is in this message: fetch them exactly " +
      "as written, character for character. Do NOT build your own URL or edit one of these " +
      "(some apps refuse a URL you construct, or quietly fetch a different one, and then you " +
      "will be pointing at the wrong thing while believing it worked).\n\n" +
      "=== SAY HELLO (do this first) ===\n" + helloUrl + "\n\n" +
      "=== SEE MY SCREEN ===\n" +
      "Work down these PAIRS, one pair per look, in order. Fetch the refresh, wait about 3 " +
      "seconds, then fetch the read directly under it. Never reuse a pair: an identical URL " +
      "fetched twice is answered from your own cache without the request leaving, so my page " +
      "is never asked and you are handed the previous, possibly empty, reply.\n" +
      [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) {
        return "  look " + n + "\n    refresh: " + cmdUrl({ cmd: "state", n: n }) +
               "\n    read:    " + seeUrl(n);
      }).join("\n") + "\n" +
      "**The LAST line is where I am right now.** Earlier lines are older moments in this " +
      "session; ignore them, and never quote a knob value or a section from them. Each line " +
      "carries a clock time, so check it looks recent before you rely on it.\n" +
      "If the read comes back empty, do the refresh once more and read again. Empty twice " +
      "means my lab tab is not connected: ask me to open it and click the 🎓 AI tutor button.\n\n" +
      "=== POINT AT THINGS (this is your hand, use it constantly) ===\n" +
      "Fetch the URL under whatever you are asking me about. Your cursor flies there and " +
      "pulses. Say the words yourself, in chat or out loud: the page shows where, you say why.\n" +
      menuLines + "\n" +
      "  take the pointing away when you move on\n  " + cmdUrl({ cmd: "clear" }) + "\n" +
      "  (and a second clear, for later in the session)\n  " + cmdUrl({ cmd: "clear", n: 2 }) + "\n" +
      "To point at the same thing twice, point somewhere else in between: fetching one of " +
      "these twice in a row may be served from your cache and never reach me.\n\n" +
      "CHECK YOUR OWN WORK. A successful fetch answers with a fresh message id. If you get an " +
      "error instead, or your fetch tool is unavailable for a moment (it happens), say so " +
      "plainly and keep teaching by voice. Do not tell me my page is broken, and do not claim " +
      "you pointed at something when the fetch did not go through.\n\n" +
      "=== HOW TO TEACH ===\n" +
      "Be a Socratic tutor in the spirit of Feynman. Plain words, one step, ONE question at a " +
      "time, short replies. Point at the thing you are asking about, then ask, then wait. " +
      "NEVER hand me an answer: no knob values, no quiz numbers, no ready-made sentence for " +
      "the section-5 check. I may switch to voice mode: keep tutoring by voice, keep fetching " +
      "quietly between turns, and never read a URL or any JSON out loud.\n\n" +
      "The arc, at my pace: the experience slider, the challenge and the confidence question, " +
      "then the 3D scene (turn the dose dial, press Give the dose, watch a dot land on the " +
      "graph), then section 1's two knobs, the bend in section 2, the automatic hand in " +
      "section 3, and the tiny test in section 4.\n\n" +
      "IF A FETCH IS REFUSED: say so plainly and keep tutoring by voice. When pointing would " +
      "really help, end a reply with a block I can paste into the page myself (I click " +
      "📋 Apply reply in the lab's head row):\n" +
      "```aitutor\n{\"cmd\":\"point\",\"target\":\"dose\",\"note\":\"What happens to the bar?\"}\n```\n\n" +
      "Start now: fetch hello, fetch the two SEE urls, then greet me in one sentence, point at " +
      "the challenge, and ask me one question.";
  }

  function contextSnippet() {
    return "Context from my tiny-ai lab page right now (I'm the student, remember: Socratic, no answers):\n" +
      "```json\n" + JSON.stringify(labSnapshot(), null, 1) + "\n```\n" +
      "My question: what is this that I'm pointing at, and how does it work?";
  }

  /* ---------------- MCP bridge client (tier 4, optional) ----------------
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
       hasn't touched anything, cheap, tiny, and only while connected */
    var beat = setInterval(function () {
      if (closed) { clearInterval(beat); return; }
      if (client.alive) client.event("state", { state: labSnapshot() });
    }, 2500);
    return client;
  }

  /* ---------------- the intro: presence from the first second ----------------
     The cursor is on screen from load, parked by the badges, so the page reads as a room
     with a seat for your AI in it. On a first visit it plays a short tour of the two things
     above the fold, without ever scrolling the page: the priming is the point, the jolt of
     a page that scrolls itself is exactly what we do not want. */

  /* THE TOUR NEVER PLAYS BY ITSELF. It used to run on load (capped at three visits through a
     localStorage counter) and it was wrong twice over: the first seconds of this page already
     have a 3D scene assembling itself, and a tutor flying around on top of that is noise, not
     welcome. The counter also made the page behave differently on the fourth reload than the
     first, which reads as a haunted page. Now the cursor simply sits in its seat, and the
     tour is something the reader asks for by clicking it. */
  /* Pacing is the whole difference between a colleague and a fly. Each beat gets time to be
     read (BEAT), the bubble is taken down and allowed to fade BEFORE the cursor travels
     (SETTLE), and the travel itself is slow and curved. Rushing this was the first thing
     that read as wrong. */
  var BEAT = 6200, SETTLE = 420, introTimer = null;
  function introDemo() {
    if (state.demoRunning || state.live === "here") return;
    ensureCursor(); paintCursor();
    if (!cursorPos.x && !cursorPos.y) {          // arrive from the corner, not from (0,0)
      var p0 = parkSpot();
      cursorPos.x = p0.x + 70; cursorPos.y = p0.y - 60;
    }
    if (REDUCED) { parkCursor(true); bumpIdle(); return; }
    state.demoRunning = true;
    dock.mode = "home"; dock.card = null;        // the tour starts from the seat, then travels
    showFlagFor(0);
    var steps = [
      /* speak on ARRIVAL, never mid-flight: a bubble that appears while the cursor is still
         travelling is placed against a position it is about to leave. When the cursor is
         already sitting in its seat, which is the normal case for a click, there is nothing
         to arrive at: speak now rather than inventing half a second of travel. */
      function () {
        var p = parkSpot(), hi = "Hi! This cursor is where YOUR AI tutor sits.";
        if (Math.abs(p.x - cursorPos.x) + Math.abs(p.y - cursorPos.y) < 30) say(hi);
        else parkCursor(false, function () { if (state.demoRunning) say(hi); });
      },
      function () {
        var el = document.querySelector(".challengeline");
        /* no note on this beat. The highlight IS the sentence: a bubble next to it just
           talks over the words it is drawing attention to, and the reader has to choose
           which of the two to read. Let the mark speak. */
        if (el && fullyVisible(el, 4))
          exec({ cmd: "highlight", text: "teach the machine in the black box to pick the right dose",
                 noscroll: 1 });
      },
      function () {
        var el = document.getElementById("giveBtn");
        if (el && fullyVisible(el, 4))
          exec({ cmd: "point", target: "give", noscroll: 1,
                 note: "Your first move lives here: set a dose, press this, see what happens." });
      },
      function () {
        clearHighlights();
        parkCursor(false, function () {
          if (!state.demoRunning) return;
          say("Want a real guide? Click me, or the 🎓 button, to invite your Claude or ChatGPT. Voice mode works too.");
        });
      },
    ];
    var i = 0;
    (function next() {
      if (i >= steps.length) { state.demoRunning = false; followScroll(); parkCursor(); return; }
      var step = steps[i++];
      /* Take down BOTH marks before moving on. A highlight left behind keeps its blinking
         caret, and a blinking caret in one place plus a cursor in another reads as two
         tutors in the room. There is only ever one of us. */
      killBubble();
      clearHighlights();
      introTimer = setTimeout(function () {      // ...then travel
        if (!state.demoRunning) return;
        step();
        introTimer = setTimeout(next, BEAT);
      }, i === 1 ? 0 : SETTLE);
    })();
    /* One real click anywhere ends the tour: the student has started working, and the tour
       is not more important than that. Cancelling has to CLEAR THE PENDING BEAT, not just
       set a flag: a flag alone left the last scheduled beat to fire up to BEAT ms later and
       yank the cursor across the page seconds after the student dismissed it (it also ate
       the next click on the cursor, because a cursor in flight is not clickable). */
    addEventListener("pointerdown", function stop(e) {
      if (cursor && cursor.contains(e.target)) return;
      if (bubble && bubble.contains(e.target)) return;
      removeEventListener("pointerdown", stop, true);
      if (!state.demoRunning) return;
      endIntro();
    }, true);
  }
  function endIntro() {
    clearTimeout(introTimer);
    state.demoRunning = false;
    clearHighlights();
    killBubble();
    followScroll();
    parkCursor();
  }

  /* Clicking the cursor while it rides a card is a request for help HERE, so the answer is
     the shortest path to a real tutor: one button that copies the invite. */
  /* Clicking the cursor is a request for help, so the answer is the whole setup in one
     bubble: what this is, the three steps, the room code, and the button that does step one.
     It hangs to the LEFT, over the page's own margin, rather than above the card it is
     offering to explain. It holds until dismissed, because it is instructions to follow. */
  function helpCTA() {
    ensureRelay();                               // resolve while they read, so the copy is right
    var where = "";
    try {                                        // the card's own eyebrow, e.g. "step 2"
      var eb = dock.card && dock.card.querySelector(".eyebrow2");
      var name = eb && eb.textContent.split("·")[0].trim().toLowerCase();
      if (name && name.length < 24) where = " We can start with " + name + ".";
    } catch (e) {}
    say("Your own Claude or ChatGPT can tutor you right here: it sees where you are, points "
        + "at things, and asks questions. It never clicks for you and never hands over "
        + "answers." + where, {
      title: "Your AI, live on this page",
      steps: ["Copy the invite below",
              "Paste it into a new chat with your AI (voice mode works too)",
              "Come back here: my cursor turns green and I start guiding"],
      room: state.room,
      wide: true, hold: true, prefer: "left",
      action: {
        label: "📋 Copy the invite for " + ai().name,
        run: function (btn) {
          copyText(invitePrompt()).then(function () {
            if (state.live !== "here") state.live = "invited";
            stampRoomInUrl();
            startLive();
            btn.textContent = "Copied. Now paste it into " + ai().name + ".";
            ui.setStatus(); ui.setBadges();
          });
        },
      },
    });
  }

  /* the full scripted tour, on request from the panel: same pipeline a real AI uses,
     so it demonstrates the presence layer AND smoke-tests it. */
  function runDemo() {
    if (state.demoRunning) return;
    state.demoRunning = true;
    if (!state.ai) { state.ai = AI_PRESETS.claude; paintCursor(); }
    var seq = [
      { cmd: "hello", name: ai().name },
      { cmd: "say", text: "Hi! Once you connect me, I can see your page and point at things, like this." },
      { cmd: "point", target: "dose", note: "This dial is x, the dose. Try turning it, what happens to the prediction bar?" },
      { cmd: "highlight", text: "teach the machine in the black box to pick the right dose",
        note: "This sentence is the whole game. Everything below is just this, step by step." },
      { cmd: "point", target: "sec:1", note: "Two knobs, m and c. What do you think m changes about the line?" },
      { cmd: "say", text: "That's the idea, I point and ask, you turn the knobs and answer. Invite me for real from the 🎓 AI tutor button." },
      { cmd: "clear" },
    ];
    execScript(seq, 5200, function () { return !state.demoRunning; })
      .then(function () {
        state.demoRunning = false;
        if (state.live !== "here") { followScroll(); parkCursor(); }
      });
  }

  /* ---------------- toast ---------------- */

  var toastEl = null, toastTimer = null;
  function toast(text, color) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "aitToast";
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = '<i style="background:' + safeColor(color || "#237841") + '"></i>' + escapeHtml(text);
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, 4200);
  }

  /* ---------------- badges + CTA + panel ---------------- */

  var ui = { setStatus: function () {}, setBadges: function () {} };
  var panelEl = null, focusPasteBox = function () {};
  /* one door for every way the panel opens and closes, so the stand-down above cannot be
     forgotten at a call site (the presence layer outranks the panel in z-order) */
  function setPanel(open) {
    if (!panelEl) return;
    panelEl.classList.toggle("open", !!open);
    document.documentElement.classList.toggle("ait-panel", !!open);
    /* settle which relay we are on while the student is still reading the panel, so the
       invite they copy a few seconds later already names a host that works */
    if (open) {
      state.demoRunning = false; clearTimeout(introTimer); killBubble();
      /* Settle the relay BEFORE the invite can be copied, and hold the button shut until it
         is settled. Every other ordering loses: the clipboard needs the click it was given,
         so the copy cannot wait on a promise, and an invite written a moment too early names
         a host the page then abandons. That mismatch is invisible and fatal, so the honest
         move is to make the button unavailable for the half second the check takes. */
      var cb = panelEl.querySelector("#aitCopyLink");
      if (cb && !relayReady) {
        var label = cb.textContent;
        cb.disabled = true; cb.textContent = "checking the relay…";
        ensureRelay().then(function () { cb.disabled = false; cb.textContent = label; });
      } else ensureRelay();
    }
    ui.setStatus();
  }
  function openPanel() { setPanel(true); }

  function buildUI() {
    var toggle = document.querySelector(".viewtoggle");
    if (!toggle) return;

    /* the collaborator strip: You + your AI, Docs style, before the icon buttons */
    var badges = document.createElement("div");
    badges.id = "aitBadges";
    badges.title = "This page is a shared room: you, your AI tutor, and anyone with your room link. Click to set it up.";
    toggle.insertBefore(badges, toggle.firstChild);

    var btn = document.createElement("button");
    btn.id = "aitBtn"; btn.type = "button";
    btn.title = "Get a live tutor: your own Claude or ChatGPT";
    btn.innerHTML = "🎓 <span>AI tutor</span>";
    toggle.insertBefore(btn, badges.nextSibling);

    /* One click to hand the AI's reply to the page. Reads the clipboard directly where the
       browser allows it, so the student copies in their chat and clicks here, with no paste
       box in between; where it does not, this falls back to the box, focused and ready. */
    var apply = document.createElement("button");
    apply.id = "aitApply"; apply.type = "button";
    apply.title = "Copy your AI's reply, then click here to run it on the page";
    apply.innerHTML = "📋 <span>Apply reply</span>";
    toggle.insertBefore(apply, btn.nextSibling);
    apply.onclick = function (e) {
      e.stopPropagation();
      var run = function (text) {
        var cmds = parsePasted(text || "");
        if (!cmds.length) { openPanel(); focusPasteBox(); return false; }
        setPanel(false);
        execScript(cmds);
        return true;
      };
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(run).catch(function () { openPanel(); focusPasteBox(); });
      } else { openPanel(); focusPasteBox(); }
    };

    var panel = document.createElement("div");
    panel.id = "aitPanel";
    panelEl = panel;
    panel.innerHTML =
      '<h3>Your AI, live on this page</h3>' +
      '<p>Your Claude or ChatGPT becomes a tutor with a cursor here: it sees where you are, ' +
      'points, highlights, and asks questions. It never clicks, types, or gives answers away.</p>' +
      '<div class="ait-row" style="justify-content:space-between">' +
        '<span class="ait-roomchip" id="aitRoomChip" title="Your session room code. Click to copy this page&#39;s link with the room in it.">' +
          '<small>ROOM</small><span id="aitRoomCode"></span></span>' +
        '<button id="aitNewRoom" title="Start a fresh room code" style="border-color:var(--rule,#d9d2c4)">new room</button>' +
      '</div>' +
      '<div class="ait-status"><span id="aitDot" class="ait-dot"></span><span id="aitLiveState">no AI connected yet</span></div>' +
      (RELAY_CUSTOM ?
        '<div class="ait-row" id="aitRelayRow"><span class="ait-note" style="margin:0">This page was opened ' +
        'with its own relay: <b>' + escapeHtml(relayHost()) + '</b>. Nothing connects until you choose to.</span>' +
        '<button id="aitRelayJoin">Join room via this relay</button></div>' : '') +
      '<div class="ait-row"><button id="aitCopyLink" class="ait-primary">📋 Copy the invite for your AI</button></div>' +
      '<span id="aitCopied" class="ait-ok"></span>' +
      '<p class="ait-note">Paste it into a new chat: that is the whole setup. On your phone, ' +
      'paste it, then switch to voice mode and just talk while you work here.</p>' +
      '<div class="ait-row">' +
        '<button class="ait-pick" data-ai="claude" style="color:#d97757">Claude</button>' +
        '<button class="ait-pick" data-ai="chatgpt" style="color:#10a37f">ChatGPT</button>' +
        '<button class="ait-pick" data-ai="other" style="color:#7b5cc6">other AI</button>' +
      '</div>' +
      '<details><summary>More ways, and what this shares</summary>' +
        '<div class="ait-row" style="margin-top:8px">' +
          '<button id="aitCopyCtx">Copy “what am I looking at?”</button>' +
          '<button id="aitPaste">Paste your AI’s reply</button>' +
          '<button id="aitDemo">Replay the demo</button>' +
        '</div>' +
        '<div id="aitPasteBox" style="display:none"><textarea rows="4" placeholder="Paste the whole reply, I’ll find the ```aitutor``` commands in it."></textarea>' +
        '<div class="ait-row"><button id="aitRunPaste" class="ait-primary" style="width:auto">Run it</button><span id="aitPasteMsg"></span></div></div>' +
        '<p class="ait-note">Share this page’s link (room included) and a classmate or teacher ' +
        'appears in here with their own cursor.</p>' +
        '<p class="ait-note">Live sessions relay small page-state snapshots (knob values, what ' +
        'your mouse is over, text you select, and your section-5 sentence once you save it) ' +
        'through the public ntfy.sh message service, in a room named by your code. Your ' +
        'conversation with your AI never touches this page’s plumbing. No session: nothing is ' +
        'sent at all. Classrooms wanting their own relay: see ' +
        '<a href="https://github.com/grassyhilltop/tiny-ai/tree/main/staging/tiny-ai/tutor-bridge" target="_blank" rel="noopener" style="pointer-events:auto;color:var(--ink,#1f1d1a)">tutor-bridge</a>.</p>' +
      '</details>';
    toggle.appendChild(panel);

    btn.onclick = function (e) { e.stopPropagation(); setPanel(!panel.classList.contains("open")); };
    badges.onclick = function (e) { e.stopPropagation(); setPanel(!panel.classList.contains("open")); };
    panel.onclick = function (e) { e.stopPropagation(); };
    document.addEventListener("click", function () { setPanel(false); });
    addEventListener("keydown", function (e) { if (e.key === "Escape") setPanel(false); });

    var copied = panel.querySelector("#aitCopied");
    function flash(t) { copied.textContent = t; clearTimeout(flash._t); flash._t = setTimeout(function () { copied.textContent = ""; }, 5000); }

    panel.querySelector("#aitRoomChip").onclick = function () {
      copyText(roomUrl()).then(function () {
        /* sharing the room IS the opt-in: start listening so whoever opens the link finds
           this page already in the room, and keep the room across a reload */
        stampRoomInUrl();
        startLive();
        flash("Link with your room copied. Share it to bring someone in.");
        ui.setStatus();
      });
    };
    var relayJoin = panel.querySelector("#aitRelayJoin");
    if (relayJoin) relayJoin.onclick = function () { startLive(); ui.setStatus(); };
    panel.querySelector("#aitNewRoom").onclick = function () {
      stopLive();
      state.room = mintRoom();
      state.live = null; state.joinedViaLink = false;
      try {
        var qs = new URLSearchParams(location.search);
        qs.set("room", state.room);
        history.replaceState(null, "", location.pathname + "?" + qs + location.hash);
      } catch (e) {}
      ui.setStatus();
    };

    panel.querySelectorAll(".ait-pick").forEach(function (b) {
      b.onclick = function () {
        state.ai = AI_PRESETS[b.dataset.ai]; paintCursor();
        panel.querySelectorAll(".ait-pick").forEach(function (x) { x.classList.toggle("on", x === b); });
        ui.setStatus(); ui.setBadges();
      };
    });

    panel.querySelector("#aitCopyLink").onclick = function () {
      /* the copy has to happen inside the click for the clipboard to accept it, so the relay
         check cannot be awaited here; it was started when the panel opened. If it lands late
         and moves us, the pasted invite names the wrong host, so say so rather than let the
         session fail mutely. */
      var hostAtCopy = RELAY;
      copyText(invitePrompt()).then(function () {
        if (state.live !== "here") state.live = "invited";
        stampRoomInUrl();                        // a reload must come back to this room
        startLive();
        flash("Copied. Paste it into " + ai().name + ", then come back here.");
        ui.setStatus(); ui.setBadges();
        ensureRelay().then(function (host) {
          if (host !== hostAtCopy) flash("Relay moved to " + relayHost() + ", copy the invite again.");
        });
      });
    };
    panel.querySelector("#aitCopyCtx").onclick = function () {
      copyText(contextSnippet()).then(function () { flash("Copied, paste it into your AI chat."); });
    };
    panel.querySelector("#aitDemo").onclick = function () { setPanel(false); runDemo(); };

    var pasteBox = panel.querySelector("#aitPasteBox");
    focusPasteBox = function () {
      var det = panel.querySelector("details");
      if (det) det.open = true;
      pasteBox.style.display = "block";
      var ta = pasteBox.querySelector("textarea");
      ta.focus(); ta.select();
    };
    panel.querySelector("#aitPaste").onclick = function () {
      pasteBox.style.display = pasteBox.style.display === "none" ? "block" : "none";
    };
    panel.querySelector("#aitRunPaste").onclick = function () {
      var ta = pasteBox.querySelector("textarea"), msg = panel.querySelector("#aitPasteMsg");
      var cmds = parsePasted(ta.value);
      if (!cmds.length) { msg.textContent = "No aitutor commands found in that."; return; }
      msg.textContent = "Running " + cmds.length + " command" + (cmds.length > 1 ? "s" : "") + "…";
      setPanel(false);
      ta.value = "";
      execScript(cmds).then(function () { msg.textContent = ""; });
    };

    /* the badge strip: You, your AI (status-dotted), plus any peers who joined */
    ui.setBadges = function () {
      var html =
        '<div class="ait-badge" style="background:' + myPeerColor() + '" title="You">You</div>' +
        '<div class="ait-badge ait-ai ' + (state.live === "here" || (state.bridge && state.bridge.alive) ? "ait-live" : state.live === "invited" ? "ait-waiting" : "") + '" ' +
          'style="background:' + ai().color + '" title="' + escapeHtml(ai().name) + " · your AI tutor seat" + '">' +
          '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.2 6.2L21 9l-5.4 4 2 6.6L12 15.8 6.4 19.6l2-6.6L3 9l6.8-.8z"/></svg>' +
          '<span class="ait-dot2"></span></div>';
      var n = 0;
      for (var id in state.peers) {
        if (n >= 3) break;
        html += '<div class="ait-badge" style="background:' + state.peers[id].color + '" title="' +
                escapeHtml(state.peers[id].name || "classmate") + '">' +
                escapeHtml((state.peers[id].name || "?").slice(0, 2)) + "</div>";
        n++;
      }
      badges.innerHTML = html;
    };

    ui.setStatus = function () {
      var dot = panel.querySelector("#aitDot"), lab = panel.querySelector("#aitLiveState");
      panel.querySelector("#aitRoomCode").textContent = state.room;
      dot.className = "ait-dot";
      if (state.bridge && state.bridge.alive) { dot.classList.add("on"); lab.textContent = "live over your MCP bridge as " + ai().name; }
      else if (state.live === "here") { dot.classList.add("on"); lab.textContent = ai().name + " is here · room " + state.room; }
      else if (state.live === "invited") { dot.classList.add("wait"); lab.textContent = "invite copied · waiting for " + ai().name + " to join…"; }
      else if (state.joinedViaLink && live.on) { dot.classList.add("wait"); lab.textContent = "room " + state.room + " open · waiting for your AI"; }
      else { lab.textContent = "no AI connected yet"; }
      if (RELAY !== RELAY_DEFAULT) lab.textContent += " · via " + relayHost();
      /* the paste pill earns its place in the head row once a session has been invited: in
         the apps that forbid an AI from calling out, it is the only way its pointing lands */
      apply.classList.toggle("on", state.live === "invited" || state.live === "here");
      ui.setBadges();
    };

    /* the MCP bridge, still available for self-hosters: ?bridge=URL(&room=CODE) connects
       on load, exactly as tutor-bridge/README.md hands out */
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.get("bridge")) {
        var base = qs.get("bridge");
        if (!/^https?:\/\//.test(base)) base = "https://" + base;
        state.bridge = connectBridge(base, state.room, ui.setStatus);
      }
    } catch (e) {}
    ui.setStatus();
  }

  /* ---------------- public API, any transport, the console, or tests ---------------- */

  window.AITutor = {
    exec: exec,
    run: execScript,
    state: labSnapshot,
    parse: parsePasted,
    demo: runDemo,
    intro: introDemo,
    room: function () { return state.room; },
    invite: invitePrompt,
    connect: startLive,
    ask: function (q) {                       // student-side: queue a question for the AI
      state.asks.push({ q: String(q), at: new Date().toISOString(),
                        pointer: state.pointer.target && state.pointer.target.label });
      if (state.bridge) state.bridge.event("ask", { q: String(q) });
      if (state.live === "here") { sendEvent("ask", { q: String(q) }); sendState("student asked", true); }
    },
    _internals: { findTextRange: findTextRange, relayState: relayState, describeEl: describeEl, resolveTarget: resolveTarget,
                  invitePrompt: invitePrompt, topic: topic, live: live,
                  relay: function () { return RELAY; },
                  streamKeys: function () { return Object.keys(live.streams); },
                  setRelays: function (list) {                 // tests only: point at stubs
                    RELAYS = list.slice(); RELAY = RELAYS[0]; RELAY_DEFAULT = RELAYS[0];
                    relayReady = null; badHosts = {};
                  },
                  dock: dock, cursorPos: cursorPos, cardSpot: cardSpot, follow: followScroll },
  };

  /* ---------------- boot ---------------- */

  function boot() {
    buildUI();
    hookKcheck();
    /* a link that carries a room is an opt-in: join it now, so an AI (or a classmate)
       invited against this code finds the page listening even after a reload. The one
       exception: a link that ALSO overrides the relay host connects nowhere until the
       student says so in the panel. */
    if (state.joinedViaLink) {
      if (!RELAY_CUSTOM) startLive();
      else { toast("This link uses its own relay: " + relayHost() + " · open 🎓 to join", "#c89b1f"); }
    }
    /* a leftover counter from when the tour played by itself; clearing it means a browser
       that saw the old behaviour is not carrying invisible state around */
    try { localStorage.removeItem("ait_intro_n"); } catch (e) {}
    /* The seat is visible from the first seconds, connected or not: presence IS the invite,
       and it makes its case by sitting there, not by performing. Nothing else happens until
       the reader clicks it. */
    var arm = function () {
      if (document.hidden) { document.addEventListener("visibilitychange", arm, { once: true }); return; }
      setTimeout(function () {
        ensureCursor(); paintCursor();
        var p = parkSpot();
        cursorPos.x = p.x + 60; cursorPos.y = p.y - 50;   // drift in from the corner
        parkCursor();
        bumpIdle();
        if (state.joinedViaLink && state.live !== "here")
          toast("Room " + state.room + " open · waiting for your AI", ai().color);
      }, 900);
    };
    arm();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
