/* CAN A TUTOR POINT AT SOMETHING WE DID NOT THINK OF?

   The named targets are the twenty things we happened to list. A tutor asked to highlight "the
   Save my answer button" could not reach it: not a name, and it has never seen the page's HTML
   so it cannot write a selector either. Anything unrecognised is now matched against the words
   a person can see, which is the same vocabulary the tutor is working from.

   The risk of that is a confident wrong answer, so half of this probe is the phrases that must
   still resolve to NOTHING.

     node bin/probe/cdp.mjs "http://localhost:8783/tiny-ai/" 12000 out.png bin/probe/point-by-words.js
*/
(async () => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 240 && typeof window.AITutor === "undefined"; i++) await w(500);
  if (typeof window.AITutor === "undefined") return { fatal: "AITutor never loaded" };
  await w(800);
  const resolve = AITutor._internals.resolveTarget;
  const id = el => !el ? null : (el.id ? "#" + el.id : el.tagName.toLowerCase() +
                                 '["' + (el.textContent || "").trim().slice(0, 24) + '"]');

  /* said the way a tutor says it, not the way a table spells it */
  const SHOULD_HIT = [
    ["Save my answer", "kcheckSave"],
    ["the Save my answer button", "kcheckSave"],
    ["save my answer", "kcheckSave"],
    ["Auto-train", "runBtn"],
    ["Give the dose", "giveBtn"],
    ["Open the black box", "bbOpen"],
    ["Add a bend", "nextStage"],
    ["Reset knobs", "resetBtn"],
    ["Run one step (Backprop)", "stepBtn"],
    ["Run 5 more trials", "collectBtn"],
  ];
  const out = { hit: [], wrong: [], missed: [] };
  for (const [phrase, wantId] of SHOULD_HIT) {
    const el = resolve(phrase);
    if (!el) out.missed.push(phrase);
    else if (el.id === wantId) out.hit.push(phrase);
    else out.wrong.push(phrase + " -> " + id(el) + " (wanted #" + wantId + ")");
  }

  /* THE NAMED TARGETS MUST STILL WIN. A words fallback that shadows the table would move the
     cursor somewhere plausible and wrong, which is worse than an error. */
  out.namesStillWin = ["dose", "give", "graph", "kcheck", "quiz", "scene"]
    .every(k => !!resolve(k));
  /* and a name with the noise words still on it is the same name, not a heading that happens
     to contain the word */
  out.theGraphIsTheGraph = resolve("the graph") === resolve("graph");
  out.theDoseIsTheDose = resolve("the dose") === resolve("dose");
  out.doseDialIsTheDose = resolve("the dose dial") === resolve("dose");
  out.graphCardIsTheGraph = resolve("the graph card") === resolve("graph");
  /* and the plural is not stripped, so the button really called "Reset knobs" survives */
  out.resetKnobsSurvives = (resolve("Reset knobs") || {}).id === "resetBtn";
  out.knobStillResolves = !!resolve("knob:m");
  out.unknownKnobStillErrors = resolve("knob:zzz") === null;

  /* and nothing plausible-sounding may resolve to something arbitrary */
  /* "Download this lab" is real text on a real button, inside the shut settings panel: a
     control nobody can see is not a control a tutor may point at, and it is the check that
     the zero-rect guard is doing its job. */
  const SHOULD_MISS = ["the mitochondria", "chapter 12", "xyzzy", "the purple elephant",
                       "Download this lab"];
  out.falsePositives = SHOULD_MISS.filter(p => resolve(p) !== null).map(p => p + " -> " + id(resolve(p)));

  /* our own furniture is not part of the lesson and must never be pointed at */
  out.ownUiExcluded = ["AI tutor", "Copy the invite"].every(p => {
    const el = resolve(p);
    return !el || !el.closest("#aitPanel, #aitLayer, #aiTutorBrief");
  });

  out.PASS = out.missed.length === 0 && out.wrong.length === 0 && out.falsePositives.length === 0 &&
             out.namesStillWin && out.knobStillResolves && out.unknownKnobStillErrors && out.ownUiExcluded &&
             out.theGraphIsTheGraph && out.theDoseIsTheDose && out.doseDialIsTheDose &&
             out.graphCardIsTheGraph && out.resetKnobsSurvives;
  return out;
})()
