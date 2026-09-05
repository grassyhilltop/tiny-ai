/* ai-ears.js: the page listens to the tutor instead of the tutor reaching the page.

   WHY THIS EXISTS. Every transport we have depends on a tool the voice runtime may or may not
   mount that day, and the two we have both flipped inside six weeks: in August, fetching a URL
   worked in voice and MCP connectors did not; by September it was the other way round, and
   Anthropic has documented neither. See docs/VOICE-AGENT-PATTERN.md. A channel that cannot be
   switched off by a vendor is worth something even if it is less precise, and there is exactly
   one such channel in a voice tutorial: the tutor is ALREADY SPEAKING OUT LOUD. The page can
   simply listen.

   THE PART THAT SOUNDS HARD AND IS NOT. "The browser would need to understand natural language"
   is the obvious objection and it is wrong, because the vocabulary is CLOSED and TINY. The page
   owns about twenty things a tutor can point at, each with a name a human would say out loud.
   So this is keyword spotting over a fixed list with a few synonyms, not language understanding:
   no model in the browser, no Gemini Nano, no WebLLM. Those become interesting only for the
   cases a tutor should not be producing anyway ("the one on the left"), and AGENTS.md asks it to
   speak the canonical names instead, which a tutor does naturally.

   THE PART THAT IS ACTUALLY HARD is hearing the tutor at all, and the answer is not a microphone.
   Chrome's echoCancellation defaults to ON and cancels system playback, so a page that opens the
   mic to hear a voice coming out of the same laptop's speakers is asking the browser to subtract
   precisely the signal it wants. Two escapes, tried in order: capture the audio digitally with
   getDisplayMedia (the student picks the Claude tab or the whole screen and ticks "share audio"),
   or open the mic with echoCancellation explicitly off and rely on the room. SpeechRecognition
   has taken an optional MediaStreamTrack since Chrome 135, which is what makes the first one
   possible at all.

   THE RETURN DIRECTION IS THE SAME TRICK BACKWARDS. A tutor that cannot fetch also cannot read
   the page, so the page speaks: short, factual, only when asked or when something genuinely
   happened. The tutor hears it through the same microphone the student is talking into. Two
   speech channels, no network, nothing for a vendor to unmount.

   STATUS: EXPERIMENTAL, OPT IN, AND OFF BY DEFAULT. Chrome and Edge on the desktop only; Firefox
   and Safari implement getDisplayMedia and silently drop the audio track. Nothing here runs
   unless the reader asks for it with ?ears=1 or the button in the 🎓 panel, and it holds no
   network connection of its own: everything is local to the tab.                              */

