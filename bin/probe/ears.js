/* The intent matcher, with no audio anywhere near it. Speech recognition cannot run in headless
   Chrome, but the part that decides what a sentence MEANS is pure text and is where every real
   bug will be, so it is the part worth testing. Feed it what a tutor actually says.

     node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/?ears=1" 9000 out.png bin/probe/ears.js
*/
(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 40 && !window.AIEars; i++) await w(250);
  if (!window.AIEars) return { error: "ai-ears.js did not load" };

  const SHOULD_FIRE = [
    ["Have a look at the dose dial and tell me what it says.", "dose"],
    ["Okay, now look at the graph.", "graph"],
    ["I want you to point at the give the dose button.", "give"],
    ["Notice the m knob, the one that sets the slope.", "knob:m"],
    ["Look at the c knob for a moment.", "knob:c"],
    ["Take a look at the challenge sentence again.", "challenge"],
    ["Let us go to step two, the bend.", "sec:2"],
    ["Check the results card after you press it.", "results"],
    ["Look at the black box in the scene.", "scene"],
  ];
  /* The cases that MUST NOT fire are the point of the cue rule: a tutor says these nouns
     constantly while explaining, and a cursor that jumped every time would be a twitch, not a
     gesture. */
  const SHOULD_NOT = [
    "The graph is really just a picture of the numbers you collected.",
    "A dose dial is one input, and a model can have thousands.",
    "So what do you think the m knob is actually doing to the line?",
    "Later on we will get to backprop, but not yet.",
    "Your score went down, which is good.",
  ];
  const ASKS = [
    "So where are you on the page right now?",
    "What do you see on your screen?",
    "Tell me, what is your score?",
  ];

  const out = { fired: [], missed: [], falsePositives: [], asksHeard: 0, asksMissed: [] };
  for (const [line, want] of SHOULD_FIRE) {
    const r = window.AIEars.hear(line).intent;
    if (r && r.target === want) out.fired.push(want);
    else out.missed.push({ line, want, got: r && r.target });
  }
  for (const line of SHOULD_NOT) {
    const r = window.AIEars.hear(line).intent;
    if (r) out.falsePositives.push({ line, got: r.target, via: r.phrase });
  }
  for (const line of ASKS) {
    if (window.AIEars.hear(line).asked) out.asksHeard++;
    else out.asksMissed.push(line);
  }
  out.stateLine = window.AIEars.state();
  out.PASS = out.missed.length === 0 && out.falsePositives.length === 0 && out.asksMissed.length === 0;
  return out;
})()
