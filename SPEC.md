# SPEC: tiny-ai lab rework (Claude Code handoff)
**Owner: Joel Sadler | Repo: github.com/grassyhilltop/tiny-ai (Pages enabled) | July 14, 2026**
**Rule for all output: no em dashes anywhere. Joel is design-obsessed; every visual goes through a design review pass before commit.**

## Context
Public adaptation of UVA DS 6042 labs 2 (microGPT) and 3 (nanochat) by Prof. Daniel Graham. Purpose: a public teaching artifact that shows Joel's craft to Anthropic reviewers within days, and a genuinely great 2-hour "LLM foundations for anyone" bootcamp. Local original clone: `Porfolio/LL Foundations for All - microGPT/Original DS6042 repo/ML-Security-Public`. Joel's Colab export: `colab exports/microGPT_Forbidden_fruit.ipynb`. Read `DECISIONS.md` in the repo and `Joel Early Feedback on DS6042 - 07-13-2026.rtf` before coding. Do not push the original repo's git history (GitHub push protection blocks a secret buried in it); the repo is a clean-room copy with attribution, keep it that way.


## Headline feature: collaborative distributed training (teams)
The signature mechanic of Tiny AI: a classroom trains ONE model together, the way real labs do.
- Teams of 2-4 (a table), custom team name; built to scale to ~8 teams of 4.
- The training data is sharded so each teammate owns a unique slice; each runs their own training (Colab GPU for Parts 2-3).
- A live team panel shows every teammate's progress; the Merge button unlocks only when all four are green, so fast students are incentivized to help slow ones (the intended magic).
- Merging averages the weights (federated-averaging style) and the evals must show the merged model beats every solo model on loss AND in practical chat quality, at roughly 1/4 the wall-clock time.
- Leaderboard across teams for friendly competition.
- Rendezvous mechanism for the classroom version: the team's shared Google Drive folder (no server needed); each Colab writes its checkpoint there and the merge cell averages all four. The Goldilocks page ships a local simulated preview of the mechanic.
- Timing target: microGPT and nanochat team flows must each fit a 1-hour session (course data point: 8 shards at depth ~12 took about 2 hours solo).


## Round 3 queue (Joel's July 15 review, deeper items; quick fixes shipped in round 2)
1. LEGO computer replaces the black box: a brick-built computer with screen on the patient's right, IV conceptually hooked to it; the NN lives INSIDE it in 3D and mirrors the 2D "machine fully visible" panel: each neuron a classic 1x1 round stud part, connections as hose cables, weights as small trans 1x2 tiles whose brightness maps to weight magnitude (no numbers needed in 3D); colors must correspond exactly between the 3D neurons and the 2D diagram.
2. CAD leader-line callouts as a general HUD strategy: hovering any HUD panel draws a leader line with circle tip to the 3D object it controls (predicted-effect panel to the patient, dose knob to a new 1x1 round dose control on the IV, Give-the-dose to the IV bag).
3. Draggable everything: patient and all scene parts can be picked up and thrown; parts rez back matrix-style.
4. Single-neuron intro ported from Lab 2 "step 1, the simplest neuron" into Lab 1's stage flow, knobs instead of sliders, with Lab 2's exact grey-background syntax-highlighted code styling ("don't need the code yet" framing); StatQuest-style bend/squish thumbnail drawn on each neuron in the machine diagram, hover reveals the name ReLU.
5. Lab 1 gets a left TOC consistent with Labs 2/3.
6. Hi-res PBR fix: current wear texture is splotchy; make it a subtle bump/roughness variation only, fix washed-out color grading, increase edge fillets (current ones read too sharp), verify the lamp point light visibly lights the scene.
7. Hand-drawn mode: all text switches to a readable pencil-style font (current one too scrunched; try Shantell Sans or Gochi Hand), knobs and SVGs get the sketch filter too.
8. Carry Lab 2's LED-chain knob design back into Part 1; fix jagged SVG edges (crisp shapes everywhere).
9. Lab 2: Welch-style contour shading on the 3D loss landscape; then a compression pass, as short as possible.
10. Review workflow: design feedback arrives as Loom SRT transcripts in "Design Reviews" folder; Loom URLs are not readable directly.


## Pedagogy contract for Lab 1 (July 16 review)
- Assume only high-school math: y = mx + c is the anchor for everything. Say m and c, never w and b, except in code panels with the "ML dialect" note.
- Data is DISCOVERED, never given: the learner doses the patient (3D) or runs trials (2D button, shipped) and each trial adds a point to the graph. Wire the 3D "Give the dose" so it records a real (dose, effect) point onto the graph with a pulse, replacing the 2D-only trials button when 3D is live. Keep cognitive load low: no persistent table; tooltips on points carry the details.
- Staged neuron intro (next big build): step 0 uses a LINEAR patient problem (e.g. "sleep hours vs recovery," a straight-line dataset) so one bare neuron y = mx + c fits it completely and the learner wins early; step 1 introduces the bend on a hockey-stick dataset; step 2 brings the Goldilocks V where one bent line fails and two must be added. Every circle anywhere in the course means: a y = mx + c inside, possibly more m's for more inputs, with a squashing function on the way out; a network is this one LEGO block repeated. Balance compactness: each step is one card, one dataset, one aha.

