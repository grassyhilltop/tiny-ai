# LLM Foundations for All
### Build a tiny ChatGPT from scratch, in a browser and a free Colab, in about two hours.

**By Joel Sadler** (joel.sadler@gmail.com | [scholar](https://scholar.google.com/citations?user=i2Wcl78AAAAJ) | [linkedin](https://www.linkedin.com/in/souljadler/))
Co-developed with Claude (Anthropic Fable) and Codex as AI pair-authors; every lab was built and revised in human-AI collaboration, which is also the course's thesis.

This is an experimental public adaptation of Labs 2 and 3 of **DS 6042 (Machine Learning in Systems and Network Security)** at the UVA School of Data Science by **Prof. Daniel Graham**, whose microGPT-to-nanochat lab design is the best zero-to-hero ML on-ramp I have seen. Pedagogical inspirations, with gratitude: **Andrej Karpathy** (nanoGPT, the from-scratch ethos), **StatQuest / Josh Starmer** (tiny networks on real problems), **Welch Labs** (geometric intuition), **3Blue1Brown** (visual math). The security-specific labs of the original course are not included here.

## Who this is for
Anyone with light Python exposure and a free Google account: first-year undergrads, data-science students, working scientists, curious adults. No CS degree, no GPU, no setup. If every citizen needs to speak a little AI, this is the two-hour phrasebook, taught by building the real thing.

## The arc (magic in the first minute, epiphany in the first five)
1. **Lab 1 of 2: "Goldilocks" (browser, zero install, works from file://).** You meet a single neuron doing a real job: deciding whether a medicine dose is too low, too high, or just right. You train the network yourself by turning physical-style rotary knobs (no sliders; knobs, like a synthesizer) and watching the loss drop. Then the reveal: backpropagation is just an automatic hand that turns the knobs for you. Hover anywhere (a knob, a wire, a term in the equation, a line of code) and every representation of that same weight lights up together.
2. **Interlude: "Forbidden Fruit" (the alignment game).** Your tiny chatbot must never talk about fruit. Write a plain-language spec, let AI generate the filter code (you spec, the model implements: that is the future of programming). Score 1-5 stars against a hidden test set that punishes both letting fruit through AND paranoid over-blocking (innocent sentences about Apple Inc. and grapefruit leagues must pass). Beating 4 stars is genuinely hard and teaches the core alignment lesson: rules that are too loose fail, rules that are too tight also fail.
3. **Lab 2 of 2: microGPT to nanochat (free Colab GPU).** Build microGPT from scratch, then train a small GPT on a real dataset within a free Colab session, checkpointing to your own Google Drive so a timeout never costs you the run. End state: a chatbot you built, whose every weight you could in principle point at.

## Repository layout
```
index.html                  landing page (GitHub Pages serves this)
lab1-goldilocks.html        single-file interactive lab (works via file:// double-click)
lab2-forbidden-fruit/       the alignment game: spec sheet, starter prompt, grader
  grader.py                 python grader, 5-star scoring
  testset.b64               hidden test set (base64; players promise not to peek)
lab3-colab/                 Colab notebook (.ipynb) + Drive-caching setup
DECISIONS.md                design decisions and Joel's pedagogical spec
```

## Hosting
Enable GitHub Pages on this repo (Settings > Pages > Deploy from branch > main, root). The landing page and Lab 1 are static files; Lab 3 links out to Colab. No server needed.

## Status
Early public fork, started July 13, 2026. Lab 1 interactive is a working v1; Forbidden Fruit grader is v1; the Colab notebook is a scaffold being adapted from the UVA HPC version (main changes: Drive-mounted checkpoints and pip cache, model scaled to free-tier GPU session limits).

## License and attribution requests
Course structure adapted with attribution from DS 6042 (Prof. Daniel Graham, UVA). Original inspirations credited above. If you build on this, keep the attribution chain intact.