(function () {
  "use strict";

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var on = false, rec = null, stream = null, ribbon = null, lastFired = 0, lastTarget = "", lastTargetAt = 0;

  /* THE SPOKEN VOCABULARY, which is deliberately not the same list as the page's CSS selectors.
     ai-tutor.js maps selectors to target names; this maps what a person SAYS to the same names.
     They drift apart on purpose: "the button" and "give the dose" are one target, and nobody
     says "#giveBtn" out loud. Longest phrase wins, so "dose dial" beats "dose" and the more
     specific reading is taken. */
  var VOCAB = [
    ["dose",     ["dose dial", "adjust dose", "the dial", "dose knob", "dosage dial", "dose"]],
    ["give",     ["give the dose", "give dose", "the give button", "give button"]],
    ["graph",    ["the graph", "the plot", "the chart", "the scatter", "graph"]],
    ["results",  ["results card", "the results", "predicted versus actual", "the prediction"]],
    ["scene",    ["the scene", "the black box", "the three d scene", "3d scene", "the box"]],
    ["knob:m",   ["m knob", "the slope", "slope knob", "first knob", "knob m"]],
    ["knob:c",   ["c knob", "starting height", "the offset", "second knob", "knob c"]],
    ["challenge",["the challenge", "challenge sentence", "the task", "the goal"]],
    ["fluency",  ["experience slider", "the slider"]],
    ["quiz",     ["the quiz", "tiny test", "the test", "section four"]],
    ["kcheck",   ["knowledge check", "the sentence box", "checking in", "section five"]],
    ["sec:1",    ["step one", "section one", "dots and lines", "first step"]],
    ["sec:2",    ["step two", "section two", "the bend", "teach it to bend", "the hinge"]],
    ["sec:3",    ["step three", "section three", "the automatic hand", "backprop", "back propagation"]],
  ];

  /* AN ACTION CUE IS REQUIRED, and it is the whole safety mechanism. A tutor says "the graph"
     constantly while explaining, and a cursor that jumped on every mention would be a twitching
     distraction rather than a gesture. Requiring a deictic verb near the noun means the cursor
     moves when the tutor is DIRECTING ATTENTION and stays put when it is merely talking. */
  var CUES = ["look at", "looking at", "point at", "pointing at", "see the", "notice the",
              "find the", "watch the", "over at", "up at", "down at", "focus on", "check the",
              "turn to", "go to", "have a look at", "take a look at", "look up at"];

  /* Things a tutor says when it wants to know where the student is. Hearing one of these makes
     the page answer OUT LOUD, which is how a tutor with no fetch tool reads the screen. */
  var ASKS = ["where are you", "where are we", "what do you see", "what is on your screen",
              "what's on your screen", "read me your screen", "what does it say",
              "what is your score", "what's your score", "what is your loss", "where is your dial"];

  function norm(t) {
    return (" " + String(t).toLowerCase() + " ")
      .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ");
  }

  /* Find the LAST directed mention in a transcript. Last, not first: interim results arrive as a
     growing string, so the most recent phrase is the one the tutor is saying now. */
  function intent(text) {
    var t = norm(text), best = null;
    for (var i = 0; i < VOCAB.length; i++) {
      var target = VOCAB[i][0], phrases = VOCAB[i][1];
      for (var j = 0; j < phrases.length; j++) {
        var p = " " + phrases[j] + " ", at = t.lastIndexOf(p);
        if (at < 0) continue;
        /* the cue has to be close in front of the noun: "look at the dose dial" yes, "look at
           the graph, and later we will get to the dose dial" no */
        var before = t.slice(Math.max(0, at - 34), at);
        var cued = CUES.some(function (c) { return before.indexOf(c) >= 0; });
        if (!cued) continue;
        /* SCORE BY WHERE THE PHRASE ENDS, NOT WHERE IT STARTS. Scoring by start made "point at
           the give the dose button" resolve to `dose`, because "dose" starts later than "give
           the dose" even though it is the tail of it. Two overlapping phrases end at the same
           place, so ending position ties them and length breaks the tie in favour of the more
           specific reading, while genuinely later mentions still win outright. */
        var score = (at + phrases[j].length) * 1000 + phrases[j].length;
        if (!best || score > best.score) best = { target: target, phrase: phrases[j], score: score };
      }
    }
    return best;
  }

  function asked(text) {
    var t = norm(text);
    return ASKS.some(function (a) { return t.indexOf(" " + a) >= 0; });
  }

  /* ---------------- the mouth ---------------- */

  /* SHORT, FACTUAL, AND ONLY WHEN ASKED. A page that narrates itself is unbearable to sit next
     to, and a tutor listening through the student's microphone hears everything the room hears,
     so every extra sentence is noise in its context as well as in the room. One line, numbers
     first, no preamble. */
  function stateLine() {
    var s = {};
    try { s = window.AITutor._internals.relayState(); } catch (e) { return "The page is not ready."; }
    var bits = [];
    if (s.dose_mg != null) bits.push("dose " + s.dose_mg + " milligrams");
    if (s.data_points != null) bits.push(s.data_points + " dots");
    if (s.loss != null) bits.push("score " + s.loss);
    if (s.section) bits.push("we are on " + String(s.section).replace(/·/g, ","));
    if (s.mouse_over) bits.push("my mouse is on " + s.mouse_over);
    return bits.join(", ") + ".";
  }

  function speak(text) {
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.volume = 1;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      show("said: " + text, "say");
    } catch (e) {}
  }

  /* ---------------- the ribbon ---------------- */

  /* THE STUDENT MUST SEE WHAT THE PAGE HEARD. This is a microphone in a teaching page: showing
     the transcript is the difference between a feature and a surveillance complaint, and it is
     also the only practical way to debug a mishearing, since by the time the cursor jumps
     somewhere odd the audio is gone. */
  function show(text, kind) {
    if (!ribbon) return;
    var line = document.createElement("div");
    line.className = "ears-line ears-" + (kind || "heard");
    line.textContent = text;
    ribbon.insertBefore(line, ribbon.firstChild.nextSibling);
    while (ribbon.children.length > 7) ribbon.removeChild(ribbon.lastChild);
  }

  function buildRibbon() {
    var css = document.createElement("style");
    css.textContent = [
      "#aiEars{position:fixed;left:10px;bottom:10px;z-index:2147482900;max-width:min(420px,46vw);",
      "font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(20,18,16,.9);",
      "color:#f2ede4;border-radius:10px;padding:8px 10px;box-shadow:0 6px 24px rgba(0,0,0,.3)}",
      "#aiEars b{display:flex;gap:8px;align-items:center;font:600 11px/1 system-ui;",
      "letter-spacing:.08em;text-transform:uppercase;color:#c9b78a;margin-bottom:6px}",
      "#aiEars button{margin-left:auto;font:11px system-ui;background:#3a352e;color:#f2ede4;",
      "border:0;border-radius:6px;padding:3px 8px;cursor:pointer}",
      ".ears-line{opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".ears-did{color:#8fd6a0;opacity:1}.ears-say{color:#9ec9ff;opacity:1}",
      ".ears-err{color:#ff9d8a;opacity:1}",
    ].join("");
    document.head.appendChild(css);
    ribbon = document.createElement("div");
    ribbon.id = "aiEars";
    ribbon.innerHTML = "<b>ears <span id=earsState>starting</span></b>";
    var stop = document.createElement("button");
    stop.textContent = "stop";
    stop.onclick = function () { AIEars.stop(); };
    ribbon.firstChild.appendChild(stop);
    document.body.appendChild(ribbon);
  }

  function setState(t) {
    var el = document.getElementById("earsState");
    if (el) el.textContent = t;
  }

  /* ---------------- audio in ---------------- */

  /* TWO WAYS TO HEAR, IN ORDER OF HOW WELL THEY WORK.
     Tab or system audio is the good one: it is the tutor's voice as digital samples, with no
     room, no echo canceller and no competing speech. It costs a picker dialog and, on macOS, a
     one-time Screen Recording grant for the browser.
     The microphone is the fallback, and it needs echoCancellation OFF or the browser removes the
     speaker output we are trying to hear. It works across two devices (phone talking, laptop
     listening) better than it works on one. */
  async function capture(mode) {
    if (mode !== "mic") {
      try {
        var s = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          systemAudio: "include", selfBrowserSurface: "exclude",
        });
        if (s.getAudioTracks().length) {
          /* keep the video track alive but idle: stopping it ends the whole capture session,
             and Firefox and Safari hand back a video-only stream, which is the check above */
          s.getVideoTracks().forEach(function (v) { v.enabled = false; });
          return s;
        }
        s.getTracks().forEach(function (t) { t.stop(); });
        show("that share had no audio track, falling back to the microphone", "err");
      } catch (e) {
        show("screen audio declined, falling back to the microphone", "err");
      }
    }
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  }

  function act(best) {
    var now = Date.now();
    if (now - lastFired < 2000) return;                       // one gesture at a time
    if (best.target === lastTarget && now - lastTargetAt < 8000) return;  // stop re-pointing
    lastFired = now; lastTarget = best.target; lastTargetAt = now;
    try {
      var res = window.AITutor.exec({ cmd: "point", target: best.target });
      show((res && res.ok === false ? "could not point at " : "pointed at ") + best.target +
           "   (heard “" + best.phrase + "”)", res && res.ok === false ? "err" : "did");
    } catch (e) { show("point failed: " + e.message, "err"); }
  }

  var AIEars = {
    async start(mode) {
      if (on) return;
      if (!SR) { alert("This browser has no speech recognition. Chrome or Edge on a desktop."); return; }
      if (!window.AITutor) { alert("The tutor layer has not loaded yet."); return; }
      buildRibbon();
      try { stream = await capture(mode); }
      catch (e) { show("no audio: " + e.message, "err"); setState("no audio"); return; }
      on = true;
      setState("listening");
      rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      /* start(track) is Chrome 135 and later; older builds ignore the argument and use the
         default microphone, which still works for the two-device case */
      var track = stream.getAudioTracks()[0];
      var seen = "";
      rec.onresult = function (ev) {
        var txt = "";
        for (var i = ev.resultIndex; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
        if (!txt.trim() || txt === seen) return;
        seen = txt;
        show(txt.trim().slice(-90));
        if (asked(txt)) return speak(stateLine());
        var best = intent(txt);
        if (best) act(best);
      };
      rec.onerror = function (e) {
        show("recognition: " + e.error, "err");
        /* no-speech and aborted are normal in a quiet room; only a hard failure should stop us */
        if (e.error === "not-allowed" || e.error === "service-not-allowed") AIEars.stop();
      };
      rec.onend = function () { if (on) { try { rec.start(track); } catch (e) { try { rec.start(); } catch (e2) {} } } };
      try { rec.start(track); } catch (e) { try { rec.start(); } catch (e2) { show("could not start: " + e2.message, "err"); } }
      show("listening for phrases like “look at the dose dial”", "did");
    },

    stop() {
      on = false;
      try { rec && rec.stop(); } catch (e) {}
      try { stream && stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      setState("stopped");
      if (ribbon) { ribbon.remove(); ribbon = null; }
    },

    /* the testable core, with no audio anywhere near it: hand it a transcript and it tells you
       what it would have done. bin/probe/ears.js drives this, and so can a person in a console. */
    hear(text) { return { intent: intent(text), asked: asked(text) }; },
    say: speak,
    state: stateLine,
    get running() { return on; },
  };

  window.AIEars = AIEars;

  /* OPT IN, ALWAYS. A page that opens a microphone because someone loaded a URL is not a page
     anybody should trust, so ?ears=1 arms the button rather than the microphone: the capture
     still needs the click, both because it is right and because getDisplayMedia demands a real
     user gesture anyway. */
  function addButton() {
    var row = document.querySelector("#aitPanel .ait-row");
    if (!row || document.getElementById("aitEarsBtn")) return;
    var b = document.createElement("button");
    b.id = "aitEarsBtn";
    b.textContent = "🎧 Let this page hear my tutor (experimental)";
    b.title = "Chrome or Edge on a desktop. The page listens to your tutor's voice and moves its " +
              "own cursor, with no connector and no fetching. Share the Claude tab WITH AUDIO.";
    b.onclick = function (e) { e.stopPropagation(); AIEars.start(); };
    row.parentNode.insertBefore(b, row.nextSibling);
  }

  try {
    if (/(\?|&)ears=1/.test(location.search)) {
      if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", function () { setTimeout(addButton, 1200); });
      else setTimeout(addButton, 1200);
    }
  } catch (e) {}
})();