## Scope of this rework
1. **Strip:** delete every lab except lab-02 (microGPT) and lab-03 (nanochat). Remove all ML-security course framing, UVA/HPC/Rivanna references, schedules, and the other 14 labs. This is a 3-part bootcamp, not a 16-lab course.
2. **Index page = front door.** Current one is not inviting. Needs: hero image (rendered from the 3D toybox, not stock), one-line promise ("Build a tiny ChatGPT from scratch, about two hours, no CS background"), three lab cards with real thumbnails, attribution footer (Prof. Daniel Graham/DS6042, Karpathy, StatQuest, Welch Labs, co-authored with Claude). Monochrome, minimal, color only to direct the eye.
3. **Fuse Goldilocks into lab 2.** The Goldilocks Dosage interactive (currently labs/lab-00-goldilosks.html... verify filename) becomes the opening act of the microGPT lab, not a separate lab. Flow: 3D scene setup, single neuron on the dosage problem, knob training, backprop reveal, then the original lab's progression into microGPT.
4. **3D everywhere it earns its place, LEGO-brick visual language.** Babylon.js (preferred) or three.js. Style: literal brick-built dioramas, flat shading, LEGO-like restrained palette, "Roblox in the browser" toybox feel. Quality bar: must not read as web-prototype slop. Required cues: subtle bloom, basic dynamic lighting with sensible shadows, and always some physics (balls/bricks with compound-primitive collision meshes). Scene 1: a brick patient figure receiving visibly different doses with happy/unhappy outcomes so the abstract problem is concrete at a glance. Loss landscapes stay 3D (gradient descent = ball rolling downhill); 2D only as a cross-section reached by a smooth camera move.
5. **Interaction rules:** assume trackpad, one-button; no gamer mouse orbits. Rotary knobs (musical instrument feel), never sliders. Hover-brushing: any weight highlights simultaneously in knob, network diagram, equation, and code.
6. **Network always visible with numeric weights** (StatQuest style). Every graph gets a title and axes with units (dose in mg, effectiveness in %, loss unitless but labeled).
7. **Backprop must visibly run code.** When the learner presses "train," highlight the exact lines firing in a live-shown Python block (Karpathy's microGPT fits on a page; ours will too).
8. **Beginner-python pass on ALL code:** CS-101 level only. Regular for-loops and conditionals; no broadcasting one-liners, no functional tricks. More lines is fine.
9. **Typing requirement:** the learner types every character of the final GPT implementation somewhere. Known-working model: lab page alongside a blank Colab, copying section by section. Improve if possible (marimo notebook or embedded editor with the lab's visualizations inline); otherwise ship the lab+Colab-template pattern. Provide the Colab template notebook.
10. **ZUI code map:** the full microGPT source as a one-page overview image (like Karpathy's blog) that becomes a minimap as you scroll, expandable anytime, zoom into any block. The full block is a finale moment, not the opening.
11. **Lab 3 Colab parity:** everything runs in a free Colab GPU session. Drive-mounted checkpoints and pip cache so timeouts cost nothing (see Joel's export for what he had to do on a regular Google account). Scale GPT config/data to fit session limits.
12. **Forbidden Fruit (alignment game):** keep grader.py + hidden base64 test set; add starter solution.py template and a spec worksheet: learner writes a plain-language spec, AI generates the filter (spec-don't-code is the lesson). 5 stars is hard; over-blocking penalized like leakage.
13. **First-5-minutes law (the Piper blueprint):** magic in 7 seconds (the 3D toybox), epiphany by minute 5 (knob-training beats the loss for a real problem), a fresh payoff every 5 minutes after.
14. **Everything works from file:// double-click** where technically possible; degrade gracefully otherwise (Joel's original feedback to Graham).
15. **Attribution and AI-collab visibility:** commits and README credit Claude co-authorship explicitly; Karpathy/StatQuest/Welch Labs/3Blue1Brown credited where their ideas appear.

## Working setup
- Clone from GitHub, work OUTSIDE Dropbox (Dropbox breaks git file locks): `~/dev/tiny-ai`.
- PAT: fine-grained, this repo only, Contents read/write (that is the minimal scope; add Pages read/write only if changing Pages config). Joel provides at `resume dev/Tools/dev/github PAT.txt`; never commit it.
- Deploy: GitHub Pages from main root. Verify the live URL renders after each push.
- Definition of done for each page: screenshot review against this spec's design rules, no em dashes, attribution intact, works on trackpad, loads in under 3 seconds on Pages.

## Priority order (ship value earliest)
1. Strip + index redesign (hours, transforms first impressions).
2. Goldilocks-into-lab-2 fusion with 3D scene v1 + code highlighting.
3. Beginner-python pass over lab 2 text.
4. Colab template + Drive caching for lab 3.
5. ZUI code map.
6. Forbidden Fruit polish.
