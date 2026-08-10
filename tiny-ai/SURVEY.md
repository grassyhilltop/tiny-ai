# The pre/post measures, and how to read them

Three items and one free-text answer, mirroring the instrument from Joel's tiny-device-challenge
thesis so the two studies can be talked about together.

| when | item | scale |
|---|---|---|
| start | How would you describe your experience with AI? | 1 no experience · 4 some · 7 professional |
| start | How confident do you feel in your ability to train an AI model to achieve the goal described above? | 1 cannot do the task · 4 neutral · 7 very confident can do task |
| end | *(the same confidence item, word for word)* | *(the same anchors)* |
| end | In one sentence: what does training a model actually do? | free text |

## Design choices, and why

**The confidence item is identical before and after.** That identity is the only thing that makes
the pair comparable; changing a word changes the construct. It is also worded as a *can do now*
judgement about a *named, specific* task — which is how self-efficacy instruments are supposed to
be built (Bandura's guidance on constructing self-efficacy scales is the standard reference), not
as a "will you" or a general "are you good at AI".

**Nothing is preselected.** A pre-set middle value is an answer the page put in the reader's mouth,
and afterwards it is indistinguishable from a reader who genuinely chose the middle. Unanswered has
to stay visibly unanswered, so the scale starts empty and `null` means null.

**Each click sends on its own.** No submit button: a reader who answers the "before" item and then
closes the tab has still told us something true, and that answer should not be lost waiting for a
form they never reach.

**The goal is stated above the item.** "The goal described above" is only meaningful if the
challenge is on screen, which is why the challenge block sits directly above the pre survey.

## The one caveat that matters

**A flat or falling confidence score is not automatically a failure of the lab.**

This is response-shift bias, and it is the well-known pitfall of any identical pre/post self-report.
Before the lab, a novice is rating their confidence against their own idea of what "train an AI
model" involves — which may be vague. Twenty minutes later they have a concrete, and much harder,
idea of what the task actually is. They are answering a *different question* with the same words,
and a reader who genuinely learned a lot can rate themselves lower afterwards precisely because
they now know what they did not know.

So:

- Read a **rise** as a strong signal. It cleared a bar that moved against it.
- Read **flat or a small drop** as ambiguous, not negative — especially for people who scored
  themselves 6 or 7 on the pre item.
- The **free-text sentence is the better learning measure.** It cannot be gamed by a shifted
  standard, and "it adjusts numbers until the predictions stop being wrong" versus "it makes the AI
  smart" is a real difference you can see.
- If this ever needs to be defensible rather than indicative, the fix is a **retrospective
  pre-test** — asking at the end "how confident were you *before* you started?" alongside the
  post item, so both judgements are made from the same vantage point. Not worth the extra question
  for a public lab; worth it for a study.

**Single item, small n, self-selected sample.** These are indicative numbers for steering a lab,
not evidence. Report them as medians with the n, not as means with a p-value.

## What actually gets sent

Only through `feedbackSend()`, and only on the reader's action. Four event types:

- `survey` — one per Likert click, with the item name, the value, and seconds since page load.
- `knowledge_check` — the sentence, plus a snapshot of the survey and the timings.
- `completed` — once per browser (deduped via `localStorage.gl_done`), with timings.
- `feedback` — the NPS score, comment, survey snapshot and timings.

The timing payload is per section: `bestStars`, `secTo4`, `secTo5`, `secOnSection`. Milestones are
recorded once and never overwritten, so resetting the knobs or scrolling back cannot rewrite a slow
climb into a fast one. **The number Joel cares most about is `step4_twoBends.secTo4` / `secTo5`** —
how long it took to fit the two-bend model, which is the hardest thing the lab asks for.

No identifiers, no mouse tracking, no keystrokes. Section keys are `step1_firstLine`,
`step2_line`, `step3_oneBend`, `step4_twoBends`.
